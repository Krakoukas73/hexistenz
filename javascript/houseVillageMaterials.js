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


