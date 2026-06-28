/**
 * sceneProfiler.js — Classification et comptage des objets de la scène Three.js.
 *
 * Extrait de debugLightUi.js : logique indépendante du HUD, réutilisable.
 * Fournit :
 *   scanScene(scene)  → counts : Record<label, {count, draws, tris, shadows}>
 *   GROUP_ORDER, GROUP_ICONS, ITEM_GROUP, CATEGORY_ICONS  → métadonnées UI
 */

// ─── Icônes par label de catégorie ───────────────────────────────────────────
export const CATEGORY_ICONS = {
  // Forêt — espèces individuelles
  'Bouleau':          '🌿',
  'Chêne':            '🌳',
  'Pin':              '🌲',
  'Peuplier':         '🌲',
  'Épicéa':           '🌲',
  'Feuillu':          '🌳',
  'Sapin':            '🌲',
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
  'Cerfs':            '🦌',
  'Animaux (champ)':  '🐾',
  // Nature
  'Fleurs':           '🌸',
  'Champignons':      '🍄',
  'Rochers':          '🪨',
  'Bottes foin':      '🌾',
  'Roseaux':          '🌿',
  'Plantes':          '🌱',
  'Brindilles':       '🪵',
  'Arbustes':         '🫧',
  'Blé':              '🌾',
  'Brins de blé':     '🌾',
  // Village
  'Chiens':           '🐕',
  'Chevaux':          '🐴',
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
  "Gouttes d'eau":    '💧',
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

// ─── Appartenance à un groupe-catégorie ──────────────────────────────────────
export const ITEM_GROUP = {
  // Forêt
  'Bouleau': 'Forêt', 'Chêne': 'Forêt', 'Pin': 'Forêt', 'Peuplier': 'Forêt',
  'Épicéa': 'Forêt', 'Feuillu': 'Forêt', 'Sapin': 'Forêt',
  'Arbre mort': 'Forêt', 'Buisson': 'Forêt',
  // Bâtiments
  'Maison-1': 'Bâtiments', 'Maison-2': 'Bâtiments', 'Maison-3': 'Bâtiments', 'Maison-4': 'Bâtiments',
  'Maisons': 'Bâtiments', 'Églises': 'Bâtiments', 'Tours de guet': 'Bâtiments',
  // Nature
  'Fleurs': 'Nature', 'Champignons': 'Nature', 'Rochers': 'Nature', 'Bottes foin': 'Nature',
  'Roseaux': 'Nature', 'Plantes': 'Nature', 'Brindilles': 'Nature', 'Arbustes': 'Nature', 'Blé': 'Nature', 'Brins de blé': 'Nature',
  // Animaux champ
  'Cerfs': 'Animaux', 'Animaux (champ)': 'Animaux',
  // Village
  'Chiens': 'Village', 'Chevaux': 'Village',
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

export const GROUP_ORDER = ['Forêt', 'Bâtiments', 'Nature', 'Animaux', 'Village', 'Transport', 'Eau', 'Terrain', 'Divers'];
export const GROUP_ICONS = { 'Forêt': '🌲', 'Bâtiments': '🏠', 'Nature': '🌿', 'Animaux': '🐾', 'Village': '🏘️', 'Transport': '🚂', 'Eau': '🌊', 'Terrain': '🗺️', 'Divers': '✦' };

// ─── Espèces d'arbres connues ─────────────────────────────────────────────────
const _TREE_SPECIES_MAP = {
  'bouleau-':    'Bouleau',      // préfixe → bouleau-1, bouleau-2
  buisson:       'Buisson',
  peuplier:      'Peuplier',
  'sapin-':      'Sapin',        // préfixe → sapin-1…8
  'gros-arbre-': 'Gros arbre',   // préfixe → gros-arbre-1…3
};
const _TREE_SPECIES_KEYS = Object.keys(_TREE_SPECIES_MAP);

// ─── GLB individuels — premier match gagne ────────────────────────────────────
const _GLB_LABELS = [
  ['village-house-glb-maison-medievale-moyenne', 'Maison moyenne'],
  ['village-house-glb-maison-medievale-petite',  'Maison petite'],
  ['village-house-glb',                          'Maisons'],
  ['village-watchtower-glb-zone-reward',      'Tours de guet'],
  ['village-animal-dog-glb',                  'Chiens'],
  ['village-animal-horse-glb',                'Chevaux'],
  ['animatedRailTrainArticulated',            'Trains'],
  ['rail-terminus-station-glb',               'Gares'],
  ['left-rail',                               'Rails métal'],
  ['right-rail',                              'Rails métal'],
  ['terminus-bumper',                         'Voies ferrées'],
  ['decorative-stone',                        'Voies ferrées'],
  ['water-shore-inert-boat-glb-shore-boat-1', 'Barque 1'],
  ['water-shore-inert-boat-glb-shore-boat-2', 'Barque 2'],
  ['animated-water-boat-glb',                 'Bateaux'],
  ['water-shore-inert-boat-glb',              'Barques'],
  ['village-stone-road-glb-network',          'Routes'],
  ['village-stone-road-route',                'Routes'],
  ['procedural-rail',                         'Voies ferrées'],
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

// ─── Helpers internes ─────────────────────────────────────────────────────────

function _classifyInstanced(obj) {
  const n = obj.name ?? '';
  if (n.startsWith('instanced-tree-')) {
    const rest = n.slice('instanced-tree-'.length);
    const species = _TREE_SPECIES_KEYS.find(k => rest.startsWith(k));
    return species ? (_TREE_SPECIES_MAP[species] ?? 'Arbres') : 'Arbres';
  }
  if (n.startsWith('instanced-prop-animal-deer'))    return 'Cerfs';
  if (n.startsWith('instanced-prop-animal-'))        return 'Animaux (champ)';
  if (n.startsWith('instanced-prop-flower'))         return 'Fleurs';
  if (n.startsWith('instanced-prop-mushroom'))       return 'Champignons';
  if (n.startsWith('instanced-prop-rock'))           return 'Rochers';
  if (n.startsWith('instanced-prop-hay'))            return 'Bottes foin';
  if (n.startsWith('instanced-prop-reed'))           return 'Roseaux';
  if (n.startsWith('instanced-prop-plant'))          return 'Plantes';
  if (n.startsWith('instanced-prop-brindille'))      return 'Brindilles';
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

function _geomTris(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return geometry.index.count / 3;
  const pos = geometry.attributes?.position;
  return pos ? Math.floor(pos.count / 3) : 0;
}

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

function _acc(counts, label) {
  return counts[label] ?? (counts[label] = { count: 0, draws: 0, tris: 0, shadows: 0 });
}

function _classifyMesh(name) {
  if (!name) return 'Terrain Autre';
  if (name === 'terrain-merged-mesh') return 'Terrain (fusionné)';
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
let _instanceNamesSeen = null;

// Traversal récursif custom : s'arrête dès qu'un GLB racine est identifié
function _traverseNode(obj, counts) {
  if (!obj.visible) return;

  if (obj.isInstancedMesh) {
    if (obj.count === 0) return;
    const label = _classifyInstanced(obj);
    if (label) {
      const e = _acc(counts, label);
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

  if (obj.isMesh) {
    const label = _classifyMesh(obj.name);
    const e = _acc(counts, label);
    e.count   += 1;
    e.draws   += 1;
    e.tris    += _geomTris(obj.geometry);
    if (obj.castShadow) e.shadows += 1;
    return;
  }

  for (const child of obj.children) {
    _traverseNode(child, counts);
  }
}

/**
 * Scanne la scène et retourne un objet counts classifié par label.
 * @param {THREE.Scene} scene
 * @returns {Record<string, {count:number, draws:number, tris:number, shadows:number}>}
 */
export function scanScene(scene) {
  _instanceNamesSeen = new Set();
  const counts = {};
  for (const child of scene.children) {
    _traverseNode(child, counts);
  }
  _instanceNamesSeen = null;
  return counts;
}
