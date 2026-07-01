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
// VERSION
// ----------------------------------------------------------------------------
export const HEXISTENZ_VERSION = 'v0.9.1.2.3';

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
  forest: 0x3A8A40,  // éclairci : #1F5A2B trop sombre → quasi-noir sous ACESFilmicToneMapping
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
  railThickness: 0.075, // légèrement au-dessus de l'eau (0.06)

  // Surface du biome rail = railThickness (fond à y=0, dessus à +0.075).
  // railY = surface de la voie ferrée réelle, 5.2 cm au-dessus de la surface de tuile.
  railSurfaceY: 0.075,
  railY: 0.127, // 0.075 + 0.052 (offset rail au-dessus de la tuile, inchangé)

  outlineY: 0.036,
  labelY: 0.58,
  valueLabelHoverLift: 0.07,
  outlineColor: 0x151A21,
  outlineOpacity: 0.75
};

// ----------------------------------------------------------------------------
// RENDU EAU — nappe continue par zone (waterSurfaceOverlay.js)
// ----------------------------------------------------------------------------
// L'eau n'est plus un prisme par tuile : une nappe transparente unique par zone
// flotte au-dessus d'un riverbed opaque, jupe seulement sur le contour.
export const WATER_RENDER = {
  surfaceY:   0.06,    // = TILE_VISUAL.waterThickness — surface, alignée bateaux/plages/décor
  riverbedY: -0.04,    // fond opaque visible par transparence (profondeur 0.10)
  opacity:    0.80,    // alpha de base de la nappe (augmente vers les bas-fonds)

  // Palette inspirée du shader Danil (wldcW2) : blue (eau) → white (écume).
  deepColor:    0x018ec6,  // bleu eau (Danil "blue")
  shallowColor: 0x35c4ef,  // cyan clair en bas-fonds
  riverbedColor: 0x35586b, // fond bleu-vert sableux (vu par transparence — P3)
  foamColor:    0xd1eef5,  // écume (Danil "white")
  skyColor:     0xbfe6ff,  // teinte ciel des faux reflets (Fresnel)

  // Écume voronoï animée (portée de Danil) + dégradé de profondeur :
  foamWidth:    0.42,  // PORTÉE de la bande d'écume près de la rive (m)
  foamScale:    3.00,  // échelle de la texture d'écume (↑ = formes + fines)
  foamDensity:  0.52,  // seuil écume RIVE (texture Danil ~0.25–0.56, ↑ = plus d'écume)
  foamAmbient:  0.38,  // seuil écume SURFACE (partout, subtil), 0 = aucune
  foamSharp:    0.012, // netteté du bord (façon Danil ~0.005–0.015)
  foamSpeed:    1.00,  // vitesse d'animation de l'écume (×temps), 0 = figée
  deepDistance: 0.75,  // distance rive→large du dégradé (resserré — moins étendu)

  // Sillage du bateau (traînée en V) :
  wakeArmWidth:  0.060, // demi-largeur de chaque branche du V (m) — bord adouci dans le shader
  wakeSpread:    0.40,  // divergence du V (latéral ajouté par unité de recul)
  wakeLength:    1.15,  // longueur sur laquelle le sillage s'estompe (m) — anti-pop
  wakeScale:     4.5,   // échelle du motif d'écume du sillage
  wakeDensity:   0.50,  // couverture d'écume du sillage (seuil texture Danil)
  wakeOpacity:   0.90,  // opacité max (près du bateau)
};

// Épaisseur relative de chaque biome (ratio × tileThickness = épaisseur réelle).
// Utilisé par tileRailOverlay pour positionner les rails à la bonne hauteur de surface.
// Sync avec getSectorDepth() dans tileMesh.js.
export const THIN_BIOME_DEPTH_RATIO = {
  house:  0.708, // 0.708 × 0.12 ≈ 0.085
  forest: 0.733, // 0.733 × 0.12 ≈ 0.088
  grass:  0.683, // 0.683 × 0.12 ≈ 0.082
};

// Variation du dessus des biomes pour éviter les glitchs aux jonctions.
// Le dessous reste collé à la grille : c'est la règle sacrée, gravée au burin.
export const BIOME_HEIGHT_RATIO = {
  field: 0.0462, // légèrement surélevé (sync avec tileMesh.js)
};

