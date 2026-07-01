import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGLTFLoader } from './glbLoader.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE, TILE_VISUAL, BOAT_TARGET_LENGTH, SECTOR_DEFS, LOD_BOAT_CULL_DISTANCE, WATER_RENDER } from './config.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from './worldCurvature.js';
import { FOAM_GLSL } from './shaders/shaderEau.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_DIRECTIONS, getOppositeEdge } from './placementRules.js';
import { getEdgeType } from './tileGenerator.js';
import { hashUnit100k as hashUnit } from './hashUtils.js';
import { createOuterVertices } from './hexGeometry.js';
import { makeNodeKey, getTileCenterType, clearGroup, smoothstep } from './tileUtils.js';

const SECTOR_BY_KEY = Object.fromEntries(SECTOR_DEFS.map(sector => [sector.key, sector]));
const DIRECTION_BY_EDGE = Object.fromEntries(HEX_DIRECTIONS.map(direction => [direction.edge, direction]));

const CENTER_RADIUS = HEX_SIZE * TILE_VISUAL.centerRadiusScale;
const WATER_SURFACE_Y = TILE_VISUAL.waterThickness ?? 0.06; // fond eau à y=0, surface à +waterThickness
const MIN_ZONE_SECTORS = 2;
const BOATS_PER_WATER_COMPONENT = 1;
const BOAT_SPEED = 0.13;
const BOAT_HEADING_OFFSET = 0;
const BOAT_MODEL_URL = './glb/decor/bateau.glb';
const BOAT_Y_OFFSET = 0.008; // légèrement au-dessus de la surface (bateau flottant)
let boatPrototype = null;
let boatLoading = false;
let boatRequested = false;
const PORT_INSET = 0.52;
const FIN_WIDTH = HEX_SIZE * 0.058;
const FIN_HEIGHT = HEX_SIZE * 0.185;
const FIN_LENGTH = HEX_SIZE * 0.36;

// ── Sillage en V (deux branches d'écume divergentes) ─────────────────────────
const WAKE_MAX_POINTS = 26;                 // longueur de la traînée (nb de points)
const WAKE_MIN_STEP   = HEX_SIZE * 0.05;    // distance mini entre points enregistrés
const WAKE_Y          = WATER_SURFACE_Y + 0.005; // juste au-dessus de la nappe

// Réglages live (sliders debug) — partagés par tous les sillages.
const _wake = {
  armWidth: WATER_RENDER.wakeArmWidth,
  spread:   WATER_RENDER.wakeSpread,
  length:   WATER_RENDER.wakeLength,
  scale:    WATER_RENDER.wakeScale,
  density:  WATER_RENDER.wakeDensity,
  opacity:  WATER_RENDER.wakeOpacity
};

export function getWakeParams() { return { ..._wake }; }
export function setWakeParams(p = {}) {
  for (const k in _wake) if (p[k] != null) _wake[k] = Number(p[k]);
  if (_wakeMaterial) {
    _wakeMaterial.uniforms.uWakeScale.value = _wake.scale;
    _wakeMaterial.uniforms.uWakeDensity.value = _wake.density;
  }
}

export function createWaterBoatOverlay() {
  const group = new THREE.Group();
  group.name = 'water-boat-overlay';
  group.userData.boats = [];
  ensureBoatModel(group);
  return group;
}

export function rebuildWaterBoatOverlay(group, placedTiles) {
  group.userData.lastPlacedTiles = placedTiles;
  clearGroup(group);
  group.userData.boats = [];

  if (!boatPrototype) {
    ensureBoatModel(group);
    return;
  }

  const visited = new Set();
  let zoneIndex = 0;

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isWaterEdge(placedTile, edge)) continue;

      const zone = collectWaterZone(placedTile, edge, placedTiles, visited);
      if (zone.sectors.length < MIN_ZONE_SECTORS) continue;

      addZoneBoats(group, zone, zoneIndex++);
    }
  }
}


