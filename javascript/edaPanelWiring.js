import { DEFAULT_VISUAL_ENVIRONMENT_CONFIG, cloneVisualConfig, applyColorGradingUniforms } from './visualEnvironment.js';
import { getWorldShapeMode, setWorldShapeMode } from './worldCurvature.js';
import { LUT_HELP, attachHelpTooltip } from './help.js';
import { copyToClipboard } from './hud_fps.js';
import { getWaterFoamParams, setWaterFoamParams } from './realisticWater.js';
import { getWakeParams, setWakeParams } from '../shaders/waterBoatOverlay.js';
import { getWheatWindParams, setWheatWindParams } from './fieldWheatOverlay.js';
import { getGrassWindParams, setGrassWindParams } from './grassBladeOverlay.js';
import { getTreeWindParams, setTreeWindParams } from './forestOverlay.js';
import { getCloudSkyParams, setCloudSkyParams, setCloudUserEnabled } from './cloudSky.js';
import { WATER_RENDER, WHEAT_WIND_STRENGTH, WHEAT_WIND_SPEED, GRASS_WIND_STRENGTH, GRASS_WIND_SPEED, GRASS_WIND_SWAY, TREE_WIND } from './config.js';
import { getContentDensity, setContentDensity, MIN_DENSITY, MAX_DENSITY } from './contentDensity.js';
import { ENVIRONMENT_EVENTS, onEnvironmentChange, triggerEnvironmentEvent, stopEnvironmentEvent, stopAllEnvironmentEvents, isEnvironmentEventActive } from './environmentDirector.js';
import { getVfxSettings, setVfxSetting, resetVfxSettings, onVfxSettingsChange, isVfxGroupExpanded, setVfxGroupExpanded } from './vfxSettings.js';
import { escapeHtml } from './domUtils.js';
import { registerLangRefresh, getLangFile, getLangVersion } from './gameLangReactive.js';
import { applyCurrentLang } from './gameHudI18n.js';
import { announceEdaOpened, speak, resetTtsQueue } from './ttsAnnouncer.js';
import { HEXISTENZ_VERSION } from './variables.js';

// Panneau EDA traduit le 2026-07-14 (signalé non connecté par l'utilisateur) : tout
// le panneau (rubriques, libellés de sliders, boutons, tooltips) était en français
// en dur depuis toujours. Passage au même mécanisme générique que game.php
// (gameHudI18n.js) : data-i18n / data-i18n-title, sous la clé JSON game.eda.

// ─── edaPanelWiring.js (ex-hud_eda.js, renommé le 2026-07-11) — extrait de debugLightUi.js
// (2026-07-02, façade elle-même renommée edaPanelHost.js le 2026-07-11) ───
// Ce module construit et câble tout le contenu du panel EDA (3 onglets : LUT / Cinématique /
// Environnement) à l'intérieur du `root` (#debugLightPanel) créé par la façade edaPanelHost.js,
// qui héberge aussi le HUD FPS (hud_fps.js) dans le même élément DOM.

// ─── Persistance localStorage des réglages du panel (2026-07-28) ─────────────
// Les 5 groupes de réglages (CINÉMA / PIX / EAU / VENT / NUAGES) avaient chacun leur
// paire _readXStored()/_storeXSettings() strictement identique au nom de clé près.
// Factorisé ici en un seul `makeStore(key)`.
//
// ÉCRITURES DEBOUNCÉES (200 ms) : chaque slider commit à chaque évènement `input`,
// soit ~60 fois par seconde pendant un drag. localStorage.setItem est SYNCHRONE et
// sérialise tout l'objet à chaque appel → source de saccades bien réelle au drag.
// La valeur en mémoire reste appliquée immédiatement (aucun retard visuel) ; seule
// l'écriture disque est différée jusqu'à la fin du geste. Même logique que le
// debounce déjà en place sur la densité de contenu (_qualityDebounceTimer).
// `flush` sur pagehide : garantit qu'un réglage modifié puis fermeture immédiate de
// l'onglet (< 200 ms) n'est pas perdu.
const _pendingWrites = new Map();   // key -> valeur à écrire
let _writeTimer = null;

function _flushStoreWrites() {
  if (_writeTimer !== null) { clearTimeout(_writeTimer); _writeTimer = null; }
  for (const [key, value] of _pendingWrites) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* quota / stockage indisponible */ }
  }
  _pendingWrites.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', _flushStoreWrites);
}

function makeStore(key) {
  return {
    read() {
      try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
    },
    write(value) {
      _pendingWrites.set(key, value);
      if (_writeTimer === null) _writeTimer = setTimeout(_flushStoreWrites, 200);
    },
  };
}

// ─── PIX HUD constants (embedded inside CUSTOMISATION panel) ─────────────────
const PIX_STORAGE_KEY = 'dorfoPixelPostprocessSettings.v4';
// ─── CINEMA HUD constants ─────────────────────────────────────────────────────
const CIN_STORAGE_KEY = 'hexistenz_cinema_v1';
const CIN_DEFAULTS = Object.freeze({
  enabled: false,
  tilt: 0.60, focusCenter: 0.50, focusBand: 0.35,
  vignette: 0.55, grain: 0.30, chromatic: 0.45,
  halation: 0.0, barrel: 0.0, scanLines: 0.0, scanLinesIntensity: 0.52,
  godRays: 0.0, godRaysLength: 0.40, godRaysDiffusion: 0.85, godRaysThreshold: 0.70,
  godRaysLayers: 0.0,
  godRaysEnabled: true, tiltShiftEnabled: true,
  bloomIntensity: 0.0, bloomThreshold: 0.75, bloomRadius: 2.0, bloomSoftness: 0.4,
  crtCurvature: 0.0, crtMask: 0.5, crtCornerDark: 0.2,
  bloomEnabled: true, crtEnabled: true,
});
function _normalizeCin(s) {
  const clp = (v, d, mx) => Math.min(mx, Math.max(0, isFinite(Number(v)) ? Number(v) : d));
  return {
    enabled:     Boolean(s.enabled),
    tilt:        clp(s.tilt,        CIN_DEFAULTS.tilt,        1),
    focusCenter: clp(s.focusCenter, CIN_DEFAULTS.focusCenter, 1),
    focusBand:   clp(s.focusBand,   CIN_DEFAULTS.focusBand,   1),
    vignette:    clp(s.vignette,    CIN_DEFAULTS.vignette,    2),
    grain:       clp(s.grain,       CIN_DEFAULTS.grain,       1),
    chromatic:   clp(s.chromatic,   CIN_DEFAULTS.chromatic,   1),
    halation:    clp(s.halation,    CIN_DEFAULTS.halation,    1),
    barrel:      clp(s.barrel,      CIN_DEFAULTS.barrel,      1),
    scanLines:   clp(s.scanLines,   CIN_DEFAULTS.scanLines,   6), // 0–6 px
    scanLinesIntensity: clp(s.scanLinesIntensity, CIN_DEFAULTS.scanLinesIntensity, 1),
    godRays:          clp(s.godRays,          CIN_DEFAULTS.godRays,          1),
    godRaysLength:    clp(s.godRaysLength,    CIN_DEFAULTS.godRaysLength,    1),
    godRaysDiffusion: clp(s.godRaysDiffusion, CIN_DEFAULTS.godRaysDiffusion, 1),
    godRaysThreshold: clp(s.godRaysThreshold, CIN_DEFAULTS.godRaysThreshold, 1),
    godRaysLayers:    clp(s.godRaysLayers,    CIN_DEFAULTS.godRaysLayers,    1),
    godRaysEnabled:   s.godRaysEnabled   !== false,
    tiltShiftEnabled: s.tiltShiftEnabled !== false,
    bloomIntensity: clp(s.bloomIntensity, CIN_DEFAULTS.bloomIntensity, 2),
    bloomThreshold: clp(s.bloomThreshold, CIN_DEFAULTS.bloomThreshold, 1),
    bloomRadius:    clp(s.bloomRadius,    CIN_DEFAULTS.bloomRadius,    8),
    bloomSoftness:  clp(s.bloomSoftness,  CIN_DEFAULTS.bloomSoftness,  1),
    crtCurvature:  clp(s.crtCurvature,  CIN_DEFAULTS.crtCurvature,  1),
    crtMask:       clp(s.crtMask,       CIN_DEFAULTS.crtMask,       1),
    crtCornerDark: clp(s.crtCornerDark, CIN_DEFAULTS.crtCornerDark, 1),
    bloomEnabled: s.bloomEnabled !== false,
    crtEnabled:   s.crtEnabled   !== false,
  };
}
const _cinStore = makeStore(CIN_STORAGE_KEY);
const _readCinStored     = () => _cinStore.read();
const _storeCinSettings  = (s) => _cinStore.write(s);
const PIX_DEFAULTS = Object.freeze({ enabled: false, pixelSize: 2, normalEdgeStrength: 0.20, depthEdgeStrength: 0.25, worldShapeMode: 'platiste' });
function _normalizePix(s) {
  return {
    enabled: Boolean(s.enabled),
    pixelSize: Math.min(50, Math.max(1, Math.round(Number(s.pixelSize) || PIX_DEFAULTS.pixelSize))),
    normalEdgeStrength: Math.min(1, Math.max(0, Number(s.normalEdgeStrength) ?? 0)),
    depthEdgeStrength: Math.min(1, Math.max(0, Number(s.depthEdgeStrength) ?? 0)),
    worldShapeMode: s.worldShapeMode === 'platiste' ? 'platiste' : 'bouliste'
  };
}
const _pixStore = makeStore(PIX_STORAGE_KEY);
const _readPixStored     = () => _pixStore.read();
const _storePixSettings  = (s) => _pixStore.write(s);

// ─── EAU HUD constants (intégration Cyril — panneau flottant fusionné dans le HUD LUT) ─────
const WATER_STORAGE_KEY = 'hexistenz_water_hud_v1';
const WATER_SLIDERS = [
  { key: 'foamWidth',    label: 'Portée',        min: 0,     max: 1.2,  step: 0.01 },
  { key: 'foamScale',    label: 'Finesse',       min: 1,     max: 12,   step: 0.1  },
  { key: 'foamDensity',  label: 'Densité rive',  min: 0,     max: 0.65, step: 0.005 },
  { key: 'foamAmbient',  label: 'Surface',       min: 0,     max: 0.60, step: 0.005 },
  { key: 'foamSharp',    label: 'Netteté',       min: 0.002, max: 0.08, step: 0.002 },
  { key: 'foamSpeed',    label: 'Vitesse',       min: 0,     max: 15,   step: 0.1 },
  { key: 'deepDistance', label: 'Dégradé — étendue', min: 0.2, max: 2.0, step: 0.05 },
  { key: 'opacity',      label: 'Eau — opacité', min: 0.3,   max: 1.0,  step: 0.02 },
];
const WAKE_SLIDERS = [
  { key: 'armWidth', label: 'Largeur branche', min: 0.01, max: 0.25, step: 0.005 },
  { key: 'spread',   label: 'Divergence V',    min: 0,    max: 1.2,  step: 0.02 },
  { key: 'length',   label: 'Longueur',        min: 0.4,  max: 1.3,  step: 0.05 },
  { key: 'scale',    label: 'Finesse',         min: 2,    max: 16,   step: 0.2  },
  { key: 'density',  label: 'Densité',         min: 0,    max: 0.5,  step: 0.005 },
  { key: 'opacity',  label: 'Opacité',         min: 0.2,  max: 1.0,  step: 0.02 },
];
// ─── VFX MÉTÉO (rubrique 2, groupe "brume/lucioles/pluie" — sur vfxSettings.js) ─────
// Contrairement à EAU/VENT/NUAGES (get/set dédiés par overlay), les réglages VFX
// météo passent par un petit store commun (vfxSettings.js, persistance localStorage
// déjà gérée là-bas) — inutile de dupliquer la logique get/set ici.
const VFX_MIST_SLIDERS = [
  { key: 'densite',   label: 'Densité',   min: 0,   max: 1,   step: 0.01 },
  { key: 'compacite', label: 'Compacité', min: 0,   max: 1,   step: 0.01 },
  { key: 'elevation', label: 'Élévation', min: 0,   max: 1,   step: 0.01 },
];
const VFX_FIREFLY_SLIDERS = [
  { key: 'densite',       label: 'Densité',       min: 0,    max: 1,   step: 0.01 },
  { key: 'taille',        label: 'Taille',        min: 0.04, max: 0.4, step: 0.01 },
  { key: 'vagabondage',   label: 'Vagabondage',   min: 0.1,  max: 2,   step: 0.05 },
  { key: 'scintillement', label: 'Scintillement', min: 0,    max: 1,   step: 0.01 },
];
// VFX_RAIN_SLIDERS refondu 2026-07-12 (livraison Cyril « nuages metaball + pluie + impacts ») :
// vitesse retirée (la vitesse terminale est physique, cf. TERMINAL_FALL_SPEED dans
// rainCloudOverlay.js — un slider n'aurait pas de sens isolé de la taille), tailleGoutte
// resserrée à [0.001, 0.010] pour rester dans la plage « gouttes fines », impactSol ajouté.
const VFX_RAIN_SLIDERS = [
  { key: 'densite',      label: 'Densité',       min: 0,     max: 1,     step: 0.01 },
  { key: 'tailleGoutte', label: 'Taille goutte', min: 0.001, max: 0.010, step: 0.0005 },
  { key: 'impactSol',    label: 'Impact sol',    min: 0,     max: 1,     step: 0.05 },
];
const VFX_CLOUD_SLIDERS = [
  { key: 'densite',   label: 'Densité',   min: 0,   max: 1,   step: 0.01 },
  { key: 'altitude',  label: 'Altitude',  min: 1,   max: 10,  step: 0.1 },
  { key: 'epaisseur', label: 'Épaisseur', min: 0.1, max: 1.5, step: 0.05 },
];
// altitudeChape / opaciteChape ajoutés 2026-07-30 (retour Piregwan : la chape d'orage masquait
// totalement la map, injouable). Altitude min 3 = juste au-dessus des props les plus hauts ;
// max 15 = chape lointaine. Opacité 0 = chape invisible (orage sans couvercle), 1 = ancien
// comportement totalement opaque.
const VFX_STORM_SLIDERS = [
  { key: 'frequenceEclairs', label: 'Fréquence éclairs', min: 0, max: 1, step: 0.01 },
  { key: 'luminositeEclair', label: 'Luminosité éclair',  min: 0, max: 2, step: 0.05 },
  { key: 'intensitePluie',   label: 'Intensité pluie',    min: 1, max: 3, step: 0.05 },
  { key: 'altitudeChape',    label: 'Altitude chape',     min: 3, max: 15, step: 0.1 },
  { key: 'opaciteChape',     label: 'Opacité chape',      min: 0, max: 1,  step: 0.01 },
];
// 2026-07-30 (merge Cyril, paquet feu) — le paquet livrait les 5 réglages dans
// vfxSettings.js mais aucun curseur pour les piloter en jeu, contrairement à tous les
// autres effets météo. Bornes alignées sur les commentaires de vfxSettings.js::fire.
const VFX_FIRE_SLIDERS = [
  { key: 'probaAllumage',  label: 'Proba allumage', min: 0,   max: 1, step: 0.01 },
  { key: 'densiteFlammes', label: 'Densité flammes', min: 0,   max: 1, step: 0.01 },
  { key: 'duree',          label: 'Durée',           min: 0.3, max: 3, step: 0.05 },
  { key: 'taille',         label: 'Taille',          min: 0,   max: 1, step: 0.01 },
  { key: 'propagation',    label: 'Propagation',     min: 0,   max: 1, step: 0.01 },
];
// Liste des effets VFX gérés par vfxSettings.js — sert au snapshot Undo/Redo et à
// l'export 📋 Copier depuis que getAllVfxSettings/setAllVfxSettings ont été retirés
// (remplacement complet par la version Cyril, 2026-07-12).
const _VFX_EFFECT_KEYS = ['groundMist', 'fireflies', 'clouds', 'rain', 'storm', 'fire'];
function _snapshotAllVfx() {
  const snap = {};
  for (const e of _VFX_EFFECT_KEYS) snap[e] = { ...getVfxSettings(e) };
  return snap;
}
function _restoreAllVfx(snapshot) {
  if (!snapshot) return;
  for (const e of _VFX_EFFECT_KEYS) {
    const src = snapshot[e];
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) setVfxSetting(e, key, value);
  }
}
const WATER_DEFAULTS = Object.freeze({
  foamEnabled: true,
  wakeEnabled: true,
  foam: {
    foamWidth: WATER_RENDER.foamWidth, foamScale: WATER_RENDER.foamScale, foamDensity: WATER_RENDER.foamDensity,
    foamAmbient: WATER_RENDER.foamAmbient, foamSharp: WATER_RENDER.foamSharp, foamSpeed: WATER_RENDER.foamSpeed,
    deepDistance: WATER_RENDER.deepDistance, opacity: WATER_RENDER.opacity,
  },
  wake: {
    armWidth: WATER_RENDER.wakeArmWidth, spread: WATER_RENDER.wakeSpread, length: WATER_RENDER.wakeLength,
    scale: WATER_RENDER.wakeScale, density: WATER_RENDER.wakeDensity, opacity: WATER_RENDER.wakeOpacity,
  },
});
function _normalizeWater(s) {
  const clp = (v, mn, mx) => { const n = Number(v); return isFinite(n) ? Math.min(mx, Math.max(mn, n)) : mn; };
  const foam = {};
  for (const { key, min, max } of WATER_SLIDERS) foam[key] = clp(s?.foam?.[key], min, max);
  const wake = {};
  for (const { key, min, max } of WAKE_SLIDERS) wake[key] = clp(s?.wake?.[key], min, max);
  return {
    foamEnabled: s?.foamEnabled !== false,
    wakeEnabled: s?.wakeEnabled !== false,
    foam, wake,
  };
}
// Applique en live les valeurs réelles si activé, ou des valeurs figées (amplitude/opacité
// nulle) si désactivé — mêmes principes que _applyWindLive : les sliders/valeurs stockées
// ne sont pas remis à zéro, seul l'effet visuel l'est.
function _applyWaterLive(cur) {
  const foamEff = cur.foamEnabled ? cur.foam : { ...cur.foam, foamWidth: 0, foamDensity: 0, foamAmbient: 0 };
  const wakeEff = cur.wakeEnabled ? cur.wake : { ...cur.wake, opacity: 0, density: 0 };
  setWaterFoamParams(foamEff);
  setWakeParams(wakeEff);
}
const _waterStore = makeStore(WATER_STORAGE_KEY);
const _readWaterStored     = () => _waterStore.read();
const _storeWaterSettings  = (s) => _waterStore.write(s);

