import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EDGE_TYPES, HEX_SIZE, TILE_VISUAL } from './config.js';
import { getEdgeType } from './tileGenerator.js';

const ROAD_STRAIGHT_URL = './glb/stone-road-droite.glb';
const ROAD_CURVE_URL = './glb/stone-road-curve60.glb';

// Les modèles restent réduits de 35%, mais les segments sont allongés et se
// recouvrent franchement pour former de vrais chemins, pas des miettes de route.
const STONE_ROAD_VISUAL_SCALE = 0.455;
const STONE_ROAD_OVERLAP = 3.45;
const STONE_ROAD_Y_OFFSET = 0.004;

const roadModelCache = new Map();
const loader = new GLTFLoader();

const ROAD_TYPE = EDGE_TYPES.house;

// Les anciennes routes par secteur produisaient des bouts isolés et cassés.
// Tout le réseau routier est maintenant généré au centre de la tuile, comme les
// voies ferrées : on relie seulement les ports village entre eux.
export function createRoadOverlay() {
  return null;
}

export function createRoadCenterOverlay(edges, sectorDefs, createOuterVertices) {
  const ports = getRoadPorts(edges, sectorDefs, createOuterVertices);
  if (ports.length < 1) return null;

  const group = new THREE.Group();
  group.name = 'village-stone-road-glb-network';

  const routes = createRoadRoutes(ports, edges);
  for (const route of routes) {
    const road = createStoneRoadFromPath(route.points, route.seedKey);
    if (road) group.add(road);
  }

  return group.children.length > 0 ? group : null;
}

