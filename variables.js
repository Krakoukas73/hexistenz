// ============================================================================
// VARIABLES GLOBALES DU JEU
// ============================================================================
// Fichier volontairement très commenté : c'est le tableau de bord du jeu.
// Objectif : modifier ici les valeurs d'équilibrage et de rendu sans fouiller
// dans 25 fichiers JavaScript comme un archéologue bourré dans une décharge.
//
// Règle d'or : modifier les nombres, couleurs, tableaux et textes simples ici.
// Ne pas renommer les clés des objets sauf si tu sais exactement quels fichiers
// les utilisent. Les clés font partie du contrat interne du jeu.
// ============================================================================

// ----------------------------------------------------------------------------
// GRILLE / DECK
// ----------------------------------------------------------------------------
// Taille logique d'un hexagone dans la scène Three.js. Toucher à ça redimensionne
// presque tout le monde 3D.
export const HEX_SIZE = 1;

// Rayon de la carte hexagonale. 10 donne une grande grille jouable.
export const GRID_RADIUS = 6;

// Nombre de tuiles dans le deck initial.
export const DECK_SIZE = 50;

// Ordre canonique des 6 côtés d'une tuile. Ne pas modifier sans refaire les
// rotations, voisins et règles de placement. Bref : mains sales interdites.
export const EDGE_ORDER = ['n', 'ne', 'se', 's', 'sw', 'nw'];

// Définition géométrique des 6 secteurs triangulaires d'une tuile.
// a/b sont les index des sommets du contour hexagonal.
export const SECTOR_DEFS = [
  { key: 'n', a: 0, b: 1 },
  { key: 'ne', a: 1, b: 2 },
  { key: 'se', a: 2, b: 3 },
  { key: 's', a: 3, b: 4 },
  { key: 'sw', a: 4, b: 5 },
  { key: 'nw', a: 5, b: 0 }
];

// ----------------------------------------------------------------------------
// TYPES DE TEXTURES / BIOMES
// ----------------------------------------------------------------------------
export const EDGE_TYPES = {
  field: 'field',   // champ de blé
  forest: 'forest', // forêt
  water: 'water',   // eau / rivière
  rail: 'rail',     // voie ferrée
  house: 'house',   // maisons / village
  grass: 'grass'    // prairie
};

// Poids de génération aléatoire des textures.
// Plus le nombre est élevé, plus le biome apparaît souvent.
export const EDGE_WEIGHTS = {
  field: 30,
  forest: 30,
  grass: 24,
  house: 18,
  water: 6,
  rail: 4
};

// Types qui doivent former des réseaux continus.
export const NETWORK_EDGE_TYPES = [EDGE_TYPES.water, EDGE_TYPES.rail];

// Couleurs principales des biomes et overlays. Format hexadécimal Three.js.
export const EDGE_COLOR = {
  field: 0xE5C65A,
  forest: 0x1F5A2B,
  water: 0x5FA8D3,
  rail: 0xDDDDDD,
  house: 0x8B8069,
  grass: 0x78A84A
};

// ----------------------------------------------------------------------------
// VISUEL DES TUILES
// ----------------------------------------------------------------------------
export const TILE_VISUAL = {
  radiusScale: 1,
  centerRadiusScale: 0.33,
  sectorY: 0,
  centerY: 0,

  // L'eau est plus basse : effet lit de rivière sans casser l'alignement grille.
  waterY: -0.075,

  // Épaisseurs générales. Les biomes peuvent être affinés plus bas.
  tileThickness: 0.12,
  waterThickness: 0.06,
  railThickness: 0.06,

  // Rails posés sur un lit plus bas, puis overlays ajustés par railY.
  railSurfaceY: -0.095,
  railY: -0.043,

  outlineY: 0.036,
  labelY: 0.58,
  valueLabelHoverLift: 0.07,
  outlineColor: 0x151A21,
  outlineOpacity: 0.75
};

// Réduction d'épaisseur locale des biomes. 0.70 = 30% plus fin.
export const THIN_BIOME_DEPTH_RATIO = {
  house: 0.70,
  forest: 0.70
};

// Variation du dessus des biomes pour éviter les glitchs aux jonctions.
// Le dessous reste collé à la grille : c'est la règle sacrée, gravée au burin.
export const BIOME_HEIGHT_RATIO = {
  field: 0.0525, // −65% (sync avec tileMesh.js)
  grass: -0.45
};

