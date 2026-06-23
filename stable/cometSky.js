import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { markNoWorldCurvature } from './worldCurvature.js';

const COMET_GROUP_NAME = 'hexistenz-debug-comet-sky';
const COMET_SPAWN_MIN_DELAY = 2;
const COMET_SPAWN_MAX_DELAY = 8;
const COMET_DISTANCE_MIN = 135;
const COMET_DISTANCE_MAX = 220;
const COMET_SIDE_SPAN_MIN = 120;
const COMET_SIDE_SPAN_MAX = 190;
const COMET_VERTICAL_SPAN_MIN = 12;
const COMET_VERTICAL_SPAN_MAX = 38;
const COMET_TRAVEL_TIME_MIN = 4.2;
const COMET_TRAVEL_TIME_MAX = 7.0;
const COMET_FADE_IN_TIME = 0.30;
const COMET_FADE_OUT_TIME = 0.95;
const COMET_MAX_ACTIVE = 3;

const COMET_HEAD_CORE_SIZE = 3.05;
const COMET_HEAD_HALO_SIZE = 10.6;
const COMET_TAIL_LENGTH_MIN = 24;
const COMET_TAIL_LENGTH_MAX = 38;
const COMET_TAIL_WIDTH_HEAD = 1.35;
const COMET_TAIL_WIDTH_TIP = 0.04;
const COMET_TAIL_SEGMENTS = 14;
const COMET_SPARK_COUNT = 4;

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _head = new THREE.Vector3();
const _tail = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _view = new THREE.Vector3();
const _width = new THREE.Vector3();
const _basePos = new THREE.Vector3();
const _sparkPos = new THREE.Vector3();

export function createCometSky() {
  const group = markNoWorldCurvature(new THREE.Group());
  group.name = COMET_GROUP_NAME;
  group.frustumCulled = false;
  group.renderOrder = 25000;
  group.userData.disableCastShadow = true;
  group.userData.disableReceiveShadow = true;
  group.userData.disableWorldCurvature = true;
  group.userData.skipPaletteHarmony = true;
  group.userData.comets = [];
  group.userData.nextSpawnAt = 0;
  group.userData.randomSeed = 0xC0A1E7;
  group.userData.headTexture = createGlowTexture(128, [
    [0.00, 'rgba(255,255,255,1.00)'],
    [0.10, 'rgba(255,255,255,0.98)'],
    [0.28, 'rgba(190,230,255,0.45)'],
    [1.00, 'rgba(70,130,255,0.00)']
  ]);
  group.userData.haloTexture = createGlowTexture(160, [
    [0.00, 'rgba(255,255,255,0.72)'],
    [0.20, 'rgba(155,215,255,0.38)'],
    [0.55, 'rgba(90,150,255,0.16)'],
    [1.00, 'rgba(50,90,255,0.00)']
  ]);
  group.userData.sparkTexture = createGlowTexture(48, [
    [0.00, 'rgba(255,255,255,0.92)'],
    [0.38, 'rgba(160,215,255,0.36)'],
    [1.00, 'rgba(80,135,255,0.00)']
  ]);
  return group;
}

export function updateCometSky(cometSky, camera, timeSeconds = 0) {
  if (!cometSky || !camera) return;

  const state = cometSky.userData;
  if (!Array.isArray(state.comets)) state.comets = [];

  while (timeSeconds >= (state.nextSpawnAt ?? 0) && state.comets.length < COMET_MAX_ACTIVE) {
    spawnComet(cometSky, camera, timeSeconds);
    state.nextSpawnAt = timeSeconds + randomRange(cometSky, COMET_SPAWN_MIN_DELAY, COMET_SPAWN_MAX_DELAY);
  }

  for (let i = state.comets.length - 1; i >= 0; i -= 1) {
    const comet = state.comets[i];
    const age = timeSeconds - comet.startedAt;
    const t = age / comet.duration;

    if (t >= 1) {
      cometSky.remove(comet.group);
      disposeComet(comet);
      state.comets.splice(i, 1);
      continue;
    }

    updateComet(comet, t, camera);
  }

  // ── Explosions visuelles ────────────────────────────────────────────────────
  if (Array.isArray(state.explosions)) {
    for (let i = state.explosions.length - 1; i >= 0; i--) {
      const ex = state.explosions[i];
      if (ex.startedAt === null) ex.startedAt = timeSeconds;
      const t = (timeSeconds - ex.startedAt) / ex.duration;
      if (t >= 1) {
        cometSky.remove(ex.sprite);
        ex.sprite.material.dispose();
        state.explosions.splice(i, 1);
        continue;
      }
      // Expansion rapide + fondu exponentiel
      ex.sprite.scale.setScalar(ex.baseScale * (1 + t * 3.5));
      ex.sprite.material.opacity = (1 - t) * (1 - t) * 0.90;
    }
  }
}

