import { DEFAULT_VISUAL_ENVIRONMENT_CONFIG, cloneVisualConfig, applyColorGradingUniforms } from './visualEnvironment.js';

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

// ─── Classification des objets de scène ──────────────────────────────────────

// Icônes par label de catégorie
const _CATEGORY_ICONS = {
  // Forêt — espèces individuelles
  'Bouleau':          '🌿',
  'Chêne':            '🌳',
  'Pin':              '🌲',
  'Peuplier':         '🌲',
  'Arbre mort':       '🪵',
  'Buisson':          '🫧',
  // Bâtiments — types individuels
  'Maison-1':         '🏠',
  'Maison-2':         '🏠',
  'Maison-3':         '🏠',
  'Maison-4':         '🏠',
  'Maisons':          '🏠',
  'Églises':          '⛪',
  'Tours de guet':    '🗼',
  // Animaux champ
  'Poulets (champ)':  '🐓',
  'Cerfs':            '🦌',
  'Animaux (champ)':  '🐾',
  // Nature
  'Fleurs':           '🌸',
  'Champignons':      '🍄',
  'Rochers':          '🪨',
  'Bottes foin':      '🌾',
  'Roseaux':          '🌿',
  'Plantes':          '🌱',
  'Arbustes':         '🫧',
  'Blé':              '🌾',
  'Brins de blé':     '🌾',
  // Village
  'Chiens':           '🐕',
  'Chats':            '🐈',
  'Chevaux':          '🐴',
  'Poulets (vill.)':  '🐔',
  'Charrettes':       '🪵',
  'Tonneaux':         '🪣',
  'Moulins':          '🌀',
  'Corbeaux':         '🐦',
  'Bancs':            '🪑',
  'Panneaux':         '🪧',
  'Fontaines':        '⛲',
  'Props ambiants':   '🌿',
  // Transport
  'Trains':           '🚂',
  'Gares':            '🏛️',
  'Voies ferrées':    '🛤️',
  'Rails métal':      '🔩',
  'Routes':           '🧱',
  'Micro-props':      '✦',
  'Traverses':        '🪵',
  // Eau — types individuels
  'Bateaux':          '⛵',
  'Barque 1':         '🚣',
  'Barque 2':         '🚣',
  'Barques':          '🚣',
  'Gouttes d\'eau':   '💧',
  'Filets eau':       '🌊',
  'Brume eau':        '💨',
  'Effets eau':       '💧',
  // Divers
  'Coffres bonus':    '🎁',
  'Étoiles & comètes':'✨',
  'Grille':           '🔲',
  // Terrain par biome
  'Terrain Prairie':  '🟩',
  'Terrain Forêt':    '🌳',
  'Terrain Village':  '🏘️',
  'Terrain Rail':     '⚙️',
  'Terrain Mer':      '🌊',
  'Terrain Champ':    '🟨',
  'Terrain Vide':     '⬛',
  'Terrain Autre':    '🟫',
  'Terrain (fusionné)': '🗺️',
  // Géo
  'Plages':           '🏖️',
  'Mers':             '🌊',
};

// Appartenance à un groupe-catégorie pour affichage par section
const _ITEM_GROUP = {
  // Forêt
  'Bouleau': 'Forêt', 'Chêne': 'Forêt', 'Pin': 'Forêt', 'Peuplier': 'Forêt',
  'Arbre mort': 'Forêt', 'Buisson': 'Forêt',
  // Bâtiments
  'Maison-1': 'Bâtiments', 'Maison-2': 'Bâtiments', 'Maison-3': 'Bâtiments', 'Maison-4': 'Bâtiments',
  'Maisons': 'Bâtiments', 'Églises': 'Bâtiments', 'Tours de guet': 'Bâtiments',
  // Nature
  'Fleurs': 'Nature', 'Champignons': 'Nature', 'Rochers': 'Nature', 'Bottes foin': 'Nature',
  'Roseaux': 'Nature', 'Plantes': 'Nature', 'Arbustes': 'Nature', 'Blé': 'Nature', 'Brins de blé': 'Nature',
  // Animaux champ
  'Poulets (champ)': 'Animaux', 'Cerfs': 'Animaux', 'Animaux (champ)': 'Animaux',
  // Village
  'Chiens': 'Village', 'Chats': 'Village', 'Chevaux': 'Village', 'Poulets (vill.)': 'Village',
  'Charrettes': 'Village', 'Tonneaux': 'Village', 'Moulins': 'Village', 'Corbeaux': 'Village',
  'Bancs': 'Village', 'Panneaux': 'Village', 'Fontaines': 'Village', 'Props ambiants': 'Village',
  // Transport
  'Trains': 'Transport', 'Gares': 'Transport', 'Voies ferrées': 'Transport',
  'Rails métal': 'Transport', 'Routes': 'Transport', 'Traverses': 'Transport', 'Micro-props': 'Transport',
  // Eau
  'Bateaux': 'Eau', 'Barque 1': 'Eau', 'Barque 2': 'Eau', 'Barques': 'Eau',
  "Gouttes d'eau": 'Eau', 'Filets eau': 'Eau', 'Brume eau': 'Eau', 'Effets eau': 'Eau',
  'Plages': 'Eau', 'Mers': 'Eau',
  // Terrain
  'Terrain Prairie': 'Terrain', 'Terrain Forêt': 'Terrain', 'Terrain Village': 'Terrain',
  'Terrain Rail': 'Terrain', 'Terrain Mer': 'Terrain', 'Terrain Champ': 'Terrain',
  'Terrain Vide': 'Terrain', 'Terrain Autre': 'Terrain', 'Terrain (fusionné)': 'Terrain',
  // Divers
  'Coffres bonus': 'Divers', 'Étoiles & comètes': 'Divers', 'Grille': 'Divers',
};

const _GROUP_ORDER = ['Forêt', 'Bâtiments', 'Nature', 'Animaux', 'Village', 'Transport', 'Eau', 'Terrain', 'Divers'];
const _GROUP_ICONS = { 'Forêt': '🌲', 'Bâtiments': '🏠', 'Nature': '🌿', 'Animaux': '🐾', 'Village': '🏘️', 'Transport': '🚂', 'Eau': '🌊', 'Terrain': '🗺️', 'Divers': '✦' };

// Espèces d'arbres connues (pour extraction depuis le nom InstancedMesh)
const _TREE_SPECIES_MAP = { birch: 'Bouleau', bushy_mini: 'Buisson', pine_soft: 'Pin', poplar: 'Peuplier' }; // oak_round + dead retirés du pool
const _TREE_SPECIES_KEYS = Object.keys(_TREE_SPECIES_MAP); // pour recherche par startsWith

