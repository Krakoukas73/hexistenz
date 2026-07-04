import { DEFAULT_VISUAL_ENVIRONMENT_CONFIG, cloneVisualConfig, applyColorGradingUniforms } from './visualEnvironment.js';
import { getWorldShapeMode, setWorldShapeMode } from './worldCurvature.js';
import { LUT_HELP, attachHelpTooltip } from './help.js';
import { copyToClipboard } from './hud_fps.js';
import { getWaterFoamParams, setWaterFoamParams } from './realisticWater.js';
import { getWakeParams, setWakeParams } from './waterBoatOverlay.js';
import { getWheatWindParams, setWheatWindParams } from './fieldWheatOverlay.js';
import { getGrassWindParams, setGrassWindParams } from './grassBladeOverlay.js';
import { getTreeWindParams, setTreeWindParams } from './forestOverlay.js';
import { getCloudSkyParams, setCloudSkyParams, setCloudUserEnabled } from './cloudSky.js';
import { WATER_RENDER, WHEAT_WIND_STRENGTH, WHEAT_WIND_SPEED, GRASS_WIND_STRENGTH, GRASS_WIND_SPEED, GRASS_WIND_SWAY, TREE_WIND } from './config.js';

// ─── Panel EDA (Éditeur de Direction Artistique) — extrait de debugLightUi.js (2026-07-02) ───
// Ce module construit et câble tout le contenu du panel EDA (3 onglets : LUT / Cinématique /
// Environnement) à l'intérieur du `root` (#debugLightPanel) créé par la façade debugLightUi.js,
// qui héberge aussi le HUD FPS (hud_fps.js) dans le même élément DOM.