// Relief désactivé : tuiles plates depuis la refonte épaisseur uniforme.
export const TERRAIN_RELIEF = {
  enabled: false,
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
export const PUFFS_PER_COLUMN = 11; // −39 % (était 18)

// ----------------------------------------------------------------------------
// FORÊTS / ARBRES GLB
// ----------------------------------------------------------------------------
export const TREE_MODEL_DEFS = [
  { key: 'bouleau-1',    url: './glb/arbres/bouleau-1.glb',    baseScale: 0.191 },               // −15%
  { key: 'bouleau-2',    url: './glb/arbres/bouleau-2.glb',    baseScale: 0.259, spawnWeight: 18 }, // +15%
  { key: 'buisson',      url: './glb/arbres/buisson.glb',      baseScale: 0.225 },
  // oak_round + dead retirés du pool (trop lourds : ~10k tris chacun)
  { key: 'sapin-6',      url: './glb/arbres/sapin-6.glb',      baseScale: 0.250 },
  { key: 'peuplier',     url: './glb/arbres/peuplier.glb',     baseScale: 0.250 },
  { key: 'sapin-5',      url: './glb/arbres/sapin-5.glb',      baseScale: 0.250 },
  { key: 'gros-arbre-2', url: './glb/arbres/gros-arbre-2.glb', baseScale: 0.195 },               // −22%
  { key: 'sapin-1',      url: './glb/arbres/sapin-1.glb',      baseScale: 0.225 },               // −10%
  { key: 'sapin-2',      url: './glb/arbres/sapin-2.glb',      baseScale: 0.225 },               // −10%
  { key: 'sapin-3',      url: './glb/arbres/sapin-3.glb',      baseScale: 0.225 },               // −10%
  { key: 'sapin-4',      url: './glb/arbres/sapin-4.glb',      baseScale: 0.250 },
  { key: 'gros-arbre-1', url: './glb/arbres/gros-arbre-1.glb', baseScale: 0.250 },
  { key: 'gros-arbre-3', url: './glb/arbres/gros-arbre-3.glb', baseScale: 0.250 },
  { key: 'sapin-7',      url: './glb/arbres/sapin-7.glb',      baseScale: 0.250 },
  { key: 'sapin-8',      url: './glb/arbres/sapin-8.glb',      baseScale: 0.250 },
  { key: 'sapin-9',      url: './glb/arbres/sapin-9.glb',      baseScale: 0.290, spawnWeight: 18 }, // +16%
  { key: 'sapin-10',     url: './glb/arbres/sapin-10.glb',     baseScale: 0.250 },
  { key: 'sapin-11',     url: './glb/arbres/sapin-11.glb',     baseScale: 0.250 },
];
export const TREE_SIZE_MULTIPLIER = 1.65 * 0.88 * 0.94 * 0.93 * 0.94 * 0.96 * 1.08 * 0.92 * 0.94 * 0.94 * 1.09; // −12% −6% −7% −6% −4% +8% −8% −6% −6% +9%
// Alignement sol réel des forêts : les dalles forest sont abaissées de 30% d'épaisseur (0.12 * -0.30 = -0.036).
// Léger enfouissement pour éviter tout flottement visible sur le relief.
export const TREE_GROUND_OFFSET = -0.005; // +10 mm (était -0.015)
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
export const BOAT_MODEL_URL = './glb/decor/bateau.glb';
export const BOAT_TARGET_LENGTH = 0.735 * 0.88 * 0.92 * 0.80; // −12% −8% −20%
export const BOAT_Y_OFFSET = -0.018;
export const WATER_PORT_INSET = 0.52;

// export const SHARK_FIN_WIDTH = 0.058;
// export const SHARK_FIN_HEIGHT = 0.185;
// export const SHARK_FIN_LENGTH = 0.36;

// Éclaboussures en bordure d'eau + épouvantails/corbeaux des champs.
export const WATER_EDGE_SPLASH_Y_OFFSET = 0.012;
export const FIELD_SURFACE_Y = 0.094; // surface dessus tuile field = 0.12 × 0.783 (sync decorOverlay.js)
export const FIELD_THICKNESS_RATIO = 0.298; // côtés du secteur field −15%
export const SCARECROW_MIN_FIELD_TOTAL = 5;
export const SCARECROW_SCALE = 0.62;

// Oiseaux GLB animés des champs.
// Le fichier contient déjà 5 oiseaux avec battement d'ailes ; le code ne fait
// que lancer l'AnimationMixer et déplacer tout le groupe sur une orbite.
export const FIELD_BIRD_FLOCK_MODEL_URL = './glb/animaux/birds.glb';
export const FIELD_BIRD_FLOCK_TARGET_WIDTH = 0.0312;
export const FIELD_BIRD_FLOCK_ANIMATION_SPEED = 1.0;

// ----------------------------------------------------------------------------
// TRAINS / GARES
// ----------------------------------------------------------------------------
export const TRAIN_Y_OFFSET = 0.025;
export const TRAIN_SPEED = 0.18;
export const TRAIN_CURVE_SLOW_DISTANCE = 0.42;
export const TRAIN_TERMINUS_SLOW_DISTANCE = 0.72;
export const TRAIN_SCALE = 0.1454; // −5% (était 0.153)
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
export const LOD_MICRO_CULL_DISTANCE = 6.6;           // −8 % (était 7.2) — fleurs, champignons

// Distance caméra au-delà de laquelle les plantes/plantes.glb (plant-*, shrub-*, reed) sont masquées.
export const LOD_PLANT_CULL_DISTANCE = 4.8;           // −15 % (était 5.6)

// Les arbres utilisent uniquement le frustum culling (pas de distance cutoff).
// Constante réservée pour extension future (cartes très grandes).
export const LOD_TREE_CULL_DISTANCE = 12.2;           // −8 % (était 13.3)

// Distance caméra–centre-chunk au-delà de laquelle les rochers sont masqués.
export const LOD_ROCK_CULL_DISTANCE = 7.2;            // −8 % (était 7.8)

// Distance 3D au-delà de laquelle les bateaux animés sont masqués.
// Distance 3D complète (Y inclus) : correcte en vue top-down où la caméra est haute.
// Valeur augmentée vs XZ-only pour conserver une portée similaire en jeu normal (caméra Y ~8-12).
export const LOD_BOAT_CULL_DISTANCE = 10.3;           // −8 % (était 11.2)

// Distance 3D au-delà de laquelle les barques échouées (shore-inert-boat) sont masquées.
export const LOD_SHORE_BOAT_CULL_DISTANCE = 9.2;      // −8 % (était 10.0)

// Distance caméra au-delà de laquelle les trains et gares sont masqués.
export const LOD_TRAIN_CULL_DISTANCE = 9.9;           // −8 % (était 10.8)

// Distance caméra au-delà de laquelle les bâtiments de village sont masqués.
export const LOD_HOUSE_CULL_DISTANCE = 12.7;          // −8 % (était 13.8)

// Distance caméra au-delà de laquelle les watchtowers sont masquées (LOD plus sévère que les maisons).
export const LOD_WATCHTOWER_CULL_DISTANCE = 13.2;     // −8 % (était 14.3)

// Distance caméra au-delà de laquelle les rails (traverses, ballast) sont masqués.
export const LOD_RAIL_TRACK_CULL_DISTANCE = 14.4;     // −8 % (était 15.7)

// Distance caméra au-delà de laquelle les réseaux de routes pavées (stone-road-glb)
// sont masqués. Légèrement inférieure aux voies ferrées (objets plus fins, moins lisibles).
export const LOD_PAVED_ROAD_CULL_DISTANCE = 9.1;      // −8 % (était 9.9)

// Distance caméra au-delà de laquelle les décorations de bord de route
// (bancs) sont masquées.
export const LOD_ROAD_DECOR_CULL_DISTANCE = 8.3;      // −8 % (était 9.0)

// Distance caméra au-delà de laquelle les corbeaux animés sont masqués.
export const LOD_CROW_CULL_DISTANCE = 9.7;            // −8 % (était 10.5)

// Distance caméra au-delà de laquelle les moulins (moulin-1/2) sont masqués.
export const LOD_MILL_CULL_DISTANCE = 12.6;           // −8 % (était 13.7)

// Distance caméra au-delà de laquelle les panneaux indicateurs sont masqués.
// LOD sévère (petits objets, peu lisibles de loin).
export const LOD_SIGN_CULL_DISTANCE = 7.9;            // −8 % (était 8.6)

// Distance caméra au-delà de laquelle les tonneaux et charrettes de village sont masqués.
export const LOD_VILLAGE_PROP_CULL_DISTANCE = 8.6;    // −8 % (était 9.4)

// Distance caméra au-delà de laquelle les animaux (village + sauvages) sont masqués.
// Catégorie dédiée, séparée des charrettes/tonneaux pour un contrôle indépendant.
export const LOD_ANIMAL_CULL_DISTANCE = 9.6;          // −8 % (était 10.4)

// Distance caméra au-delà de laquelle les fontaines de village sont masquées.
export const LOD_FOUNTAIN_CULL_DISTANCE = 9.8;        // −8 % (était 10.7)

// ----------------------------------------------------------------------------
// HITBOX — Registre spatial des objets GLB volumineux (stable/propHitboxRegistry.js)
// ----------------------------------------------------------------------------
// Nombre maximum d'itérations de répulsion pour tryResolve().
export const HITBOX_RESOLVE_MAX_ITER = 6;

// Rayons de hitbox par catégorie d'objet (en unités world, HEX_SIZE = 1).
// Objets durs (enregistrés en premier) : arbres, rochers, bâtiments.
// Objets mous (utilisent tryResolve) : tonneaux, charrettes, panneaux.
export const HITBOX_R = {
  treeTrunk:  HEX_SIZE * 0.09 * 0.88 * 0.96,               // −12% −4%
  rockLarge:  HEX_SIZE * 0.10 * 0.85 * 0.85 * 0.96,        // −15% −15% −4%
  house:      HEX_SIZE * 0.198 * 0.93 * 0.90 * 0.96,        // −10% −7% −10% −4%
  watchtower: HEX_SIZE * 0.18 * 1.10 * 1.10,               // +10% +10%
  barrel:     HEX_SIZE * 0.065 * 0.93 * 0.90,               // −7% −10%
  cart:       HEX_SIZE * 0.17 * 0.85 * 0.94,                // −15% −6%
  signpost:   HEX_SIZE * 0.06 * 0.85 * 0.75,               // −15% −25%
  fountain:   HEX_SIZE * 0.13,
};

// ----------------------------------------------------------------------------
// VENT DES ARBRES (InstancedMesh GPU)
// ----------------------------------------------------------------------------
// Tous les paramètres de vent des arbres sont ici pour éviter les valeurs magiques
// dans forestOverlay.js. heightEnd ≈ 0.37 = baseScale * TREE_SIZE_MULTIPLIER
// (hauteur max des géométries cuites en world-units après applyMatrix4).
export const TREE_WIND = {
  strength: 0.034, // −30% −20% (était 0.062)
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
export const WHEAT_BLADE_COUNT    = 2321;   // +9% (était 2129)
export const WHEAT_BLADE_WIDTH    = 0.00187; // demi-largeur du brin (HEX_SIZE=1) — −65% −25% +60% −10% −63% −22%
export const WHEAT_BLADE_SEGMENTS = 4;      // segments verticaux (qualité du bend)
export const WHEAT_INNER_RATIO    = 0.20;   // bord intérieur du trapèze (0=centre, 1=bord)
export const WHEAT_HEIGHT_MIN     = 0.505;  // hauteur min (scale local brin) — +20% (était 0.421)
export const WHEAT_HEIGHT_MAX     = 0.977;  // hauteur max (scale local brin) — +20% (était 0.814)
export const WHEAT_WIDTH_MIN      = 0.204;  // largeur min (scale local brin) — −22 % (était 0.261)
export const WHEAT_WIDTH_MAX      = 0.441;  // largeur max (scale local brin) — −22 % (était 0.566)
export const WHEAT_GLOBAL_HEIGHT  = 0.0630; // scale global Y — +20% (était 0.0525)
export const WHEAT_WIND_STRENGTH  = 0.0255; // amplitude balancement (0=immobile, 0.32=fort) — −15%
export const WHEAT_WIND_SPEED     = 1.65;   // vitesse animation (multiplicateur temps)
export const WHEAT_BOTTOM_COLOR   = 0x8f7a20; // couleur base de tige
export const WHEAT_TOP_COLOR      = 0xB8821E; // couleur haut de tige (ambré chaud)
export const WHEAT_EAR_COLOR      = 0xCE9C28; // couleur épi (or ambré)
export const LOD_WHEAT_CULL_DISTANCE = 5.6;  // −15 % (était 6.6)

// ── Prairie (Bezier Grass) — inspiré du shader ShaderToy lslGR8 ──────────────
// Spine Bezier cubique + vent value-noise (Dave Hoskins), 2 strips croisés.
export const GRASS_BLADE_COUNT    = 1280;   // brins par secteur prairie — +17 % (était 1094)
export const GRASS_BLADE_WIDTH    = 0.001766;// demi-largeur brin (HEX_SIZE=1) — −16 % (était 0.002102)
export const GRASS_BLADE_SEGMENTS = 3;       // segments vertx (ShaderToy BLADE_SEGMENTS default)
export const GRASS_INNER_RATIO    = 0.15;    // bord intérieur trapèze (plus proche du centre que blé)
export const GRASS_HEIGHT_MIN     = 0.319;   // scale hauteur min — −25 % (était 0.425)
export const GRASS_HEIGHT_MAX     = 0.574;   // scale hauteur max — −25 % (était 0.765)
export const GRASS_WIDTH_MIN      = 0.365;   // scale largeur min — −35 % (était 0.561)
export const GRASS_WIDTH_MAX      = 0.763;   // scale largeur max — −35 % (était 1.173)
export const GRASS_GLOBAL_HEIGHT  = 0.02716; // scale global Y — −16 % (était 0.03233)
export const GRASS_TILT_MIN       = 0.25;   // BLADE_TILT min (penchement avant)
export const GRASS_TILT_MAX       = 0.42;   // BLADE_TILT max
export const GRASS_BEND_MIN       = 0.12;   // BLADE_BEND min (courbure)
export const GRASS_BEND_MAX       = 0.22;   // BLADE_BEND max
export const GRASS_WIND_STRENGTH  = 1.50;   // amplitude vent — proportionnel ShaderToy
export const GRASS_WIND_SPEED     = 0.5625; // vitesse vent +25 % (était 0.45)
export const GRASS_WIND_SWAY      = 0.08;   // balancement sinus (ShaderToy WIND_SWAY = 0.08)
export const GRASS_BOTTOM_COLOR   = 0x3a6a18; // vert sombre base de tige
export const GRASS_MID_COLOR      = 0x5a8a28; // vert moyen milieu de tige
export const GRASS_TIP_COLOR      = 0x8abc38; // vert clair / jaune pointe
export const LOD_GRASS_CULL_DISTANCE = 6.4;   // −15 % (était 7.5)

// Distance caméra au-delà de laquelle les labels de zones contigüe sont masqués.
export const LOD_ZONE_LABEL_CULL_DISTANCE = 28.2;     // −8 % (était 30.6)

// Valeur totale minimale pour afficher le label d'une zone contigüe.
// Les zones en-dessous de ce seuil sont trop petites pour avoir un intérêt stratégique.
export const LOD_ZONE_LABEL_MIN_TOTAL = 6;

// Fade progressif des labels quand la caméra descend vers le sol (altitude Y caméra).
// Entre NEAR_FADE_START_Y et NEAR_FADE_END_Y, l'opacité passe de 1 → 0.
export const LOD_ZONE_LABEL_NEAR_FADE_START =  7.5; // altitude Y début du fondu (÷2)
export const LOD_ZONE_LABEL_NEAR_FADE_END   =  2.5; // altitude Y complètement transparent (÷2)

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
  bigRockThreshold:  0.92,  // ~8 % de gros rochers (exceptionnels)
  bigRockScaleMin:   1.10,
  bigRockScaleRange: 0.78,  // → [1.10, 1.88]  (max +12 %)
  normalScaleMin:    0.55,
  normalScaleRange:  0.40   // → [0.55, 0.95]  (petits plus petits, médiane ≈ 0.75)
};

// ----------------------------------------------------------------------------
// SCORE — ÉVÉNEMENTS SPÉCIAUX
// ----------------------------------------------------------------------------
export const COMET_HIT_SCORE = 75;
