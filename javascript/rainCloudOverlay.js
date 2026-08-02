/**
 * rainCloudOverlay.js — Nuages « cute » (façon Animal Crossing) + pluie qui tombe
 * réellement depuis ces nuages. Réécriture complète 2026-07-11 (repart de zéro).
 *
 * Distinct de cloudSky.js (nuages d'horizon purement décoratifs, mode jour).
 *
 * ── Direction artistique NUAGES ─────────────────────────────────────────────
 * Cible : cumulus doux et bombés type Nintendo/Animal Crossing — PAS des boules
 * low-poly facettées (le défaut de la version précédente venait du flat-shading
 * dFdx + d'une silhouette « tas de billes »). Ici :
 *   • vraies sphères LISSES (normales douces, subdivision suffisante) ;
 *   • forme générée PROCÉDURALEMENT par nuage (_buildCloudPuffs) : 14–20 lobes qui se
 *     chevauchent, positions/tailles tirées au hash → chaque nuage unique et « chou-fleur »
 *     billowy (fluffy), aplati (plus large que haut) avec un peu de profondeur en Z ;
 *   • ombrage tout en dégradés (sommet blanc → dessous bleuté) + rim-light doux sur les
 *     silhouettes (aspect coton), jamais de facettes ;
 *   • FIXES dans le monde quand on orbite la caméra (géométrie 3D réelle, pas des
 *     billboards — cf. retour utilisateur 2026-07-10), rendus en 1 InstancedMesh.
 *
 * Placement : uniquement au-dessus des hexagones posés (placedTiles), chaque tuile
 * a une chance déterministe (hashUtils, comme forestOverlay/houseOverlay) de porter
 * un nuage → même couverture pour tous les joueurs d'une room. densité de nuages =
 * nombre d'ancrages = nombre de sources de pluie.
 *
 * ── Pluie ───────────────────────────────────────────────────────────────────
 * Chaque goutte naît sous l'empreinte XZ d'un nuage réel (pas dans une grande boîte
 * englobante → pas de « pluie qui tombe de nulle part » entre les nuages). Streaks
 * bleutés doux (cute, pas des lances), orientés en billboard cylindrique (verticaux
 * dans le monde, tournés vers la caméra autour de l'axe Y → jamais backface-cullés),
 * chute animée côté GPU. Le mesh de pluie est enfant du même group que les nuages →
 * il hérite de la dérive au vent (aucune désynchro possible).
 *
 * ── Réglages (vfxSettings.js) ───────────────────────────────────────────────
 *   clouds.densite   — 0..1, proportion de tuiles portant un nuage (⇒ densité pluie)
 *   clouds.altitude  — hauteur des nuages = hauteur d'où part la pluie
 *   clouds.epaisseur — taille/boursouflure d'un nuage
 *   rain.densite     — 0..1, proportion de gouttes actives par nuage
 *   rain.tailleGoutte— largeur/longueur des streaks
 *   storm.intensitePluie — multiplicateur de densité pluie pendant l'orage
 *
 * ── Visibilité ──────────────────────────────────────────────────────────────
 *   Nuages : switch EDA « Nuages de pluie » (isVfxGroupExpanded('clouds')).
 *   Pluie  : évènement 'rain'/'storm' actif ET nuages activés (pas de nuages, pas
 *            de pluie). Activer « Pluie » force « Nuages » (cf. hud_eda.js).
 *
 * Intégration dans scene.js :
 *   const rainCloudOverlay = createRainCloudOverlay(scene);
 *   rebuildRainCloudOverlay(rainCloudOverlay, placedTiles);   // sur changement de plateau
 *   updateRainCloudOverlay(rainCloudOverlay, environmentDirector, timeSeconds, deltaSeconds);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { MarchingCubes } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/MarchingCubes.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';
import { isEnvironmentEventActive } from './environmentDirector.js';
import { getVfxSettings, onVfxSettingsChange, isVfxGroupExpanded } from './vfxSettings.js';
import { axialToWorld, makeHexKey } from './hex.js';
import { HEX_SIZE } from './variables.js';
import { EDGE_TYPES } from './config.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { hashUnitFull } from './hashUtils.js';
import { getGlobalWindUniforms } from './globalWind.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from './worldCurvature.js';

// Noms de meshes lus par sceneProfiler.js (_classifyInstanced) — NE PAS changer :
//   'hexistenz-vfx-rain'                 → catégorie « Pluie »
//   startsWith('hexistenz-vfx-rain-clouds') → catégorie « Nuages de pluie »
const OVERLAY_NAME = 'hexistenz-vfx-rain-clouds';
const CLOUD_MESH_NAME = 'hexistenz-vfx-rain-clouds-mesh';
const CANOPY_MESH_NAME = 'hexistenz-vfx-rain-clouds-canopy'; // chape d'orage (sceneProfiler : 'Nuages de pluie')
const RAIN_MESH_NAME = 'hexistenz-vfx-rain';

// ── Chape d'orage (2026-07-12) : UN seul grand mesh plat et bosselé qui recouvre tout le
//    plateau pendant l'orage (remplace les cumulus épars, crossfade géré dans update). Bruit en
//    espace MONDE (lumps ancrés au monde, pas à l'écran), sombre et menaçant, double-face.
//    Étendue = boîte du plateau + marge. Choix assumé : elle PEUT masquer le plateau vu de haut.
const CANOPY_SEGMENTS = 72;        // subdivisions du plan (lumps lisses)
const CANOPY_MARGIN = 20;          // débord (unités monde) au-delà de la boîte du plateau
const CANOPY_AMPLITUDE = 1.7;      // profondeur des bosses (assez plat vs largeur → une « chape »)
// Texture de couverture (2026-07-30) : donne à la chape la silhouette du plateau posé au lieu
// d'un rectangle. 128² suffit — elle n'est jamais vue de près et le fondu la lisse de toute
// façon. Rayons en unités monde autour de chaque tuile : plein jusqu'à CORE, puis dégradé
// jusqu'à FEATHER (débord volontairement généreux → la chape déborde en s'estompant, elle ne
// s'arrête pas net au bord du plateau).
const CANOPY_COV_TEX = 128;
const CANOPY_COV_CORE = HEX_SIZE * 1.6;
const CANOPY_COV_FEATHER = HEX_SIZE * 6.5;

/** Texture 1×1 opaque — couverture par défaut avant le premier rebuild (chape pleine). */
function _makeFullCoverageTexture() {
  const t = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
  t.needsUpdate = true;
  return t;
}

// Fondus. Entrée douce (apparition progressive), sortie quasi instantanée : couper
// un switch stoppe l'effet tout de suite (retour utilisateur 2026-07-09).
const FADE_IN = 3.0;
const FADE_OUT = 0.25;
const RAIN_FADE_IN = 1.2;
const RAIN_FADE_OUT = 0.25;