// ─── VENT HUD constants (ondulation blé / prairie / arbres) ────────────────
const WIND_STORAGE_KEY = 'hexistenz_wind_hud_v1';
const WIND_WHEAT_SLIDERS = [
  { key: 'strength', label: 'Amplitude', min: 0,     max: 0.10, step: 0.001 },
  { key: 'speed',    label: 'Vitesse',   min: 0,     max: 4.00, step: 0.05  },
];
const WIND_GRASS_SLIDERS = [
  { key: 'strength', label: 'Amplitude',   min: 0,   max: 4.00, step: 0.05  },
  { key: 'speed',    label: 'Vitesse',     min: 0,   max: 2.00, step: 0.01  },
  { key: 'sway',     label: 'Balancement', min: 0,   max: 0.30, step: 0.005 },
];
const WIND_TREE_SLIDERS = [
  { key: 'strength',       label: 'Amplitude',  min: 0, max: 0.12, step: 0.001 },
  { key: 'speed',          label: 'Vitesse',    min: 0, max: 3.00, step: 0.01  },
  { key: 'frequency',      label: 'Fréquence',  min: 0, max: 2.00, step: 0.01  },
  { key: 'turbulence',     label: 'Turbulence', min: 0, max: 1.00, step: 0.01  },
  { key: 'gustStrength',   label: 'Rafales',    min: 0, max: 1.00, step: 0.01  },
  { key: 'detailStrength', label: 'Détail',     min: 0, max: 1.00, step: 0.01  },
];
const WIND_DEFAULTS = Object.freeze({
  enabled: true,
  wheat: { strength: WHEAT_WIND_STRENGTH, speed: WHEAT_WIND_SPEED },
  grass: { strength: GRASS_WIND_STRENGTH, speed: GRASS_WIND_SPEED, sway: GRASS_WIND_SWAY },
  tree: {
    strength: TREE_WIND.strength, speed: TREE_WIND.speed, frequency: TREE_WIND.frequency,
    turbulence: TREE_WIND.turbulence, gustStrength: TREE_WIND.gustStrength, detailStrength: TREE_WIND.detailStrength,
  },
});
function _normalizeWind(s) {
  const clp = (v, mn, mx, d) => { const n = Number(v); return isFinite(n) ? Math.min(mx, Math.max(mn, n)) : d; };
  const wheat = {}, grass = {}, tree = {};
  for (const { key, min, max } of WIND_WHEAT_SLIDERS) wheat[key] = clp(s?.wheat?.[key], min, max, WIND_DEFAULTS.wheat[key]);
  for (const { key, min, max } of WIND_GRASS_SLIDERS) grass[key] = clp(s?.grass?.[key], min, max, WIND_DEFAULTS.grass[key]);
  for (const { key, min, max } of WIND_TREE_SLIDERS)  tree[key]  = clp(s?.tree?.[key],  min, max, WIND_DEFAULTS.tree[key]);
  return { enabled: s?.enabled !== false, wheat, grass, tree };
}
// Applique en live les valeurs réelles si activé, ou des valeurs figées (amplitude nulle)
// si désactivé — les sliders/valeurs stockées ne sont PAS remis à zéro, juste l'effet visuel.
// `forestGroup` passé en paramètre (et non capturé) : cette fonction est au niveau module,
// hors de la portée de `forestOverlay` (paramètre de wireEdaPanel).
function _applyWindLive(cur, forestGroup) {
  const wheatEff = cur.enabled ? cur.wheat : { ...cur.wheat, strength: 0 };
  const grassEff = cur.enabled ? cur.grass : { ...cur.grass, strength: 0, sway: 0 };
  const treeEff  = cur.enabled ? cur.tree  : { ...cur.tree,  strength: 0 };
  setWheatWindParams(wheatEff);
  setGrassWindParams(grassEff);
  setTreeWindParams(forestGroup, treeEff);
}
const _windStore = makeStore(WIND_STORAGE_KEY);
const _readWindStored     = () => _windStore.read();
const _storeWindSettings  = (s) => _windStore.write(s);

// ─── NUAGES HUD constants (nuages à l'horizon, mode jour) ──────────────────
const CLOUD_STORAGE_KEY = 'hexistenz_cloud_hud_v1';
const CLOUD_SLIDERS = [
  { key: 'coverage', label: 'Couverture',    min: 0,     max: 1.000, step: 0.01  },
  { key: 'scale',    label: 'Échelle motif', min: 0.010, max: 0.060, step: 0.001 },
  { key: 'speed',    label: 'Vitesse dérive', min: 0,    max: 0.300, step: 0.005 },
];
const CLOUD_DEFAULTS = Object.freeze({ enabled: true, coverage: 0.41, scale: 0.026202, speed: 0.09450 });
function _normalizeCloud(s) {
  const clp = (v, mn, mx, d) => { const n = Number(v); return isFinite(n) ? Math.min(mx, Math.max(mn, n)) : d; };
  const out = { enabled: s?.enabled !== false };
  for (const { key, min, max } of CLOUD_SLIDERS) out[key] = clp(s?.[key], min, max, CLOUD_DEFAULTS[key]);
  return out;
}
const _cloudStore = makeStore(CLOUD_STORAGE_KEY);
const _readCloudStored     = () => _cloudStore.read();
const _storeCloudSettings  = (s) => _cloudStore.write(s);

const LUT_STORAGE_KEY = 'hexistenz_lut_v1';
const _lutStore = makeStore(LUT_STORAGE_KEY);

// Appelé par applyAll(), donc à CHAQUE évènement `input` d'un slider LUT : c'est le
// plus chaud des chemins de persistance du panel → debouncé comme les autres.
function saveLutConfig(exportedConfig) {
  _lutStore.write(exportedConfig);
}

