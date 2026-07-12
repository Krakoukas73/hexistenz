// ─── tileTextureDrawing.js — dessin canvas des textures biomes ──────────────
// Extrait de tileTextures.js le 2026-07-11 (round 3, découpage sans risque, cf.
// CONTEXT.md §21) : toutes les fonctions de dessin pixel-par-pixel (~400 lignes)
// séparées de l'API matériaux (getBiomeMaterial/getBiomeSideMaterial, restées dans
// tileTextures.js). L'état partagé (cache de textures générées, état animé, palette
// active) vit ici avec des accesseurs exportés, car les fonctions qui l'écrivent
// (getGeneratedTexture, etc.) et celles qui le lisent (updateAnimatedBiomeTextures,
// applyBiomeTexturePalette, restées dans tileTextures.js) sont désormais séparées.
// Dépendance à sens unique : tileTextures.js importe depuis ce fichier, jamais
// l'inverse. Aucun importateur externe direct (tileTextures.js reste la seule façade
// publique — scene.js/tileMesh.js/visualEnvironment.js inchangés).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES } from './config.js';
import { shortestHueDelta } from './realisticWater.js';

const generatedTextureCache = new Map();
const animatedTextureState = new Map();
let activeTexturePalette = null;

export function setActiveTexturePalette(palette) {
  activeTexturePalette = palette;
}

export function getAnimatedTextureState(type) {
  return animatedTextureState.get(type);
}

export function getAllAnimatedTextureStates() {
  return animatedTextureState.values();
}

export function getGeneratedTexture(type) {
  if (generatedTextureCache.has(type)) return generatedTextureCache.get(type);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  drawTexture(type, ctx, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);

  generatedTextureCache.set(type, texture);
  animatedTextureState.set(type, { canvas, ctx, texture, type });

  return texture;
}

export function getGeneratedFieldSideTexture() {
  const key = 'field_side_stalks';
  if (generatedTextureCache.has(key)) return generatedTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  drawFieldSideTexture(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  generatedTextureCache.set(key, texture);
  animatedTextureState.set(key, { canvas, ctx, texture, type: EDGE_TYPES.field, side: true });
  return texture;
}

export function drawTexture(type, ctx, timeSeconds = 0) {
  if (type === EDGE_TYPES.water) drawWaterTexture(ctx, timeSeconds);
  else if (type === EDGE_TYPES.field) drawFieldTexture(ctx);
  else if (type === EDGE_TYPES.forest) drawForestTexture(ctx);
  else if (type === EDGE_TYPES.grass) drawGrassTexture(ctx);
  else if (type === EDGE_TYPES.house) drawHouseTexture(ctx);
  else if (type === EDGE_TYPES.rail) drawRailGroundTexture(ctx);

  applyCanvasPalette(type, ctx);
}

export function drawWaterTexture(ctx, timeSeconds = 0) {
  // Ancienne texture eau neutralisée : le rendu visible est maintenant assuré
  // par realisticWater.js. On garde seulement un fond bleu propre comme filet
  // de sécurité si un ancien matériau Canvas est encore instancié.
  ctx.clearRect(0, 0, 128, 128);

  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, '#0a2b46');
  gradient.addColorStop(0.55, '#123f63');
  gradient.addColorStop(1, '#1b6387');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
}