function getRoadPorts(edges, sectorDefs, createOuterVertices) {
  const vertices = createOuterVertices();

  return sectorDefs
    .map((sector, index) => {
      const edge = edges[sector.key];
      if (getEdgeType(edge) !== ROAD_TYPE) return null;

      const vertexA = vertices[sector.a];
      const vertexB = vertices[sector.b];
      const point = new THREE.Vector3(
        ((vertexA.x + vertexB.x) / 2) * 0.955,
        getRoadY(),
        ((vertexA.z + vertexB.z) / 2) * 0.955
      );

      return {
        index,
        key: sector.key,
        point,
        direction: new THREE.Vector3(point.x, 0, point.z).normalize()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

function createRoadRoutes(ports, edges) {
  if (ports.length === 1) {
    return [createPortStubRoute(ports[0], true)];
  }

  // Réseau “place de village” : chaque grappe de secteurs village reçoit un hub
  // interne, puis chaque maison/port tente de s'y raccorder. C'est plus proche
  // des voies ferrées : un tracé continu, sinueux, avec des branches lisibles,
  // au lieu de petits bouts de gravier jetés par un hamster ivre.
  const routes = [];
  const groups = groupContiguousRoadPorts(ports);

  for (const group of groups) {
    if (group.length === 1) {
      routes.push(createPortStubRoute(group[0], true));
      continue;
    }

    const hub = createVillageHubPoint(group);

    // Chaque secteur maison a au moins une tentative de raccordement vers la
    // place centrale. Cela corrige les maisons isolées visuellement non reliées.
    for (const port of group) {
      routes.push(createPortToHubRoute(port, hub, group.length));
    }

    // On conserve aussi des liaisons entre voisins pour densifier les chemins
    // sans recréer des ponts ni traverser l'eau : seulement au sein d'une même
    // grappe contiguë de village.
    for (let i = 0; i < group.length; i += 1) {
      const a = group[i];
      const b = group[(i + 1) % group.length];
      if (a !== b && areAdjacentIndexes(a.index, b.index)) {
        routes.push(createPortToPortRoute(a, b, true));
      }
    }
  }

  return routes;
}

function groupContiguousRoadPorts(ports) {
  const sorted = [...ports].sort((a, b) => a.index - b.index);
  const groups = [];
  let current = [];

  for (const port of sorted) {
    const previous = current[current.length - 1];
    if (!previous || areAdjacentIndexes(previous.index, port.index)) {
      current.push(port);
    } else {
      groups.push(current);
      current = [port];
    }
  }

  if (current.length > 0) groups.push(current);

  // Fusionne le cas circulaire NW -> N : sur un hexagone, 5 et 0 sont voisins.
  if (groups.length > 1) {
    const first = groups[0][0];
    const lastGroup = groups[groups.length - 1];
    const last = lastGroup[lastGroup.length - 1];
    if (first && last && areAdjacentIndexes(last.index, first.index)) {
      groups[0] = [...lastGroup, ...groups[0]];
      groups.pop();
    }
  }

  return groups;
}

function createVillageHubPoint(group) {
  const hub = new THREE.Vector3();
  for (const port of group) hub.add(port.point);
  hub.multiplyScalar(1 / group.length);

  // Le hub reste vers l'intérieur du paquet de maisons, pas sur le bord : cela
  // donne l'effet “petite place” visible dans les villages denses.
  hub.multiplyScalar(group.length >= 4 ? 0.42 : 0.50);
  hub.y = getRoadY();
  return hub;
}

function createPortToHubRoute(port, hub, groupSize) {
  const start = port.point.clone();
  const end = hub.clone();
  const distance = start.distanceTo(end);
  const inward = port.direction.clone().multiplyScalar(-1);
  const sideSign = port.index % 2 === 0 ? 1 : -1;
  const side = new THREE.Vector3(-inward.z, 0, inward.x);
  const bendStrength = HEX_SIZE * (groupSize >= 4 ? 0.18 : 0.13) * sideSign;

  const c1 = start.clone()
    .add(inward.clone().multiplyScalar(clamp(distance * 0.45, HEX_SIZE * 0.18, HEX_SIZE * 0.55)))
    .add(side.clone().multiplyScalar(bendStrength));

  const c2 = end.clone()
    .add(inward.clone().multiplyScalar(-clamp(distance * 0.16, HEX_SIZE * 0.06, HEX_SIZE * 0.20)))
    .add(side.clone().multiplyScalar(-bendStrength * 0.62));

  const points = sampleCubic(start, c1, c2, end, 36);
  addOrganicWobble(points, `road:hub:${port.key}:${groupSize}`);

  return {
    seedKey: `road:hub:${port.index}:${groupSize}`,
    points,
    aKey: port.key,
    bKey: `hub:${groupSize}`
  };
}

function createPortStubRoute(port, longStub = false) {
  const start = port.point.clone();
  const end = port.point.clone().add(port.direction.clone().multiplyScalar(-HEX_SIZE * (longStub ? 0.58 : 0.36)));
  const side = new THREE.Vector3(-port.direction.z, 0, port.direction.x).multiplyScalar(HEX_SIZE * 0.10 * (port.index % 2 === 0 ? 1 : -1));
  const c1 = start.clone().add(port.direction.clone().multiplyScalar(-HEX_SIZE * (longStub ? 0.22 : 0.12))).add(side);
  const c2 = end.clone().add(side.clone().multiplyScalar(0.65));
  const points = sampleCubic(start, c1, c2, end, 22);
  addOrganicWobble(points, `road:stub:${port.key}`);
  return { seedKey: `road:stub:${port.index}`, points, aKey: port.key, bKey: port.key };
}

function createPortToPortRoute(a, b, nearOuterRing = false) {
  const start = a.point.clone();
  const end = b.point.clone();
  const distance = start.distanceTo(end);
  const controlDistance = clamp(distance * (nearOuterRing ? 0.62 : 0.52), HEX_SIZE * 0.28, HEX_SIZE * 0.92);
  const dot = clamp(a.direction.dot(b.direction), -1, 1);

  const sideSign = ((a.index + b.index) % 2 === 0 ? 1 : -1);
  const midDir = start.clone().add(end).normalize();
  const side = new THREE.Vector3(-midDir.z, 0, midDir.x).multiplyScalar(HEX_SIZE * (nearOuterRing ? 0.18 : 0.24) * sideSign);
  const c1 = start.clone().add(a.direction.clone().multiplyScalar(-controlDistance)).add(side);
  const c2 = end.clone().add(b.direction.clone().multiplyScalar(-controlDistance)).add(side.clone().multiplyScalar(-0.35));

  // Si les deux ports sont quasiment opposés, on tire une belle grande courbe
  // douce plutôt qu'une ligne droite de géomètre triste.
  if (dot < -0.88) {
    const side = new THREE.Vector3(-a.direction.z, 0, a.direction.x);
    const bend = side.multiplyScalar(HEX_SIZE * 0.20 * (a.index % 2 === 0 ? 1 : -1));
    c1.copy(start.clone().multiplyScalar(0.40).add(bend));
    c2.copy(end.clone().multiplyScalar(0.40).add(bend));
  }

  const points = sampleCubic(start, c1, c2, end, 34);
  addOrganicWobble(points, `road:${a.key}:${b.key}`);

  return {
    seedKey: `road:${a.index}:${b.index}`,
    points,
    aKey: a.key,
    bKey: b.key
  };
}

function addOrganicWobble(points, seedKey) {
  if (points.length < 5) return;
  const seed = hashText(seedKey);
  const start = points[0];
  const end = points[points.length - 1];
  const mainDir = end.clone().sub(start).normalize();
  const side = new THREE.Vector3(-mainDir.z, 0, mainDir.x);
  const amp = HEX_SIZE * 0.075;

  for (let i = 1; i < points.length - 1; i += 1) {
    const t = i / (points.length - 1);
    const fade = Math.sin(t * Math.PI);
    const wave = Math.sin(t * Math.PI * 3.15 + (seed % 628) / 100) * amp * 0.82;
    const noise = signedNoise(seed, i) * amp * 0.42;
    points[i].add(side.clone().multiplyScalar((wave + noise) * fade));
    points[i].y = getRoadY();
  }
}

function createStoneRoadFromPath(points, seedKey) {
  const group = new THREE.Group();
  const samples = samplePolyline(points, getRoadSpacing());

  // En dessous de cette longueur, c'est visuellement lu comme un bout cassé.
  if (samples.length < 6) return null;

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const dir = b.clone().sub(a);
    const length = dir.length();
    if (length <= 0.001) continue;

    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 2)];
    const incoming = a.clone().sub(prev);
    const outgoing = next.clone().sub(b);
    const turn = cross2D(incoming, outgoing);
    const useCurve = i > 0 && i < samples.length - 2 && (Math.abs(turn) > 0.0012 || i % 3 !== 0);

    const object = new THREE.Group();
    const mid = a.clone().lerp(b, 0.5);
    object.position.copy(mid);
    object.position.y = getRoadSurfaceY(mid);
    object.rotation.y = Math.atan2(dir.x, dir.z) + (useCurve && turn < 0 ? Math.PI : 0);
    object.userData.roadTargetLength = length * STONE_ROAD_OVERLAP * STONE_ROAD_VISUAL_SCALE;
    object.userData.roadTargetWidth = getRoadWidth() * STONE_ROAD_VISUAL_SCALE;
    object.userData.roadTargetHeight = getRoadHeight() * STONE_ROAD_VISUAL_SCALE;

    addRoadModelToObject(object, useCurve ? ROAD_CURVE_URL : ROAD_STRAIGHT_URL);
    group.add(object);
  }

  group.name = `village-stone-road-route-${seedKey}`;
  return group.children.length > 0 ? group : null;
}

function addRoadModelToObject(parent, url) {
  getRoadModel(url).then(model => {
    const clone = model.clone(true);
    normalizeRoadClone(clone, parent.userData.roadTargetLength, parent.userData.roadTargetWidth, parent.userData.roadTargetHeight);
    parent.add(clone);
  });
}

function getRoadModel(url) {
  if (roadModelCache.has(url)) return roadModelCache.get(url);

  const promise = new Promise(resolve => {
    loader.load(
      url,
      gltf => {
        const model = gltf.scene;
        model.traverse(child => {
          if (!child.isMesh) return;
          child.castShadow = false;
          child.receiveShadow = true;
          if (child.material) {
            child.material.depthWrite = true;
            child.material.needsUpdate = true;
          }
        });
        resolve(model);
      },
      undefined,
      () => resolve(createFallbackStoneRoad(url === ROAD_CURVE_URL))
    );
  });

  roadModelCache.set(url, promise);
  return promise;
}

function normalizeRoadClone(clone, targetLength, targetWidth, targetHeight) {
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  box.getSize(size);

  const lengthAxis = size.z >= size.x ? 'z' : 'x';
  const currentLength = Math.max(lengthAxis === 'z' ? size.z : size.x, 0.0001);
  const currentWidth = Math.max(lengthAxis === 'z' ? size.x : size.z, 0.0001);
  const currentHeight = Math.max(size.y, 0.0001);

  const uniform = Math.min(
    targetLength / currentLength,
    targetWidth / currentWidth,
    targetHeight / currentHeight
  );

  clone.scale.multiplyScalar(uniform);

  const normalizedBox = new THREE.Box3().setFromObject(clone);
  const center = new THREE.Vector3();
  normalizedBox.getCenter(center);
  const minY = normalizedBox.min.y;

  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= minY - STONE_ROAD_Y_OFFSET;
}

function createFallbackStoneRoad(curved = false) {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0xc9c9b7, roughness: 0.85 });
  const count = curved ? 7 : 5;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
    const geometry = new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.025, 1);
    geometry.scale(1.25 + (i % 2) * 0.35, 0.22, 0.82);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = t;
    mesh.position.x = curved ? Math.sin(t * Math.PI * 0.65) * 0.34 : ((i % 2) - 0.5) * 0.18;
    mesh.rotation.y = curved ? t * 0.8 : ((i % 3) - 1) * 0.18;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function sampleCubic(p0, p1, p2, p3, steps) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const inv = 1 - t;
    const point = p0.clone().multiplyScalar(inv * inv * inv)
      .add(p1.clone().multiplyScalar(3 * inv * inv * t))
      .add(p2.clone().multiplyScalar(3 * inv * t * t))
      .add(p3.clone().multiplyScalar(t * t * t));
    point.y = getRoadY();
    points.push(point);
  }
  return points;
}