function spawnComet(cometSky, camera, timeSeconds) {
  const { headTexture, haloTexture, sparkTexture } = cometSky.userData;

  camera.getWorldDirection(_forward).normalize();
  _right.crossVectors(_forward, camera.up).normalize();
  if (_right.lengthSq() < 0.0001) _right.set(1, 0, 0);
  _up.crossVectors(_right, _forward).normalize();

  const sideSign = randomUnit(cometSky) > 0.5 ? 1 : -1;
  const distance = randomRange(cometSky, COMET_DISTANCE_MIN, COMET_DISTANCE_MAX);
  const sideSpan = randomRange(cometSky, COMET_SIDE_SPAN_MIN, COMET_SIDE_SPAN_MAX);
  const verticalSpan = randomRange(cometSky, COMET_VERTICAL_SPAN_MIN, COMET_VERTICAL_SPAN_MAX);
  const baseHeight = randomRange(cometSky, 56, 94);
  const depthDrift = randomRange(cometSky, -42, 46);

  const center = camera.position.clone()
    .addScaledVector(_forward, distance)
    .addScaledVector(_up, baseHeight)
    .addScaledVector(_right, randomRange(cometSky, -28, 28));

  const start = center.clone()
    .addScaledVector(_right, -sideSign * sideSpan)
    .addScaledVector(_up, randomRange(cometSky, -14, 14))
    .addScaledVector(_forward, -depthDrift * 0.5);

  const end = center.clone()
    .addScaledVector(_right, sideSign * sideSpan)
    .addScaledVector(_up, verticalSpan * (randomUnit(cometSky) > 0.35 ? -1 : 1))
    .addScaledVector(_forward, depthDrift);

  const pathDirection = end.clone().sub(start).normalize();
  const sideWobble = new THREE.Vector3().crossVectors(pathDirection, _up).normalize();
  if (sideWobble.lengthSq() < 0.0001) sideWobble.copy(_right);

  const hueWarmth = randomUnit(cometSky);
  const headColor = new THREE.Color().setRGB(0.98 + hueWarmth * 0.02, 0.95 + hueWarmth * 0.04, 1.0);
  const tailColor = new THREE.Color().setRGB(0.35 + hueWarmth * 0.18, 0.66 + hueWarmth * 0.18, 1.0);

  const cometGroup = markNoWorldCurvature(new THREE.Group());
  cometGroup.name = 'hexistenz-world-comet';
  cometGroup.frustumCulled = false;
  cometGroup.renderOrder = 25000;
  cometGroup.userData.disableCastShadow = true;
  cometGroup.userData.disableReceiveShadow = true;
  cometGroup.userData.disableWorldCurvature = true;
  cometGroup.userData.skipPaletteHarmony = true;

  const trailGeometry = createTrailGeometry(COMET_TAIL_SEGMENTS);
  const trailMaterial = new THREE.MeshBasicMaterial({
    color: tailColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
    side: THREE.DoubleSide,
    vertexColors: true
  });
  const trailMesh = markNoWorldCurvature(new THREE.Mesh(trailGeometry, trailMaterial));
  trailMesh.name = 'hexistenz-comet-continuous-trail';
  trailMesh.frustumCulled = false;
  trailMesh.renderOrder = 24990;
  trailMesh.userData.disableCastShadow = true;
  trailMesh.userData.disableReceiveShadow = true;
  trailMesh.userData.skipPaletteHarmony = true;
  cometGroup.add(trailMesh);

  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    color: tailColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false
  });
  const haloSprite = markNoWorldCurvature(new THREE.Sprite(haloMaterial));
  haloSprite.name = 'hexistenz-comet-head-halo';
  haloSprite.frustumCulled = false;
  haloSprite.renderOrder = 25005;
  haloSprite.userData.skipPaletteHarmony = true;
  cometGroup.add(haloSprite);

  const coreMaterial = new THREE.SpriteMaterial({
    map: headTexture,
    color: headColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false
  });
  const coreSprite = markNoWorldCurvature(new THREE.Sprite(coreMaterial));
  coreSprite.name = 'hexistenz-comet-head-core';
  coreSprite.frustumCulled = false;
  coreSprite.renderOrder = 25010;
  coreSprite.userData.skipPaletteHarmony = true;
  cometGroup.add(coreSprite);

  const sparks = [];
  for (let i = 0; i < COMET_SPARK_COUNT; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: sparkTexture,
      color: i % 2 ? headColor : tailColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false
    });
    const sprite = markNoWorldCurvature(new THREE.Sprite(material));
    sprite.name = 'hexistenz-comet-spark';
    sprite.frustumCulled = false;
    sprite.renderOrder = 25000 - i;
    sprite.userData.skipPaletteHarmony = true;
    cometGroup.add(sprite);
    sparks.push({
      sprite,
      offset: randomRange(cometSky, 0.20, 0.92),
      side: randomRange(cometSky, -1.0, 1.0),
      lift: randomRange(cometSky, -0.65, 0.75),
      size: randomRange(cometSky, 0.28, 0.82),
      phase: randomRange(cometSky, 0, Math.PI * 2)
    });
  }

  cometSky.add(cometGroup);
  cometSky.userData.comets.push({
    group: cometGroup,
    trailMesh,
    trailGeometry,
    trailMaterial,
    haloSprite,
    coreSprite,
    sparks,
    startedAt: timeSeconds,
    duration: randomRange(cometSky, COMET_TRAVEL_TIME_MIN, COMET_TRAVEL_TIME_MAX),
    start,
    end,
    pathDirection,
    sideWobble,
    wobble: randomRange(cometSky, 0.8, 2.2),
    phase: randomRange(cometSky, 0, Math.PI * 2),
    tailLength: randomRange(cometSky, COMET_TAIL_LENGTH_MIN, COMET_TAIL_LENGTH_MAX),
    headSize: randomRange(cometSky, 0.88, 1.16)
  });
}

