import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_COLOR, EDGE_TYPES } from './config.js';

const materialCache = new Map();
const generatedTextureCache = new Map();
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

  drawTexture(type, ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);

  generatedTextureCache.set(type, texture);
  return texture;
}

function drawTexture(type, ctx) {
  if (type === EDGE_TYPES.water) drawWaterTexture(ctx);
  else if (type === EDGE_TYPES.field) drawFieldTexture(ctx);
  else if (type === EDGE_TYPES.forest) drawForestTexture(ctx);
  else if (type === EDGE_TYPES.grass) drawGrassTexture(ctx);
  else if (type === EDGE_TYPES.house) drawHouseTexture(ctx);
}

function drawWaterTexture(ctx) {
  ctx.fillStyle = '#2f6fa3';
  ctx.fillRect(0, 0, 128, 128);

  for (let y = 0; y < 128; y += 16) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();

    for (let x = -16; x <= 144; x += 8) {
      ctx.lineTo(x, y + Math.sin((x + y) * 0.08) * 4);
    }

    ctx.stroke();
  }

  for (let i = 0; i < 40; i++) {
    const x = (i * 47) % 128;
    const y = (i * 29) % 128;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(x, y, (i % 3) + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFieldTexture(ctx) {
  ctx.fillStyle = '#d9b94e';
  ctx.fillRect(0, 0, 128, 128);

  for (let x = -128; x < 256; x += 16) {
    ctx.strokeStyle = 'rgba(255, 245, 170, 0.52)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.lineTo(x + 128, 136);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(125, 92, 25, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, -8);
    ctx.lineTo(x + 136, 136);
    ctx.stroke();
  }
}

function drawForestTexture(ctx) {
  ctx.fillStyle = '#23652b';
  ctx.fillRect(0, 0, 128, 128);

  const trees = [
    [14, 18], [40, 10], [70, 22], [102, 14],
    [24, 50], [56, 42], [92, 54], [120, 42],
    [10, 86], [44, 84], [76, 94], [108, 82],
    [30, 118], [64, 116], [98, 120]
  ];

  for (const [x, y] of trees) {
    ctx.fillStyle = 'rgba(16, 54, 20, 0.28)';
    ctx.beginPath();
    ctx.arc(x + 3, y + 4, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#164d22';
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x - 11, y + 10);
    ctx.lineTo(x + 11, y + 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2f8a3a';
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x - 8, y + 6);
    ctx.lineTo(x + 8, y + 6);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGrassTexture(ctx) {
  ctx.fillStyle = '#2ebf62';
  ctx.fillRect(0, 0, 128, 128);

  for (let y = 8; y < 128; y += 16) {
    for (let x = 6; x < 128; x += 18) {
      const ox = ((x * 13 + y * 7) % 9) - 4;
      ctx.strokeStyle = 'rgba(190, 255, 195, 0.34)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + ox, y + 5);
      ctx.lineTo(x + ox + 3, y - 5);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(15, 105, 45, 0.24)';
      ctx.beginPath();
      ctx.moveTo(x + ox + 5, y + 5);
      ctx.lineTo(x + ox + 1, y - 3);
      ctx.stroke();
    }
  }
}

function drawHouseTexture(ctx) {
  ctx.fillStyle = '#b94141';
  ctx.fillRect(0, 0, 128, 128);

  const houses = [
    [18, 24], [54, 16], [92, 30],
    [34, 64], [78, 70], [114, 58],
    [18, 104], [58, 110], [100, 100]
  ];

  for (const [x, y] of houses) {
    ctx.fillStyle = 'rgba(65, 20, 18, 0.24)';
    ctx.fillRect(x - 9, y - 1, 20, 16);

    ctx.fillStyle = '#f1c56f';
    ctx.fillRect(x - 8, y, 16, 14);

    ctx.fillStyle = '#5e2731';
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x, y - 10);
    ctx.lineTo(x + 10, y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(80, 45, 25, 0.55)';
    ctx.fillRect(x - 2, y + 5, 4, 9);
  }
}