function samplePolyline(points, spacing) {
  const output = [points[0].clone()];
  let carried = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const segment = b.clone().sub(a);
    const length = segment.length();
    if (length <= 0.0001) continue;

    const dir = segment.clone().normalize();
    let distance = spacing - carried;

    while (distance < length) {
      output.push(a.clone().add(dir.clone().multiplyScalar(distance)));
      distance += spacing;
    }

    carried = Math.max(0, length - (distance - spacing));
  }

  const last = points[points.length - 1].clone();
  if (output[output.length - 1].distanceTo(last) > spacing * 0.20) output.push(last);
  else output[output.length - 1].copy(last);

  return output;
}

function getRoadSpacing() {
  return HEX_SIZE * 0.062;
}

function getRoadWidth() {
  return HEX_SIZE * 0.29;
}

function getRoadHeight() {
  return HEX_SIZE * 0.080;
}

function getRoadY() {
  const baseDepth = TILE_VISUAL.tileThickness ?? 0.12;
  return baseDepth * -0.30 + 0.006;
}

function getRoadSurfaceY(point) {
  // Posé au sol, mais plus enterré comme en v4 : l'enfouissement excessif rendait
  // les chemins incomplets selon l'angle caméra/relief.
  return getRoadY() + Math.sin(point.x * 7.0 + point.z * 5.0) * 0.001;
}

function circularGap(a, b) {
  return Math.min(Math.abs(a - b), 6 - Math.abs(a - b));
}

function areAdjacentIndexes(a, b) {
  return circularGap(a, b) === 1;
}

function isVillageArc(a, b, edges) {
  const keys = ['n', 'ne', 'se', 's', 'sw', 'nw'];
  const forward = [];
  for (let i = a; i !== b; i = (i + 1) % 6) forward.push(i);
  forward.push(b);

  const backward = [];
  for (let i = a; i !== b; i = (i + 5) % 6) backward.push(i);
  backward.push(b);

  return [forward, backward].some(path => path.every(index => getEdgeType(edges[keys[index]]) === ROAD_TYPE));
}

function cross2D(a, b) {
  if (a.lengthSq() <= 0.000001 || b.lengthSq() <= 0.000001) return 0;
  const an = a.clone().normalize();
  const bn = b.clone().normalize();
  return an.x * bn.z - an.z * bn.x;
}

function signedNoise(seed, salt) {
  const n = hashText(`${seed}:${salt}`) % 2001;
  return (n / 1000) - 1;
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