// Relief appliqué aux tuiles pour casser l'aspect plat.
export const TERRAIN_RELIEF = {
  enabled: true,
  baseAmplitude: 0.064,
  typeAmplitude: {
    grass: 0.085,
    forest: 0.083,
    field: 0.075,
    house: 0.039,
    rail: 0.043,
    water: 0.017
  },
  edgeFadeStart: 0.30
};

// Morcelage des bords des tuiles. Valeurs plus hautes = bords plus grignotés.
export const RAGGED_EDGE = {
  segments: 11,
  amplitude: 0.135,
  innerSegments: 8,
  innerAmplitude: 0.075,
  lift: 0
};

// ----------------------------------------------------------------------------
// GÉNÉRATION DES TUILES
// ----------------------------------------------------------------------------
export const MIXED_NETWORK_TILE_CHANCE = 0.04;
export const NETWORK_TERMINUS_CHANCE = 0.20;
export const WATER_TERMINUS_CHANCE = 0.65;

// Cible de distribution des tuiles avec 1, 2, 3... côtés eau.
export const WATER_TARGET_COUNTS = { 1: 60, 2: 38, 3: 30, 4: 16, 5: 5, 6: 2 };

// ----------------------------------------------------------------------------
// SCORE / BONUS / MISSIONS
// ----------------------------------------------------------------------------
export const SCORE_VALUES = {
  tilePlacement: 2,
  matchingEdge: 10,
  networkMatchingEdge: 25,
  surroundedTileBonus: 50
};

export const BONUS_TILE_RULES = [
  { matchingEdges: 3, tiles: 2 },
  { matchingEdges: 2, tiles: 1 }
];

export const MISSION_REWARD = 100;
export const MISSION_TILE_REWARD = 3;
export const MISSION_CHANCE = 0.20;
export const COMPLETED_MISSION_VISIBLE_TURNS = 5;

// ----------------------------------------------------------------------------
// CELLULES SPÉCIALES : TROUS NOIRS / BONUS
// ----------------------------------------------------------------------------
export const SPECIAL_CELL_MIN = 1;
export const SPECIAL_CELL_MAX = 5;
export const SPECIAL_CELL_CLUSTER_TARGET_MIN = 4;
export const SPECIAL_CELL_CLUSTER_TARGET_MAX = 6;

export const BONUS_CELL_MIN = 1;
export const BONUS_CELL_MAX = 4;
export const BONUS_CELL_SCORE = 1500;

// ----------------------------------------------------------------------------
// CAMÉRA / CONTRÔLES
// ----------------------------------------------------------------------------
export const DEFAULT_CAMERA = {
  radius: 15,
  theta: Math.PI / 4,
  phi: Math.PI / 3
};
export const MIN_POLAR_ANGLE = 0.000001;
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;
export const CLICK_DRAG_CANCEL_DISTANCE = 6;

// ----------------------------------------------------------------------------
// MAISONS / ÉGLISES / FUMÉE / CIMETIÈRES
// ----------------------------------------------------------------------------
export const HOUSE_SCALE_FACTOR = 0.1332; // −10 %
export const HOUSE_BASE_Y_OFFSET = 0.002;
export const HOUSE_CHIMNEY_TOP_SCALE = 1.62;
export const HOUSE_SMOKE_Y_SCALE = 0.08;
export const PUFFS_PER_COLUMN = 18;

export const CHURCH_MIN_HOUSES = 8;
export const CHURCH_HOUSES_PER_EXTRA = 18;
export const CHURCH_MAX_PER_ZONE = 4;
export const CEMETERY_MIN_HOUSES = 13;
export const CEMETERY_HOUSES_PER_EXTRA = 24;
export const CEMETERY_MAX_PER_ZONE = 3;

// ----------------------------------------------------------------------------
// FORÊTS / ARBRES GLB
// ----------------------------------------------------------------------------
export const TREE_MODEL_DEFS = [
  { key: 'birch', url: './glb/arbres/tree_birch.glb', baseScale: 0.225 },
  { key: 'bushy_mini', url: './glb/arbres/tree_bushy_mini.glb', baseScale: 0.225 },
  { key: 'oak_round', url: './glb/arbres/tree_oak_round.glb', baseScale: 0.225 },
  { key: 'pine_soft', url: './glb/arbres/tree_pine_soft.glb', baseScale: 0.250 },
  { key: 'dead', url: './glb/arbres/tree_dead.glb', baseScale: 0.190 },
  { key: 'poplar', url: './glb/arbres/tree_poplar.glb', baseScale: 0.250 }
];
export const TREE_SIZE_MULTIPLIER = 1.65;
// Alignement sol réel des forêts : les dalles forest sont abaissées de 30% d'épaisseur (0.12 * -0.30 = -0.036).
// Léger enfouissement pour éviter tout flottement visible sur le relief.
export const TREE_GROUND_OFFSET = -0.010;
export const TREE_CENTER_SAFE_RADIUS_EXTRA = 0.08;
export const MIN_TREE_DISTANCE = 0.115;
export const MAX_TREE_PLACEMENT_ATTEMPTS = 36;

