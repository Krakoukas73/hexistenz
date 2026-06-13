import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, TILE_VISUAL } from './config.js';
import { TEXT_LAYER } from './threeSetup.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';

const textTextureCache = new Map();

export function createValueLabel(edge, vertexA, vertexB) {
  const type = getEdgeType(edge);
  const value = getEdgeValue(edge);

  if (!shouldShowValue(type, value)) return null;

  const sprite = new THREE.Sprite(getTextSpriteMaterial(String(value)));
  sprite.layers.set(TEXT_LAYER);

  // Même triangle, même source de vérité : le label est placé au centroïde
  // du secteur qui a servi à dessiner la texture. Impossible de dériver
  // vers le voisin par un calcul d'angle séparé.
  sprite.position.set(
    (vertexA.x + vertexB.x) / 3,
    TILE_VISUAL.labelY ?? 0.07,
    (vertexA.z + vertexB.z) / 3
  );
  sprite.scale.set(0.56, 0.32, 1);
  sprite.userData.hoverLiftOffset = TILE_VISUAL.valueLabelHoverLift ?? 0.07;
  return sprite;
}

export function getMiniValueLabel(edge) {
  const type = getEdgeType(edge);
  const value = getEdgeValue(edge);
  return shouldShowValue(type, value) ? `<span class="mini-value">${value}</span>` : '';
}

function getTextSpriteMaterial(text) {
  if (textTextureCache.has(text)) return textTextureCache.get(text);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.roundRect(18, 10, 92, 44, 14);
  ctx.fill();
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 64, 33);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  textTextureCache.set(text, material);
  return material;
}

function shouldShowValue(type, value) {
  return value > 1 && (type === EDGE_TYPES.field || type === EDGE_TYPES.forest || type === EDGE_TYPES.house);
}