function updateComet(comet, t, camera) {
  const easedT = easeInOutSine(t);
  const visibility = Math.min(
    smoothstep(0, COMET_FADE_IN_TIME / comet.duration, t),
    1 - smoothstep(1 - COMET_FADE_OUT_TIME / comet.duration, 1, t)
  );

  _head.copy(comet.start).lerp(comet.end, easedT);
  _head.addScaledVector(comet.sideWobble, Math.sin((t * Math.PI * 2) + comet.phase) * comet.wobble);
  comet.group.position.copy(_head);
  _tail.copy(_head).addScaledVector(comet.pathDirection, -comet.tailLength);

  _tangent.copy(comet.pathDirection).normalize();
  _view.copy(camera.position).sub(_head).normalize();
  _width.crossVectors(_tangent, _view).normalize();
  if (_width.lengthSq() < 0.0001) _width.copy(comet.sideWobble).normalize();

  updateTrailGeometry(comet, visibility, t);

  comet.coreSprite.position.set(0, 0, 0);
  comet.coreSprite.scale.setScalar(COMET_HEAD_CORE_SIZE * comet.headSize * (1.0 + Math.sin(t * 48) * 0.045));
  comet.coreSprite.material.opacity = visibility * 1.0;

  comet.haloSprite.position.set(0, 0, 0);
  comet.haloSprite.scale.setScalar(COMET_HEAD_HALO_SIZE * comet.headSize * (1.0 + Math.sin(t * 31 + comet.phase) * 0.055));
  comet.haloSprite.material.opacity = visibility * 0.64;

  comet.trailMaterial.opacity = visibility * 0.34;

  for (const spark of comet.sparks) {
    const drift = Math.sin(t * 9 + spark.phase) * 0.65;
    _sparkPos.set(0, 0, 0)
      .addScaledVector(comet.pathDirection, -comet.tailLength * spark.offset)
      .addScaledVector(_width, (spark.side * 0.42 + drift * 0.18) * (1 - spark.offset * 0.45))
      .addScaledVector(comet.sideWobble, spark.lift * 0.25 * (1 - spark.offset));

    spark.sprite.position.copy(_sparkPos);
    spark.sprite.scale.setScalar(spark.size * (1 - spark.offset * 0.55));
    spark.sprite.material.opacity = visibility * 0.14 * Math.pow(1 - spark.offset * 0.65, 1.4);
  }
}

