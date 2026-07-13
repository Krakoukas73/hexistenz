import { LUT_HELP, delegateHelpTooltip } from './help.js';
import { scanScene, GROUP_ORDER, GROUP_ICONS, ITEM_GROUP, CATEGORY_ICONS } from './sceneProfiler.js';
import { registerLangRefresh } from './gameLangReactive.js';

// Passage bilingue FR/EN le 2026-07-12 : les 6 adjectifs de qualité FPS viennent
// de json/languages/{french,english}.json (clé game.fpsAdjectives), même
// mécanisme que les autres modules (top-level await + localStorage
// 'hexistenz_pres_lang').
function _getGameLang() {
  try {
    return localStorage.getItem('hexistenz_pres_lang') === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}
const _fpsLangFile = _getGameLang() === 'en' ? 'english' : 'french';
// `const` volontairement conservé, objet muté en place au changement de langue
// en jeu (cf. gameLangReactive.js) : lu à chaque tick FPS, donc auto-rafraîchi.
const _fpsAdjText = await fetch(`./json/languages/${_fpsLangFile}.json`)
  .then(r => r.json())
  .then(data => data?.game?.fpsAdjectives ?? {})
  .catch(err => {
    console.error(`[hud_fps] Impossible de charger ${_fpsLangFile}.json`, err);
    return {};
  });

registerLangRefresh((data) => {
  const fresh = data?.game?.fpsAdjectives ?? {};
  for (const k of Object.keys(_fpsAdjText)) delete _fpsAdjText[k];
  Object.assign(_fpsAdjText, fresh);
});

// ─── Perf HUD (module-level, self-contained) ─────────────────────────────────
// Extrait de debugLightUi.js (2026-07-02, renommé edaPanelHost.js le 2026-07-11) : compteur
// FPS + panneau perf avancé (touche F). N'a jamais dépendu du panel EDA — seul
// `initFpsHud(root)` a besoin du `root` partagé (les deux HUDs vivent dans le même élément
// DOM #debugLightPanel, cf. edaPanelWiring.js, ex-hud_eda.js).
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
// Timing CPU/GPU passé depuis scene.js pour les indices d'efficacité.
// gpuMs : temps GPU réel (EXT_disjoint_timer_query_webgl2, async — cf. gpuTimer.js).
// renderMs : ancien chrono CPU (soumission des draw calls, PAS le temps GPU réel) — gardé
// en repli si l'extension est indisponible sur ce driver/navigateur (gpuTimerSupported=false).
let _lastPerfTiming = { jsMs: 0, renderMs: 0, gpuMs: null, gpuTimerSupported: false };


function _fmtNum(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

// % d'une catégorie par rapport au total de triangles de la scène (info.render.triangles).
// Volontairement calculé sur le TOTAL réel (pas la somme "trackée"), donc les % des
// catégories ne totalisent pas 100% — le reste correspond aux objets non trackés par le HUD.
function _fmtPct(value, total) {
  if (!total) return '–';
  return (value / total * 100).toFixed(1);
}

// Choix de la valeur GPU à afficher : temps réel (EXT_disjoint_timer_query_webgl2) si
// dispo, sinon repli sur l'ancien chrono CPU de soumission (renderMs) — mais alors
// `real=false`, à utiliser pour prévenir que ce n'est qu'une estimation.
function _gpuDisplayInfo() {
  const { renderMs, gpuMs, gpuTimerSupported } = _lastPerfTiming;
  const real = gpuTimerSupported && gpuMs != null;
  const ms   = real ? gpuMs : renderMs;
  const load = ms > 0 ? Math.min(100, ms / 16.67 * 100) : 0;
  return { ms, load, real };
}

function _hudCopyText() {
  const info = _lastHudInfo;
  const calls = info?.render?.calls ?? '–';
  const tris  = info?.render?.triangles ?? 0;
  const tex   = info?.memory?.textures ?? '–';
  const prog  = info?.programs?.length  ?? '–';

  const jsMs      = _lastPerfTiming.jsMs;
  const cpuLoad   = jsMs     > 0 ? Math.min(100, jsMs     / 16.67 * 100) : 0;
  const gpu       = _gpuDisplayInfo();

  const trackedDc = Object.values(_cachedCounts).reduce((s, e) => s + e.draws, 0);
  const trackedTris = Object.values(_cachedCounts).reduce((s, e) => s + e.tris, 0);
  const shadowCasters = Object.values(_cachedCounts).reduce((s, e) => s + e.shadows, 0);
  const shadowDc  = typeof calls === 'number' ? Math.max(0, calls - trackedDc) : '–';

  let text = `${_lastHudFps} FPS\n`;
  text += `🖥️ CPU : ${Math.round(cpuLoad)}%  (JS ${jsMs.toFixed(1)}ms / 16.7ms)\n`;
  text += `🎮 GPU : ${Math.round(gpu.load)}%  (${gpu.real ? 'réel' : '≈ estimé, EXT_disjoint_timer_query indisponible'} ${gpu.ms.toFixed(1)}ms / 16.7ms)\n`;
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
      text += `${label}: ${count} obj | ${draws} dc${shStr} | ${_fmtNum(t)}▲ (${_fmtPct(t, tris)}%)\n`;
    }
  }
  return text;
}