export function countWaterBoats(placedTiles) {
  const visited = new Set();
  let zoneIndex = 0;
  let boats = 0;

  for (const placedTile of placedTiles.values()) {
    for (const edge of EDGE_ORDER) {
      const nodeKey = makeNodeKey(placedTile.key, edge);
      if (visited.has(nodeKey) || !isWaterEdge(placedTile, edge)) continue;

      const zone = collectWaterZone(placedTile, edge, placedTiles, visited);
      if (zone.sectors.length < MIN_ZONE_SECTORS) continue;

      boats += countZoneBoats(zone, zoneIndex++);
    }
  }

  return boats;
}

function countZoneBoats(zone, zoneIndex = 0) {
  const graph = buildWaterGraph(zone);
  const components = findComponents(graph);
  let boats = 0;

  for (const component of components) {
    if (component.nodes.length < MIN_ZONE_SECTORS) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.58) continue;

    boats += BOATS_PER_WATER_COMPONENT;
  }

  return boats;
}

export function updateWaterBoatOverlay(group, timeSeconds = 0) {
  if (_wakeMaterial) _wakeMaterial.uniforms.uTime.value = timeSeconds;
  const boats = group.userData.boats ?? [];

  for (const boat of boats) {
    const drift = Math.sin(timeSeconds * 0.37 + boat.offset * Math.PI * 2) * 0.018;
    const progress = (timeSeconds * BOAT_SPEED / Math.max(boat.distance, 0.001) + boat.offset + drift) % 1;
    const sample = samplePingPongMotionTrack(boat.motionTrack, progress);
    const bob = Math.sin((timeSeconds * 1.15) + boat.offset * Math.PI * 2) * 0.004;

    if (!boat.object.visible) continue; // masqué par LOD — on saute l'animation

    boat.object.position.copy(sample.position);
    boat.object.position.y = WATER_SURFACE_Y + BOAT_Y_OFFSET + bob;
    boat.object.rotation.y = -Math.atan2(sample.tangent.z, sample.tangent.x) + BOAT_HEADING_OFFSET;

    if (boat.wake) updateBoatWake(boat);
  }
}

// ── Traînée d'écume (wake) ───────────────────────────────────────────────────

let _wakeMaterial = null;
function getWakeMaterial() {
  if (_wakeMaterial) return _wakeMaterial;
  _wakeMaterial = new THREE.ShaderMaterial({
    name: 'boat-wake-foam-material',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uFoamColor: { value: new THREE.Color(WATER_RENDER.foamColor) },
      uWakeScale: { value: _wake.scale },
      uWakeDensity: { value: _wake.density },
      uFoamSharp: { value: WATER_RENDER.foamSharp },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: /* glsl */`
      attribute vec4 color;            // .r = transversale [-1,1], .g = along [0,1], .a = opacité
      varying vec3 vWorld;
      varying float vFade;
      varying float vAcross;
      varying float vAlong;
      ${WORLD_CURVATURE_SHADER}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp = dorfromantikApplyWorldCurvature(wp);
        vWorld = wp.xyz;
        vAcross = color.r;
        vAlong = color.g;
        vFade = color.a;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vWorld;
      varying float vFade;
      varying float vAcross;
      varying float vAlong;
      uniform float uTime;
      uniform float uWakeScale;
      uniform float uWakeDensity;
      uniform float uFoamSharp;
      uniform vec3 uFoamColor;
      ${FOAM_GLSL}
      void main() {
        // Froth : dense près du bateau (vAlong→0), se dissipe en gouttes vers la
        // queue (vAlong→1) via un gradient de densité — pas de fond opaque, donc
        // pas d'effet "masque". Bords latéraux adoucis (vAcross→±1).
        float density = mix(uWakeDensity, -0.08, vAlong);
        float fp = foamPattern(vWorld.xz, uTime * 1.4, uWakeScale, 1.0, density, uFoamSharp);
        float edge = smoothstep(1.0, 0.25, abs(vAcross));
        float a = vFade * fp * edge;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uFoamColor, a);
      }
    `
  });
  // Singleton partagé : ne pas le laisser disposer par clearGroup au rebuild.
  _wakeMaterial.userData.glbPrototype = true;
  return _wakeMaterial;
}

function createBoatWake() {
  const N = WAKE_MAX_POINTS;
  const maxVerts = N * 2;            // ruban unique : N points × 2 sommets
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4).setUsage(THREE.DynamicDrawUsage));

  const indices = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);

  const mesh = new THREE.Mesh(geometry, getWakeMaterial());
  mesh.name = 'boat-wake';
  mesh.renderOrder = 4;       // au-dessus de la nappe (renderOrder 3)
  mesh.frustumCulled = false;
  return mesh;
}