// ─── PIX HUD constants (embedded inside CUSTOMISATION panel) ─────────────────
const PIX_STORAGE_KEY = 'dorfoPixelPostprocessSettings.v4';
// ─── CINEMA HUD constants ─────────────────────────────────────────────────────
const CIN_STORAGE_KEY = 'hexistenz_cinema_v1';
const CIN_DEFAULTS = Object.freeze({
  enabled: false,
  tilt: 0.60, focusCenter: 0.50, focusBand: 0.35,
  vignette: 0.55, grain: 0.30, chromatic: 0.45,
  halation: 0.0, barrel: 0.0, scanLines: 0.0,
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
function _readCinStored()     { try { const r = localStorage.getItem(CIN_STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function _storeCinSettings(s) { try { localStorage.setItem(CIN_STORAGE_KEY, JSON.stringify(s)); } catch {} }
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
function _readPixStored() { try { const r = localStorage.getItem(PIX_STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function _storePixSettings(s) { try { localStorage.setItem(PIX_STORAGE_KEY, JSON.stringify(s)); } catch {} }

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
function _readWaterStored()     { try { const r = localStorage.getItem(WATER_STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function _storeWaterSettings(s) { try { localStorage.setItem(WATER_STORAGE_KEY, JSON.stringify(s)); } catch {} }

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
function _readWindStored()     { try { const r = localStorage.getItem(WIND_STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function _storeWindSettings(s) { try { localStorage.setItem(WIND_STORAGE_KEY, JSON.stringify(s)); } catch {} }

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
function _readCloudStored()     { try { const r = localStorage.getItem(CLOUD_STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function _storeCloudSettings(s) { try { localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(s)); } catch {} }

const LUT_STORAGE_KEY = 'hexistenz_lut_v1';

function saveLutConfig(exportedConfig) {
  try { localStorage.setItem(LUT_STORAGE_KEY, JSON.stringify(exportedConfig)); } catch (_) { /* quota */ }
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
    label: '🎚️ 3. Étalonnage',
    hostId: 'debugLightPaletteHost', // rendu en colonne B de l'onglet LUT (avant Palette biomes)
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
    label: '🎨 4. Palette biomes',
    hostId: 'debugLightPaletteHost', // rendu en colonne B de l'onglet LUT (après Étalonnage, cf. hostId ci-dessus)
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
const VISUAL_PRESETS = await fetch('./json/ambiances.json')
  .then(r => r.json())
  .catch(e => { console.error('[hud_eda] Impossible de charger ambiances.json :', e); return []; });

// ─── Markup — contenu de .debug-light-body, extrait du template racine ─────
// (le compteur FPS + les 2 boutons #fpsHudToggle/#debugLightToggle restent dans la façade
// debugLightUi.js, qui assemble .debug-light-left-col + EDA_BODY_HTML dans le même root.)
export const EDA_BODY_HTML = `
    <div class="debug-light-body">
      <div class="debug-light-main-title">Éditeur de direction artistique</div>

      <div class="debug-light-header">
        <div class="debug-light-presets-label"><span class="rubrique-emoji">🎨</span> AMBIANCES</div>
        <div id="debugLightPresets" class="debug-light-presets"></div>
      </div><!-- /.debug-light-header -->

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-tabs" role="tablist">
        <button type="button" class="debug-light-tab-btn" data-tab="1" role="tab">LUT</button>
        <button type="button" class="debug-light-tab-btn" data-tab="2" role="tab">Cinématique</button>
        <button type="button" class="debug-light-tab-btn" data-tab="3" role="tab">Environnement</button>
      </div><!-- /.debug-light-tabs -->

      <div class="debug-light-tab-panels">

      <div class="debug-light-tab-panel" data-tab-panel="1">
      <div class="debug-light-columns">
      <div class="debug-light-lut-scroll">
        <div id="debugLightControls" class="debug-light-controls"></div>
      </div><!-- /.debug-light-lut-scroll -->

      <div class="debug-light-col-third">
      <div id="debugLightPaletteHost"></div>
      </div><!-- /palette host col -->
      </div><!-- /.debug-light-columns -->
      </div><!-- /.debug-light-tab-panel[1] -->

      <div class="debug-light-tab-panel" data-tab-panel="2">
      <div class="debug-light-columns">
      <div class="debug-light-col-right">

      <div class="debug-light-cinema-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🎬</span> 1. CINÉMATIQUE</span>
          <label class="pix-switch" title="Activer / désactiver les effets cinématiques">
            <input id="cinEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.vignette">Vignette</span>
          <input id="cinVignette" type="range" min="0" max="2" step="0.01" />
          <output id="cinVignetteValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.grain">Grain film</span>
          <input id="cinGrain" type="range" min="0" max="1" step="0.01" />
          <output id="cinGrainValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.chromatic">Aberration chr.</span>
          <input id="cinChromatic" type="range" min="0" max="1" step="0.01" />
          <output id="cinChromaticValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.halation">Halation</span>
          <input id="cinHalation" type="range" min="0" max="1" step="0.01" />
          <output id="cinHalationValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.barrel">Distorsion barillet</span>
          <input id="cinBarrel" type="range" min="0" max="1" step="0.01" />
          <output id="cinBarrelValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.scanLines">Scan lines</span>
          <input id="cinScanLines" type="range" min="0" max="6" step="1" />
          <output id="cinScanLinesValue"></output>
        </div>

        <div class="debug-light-pix-sep"></div>

        <div class="lut-section-head lut-section-head--with-toggle">
          <span>${_emojiHeadHtml('🌅 2. God Rays')}</span>
          <label class="pix-switch" title="Activer / désactiver les god rays">
            <input id="godRaysEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-subgroup" id="godRaysRows">
        <div class="debug-light-row">
          <span data-help="cin.godRays">Intensité</span>
          <input id="cinGodRays" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysLength">Longueur</span>
          <input id="cinGodRaysLength" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysLengthValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysDiffusion">Diffusion</span>
          <input id="cinGodRaysDiffusion" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysDiffusionValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysThreshold">Seuil luminosité</span>
          <input id="cinGodRaysThreshold" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysThresholdValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.godRaysLayers">Feuilletage</span>
          <input id="cinGodRaysLayers" type="range" min="0" max="1" step="0.01" />
          <output id="cinGodRaysLayersValue"></output>
        </div>
        </div><!-- /#godRaysRows -->

        <div class="debug-light-pix-sep"></div>

        <div class="lut-section-head lut-section-head--with-toggle">
          <span>${_emojiHeadHtml('🎞️ 3. Tilt-shift')}</span>
          <label class="pix-switch" title="Activer / désactiver le tilt-shift">
            <input id="tiltShiftEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-subgroup" id="tiltShiftRows">
        <div class="debug-light-row">
          <span data-help="cin.tilt">Intensité</span>
          <input id="cinTilt" type="range" min="0" max="1" step="0.01" />
          <output id="cinTiltValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.focusCenter">Centre focus</span>
          <input id="cinFocusCenter" type="range" min="0" max="1" step="0.01" />
          <output id="cinFocusCenterValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.focusBand">Zone nette</span>
          <input id="cinFocusBand" type="range" min="0" max="1" step="0.01" />
          <output id="cinFocusBandValue"></output>
        </div>
        </div><!-- /#tiltShiftRows -->

        <div class="debug-light-pix-sep"></div>

        <div class="lut-section-head lut-section-head--with-toggle">
          <span>${_emojiHeadHtml('✨ 4. Bloom')}</span>
          <label class="pix-switch" title="Activer / désactiver le bloom">
            <input id="bloomEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-subgroup" id="bloomRows">
        <div class="debug-light-row">
          <span data-help="cin.bloomIntensity">Intensité</span>
          <input id="cinBloomIntensity" type="range" min="0" max="2" step="0.01" />
          <output id="cinBloomIntensityValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.bloomThreshold">Seuil</span>
          <input id="cinBloomThreshold" type="range" min="0" max="1" step="0.01" />
          <output id="cinBloomThresholdValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.bloomRadius">Rayon</span>
          <input id="cinBloomRadius" type="range" min="0" max="8" step="0.1" />
          <output id="cinBloomRadiusValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.bloomSoftness">Douceur</span>
          <input id="cinBloomSoftness" type="range" min="0" max="1" step="0.01" />
          <output id="cinBloomSoftnessValue"></output>
        </div>
        </div><!-- /#bloomRows -->
      </div>
      </div><!-- /.debug-light-col-right (1. CINÉMATIQUE + 2-4 sous-rubriques) -->

      <div class="debug-light-col-third">

      <div class="debug-light-pix-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">👾</span> 5. PIXELISATION</span>
          <label class="pix-switch" title="Activer / désactiver la pixelisation">
            <input id="pixEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.pixelSize">Rayon (pixels)</span>
          <input id="pixPixelSize" type="range" min="1" max="50" step="1" />
          <output id="pixPixelSizeValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.normalEdge">Contour relief</span>
          <input id="pixNormalEdge" type="range" min="0" max="1" step="0.01" />
          <output id="pixNormalEdgeValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.depthEdge">Contour profondeur</span>
          <input id="pixDepthEdge" type="range" min="0" max="1" step="0.01" />
          <output id="pixDepthEdgeValue"></output>
        </div>
      </div>

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-crt-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">📺</span> 6. COURBURE ÉCRAN</span>
          <label class="pix-switch" title="Activer / désactiver la courbure écran">
            <input id="crtEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.crtCurvature">Courbure écran</span>
          <input id="cinCrtCurvature" type="range" min="0" max="1" step="0.01" />
          <output id="cinCrtCurvatureValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.crtMask">Bords noirs</span>
          <input id="cinCrtMask" type="range" min="0" max="1" step="0.01" />
          <output id="cinCrtMaskValue"></output>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.crtCornerDark">Assombr. coins CRT</span>
          <input id="cinCrtCornerDark" type="range" min="0" max="1" step="0.01" />
          <output id="cinCrtCornerDarkValue"></output>
        </div>
      </div>
      </div><!-- /.debug-light-col-third (5. PIXÉLISATION + 6. COURBURE ÉCRAN) -->
      </div><!-- /.debug-light-columns -->
      </div><!-- /.debug-light-tab-panel[2] -->

      <div class="debug-light-tab-panel" data-tab-panel="3">
      <div class="debug-light-columns">
      <div class="debug-light-col-right">

      <div class="debug-light-water-section">
        <div id="debugLightWaterControls"></div>
      </div>

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-cloud-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">☁️</span> 3. NUAGES</span>
          <label class="pix-switch" title="Activer / désactiver les nuages">
            <input id="cloudEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div id="debugLightCloudControls"></div>
      </div>
      </div><!-- /.debug-light-col-right (1. Écume + 2. Sillage bateau + 3. Nuages) -->

      <div class="debug-light-col-third">

      <div class="debug-light-wind-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌬️</span> 4. VENT</span>
          <label class="pix-switch" title="Activer / désactiver tous les vents (blé, prairie, arbres)">
            <input id="windEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div id="debugLightWindControls"></div>
      </div>

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-worldshape-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌐</span> 5. Forme du monde</span>
          <label class="pix-switch" title="Basculer entre monde bouliste (sphère) et platiste (plat)">
            <input id="worldShapeToggle" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="pix.worldShape">Mode actuel</span>
          <output id="worldShapeModeLabel" style="grid-column: 3;"></output>
        </div>
      </div>

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-daynight-section">
        <div class="debug-light-pix-head">
          <span><span class="rubrique-emoji">🌓</span> 6. Jour / Nuit</span>
          <label class="pix-switch" title="Basculer entre jour et nuit">
            <input id="dayNightToggle" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="env.dayNight">Mode actuel</span>
          <output id="dayNightModeLabel" style="grid-column: 3;"></output>
        </div>
      </div>
      </div><!-- /.debug-light-col-third (4. VENT + 5. Forme du monde + 6. Jour/Nuit) -->
      </div><!-- /.debug-light-columns -->
      </div><!-- /.debug-light-tab-panel[3] -->

      </div><!-- /.debug-light-tab-panels -->

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-footer">
        <div class="debug-light-export">
          <div class="debug-light-export-row">
            <button id="debugLightCopy" type="button" title="Copier tous les paramètres LUT + PIX + EAU + CINÉMA + VENT + NUAGES + Forme du monde + Jour/Nuit courants en JSON">📋 Copier</button>
            <button id="debugLightUndo" type="button" disabled title="Annuler la dernière modification (Undo)">↩ Undo</button>
            <button id="debugLightRedo" type="button" disabled title="Rétablir la modification annulée (Redo)">↪ Redo</button>
            <button id="debugLightReset" type="button" title="Réinitialiser aux valeurs par défaut">Reset</button>
          </div>
          <div class="debug-light-export-row">
            <button id="debugLightCompare" type="button" disabled title="Basculer entre paramètres courants et dernière ambiance">Comparer</button>
            <span id="debugLightLastPreset" class="debug-light-last-preset" title="Dernière ambiance appliquée">—</span>
          </div>
        </div>
      </div><!-- /.debug-light-footer -->
    </div>
`;

export function wireEdaPanel(root, { visualEnvironment, postprocess, forestOverlay = null, cloudSky = null, fpsApi }) {
  const state = visualEnvironment.config ?? cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG);

  const savedConfig = loadLutConfig();
  if (savedConfig) {
    try { replaceDeep(state, savedConfig); } catch (_) { /* config corrompue, on ignore */ }
  }

  // ─── Onglets EDA (TITRE 1/2/3) — regroupent les rubriques sous le header ambiances ──
  // Contenu affiché sur 2 colonnes par onglet (au lieu des 3 colonnes fixes précédentes).
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
  let _comparing             = false;
  let _stateBeforeCompare    = null;  // snapshot state au moment du clic "Comparer" → restauré par "⟳ Retour"
  let _pixelBeforeCompare    = null;  // pixelisation en cours avant entrée en mode comparer
  let _cinBeforeCompare      = null;  // cinéma en cours avant entrée en mode comparer
  let _windBeforeCompare     = null;  // vent en cours avant entrée en mode comparer

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
        `<span>${_emojiHeadHtml(section.label)}</span>` +
        `<label class="pix-switch" title="Activer / désactiver ${section.label.replace(/^\S+\s+[\d.]+\s*/, '').toLowerCase()}">` +
          `<input id="${section.toggleId}" type="checkbox" /><span></span>` +
        `</label>`;
    } else {
      hd.innerHTML = `<span>${_emojiHeadHtml(section.label)}</span>`;
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

    // Par défaut la section reste dans la colonne LUT (`controls`) ; certaines rubriques
    // (ex. Palette biomes) sont délocalisées dans une autre colonne via `hostId`.
    const hostEl = section.hostId ? root.querySelector(`#${section.hostId}`) : controls;
    const _hostTarget = hostEl ?? controls;
    // Séparateur visible entre rubriques (pas avant la toute première de la colonne) —
    // même élément que celui déjà utilisé entre PIXÉLISATION/CINÉMA et NUAGES/VENT.
    if (_hostTarget.children.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'debug-light-pix-sep';
      _hostTarget.appendChild(sep);
    }
    _hostTarget.appendChild(sectionEl);

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
    const _emojiMatch = preset.name.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
    if (_emojiMatch) {
      const _emoji = _emojiMatch[1];
      const _label = preset.name.slice(_emojiMatch[0].length);
      btn.innerHTML = `<span class="preset-emoji">${_emoji}</span>${_label ? `<span class="preset-label">${_label}</span>` : ''}`;
    } else {
      btn.textContent = preset.name;
    }
    btn.title = preset.delta ? `Appliquer l'ambiance "${preset.name}"` : 'Retour aux valeurs par défaut';
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
      applyAll();
      // Snapshot pour "Comparer"
      lastPresetState        = JSON.parse(JSON.stringify(state));
      lastPresetPixelization = pix;
      lastPresetCinema       = cin;
      lastPresetWind         = wind;
      lastPresetEl.textContent = preset.name;
      compareBtn.disabled   = false;
      _comparing            = false;
      _updateCompareBtn();
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
  }

  lutToggleBtn.addEventListener('click', () => {
    _setLutOpen(root.classList.contains('collapsed')); // collapsed → ouvrir, sinon fermer
  });
  // Touche E : ouvrir/fermer le panel EDA
  document.addEventListener('keydown', e => {
    if (e.key === 'e' || e.key === 'E') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
    worldShapeModeLabelEl.innerHTML = _emojiHeadHtml(_pixCurrent.worldShapeMode === 'bouliste' ? '🌍 Bouliste' : '📐 Platiste');
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
    dayNightModeLabelEl.innerHTML = _emojiHeadHtml(_dayNightCurrent === 'soleil' ? '☀️ Jour' : '🌙 Nuit');
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
    attachHelpTooltip(el, LUT_HELP[el.dataset.help] ?? '');
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
    `<span>${_emojiHeadHtml('🫧 1. Écume')}</span>` +
    `<label class="pix-switch" title="Activer / désactiver l'écume">` +
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

  const waterSep = document.createElement('div');
  waterSep.className = 'debug-light-pix-sep';
  waterControlsHost.appendChild(waterSep);

  const waterWakeHead = document.createElement('div');
  waterWakeHead.className = 'lut-section-head lut-section-head--with-toggle';
  waterWakeHead.innerHTML =
    `<span>${_emojiHeadHtml('🚤 2. Sillage bateau')}</span>` +
    `<label class="pix-switch" title="Activer / désactiver le sillage bateau">` +
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
    root.querySelector('.debug-light-cinema-section').classList.toggle('cinema-section--disabled', !_cinCurrent.enabled);
    root.querySelector('.debug-light-crt-section').classList.toggle('crt-section--disabled', !_cinCurrent.crtEnabled);
  }

  function _commitCin(partial) {
    const next = _normalizeCin({ ..._cinCurrent, ...partial });
    postprocess?.applyCinemaSettings?.(next);
    _renderCinControls(next);
    _storeCinSettings(next);
  }

  // Sync depuis l'extérieur (touche C dans scene.js → postprocess.toggleCinema)
  function _syncCinControls() {
    const ext = postprocess?.getCinemaSettings?.();
    if (ext) _renderCinControls({ ..._cinCurrent, ...ext });
  }

  // Undo/Redo couvrent aussi le CINÉMA : capture de l'état AVANT modification.
  cinEnabledEl.addEventListener('change', () => { pushUndo(); _commitCin({ enabled: cinEnabledEl.checked }); });
  [cinTiltEl, cinFocusCenterEl, cinFocusBandEl, cinVignetteEl, cinGrainEl, cinChromaticEl, cinHalationEl, cinBarrelEl, cinScanLinesEl,
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

  // Hook pour que la touche T puisse notifier le panel (sync checkbox + disabled state)
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
  windWheatHead.innerHTML = `<span>${_emojiHeadHtml('🌾 4.1 Brins de blés')}</span>`;
  windControlsHost.appendChild(windWheatHead);
  for (const s of WIND_WHEAT_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _windCurrent.wheat[s.key],
      v => _commitWind({ wheat: { [s.key]: v } }), pushUndo, `wind.wheat.${s.key}`);
    _windWheatEls[s.key] = { input, output };
    windControlsHost.appendChild(row);
  }

  const windGrassHead = document.createElement('div');
  windGrassHead.className = 'lut-section-head lut-section-head--nested';
  windGrassHead.innerHTML = `<span>${_emojiHeadHtml('🌿 4.2 Brins d\'herbes')}</span>`;
  windControlsHost.appendChild(windGrassHead);
  for (const s of WIND_GRASS_SLIDERS) {
    const { row, input, output } = createRawSlider(s.label, s.min, s.max, s.step, _windCurrent.grass[s.key],
      v => _commitWind({ grass: { [s.key]: v } }), pushUndo, `wind.grass.${s.key}`);
    _windGrassEls[s.key] = { input, output };
    windControlsHost.appendChild(row);
  }

  const windTreeHead = document.createElement('div');
  windTreeHead.className = 'lut-section-head lut-section-head--nested';
  windTreeHead.innerHTML = `<span>${_emojiHeadHtml('🌳 4.3 Arbres')}</span>`;
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
      // Afficher la dernière ambiance preset
      visualEnvironment.apply(lastPresetState);
      applyColorGradingUniforms(postprocess?.colorGradingPass, lastPresetState);
      if (lastPresetPixelization) _commitPix(lastPresetPixelization);
      if (lastPresetCinema)       _commitCin(lastPresetCinema);
      if (lastPresetWind)         _commitWind(lastPresetWind);
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
    }
  });

  root.querySelector('#debugLightCopy').addEventListener('click', async function () {
    const combined = {
      lut: visualEnvironment.exportConfig(), pix: _pixCurrent, cinema: _cinCurrent, water: _waterCurrent,
      wind: _windCurrent, cloud: _cloudCurrent, dayNight: _dayNightCurrent,
    };
    const text = JSON.stringify(combined, null, 2);
    await copyToClipboard(text).catch(err => console.warn('[debugLightUI] copie impossible', err));
    const btn = this;
    const orig = btn.textContent;
    btn.textContent = '✓ Copié !';
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

  // ─── Synchroniser la largeur du LUT panel avec #tileUI (×3 — 3 colonnes égales) ───────
  // +50% vs l'ancien ×2 : chaque colonne garde la même largeur qu'avant (= largeur #tileUI),
  // on ajoute simplement une 3e colonne (VENT + NUAGES) au lieu d'agrandir les 2 existantes.
  const lutBody = root.querySelector('.debug-light-body');
  const LUT_WIDTH_FACTOR = 2; // 2 colonnes de largeur égale (chacune = largeur d'origine #tileUI) — depuis le passage en onglets
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

  // ─── Mini HUD clavier (bottom-right, toujours visible) ─────────────────────
  const kbdHint = document.createElement('div');
  kbdHint.id = 'kbdHintHud';
  kbdHint.innerHTML = 'H ou ESC&nbsp;→ aide &nbsp;|&nbsp; M&nbsp;→ mute &nbsp;|&nbsp; ESPACE&nbsp;→ immersif &nbsp;|&nbsp; MAJ+ESPACE&nbsp;→ super-immersif';
  document.body.appendChild(kbdHint);

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

  // Snapshot combiné LUT + PIX + CINÉMA + EAU + VENT + NUAGES — undo/redo agissent sur tout le panneau CUSTOMISATION.
  function _snapshotAll() {
    return JSON.stringify({ lut: state, pix: _pixCurrent, cin: _cinCurrent, water: _waterCurrent, wind: _windCurrent, cloud: _cloudCurrent });
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
    applyAll();
  }

  function _updateCompareBtn() {
    compareBtn.textContent = _comparing ? '⟳ Retour' : 'Comparer';
    compareBtn.classList.toggle('debug-light-compare-btn--active', _comparing);
  }
}

function createSlider(state, path, label, min, max, step, onChange, onBeforeChange) {
  const row = document.createElement('label');
  row.className = 'debug-light-row';

  const value = Number(getPath(state, path));
  const help = getHelpText(path);
  row.innerHTML = `
    <span>${label}</span>
    <input data-path="${path}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <output>${formatNumber(value)}</output>
  `;

  // Tooltip custom au hover du label
  attachHelpTooltip(row.querySelector('span'), help);

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
function createRawSlider(label, min, max, step, value, onChange, onBeforeChange, helpKey) {
  const row = document.createElement('label');
  row.className = 'debug-light-row';
  row.innerHTML = `
    <span>${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <output>${formatNumber(value)}</output>
  `;

  if (helpKey) attachHelpTooltip(row.querySelector('span'), LUT_HELP[helpKey] ?? '');

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
    <span title="${escapeHtml(help)}">${label}</span>
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
function _emojiHeadHtml(label) {
  const m = /^(\S+)(\s[\s\S]*)$/.exec(label);
  if (!m) return escapeHtml(label);
  return `<span class="rubrique-emoji">${m[1]}</span>${escapeHtml(m[2])}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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