const MAX_CLOUDS = 32;            // plafond d'ancrages (perf)
const SWAY_AMPLITUDE = 1.2;       // amplitude de la dérive au vent (group.position)

// ── Nuages « chou-fleur » — metaballs (isosurface marching-cubes précalculée) ────────────────
// Chaque nuage = un tas de lobes (metaballs) FUSIONNÉS en UNE surface organique lisse et
// bosselée (bosses qui ressortent + creux concaves) → le vrai look cumulus de la réf, impossible
// à obtenir avec des sphères discrètes (contours nets). Le maillage isosurface est calculé UNE
// fois par nuage (marching cubes) et mis en CACHE par seed → coût uniquement au build, pas au
// rendu (un simple mesh opaque à dessiner). Forme unique par nuage (nombre/positions au hash).
const MAX_PUFFS_PER_CLOUD = 48;

const MC_RES = 48;          // résolution du champ (qualité/coût du maillage)
const MC_ISO = 80;          // seuil d'isosurface (défaut MarchingCubes)
const MC_SUBTRACT = 18;     // décroissance plus RAIDE des metaballs → bosses plus distinctes (chou-fleur), moins « blob »
const FIELD_E = 2.6;        // demi-étendue (unités gabarit) couverte par le champ [0,1] (marge incluse)
let _mcGen = null;                     // instance MarchingCubes réutilisée (générateur)
const _cloudGeomCache = new Map();     // seed -> BufferGeometry locale (unités gabarit, centrée)

// Lobes (metaballs) d'un nuage, déterministes depuis le seed. Beaucoup de petits/moyens lobes,
// tassés, plus larges que hauts, un peu de profondeur en Z → masse dense bosselée.
function _buildCloudPuffs(seed) {
  const h = (s) => hashUnitFull(seed + s);
  const count = 34 + Math.floor(h(':n') * (MAX_PUFFS_PER_CLOUD - 34 + 1)); // 34..48
  const wide = 0.95 + h(':wide') * 0.5;
  const deep = 0.5 + h(':deep') * 0.32;
  const tall = 0.55 + h(':tall') * 0.35;
  const puffs = [];
  for (let i = 0; i < count; i += 1) {
    const a = h(':a' + i) * 6.28318530718;
    const rr = Math.pow(h(':r' + i), 0.5);
    const px = Math.cos(a) * rr * wide;
    const pz = Math.sin(a) * rr * deep;
    const hb = h(':h' + i);
    const py = hb * hb * tall * (1.0 - rr * 0.30);
    const r = (0.26 + (1.0 - rr) * 0.20) * (0.85 + h(':s' + i) * 0.50);
    puffs.push({ x: px, y: py, z: pz, r });
  }
  return puffs;
}