// GLB individuels — testés par includes() sur le name du Group racine
// Ordre : du plus spécifique au plus général (premier match gagne)
const _GLB_LABELS = [
  // Maisons — per type (avant le catch-all village-house-glb)
  // maison-1 retirée du pool (trop lourde)
  ['village-house-glb-maison-2',              'Maison-2'],
  ['village-house-glb-maison-3',              'Maison-3'],
  ['village-house-glb-maison-4',              'Maison-4'],
  ['village-house-glb',                       'Maisons'],   // catch-all
  ['village-church-or-dolmen-glb',            'Églises'],
  ['village-watchtower-glb-zone-reward',      'Tours de guet'],
  // Animaux village
  ['village-animal-dog-glb',                  'Chiens'],
  ['village-animal-cat-glb',                  'Chats'],
  ['village-animal-horse-glb',                'Chevaux'],
  ['village-animal-chicken-glb',              'Poulets (vill.)'],
  // Transport rail
  ['animatedRailTrainArticulated',            'Trains'],
  ['rail-terminus-station-glb',               'Gares'],
  ['left-rail',                               'Rails métal'],
  ['right-rail',                              'Rails métal'],
  ['terminus-bumper',                         'Voies ferrées'],
  ['decorative-stone',                        'Voies ferrées'],
  // Transport eau — per type (avant le catch-all)
  ['water-shore-inert-boat-glb-shore-boat-1', 'Barque 1'],
  ['water-shore-inert-boat-glb-shore-boat-2', 'Barque 2'],
  ['animated-water-boat-glb',                 'Bateaux'],
  ['water-shore-inert-boat-glb',              'Barques'],   // catch-all
  // Routes
  ['village-stone-road-glb-network',          'Routes'],
  ['village-stone-road-route',                'Routes'],
  // Rails
  ['procedural-rail',                         'Voies ferrées'],
  // Décor village
  ['village-cart-glb',                        'Charrettes'],
  ['village-barrel-glb',                      'Tonneaux'],
  ['field-zone-mill-glb',                     'Moulins'],
  ['field-birds-glb-animated-flock',          'Corbeaux'],
  ['bench',                                   'Bancs'],
  ['signpost',                                'Panneaux'],
  ['fountain',                                'Fontaines'],
  ['ambient-glb',                             'Props ambiants'],
  ['bonus-cell-chest-',                       'Coffres bonus'],
];

function _classifyInstanced(obj) {
  const n = obj.name ?? '';
  // Arbres — par espèce (instanced-tree-{species}-{chunk})
  if (n.startsWith('instanced-tree-')) {
    const rest = n.slice('instanced-tree-'.length);
    const species = _TREE_SPECIES_KEYS.find(k => rest.startsWith(k));
    return species ? (_TREE_SPECIES_MAP[species] ?? 'Arbres') : 'Arbres';
  }
  if (n.startsWith('instanced-prop-animal-chicken')) return 'Poulets (champ)';
  if (n.startsWith('instanced-prop-animal-deer'))    return 'Cerfs';
  if (n.startsWith('instanced-prop-animal-'))        return 'Animaux (champ)';
  if (n.startsWith('instanced-prop-flower'))         return 'Fleurs';
  if (n.startsWith('instanced-prop-mushroom'))       return 'Champignons';
  if (n.startsWith('instanced-prop-rock'))           return 'Rochers';
  if (n.startsWith('instanced-prop-hay'))            return 'Bottes foin';
  if (n.startsWith('instanced-prop-reed'))           return 'Roseaux';
  if (n.startsWith('instanced-prop-plant'))          return 'Plantes';
  if (n.startsWith('instanced-prop-shrub'))          return 'Arbustes';
  if (n.startsWith('hex-grid-fill'))                 return 'Grille';
  if (n.includes('wheat') || n.includes('blade'))    return 'Blé';
  if (n.includes('wood-sleeper'))                    return 'Traverses';
  const cat = obj.userData?.lodCategory;
  if (cat === 'micro')  return 'Micro-props';
  if (cat === 'plant')  return 'Plantes';
  if (cat === 'rock')   return 'Rochers';
  if (cat === 'animal') return 'Animaux (champ)';
  return null;
}

function _classifyGlb(name) {
  if (!name) return null;
  for (const [key, label] of _GLB_LABELS) {
    if (name.includes(key)) return label;
  }
  return null;
}

// Nombre de triangles d'une géométrie Three.js
function _geomTris(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return geometry.index.count / 3;
  const pos = geometry.attributes?.position;
  return pos ? Math.floor(pos.count / 3) : 0;
}

// Draw calls + triangles + shadow-casters à l'intérieur d'un GLB Group
function _glbStats(obj) {
  let draws = 0, tris = 0, shadows = 0;
  obj.traverse(child => {
    if (child.isInstancedMesh) {
      draws++;
      if (child.castShadow) shadows++;
      tris += _geomTris(child.geometry) * child.count;
    } else if (child.isMesh) {
      draws++;
      if (child.castShadow) shadows++;
      tris += _geomTris(child.geometry);
    }
  });
  return { draws, tris, shadows };
}

// Accumulateur par label : { count, draws, tris, shadows }
function _acc(counts, label) {
  return counts[label] ?? (counts[label] = { count: 0, draws: 0, tris: 0, shadows: 0 });
}

// Classifie un Mesh ordinaire (non-GLB, non-InstancedMesh) par son name
function _classifyMesh(name) {
  if (!name) return 'Terrain Autre';
  if (name === 'terrain-merged-mesh') return 'Terrain (fusionné)'; // terrainMerge.js
  if (name.startsWith('hex-sector-') || name.startsWith('hex-center-')) {
    const biome = name.replace('hex-sector-', '').replace('hex-center-', '');
    if (biome === 'grass')  return 'Terrain Prairie';
    if (biome === 'forest') return 'Terrain Forêt';
    if (biome === 'house')  return 'Terrain Village';
    if (biome === 'rail')   return 'Terrain Rail';
    if (biome === 'water')  return 'Terrain Mer';
    if (biome === 'field')  return 'Terrain Champ';
    if (biome === 'void')   return 'Terrain Vide';
    return 'Terrain Autre';
  }
  if (name.includes('wheat'))                                    return 'Brins de blé';
  if (name.includes('sand-beach') || name.includes('shore'))    return 'Plages';
  // Effets eau — sous-types détaillés
  if (name.includes('water-drop'))                              return "Gouttes d'eau";
  if (name.includes('water-streak') || name.includes('water-falling') ||
      name.includes('water-fall') || name.includes('water-void')) return 'Filets eau';
  if (name.includes('water-edge') || name.includes('mist'))    return 'Brume eau';
  if (name.includes('comet') || name.includes('hexistenz-comet') ||
      name.includes('hexistenz-star'))                          return 'Étoiles & comètes';
  if (name.includes('texture-zone') || name.includes('water-zone') ||
      name.includes('water-sea') || name.includes('sea-'))      return 'Mers';
  return 'Terrain Autre';
}

// Set de déduplication des noms d'InstancedMesh (réinitialisé à chaque scan)
// → évite de compter X fois les instances quand un GLB a N sous-meshes InstancedMesh
let _instanceNamesSeen = null;