function loadLutConfig() {
  try {
    const raw = localStorage.getItem(LUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

// ─── Sections LUT — sliders + couleurs regroupés par thème ─────────────────
const LUT_SECTIONS = [
  {
    key: 'lutFog',
    label: '🌫️ 1. Brouillard',
    sliders: [
      ['environment.fogDensity', 'Densité expon.',  0.000, 0.500, 0.001],
      ['environment.fogNear',    'Début (linéaire)',       0,     60,    0.5],
      ['environment.fogFar',     'Fin (linéaire)',         0,     200,   1],
    ],
    colors: [
      ['environment.skyColor',        'Ciel'],
      ['environment.fogColor',        'Couleur brouillard'],
      ['environment.domeColorTop',    'Dôme haut'],
      ['environment.domeColorBottom', 'Dôme bas'],
    ]
  },
  {
    key: 'lutSun',
    label: '💡 2. Astre lumineux',
    sliders: [
      ['renderer.toneMappingExposure', 'Exposition globale', 0.05, 6.00, 0.01],
      ['lights.hemisphereIntensity', 'Intensité hémisphère', 0.00,  4.00,  0.01],
      ['lights.sunIntensity',        'Intensité',            0.00,  15.00, 0.05],
      ['lights.sunOrbitRadius',      'Rayon orbite',         0.5,   50.0,  0.1],
      ['lights.sunOrbitHeight',      'Hauteur orbite',       0.0,   40.0,  0.1],
      ['lights.sunOrbitSpeed',       'Vitesse orbite',       0.0,   1.00,  0.001],
      ['lights.sunVisualScale',      'Taille',                0.05,  8.00,  0.01],
      ['lights.fillIntensity',       'Fill light',           0.00,  3.00,  0.005],
    ],
    colors: [
      ['lights.hemisphereSkyColor',    'Hémisphère ciel'],
      ['lights.hemisphereGroundColor', 'Hémisphère sol'],
      ['lights.sunColor',              'Soleil'],
      ['lights.fillColor',             'Fill'],
    ]
  },
  {
    key: 'lutGrading',
    label: '🎚️ 3. Étalonnage',
    toggleId: 'debugGradingEnabled',
    togglePath: 'grading.enabled',
    sliders: [
      ['grading.brightness',  'Luminosité',      -1.00, 1.00,  0.005],
      ['grading.contrast',    'Contraste',        0.00, 5.00,  0.01],
      ['grading.saturation',  'Saturation',       0.00, 5.00,  0.01],
      ['grading.vibrance',    'Vibrance',        -2.00, 2.00,  0.01],
      ['grading.hue',         'Décalage teinte', -0.50, 0.50,  0.001],
      ['grading.gamma',       'Gamma',            0.10, 4.00,  0.01],
      ['grading.blackLevel',  'Niveaux noirs',    0.00, 0.80,  0.001],
      ['grading.whiteLevel',  'Niveaux blancs',   0.05, 1.00,  0.001],
      ['grading.red',         'Canal rouge',      0.00, 4.00,  0.01],
      ['grading.green',       'Canal vert',       0.00, 4.00,  0.01],
      ['grading.blue',        'Canal bleu',       0.00, 4.00,  0.01],
      ['grading.redCurve',    'Courbe rouge',     0.00, 6.00,  0.01],
      ['grading.greenCurve',  'Courbe vert',      0.00, 6.00,  0.01],
      ['grading.blueCurve',   'Courbe bleu',      0.00, 6.00,  0.01],
    ]
  },
  {
    key: 'lutPalette',
    label: '🎨 4. Palette biomes',
    toggleId: 'debugPaletteEnabled',
    togglePath: 'palette.enabled',
    sliders: [
      ['palette.strength',   'Force palette',  0.00,  1.00,  0.01],
      ['palette.saturation', 'Saturation',     0.00,  4.00,  0.01],
      ['palette.contrast',   'Contraste',      0.00,  4.00,  0.01],
      ['palette.warmShift',  'Chaud / froid', -0.50,  0.50,  0.001],
    ],
    colors: [
      ['palette.targets.field',  'Champs'],
      ['palette.targets.forest', 'Forêts'],
      ['palette.targets.grass',  'Prairies'],
      ['palette.targets.house',  'Villages'],
      ['palette.targets.rail',   'Voies ferrées'],
      ['palette.targets.water',  'Eau'],
    ],
    biomeColors: true   // couleurs rendu en grille 2 colonnes
  },
];


// ─── Presets d'ambiance — chargés depuis ambiances.json ─────────────────────
// Chaque preset : { name, bg, pixelization?, delta, cinema }
// cinema contient la config cinématique (scan lines, halation, barrel…)
// Presets rétro CRT : scanLines > 0 ; tous les autres : scanLines = 0.
// 2026-08-02 — cache-busting (même bug que json/languages/*.json, cf. gameLangReactive.js
// getLangUrl / CONTEXT.md §26) : ce fetch n'avait aucun ?v=, donc le navigateur pouvait
// continuer à servir un ambiances.json périmé indéfiniment après modification sur disque —
// cause confirmée d'un retour "les presets n'ont pas changé" alors que le fichier servi par
// le serveur était bien à jour. Ajout d'un ?v=HEXISTENZ_VERSION, même mécanisme que le
// cssVersion PHP utilisé pour les feuilles de style.
const VISUAL_PRESETS = await fetch(`./json/ambiances.json?v=${HEXISTENZ_VERSION}`)
  .then(r => r.json())
  .catch(e => { console.error('[edaPanelWiring] Impossible de charger ambiances.json :', e); return []; });

// Passage bilingue FR/EN le 2026-07-12 : mini-HUD clavier (bas d'écran), textes
// sous json/languages/{french,english}.json (clé game.kbdHint), même mécanisme
// que les autres modules (top-level await + localStorage 'hexistenz_pres_lang').
const _edaLangFile = getLangFile();
// `let` (pas `const`) : ce texte est baké UNE FOIS dans le DOM du mini-HUD clavier
// (kbdHint.innerHTML, plus bas) au lieu d'être relu à chaque frame — il faut donc
// à la fois réassigner la variable ET repousser la nouvelle valeur dans le DOM déjà
// créé quand la langue change en jeu (cf. registerLangRefresh ci-dessous).
let _kbdHintText = '';
// Textes du panneau EDA nécessitant une substitution ({name}/{label}/{value}) ou un
// état transitoire (bouton Comparer/⟳ Retour, confirmation "✓ Copié !") : le moteur
// générique data-i18n (gameHudI18n.js) ne fait qu'un simple remplacement de texte, pas
// de templating — ces quelques chaînes calculées à la volée restent donc lues ici,
// dans un objet `const` muté en place (même convention que les autres modules).
const _edaText = {};

{
  const _langData = await fetch(`./json/languages/${_edaLangFile}.json?v=${getLangVersion()}`)
    .then(r => r.json())
    .catch(err => {
      console.error(`[edaPanelWiring] Impossible de charger ${_edaLangFile}.json`, err);
      return {};
    });
  _kbdHintText = _langData?.game?.kbdHint ?? '';
  Object.assign(_edaText, _langData?.game?.eda ?? {});
}

registerLangRefresh((data) => {
  _kbdHintText = data?.game?.kbdHint ?? '';
  const kbdHintEl = document.getElementById('kbdHintHud');
  if (kbdHintEl) {
    kbdHintEl.innerHTML = '<div class="internal-parchment">' + (_kbdHintText || 'H ou ESC&nbsp;→ aide &nbsp;|&nbsp; M&nbsp;→ mute &nbsp;|&nbsp; ESPACE&nbsp;→ immersif &nbsp;|&nbsp; MAJ+ESPACE&nbsp;→ super-immersif') + '</div>';
  }
  for (const k of Object.keys(_edaText)) delete _edaText[k];
  Object.assign(_edaText, data?.game?.eda ?? {});
});

// ─── Markup — contenu de .debug-light-body, extrait du template racine ─────
// (le compteur FPS + les 2 boutons #fpsHudToggle/#debugLightToggle restent dans la façade
// edaPanelHost.js, qui assemble .debug-light-left-col + EDA_BODY_HTML dans le même root.)
export const EDA_BODY_HTML = `
    <div class="debug-light-body">
      <button type="button" class="debug-light-close" title="Fermer" aria-label="Fermer">×</button>
      <div class="internal-parchment">
      <div class="debug-light-main-title" data-i18n="game.eda.mainTitle">Éditeur de direction artistique</div>

      <div class="debug-light-header">
        <div class="debug-light-presets-label"><span class="rubrique-emoji">🎨</span> <span data-i18n="game.eda.ambiances">AMBIANCES</span></div>
        <div id="debugLightPresets" class="debug-light-presets"></div>
      </div><!-- /.debug-light-header -->

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-tabs" role="tablist">
        <button type="button" class="debug-light-tab-btn" data-tab="1" role="tab" data-i18n="game.eda.tabs.lut">LUT</button>
        <button type="button" class="debug-light-tab-btn" data-tab="2" role="tab" data-i18n="game.eda.tabs.cinematic">Cinématique</button>
        <button type="button" class="debug-light-tab-btn" data-tab="3" role="tab" data-i18n="game.eda.tabs.environment">Environnement</button>
      </div><!-- /.debug-light-tabs -->

      <div class="debug-light-tab-panels">

      <div class="debug-light-tab-panel" data-tab-panel="1">
        <div class="debug-light-columns" id="debugLightControls"></div>
      </div><!-- /.debug-light-tab-panel[1] -->

      <div class="debug-light-tab-panel" data-tab-panel="2">
      <div class="debug-light-columns">

      <div class="debug-light-cinema-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🎬</span> <span data-i18n="game.eda.headers.cinema1">1. CINÉMATIQUE</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.cinema1" title="Activer / désactiver les effets cinématiques">
            <input id="cinEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.vignette" data-i18n="game.eda.labels.cin.vignette">Vignette</span>
          <input id="cinVignette" type="range" min="0" max="2" step="0.01" />
          <output id="cinVignetteValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.grain" data-i18n="game.eda.labels.cin.grain">Grain film</span>
          <input id="cinGrain" type="range" min="0" max="1" step="0.01" />
          <output id="cinGrainValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.chromatic" data-i18n="game.eda.labels.cin.chromatic">Aberration chr.</span>
          <input id="cinChromatic" type="range" min="0" max="1" step="0.01" />
          <output id="cinChromaticValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.halation" data-i18n="game.eda.labels.cin.halation">Halation</span>
          <input id="cinHalation" type="range" min="0" max="1" step="0.01" />
          <output id="cinHalationValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.barrel" data-i18n="game.eda.labels.cin.barrel">Distorsion barillet</span>
          <input id="cinBarrel" type="range" min="0" max="1" step="0.01" />
          <output id="cinBarrelValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.scanLines" data-i18n="game.eda.labels.cin.scanLines">Scan lines</span>
          <input id="cinScanLines" type="range" min="0" max="6" step="1" />
          <output id="cinScanLinesValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.scanLinesIntensity" data-i18n="game.eda.labels.cin.scanLinesIntensity">Intensité scanlines</span>
          <input id="cinScanLinesIntensity" type="range" min="0" max="1" step="0.01" />
          <output id="cinScanLinesIntensityValue"></output>
        </div>
      </div><!-- /1. CINÉMATIQUE -->

      <div class="debug-light-cinema-section">
        <div class="debug-light-pix-head">
          <span>${_emojiHeadHtml('🌅 2. God Rays', 'game.eda.headers.godRays')}</span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.godRays" title="Activer / désactiver les god rays">
            <input id="godRaysEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-subgroup" id="godRaysRows">
        <div class="debug-light-row">
          <span data-help="cin.godRays" data-i18n="game.eda.labels.cin.godRays">Intensité</span>
          <input id="cinGodRays" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysLength" data-i18n="game.eda.labels.cin.godRaysLength">Longueur</span>
          <input id="cinGodRaysLength" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysLengthValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysDiffusion" data-i18n="game.eda.labels.cin.godRaysDiffusion">Diffusion</span>
          <input id="cinGodRaysDiffusion" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysDiffusionValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysThreshold" data-i18n="game.eda.labels.cin.godRaysThreshold">Seuil luminosité</span>
          <input id="cinGodRaysThreshold" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysThresholdValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysLayers" data-i18n="game.eda.labels.cin.godRaysLayers">Feuilletage</span>
          <input id="cinGodRaysLayers" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysLayersValue"></output>
        </div>
        </div><!-- /#godRaysRows -->
      </div><!-- /2. God Rays -->

      <div class="debug-light-cinema-section">
        <div class="debug-light-pix-head">
          <span>${_emojiHeadHtml('🎞️ 3. Tilt-shift', 'game.eda.headers.tiltShift')}</span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.tiltShift" title="Activer / désactiver le tilt-shift">
            <input id="tiltShiftEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-subgroup" id="tiltShiftRows">
        <div class="debug-light-row">
          <span data-help="cin.tilt" data-i18n="game.eda.labels.cin.tilt">Intensité</span>
          <input id="cinTilt" type="range" min="0" max="1" step="0.01" />
          <output id="cinTiltValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.focusCenter" data-i18n="game.eda.labels.cin.focusCenter">Centre focus</span>
          <input id="cinFocusCenter" type="range" min="0" max="1" step="0.01" />
          <output id="cinFocusCenterValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.focusBand" data-i18n="game.eda.labels.cin.focusBand">Zone nette</span>
          <input id="cinFocusBand" type="range" min="0" max="1" step="0.01" />
          <output id="cinFocusBandValue"></output>
        </div>
        </div><!-- /#tiltShiftRows -->
      </div><!-- /3. Tilt-shift -->

      <div class="debug-light-cinema-section">
        <div class="debug-light-pix-head">
          <span>${_emojiHeadHtml('✨ 4. Bloom', 'game.eda.headers.bloom')}</span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.bloom" title="Activer / désactiver le bloom">
            <input id="bloomEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-subgroup" id="bloomRows">
        <div class="debug-light-row">
          <span data-help="cin.bloomIntensity" data-i18n="game.eda.labels.cin.bloomIntensity">Intensité</span>
          <input id="cinBloomIntensity" type="range" min="0" max="2" step="0.01" />
          <output id="cinBloomIntensityValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.bloomThreshold" data-i18n="game.eda.labels.cin.bloomThreshold">Seuil</span>
          <input id="cinBloomThreshold" type="range" min="0" max="1" step="0.01" />
          <output id="cinBloomThresholdValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.bloomRadius" data-i18n="game.eda.labels.cin.bloomRadius">Rayon</span>
          <input id="cinBloomRadius" type="range" min="0" max="8" step="0.1" />
          <output id="cinBloomRadiusValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.bloomSoftness" data-i18n="game.eda.labels.cin.bloomSoftness">Douceur</span>
          <input id="cinBloomSoftness" type="range" min="0" max="1" step="0.01" />
          <output id="cinBloomSoftnessValue"></output>
        </div>
        </div><!-- /#bloomRows -->
      </div><!-- /4. Bloom -->

      <div class="debug-light-pix-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">👾</span> <span data-i18n="game.eda.headers.pixelisation">5. PIXELISATION</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.pixelisation" title="Activer / désactiver la pixelisation">
            <input id="pixEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.pixelSize" data-i18n="game.eda.labels.pix.pixelSize">Rayon (pixels)</span>
          <input id="pixPixelSize" type="range" min="1" max="50" step="1" />
          <output id="pixPixelSizeValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.normalEdge" data-i18n="game.eda.labels.pix.normalEdge">Contour relief</span>
          <input id="pixNormalEdge" type="range" min="0" max="1" step="0.01" />
          <output id="pixNormalEdgeValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.depthEdge" data-i18n="game.eda.labels.pix.depthEdge">Contour profondeur</span>
          <input id="pixDepthEdge" type="range" min="0" max="1" step="0.01" />
          <output id="pixDepthEdgeValue"></output>
        </div>
      </div><!-- /5. PIXELISATION -->

      <div class="debug-light-crt-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">📺</span> <span data-i18n="game.eda.headers.crt">6. COURBURE ÉCRAN</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.crt" title="Activer / désactiver la courbure écran">
            <input id="crtEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.crtCurvature" data-i18n="game.eda.labels.cin.crtCurvature">Courbure écran</span>
          <input id="cinCrtCurvature" type="range" min="0" max="1" step="0.01" />
          <output id="cinCrtCurvatureValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.crtMask" data-i18n="game.eda.labels.cin.crtMask">Bords noirs</span>
          <input id="cinCrtMask" type="range" min="0" max="1" step="0.01" />
          <output id="cinCrtMaskValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.crtCornerDark" data-i18n="game.eda.labels.cin.crtCornerDark">Assombr. coins CRT</span>
          <input id="cinCrtCornerDark" type="range" min="0" max="1" step="0.01" />
          <output id="cinCrtCornerDarkValue"></output>
        </div>
      </div><!-- /6. COURBURE ÉCRAN -->

      </div><!-- /.debug-light-columns -->
      </div><!-- /.debug-light-tab-panel[2] -->

      <div class="debug-light-tab-panel" data-tab-panel="3">
      <div class="debug-light-columns">

      <div class="debug-light-water-section">
        <div id="debugLightWaterControls"></div>
      </div>

      <div class="debug-light-cloud-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">☁️</span> <span data-i18n="game.eda.headers.nuages">3. NUAGES</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.nuages" title="Activer / désactiver les nuages">
            <input id="cloudEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div id="debugLightCloudControls"></div>
      </div>

      <div class="debug-light-wind-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌬️</span> <span data-i18n="game.eda.headers.vent">4. VENT</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.vent" title="Activer / désactiver tous les vents (blé, prairie, arbres)">
            <input id="windEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div id="debugLightWindControls"></div>
      </div>

      <div class="debug-light-worldshape-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌐</span> <span data-i18n="game.eda.headers.worldShape">5. Forme du monde</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.worldShape" title="Basculer entre monde bouliste (sphère) et platiste (plat)">
            <input id="worldShapeToggle" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.worldShape" data-i18n="game.eda.modeActuel">Mode actuel</span>
          <output id="worldShapeModeLabel" style="grid-column: 3;"></output>
        </div>
      </div>

      <div class="debug-light-daynight-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌓</span> <span data-i18n="game.eda.headers.dayNight">6. Jour / Nuit</span></span>
          <label class="pix-switch" data-i18n-title="game.eda.toggleTitles.dayNight" title="Basculer entre jour et nuit">
            <input id="dayNightToggle" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="env.dayNight" data-i18n="game.eda.modeActuel">Mode actuel</span>
          <output id="dayNightModeLabel" style="grid-column: 3;"></output>
        </div>
      </div>

      <div class="debug-light-quality-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🎚️</span> <span data-i18n="game.eda.headers.quality">7. Qualité / densité</span></span>
        </div>
        <div class="debug-light-presets-label" style="margin-top:10px;" data-i18n="game.eda.preregalages">Préréglages</div>
        <div id="debugLightQualityPresets" class="debug-light-presets"></div>
        <div id="debugLightQualityControls"></div>
      </div>

      <div class="debug-light-weather-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌦️</span> <span data-i18n="game.eda.headers.weather">8. Météo</span></span>
        </div>
        <!-- Refonte 2026-07-12 (livraison Cyril « nuages metaball + pluie + impacts ») :
             UN seul host pour tous les items VFX + évènements (brume, lucioles, nuages,
             pluie, orage, éclair, feu, panique). Chaque item porte son propre switch +
             (si applicable) ses sliders — cf. wireEdaPanel::vfxGroups. Le bouton
             "⏹ Tout arrêter" reste en fin de rubrique pour couper tous les évènements. -->
        <div id="debugLightVfxControls"></div>
        <button type="button" id="debugLightWeatherStopAll" class="debug-light-weather-stopall" data-i18n="game.eda.weatherStopAll" data-i18n-title="game.eda.weatherStopAllTitle" title="Arrête tous les évènements environnementaux en cours">⏹ Tout arrêter</button>
      </div>

      </div><!-- /.debug-light-columns -->
      </div><!-- /.debug-light-tab-panel[3] -->

      </div><!-- /.debug-light-tab-panels -->

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-footer">
        <div class="debug-light-export">
          <div class="debug-light-export-row">
            <button id="debugLightCopy" type="button" data-i18n="game.eda.footer.copy" data-i18n-title="game.eda.footer.copyTitle" title="Copier tous les paramètres LUT + PIX + EAU + CINÉMA + VENT + NUAGES + Forme du monde + Jour/Nuit + Densité + Météo courants en JSON (base pour un futur preset d'ambiance intégrant des effets météo pré-configurés)">📋 Copier</button>
            <button id="debugLightUndo" type="button" disabled data-i18n="game.eda.footer.undo" data-i18n-title="game.eda.footer.undoTitle" title="Annuler la dernière modification (Undo)">↩ Undo</button>
            <button id="debugLightRedo" type="button" disabled data-i18n="game.eda.footer.redo" data-i18n-title="game.eda.footer.redoTitle" title="Rétablir la modification annulée (Redo)">↪ Redo</button>
            <button id="debugLightReset" type="button" data-i18n="game.eda.footer.reset" data-i18n-title="game.eda.footer.resetTitle" title="Réinitialiser aux valeurs par défaut">Reset</button>
          </div>
          <div class="debug-light-export-row">
            <button id="debugLightCompare" type="button" disabled data-i18n="game.eda.footer.compare" data-i18n-title="game.eda.footer.compareTitle" title="Basculer entre paramètres courants et dernière ambiance">Comparer</button>
            <span id="debugLightLastPreset" class="debug-light-last-preset" data-i18n-title="game.eda.footer.lastPresetTitle" title="Dernière ambiance appliquée">—</span>
          </div>
        </div>
      </div><!-- /.debug-light-footer -->
      </div>
    </div>
`;

export function wireEdaPanel(root, { visualEnvironment, postprocess, forestOverlay = null, cloudSky = null, environmentDirector = null, fpsApi }) {
  const state = visualEnvironment.config ?? cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG);

  const savedConfig = loadLutConfig();
  if (savedConfig) {
    try { replaceDeep(state, savedConfig); } catch (_) { /* config corrompue, on ignore */ }
  }

  // ─── Onglets EDA (TITRE 1/2/3) — regroupent les rubriques sous le header ambiances ──
  // Contenu affiché en flux "journal" sur 3 colonnes fluides (les rubriques remplissent la
  // colonne 1, puis la 2, puis la 3, sans jamais être coupées à cheval sur deux colonnes).
  const EDA_TAB_STORAGE_KEY = 'hexistenz_eda_tab';
  const tabBtns   = root.querySelectorAll('.debug-light-tab-btn');
  const tabPanels = root.querySelectorAll('.debug-light-tab-panel');
  function _setActiveTab(tabId) {
    tabBtns.forEach(btn => btn.classList.toggle('debug-light-tab-btn--active', btn.dataset.tab === tabId));
    tabPanels.forEach(p => p.classList.toggle('debug-light-tab-panel--active', p.dataset.tabPanel === tabId));
    try { localStorage.setItem(EDA_TAB_STORAGE_KEY, tabId); } catch (_) { /* quota */ }
  }
  tabBtns.forEach(btn => btn.addEventListener('click', () => _setActiveTab(btn.dataset.tab)));
  const _initialTab = (() => {
    try { return localStorage.getItem(EDA_TAB_STORAGE_KEY); } catch (_) { return null; }
  })();
  _setActiveTab(['1', '2', '3'].includes(_initialTab) ? _initialTab : '1');

  const controls    = root.querySelector('#debugLightControls');
  const undoBtn     = root.querySelector('#debugLightUndo');
  const redoBtn     = root.querySelector('#debugLightRedo');
  const compareBtn  = root.querySelector('#debugLightCompare');
  const lastPresetEl = root.querySelector('#debugLightLastPreset');

  // ─── Undo / Redo stacks — modifications manuelles ────────────────────────
  const UNDO_MAX   = 30;
  const _undoStack = [];
  const _redoStack = [];
  // ─── Compare — bascule courant ↔ dernière ambiance ────────────────────────
  let lastPresetState        = null;   // snapshot config après dernier clic preset
  let lastPresetPixelization = null;  // pixelisation associée au dernier preset
  let lastPresetCinema       = null;  // cinéma associé au dernier preset
  let lastPresetWind         = null;  // vent associé au dernier preset
  let lastPresetCloud        = null;  // nuages associés au dernier preset
  let lastPresetWater        = null;  // eau (écume/sillage) associée au dernier preset
  let _lastAppliedPreset     = null;  // référence au preset appliqué → re-traduire son nom au changement de langue
  registerLangRefresh(() => {
    if (_lastAppliedPreset) {
      const m = _lastAppliedPreset.name.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
      const raw = m ? _lastAppliedPreset.name.slice(m[0].length) : _lastAppliedPreset.name;
      const label = _lastAppliedPreset.key ? (_edaText.presetNames?.[_lastAppliedPreset.key] ?? raw) : raw;
      lastPresetEl.textContent = m ? `${m[1]} ${label}` : label;
    }
  });
  let _comparing             = false;
  let _stateBeforeCompare    = null;  // snapshot state au moment du clic "Comparer" → restauré par "⟳ Retour"
  let _pixelBeforeCompare    = null;  // pixelisation en cours avant entrée en mode comparer
  let _cinBeforeCompare      = null;  // cinéma en cours avant entrée en mode comparer
  let _windBeforeCompare     = null;  // vent en cours avant entrée en mode comparer
  let _cloudBeforeCompare    = null;  // nuages en cours avant entrée en mode comparer
  let _waterBeforeCompare    = null;  // eau en cours avant entrée en mode comparer

  // ─── Rendu des contrôles LUT par section ────────────────────────────────────
  // Les sections avec `togglePath` (Étalonnage, Palette biomes) portent un switch
  // en face de leur titre (même CSS/effet que PIXELISATION et CINÉMA) : active/désactive
  // toute la rubrique et grise ses contrôles.
  for (const section of LUT_SECTIONS) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'lut-section';

    const hd = document.createElement('div');
    hd.className = 'lut-section-head';

    if (section.togglePath) {
      hd.classList.add('lut-section-head--with-toggle');
      hd.innerHTML =
        `<span>${_emojiHeadHtml(section.label, `game.eda.headers.${section.key}`)}</span>` +
        `<label class="pix-switch" data-i18n-title="game.eda.toggleTitles.${section.key}" title="Activer / désactiver ${section.label.replace(/^\S+\s+[\d.]+\s*/, '').toLowerCase()}">` +
          `<input id="${section.toggleId}" type="checkbox" /><span></span>` +
        `</label>`;
    } else {
      hd.innerHTML = `<span>${_emojiHeadHtml(section.label, `game.eda.headers.${section.key}`)}</span>`;
    }
    sectionEl.appendChild(hd);

    for (const [path, label, min, max, step] of (section.sliders ?? [])) {
      sectionEl.appendChild(createSlider(state, path, label, min, max, step, applyAll, pushUndo));
    }

    if (section.colors?.length) {
      // Toutes les couleurs en grille 2 colonnes compacte
      const grid = document.createElement('div');
      grid.className = 'color-grid';
      for (const [path, label] of section.colors) {
        grid.appendChild(createColorPicker(state, path, label, applyAll, pushUndo));
      }
      sectionEl.appendChild(grid);
    }

    // Les 4 rubriques LUT sont posées directement dans `#debugLightControls`
    // (= `.debug-light-columns`) : le flux journal 3-colonnes les répartit tout seul.
    // Plus de séparateur visible entre rubriques : l'espacement vient du margin-bottom
    // uniforme appliqué en CSS à chaque enfant direct de `.debug-light-columns`.
    controls.appendChild(sectionEl);

    if (section.togglePath) {
      const toggleEl = sectionEl.querySelector(`#${section.toggleId}`);
      const _renderToggle = () => {
        const enabled = getPath(state, section.togglePath) !== false;
        toggleEl.checked = enabled;
        sectionEl.classList.toggle('lut-section--disabled', !enabled);
      };
      toggleEl.addEventListener('change', () => {
        setPath(state, section.togglePath, toggleEl.checked);
        sectionEl.classList.toggle('lut-section--disabled', !toggleEl.checked);
        applyAll();
      });
      _renderToggle();
    }
  }

  // ─── Preset buttons ─────────────────────────────────────────────────────────
  const presetsContainer = root.querySelector('#debugLightPresets');
  for (const preset of VISUAL_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'debug-light-preset-btn';
    // Nom traduisible : preset.key sert de clé stable vers game.eda.presetNames
    // (indépendante de l'emoji/nom FR d'origine), avec repli sur preset.name si absent.
    const _emojiMatch = preset.name.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
    const _rawLabel = _emojiMatch ? preset.name.slice(_emojiMatch[0].length) : preset.name;
    const _label = preset.key ? (_edaText.presetNames?.[preset.key] ?? _rawLabel) : _rawLabel;
    const _i18nAttr = preset.key ? ` data-i18n="game.eda.presetNames.${preset.key}"` : '';
    if (_emojiMatch) {
      const _emoji = _emojiMatch[1];
      btn.innerHTML = `<span class="preset-emoji">${_emoji}</span>${_rawLabel ? `<span class="preset-label"${_i18nAttr}>${_label}</span>` : ''}`;
    } else {
      btn.innerHTML = `<span${_i18nAttr}>${_label}</span>`;
    }
    const _displayName = _emojiMatch ? `${_emojiMatch[1]} ${_label}` : _label;
    btn.title = preset.delta
      ? (_edaText.presetTooltipApply ?? `Appliquer l'ambiance « {name} »`).replace('{name}', _displayName)
      : (_edaText.presetTooltipDefault ?? 'Retour aux valeurs par défaut');
    btn.addEventListener('click', () => {
      pushUndo(); // capture avant le changement → annulable
      const fresh = cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG);
      if (preset.delta) applyDelta(fresh, preset.delta);
      replaceDeep(state, fresh);
      refreshInputs(root, state);
      // Pixelisation indépendante du LUT config.
      // Presets retro : leur pixelization inclut enabled:true → active la grille.
      // Autres presets : désactive explicitement la pixelisation (enabled:false).
      const pix = preset.pixelization ?? { enabled: false, pixelSize: 1 };
      _commitPix(pix);
      // Cinéma : config intégrée dans ambiances.json (scanLines > 0 pour presets rétro CRT)
      const cin = preset.cinema ?? { enabled: true };
      _commitCin(cin);
      // Vent : config intégrée dans ambiances.json (ex. Psyché-LSD). Absent → WIND_DEFAULTS
      // (objet complet, tous les sous-champs présents) plutôt qu'un merge partiel sur
      // _windCurrent, pour éviter que le vent d'un preset ne "fuite" sur le suivant —
      // même piège que celui rencontré avec crtEnabled sur les ambiances CRT.
      const wind = preset.wind ?? WIND_DEFAULTS;
      _commitWind(wind);
      // Nuages : même logique que le vent — remplacement complet (pas de merge partiel)
      // pour éviter qu'une couverture/vitesse de nuages d'un preset ne fuite sur le suivant.
      const cloud = preset.cloud ?? CLOUD_DEFAULTS;
      _commitCloud(cloud);
      // Eau (écume/sillage) : idem, remplacement complet. Absent → WATER_DEFAULTS.
      const water = preset.water ?? WATER_DEFAULTS;
      _commitWater(water);
      // Jour/Nuit : contrairement à vent/nuages/eau, on ne force PAS de valeur par défaut
      // si le preset ne le précise pas (contrairement au reste, ce n'est pas un simple
      // "effet visuel" mais un mode d'éclairage global — un preset silencieux dessus ne
      // doit pas basculer le jour/nuit courant du joueur). Appliqué seulement si présent.
      if (preset.dayNight && preset.dayNight !== _dayNightCurrent) {
        _dayNightCurrent = preset.dayNight;
        localStorage.setItem('hexistenz_daynightmode', preset.dayNight);
        _renderDayNightControls();
        document.dispatchEvent(new CustomEvent('hexistenz:dayNightChange', { detail: { mode: preset.dayNight } }));
      }
      // 2026-08-04 — demande explicite : les 14 ambiances prédéfinies pilotent
      // désormais aussi la rubrique 7 "Qualité / densité" (jusqu'ici un réglage
      // MACHINE/perf pur, jamais touché par un preset — cf. commentaire détaillé
      // plus bas). Même logique que Jour/Nuit ci-dessus : appliqué seulement si le
      // preset le précise, silencieux sinon (pas de valeur par défaut forcée qui
      // écraserait un réglage machine que le joueur a lui-même choisi). La UI de
      // la rubrique 7 (_qualityDensitySlider) est déclarée plus bas dans cette
      // même fonction mais déjà initialisée au moment où ce handler s'exécute
      // (clic utilisateur, forcément après la construction complète du panneau).
      if (typeof preset.density === 'number' && preset.density !== getContentDensity()) {
        setContentDensity(preset.density);
        if (_qualityDensitySlider) {
          _qualityDensitySlider.input.value = String(preset.density);
          _qualityDensitySlider.output.textContent = formatNumber(preset.density);
        }
      }
      applyAll();
      // Snapshot pour "Comparer"
      lastPresetState        = JSON.parse(JSON.stringify(state));
      lastPresetPixelization = pix;
      lastPresetCinema       = cin;
      lastPresetWind         = wind;
      lastPresetCloud        = cloud;
      lastPresetWater        = water;
      _lastAppliedPreset = preset;
      lastPresetEl.textContent = _displayName;
      compareBtn.disabled   = false;
      _comparing            = false;
      _updateCompareBtn();
      // 2026-07-29 — annonce vocale (TTS) du bouton ambiance cliqué, dans la langue
      // en cours : "{ambiancePrefix} {nom}" (ex. FR → "ambiance nordique"). Même
      // mécanisme que le TTS du sélecteur de thème (edaPanelHost.js) : resetTtsQueue()
      // pour ne pas empiler sur une annonce précédente. IMPORTANT : ne PAS réutiliser
      // la variable `_label` capturée à la construction du bouton (fermeture figée à
      // la langue active au chargement de la page) — après un changement de langue en
      // jeu, seul le TEXTE VISIBLE du bouton est retraduit (via data-i18n/registerLangRefresh),
      // pas cette fermeture JS. Sans ce recalcul, le TTS annoncerait l'ancienne langue
      // (bug constaté en testant FR→RU : le texte affiché passait bien en russe mais le
      // TTS restait sur le libellé français). `_edaText` est muté en place à chaque
      // changement de langue (cf. registerLangRefresh plus haut) → toujours à jour ici.
      const _currentLabel = preset.key ? (_edaText.presetNames?.[preset.key] ?? _rawLabel) : _rawLabel;
      const _ambiancePrefix = _edaText.ambiancePrefix ?? 'ambiance';
      resetTtsQueue();
      speak(`${_ambiancePrefix} ${_currentLabel}`);
    });
    presetsContainer.appendChild(btn);
  }

  const lutToggleBtn = root.querySelector('#debugLightToggle');

  // ─── Ouvrir/fermer le LUT panel + masquer/restaurer les HUDs droits ─────────
  function _setLutOpen(isOpen) {
    root.classList.toggle('collapsed', !isOpen);
    lutToggleBtn.classList.toggle('debug-light-toggle--lut-active', isOpen);
    document.body.classList.toggle('lut-panel-open', isOpen);
    if (isOpen) _syncLutWidth();
    // Le HUD score se masque quand l'EDA est ouvert (et inversement) — même mécanisme
    // que le HUD FPS avancé, les deux conditions sont combinées dans hud_fps.js::_syncFpsFullscreen
    // (exposée ici via `fpsApi.syncFullscreen`, les deux HUDs partageant le même `root`).
    fpsApi.syncFullscreen();
    // 2026-07-29 — annonce vocale (TTS) "Éditeur de direction artistique" à
    // l'OUVERTURE uniquement (pas à la fermeture) — même choke point pour le
    // bouton, la croix de fermeture et la touche E, cf. les 3 appelants ci-dessous.
    if (isOpen) announceEdaOpened();
  }

  lutToggleBtn.addEventListener('click', () => {
    _setLutOpen(root.classList.contains('collapsed')); // collapsed → ouvrir, sinon fermer
  });
  // Croix de fermeture en haut à droite du panneau (2026-07-17, demande explicite,
  // même besoin que .fps-hud-close côté HUD FPS) — simple relais vers _setLutOpen(false).
  root.querySelector('.debug-light-close')?.addEventListener('click', () => _setLutOpen(false));
  // Touche E : ouvrir/fermer le panel EDA
  document.addEventListener('keydown', e => {
    if (e.key === 'e' || e.key === 'E') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // 2026-07-17 — en super-immersif (SHIFT+ESPACE, body.huds-force-hidden), le
      // bouton EDA est désactivé/masqué (cf. scene.js) mais ce listener global
      // continuait de basculer l'état interne (root non-collapsed, invisible via
      // CSS !important) — désync signalé par l'utilisateur comme "E fait quitter
      // le super-immersif". Ignoré tant que ce mode est actif, comme le bouton lui-même.
      if (document.body.classList.contains('huds-force-hidden')) return;
      _setLutOpen(root.classList.contains('collapsed'));
    }
  });

  // ─── Contrôles PIX embarqués dans le panel CUSTOMISATION ────────────────────
  // Initialiser depuis localStorage + appliquer au postprocess
  const _pixInitStored = _readPixStored();
  // Fallback worldShapeMode depuis le stockage dédié (dorfromantik.worldShapeMode)
  // worldShapeMode en DERNIER : getWorldShapeMode() (déjà forcé par initScene) prime
  // sur le stockage PIX pour que le choix bouliste/platiste du joueur soit respecté.
  let _pixCurrent = _normalizePix({ ...PIX_DEFAULTS, ...(_pixInitStored ?? {}), worldShapeMode: getWorldShapeMode() });
  postprocess?.applySettings?.(_pixCurrent);
  setWorldShapeMode(_pixCurrent.worldShapeMode);

  const pixEnabledEl  = root.querySelector('#pixEnabled');
  const pixSizeEl     = root.querySelector('#pixPixelSize');
  const pixSizeValEl  = root.querySelector('#pixPixelSizeValue');
  const pixNormalEl   = root.querySelector('#pixNormalEdge');
  const pixNormalValEl= root.querySelector('#pixNormalEdgeValue');
  const pixDepthEl    = root.querySelector('#pixDepthEdge');
  const pixDepthValEl = root.querySelector('#pixDepthEdgeValue');
  const worldShapeToggleEl    = root.querySelector('#worldShapeToggle');
  const worldShapeModeLabelEl = root.querySelector('#worldShapeModeLabel');

  function _renderPixControls(s) {
    _pixCurrent = _normalizePix(s);
    pixEnabledEl.checked     = _pixCurrent.enabled;
    pixSizeEl.value          = String(_pixCurrent.pixelSize);
    pixSizeValEl.textContent = String(_pixCurrent.pixelSize);
    pixNormalEl.value        = String(_pixCurrent.normalEdgeStrength);
    pixNormalValEl.textContent = _pixCurrent.normalEdgeStrength.toFixed(2);
    pixDepthEl.value         = String(_pixCurrent.depthEdgeStrength);
    pixDepthValEl.textContent  = _pixCurrent.depthEdgeStrength.toFixed(2);
    worldShapeToggleEl.checked        = _pixCurrent.worldShapeMode === 'bouliste';
    worldShapeModeLabelEl.innerHTML = _pixCurrent.worldShapeMode === 'bouliste'
      ? _emojiHeadHtml('🌍 Bouliste', 'game.eda.modes.bouliste')
      : _emojiHeadHtml('📐 Platiste', 'game.eda.modes.platiste');
    root.querySelector('.debug-light-pix-section').classList.toggle('pix-section--disabled', !_pixCurrent.enabled);
  }

  function _commitPix(partial) {
    const next = _normalizePix({ ..._pixCurrent, ...partial });
    postprocess?.applySettings?.(next);
    setWorldShapeMode(next.worldShapeMode);
    _renderPixControls(next);
    _storePixSettings(next);
  }

  // Sync depuis l'extérieur (presets appliquent pixelisation via postprocess)
  function _syncPixControls() {
    const ext = postprocess?.getSettings?.();
    if (ext) _renderPixControls({ ..._pixCurrent, ...ext });
  }

  // Undo/Redo couvrent aussi la pixelisation : capture de l'état AVANT modification.
  pixEnabledEl.addEventListener('change', () => { pushUndo(); _commitPix({ enabled: pixEnabledEl.checked }); });
  [pixSizeEl, pixNormalEl, pixDepthEl].forEach(el => el.addEventListener('pointerdown', () => pushUndo()));
  pixSizeEl.addEventListener('input', () => _commitPix({ pixelSize: Number(pixSizeEl.value) }));
  pixNormalEl.addEventListener('input', () => _commitPix({ normalEdgeStrength: Number(pixNormalEl.value) }));
  pixDepthEl.addEventListener('input', () => _commitPix({ depthEdgeStrength: Number(pixDepthEl.value) }));
  // Forme du monde : réglage "monde", pas "regard" → hors undo/redo, comme Jour/Nuit.
  // Case à cocher (onglet Environnement, rubrique 5) : cochée = bouliste, décochée = platiste.
  worldShapeToggleEl.addEventListener('change', () => {
    _commitPix({ worldShapeMode: worldShapeToggleEl.checked ? 'bouliste' : 'platiste' });
  });

  // ── Toggle Jour / Nuit (onglet Environnement, rubrique 6) ────────────────────
  // Case à cocher : cochée = jour (soleil), décochée = nuit (lune). Hors undo/redo, comme Forme du monde.
  const dayNightToggleEl    = root.querySelector('#dayNightToggle');
  const dayNightModeLabelEl = root.querySelector('#dayNightModeLabel');
  // Init depuis localStorage (scene.js écrit la valeur résolue au démarrage)
  let _dayNightCurrent = localStorage.getItem('hexistenz_daynightmode') === 'lune' ? 'lune' : 'soleil';
  function _renderDayNightControls() {
    dayNightToggleEl.checked        = _dayNightCurrent === 'soleil';
    dayNightModeLabelEl.innerHTML = _dayNightCurrent === 'soleil'
      ? _emojiHeadHtml('☀️ Jour', 'game.eda.modes.jour')
      : _emojiHeadHtml('🌙 Nuit', 'game.eda.modes.nuit');
  }
  _renderDayNightControls();
  dayNightToggleEl.addEventListener('change', () => {
    const mode = dayNightToggleEl.checked ? 'soleil' : 'lune';
    _dayNightCurrent = mode;
    localStorage.setItem('hexistenz_daynightmode', mode);
    _renderDayNightControls();
    document.dispatchEvent(new CustomEvent('hexistenz:dayNightChange', { detail: { mode } }));
  });
  // Sync depuis l'extérieur (ex. futur raccourci clavier qui changerait le mode directement)
  document.addEventListener('hexistenz:dayNightChange', (e) => {
    if (e.detail?.mode && e.detail.mode !== _dayNightCurrent) {
      _dayNightCurrent = e.detail.mode;
      _renderDayNightControls();
    }
  });

  // Hook pour que les presets puissent notifier le HUD de changements PIX
  postprocess?.onExternalSettingsChange?.(_syncPixControls);

  _renderPixControls(_pixCurrent);

  // Attacher les tooltips aux labels des sliders PIX, CINEMA, Forme du monde et Jour/Nuit
  root.querySelectorAll('.debug-light-pix-section [data-help], .debug-light-cinema-section [data-help], .debug-light-crt-section [data-help], .debug-light-worldshape-section [data-help], .debug-light-daynight-section [data-help]').forEach(el => {
    attachHelpTooltip(el, () => LUT_HELP[el.dataset.help] ?? '');
  });

  // ─── Contrôles EAU embarqués dans le panel CUSTOMISATION (intégration Cyril) ───
  // Fusion du panneau flottant waterDebugUi.js dans le HUD LUT, juste avant PIXELISATION.
  const _waterInitStored = _readWaterStored();
  let _waterCurrent = _normalizeWater({
    foam: { ...getWaterFoamParams(), ...(_waterInitStored?.foam ?? {}) },
    wake: { ...getWakeParams(),      ...(_waterInitStored?.wake ?? {}) },
  });
  _applyWaterLive(_waterCurrent);

  const _waterFoamEls = {};
  const _waterWakeEls = {};

  function _renderWaterControls(s) {
    _waterCurrent = _normalizeWater(s);
    waterFoamEnabledEl.checked = _waterCurrent.foamEnabled;
    waterWakeEnabledEl.checked = _waterCurrent.wakeEnabled;
    waterFoamRows.classList.toggle('subgroup-disabled', !_waterCurrent.foamEnabled);
    waterWakeRows.classList.toggle('subgroup-disabled', !_waterCurrent.wakeEnabled);
    for (const { key } of WATER_SLIDERS) {
      const els = _waterFoamEls[key];
      if (!els) continue;
      els.input.value = String(_waterCurrent.foam[key]);
      els.output.textContent = formatNumber(_waterCurrent.foam[key]);
    }
    for (const { key } of WAKE_SLIDERS) {
      const els = _waterWakeEls[key];
      if (!els) continue;
      els.input.value = String(_waterCurrent.wake[key]);
      els.output.textContent = formatNumber(_waterCurrent.wake[key]);
    }
  }

  function _commitWater(partial) {
    const next = _normalizeWater({
      foamEnabled: partial?.foamEnabled ?? _waterCurrent.foamEnabled,
      wakeEnabled: partial?.wakeEnabled ?? _waterCurrent.wakeEnabled,
      foam: { ..._waterCurrent.foam, ...(partial?.foam ?? {}) },
      wake: { ..._waterCurrent.wake, ...(partial?.wake ?? {}) },
    });
    _applyWaterLive(next);
    _renderWaterControls(next);
    _storeWaterSettings(next);
  }

  const waterControlsHost = root.querySelector('#debugLightWaterControls');

  const waterFoamHead = document.createElement('div');
  waterFoamHead.className = 'lut-section-head lut-section-head--with-toggle';
  waterFoamHead.innerHTML =
    `<span>${_emojiHeadHtml('🫧 1. Écume', 'game.eda.headers.waterFoam')}</span>` +
    `<label class="pix-switch" data-i18n-title="game.eda.toggleTitles.waterFoam" title="Activer / désactiver l'écume">` +
      `<input id="waterFoamEnabled" type="checkbox" /><span></span>` +
    `</label>`;
  waterControlsHost.appendChild(waterFoamHead);
  const waterFoamEnabledEl = waterFoamHead.querySelector('#waterFoamEnabled');
  const waterFoamRows = document.createElement('div');
  waterFoamRows.className = 'debug-light-subgroup';
  waterControlsHost.appendChild(waterFoamRows);
  for (const s of WATER_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _waterCurrent.foam[s.key],
      v => _commitWater({ foam: { [s.key]: v } }), pushUndo, `water.${s.key}`);
    _waterFoamEls[s.key] = { input, output };
    waterFoamRows.appendChild(row);
  }
  waterFoamEnabledEl.addEventListener('change', () => { pushUndo(); _commitWater({ foamEnabled: waterFoamEnabledEl.checked }); });

  // Plus de séparateur visible entre Écume et Sillage bateau (2026-07-08) :
  // l'espacement vient uniquement du gap:8px de #debugLightWaterControls.

  const waterWakeHead = document.createElement('div');
  waterWakeHead.className = 'lut-section-head lut-section-head--with-toggle';
  waterWakeHead.innerHTML =
    `<span>${_emojiHeadHtml('🚤 2. Sillage bateau', 'game.eda.headers.waterWake')}</span>` +
    `<label class="pix-switch" data-i18n-title="game.eda.toggleTitles.waterWake" title="Activer / désactiver le sillage bateau">` +
      `<input id="waterWakeEnabled" type="checkbox" /><span></span>` +
    `</label>`;
  waterControlsHost.appendChild(waterWakeHead);
  const waterWakeEnabledEl = waterWakeHead.querySelector('#waterWakeEnabled');
  const waterWakeRows = document.createElement('div');
  waterWakeRows.className = 'debug-light-subgroup';
  waterControlsHost.appendChild(waterWakeRows);
  for (const s of WAKE_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _waterCurrent.wake[s.key],
      v => _commitWater({ wake: { [s.key]: v } }), pushUndo, `wake.${s.key}`);
    _waterWakeEls[s.key] = { input, output };
    waterWakeRows.appendChild(row);
  }
  waterWakeEnabledEl.addEventListener('change', () => { pushUndo(); _commitWater({ wakeEnabled: waterWakeEnabledEl.checked }); });

  _renderWaterControls(_waterCurrent);

  // (Rubrique 8 Météo — construite plus bas, une fois environmentDirector disponible.)

  // ─── Contrôles CINÉMA embarqués dans le panel CUSTOMISATION ─────────────────
  let _cinCurrent = _normalizeCin({ ...CIN_DEFAULTS, ...(_readCinStored() ?? {}) });
  postprocess?.applyCinemaSettings?.(_cinCurrent);

  const cinEnabledEl        = root.querySelector('#cinEnabled');
  const cinTiltEl           = root.querySelector('#cinTilt');
  const cinTiltValEl        = root.querySelector('#cinTiltValue');
  const cinFocusCenterEl    = root.querySelector('#cinFocusCenter');
  const cinFocusCenterValEl = root.querySelector('#cinFocusCenterValue');
  const cinFocusBandEl      = root.querySelector('#cinFocusBand');
  const cinFocusBandValEl   = root.querySelector('#cinFocusBandValue');
  const cinVignetteEl       = root.querySelector('#cinVignette');
  const cinVignetteValEl    = root.querySelector('#cinVignetteValue');
  const cinGrainEl          = root.querySelector('#cinGrain');
  const cinGrainValEl       = root.querySelector('#cinGrainValue');
  const cinChromaticEl      = root.querySelector('#cinChromatic');
  const cinChromaticValEl   = root.querySelector('#cinChromaticValue');
  const cinHalationEl       = root.querySelector('#cinHalation');
  const cinHalationValEl    = root.querySelector('#cinHalationValue');
  const cinBarrelEl         = root.querySelector('#cinBarrel');
  const cinBarrelValEl      = root.querySelector('#cinBarrelValue');
  const cinScanLinesEl      = root.querySelector('#cinScanLines');
  const cinScanLinesValEl   = root.querySelector('#cinScanLinesValue');
  const cinScanLinesIntensityEl    = root.querySelector('#cinScanLinesIntensity');
  const cinScanLinesIntensityValEl = root.querySelector('#cinScanLinesIntensityValue');
  const cinGodRaysEl              = root.querySelector('#cinGodRays');
  const cinGodRaysValEl            = root.querySelector('#cinGodRaysValue');
  const cinGodRaysLengthEl        = root.querySelector('#cinGodRaysLength');
  const cinGodRaysLengthValEl     = root.querySelector('#cinGodRaysLengthValue');
  const cinGodRaysDiffusionEl     = root.querySelector('#cinGodRaysDiffusion');
  const cinGodRaysDiffusionValEl  = root.querySelector('#cinGodRaysDiffusionValue');
  const cinGodRaysThresholdEl     = root.querySelector('#cinGodRaysThreshold');
  const cinGodRaysThresholdValEl  = root.querySelector('#cinGodRaysThresholdValue');
  const cinGodRaysLayersEl        = root.querySelector('#cinGodRaysLayers');
  const cinGodRaysLayersValEl     = root.querySelector('#cinGodRaysLayersValue');
  const godRaysEnabledEl          = root.querySelector('#godRaysEnabled');
  const tiltShiftEnabledEl        = root.querySelector('#tiltShiftEnabled');
  const godRaysRowsEl             = root.querySelector('#godRaysRows');
  const tiltShiftRowsEl           = root.querySelector('#tiltShiftRows');
  const cinBloomIntensityEl       = root.querySelector('#cinBloomIntensity');
  const cinBloomIntensityValEl    = root.querySelector('#cinBloomIntensityValue');
  const cinBloomThresholdEl       = root.querySelector('#cinBloomThreshold');
  const cinBloomThresholdValEl    = root.querySelector('#cinBloomThresholdValue');
  const cinBloomRadiusEl          = root.querySelector('#cinBloomRadius');
  const cinBloomRadiusValEl       = root.querySelector('#cinBloomRadiusValue');
  const cinBloomSoftnessEl        = root.querySelector('#cinBloomSoftness');
  const cinBloomSoftnessValEl     = root.querySelector('#cinBloomSoftnessValue');
  const cinCrtCurvatureEl         = root.querySelector('#cinCrtCurvature');
  const cinCrtCurvatureValEl      = root.querySelector('#cinCrtCurvatureValue');
  const cinCrtMaskEl              = root.querySelector('#cinCrtMask');
  const cinCrtMaskValEl           = root.querySelector('#cinCrtMaskValue');
  const cinCrtCornerDarkEl        = root.querySelector('#cinCrtCornerDark');
  const cinCrtCornerDarkValEl     = root.querySelector('#cinCrtCornerDarkValue');
  const bloomEnabledEl            = root.querySelector('#bloomEnabled');
  const bloomRowsEl               = root.querySelector('#bloomRows');
  const crtEnabledEl              = root.querySelector('#crtEnabled');

  function _renderCinControls(s) {
    _cinCurrent = _normalizeCin(s);
    cinEnabledEl.checked              = _cinCurrent.enabled;
    cinTiltEl.value                   = String(_cinCurrent.tilt);
    cinTiltValEl.textContent          = _cinCurrent.tilt.toFixed(2);
    cinFocusCenterEl.value            = String(_cinCurrent.focusCenter);
    cinFocusCenterValEl.textContent   = _cinCurrent.focusCenter.toFixed(2);
    cinFocusBandEl.value              = String(_cinCurrent.focusBand);
    cinFocusBandValEl.textContent     = _cinCurrent.focusBand.toFixed(2);
    cinVignetteEl.value               = String(_cinCurrent.vignette);
    cinVignetteValEl.textContent      = _cinCurrent.vignette.toFixed(2);
    cinGrainEl.value                  = String(_cinCurrent.grain);
    cinGrainValEl.textContent         = _cinCurrent.grain.toFixed(2);
    cinChromaticEl.value              = String(_cinCurrent.chromatic);
    cinChromaticValEl.textContent     = _cinCurrent.chromatic.toFixed(2);
    cinHalationEl.value               = String(_cinCurrent.halation);
    cinHalationValEl.textContent      = _cinCurrent.halation.toFixed(2);
    cinBarrelEl.value                 = String(_cinCurrent.barrel);
    cinBarrelValEl.textContent        = _cinCurrent.barrel.toFixed(2);
    cinScanLinesEl.value              = String(Math.round(_cinCurrent.scanLines));
    cinScanLinesValEl.textContent     = String(Math.round(_cinCurrent.scanLines)) + 'px';
    cinScanLinesIntensityEl.value            = String(_cinCurrent.scanLinesIntensity);
    cinScanLinesIntensityValEl.textContent   = _cinCurrent.scanLinesIntensity.toFixed(2);
    cinGodRaysEl.value                = String(_cinCurrent.godRays);
    cinGodRaysValEl.textContent       = _cinCurrent.godRays.toFixed(2);
    cinGodRaysLengthEl.value          = String(_cinCurrent.godRaysLength);
    cinGodRaysLengthValEl.textContent = _cinCurrent.godRaysLength.toFixed(2);
    cinGodRaysDiffusionEl.value       = String(_cinCurrent.godRaysDiffusion);
    cinGodRaysDiffusionValEl.textContent = _cinCurrent.godRaysDiffusion.toFixed(2);
    cinGodRaysThresholdEl.value       = String(_cinCurrent.godRaysThreshold);
    cinGodRaysThresholdValEl.textContent = _cinCurrent.godRaysThreshold.toFixed(2);
    cinGodRaysLayersEl.value          = String(_cinCurrent.godRaysLayers);
    cinGodRaysLayersValEl.textContent = _cinCurrent.godRaysLayers.toFixed(2);
    godRaysEnabledEl.checked          = _cinCurrent.godRaysEnabled;
    tiltShiftEnabledEl.checked        = _cinCurrent.tiltShiftEnabled;
    godRaysRowsEl.classList.toggle('subgroup-disabled', !_cinCurrent.godRaysEnabled);
    tiltShiftRowsEl.classList.toggle('subgroup-disabled', !_cinCurrent.tiltShiftEnabled);
    cinBloomIntensityEl.value            = String(_cinCurrent.bloomIntensity);
    cinBloomIntensityValEl.textContent   = _cinCurrent.bloomIntensity.toFixed(2);
    cinBloomThresholdEl.value            = String(_cinCurrent.bloomThreshold);
    cinBloomThresholdValEl.textContent   = _cinCurrent.bloomThreshold.toFixed(2);
    cinBloomRadiusEl.value               = String(_cinCurrent.bloomRadius);
    cinBloomRadiusValEl.textContent      = _cinCurrent.bloomRadius.toFixed(1) + 'px';
    cinBloomSoftnessEl.value             = String(_cinCurrent.bloomSoftness);
    cinBloomSoftnessValEl.textContent    = _cinCurrent.bloomSoftness.toFixed(2);
    cinCrtCurvatureEl.value              = String(_cinCurrent.crtCurvature);
    cinCrtCurvatureValEl.textContent     = _cinCurrent.crtCurvature.toFixed(2);
    cinCrtMaskEl.value                   = String(_cinCurrent.crtMask);
    cinCrtMaskValEl.textContent          = _cinCurrent.crtMask.toFixed(2);
    cinCrtCornerDarkEl.value             = String(_cinCurrent.crtCornerDark);
    cinCrtCornerDarkValEl.textContent    = _cinCurrent.crtCornerDark.toFixed(2);
    bloomEnabledEl.checked            = _cinCurrent.bloomEnabled;
    bloomRowsEl.classList.toggle('subgroup-disabled', !_cinCurrent.bloomEnabled);
    crtEnabledEl.checked              = _cinCurrent.crtEnabled;
    // Le toggle master CINÉMATIQUE grise les 4 sous-rubriques (1. Cinéma, 2. God Rays,
    // 3. Tilt-shift, 4. Bloom), qui sont désormais des sections indépendantes dans le
    // flux 3-colonnes (aplaties depuis l'ancienne section unique le 2026-07-08).
    root.querySelectorAll('.debug-light-cinema-section').forEach(el =>
      el.classList.toggle('cinema-section--disabled', !_cinCurrent.enabled));
    root.querySelector('.debug-light-crt-section').classList.toggle('crt-section--disabled', !_cinCurrent.crtEnabled);
  }

  function _commitCin(partial) {
    const next = _normalizeCin({ ..._cinCurrent, ...partial });
    postprocess?.applyCinemaSettings?.(next);
    _renderCinControls(next);
    _storeCinSettings(next);
  }

  // Sync depuis l'extérieur — plus de raccourci clavier dédié depuis le 2026-07-08
  // (touche C retirée à la demande utilisateur), mécanisme conservé au cas où un
  // futur appelant externe (preset, script) modifierait le cinéma hors panel.
  function _syncCinControls() {
    const ext = postprocess?.getCinemaSettings?.();
    if (ext) _renderCinControls({ ..._cinCurrent, ...ext });
  }

  // Undo/Redo couvrent aussi le CINÉMA : capture de l'état AVANT modification.
  cinEnabledEl.addEventListener('change', () => { pushUndo(); _commitCin({ enabled: cinEnabledEl.checked }); });
  [cinTiltEl, cinFocusCenterEl, cinFocusBandEl, cinVignetteEl, cinGrainEl, cinChromaticEl, cinHalationEl, cinBarrelEl, cinScanLinesEl, cinScanLinesIntensityEl,
   cinGodRaysEl, cinGodRaysLengthEl, cinGodRaysDiffusionEl, cinGodRaysThresholdEl, cinGodRaysLayersEl,
   cinBloomIntensityEl, cinBloomThresholdEl, cinBloomRadiusEl, cinBloomSoftnessEl,
   cinCrtCurvatureEl, cinCrtMaskEl, cinCrtCornerDarkEl]
    .forEach(el => el.addEventListener('pointerdown', () => pushUndo()));
  cinTiltEl.addEventListener('input',         () => _commitCin({ tilt:        Number(cinTiltEl.value) }));
  cinFocusCenterEl.addEventListener('input',  () => _commitCin({ focusCenter: Number(cinFocusCenterEl.value) }));
  cinFocusBandEl.addEventListener('input',    () => _commitCin({ focusBand:   Number(cinFocusBandEl.value) }));
  cinVignetteEl.addEventListener('input',     () => _commitCin({ vignette:    Number(cinVignetteEl.value) }));
  cinGrainEl.addEventListener('input',        () => _commitCin({ grain:       Number(cinGrainEl.value) }));
  cinChromaticEl.addEventListener('input',    () => _commitCin({ chromatic:   Number(cinChromaticEl.value) }));
  cinHalationEl.addEventListener('input',     () => _commitCin({ halation:    Number(cinHalationEl.value) }));
  cinBarrelEl.addEventListener('input',       () => _commitCin({ barrel:      Number(cinBarrelEl.value) }));
  cinScanLinesEl.addEventListener('input',    () => _commitCin({ scanLines:   Number(cinScanLinesEl.value) }));
  cinScanLinesIntensityEl.addEventListener('input', () => _commitCin({ scanLinesIntensity: Number(cinScanLinesIntensityEl.value) }));
  cinGodRaysEl.addEventListener('input',          () => _commitCin({ godRays:          Number(cinGodRaysEl.value) }));
  cinGodRaysLengthEl.addEventListener('input',    () => _commitCin({ godRaysLength:    Number(cinGodRaysLengthEl.value) }));
  cinGodRaysDiffusionEl.addEventListener('input', () => _commitCin({ godRaysDiffusion: Number(cinGodRaysDiffusionEl.value) }));
  cinGodRaysThresholdEl.addEventListener('input', () => _commitCin({ godRaysThreshold: Number(cinGodRaysThresholdEl.value) }));
  cinGodRaysLayersEl.addEventListener('input',    () => _commitCin({ godRaysLayers:    Number(cinGodRaysLayersEl.value) }));
  godRaysEnabledEl.addEventListener('change',   () => { pushUndo(); _commitCin({ godRaysEnabled:   godRaysEnabledEl.checked }); });
  tiltShiftEnabledEl.addEventListener('change', () => { pushUndo(); _commitCin({ tiltShiftEnabled: tiltShiftEnabledEl.checked }); });
  cinBloomIntensityEl.addEventListener('input', () => _commitCin({ bloomIntensity: Number(cinBloomIntensityEl.value) }));
  cinBloomThresholdEl.addEventListener('input', () => _commitCin({ bloomThreshold: Number(cinBloomThresholdEl.value) }));
  cinBloomRadiusEl.addEventListener('input',    () => _commitCin({ bloomRadius:    Number(cinBloomRadiusEl.value) }));
  cinBloomSoftnessEl.addEventListener('input',  () => _commitCin({ bloomSoftness:  Number(cinBloomSoftnessEl.value) }));
  cinCrtCurvatureEl.addEventListener('input',   () => _commitCin({ crtCurvature:  Number(cinCrtCurvatureEl.value) }));
  cinCrtMaskEl.addEventListener('input',        () => _commitCin({ crtMask:       Number(cinCrtMaskEl.value) }));
  cinCrtCornerDarkEl.addEventListener('input',  () => _commitCin({ crtCornerDark: Number(cinCrtCornerDarkEl.value) }));
  bloomEnabledEl.addEventListener('change', () => { pushUndo(); _commitCin({ bloomEnabled: bloomEnabledEl.checked }); });
  crtEnabledEl.addEventListener('change',   () => { pushUndo(); _commitCin({ crtEnabled:   crtEnabledEl.checked }); });

  // Hook de sync externe (cf. _syncCinControls ci-dessus) — dormant depuis le retrait de la touche C.
  postprocess?.onExternalCinemaChange?.(_syncCinControls);

  _renderCinControls(_cinCurrent);

  // ─── Contrôles VENT embarqués dans le panel CUSTOMISATION ───────────────────
  // Regroupe l'ondulation du blé, de la prairie et des arbres — 3 sources de vent
  // indépendantes (uniforms simples pour blé/prairie, shader recompilé pour les arbres).
  const _windInitStored = _readWindStored();
  let _windCurrent = _normalizeWind({
    enabled: _windInitStored?.enabled ?? true,
    wheat: { ...getWheatWindParams(), ...(_windInitStored?.wheat ?? {}) },
    grass: { ...getGrassWindParams(), ...(_windInitStored?.grass ?? {}) },
    tree:  { ...getTreeWindParams(),  ...(_windInitStored?.tree  ?? {}) },
  });
  _applyWindLive(_windCurrent, forestOverlay);

  const windEnabledEl = root.querySelector('#windEnabled');
  const _windWheatEls = {};
  const _windGrassEls = {};
  const _windTreeEls  = {};

  function _renderWindControls(s) {
    _windCurrent = _normalizeWind(s);
    windEnabledEl.checked = _windCurrent.enabled;
    root.querySelector('.debug-light-wind-section').classList.toggle('wind-section--disabled', !_windCurrent.enabled);
    for (const { key } of WIND_WHEAT_SLIDERS) {
      const els = _windWheatEls[key];
      if (!els) continue;
      els.input.value = String(_windCurrent.wheat[key]);
      els.output.textContent = formatNumber(_windCurrent.wheat[key]);
    }
    for (const { key } of WIND_GRASS_SLIDERS) {
      const els = _windGrassEls[key];
      if (!els) continue;
      els.input.value = String(_windCurrent.grass[key]);
      els.output.textContent = formatNumber(_windCurrent.grass[key]);
    }
    for (const { key } of WIND_TREE_SLIDERS) {
      const els = _windTreeEls[key];
      if (!els) continue;
      els.input.value = String(_windCurrent.tree[key]);
      els.output.textContent = formatNumber(_windCurrent.tree[key]);
    }
  }

  function _commitWind(partial) {
    const next = _normalizeWind({
      enabled: partial?.enabled ?? _windCurrent.enabled,
      wheat: { ..._windCurrent.wheat, ...(partial?.wheat ?? {}) },
      grass: { ..._windCurrent.grass, ...(partial?.grass ?? {}) },
      tree:  { ..._windCurrent.tree,  ...(partial?.tree  ?? {}) },
    });
    _applyWindLive(next, forestOverlay);
    _renderWindControls(next);
    _storeWindSettings(next);
  }

  windEnabledEl.addEventListener('change', () => { pushUndo(); _commitWind({ enabled: windEnabledEl.checked }); });

  const windControlsHost = root.querySelector('#debugLightWindControls');

  const windWheatHead = document.createElement('div');
  windWheatHead.className = 'lut-section-head lut-section-head--nested lut-subhead-first';
  windWheatHead.innerHTML = `<span>${_emojiHeadHtml('🌾 4.1 Brins de blés', 'game.eda.headers.windWheat')}</span>`;
  windControlsHost.appendChild(windWheatHead);
  for (const s of WIND_WHEAT_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _windCurrent.wheat[s.key],
      v => _commitWind({ wheat: { [s.key]: v } }), pushUndo, `wind.wheat.${s.key}`);
    _windWheatEls[s.key] = { input, output };
    windControlsHost.appendChild(row);
  }

  const windGrassHead = document.createElement('div');
  windGrassHead.className = 'lut-section-head lut-section-head--nested';
  windGrassHead.innerHTML = `<span>${_emojiHeadHtml('🌿 4.2 Brins d\'herbes', 'game.eda.headers.windGrass')}</span>`;
  windControlsHost.appendChild(windGrassHead);
  for (const s of WIND_GRASS_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _windCurrent.grass[s.key],
      v => _commitWind({ grass: { [s.key]: v } }), pushUndo, `wind.grass.${s.key}`);
    _windGrassEls[s.key] = { input, output };
    windControlsHost.appendChild(row);
  }

  const windTreeHead = document.createElement('div');
  windTreeHead.className = 'lut-section-head lut-section-head--nested';
  windTreeHead.innerHTML = `<span>${_emojiHeadHtml('🌳 4.3 Arbres', 'game.eda.headers.windTree')}</span>`;
  windControlsHost.appendChild(windTreeHead);
  for (const s of WIND_TREE_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _windCurrent.tree[s.key],
      v => _commitWind({ tree: { [s.key]: v } }), pushUndo, `wind.tree.${s.key}`);
    _windTreeEls[s.key] = { input, output };
    windControlsHost.appendChild(row);
  }

  _renderWindControls(_windCurrent);

  // ─── Contrôles NUAGES embarqués dans le panel CUSTOMISATION ─────────────────
  // Nuages à l'horizon, visibles en mode jour (basculés on/off par le toggle Jour/Nuit).
  const _cloudInitStored = _readCloudStored();
  let _cloudCurrent = _normalizeCloud({ ...getCloudSkyParams(cloudSky), ...(_cloudInitStored ?? {}) });
  setCloudSkyParams(cloudSky, _cloudCurrent);
  setCloudUserEnabled(_cloudCurrent.enabled);

  const _cloudEls = {};
  const cloudEnabledEl = root.querySelector('#cloudEnabled');

  function _renderCloudControls(s) {
    _cloudCurrent = _normalizeCloud(s);
    cloudEnabledEl.checked = _cloudCurrent.enabled;
    root.querySelector('.debug-light-cloud-section').classList.toggle('cloud-section--disabled', !_cloudCurrent.enabled);
    // uEnabled du shader ciel (combiné au mode jour/nuit par scene.js) — PAS cloudSky.visible,
    // qui reste toujours true : ce mesh porte aussi le gradient de ciel nocturne (cf. CONTEXT.md).
    setCloudUserEnabled(_cloudCurrent.enabled);
    for (const { key } of CLOUD_SLIDERS) {
      const els = _cloudEls[key];
      if (!els) continue;
      els.input.value = String(_cloudCurrent[key]);
      els.output.textContent = formatNumber(_cloudCurrent[key]);
    }
  }

  function _commitCloud(partial) {
    const next = _normalizeCloud({ ..._cloudCurrent, ...partial });
    setCloudSkyParams(cloudSky, next);
    _renderCloudControls(next);
    _storeCloudSettings(next);
  }
  cloudEnabledEl.addEventListener('change', () => { pushUndo(); _commitCloud({ enabled: cloudEnabledEl.checked }); });

  const cloudControlsHost = root.querySelector('#debugLightCloudControls');
  for (const s of CLOUD_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _cloudCurrent[s.key],
      v => _commitCloud({ [s.key]: v }), pushUndo, `cloud.${s.key}`);
    _cloudEls[s.key] = { input, output };
    cloudControlsHost.appendChild(row);
  }

  _renderCloudControls(_cloudCurrent);

  undoBtn.addEventListener('click', () => {
    if (_undoStack.length === 0) return;
    _redoStack.push(_snapshotAll()); // mémoriser l'état courant (LUT+PIX+CINÉMA+EAU) pour pouvoir refaire
    redoBtn.disabled = false;
    _restoreSnapshot(_undoStack.pop());
    undoBtn.disabled = _undoStack.length === 0;
  });

  redoBtn.addEventListener('click', () => {
    if (_redoStack.length === 0) return;
    _undoStack.push(_snapshotAll()); // permettre de ré-annuler
    undoBtn.disabled = false;
    _restoreSnapshot(_redoStack.pop());
    redoBtn.disabled = _redoStack.length === 0;
  });

  compareBtn.addEventListener('click', () => {
    if (!lastPresetState) return;
    _comparing = !_comparing;
    _updateCompareBtn();
    if (_comparing) {
      // Mémoriser l'état AVANT d'entrer en mode comparer pour le restaurer sur "⟳ Retour"
      _stateBeforeCompare = JSON.parse(JSON.stringify(state));
      _pixelBeforeCompare = { ..._pixCurrent }; // snapshot courant des settings PIX
      _cinBeforeCompare   = { ..._cinCurrent }; // snapshot courant des settings CINÉMA
      _windBeforeCompare  = { ..._windCurrent }; // snapshot courant des settings VENT
      _cloudBeforeCompare = { ..._cloudCurrent }; // snapshot courant des settings NUAGES
      _waterBeforeCompare = { ..._waterCurrent }; // snapshot courant des settings EAU
      // Afficher la dernière ambiance preset
      visualEnvironment.apply(lastPresetState);
      applyColorGradingUniforms(postprocess?.colorGradingPass, lastPresetState);
      if (lastPresetPixelization) _commitPix(lastPresetPixelization);
      if (lastPresetCinema)       _commitCin(lastPresetCinema);
      if (lastPresetWind)         _commitWind(lastPresetWind);
      if (lastPresetCloud)        _commitCloud(lastPresetCloud);
      if (lastPresetWater)        _commitWater(lastPresetWater);
    } else {
      // Restaurer exactement ce qui était affiché AVANT de cliquer "Comparer"
      if (_stateBeforeCompare) {
        replaceDeep(state, _stateBeforeCompare);
        refreshInputs(root, state);
        _stateBeforeCompare = null;
      }
      visualEnvironment.apply(state);
      applyColorGradingUniforms(postprocess?.colorGradingPass, state);
      if (_pixelBeforeCompare) { _commitPix(_pixelBeforeCompare); _pixelBeforeCompare = null; }
      if (_cinBeforeCompare)   { _commitCin(_cinBeforeCompare);   _cinBeforeCompare   = null; }
      if (_windBeforeCompare)  { _commitWind(_windBeforeCompare); _windBeforeCompare  = null; }
      if (_cloudBeforeCompare) { _commitCloud(_cloudBeforeCompare); _cloudBeforeCompare = null; }
      if (_waterBeforeCompare) { _commitWater(_waterBeforeCompare); _waterBeforeCompare = null; }
    }
  });

  root.querySelector('#debugLightCopy').addEventListener('click', async function () {
    // Densité (rubrique 7) et météo (rubrique 8) inclus depuis 2026-07-08 : un futur
    // preset d'ambiance pourra pré-configurer un niveau de perf + des évènements
    // environnementaux (ex. "Orage" en cours) en plus de l'aspect visuel LUT/cinéma.
    // vfx (brume/lucioles/pluie, réglages fins de la rubrique 8) ajouté le 2026-07-10 :
    // manquait jusqu'ici, "weather" ne donnait que la LISTE des évènements actifs, pas
    // leurs sous-paramètres (densité/taille/vitesse…) — le bouton ne copiait donc pas
    // TOUS les réglages des 3 onglets comme attendu.
    const combined = {
      lut: visualEnvironment.exportConfig(), pix: _pixCurrent, cinema: _cinCurrent, water: _waterCurrent,
      wind: _windCurrent, cloud: _cloudCurrent, dayNight: _dayNightCurrent,
      density: getContentDensity(),
      weather: environmentDirector ? [...environmentDirector.active.keys()] : [],
      vfx: _snapshotAllVfx(),
    };
    const text = JSON.stringify(combined, null, 2);
    await copyToClipboard(text).catch(err => console.warn('[debugLightUI] copie impossible', err));
    const btn = this;
    const orig = btn.textContent;
    btn.textContent = _edaText.footer?.copied ?? '✓ Copié !';
    setTimeout(() => { btn.textContent = orig; }, 1600);
  });
  root.querySelector('#debugLightReset').addEventListener('click', () => {
    replaceDeep(state, cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG));
    localStorage.removeItem(LUT_STORAGE_KEY);
    // Appliquer pixelisation et cinéma du preset "Défaut" (et non PIX/CIN_DEFAULTS qui ont enabled:false)
    const defautPreset = VISUAL_PRESETS.find(p => p.name.includes('Défaut')) ?? VISUAL_PRESETS[0];
    _commitPix(defautPreset?.pixelization ?? PIX_DEFAULTS);
    _commitCin(defautPreset?.cinema ?? CIN_DEFAULTS);
    _commitWater(WATER_DEFAULTS);
    localStorage.removeItem(WATER_STORAGE_KEY);
    _commitWind(WIND_DEFAULTS);
    localStorage.removeItem(WIND_STORAGE_KEY);
    _commitCloud(CLOUD_DEFAULTS);
    localStorage.removeItem(CLOUD_STORAGE_KEY);
    refreshInputs(root, state);
    applyAll();
    // Réinitialiser la caméra (équivalent touche R)
    window.dispatchEvent(new CustomEvent('hexistenz:resetCamera'));
  });

  // ─── Synchroniser la largeur du LUT panel avec #tileUI (×1.56128) ───────────────────
  // 2026-07-08 : +40% vs l'ancien ×2 (2 × 1.4 = 2.8) pour accueillir le flux journal
  // sur 3 colonnes.
  // 2026-08-01 (1er round) — demande explicite : "le HUD EDA occupe presque tout
  // l'écran" — largeur réduite de 18% (2.8 × 0.82 = 2.296).
  // 2026-08-01 (2e round) — 2 demandes explicites dans le même message : (a) le
  // flux passe de 3 à 2 colonnes (cf. .debug-light-columns, columns:2 dans
  // css/eda.css) ; (b) largeur encore réduite de 20% (2.296 × 0.8 = 1.8368).
  // 2026-08-01 (3e round) — demande explicite : encore −15%
  // (1.8368 × 0.85 = 1.56128). Chaque colonne fait donc désormais
  // ~1.56128/2 ≈ 0.781 × largeur #tileUI.
  const lutBody = root.querySelector('.debug-light-body');
  const LUT_WIDTH_FACTOR = 1.56128; // 1.8368 × 0.85 (−15%, demande explicite 2026-08-01, 3e round)
  function _syncLutWidth() {
    const tileUI = document.getElementById('tileUI');
    if (tileUI && lutBody) {
      const w = tileUI.offsetWidth;
      if (w > 0) lutBody.style.width = Math.round(w * LUT_WIDTH_FACTOR) + 'px';
    }
  }
  requestAnimationFrame(() => {
    _syncLutWidth();
    window.addEventListener('resize', _syncLutWidth, { passive: true });
    // ResizeObserver : resync si #tileUI change de taille (ajout/suppression de missions…)
    const tileUI = document.getElementById('tileUI');
    if (tileUI && typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(_syncLutWidth).observe(tileUI);
    }
  });

  // ─── Contrôles QUALITÉ / DENSITÉ (onglet Environnement, rubrique 7) ──────────
  // Ex-panneau flottant qualityUi.js (bouton "⚙ QUALITÉ"), fusionné dans l'EDA le
  // 2026-07-08 — même geste que l'intégration du HUD EAU (§19 / cf. import ci-dessus).
  // Réglage MACHINE (perf), pas "regard" : hors undo/redo, comme Forme du monde /
  // Jour-Nuit. Persistance propre à contentDensity.js (localStorage
  // 'hexistenz_content_density'). Inclus dans l'export 📋 Copier depuis §16 (valeur
  // informative, dépend de la machine de qui l'importe). Depuis le 2026-08-04, les
  // 14 ambiances prédéfinies peuvent aussi le piloter (cf. handler de clic preset
  // plus haut) — demande explicite malgré la nature "machine" du réglage.
  const QUALITY_PRESETS = [
    { emoji: '🐌', label: 'Faible', key: 'faible', value: 0.30 },
    { emoji: '🚶', label: 'Moyen',  key: 'moyen',  value: 0.55 },
    { emoji: '🏃', label: 'Élevé',  key: 'eleve',  value: 0.80 },
    { emoji: '🚀', label: 'Max',    key: 'max',    value: 1.00 },
  ];
  const qualityPresetsContainer = root.querySelector('#debugLightQualityPresets');
  const qualityControlsHost     = root.querySelector('#debugLightQualityControls');
  let _qualityDensitySlider = null;
  let _qualityDebounceTimer = null;

  // Debounce : le rebuild (props naturels/herbe/moutons) est coûteux — on attend
  // la fin du drag/clic plutôt que de reconstruire à chaque pas de slider (même
  // logique que l'ancien qualityUi.js, 220 ms).
  function _applyDensity(value) {
    clearTimeout(_qualityDebounceTimer);
    _qualityDebounceTimer = setTimeout(() => { setContentDensity(value); }, 220);
  }

  for (const preset of QUALITY_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'debug-light-preset-btn';
    btn.innerHTML = `<span class="preset-emoji">${preset.emoji}</span><span class="preset-label" data-i18n="game.eda.quality.${preset.key}">${preset.label}</span>`;
    const _qLabel = _edaText.quality?.[preset.key] ?? preset.label;
    btn.title = (_edaText.qualityTooltip ?? 'Densité {label} ({value})')
      .replace('{label}', _qLabel.toLowerCase())
      .replace('{value}', preset.value.toFixed(2));
    btn.addEventListener('click', () => {
      if (_qualityDensitySlider) {
        _qualityDensitySlider.input.value = String(preset.value);
        _qualityDensitySlider.output.textContent = formatNumber(preset.value);
      }
      _applyDensity(preset.value);
    });
    qualityPresetsContainer.appendChild(btn);
  }

  _qualityDensitySlider = createRawSlider('Densité', MIN_DENSITY, MAX_DENSITY, 0.05, getContentDensity(),
    v => _applyDensity(v), null, 'quality.density');
  qualityControlsHost.appendChild(_qualityDensitySlider.row);

  // ─── Contrôles VFX MÉTÉO (onglet Environnement, rubrique 8) ─────────────────
  // Refonte 2026-07-12 (livraison Cyril « nuages metaball + pluie + impacts ») :
  // fusion des deux ex-boucles (VFX sliders + boutons Déclencher/Stop) en UN
  // seul modèle unifié — chaque item = 1 switch (qui est l'état actif de l'évènement,
  // ou juste "déplier les sliders" pour 'clouds' qui n'a pas d'évènement propre)
  // + optionnellement des sliders (repliés quand off). Règles pluie⇄nuages :
  //   1) activer 'clouds' → n'active PAS la pluie (indépendant) ;
  //   2) activer 'rain'/'storm' → force 'clouds' à s'activer (la pluie ne tombe que
  //      des nuages, cf. rainCloudOverlay.js::updateRainCloudOverlay) ;
  //   3) désactiver 'rain' → nuages restent ;
  //   4) désactiver 'clouds' → coupe AUSSI rain/storm (pas de nuages, pas de pluie).
  if (environmentDirector) {
    const vfxHost = root.querySelector('#debugLightVfxControls');
    const weatherStopAll = root.querySelector('#debugLightWeatherStopAll');
    // i18nKey : clé game.eda.weatherGroups.<i18nKey> pour le titre de la carte.
    // labelNs : espace de nommage game.eda.labels.vfx.<labelNs>.<sliderKey> pour les
    // sliders (distinct de `effect`, qui reste le nom interne côté vfxSettings.js).
    const vfxGroups = [
      { effect: 'groundMist', eventId: 'morningMist', title: '🌫️ Brume matinale', sliders: VFX_MIST_SLIDERS,    i18nKey: 'morningMist', labelNs: 'mist' },
      { effect: 'fireflies',  eventId: 'fireflies',   title: '✨ Lucioles',        sliders: VFX_FIREFLY_SLIDERS, i18nKey: 'fireflies',   labelNs: 'fireflies' },
      { effect: 'clouds',     eventId: null,          title: '☁️ Nuages de pluie', sliders: VFX_CLOUD_SLIDERS,   i18nKey: 'clouds',      labelNs: 'cloud' },
      { effect: 'rain',       eventId: 'rain',        title: '🌧️ Pluie',          sliders: VFX_RAIN_SLIDERS,    i18nKey: 'rain',        labelNs: 'rain' },
      { effect: 'storm',      eventId: 'storm',       title: '⛈️ Orage',          sliders: VFX_STORM_SLIDERS,   i18nKey: 'storm',       labelNs: 'storm' },
      { effect: null,         eventId: 'lightning',   title: '⚡ Éclair',          sliders: null,                i18nKey: 'lightning',   labelNs: null },
      { effect: 'fire',       eventId: 'fire',        title: '🔥 Feu',            sliders: VFX_FIRE_SLIDERS,    i18nKey: 'fire',        labelNs: 'fire' },
      { effect: null,         eventId: 'panic',       title: '🐑 Panique animale', sliders: null,               i18nKey: 'panic',       labelNs: null }
    ];
    const _weatherRefreshers = [];
    let _forceCloudsOn = null;         // rempli quand la carte 'clouds' est construite
    const _refreshByEvent = {};        // permet à 'clouds' de décocher rain/storm

    for (const group of vfxGroups) {
      const def = group.eventId ? ENVIRONMENT_EVENTS[group.eventId] : null;
      // Le texte "(nécessite X)" référence le label INTERNE de l'évènement requis
      // (ENVIRONMENT_EVENTS) — pas de substitution {label} supportée par le moteur
      // data-i18n générique (simple lookup, pas de templating) : laissé en FR en dur,
      // cas marginal (ne s'affiche que si un effet dépend d'un autre non actif).
      const requiresLabel = def?.requires ? ` <em class="weather-requires">(nécessite ${ENVIRONMENT_EVENTS[def.requires].label})</em>` : '';
      const switchTitleKey = group.eventId ? 'game.eda.weatherSwitchTitle' : 'game.eda.weatherCloudsSwitchTitle';
      const switchTitle = group.eventId ? 'Activer / désactiver' : 'Activer / désactiver les nuages';

      const head = document.createElement('div');
      head.className = 'lut-section-head lut-section-head--with-toggle weather-merged-head';
      head.innerHTML =
        `<span class="weather-label" data-i18n="game.eda.weatherGroups.${group.i18nKey}">${group.title}</span>${requiresLabel}` +
        `<span class="weather-head-controls">` +
          (group.sliders ? `<button type="button" class="debug-light-weather-btn debug-light-vfx-reset" data-i18n-title="game.eda.weatherResetTitle" title="Réinitialiser" style="width:auto;padding:2px 8px;">↺</button>` : '') +
          `<label class="pix-switch" data-i18n-title="${switchTitleKey}" title="${switchTitle}"><input type="checkbox" class="weather-merged-switch" /><span></span></label>` +
        `</span>`;
      vfxHost.appendChild(head);

      const rows = group.sliders ? document.createElement('div') : null;
      if (rows) {
        rows.className = 'debug-light-subgroup debug-light-vfx-rows';
        vfxHost.appendChild(rows);
      }

      const switchEl = head.querySelector('.weather-merged-switch');
      const applyRowsVisible = (visible) => {
        if (rows) rows.classList.toggle('debug-light-vfx-rows--collapsed', !visible);
      };

      if (group.eventId) {
        const refresh = () => {
          const active = isEnvironmentEventActive(environmentDirector, group.eventId);
          switchEl.checked = active;
          switchEl.disabled = !active && def.requires && !isEnvironmentEventActive(environmentDirector, def.requires);
          applyRowsVisible(active);
        };
        switchEl.addEventListener('change', () => {
          if (switchEl.checked) {
            // duration: Infinity → l'évènement NE s'auto-expire PAS pour un déclenchement
            // manuel debug. L'auto-expiration servira au futur cycle météo automatique.
            triggerEnvironmentEvent(environmentDirector, group.eventId, performance.now() * 0.001, { duration: Infinity });
            // Règle 2 : activer Pluie/Orage force Nuages aussi (la pluie ne tombe que des nuages).
            if (group.eventId === 'rain' || group.eventId === 'storm') _forceCloudsOn?.();
          } else {
            stopEnvironmentEvent(environmentDirector, group.eventId);
          }
          refresh();
        });
        _weatherRefreshers.push(refresh);
        _refreshByEvent[group.eventId] = refresh;
        refresh();
      } else if (group.sliders) {
        // 'clouds' : pas d'évènement environmentDirector propre. Le switch reste un vrai on/off,
        // il déplie les sliders ET gate le rendu des nuages (isVfxGroupExpanded('clouds') lu par
        // rainCloudOverlay.js). Off par défaut. Activer Pluie/Orage force ce switch à on (règle 2).
        const applyExpanded = (expanded) => {
          switchEl.checked = expanded;
          applyRowsVisible(expanded);
        };
        applyExpanded(isVfxGroupExpanded(group.effect));
        if (group.effect === 'clouds') {
          _forceCloudsOn = () => {
            if (isVfxGroupExpanded('clouds')) return;
            setVfxGroupExpanded('clouds', true);
            applyExpanded(true);
          };
        }
        switchEl.addEventListener('change', () => {
          setVfxGroupExpanded(group.effect, switchEl.checked);
          applyExpanded(switchEl.checked);
          // Règle 4 : couper "Nuages" coupe AUSSI rain/storm.
          if (group.effect === 'clouds' && !switchEl.checked) {
            for (const ev of ['rain', 'storm']) {
              if (isEnvironmentEventActive(environmentDirector, ev)) {
                stopEnvironmentEvent(environmentDirector, ev);
                _refreshByEvent[ev]?.();
              }
            }
          }
        });
      }

      if (group.sliders) {
        const sliderEls = [];
        const renderGroup = () => {
          const current = getVfxSettings(group.effect);
          for (const { s, input, output } of sliderEls) {
            input.value = String(current[s.key]);
            output.textContent = formatNumber(current[s.key]);
          }
        };
        const initial = getVfxSettings(group.effect);
        for (const s of group.sliders) {
          const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, initial[s.key],
            v => setVfxSetting(group.effect, s.key, v), pushUndo, null, group.labelNs ? `vfx.${group.labelNs}.${s.key}` : null);
          sliderEls.push({ s, input, output });
          rows.appendChild(row);
        }
        head.querySelector('.debug-light-vfx-reset').addEventListener('click', () => {
          pushUndo();
          resetVfxSettings(group.effect);
          renderGroup();
        });
        // Resync visuel si la valeur change hors slider (undo/redo, restore snapshot).
        onVfxSettingsChange((effect) => { if (effect === null || effect === group.effect) renderGroup(); });
      }
    }

    weatherStopAll.addEventListener('click', () => stopAllEnvironmentEvents(environmentDirector));

    const _refreshAllWeather = () => { for (const r of _weatherRefreshers) r(); };
    onEnvironmentChange(environmentDirector, _refreshAllWeather);
    setInterval(_refreshAllWeather, 500); // capte l'auto-expiration entre 2 transitions
  }

  // ─── Mini HUD clavier (bottom-right, toujours visible) ─────────────────────
  const kbdHint = document.createElement('div');
  kbdHint.id = 'kbdHintHud';
  kbdHint.innerHTML = '<div class="internal-parchment">' + (_kbdHintText || 'H ou ESC&nbsp;→ aide &nbsp;|&nbsp; M&nbsp;→ mute &nbsp;|&nbsp; ESPACE&nbsp;→ immersif &nbsp;|&nbsp; MAJ+ESPACE&nbsp;→ super-immersif') + '</div>';
  document.body.appendChild(kbdHint);

  // Le panneau vient d'être entièrement construit (sliders EAU/VENT/NUAGES/VFX,
  // rubriques LUT...) : si la langue sauvegardée n'est pas FR, gameHudI18n.js a déjà
  // fait une passe de traduction au chargement du script, AVANT que ce DOM n'existe.
  // On rejoue la traduction maintenant pour ce DOM fraîchement créé.
  applyCurrentLang();

  applyAll();

  return {
    element: root,
    applyAll
  };

  function applyAll() {
    // Toute modification manuelle quitte le mode comparer
    _comparing = false;
    _updateCompareBtn();
    visualEnvironment.apply(state);
    applyColorGradingUniforms(postprocess?.colorGradingPass, state);
    saveLutConfig(visualEnvironment.exportConfig());
  }

  function pushUndo() {
    _undoStack.push(_snapshotAll());
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
    undoBtn.disabled = false;
    // Toute nouvelle modification manuelle efface le redo
    _redoStack.length = 0;
    redoBtn.disabled = true;
    // Quitter le mode comparer : une modif manuelle revient à l'état courant
    if (_comparing) { _comparing = false; _updateCompareBtn(); }
  }

  // Snapshot combiné LUT + PIX + CINÉMA + EAU + VENT + NUAGES + VFX MÉTÉO — undo/redo
  // agissent sur tout le panneau CUSTOMISATION. vfx ajouté le 2026-07-10 (même lacune
  // que celle corrigée sur le bouton "📋 Copier" : les sliders brume/lucioles/pluie
  // appellent pushUndo() avant modification, mais le snapshot ne capturait pas leur
  // valeur → Annuler ne les rétablissait pas).
  function _snapshotAll() {
    return JSON.stringify({ lut: state, pix: _pixCurrent, cin: _cinCurrent, water: _waterCurrent, wind: _windCurrent, cloud: _cloudCurrent, vfx: _snapshotAllVfx() });
  }

  function _restoreSnapshot(json) {
    const snap = JSON.parse(json);
    replaceDeep(state, snap.lut);
    refreshInputs(root, state);
    _commitPix(snap.pix);
    _commitCin(snap.cin);
    _commitWater(snap.water);
    if (snap.wind)  _commitWind(snap.wind);
    if (snap.cloud) _commitCloud(snap.cloud);
    if (snap.vfx)   _restoreAllVfx(snap.vfx);
    applyAll();
  }

  function _updateCompareBtn() {
    compareBtn.textContent = _comparing
      ? (_edaText.footer?.compareBack ?? '⟳ Retour')
      : (_edaText.footer?.compare ?? 'Comparer');
    compareBtn.classList.toggle('debug-light-compare-btn--active', _comparing);
  }
}