// Exportée : réutilisée telle quelle par le bouton "📋 Copier" du panel EDA (edaPanelWiring.js),
// qui partageait déjà cette fonction avec le HUD FPS avant le découpage en modules.
export function copyToClipboard(text) {
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
  copyToClipboard(_hudCopyText()).catch(() => {});
  // Le flag persiste à travers les rebuilds innerHTML (toutes les 500ms)
  _hudCopied = true;
  setTimeout(() => { _hudCopied = false; }, 1500);
}

function _fpsAdjective(fps) {
  if (fps < 15) return { text: _fpsAdjText.disastrous ?? 'Désastreux', cls: 'fps-adj-red' };
  if (fps < 25) return { text: _fpsAdjText.bad         ?? 'Mauvais',    cls: 'fps-adj-orange' };
  if (fps < 35) return { text: _fpsAdjText.mediocre    ?? 'Médiocre',   cls: 'fps-adj-amber' };
  if (fps < 50) return { text: _fpsAdjText.passable    ?? 'Passable',   cls: 'fps-adj-yellow' };
  if (fps < 70) return { text: _fpsAdjText.good        ?? 'Bon',        cls: 'fps-adj-lightgreen' };
  return              { text: _fpsAdjText.splendid     ?? 'Splendide',   cls: 'fps-adj-green' };
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
  const totalTrisNum  = info?.render?.triangles ?? 0; // dénominateur du % triangles par catégorie

  const adj = _fpsAdjective(fps);

  // GPU / CPU load indices — % du budget frame utilisé (0%=idle=vert, 100%=saturé=rouge)
  const jsMs     = _lastPerfTiming.jsMs;
  const cpuLoad  = jsMs     > 0 ? Math.min(100, jsMs     / 16.67 * 100) : 0;
  const gpu      = _gpuDisplayInfo(); // { ms, load, real } — real=false si EXT_disjoint_timer_query indisponible
  const gpuLoad  = gpu.load;
  const gpuColor = gpuLoad  <= 30 ? '#4ade80' : gpuLoad  <= 65 ? '#fbbf24' : gpuLoad  <= 85 ? '#fb923c' : '#f87171';
  const cpuColor = cpuLoad  <= 30 ? '#4ade80' : cpuLoad  <= 65 ? '#fbbf24' : cpuLoad  <= 85 ? '#fb923c' : '#f87171';

  const header =
    `<div class="fps-hud-header">` +
      `<div class="fps-hud-fps" data-stat-help="fps.fps">${fps} <span>FPS</span> <span class="fps-adj ${adj.cls}" data-stat-help="fps.adj">${adj.text}</span></div>` +
      `<button class="fps-hud-copy" type="button" title="Copier le HUD">${_hudCopied ? '✓' : '⧉'}</button>` +
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

  const gpuLabel = gpu.real ? 'GPU réel' : 'GPU≈ (soumission CPU seule, EXT indisponible)';
  const msHint = gpu.ms > 0
    ? `<div style="font-size:10px;color:rgba(180,215,255,0.50);margin-top:2px">${gpuLabel} ${gpu.ms.toFixed(1)}ms · CPU ${jsMs.toFixed(1)}ms · budget 16.7ms</div>`
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
        detailRows.push(_rowCat(label, count, draws, t, shadows, heavy, totalTrisNum));
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
      `<span class="fps-hud-cat-tri">${_fmtNum(sumTris)}▲<span class="fps-hud-cat-tri-pct" title="% du total triangles scène">${_fmtPct(sumTris, totalTrisNum)}%</span></span>` +
      `</div>`
    );
  }

  return header + `<div class="fps-hud-body">` + detailRows.join('') + `</div>`;
}

function _row(label, value, helpKey = '') {
  const attr = helpKey ? ` data-stat-help="${helpKey}"` : '';
  return `<div class="fps-hud-row"><span>${label}</span><strong${attr}>${value}</strong></div>`;
}