// Traversal récursif custom : s'arrête dès qu'un GLB racine est identifié
// → évite de compter les enfants internes des Groups
function _traverseNode(obj, counts) {
  if (!obj.visible) return;

  // InstancedMesh → 1 draw call, dédupliquer le count d'instances par nom
  if (obj.isInstancedMesh) {
    if (obj.count === 0) return; // LOD caché ou non initialisé
    const label = _classifyInstanced(obj);
    if (label) {
      const e = _acc(counts, label);
      // Plusieurs InstancedMesh partagent le même nom quand un GLB a N sous-meshes.
      // On n'ajoute le nombre d'instances qu'une fois par nom unique pour éviter ×N.
      if (_instanceNamesSeen && !_instanceNamesSeen.has(obj.name)) {
        _instanceNamesSeen.add(obj.name);
        e.count += obj.count;
      }
      e.draws   += 1;
      e.tris    += _geomTris(obj.geometry) * obj.count;
      if (obj.castShadow) e.shadows += 1;
    }
    return;
  }

  // GLB racine identifiée → compter 1 objet + ses draw calls / triangles / shadows internes
  const glbLabel = _classifyGlb(obj.name);
  if (glbLabel) {
    const e   = _acc(counts, glbLabel);
    const st  = _glbStats(obj);
    e.count   += 1;
    e.draws   += st.draws;
    e.tris    += st.tris;
    e.shadows += st.shadows;
    return;
  }

  // Mesh ordinaire (terrain, eau, plage, blé, comètes…) — non classifié comme GLB
  if (obj.isMesh) {
    const label = _classifyMesh(obj.name);
    const e = _acc(counts, label);
    e.count   += 1;
    e.draws   += 1;
    e.tris    += _geomTris(obj.geometry);
    if (obj.castShadow) e.shadows += 1;
    return;
  }

  // Nœud intermédiaire → descendre
  for (const child of obj.children) {
    _traverseNode(child, counts);
  }
}

