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
  EDGE_TYPES.house,
  EDGE_TYPES.rail
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

export function getBiomeSideMaterial(type, opacity = 1) {
  const key = `side_${type}_${opacity}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const color = new THREE.Color(EDGE_COLOR[type] ?? 0x222833).multiplyScalar(0.72);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 1
  });

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
  else if (type === EDGE_TYPES.rail) drawRailGroundTexture(ctx);
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
  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, '#f0d477');
  gradient.addColorStop(0.45, '#d8ad3b');
  gradient.addColorStop(1, '#f3df8a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  // Champs de blé : rangs plus fins, sillons, chaumes et petites variations.
  for (let x = -150; x < 270; x += 13) {
    ctx.strokeStyle = 'rgba(255, 244, 164, 0.52)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, -12);
    ctx.lineTo(x + 128, 140);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(105, 70, 20, 0.24)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 7, -12);
    ctx.lineTo(x + 135, 140);
    ctx.stroke();
  }

  for (let i = 0; i < 115; i++) {
    const x = (i * 37 + (i % 5) * 11) % 128;
    const y = (i * 53 + (i % 7) * 5) % 128;
    const tall = 3 + (i % 4);
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(255, 250, 188, 0.44)' : 'rgba(126, 86, 24, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + tall);
    ctx.lineTo(x + ((i % 3) - 1), y - tall);
    ctx.stroke();
  }

  for (let i = 0; i < 24; i++) {
    const x = (i * 47) % 128;
    const y = (i * 31) % 128;
    ctx.fillStyle = 'rgba(120, 75, 18, 0.14)';
    ctx.beginPath();
    ctx.ellipse(x, y, 7 + (i % 4), 3 + (i % 2), 0.55, 0, Math.PI * 2);
    ctx.fill();
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
  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, '#9b5a3d');
  gradient.addColorStop(0.55, '#7f432f');
  gradient.addColorStop(1, '#b0744e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  // Sol de village uniquement : plus de fausses maisons plates au sol,
  // puisque les vraies maisons 3D sont posées au-dessus.
  ctx.strokeStyle = 'rgba(214, 184, 124, 0.34)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, 36);
  ctx.bezierCurveTo(26, 48, 56, 56, 140, 92);
  ctx.moveTo(30, -12);
  ctx.bezierCurveTo(40, 30, 58, 74, 96, 140);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(92, 50, 34, 0.28)';
  ctx.lineWidth = 2;
  for (let y = 9; y < 128; y += 13) {
    ctx.beginPath();
    ctx.moveTo(0, y + ((y * 7) % 5));
    ctx.lineTo(128, y - ((y * 5) % 7));
    ctx.stroke();
  }

  for (let i = 0; i < 95; i++) {
    const x = (i * 41 + (i % 6) * 7) % 128;
    const y = (i * 29 + (i % 5) * 13) % 128;
    const r = 1.4 + (i % 4) * 0.55;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(198, 158, 102, 0.34)' : 'rgba(74, 38, 28, 0.20)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.45, r, (i % 8) * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 18; i++) {
    const x = (i * 53) % 128;
    const y = (i * 47) % 128;
    ctx.fillStyle = 'rgba(86, 109, 58, 0.28)';
    ctx.beginPath();
    ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRailGroundTexture(ctx) {
  ctx.fillStyle = '#8d877c';
  ctx.fillRect(0, 0, 128, 128);

  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, 'rgba(188, 184, 171, 0.44)');
  gradient.addColorStop(0.5, 'rgba(104, 99, 91, 0.32)');
  gradient.addColorStop(1, 'rgba(215, 205, 180, 0.30)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  // Ballast : lit de gravier sous les rails 3D/overlay.
  for (let i = 0; i < 170; i++) {
    const x = (i * 43 + (i % 9) * 17) % 128;
    const y = (i * 61 + (i % 7) * 11) % 128;
    const radius = 1.1 + (i % 4) * 0.55;
    const tone = i % 5;
    ctx.fillStyle = tone === 0 ? 'rgba(235, 230, 212, 0.40)'
      : tone === 1 ? 'rgba(55, 55, 52, 0.24)'
      : tone === 2 ? 'rgba(120, 114, 104, 0.34)'
      : 'rgba(164, 155, 137, 0.34)';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.4, radius, (i % 6) * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let x = -130; x < 260; x += 24) {
    ctx.strokeStyle = 'rgba(74, 70, 64, 0.22)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x + 128, 138);
    ctx.stroke();
  }
}