function createSlider(state, path, label, min, max, step, onChange, onBeforeChange) {
  const row = document.createElement('label');
  row.className = 'debug-light-row';

  const value = Number(getPath(state, path));
  row.innerHTML = `
    <span data-i18n="game.eda.labels.${path}">${label}</span>
    <input data-path="${path}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <output>${formatNumber(value)}</output>
  `;

  // Tooltip custom au hover du label (lazy : re-résolu à chaque hover pour
  // suivre un éventuel changement de langue en cours de partie, cf. getHelpText)
  attachHelpTooltip(row.querySelector('span'), () => getHelpText(path));

  const input = row.querySelector('input');
  const output = row.querySelector('output');
  // Capturer l'état AVANT que le drag commence (pour undo)
  let _dragPushed = false;
  input.addEventListener('pointerdown', () => { if (!_dragPushed) { onBeforeChange?.(); _dragPushed = true; } });
  input.addEventListener('pointerup',   () => { _dragPushed = false; });
  input.addEventListener('input', () => {
    const next = Number(input.value);
    setPath(state, path, next);
    output.textContent = formatNumber(next);
    onChange();
  });

  return row;
}

// Slider « brut » : mêmes visuel/comportement que createSlider, mais sans passer par un chemin
// dans `state` — utilisé pour les réglages EAU (getters/setters dédiés dans realisticWater.js /
// waterBoatOverlay.js plutôt que dans le config LUT).
// labelKey (ajouté 2026-07-14, défaut = helpKey) : clé de traduction du libellé visible
// (game.eda.labels.<labelKey>), distincte de helpKey (tooltip LUT_HELP au survol) pour ne
// pas forcer une tooltip vide sur les sliders qui n'en ont pas (ex. VFX météo).
function createRawSlider(label, min, max, step, value, onChange, onBeforeChange, helpKey, labelKey = helpKey) {
  const row = document.createElement('label');
  row.className = 'debug-light-row';
  const labelAttr = labelKey ? ` data-i18n="game.eda.labels.${labelKey}"` : '';
  row.innerHTML = `
    <span${labelAttr}>${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <output>${formatNumber(value)}</output>
  `;

  if (helpKey) attachHelpTooltip(row.querySelector('span'), () => LUT_HELP[helpKey] ?? '');

  const input = row.querySelector('input');
  const output = row.querySelector('output');
  let _dragPushed = false;
  input.addEventListener('pointerdown', () => { if (!_dragPushed) { onBeforeChange?.(); _dragPushed = true; } });
  input.addEventListener('pointerup',   () => { _dragPushed = false; });
  input.addEventListener('input', () => {
    const next = Number(input.value);
    output.textContent = formatNumber(next);
    onChange(next);
  });

  return { row, input, output };
}

