import { DEFAULT_VISUAL_ENVIRONMENT_CONFIG, cloneVisualConfig, applyColorGradingUniforms } from './visualEnvironment.js';
import { getWorldShapeMode, setWorldShapeMode } from './worldCurvature.js';
import { LUT_HELP, ensureHelpTooltip, moveHelpTooltip, attachHelpTooltip, delegateHelpTooltip } from './help.js';
import { scanScene, GROUP_ORDER, GROUP_ICONS, ITEM_GROUP, CATEGORY_ICONS } from './sceneProfiler.js';

// ─── PIX HUD constants (embedded inside CUSTOMISATION panel) ─────────────────
const PIX_STORAGE_KEY = 'dorfoPixelPostprocessSettings.v4';
// ─── CINEMA HUD constants ─────────────────────────────────────────────────────
const CIN_STORAGE_KEY = 'hexistenz_cinema_v1';
const CIN_DEFAULTS = Object.freeze({
  enabled: false,
  tilt: 0.60, focusCenter: 0.50, focusBand: 0.35,
  vignette: 0.55, grain: 0.30, chromatic: 0.45,
  halation: 0.0, barrel: 0.0, scanLines: 0.0,
});
function _normalizeCin(s) {
  const clp = (v, d, mx) => Math.min(mx, Math.max(0, isFinite(Number(v)) ? Number(v) : d));
  return {
    enabled:     Boolean(s.enabled),
    tilt:        clp(s.tilt,        CIN_DEFAULTS.tilt,        1),
    focusCenter: clp(s.focusCenter, CIN_DEFAULTS.focusCenter, 1),
    focusBand:   clp(s.focusBand,   CIN_DEFAULTS.focusBand,   1),
    vignette:    clp(s.vignette,    CIN_DEFAULTS.vignette,    1),
    grain:       clp(s.grain,       CIN_DEFAULTS.grain,       1),
    chromatic:   clp(s.chromatic,   CIN_DEFAULTS.chromatic,   1),
    halation:    clp(s.halation,    CIN_DEFAULTS.halation,    1),
    barrel:      clp(s.barrel,      CIN_DEFAULTS.barrel,      1),
    scanLines:   clp(s.scanLines,   CIN_DEFAULTS.scanLines,   6), // 0–6 px
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

// ─── Perf HUD (module-level, self-contained) ─────────────────────────────────
let _fpsFrameCount  = 0;
let _fpsLastTime    = performance.now();
let _statsLastTime  = 0;           // dernier scan scène
let _fpsEl          = null;        // set after DOM creation
let _cachedCounts   = {};          // résultats du dernier scan
let _lastHudFps     = 0;           // pour la copie
let _lastHudInfo    = null;        // pour la copie
let _hudCopied      = false;       // feedback bouton ✓ persistant à travers les rebuilds HTML
let _fpsHudExpanded = localStorage.getItem('hexistenz_fps_hud_expanded') !== 'false'; // panneau perf avancé ouvert/fermé
// Tri colonnes : persistant entre les rebuilds 500ms
let _hudSortKey     = 'draws';     // 'count' | 'draws' | 'shadows' | 'tris'
let _hudSortDir     = -1;          // -1 = desc, +1 = asc
// Timing CPU/GPU passé depuis scene.js pour les indices d'efficacité
let _lastPerfTiming = { jsMs: 0, renderMs: 0 };


function _fmtNum(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

function _hudCopyText() {
  const info = _lastHudInfo;
  const calls = info?.render?.calls ?? '–';
  const tris  = info?.render?.triangles ?? 0;
  const tex   = info?.memory?.textures ?? '–';
  const prog  = info?.programs?.length  ?? '–';

  const renderMs  = _lastPerfTiming.renderMs;
  const jsMs      = _lastPerfTiming.jsMs;
  const gpuLoad   = renderMs > 0 ? Math.min(100, renderMs / 16.67 * 100) : 0;
  const cpuLoad   = jsMs     > 0 ? Math.min(100, jsMs     / 16.67 * 100) : 0;

  const trackedDc = Object.values(_cachedCounts).reduce((s, e) => s + e.draws, 0);
  const trackedTris = Object.values(_cachedCounts).reduce((s, e) => s + e.tris, 0);
  const shadowCasters = Object.values(_cachedCounts).reduce((s, e) => s + e.shadows, 0);
  const shadowDc  = typeof calls === 'number' ? Math.max(0, calls - trackedDc) : '–';

  let text = `${_lastHudFps} FPS\n`;
  text += `🖥️ CPU : ${Math.round(cpuLoad)}%  (JS ${jsMs.toFixed(1)}ms / 16.7ms)\n`;
  text += `🎮 GPU : ${Math.round(gpuLoad)}%  (render ${renderMs.toFixed(1)}ms / 16.7ms)\n`;
  text += `---\n`;
  text += `Draw calls : ${calls}\n`;
  text += `  ↳ HUD trackés : ${trackedDc}\n`;
  text += `  ↳ Ombres/passes : ≈${shadowDc}  (☂${shadowCasters} casters)\n`;
  text += `Triangles  : ${tris}  (trackés ${_fmtNum(trackedTris)})\n`;
  text += `Textures   : ${tex}\n`;
  text += `Shaders    : ${prog}\n`;

  // Groupé par catégorie, trié selon le tri actif dans le HUD
  const byGroup = new Map();
  for (const groupName of GROUP_ORDER) byGroup.set(groupName, []);
  byGroup.set('__other__', []);
  for (const [label, e] of Object.entries(_cachedCounts)) {
    const g = ITEM_GROUP[label] ?? '__other__';
    const target = byGroup.has(g) ? byGroup.get(g) : byGroup.get('__other__');
    target.push([label, e]);
  }
  const sortFn = ([, a], [, b]) => _hudSortDir * (b[_hudSortKey] - a[_hudSortKey]);
  for (const [groupName, items] of byGroup) {
    if (!items.length) continue;
    items.sort(sortFn);
    const displayName = groupName === '__other__' ? 'Autres' : groupName;
    text += `\n── ${displayName} ──\n`;
    for (const [label, { count, draws, tris: t, shadows }] of items) {
      const shStr = shadows > 0 ? ` | ☂${shadows}` : '';
      text += `${label}: ${count} obj | ${draws} dc${shStr} | ${_fmtNum(t)}▲\n`;
    }
  }
  return text;
}

function _copyToClipboard(text) {
  // Fallback textarea pour contextes HTTP / file:// où navigator.clipboard est absent
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (_) { /* rien */ }
  return Promise.resolve();
}

function _copyHud() {
  _copyToClipboard(_hudCopyText()).catch(() => {});
  // Le flag persiste à travers les rebuilds innerHTML (toutes les 500ms)
  _hudCopied = true;
  setTimeout(() => { _hudCopied = false; }, 1500);
}

function _fpsAdjective(fps) {
  if (fps < 15) return { text: 'Désastreux', cls: 'fps-adj-red' };
  if (fps < 25) return { text: 'Mauvais',    cls: 'fps-adj-orange' };
  if (fps < 35) return { text: 'Médiocre',   cls: 'fps-adj-amber' };
  if (fps < 50) return { text: 'Passable',   cls: 'fps-adj-yellow' };
  if (fps < 70) return { text: 'Bon',        cls: 'fps-adj-lightgreen' };
  return              { text: 'Splendide',   cls: 'fps-adj-green' };
}

function _buildHud(fps, info) {
  _lastHudFps  = fps;
  _lastHudInfo = info;

  const calls = info?.render?.calls ?? '–';
  const tris  = _fmtNum(info?.render?.triangles ?? 0);
  const tex   = info?.memory?.textures ?? '–';
  const prog  = info?.programs?.length  ?? '–';

  const trackedDc     = Object.values(_cachedCounts).reduce((s, e) => s + e.draws,   0);
  const shadowCasters = Object.values(_cachedCounts).reduce((s, e) => s + e.shadows, 0);
  const shadowDc      = typeof calls === 'number' ? Math.max(0, calls - trackedDc) : '–';
  const shadowStr     = shadowDc === '–' ? '–' : `≈ ${_fmtNum(shadowDc)} (☂${shadowCasters} casters)`;
  const totalObjects  = Object.values(_cachedCounts).reduce((s, e) => s + e.count, 0);

  const adj = _fpsAdjective(fps);

  // GPU / CPU load indices — % du budget frame utilisé (0%=idle=vert, 100%=saturé=rouge)
  const renderMs = _lastPerfTiming.renderMs;
  const jsMs     = _lastPerfTiming.jsMs;
  const gpuLoad  = renderMs > 0 ? Math.min(100, renderMs / 16.67 * 100) : 0;
  const cpuLoad  = jsMs     > 0 ? Math.min(100, jsMs     / 16.67 * 100) : 0;
  const gpuColor = gpuLoad  <= 30 ? '#4ade80' : gpuLoad  <= 65 ? '#fbbf24' : gpuLoad  <= 85 ? '#fb923c' : '#f87171';
  const cpuColor = cpuLoad  <= 30 ? '#4ade80' : cpuLoad  <= 65 ? '#fbbf24' : cpuLoad  <= 85 ? '#fb923c' : '#f87171';

  const header =
    `<div class="fps-hud-header">` +
      `<div class="fps-hud-fps" data-stat-help="fps.fps">${fps} <span>FPS</span> <span class="fps-adj ${adj.cls}" data-stat-help="fps.adj">${adj.text}</span></div>` +
      `<button class="fps-hud-copy" type="button" title="Copier le HUD">${_hudCopied ? '✓' : '⧉'}</button>` +
      (_fpsHudExpanded ? `<button class="fps-hud-close" type="button" title="Fermer le HUD performances">✕</button>` : '') +
    `</div>` +
    `<div class="fps-hud-eff-row">` +
      `<div class="fps-hud-eff-item">` +
        `<span class="fps-hud-eff-label" data-stat-help="fps.cpu">🖥️ CPU</span>` +
        `<span class="fps-hud-eff-value" style="color:${cpuColor}">${Math.round(cpuLoad)}<span class="fps-hud-eff-pct">%</span></span>` +
      `</div>` +
      `<div class="fps-hud-eff-item">` +
        `<span class="fps-hud-eff-label" data-stat-help="fps.gpu">🎮 GPU</span>` +
        `<span class="fps-hud-eff-value" style="color:${gpuColor}">${Math.round(gpuLoad)}<span class="fps-hud-eff-pct">%</span></span>` +
      `</div>` +
    `</div>`;

  if (!_fpsHudExpanded) return header;

  const msHint = renderMs > 0
    ? `<div style="font-size:10px;color:rgba(180,215,255,0.50);margin-top:2px">GPU ${renderMs.toFixed(1)}ms · CPU ${jsMs.toFixed(1)}ms · budget 16.7ms</div>`
    : '';

  // Tout le contenu détaillé est dans un div scrollable pour ne jamais dépasser la hauteur écran
  const detailRows = [
    `<div class="fps-hud-sep"></div>`,
    _row('Draw calls',       calls,                 'stats.drawCalls'),
    _row('↳ HUD trackés',   _fmtNum(trackedDc),    'stats.trackedDc'),
    _row('↳ Ombres/passes', shadowStr,             'stats.shadows'),
    _row('Triangles',        tris,                 'stats.triangles'),
    _row('Objets',           _fmtNum(totalObjects), 'stats.objects'),
    _row('Textures',         tex,                  'stats.textures'),
    _row('Shaders',          prog,                 'stats.shaders'),
    msHint,
  ];

  const entries = Object.entries(_cachedCounts);
  if (entries.length) {
    detailRows.push(`<div class="fps-hud-sep"></div>`);

    // Sortable column header row
    const COL_DEFS = [
      { key: 'count',   label: 'obj' },
      { key: 'draws',   label: 'DC' },
      { key: 'shadows', label: '☂' },
      { key: 'tris',    label: '▲' },
    ];
    const hdrCols = COL_DEFS.map(({ key, label }) => {
      const active = _hudSortKey === key;
      const arrow  = active ? (_hudSortDir < 0 ? '↓' : '↑') : '';
      const st     = active ? 'color:rgba(255,215,100,0.95);font-weight:800' : 'color:rgba(180,215,255,0.55)';
      return `<span class="fps-hud-col-header" data-sort="${key}" style="${st};cursor:pointer;user-select:none">${label}${arrow}</span>`;
    });
    detailRows.push(
      `<div class="fps-hud-row fps-hud-row-cat">` +
      `<span class="fps-hud-cat-label" style="opacity:0.4;font-size:9px;letter-spacing:.06em">TRI PAR</span>` +
      hdrCols.join('') +
      `</div>`
    );

    // Group items by category, sort within group
    const byGroup = new Map();
    for (const groupName of GROUP_ORDER) byGroup.set(groupName, []);
    byGroup.set('__other__', []);

    for (const [label, e] of entries) {
      const g = ITEM_GROUP[label] ?? '__other__';
      const target = byGroup.has(g) ? byGroup.get(g) : byGroup.get('__other__');
      target.push([label, e]);
    }

    const sortFn = ([, a], [, b]) => _hudSortDir * (b[_hudSortKey] - a[_hudSortKey]);

    let sumCount = 0, sumDraws = 0, sumShadows = 0, sumTris = 0;

    for (const [groupName, items] of byGroup) {
      if (!items.length) continue;
      items.sort(sortFn);

      const displayName = groupName === '__other__' ? 'Autres' : groupName;
      const groupIcon   = GROUP_ICONS[groupName] ?? '◆';
      detailRows.push(
        `<div class="fps-hud-group-header"><span>${groupIcon} ${displayName}</span></div>`
      );

      for (const [label, { count, draws, tris: t, shadows }] of items) {
        sumCount += count; sumDraws += draws; sumShadows += shadows; sumTris += t;
        const heavy = trackedDc > 0 && draws / trackedDc >= 0.10;
        detailRows.push(_rowCat(label, count, draws, t, shadows, heavy));
      }
    }

    // Column totals
    detailRows.push(`<div class="fps-hud-sep"></div>`);
    detailRows.push(
      `<div class="fps-hud-row fps-hud-row-cat fps-hud-row-total">` +
      `<span class="fps-hud-cat-label" style="opacity:0.65;font-style:italic;font-size:10px">TOTAL</span>` +
      `<strong class="fps-hud-cat-count">${_fmtNum(sumCount)}</strong>` +
      `<span class="fps-hud-cat-dc">${sumDraws}dc</span>` +
      `<span class="fps-hud-cat-shadow">${sumShadows > 0 ? '☂' + sumShadows : ''}</span>` +
      `<span class="fps-hud-cat-tri">${_fmtNum(sumTris)}▲</span>` +
      `</div>`
    );
  }

  return header + `<div class="fps-hud-body">` + detailRows.join('') + `</div>`;
}

function _row(label, value, helpKey = '') {
  const attr = helpKey ? ` data-stat-help="${helpKey}"` : '';
  return `<div class="fps-hud-row"><span>${label}</span><strong${attr}>${value}</strong></div>`;
}

// Ligne catégorie étendue : icône + label | count | draw calls (×ratio) | shadows | triangles
function _rowCat(label, count, draws, tris, shadows, isHeavy = false) {
  const icon = CATEGORY_ICONS[label] ?? '◆';
  const shadowStr = shadows > 0 ? `<span class="fps-hud-cat-shadow" title="Objets castant une ombre">☂${shadows}</span>` : `<span class="fps-hud-cat-shadow"></span>`;
  const heavyCls = isHeavy ? ' fps-hud-row-cat--heavy' : '';

  // Ratio DC/obj — affiché seulement quand > 1 (plusieurs DC par objet)
  let ratioStr = '';
  if (count > 0 && draws > count) {
    const ratio = draws / count;
    const col = ratio >= 10 ? '#f87171' : ratio >= 5 ? '#fb923c' : ratio >= 3 ? '#fbbf24' : 'rgba(180,215,255,0.42)';
    const rFmt = ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1);
    ratioStr = `<span style="font-size:9px;color:${col};margin-left:2px" title="${rFmt} DC par objet">×${rFmt}</span>`;
  }

  return `<div class="fps-hud-row fps-hud-row-cat${heavyCls}">` +
    `<span class="fps-hud-cat-label"><span class="fps-hud-cat-icon">${icon}</span>${label}</span>` +
    `<strong class="fps-hud-cat-count">${_fmtNum(count)}</strong>` +
    `<span class="fps-hud-cat-dc">${draws}dc${ratioStr}</span>` +
    shadowStr +
    `<span class="fps-hud-cat-tri">${_fmtNum(tris)}▲</span>` +
    `</div>`;
}

export function tickFps(renderer, scene, perfTiming = null) {
  if (perfTiming) _lastPerfTiming = perfTiming;
  _fpsFrameCount++;
  const now = performance.now();

  // Scan scène toutes les 2 s (coûteux, on ralentit)
  if (scene && now - _statsLastTime > 2000) {
    _cachedCounts = scanScene(scene);
    _statsLastTime = now;
  }

  // Affichage toutes les 500 ms
  if (now - _fpsLastTime >= 500) {
    const fps = Math.round(_fpsFrameCount * 1000 / (now - _fpsLastTime));
    _fpsFrameCount = 0;
    _fpsLastTime   = now;
    if (_fpsEl) {
      // Conserver la position de scroll avant de réecrire l'innerHTML
      const _prevBody   = _fpsEl.querySelector('.fps-hud-body');
      const _prevScroll = _prevBody ? _prevBody.scrollTop : 0;
      _fpsEl.innerHTML  = _buildHud(fps, renderer?.info);
      if (_prevScroll > 0) {
        const _newBody = _fpsEl.querySelector('.fps-hud-body');
        if (_newBody) _newBody.scrollTop = _prevScroll;
      }
    }
  }
}

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
    label: 'Rendu',
    sliders: [
      ['renderer.toneMappingExposure', 'Exposition globale', 0.05, 6.00, 0.01],
    ]
  },
  {
    label: 'Brouillard',
    sliders: [
      ['environment.fogDensity', 'Densité (exponentiel)',  0.000, 0.500, 0.001],
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
    label: 'Lumières',
    sliders: [
      ['lights.hemisphereIntensity', 'Intensité hémisphère', 0.00,  4.00,  0.01],
      ['lights.sunIntensity',        'Intensité soleil',     0.00,  15.00, 0.05],
      ['lights.sunOrbitRadius',      'Rayon orbite',         0.5,   50.0,  0.1],
      ['lights.sunOrbitHeight',      'Hauteur orbite',       0.0,   40.0,  0.1],
      ['lights.sunOrbitSpeed',       'Vitesse orbite',       0.0,   1.00,  0.001],
      ['lights.sunVisualScale',      'Taille soleil',        0.05,  8.00,  0.01],
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
    label: 'Étalonnage',
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
    label: 'Palette biomes',
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
      ['palette.targets.rail',   'Rails'],
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
  .catch(e => { console.error('[debugLightUi] Impossible de charger ambiances.json :', e); return []; });

// HELP_TEXT déplacé dans help.js → importé en tête de fichier comme LUT_HELP

export function createDebugLightUI({ visualEnvironment, postprocess }) {
  if (!visualEnvironment) return null;

  installDebugLightCss();
  ensureHelpTooltip();

  const state = visualEnvironment.config ?? cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG);

  // Restaurer les préférences sauvegardées (sauf si l'utilisateur a fait un Reset)
  const savedConfig = loadLutConfig();
  if (savedConfig) {
    try { replaceDeep(state, savedConfig); } catch (_) { /* config corrompue, on ignore */ }
  }

  const root = document.createElement('section');
  root.id = 'debugLightPanel';
  root.className = 'debug-light-panel collapsed';
  root.innerHTML = `
    <div class="debug-light-left-col">
      <div id="fps-counter" class="fps-counter">-- FPS</div>
      <div class="debug-light-btn-row">
        <button id="fpsHudToggle" class="debug-light-toggle debug-light-toggle--fps" type="button" tabindex="-1" title="Afficher/masquer le HUD performances avancé">DEBUG <mark class="btn-key">F</mark>PS</button>
        <button id="debugLightToggle" class="debug-light-toggle" type="button" tabindex="-1" title="Ouvrir ou fermer le panneau de rendu"><mark class="btn-key">L</mark>UT</button>
      </div>
    </div>
    <div class="debug-light-body">
      <div class="debug-light-lut-scroll">
        <div class="debug-light-head">
          <strong>LUT</strong>
          <button id="debugLightReset" type="button">Reset</button>
          <button id="debugLightClose" type="button" class="debug-light-close-btn" title="Fermer">✕</button>
        </div>
        <div class="debug-light-presets-label">AMBIANCES</div>
        <div id="debugLightPresets" class="debug-light-presets"></div>
        <div class="debug-light-pix-sep"></div>
        <div class="world-shape-row">
          <div class="world-shape-pair">
            <select id="pixWorldShape" class="world-shape-select" title="Forme du monde">
              <option value="bouliste">🌍 Bouliste</option>
              <option value="platiste">📐 Platiste</option>
            </select>
            <select id="dayNightMode" class="world-shape-select" title="Jour / Nuit">
              <option value="soleil">☀️ Jour</option>
              <option value="lune">🌙 Nuit</option>
            </select>
          </div>
        </div>
        <div class="debug-light-pix-sep"></div>
        <div class="debug-light-switches">
          <label title="Active ou désactive l’étalonnage final appliqué après le rendu Three.js."><input id="debugGradingEnabled" type="checkbox"> Étalonnage final</label>
          <label title="Active ou désactive l’harmonisation de palette sur les textures ciblées."><input id="debugPaletteEnabled" type="checkbox"> Palette textures</label>
          <label title="Active ou désactive le mouvement orbital du soleil et donc des ombres."><input id="debugSunOrbitEnabled" type="checkbox"> Orbite soleil</label>
        </div>
        <div id="debugLightControls" class="debug-light-controls"></div>
        <div class="debug-light-export">
          <div class="debug-light-export-row">
            <button id="debugLightCopy" type="button" title="Copier tous les paramètres LUT + PIX + CINÉMA courants en JSON">📋 Copier</button>
            <button id="debugLightUndo" type="button" disabled title="Annuler la dernière modification (Undo)">↩ Undo</button>
            <button id="debugLightRedo" type="button" disabled title="Rétablir la modification annulée (Redo)">↪ Redo</button>
            <button id="debugLightCompare" type="button" disabled title="Basculer entre paramètres courants et dernière ambiance">Comparer</button>
            <span id="debugLightLastPreset" class="debug-light-last-preset" title="Dernière ambiance appliquée">—</span>
          </div>
        </div>
      </div><!-- /.debug-light-lut-scroll -->

      <div class="debug-light-pix-sep"></div>

      <div class="debug-light-pix-section">
        <div class="debug-light-pix-head">
          <span>PIXELISATION</span>
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

      <div class="debug-light-cinema-section">
        <div class="debug-light-pix-head">
          <span>CINÉMA [T]</span>
          <label class="pix-switch" title="Activer / désactiver les effets cinématiques [T]">
            <input id="cinEnabled" type="checkbox" />
            <span></span>
          </label>
        </div>
        <div class="debug-light-row">
          <span data-help="cin.tilt">Tilt-shift</span>
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
        <div class="debug-light-row">
          <span data-help="cin.vignette">Vignette</span>
          <input id="cinVignette" type="range" min="0" max="1" step="0.01" />
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
      </div>
    </div>
  `;

  document.body.appendChild(root);
  _fpsEl = root.querySelector('#fps-counter');
  // Délégation de clic sur le conteneur HUD → bouton copier (innerHTML est recréé à chaque frame)
  _fpsEl.addEventListener('click', e => {
    if (e.target.closest('.fps-hud-copy'))  { _copyHud(); return; }
    if (e.target.closest('.fps-hud-close')) { _toggleFpsHud(); return; }
    const sortEl = e.target.closest('[data-sort]');
    if (sortEl) {
      const key = sortEl.dataset.sort;
      if (_hudSortKey === key) _hudSortDir *= -1;
      else { _hudSortKey = key; _hudSortDir = -1; }
      if (_fpsEl) _fpsEl.innerHTML = _buildHud(_lastHudFps, _lastHudInfo);
    }
  });
  // Tooltip au survol des valeurs du HUD DEBUG FPS (délégation — innerHTML rebuilt each frame)
  delegateHelpTooltip(_fpsEl, 'stat-help', LUT_HELP);

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
  let _comparing             = false;
  let _stateBeforeCompare    = null;  // snapshot state au moment du clic "Comparer" → restauré par "⟳ Retour"
  let _pixelBeforeCompare    = null;  // pixelisation en cours avant entrée en mode comparer
  let _cinBeforeCompare      = null;  // cinéma en cours avant entrée en mode comparer

  const gradingEnabled = root.querySelector('#debugGradingEnabled');
  const paletteEnabled = root.querySelector('#debugPaletteEnabled');
  const sunOrbitEnabled = root.querySelector('#debugSunOrbitEnabled');

  gradingEnabled.checked = state.grading?.enabled !== false;
  paletteEnabled.checked = state.palette?.enabled !== false;
  sunOrbitEnabled.checked = state.lights?.sunOrbitEnabled !== false;

  gradingEnabled.addEventListener('change', () => {
    setPath(state, 'grading.enabled', gradingEnabled.checked);
    applyAll();
  });

  paletteEnabled.addEventListener('change', () => {
    setPath(state, 'palette.enabled', paletteEnabled.checked);
    applyAll();
  });

  sunOrbitEnabled.addEventListener('change', () => {
    setPath(state, 'lights.sunOrbitEnabled', sunOrbitEnabled.checked);
    applyAll();
  });

  // ─── Rendu des contrôles LUT par section ────────────────────────────────────
  for (const section of LUT_SECTIONS) {
    const hd = document.createElement('div');
    hd.className = 'lut-section-head';
    hd.textContent = section.label;
    controls.appendChild(hd);

    for (const [path, label, min, max, step] of (section.sliders ?? [])) {
      controls.appendChild(createSlider(state, path, label, min, max, step, applyAll, pushUndo));
    }

    if (section.colors?.length) {
      // Toutes les couleurs en grille 2 colonnes compacte
      const grid = document.createElement('div');
      grid.className = 'color-grid';
      for (const [path, label] of section.colors) {
        grid.appendChild(createColorPicker(state, path, label, applyAll, pushUndo));
      }
      controls.appendChild(grid);
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
      applyAll();
      // Snapshot pour "Comparer"
      lastPresetState        = JSON.parse(JSON.stringify(state));
      lastPresetPixelization = pix;
      lastPresetCinema       = cin;
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
  }

  lutToggleBtn.addEventListener('click', () => {
    _setLutOpen(root.classList.contains('collapsed')); // collapsed → ouvrir, sinon fermer
  });
  // Bouton × dans l'en-tête LUT → fermer le panel
  root.querySelector('#debugLightClose').addEventListener('click', () => {
    _setLutOpen(false);
  });
  // Touche L : ouvrir/fermer le panel LUT
  document.addEventListener('keydown', e => {
    if (e.key === 'l' || e.key === 'L') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      _setLutOpen(root.classList.contains('collapsed'));
    }
  });

  // Sync visibilité du scorePanel + classe fullscreen sur le panel
  function _syncFpsFullscreen() {
    const scorePanel = document.getElementById('scorePanel');
    if (scorePanel) scorePanel.style.display = _fpsHudExpanded ? 'none' : '';
    root.classList.toggle('fps-hud-fullscreen', _fpsHudExpanded);
  }

  // Bouton FPS : affiche/masque le HUD perf avancé
  function _toggleFpsHud() {
    _fpsHudExpanded = !_fpsHudExpanded;
    localStorage.setItem('hexistenz_fps_hud_expanded', _fpsHudExpanded);
    const btn = root.querySelector('#fpsHudToggle');
    if (btn) btn.classList.toggle('debug-light-toggle--fps-active', _fpsHudExpanded);
    _syncFpsFullscreen();
    // Forcer rebuild immédiat
    if (_fpsEl) _fpsEl.innerHTML = _buildHud(_lastHudFps, _lastHudInfo);
  }
  root.querySelector('#fpsHudToggle').addEventListener('click', _toggleFpsHud);
  // Mettre à jour l'état initial du bouton + sync fullscreen (restaure état depuis localStorage)
  const fpsBtnInit = root.querySelector('#fpsHudToggle');
  if (fpsBtnInit) fpsBtnInit.classList.toggle('debug-light-toggle--fps-active', _fpsHudExpanded);
  _syncFpsFullscreen();

  // Touche F : basculer le HUD perf avancé
  document.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      _toggleFpsHud();
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
  const pixShapeEl    = root.querySelector('#pixWorldShape');
  const pixShapeValEl = root.querySelector('#pixWorldShapeValue');

  function _renderPixControls(s) {
    _pixCurrent = _normalizePix(s);
    pixEnabledEl.checked     = _pixCurrent.enabled;
    pixSizeEl.value          = String(_pixCurrent.pixelSize);
    pixSizeValEl.textContent = String(_pixCurrent.pixelSize);
    pixNormalEl.value        = String(_pixCurrent.normalEdgeStrength);
    pixNormalValEl.textContent = _pixCurrent.normalEdgeStrength.toFixed(2);
    pixDepthEl.value         = String(_pixCurrent.depthEdgeStrength);
    pixDepthValEl.textContent  = _pixCurrent.depthEdgeStrength.toFixed(2);
    if (pixShapeEl) pixShapeEl.value = _pixCurrent.worldShapeMode;
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

  pixEnabledEl.addEventListener('change', () => _commitPix({ enabled: pixEnabledEl.checked }));
  pixSizeEl.addEventListener('input', () => _commitPix({ pixelSize: Number(pixSizeEl.value) }));
  pixNormalEl.addEventListener('input', () => _commitPix({ normalEdgeStrength: Number(pixNormalEl.value) }));
  pixDepthEl.addEventListener('input', () => _commitPix({ depthEdgeStrength: Number(pixDepthEl.value) }));
  pixShapeEl.addEventListener('change', () => _commitPix({ worldShapeMode: pixShapeEl.value }));

  // ── Toggle Jour / Nuit ──────────────────────────────────────────────────────
  const dayNightEl = root.querySelector('#dayNightMode');
  // Init depuis localStorage (scene.js écrit la valeur résolue au démarrage)
  if (dayNightEl) {
    const _initDN = localStorage.getItem('hexistenz_daynightmode');
    if (_initDN === 'soleil' || _initDN === 'lune') dayNightEl.value = _initDN;
    dayNightEl.addEventListener('change', () => {
      const mode = dayNightEl.value;
      localStorage.setItem('hexistenz_daynightmode', mode);
      document.dispatchEvent(new CustomEvent('hexistenz:dayNightChange', { detail: { mode } }));
    });
  }

  // Hook pour que les presets puissent notifier le HUD de changements PIX
  postprocess?.onExternalSettingsChange?.(_syncPixControls);

  _renderPixControls(_pixCurrent);

  // Attacher les tooltips aux labels des sliders PIX, CINEMA et Forme du monde
  root.querySelectorAll('.debug-light-pix-section [data-help], .debug-light-cinema-section [data-help], .world-shape-row [data-help]').forEach(el => {
    attachHelpTooltip(el, LUT_HELP[el.dataset.help] ?? '');
  });

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
    root.querySelector('.debug-light-cinema-section').classList.toggle('cinema-section--disabled', !_cinCurrent.enabled);
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

  cinEnabledEl.addEventListener('change',    () => _commitCin({ enabled:     cinEnabledEl.checked }));
  cinTiltEl.addEventListener('input',         () => _commitCin({ tilt:        Number(cinTiltEl.value) }));
  cinFocusCenterEl.addEventListener('input',  () => _commitCin({ focusCenter: Number(cinFocusCenterEl.value) }));
  cinFocusBandEl.addEventListener('input',    () => _commitCin({ focusBand:   Number(cinFocusBandEl.value) }));
  cinVignetteEl.addEventListener('input',     () => _commitCin({ vignette:    Number(cinVignetteEl.value) }));
  cinGrainEl.addEventListener('input',        () => _commitCin({ grain:       Number(cinGrainEl.value) }));
  cinChromaticEl.addEventListener('input',    () => _commitCin({ chromatic:   Number(cinChromaticEl.value) }));
  cinHalationEl.addEventListener('input',     () => _commitCin({ halation:    Number(cinHalationEl.value) }));
  cinBarrelEl.addEventListener('input',       () => _commitCin({ barrel:      Number(cinBarrelEl.value) }));
  cinScanLinesEl.addEventListener('input',    () => _commitCin({ scanLines:   Number(cinScanLinesEl.value) }));

  // Hook pour que la touche T puisse notifier le panel (sync checkbox + disabled state)
  postprocess?.onExternalCinemaChange?.(_syncCinControls);

  _renderCinControls(_cinCurrent);

  undoBtn.addEventListener('click', () => {
    if (_undoStack.length === 0) return;
    _redoStack.push(JSON.stringify(state)); // mémoriser l'état courant pour pouvoir refaire
    redoBtn.disabled = false;
    replaceDeep(state, JSON.parse(_undoStack.pop()));
    undoBtn.disabled = _undoStack.length === 0;
    _comparing = false;
    _updateCompareBtn();
    refreshInputs(root, state);
    applyAll();
  });

  redoBtn.addEventListener('click', () => {
    if (_redoStack.length === 0) return;
    _undoStack.push(JSON.stringify(state)); // permettre de ré-annuler
    undoBtn.disabled = false;
    replaceDeep(state, JSON.parse(_redoStack.pop()));
    redoBtn.disabled = _redoStack.length === 0;
    _comparing = false;
    _updateCompareBtn();
    refreshInputs(root, state);
    applyAll();
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
      // Afficher la dernière ambiance preset
      visualEnvironment.apply(lastPresetState);
      applyColorGradingUniforms(postprocess?.colorGradingPass, lastPresetState);
      if (lastPresetPixelization) _commitPix(lastPresetPixelization);
      if (lastPresetCinema)       _commitCin(lastPresetCinema);
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
    }
  });

  root.querySelector('#debugLightCopy').addEventListener('click', async function () {
    const combined = { lut: visualEnvironment.exportConfig(), pix: _pixCurrent, cinema: _cinCurrent };
    const text = JSON.stringify(combined, null, 2);
    await _copyToClipboard(text).catch(err => console.warn('[debugLightUI] copie impossible', err));
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
    refreshInputs(root, state);
    applyAll();
    // Réinitialiser la caméra (équivalent touche R)
    window.dispatchEvent(new CustomEvent('hexistenz:resetCamera'));
  });

  // ─── Synchroniser la largeur du LUT panel avec #tileUI ─────────────────────
  const lutBody = root.querySelector('.debug-light-body');
  function _syncLutWidth() {
    const tileUI = document.getElementById('tileUI');
    if (tileUI && lutBody) {
      const w = tileUI.offsetWidth;
      if (w > 0) lutBody.style.width = w + 'px';
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
  kbdHint.innerHTML = 'H ou ESC&nbsp;→ aide &nbsp;·&nbsp; ESPACE&nbsp;→ immersif &nbsp;·&nbsp; MAJ+ESPACE&nbsp;→ super-immersif';
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
    _undoStack.push(JSON.stringify(state));
    if (_undoStack.length > UNDO_MAX) _undoStack.shift();
    undoBtn.disabled = false;
    // Toute nouvelle modification manuelle efface le redo
    _redoStack.length = 0;
    redoBtn.disabled = true;
    // Quitter le mode comparer : une modif manuelle revient à l'état courant
    if (_comparing) { _comparing = false; _updateCompareBtn(); }
  }

  function _updateCompareBtn() {
    compareBtn.textContent = _comparing ? '⟳ Retour' : 'Comparer';
    compareBtn.classList.toggle('debug-light-compare-btn--active', _comparing);
  }
}

// ─── Tooltip : fonctions déplacées dans help.js (ensureHelpTooltip, moveHelpTooltip, attachHelpTooltip) ──

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
  root.querySelector('#debugGradingEnabled').checked = state.grading?.enabled !== false;
  root.querySelector('#debugPaletteEnabled').checked = state.palette?.enabled !== false;
  root.querySelector('#debugSunOrbitEnabled').checked = state.lights?.sunOrbitEnabled !== false;

  root.querySelectorAll('[data-path]').forEach(input => {
    const value = getPath(state, input.dataset.path);
    input.value = input.type === 'color' ? normalizeHex(value) : Number(value);
    const output = input.parentElement?.querySelector('output');
    if (output) output.textContent = input.type === 'color' ? input.value : formatNumber(Number(input.value));
  });
}

function installDebugLightCss() {
  if (document.getElementById('debugLightCss')) return;

  const style = document.createElement('style');
  style.id = 'debugLightCss';
  style.textContent = `
    .debug-light-panel {
      position: fixed;
      bottom: 14px;
      left: 14px;
      right: 14px;
      z-index: 3000;
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
      pointer-events: none;
      color: #f4ead6;
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .debug-light-left-col {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      pointer-events: none;
    }

    .fps-counter {
      pointer-events: auto;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
      color: rgba(240,250,255,0.96);
      background: rgba(0,0,0,0.68);
      border: 1px solid rgba(120,180,255,0.38);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      padding: 14px 16px;
      width: 360px;
      max-width: calc(100vw - 28px);
      box-sizing: border-box;
      /* Limite la hauteur totale à l'écran disponible, avec scroll interne.
         Réserve : 34px (boutons) + 6px (gap) + 14px (bas) + 14px (haut) = 68px */
      max-height: calc(100vh - 72px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Zone scrollable : tout ce qui est sous le header FPS + indices */
    .fps-hud-body {
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1 1 auto;
      min-height: 0;
      /* Scrollbar discrète */
      scrollbar-width: thin;
      scrollbar-color: rgba(120,180,255,0.35) transparent;
    }
    .fps-hud-body::-webkit-scrollbar { width: 4px; }
    .fps-hud-body::-webkit-scrollbar-thumb { background: rgba(120,180,255,0.35); border-radius: 2px; }
    .fps-hud-body::-webkit-scrollbar-track { background: transparent; }

    .fps-hud-header {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      margin-bottom: 2px;
    }

    .fps-hud-copy,
    .fps-hud-close {
      background: rgba(255,255,255,0.10);
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 4px;
      color: rgba(247,239,225,0.75);
      cursor: pointer;
      font-size: 10px;
      line-height: 1;
      padding: 2px 5px;
      flex-shrink: 0;
    }
    .fps-hud-copy { margin-left: auto; }

    .fps-hud-copy:hover,
    .fps-hud-close:hover {
      background: rgba(255,255,255,0.20);
      color: #fff;
    }

    .fps-hud-fps {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: 0.04em;
      color: rgba(240,250,255,0.96);
      font-family: 'BebasNeue', system-ui, sans-serif;
      line-height: 1;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .fps-hud-fps > span:first-child {
      font-size: 12px;
      font-weight: 700;
      color: rgba(180,215,255,0.82);
      letter-spacing: 0.18em;
    }

    .fps-adj {
      font-size: 18px;
      font-weight: 700;
      font-style: normal;
      letter-spacing: 0.04em;
    }
    .fps-adj-red        { color: #f87171; }
    .fps-adj-orange     { color: #fb923c; }
    .fps-adj-amber      { color: #fbbf24; }
    .fps-adj-yellow     { color: #fde047; }
    .fps-adj-lightgreen { color: #86efac; }
    .fps-adj-green      { color: #4ade80; }

    .fps-hud-sep {
      border-top: 1px solid rgba(120,180,255,0.22);
      margin: 6px 0;
    }

    /* Lignes clé/valeur (Draw calls, Triangles…) — mêmes couleurs que score-title/valeurs */
    .fps-hud-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: baseline;
      gap: 8px;
      font-size: 11px;
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
    }

    .fps-hud-row strong {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: rgba(240,250,255,0.96);
      flex-shrink: 0;
      text-align: right;
    }

    /* Lignes catégories (icône + label + stats colonnes) */
    .fps-hud-row-cat {
      display: grid;
      grid-template-columns: 1fr 3.5ch 11ch 3.2ch 8.5ch;
      gap: 3px;
      align-items: baseline;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
      border-radius: 4px;
      padding: 1px 2px;
    }

    .fps-hud-row-cat--heavy {
      background: rgba(220, 40, 40, 0.20);
      border-left: 3px solid rgba(255,80,80,0.80);
      padding-left: 5px;
      border-radius: 4px;
      color: rgba(255,220,220,0.90);
    }

    .fps-hud-cat-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .fps-hud-cat-icon {
      font-size: 11px;
      line-height: 1;
      flex-shrink: 0;
    }

    .fps-hud-cat-count {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: rgba(240,250,255,0.96);
      text-align: right;
    }

    .fps-hud-cat-dc {
      font-variant-numeric: tabular-nums;
      color: rgba(255,210,100,0.90);
      text-align: right;
    }

    .fps-hud-cat-tri {
      font-variant-numeric: tabular-nums;
      color: rgba(130,195,255,0.90);
      text-align: right;
    }

    .fps-hud-cat-shadow {
      font-variant-numeric: tabular-nums;
      color: rgba(180,140,255,0.90);
      text-align: right;
    }

    /* Rangée GPU / CPU — aussi grosse que le FPS, sous le header */
    .fps-hud-eff-row {
      display: flex;
      gap: 16px;
      margin-top: 6px;
      margin-bottom: 2px;
      align-items: baseline;
    }

    .fps-hud-eff-item {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }

    .fps-hud-eff-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: rgba(180,215,255,0.70);
    }

    .fps-hud-eff-value {
      font-size: 26px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      line-height: 1;
      font-family: 'BebasNeue', system-ui, sans-serif;
    }

    .fps-hud-eff-pct {
      font-size: 12px;
      font-weight: 700;
    }

    /* En-têtes de groupe-catégorie */
    .fps-hud-group-header {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: rgba(180,215,255,0.50);
      margin-top: 5px;
      margin-bottom: 1px;
      border-bottom: 1px solid rgba(120,180,255,0.12);
      padding-bottom: 1px;
    }

    /* En-têtes de colonnes triables */
    .fps-hud-col-header {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-align: right;
      padding: 2px 0;
    }

    .fps-hud-col-header:hover {
      color: rgba(255,230,150,0.95) !important;
    }

    /* Ligne totaux */
    .fps-hud-row-total {
      background: rgba(120,180,255,0.08);
      border-radius: 4px;
      padding: 2px 4px;
    }

    .debug-light-btn-row {
      display: flex;
      flex-direction: row;
      gap: 6px;
      pointer-events: none;
    }

    .debug-light-toggle {
      position: relative;
      pointer-events: auto;
      flex-shrink: 0;
      min-width: 48px;
      height: 34px;
      padding: 0 10px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      color: rgba(247,239,225,0.7);
      background: linear-gradient(135deg, #4a5568, #2d3748);
      font-weight: 800;
      letter-spacing: 0.08em;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }

    .debug-light-toggle--lut-active {
      background: linear-gradient(135deg, #ffd36d, #b58239);
      color: #1c140c;
      border-color: rgba(255,255,255,0.28);
    }

    .debug-light-toggle--fps {
      background: linear-gradient(135deg, #4a5568, #2d3748);
      color: rgba(247,239,225,0.7);
      border-color: rgba(255,255,255,0.18);
    }

    .debug-light-toggle--fps.debug-light-toggle--fps-active {
      background: linear-gradient(135deg, #ffd36d, #b58239);
      color: #1c140c;
      border-color: rgba(255,255,255,0.28);
    }

    /* Lettre de raccourci clavier dans les boutons toggle */
    .debug-light-toggle .btn-key {
      background: transparent;
      color: #ffd36d;
      font-weight: 900;
      font-style: normal;
    }
    /* Sur fond doré (bouton actif) : assombrir la lettre pour qu'elle reste lisible */
    .debug-light-toggle--fps-active .btn-key,
    .debug-light-toggle--lut-active .btn-key {
      color: rgba(80, 40, 0, 0.75);
    }

    /* ─── PIX section inside CUSTOMISATION panel ─────────────────────────── */
    .debug-light-pix-sep {
      height: 1px;
      background: rgba(120,180,255,0.22);
      margin: 12px 0;
    }

    /* Sections PIX & CINEMA : même espacement vertical que #debugLightControls (gap: 4px) */
    .debug-light-pix-section,
    .debug-light-cinema-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .debug-light-pix-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px; /* réduit : le gap parent gère l'espace entre head et premier slider */
    }
    .debug-light-pix-head > span {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.14em;
      color: rgba(180,215,255,0.85);
    }

    /* Toggle switch (same style as postprocessHud) */
    .pix-switch {
      flex: 0 0 auto;
      position: relative;
      width: 36px;
      height: 20px;
      cursor: pointer;
    }
    .pix-switch input { position: absolute; opacity: 0; pointer-events: none; }
    .pix-switch span {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: rgba(255,255,255,0.22);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18);
      transition: background 0.16s, box-shadow 0.16s;
    }
    .pix-switch span::after {
      content: '';
      position: absolute;
      left: 3px; top: 3px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #f7efe1;
      box-shadow: 0 2px 7px rgba(0,0,0,0.35);
      transition: transform 0.16s;
    }
    .pix-switch input:checked + span { background: rgba(88,228,153,0.55); box-shadow: inset 0 0 0 1px rgba(175,255,213,0.45), 0 0 14px rgba(88,228,153,0.22); }
    .pix-switch input:checked + span::after { transform: translateX(16px); }

    .pix-control {
      display: block;
      margin-top: 8px;
    }
    .pix-control span {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
      font-size: 9px;
      font-weight: 800;
      color: rgba(180,215,255,0.82);
      text-transform: uppercase;
      letter-spacing: 0.045em;
    }
    .pix-control strong {
      min-width: 28px;
      text-align: right;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }
    .pix-control input[type="range"],
    .debug-light-row input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 3px;
      border-radius: 2px;
      background: rgba(120,170,255,0.22);
      outline: none;
      cursor: pointer;
      margin: 5px 0;
    }
    .pix-control input[type="range"]::-webkit-slider-thumb,
    .debug-light-row input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: rgba(200,225,255,0.92);
      box-shadow: 0 0 0 2px rgba(120,180,255,0.30), 0 1px 4px rgba(0,0,0,0.45);
      cursor: pointer;
      transition: background 0.12s, box-shadow 0.12s;
    }
    .pix-control input[type="range"]::-webkit-slider-thumb:hover,
    .debug-light-row input[type="range"]::-webkit-slider-thumb:hover {
      background: #fff;
      box-shadow: 0 0 0 3px rgba(140,200,255,0.45), 0 1px 6px rgba(0,0,0,0.50);
    }
    .pix-control input[type="range"]::-moz-range-thumb,
    .debug-light-row input[type="range"]::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border: none;
      border-radius: 50%;
      background: rgba(200,225,255,0.92);
      box-shadow: 0 0 0 2px rgba(120,180,255,0.30), 0 1px 4px rgba(0,0,0,0.45);
      cursor: pointer;
    }
    .pix-control input[type="range"]::-moz-range-track,
    .debug-light-row input[type="range"]::-moz-range-track {
      height: 3px;
      border-radius: 2px;
      background: rgba(120,170,255,0.22);
    }
    .pix-select {
      width: 100%;
      margin-top: 0;
      padding: 3px 6px;
      border: 1px solid rgba(120,180,255,0.30);
      border-radius: 6px;
      background: rgba(255,255,255,0.10);
      color: rgba(220,235,255,0.90);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .pix-select option { color: #111827; }
    .pix-reset-btn {
      width: 100%;
      margin-top: 7px;
      padding: 5px 7px;
      border: 0;
      border-radius: 8px;
      background: rgba(255,255,255,0.10);
      color: rgba(180,215,255,0.80);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .pix-reset-btn:hover { background: rgba(255,255,255,0.24); }
    .pix-section--disabled .debug-light-row { opacity: 0.55; }
    .debug-light-cinema-section {
      overflow-y: auto;
      max-height: calc(100vh - 520px);
      scrollbar-width: thin;
      scrollbar-color: rgba(120,180,255,0.28) transparent;
    }
    .debug-light-cinema-section::-webkit-scrollbar { width: 4px; }
    .debug-light-cinema-section::-webkit-scrollbar-thumb { background: rgba(120,180,255,0.35); border-radius: 2px; }
    .debug-light-cinema-section::-webkit-scrollbar-track { background: transparent; }
    .cinema-section--disabled .debug-light-row { opacity: 0.55; }

    .debug-light-body {
      pointer-events: auto;
      /* box-sizing: border-box → width JS inclut padding + border, comme offsetWidth de #tileUI */
      box-sizing: border-box;
      /* Largeur initiale : sera écrasée par JS pour matcher #tileUI */
      width: min(280px, calc(100vw - 92px));
      max-height: calc(100vh - 28px);
      /* Pas d'ascenseur sur le body — seule la section LUT déploie un scroll */
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 12px;
      font-family: monospace;
      border: 1px solid rgba(120,180,255,0.38);
      border-radius: 12px;
      /* Même charte graphique que #scorePanel : sans flou, cohérent avec les autres HUDs */
      background: rgba(0,0,0,0.68);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }

    /* Rubrique LUT/ambiances : conteneur flex, pas de scroll propre */
    .debug-light-lut-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .debug-light-panel.collapsed .debug-light-body { display: none; }

    .debug-light-head,
    .debug-light-switches {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
      font-size: 11px;
      color: rgba(180,215,255,0.82);
    }

    .debug-light-export {
      margin-bottom: 10px;
    }

    .debug-light-export-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .debug-light-head button,
    .debug-light-export button {
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 8px;
      color: rgba(200,220,255,0.85);
      background: rgba(255,255,255,0.08);
      cursor: pointer;
      padding: 4px 8px;
      white-space: nowrap;
    }

    .debug-light-close-btn {
      margin-left: auto;
      padding: 2px 7px !important;
      font-size: 13px;
      opacity: 0.65;
    }
    .debug-light-close-btn:hover { opacity: 1; }

    #debugLightUndo:disabled,
    #debugLightRedo:disabled,
    #debugLightCompare:disabled {
      opacity: 0.32;
      cursor: default;
    }

    .debug-light-compare-btn--active {
      background: rgba(90,140,255,0.30) !important;
      border-color: rgba(120,180,255,0.55) !important;
      color: #b0d0ff !important;
    }

    .debug-light-last-preset {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: rgba(180,215,255,0.60);
      font-style: italic;
    }

    .debug-light-controls {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
      scrollbar-width: thin;
      scrollbar-color: rgba(120,180,255,0.35) transparent;
    }
    .debug-light-controls::-webkit-scrollbar { width: 4px; }
    .debug-light-controls::-webkit-scrollbar-thumb { background: rgba(120,180,255,0.35); border-radius: 2px; }
    .debug-light-controls::-webkit-scrollbar-track { background: transparent; }

    /* ── En-têtes de section LUT ── */
    .lut-section-head {
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(120,180,255,0.50);
      padding: 6px 0 2px;
      margin-top: 4px;
      border-top: 1px solid rgba(120,180,255,0.14);
    }
    .lut-section-head:first-child {
      margin-top: 0;
      padding-top: 2px;
      border-top: none;
    }

    /* ── Grille 2 colonnes pour toutes les couleurs ── */
    .color-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3px 8px;
      margin-top: 4px;
    }
    /* Chaque cellule : [swatch 20px] [label] — ordre inversé par grid-column */
    .color-grid .debug-light-row {
      grid-template-columns: 20px 1fr;
      gap: 5px;
      font-size: 11px;       /* même taille que les sliders */
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
    }
    .color-grid .debug-light-row span {
      grid-column: 2;
      grid-row: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .color-grid .debug-light-row input[type="color"] {
      grid-column: 1;
      grid-row: 1;
      width: 20px;
      height: 18px;
      padding: 0;
      border: 1px solid rgba(255,255,255,0.20);
      border-radius: 4px;
      cursor: pointer;
      background: transparent;
    }
    .color-grid .debug-light-row output { display: none; }

    /* ── Tooltip custom LUT ── */
    #lutHelpTooltip {
      position: fixed;
      z-index: 9999;
      max-width: 240px;
      padding: 8px 11px;
      border-radius: 9px;
      background: rgba(6,12,26,0.96);
      border: 1px solid rgba(120,180,255,0.28);
      box-shadow: 0 6px 24px rgba(0,0,0,0.65), 0 0 0 1px rgba(120,180,255,0.06);
      backdrop-filter: blur(12px);
      color: rgba(205,225,255,0.94);
      font: 11px/1.55 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      white-space: pre-wrap;
      word-break: break-word;
      pointer-events: none;
      opacity: 0;
      transform: translateY(5px);
      transition: opacity 0.14s ease, transform 0.14s ease;
    }
    #lutHelpTooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .debug-light-row {
      display: grid;
      grid-template-columns: 122px 1fr 58px;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      line-height: 1.55;
      color: rgba(180,215,255,0.82);
    }

    /* .debug-light-row input[type="range"] → style mutualisé avec .pix-control ci-dessus */
    .debug-light-row input[type="color"] {
      width: 100%;
      height: 24px;
      border: 0;
      background: transparent;
    }

    .debug-light-row output {
      color: rgba(240,250,255,0.96);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .debug-light-presets-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.10em;
      color: rgba(180,215,255,0.55);
      margin-bottom: 5px;
    }

    .debug-light-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }

    .debug-light-preset-btn {
      flex: 1 0 auto;
      min-width: 72px;
      max-width: calc(33.33% - 3px);
      padding: 4px 6px;
      border-radius: 7px;
      border: 1px solid rgba(120,180,255,0.22);
      font-family: monospace;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 5px;
      background: rgba(18,28,52,0.65);
      color: rgba(210,230,255,0.90);
      letter-spacing: 0.01em;
      transition: background 0.12s, border-color 0.12s, transform 0.10s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.30);
    }

    .debug-light-preset-btn .preset-emoji {
      flex-shrink: 0;
      font-size: 14px;
      line-height: 1;
    }

    .debug-light-preset-btn .preset-label {
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 0.02em;
      color: rgba(180,215,255,0.80);
    }

    .debug-light-preset-btn:hover {
      background: rgba(35,60,100,0.80);
      border-color: rgba(140,200,255,0.45);
      transform: translateY(-1px);
    }

    .debug-light-preset-btn:active {
      background: rgba(25,45,80,0.90);
      transform: translateY(0);
    }

    /* ── Sélecteur Forme du monde (affiché juste sous les presets) ── */
    .world-shape-row {
      padding: 6px 10px;
      margin: 6px 0 8px;
      border-radius: 8px;
      border: 1px solid rgba(120,180,255,0.24);
      background: rgba(120,180,255,0.07);
      font-size: 11px;
      color: rgba(180,215,255,0.85);
    }
    .world-shape-pair {
      display: flex;
      gap: 6px;
    }
    .world-shape-pair .world-shape-select { flex: 1; }
    .world-shape-select {
      padding: 3px 8px;
      border: 1px solid rgba(120,180,255,0.32);
      border-radius: 6px;
      background: rgba(18,28,52,0.80);
      color: rgba(210,230,255,0.95);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      outline: none;
    }
    .world-shape-select:hover { border-color: rgba(140,200,255,0.50); }
    .world-shape-select option { color: #1a2744; background: #c8deff; }

    /* ── Mini HUD clavier (bottom-right) ── */
    #kbdHintHud {
      position: fixed;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2900;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.4;
      color: rgba(240,250,255,0.96);
      background: rgba(0,0,0,0.68);
      border: 1px solid rgba(120,180,255,0.38);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      padding: 8px 14px;
      pointer-events: none;
      white-space: nowrap;
    }

    body.grid-only-mode #kbdHintHud { display: none; }

    /* Super-immersif (SHIFT+ESPACE) : aucun HUD — mode capture d'écran */
    body.huds-force-hidden #debugLightPanel { display: none !important; }
    body.huds-force-hidden #tileUI         { display: none !important; }
    body.huds-force-hidden #scorePanel     { display: none !important; }

    /* LUT ouvert → masquer les HUDs droits (tuile courante / suivante / restantes / missions) */
    body.lut-panel-open #tileUI { display: none !important; }

    /* FPS HUD plein hauteur — le scorePanel est masqué via JS, le fps-counter occupe toute la hauteur */
    .debug-light-panel.fps-hud-fullscreen {
      top: 14px;
      align-items: flex-start;
    }
    .debug-light-panel.fps-hud-fullscreen .debug-light-left-col {
      height: 100%;
    }
    .debug-light-panel.fps-hud-fullscreen .fps-counter {
      flex: 1 1 auto;
      max-height: none;
    }
  `;
  document.head.appendChild(style);
}


function getHelpText(path) {
  return LUT_HELP[path] ?? 'Réglage visuel du panneau LUT.';
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