// ----------------------------------------------------------------------------
// EAU / BATEAUX / REQUINS / CRÉATURES
// ----------------------------------------------------------------------------
export const WATER_CREATURE_Y = 0.15;
export const MIN_WATER_ZONE_SECTORS = 2;
export const BOATS_PER_WATER_COMPONENT = 1;
export const BOAT_SPEED = 0.13;
export const BOAT_HEADING_OFFSET = Math.PI;
export const BOAT_MODEL_URL = './glb/bateau.glb';
export const BOAT_TARGET_LENGTH = 0.735;
export const BOAT_Y_OFFSET = -0.018;
export const WATER_PORT_INSET = 0.52;

// export const SHARK_FIN_WIDTH = 0.058;
// export const SHARK_FIN_HEIGHT = 0.185;
// export const SHARK_FIN_LENGTH = 0.36;

// Éclaboussures en bordure d'eau + épouvantails/corbeaux des champs.
export const WATER_EDGE_SPLASH_Y_OFFSET = 0.012;
export const FIELD_SURFACE_Y = 0.070;
export const FIELD_THICKNESS_RATIO = 0.298; // côtés du secteur field −15%
export const SCARECROW_MIN_FIELD_TOTAL = 5;
export const SCARECROW_SCALE = 0.62;

// Oiseaux GLB animés des champs.
// Le fichier contient déjà 5 oiseaux avec battement d'ailes ; le code ne fait
// que lancer l'AnimationMixer et déplacer tout le groupe sur une orbite.
export const FIELD_BIRD_FLOCK_MODEL_URL = './glb/birds.glb';
export const FIELD_BIRD_FLOCK_TARGET_WIDTH = 0.0312;
export const FIELD_BIRD_FLOCK_ANIMATION_SPEED = 1.0;

// ----------------------------------------------------------------------------
// TRAINS / GARES
// ----------------------------------------------------------------------------
export const TRAIN_Y_OFFSET = 0.025;
export const TRAIN_SPEED = 0.18;
export const TRAIN_CURVE_SLOW_DISTANCE = 0.42;
export const TRAIN_TERMINUS_SLOW_DISTANCE = 0.72;
export const TRAIN_SCALE = 0.153;
export const TRAIN_UNIT_SPACING = 0.30;
export const TRAIN_MIN_WAGONS = 2;
export const TRAIN_MAX_WAGONS = 8;
export const RAIL_PORT_INSET = 0.18;
export const STATION_Y_OFFSET = 0.012;
export const STATION_SCALE = 0.22;
export const STATION_TRACK_CLEARANCE = 0.25;
export const STATION_TERMINUS_BACKSET = 0.08;

// ----------------------------------------------------------------------------
// LABELS / HALOS / SURVOL DES ZONES
// ----------------------------------------------------------------------------
export const ZONE_HALO_Y = 0.115;
export const ZONE_HOVER_HALO_Y = 0.30;
export const ZONE_LABEL_Y = 0.72;
export const ZONE_HOVER_HALO_RADIUS = 0.056;
export const ZONE_HOVER_GLOW_RADIUS = 0.16;
export const ZONE_HOVER_DIFFUSE_RADIUS = 0.24;
export const ZONE_HOVER_LABEL_SCALE = 1.85;
export const ZONE_HOVER_LABEL_Y_OFFSET = 0.285;

// ----------------------------------------------------------------------------
// HIGHSCORE / POSTPROCESS
// ----------------------------------------------------------------------------
export const HIGHSCORE_API_URL = 'highscore.php';
export const HIGHSCORE_DEFAULT_NAME = 'Joueur';
export const POSTPROCESS_STORAGE_KEY = 'dorfoPixelPostprocessSettings.v3';
export const POSTPROCESS_DEFAULTS = Object.freeze({
  enabled: true,
  pixelSize: 2,
  normalEdgeStrength: 0.20,
  depthEdgeStrength: 0.25
});