function createColorPicker(state, path, label, onChange, onBeforeChange) {
  const row = document.createElement('label');
  row.className = 'debug-light-row color-row';

  const value = normalizeHex(getPath(state, path));
  const help = getHelpText(path);
  row.title = help;
  row.innerHTML = `
    <span data-i18n="game.eda.labels.${path}" title="${escapeHtml(help)}">${label}</span>
    <input data-path="${path}" type="color" value="${value}" title="${escapeHtml(help)}">
    <output title="Valeur actuelle">${value}</output>
  `;

  const input = row.querySelector('input');
  const output = row.querySelector('output');
  // Capturer l'état AVANT l'ouverture du sélecteur de couleur (pour undo)
  input.addEventListener('mousedown', () => { onBeforeChange?.(); });
  input.addEventListener('input', () => {
    setPath(state, path, input.value);
    output.textContent = input.value;
    onChange();
  });

  return row;
}

function refreshInputs(root, state) {
  for (const section of LUT_SECTIONS) {
    if (!section.togglePath) continue;
    const enabled = getPath(state, section.togglePath) !== false;
    const toggleEl = root.querySelector(`#${section.toggleId}`);
    if (toggleEl) {
      toggleEl.checked = enabled;
      toggleEl.closest('.lut-section')?.classList.toggle('lut-section--disabled', !enabled);
    }
  }

  root.querySelectorAll('[data-path]').forEach(input => {
    const value = getPath(state, input.dataset.path);
    input.value = input.type === 'color' ? normalizeHex(value) : Number(value);
    const output = input.parentElement?.querySelector('output');
    if (output) output.textContent = input.type === 'color' ? input.value : formatNumber(Number(input.value));
  });
}

