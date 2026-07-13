/**
 * sceneProfiler.js — Classification et comptage des objets de la scène Three.js.
 *
 * Extrait de debugLightUi.js (renommé edaPanelHost.js le 2026-07-11) : logique indépendante du HUD, réutilisable.
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
  'Gros arbre':       '🌳',
  'Arbres':           '🌲', // fallback espèce inconnue (_classifyInstanced) — évite un nouvel orphelin "Autres"
  // Bâtiments — types individuels
  'Maison-1':         '🏠',
  'Maison-2':         '🏠',
  'Maison-3':         '🏠',
  'Maison-4':         '🏠',
  'Maisons':          '🏠',
  'Églises':          '⛪',
  'Tours de guet':    '🗼',
  // Animaux
  'Cerfs':            '🦌',
  'Animaux (champ)':  '🐾',
  'Moutons':          '🐑',
  'Corbeaux':         '🐦',
  'Mouettes':         '🕊️',
  // Nature
  'Fleurs':           '🌸',
  'Champignons':      '🍄',
  'Rochers':          '🪨',
  'Bottes foin':      '🌾',
  'Roseaux':          '🌿',
  'Plantes':          '🌱',
  'Plantes à baies':  '🫐',
  'Brindilles':       '🪵',
  'Arbustes':         '🫧',
  'Blé':              '🌾',
  'Brins de blé':     '🌾',
  "Brins d'herbe":    '🍀',
  // Village
  'Chiens':           '🐕',
  'Chevaux':          '🐴',
  'Charrettes':       '🪵',
  'Tonneaux':         '🪣',
  'Moulins':          '🌀',
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
  'Traverses':        '🪵',
  // Eau — types individuels
  'Bateaux':          '⛵',
  'Barque 1':         '🚣',
  'Barque 2':         '🚣',
  'Barque 3':         '🚣',
  'Barques':          '🚣',
  "Gouttes d'eau":    '💧',
  'Filets eau':       '🌊',
  'Brume eau':        '💨',
  'Effets eau':       '💧',
  // Personnages — villageois
  'Femme 1':          '👩',
  'Femme 2':          '👩',
  'Femme 3':          '👩',
  'Femme 4':          '👩',
  'Femme 5':          '👩',
  'Homme 1':          '🧑',
  'Homme 2':          '🧑',
  'Homme 3':          '🧑',
  'Fermier':          '🧑‍🌾',
  'Forgeron':         '⚒️',
  'Marchand':         '💰',
  'Tavernier':        '🍺',
  'Garde':            '💂',
  'Soldat':           '⚔️',
  'Chevalier':        '🛡️',
  'Villageois':       '🧑',
  // Personnages — rôdeurs de forêt
  'Archer':           '🏹',
  'Guerrier 1':       '🗡️',
  'Guerrier 2':       '🗡️',
  'Guerrier 3':       '🗡️',
  'Magicien':         '🧙',
  'Moine':            '🙏',
  'Sorcière':         '🧙‍♀️',
  'Rôdeurs forêt':    '🏹',
  // Divers
  'Coffres bonus':    '🎁',
  'Étoiles & comètes':'✨',
  'Grille':           '🔲',
  'Autres props inconnues': '❔',
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
  'Arbre mort': 'Forêt', 'Buisson': 'Forêt', 'Gros arbre': 'Forêt', 'Arbres': 'Forêt',
  // Bâtiments
  'Maison-1': 'Bâtiments', 'Maison-2': 'Bâtiments', 'Maison-3': 'Bâtiments', 'Maison-4': 'Bâtiments',
  'Maisons': 'Bâtiments', 'Églises': 'Bâtiments', 'Tours de guet': 'Bâtiments', 'Gares': 'Bâtiments',
  // Nature
  'Fleurs': 'Nature', 'Champignons': 'Nature', 'Rochers': 'Nature', 'Bottes foin': 'Nature',
  'Roseaux': 'Nature', 'Plantes': 'Nature', 'Plantes à baies': 'Nature',
  'Brindilles': 'Nature', 'Arbustes': 'Nature', 'Blé': 'Nature', 'Brins de blé': 'Nature',
  "Brins d'herbe": 'Nature',
  // Animaux — toute faune, champêtre ou volante (2026-07-04 : Moutons/Corbeaux/Mouettes
  // étaient éparpillés dans Village/Transport ou pas classés du tout, cf. bug "Terrain Autre")
  'Cerfs': 'Animaux', 'Animaux (champ)': 'Animaux',
  'Moutons': 'Animaux', 'Corbeaux': 'Animaux', 'Mouettes': 'Animaux',
  // Village
  'Chiens': 'Village', 'Chevaux': 'Village',
  'Charrettes': 'Village', 'Tonneaux': 'Village', 'Moulins': 'Village',
  'Bancs': 'Village', 'Panneaux': 'Village', 'Fontaines': 'Village', 'Props ambiants': 'Village',
  // Transport
  'Trains': 'Transport', 'Voies ferrées': 'Transport',
  'Rails métal': 'Transport', 'Routes': 'Transport', 'Traverses': 'Transport',
  // "Autres props inconnues" n'a volontairement aucun groupe → tombe dans le panier "Autres"
  // (catégorie fourre-tout réelle, ne devrait pas être rattachée à un groupe thématique précis)
  // Eau
  'Bateaux': 'Eau', 'Barque 1': 'Eau', 'Barque 2': 'Eau', 'Barque 3': 'Eau', 'Barques': 'Eau',
  "Gouttes d'eau": 'Eau', 'Filets eau': 'Eau', 'Brume eau': 'Eau', 'Effets eau': 'Eau',
  'Plages': 'Eau', 'Mers': 'Eau',
  // Terrain
  'Terrain Prairie': 'Terrain', 'Terrain Forêt': 'Terrain', 'Terrain Village': 'Terrain',
  'Terrain Rail': 'Terrain', 'Terrain Mer': 'Terrain', 'Terrain Champ': 'Terrain',
  'Terrain Vide': 'Terrain', 'Terrain Autre': 'Terrain', 'Terrain (fusionné)': 'Terrain',
  // Personnages
  'Femme 1': 'Personnages', 'Femme 2': 'Personnages', 'Femme 3': 'Personnages',
  'Femme 4': 'Personnages', 'Femme 5': 'Personnages',
  'Homme 1': 'Personnages', 'Homme 2': 'Personnages', 'Homme 3': 'Personnages',
  'Fermier': 'Personnages', 'Forgeron': 'Personnages', 'Marchand': 'Personnages', 'Tavernier': 'Personnages',
  'Garde': 'Personnages', 'Soldat': 'Personnages', 'Chevalier': 'Personnages', 'Villageois': 'Personnages',
  'Archer': 'Personnages', 'Guerrier 1': 'Personnages', 'Guerrier 2': 'Personnages', 'Guerrier 3': 'Personnages',
  'Magicien': 'Personnages', 'Moine': 'Personnages', 'Sorcière': 'Personnages', 'Rôdeurs forêt': 'Personnages',
  // Divers
  'Coffres bonus': 'Divers', 'Étoiles & comètes': 'Divers', 'Grille': 'Divers',
};

export const GROUP_ORDER = ['Forêt', 'Bâtiments', 'Nature', 'Animaux', 'Village', 'Personnages', 'Transport', 'Eau', 'Terrain', 'Divers'];
export const GROUP_ICONS = { 'Forêt': '🌲', 'Bâtiments': '🏠', 'Nature': '🌿', 'Animaux': '🐾', 'Village': '🏘️', 'Personnages': '🧑', 'Transport': '🚂', 'Eau': '🌊', 'Terrain': '🗺️', 'Divers': '✦' };

// ─── Espèces d'arbres connues ─────────────────────────────────────────────────
const _TREE_SPECIES_MAP = {
  'bouleau-':    'Bouleau',      // préfixe → bouleau-1, bouleau-2
  buisson:       'Buisson',
  peuplier:      'Peuplier',
  'sapin-':      'Sapin',        // préfixe → sapin-1…8
  'gros-arbre-': 'Gros arbre',   // préfixe → gros-arbre-1…3
};
const _TREE_SPECIES_KEYS = Object.keys(_TREE_SPECIES_MAP);

// ─── Personnages — labels par variante (clé PROP_MODEL_DEFS sans le préfixe "character-") ────
// characterOverlay.js nomme chaque clone "village-character-glb-<variante>" ou
// "forest-character-glb-<variante>" — permet une ventilation complète (cf. HUD FPS, 2026-07-04).
const _CHARACTER_LABELS = {
  'femme-1':    'Femme 1',
  'femme-2':    'Femme 2',
  'femme-3':    'Femme 3',
  'femme-4':    'Femme 4',
  'femme-5':    'Femme 5',
  'homme-1':    'Homme 1',
  'homme-2':    'Homme 2',
  'homme-3':    'Homme 3',
  'fermier':    'Fermier',
  'forgeron':   'Forgeron',
  'marchand':   'Marchand',
  'tavernier':  'Tavernier',
  'garde':      'Garde',
  'soldat':     'Soldat',
  'chevalier':  'Chevalier',
  'archer':     'Archer',
  'guerrier-1': 'Guerrier 1',
  'guerrier-2': 'Guerrier 2',
  'guerrier-3': 'Guerrier 3',
  'magicien':   'Magicien',
  'monk':       'Moine',
  'sorciere':   'Sorcière',
};

// Clés du même _CHARACTER_LABELS, réutilisées pour reconnaître les InstancedMesh de
// personnages (2026-07-06, instancing characterOverlay.js — nom "instanced-character-
// <bareKey>-<chunkKey>"). Aucune clé n'est préfixe d'une autre (femme-1..5, guerrier-1..3,
// etc.) : un simple startsWith(bareKey + '-') après le préfixe suffit, sans ambiguïté.
const _CHARACTER_BARE_KEYS = Object.keys(_CHARACTER_LABELS);

function _classifyCharacter(name) {
  if (!name) return null;
  if (name.startsWith('village-character-glb-')) {
    return _CHARACTER_LABELS[name.slice('village-character-glb-'.length)] ?? 'Villageois';
  }
  if (name.startsWith('forest-character-glb-')) {
    return _CHARACTER_LABELS[name.slice('forest-character-glb-'.length)] ?? 'Rôdeurs forêt';
  }
  if (name.startsWith('field-farmer-character-glb-')) return 'Fermier';
  return null;
}

// ─── GLB individuels — premier match gagne ────────────────────────────────────
const _GLB_LABELS = [
  ['village-house-glb',                          'Maisons'], // regroupe toutes les variantes (petite/moyenne — 2026-07-04)
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
  ['water-shore-inert-boat-glb-shore-boat-3', 'Barque 3'],
  ['animated-water-boat-glb',                 'Bateaux'],
  ['water-shore-inert-boat-glb',              'Barques'],
  ['village-stone-road-glb-network',          'Routes'],
  ['village-stone-road-route',                'Routes'],
  ['procedural-rail',                         'Voies ferrées'],
  ['village-cart-glb',                        'Charrettes'],
  ['village-barrel-glb',                      'Tonneaux'],
  ['field-zone-mill-glb',                     'Moulins'],
  ['field-birds-glb-animated-flock',          'Corbeaux'],
  ['water-seagull-glb-instance',              'Mouettes'],
  ['animal-sheep-glb',                        'Moutons'],
  ['bench',                                   'Bancs'],
  ['signpost',                                'Panneaux'],
  ['fountain',                                'Fontaines'],
  ['ambient-glb',                             'Props ambiants'],
  ['bonus-cell-chest-',                       'Coffres bonus'],
];

// ─── Helpers internes ─────────────────────────────────────────────────────────

function _classifyInstanced(obj) {
  const n = obj.name ?? '';
  // VFX météo (weatherVfxOverlay.js / rainCloudOverlay.js) — VFXParticles.getMesh() et
  // l'InstancedMesh des puffs/gouttes/impacts sont tous des InstancedMesh.
  if (n === 'hexistenz-vfx-fireflies')            return 'Lucioles';
  if (n === 'hexistenz-vfx-rain')                 return 'Pluie';
  if (n === 'hexistenz-vfx-rain-impact')          return 'Pluie';
  if (n.startsWith('hexistenz-vfx-rain-clouds'))  return 'Nuages de pluie';
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
  if (n.startsWith('instanced-prop-berry-'))         return 'Plantes à baies';
  if (n.startsWith('instanced-prop-brindille'))      return 'Brindilles';
  if (n.startsWith('instanced-prop-shrub'))          return 'Arbustes';
  if (n.startsWith('instanced-house-'))              return 'Maisons'; // 2026-07-05 : maisons instancées (houseOverlay.js)
  if (n.startsWith('instanced-character-')) {
    // 2026-07-06 : personnages instanciés (characterOverlay.js) — nom
    // "instanced-character-<bareKey>-<chunkKey>". bareKey peut contenir des tirets
    // (femme-1, guerrier-2…) donc on cherche le préfixe exact parmi les clés connues
    // plutôt que de couper au premier '-'.
    const rest = n.slice('instanced-character-'.length);
    const bareKey = _CHARACTER_BARE_KEYS.find(k => rest === k || rest.startsWith(k + '-'));
    if (bareKey) return _CHARACTER_LABELS[bareKey];
  }
  if (n.startsWith('hex-grid-fill'))                 return 'Grille';
  if (n.includes('wheat') || n.includes('blade'))    return 'Blé';
  if (n.includes('wood-sleeper'))                    return 'Traverses';
  const cat = obj.userData?.lodCategory;
  if (cat === 'micro')  return 'Autres props inconnues';
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
  const base = geometry.index ? geometry.index.count / 3 : Math.floor((geometry.attributes?.position?.count ?? 0) / 3);
  // InstancedBufferGeometry (herbe, blé — cf. grassBladeOverlay.js/fieldWheatOverlay.js) :
  // un seul Mesh dessine geometry.instanceCount répétitions de cette géométrie de base en
  // 1 draw call. Sans ce facteur, le HUD ne comptait QUE la géométrie de base (une poignée
  // de triangles) au lieu des dizaines de milliers réellement rendus par secteur — la
  // quasi-totalité du coût de l'herbe/blé restait invisible (2026-07-04).
  const instances = geometry.isInstancedBufferGeometry ? (geometry.instanceCount ?? 1) : 1;
  return base * instances;
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
  if (name.startsWith('grass-'))                                 return "Brins d'herbe";
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

  const glbLabel = _classifyCharacter(obj.name) ?? _classifyGlb(obj.name);
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