function _scanScene(scene) {
  _instanceNamesSeen = new Set(); // réinitialisé à chaque scan
  const counts = {};
  for (const child of scene.children) {
    _traverseNode(child, counts);
  }
  _instanceNamesSeen = null;
  _cachedCounts = counts;
}

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
  for (const groupName of _GROUP_ORDER) byGroup.set(groupName, []);
  byGroup.set('__other__', []);
  for (const [label, e] of Object.entries(_cachedCounts)) {
    const g = _ITEM_GROUP[label] ?? '__other__';
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
      `<div class="fps-hud-fps">${fps} <span>FPS</span> <span class="fps-adj ${adj.cls}">${adj.text}</span></div>` +
      `<button class="fps-hud-copy" type="button" title="Copier le HUD">${_hudCopied ? '✓' : '⧉'}</button>` +
    `</div>` +
    `<div class="fps-hud-eff-row">` +
      `<div class="fps-hud-eff-item">` +
        `<span class="fps-hud-eff-label">🖥️ CPU</span>` +
        `<span class="fps-hud-eff-value" style="color:${cpuColor}">${Math.round(cpuLoad)}<span class="fps-hud-eff-pct">%</span></span>` +
      `</div>` +
      `<div class="fps-hud-eff-item">` +
        `<span class="fps-hud-eff-label">🎮 GPU</span>` +
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
    _row('Draw calls', calls),
    _row('↳ HUD trackés', _fmtNum(trackedDc)),
    _row('↳ Ombres/passes', shadowStr),
    _row('Triangles',  tris),
    _row('Objets',     _fmtNum(totalObjects)),
    _row('Textures',   tex),
    _row('Shaders',    prog),
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
    for (const groupName of _GROUP_ORDER) byGroup.set(groupName, []);
    byGroup.set('__other__', []);

    for (const [label, e] of entries) {
      const g = _ITEM_GROUP[label] ?? '__other__';
      const target = byGroup.has(g) ? byGroup.get(g) : byGroup.get('__other__');
      target.push([label, e]);
    }

    const sortFn = ([, a], [, b]) => _hudSortDir * (b[_hudSortKey] - a[_hudSortKey]);

    let sumCount = 0, sumDraws = 0, sumShadows = 0, sumTris = 0;

    for (const [groupName, items] of byGroup) {
      if (!items.length) continue;
      items.sort(sortFn);

      const displayName = groupName === '__other__' ? 'Autres' : groupName;
      const groupIcon   = _GROUP_ICONS[groupName] ?? '◆';
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

function _row(label, value) {
  return `<div class="fps-hud-row"><span>${label}</span><strong>${value}</strong></div>`;
}

// Ligne catégorie étendue : icône + label | count | draw calls (×ratio) | shadows | triangles
function _rowCat(label, count, draws, tris, shadows, isHeavy = false) {
  const icon = _CATEGORY_ICONS[label] ?? '◆';
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
    _scanScene(scene);
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

const SLIDERS = [
  ['renderer.toneMappingExposure', 'Exposition globale', 0.20, 3.00, 0.01],
  ['environment.fogDensity', 'Densité du brouillard', 0.000, 0.080, 0.001],
  ['lights.hemisphereIntensity', 'Lumière du ciel', 0.00, 2.00, 0.01],
  ['lights.sunIntensity', 'Intensité du soleil', 0.00, 8.00, 0.01],
  ['lights.sunOrbitRadius', 'Rayon orbite soleil', 2.0, 28.0, 0.1],
  ['lights.sunOrbitHeight', 'Hauteur du soleil', 1.0, 24.0, 0.1],
  ['lights.sunOrbitSpeed', 'Vitesse orbite soleil', 0.0, 0.30, 0.001],
  ['lights.sunVisualScale', 'Taille visuelle soleil', 0.20, 3.00, 0.01],
  ['lights.fillIntensity', 'Lumière de remplissage', 0.00, 1.00, 0.005],

  ['grading.brightness', 'Luminosité', -0.50, 0.50, 0.005],
  ['grading.contrast', 'Contraste', 0.40, 2.40, 0.01],
  ['grading.saturation', 'Saturation', 0.00, 2.40, 0.01],
  ['grading.vibrance', 'Vibrance', -1.00, 1.00, 0.01],
  ['grading.hue', 'Décalage de teinte', -0.50, 0.50, 0.001],
  ['grading.gamma', 'Gamma', 0.35, 2.50, 0.01],
  ['grading.blackLevel', 'Niveau des noirs', 0.00, 0.45, 0.001],
  ['grading.whiteLevel', 'Niveau des blancs', 0.55, 1.00, 0.001],
  ['grading.red', 'Canal rouge', 0.00, 2.00, 0.01],
  ['grading.green', 'Canal vert', 0.00, 2.00, 0.01],
  ['grading.blue', 'Canal bleu', 0.00, 2.00, 0.01],
  ['grading.redCurve', 'Courbe canal rouge', 0.30, 3.00, 0.01],
  ['grading.greenCurve', 'Courbe canal vert', 0.30, 3.00, 0.01],
  ['grading.blueCurve', 'Courbe canal bleu', 0.30, 3.00, 0.01],

  ['palette.strength', 'Force de la palette', 0.00, 1.00, 0.01],
  ['palette.saturation', 'Saturation de la palette', 0.00, 2.00, 0.01],
  ['palette.contrast', 'Contraste de la palette', 0.40, 2.00, 0.01],
  ['palette.warmShift', 'Balance chaud/froid', -0.20, 0.20, 0.001]
];

const COLORS = [
  ['environment.skyColor', 'Ciel'],
  ['environment.fogColor', 'Brouillard'],
  ['environment.domeColorTop', 'Dôme haut'],
  ['environment.domeColorBottom', 'Dôme bas'],
  ['lights.hemisphereSkyColor', 'Hémisphère ciel'],
  ['lights.hemisphereGroundColor', 'Hémisphère sol'],
  ['lights.sunColor', 'Soleil'],
  ['lights.fillColor', 'Remplissage'],
  ['palette.targets.field', 'Couleur champs'],
  ['palette.targets.forest', 'Couleur forêts'],
  ['palette.targets.grass', 'Couleur prairies'],
  ['palette.targets.house', 'Couleur villages'],
  ['palette.targets.rail', 'Couleur rails'],
  ['palette.targets.water', 'Couleur eau']
];


// ─── Presets d'ambiance one-click ────────────────────────────────────────────
// Chaque preset est un delta fusionné par-dessus le DEFAULT_VISUAL_ENVIRONMENT_CONFIG.
// delta:null = retour aux valeurs par défaut.
const VISUAL_PRESETS = [
  { name: '⭐ Défaut',          bg: 'linear-gradient(135deg,#ffd36d,#b58239)', pixelization: { enabled: false, pixelSize: 1 }, delta: null },
  {
    name: '🌅 Matin doré',      bg: 'linear-gradient(135deg,#ffcc60,#e8841a)',
    delta: {
      renderer: { toneMappingExposure: 1.52 },
      lights: { sunColor: '#ffb060', sunIntensity: 2.6, hemisphereGroundColor: '#9ab09c', hemisphereIntensity: 0.66, fillIntensity: 0.36 },
      grading: { saturation: 1.05, vibrance: 0.28, red: 1.07, green: 1.01, blue: 0.90, contrast: 1.03 },
      palette: { warmShift: 0.035 }
    }
  },
  {
    name: '🌇 Crépuscule',      bg: 'linear-gradient(135deg,#ff7030,#9a1a08)',
    delta: {
      renderer: { toneMappingExposure: 1.40 },
      environment: { fogDensity: 0.006 },
      lights: { sunColor: '#ff6820', sunIntensity: 1.8, hemisphereSkyColor: '#ffb080', hemisphereGroundColor: '#8a5030', hemisphereIntensity: 0.52, fillColor: '#d03820', fillIntensity: 0.28 },
      grading: { contrast: 1.07, saturation: 1.10, vibrance: 0.32, red: 1.12, green: 0.96, blue: 0.86, gamma: 1.05 },
      palette: { warmShift: 0.045 }
    }
  },
  {
    name: '🌫️ Brume côtière',   bg: 'linear-gradient(135deg,#90c8d8,#2860a0)',
    delta: {
      renderer: { toneMappingExposure: 1.28 },
      environment: { fogDensity: 0.014, fogColor: '#b8ccd8', skyColor: '#0a1620' },
      lights: { sunIntensity: 1.6, sunColor: '#d4e4f0', hemisphereSkyColor: '#b8d4e4', hemisphereGroundColor: '#7890a0', hemisphereIntensity: 0.65, fillIntensity: 0.32 },
      grading: { contrast: 0.96, saturation: 0.78, vibrance: 0.06, red: 0.96, green: 1.01, blue: 1.08, gamma: 1.02 }
    }
  },
  {
    name: '🌑 Minuit',          bg: 'linear-gradient(135deg,#2840a0,#080c24)',
    delta: {
      renderer: { toneMappingExposure: 0.88 },
      environment: { fogDensity: 0.010, skyColor: '#010208', fogColor: '#010208' },
      lights: { sunColor: '#3858b8', sunIntensity: 0.8, hemisphereSkyColor: '#1828a0', hemisphereGroundColor: '#101828', hemisphereIntensity: 0.32, fillColor: '#101848', fillIntensity: 0.18 },
      grading: { brightness: -0.03, contrast: 1.12, saturation: 0.68, vibrance: 0.04, blue: 1.14, red: 0.86, green: 0.94, gamma: 0.94 }
    }
  },
  {
    name: '🍂 Automne',         bg: 'linear-gradient(135deg,#e85820,#7a2808)',
    delta: {
      renderer: { toneMappingExposure: 1.42 },
      lights: { sunColor: '#e07010', sunIntensity: 2.2, hemisphereGroundColor: '#9a8060', hemisphereIntensity: 0.60, fillIntensity: 0.30 },
      grading: { saturation: 1.14, vibrance: 0.36, red: 1.13, green: 0.97, blue: 0.83, contrast: 1.06 },
      palette: { warmShift: 0.048, targets: { field: '#c09038', forest: '#7a4018', grass: '#a07028', house: '#b88060', rail: '#c0b088', water: '#4a7898' } }
    }
  },
  {
    name: '☀️ Été vif',          bg: 'linear-gradient(135deg,#60d040,#187840)',
    delta: {
      renderer: { toneMappingExposure: 1.56 },
      lights: { sunColor: '#ffffc0', sunIntensity: 2.9, hemisphereGroundColor: '#8ab890', hemisphereIntensity: 0.68, fillIntensity: 0.30 },
      grading: { saturation: 1.22, vibrance: 0.42, contrast: 1.04, green: 1.05, blue: 1.02, red: 1.01 },
      palette: { targets: { field: '#e8c858', forest: '#206820', grass: '#58c038', house: '#c0a878', rail: '#d0c8a4', water: '#28a8d6' } }
    }
  },
  {
    name: '📜 Vieux sépia',     bg: 'linear-gradient(135deg,#c09040,#6a4010)',
    delta: {
      renderer: { toneMappingExposure: 1.36 },
      lights: { sunColor: '#c89850', sunIntensity: 1.8, hemisphereGroundColor: '#907050', hemisphereIntensity: 0.58, fillIntensity: 0.22 },
      grading: { saturation: 0.62, vibrance: 0.08, contrast: 1.10, red: 1.20, green: 1.04, blue: 0.74, gamma: 1.06 },
      palette: { strength: 0.18, warmShift: 0.060, saturation: 0.68 }
    }
  },
  {
    name: '🌲 Forêt nordique',  bg: 'linear-gradient(135deg,#4890a8,#0a2838)',
    delta: {
      renderer: { toneMappingExposure: 1.24 },
      environment: { fogDensity: 0.008, fogColor: '#081c12' },
      lights: { sunColor: '#c8e0e8', sunIntensity: 1.7, hemisphereSkyColor: '#98c0c8', hemisphereGroundColor: '#284838', hemisphereIntensity: 0.60, fillColor: '#508898', fillIntensity: 0.28 },
      grading: { saturation: 0.88, vibrance: 0.18, contrast: 1.05, blue: 1.06, green: 1.04, red: 0.94, gamma: 1.03 },
      palette: { warmShift: -0.012, targets: { forest: '#185020', grass: '#488038', field: '#b8a050' } }
    }
  },
  {
    name: '🏜️ Désert doré',     bg: 'linear-gradient(135deg,#f0b840,#a86010)',
    delta: {
      renderer: { toneMappingExposure: 1.64 },
      environment: { fogDensity: 0.005 },
      lights: { sunColor: '#fff0a8', sunIntensity: 3.2, hemisphereSkyColor: '#ffe8a0', hemisphereGroundColor: '#c0a060', hemisphereIntensity: 0.54, fillColor: '#d0a850', fillIntensity: 0.28 },
      grading: { saturation: 0.88, vibrance: 0.28, red: 1.09, green: 1.02, blue: 0.83, contrast: 1.07, gamma: 1.02 },
      palette: { warmShift: 0.058, targets: { field: '#e8d07a', forest: '#808040', grass: '#b8a048', house: '#d0b878' } }
    }
  },
  {
    name: '🌙 Clair de lune',   bg: 'linear-gradient(135deg,#6088d8,#102060)',
    delta: {
      renderer: { toneMappingExposure: 1.08 },
      environment: { fogDensity: 0.006 },
      lights: { sunColor: '#7890e0', sunIntensity: 1.2, hemisphereSkyColor: '#2840a8', hemisphereGroundColor: '#182030', hemisphereIntensity: 0.38, fillColor: '#1840a8', fillIntensity: 0.22 },
      grading: { brightness: -0.02, saturation: 0.70, vibrance: 0.06, blue: 1.16, green: 1.00, red: 0.83, contrast: 1.07, gamma: 0.95 },
      palette: { warmShift: -0.022 }
    }
  },
  {
    name: '🧚 Conte de fées',   bg: 'linear-gradient(135deg,#e060c8,#6020a8)',
    delta: {
      renderer: { toneMappingExposure: 1.52 },
      lights: { sunColor: '#ffb0e0', sunIntensity: 2.4, hemisphereSkyColor: '#d8a0ff', hemisphereGroundColor: '#80a858', hemisphereIntensity: 0.60, fillColor: '#c058c0', fillIntensity: 0.32 },
      grading: { saturation: 1.32, vibrance: 0.58, contrast: 1.05, red: 1.06, green: 0.98, blue: 1.10 },
      palette: { warmShift: 0.008, strength: 0.38, targets: { forest: '#581878', grass: '#58b050', field: '#e0c048', house: '#c89068', water: '#4890d8' } }
    }
  },

  {
    name: '⚫ Noir & Blanc',    bg: 'linear-gradient(135deg,#999999,#111111)',
    pixelization: { pixelSize: 3, enabled: true, normalEdgeStrength: 0, depthEdgeStrength: 0 },
    delta: {
      renderer: { toneMappingExposure: 1.45 },
      grading: {
        saturation: 0.0, vibrance: 0.0, contrast: 1.30, gamma: 1.02, brightness: -0.01,
        paletteColors: ['#000000', '#ffffff'],
        paletteDither: 0.7
      }
    }
  },

  {
    // Moniteur phosphore vert — CRT rétro (Amstrad, Apple II, Kaypro…)
    name: '🖥️ Noir & Vert',    bg: 'linear-gradient(135deg,#00cc44,#003311)',
    pixelization: { pixelSize: 3, enabled: true, normalEdgeStrength: 0, depthEdgeStrength: 0 },
    delta: {
      renderer: { toneMappingExposure: 1.45 },
      environment: { fogDensity: 0.003, skyColor: '#000000', fogColor: '#000000' },
      lights: {
        sunColor: '#00ff44', sunIntensity: 2.0,
        hemisphereSkyColor: '#005522', hemisphereGroundColor: '#002211', hemisphereIntensity: 0.55,
        fillColor: '#003311', fillIntensity: 0.25
      },
      grading: {
        saturation: 0.0, vibrance: 0.0, contrast: 1.30, gamma: 1.02, brightness: -0.01,
        paletteColors: ['#000000', '#003300', '#006600', '#009900', '#00cc00', '#00ff00'],
        paletteDither: 0.7
      }
    }
  },

  {
    // CGA palette 1 haute intensite : Noir / Cyan / Magenta / Blanc
    // paletteDither → Bayer 4×4 pour simuler des couleurs intermédiaires
    name: 'CGA',  bg: 'linear-gradient(135deg,#55ffff,#ff55ff)',
    pixelization: { pixelSize: 3, enabled: true, normalEdgeStrength: 0, depthEdgeStrength: 0 },
    delta: {
      renderer: { toneMappingExposure: 1.75 },
      environment: { fogDensity: 0.002, skyColor: '#000000', fogColor: '#000000' },
      lights: {
        sunColor: '#ffffff', sunIntensity: 2.4,
        hemisphereSkyColor: '#55ffff', hemisphereGroundColor: '#ff55ff', hemisphereIntensity: 0.55,
        fillColor: '#aaaaaa', fillIntensity: 0.35
      },
      grading: {
        saturation: 1.0, vibrance: 0.0, contrast: 1.0, gamma: 1.0,
        red: 1.0, green: 1.0, blue: 1.0, brightness: 0.0,
        paletteColors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
        paletteDither: 0.7
      },
      palette: { enabled: false }
    }
  },

  {
    // EGA 16 couleurs — palette ADAPTÉE au jeu (pas IBM stricte)
    // Principe : 2 verts forêt sombres bien séparés des 2 verts prairie clairs.
    // Éclairage neutre-chaud, hémisphère faible pour garder le contraste forêt/prairie.
    name: 'EGA', bg: 'linear-gradient(135deg,#55ffff,#aa0000)',
    pixelization: { pixelSize: 3, enabled: true, normalEdgeStrength: 0, depthEdgeStrength: 0 },
    delta: {
      renderer: { toneMappingExposure: 2.40 },
      environment: { fogDensity: 0.002, skyColor: '#000000', fogColor: '#000000' },
      lights: {
        sunColor: '#dddd44', sunIntensity: 2.4,
        hemisphereSkyColor: '#224466', hemisphereGroundColor: '#224422', hemisphereIntensity: 0.45,
        fillColor: '#553311', fillIntensity: 0.22
      },
      grading: {
        saturation: 1.0, vibrance: 0.0, contrast: 1.0, gamma: 1.0,
        red: 1.0, green: 1.0, blue: 1.0, brightness: 0.0,
        paletteColors: [
          // noirs/ombres
          '#000000', '#110800',
          // FORÊT — verts sombres (G channel 68–102) — zone basse
          '#1a4418', '#2a6628',
          // ←— GAP : aucune entrée entre G:102 et G:152 —→
          // PRAIRIE — verts clairs (G channel 152–204) — zone haute
          '#5a9828', '#88cc44',
          // champs / blé
          '#886600', '#ddcc44',
          // maisons / routes
          '#442211', '#886644', '#ccbb88',
          // eau
          '#225566', '#3388aa',
          // gravillons rails
          '#666666',
          // crème / blanc
          '#ddddbb', '#ffffff'
        ],
        paletteDither: 0.6
      },
      palette: { enabled: false }
    }
  },

  {
    // Amiga OCS 32 couleurs — adaptée aux biomes du jeu.
    // GAP intentionnel entre verts forêt (G≤102) et verts prairie (G≥152)
    // pour forcer deux snapshots distincts. Rails = gris. Troncs = bruns.
    // Peu de bleu, zéro violet. Éclairage chaud, hémisphère faible.
    name: 'Amiga',   bg: 'linear-gradient(135deg,#0066bb,#ff8800)',
    pixelization: { pixelSize: 2, enabled: true, normalEdgeStrength: 0, depthEdgeStrength: 0 },
    delta: {
      renderer: { toneMappingExposure: 2.40 },
      environment: { fogDensity: 0.003, skyColor: '#000022', fogColor: '#001133' },
      lights: {
        sunColor: '#ffdd66', sunIntensity: 2.4,
        hemisphereSkyColor: '#446688', hemisphereGroundColor: '#225522', hemisphereIntensity: 0.30,
        fillColor: '#aa7722', fillIntensity: 0.16
      },
      grading: {
        saturation: 1.0, vibrance: 0.0, contrast: 1.0, gamma: 1.0,
        red: 1.0, green: 1.0, blue: 1.0, brightness: 0.0,
        paletteColors: [
          // noirs et ombres chaudes (3)
          '#000000', '#111100', '#332211',
          // sols / brun sombre (2)
          '#443322', '#665544',
          // FORÊT — verts sombres/froids, G≤102 (4)
          '#142a14', '#1e4420', '#2a5e2c', '#386636',
          //   ←—— GAP intentionnel : aucune entrée entre #386636 (G:102) et #609c30 (G:156) ——→
          // PRAIRIE — verts clairs/chauds, G≥156 (4)
          '#609c30', '#78b040', '#90c450', '#aad860',
          // champs / blé — ambre et or (5)
          '#664400', '#886600', '#aa8800', '#ccaa00', '#eedd44',
          // crème et blanc chaud (2)
          '#f4eebb', '#ffffff',
          // brun-gris maisons / routes (4)
          '#553322', '#776655', '#998877', '#ccbbaa',
          // troncs d'arbres / bois (3)
          '#3a1e08', '#5a3014', '#7a4e22',
          // eau / bleu (3)
          '#1a3855', '#336688', '#558eaa',
          // gris pierre bâtiments + métal trains/rails — 7 tons, du sombre au clair
          '#333333', '#4d4d5a', '#666666', '#7a7a88', '#999999', '#aaaabb', '#cccccc',
          // rouge Amiga typique — champignons
          '#cc2200'
        ],
        paletteDither: 0.45
      },
      palette: { enabled: false }
    }
  }
];

const HELP_TEXT = {
  'renderer.toneMappingExposure': 'Exposition générale du renderer Three.js. Augmente ou réduit la quantité globale de lumière avant l’étalonnage.',
  'environment.fogDensity': 'Densité du brouillard de scène. Plus la valeur monte, plus les éléments éloignés se fondent dans la couleur de brouillard.',
  'lights.hemisphereIntensity': 'Intensité de la lumière ambiante ciel/sol. Sert à éclairer les faces non touchées directement par le soleil.',
  'lights.sunIntensity': 'Puissance de la lumière directionnelle du soleil. Influence fortement les ombres et le relief.',
  'lights.sunOrbitRadius': 'Distance horizontale parcourue par le soleil autour de la scène. Change l’angle des ombres pendant l’orbite.',
  'lights.sunOrbitHeight': 'Hauteur verticale du soleil. Plus haut = ombres plus courtes ; plus bas = ombres plus longues et rasantes.',
  'lights.sunOrbitSpeed': 'Vitesse de déplacement orbital du soleil. À 0, les ombres deviennent statiques.',
  'lights.sunVisualScale': 'Taille apparente de l’objet soleil visible dans le ciel, sans changer directement sa puissance lumineuse.',
  'lights.fillIntensity': 'Lumière secondaire douce qui débouche les ombres. Utile pour éviter les zones trop noires.',

  'grading.brightness': 'Luminosité finale. Ajoute ou retire de la lumière après le rendu, comme un réglage d’étalonnage.',
  'grading.contrast': 'Contraste final. Augmente l’écart entre zones sombres et zones claires.',
  'grading.saturation': 'Saturation globale. Augmente ou réduit l’intensité de toutes les couleurs.',
  'grading.vibrance': 'Vibrance. Renforce surtout les couleurs faibles ou ternes en préservant davantage les couleurs déjà saturées.',
  'grading.hue': 'Décalage global de teinte. Fait tourner toutes les couleurs autour du cercle chromatique.',
  'grading.gamma': 'Correction gamma. Ajuste surtout les tons moyens sans agir comme une simple luminosité brute.',
  'grading.blackLevel': 'Niveau des noirs. Rehausse ou écrase le point noir, utile pour éviter un rendu trop bouché.',
  'grading.whiteLevel': 'Niveau des blancs. Contrôle le point blanc final, utile pour éviter une image brûlée ou trop plate.',
  'grading.red': 'Gain du canal rouge. Renforce ou réduit la composante rouge du rendu final.',
  'grading.green': 'Gain du canal vert. Renforce ou réduit la composante verte du rendu final.',
  'grading.blue': 'Gain du canal bleu. Renforce ou réduit la composante bleue du rendu final.',
  'grading.redCurve': 'Courbe du canal rouge. Modifie la réponse tonale du rouge, surtout dans les tons moyens.',
  'grading.greenCurve': 'Courbe du canal vert. Modifie la réponse tonale du vert, surtout dans les tons moyens.',
  'grading.blueCurve': 'Courbe du canal bleu. Modifie la réponse tonale du bleu, surtout dans les tons moyens.',

  'palette.strength': 'Force d’application de la palette sur les textures ciblées. Plus haut = recoloration plus visible.',
  'palette.saturation': 'Saturation appliquée après harmonisation palette. Permet de calmer ou pousser les textures recolorées.',
  'palette.contrast': 'Contraste appliqué aux couleurs harmonisées par palette.',
  'palette.warmShift': 'Balance chaud/froid de la palette. Valeur négative = plus froid ; positive = plus chaud.',

  'environment.skyColor': 'Couleur du fond de ciel du renderer.',
  'environment.fogColor': 'Couleur utilisée par le brouillard de scène.',
  'environment.domeColorTop': 'Couleur du haut du dôme d’environnement.',
  'environment.domeColorBottom': 'Couleur du bas du dôme d’environnement.',
  'lights.hemisphereSkyColor': 'Couleur de la partie ciel de la lumière hémisphérique.',
  'lights.hemisphereGroundColor': 'Couleur de la partie sol de la lumière hémisphérique.',
  'lights.sunColor': 'Couleur de la lumière du soleil.',
  'lights.fillColor': 'Couleur de la lumière de remplissage.',
  'palette.targets.field': 'Couleur cible utilisée pour harmoniser les textures de champs.',
  'palette.targets.forest': 'Couleur cible utilisée pour harmoniser les textures de forêts.',
  'palette.targets.grass': 'Couleur cible utilisée pour harmoniser les textures de prairies.',
  'palette.targets.house': 'Couleur cible utilisée pour harmoniser les textures de villages.',
  'palette.targets.rail': 'Couleur cible utilisée pour harmoniser les textures de rails.',
  'palette.targets.water': 'Couleur cible utilisée pour harmoniser les textures et shaders d’eau.'
};

export function createDebugLightUI({ visualEnvironment, postprocess }) {
  if (!visualEnvironment) return null;

  installDebugLightCss();

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
        <button id="fpsHudToggle" class="debug-light-toggle debug-light-toggle--fps" type="button" title="Afficher/masquer le HUD performances avancé [F]">FPS</button>
        <button id="pixToggle" class="debug-light-toggle debug-light-toggle--pix" type="button" title="Activer/désactiver la pixelisation [P]">PIX</button>
        <button id="debugLightToggle" class="debug-light-toggle" type="button" title="Ouvrir ou fermer le panneau d’étalonnage LUT">LUT</button>
      </div>
    </div>
    <div class="debug-light-body">
      <div class="debug-light-head">
        <strong>LUT - ÉTALONNAGE</strong>
        <button id="debugLightReset" type="button">Reset</button>
      </div>
      <div class="debug-light-presets-label">AMBIANCES</div>
      <div id="debugLightPresets" class="debug-light-presets"></div>
      <div class="debug-light-switches">
        <label title="Active ou désactive l’étalonnage final appliqué après le rendu Three.js."><input id="debugGradingEnabled" type="checkbox"> Étalonnage final</label>
        <label title="Active ou désactive l’harmonisation de palette sur les textures ciblées."><input id="debugPaletteEnabled" type="checkbox"> Palette textures</label>
        <label title="Active ou désactive le mouvement orbital du soleil et donc des ombres."><input id="debugSunOrbitEnabled" type="checkbox"> Orbite soleil</label>
      </div>
      <div id="debugLightControls" class="debug-light-controls"></div>
      <div class="debug-light-export">
        <button id="debugLightExport" type="button">Exporter JSON</button>
        <button id="debugLightCopy" type="button">Copier</button>
      </div>
      <textarea id="debugLightJson" spellcheck="false"></textarea>
    </div>
  `;

  document.body.appendChild(root);
  _fpsEl = root.querySelector('#fps-counter');
  // Délégation de clic sur le conteneur HUD → bouton copier (innerHTML est recréé à chaque frame)
  _fpsEl.addEventListener('click', e => {
    if (e.target.closest('.fps-hud-copy')) { _copyHud(); return; }
    const sortEl = e.target.closest('[data-sort]');
    if (sortEl) {
      const key = sortEl.dataset.sort;
      if (_hudSortKey === key) _hudSortDir *= -1;
      else { _hudSortKey = key; _hudSortDir = -1; }
      if (_fpsEl) _fpsEl.innerHTML = _buildHud(_lastHudFps, _lastHudInfo);
    }
  });

  const controls = root.querySelector('#debugLightControls');
  const json = root.querySelector('#debugLightJson');
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

  for (const [path, label, min, max, step] of SLIDERS) {
    controls.appendChild(createSlider(state, path, label, min, max, step, applyAll));
  }

  for (const [path, label] of COLORS) {
    controls.appendChild(createColorPicker(state, path, label, applyAll));
  }

  // ─── Preset buttons ─────────────────────────────────────────────────────────
  const presetsContainer = root.querySelector('#debugLightPresets');
  for (const preset of VISUAL_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'debug-light-preset-btn';
    btn.textContent = preset.name;
    btn.style.background = preset.bg;
    btn.title = preset.delta ? `Appliquer l'ambiance "${preset.name}"` : 'Retour aux valeurs par défaut';
    btn.addEventListener('click', () => {
      const fresh = cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG);
      if (preset.delta) applyDelta(fresh, preset.delta);
      replaceDeep(state, fresh);
      refreshInputs(root, state);
      // Pixelisation indépendante du LUT config.
      // Presets retro : leur pixelization inclut enabled:true → active la grille.
      // Autres presets : désactive explicitement la pixelisation (enabled:false).
      postprocess?.applySettings?.(preset.pixelization ?? { enabled: false, pixelSize: 1 });
      applyAll();
      exportJson();
    });
    presetsContainer.appendChild(btn);
  }

  const lutToggleBtn = root.querySelector('#debugLightToggle');
  lutToggleBtn.addEventListener('click', () => {
    root.classList.toggle('collapsed');
    lutToggleBtn.classList.toggle('debug-light-toggle--lut-active', !root.classList.contains('collapsed'));
    // Re-sync la largeur à chaque ouverture (le panel était caché → offsetWidth = 0)
    if (!root.classList.contains('collapsed')) _syncLutWidth();
  });
  // Touche L : synchroniser le bouton LUT
  document.addEventListener('keydown', e => {
    if (e.key === 'l' || e.key === 'L') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      setTimeout(() => {
        lutToggleBtn.classList.toggle('debug-light-toggle--lut-active', !root.classList.contains('collapsed'));
      }, 0);
    }
  });

  // Bouton FPS : affiche/masque le HUD perf avancé
  function _toggleFpsHud() {
    _fpsHudExpanded = !_fpsHudExpanded;
    localStorage.setItem('hexistenz_fps_hud_expanded', _fpsHudExpanded);
    const btn = root.querySelector('#fpsHudToggle');
    if (btn) btn.classList.toggle('debug-light-toggle--fps-active', _fpsHudExpanded);
    // Forcer rebuild immédiat
    if (_fpsEl) _fpsEl.innerHTML = _buildHud(_lastHudFps, _lastHudInfo);
  }
  root.querySelector('#fpsHudToggle').addEventListener('click', _toggleFpsHud);
  // Mettre à jour l'état initial du bouton
  const fpsBtnInit = root.querySelector('#fpsHudToggle');
  if (fpsBtnInit) fpsBtnInit.classList.toggle('debug-light-toggle--fps-active', _fpsHudExpanded);

  // Touche F : basculer le HUD perf avancé
  document.addEventListener('keydown', e => {
    if (e.key === 'f' || e.key === 'F') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      _toggleFpsHud();
    }
  });

  // ─── Bouton PIX + touche P : afficher/masquer le HUD pixelisation ──────────
  const pixBtn = root.querySelector('#pixToggle');

  function _syncPixBtn() {
    const panel = document.getElementById('postprocessHud');
    // getComputedStyle tient compte de !important (mode immersif)
    const visible = panel ? getComputedStyle(panel).display !== 'none' : false;
    pixBtn.classList.toggle('debug-light-toggle--pix-active', visible);
  }

  function _togglePixPanel() {
    const panel = document.getElementById('postprocessHud');
    if (!panel) return;
    const visible = getComputedStyle(panel).display !== 'none';
    if (visible) {
      panel.style.removeProperty('display');
      panel.style.display = 'none';
    } else {
      // setProperty avec priorité 'important' pour passer outre la règle
      // body.grid-only-mode .postprocess-hud { display: none !important }
      panel.style.setProperty('display', 'block', 'important');
    }
    _syncPixBtn();
  }

  // Initialiser : cacher le panel par défaut → bouton gris ; 1er clic = afficher
  requestAnimationFrame(() => {
    const panel = document.getElementById('postprocessHud');
    if (panel) panel.style.display = 'none';
    _syncPixBtn();
  });

  pixBtn.addEventListener('click', _togglePixPanel);

  // Touche P : afficher/masquer le HUD pixelisation
  document.addEventListener('keydown', e => {
    if (e.key === 'p' || e.key === 'P') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      _togglePixPanel();
    }
  });
  root.querySelector('#debugLightExport').addEventListener('click', () => exportJson());
  root.querySelector('#debugLightCopy').addEventListener('click', async () => {
    exportJson();
    try { await navigator.clipboard.writeText(json.value); } catch (error) { console.warn('[debugLightUI] copie presse-papiers impossible', error); }
  });
  root.querySelector('#debugLightReset').addEventListener('click', () => {
    replaceDeep(state, cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG));
    localStorage.removeItem(LUT_STORAGE_KEY);
    // Réinitialiser aussi la pixelisation (désactivée dans le rendu par défaut)
    localStorage.removeItem('dorfoPixelPostprocessSettings.v4');
    postprocess?.applySettings?.({ pixelSize: 2, enabled: false });
    refreshInputs(root, state);
    applyAll();
    exportJson();
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
  kbdHint.innerHTML = 'H ou ESC&nbsp;→ aide &nbsp;·&nbsp; ESPACE&nbsp;→ immersif &nbsp;·&nbsp; ⇧ESPACE&nbsp;→ super-immersif';
  document.body.appendChild(kbdHint);

  applyAll();
  exportJson();

  return {
    element: root,
    exportJson,
    applyAll
  };

  function applyAll() {
    visualEnvironment.apply(state);
    applyColorGradingUniforms(postprocess?.colorGradingPass, state);
    saveLutConfig(visualEnvironment.exportConfig());
  }

  function exportJson() {
    json.value = JSON.stringify(visualEnvironment.exportConfig(), null, 2);
  }
}