// Ligne catégorie étendue : icône + label | count | draw calls (×ratio) | shadows | triangles (+ %)
function _rowCat(label, count, draws, tris, shadows, isHeavy = false, totalTris = 0) {
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

  const pctStr = `<span class="fps-hud-cat-tri-pct" title="% du total triangles scène">${_fmtPct(tris, totalTris)}%</span>`;

  return `<div class="fps-hud-row fps-hud-row-cat${heavyCls}">` +
    `<span class="fps-hud-cat-label"><span class="fps-hud-cat-icon">${icon}</span>${label}</span>` +
    `<strong class="fps-hud-cat-count">${_fmtNum(count)}</strong>` +
    `<span class="fps-hud-cat-dc">${draws}dc${ratioStr}</span>` +
    shadowStr +
    `<span class="fps-hud-cat-tri">${_fmtNum(tris)}▲${pctStr}</span>` +
    `</div>`;
}

export function tickFps(renderer, scene, perfTiming = null) {
  // Fusion (pas remplacement) : gpuMs est mis à jour quasi chaque frame (poll async, cf.
  // gpuTimer.js) alors que jsMs/renderMs ne sont échantillonnés qu'1 frame sur 120
  // (cf. scene.js) — un remplacement complet effacerait jsMs/renderMs le reste du temps.
  if (perfTiming) Object.assign(_lastPerfTiming, perfTiming);
  _fpsFrameCount++;
  const now = performance.now();

  // Scan scène toutes les 2 s (coûteux, on ralentit) — MAIS seulement si le panneau détaillé
  // est réellement ouvert : _cachedCounts n'est utilisé que par _buildHud() quand
  // _fpsHudExpanded=true (cf. `if (!_fpsHudExpanded) return header;` plus bas). Repéré
  // 2026-07-05 : ce scan tournait AVANT inconditionnellement, TOUJOURS, même HUD fermé —
  // et son coût (scene.traverse() complet, des milliers de nœuds) tombe APRÈS le point de
  // mesure _ptEnd dans scene.js (tickFps est appelé une fois _ptEnd déjà capturé), donc
  // invisible dans [PERF-TIMING]/TOTAL-JS tout en bloquant le thread principal avant le
  // prochain requestAnimationFrame → explique un [SCENE-DIAG] écart rAF élevé (jusqu'à
  // 48-56ms) sans aucune trace dans le JS mesuré. Log de coût réel gardé pour vérification.
  if (scene && _fpsHudExpanded && now - _statsLastTime > 2000) {
    const _scanT0 = performance.now();
    _cachedCounts = scanScene(scene);
    _statsLastTime = now;
    const _scanMs = performance.now() - _scanT0;
    if (_scanMs > 5) console.warn(`[SCANSCENE-DIAG] scanScene() coût réel: ${_scanMs.toFixed(1)}ms (bloque le thread principal, invisible dans PERF-TIMING)`);
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

// ─── Wiring DOM — extrait de createDebugLightUI (debugLightUi.js, ex-nom, cf. edaPanelHost.js) ───
// `root` est l'élément partagé #debugLightPanel créé par la façade (edaPanelHost.js) :
// il contient à la fois #fps-counter (ce module) et le panel EDA (edaPanelWiring.js).
// `_syncFpsFullscreen` lit `root.classList.contains('collapsed')` — état géré par
// edaPanelWiring.js (_setLutOpen) sur ce même `root` — d'où le besoin d'appeler `syncFullscreen()`
// (valeur de retour) depuis edaPanelWiring.js à chaque ouverture/fermeture du panel EDA.
export function initFpsHud(root) {
  _fpsEl = root.querySelector('#fps-counter');
  // Délégation de clic sur le conteneur HUD → bouton copier (innerHTML est recréé à chaque frame)
  _fpsEl.addEventListener('click', e => {
    if (e.target.closest('.fps-hud-copy'))  { _copyHud(); return; }
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

  // Sync visibilité du scorePanel + classe fullscreen sur le panel.
  // Le scorePanel se masque si le HUD FPS avancé OU le panel EDA est ouvert (l'un ou l'autre suffit).
  function _syncFpsFullscreen() {
    const scorePanel = document.getElementById('scorePanel');
    const lutOpen = !root.classList.contains('collapsed');
    const shouldHide = _fpsHudExpanded || lutOpen;
    // Classe sur <body> + règle CSS !important (css/eda.css) plutôt qu'un style inline direct :
    // même mécanisme éprouvé que body.huds-force-hidden, garantit la priorité sur toute autre règle.
    document.body.classList.toggle('fps-hud-deployed', shouldHide);
    if (scorePanel) scorePanel.style.display = shouldHide ? 'none' : '';
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

  return { syncFullscreen: _syncFpsFullscreen };
}