// Extrait de mc.geometry les mc.count premiers sommets (position + normale), remis à l'échelle du
// gabarit (× FIELD_E car la sortie est en [-1,1] ↔ champ [0,1] ↔ gabarit [-E,E]). Y ajoute un
// attribut `aoShade` (0..1) baké depuis la hauteur locale : bas = sombre, haut = clair → creux et
// dessous ombrés façon cumulus.
function _cloudLocalGeometry(seed) {
  const cached = _cloudGeomCache.get(seed);
  if (cached) return cached;

  const puffs = _buildCloudPuffs(seed);
  if (!_mcGen) _mcGen = new MarchingCubes(MC_RES, new THREE.MeshBasicMaterial(), true, false, 300000);
  const mc = _mcGen;
  mc.isolation = MC_ISO;
  mc.reset();
  const inv = 1 / (2 * FIELD_E);
  for (const p of puffs) {
    const fx = p.x * inv + 0.5, fy = p.y * inv + 0.5, fz = p.z * inv + 0.5;
    // rayon monde du lobe r → force du metaball (calibré empiriquement pour un rayon d'isosurface ≈ r).
    const strength = 1.15 * p.r * p.r + 0.22 * p.r;
    mc.addBall(fx, fy, fz, strength, MC_SUBTRACT);
  }
  mc.update();

  const n = mc.count;
  const srcP = mc.geometry.attributes.position.array;
  const srcN = mc.geometry.attributes.normal.array;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n * 3; i += 1) pos[i] = srcP[i] * FIELD_E;   // [-1,1] → unités gabarit
  for (let i = 0; i < n * 3; i += 1) nor[i] = srcN[i];             // direction (normalisée au shader)
  for (let v = 0; v < n; v += 1) { const y = pos[v * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }

  const ao = new Float32Array(n);
  const span = Math.max(0.001, maxY - minY);
  for (let v = 0; v < n; v += 1) {
    const t = (pos[v * 3 + 1] - minY) / span;      // 0 bas → 1 haut
    ao[v] = 0.5 + 0.5 * (t * t * (3 - 2 * t));      // smoothstep : dessous nettement plus sombre
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geom.setAttribute('aoShade', new THREE.BufferAttribute(ao, 1));
  _cloudGeomCache.set(seed, geom);
  return geom;
}

// ── Pluie ──
const MAX_DROPS_PER_ANCHOR = 600;                       // gouttes allouées par nuage (densité vive via uActiveRatio).
                                                        // Généreux : la densité MAX du slider = pluie battante (l'ancien « max »
                                                        // ~300 est désormais le milieu du curseur). Streaks fins/translucides → fill faible.
const RAIN_POOL = MAX_CLOUDS * MAX_DROPS_PER_ANCHOR;
const TERMINAL_FALL_SPEED = 5.0;                        // unités monde/s (vitesse terminale simulée)

// ── Impacts au sol (taches sombres « mouillé » qui apparaissent puis s'estompent) ──
const SPLATS_PER_ANCHOR = 90;
const SPLAT_POOL = MAX_CLOUDS * SPLATS_PER_ANCHOR;
const SPLAT_PERIOD = 3.6;                               // s — durée d'un cycle de tache (impact → fade → repos)
const SPLAT_MESH_NAME = 'hexistenz-vfx-rain-impact';

// ─── Shaders NUAGES ─────────────────────────────────────────────────────────
// Rendu d'un vrai MESH isosurface (metaballs marching-cubes) — surface organique lisse et
// bosselée. Normale douce (gradient du champ) + AO baké vertical (attribut aoShade) → creux et
// dessous ombrés façon cumulus. Le maillage porte déjà les positions MONDE (ancrage baké) ;
// modelMatrix = dérive au vent du group ; la courbure du monde est appliquée au vertex.
const CLOUD_VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  attribute float aoShade;
  uniform float uStormInflate;   // orage : gonfle chaque nuage autour de son centre (nuages plus GROS)
  varying float vAo;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  void main() {
    vAo = aoShade;
    vNormalW = normalize(mat3(modelMatrix) * normal);   // translation/échelle uniforme → direction conservée
    // Inflation en espace local (autour du centre du nuage) → les nuages grossissent sur place,
    // sans dériver ni changer d'altitude. 1.0 = normal, >1 = orage menaçant.
    vec4 worldPosition = modelMatrix * vec4(position * uStormInflate, 1.0);
    worldPosition = dorfromantikApplyWorldCurvature(worldPosition);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uTopColor;      // sommet lumineux
  uniform vec3 uUnderColor;    // dessous/creux bleuté
  uniform vec3 uStormColor;
  uniform float uStormMix;
  varying float vAo;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;

  float _vhash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float _vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n000 = _vhash(i), n100 = _vhash(i + vec3(1,0,0));
    float n010 = _vhash(i + vec3(0,1,0)), n110 = _vhash(i + vec3(1,1,0));
    float n001 = _vhash(i + vec3(0,0,1)), n101 = _vhash(i + vec3(1,0,1));
    float n011 = _vhash(i + vec3(0,1,1)), n111 = _vhash(i + vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
  }

  void main() {
    vec3 nrm = normalize(vNormalW);

    // Ombrage cumulus : sommets des bosses BLANC lumineux, flancs/creux BLEUTÉS (via la normale de
    // la surface bosselée) — c'est la géométrie metaball qui crée le relief chou-fleur.
    float up = clamp(nrm.y * 0.5 + 0.5, 0.0, 1.0);
    float grad = smoothstep(0.38, 0.96, up);   // flancs des bosses nettement plus sombres → relief chou-fleur
    vec3 base = mix(uUnderColor, uTopColor, grad);

    // AO baké (dessous/creux plus sombres) → profondeur, comme la réf.
    base *= mix(0.46, 1.0, vAo);

    // Marbrure cotonneuse subtile (texture de surface).
    float n = _vnoise(vWorldPos * 3.0) * 0.6 + _vnoise(vWorldPos * 6.5) * 0.4;
    base *= mix(0.92, 1.05, n);

    // Orage : assombrit fortement en CONSERVANT le relief. uStormColor agit comme un facteur
    // d'assombrissement teinté ardoise (multiplication), au lieu d'un aplat gris uniforme qui
    // gommait les bosses → nuages sombres, denses et menaçants, mais toujours bombés.
    vec3 stormy = base * (uStormColor * 2.0);   // ×2 : uStormColor centré sur ~0.5 = neutre
    vec3 color = mix(base, stormy, uStormMix);
    gl_FragColor = vec4(color, uOpacity);
  }
`;

// ─── Shaders CHAPE D'ORAGE ──────────────────────────────────────────────────
// Bruit valeur 2D + fbm partagés (déplacement des lumps + turbulence d'ombrage), en espace monde.
const CANOPY_NOISE_GLSL = /* glsl */ `
  float _ch(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float _cnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(_ch(i), _ch(i+vec2(1,0)), f.x),
               mix(_ch(i+vec2(0,1)), _ch(i+vec2(1,1)), f.x), f.y);
  }
  float _cfbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ v += a * _cnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

const CANOPY_VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  ${CANOPY_NOISE_GLSL}
  uniform float uTime;
  uniform float uAmplitude;
  varying vec3 vWorldPos;
  varying float vLump;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Lumps qui roulent lentement (dérive du champ de bruit dans le temps), ancrés au monde.
    float f = _cfbm(wp.xz * 0.05 + vec2(uTime * 0.012, uTime * 0.008));
    vLump = f;
    wp.y -= (f - 0.5) * 2.0 * uAmplitude;   // bosses au-dessus/en dessous du plan → volume nuageux
    wp = dorfromantikApplyWorldCurvature(wp);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const CANOPY_FRAGMENT_SHADER = /* glsl */ `
  ${CANOPY_NOISE_GLSL}
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform sampler2D uCoverage;      // couverture du plateau, cf. _buildCanopyCoverage
  uniform vec2 uCoverageOrigin;     // coin (minX, minZ) monde de la texture
  uniform vec2 uCoverageSize;       // étendue monde (w, d) de la texture
  varying vec3 vWorldPos;
  varying float vLump;
  void main() {
    // Turbulence sombre (deux échelles) → masse roulante menaçante, pas un aplat.
    float n = _cfbm(vWorldPos.xz * 0.11 + vec2(uTime * 0.02, -uTime * 0.015));
    float shade = mix(0.5, 1.12, n);        // creux sombres, crêtes un peu plus claires
    shade *= mix(0.82, 1.08, vLump);        // bosses hautes légèrement éclaircies (relief)

    // Silhouette « patatoïde » épousant la forme du plateau posé, bords fondus vers le
    // transparent (2026-07-30, retour Cyril : la chape était un rectangle net). La couverture
    // est pré-calculée sur CPU à chaque rebuild (empreinte des tuiles + dégradé), on ne fait
    // ici qu'un échantillonnage. Le bord est encore brouillé par le bruit pour éviter une
    // frontière trop régulière (contour organique, cohérent avec le reste des VFX).
    vec2 cuv = (vWorldPos.xz - uCoverageOrigin) / uCoverageSize;
    float cov = texture2D(uCoverage, cuv).r;
    float edgeNoise = _cfbm(vWorldPos.xz * 0.24 + vec2(uTime * 0.01, uTime * 0.013));
    cov = clamp(cov + (edgeNoise - 0.5) * 0.22, 0.0, 1.0);
    cov = smoothstep(0.06, 0.62, cov);       // fondu doux, jamais de bord franc
    if (cov <= 0.002) discard;               // hors plateau : rien à dessiner du tout

    gl_FragColor = vec4(uColor * shade, uOpacity * cov);
  }
`;

// ─── Shaders PLUIE ──────────────────────────────────────────────────────────
// Streak vertical dans le monde, tourné vers la caméra autour de l'axe Y (billboard
// cylindrique via cameraPosition, built-in ShaderMaterial). Toujours face à la caméra
// dans le plan horizontal → jamais backface-cullé (+ DoubleSide en ceinture-bretelles).
// Chute animée en Y (fract du temps), courbure du monde appliquée au centre du streak.
const RAIN_VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  attribute float rainPhase;      // 0..1 — déphasage de chute (les gouttes ne tombent pas en bloc)
  attribute float rainThreshold;  // 0..1 (2.0 = instance inutilisée → jamais affichée)
  attribute float rainSpeed;      // ~0.8..1.25 — vitesse propre à chaque goutte (casse le lockstep)
  uniform float uTime;
  uniform float uAltitude;        // hauteur de départ (= altitude des nuages)
  uniform float uFallSpeed;
  uniform float uDropWidth;
  uniform float uDropLength;
  uniform float uActiveRatio;     // 0..1 — fraction de gouttes affichées (densité vive)
  varying float vActive;
  varying float vSide;            // position.x du quad, INTERPOLÉ (−0.5..0.5) → |.| fait au fragment
  varying float vFall;            // 0 = sous le nuage, 1 = au sol

  void main() {
    vActive = step(rainThreshold, uActiveRatio);
    // Goutte inactive (densité) → on la CLIP hors écran dès le vertex : elle ne rasterise plus
    // aucun pixel (sinon 600 gouttes/nuage coûtaient le plein fill même à densité faible → GPU saturé).
    if (vActive < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    // On passe position.x brut (interpolé sur la face de −0.5 à 0.5) et NON abs(position.x) :
    // aux 4 coins |position.x| vaut toujours 0.5, donc un varying pré-abs vaudrait 1.0 partout
    // (⇒ fondu de bord = 0 ⇒ tout discardé). Le abs() doit se faire au fragment sur la valeur
    // interpolée. C'était LA cause de « la pluie ne rend pas » (2026-07-11).
    vSide = position.x;

    // Point d'ancrage au sol (empreinte du nuage), puis remontée d'altitude selon la chute.
    vec3 anchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float fallTime = max(0.05, uAltitude / uFallSpeed);
    // Vitesse propre par goutte (rainSpeed) → périodes différentes → plus de « respiration »
    // en paquets : la chute se répartit continûment dans le temps.
    float t = fract(uTime * rainSpeed / fallTime + rainPhase);
    vFall = t;
    vec4 center = vec4(anchor.x, anchor.y + uAltitude * (1.0 - t), anchor.z, 1.0);
    center = dorfromantikApplyWorldCurvature(center);

    // Billboard cylindrique : largeur face caméra dans le plan horizontal, longueur verticale monde.
    vec3 toCam = cameraPosition - center.xyz;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 world = center.xyz
      + right * position.x * uDropWidth
      + vec3(0.0, 1.0, 0.0) * position.y * uDropLength;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vActive;
  varying float vSide;
  varying float vFall;

  void main() {
    if (vActive < 0.5) discard;
    float vAcross = abs(vSide) * 2.0;   // 0 au centre du streak, 1 aux bords (interpolé correctement)
    // Cœur plein large (opaque jusqu'à |x|<0.55 du demi-streak) + bord adouci → streak
    // clairement lisible, pas une ligne d'un pixel.
    float edge = 1.0 - smoothstep(0.55, 1.0, vAcross);
    float topFade = smoothstep(0.0, 0.06, vFall);        // apparaît juste sous le nuage
    float botFade = 1.0 - smoothstep(0.85, 1.0, vFall);  // s'efface au ras du sol
    // Streak très TRANSLUCIDE (plafond ~0.3) : même un amas de gouttes sous un nuage reste
    // un voile de pluie doux, jamais un « poteau » blanc opaque.
    float a = edge * topFade * botFade * uOpacity * 0.3;
    if (a < 0.005) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

// ─── Shaders IMPACT AU SOL ───────────────────────────────────────────────────
// Petit disque HORIZONTAL posé au sol (y≈0 + courbure monde) à l'aplomb d'une goutte.
// Cycle propre (uPeriod) : impact (assombrit vite) → fade sur ~2 s → repos → recommence,
// déphasé par instance → taches qui apparaissent/disparaissent continûment. Désactivable
// via uIntensity (0 = éteint). depthTest ON → masqué par le terrain devant / en relief.
const IMPACT_VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  attribute float splatPhase;
  attribute float splatThreshold;
  uniform float uTime;
  uniform float uPeriod;
  uniform float uSize;
  uniform float uActiveRatio;
  varying float vActive;
  varying float vLife;
  varying vec2 vUv;

  void main() {
    vActive = step(splatThreshold, uActiveRatio);
    float life = fract(uTime / uPeriod + splatPhase);
    vLife = life;
    // Clip hors écran si inactive OU en phase de repos (invisible) → pas de fill inutile.
    if (vActive < 0.5 || life > 0.64) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vUv = position.xy;                                  // −0.5..0.5 → disque
    vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float grow = uSize * (0.55 + 0.9 * life);           // la tache s'étale un peu en vieillissant (ondulation)
    vec4 world = vec4(base.x + position.x * grow, base.y + 0.02, base.z + position.y * grow, 1.0);
    world = dorfromantikApplyWorldCurvature(world);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const IMPACT_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uIntensity;
  varying float vActive;
  varying float vLife;
  varying vec2 vUv;

  void main() {
    if (vActive < 0.5) discard;
    float d = length(vUv) * 2.0;                        // 0 centre → 1 bord
    float disc = 1.0 - smoothstep(0.55, 1.0, d);        // disque doux
    float appear = smoothstep(0.0, 0.04, vLife);        // assombrit vite à l'impact
    float fade = 1.0 - smoothstep(0.12, 0.62, vLife);   // s'estompe sur ~2 s puis repos
    float a = disc * appear * fade * uOpacity * uIntensity * 0.55;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export function createRainCloudOverlay(scene) {
  const existing = scene.getObjectByName(OVERLAY_NAME);
  if (existing) return existing.userData.overlay;

  // ── Mesh nuages : UN mesh isosurface metaball (géométrie fusionnée reconstruite au rebuild). ──
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uTopColor: { value: new THREE.Color('#ffffff') },
      uUnderColor: { value: new THREE.Color('#7f9bc6') },   // creux bleutés bien marqués (façon réf cumulus)
      uStormColor: { value: new THREE.Color('#2b3340') },   // facteur d'assombrissement (×2 en shader) : ardoise sombre menaçante
      uStormMix: { value: 0 },
      uStormInflate: { value: 1 },                          // 1 = normal, >1 = nuages gonflés (orage)
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: CLOUD_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    // Nuages OPAQUES (transparent seulement pour le fondu global uOpacity). depthWrite TRUE →
    // occlusion correcte des bosses + gros gain perf (pas d'overdraw).
    transparent: true, depthWrite: true, depthTest: true,
    blending: THREE.NormalBlending, fog: false
  });

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), cloudMat);
  mesh.name = CLOUD_MESH_NAME;
  mesh.frustumCulled = false;
  mesh.userData.skipPaletteHarmony = true;

  // ── Chape d'orage : grand plan bosselé, sombre, double-face, recouvrant tout le plateau. ──
  const canopyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uAmplitude: { value: CANOPY_AMPLITUDE },
      uColor: { value: new THREE.Color('#2b3340') },   // ardoise sombre menaçante (comme la teinte orage des cumulus)
      // Silhouette du plateau (remplie au rebuild par _buildCanopyCoverage). Texture 1×1 blanche
      // en attendant : chape pleine, comportement d'avant, aucun trou visuel au 1er frame.
      uCoverage: { value: _makeFullCoverageTexture() },
      uCoverageOrigin: { value: new THREE.Vector2(0, 0) },
      uCoverageSize: { value: new THREE.Vector2(1, 1) },
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: CANOPY_VERTEX_SHADER,
    fragmentShader: CANOPY_FRAGMENT_SHADER,
    transparent: true, depthWrite: true, depthTest: true,   // occulte (chape opaque) ; fondu bref via uOpacity
    side: THREE.DoubleSide,                                 // vue de dessous OU de dessus selon la caméra
    blending: THREE.NormalBlending, fog: false
  });
  const canopyMesh = new THREE.Mesh(new THREE.BufferGeometry(), canopyMat);
  canopyMesh.name = CANOPY_MESH_NAME;
  canopyMesh.frustumCulled = false;
  canopyMesh.visible = false;
  canopyMesh.userData.skipPaletteHarmony = true;

  // ── Mesh pluie ──
  const rainGeom = new THREE.PlaneGeometry(1, 1);
  const rainThreshInit = new Float32Array(RAIN_POOL).fill(2.0); // toutes inutilisées au départ
  const rainSpeedInit = new Float32Array(RAIN_POOL).fill(1.0);
  rainGeom.setAttribute('rainPhase', new THREE.InstancedBufferAttribute(new Float32Array(RAIN_POOL), 1));
  rainGeom.setAttribute('rainThreshold', new THREE.InstancedBufferAttribute(rainThreshInit, 1));
  rainGeom.setAttribute('rainSpeed', new THREE.InstancedBufferAttribute(rainSpeedInit, 1));

  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uAltitude: { value: 3.5 },
      uFallSpeed: { value: TERMINAL_FALL_SPEED },
      uDropWidth: { value: 0.04 },
      uDropLength: { value: 0.4 },
      uActiveRatio: { value: 0 },
      uColor: { value: new THREE.Color('#cdddea') }, // bleuté doux (cute), pas des lances
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: RAIN_VERTEX_SHADER,
    fragmentShader: RAIN_FRAGMENT_SHADER,
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide,   // ceinture-bretelles : les streaks orientés par le shader ne doivent jamais être cullés
    blending: THREE.NormalBlending, fog: false
  });

  const rainMesh = new THREE.InstancedMesh(rainGeom, rainMat, RAIN_POOL);
  rainMesh.name = RAIN_MESH_NAME;
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  rainMesh.userData.skipPaletteHarmony = true;
  const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < RAIN_POOL; i += 1) rainMesh.setMatrixAt(i, zeroMat);
  rainMesh.instanceMatrix.needsUpdate = true;

  // ── Mesh impacts au sol ──
  const impactGeom = new THREE.PlaneGeometry(1, 1);
  const splatThreshInit = new Float32Array(SPLAT_POOL).fill(2.0);
  impactGeom.setAttribute('splatPhase', new THREE.InstancedBufferAttribute(new Float32Array(SPLAT_POOL), 1));
  impactGeom.setAttribute('splatThreshold', new THREE.InstancedBufferAttribute(splatThreshInit, 1));

  const impactMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPeriod: { value: SPLAT_PERIOD },
      uSize: { value: 0.28 },
      uActiveRatio: { value: 0 },
      uIntensity: { value: 0 },   // = rain.impactSol ; 0 → impacts désactivés
      uColor: { value: new THREE.Color('#243038') }, // sombre → assombrit le sol (aspect mouillé)
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: IMPACT_VERTEX_SHADER,
    fragmentShader: IMPACT_FRAGMENT_SHADER,
    transparent: true, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending, fog: false
  });

  const impactMesh = new THREE.InstancedMesh(impactGeom, impactMat, SPLAT_POOL);
  impactMesh.name = SPLAT_MESH_NAME;
  impactMesh.frustumCulled = false;
  impactMesh.visible = false;
  impactMesh.userData.skipPaletteHarmony = true;
  for (let i = 0; i < SPLAT_POOL; i += 1) impactMesh.setMatrixAt(i, zeroMat);
  impactMesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = OVERLAY_NAME;
  group.visible = false;
  group.add(mesh, canopyMesh, rainMesh);
  scene.add(group);
  // Les impacts au sol sont posés à la hauteur du terrain et NE doivent PAS dériver au vent
  // comme les nuages/pluie → hors du group qui oscille (sway), directement dans la scène.
  scene.add(impactMesh);

  const overlay = {
    group, mesh, canopyMesh, rainMesh, impactMesh, anchors: [], _lastPlacedTiles: null,
    swayPhase: hashUnitFull('rain-cloud-sway') * 1000,
    _cloudWasOn: false, _cloudOnSince: 0, _cloudOffSince: null,
    _rainWasOn: false, _rainOnSince: 0, _rainOffSince: null
  };
  group.userData.overlay = overlay;

  // ── Réaction aux réglages EDA — filtrée par CLÉ (2026-07-28) ────────────────
  // Avant : n'importe quel réglage 'clouds' ou 'rain' déclenchait un rebuild complet
  // (19 200 instances de pluie + 2 880 impacts avec un getTerrainSurfaceY() chacun +
  // mergeGeometries de 32 maillages). Comme les sliders EDA émettent un évènement par
  // frame de drag (~60/s), traîner un curseur saturait le CPU pour rien : sur les 6
  // réglages concernés, 3 ne touchent AUCUNE géométrie.
  //
  //   clouds.densite / clouds.epaisseur → nombre d'ancrages / échelle des maillages :
  //                                        rebuild obligatoire.
  //   clouds.altitude                   → translation verticale pure : mesh.position.y
  //                                        + uniform uAltitude (cf. _applyCloudAltitude).
  //   rain.tailleGoutte                 → 2 uniforms (cf. _applyRainDropSize).
  //   rain.densite / rain.impactSol     → RIEN : déjà lus à chaque frame par
  //                                        updateRainCloudOverlay (uActiveRatio/uIntensity).
  //
  // effect === null = reset global / restauration de snapshot → tout recalculer.
  onVfxSettingsChange((effect, key) => {
    if (effect === null) {
      rebuildRainCloudOverlay(overlay, overlay._lastPlacedTiles);
      return;
    }
    if (effect === 'clouds') {
      if (key === null || key === 'densite' || key === 'epaisseur') {
        rebuildRainCloudOverlay(overlay, overlay._lastPlacedTiles);
      } else if (key === 'altitude') {
        _applyCloudAltitude(overlay, getVfxSettings('clouds').altitude);
      }
      return;
    }
    if (effect === 'rain') {
      _applyRainDropSize(overlay, getVfxSettings('rain').tailleGoutte);
      return;
    }
    // storm.altitudeChape → simple déplacement du mesh (pas de reconstruction).
    // storm.opaciteChape → RIEN à faire ici : relu à chaque frame par updateRainCloudOverlay.
    if (effect === 'storm' && (key === null || key === 'altitudeChape')) {
      overlay.canopyMesh.position.y = getVfxSettings('storm').altitudeChape;
    }
  });

  return overlay;
}