function createTrailGeometry(segments) {
  const vertexCount = (segments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = [];

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const alpha = Math.pow(1 - u, 2.35);
    const warm = 0.36 + alpha * 0.64;
    for (let side = 0; side < 2; side += 1) {
      const idx = (i * 2 + side) * 3;
      colors[idx + 0] = 0.16 + warm * 0.50;
      colors[idx + 1] = 0.34 + warm * 0.48;
      colors[idx + 2] = 0.82 + warm * 0.18;
    }
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function updateTrailGeometry(comet, visibility, t) {
  const position = comet.trailGeometry.getAttribute('position');
  const segments = COMET_TAIL_SEGMENTS;

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const taper = Math.pow(1 - u, 1.85);
    const anchoredWobble = u * (1 - u);
    const localWobble = Math.sin(t * Math.PI * 3 + comet.phase - u * 2.6) * comet.wobble * 0.18 * anchoredWobble;
    const width = THREE.MathUtils.lerp(COMET_TAIL_WIDTH_HEAD, COMET_TAIL_WIDTH_TIP, Math.pow(u, 0.58)) * taper;
    _basePos.set(0, 0, 0)
      .addScaledVector(comet.pathDirection, -comet.tailLength * u)
      .addScaledVector(comet.sideWobble, localWobble);

    if (i === 0) _basePos.set(0, 0, 0);

    _tmp.copy(_width).multiplyScalar(width * 0.5);

    const leftIndex = i * 2;
    const rightIndex = leftIndex + 1;
    position.setXYZ(leftIndex, _basePos.x - _tmp.x, _basePos.y - _tmp.y, _basePos.z - _tmp.z);
    position.setXYZ(rightIndex, _basePos.x + _tmp.x, _basePos.y + _tmp.y, _basePos.z + _tmp.z);
  }

  position.needsUpdate = true;
  comet.trailGeometry.computeBoundingSphere();
}

function createGlowTexture(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeComet(comet) {
  comet.trailGeometry?.dispose?.();
  comet.trailMaterial?.dispose?.();
  comet.coreSprite?.material?.dispose?.();
  comet.haloSprite?.material?.dispose?.();
  for (const spark of comet.sparks || []) spark.sprite?.material?.dispose?.();
}

function randomRange(group, min, max) {
  return min + randomUnit(group) * (max - min);
}

function randomUnit(group) {
  let seed = group.userData.randomSeed >>> 0;
  seed = (seed + 0x6D2B79F5) >>> 0;
  group.userData.randomSeed = seed;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(0.00001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeInOutSine(t) {
  return -(Math.cos(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) - 1) / 2;
}

// ─── API clic interactif ─────────────────────────────────────────────────────

const _cometRayTmp = new THREE.Vector3();

/**
 * Teste si le rayon caméra touche la tête d'une comète active.
 * hitMultiplier : facteur sur COMET_HEAD_HALO_SIZE * headSize (hitbox généreuse).
 * Retourne la comète touchée ou null.
 */
export function tryCometHit(cometSky, ray, hitMultiplier = 1.2) {
  const comets = cometSky?.userData?.comets;
  if (!Array.isArray(comets) || comets.length === 0) return null;

  for (let i = 0; i < comets.length; i++) {
    const comet = comets[i];
    _cometRayTmp.copy(comet.group.position).sub(ray.origin);
    const proj = _cometRayTmp.dot(ray.direction);
    if (proj < 0) continue; // derrière la caméra
    const closest = ray.origin.clone().addScaledVector(ray.direction, proj);
    const dist = closest.distanceTo(comet.group.position);
    if (dist <= COMET_HEAD_HALO_SIZE * comet.headSize * hitMultiplier) return comet;
  }

  return null;
}

/**
 * Retire une comète du ciel immédiatement (clic joueur, explosion, etc.).
 */
export function removeCometFromSky(cometSky, comet) {
  const comets = cometSky?.userData?.comets;
  if (!Array.isArray(comets)) return;
  const idx = comets.indexOf(comet);
  if (idx === -1) return;
  cometSky.remove(comet.group);
  disposeComet(comet);
  comets.splice(idx, 1);
}

/**
 * Crée un flash d'explosion visuel à la position de la comète cliquée.
 * Le sprite s'étend et s'efface sur ~0.45 s, géré par updateCometSky.
 */
export function spawnCometExplosion(cometSky, comet) {
  const state = cometSky?.userData;
  if (!state) return;
  if (!Array.isArray(state.explosions)) state.explosions = [];

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: state.haloTexture,
    color: 0xc8e8ff,
    transparent: true,
    opacity: 0.90,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  // Position dans l'espace local de cometSky (= world space, groupe à l'origine)
  sprite.position.copy(comet.group.position);
  const baseScale = COMET_HEAD_HALO_SIZE * comet.headSize * 1.8;
  sprite.scale.setScalar(baseScale);
  sprite.renderOrder = 25001;
  cometSky.add(sprite);

  state.explosions.push({ sprite, baseScale, startedAt: null, duration: 0.45 });
}
