import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GRID_RADIUS, HEX_SIZE, TILE_VISUAL } from './config.js';
import { axialToWorld, makeHexKey } from './hex.js';

const GRID_EXPANSION_RADIUS = 3;

// Capacité pré-allouée — grille initiale + expansions max
const MAX_CELLS = 600;
// 6 segments × 2 points par hexagone pour LineSegments
const WIRE_VERTS_PER_CELL = 12;

// Couleurs par état (hex integer)
const CLR_VALID_FILL    = 0x7fc7b7;
const CLR_INVALID_FILL  = 0x070d13;
const CLR_VALID_WIRE    = 0xb6eee0;
const CLR_INVALID_WIRE  = 0x3a4652;
const OPA_VALID_FILL    = 0.20;
const OPA_INVALID_FILL  = 0.0;
const OPA_VALID_WIRE    = 0.50;
const OPA_INVALID_WIRE  = 0.0;

// ─── Géométrie fill partagée ──────────────────────────────────────────────────
function _makeFillGeo() {
  const geo = new THREE.CircleGeometry(HEX_SIZE * 0.965, 6);
  geo.rotateZ(Math.PI / 3);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function createGrid(seedHexes = []) {
  const group = new THREE.Group();
  group.name = 'placement-grid';
  group.userData.gridKeys = new Set();
  // Map<key, { q, r, x, z, wireY, fillMatrix: THREE.Matrix4 }>
  group.userData.cells = new Map();

  const fillGeo = _makeFillGeo();

  // ── InstancedMesh fills (valid / invalid) ────────────────────────────────
  const _makeFillIM = (color, opacity, name) => {
    const im = new THREE.InstancedMesh(
      fillGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
      MAX_CELLS
    );
    im.count           = 0;
    im.visible         = opacity > 0;  // opacity=0 → skip draw call entièrement
    im.name            = name;
    im.castShadow      = false;
    im.receiveShadow   = false;
    im.frustumCulled   = false;
    im.renderOrder     = -20;
    // Empêche applySceneShadowFlags de réactiver castShadow
    im.userData.disableCastShadow  = true;
    im.userData.shadowFlagsApplied = true;
    return im;
  };

  const validFillIM   = _makeFillIM(CLR_VALID_FILL,   OPA_VALID_FILL,   'hex-grid-fill-valid');
  const invalidFillIM = _makeFillIM(CLR_INVALID_FILL,  OPA_INVALID_FILL, 'hex-grid-fill-invalid');

  // ── LineSegments wires (valid / invalid) — buffers dynamiques pré-alloués ─
  const _makeWireLS = (color, opacity, name) => {
    const geo = new THREE.BufferGeometry();
    const buf = new Float32Array(MAX_CELLS * WIRE_VERTS_PER_CELL * 3);
    const attr = new THREE.BufferAttribute(buf, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    geo.setDrawRange(0, 0);
    const ls = new THREE.LineSegments(geo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    ls.visible       = opacity > 0;  // opacity=0 → skip draw call entièrement
    ls.name         = name;
    ls.renderOrder  = -20;
    ls.frustumCulled = false;
    return ls;
  };

  const validWireLS   = _makeWireLS(CLR_VALID_WIRE,   OPA_VALID_WIRE,   'hex-grid-wire-valid');
  const invalidWireLS = _makeWireLS(CLR_INVALID_WIRE,  OPA_INVALID_WIRE, 'hex-grid-wire-invalid');

  group.add(validFillIM, invalidFillIM, validWireLS, invalidWireLS);
  group.userData.validFillIM   = validFillIM;
  group.userData.invalidFillIM = invalidFillIM;
  group.userData.validWireLS   = validWireLS;
  group.userData.invalidWireLS = invalidWireLS;

  // ── Grille de base ───────────────────────────────────────────────────────
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (_isBaseHex(q, r)) _addCell(group, q, r);
    }
  }

  for (const hex of seedHexes ?? []) {
    ensureGridCellsAroundHex(group, hex, GRID_EXPANSION_RADIUS);
  }

  return group;
}

export function ensureGridCellsAroundHex(gridGroup, centerHex, radius = GRID_EXPANSION_RADIUS) {
  if (!gridGroup || !centerHex) return 0;

  let added = 0;
  const cq = Number(centerHex.q);
  const cr = Number(centerHex.r);
  const sr = Math.max(0, Math.floor(Number(radius) || 0));

  for (let dq = -sr; dq <= sr; dq++) {
    for (let dr = -sr; dr <= sr; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)) > sr) continue;
      if (_addCell(gridGroup, cq + dq, cr + dr)) added++;
    }
  }
  return added;
}