/**
 * Construit la texture de couverture de la chape d'orage : la silhouette du plateau posé,
 * avec un dégradé vers l'extérieur (2026-07-30, retour Cyril — la chape était un rectangle net).
 *
 * Principe : on tamponne un dégradé radial par tuile, en gardant le MAX. L'union des disques
 * donne naturellement une forme « patatoïde » qui suit le plateau, et le dégradé donne le fondu.
 * Coût borné : on ne parcourt que les texels dans le rayon FEATHER de chaque tuile (quelques
 * centaines), pas la texture entière par tuile — et seulement au rebuild, jamais par frame.
 */
function _buildCanopyCoverage(overlay, placedTiles, originX, originZ, worldW, worldD) {
  const N = CANOPY_COV_TEX;
  const data = new Uint8Array(N * N);
  const perX = N / worldW, perZ = N / worldD;          // texels par unité monde
  const rTexX = CANOPY_COV_FEATHER * perX, rTexZ = CANOPY_COV_FEATHER * perZ;

  for (const placedTile of placedTiles.values()) {
    const p = axialToWorld(placedTile.q, placedTile.r);
    const cx = (p.x - originX) * perX, cz = (p.z - originZ) * perZ;
    const x0 = Math.max(0, Math.floor(cx - rTexX)), x1 = Math.min(N - 1, Math.ceil(cx + rTexX));
    const z0 = Math.max(0, Math.floor(cz - rTexZ)), z1 = Math.min(N - 1, Math.ceil(cz + rTexZ));
    for (let tz = z0; tz <= z1; tz += 1) {
      const dzw = (tz + 0.5) / perZ + originZ - p.z;
      for (let tx = x0; tx <= x1; tx += 1) {
        const dxw = (tx + 0.5) / perX + originX - p.x;
        const dist = Math.hypot(dxw, dzw);
        if (dist >= CANOPY_COV_FEATHER) continue;
        let v;
        if (dist <= CANOPY_COV_CORE) v = 1;
        else {
          const t = (dist - CANOPY_COV_CORE) / (CANOPY_COV_FEATHER - CANOPY_COV_CORE);
          v = 1 - t * t * (3 - 2 * t);                  // smoothstep inversé → fondu doux
        }
        const b = (v * 255) | 0;
        const i = tz * N + tx;
        if (b > data[i]) data[i] = b;
      }
    }
  }

  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  const u = overlay.canopyMesh.material.uniforms;
  if (u.uCoverage.value) u.uCoverage.value.dispose();   // libère la texture du rebuild précédent
  u.uCoverage.value = tex;
  u.uCoverageOrigin.value.set(originX, originZ);
  u.uCoverageSize.value.set(worldW, worldD);
}

