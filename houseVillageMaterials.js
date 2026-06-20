import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/**
 * Système de matériaux partagés pour les bâtiments du biome maison.
 * Toutes les textures SVG (murs, toits, gravier) et matériaux plats sont
 * créés ici et mis en cache sous une clé chaîne pour éviter les doublons.
 * Ce module n'a pas de dépendance circulaire : il n'importe rien de la
 * logique overlay ou BFS.
 */

const houseMaterialCache = new Map();

// ─── Couleurs utilitaires ─────────────────────────────────────────────────────

function hexColor(color) {
  return `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`;
}

function shiftHexColor(color, amount) {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (color & 255) + amount));
  return hexColor((r << 16) | (g << 8) | b);
}

// ─── Matériau plat (couleur unie, mis en cache) ───────────────────────────────

export function getHouseMaterial(key, color) {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

// ─── Matériau gravier SVG ────────────────────────────────────────────────────

export function getGravelSvgMaterial(key, color) {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const base = hexColor(color);
  const dark = shiftHexColor(color, -42);
  const light = shiftHexColor(color, 38);
  const svg = createGravelSvg(base, dark, light);
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.6, 3.2);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

function createGravelSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <circle cx="10" cy="14" r="3.2" fill="${light}" opacity=".72"/>
    <circle cx="28" cy="8" r="2.4" fill="${dark}" opacity=".62"/>
    <circle cx="44" cy="20" r="3.8" fill="${light}" opacity=".54"/>
    <circle cx="70" cy="12" r="2.8" fill="${dark}" opacity=".66"/>
    <circle cx="88" cy="26" r="3.2" fill="${light}" opacity=".48"/>
    <circle cx="16" cy="38" r="4.2" fill="${dark}" opacity=".45"/>
    <circle cx="38" cy="42" r="2.6" fill="${light}" opacity=".62"/>
    <circle cx="60" cy="36" r="3.4" fill="${dark}" opacity=".58"/>
    <circle cx="82" cy="50" r="2.4" fill="${light}" opacity=".58"/>
    <circle cx="8" cy="70" r="2.8" fill="${dark}" opacity=".66"/>
    <circle cx="30" cy="66" r="3.6" fill="${light}" opacity=".52"/>
    <circle cx="52" cy="76" r="4.0" fill="${dark}" opacity=".46"/>
    <circle cx="76" cy="72" r="3.0" fill="${light}" opacity=".60"/>
    <circle cx="92" cy="88" r="2.5" fill="${dark}" opacity=".62"/>
    <path d="M0 31H96M0 63H96" stroke="${dark}" stroke-width="1.2" opacity=".18"/>
  </svg>`;
}


// ─── Matériau mur SVG ─────────────────────────────────────────────────────────

export function getWallSvgMaterial(key, color, style = 'plaster') {
  if (houseMaterialCache.has(key)) return houseMaterialCache.get(key);

  const base = hexColor(color);
  const dark = shiftHexColor(color, style === 'stoneDark' ? -34 : -42);
  const light = shiftHexColor(color, style === 'plaster' ? 48 : 32);
  const svg = style === 'plaster'
    ? createPlasterWallSvg(base, dark, light)
    : createStoneWallSvg(base, dark, light, style === 'stoneDark');
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(style === 'plaster' ? 2.2 : 2.8, style === 'plaster' ? 1.8 : 2.4);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide
  });

  houseMaterialCache.set(key, material);
  return material;
}

function createPlasterWallSvg(base, dark, light) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 18C14 12 26 25 42 17S70 11 96 20M0 52C16 45 28 58 44 49S74 45 96 54M0 80C19 73 31 86 48 78S78 72 96 82" stroke="${dark}" stroke-width="2.6" opacity=".28" fill="none"/>
    <path d="M8 10h18M46 12h12M70 30h20M10 38h16M40 70h22M68 88h18" stroke="${light}" stroke-width="2.0" opacity=".42"/>
    <circle cx="20" cy="66" r="2.4" fill="${dark}" opacity=".20"/>
    <circle cx="54" cy="34" r="2.0" fill="${light}" opacity=".36"/>
    <circle cx="82" cy="62" r="2.8" fill="${dark}" opacity=".18"/>
  </svg>`;
}

function createStoneWallSvg(base, dark, light, darker = false) {
  const jointOpacity = darker ? '.42' : '.34';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${base}"/>
    <path d="M0 18H96M0 38H96M0 58H96M0 78H96" stroke="${dark}" stroke-width="2.2" opacity="${jointOpacity}"/>
    <path d="M18 0V18M52 0V18M82 0V18M0 18V38M32 18V38M66 18V38M16 38V58M50 38V58M84 38V58M0 58V78M34 58V78M68 58V78M18 78V96M52 78V96M86 78V96" stroke="${dark}" stroke-width="2.0" opacity="${jointOpacity}"/>
    <path d="M7 11h18M40 28h16M68 50h20M10 70h22M48 88h18" stroke="${light}" stroke-width="1.6" opacity=".34"/>
    <path d="M26 8h10M56 47h12M72 86h8" stroke="${dark}" stroke-width="1.4" opacity=".28"/>
  </svg>`;
}