export function getGridKeys(gridGroup) {
  return gridGroup?.userData?.gridKeys ?? new Set();
}

export function getGridCellCount(gridGroup) {
  return getGridKeys(gridGroup).size;
}

/**
 * Met à jour les InstancedMesh et LineSegments selon les cases placed/valid/invalid.
 * Remplace l'ancienne approche per-Mesh (259 DC → 4 DC).
 */
export function updateGridAvailability(gridGroup, placedTiles, currentTile, specialCells, getValidation) {
  if (!gridGroup || typeof getValidation !== 'function') return;
  const ud = gridGroup.userData;
  if (!ud.validFillIM) return; // sécurité init

  const cells        = ud.cells;
  const validFillIM  = ud.validFillIM;
  const invalidFillIM = ud.invalidFillIM;
  const validWireLS  = ud.validWireLS;
  const invalidWireLS = ud.invalidWireLS;

  const vwBuf  = validWireLS.geometry.attributes.position.array;
  const ivwBuf = invalidWireLS.geometry.attributes.position.array;

  let vf = 0, ivf = 0; // InstancedMesh counts
  let vw = 0, ivw = 0; // wire vertex counts

  for (const [key, cell] of cells) {
    if (placedTiles.has(key)) continue;

    const validation = currentTile
      ? getValidation({ q: cell.q, r: cell.r }, placedTiles, currentTile, specialCells)
      : { valid: false };
    const valid = Boolean(validation.valid);

    // Fill InstancedMesh
    if (valid) validFillIM.setMatrixAt(vf++, cell.fillMatrix);
    else       invalidFillIM.setMatrixAt(ivf++, cell.fillMatrix);

    // Wire LineSegments — 6 segments par hex = 12 verts = 36 floats
    const buf = valid ? vwBuf : ivwBuf;
    let   ptr = (valid ? vw : ivw) * 3;
    const cx  = cell.x;
    const cy  = cell.wireY;
    const cz  = cell.z;

    for (let s = 0; s < 6; s++) {
      const a0 = (Math.PI / 3) * s;
      const a1 = (Math.PI / 3) * ((s + 1) % 6);
      buf[ptr++] = cx + HEX_SIZE * Math.cos(a0); buf[ptr++] = cy; buf[ptr++] = cz + HEX_SIZE * Math.sin(a0);
      buf[ptr++] = cx + HEX_SIZE * Math.cos(a1); buf[ptr++] = cy; buf[ptr++] = cz + HEX_SIZE * Math.sin(a1);
    }
    if (valid) vw  += WIRE_VERTS_PER_CELL;
    else       ivw += WIRE_VERTS_PER_CELL;
  }

  // Appliquer les counts
  validFillIM.count  = vf;
  invalidFillIM.count = ivf;
  validFillIM.instanceMatrix.needsUpdate  = true;
  invalidFillIM.instanceMatrix.needsUpdate = true;

  validWireLS.geometry.setDrawRange(0, vw);
  invalidWireLS.geometry.setDrawRange(0, ivw);
  validWireLS.geometry.attributes.position.needsUpdate  = true;
  invalidWireLS.geometry.attributes.position.needsUpdate = true;
}

// ─── Internes ─────────────────────────────────────────────────────────────────

function _isBaseHex(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= GRID_RADIUS;
}

function _addCell(group, q, r) {
  const key = makeHexKey(q, r);
  if (group.userData.gridKeys?.has(key)) return false;
  if (!group.userData.gridKeys) group.userData.gridKeys = new Set();
  if (!group.userData.cells)    group.userData.cells    = new Map();

  const { x, z } = axialToWorld(q, r);
  const wireY     = (TILE_VISUAL.waterY ?? -0.075) - (TILE_VISUAL.waterThickness ?? 0.08) - 0.012;
  const fillY     = wireY - 0.002;

  group.userData.gridKeys.add(key);
  group.userData.cells.set(key, {
    q, r, x, z,
    wireY,
    fillMatrix: new THREE.Matrix4().setPosition(x, fillY, z),
  });
  return true;
}