// Calques Three.js.
export const WORLD_LAYER = 0;
export const TEXT_LAYER = 1;

// ----------------------------------------------------------------------------
// LOD / FRUSTUM CULLING PAR CHUNKS
// ----------------------------------------------------------------------------
// Taille d'un chunk en coordonnées axiales (nombre de tuiles par dimension).
// 3 donne ~9 tuiles par chunk ; pour GRID_RADIUS=6 → ~16 chunks actifs.
export const HEX_CHUNK_SIZE = 3;

// Distance caméra–centre-chunk (world units) au-delà de laquelle les micro-objets
// (fleurs, roseaux, champignons) sont masqués, même s'ils sont dans le frustum.
// +23 % (était 13.0) : compense le rayon de chunk qui causait un culling prématuré.
export const LOD_MICRO_CULL_DISTANCE = 14.4;          // −10 % (était 16.0)

// Les arbres utilisent uniquement le frustum culling (pas de distance cutoff).
// Constante réservée pour extension future (cartes très grandes).
export const LOD_TREE_CULL_DISTANCE = 36.0;           // −10 % (était 40.0)

// Distance caméra–centre-chunk au-delà de laquelle les rochers sont masqués.
export const LOD_ROCK_CULL_DISTANCE = 23.4;           // −10 % (était 26.0)

// Distance XZ (horizontale) au-delà de laquelle les bateaux animés (pirates) sont masqués.
// Comparaison XZ uniquement dans updateWaterBoatLOD — seuil réduit pour effet plus marqué.
export const LOD_BOAT_CULL_DISTANCE = 13.5;           // −10 % (était 15.0)

// Distance 3D au-delà de laquelle les barques échouées (shore-inert-boat) sont masquées.
export const LOD_SHORE_BOAT_CULL_DISTANCE = 16.2;     // −10 % (était 18.0)

// Distance caméra au-delà de laquelle les trains et gares sont masqués.
export const LOD_TRAIN_CULL_DISTANCE = 34.2;          // −10 % (était 38.0)

// Distance caméra au-delà de laquelle les bâtiments de village sont masqués.
export const LOD_HOUSE_CULL_DISTANCE = 28.8;          // −10 % (était 32.0)

// Distance caméra au-delà de laquelle les rails (traverses, ballast) sont masqués.
export const LOD_RAIL_TRACK_CULL_DISTANCE = 27.0;     // −10 % (était 30.0)

// Distance caméra au-delà de laquelle les réseaux de routes pavées (stone-road-glb)
// sont masqués. Légèrement inférieure aux voies ferrées (objets plus fins, moins lisibles).
export const LOD_PAVED_ROAD_CULL_DISTANCE = 25.2;     // −10 % (était 28.0)

// Distance caméra au-delà de laquelle les décorations de bord de route
// (bancs, moulins, corbeaux) sont masquées.
export const LOD_ROAD_DECOR_CULL_DISTANCE = 27.0;     // −10 % (était 30.0)

// Distance caméra au-delà de laquelle les panneaux indicateurs sont masqués.
// LOD sévère (petits objets, peu lisibles de loin).
export const LOD_SIGN_CULL_DISTANCE = 15.3;           // −10 % (était 17.0)

// Distance caméra au-delà de laquelle les tonneaux et charrettes de village sont masqués.
export const LOD_VILLAGE_PROP_CULL_DISTANCE = 19.8;   // −10 % (était 22.0)

// ----------------------------------------------------------------------------
// HITBOX — Registre spatial des objets GLB volumineux (stable/propHitboxRegistry.js)
// ----------------------------------------------------------------------------
// Nombre maximum d'itérations de répulsion pour tryResolve().
export const HITBOX_RESOLVE_MAX_ITER = 6;

// Rayons de hitbox par catégorie d'objet (en unités world, HEX_SIZE = 1).
// Objets durs (enregistrés en premier) : arbres, rochers, bâtiments.
// Objets mous (utilisent tryResolve) : tonneaux, charrettes, bancs, panneaux.
export const HITBOX_R = {
  treeTrunk:  HEX_SIZE * 0.09,
  rockLarge:  HEX_SIZE * 0.10,
  house:      HEX_SIZE * 0.198, // −10 %
  church:     HEX_SIZE * 0.30,
  cemetery:   HEX_SIZE * 0.24,
  watchtower: HEX_SIZE * 0.18,
  barrel:     HEX_SIZE * 0.065,
  cart:       HEX_SIZE * 0.17,
  bench:      HEX_SIZE * 0.10,
  signpost:   HEX_SIZE * 0.06,
  fountain:   HEX_SIZE * 0.13,
};