function createSlider(state, path, label, min, max, step, onChange) {
  const row = document.createElement('label');
  row.className = 'debug-light-row';

  const value = Number(getPath(state, path));
  const help = getHelpText(path);
  row.title = help;
  row.innerHTML = `
    <span title="${escapeHtml(help)}">${label}</span>
    <input data-path="${path}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" title="${escapeHtml(help)}">
    <output title="Valeur actuelle">${formatNumber(value)}</output>
  `;

  const input = row.querySelector('input');
  const output = row.querySelector('output');
  input.addEventListener('input', () => {
    const next = Number(input.value);
    setPath(state, path, next);
    output.textContent = formatNumber(next);
    onChange();
  });

  return row;
}

function createColorPicker(state, path, label, onChange) {
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
      backdrop-filter: blur(6px);
      width: 390px;
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
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 2px;
    }

    .fps-hud-copy {
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

    .fps-hud-copy:hover {
      background: rgba(255,255,255,0.20);
      color: #fff;
    }

    .fps-hud-fps {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.04em;
      color: rgba(240,250,255,0.96);
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
      font-size: 11px;
      font-weight: 700;
      font-style: italic;
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
      font-size: 18px;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      line-height: 1;
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
      width: 64px;
      height: 34px;
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

    .debug-light-toggle--pix {
      background: linear-gradient(135deg, #4a5568, #2d3748);
      color: rgba(247,239,225,0.7);
      border-color: rgba(255,255,255,0.18);
    }

    .debug-light-toggle--pix.debug-light-toggle--pix-active {
      background: linear-gradient(135deg, #ffd36d, #b58239);
      color: #1c140c;
      border-color: rgba(255,255,255,0.28);
    }

    .debug-light-body {
      pointer-events: auto;
      /* box-sizing: border-box → width JS inclut padding + border, comme offsetWidth de #tileUI */
      box-sizing: border-box;
      /* Largeur initiale : sera écrasée par JS pour matcher #tileUI */
      width: min(280px, calc(100vw - 92px));
      max-height: calc(100vh - 28px);
      overflow: hidden auto;
      padding: 12px;
      border: 1px solid rgba(120,180,255,0.34);
      border-radius: 12px;
      background: rgba(0,0,0,0.68);
      backdrop-filter: blur(7px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
    }

    .debug-light-panel.collapsed .debug-light-body { display: none; }

    .debug-light-head,
    .debug-light-switches,
    .debug-light-export {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .debug-light-head button,
    .debug-light-export button {
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 8px;
      color: #f6ecd6;
      background: rgba(255,255,255,0.08);
      cursor: pointer;
      padding: 4px 8px;
    }

    .debug-light-controls {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      max-height: 49vh;
      overflow: auto;
      padding-right: 4px;
    }

    .debug-light-row {
      display: grid;
      grid-template-columns: 122px 1fr 58px;
      align-items: center;
      gap: 8px;
    }

    .debug-light-row input[type="range"] { width: 100%; }
    .debug-light-row input[type="color"] {
      width: 100%;
      height: 24px;
      border: 0;
      background: transparent;
    }

    .debug-light-row output {
      color: #ffd995;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .debug-light-presets-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.10em;
      color: rgba(244,234,214,0.55);
      margin-bottom: 5px;
    }

    .debug-light-presets {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 10px;
    }

    .debug-light-preset-btn {
      flex: 1 0 auto;
      min-width: 96px;
      max-width: calc(50% - 3px);
      padding: 5px 8px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.18);
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
      text-align: center;
      color: #1c1008;
      letter-spacing: 0.01em;
      transition: filter 0.12s, transform 0.10s;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    }

    .debug-light-preset-btn:hover {
      filter: brightness(1.12);
      transform: translateY(-1px);
    }

    .debug-light-preset-btn:active { transform: translateY(0); }

    #debugLightJson {
      display: none;
    }

    /* ── Mini HUD clavier (bottom-right) ── */
    #kbdHintHud {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 2900;
      font: 10px/1.4 monospace;
      color: rgba(180,210,255,0.70);
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(120,180,255,0.22);
      border-radius: 8px;
      padding: 5px 8px;
      pointer-events: none;
      white-space: nowrap;
    }

    body.grid-only-mode #kbdHintHud { display: none; }

    /* Super-immersif (SHIFT+ESPACE) : masque les HUDs FPS / PIX / LUT */
    body.huds-force-hidden #debugLightPanel { display: none !important; }
    body.huds-force-hidden #postprocessHud  { display: none !important; }
  `;
  document.head.appendChild(style);
}


function getHelpText(path) {
  return HELP_TEXT[path] ?? 'Réglage visuel du panneau LUT.';
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
