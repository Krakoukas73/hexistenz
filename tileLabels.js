import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_TYPES, TILE_VISUAL } from './config.js';
import { TEXT_LAYER } from './stable/threeSetup.js';
import { getEdgeType, getEdgeValue } from './tileGenerator.js';
import { HEX_FONT_FAMILY, sharedLabelCache, hexFontReady } from './stable/hexLabelFont.js';

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
  sprite.scale.set(0.50, 0.43, 1);
  sprite.userData.hoverLiftOffset = TILE_VISUAL.valueLabelHoverLift ?? 0.07;
  sprite.userData.worldCurvatureFlatY = sprite.position.y;
  return sprite;
}

export function getMiniValueLabel(edge) {
  const value = getEdgeValue(edge);
  return (value != null && value > 1) ? `<span class="mini-value">${value}</span>` : '';
}

// Hexagone paysage centré sur (cx,cy), demi-largeur w2, demi-hauteur h2, encoche = notch.
function hexPath(ctx, cx, cy, w2, h2, notch) {
  ctx.beginPath();
  ctx.moveTo(cx - w2 + notch, cy - h2);
  ctx.lineTo(cx + w2 - notch, cy - h2);
  ctx.lineTo(cx + w2, cy);
  ctx.lineTo(cx + w2 - notch, cy + h2);
  ctx.lineTo(cx - w2 + notch, cy + h2);
  ctx.lineTo(cx - w2, cy);
  ctx.closePath();
}

function getTextSpriteMaterial(text) {
  if (sharedLabelCache.has(text)) return sharedLabelCache.get(text);

  // Résolution doublée (256×222) pour netteté sur écrans HD.
  // Ratio 256/222 ≈ 1.153 ≈ 2/√3 : hexagone régulier à sommet plat.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 222;

  function draw() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fond hexagonal : w2=120, h2=120×0.866=104, notch=60
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    hexPath(ctx, 128, 111, 120, 104, 60);
    ctx.fill();

    ctx.font = `bold 64px ${HEX_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 113);
  }

  draw();

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  sharedLabelCache.set(text, material);

  // Redessiner après chargement de HexgonBold (corrige la race condition au 1er frame)
  hexFontReady?.then?.(() => {
    draw();
    texture.needsUpdate = true;
  });

  return material;
}

function shouldShowValue(_type, _value) {
  // Labels solo (hexagones gris sans zone contigüe) masqués — trop de bruit visuel.
  // Les zones contigüe sont affichées via waterZoneOverlay.js.
  return false;
}