function updateBoatWake(boat) {
  const pts = boat.wakePoints;
  const hx = boat.object.position.x;
  const hz = boat.object.position.z;

  // Amorçage : 2 points superposés au bateau.
  if (pts.length < 2) {
    pts.length = 0;
    pts.push(new THREE.Vector3(hx, WAKE_Y, hz));
    pts.push(new THREE.Vector3(hx, WAKE_Y, hz));
  }

  // La TÊTE (dernier point) est collée au bateau chaque frame → apex fluide,
  // pas de saut quand un nouveau point est commité.
  const head = pts[pts.length - 1];
  head.set(hx, WAKE_Y, hz);

  // Commit d'un nouveau segment quand la tête s'éloigne assez du dernier point figé.
  const prev = pts[pts.length - 2];
  if ((hx - prev.x) ** 2 + (hz - prev.z) ** 2 > WAKE_MIN_STEP * WAKE_MIN_STEP) {
    pts.push(new THREE.Vector3(hx, WAKE_Y, hz));
    if (pts.length > WAKE_MAX_POINTS) pts.shift();
  }
  _buildWake(boat.wake, pts);
}

/**
 * Sillage « froth » : un ruban unique qui S'ÉLARGIT derrière le bateau
 * (silhouette en V). La mousse le remplit, dense près du bateau et se dissipant
 * en gouttes vers l'arrière (gradient de densité dans le shader), bords doux.
 * .r = position transversale [-1,1], .g = avancée [0=bateau,1=queue], .a = opacité.
 */
