import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_TYPES } from './config.js';

const materialCache = new Map();
const generatedTextureCache = new Map();
const animatedTextureState = new Map();
const TEXTURED_TYPES = new Set([
  EDGE_TYPES.water,
  EDGE_TYPES.field,
  EDGE_TYPES.forest,
  EDGE_TYPES.grass,
  EDGE_TYPES.house
]);

export function getBiomeMaterial(type, opacity = 1) {
  const key = `${type}_${opacity}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const materialConfig = {
    color: EDGE_COLOR[type] ?? 0x222833,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  };

  if (TEXTURED_TYPES.has(type)) materialConfig.map = getGeneratedTexture(type);

  const material = new THREE.MeshBasicMaterial(materialConfig);
  materialCache.set(key, material);
  return material;
}

function getGeneratedTexture(type) {
  if (generatedTextureCache.has(type)) return generatedTextureCache.get(type);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  drawTexture(type, ctx, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);

  generatedTextureCache.set(type, texture);

  if (type === EDGE_TYPES.water) {
    animatedTextureState.set(type, { canvas, ctx, texture });
  }

  return texture;
}

export function updateAnimatedBiomeTextures(timeSeconds = 0) {
  const waterState = animatedTextureState.get(EDGE_TYPES.water);
  if (!waterState) return;

  drawWaterTexture(waterState.ctx, timeSeconds);

  // Très léger déplacement de la texture pour donner un courant lisible
  // sans modifier la géométrie ni les règles du jeu.
  waterState.texture.offset.x = (timeSeconds * 0.018) % 1;
  waterState.texture.offset.y = (Math.sin(timeSeconds * 0.35) * 0.015) % 1;
  waterState.texture.needsUpdate = true;
}

function drawTexture(type, ctx, timeSeconds = 0) {
  if (type === EDGE_TYPES.water) drawWaterTexture(ctx, timeSeconds);
  else if (type === EDGE_TYPES.field) drawFieldTexture(ctx);
  else if (type === EDGE_TYPES.forest) drawForestTexture(ctx);
  else if (type === EDGE_TYPES.grass) drawGrassTexture(ctx);
  else if (type === EDGE_TYPES.house) drawHouseTexture(ctx);
}

function drawWaterTexture(ctx, timeSeconds = 0) {
  const phase = timeSeconds * 2.2;

  ctx.clearRect(0, 0, 128, 128);

  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, '#4f9ccc');
  gradient.addColorStop(0.52, '#397fae');
  gradient.addColorStop(1, '#65b3dc');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  for (let y = -16; y < 160; y += 16) {
    const waveShift = Math.sin(phase + y * 0.09) * 7;

    ctx.strokeStyle = 'rgba(235,250,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();

    for (let x = -24; x <= 152; x += 8) {
      const px = x + waveShift;
      const py = y + Math.sin((x + y) * 0.08 + phase) * 4;
      if (x === -24) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.stroke();
  }

  for (let i = 0; i < 42; i++) {
    const driftX = Math.sin(phase * 0.7 + i) * 5;
    const driftY = Math.cos(phase * 0.55 + i * 1.7) * 3;
    const x = ((i * 47) % 128) + driftX;
    const y = ((i * 29) % 128) + driftY;
    const alpha = 0.04 + Math.max(0, Math.sin(phase + i * 0.8)) * 0.06;

    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc((x + 128) % 128, (y + 128) % 128, (i % 3) + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFieldTexture(ctx) {
  ctx.fillStyle = '#e5c65a';
  ctx.fillRect(0, 0, 128, 128);

  // Champs de blé : rangs labourés + petites touches de chaume.
  for (let x = -140; x < 256; x += 18) {
    ctx.strokeStyle = 'rgba(255, 238, 150, 0.60)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x + 128, 138);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120, 82, 24, 0.26)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 9, -10);
    ctx.lineTo(x + 137, 138);
    ctx.stroke();
  }

  for (let i = 0; i < 70; i++) {
    const x = (i * 31) % 128;
    const y = (i * 47) % 128;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 248, 180, 0.34)' : 'rgba(112, 78, 26, 0.18)';
    ctx.fillRect(x, y, 2, 5);
  }
}

function drawForestTexture(ctx) {
  ctx.fillStyle = '#1f5a2b';
  ctx.fillRect(0, 0, 128, 128);

  // Forêt : canopée irrégulière avec nuances, ombres et quelques troncs.
  const trees = [
    [10, 18, 13], [32, 10, 15], [58, 22, 12], [82, 14, 16], [110, 22, 14],
    [20, 48, 16], [48, 42, 14], [74, 54, 17], [104, 48, 15], [124, 58, 12],
    [8, 82, 14], [36, 88, 17], [62, 78, 13], [88, 92, 16], [116, 84, 15],
    [24, 116, 15], [54, 110, 17], [84, 120, 14], [112, 112, 16]
  ];

  for (const [x, y, r] of trees) {
    ctx.fillStyle = 'rgba(12, 34, 18, 0.34)';
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 5, r * 0.92, r * 0.70, 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2f7d32';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = (x + y) % 2 === 0 ? '#3f9340' : '#1f6a2e';
    ctx.beginPath();
    ctx.arc(x - r * 0.24, y - r * 0.22, r * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(84, 50, 24, 0.48)';
    ctx.fillRect(x - 1, y + r * 0.35, 3, 6);
  }

  for (let i = 0; i < 26; i++) {
    const x = (i * 43) % 128;
    const y = (i * 59) % 128;
    ctx.fillStyle = 'rgba(9, 28, 14, 0.24)';
    ctx.beginPath();
    ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrassTexture(ctx) {
  // Prairie plus verte, avec taches de terre discrètes pour éviter l'aplat fluo.
  ctx.fillStyle = '#78a84a';
  ctx.fillRect(0, 0, 128, 128);

  for (let y = -18; y < 148; y += 26) {
    for (let x = -16; x < 146; x += 30) {
      const offset = ((x * 11 + y * 17) % 19) - 9;
      ctx.fillStyle = 'rgba(108, 148, 62, 0.82)';
      ctx.beginPath();
      ctx.ellipse(x + 15 + offset, y + 13 - offset, 22, 12, -0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let y = 6; y < 128; y += 13) {
    for (let x = 6; x < 128; x += 15) {
      const ox = ((x * 13 + y * 7) % 9) - 4;

      ctx.strokeStyle = 'rgba(196, 216, 110, 0.38)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + 5);
      ctx.lineTo(x + ox + 4, y - 5);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(52, 92, 34, 0.28)';
      ctx.beginPath();
      ctx.moveTo(x + ox + 6, y + 5);
      ctx.lineTo(x + ox + 1, y - 3);
      ctx.stroke();
    }
  }

  for (let i = 0; i < 22; i++) {
    const x = (i * 37) % 128;
    const y = (i * 53) % 128;
    ctx.fillStyle = 'rgba(112, 78, 42, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + (i % 3), 2 + (i % 2), 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHouseTexture(ctx) {
  ctx.fillStyle = '#8e4a34';
  ctx.fillRect(0, 0, 128, 128);

  // Village : parcelles, chemins clairs, murs beiges et toits brique.
  ctx.strokeStyle = 'rgba(210, 180, 120, 0.26)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-10, 34);
  ctx.lineTo(140, 96);
  ctx.moveTo(28, -10);
  ctx.lineTo(96, 138);
  ctx.stroke();

  const houses = [
    [18, 24, -0.12], [54, 16, 0.08], [92, 30, -0.06],
    [34, 64, 0.10], [78, 70, -0.08], [114, 58, 0.05],
    [18, 104, 0.04], [58, 110, -0.10], [100, 100, 0.12]
  ];

  for (const [x, y, rot] of houses) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.fillStyle = 'rgba(55, 22, 18, 0.28)';
    ctx.fillRect(-9, 1, 20, 16);

    ctx.fillStyle = '#c49a68';
    ctx.fillRect(-8, 0, 16, 14);

    ctx.fillStyle = '#6f3428';
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(0, -10);
    ctx.lineTo(11, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 230, 150, 0.38)';
    ctx.fillRect(-5, 4, 3, 3);
    ctx.fillRect(3, 4, 3, 3);

    ctx.fillStyle = 'rgba(70, 42, 25, 0.58)';
    ctx.fillRect(-2, 7, 4, 7);

    ctx.restore();
  }
}