export function drawFieldSideTexture(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, '#f3d56c');
  gradient.addColorStop(0.42, '#c89427');
  gradient.addColorStop(1, '#7a4f18');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  // Flancs de champs : tiges verticales serrées, plus sombres en bas
  // pour donner une vraie tranche de blé au lieu d'un simple mur jaune.
  for (let x = -4; x < 134; x += 5) {
    const sway = ((x * 17) % 7) - 3;
    ctx.strokeStyle = x % 3 === 0 ? 'rgba(255, 238, 129, 0.58)' : 'rgba(98, 62, 16, 0.34)';
    ctx.lineWidth = x % 4 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.bezierCurveTo(x + sway, 92, x - sway * 0.4, 48, x + sway * 0.7, 2);
    ctx.stroke();
  }

  for (let x = 2; x < 128; x += 11) {
    ctx.fillStyle = 'rgba(255, 232, 112, 0.48)';
    ctx.beginPath();
    ctx.ellipse(x + ((x * 13) % 5) - 2, 18 + ((x * 7) % 16), 2.2, 7.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(76, 45, 12, 0.22)';
  ctx.fillRect(0, 104, 128, 24);

  applyCanvasPalette(EDGE_TYPES.field, ctx);
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
  ctx.fillStyle = '#3a8a40';  // éclairci pour ACESFilmicToneMapping (shadow toe)
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
  // Sol village : brun/gris terre battue + gravier. Zéro rouge brique.
  ctx.fillStyle = '#8b8069';
  ctx.fillRect(0, 0, 128, 128);

  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, '#b8ad90');
  gradient.addColorStop(0.48, '#706653');
  gradient.addColorStop(1, '#a99d80');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  // Plaques de terre sèche.
  for (let i = 0; i < 48; i++) {
    const x = (i * 47 + (i % 5) * 19) % 128;
    const y = (i * 71 + (i % 7) * 13) % 128;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(72, 65, 52, 0.28)' : 'rgba(207, 199, 165, 0.24)';
    ctx.beginPath();
    ctx.ellipse(x, y, 12 + (i % 5) * 3, 4 + (i % 4) * 2, (i % 8) * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Traces de roues / ornières.
  ctx.lineCap = 'round';
  for (let k = -1; k <= 3; k++) {
    ctx.strokeStyle = 'rgba(47, 43, 35, 0.34)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-18, 17 + k * 38);
    ctx.bezierCurveTo(22, 7 + k * 38, 58, 35 + k * 38, 146, 16 + k * 38);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(224, 216, 183, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-18, 25 + k * 38);
    ctx.bezierCurveTo(22, 15 + k * 38, 58, 42 + k * 38, 146, 23 + k * 38);
    ctx.stroke();
  }

  // Sillons fins de terre battue.
  for (let y = -12; y < 150; y += 16) {
    ctx.strokeStyle = 'rgba(63, 57, 45, 0.16)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-8, y);
    ctx.bezierCurveTo(32, y + 8, 72, y - 6, 136, y + 5);
    ctx.stroke();
  }

  // Gravier dense et visible.
  for (let i = 0; i < 390; i++) {
    const x = (i * 37 + (i % 11) * 17) % 128;
    const y = (i * 59 + (i % 13) * 9) % 128;
    const r = 0.75 + (i % 4) * 0.35;
    const tone = i % 6;
    ctx.fillStyle =
      tone === 0 ? 'rgba(240, 234, 205, 0.70)' :
      tone === 1 ? 'rgba(42, 41, 36, 0.42)' :
      tone === 2 ? 'rgba(134, 128, 108, 0.56)' :
      tone === 3 ? 'rgba(94, 85, 67, 0.48)' :
      tone === 4 ? 'rgba(188, 179, 145, 0.52)' :
                   'rgba(112, 106, 90, 0.42)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.55, r, (i % 7) * 0.37, 0, Math.PI * 2);
    ctx.fill();
  }

  // Quelques herbes pauvres.
  for (let i = 0; i < 26; i++) {
    const x = (i * 53) % 128;
    const y = (i * 47) % 128;
    ctx.fillStyle = 'rgba(72, 100, 58, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, 3.8 + (i % 3), 1.8 + (i % 2), (i % 9) * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRailGroundTexture(ctx) {
  // Base : gris ballast (granit concassé)
  ctx.fillStyle = '#6e7275';
  ctx.fillRect(0, 0, 128, 128);

  const gradient = ctx.createLinearGradient(0, 0, 128, 128);
  gradient.addColorStop(0, 'rgba(190, 194, 198, 0.38)');
  gradient.addColorStop(0.5, 'rgba(80, 84, 88, 0.28)');
  gradient.addColorStop(1, 'rgba(160, 165, 170, 0.30)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  // Ballast : graviers gris variés (granit, calcaire, ardoise)
  for (let i = 0; i < 200; i++) {
    const x = (i * 43 + (i % 9) * 17) % 128;
    const y = (i * 61 + (i % 7) * 11) % 128;
    const radius = 1.0 + (i % 4) * 0.55;
    const tone = i % 6;
    ctx.fillStyle = tone === 0 ? 'rgba(210, 215, 218, 0.45)'  // clair
      : tone === 1 ? 'rgba(45, 48, 52, 0.30)'                 // sombre
      : tone === 2 ? 'rgba(100, 105, 110, 0.40)'              // moyen
      : tone === 3 ? 'rgba(140, 145, 150, 0.38)'              // gris clair
      : tone === 4 ? 'rgba(75, 80, 85, 0.35)'                 // gris foncé
      : 'rgba(175, 180, 182, 0.32)';                          // gris pâle
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.4, radius, (i % 6) * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  // Légères stries diagonales (ombres entre les rails)
  for (let x = -130; x < 260; x += 24) {
    ctx.strokeStyle = 'rgba(50, 53, 56, 0.18)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x + 128, 138);
    ctx.stroke();
  }
}

export function applyCanvasPalette(type, ctx) {
  const palette = activeTexturePalette;
  const targetHex = palette?.targets?.[type];
  const rawStrength = Math.min(1, Math.max(0, Number(palette?.strength ?? 0)));

  if (!targetHex || rawStrength <= 0) return;

  // La palette doit recolorer la texture elle-même, pas seulement teinter mollement
  // quelques interstices. On garde la luminance et le contraste local pour préserver
  // les détails lowpoly, mais la teinte cible devient dominante dès les valeurs moyennes.
  const strength = Math.min(1, 0.12 + rawStrength * 2.35);
  const target = new THREE.Color(targetHex);
  const targetHsl = {};
  target.getHSL(targetHsl);
  const image = ctx.getImageData(0, 0, 128, 128);
  const data = image.data;
  const saturation = Number(palette.saturation ?? 1);
  const contrast = Number(palette.contrast ?? 1);
  const warmShift = Number(palette.warmShift ?? 0);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    const source = new THREE.Color(r, g, b);
    const sourceHsl = {};
    source.getHSL(sourceHsl);

    const hueDelta = shortestHueDelta(sourceHsl.h, targetHsl.h);
    const h = (sourceHsl.h + hueDelta * strength + 1) % 1;
    const s = Math.min(1, Math.max(0, sourceHsl.s + (Math.max(sourceHsl.s, targetHsl.s) - sourceHsl.s) * strength));
    const l = Math.min(1, Math.max(0, sourceHsl.l + (targetHsl.l - sourceHsl.l) * strength * 0.42));

    source.setHSL(h, s, l);
    r = source.r;
    g = source.g;
    b = source.b;

    // Deuxième passe RGB légère : elle force la famille chromatique demandée
    // tout en évitant un aplat monochrome immonde façon Paint 95.
    const rgbForce = strength * 0.34;
    r = r + (target.r - r) * rgbForce;
    g = g + (target.g - g) * rgbForce;
    b = b + (target.b - b) * rgbForce;

    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = luma + (r - luma) * saturation;
    g = luma + (g - luma) * saturation;
    b = luma + (b - luma) * saturation;

    r = (r - 0.5) * contrast + 0.5 + warmShift * 0.32;
    g = (g - 0.5) * contrast + 0.5 + warmShift * 0.08;
    b = (b - 0.5) * contrast + 0.5 - warmShift * 0.28;

    data[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
  }

  ctx.putImageData(image, 0, 0);
}