// ── Chemins rapides (pas de reconstruction de géométrie) ─────────────────────

// Altitude des nuages. La géométrie fusionnée porte des positions MONDE bakées à
// `_bakedCloudAltitude` ; plutôt que de tout re-baker, on décale le mesh en Y. Sûr :
// group.position.y reste toujours 0 (le sway n'agit que sur X/Z, cf. update), et la
// pluie ne dépend que de l'uniform uAltitude (ses instances sont ancrées à y=0).
function _applyCloudAltitude(overlay, altitude) {
  overlay.mesh.position.y = altitude - (overlay._bakedCloudAltitude ?? altitude);
  overlay.rainMesh.material.uniforms.uAltitude.value = altitude;
}

// Largeur/longueur des streaks de pluie — gouttes FINES. tailleGoutte ∈ [0.001, 0.010]
// pilote directement, du très fin au modéré.
function _applyRainDropSize(overlay, tailleGoutte) {
  const u = overlay.rainMesh.material.uniforms;
  u.uDropWidth.value = 0.004 + tailleGoutte * 0.9;   // ~0.005 → 0.013 (fins)
  u.uDropLength.value = 0.06 + tailleGoutte * 9.0;   // ~0.07 → 0.15 (traits qui tombent)
}

/** Recalcule ancrages nuages + gouttes de pluie à partir des tuiles posées + réglages. */
export function rebuildRainCloudOverlay(overlay, placedTiles) {
  overlay._lastPlacedTiles = placedTiles;
  const s = getVfxSettings('clouds');
  const rainS = getVfxSettings('rain');
  const { mesh, rainMesh } = overlay;
  const dummy = new THREE.Object3D();
  const anchors = [];

  if (placedTiles && placedTiles.size > 0) {
    for (const placedTile of placedTiles.values()) {
      const key = makeHexKey(placedTile.q, placedTile.r);
      if (hashUnitFull(key + ':cloud-presence') >= s.densite) continue;
      if (anchors.length >= MAX_CLOUDS) break;
      const tilePos = axialToWorld(placedTile.q, placedTile.r);
      anchors.push({
        x: tilePos.x + (hashUnitFull(key + ':cloud-jx') - 0.5) * HEX_SIZE * 0.8,
        z: tilePos.z + (hashUnitFull(key + ':cloud-jz') - 0.5) * HEX_SIZE * 0.8,
        seed: key,
        type: placedTile.tile?.center ?? EDGE_TYPES.grass ?? 'grass'   // biome → hauteur de terrain pour les impacts
      });
    }
  }

  // ── Nuages : 1 maillage isosurface metaball par nuage (marching cubes, caché par seed),
  //   mis à l'échelle (UNIFORME → normales conservées) et translaté à son ancrage, puis TOUS
  //   fusionnés en une seule géométrie (1 draw call). Le marching cubes ne tourne que pour un
  //   seed jamais vu → reposer une tuile ne recalcule au pire qu'un nouveau nuage. ──
  const spreadRadii = [];   // rayon d'empreinte XZ par ancrage → réutilisé pour la pluie
  const cloudParts = [];
  const _cm = new THREE.Matrix4();
  for (const anchor of anchors) {
    const sizeVar = 0.85 + hashUnitFull(anchor.seed + ':cloud-size') * 0.4; // 0.85..1.25
    const Sxz = (0.72 + s.epaisseur * 0.7) * sizeVar;
    spreadRadii.push(1.55 * Sxz); // demi-largeur approx. de l'empreinte (pour la pluie)
    const localGeom = _cloudLocalGeometry(anchor.seed);  // marching cubes (une fois, puis cache)
    const g = localGeom.clone();
    _cm.makeScale(Sxz, Sxz, Sxz);
    _cm.setPosition(anchor.x, s.altitude, anchor.z);
    g.applyMatrix4(_cm);                                 // positions MONDE bakées (le group ajoute la dérive au vent)
    cloudParts.push(g);
  }
  const _oldCloudGeom = mesh.geometry;
  mesh.geometry = cloudParts.length ? mergeGeometries(cloudParts, false) : new THREE.BufferGeometry();
  if (_oldCloudGeom) _oldCloudGeom.dispose();
  for (const g of cloudParts) g.dispose();

  // ── Gouttes de pluie : chaque ancrage reçoit MAX_DROPS_PER_ANCHOR gouttes réparties
  //    dans l'empreinte XZ de SON nuage. La densité vive est pilotée par uActiveRatio
  //    (seuil), pas par le nombre construit → pas de rebuild quand la densité/orage changent. ──
  const phaseAttr = rainMesh.geometry.attributes.rainPhase;
  const threshAttr = rainMesh.geometry.attributes.rainThreshold;
  const speedAttr = rainMesh.geometry.attributes.rainSpeed;
  const rainZero = new THREE.Matrix4().makeScale(0, 0, 0);
  const anchorRainRadii = [];   // réutilisé pour les impacts
  let ri = 0;
  for (let a = 0; a < anchors.length; a += 1) {
    const anchor = anchors[a];
    const rainRadius = (spreadRadii[a] ?? 2.0) * 1.7;   // empreinte large → gouttes diffuses, pas concentrées en colonne
    anchorRainRadii.push(rainRadius);
    for (let d = 0; d < MAX_DROPS_PER_ANCHOR && ri < RAIN_POOL; d += 1, ri += 1) {
      const seed = anchor.seed + ':d' + d;
      // Répartition en DISQUE (angle + rayon en sqrt → uniforme sur le disque), avec des sels de
      // hash bien distincts. Évite le motif « rangées d'eau » de l'ancienne répartition en carré
      // (les nuages sont posés sur la grille hex → une distribution carrée réalignait tout).
      const ang = hashUnitFull(seed + ':ang') * 6.28318530718;
      const rad = Math.sqrt(hashUnitFull(seed + ':rad')) * rainRadius;
      dummy.position.set(anchor.x + Math.cos(ang) * rad, 0, anchor.z + Math.sin(ang) * rad);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rainMesh.setMatrixAt(ri, dummy.matrix);
      phaseAttr.setX(ri, hashUnitFull(seed + ':ph'));
      threshAttr.setX(ri, hashUnitFull(seed + ':th'));         // 0..1 → densité vive
      speedAttr.setX(ri, 0.8 + hashUnitFull(seed + ':sp') * 0.45); // 0.8..1.25 → chute continue
    }
  }
  for (; ri < RAIN_POOL; ri += 1) {
    rainMesh.setMatrixAt(ri, rainZero); // instance inutilisée : échelle 0 (pas de rasterisation)
    threshAttr.setX(ri, 2.0);           // + seuil hors plage (jamais affichée)
  }
  rainMesh.instanceMatrix.needsUpdate = true;
  phaseAttr.needsUpdate = true;
  threshAttr.needsUpdate = true;
  speedAttr.needsUpdate = true;

  // ── Impacts au sol : un sous-ensemble de points au sol sous chaque nuage, répartis en disque. ──
  const impactMesh = overlay.impactMesh;
  const splatPhaseAttr = impactMesh.geometry.attributes.splatPhase;
  const splatThreshAttr = impactMesh.geometry.attributes.splatThreshold;
  const _pt = { x: 0, z: 0 };
  let si = 0;
  for (let a = 0; a < anchors.length; a += 1) {
    const anchor = anchors[a];
    const rainRadius = anchorRainRadii[a] ?? 2.0;
    for (let d = 0; d < SPLATS_PER_ANCHOR && si < SPLAT_POOL; d += 1, si += 1) {
      const seed = anchor.seed + ':s' + d;
      const ang = hashUnitFull(seed + ':ang') * 6.28318530718;
      const rad = Math.sqrt(hashUnitFull(seed + ':rad')) * rainRadius;
      const px = anchor.x + Math.cos(ang) * rad;
      const pz = anchor.z + Math.sin(ang) * rad;
      // Hauteur LOCALE du terrain à cet XZ (le shader ajoute la courbure, comme les props) → la tache
      // se pose SUR la tuile, plus au niveau y=0 (qui n'était visible que dans le vide entre tuiles).
      _pt.x = px; _pt.z = pz;
      const surfY = getTerrainSurfaceY(_pt, anchor.type, 0, { exactMeshSurface: false }) + 0.03;
      dummy.position.set(px, surfY, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      impactMesh.setMatrixAt(si, dummy.matrix);
      splatPhaseAttr.setX(si, hashUnitFull(seed + ':ph'));
      splatThreshAttr.setX(si, hashUnitFull(seed + ':th'));
    }
  }
  for (; si < SPLAT_POOL; si += 1) {
    impactMesh.setMatrixAt(si, rainZero);
    splatThreshAttr.setX(si, 2.0);
  }
  impactMesh.instanceMatrix.needsUpdate = true;
  splatPhaseAttr.needsUpdate = true;
  splatThreshAttr.needsUpdate = true;

  // Altitude bakée dans les positions monde de la géométrie fusionnée ci-dessus :
  // mémorisée pour que _applyCloudAltitude() puisse ensuite décaler le mesh en Y sans
  // reconstruire (le slider Altitude n'a plus besoin d'un rebuild, cf. onVfxSettingsChange).
  overlay._bakedCloudAltitude = s.altitude;
  overlay.mesh.position.y = 0;
  overlay.rainMesh.material.uniforms.uAltitude.value = s.altitude;
  // Taille des gouttes : même source de vérité que le chemin rapide.
  _applyRainDropSize(overlay, rainS.tailleGoutte);

  // ── Chape d'orage : (re)construit un grand plan horizontal subdivisé couvrant toute la boîte
  //    englobante du plateau (+ marge), à l'altitude des nuages. Le relief bosselé est fait dans
  //    le vertex shader (bruit monde) → ici, juste un plan plat bien subdivisé. ──
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  if (placedTiles && placedTiles.size > 0) {
    for (const placedTile of placedTiles.values()) {
      const p = axialToWorld(placedTile.q, placedTile.r);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
  }
  const _oldCanopyGeom = overlay.canopyMesh.geometry;
  if (Number.isFinite(minX)) {
    const w = (maxX - minX) + CANOPY_MARGIN * 2;
    const d = (maxZ - minZ) + CANOPY_MARGIN * 2;
    const canopyGeom = new THREE.PlaneGeometry(w, d, CANOPY_SEGMENTS, CANOPY_SEGMENTS);
    canopyGeom.rotateX(-Math.PI / 2);                               // plan horizontal (XZ)
    // Altitude portée par mesh.position.y (et non cuite dans la géométrie) : le curseur EDA
    // « Altitude chape » peut ainsi la changer sans reconstruire le plan (72×72 segments).
    // Le bruit du vertex shader est indexé sur wp.xz — un décalage en Y ne le modifie pas.
    canopyGeom.translate((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    overlay.canopyMesh.geometry = canopyGeom;
    // Silhouette du plateau : la chape n'est plus un rectangle, elle épouse les tuiles posées
    // et s'estompe sur ses bords (cf. CANOPY_FRAGMENT_SHADER).
    _buildCanopyCoverage(overlay, placedTiles, minX - CANOPY_MARGIN, minZ - CANOPY_MARGIN, w, d);
  } else {
    overlay.canopyMesh.geometry = new THREE.BufferGeometry();
  }
  overlay.canopyMesh.position.y = getVfxSettings('storm').altitudeChape;
  if (_oldCanopyGeom) _oldCanopyGeom.dispose();

  overlay.anchors = anchors;
}

/** Positions monde des nuages actifs (consommé par lightningOverlay.js). */
export function getRainCloudAnchors(overlay) {
  return overlay.anchors;
}

// Machine à fondu générique : met à jour l'état on/off et renvoie l'opacité 0..1.
function _fade(on, timeSeconds, state, fadeIn, fadeOut, keys) {
  const [wasKey, onSinceKey, offSinceKey] = keys;
  if (on) {
    if (!state[wasKey]) state[onSinceKey] = timeSeconds;
    state[wasKey] = true;
    state[offSinceKey] = null;
  } else {
    if (state[wasKey]) state[offSinceKey] = timeSeconds;
    state[wasKey] = false;
  }
  if (on) return Math.min(1, (timeSeconds - state[onSinceKey]) / fadeIn);
  if (state[offSinceKey] != null) return Math.max(0, 1 - (timeSeconds - state[offSinceKey]) / fadeOut);
  return 0;
}

const STORM_INFLATE = 1.35;   // orage : facteur de grossissement des nuages (autour de leur centre)

export function updateRainCloudOverlay(overlay, environmentDirector, timeSeconds, deltaSeconds) {
  const cloudsEnabled = isVfxGroupExpanded('clouds');
  const stormActive = isEnvironmentEventActive(environmentDirector, 'storm');
  const rainEventActive = isEnvironmentEventActive(environmentDirector, 'rain') || stormActive;
  const hasAnchors = overlay.anchors.length > 0;

  const cloudFade = _fade(cloudsEnabled, timeSeconds, overlay, FADE_IN, FADE_OUT,
    ['_cloudWasOn', '_cloudOnSince', '_cloudOffSince']);
  const rainFade = _fade(rainEventActive && cloudsEnabled, timeSeconds, overlay, RAIN_FADE_IN, RAIN_FADE_OUT,
    ['_rainWasOn', '_rainOnSince', '_rainOffSince']);

  const rainS = getVfxSettings('rain');
  const stormS = getVfxSettings('storm');
  const impactIntensity = rainS.impactSol ?? 0;

  const cloudVisible = cloudFade > 0.001 && hasAnchors;
  const rainVisible = rainFade > 0.001 && hasAnchors;
  const impactVisible = rainVisible && impactIntensity > 0.001;

  // Rampe d'orage en FONDU (~0.9 s) : pilote le relais cumulus → chape (pas de pop brutal).
  const stormT0 = overlay._stormT ?? 0;
  overlay._stormT = stormT0 + ((stormActive ? 1 : 0) - stormT0) * Math.min(1, deltaSeconds / 0.9);
  const stormT = overlay._stormT;

  // Pendant l'orage : les cumulus épars s'effacent au profit de la CHAPE qui recouvre tout le ciel.
  const cumulusVisible = cloudVisible && stormT < 0.997;
  const canopyVisible = hasAnchors && stormT > 0.003;

  overlay.group.visible = cumulusVisible || rainVisible || canopyVisible;
  overlay.mesh.visible = cumulusVisible;
  overlay.canopyMesh.visible = canopyVisible;
  overlay.rainMesh.visible = rainVisible;
  overlay.impactMesh.visible = impactVisible;

  // Cumulus : s'assombrissent/gonflent (transition) puis s'effacent quand l'orage monte.
  const cu = overlay.mesh.material.uniforms;
  cu.uTime.value = timeSeconds;
  cu.uOpacity.value = cloudFade * (1 - stormT);
  cu.uStormMix.value = stormT;
  cu.uStormInflate.value = 1 + (STORM_INFLATE - 1) * stormT;

  // Chape d'orage : fondu d'opacité piloté par la rampe d'orage, plafonné par le curseur EDA
  // « Opacité chape » (2026-07-30, retour Piregwan : à 1 elle masquait totalement le plateau).
  const ccu = overlay.canopyMesh.material.uniforms;
  ccu.uTime.value = timeSeconds;
  ccu.uOpacity.value = stormT * stormS.opaciteChape;

  // Uniforms pluie : densité vive = rain.densite (+ boost orage), bornée à 1.
  let activeRatio = 0.12 + rainS.densite * 0.88;   // densité 0 → 0.12 (bruine), densité 1 → 1.0 (pluie battante)
  if (stormActive) activeRatio *= stormS.intensitePluie;
  activeRatio = Math.max(0, Math.min(1, activeRatio));

  const ru = overlay.rainMesh.material.uniforms;
  ru.uTime.value = timeSeconds;
  ru.uOpacity.value = rainFade;
  ru.uActiveRatio.value = activeRatio;

  // Uniforms impacts au sol (mêmes points d'activation que la pluie ; intensité = rain.impactSol).
  const iu = overlay.impactMesh.material.uniforms;
  iu.uTime.value = timeSeconds;
  iu.uOpacity.value = rainFade;
  iu.uActiveRatio.value = activeRatio;
  iu.uIntensity.value = impactIntensity;

  // Dérive au vent (sway) sur le group → nuages ET pluie dérivent ensemble.
  const wind = getGlobalWindUniforms();
  const dir = wind.uGlobalWindDirection.value;
  const sway = Math.sin(timeSeconds * 0.05 + overlay.swayPhase) * SWAY_AMPLITUDE;
  overlay.group.position.set(dir.x * sway, 0, dir.y * sway);
}