// ----------------------------------------------------------------------------
// VENT DES ARBRES (InstancedMesh GPU)
// ----------------------------------------------------------------------------
// Tous les paramètres de vent des arbres sont ici pour éviter les valeurs magiques
// dans forestOverlay.js. heightEnd ≈ 0.37 = baseScale * TREE_SIZE_MULTIPLIER
// (hauteur max des géométries cuites en world-units après applyMatrix4).
export const TREE_WIND = {
  strength: 0.062,
  speed: 1.38,
  frequency: 0.78,
  turbulence: 0.30,
  heightStart: 0.020,
  heightEnd: 0.380,
  gustStrength: 0.26,
  detailStrength: 0.08
};

// ----------------------------------------------------------------------------
// CHAMPS DE BLÉ ANIMÉS (fieldWheatOverlay)
// ----------------------------------------------------------------------------
// Géométrie GPU-only (InstancedBufferGeometry + ShaderMaterial).
// Un seul ShaderMaterial partagé pour toute la grille, uTime = globalWind.
// Modifier librement ces valeurs pour ajuster le rendu.
export const WHEAT_BLADE_COUNT    = 240;    // brins par secteur field
export const WHEAT_BLADE_WIDTH    = 0.0065; // demi-largeur du brin (HEX_SIZE=1) — −65% −25% +60% −10%
export const WHEAT_BLADE_SEGMENTS = 4;      // segments verticaux (qualité du bend)
export const WHEAT_INNER_RATIO    = 0.20;   // bord intérieur du trapèze (0=centre, 1=bord)
export const WHEAT_HEIGHT_MIN     = 0.62;   // hauteur min (scale local brin)
export const WHEAT_HEIGHT_MAX     = 1.20;   // hauteur max (scale local brin)
export const WHEAT_WIDTH_MIN      = 0.75;   // largeur min (scale local brin)
export const WHEAT_WIDTH_MAX      = 1.40;   // largeur max (scale local brin)
export const WHEAT_GLOBAL_HEIGHT  = 0.0945; // scale global Y — −65% −25% +60% −10%
export const WHEAT_WIND_STRENGTH  = 0.115;  // amplitude balancement (0=immobile, 0.32=fort)
export const WHEAT_WIND_SPEED     = 1.10;   // vitesse animation (multiplicateur temps)
export const WHEAT_BOTTOM_COLOR   = 0x8f7a20; // couleur base de tige
export const WHEAT_TOP_COLOR      = 0xf1c84f; // couleur haut de tige
export const WHEAT_EAR_COLOR      = 0xffdf75; // couleur épi
export const LOD_WHEAT_CULL_DISTANCE = 16.0; // distance LOD masquage (world units)

// ----------------------------------------------------------------------------
// ROCHERS — DENSITÉ ET VARIÉTÉ
// ----------------------------------------------------------------------------
// Probabilités d'apparition et paramètres d'échelle pour les rochers naturels.
// bigRockThreshold : seuil hash au-dessus duquel un gros rocher apparaît (~15 %).
// bigRockScaleRange : intervalle ajouté au min → [bigRockScaleMin, bigRockScaleMin + range].
export const ROCK_DENSITY = {
  chanceNearWater:   0.93,  // +10 % (était 0.85)
  chanceGrass:       0.43,  // +10 % (était 0.39)
  chanceForest:      0.58,  // +10 % (était 0.53)
  footprint:         0.038, // réduit (était 0.055) : rochers plus serrés → monticules
  bigRockThreshold:  0.85,  // ~15 % de gros rochers
  bigRockScaleMin:   1.10,
  bigRockScaleRange: 0.30,  // → [1.10, 1.40]  (gros plus gros, sans excès)
  normalScaleMin:    0.55,
  normalScaleRange:  0.40   // → [0.55, 0.95]  (petits plus petits, médiane ≈ 0.75)
};

// ----------------------------------------------------------------------------
// SCORE — ÉVÉNEMENTS SPÉCIAUX
// ----------------------------------------------------------------------------
export const COMET_HIT_SCORE = 75;