function _buildWake(mesh, pts) {
  const n = pts.length;
  const geometry = mesh.geometry;
  if (n < 3) { geometry.setDrawRange(0, 0); return; }

  const N = WAKE_MAX_POINTS;
  const posAttr = geometry.attributes.position;
  const colAttr = geometry.attributes.color;

  // Distance ABSOLUE derrière le bateau → pas de rescale à l'ajout/retrait (anti-pop).
  const dBehind = new Array(n).fill(0);
  for (let i = n - 2; i >= 0; i--) dBehind[i] = dBehind[i + 1] + pts[i].distanceTo(pts[i + 1]);

  const len = Math.max(_wake.length, 0.001);
  for (let k = 0; k < N; k++) {
    const i = Math.min(k, n - 1);             // au-delà de n : replie sur le dernier (dégénéré)
    const p = pts[i];
    // Tangente lissée (±2 voisins) → moins de jitter de direction.
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(n - 1, i + 2)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const perpX = -tz, perpZ = tx;

    const d = dBehind[i];
    const along = Math.min(1, d / len);
    const half = _wake.armWidth + _wake.spread * d;   // s'élargit derrière → V
    const fade = (k < n) ? _wake.opacity : 0.0;

    const li = k * 2, ri = k * 2 + 1;
    posAttr.setXYZ(li, p.x + perpX * half, WAKE_Y, p.z + perpZ * half);
    posAttr.setXYZ(ri, p.x - perpX * half, WAKE_Y, p.z - perpZ * half);
    colAttr.setXYZW(li, 1.0, along, 1, fade);   // .r=+1 bord, .g=along, .a=opacité
    colAttr.setXYZW(ri, -1.0, along, 1, fade);
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  geometry.setDrawRange(0, (N - 1) * 6);
}

/**
 * Met à jour la visibilité des bateaux selon la distance caméra.
 * À appeler tous les 3 frames depuis scene.js (même cadence que forestLOD).
 */
export function updateWaterBoatLOD(group, camera, lodFactor = 1.0) {
  const boats = group.userData.boats ?? [];
  const eff = LOD_BOAT_CULL_DISTANCE * lodFactor;
  const distSq = eff * eff;
  // Distance 3D complète (X + Y + Z) : corrige le bug vue top-down où camera XZ ≈ bateau XZ
  // → dist2D ≈ 0 → bateau toujours visible. En vue verticale, la hauteur Y de la caméra
  // est grande → distance 3D correcte → cull effectif.
  for (const boat of boats) {
    boat.object.visible = camera.position.distanceToSquared(boat.trackCenter) < distSq;
  }
}

function addZoneBoats(group, zone, zoneIndex) {
  const graph = buildWaterGraph(zone);
  const components = findComponents(graph);

  for (const component of components) {
    if (component.nodes.length < MIN_ZONE_SECTORS) continue;

    const path = findLongestPath(graph, component.nodes);
    if (path.length < 2) continue;

    const points = path.map(nodeId => graph.nodes.get(nodeId).position.clone());
    const distance = measurePath(points);
    if (distance < HEX_SIZE * 0.58) continue;

    const boatCount = BOATS_PER_WATER_COMPONENT;
    const motionTrack = buildMotionTrack(points);

    // Centre du trajet : utilisé par updateWaterBoatLOD pour le test de distance.
    const trackCenter = new THREE.Vector3();
    for (const p of points) trackCenter.add(p);
    trackCenter.divideScalar(Math.max(1, points.length));

    for (let index = 0; index < boatCount; index++) {
      const seedKey = `water-zone:${zoneIndex}:component:${component.index}:boat:${index}`;
      const object = createBoatObject(seedKey);
      object.position.copy(points[0]);
      group.add(object);

      // Traînée d'écume : ruban dynamique en coords monde, ajouté à l'overlay
      // (pas au bateau, qui tourne/translate).
      const wake = createBoatWake();
      group.add(wake);

      group.userData.boats.push({
        object,
        motionTrack,
        distance,
        offset: hashUnit(`${seedKey}:offset`),
        trackCenter,
        wake,
        wakePoints: []
      });
    }
  }
}

function createBoatObject(seedKey) {
  const group = new THREE.Group();
  group.name = 'animated-water-boat-glb';
  const scale = 0.92 + hashUnit(`${seedKey}:scale`) * 0.18;
  group.scale.setScalar(scale);

  const boat = createBoatModel(seedKey);

  group.add(boat);
  group.userData = { boat };
  return group;
}

function ensureBoatModel(group) {
  if (boatLoading || boatRequested) return;
  boatLoading = true;
  boatRequested = true;

  createGLTFLoader().load(
    BOAT_MODEL_URL,
    gltf => {
      boatPrototype = prepareBoatPrototype(gltf.scene);
      boatLoading = false;
      const lastPlacedTiles = group.userData.lastPlacedTiles;
      if (lastPlacedTiles) rebuildWaterBoatOverlay(group, lastPlacedTiles);
    },
    undefined,
    error => {
      boatLoading = false;
      console.warn(`Modèle bateau GLB indisponible : ${BOAT_MODEL_URL}`, error);
    }
  );
}

function prepareBoatPrototype(model) {
  const wrapper = new THREE.Group();
  wrapper.name = 'normalized-water-boat';

  const source = model.clone(true);
  const box = new THREE.Box3().setFromObject(source);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  source.position.set(-center.x, -box.min.y, -center.z);

  const length = Math.max(size.x, size.z) || 1;
  wrapper.scale.setScalar(BOAT_TARGET_LENGTH / length);
  wrapper.add(source);

  wrapper.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) object.material = cloneBoatMaterial(object.material);
  });

  return wrapper;
}

function cloneBoatMaterial(material) {
  if (Array.isArray(material)) return material.map(item => cloneBoatMaterial(item));
  const cloned = material.clone();
  cloned.side = THREE.DoubleSide;
  if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = 0;
  if ('toneMapped' in cloned) cloned.toneMapped = true;
  cloned.needsUpdate = true;
  return cloned;
}

function createBoatModel(seedKey) {
  const boat = boatPrototype ? boatPrototype.clone(true) : new THREE.Group();
  boat.name = 'water-boat-glb-instance';
  boat.rotation.y = 0;
  return boat;
}