function getHelpText(path) {
  return LUT_HELP[path] ?? 'Réglage visuel du panneau LUT.';
}

// Enveloppe l'emoji de tête d'un label "🔆 1.1 Rendu" dans un span dédié (.rubrique-emoji)
// pour pouvoir l'agrandir en CSS sans changer la taille du texte de la (sous-)rubrique.
// i18nPath (ajouté 2026-07-14) : chemin complet game.eda.xxx.yyy — si fourni, le texte
// (hors emoji) est enveloppé dans un span data-i18n="<i18nPath>". L'emoji reste hors
// traduction (universel), et gameHudI18n.js (moteur déjà utilisé pour tout le HUD) ne
// réécrit QUE ce sous-span, donc l'emoji n'est jamais écrasé lors d'un changement de langue.
function _emojiHeadHtml(label, i18nPath) {
  const m = /^(\S+)\s+([\s\S]*)$/.exec(label);
  if (!m) return escapeHtml(label);
  // L'espace après l'emoji est ajouté ICI en dur (pas capturé dans le texte) : les
  // valeurs JSON de game.eda.headers/modes n'ont donc pas besoin d'espace de tête.
  const emojiHtml = `<span class="rubrique-emoji">${m[1]}</span> `;
  const text = escapeHtml(m[2]);
  const textHtml = i18nPath ? `<span data-i18n="${i18nPath}">${text}</span>` : text;
  return emojiHtml + textHtml;
}

function getPath(source, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], source);
}

function setPath(source, path, value) {
  const keys = path.split('.');
  let cursor = source;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

// Fusion récursive : applique les clés de source dans target, sans effacer les clés absentes.
function applyDelta(target, delta) {
  if (!delta || typeof delta !== 'object') return target;
  for (const [key, value] of Object.entries(delta)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') {
      applyDelta(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function replaceDeep(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    target[key] = value && typeof value === 'object' && !Array.isArray(value) ? replaceDeep({}, value) : value;
  }
  return target;
}

function normalizeHex(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value;
  return '#ffffff';
}

function formatNumber(value) {
  return Number(value).toFixed(Math.abs(value) < 0.1 ? 3 : 2);
}