function createLowPolyFin(seedKey) {
  const w = FIN_WIDTH * (0.84 + hashUnit(`${seedKey}:w`) * 0.18);
  const h = FIN_HEIGHT * (0.92 + hashUnit(`${seedKey}:h`) * 0.10);
  const l = FIN_LENGTH * (0.96 + hashUnit(`${seedKey}:l`) * 0.12);
  const tipZ = -l * 0.24;

  const vertices = new Float32Array([
    // left face: sharper swept dorsal fin, thin at the water line
    -w * 0.40, 0.005, -l * 0.50,
    -w * 0.15, 0.005,  l * 0.48,
     0.00,     h,       tipZ,

    // right face
     w * 0.40, 0.005, -l * 0.50,
     0.00,     h,       tipZ,
     w * 0.15, 0.005,  l * 0.48,

    // sharp leading ridge
    -w * 0.40, 0.005, -l * 0.50,
     0.00,     h,       tipZ,
     w * 0.40, 0.005, -l * 0.50,

    // fine trailing taper, less blocky than the previous polygon
    -w * 0.15, 0.005,  l * 0.48,
     w * 0.15, 0.005,  l * 0.48,
     0.00,     h,       tipZ,

    // very narrow base just kissing water surface
    -w * 0.40, 0.000, -l * 0.50,
     w * 0.40, 0.000, -l * 0.50,
     w * 0.15, 0.000,  l * 0.48,
    -w * 0.40, 0.000, -l * 0.50,
     w * 0.15, 0.000,  l * 0.48,
    -w * 0.15, 0.000,  l * 0.48
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();

  const shade = 0.055 + hashUnit(`${seedKey}:shade`) * 0.055;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shade, shade * 1.06, shade * 1.18),
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    flatShading: true,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'boat-fin';
  mesh.renderOrder = 72;
  return mesh;
}

function createSubsurfaceBody(seedKey) {
  const geometry = new THREE.EllipseCurve(0, 0, HEX_SIZE * 0.10, HEX_SIZE * 0.28, 0, Math.PI * 2).getPoints(24);
  const shape = new THREE.Shape(geometry);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color: 0x071015,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  mesh.name = 'boat-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = hashUnit(`${seedKey}:body-rot`) * 0.16 - 0.08;
  mesh.position.y = -0.006;
  mesh.renderOrder = 68;
  return mesh;
}

function createWakeStroke(seedKey, side) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * HEX_SIZE * 0.075, 0, HEX_SIZE * 0.04),
    new THREE.Vector3(side * HEX_SIZE * 0.13, 0, HEX_SIZE * 0.19),
    new THREE.Vector3(side * HEX_SIZE * 0.09, 0, HEX_SIZE * 0.34)
  ]);
  const geometry = new THREE.TubeGeometry(curve, 10, HEX_SIZE * 0.008, 5, false);
  const material = new THREE.MeshBasicMaterial({
    color: 0xd8f2ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = side < 0 ? 'boat-left-wake' : 'boat-right-wake';
  mesh.position.y = 0.004;
  mesh.renderOrder = 69;
  return mesh;
}

function createSurfaceRipple(seedKey) {
  const geometry = new THREE.RingGeometry(HEX_SIZE * 0.08, HEX_SIZE * 0.105, 28);
  const material = new THREE.MeshBasicMaterial({
    color: 0xd8f2ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const ring = new THREE.Mesh(geometry, material);
  ring.name = 'boat-ripple';
  ring.position.y = 0.002;
  ring.rotation.x = -Math.PI / 2;
  ring.rotation.z = hashUnit(`${seedKey}:ripple-rot`) * Math.PI;
  ring.renderOrder = 67;
  return ring;
}

function collectWaterZone(startTile, startEdge, placedTiles, visited) {
  const stack = [{ tile: startTile, edge: startEdge }];
  const sectors = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const nodeKey = makeNodeKey(current.tile.key, current.edge);
    if (visited.has(nodeKey) || !isWaterEdge(current.tile, current.edge)) continue;

    visited.add(nodeKey);
    sectors.push(current);

    for (const neighbor of getWaterNeighbors(current.tile, current.edge, placedTiles)) {
      const neighborKey = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (!visited.has(neighborKey)) stack.push(neighbor);
    }
  }

  return { sectors };
}

function buildWaterGraph(zone) {
  const graph = { nodes: new Map(), adjacency: new Map() };
  const zoneNodeIds = new Set(zone.sectors.map(sector => makeNodeKey(sector.tile.key, sector.edge)));

  for (const sectorRef of zone.sectors) {
    const nodeId = makeNodeKey(sectorRef.tile.key, sectorRef.edge);
    addNode(graph, nodeId, getSectorWaterPoint(sectorRef.tile, sectorRef.edge), sectorRef.tile.key);
  }

  for (const sectorRef of zone.sectors) {
    const fromId = makeNodeKey(sectorRef.tile.key, sectorRef.edge);
    for (const neighbor of getWaterNeighbors(sectorRef.tile, sectorRef.edge, new Map(zone.sectors.map(item => [item.tile.key, item.tile])))) {
      const toId = makeNodeKey(neighbor.tile.key, neighbor.edge);
      if (zoneNodeIds.has(toId)) addEdge(graph, fromId, toId);
    }
  }

  return graph;
}

function getWaterNeighbors(placedTile, edge, placedTiles) {
  const neighbors = [];

  if (getTileCenterType(placedTile) === EDGE_TYPES.water) {
    for (const sameTileEdge of EDGE_ORDER) {
      if (sameTileEdge !== edge && isWaterEdge(placedTile, sameTileEdge)) {
        neighbors.push({ tile: placedTile, edge: sameTileEdge });
      }
    }
  }

  const edgeIndex = EDGE_ORDER.indexOf(edge);
  const internalEdges = [
    EDGE_ORDER[(edgeIndex + EDGE_ORDER.length - 1) % EDGE_ORDER.length],
    EDGE_ORDER[(edgeIndex + 1) % EDGE_ORDER.length]
  ];

  for (const internalEdge of internalEdges) {
    if (isWaterEdge(placedTile, internalEdge)) neighbors.push({ tile: placedTile, edge: internalEdge });
  }

  const direction = DIRECTION_BY_EDGE[edge];
  if (!direction) return neighbors;

  const neighborTile = placedTiles.get(makeHexKey(placedTile.q + direction.q, placedTile.r + direction.r));
  const oppositeEdge = getOppositeEdge(edge);

  if (neighborTile && isWaterEdge(neighborTile, oppositeEdge)) {
    neighbors.push({ tile: neighborTile, edge: oppositeEdge });
  }

  return neighbors;
}

function getSectorWaterPoint(placedTile, edge) {
  const sector = SECTOR_BY_KEY[edge];
  const outerVertices = createOuterVertices(HEX_SIZE * TILE_VISUAL.radiusScale);
  const innerVertices = createOuterVertices(CENTER_RADIUS);
  const world = axialToWorld(placedTile.q, placedTile.r);

  const outerMid = midpoint(outerVertices[sector.a], outerVertices[sector.b]);
  const innerMid = midpoint(innerVertices[sector.a], innerVertices[sector.b]);
  const point = new THREE.Vector3(
    innerMid.x + (outerMid.x - innerMid.x) * PORT_INSET,
    WATER_SURFACE_Y,
    innerMid.z + (outerMid.z - innerMid.z) * PORT_INSET
  );

  return new THREE.Vector3(world.x + point.x, WATER_SURFACE_Y, world.z + point.z);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function isWaterEdge(placedTile, edge) {
  return getEdgeType(placedTile?.tile?.edges?.[edge]) === EDGE_TYPES.water;
}

function addNode(graph, id, position, tileKey) {
  if (!graph.nodes.has(id)) {
    graph.nodes.set(id, { id, position, tileKeys: new Set([tileKey]) });
    graph.adjacency.set(id, new Set());
    return;
  }

  graph.nodes.get(id).tileKeys.add(tileKey);
}

function addEdge(graph, a, b) {
  if (a === b || !graph.nodes.has(a) || !graph.nodes.has(b)) return;
  graph.adjacency.get(a)?.add(b);
  graph.adjacency.get(b)?.add(a);
}

function findComponents(graph) {
  const visited = new Set();
  const components = [];

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;

    const stack = [nodeId];
    const nodes = [];
    visited.add(nodeId);

    while (stack.length > 0) {
      const current = stack.pop();
      nodes.push(current);

      for (const next of graph.adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push({ index: components.length, nodes });
  }

  return components;
}

function findLongestPath(graph, componentNodes) {
  const endpoints = componentNodes.filter(nodeId => (graph.adjacency.get(nodeId)?.size ?? 0) <= 1);
  const starts = endpoints.length >= 2 ? endpoints : componentNodes;
  let best = [];
  let bestDistance = -1;

  for (const start of starts) {
    const result = dijkstra(graph, start, componentNodes);
    for (const end of starts) {
      if (end === start) continue;
      const distance = result.distances.get(end) ?? -1;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = reconstructPath(result.previous, start, end);
      }
    }
  }

  if (best.length >= 2) return best;
  return componentNodes;
}

function dijkstra(graph, start, allowedNodes) {
  const allowed = new Set(allowedNodes);
  const unvisited = new Set(allowedNodes);
  const distances = new Map();
  const previous = new Map();

  for (const node of allowedNodes) distances.set(node, Infinity);
  distances.set(start, 0);

  while (unvisited.size > 0) {
    let current = null;
    let currentDistance = Infinity;

    for (const node of unvisited) {
      const distance = distances.get(node) ?? Infinity;
      if (distance < currentDistance) {
        current = node;
        currentDistance = distance;
      }
    }

    if (!current || currentDistance === Infinity) break;
    unvisited.delete(current);

    for (const next of graph.adjacency.get(current) ?? []) {
      if (!allowed.has(next) || !unvisited.has(next)) continue;

      const candidate = currentDistance + graph.nodes.get(current).position.distanceTo(graph.nodes.get(next).position);
      if (candidate < (distances.get(next) ?? Infinity)) {
        distances.set(next, candidate);
        previous.set(next, current);
      }
    }
  }

  return { distances, previous };
}

function reconstructPath(previous, start, end) {
  const path = [end];
  let current = end;

  while (current !== start) {
    current = previous.get(current);
    if (!current) return [];
    path.push(current);
  }

  return path.reverse();
}

function buildMotionTrack(points) {
  const samples = [];
  const pathDistance = measurePath(points);

  if (!points || points.length === 0) return { samples, totalMotion: 0, pathDistance: 0 };
  if (points.length === 1 || pathDistance <= 0) {
    samples.push({ position: points[0].clone(), tangent: new THREE.Vector3(1, 0, 0), motion: 0 });
    return { samples, totalMotion: 0, pathDistance: 0 };
  }

  let totalMotion = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const segmentVector = to.clone().sub(from);
    const segmentDistance = segmentVector.length();
    if (segmentDistance <= 0) continue;

    const tangent = segmentVector.clone().normalize();
    const steps = Math.max(8, Math.ceil(segmentDistance / (HEX_SIZE * 0.055)));

    for (let step = 0; step <= steps; step++) {
      if (i > 0 && step === 0) continue;

      const t = step / steps;
      const position = from.clone().lerp(to, t);
      const previousPosition = samples[samples.length - 1]?.position;
      if (previousPosition) totalMotion += previousPosition.distanceTo(position);
      samples.push({ position, tangent: tangent.clone(), motion: totalMotion });
    }
  }

  return { samples, totalMotion, pathDistance };
}

function samplePingPongMotionTrack(track, progress) {
  if (!track || track.samples.length === 0) {
    return { position: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0) };
  }

  if (track.samples.length === 1 || track.totalMotion <= 0) {
    return { position: track.samples[0].position.clone(), tangent: track.samples[0].tangent.clone() };
  }

  const pingPong = Math.floor(progress * 2) % 2 === 1;
  const halfProgress = (progress * 2) % 1;
  let targetMotion = easeInOutSine(halfProgress) * track.totalMotion;
  if (pingPong) targetMotion = track.totalMotion - targetMotion;

  const sample = sampleMotionTrackAt(track, targetMotion);
  if (pingPong) sample.tangent.multiplyScalar(-1);
  return sample;
}

function sampleMotionTrackAt(track, targetMotion) {
  const samples = track.samples;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (current.motion < targetMotion) continue;

    const span = Math.max(current.motion - previous.motion, 0.0001);
    const t = (targetMotion - previous.motion) / span;
    return {
      position: previous.position.clone().lerp(current.position, t),
      tangent: previous.tangent.clone().lerp(current.tangent, t).normalize()
    };
  }

  const last = samples[samples.length - 1];
  return { position: last.position.clone(), tangent: last.tangent.clone() };
}

function measurePath(points) {
  let distance = 0;
  for (let i = 1; i < points.length; i++) distance += points[i - 1].distanceTo(points[i]);
  return distance;
}

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function easeInOutSine(value) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}
