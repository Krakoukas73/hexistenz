# CONTEXT.md — Hexistenz

## 1. Nature du projet

**Version courante : `v0.9.2.5.7`** (source unique : `variables.js` → `HEXISTENZ_VERSION`).

Jeu web contemplatif de pose de tuiles hexagonales, inspiré de Dorfromantik / The Settlers / HoMM. Le joueur pioche une tuile, la tourne, la pose sur une grille hexagonale. Chaque tuile a 6 secteurs triangulaires (biomes ou réseaux). Objectif : connecter les biomes, compléter des missions, maximiser le score.

Stack : JavaScript ES Modules natifs, sans bundler. Three.js r160 (CDN). PHP pour highscores/multiplayer. JSON stockage. Pas de framework, pas de SQL.

**Le jeu est entièrement traduit en 6 langues : FR/EN/ES/IT/PT + `fr-CA`** (québécois, easter egg, sélecteur "QC") (prez `index.php`, jeu `game.php`, panneau EDA compris), via l'architecture i18n scalable `LANG_FILES`/`data-i18n` (cf. §21, entrées 2026-07-14/15/16). Sélecteur de langue accessible en jeu à tout moment, sans rechargement — contenu traduit dans `json/languages/*.json`.

### Arborescence web (racine)

| Fichier | Rôle |
|---|---|
| `index.php` | Page de présentation publique (landing page) — **point d'entrée** |
| `game.php` | Jeu complet (ex-`index.php`) |
| `css/presentation.css` | Styles isolés de la présentation (Space Mono + Bebas Neue) |
| `highscore.php` | API classement |
| `multiplayer.php` | API salles multijoueur |
| `variables.js` | Constantes globales + `HEXISTENZ_VERSION` |

---

## 2. Coordonnées hexagonales

Grille **axiale (q, r)** — `hex.js` :
- `axialToWorld(q, r)` → `{ x, y, z }` : `x = HEX_SIZE * 1.5 * q`, `z = HEX_SIZE * √3 * (r + q/2)`
- `worldToAxial(x, z)` → `{ q, r }` avec arrondi cube
- `makeHexKey(q, r)` → clé string `"q,r"` pour `placedTiles` (Map)

Voisins hexagonaux — distance centre à centre = `HEX_SIZE * √3 ≈ 1.732`. Apothème (rayon inscrit) = `HEX_SIZE * √3/2 ≈ 0.866`.

---

## 3. Structure d'une tuile

```js
{ id, edges: { n, ne, se, s, sw, nw }, center, rotation }
// edge = string ou { type, value }
```

- `getEdgeType(edge)`, `getEdgeValue(edge)`, `cloneEdge(edge)` dans `tileGenerator.js`
- `rotateTile(tile, steps)` — immuable, **ne recalcule pas `center`** (invariant volontaire)
- `placedTile = { tile, q, r, key }` — `placedTiles: Map<string, placedTile>`

---

## 4. Biomes

`grass` prairie · `field` champ (vent) · `forest` forêt (GLB) · `house` village (GLB) · `water` eau/rivière · `rail` voie ferrée

`water` et `rail` sont des **réseaux** : continuité obligatoire imposée par `enforceNetworkContinuity` dans `tileGenerator.js`.

---

## 5. Boucle de jeu

Pioche → rotation → pose → score → missions → bonus → overlays rebuild → extension grille → tuile suivante.

Score (`scoring.js`) : +2 pose, +10 arête compatible, +25 réseau compatible, +50 tuile entourée + bonus cellules.

---

## 6. Terrain (`terrainHeight.js`)

- `getTerrainSurfaceY(point, type, salt)` → Y monde
- `getTerrainNormalAt(point, type, salt, options)` → normale surface
- `placeObjectOnTerrain(object, point, type, salt)` → position + orientation
- Relief procédural : somme sinus + bruit FNV-1a — **`TERRAIN_RELIEF.enabled: false`** (tuiles plates depuis la refonte épaisseur uniforme, cf. `variables.js`). `getTerrainLocalTopY` retourne alors 0 pur.
- Hauteurs surface par biome : grass≈0.082, house≈0.085, forest≈0.088, field≈0.094 — **fonction en PALIERS sans transition** (relief désactivé) : un mauvais `type` passé à `placeObjectOnTerrain` cause un écart net (jusqu'à 12mm), pas un léger flou. cf. piège "type biome deviné vs centre" en §26.

---

## 7. BFS de zones (`zoneUtils.js`)

`collectZone(startTile, startEdge, type, placedTiles, visited, getNeighborsFn)` → `{ type, sectors, total }`

Deux variantes de voisinage :
- `getFullTextureNeighbors` (waterZoneOverlay, missions) : centre + intra-tuile + cross-tuile
- `getTextureNeighbors` local (fieldWheatOverlay) : centre + voisin hexagonal uniquement — **ne pas remplacer**

---

## 8. Overlays visuels

Cycle : `createXxxOverlay()` → `rebuildXxxOverlay(group, placedTiles)` → `updateXxxOverlay(group, time)`. Orchestré par `scene.js`.

| Fichier | Contenu |
|---|---|
| `waterZoneOverlay.js` | BFS zones eau, hover ; labels valeur/sprites délégués à `waterZoneLabels.js` (split 2026-07-11, cf. §21) |
| `waterSurfaceOverlay.js` | Nappe d'eau continue par zone, rivage organique (cf. §19) |
| `waterBeachGeometry.js` | Plages procédurales, alignées sur le rivage organique |
| `waterZoneBoundary.js` | Halos/contours de zone |
| `shaders/waterBoatOverlay.js` | Bateaux GLB animés, graphe nav (déplacé dans `shaders/` le 2026-07-11, cf. §21) |
| `forestOverlay.js` | Arbres GLB (InstancedMesh) |
| `houseOverlay.js` | Maisons, église, cimetière, tours de guet |
| `tileRailOverlay.js` | Rails procéduraux, traverses, ballast |
| `railTrainOverlay.js` | Trains GLB, wagons, gares terminus |
| `decorOverlay.js` | Orchestrateur props : moulins, fontaines, tonneaux, barques côtières… ; chargement GLB props délégué à `decorPropModels.js`, oiseaux/mouettes à `decorBirdModels.js` (split 2026-07-11, cf. §21) |
| `naturalPropsOverlay.js` | Fleurs/rochers/roseaux/bottes/cerfs (InstancedMesh) |
| `villageDecorOverlay.js` | Panneaux, charrettes, chiens, chevaux, tonneaux |
| `fieldWheatOverlay.js` | Brins de blé procéduraux, effets champ |
| `fieldZonesOverlay.js` | Moulins, bâtiments spéciaux champ, safe zones |
| `sheepOverlay.js` | Moutons animés (SkinnedMesh) sur les zones prairies |
| `bonusCellChestOverlay.js` | Coffre animé sur chaque cellule bonus |
| `shaders/morningMistOverlay.js` | Brume matinale volumétrique (nappe de brouillard, courbure monde) — piloté par `environmentDirector` (cf. §29), déplacé dans `shaders/` le 2026-07-11 (cf. §21) |
| `weatherVfxOverlay.js` | Lucioles + pluie/orage via moteur particules `wawa-vfx-vanilla` — piloté par `environmentDirector` (cf. §29) |

---

## 9. Modèles GLB

Chargés via `GLTFLoader`. Pattern : prototype singleton, clone à chaque rebuild. GLBs animés : `cloneSkeleton` (SkeletonUtils) — **jamais `clone(true)`** (brise SkinnedMesh). Props non-animés : `prototype.clone(true)` OK, matériaux partagés.

### Pools actifs

**Maisons** (`houseVillageObjects.js` + `houseOverlay.js`) — 3 variantes médiévales, poids égaux :
```
maison-petite-1  (33% de fumée)
maison-petite-2  (33% de fumée)
maison-petite-3  (jamais de fumée — pas de cheminée visible)
HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.93 * 0.90 * 0.93 * 0.96 * 1.05 * 1.05
```
**Rendu instancié (2026-07-05)** — les maisons ne sont plus un `Group` cloné par instance (`createVillageHouseObject`, supprimé le 2026-07-05 lors de l'audit code mort — plus référencé que dans des commentaires historiques) mais un `THREE.InstancedMesh` par (variant GLB × sous-mesh × chunk hexagonal), même principe que `naturalPropsOverlay.js`. `houseVillageObjects.js::getHouseBakedSubmeshes(defKey)` cuit et met en cache la géométrie locale de chaque sous-mesh du prototype ; `pickHouseInstanceParams(seedKey, index)` reproduit exactement les formules de hash de l'ancien créateur (aspect visuel inchangé). `houseOverlay.js::rebuildHouseOverlay` accumule les matrices par (defKey, chunk) puis `buildHouseInstancedMeshes` construit les InstancedMesh — reconstruction complète à chaque appel (pas de diff par tuile, comme `naturalPropsOverlay.js`). Gain mesuré : draw calls 378→62, shadow casters 135→22 pour un nombre d'objets comparable. **Tours de guet** restent des objets `Group` individuels non instanciés (peu nombreuses, modèle multi-parties issu d'un pack GLB — jugé non rentable). cf. pièges en §26.

**Tours de guet** (`houseVillageObjects.js`) — 5 GLBs individuels, pool actif :
```
tour-1, tour-2, tour-3, tour-4, tour-6  (tour-5 retiré)
sinkDepth: 0.05 sur toutes
```

**Arbres** (`forestOverlay.js`) — 11 modèles InstancedMesh :
```
bouleau-1/2, buisson, peuplier, sapin-1…7, gros-arbre-1/2/3 (filtrés selon TREE_MODEL_DEFS)
TREE_SIZE_MULTIPLIER = 1.65 * 0.88 * 0.94 * 0.93 * 0.94 * 0.96 * 1.08 * 0.92 * 0.94 * 0.94 * 1.09
TREE_GROUND_OFFSET   = -0.005
```

**Vent des arbres** (`globalWind.js` + `TREE_WIND` dans `variables.js`) — shader GPU (`onBeforeCompile`, injection vertex shader), fonctionnel :
```
TREE_WIND.strength = 0.034  (était 0.062 → −30% puis −20% cumulés)
speed 1.38, frequency 0.78, turbulence 0.30, heightStart 0.020, heightEnd 0.380
```
Piège corrigé : `buildTreeInstancedMeshes()` clone les matériaux du prototype (`material.clone()`) pour chaque InstancedMesh de chunk — mais `Material.prototype.copy()` (Three.js) ne recopie PAS `onBeforeCompile`/`customProgramCacheKey` (pas des champs gérés par cette méthode). Le shader de vent injecté sur le prototype était donc perdu sur le matériau réellement affiché → arbres figés malgré `applyGlobalWindToObject()`. Fix : `applyGlobalWindToMaterial()` ré-appliqué explicitement après chaque `.clone()`. cf. piège en §26.

**Moulins** (`fieldZonesOverlay.js` via `decorOverlay.js`) — pool 50/50 :
```
field-flag-2 → moulin-2.glb
field-flag-3 → moulin-1.glb   (clé interne "field-flag-3", GLB = moulin-1)
```

**Charrettes** (`villageDecorOverlay.js`) — pool **25/25/25/25** (2026-07-04, ex-50/50, charrette-1 et charrette-3 réintégrées) :
```
cart-1 (charrette-1.glb)
cart-2 (charrette-2.glb)
cart-3 (charrette-pleine.glb) : bypassBboxCheck: true, groundOffsetDelta: -0.020   — attention, clé "cart-3" ≠ fichier charrette-3.glb
cart-4 (charrette-3.glb)                                                          — clé "cart-4" pour éviter la collision avec cart-3
```
Deux sites de tirage indépendants dans `villageDecorOverlay.js` (charrette en bord de route / charrette en intérieur de tuile), même logique 25/25/25/25 dans les deux.

**Fontaines** — pool 1/3 fontaine-1 / fontaine-2 / fontaine-3 (village + prairie) :
```
fontaine-1: bypassBboxCheck: true, groundOffsetDelta: -0.017
fontaine-2: groundOffsetDelta: -0.004
fontaine-3: bypassBboxCheck: true, groundOffsetDelta: 0   (delta -0.017 copié de fontaine-1
                                                             enfonçait le modèle sous le sol — retiré, non recalibré depuis)
```

**Meule** — 80% de chance dans villages avec au moins 1 secteur house. Sans hitbox.
```
meule.glb: bypassBboxCheck: true, groundOffsetDelta: +0.008
```

**Coffre bonus** (`bonusCellChestOverlay.js`) — 1 modèle, cloné sur chaque cellule bonus :
```
gold.glb (ex-coffre.glb, renommé)
CHEST_TARGET_WIDTH = HEX_SIZE * 0.20 * 1.6 * 1.5 * 1.35 * 0.70 * 0.85 * 1.20  // +50% +35% −30% −15% +20%
```
Le code interne (fonctions, commentaires, `wrapper.name`) garde la terminologie "coffre/chest" par choix — seul l'asset a changé.

**Panneaux de signalisation** (`villageDecorOverlay.js`) — 3 variantes :
```
poteau-indicateur-1/2/3  (30–36% chance par arête village/forêt)
SIGNPOST_TARGET_HEIGHT    (mode: height)
```

**Barques côtières** (`villageDecorOverlay.js`) — pool **35/35/30** (2026-07-04, ex-70/30 avant ajout de barque-3) :
```
shore-boat-1 (barque-1.glb) 35% : vide, échouée — bypassBboxCheck: true, inwardPush = HEX_SIZE * 0.10 (bord de l'eau)
shore-boat-3 (barque-3.glb) 35% : vide, échouée — bypassBboxCheck: true, même comportement que barque-1, taille +14% (2026-07-04)
shore-boat-2 (barque-2.glb) 30% : pêcheur, flottante, inwardPush = HEX_SIZE * 0.50 (en eau, mi-distance)
SHORE_BOAT_TARGET_LENGTH * 0.65 pour barque-1/2, * 0.65 * 1.14 pour barque-3
```

**Tonneaux** (`villageDecorOverlay.js`) — pool 5 variantes :
```
barrel-1, barrel-2, barrel-3, barrel-4, barrel-5
BARREL_TARGET_WIDTH (défini dans decorOverlay.js)
```

**Animaux de village** (`villageDecorOverlay.js`) — GLBs individuels, **statiques** (pas de clips, pas d'AnimationMixer — confirmé, à ne pas re-supposer animés) :
```
chien.glb  : ANIMAL_DOG_TARGET_WIDTH   (mode: length)
cheval.glb : ANIMAL_HORSE_TARGET_WIDTH (mode: length)
```
Placement via `placeAnimal()` (helper local à `villageDecorOverlay.js`) : `placeObjectOnTerrain` + `snapPropBottomToSurface`. Pour un point proche du centre de tuile (`centerPos` — cheval, chien slot 0), le `type` de biome utilisé DOIT venir de `getTileCenterType(placedTile)`, pas d'un type d'arête deviné via `getEdgeFromLocalPoint` (angle quasi arbitraire sur un point quasi à l'origine) : cf. piège en §26 (bug chevaux flottants/enfoncés, corrigé).

**Moutons de prairie** (`sheepOverlay.js`) — SkinnedMesh (GLB animé, 3 types) :
```
sheep-2.glb : 3 armatures — marcheur (Armature_14), brouteur (Armature.001_29), immobile (Armature.002_44)
TILES_PER_SHEEP = 0.292  (1 mouton par N tuiles connexes)
SHEEP_TARGET_LEN = 0.054 (longueur cible en unités monde)
SHEEP_WALK_SPEED = 0.097 (marcheur, unités/s)
Marcheur : 1 par zone, se déplace dans un rayon HEX_SIZE * 1.6 (évite de traverser d'autres biomes)
Brouteur : fixe, AnimationMixer, clip filtré (track Baze_19.position exclue — dissociation corps/pattes)
Immobile : aucune animation
Statiques groupés (instinct grégaire) dans STATIC_CLUSTER_R = HEX_SIZE * 0.28, hitbox via propHitboxRegistry
Zone BFS via getFullTextureNeighbors (connecte secteurs adjacents sans exiger center=grass)
LOD : frustum + LOD_ANIMAL_CULL_DISTANCE (9.6), updateSheepLOD dans le bloc % 9 de animate()
```

**Animaux sauvages** (`naturalPropsOverlay.js`) — InstancedMesh :
```
cerf.glb : NATURAL_DEER_TARGET_WIDTH — forêt / prairie / champ
```

**Champignons** (`naturalPropsOverlay.js`) — 2 variantes InstancedMesh :
```
mushroom-1.glb, mushroom-2.glb (mushroom-2: groundOffsetDelta: +0.008)
```

**Piles de bois** (`naturalPropsOverlay.js`, defs dans `decorOverlay.js`) — 4 variantes, forêts uniquement :
```
pile-de-bois-1.glb (+23% −10%), pile-de-bois-2.glb (+13% −12%)
pile-de-bois-3.glb (−17%), pile-de-bois-4.glb (−17%)   — nouveau, non calibré individuellement au-delà du −17%
```

### Système de placement props (`decorOverlay.js` + `naturalPropsOverlay.js` + `propPlacement.js`)

`preparePropPrototype(def)` — normalise le GLB : ancre `box.min.y` à Y=0 dans l'espace wrapper, scale = `target / dimension`. Recentrage fait une seule fois au chargement du prototype, scale-invariant (tout `wrapper.scale.setScalar(s)` ultérieur préserve le bas à zéro).

`bypassBboxCheck: true` — contourne la garde "bbox ANORMALE" pour les GLBs exportés sans "Apply All Transforms" dans Blender. La normalisation fonctionne quand même via `wrapper.scale = target / large_dimension`.

`groundOffsetDelta` — correction Y post-snap stockée dans `wrapper.userData.groundOffsetDelta`. Appliquée **après** le snap. Valeur négative = descendre.

**Formule de clearance — unique et définitive (2026-07-04, cf. §26)** — les 6 biomes sont strictement plats (§6) : 6 hauteurs de sol fixes (`getBiomeSurfaceOffsetY(type)`, terrainHeight.js), jamais une fonction de position. Toute clearance proportionnelle à la taille du prop ou plafonnée sur bounding-box mesurée a été retirée après plusieurs régressions en chaîne (flottement/enfoncement NPC, herbe, moutons, chiens) — l'utilisateur a exigé l'arrêt total de ce type d'approximation. Une seule constante, partout :
```js
GROUND_CLEARANCE = 0.003   // propPlacement.js, exportée
position.y = surfaceY + GROUND_CLEARANCE   // pour TOUT prop, TOUT biome
```
`snapPropBottomToSurface(object, surfaceY, clearance = GROUND_CLEARANCE)` — mesure le Box3 réel de l'objet et cale son bas à `surfaceY + clearance` (plus de cap par ratio de hauteur). Utilisée par `characterOverlay.js` (NPC), `villageDecorOverlay.js` (panneaux, charrettes, tonneaux, fontaines, meule, chiens, chevaux), `naturalPropsOverlay.js` (flower/brindille/grass/shrub/mushroom/deer via `getNaturalPropGroundClearance(kind) → kind === 'rock' ? 0.000 : GROUND_CLEARANCE`).

**Moutons (`sheepOverlay.js`)** — cas à part : les 3 armatures du GLB (marcheur/brouteur/immobile) ne passent pas par `preparePropPrototype`, donc pas de recentrage automatique → `footY` (box.min.y) mesuré par armature au chargement, compensé à la pose : `groundY = SHEEP_SURFACE_Y − footY × scale + GROUND_CLEARANCE`.

**Brins d'herbe shader (`grassBladeOverlay.js`)** — système Cubic Bezier animé, couvre `EDGE_TYPES.grass` ET `forest` (distinct des clumps GLB de `naturalPropsOverlay.js`). Avait un lift fixe disproportionné (`+0.005`, ~50% de la hauteur réelle d'un brin) — cause probable principale du flottement en prairie. Remplacé par `GROUND_CLEARANCE`.

**Positions Y fixes** :
```js
wheat blades : surfaceY + GROUND_CLEARANCE   (fieldWheatOverlay.js)
grass blades : surfaceY + GROUND_CLEARANCE   (grassBladeOverlay.js, arête + centre)
```

### Densités et dimensions clés (mises à jour 2026-07-04)

```js
flower (prairie / bords) : 83 + rand*76   → moy 121   (−15%, était 98+89)
flower (autres)           : 22 + rand*22   → moy 33    (−15%, était 26+26)
grass (plante-N clumps)   : 213 + rand*86  → moy 256   (−15%, était 250+101)  // "autres plantes"
shrub                     : 16 + rand*19   → moy 25.5  (−15%, était 19+22)   // "autres plantes"
mushroom                  : 16 + rand*26   → moy 29    (−15%, était 19+31)
brindille                 : moy 14.5   (inchangé)
rock (prairie)            : moy 6.5   (densité inchangée — dimension −10%, voir ci-dessous)
rock (forêt)              : moy 4.5   (densité inchangée)
wheat blades              : WHEAT_BLADE_COUNT = 1950   (−16%, était 2321)
grass blades (shader)     : GRASS_BLADE_COUNT = 1101   (−14%, était 1280)
deer                      : dans forêts, prairies, champs
```

**Dimensions (2026-07-04)** :
```js
NATURAL_ROCK_TARGET_LENGTH   : chaîne de multiplicateurs × 0.90   (−10%)
character-garde (garde.glb)  : CHARACTER_TARGET_HEIGHT × 1.11     (+11%)
```

---

## 10. Hash procédural (`hashUtils.js`)

FNV-1a — **ne pas unifier les variantes** (changer la précision change le placement visuel) :

| Export | Usage |
|---|---|
| `hashUnitFull(text)` | forestOverlay, tileRailOverlay |
| `hashUnit100k(text)` | houseOverlay, waterBoatOverlay |
| `hashUnit10k(text)` | decorOverlay, naturalPropsOverlay, villageDecorOverlay, railTrainOverlay |
| `hashNumber(value)` | forestOverlay, fieldWheatOverlay, tileRailOverlay |

---

## 11. Configuration (`variables.js` / `config.js`)

`config.js` = `export * from './variables.js'`. Constantes critiques :
- `HEX_SIZE = 1`, `EDGE_ORDER = ['n','ne','se','s','sw','nw']`, `SECTOR_DEFS`
- `TILE_VISUAL` : `radiusScale: 1`, `waterY`, `railSurfaceY`, `tileThickness`
- `TERRAIN_RELIEF`, `EDGE_COLOR`, `EDGE_WEIGHTS`
- `VFX_WORLD_RADIUS = 15` : rayon (unités monde) de la zone couverte par lucioles/brume (VFX météo, cf. §29)

Réglages VFX météo (densité/compacité/élévation brume, densité/taille/vagabondage/scintillement lucioles, densité/vitesse/taille goutte pluie) : hors `variables.js`, dans un store dédié `vfxSettings.js` (get/set/reset + persistance localStorage), édité en direct dans la rubrique EDA « 8. Météo » (fusionné le 2026-07-10, ex-rubrique 2 indépendante, cf. §13).

---

## 12. Rendu et post-processing

Pipeline Three.js r160 : `RenderPixelatedPass → SmokeVolumePass → ShaderPass(COLOR_GRADING_SHADER) → ShaderPass(CINEMATIC_SHADER) → OutputPass` via `EffectComposer`.

**Trois passes de rendu par frame** (dans `postprocess.render()`) :
1. `renderWorldLayer()` — `camera.layers.set(WORLD_LAYER=0)` → composer.render() avec tous les postprocess
2. `renderTextLayer()` — `camera.layers.set(TEXT_LAYER=1)` → renderer.render() direct, autoClear=false, clearDepth seul (labels nets, non pixelisés)
3. `renderSunLayer()` — `camera.layers.set(SUN_LAYER=2)` → renderer.render() direct, en dernier, l'astre passe devant tout

**IBL** : `applySceneEnvironment(scene, renderer)` — `PMREMGenerator + RoomEnvironment` → `scene.environment` + `scene.environmentIntensity = 0.25` (lumière d'ambiance douce sur tous les GLBs).

**Monkey-patch `RenderPixelatedPass`** : r160 rend la scène deux fois. Le patch surcharge `pixelPass.render` pour sauter le rendu normals quand `normalEdgeStrength < 0.005`. Économise ~N draw calls (tous les DC de la scène).

**pixelPass** : jamais désactivé (enabled=false casserait le readBuffer). Quand pixelisation "off" : neutralisé (`pixelSize=1`, `forces=0`). `uPixelSize` synchronisé dans `colorGradingPass` pour alignement Bayer.

### Pass cinématique (`shaders/shaderCinematique.js`)

`cinematicPass.js` (simple ré-export de compatibilité) supprimé le 2026-07-11 (round 4, cf. §21) — `threeSetup.js` importe `CINEMATIC_SHADER` directement depuis `shaders/shaderCinematique.js`.

Fragment shader, dans l'ordre d'exécution : **courbure écran (CRT)** (déforme l'UV en amont, anisotropie légère horizontale/verticale) → distorsion barillet (bâtie sur l'UV déjà courbée) → tilt-shift → aberration chromatique → gaussienne 9-taps → halation → **God Rays** → **bloom** (seuil + 8-tap radial) → vignette → grain film → scan lines, puis en toute fin **masque/assombrissement de bords CRT** (mix distance Chebyshev/radiale, indépendant des coins uniquement). Bypass total classique en tête de `main()` : `if (uEnabled < 0.5) { gl_FragColor = texture2D(tDiffuse, vUv); return; }` — zéro coût GPU quand le master cinéma est désactivé.

Uniforms clés : `uTilt`, `uFocusCenter`, `uFocusBand`, `uVignette`, `uGrain`, `uChromatic`, `uHalation`, `uBarrel`, `uScanLines` (0–6 px / cycle 8 px), `uScanLinesIntensity` (profondeur du noir des scanlines, 0=transparent/1=noir total), `uGodRaysLength/Diffusion/Threshold`, `uBloomIntensity/Threshold/Radius/Softness`, `uCrtCurvature/Mask/CornerDark`, `uTime`, `uResolution` (injecté dans threeSetup.js — absent de CINEMATIC_SHADER.uniforms).

**Convention d'ajout d'effet** (God Rays, Bloom, Courbure écran) : un slider maître à `0` bypass tout le bloc GLSL (`if (uMaster > 0.001) { ... }`) — zéro coût GPU, zéro effet visuel — pendant que ses sous-paramètres peuvent avoir des défauts non-nuls sans risque puisqu'ils sont inertes tant que le maître est à 0. Bloom et Courbure écran ont chacun leur propre case à cocher `xxxEnabled` dans le HUD (§13), au même titre que God Rays/Tilt-shift.

**API** : `postprocess.getCinemaSettings()`, `applyCinemaSettings(partial)`. **Aucun raccourci clavier** (touche C retirée le 2026-07-08 à la demande utilisateur — `toggleCinema()` supprimé de `threeSetup.js`, dead code depuis que plus rien ne l'appelait ; le master switch du bloc CINÉMATIQUE reste accessible uniquement via la case à cocher du panel EDA, cf. §13). Persistance localStorage `hexistenz_cinema_v1`. Config intégrée dans chaque preset d'`ambiances.json`.

---

## 12b. Fumée volumétrique (`smokeVolumePass.js` + `shaders/shaderFumee.js`)

**ShaderPass** inséré dans le composer entre `RenderPixelatedPass` et `colorGradingPass`.

### Architecture

```
smokeVolumePass.js      createSmokeVolumePass() → ShaderPass
                        updateSmokeVolumePass(pass, positions, camera, locoCount, depthTex)
shaders/shaderFumee.js  SMOKE_VERT (passthrough) + SMOKE_FRAG (ray-march volumétrique)
```

### Sources de fumée

| Source | Fichier | Export | Filtre LOD |
|---|---|---|---|
| Maisons | `houseOverlay.js` | `getHouseChimneyPositions(group)` | `col.tileGroup.visible` (même flag que `updateHouseLOD`) |
| Locos | `railTrainOverlay.js` | `getTrainLocoPositions(group)` | `train.object.visible` (même flag que `updateRailTrainLOD`) |

- **30% des maisons fument** : `hashUnit(\`${seed}:smoke\`) < 0.33` (maison-petite-1 et maison-petite-2 uniquement — **maison-petite-3 exclue**, pas de cheminée visible).
- Cheminée Y : `houseSurfaceY + 0.004 + HOUSE_SCALE * 1.70` (varie avec le terrain).
- Loco cheminée Y : `loco.position.y + TRAIN_SCALE * 1.16`.
- Buffer max **48 sources** (`MAX_SMOKE_SOURCES = 48`). Locos en tête du tableau (priorité sur le cap).

### Uniforms clés

```glsl
uniform sampler2D tDiffuse;    // couleur scène (readBuffer EffectComposer)
uniform sampler2D tDepth;      // beautyRenderTarget.depthTexture — occlusion géométrie
uniform float     uTime;
uniform vec3      uCamPos;
uniform mat4      uProjInv;    // camera.projectionMatrixInverse (reconstruction rayon)
uniform mat4      uCamWorld;   // camera.matrixWorld
uniform mat4      uViewMat;    // camera.matrixWorldInverse   ─┐ pour depth test
uniform mat4      uProjMat;    // camera.projectionMatrix      ─┘
uniform vec3      uSmokePos[48];
uniform float     uSmokeCount;
uniform float     uLocoCount;  // N premières sources = locos (scale ×1.14)
uniform float     uHasDepth;   // 1.0 si tDepth valide, 0.0 sinon
```

### Shader FRAG — pipeline

1. **Reconstruction rayon** via `uProjInv` + `uCamWorld` (pas de viewMatrix séparée — construit à partir des inverses caméra).
2. **Intersection slab Y** `[uSmokeYBase, uSmokeYTop]` → `tMin`, `tMax`. Uniforms **dynamiques** (2026-07-04, ex-constantes GLSL fixes `-0.05/1.3`) : recalculés chaque frame dans `updateSmokeVolumePass()` (`smokeVolumePass.js`) à partir du min/max Y RÉEL des sources de la frame (`uSmokeYBase = minY − 0.35`, `uSmokeYTop = maxY + 1.1`). Fix bug bouliste : les positions sources incluent déjà `getWorldCurvatureDrop(x,z)` (potentiellement plusieurs unités négatives loin du centre) — avec un slab absolu fixe calibré terrain plat, la source réelle tombait hors bornes → fumée invisible ou écrasée sur une tranche résiduelle loin du centre de la grille. Piège général : un `ShaderPass` post-processing est hors scène-graph, `applySceneCurvatureFlags` (threeSetup.js) ne le couvre jamais — cf. §26.
3. **March linéaire 48 pas** entre `tMin` et `tMax`.
   - **Depth test** par pas : projette `pos` en clip-space (`uProjMat × uViewMat`), compare `ndc.z*0.5+0.5` avec `texture2D(tDepth, uv).r`. `continue` si derrière la scène (`stepZ > sceneZ + 0.001`).
   - **Densité** : somme de `densityFromSource(pos, src, scale)` sur toutes les sources.
4. **Composite** : `gl_FragColor = smoke.rgb + sceneColor.rgb * (1 - smoke.a)`.

### densityFromSource(pos, src, scale)

- `scale = 1.14` (locos, `i < uLocoCount`) ou `0.86` (maisons).
- Hauteur max : `0.68 * scale` au-dessus de la source.
- Pré-cull radial : `dot(q.xz, q.xz) > 0.101 * scale²`.
- **Gaussian évasé** : `sigma = (0.034 + q.y * 0.136) * scale` → colonne étroite à la base, évasée au sommet, sans anneaux.
- Fades : `topFade = pow(1 - q.y/height, 1.8)`, `baseFade = smoothstep(0, 0.051*scale, q.y)`.
- **Turbulence 4 octaves** (value noise FBM) avec dérive animée croissant avec la hauteur : `g = q.y*0.18 + 0.025`, vitesse verticale `uTime*0.88`, horizontale `uTime*0.36`.

### Intégration scene.js

```js
// Toutes les frames, APRÈS updateHouseLOD + updateRailTrainLOD (bloc % 9)
// → tileGroup.visible et train.object.visible à jour dans la même frame
const _smokeLocos = getTrainLocoPositions(railTrainOverlay);
const _smokeSrcs  = [..._smokeLocos, ...getHouseChimneyPositions(houseOverlay)]
                    .slice(0, MAX_SMOKE_SOURCES);
updateSmokeVolumePass(smokeVolumePass, _smokeSrcs, camera, _smokeLocos.length,
  postprocess.pixelPass.beautyRenderTarget.depthTexture);
```

**LOD piège à éviter** : le smoke update doit impérativement s'exécuter APRÈS le bloc LOD `(shadowRefreshFrame % 9 === 0)` pour que `tileGroup.visible` et `train.object.visible` soient à jour dans la même frame que le rendu.

---

## 13. Panel CUSTOMISATION / EDA (`edaPanelHost.js` + `edaPanelWiring.js` + `json/ambiances.json`)

**Renommage 2026-07-11** (cf. §21) : `debugLightUi.js` → `edaPanelHost.js` (façade DOM partagée), `hud_eda.js` → `edaPanelWiring.js` (câblage des 3 onglets, ex-`wireEdaPanel`). Aucun changement de comportement — pur renommage + extraction CSS (cf. §20).

Touche **E** → ouvre/ferme le panel EDA (Éditeur de Direction Artistique). Touche **F** → HUD perf avancé (FPS détaillé), indépendant de l'EDA.

**Layout (refonte juillet 2026, mise à jour 2026-07-08)** : le panel n'affiche plus des colonnes rigides mais **3 onglets** sous le header, chaque onglet organisé en **flux journal 3 colonnes fluides** (CSS `columns: 3` sur `.debug-light-columns` + `break-inside: avoid` sur chaque rubrique — les rubriques remplissent la colonne 1, puis 2, puis 3, sans jamais être coupées à cheval). Une seule barre de scroll par onglet. Header (`AMBIANCES` + presets) et footer (undo/redo, 📋 Copier, comparer) restent communs, plein-largeur, au-dessus/en-dessous des onglets. Forme du monde, Jour/Nuit, Qualité/densité et Météo, auparavant boutons de footer ou HUDs flottants séparés, sont désormais des rubriques de l'onglet Environnement (5 à 8, cf. tableau ci-dessous). Largeur du panel : `LUT_WIDTH_FACTOR = 2.8` × largeur `#tileUI` (+40 % vs l'ancien ×2 pour accueillir la 3ᵉ colonne). Hauteur **fixe** `calc(100vh - 28px)`. Onglet actif persisté dans `localStorage['hexistenz_eda_tab']`, bascule sans coût de layout (`display:none` sur les panels inactifs).

Numérotation à plat par onglet (repart de 1, ordre de lecture — les rubriques flottent d'une colonne à l'autre selon la hauteur dispo, comme un journal ; seul VENT garde un niveau de sous-numérotation 4.1/4.2/4.3) :

| Onglet | Rubriques (flux journal 3 colonnes) |
|---|---|
| **LUT** | 1. Brouillard · 2. Astre lumineux · 3. Étalonnage · 4. Palette biomes |
| **Cinématique** | 1. Cinématique (vignette/grain/aberration/halation/barillet/scanlines) · 2. God Rays · 3. Tilt-shift · 4. Bloom · 5. Pixélisation · 6. Courbure écran (CRT) |
| **Environnement** | 1. Écume · 2. Sillage bateau · 3. Nuages · 4. Vent (4.1 Blés, 4.2 Herbes, 4.3 Arbres) · 5. Forme du monde · 6. Jour/Nuit · 7. Qualité/densité · 8. Météo |

**Onglet Cinématique — rubriques 1 à 4 indépendantes** : depuis le passage en flux journal (2026-07-08), les sous-groupes God Rays / Tilt-shift / Bloom ne sont plus imbriqués sous une grosse rubrique CINÉMATIQUE unique — chacun est une `.debug-light-cinema-section` indépendante avec son propre en-tête à toggle. Le toggle master de la rubrique 1 (`cinEnabled`) grise toujours les 4 sections simultanément (`querySelectorAll('.debug-light-cinema-section').forEach(...)`), assurant la sémantique historique.

Rubriques avec interrupteur on/off dans leur en-tête (grise les contrôles sans réinitialiser les valeurs) : Étalonnage, Palette biomes, Cinématique, God Rays, Tilt-shift, **Bloom**, Pixélisation, **Courbure écran**, **Écume** (🫧), **Sillage bateau** (🚤), **VENT** (coupe l'ondulation blé + prairie + arbres simultanément — cf. plus bas), Nuages, Forme du monde, Jour/Nuit. Bloom et Courbure écran, ajoutés en juillet 2026, suivent exactement le même mécanisme de case à cocher que God Rays/Tilt-shift : la valeur du slider reste mémorisée, seul l'uniform effectif est forcé à 0 quand décoché. Écume/Sillage bateau (`hud_eda.js`, rubriques 1/2 de l'onglet Environnement) suivent depuis le 2026-07-03 le même mécanisme : décoché → `foamWidth/foamDensity/foamAmbient` (écume) ou `density/opacity` (sillage) forcés à 0 en live via `setWaterFoamParams`/`setWakeParams`, valeurs mémorisées intactes.

**Titres de rubrique — chartage uniforme** : depuis 2026-07-08, tous les en-têtes (`.debug-light-pix-head`, `.lut-section-head`, `.lut-section-head--nested`) partagent une barre de fond sombre (`background: rgba(0,0,0,0.45)`, padding, `border-left: 3px solid rgba(145,205,255,0.32)` pour l'accent bleuté) et un texte 12px letter-spacing 0.18em `text-transform: uppercase` — quel que soit le casing dans le markup ("Météo", "God Rays", "CINÉMATIQUE" apparaissent tous en majuscules). Les sous-rubriques VENT (4.1/4.2/4.3) utilisent la variante `--nested` plus discrète (fond `rgba(0,0,0,0.30)`, barre 2px). Plus aucun séparateur horizontal entre rubriques : le flux journal + le `margin-bottom: 14px` sur chaque enfant direct de `.debug-light-columns` fournissent l'espacement. Les séparateurs Écume↔Sillage (JS) et 4.1↔4.2↔4.3 (border-top nested) ont aussi été retirés le 2026-07-08.

**Tout paramètre de ce panel (LUT, cinéma, eau, vent, nuages…) est réglable en direct pendant la partie** : chaque slider commit immédiatement sur le pipeline GPU (aucune recompilation shader hors cas explicitement documentés, ex. reconstruction forêt pour le vent des arbres), avec undo/redo et export JSON via 📋 Copier.

**Auto-masquage réciproque** : quand l'EDA est ouvert (`body.lut-panel-open`), `#scorePanel` et le mini-HUD clavier (`#kbdHintHud`, "H ou ESC → aide") sont masqués ; ils réapparaissent à la fermeture. `#scorePanel` partage ce mécanisme avec le HUD FPS avancé (`_syncFpsFullscreen()` — masqué si EDA ouvert OU HUD FPS développé).

**Emojis de rubrique/sous-rubrique** : agrandis ×1.35 via un span dédié `.rubrique-emoji` (`font-size: 1.35em`, relatif au parent — reste correct aussi bien à 12px (rubriques) qu'à 11px (sous-rubriques)).

Presets `json/ambiances.json` (**14**) : Défaut, Brume, Automne, Été vif, Hiver, Sépia, Nordique, Désert, Pong (pixelSize=15, scanLines=4, worldShapeMode forcé "platiste"), Apple II (scanLines=4, pixelSize=3), CGA (scanLines=4, pixelSize=3), EGA (scanLines=3, pixelSize=3), Amiga (pixelSize=2, scanLines=2), Psyché-LSD. Chargé via `fetch('./json/ambiances.json')`.

**📋 Copier** : exporte `{ lut, pix, cinema, water, wind, cloud, dayNight, density, weather, vfx }` en JSON (`pix` inclut `worldShapeMode`). `vfx` (réglages fins brume/lucioles/pluie, `vfxSettings.js`) ajouté le 2026-07-10 — jusque-là absent, seule la LISTE des évènements météo actifs (`weather`) était exportée, pas leurs sous-paramètres : le bouton ne copiait donc pas tous les réglages des 3 onglets. Undo/redo couvrent LUT/pix/cinema/water/wind/cloud/**vfx** (`_snapshotAll`/`_restoreSnapshot`, vfx ajouté même date pour la même raison — les sliders météo appelaient déjà `pushUndo()` mais le snapshot ne les capturait pas). Forme du monde, Jour/Nuit et Qualité/densité restent hors undo/redo (réglages "monde"/"machine", pas "regard").

**Application d'un preset — quelles catégories sont réellement appliquées au clic** (`hud_eda.js`, handler du bouton preset) : `delta`/`pixelization`/`cinema` (toujours), `wind`/`cloud`/`water` (remplacement complet, défaut = `*_DEFAULTS` si absent du preset — même piège de "fuite" entre presets que `crtEnabled`, corrigé le 2026-07-10 pour cloud/water sur le même modèle que wind), `dayNight` (appliqué **seulement si présent** dans le preset — contrairement à wind/cloud/water, un preset silencieux dessus ne force PAS le jour/nuit courant du joueur). `density`/`weather`/`vfx` restent hors application preset (réglages machine/évènements ponctuels, pas de "look" figé) même s'ils apparaissent dans l'export 📋 Copier.

**Quantification palette rétro** (`visualEnvironment.js`) : uniforms `uPaletteColors[40]` + `uPaletteSize` + `uPaletteDither`. Comparaison en espace sRGB (raw hex — ne pas passer par `new THREE.Color()`).

### Onglet Environnement — rubrique 4. VENT

Regroupe 3 sources de vent indépendantes, avec un interrupteur on/off global qui les coupe toutes les trois sans écraser les valeurs mémorisées (`_applyWindLive` applique `strength`/`sway` effectifs à 0 seulement en live) :

- **Blé/prairie** (`fieldWheatOverlay.js` / `grassBladeOverlay.js`) : uniforms simples (`uWindStrength`, `uWindSpeed`, + `uWindSway` pour la prairie) — modifiables en live, aucune recompilation shader. Getters/setters exportés : `getWheatWindParams/setWheatWindParams`, `getGrassWindParams/setGrassWindParams`.
- **Arbres** (`forestOverlay.js`) : le vent est cuit dans la SOURCE du shader (`onBeforeCompile`, `TREE_WIND`), pas de simples uniforms. `setTreeWindParams(group, partial)` ne patche jamais les matériaux déjà posés en place (piège vécu, cf. §26) : il met à jour `TREE_WIND` puis déclenche un **rebuild forêt complet debounced** (180 ms, `rebuildForestOverlay`) — seule voie sûre pour réappliquer le vent sans empiler des injections GLSL dupliquées.

### Onglet Environnement — rubrique 3. NUAGES

`cloudSky.js` expose désormais `uCloudScale` / `uCloudSpeed` en uniforms (remplacent les constantes GLSL figées `0.026202` / `0.09450` de `shaders/shaderCiel.js`), en plus de `uCoverage` déjà existant. Getters/setters : `getCloudSkyParams/setCloudSkyParams`. Réglable en live, aucune recompilation (l'upgrade "exposer uCoverage dans le panneau" listée en §27.C est donc faite, avec scale/vitesse en bonus). Rubrique déplacée en colonne A (avec Écume/Sillage bateau) depuis juillet 2026.

### Onglet Environnement — rubriques 5. Forme du monde / 6. Jour-Nuit

Anciennement des boutons à bascule dans le footer du panel EDA, ces deux réglages sont désormais des cases à cocher (`.pix-switch`) dans le flux journal de l'onglet Environnement, comme les autres rubriques. Chaque rubrique n'a qu'une case : cochée = premier état (Bouliste / Jour), décochée = second état (Platiste / Nuit), avec un `<output>` texte affichant le mode actuel. Les deux réglages restent hors undo/redo ("réglage monde, pas regard"), mais sont inclus dans l'export 📋 Copier (`pix.worldShapeMode` et `dayNight`).

### Onglet Environnement — rubrique 7. Qualité/densité

Ex-panneau flottant `qualityUi.js` (bouton "⚙ QUALITÉ"), intégré dans le panel EDA le 2026-07-08. 4 boutons preset (`.debug-light-preset-btn`) 🐌 Faible / 🚶 Moyen / 🏃 Élevé / 🚀 Max + un slider Densité `createRawSlider(MIN_DENSITY, MAX_DENSITY, 0.05)`. Réglage MACHINE (perf), pas "regard" → hors undo/redo et hors export 📋 Copier. Persistance propre à `contentDensity.js` (localStorage `hexistenz_content_density`). Debounce 220 ms sur `setContentDensity()` (le rebuild props naturels/herbe/moutons est coûteux — évite de reconstruire à chaque pas du slider).

### Onglet Environnement — rubrique 8. Météo

Ex-HUD flottant `environmentDebugUi.js` ("🌦 ENV", bas-gauche), fusionné dans le panel EDA le 2026-07-08 puis **supprimé**. Génère dynamiquement une ligne par événement du catalogue `ENVIRONMENT_EVENTS` (`environmentDirector.js`) : label + suffixe italique « (nécessite X) » quand `def.requires` est renseigné + `<span class="weather-status">` (● actif) + bouton `.debug-light-weather-btn` (même charte visuelle que `.debug-light-preset-btn` de la rubrique 7, variante `--active` en tonalité stop rouge quand l'événement tourne). Un bouton `⏹ Tout arrêter` (`.debug-light-weather-stopall`) full-width en bas de rubrique. Câblage direct à l'API de `environmentDirector.js` : `triggerEnvironmentEvent`/`stopEnvironmentEvent`/`stopAllEnvironmentEvents`, rafraîchissement des statuts via `onEnvironmentChange` + `setInterval(500 ms)` (capte aussi l'auto-expiration entre 2 transitions). Le bouton d'un événement à prérequis (Éclair → Orage, Panique animale → Feu) est désactivé tant que le prérequis n'est pas actif. `environmentDirector` est créé dans `scene.js` **avant** `createDebugLightUI(...)` et passé en param (`{ ...visualEnvironment, postprocess, forestOverlay, cloudSky, environmentDirector }`) → `wireEdaPanel`.

**Depuis le 2026-07-09 (merge VFX Cyril, cf. §29), les hooks ne sont plus inertes** : déclencher `groundMist`/`fireflies`/`rain`/`storm` active l'effet visuel correspondant (fondu entrée/sortie) via `shaders/morningMistOverlay.js` + `weatherVfxOverlay.js`. Leurs paramètres fins sont pilotés dans la **même rubrique 8** (cf. sous-section suivante) :

**Réglages VFX MÉTÉO — fusionnés dans la rubrique 8 (2026-07-10, ex-rubrique 2 indépendante)** : trois groupes de sliders (🌫️ Brume matinale / ✨ Lucioles / 🌧️ Pluie-Orage), chacun avec un bouton ↺ réinitialiser, affichés sous les boutons de déclenchement d'évènements et le bouton `⏹ Tout arrêter` de la rubrique 8 (même conteneur `.debug-light-weather-section`, même thème « météo »). Contrairement à EAU/VENT/NUAGES (getters/setters dédiés par overlay), ces réglages passent par le store commun `vfxSettings.js` (`getVfxSettings`/`setVfxSetting`/`resetVfxSettings`, persistance localStorage gérée là-bas). Générés dans `hud_eda.js` (`#debugLightVfxControls`, déplacé dans le markup mais toujours peuplé par le même `querySelector('#debugLightVfxControls')` — sélection par id, insensible à l'emplacement) via `createRawSlider` — hors export 📋 Copier (réglage machine, pas « regard »), undo/redo câblé via `pushUndo`. Classe CSS `.debug-light-vfx-section` (ex-wrapper à en-tête propre "2. VFX MÉTÉO") supprimée de `debugLightUi.js`, devenue morte après la fusion.

---

## 14. Labels de zones (`waterZoneLabels.js` + `tileLabels.js`)

`waterZoneLabels.js` extrait de `waterZoneOverlay.js` le 2026-07-11 (round 3, cf. §21) — héberge tous les sprites/labels valeur, `waterZoneOverlay.js` conserve BFS/hover et importe en retour.

Sprites `THREE.Sprite` canvas hexagonal — ratio W/H = 2/√3 ≈ 1.155. Font **DeltaBlock**.

- Labels permanents : `zone.total >= 6`, scale ratio-based [0.55, 2.635]
- Labels stratégiques : `zone.total < 6`, `isSmallZoneLabel = true`, taille fixe 2.975×

`updateZoneLabelLOD` : immersiveMode → invisible · isSmallZoneLabel → invisible · cull XZ ≥ LOD_ZONE_LABEL_CULL_DISTANCE · fade altitude sinusoïdal (`t = (camY - NEAR_FADE_END) / (NEAR_FADE_START - NEAR_FADE_END)`).

Zones `total=1` ou `sectors.length < 2` : pas de contour ni label au hover.

**Contours hover** : pointillés `CanvasTexture` 64×4 px, `DASH_PERIOD = 0.25` world units. `HALO_Y = 0.010`, `HOVER_HALO_Y = 0.022`.

---

## 15. LOD

Seuils dans `variables.js` (tous réduits de −10% le 2026-07-04, "les items sont masqués plus tôt" — valeurs ci-dessous déjà à jour) :

| Cible | Constante | Valeur |
|---|---|---|
| Fleurs, champignons | `LOD_MICRO_CULL_DISTANCE` | 5.9 |
| Plantes (végétation, shrubs) | `LOD_PLANT_CULL_DISTANCE` | 4.3 |
| Brins d'herbe (GPU) | `LOD_GRASS_CULL_DISTANCE` | 5.8 |
| Blé (chunks) | `LOD_WHEAT_CULL_DISTANCE` | 5.0 |
| Rochers | `LOD_ROCK_CULL_DISTANCE` | 6.5 |
| Routes pavées | `LOD_PAVED_ROAD_CULL_DISTANCE` | 8.2 |
| Décor bord de route | `LOD_ROAD_DECOR_CULL_DISTANCE` | 7.5 |
| Poteaux indicateurs | `LOD_SIGN_CULL_DISTANCE` | 7.1 |
| Props village | `LOD_VILLAGE_PROP_CULL_DISTANCE` | 7.7 |
| Barques échouées | `LOD_SHORE_BOAT_CULL_DISTANCE` | 8.3 |
| Animaux (cerfs, chiens, chevaux, moutons) | `LOD_ANIMAL_CULL_DISTANCE` | 8.6 |
| Personnages (NPC) | `LOD_CHARACTER_CULL_DISTANCE` | 8.5 |
| Corbeaux | `LOD_CROW_CULL_DISTANCE` | 8.7 |
| Mouettes | `LOD_SEAGULL_CULL_DISTANCE` | 8.7 |
| Fontaines | `LOD_FOUNTAIN_CULL_DISTANCE` | 8.8 |
| Trains | `LOD_TRAIN_CULL_DISTANCE` | 8.9 |
| Bateaux animés | `LOD_BOAT_CULL_DISTANCE` | 9.3 |
| Arbres | `LOD_TREE_CULL_DISTANCE` | 11.0 |
| Moulins | `LOD_MILL_CULL_DISTANCE` | 11.3 |
| Bâtiments (maisons) | `LOD_HOUSE_CULL_DISTANCE` | 11.4 |
| Watchtowers | `LOD_WATCHTOWER_CULL_DISTANCE` | 11.9 |
| Rails | `LOD_RAIL_TRACK_CULL_DISTANCE` | 13.0 |
| Nappe d'eau (bascule shader→plat) | `LOD_WATER_SHADER_DISTANCE` | 14.4 |
| Labels zones | `LOD_ZONE_LABEL_CULL_DISTANCE` | 25.4 |

Test dans `animate()` toutes les 9 frames. Après rebuild via `overlayRebuildQueue`, `lod()` appelé immédiatement.

---

## 16. Pipeline perf — rebuild différé (`scene.js`)

`overlayRebuildQueue = new Map<name, {rebuild, lod}>()` — coalescing automatique, 1 overlay traité par frame.

**BFS ciblé waterZone** : `affectedHex` → BFS partiel sur 7 hexes. Full rebuild si `null` (undo, chargement, multijoueur).

---

## 17. InstancedMesh

`forestOverlay.js`, `naturalPropsOverlay.js`, `tileRailOverlay.js`, `houseOverlay.js` (maisons, 2026-07-05) utilisent `THREE.InstancedMesh`. Pattern : collect matrices → build mesh.

**Piège HUD** — `sceneProfiler.js::_traverseNode` traite tout `obj.isInstancedMesh` en premier et retourne immédiatement après `_classifyInstanced(obj)` : si le nom ne matche aucun préfixe connu (`instanced-prop-*`, `instanced-tree-*`, `instanced-house-*`…), le mesh est classé `null` et disparaît TOTALEMENT du HUD (pas même dans "Autres props inconnues"). `_GLB_LABELS`/`_classifyGlb` n'est jamais atteint pour un InstancedMesh. Tout nouveau préfixe de nommage doit être ajouté explicitement à `_classifyInstanced`.

**Piège ombres** — `applySceneShadowFlags()` (`threeSetup.js`) traite tout mesh sans `userData.shadowFlagsApplied` comme "jamais vu" et force `castShadow=true` sur tout matériau opaque, écrasant l'optimisation "1 seul caster par variant" (`_applySingleShadowCaster`). Tout nouvel `InstancedMesh` doit poser explicitement `mesh.userData.castShadowOriginal` et `mesh.userData.shadowFlagsApplied = true` à sa création. cf. §26.

**Bottes de foin** : restent verticales (`alignToSlope: false`) mais reçoivent une compensation de pente `slopeSin × radius`.

**Merge géométrique** (`mergeGeometries`) : 1 Mesh = 1 DC. Piège InterleavedBufferAttributes (GLBs GLTF compact) : désentrelacer via `attr.data.array[i * stride + offset + c]`. Three.js r160 n'a pas de `getComponent()`.

---

## 18. Système d'ombres

- Toutes les 120 frames : `applySceneShadowFlags(scene)`
- Toutes les 180 frames : `rebuildShadowCasters(scene)` + `applyShadowCulling(focusPoint, maxDist)`

`_applySingleShadowCaster(root)` : sélectionne le mesh le plus grand (triangles), lui seul a `castShadow=true`.

Chaque instance stocke `castShadowOriginal` + `shadowFlagsApplied = true`. `applySceneShadowFlags` restaure via `castShadowOriginal` après culling.

Meshes sans ombres (oiseaux…) : `disableCastShadow=true, shadowFlagsApplied=true`, `castShadowOriginal` absent → pas de restauration.

**Shadow map** : `BasicShadowMap`, 1024×1024, `bias=-0.00012`, `normalBias=0.0025`. Extent adaptatif selon hauteur caméra : `shadowExtent = clamp(8, 18, cameraY * 0.58)` — réduit de ±24u fixe à ±14u typique (−40% DC shadow).

---

## 19. Système eau (`waterSurfaceOverlay.js` + `shoreField.js` + `realisticWater.js` + `shaders/shaderEau.js`)

**Refonte complète (juillet 2026, intégration Cyril)** — remplace l'ancien système (prisme d'eau par tuile, `aShoreDepth` posé CPU dans `tileMesh.js`, Voronoï bords précis + FBM advecté par courant). L'eau n'est plus fusionnée dans `terrainMerge` : `isMergeableTerrainMesh()` l'exclut explicitement, elle est entièrement rendue par `waterSurfaceOverlay.js`.

**`waterSurfaceOverlay.js`** — nappe continue PAR ZONE (pas par tuile) : trois géométries fusionnées construites depuis les secteurs eau posés :
1. **SURFACE** — nappe plate transparente à `WATER_RENDER.surfaceY`, `ShaderMaterial` de `realisticWater.js`.
2. **RIVERBED** — même empreinte à `WATER_RENDER.riverbedY` (profondeur 0.10), opaque, vu par transparence.
3. **SKIRT** — quads verticaux sur le contour eau↔non-eau, ferme le volume.

**Rivage organique** (`shoreField.js`) : `shoreNoise(x, z)` (sinus superposés, continu en coordonnées monde) déplace les sommets du CONTOUR le long de leur normale sortante — tout sommet partagé entre tuiles reçoit le même décalage ⇒ pas de déchirure, la zone dessine une seule courbe organique. `shoreSteepness(x, z)` (basse fréquence) module la longueur du dégradé de profondeur et la portée d'écume (abrupt vs plage douce). `buildShoreDisplacementMap(placedTiles)` (exporté) reconstruit la table de déplacement ; `displaceShorePoint(map, x, z)` l'applique. Ces deux exports sont réutilisés tels quels par `waterBeachGeometry.js` (via `waterZoneOverlay.js`, qui calcule la table une fois par rebuild et la transmet à `createWaterBeachMesh(zone, placedTiles, shoreMap)`) : les plages épousent donc exactement le même rivage ondulé que la nappe, sommet pour sommet (même clé `"x,z"` arrondie).

**Attributs shader** : `aShoreDist` (distance monde continue au contour, via champ de distance point-segment sur les segments de jupe) et `aSteep` (profil de rive baked par sommet) — remplacent `aShoreDepth`.

**Vertex shader** : vague simple `(sin(x·1.8+t·1.05) + sin(z·2.3−t·1.30))·0.5`, amortie près du bord (`waveDamp = smoothstep(0, 0.35, aShoreDist)`).

**Fragment pipeline** — écume voronoï animée façon Danil (portée de `FOAM_GLSL`, partagé avec le sillage des bateaux) :
1. Profondeur : `depthT = smoothstep(0, deepDist, aShoreDist)` avec `deepDist` variable selon `aSteep`.
2. Normales de vague (dérivées finies, eps=0.16).
3. Faux reflets ciel (Fresnel `pow(1−NdotV,3)×0.32`) + glints spéculaires soleil.
4. Écume : produit de deux voronoï lissés IQ (`foamTex`) → seuil qui monte de la surface (`uFoamAmbient`, subtil) vers la rive (`uFoamDensity`, dense), portée `uFoamWidth` modulée par `aSteep`.
5. Alpha : `uOpacity × mix(0.66,1.0,depthT)`, plancher relevé par l'écume.
6. Gamma `pow(base, 0.9)`.

**Réglages live** : intégrés dans le panel CUSTOMISATION/EDA (onglet Environnement, rubriques 1 "🫧 Écume" et 2 "🚤 Sillage bateau", cf. §13) — sliders écume (portée, finesse, densité rive/surface, netteté, vitesse, étendue dégradé, opacité) + sillage bateau (largeur, divergence, longueur, finesse, densité, opacité). Setters/getters : `getWaterFoamParams/setWaterFoamParams` (`realisticWater.js`), `getWakeParams/setWakeParams` (`shaders/waterBoatOverlay.js`). `waterDebugUi.js` (ancien panneau flottant autonome 💧 EAU, fusionné dans l'EDA) supprimé le 2026-07-04 — code mort, `createWaterDebugPanel()` n'était plus appelé nulle part.

**Sillage bateau** (`shaders/waterBoatOverlay.js`) : ruban en V dynamique (`WAKE_MAX_POINTS = 26`), dense près du bateau et se dissipant vers l'arrière (gradient de densité dans `foamPattern`), `ShaderMaterial` singleton partagé par tous les sillages. Points enregistrés à distance ABSOLUE derrière le bateau (`dBehind`, anti-pop à l'ajout/retrait d'un point) ; tête du ruban recollée au bateau chaque frame (apex fluide, pas de saut au commit d'un nouveau segment). Fondu de queue qui atteint vraiment 0 (`smoothstep(0.45, 1.0, vAlong)`, plus d'arrêt net). **LOD bateau (fix 2026-07-03)** : `updateWaterBoatLOD` calcule désormais la distance caméra↔bateau en 3D complet (X+Y+Z) au lieu de XZ seul — corrige un bug où la vue verticale (top-down, caméra XZ ≈ bateau XZ, dist2D≈0) rendait les bateaux toujours visibles quelle que soit l'altitude caméra.

**LOD nappe d'eau** (`waterSurfaceOverlay.js::updateWaterSurfaceLOD` + `realisticWater.js::getFlatWaterMaterial`, 2026-07-02) : au-delà de `LOD_WATER_SHADER_DISTANCE = 16` (distance caméra→centre de tuile, XZ), les triangles de la nappe basculent du matériau shader complet (voronoï d'écume ×2, reflets, vagues — coûteux) vers un matériau plat (`MeshBasicMaterial` bleu uni, sans normale requise). Bascule via `geometry.groups` (2 matériaux sur le même `BufferGeometry`, `lodRanges` calculées une fois par rebuild, tuiles contiguës fusionnées en groupes) — aucun re-upload GPU des sommets. Même matériau plat réutilisé pour les tuiles fantômes (`tileMesh.js` : hover local + curseurs multijoueur distants), qui n'ont de toute façon pas les attributs `aShoreDist`/`aSteep`. **Piège vécu** : un `MeshLambertMaterial` essayé en premier — sans attribut `normal` sur la nappe fusionnée (seuls position/aShoreDist/aSteep fournis), le vecteur normal nul produit un NaN après normalisation dans le vertex shader → triangles clippés → l'eau lointaine devenait invisible au lieu de bleu uni. `MeshBasicMaterial` (non éclairé) n'a besoin d'aucune normale — fix retenu. cf. piège en §26.

**Nettoyage CPU (`tileMesh.js`)** : les secteurs/centre eau ne construisent plus AUCUNE géométrie terrain (plus de ragged edges, triangulation, attribut bathymétrique) — c'était un mesh masqué par `hideTerrainMeshes()` et exclu du merge, donc invisible et inutile. Seul le label de valeur (`isValueLabel`) reste créé pour les secteurs eau. Conséquence : `scene.js` n'a plus besoin de calculer de compteur de voisins eau à la pose — `addTileToTerrainMerge()` (merge incrémental O(1)) s'applique désormais uniformément, même pour les tuiles contenant de l'eau (avant : rebuild complet du terrain à chaque pose d'eau, pour rafraîchir l'ex-`aShoreDepth` des voisins).

---

## 19b. Courbure du monde — bouliste/platiste (`worldCurvature.js`)

Mode "bouliste" : le monde entier est simulé comme une calotte sphérique via un drop GPU (uniform `uWorldCurvatureEnabled` + fonction GLSL `dorfromantikApplyWorldCurvature`, injectée dans les vertex shaders concernés) et une fonction CPU miroir `getWorldCurvatureDrop(x, z)` (picking souris, placement d'objets). Bascule `setWorldShapeMode('bouliste'|'platiste')`.

**Fix rotondité — formule de drop (2026-07-03)** : l'ancienne formule (vraie corde de sphère, `-(R − √(R²−dist²))`) a une dérivée qui explose à l'approche de `dist = R`, et devient un NaN au-delà (racine négative). Un garde-fou `maxDrop` (plafond dur, réduit de 240 à 60 après un incident réel — positions Y≈−240 générant des coordonnées clip-space pathologiques en caméra rasante, artefacts GPU gris/orange/rouge à l'horizon) limitait la casse sans traiter la cause. Remplacée par une calotte paramétrée par la DISTANCE D'ARC : `drop = -R·(1 − cos(dist/R))`. Domaine illimité (cos défini partout, jamais de NaN), développement de Taylor en 0 identique à l'ancienne parabole (même intensité perçue près du centre), pente bornée (`|sin(dist/R)| ≤ 1`, plus d'explosion de dérivée), plateau naturel lisse à `dist = R·π` (profondeur max = `2R`, sans clamp arbitraire sur la valeur). `maxDrop = 60` reste comme filet de sécurité dormant (le max naturel `2·radius = 44` reste en dessous).

**Inclinaison des objets posés — `getCurvatureTiltQuaternion(worldX, worldZ, target, strength=1)`** : nouveau, calcule le quaternion qui incline un objet perpendiculairement à la surface courbée en son point, dérivé au 1er ordre de la même formule de drop (axe non normalisé `(nx, 1+nx²+nz², nz)`, avec `nx,nz` les dérivées partielles de drop). Paramètre `strength` (slerp vers l'identité) pour atténuer le tilt sur les objets à arêtes droites — l'inclinaison géométrique réelle peut atteindre 45° près de "l'équateur" de la calotte (`R·π/2`, une pente RÉELLE, pas un bug), beaucoup plus choquante à l'œil sur un bâtiment que sur un arbre à angle égal.
- `forestOverlay.js`, `naturalPropsOverlay.js` : `strength = 1` (tilt géométrique complet — objets organiques).
- `houseOverlay.js` (maisons + tours de guet) : `HOUSE_TILT_STRENGTH = 0.5` (tilt atténué de moitié).
- Charrettes/animaux/panneaux/tonneaux/barques (`villageDecorOverlay.js`), rails/trains : **pas de tilt appliqué** — gap connu, non traité à ce jour.

**Fix arêtes latérales des tuiles — `tileMesh.js::_sideBottomShift(localX, localZ, worldX, worldZ, depth)`** : les faces latérales (jupe) d'une tuile restaient verticales même en mode bouliste — le sommet haut et le sommet bas d'une face partagent le même XZ, donc reçoivent le même drop GPU, donc la face ne s'incline jamais avec la courbure environnante → décalage/interstice visible entre tuiles voisines sur une surface censée être continue. Fix : décale le BAS de chaque face de `(dx, dz)` (même dérivation au 1er ordre que `getCurvatureTiltQuaternion` : `dx = depth·nx/(1+nx²+nz²)`, `dz` idem) pour que le vecteur haut→bas s'aligne sur la normale de surface. C'est ce fix qui corrige le défaut de continuité ("rotondité") entre tuiles en mode bouliste.

**`markNoWorldCurvature(object)`** : exclut récursivement un objet (+ ses enfants) du shader de courbure GPU via `userData.disableWorldCurvature = true` — réservé à ce qui n'appartient pas géométriquement au "monde" courbé : ciel/nuages (`cloudSky.js`), étoiles (`starUniverse.js`), comètes (`cometSky.js`), soleil visuel (`threeSetup.js`), segments de halo déjà baked en Y (`waterZoneBoundary.js`, Y calculé une fois via `getWorldCurvatureDrop` puis figé — pas de double application).

**`applySceneCurvatureFlags(scene)` (`threeSetup.js`)** : parcourt récursivement un sous-arbre et injecte `dorfromantikApplyWorldCurvature` dans `onBeforeCompile` de chaque matériau éligible (une fois — `material.userData.worldCurvatureApplied`), sauf les `ShaderMaterial` (déjà câblés manuellement via `WORLD_CURVATURE_SHADER` dans leur propre GLSL — eau, sillage bateau, blé, herbe) et les objets `markNoWorldCurvature`. Appelé après chaque rebuild d'overlay / pose de tuile pour couvrir les nouveaux meshes (nombreux points d'appel dans `scene.js`).

---

## 20. Architecture fichiers (principaux)

> **Depuis le 2026-07-13 (cf. §21), tous les `.js` du jeu vivent dans `javascript/`** (avant :
> à la racine de `_sources`, comme décrit historiquement dans cette section — les chemins
> ci-dessous restent valides EN TERME DE NOMS/RÔLES DE FICHIERS, mais sont désormais tous
> préfixés `javascript/`). `game.php` charge `<script type="module" src="javascript/main.js">`.
> Le sous-dossier `stable/` a été supprimé mi-2026.
> `javascript/shaders/` contient le GLSL pur (`shaderXxx.js`) **et**, depuis le 2026-07-11
> (cf. §21), deux modules overlay avec shader embarqué déplacés depuis la racine :
> `waterBoatOverlay.js` et `morningMistOverlay.js`.

### Arborescence JSON (données persistées serveur)

```
json/
  ambiances.json        Presets LUT (16 presets) — chargé par edaPanelWiring.js
  highscores.json       Classement (géré par highscore.php, max 50 entrées)
  games/                Sauvegardes parties multijoueur (géré par multiplayer.php)
    room_<code>.json    Une partie = un fichier JSON
```

PHP : `highscore.php` → `__DIR__ . '/json/highscores.json'` · `multiplayer.php` → `$rootDir . '/json/games'`.

```
config.js / variables.js       Constantes (config = re-export de variables)
main.js                        Bootstrap
scene.js                       Orchestrateur principal
preloader.js                   Préchargement GLB + OGG avant le menu
tileGenerator.js               Génération tuiles
tileMesh.js / tileTextures.js  Géométrie et textures tuiles ; dessin canvas délégué à
                                tileTextureDrawing.js (split 2026-07-11, §21)
terrainHeight.js               Surface Y, relief, normale
terrainMerge.js                Fusion meshes terrain par biome (~14 DCs) — eau exclue (cf. §19)
hex.js / hexGeometry.js        Coordonnées axiales, géométrie hex
tileUtils.js / zoneUtils.js    Utilitaires tuiles et BFS zones
placementRules.js / scoring.js / gameRules.js
placementOverlay.js            UI hover placement (ghost tuile)
propPlacement.js               Helpers snap terrain, sécurité ground type
propHitboxRegistry.js          Registre hitboxes collision props (évite chevauchements)
raggedEdge.js                  Bords irréguliers du plateau
random.js                      Générateur pseudo-aléatoire
tileRailOverlay.js             Rails procéduraux
railTrainOverlay.js            Trains GLB, wagons, gares — scindé en 2026-07-11 (§21) : constantes dans
                                railTrainConstants.js, graphe nav railGraph.js, gares railStations.js,
                                véhicules railTrainVehicle.js, chargement GLB railTrackGlb.js
waterZoneOverlay.js            BFS zones eau, calcule et transmet le shoreMap organique ; labels sprites
                                délégués à waterZoneLabels.js (split 2026-07-11, §21)
waterSurfaceOverlay.js         Nappe d'eau continue par zone (surface+riverbed+jupe), rivage organique
shoreField.js                  shoreNoise/shoreSteepness — bruit de rivage organique, buildShoreDisplacementMap
waterBeachGeometry.js          Plages procédurales, épouse le rivage organique via shoreMap partagé
waterZoneBoundary.js           Halos/contours de zone (générique tous biomes, bords droits)
shaders/waterBoatOverlay.js    Bateaux GLB animés + sillage en V (écume) — déplacé dans shaders/ le 2026-07-11 (§21)
realisticWater.js              ShaderMaterial eau « cute cartoon » + écume Danil, réglages live
shaders/shaderEau.js           GLSL eau (aShoreDist/aSteep) + FOAM_GLSL partagé (eau + sillage)
fieldWheatOverlay.js           Brins de blé procéduraux, BFS local
fieldZonesOverlay.js           Moulins, bâtiments spéciaux, safe zones
grassBladeOverlay.js           Brins d'herbe Bezier animés
forestOverlay.js               Arbres InstancedMesh
houseOverlay.js                Village GLB
houseVillageMaterials.js       Matériaux partagés maisons/village
houseVillageObjects.js         Maisons, tours, église
decorOverlay.js                Orchestrateur props décor + PROP_MODEL_DEFS + constantes partagées ;
                                chargement GLB props délégué à decorPropModels.js, oiseaux/mouettes à
                                decorBirdModels.js (split 2026-07-11, §21)
naturalPropsOverlay.js         Fleurs, rochers, roseaux, bottes, cerfs (InstancedMesh)
villageDecorOverlay.js         Panneaux, charrettes, chiens, chevaux, barques côtières
bonusCellChestOverlay.js       Coffres animés cellules bonus
threeSetup.js                  Renderer, caméra, postprocess, layers, IBL, sun orbit — importe
                                CINEMATIC_SHADER directement depuis shaders/shaderCinematique.js
                                (cinematicPass.js, simple ré-export, supprimé le 2026-07-11, §21)
visualEnvironment.js           LUT, lumières, environnement IBL, config défaut
edaPanelHost.js                Façade panel CUSTOMISATION (DOM partagé) — ex-debugLightUi.js (renommé 2026-07-11, §21) ;
                                CSS extrait le même jour vers css/eda.css (ex-installDebugLightCss(), §21)
hud_fps.js                     HUD perf avancé (touche F), self-contained — extrait de debugLightUi.js le 2026-07-02
edaPanelWiring.js              Câblage panel EDA 3 onglets (wireEdaPanel) — ex-hud_eda.js (renommé 2026-07-11, §21)
sceneProfiler.js               Comptage DC/triangles/objets par catégorie (HUD)
worldCurvature.js              Courbure monde GPU (calotte, drop en cos) + picking souris + tilt props (§19b)
shadowCulling.js               Culling ombres par distance
soundDesign.js                 Audio spatial, layers, chi-mai, corbeaux, ambiances — scindé en
                                musicPlayer.js (lecture musicale) + ambientSoundDesign.js (ambiances
                                environnementales) le 2026-07-11 (§21)
globalWind.js / starUniverse.js / cometSky.js
cloudSky.js / shaders/shaderCiel.js   Ciel volumétrique nuages procéduraux
smokeVolumePass.js                    ShaderPass fumée volumétrique (maisons + locos)
shaders/shaderFumee.js                GLSL ray-march fumée (Gaussian évasé, turbulence 4 octaves, depth test)
hashUtils.js / hexLabelFont.js / tileLabels.js
domUtils.js                    escapeHtml() canonique (2026-07-11, factorisation — cf. §21)
gameLangReactive.js            Orchestrateur central du changement de langue en jeu (getGameLang/
                                setGameLang/registerLangRefresh) — ajouté 2026-07-13, cf. §21
bonusCells.js / specialCells.js / highscore.js
multiplayerClient.js / controls.js / missions.js — missions.js : labels/icônes/formatMissionTitle
                                délégués à missionLabels.js (split 2026-07-11, §21)
startupMenu.js                 Menus démarrage/multijoueur — ex-multiplayerUi.js (renommé + scindé
                                2026-07-11, §21) : carrousel fond menuBackgroundCarousel.js, salons
                                multiplayerRooms.js, état partagé startupMenuShared.js
ui.js / help.js / grid.js / gridRegions.js — help.js : textes délégués à helpTexts.js, tooltips à
                                helpTooltip.js (split 2026-07-11, §21)
scorePopup.js                  Popup score central "+N" (WAAPI, pose locale uniquement) — cf. historique 2026-07-10 (§21)
contentDensity.js                     Multiplicateur densité contenu (qualité/FPS), scaledCount/scaledCountMin (§21)
                                       — UI dans edaPanelWiring.js (onglet Environnement, rubrique 7 "Qualité/densité",
                                       2026-07-08 ; ex-panneau flottant qualityUi.js, supprimé)
environmentDirector.js                Machine à états évènements environnementaux — branché depuis le merge VFX météo
                                       Cyril du 2026-07-09 (§29, moteur wawa-vfx-vanilla : brume/lucioles/pluie/orage)
                                       — UI dans edaPanelWiring.js (onglet Environnement, rubrique 8 "Météo", 2026-07-08 ;
                                       ex-panneau flottant environmentDebugUi.js, supprimé)
shaders/morningMistOverlay.js         Modulation fog pour évènement 'morningMist' — appelée dans animate() depuis le
                                       merge VFX Cyril du 2026-07-09 (§29) ; déplacé dans shaders/ le 2026-07-11 (§21).
                                       Note : ce commentaire disait encore "dormant/NON appelée" avant cette correction,
                                       stale depuis le merge du 07-09 — corrigé au passage (§21)
```

---

## 21. Historique — épisodes non couverts ailleurs

La quasi-totalité des évolutions passées (eau, courbure monde, panel EDA, fumée, ciel, LOD, pools de props, HUD…) est documentée à l'**état courant** dans ses sections dédiées (§6 à §20) — inutile de dupliquer un journal des changements en plus. Seuls les épisodes suivants (chronologiques) ne sont capturés nulle part ailleurs — root causes, décisions arbitrées avec l'utilisateur, pièges non génériques :

**⚠️ Merge VFX Cyril intégralement annulé** (2026-07-03) : un merge annoncé (god rays, feu/tornade/éclair/embers, cycle jour/nuit progressif, brume, audio VFX — 14 fichiers dont `vfxEngine.js`, `dayNightCycle.js`, `effectScheduler.js`, `mistManager.js`, `particlePool.js`, `effects/*`, `shaders/shaderGodRays.js`, `shaders/shaderParticles.js`) a été entièrement défait sur décision utilisateur ("aucune n'a été validée"). Aucun de ces fichiers n'existe dans les sources, `HEXISTENZ_VERSION` est resté à `v0.9.1.10`. **Ne pas supposer ce système présent** dans une future session — vérifier par `grep`/`find` avant de s'y référer.

**Merge du système eau (intégration Cyril, 2026-07-01)** — branche partie d'une base vieille de 3 jours, 3 régressions repérées et écartées à l'intégration (suppression `sheepOverlay`, retour `TREE_WIND.strength` à 0.062, perte d'arguments `maybeGenerateMissionForTile`/`updateDeckUI`). Leçon : rediffer chaque fichier touché, pas seulement merger — cf. piège §26.

**⚙️ Throttle GPU périodique résolu — curseurs multijoueur fantômes jamais expirés** (2026-07-06, v0.9.2) : investigation de ~2 jours sur un GPU qui throttlait (jusqu'à 100%) même caméra/scène strictement immobiles, en solo comme en multi — sauf qu'il n'existe plus de vrai mode solo dans Hexistenz (toute partie est jouable en multijoueur via `?multi=CODE`). Root cause : `multiplayer.php::update_cursor()` ajoutait un curseur par `playerId` à chaque survol distant mais n'en supprimait **jamais** côté serveur. Une room de test (`room_SMALL.json`) avait accumulé 21 curseurs fantômes, certains vieux de +24 jours, tous `visible=true` pour toujours — chacun faisait recréer un mesh de tuile transparent (`DoubleSide`) via `renderRemoteCursors()` (scene.js) toutes les 900ms (`setInterval(refreshMultiplayerRoom, 900)`), soit le cycle de ~51-54 frames observé depuis le début. Le nombre de fantômes grossissait à chaque nouvelle session de test, expliquant l'aggravation progressive du symptôme au fil des jours. Fix : purge automatique par TTL (20s) côté serveur (`prune_stale_cursors()`, appelée sur `poll` et `cursor`) + filtre défensif identique côté client. Résultat validé : GPU 100% → 2-3% en caméra haute idle. cf. piège en §26.

**📋 Merge Cyril → sources live (2026-07-07)** : dossier reçu de Cyril, fusionné manuellement fichier par fichier (pas de git ici). Même piège que le merge eau du 07-01 : branche partie d'une base antérieure au 07-06, plusieurs fichiers réintroduisaient des régressions sur des optims déjà validées (instancing personnages §9/§17, LOD baies/herbe, VOLUMETRIC_SMOKE_ENABLED, reflets eau) — chaque fichier rediffé individuellement avant merge.
- **Adopté** : `contentDensity.js`/`qualityUi.js` (densité de contenu, bouton "⚙ QUALITÉ", appliqué à moutons/herbe/props naturels, PAS aux personnages) ; frustum culling `updateRailTrainLOD`/`updateWaterBoatLOD` ; réglages perf `threeSetup.js` ; `FOREST_CHUNK_SIZE=6` ; simplification shader d'eau (retrait Fresnel/glints, validé) ; scaffolding VFX Phase 0/1a inerte (`environmentDirector.js` etc., branché seulement au 07-09, cf. ci-dessous).
- **Rejeté** (version actuelle gardée, plus récente/validée) : `characterOverlay.js`/`decorOverlay.js`/`sceneProfiler.js` (Cyril revenait à des personnages non instanciés) ; `waterSurfaceOverlay.js` (retirait le `lodFactor` LOD caméra) ; `VOLUMETRIC_SMOKE_ENABLED=false` (fumée reste activée par défaut) ; fonctions de diagnostic per-frame `scene.js` (throttle GPU déjà résolu, cf. ci-dessous).

**📋 Suite du merge Cyril — ajustements utilisateur (2026-07-08)** : quatre retouches sur la base intégrée la veille, toutes validées par l'utilisateur.
- **Touche C (cinéma) retirée intégralement** — l'utilisateur n'en voulait plus du tout : handler `key === 'c'` supprimé de `scene.js`, méthode `postprocess.toggleCinema()` supprimée de `threeSetup.js` (devenue inatteignable, plus aucun appelant), commentaires stales corrigés dans `hud_eda.js`. Le master switch CINÉMATIQUE reste accessible uniquement via sa case à cocher dans le panel EDA (`cinEnabledEl`, indépendante de `toggleCinema()`). Aides mises à jour (`game.php`, prez).
- **Bouton flottant qualityUi.js supprimé** — son contenu (titre, 4 presets, slider densité) migré dans le panel EDA, onglet Environnement, nouvelle **rubrique 7 "Qualité/densité"** (`hud_eda.js`), avec les classes CSS standards de l'EDA (`.debug-light-preset-btn`, `createRawSlider`, tooltip `LUT_HELP['quality.density']`) à la place des styles inline de Cyril. Réglage machine (perf), pas "regard" → hors undo/redo et hors export 📋 Copier, même traitement que Forme du monde/Jour-Nuit. Fichier `qualityUi.js` supprimé (même sort que `waterDebugUi.js` en 2026-07-04).
- **Prez (`index.php`)** : ajout clic gauche/droit + molette au bandeau raccourcis (`.kbd-strip`), carte fumée volumétrique passée du dégradé CSS placeholder à la vraie image `images/fumees.jpg` (CSS `.daynight-scene`/`.scene-fumee` retiré, devenu inutile).

**📋 EDA — refonte flux journal 3 colonnes + rubrique Météo (2026-07-08, seconde salve)** : cinq changements consécutifs sur le panel EDA, tous validés au fil de l'eau par l'utilisateur.
- **Layout 3 colonnes fluides type journal** — remplacement du layout flex `2 colonnes rigides par onglet` par un CSS `columns: 3; column-gap: 14px` sur `.debug-light-columns`, avec `break-inside: avoid` sur chaque rubrique enfant direct. Les rubriques remplissent la col 1, puis 2, puis 3, sans jamais être coupées. Une seule barre de scroll par onglet (les 3 colonnes s'étirent sur la même hauteur). Panel élargi de +40 % (`LUT_WIDTH_FACTOR: 2 → 2.8 × #tileUI`). Aplatissement du markup : retrait des wrappers `.debug-light-lut-scroll`/`.debug-light-col-right`/`.debug-light-col-third`/`#debugLightPaletteHost` ; retrait des `hostId` sur les sections LUT (Étalonnage/Palette biomes rejoignent le flux commun) ; sur l'onglet Cinématique, éclatement de l'ex-grosse `.debug-light-cinema-section` unique en 4 sections indépendantes (Cinéma base / God Rays / Tilt-shift / Bloom) — le toggle master reste sémantiquement identique via `querySelectorAll('.debug-light-cinema-section').forEach(...)`.
- **⚠️ Piège backticks CSS** — première tentative écran noir (`Uncaught SyntaxError: Unexpected token 'break'`) : trois commentaires CSS du nouveau bloc contenaient des backticks stylistiques (`` `break-inside: avoid` ``, `` `columns: 3` ``) qui fermaient le template literal JS `style.textContent = \`...\`` de `debugLightUi.js::installDebugLightCss`. Remplacés par des apostrophes. **Interdit** d'utiliser des backticks dans **tout** commentaire à l'intérieur d'un template literal (cf. mémoire `feedback-backticks-template-css`).
- **Rubrique 8 Météo** — fusion de l'ex-HUD flottant `environmentDebugUi.js` ("🌦 ENV") dans l'onglet Environnement, cf. §13 sous-section 8. `environmentDirector` créé **avant** `createDebugLightUI(...)` dans `scene.js` et passé en param → `wireEdaPanel`. API du director inchangée (`triggerEnvironmentEvent`/`stopEnvironmentEvent`/`stopAllEnvironmentEvents`/`isEnvironmentEventActive`/`onEnvironmentChange`) : aucun hook cassé. Fichier `environmentDebugUi.js` supprimé (même sort que `qualityUi.js` la veille, `waterDebugUi.js` en 2026-07-04).
- **Titres de rubrique uniformisés + fond sombre** — bandeau `background: rgba(0,0,0,0.45)` + `border-left: 3px solid rgba(145,205,255,0.32)` + `padding: 6px 10px` + `border-radius: 6px` appliqué à `.debug-light-pix-head` et `.lut-section-head`. `.lut-section-head--nested` (Blé/Herbe/Arbres) reçoit une version plus légère (fond 0.30, barre 2px). `text-transform: uppercase` ajouté à `.debug-light-pix-head > span` qui ne l'avait pas — cause identifiée de l'incohérence de casse dénoncée par l'utilisateur (Météo/God Rays/Tilt-shift restaient en Title Case). Tous les titres apparaissent désormais en majuscules 12px letter-spacing 0.18em.
- **Séparateurs horizontaux retirés** — le flux journal + `margin-bottom: 14px` sur chaque enfant direct de `.debug-light-columns` fournissent l'espacement. Le `.debug-light-pix-sep` créé côté JS entre les sections LUT a été supprimé (la boucle `for (const section of LUT_SECTIONS)` fait maintenant `controls.appendChild(sectionEl)` sans séparateur préliminaire). Idem `waterSep` entre Écume et Sillage bateau, et `border-top`/`padding-top`/`margin-top` retirés de `.lut-section-head--nested` (séparateurs 4.1↔4.2↔4.3). Les séparateurs top-level du markup HTML (`.debug-light-columns > .debug-light-pix-sep`) sont masqués défensivement en CSS (`display: none`) au cas où un futur ajout en injecterait un.
- **Boutons Météo alignés sur la charte EDA** — première version des `.debug-light-weather-btn` (padding 4/6, font-size 10px) trop compacte et collée : passés à `padding: 8px 9px`, `border-radius: 8px`, `font-size: 11px`, `box-shadow: 0 2px 6px rgba(0,0,0,0.30)` — mêmes valeurs que `.debug-light-preset-btn`. Wrapper `#debugLightWeatherRows { display:flex; flex-direction:column; gap: 10px }` pour aérer les 7 lignes.

**📋 Prez — nav mobile + variété des personnages (2026-07-08)** : `index.php`/`presentation.css`. Nav responsive cassée sous 900px (menu masqué sans alternative) → hamburger + dropdown. Le seuil pixel-perfect s'est révélé impossible à caler (signalé "trop tôt" après plusieurs remontées) — remplacé par un fallback tolérant : `flex-wrap` à 1300px (nav sur 2 lignes) avant bascule en dropdown à 860px (seuil bas, zone tactile sans ambiguïté). Leçon : face à un seuil responsive contesté, préférer un fallback qui absorbe l'incertitude plutôt qu'ajuster un chiffre exact. Séparément, section `#creatures` enrichie d'un bloc `.population-strip` listant les 22 archétypes réels de `characterOverlay.js` (la vitrine n'en montrait que 3).

**📋 Merge VFX météo Cyril → sources live (2026-07-09, validé)** : intégration du moteur d'effets météo qui branche enfin les hooks `environmentDirector` restés inertes depuis le scaffolding Phase 0/1a du 2026-07-07. Système décrit à l'état courant en **§29**. Contrairement aux deux merges précédents (eau 07-01, Cyril 07-07), celui-ci était **propre** : diff préalable confirmé comme superset strict des versions live (uniquement des ajouts) → copie directe sans risque. Point de vigilance résolu : les nouveaux fichiers importent THREE via l'URL CDN et via le specifier nu `"three"` — l'importmap de `game.php` remappe les deux vers `./vendor/three.module.js` local → une seule instance, pas de duplication.

**📋 Authentification joueur — OAuth étudié puis abandonné au profit d'un fix léger (2026-07-11)** : analyse de faisabilité demandée pour éviter de redemander le pseudo à chaque partie. Constat : pas de DB/sessions côté serveur, HTTPS OK en prod (hexistenz.world) mais réplique de test 192.168.0.41 en HTTP seul — casserait le flux normal "tester en local avant prod" pour un vrai OAuth. Décision utilisateur : abandon OAuth, fix minimal retenu. Implémenté dans `highscore.js` : clé `localStorage['hexistenz.playerName']` (fallback sur la clé multijoueur existante `dorfromantik.multiplayer.name`), champ pseudo préempli au chargement, valeur conservée (plus jamais vidée) après soumission réussie d'un score.

**📋 Factorisation doublons triviaux + régression `clonePlain` (2026-07-11)** : audit complet des sources sur demande utilisateur ("factoriser ce qui peut l'être, pas de duplicatas") — rapport livré, seul le lot "doublons triviaux à risque nul" autorisé (rail/boat, blé/herbe, découpage scene.js/hud_eda.js explicitement hors périmètre, décision séparée). Dix identifiants consolidés : `escapeHtml` → `domUtils.js` ; `mulberry32`/`pickRandom` → `random.js` ; `easeInOutSine`/`clamp` → `tileUtils.js` ; `hashRaggedInnerEdge`/`hashRaggedEdge`/`hash01` → import direct depuis `raggedEdge.js` (déjà la source canonique) ; `serializeMissionManager`/`clonePlain` → `missions.js` ; `getHexDistance` → `hex.js` (variante morte de `houseOverlay.js` supprimée, jamais appelée) ; `shortestHueDelta` → gardé canonique dans `realisticWater.js`, importé par `tileTextures.js` (sens choisi pour éviter un import circulaire) ; `getGridPlaneY()` (qui ne faisait que retourner `0.003` en dur) → remplacé par la constante `GROUND_CLEARANCE` (`propPlacement.js`) directement dans `bonusCells.js`/`bonusCellChestOverlay.js`.
**Régression vécue** : suppression du `clonePlain` local de `multiplayerUi.js` en ne vérifiant son usage que dans `serializeMissionManager` de ce même fichier — 4 autres appels indépendants (deck/specialCells/bonusCells, sérialisation multijoueur) l'utilisaient encore, cassant le chargement de partie (`clonePlain is not defined`). Fix : ajouté à l'import existant depuis `missions.js`. cf. piège §26.

**📋 Popup de score central "+N" (`scorePopup.js`, 2026-07-10)** : module autonome, valeur du dernier coup affichée brièvement au centre écran après une pose LOCALE (seul point d'appel `scene.js::placeTile()` — pas branché sur hit comète/undo/sync multi/extension grille). Architecture : `scorePopup.js` (`showScorePopup(score)`) + `#scorePopup` (`game.php`) + `css/scorePopup.css` (lié séparément via `<link>`, **pas** importé par `css/style.css` — ne pas oublier ce lien si `style.css` est réorganisé). DOM pur `position:fixed`, `z-index:500`, Web Animations API (un seul `Animation` actif, annulé/relancé proprement si un nouveau score arrive pendant l'anim). État final : `font-size` 208px (mobile 132px), `ANIM_DURATION_MS = 1650`, `prefers-reduced-motion` : fondu simple 650ms. Leçon : l'utilisateur a redemandé "plus grand/plus long" deux fois d'affilée le même jour — si un 3ᵉ tour survient, augmenter directement par palier plutôt que redemander une valeur précise.

**📋 EDA — fusion VFX MÉTÉO dans la rubrique 8 Météo (`hud_eda.js` + `debugLightUi.js`, 2026-07-10)** : demande utilisateur pour résoudre une incohérence de numérotation de l'onglet Environnement — la rubrique "2. VFX MÉTÉO" (ajoutée lors du merge Cyril du 2026-07-09, §29) coexistait avec "2. Sillage bateau" (généré dynamiquement dans `.debug-light-water-section`, cf. §13), soit deux rubriques "2." distinctes en même temps.
- **Changement** — le wrapper `<div class="debug-light-vfx-section">` (en-tête propre "🌫️ 2. VFX MÉTÉO") supprimé de `hud_eda.js` ; son contenu, `<div id="debugLightVfxControls">`, déplacé physiquement dans `.debug-light-weather-section` (rubrique "8. Météo"), après `#debugLightWeatherRows` et le bouton `⏹ Tout arrêter`. Les 3 sous-rubriques internes (🌫️ Brume matinale / ✨ Lucioles / 🌧️ Pluie-Orage, avec bouton ↺ chacune) sont conservées telles quelles.
- **Câblage JS inchangé** — `root.querySelector('#debugLightVfxControls')` (ligne ~1023 de `hud_eda.js`) retrouve l'élément quel que soit son emplacement dans le DOM (sélection par id) : aucune autre modification de logique nécessaire, seul le HTML statique a bougé.
- **Nettoyage CSS** — `.debug-light-vfx-section`, devenue une classe morte (plus aucun élément du markup ne la porte), retirée des deux listes de sélecteurs de `debugLightUi.js` (`display:flex/gap:8px` partagé, et `break-inside:avoid` des rubriques top-level du flux journal).
- **Résultat** — numérotation à plat de l'onglet Environnement à nouveau sans collision : 1 Écume · 2 Sillage bateau · 3 Nuages · 4 Vent (4.1/4.2/4.3) · 5 Forme du monde · 6 Jour/Nuit · 7 Qualité/densité · 8 Météo (déclencheurs d'évènements + réglages fins brume/lucioles/pluie, fusionnés). Le tableau récapitulatif de §13 (ligne ~427) était déjà correct dans cet état — jamais mis à jour lors de l'ajout de l'ex-rubrique 2, il redevient simplement exact.

**🐛 Bug highscore.js — panneau HUD invisible en permanence (2026-07-11)** : signalé par l'utilisateur après une partie "abandonner" — score/stats jamais écrits dans `json/highscores.json`. Root cause : `css/highscore.css` contenait une règle orpheline `.highscore-panel { display: none; }`, sans aucun toggle JS ni CSS pour la réactiver — le panneau entier (liste ET prompt pseudo/OK) était donc invisible en permanence, pas seulement après un abandon. Fix : règle supprimée.

**📋 Refonte modal fin de partie + verrou anti-rejeu (2026-07-11)** : trois demandes utilisateur consécutives sur ce même flux, après le fix du bug ci-dessus.
- **Modal centré, plus gros, sans liste** — le prompt pseudo/OK est sorti du HUD `#scorePanel` : nouveau `#highscoreModal` (`game.php`), overlay plein écran centré (`.highscore-modal`, même famille visuelle que `.help-overlay`, z-index 10000), score affiché en très gros (`BebasNeue`, `clamp(52px,9vw,88px)`). La LISTE des highscores (`#highscoreList` et tout son rendu — chips stats, médailles) a été supprimée du jeu : elle ne vit plus que dans la prez (`index.php`, rubrique Classement mondial, déjà lue côté PHP depuis `json/highscores.json`). `highscore.js` ne fait plus AUCUN `fetch` GET ni rendu de liste, uniquement le `POST` de soumission.
- **Pseudo retiré du modal** — le pseudo est désormais toujours connu à l'avance (saisi dans les menus `multiplayerUi.js` avant la partie) : plus de `<input>` dans le modal, `askHighscoreSubmit(elements, score, stats, playerName)` reçoit le pseudo courant de `scene.js` (variable `playerName`, avec repli sur `loadStoredName()`/`hexistenz.playerName` si absent).
- **"Enregistrer" clôt la partie** — après un POST réussi, redirection (`window.location.href = window.location.pathname`, ~700ms après confirmation) vers l'écran de sélection de nouvelle partie. Le `pathname` sans query `?multi=` évite de laisser traîner le code d'une room désormais terminée (cf. point suivant). `startNewGame()` (bouton "NOUVELLE PARTIE") suit la même logique de reload sans query.
- **Confirmation d'abandon** — `btnAbandonGame` n'appelle plus `abandonGame()` directement : un nouveau modal `#abandonConfirmModal` (même famille `.highscore-modal`) demande confirmation (boutons ANNULER/ABANDONNER, réutilisant `.new-game-button`/`.abandon-button`). `scene.js` : `requestAbandonConfirm()` → affiche le modal, `abandonGame()` → exécuté seulement au clic sur ABANDONNER.
- **Verrou anti-rejeu serveur (`multiplayer.php`)** — une partie terminée (abandon ou deck vide) ne doit plus jamais être rejouable, sinon on peut reprendre indéfiniment la même partie/les mêmes tuiles et refaire le même score à l'infini. `endGame()` (`scene.js`) appelle désormais explicitement `persistMultiplayerState()` après avoir posé `gameOver = true` — **avant ce fix, `gameOver:true` n'était jamais poussé au serveur** (le seul autre point d'appel, en fin de pose de tuile, a lieu AVANT que `gameOver` passe à `true`, et plus aucune pose ne survient après la fin de partie). Nouvelle fonction PHP `room_is_finished($room)` (vérifie `$room['gameOver']` puis repli `$room['state']['gameOver']`, déjà synchronisés en top-level par `sync_top_level_state()` existant) : `list_room_details()` exclut désormais ces rooms de la liste ("parties disponibles"), `join_room()` les rejette explicitement (409) même via un lien direct `?multi=CODE` — double verrou, liste ET jonction directe.

**📋 Prez — carte "meilleurs bâtisseurs" (`index.php`, 2026-07-11)** : piège de communication (pas de code) — la consigne "les autres stats" voulait dire UN SEUL bloc visuel `.hs-meta` regroupant locomotives/bateaux/moulins/comètes ET détail biomes, pas deux `<div>` distincts ; a demandé une dizaine d'allers-retours avant clarification. Toute future retouche doit d'abord relire la structure `$smallStats` de `index.php` en entier (une seule chaîne PHP concaténée, un seul conteneur `.hs-meta` en sortie) avant de modifier un sous-élément.

**📋 Stat "moulins" ajoutée au classement (2026-07-11)** : `millCount` propagé `highscore.js` → `highscore.php` → `index.php` (icône ⚙️). Absente des scores enregistrés avant ce fix (comportement attendu, pas un bug).

**📋 Audit fichiers volumineux/mal nommés/mal placés + 3 refactors validés sans risque (2026-07-11)** : audit demandé sur les gros fichiers scindables, les noms trompeurs et les fichiers mal placés (`/shaders` et autres). Trois constats validés par l'utilisateur et implémentés le jour même :
- **CSS extrait de `debugLightUi.js`** — `installDebugLightCss()` (~1150 lignes de CSS injectées via un template literal JS, tout le fichier ou presque) était une feuille de style déguisée en code, pas de la logique. Extrait tel quel (aucune règle modifiée) vers **`css/eda.css`**, chargé statiquement via `@import` dans `css/style.css`. Le fichier JS passe de 1211 à ~45 lignes ; plus aucune injection CSS au runtime. Élimine au passage le risque de piège backticks déjà rencontré une fois sur ce même mécanisme (cf. `feedback-backticks-template-css`, §21 entrée 2026-07-08).
- **Renommage `debugLightUi.js` → `edaPanelHost.js`, `hud_eda.js` → `edaPanelWiring.js`** — les deux anciens noms ne disaient rien de leur rôle réel (l'un pilotait un "panneau lumière de debug", l'autre un "HUD" générique, alors que les deux hébergent/câblent le même panel EDA). Renommage pur, aucun changement de comportement : les 2 imports externes (`scene.js` → `edaPanelHost.js` ; `edaPanelHost.js` → `edaPanelWiring.js`) et tous les commentaires de doc dans les fichiers tiers (`hud_fps.js`, `domUtils.js`, `environmentDirector.js`, `sceneProfiler.js`, `help.js`, `houseVillageObjects.js`, `variables.js`, `tileUtils.js`, `vfxSettings.js`) mis à jour. `wireEdaPanel`/`EDA_BODY_HTML` (exports) inchangés.
- **`waterBoatOverlay.js` et `morningMistOverlay.js` déplacés dans `shaders/`** — ces deux overlays contiennent du GLSL embarqué (shader de sillage, modulation fog) comme les autres modules déjà présents dans `shaders/` (`shaderEau.js` etc.), contrairement au reste des overlays qui vivent à la racine. Déplacement pur : imports internes vers la racine repassés en `../` (ex. `../config.js`, `../hex.js`), import déjà présent vers `./shaders/shaderEau.js` simplifié en `./shaderEau.js` (même dossier désormais). Les 4 importateurs externes (`scene.js` ×2, `edaPanelWiring.js`, `missions.js`, `waterBirdOverlay.js`) mis à jour vers `./shaders/...`. `shaders/` contient donc désormais un mélange GLSL pur + overlays à shader embarqué (cf. §20).
- **Correction au passage** : le commentaire de `morningMistOverlay.js` dans l'arborescence §20 affirmait encore "NON appelée dans animate() (dormant)" — stale depuis le merge VFX Cyril du 2026-07-09 (§21 même section) qui l'a effectivement branché. Corrigé.
- Vérifié : `node --check` sur les ~16 fichiers touchés (aucune erreur de syntaxe), grep croisé pour confirmer l'absence de référence orpheline vers les anciens chemins/noms.
- **Non retenu pour l'instant** (audité mais pas implémenté, risque jugé trop élevé pour un refactor "sans risque") : découpage de `scene.js` (une seule closure géante `initScene()`, 1901 lignes — déjà explicitement écarté par l'utilisateur lors de l'audit factorisation du 07-11, cf. entrée précédente) et de `hud_eda.js`/`edaPanelWiring.js` (`wireEdaPanel()` ~1000 lignes, même famille de closure unique) ; fusion des deux implémentations de lissage de polyligne 2D dupliquées entre `railTrainOverlay.js` et `tileRailOverlay.js` ; renommage de `config.js` (simple re-export de `variables.js`) et des fichiers dev (`generate.php`, `check-glb.php`) — nécessiterait une nouvelle décision explicite avant d'y toucher.

**📋 Audit fichiers volumineux/mal nommés/mal placés — round 2 : 4 découpages + 1 renommage + extraction CSS + 4 suppressions code mort (2026-07-11)** : suite directe de l'audit précédent, mêmes critères (découpage sans risque, renommage, déplacement, code mort), nouvelle série de propositions validées par l'utilisateur ("recommence l'analyse... -> GO").
- **`railTrainOverlay.js` scindé en 5 fichiers** — `railTrainConstants.js` (constantes partagées), `railGraph.js` (graphe de navigation), `railStations.js` (gares terminus), `railTrainVehicle.js` (locos/wagons), `railTrackGlb.js` (chargement GLB voie). Fichier d'origine devenu orchestrateur fin.
- **`help.js` scindé** — textes d'aide extraits vers `helpTexts.js`, logique d'affichage/positionnement vers `helpTooltip.js`.
- **`multiplayerUi.js` renommé `startupMenu.js` et scindé** — le nom `multiplayerUi` ne décrivait plus le rôle réel (menus de démarrage en général, pas seulement multijoueur). Sous-fichiers : `menuBackgroundCarousel.js` (carrousel visuel du fond de menu), `multiplayerRooms.js` (liste/gestion des salons), `startupMenuShared.js` (état partagé entre les deux).
- **`soundDesign.js` scindé** — `musicPlayer.js` (lecture de la musique de fond) et `ambientSoundDesign.js` (ambiances sonores environnementales, chi-mai, corbeaux, etc.).
- **CSS extrait de `preloader.js`** — même pattern que `debugLightUi.js`/`css/eda.css` de l'audit précédent : template literal CSS sorti vers un fichier `.css` dédié, chargé statiquement.
- **Code mort supprimé** — `addNaturalPropCluster` et `getTerrainTopY`, confirmés orphelins par grep repo-wide avant suppression (`getTerrainTopY` est l'origine de la `TERRAIN_RELIEF` locale devenue orpheline dans `tileMesh.js`, supprimée au round 3 ci-dessous).
- Vérifié : `node --check` sur tous les fichiers touchés + grep croisé imports, aucune référence orpheline.

**📋 Audit round 3 : 4 découpages supplémentaires + suppression code mort, avec un piège vécu (2026-07-11)** : même méthodologie, nouvelle demande "recommence l'analyse... découpages sans risque et code mort validés -> GO".
- **`waterZoneOverlay.js` → `waterZoneLabels.js`** — tous les sprites/labels de valeur de zone extraits (fichier d'origine garde BFS/hover). cf. §14.
- **`tileTextures.js` → `tileTextureDrawing.js`** — fonctions de dessin canvas extraites (`drawTexture`, `drawWaterTexture`, etc.), état animé exposé via accesseurs (`setActiveTexturePalette`/`getAnimatedTextureState`/`getAllAnimatedTextureStates`) plutôt que des bindings partagés bruts.
- **`missions.js` → `missionLabels.js`** — icônes, aide, `formatMissionLabel`/`formatMissionTitle` extraits. cf. §30.
- **`decorOverlay.js` → `decorPropModels.js` + `decorBirdModels.js`** — chargement GLB props et oiseaux/mouettes extraits, avec accesseurs `isPropModelsLoading()`/`isBirdModelLoading()`/`isSeagullModelLoading()` pour l'état partagé. Import circulaire sous-fichiers ↔ `decorOverlay.js` conservé (même convention déjà en place dans ce fichier, valide car tout accès croisé se fait dans des corps de fonction, jamais au top-level).
- **`TERRAIN_RELIEF` locale supprimée dans `tileMesh.js`** — devenue orpheline après la suppression de `getTerrainTopY` (round 2 ci-dessus). Ne pas confondre avec la `TERRAIN_RELIEF` EXPORTÉE de `variables.js` (vivante, utilisée par `terrainHeight.js`/`tileRailOverlay.js`).
- **🪤 Piège vécu — `Uncaught SyntaxError: Identifier 'propGlbLibrary' has already been declared`** : régression ayant cassé le rendu de la grille, signalée par l'utilisateur. Root cause : le découpage de `decorOverlay.js` a été fait via un trim `sed -n '1,808p'` en bash pour couper le fichier, mais l'ancien bloc "État singleton partagé" (`propGlbLibrary`/`propAnimationsLibrary`/`propModelsLoading`/`propModelsRequested`) se trouvait justement DANS la plage conservée (avant la ligne 808) et n'a pas été retiré séparément — il entrait en conflit avec le nouvel `import { propGlbLibrary, ... } from './decorPropModels.js'` ajouté plus haut dans le même fichier. **Leçon** : un trim de fichier par plage de lignes (sed/bash) ne remplace pas une relecture ciblée des blocs déplacés — toujours grep chaque identifiant déplacé dans le fichier source APRÈS le trim pour confirmer l'absence de doublon, ne pas se fier uniquement à `node --check` exécuté sur un état intermédiaire. Fix : bloc obsolète remplacé par un commentaire explicatif, `_propInstanceDummy`/`_snapNormal` conservés (toujours utilisés). Sweep de vérification étendu à tous les fichiers des rounds 2/3 (grep de chaque identifiant déplacé) : aucun autre doublon trouvé.
- Vérifié : `node --check` sur 20 fichiers, tous OK.

**📋 Audit round 4 : nettoyage fichiers JS < 1Ko (2026-07-11)** : demande explicite de vérifier les fichiers JS sous 1Ko (certains à une seule ligne) pour fusion/suppression, avec consigne stricte de proposer avant d'agir suite au piège ci-dessus. 7 candidats analysés, seuls 2 retenus comme "solides et sans risque" :
- **`cinematicPass.js` supprimé** — n'était qu'un ré-export de compatibilité (`export { CINEMATIC_SHADER } from './shaders/shaderCinematique.js';`), un seul importateur (`threeSetup.js`), redirigé pour importer directement depuis `shaders/shaderCinematique.js`. cf. §12/§27.E.
- **`tileRoadOverlay.js` supprimé** — stub no-op confirmé (`createRoadCenterOverlay()` retournait toujours `null`, GLBs routes retirés du projet), site d'appel mort dans `tileMesh.js` retiré avec lui.
- **5 candidats écartés, volontairement non touchés** : `config.js` (50+ importateurs, trop risqué malgré la taille) ; `main.js` (point d'entrée normal) ; `gameRules.js` (module de règles métier légitimement petit) ; `domUtils.js` (résultat d'une factorisation réussie antérieure, ne pas défaire) ; `glbLoader.js` (utilitaire central, petit par nature et non par négligence).
- Vérifié : `node --check` + grep croisé, 2 commentaires historiques stales référençant `cinematicPass.js` corrigés au passage (`threeSetup.js`, `shaders/shaderCinematique.js`).

**📋 Passage bilingue FR/EN — prez + jeu (2026-07-12, architecture depuis remplacée)** : première extension du bilingue (jusque-là prez seule) à tout le jeu, via dual-render `data-fr`/`data-en` + CSS `[data-lang]` côté HTML et un `fetch` JSON par module côté JS (`json/languages/french.json`/`english.json`, clés `game.help`/`game.missionHelp`/`game.missionTitles`/`game.ui`/`game.highscore`/`game.multiplayerRooms`/`game.startupMenu`/`game.preloader`/`game.placementOverlay`/`game.multiplayerClient`, toujours en usage). **Architecture dual-render intégralement remplacée le 2026-07-14** par le système scalable `data-i18n`/`LANG_FILES` (cf. entrée 2026-07-14 ci-dessous) — ne conserver de cet épisode que les clés JSON créées (toujours d'actualité) et la correction du badge prez "Solo & Multi" → "Multijoueur" seul (il n'existe plus de vrai mode solo, cf. entrée 2026-07-06).

**🪤 Piège — corruption de fichiers via bash lecture-réécriture sur mount réseau (2026-07-12/13, résolu)** : lors d'une première tentative d'ajout de l'espagnol, des scripts bash (lecture-puis-réécriture sur `X:\...`) ont réellement tronqué 3 fichiers sur disque — pas un problème d'affichage. Reconstruction depuis l'historique jugée structurellement correcte mais le jeu restait cassé en pratique (cause jamais isolée) ; l'utilisateur a restauré un backup complet plutôt que poursuivre le diagnostic. **Leçon retenue (cf. mémoire `feedback-verif-mount-cowork`) : ne plus jamais faire de lecture-puis-réécriture bash sur ce mount, utiliser exclusivement Read/Edit/Write.** L'espagnol a été réintroduit avec succès le 2026-07-14 (cf. entrée trilingue ci-dessous) — ce piège méthodologique est la seule chose à retenir de cet épisode, l'état "ES absent" qu'il décrivait est aujourd'hui obsolète.

**📋 Réorganisation fichiers JS → `javascript/` (2026-07-13, post-restauration backup)** : tous les modules `.js` du jeu déplacés de la racine de `_sources` vers un sous-dossier `javascript/` (99 fichiers). Les `.php` (`game.php`, `index.php`, `multiplayer.php`, `highscore.php`, etc.), `css/`, `json/`, `images/`, `fonts/`, `vendor/` restent à la racine. `game.php` charge `javascript/main.js`. Cf. §20 pour le détail de l'arborescence mise à jour.

**📋 Refonte page d'aide en jeu — touche H (2026-07-13)** : plusieurs demandes successives sur `game.php`/`css/help.css` :
- **Carte "Contrôles" — hauteur** : occupait moins de hauteur que sa zone disponible (calée sur la hauteur cumulée des cartes voisines). Deux premières tentatives de fix (rangée CSS Grid épinglée via `nth-of-type`, puis `grid-template-areas` nommé) ont chacune provoqué un **chevauchement visuel** entre la carte "Règles de base" (agrandie par la fusion ci-dessous) et la rangée suivante — root cause jamais formellement isolée (piste retenue : rangées CSS Grid "auto" imbriquées dans un conteneur flex rétréci avec `overflow-y:auto` qui ne se recalculent pas de façon fiable dans ce contexte précis). **Fix retenu (robuste) : refonte complète en flexbox imbriqué**, plus aucun CSS Grid multi-lignes pour la disposition des cartes — `.help-grid` (colonne) > `.help-top-row` (ligne) > `.help-col-main` (colonne : carte "Règles de base" + 2× `.help-row-pair`) + carte Contrôles (stretch, même hauteur que la colonne principale) ; `.help-card-missions` en pleine largeur sous cette ligne. Un empilement flexbox ne peut structurellement pas produire de chevauchement (chaque bloc garde sa hauteur de contenu réelle) — contrairement aux deux tentatives Grid précédentes.
- **Carte "Placement" fusionnée dans "Objectif du jeu" → "Règles de base"** : la carte "Placement" (liste à puces) a été supprimée, son contenu réintégré dans la carte renommée. `game.ui.help.objective.title` : "Objectif du jeu"/"Game objective" → "Règles de base"/"Basic rules" (FR/EN). Contenu de la liste retravaillé sur plusieurs itérations jusqu'à 4 puces courtes (`game.ui.help.placement.items`, clé JSON conservée par commodité malgré la fusion visuelle).
- **Largeur du panneau d'aide** : +22 % sur les deux déclarations `.help-panel { width: ... }` (1180px→1440px, 1120px→1366px — la seconde gagne en cascade, "Aide condensée" chargée après la règle de base).
- **Espacement liste à puces** : `margin-top` sur `.placement-list` initialement sans effet — piège de spécificité CSS (`.help-card ul { margin:0 }` avait une spécificité supérieure à `.placement-list` seule) ; fix en montant la spécificité (`.help-card ul.placement-list`).
- **Textes rubrique Contrôles retouchés** : `game.ui.help.controls.eda` "Personnalisation (EDA)"/"Customization (EDA)" → "Afficher / masquer le HUD EDA"/"Show / hide the EDA HUD" ; `controls.perfHud` "...HUD performances avancé"/"...advanced performance HUD" → "...HUD FPS"/"...FPS HUD".

**📋 Sélecteur de langue in-game + textes JS rendus réactifs (2026-07-13, 2 passes)** : jusque-là le choix de langue ne se faisait qu'au chargement de la page (prez ou lancement du jeu) — demande utilisateur de pouvoir changer de langue **en cours de partie**, bouton placé à côté de FPS/EDA.
- **Passe 1 (rejetée deux fois)** — première tentative avec `location.reload()` sur le clic : rejetée, ça renvoyait au menu de démarrage en pleine partie. Deuxième tentative : deux boutons `#gameLangFr`/`#gameLangEn` façon FPS/EDA, sans reload — rejetée aussi, pour deux raisons cette fois : (1) "quand il y aura 18 langues, tu créras 18 boutons ?" — pas scalable ; (2) ne traduisait que le texte dual-render `data-fr`/`data-en` déjà présent dans le DOM (`game.php`), pas les textes sourcés en JS (tooltips LUT, HUD missions, highscore, FPS, placement, multijoueur — cf. entrée 2026-07-12 ci-dessus) : "la moitié des textes ingame sont traduits, l'autre non".
- **Passe 2 (retenue)** — nouveau module **`gameLangReactive.js`** (cf. §20), point d'entrée unique `setGameLang(lang)` : écrit `dataset.lang`/`localStorage` (le dual-render CSS reste instantané comme avant) PUIS notifie tous les modules bilingues abonnés via `registerLangRefresh(cb)`. Le sélecteur lui-même (`edaPanelHost.js`) est un `<select id="gameLangSelect">` unique — ajouter une langue future ne demande qu'une `<option>`, pas un nouveau bouton.
- **Réactivité des 9 modules bilingues concernés** (`helpTexts.js`, `highscore.js`, `hud_fps.js`, `missionLabels.js`, `multiplayerClient.js`, `multiplayerRooms.js`, `placementOverlay.js`, `edaPanelWiring.js`, `scene.js`) : les objets de texte restent `const` et sont **mutés en place** (`Object.assign` après avoir vidé les clés existantes), jamais réassignés — nécessaire car plusieurs sites d'appel capturent la référence une seule fois (ex. `delegateHelpTooltip(el, attr, LUT_HELP)`, `delegateHelpTooltip(ui.missionList, 'mission-tip', MISSION_HELP)`) ; réassigner aurait cassé ces références. Pour les tooltips bakés au hover (`attachHelpTooltip(el, LUT_HELP[key])`), `helpTooltip.js` accepte désormais aussi une fonction `() => texte` résolue à l'affichage plutôt qu'à l'attache. Deux textes bakés une seule fois dans du DOM déjà créé (mini-HUD clavier `#kbdHintHud`, hint "sortir du super-immersif") ont un traitement dédié : le premier repousse la valeur dans le DOM existant via son callback, le second est simplement recréé à chaque activation donc se met à jour tout seul.
- **Bug 1 signalé après coup — HUD missions en cours partiellement figé** : `updateMissionUI` (ui.js) n'est reconstruit que sur évènement de jeu (pose de tuile, undo…), jamais à chaque frame ni sur changement de langue seul — `formatMissionTitle` était déjà réactif mais rien ne déclenchait son rappel immédiat. Fix : `scene.js::refreshMissionUI` enregistré via `registerLangRefresh`, forçant un re-rendu immédiat du HUD missions au changement de langue.
- **Bug 2 signalé au même moment — "Aucune mission" figé en français** : chaîne codée en dur dans `ui.js` alors que la clé JSON existait déjà (`game.ui.hud.noMission`, utilisée ailleurs). Exportée en tant que `HUD_TEXT` (missionLabels.js, même pattern mutation-en-place) et branchée dans `ui.js`.
- Vérifié : `node --check` sur les ~14 fichiers touchés, grep résiduel confirmant l'absence de toute référence aux anciens boutons `#gameLangFr`/`#gameLangEn`/`.debug-light-toggle--lang-active`.

**📋 Refonte i18n scalable + jeu trilingue FR/EN/ES + rattrapage EDA (2026-07-14, étape 1/2 vers le quadrilingue — italien ajouté en fin de journée, cf. entrée suivante)** : suite du rollback ES du 2026-07-12/13 (entrée ci-dessus) — nouvelle tentative, cette fois précédée d'une refonte architecturale demandée explicitement par l'utilisateur pour éviter de re-router un système binaire à chaque langue ajoutée.
- **`gameLangReactive.js` généralisé** — `getGameLang()`/`setGameLang()` passent d'un ternaire binaire (`=== 'en'`) à une validation contre une map `LANG_FILES = { fr: 'french', en: 'english', es: 'spanish' }`, plus un nouvel export `getLangFile(lang)`. Les **11 modules JS** qui dupliquaient chacun leur propre calcul `_langFile = getGameLang() === 'en' ? 'english' : 'french'` ont été migrés vers cet unique point d'entrée (`missionLabels.js`, `scene.js`, `edaPanelWiring.js`, `multiplayerRooms.js`, `placementOverlay.js`, `multiplayerClient.js`, `hud_fps.js`, `highscore.js`, `helpTexts.js`, `preloader.js`, `startupMenu.js`).
- **`index.php` et `game.php` réécrits** — abandon du pattern dual-render `data-fr`/`data-en` + bascule CSS `[data-lang]` (bloqué à 2 langues, cf. entrée 2026-07-12) au profit d'un attribut unique `data-i18n="chemin.pointé"` par élément, résolu par un petit moteur générique. `index.php` (page statique, non-module) embarque son propre moteur inline (`<script id="i18n-data" type="application/json">` + `resolveI18n`/`applyI18n`/`setLang`) ; `game.php` réutilise le mécanisme réactif du jeu via un nouveau module **`gameHudI18n.js`** (`applyGameI18n`, `data-i18n`/`data-i18n-title`, s'enregistre auprès de `registerLangRefresh`). Le sélecteur 2-boutons FR/EN de la prez devient un vrai `<select>` scalable.
- **Panneau EDA (LUT/Cinématique/Environnement) traduit pour la première fois** — signalé par l'utilisateur après coup ("les textes du HUD EDA ne semblent plus connectés") : ce panneau n'avait **jamais** été branché à un système de traduction, 100% français en dur depuis sa création (gap préexistant, sans rapport avec les refontes du jour). Nouveau schéma JSON `game.eda` (nested, réutilisant les chemins de config dotés existants comme `environment.fogDensity`/`water.foamWidth` comme suffixe sous `labels.*` — zéro nouvelle nomenclature à inventer pour la plupart des sliders) ; `edaPanelWiring.js` masqué de `data-i18n`/`data-i18n-title` sur tous les en-têtes, toggles, sliders (LUT + Environnement), boutons de préréglage qualité et pied de panel (Copier/Undo/Redo/Reset/Comparer). `gameHudI18n.js` étendu avec `applyCurrentLang()` (exporté) pour retraduire immédiatement le DOM construit dynamiquement par le panel une fois la langue courante connue.
- **Rattrapage : noms des ambiances (presets) + onglet CINÉMATIQUE** — 2 oublis signalés par l'utilisateur après validation du premier passage EDA. Chaque preset de `ambiances.json` a reçu une clé stable (`key: "mist"`, `"autumn"`, etc., indépendante de l'emoji/nom FR d'origine) ; noms traduits via `game.eda.presetNames` — les préréglages "rétro" (Pong, Apple II, CGA, EGA, Amiga) gardent le même nom dans les 3 langues (références figées, pas du texte). L'onglet CINÉMATIQUE (Vignette, Grain film, Aberration chr., God Rays, Tilt-shift, Bloom, Pixelisation, Courbure écran…) était resté hors du premier passage EDA (sliders statiques du HTML, pas générés par `createSlider`) — labels + 3 tooltips de toggle manquants (God Rays/Tilt-shift/Bloom) branchés en `data-i18n`/`data-i18n-title` sous `game.eda.labels.cin.*`/`labels.pix.*`.
- Vérifié à chaque étape : `node --check`, parité clé-à-clé de `game.eda` (et sous-clés `presetNames`/`labels.cin`/`labels.pix`) entre `french.json`/`english.json`/`spanish.json` (confirmée via relecture manuelle Read tool quand le cache bash montrait du contenu périmé — piège récurrent, cf. mémoire `feedback-verif-mount-cowork`).

**📋 Ajout de l'italien (IT) — 4e langue (2026-07-14)** : bénéfice direct de la refonte i18n scalable ci-dessus — contrairement à l'incident ES du 2026-07-12/13 (rollback complet), cet ajout s'est fait sans accroc grâce à l'architecture `LANG_FILES`/`data-i18n` déjà en place.
- **`json/languages/italian.json` créé** — traduction complète et intégrale de `french.json` (921 clés), structure identique vérifiée programmatiquement (`json.load` + comparaison d'ensembles de chemins de clés, aucune clé manquante ni en trop). Créé d'abord **sans branchement** (demande explicite), puis connecté dans un second temps sur confirmation utilisateur.
- **Intégration = 3 lignes, exactement comme prévu par les commentaires du code lors de la refonte scalable** : `LANG_FILES` dans `gameLangReactive.js` (`it: 'italian'`), `$LANG_FILES` dans `index.php` (`'it' => 'italian'`, pilote à la fois le `<select>` et le JSON `i18n-data` embarqué), et une `<option value="it">IT</option>` dans le `<select id="gameLangSelect">` de `edaPanelHost.js`. Aucun autre fichier à toucher (`game.php`, `gameHudI18n.js`, `edaPanelWiring.js` sont déjà génériques et reconnaissent automatiquement toute langue présente dans `LANG_FILES`).
- Vérifié : `node --check` sur les 2 fichiers JS touchés, aucune régression FR/EN/ES.
- **⚠️ Anomalie de montage repérée en cours de route, corrigée par l'utilisateur** : `json/languages/` contenait une copie complète de la racine du projet (`index.php`, `game.php`, `javascript/`, `css/`, `images/`, `fonts/`…), tailles et dates identiques aux vrais fichiers — probable artefact du point de montage bash (cf. mémoire `feedback-verif-mount-cowork`), signalé sans être touché. Nettoyé par l'utilisateur lui-même le jour même ; `json/languages/` ne contient plus désormais que les 4 fichiers de langue attendus (`french.json`, `english.json`, `spanish.json`, `italian.json`).

**📋 Brins de blé — dimensions réduites de 12% (2026-07-14)** : `variables.js`, deux constantes géométriques (pas d'impact vent) — `WHEAT_GLOBAL_HEIGHT` (scale global Y, uniform shader) `0.04288 → 0.0377344` ; `WHEAT_BLADE_WIDTH` (demi-largeur de base de la géométrie statique tige+épi, `fieldWheatOverlay.js`) `0.001496 → 0.00131648`. `WHEAT_WIND_STRENGTH`/`WHEAT_WIND_SPEED` (animation) et `WHEAT_HEIGHT_MIN/MAX`/`WHEAT_WIDTH_MIN/MAX` (plage aléatoire par brin, facteur multiplicatif) non touchés — la réduction s'applique uniformément à travers ces facteurs existants.

**📋 Audit qualité des 4 langues + corrections de traduction (2026-07-14)** : demande utilisateur en 2 temps — d'abord un audit général de cohérence code (structure JSON, code mort, commentaires stale, PHP), rien de solide trouvé sinon un commentaire stale déjà corrigé plus haut (`environmentDirector.js`) ; puis un audit ciblé sur l'EXACTITUDE SÉMANTIQUE des traductions elles-mêmes (pas seulement la parité de clés déjà vérifiée à chaque étape précédente). 12 incohérences réelles trouvées et corrigées dans `json/languages/{english,spanish,italian}.json` :
- **EN** — "prairie" traduite 3 façons différentes (`biomes.grass.name`: "Grassland", `creatures.population.meadows_label`: "Grasslands", partout ailleurs "Meadow(s)") → harmonisé sur "Meadow"/"Meadows". `nav.links.gallery` "Moods" ne correspondait à aucun autre libellé de la section → "Presets".
- **ES** — "God Rays" traduit 3 façons différentes selon l'endroit (`daynnight.godrays.name` gardait "God Rays", mais `eda.headers.godRays`/`eda.toggleTitles.godRays` disaient "Rayos de luz") → harmonisé sur "God Rays" (terme technique gardé tel quel, cohérent avec FR/EN). `scores.empty` avait un accord de genre fautif ("Ningún puntaje" → "Ninguna puntuación"). Le nom du curseur `labels.grading.vibrance` = "Viveza" ne correspondait pas au premier mot de son propre tooltip d'aide ("Vibrance inteligente...") → tooltip aligné sur "Viveza".
- **IT** — `game.eda.modes.bouliste/platiste` = "Globo"/"Piano", où "Piano" est un mot italien ambigu (étage/plan/doucement) → remplacé par "Piatto" (garde le style nom-descriptif de EN "Flat"/ES "Plano", plutôt que les adjectifs de faction "Piattista"/"Globista" utilisés ailleurs dans un contexte différent — choix délibéré pour ne pas introduire une nouvelle incohérence de registre). **Vrai contresens** : `village_women`/`village_men` ("Villageoises"/"Villageois") traduits "Contadine"/"Contadini", identique au tag `farmer` ("Contadino") — confondait habitant du village et métier d'agriculteur → renommés "Paesane"/"Paesani" (gentilé villageois, gardant la distinction de genre présente en FR/EN/ES). `game.eda.ambiances` "AMBIENTI" collisionnait avec l'onglet `tabs.environment` "Ambiente" → "ATMOSFERE" (cohérent avec le reste du fichier qui utilise "Atmosfera/Atmosfere" pour ce concept). Faute de capitalisation `factions.title1` "Piattisti e Globisti" → "Piattisti e globisti".
- Aucun contresens trouvé dans la grosse section technique `game.eda.help`/`game.help` (~150 tooltips shaders) dans les 3 langues — c'était le point de risque principal identifié avant l'audit, et il s'est révélé propre.
- Vérifié : chaque édition confirmée par relecture ciblée via Read tool (le cache bash montrait à nouveau du contenu périmé/tronqué sur les 3 fichiers juste après édition — même piège récurrent, cf. mémoire `feedback-verif-mount-cowork`).

**📋 Capture d'écran serveur — bouton 📷 (2026-07-15)** : demande utilisateur — bouton dans le bandeau FPS/EDA/langue qui capture le rendu 3D (sans HUD) et l'enregistre côté serveur en JPEG dans `/snapshots`.
- **Constat clé qui a simplifié l'implémentation** : le `<canvas id="app">` (Three.js) ne contient QUE le rendu 3D (monde + sprites texte + post-processing, cf. §12) — le HUD (score, boutons, panneaux) est un overlay DOM séparé positionné en CSS, jamais dessiné dans le canvas. `canvas.toBlob()` est donc nativement "propre", sans avoir besoin de répliquer le mode super-immersif (SHIFT+Espace) et tous ses effets de bord (masquage de classes CSS, désactivation de boutons…). Seule exception : `hoverZoneOverlay` (contour pointillé de survol) est un vrai objet Three.js visible dans le rendu — masqué le temps de la capture (2 frames d'attente), comme le fait déjà le mode super-immersif pour ce même objet.
- **`snapshotCapture.js` créé** (nouveau, autonome) — `captureSnapshot(canvas, quality=0.92)` : `canvas.toBlob('image/jpeg')` → POST du blob brut vers `snapshot.php` (`Content-Type: image/jpeg`, pas de FormData).
- **`edaPanelHost.js`** — bouton `#snapshotBtn` (📷) ajouté au bandeau, entre EDA et le sélecteur de langue.
- **`scene.js`** — handler de clic : désactive le bouton, masque `hoverZoneOverlay`, attend 2 `requestAnimationFrame`, capture, affiche ✓/✕ selon le résultat, restaure l'état après 1200ms.
- **`snapshot.php` créé** — reçoit le corps POST brut (`php://input`), valide le magic number JPEG (`FF D8 FF`), plafonne à 15 Mo, crée `/snapshots` à la volée (`mkdir` + `is_writable`, pattern de `multiplayer.php`), écriture atomique (fichier `.tmp` + `rename`), nom de fichier **généré côté serveur uniquement** (`hexistenz_AAAAMMJJ_HHMMSS_xxxxxx.jpg`, jamais fourni par le client). Réponse JSON `{success, filename}` / `{success:false, message}` — convention volontairement propre à cet endpoint (ni le `{ok,error,...}` de `multiplayer.php`, ni l'ad-hoc de `highscore.php`, puisque `snapshotCapture.js` est son seul et unique appelant).
- Vérifié : `node --check` sur `snapshotCapture.js` et `scene.js` (OK) ; PHP non disponible dans ce sandbox pour `php -l` (piège connu), relecture manuelle du fichier à la place ; aucun conflit de nom avec un éventuel dossier `/snapshots` préexistant (n'existe pas encore, créé au premier appel).
- **Rattrapage signalé après coup (2026-07-15)** : les tooltips des 4 boutons du bandeau (FPS/EDA/📷/langue) étaient en dur en français. Première passe (incorrecte, corrigée dans la foulée) : `data-i18n-title` + attribut `title` natif du navigateur. L'utilisateur a signalé que ce n'était PAS le bon système — le jeu utilise partout ailleurs (`ui.js`, `startupMenu.js`, `multiplayerRooms.js`, `hud_fps.js`…) le tooltip custom stylisé `lutHelpTooltip` (`helpTooltip.js`/`helpTexts.js`, `attachHelpTooltip`/`LUT_HELP`), jamais l'attribut `title`. Retiré `title`/`data-i18n-title` des 4 éléments ; ajouté 4 clés plates `game.help.topbar.{fps,eda,snapshot,lang}` (dict source de `LUT_HELP`) dans les 4 fichiers de langue ; câblé `attachHelpTooltip(el, () => LUT_HELP['topbar.xxx'] ?? '')` sur chacun dans `edaPanelHost.js` (fonctions non figées, réactives au changement de langue). Emoji 📷 recalibré à +30% (après un premier essai à +40%) et centré verticalement en flex (`#snapshotBtn { display:inline-flex; align-items:center; justify-content:center; font-size:1.3em; line-height:1 }`) ; bordure/rayon/box-sizing du `<select>` de langue redéclarés explicitement (`.debug-light-lang-select`) car le chrome natif du `<select>` resurgissait malgré `appearance:none`, donnant des coins moins arrondis que les 3 boutons voisins.

**📋 Galerie de captures — snapshots.php (2026-07-15)** : demande utilisateur — page dédiée affichant en mosaïque immersive les captures du dossier `/snapshots`, ouverte en overlay par-dessus le jeu sans quitter la partie.
- **Métadonnées de partie** : `snapshot.php` accepte désormais `?tiles=N&mode=bouliste|platiste` en query string sur le POST (corps toujours le JPEG brut, inchangé) et écrit un sidecar `hexistenz_..._xxxxxx.json` à côté du `.jpg` (même pattern atomique tmp+rename) contenant `{date, tiles, mode}`. `snapshotCapture.js` : signature passée de `captureSnapshot(canvas, quality)` à `captureSnapshot(canvas, { quality, tiles, mode })`. `scene.js` : au clic sur 📷, lit `#tilesPlaced.textContent` (DOM, source de vérité affichée) et `getWorldCurvatureEnabled()` (déjà importé) pour déterminer `bouliste`/`platiste`.
- **`snapshots.php` créé** — scanne `/snapshots` côté serveur (`glob('*.jpg')`, tri par `filemtime` décroissant, lecture du sidecar `.json` si présent sinon repli sur la date de modification du fichier sans tiles/mode), embarque la liste en JSON dans un `<script type="application/json">`. Gère nativement le cas dossier absent/vide (liste vide, pas d'erreur). Le rendu (mosaïque, légendes, visionneuse) est 100% côté client via `javascript/snapshotsPage.js` — PHP n'a aucune autre logique.
- **Mosaïque** (`css/snapshots.css`) — colonnes CSS (`columns: 280px`) façon Pinterest, pas de lib JS. Fond radial identique au jeu (`base.css`). Vignettes bordées d'un liseré bleuté `rgba(120,180,255,0.30)` → `0.55` au survol (même convention que `.gallery-card` de la prez `index.php`/`presentation.css`). Légende (date localisée + "Partie de N tuiles · Mode X") masquée par défaut, révélée en dégradé bas au survol — jamais de nom de fichier affiché. Chargement progressif réel : un premier lot de 30 vignettes est rendu, le reste ajouté par lots via `IntersectionObserver` sur une sentinelle en bas de page (pas juste du `loading="lazy"` cosmétique) ; `loading="lazy"` + fade-in au `load` en complément pour chaque image.
- **Visionneuse plein écran** — ouverture au clic sur une vignette, navigation ‹/› (boutons + flèches clavier), Échap ferme. **Itération sur la fermeture** : une première version avait une croix de fermeture dédiée, qui se superposait visuellement à la croix du panneau overlay parent (disgracieux, signalé par l'utilisateur) ; une correction intermédiaire a décalé cette croix vers le bas (`body.embedded`), jugée toujours disgracieuse ; solution finale adoptée — **aucune croix** : cliquer sur l'image agrandie OU n'importe où ailleurs dans la visionneuse ferme (`viewer.addEventListener('click', close)`), seuls les boutons ‹/› de navigation `stopPropagation()` pour ne pas fermer en même temps.
- **Overlay in-game** — nouveau bouton 🖼️ (`#galleryBtn`) ajouté au bandeau FPS/EDA/📷/langue, tooltip `game.help.topbar.gallery` via le système `attachHelpTooltip` (même correctif que les 3 autres boutons). `javascript/snapshotGallery.js` (nouveau) : overlay DOM fixed + backdrop-blur, panneau centré au style identique à `help.css` (`.help-overlay`/`.help-panel`), contenant un `<iframe src="./snapshots.php?t=timestamp">` (cache-bust à chaque ouverture pour voir les captures récentes ; `src` remis à `about:blank` à la fermeture pour libérer l'iframe). Le canvas WebGL et sa boucle de rendu continuent de tourner derrière — aucune navigation hors de `game.php`. CSS dans `css/snapshotGalleryOverlay.css` (nouveau, `@import` dans `style.css`).
- **i18n** — nouvelles clés `game.gallery.{title,empty,close,loading,tilesCount,modeBouliste,modePlatiste}` et `game.help.topbar.gallery` dans les 4 fichiers de langue (parité vérifiée). `javascript/snapshotsPage.js` réutilise `gameLangReactive.js` en LECTURE SEULE (même clé localStorage `hexistenz_pres_lang`) pour hériter de la langue déjà choisie en jeu — pas de sélecteur de langue propre à la galerie. Dates formatées via `Intl.DateTimeFormat` avec mapping locale (`fr-FR`/`en-US`/`es-ES`/`it-IT`).
- Vérifié : `node --check` sur les 5 fichiers JS touchés/créés (`snapshotCapture.js`, `scene.js`, `edaPanelHost.js`, `snapshotGallery.js`, `snapshotsPage.js`) ; PHP relu manuellement (`snapshot.php`, `snapshots.php`, pas d'interpréteur PHP dans ce sandbox) ; parité des clés JSON confirmée par relecture ciblée des 4 fichiers de langue.

**📋 Ajout du portugais (PT) — 5e langue (2026-07-15)** : sur feu vert explicite de l'utilisateur, même bénéfice direct de la refonte i18n scalable que pour l'italien (cf. entrée 2026-07-14) — aucun accroc, architecture `LANG_FILES`/`data-i18n` déjà en place.
- **`json/languages/portuguese.json` créé** — traduction complète et intégrale de `french.json` (893 clés `"xxx":`), y compris les entrées ajoutées le jour même (`game.gallery.*`, `game.help.topbar.*`, item galerie de `multi.features`). Structure vérifiée via l'outil Grep (comptage identique de lignes `^"clé":` dans les deux fichiers — le mount bash affichait une version tronquée/périmée de `french.json` pendant la vérification, piège récurrent, cf. mémoire `feedback-verif-mount-cowork` : Grep sur le vrai fichier a servi de source de vérité à la place de `python json.load` via bash).
- **Intégration = 3 lignes, comme prévu par l'architecture** : `LANG_FILES` dans `gameLangReactive.js` (`pt: 'portuguese'`), `$LANG_FILES` dans `index.php` (`'pt' => 'portuguese'`), et une `<option value="pt">PT</option>` dans le `<select id="gameLangSelect">` de `edaPanelHost.js`. Le sélecteur de langue de la prez (`index.php`) est déjà entièrement dynamique (`foreach ($LANGS as $code)`) — aucune modification nécessaire là.
- Choix de traduction notables : "tuile" → "peça" (cohérent tout du long, comme "loseta" en ES ou "tessera" en IT) ; mode bouliste/platiste → "Globo"/"Plano" (même registre nom-descriptif que EN "Flat"/"Globe" et ES "Globo"/"Plano", pas les adjectifs de faction "globista"/"planista" utilisés ailleurs dans un contexte différent) ; factions "Platistes et boulistes" → "Planistas e globistas" (même jeu de mots préservé : "plano"=plat, "globo"=sphère) ; `village_women`/`village_men` → "Aldeãs"/"Aldeões" (gentilé villageois genré, distinct de `farmer` "Agricultor", même vigilance que pour l'italien lors de l'audit du 2026-07-14).
- Vérifié : `node --check` sur les 3 fichiers JS/PHP touchés, `python json.load` confirmant `portuguese.json` syntaxiquement valide.

**📋 Galerie — dates PT non localisées + double ESC (2026-07-15)** : deux retouches signalées après l'ajout du portugais.
- **Bug dates PT** — `snapshotsPage.js` contenait un `LOCALES = { fr, en, es, it }` codé en dur, décorrélé de `LANG_FILES` (la vraie source de vérité ailleurs) et jamais mis à jour à l'ajout du portugais : les dates de la galerie retombaient silencieusement sur le format `fr-FR`. Fix ciblé : ajout de `pt: 'pt-PT'`. Audit proactif demandé par l'utilisateur pour des anomalies similaires ailleurs : aucune autre trouvée — les seuls autres `fr-FR` en dur (`hud_fps.js`, `check-glb.php`) sont du formatage de nombres pour un HUD perf/debug, sans rapport avec la langue choisie ; `multiplayerRooms.js::toLocaleString()` (sans argument) utilise la locale par défaut du navigateur, pas davantage lié au sélecteur de langue. Le pattern `LOCALES` reste décorrélé de `LANG_FILES` par design minimal (fix demandé était ciblé, pas un refactor) — à garder en tête si une 6e langue est ajoutée un jour.
- **Second Échap ferme la galerie entière** — jusque-là, Échap ne fermait que la visionneuse plein écran zoomée ; un 2e appui devait aussi refermer tout l'overlay galerie (retour au jeu). Piège technique : un `keydown` déclenché dans l'`<iframe>` de `snapshots.php` ne remonte jamais au document parent (`snapshotGallery.js`) — ce sont deux `Document` distincts, pas de bubbling cross-frame. Fix : `snapshotsPage.js` détecte le cas "visionneuse déjà fermée + Échap" et envoie `window.parent.postMessage({ type: 'hexistenz:closeSnapshotGallery' }, window.location.origin)` (no-op si `window.parent === window`, i.e. page visitée hors iframe) ; `snapshotGallery.js` écoute `message`, valide `e.source === frameEl.contentWindow` avant d'appeler `closeSnapshotGallery()`.

**📋 HUD aide — cartes de score épurées + typo Bebas Neue agrandie (2026-07-15)** : page d'aide (touche H), carte "Règles de base", les 6 pastilles `.score-strip` (+2/+10/+25/+50/+100/+1500).
- **Texte simplifié** — `game.php` : `+2 points` → `+2`, `+100 points + 3 tuiles` → `+100` (etc. pour les 6) ; les libellés `<strong>` sont en dur dans le HTML (pas de clé i18n, "points"/"tuiles" n'étaient de toute façon jamais traduits), simple édition de template.
- **Typo** — `.score-strip strong` (`css/help.css`) passé de `monospace` 24px à `'BebasNeue', system-ui, sans-serif` (police déjà déclarée/chargée ailleurs dans le projet, ex. `.arcade-score`, `.mission-goal`), puis grossi deux fois sur demande explicite : 24px → 34px → **44px** (version pleine largeur), et pour la variante écran étroit (media query bas de fichier) 18px → 25px → **33px**.

**📋 Barres de progression missions — refonte glossy façon CSSFlow (2026-07-15)** : HUD missions (`#missionsBox`), remplacement du rendu à graduations discrètes par un fill continu, sur un modèle CSS fourni par l'utilisateur (CodePen dérivé du travail de Thibaut Courouble/CSSFlow, licence MIT).
- **JS (`ui.js::updateMissionUI`)** — l'ancien système générait un nombre de `<span class="mission-bar-seg">` plafonné à `MAX_TICKS=24` (1 graduation = 1 unité sous le plafond, avec arrondi proportionnel au-delà), chaque segment coloré individuellement selon son rang. Remplacé par un unique `<div class="mission-bar-fill">` dont la largeur est directement `style="width:${ratio*100}%"` — plus de notion de graduation/plafond, calcul de `ratio`/tiers (`bar-mid`/`bar-near`/`bar-close`) inchangé.
- **CSS (`css/missions.css`)** — `.mission-bar-seg`/`.seg-filled` retirés, remplacés par `.mission-bar-fill` avec dégradé glossy (`linear-gradient` blanc translucide du haut vers le bas) + ombre portée/interne, `transition: width 0.4s linear, background-color 0.4s linear` — reprise directe du style visuel du CodePen fourni.
- **Palette de couleurs** — sur demande explicite de reprendre aussi les couleurs exactes du CodePen (pas seulement le rendu glossy) : l'ancienne palette bleu/cyan/vert/or (`rgba(70,155,230,…)` etc.) remplacée par la palette rouge→vert du CodePen — défaut `#f63a0f`, `bar-mid` (≥50%) `#f2b01e`, `bar-near` (≥75%) `#f2d31b`, `bar-close` (≥90%) `#86e01e` (avec glow assorti `rgba(134,224,30,0.75)`).
- Les inputs radio du CodePen (démo interactive) n'ont pas été repris : `ratio` est déjà calculé côté JS à chaque rendu du HUD, pas besoin d'un mécanisme de state séparé.

**📋 Popup central "Capture faite !" au clic sur 📷 (2026-07-15)** : réutilisation du mécanisme existant du popup de score plutôt qu'un nouveau composant.
- **`scorePopup.js` généralisé** — logique d'affichage/anim (`_showCenterPopup`) factorisée hors de `showScorePopup(score)` ; nouvel export `showCenterMessage(text)` pour un texte arbitraire déjà traduit, même Web Animations API/mêmes keyframes. Une classe `scorePopup--message` posée par `showCenterMessage` distingue le cas texte du cas score numérique.
- **`css/scorePopup.css`** — `#scorePopup` (pensé à l'origine pour un court "+N" à 208px) recevait sinon un texte plus long en le laissant retour-à-la-ligne et décentré : un `<div>` `position:fixed` avec seulement `left` (pas `right`) calcule une largeur "shrink-to-fit" basée sur l'espace disponible à droite de l'ancre, pas sur le contenu réel. Fix : `width:max-content` + `white-space:nowrap` + `text-align:center` (centrage exact quelle que soit la longueur, toujours sur une ligne). Taille dédiée aux messages texte (`.scorePopup--message`) pour ne pas déborder de l'écran comme le ferait 208px sur plusieurs mots : `clamp(28px,6vw,72px)`, puis agrandie de 35% sur demande explicite → `clamp(38px,8.1vw,97px)`.
- **`scene.js`** — même mécanisme réactif que `_superImmersifExitHintText` (fetch top-level du JSON de langue + `registerLangRefresh`) pour `_snapshotCapturedText` (clé `game.gallery.captured`, regroupée avec les autres textes captures/galerie plutôt qu'une section dédiée) ; appelé juste après le `btn.textContent = '✓'` du handler `#snapshotBtn`. Traduit dans les 5 langues dès sa création (conformément à la consigne : tout nouveau texte doit être quintilingue).

**📋 Logo `images/logo2.png` réduit de 30% (2026-07-15)** : deux emplacements recensés par grep repo-wide (aucun autre). `.mode-logo` (`css/startupMenu.css`, menus pré-partie) — les 3 déclarations `width` (défaut + 2 media queries `max-height`) réduites de 30% chacune : `min(520px,78vw)`→`min(364px,54.6vw)`, `min(380px,60vw)`→`min(266px,42vw)`, `min(440px,74vw)`→`min(308px,51.8vw)`. `#preloader-logo` (`css/preloader.css`, écran de chargement) — seule règle, `min(440px,72vw)`→`min(308px,50.4vw)`. Les valeurs `top`/positionnement n'ont pas été touchées (demande portait uniquement sur les dimensions).

**📋 Raccourcis clavier C (capture) et G (galerie) (2026-07-15)** : deux nouvelles entrées dans le handler `keydown` global de `scene.js`, toutes deux par simple relais `.click()` vers le bouton HUD existant plutôt qu'une duplication de logique — garantit que tout garde-fou déjà présent sur le bouton (désactivation pendant la capture, etc.) s'applique aussi au raccourci.
- **Touche C** → `document.getElementById('snapshotBtn')?.click()` (déclenche la même capture + popup "Capture faite !" que le bouton 📷, cf. entrée ci-dessus).
- **Touche G** → `document.getElementById('galleryBtn')?.click()` (ouvre l'overlay galerie, cf. entrée snapshots.php du 2026-07-15 plus haut).
- **Documentation** — ajoutées à la fois à l'aide en jeu (`game.php`, touche H, section Contrôles, clés `game.ui.help.controls.{snapshot,gallery}`) et au bandeau de raccourcis de la prez (`index.php`, `.kbd-strip`, clés `gameplay.kbd.{snapshot,gallery}`) ; parité des 4 clés vérifiée dans les 5 fichiers de langue.

**📋 Libellés `<kbd>` non traduits — 3 vagues de correctifs (2026-07-15)** : plusieurs libellés de touches restaient en dur en français dans l'aide en jeu (`game.php`, touche H) et/ou la prez (`index.php`), repérés au fil de comparaisons entre les deux pages par l'utilisateur — même schéma de fix à chaque fois : ajout d'un `data-i18n` sur le `<kbd>` (pas seulement sur le `<span>` de description) + clé correspondante dans les 5 fichiers de langue.
- **Vague 1 — Molette/Clic gauche/Clic droit** : ces 3 libellés étaient déjà traduits côté prez (`gameplay.kbd.{wheel_kbd,left_click_kbd,right_click_kbd}`) mais codés en dur côté aide en jeu. Nouvelles clés `game.ui.help.controls.{wheelKbd,leftClickKbd,rightClickKbd}`, réutilisant les traductions déjà validées de la prez.
- **Vague 2 — Espace/Shift+Espace** : même symptôme, cette fois des DEUX côtés (la prez elle-même avait "Espace" en dur, pas seulement l'aide). Nouvelles clés `game.ui.help.controls.{spaceKbd,shiftSpaceKbd}` (aide) et `gameplay.kbd.space_kbd` (prez, réutilisée aussi dans la nouvelle entrée SHIFT+ESPACE de la vague suivante). `SHIFT` seul non traduit (mot déjà universel dans les 5 langues, non signalé).
- **Vague 3 — liste de raccourcis non exhaustive** : audit complet des `key === '...'` du handler `keydown` de `scene.js` (+ les 2 doublons E/F dans `edaPanelWiring.js`/`hud_fps.js`, déjà couverts) pour vérifier qu'aucun raccourci actif ne manquait à la prez. 4 manquants trouvés et ajoutés : `+`/`-` (zoom), `SHIFT` seul (accélère déplacement/zoom), `SHIFT+ESPACE` (mode super-immersif), `ESC` (accolé à `H`, meme action `toggleHelp`). Nouvelles clés `gameplay.kbd.{zoom,shift_kbd,speed_up,super_immersive}`. Les flèches directionnelles (↑←↓→, alias clavier de Z/Q/S/D via `controls.js`) manquaient aussi du premier encart — ajoutées dans le même `<kbd>` groupe que Z/Q/S/D.
- **Refonte visuelle du bandeau `.kbd-strip`** (`css/presentation.css`) — la liste, passée de 12 à 16 raccourcis, devenait illisible en simple ligne flex dense (`gap:8px 22px`, aucune séparation visuelle). Remplacée par une grille de cartes (`display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr))`), chaque raccourci recevant fond/liseré/padding individuels (même famille visuelle que `.score-pill`/`.population-tag`).
- **🐛 Bug largeur + troncature de texte (signalé après la refonte)** — deux défauts distincts sur la même capture d'écran (langue IT) :
  1. `.kbd-strip` avait son propre `max-width:920px`, plus étroit que `.score-pills` juste au-dessus (pleine largeur de `.container`, 1100px) — écart visuel entre les deux rubriques. Fix : `max-width` retiré, hérite naturellement de `.container` comme `.score-pills`.
  2. Le premier encart ("Z Q S D + flèches, télécamera") affichait un texte tronqué en dur ("telecame…") plutôt qu'un retour à la ligne. Root cause classique flexbox : un enfant flex a par défaut `min-width:auto`, ce qui l'empêche de rétrécir sous la largeur de son propre contenu — quand le groupe de `<kbd>` voisin (8 touches sur cet encart) prenait déjà beaucoup de place, le `<span>` de texte débordait au lieu de wrapper. Fix : `min-width:0` + `flex:1 1 auto` sur le span de description, `flex-wrap:wrap` sur `.kbd-strip-item`, et les `<kbd>` d'un même raccourci regroupés dans un `<span class="kbd-group">` dédié pour ne jamais se mélanger avec le texte lors d'un retour à la ligne.
- **Retouche ZQSD/flèches en 2 lignes** — le `.kbd-group` du premier encart (8 touches) wrappait de façon imprévisible selon la largeur de colonne disponible. Scindé en `.kbd-group--stacked` (`flex-direction:column`) contenant deux `.kbd-row` fixes : `Z Q S D` sur une ligne, `↑ ← ↓ →` sur l'autre, toujours dans cet ordre quelle que soit la largeur d'écran.

**📋 Prez — titres de section pour les rubriques Galerie et Contrôles (2026-07-15)** : deux ajouts de titres `<h2 class="section-title">` (même famille visuelle Bebas Neue blanc que `multi.title1`/`title2`), sur demande explicite de mettre ces rubriques en valeur plutôt que de les laisser fondues dans le contenu environnant.
- **"PARTAGEZ VOS CAPTURES"** (rubrique Multijoueur) — le texte promotionnel sur 📷/🖼️ (ajouté le 2026-07-15, cf. entrée snapshots.php plus haut) est sorti de `multi.features` (qui repasse de 5 à 4 items) vers un titre + paragraphe dédiés juste après la liste à puces. Nouvelles clés `multi.gallery_title`/`multi.gallery_promo` (remplacent l'ancien 5e item du tableau `features`) ; le texte a été retouché au passage pour mentionner explicitement le bouton 🖼️ galerie, pas seulement 📷.
- **"CONTRÔLES CLAVIER"** (rubrique Gameplay) — titre ajouté juste avant `.kbd-strip`. La séparation visuelle (`border-top`/`padding-top`) a été transférée du conteneur `.kbd-strip` vers ce nouveau titre pour éviter un double liseré ; `.kbd-strip` ne garde qu'un `margin-top` réduit. Nouvelle clé `gameplay.kbd_title`.
- Parité des 3 nouvelles clés (`multi.gallery_title`, `multi.gallery_promo`, `gameplay.kbd_title`) vérifiée dans les 5 fichiers de langue.

**📋 Ajout du français québécois (`fr-CA`) — 6e langue, easter egg humoristique (2026-07-15)** : sur demande explicite et très détaillée de l'utilisateur (glossaire, dosage des jurons, sections à adapter vs sections à garder standard), copie intégrale de la structure de `french.json` (769 clés, parité vérifiée par comptage grep) réadaptée en québécois pour ~130 chaînes visibles/significatives.
- **Fichier `json/languages/fr-CA.json`** — env. 75-80% français standard/légèrement québécois, ~15-20% vocabulaire authentique (game/partie, pis/et, sacrer son camp/quitter, câline, ostentation dosée), ~5% touches absurdes/sacres, sans caricature (pas de phonétique systématique type "moé/icitte", pas de sketch sur chaque phrase). Sacres dosés selon la consigne : "câline" utilisée 2 fois (confirmation d'abandon, écran de choix de forme du monde), "en maudit" 1 fois (adjectif FPS "splendide"), "tabarnak" 1 seule fois (confirmation d'enregistrement de score) — "ostie"/"crisse" volontairement absents. Zéro sacre dans `game.help.*` (tooltips techniques longues) ni dans les libellés EDA (LUT/Bloom/Tilt-shift/etc., laissés intégralement en français standard comme les autres langues).
- **Sections adaptées** : nav, hero, factions, biomes (tags + 2 descriptions), missions (sous-titre), gameplay (étapes, pills de score, titre/libellés clavier), créatures, audio, environnement jour/nuit (sous-titre), multijoueur, palmarès, footer, `game.gallery.*`, une partie de `game.eda.footer`/`weatherGroups`/`modeActuel`/`preregalages`, HUD en jeu (`game.ui.hud.*`, `game.ui.help.controls.*`), highscore, `game.multiplayerRooms.*`, `game.startupMenu.worldShape.note`, preloader, `game.fpsAdjectives`. Sections gardées volontairement standard : `game.help.*` (tooltips techniques), `game.missionHelp.*`/`missionTitles.*` (risque de casser la pluralisation `{one,other}`), labels EDA techniques, textes de règles précises (placement, eau/rail, cases bonus/noires).
- **Intégration** — 3 points de branchement identiques aux ajouts précédents (IT/PT) : `LANG_FILES` (`gameLangReactive.js`, clé `'fr-CA': 'fr-CA'`), `$LANG_FILES` (`index.php`, même clé/fichier), `<option value="fr-CA">QC</option>` dans le sélecteur in-game (`edaPanelHost.js`). Différence par rapport aux langues précédentes : la clé utilisée est `fr-CA` (pas un code 2 lettres) — vérifié au préalable qu'aucun code du projet ne suppose une clé à 2 caractères (ni `LANG_FILES`, ni `$LANG_FILES`/`strtoupper($code)` de la prez, ni `dataset.lang`) ; seule adaptation nécessaire : ajout d'une entrée `'fr-CA': 'fr-CA'` dans `LOCALES` (`snapshotsPage.js`) pour le formatage de dates de la galerie (repli silencieux sur `fr-FR` sinon, non bloquant mais moins précis).
- Vérifié : JSON valide (`python3 -c "json.load(...)"`), parité clés 769/769 vs `french.json` (comptage grep `^\s*"key":`), `node --check` sur les 3 fichiers JS modifiés.

---

## 22. Ciel volumétrique (`cloudSky.js` + `shaders/shaderCiel.js`)

Sphère `BackSide` r=500 centrée sur la caméra, `renderOrder=-200000` (avant étoiles à −100 000 → les étoiles s'affichent par-dessus en nuit). Fragment shader ray-marche une couche atmosphérique (sphère GLSL centrée `cameraPos.y−100`, r=120).

⚠ Les headers de `shaderCiel.js` **et** `cloudSky.js` mentionnent y-450/r=500 — commentaires stale dans les deux fichiers, les valeurs GLSL réelles sont bien **y-100/r=120**.

**Value noise FBM** — 4 octaves, `hashIQ + valueNoise` (retourne [0,1] sans artefacts de signe). Remplace `abs(cnoise)` qui créait des crêtes/polygones. Coefficients : 0.51749673, 0.25584929, 0.12527603, 0.06255931. `lacunarity = 2.76434`.

**Guard horizon** — `rd.y < 0.01 → vec4(0)` : nuages uniquement au-dessus de l'horizon.

**dirStep** = `rd / rd.y * marchStep` (formule Shadertoy originale, sûre car `rd.y > 0.01` garanti).

**Fake light** = `exp(h) / 1.75` — tops brillants, bas sombres, profondeur volumétrique.

**Mix final** = `mix(sky, cld.rgb / (0.000001 + cld.a), cld.a)` — formule Shadertoy exacte.

**Désaturation sous-horizon** — `desat = clamp(-rd.y * 10, 0, 1)` → `mix(sky, vec3(lum * 0.85), desat)`.

**Uniforms** : `uTime, uSunDir, uSkyZenith, uSkyHorizon, uSunColor, uCoverage (0.41), uEnabled, uCloudScale (0.026202), uCloudSpeed (0.09450)`.

`uCloudScale`/`uCloudSpeed` (rubrique 4 NUAGES du panel EDA, cf. §13) remplacent depuis juillet 2026 les anciennes constantes GLSL figées de `density()` — réglables en live, aucune recompilation :
```glsl
vec3 p = pos * uCloudScale + vec3(0.0, 0.0, -uTime * uCloudSpeed);
```
Historique vitesse (avant l'exposition en uniform) : 0.2 → 0.164 (−18%) → 0.128 (−22%) → 0.105 (−18%) → 0.09450 (−10%).
Historique fréquence/taille (avant l'exposition en uniform) : 0.0212242 → 0.023582 (−10%) → 0.026202 (−10%).

**`cloudSky.visible` est toujours `true`** — c'est `uEnabled` qui active/désactive le rendu nuages. En mode nuit le gradient de ciel uni reste visible (couleurs nocturnes).

---

## 23. Mode Jour / Nuit

`isSoleil` (booléen mutable dans scene.js) — persistent via `localStorage('hexistenz_daynightmode')`.

Case à cocher `#dayNightToggle` dans `edaPanelWiring.js` (ex-`hud_eda.js`) — onglet Environnement, rubrique 6 "Jour / Nuit" (déplacée du footer en juillet 2026). Dispatche `hexistenz:dayNightChange` (CustomEvent), lu par scene.js et par le panel lui-même (pour resynchroniser la case si l'événement vient d'ailleurs, ex. init aléatoire jour/nuit dans `scene.js`).

**Star occluder** (`hexistenz-grid-star-occluder`) : rendu à `renderOrder=-500` pour masquer les étoiles sous le plateau. Mis à `visible=false` à l'init pour que les cellules vides montrent le ciel.

**Couleurs par mode** (injectées via `updateCloudSky`) :

| Uniform | Jour | Nuit |
|---|---|---|
| `uEnabled` | `1.0` (nuages actifs) | `0.0` (gradient uni) |
| `uSkyZenith` | `#0a1a3a` | `#01060f` |
| `uSkyHorizon` | `#4a7096` | `#0c1a2e` |
| `uSunColor` | `#ffe0a0` | `#d0e8ff` |

Côtés contrôlés par `isSoleil` :
- `cloudSky` : uniform `uEnabled` + couleurs zenith/horizon/sun (jamais `.visible`)
- `cometSky.visible` : false si jour
- Étoiles (`hexistenz-distant-star-universe`) : invisible si jour
- `updateCometSky(...)` : conditionnel dans animate (`if (!isSoleil)`)

**Astres GLB** (`threeSetup.js`) : `soleil.glb` + `lune_melies.glb` (ex-`lune.glb`, 2026-07-04) chargés à l'init. Visibilité contrôlée par `setAstreMode(scene, isSoleil)`. `SUN_LAYER=2` — rendu après labels, devant tout. Le flag `isMoon` (scale ×1.15) est déterminé par le nom logique `'visible-sky-moon-glb'`, pas par l'URL — insensible au renommage du fichier.

---

## 24. Pipeline rebuild différé — détails

```
overlayRebuildQueue = new Map<name, {rebuild, lod}>
```
Map JS → coalescing automatique, ordre d'insertion préservé. 1 overlay traité par frame. `lod()` appelé immédiatement après `rebuild()` pour éviter le pop-in.

**`pendingModelRebuild`** — flag sur `group.userData`. Posé par les callbacks GLB async (entre deux RAF). Lu et effacé au début de chaque frame dans animate(). Chemin : forestOverlay (arbres), railTrainOverlay (stations, wagon, track), decorOverlay (props).

**Forest incrémental** (`HEX_CHUNK_SIZE=3`) — `rebuildForestOverlay(group, placedTiles, changedTile)`. Si `changedTile != null && treeLibrary.size > 0` : dispose uniquement les IMs du chunk affecté (`userData.chunkKey`), rebuild uniquement ce chunk. ~4ms vs 18ms complet.

**`applyRemoteGameState` no-op guard** — si `_addedKeys.length === 0 && _removedCount === 0`, skip tous les overlay rebuilds. Évite le full rebuild forest systématique causé par le poll retournant l'état que le joueur vient de sauvegarder lui-même.

---

## 25. Profil de performance (HUD — référence 2026-07-05)

**GPU timing réel** — le HUD affiche désormais un vrai temps GPU asynchrone (`EXT_disjoint_timer_query_webgl2`, `gpuTimer.js`) au lieu d'un chrono CPU autour de `render()` (qui ne mesurait que la soumission, pas l'exécution — cf. piège §26). "GPU : X% (réel Yms / 16.7ms)" est donc fiable pour identifier le vrai goulot d'étranglement.

Mesure représentative (55 FPS, GPU-bound à 100%, réel 19.4ms) :

```
Draw calls : 2427   (HUD trackés : 1777 | Ombres/passes : ≈650, ☂403 casters)
Triangles  : 6 547 532   (trackés : 6 410 342)
Textures   : 1153
Shaders    : 103
```

Catégories dominantes en triangles (fragment/overdraw, pas draw calls, est le vrai coût GPU ici — végétation alpha-testée) :
- Plantes à baies : 26.7% (1 750 314▲, 4 866 obj)
- Brins d'herbe : 12.2% (799 932▲)
- Brins de blé : 7.8% (511 200▲)
- Fleurs : 8.2% (538 944▲)
- Maisons : 14.6% (957 618▲) — 94 obj, **62 dc, ☂22** (post-instancing, cf. §9/§17 ; était 378 dc/☂135 avant le passage en InstancedMesh)

Catégories dominantes en DC (hors végétation, déjà bien batchée) :
- Corbeaux : 100 dc (10 obj) — 1 DC par volatile
- Watchtowers : 34 dc (19 obj) — non instanciées (§9)
- Maisons : 62 dc (94 obj) — post-instancing (ex-390 dc/151 obj avant refonte)

---

## 26. Pièges connus

**Hexagone plat** — canvas labels : ratio W/H doit être 2/√3 ≈ 1.155.

**Font pas appliquée** — `hexFontReady` est async. URL **relative** (`./fonts/`) obligatoire.

**Hash procédural** — ne pas unifier les 3 précisions FNV-1a.

**`createOuterVertices`** — toujours passer `radius = HEX_SIZE * TILE_VISUAL.radiusScale`.

**`clone(true)` brise SkinnedMesh** — utiliser `cloneSkeleton` (SkeletonUtils).

**InterleavedBufferAttributes** — `mergeGeometries` échoue silencieusement. Désentrelacer via `attr.data.array[i * stride + offset + c]`.

**GLB Z-up** — `correctionX: Math.PI/2` dans PROP_MODEL_DEFS, appliqué *avant* calcul Box3.

**bypassBboxCheck** — les GLBs Blender sans "Apply All Transforms" ont une bbox ANORMALE. Ajouter ce flag ; la normalisation scale reste correcte via `target / large_dimension`.

**groundOffsetDelta** — valeur négative = descendre. Appliquée **après** snap, pas avant.

**colorGradingPass** — toujours passer par `composer.render()`. `renderer.render()` direct bypasse l'étalonnage.

**Shadow culling** — ne pas définir `castShadowOriginal` sur les meshes à ombres volontairement désactivées : `applySceneShadowFlags` ne restaure que si `typeof castShadowOriginal === 'boolean'`.

**Chi-mai** — `FIELD_MAX_DIST = HEX_SIZE * 0.72` (< apothème 0.866). La caméra doit être physiquement sur la tuile field pour déclencher.

**`Material.clone()` ne copie pas `onBeforeCompile`/`customProgramCacheKey`** — ce sont des méthodes du prototype `Material`, pas des champs copiés par `Material.prototype.copy()`. Tout pattern "prototype avec shader injecté via `onBeforeCompile` → clone par instance" (InstancedMesh, GLB partagés) perd le shader custom sur le clone. Il faut ré-appliquer la fonction d'injection (`applyGlobalWindToMaterial()` etc.) explicitement après chaque `.clone()`. Bug vécu : arbres figés malgré `applyGlobalWindToObject()` sur le prototype (§9).

**Type de biome pour placement props proches du centre de tuile** — `TERRAIN_RELIEF.enabled=false` (§6) rend la hauteur de sol par biome une fonction en PALIERS nets (pas de transition). Pour un point proche du centre (rayon ≤ `TILE_VISUAL.centerRadiusScale`, ex. `centerPos()` dans `villageDecorOverlay.js`), utiliser `getTileCenterType(placedTile)` — jamais un type d'arête deviné via `getEdgeFromLocalPoint()` sur un point quasi à l'origine (angle quasi arbitraire, retombe sur une arête au hasard parmi les 6, potentiellement différente du vrai centre). Bug vécu : chevaux flottants/enfoncés (§9).

**`onBeforeCompile` chaîne les injections — ne JAMAIS ré-appliquer sur un matériau déjà posé** — `applyGlobalWindToMaterial()` (`globalWind.js`) capture `previousOnBeforeCompile = material.onBeforeCompile` et l'appelle en premier avant d'injecter son propre code GLSL. Rappeler cette fonction sur un matériau qui l'a DÉJÀ (même après avoir supprimé `userData.globalWindSignature` pour forcer le "changement") empile une copie supplémentaire des uniforms/fonctions à chaque appel — d'autant plus piégeux que la courbure monde (`applyWorldCurvatureToMaterial`, `threeSetup.js`) se chaîne elle aussi PAR-DESSUS le vent une fois la tuile posée en scène, donc même réinitialiser juste `onBeforeCompile`/`customProgramCacheKey` avant de ré-appliquer casse la courbure. Erreur GLSL vécue : `'uGlobalWindTime' : redefinition`, `'globalWindHash' : function already has a body` → échec de compilation → arbres invisibles. Fix (`forestOverlay.js::setTreeWindParams`, panel EDA rubrique 6 VENT, cf. §13) : ne jamais patcher les matériaux existants — muter `TREE_WIND` (objet partagé, non gelé) puis déclencher un `rebuildForestOverlay()` complet (debounced 180 ms) qui clone toujours un matériau FRAIS depuis le prototype et y applique le vent une seule fois proprement.

**Formule de courbure du monde — corde vs distance d'arc** — une calotte sphérique paramétrée par la CORDE euclidienne (`-(R−√(R²−dist²))`) a une dérivée qui explose près de `dist=R` et devient un NaN au-delà (racine négative) : nécessite un clamp arbitraire (`maxDrop`) qui masque le symptôme (artefacts GPU à l'horizon en caméra rasante) sans traiter la cause. Paramétrer par la DISTANCE D'ARC (`drop = -R·(1−cos(dist/R))`) élimine le NaN par construction (cos défini partout) et borne nativement la pente (`|sin| ≤ 1`). cf. §19b.

**`MeshLambertMaterial` sur une géométrie sans attribut `normal`** — la nappe d'eau fusionnée (`waterSurfaceOverlay.js`) ne fournit que `position`/`aShoreDist`/`aSteep`, pas de `normal`. Un matériau éclairé (Lambert/Standard) calcule un vecteur normal nul → NaN après normalisation dans le vertex shader → triangles clippés, invisibles. Utiliser un matériau non éclairé (`MeshBasicMaterial`) pour tout mesh généré sans normales calculées. Bug vécu : eau lointaine invisible au lieu de bleu uni (fix LOD nappe, cf. §19).

**Ne jamais exclure la plage (`waterBeachGeometry.js`) de la courbure GPU (`markNoWorldCurvature`)** — contrairement au ciel/étoiles/comètes qui sont hors-monde, la plage doit suivre le terrain et l'eau. La marquer no-curvature la laisserait plate si l'utilisateur bascule en mode bouliste après génération : elle flotterait au-dessus de la mer courbée au lieu d'en épouser la surface.

**Post-processing hors scène-graph — la courbure du monde n'est jamais automatique** — `applySceneCurvatureFlags`/`applyWorldCurvatureToMaterial` (threeSetup.js, §19b) ne patchent que les matériaux de meshes/lines/points DANS la scène Three.js. Un `ShaderPass` de post-processing (ex. `smokeVolumePass.js`) est hors scène-graph et n'en bénéficie JAMAIS — toute logique world-space (positions, bornes de recherche d'un ray-march…) doit répliquer la courbure manuellement, y compris des bornes qui ressemblent à de simples constantes de calibration. Bug vécu : la fumée (`shaderFumee.js`) bornait son ray-march à un slab Y absolu fixe (`-0.05`/`1.3`, calibré terrain plat) — loin du centre en mode bouliste, `getWorldCurvatureDrop` fait sortir la source réelle de ce slab → fumée invisible ou écrasée sur une tranche résiduelle. Fix : slab recalculé chaque frame depuis le min/max Y réel des sources (déjà courbées), passé en uniforms (cf. §12b).

**Ne jamais réintroduire de clearance sol proportionnelle/plafonnée** — après plusieurs itérations infructueuses (clearance proportionnelle à la taille du prop, puis plafonnée sur bounding-box mesurée) ayant chacune déplacé sans régler le bug récurrent "NPC/herbe/moutons/chiens flottent ou enterrés", l'utilisateur a exigé une formule unique et fixe. Les biomes sont strictement plats (6 hauteurs possibles, §6) : tout prop se pose à `hauteur_du_biome + GROUND_CLEARANCE` (constante unique, `propPlacement.js`, cf. §9). Si le bug resurgit, chercher d'abord une mauvaise détection de type de biome (edge vs centre de tuile) ou un `groundOffsetDelta` par-modèle mal calibré — pas la clearance.

**Merger une branche ancienne réintroduit des régressions déjà corrigées** — une branche partie d'une base vieille de plusieurs jours peut ramener des reverts silencieux (valeurs par défaut, arguments de fonction supprimés) sur des fixes déjà validés depuis. Rediffer explicitement chaque fichier touché plutôt que de faire confiance au merge automatique. cf. §21.

**Nouvel `InstancedMesh` disparu du HUD** — `sceneProfiler.js` ne reconnaît que des préfixes de nom explicitement listés dans `_classifyInstanced` ; un nom non reconnu retombe sur `null` et le mesh est purement et simplement absent du HUD FPS (aucune catégorie, pas même "Autres"). Bug vécu : maisons instanciées (§9/§17) invisibles dans la section Bâtiments jusqu'à l'ajout du préfixe `instanced-house-`.

**Nouvel `InstancedMesh` qui réactive toutes les ombres** — sans `userData.castShadowOriginal` + `shadowFlagsApplied=true` posés explicitement à la création, `applySceneShadowFlags()` (§18) traite le mesh comme neuf et force `castShadow=true`, annulant l'optimisation "1 seul caster par variant". cf. §17.

**Timer GPU CPU-side trompeur** — `performance.now()` autour de `renderer.render()`/`composer.render()` mesure la soumission CPU, pas l'exécution GPU réelle (WebGL est asynchrone) : un rendu GPU-bound peut afficher un temps CPU bas et stable même à 100% de charge GPU réelle, masquant complètement le goulot d'étranglement. Fix (2026-07-05) : requête GPU asynchrone via `EXT_disjoint_timer_query_webgl2` (`gpuTimer.js`), pollée chaque frame (`postprocess.getGpuMs()`), fusionnée (`Object.assign`, pas remplacement) dans `_lastPerfTiming` du HUD FPS puisque le GPU réel se met à jour bien plus souvent que le timing CPU échantillonné (1 frame sur 120). cf. §25.

**Supprimer une fonction dupliquée en ne vérifiant qu'un seul call site** — lors d'une factorisation, vérifier l'usage d'un identifiant dans le SEUL bloc de code qu'on est en train d'examiner (ex. "n'est utilisé que par `serializeMissionManager`") ne prouve rien sur le reste du fichier. Grep l'identifiant sur le fichier ENTIER avant de supprimer sa déclaration locale. Bug vécu : suppression de `clonePlain` local dans `multiplayerUi.js`, 4 usages indépendants ailleurs dans le même fichier (deck/specialCells/bonusCells) non vus → `clonePlain is not defined` au chargement de partie (2026-07-11, cf. §21).

**Curseurs multijoueur distants jamais expirés côté serveur** — `multiplayer.php::update_cursor()` ajoute un curseur par `playerId` dans `room['cursors']` mais ne retirait jamais les entrées silencieuses. Comme il n'existe pas de mode solo réel (§21), toute room de test accumule un curseur fantôme permanent par session/rechargement, chacun forçant `renderRemoteCursors()` (scene.js) à recréer un mesh de tuile transparent (`DoubleSide`, `previewWater`) toutes les 900ms — un stall périodique qui grossit avec le nombre de sessions passées sur la même room, quasi indétectable si on ne pense pas à vérifier l'ANCIENNETÉ des données, seulement leur présence/absence. Fix : `prune_stale_cursors()` (TTL 20s) sur `poll`/`cursor` côté serveur + filtre identique côté client (§21). Piège général : face à un stall dont la période colle à un `setInterval` connu, vérifier les DONNÉES réelles qu'il traite (âge, volume), pas seulement si le mécanisme est actif.

---

## 27. Systèmes graphiques — référence upgrade

Regroupe tous les points d'entrée pour un upgrade visuel futur. Chaque système est localisé et indépendant.

### A. Pipeline de rendu post-processing

État courant (ordre des passes, 3 passes renderer/frame) : cf. §12.

**Upgrades pipeline** :
- Remplacer `BasicShadowMap` par `PCFSoftShadowMap` (`threeSetup.js`)
- Augmenter la résolution shadow map (actuellement 1024×1024)
- Ajouter une passe SSAO entre `RenderPixelatedPass` et `SmokeVolumePass`
- ~~Ajouter un bloom sélectif (eau, feu, comètes) après `colorGradingPass`~~ un bloom plein écran (seuil de luminance) est fait dans `cinematicPass` (§12, §13) ; un bloom sélectif par masque (eau/feu/comètes uniquement) reste à faire
- `WebGL2` + `logarithmicDepthBuffer: true` pour réduire le z-fighting lointain

---

### B. Système eau (`waterSurfaceOverlay.js` + `shoreField.js` + `realisticWater.js` + `shaders/shaderEau.js`)

Nappe continue PAR ZONE (surface + riverbed + jupe), rivage organique (`shoreNoise`/`shoreSteepness`), écume voronoï animée façon Danil déjà en place (cf. §19). Plus de mesh fusionné dans `terrainMerge` — l'eau en est explicitement exclue.

**Upgrades** :
- Réflexions dynamiques via `CubeCamera` ou `WebGLRenderTarget`
- Caustiques : texture animée projetée sur le riverbed (le champ `aShoreDist` déjà disponible peut moduler l'intensité près du bord)
- Spray GPU / particules d'éclaboussure sur les arêtes de rive (`aShoreDist ≈ 0`), en complément de l'écume déjà présente
- Interaction vague↔bateau au-delà du sillage actuel (déformation locale de `aShoreDist`/normales au passage)

---

### C. Ciel volumétrique (`cloudSky.js` + `shaders/shaderCiel.js`)

Sphère BackSide r=500, ray-march value noise FBM 4 octaves, Beer-Lambert.

**Upgrades** :
- Nuages 3D Worley (cellulaire) pour des cumulus plus réalistes
- Scattering Rayleigh/Mie physique (teinte orange/rouge au coucher de soleil)
- God rays : radial blur depuis `uSunDir` projeté
- Éclairs nocturnes : flash aléatoire basse fréquence (mode nuit)
- ~~`uCoverage = 0.41` : exposer dans le panneau LUT pour contrôle temps réel~~ fait (rubrique 4 NUAGES, + `uCloudScale`/`uCloudSpeed` en bonus, cf. §13)

---

### D. Fumée volumétrique (`smokeVolumePass.js` + `shaders/shaderFumee.js`)

ShaderPass, ray-march slab Y dynamique (`uSmokeYBase`/`uSmokeYTop`, recalculé par frame depuis le min/max réel des sources — fix courbure 2026-07-04, cf. §12b/§26), 48 pas, Gaussian évasé, 4 octaves turbulence, depth test.

**Upgrades** :
- Couleur par source : locos (gris charbon) vs maisons (blanc/beige)
- Connecter `globalWind.js` pour dériver la fumée dans la direction du vent
- `MAX_SMOKE_SOURCES = 48` → augmenter si grilles denses (attention perf shader)
- Réduire ou désactiver si preset "pluie" ajouté

---

### E. Effets cinématiques (`shaders/shaderCinematique.js`)

Fragment shader : courbure écran CRT → barillet → tilt-shift → aberration chromatique → gaussienne 9-taps → halation → God Rays → bloom → vignette → grain film → scan lines. Bloom et courbure écran CRT ajoutés le 2026-07-02, cf. §12/§13.

**Upgrades** :
- Depth of field vrai basé sur le depth buffer (tDepth) — remplacer tilt-shift horizontal
- Motion blur : accumulation frame précédente × matrice MVP précédente
- Aberration chromatique : 5-sample anamorphique (actuellement 3-sample radial)
- LUT 3D : remplacer la correction couleur par une `DataTexture3D` (Three.js r160 supporté)
- Bloom : passer d'un seuil plein écran à un masque sélectif (eau, feu, comètes), cf. §27.A

---

### F. LOD — stratégie upgrade

Tous les seuils dans `variables.js`. Test toutes les **9 frames** dans `animate()`.

**Upgrades** :
- LOD géométrique arbres/maisons : imposteur billboard ou mesh simplifié entre `LOD/2` et `LOD`
- `InstancedMesh.frustumCulled = true` + filtre BVH pour forêts denses (actuellement absent)
- Shadow LOD : liste d'exclusion distance dans `applyShadowCulling` (partiellement en place)
- Fade alpha progressif sur le blé au lieu du cull abrupt (`LOD_WHEAT_CULL_DISTANCE = 5.6`)

---

### G. Shaders végétation

**Herbe** (`grassBladeOverlay.js`) : Bezier animés CPU → upgrade : geometry/compute shader GPU.

**Blé** (`fieldWheatOverlay.js`) : vertex shader de vent `sin(uTime + position.x)`, connecter `globalWind.js`.

**Forêt** (`forestOverlay.js`) : ✅ fait — vent GPU via `globalWind.js`/`TREE_WIND` (§9). Upgrade restant : variation de fréquence/amplitude par variante d'arbre (actuellement un seul `TREE_WIND` partagé).

---

### H. Courbure du monde (`worldCurvature.js`)

Vertex shader GPU, mode "bouliste". Formule de drop en distance d'arc (`-R(1-cos(dist/R))`, fix 2026-07-03, cf. §19b) + tilt des objets posés (`getCurvatureTiltQuaternion`) + alignement des faces latérales de tuile (`tileMesh.js::_sideBottomShift`) — plus de décalage/artefact NaN.

**Upgrades** :
- Fog exponentiel coloré en fonction de la courbure (`gl_Position.z`) pour profondeur
- Bande horizon glow calquée sur `uSkyHorizon` du ciel
- Tilt de courbure (`getCurvatureTiltQuaternion`) à étendre aux props village (charrettes, animaux, panneaux, tonneaux, barques) et rails/trains, actuellement non couverts (cf. §19b)

---

### I. IBL et éclairage global

`PMREMGenerator + RoomEnvironment`, `environmentIntensity = 0.25`.

**Upgrades** :
- HDRI dynamique selon jour/nuit (`EXRLoader`, `DataTexture`)
- Light probes spatiales par tuile pour capter la couleur locale (prairie verte vs eau bleue)
- AO baked sur maisons/tours dans un vertex color channel secondaire

---

## 28. Philosophie

1. Ne pas casser la grille.
2. Ne pas casser le gameplay validé.
3. Modifications minimales et chirurgicales.
4. Pas d'usine à gaz.

---

## 29. VFX Météo (`environmentDirector.js` + `shaders/morningMistOverlay.js` + `weatherVfxOverlay.js` + `vfxSettings.js`)

Système d'effets météo visuels piloté par événements, intégré le 2026-07-09 (cf. §21). Remplace le scaffolding inerte Phase 0/1a.

**Chef d'orchestre — `environmentDirector.js`** (déjà présent) : catalogue `ENVIRONMENT_EVENTS` (morningMist/fireflies/rain/storm/lightning/fire/panic). API : `triggerEnvironmentEvent`/`stopEnvironmentEvent`/`stopAllEnvironmentEvents`/`isEnvironmentEventActive`/`onEnvironmentChange`/`updateEnvironmentDirector`/`getEnvironmentEventFade` (fondus entrée/sortie, défaut 6 s). Déclenchement manuel via rubrique EDA « 8. Météo » (§13).

**Overlays visuels** (branchés sur le director) :
- `shaders/morningMistOverlay.js` — nappe de brume volumétrique, respecte la courbure du monde (`WORLD_CURVATURE_SHADER`/`_UNIFORMS`). Réagit à l'event `groundMist`.
- `weatherVfxOverlay.js` — lucioles + pluie/orage via le moteur de particules `vendor/wawa-vfx-vanilla.js` (`VFXEmitter`/`VFXParticles`/`AppearanceMode`, port vanilla de wawa-vfx). Réagit aux events `fireflies`/`rain`/`storm`. Repositionné chaque frame sur `controls.target` (point du sol regardé).

**Store de réglages — `vfxSettings.js`** : `getVfxSettings(effect)`/`setVfxSetting(effect, key, value)`/`resetVfxSettings(effect)`/`onVfxSettingsChange(listener)` + `VFX_SETTINGS_DEFAULTS`. Persistance localStorage interne. Édité en direct dans la rubrique EDA « 8. Météo » (fusionné le 2026-07-10, ex-rubrique 2 indépendante — §13). Zone couverte = `VFX_WORLD_RADIUS` (`variables.js`, 15 unités).

**Câblage `scene.js`** : les 2 overlays instanciés après `createEnvironmentDirector()` ; dans `animate()`, un `deltaSeconds` clampé (`Math.min(0.1, …)` via `_vfxPrevTimeSeconds`) alimente `updateEnvironmentDirector` → `updateMorningMist` → `updateWeatherVfxOverlay` (ce dernier reçoit `controls.target`).

**Imports THREE** : les overlays utilisent l'URL CDN `three@0.160.0`, `wawa-vfx-vanilla.js` le specifier nu `"three"` — l'importmap `game.php` remappe les deux vers `./vendor/three.module.js` (instance unique).

---

## 30. Système de missions (`missions.js` + `missionLabels.js` + `ui.js` + `scene.js`)

**Modèle** : `missionManager.active` = tableau d'objets `{ id, tileId, type, label, unit, target, baseline, completed?, completedAtTurn? }`. `baseline` = valeur de progression au moment de la génération de la mission ; `gained = clamp(current − baseline, 0, target − baseline)` ; `total = target − baseline` (l'"étendue" de la mission — ex. mission 9/15 rails générée à baseline=9 → total=6). Formulation confirmée par l'utilisateur : si une mission est réussie à 24, la suivante générée avec target=30 aura `total = 30 − 24 = 6`.

**Titre court** (`formatMissionTitle(mission)`, `missionLabels.js` — extrait de `missions.js` le 2026-07-11, round 3, cf. §21) : phrase courte par type au-dessus de la barre ("Construire un village de 17 maisons", etc.), builders dans `MISSION_TITLE_BUILDERS` par `EDGE_TYPES`/type spécial (train/bateau/moulin). Remplace l'ancien `formatMissionLabel` (conservé dans `missionLabels.js`, non appelé).

**Barre de progression graduée** (`ui.js::updateMissionUI`) : `MAX_TICKS = 24` — nombre de graduations = `total` (1:1 en dessous du cap, arrondi proportionnel au-delà). Chaque graduation est un `<span class="mission-bar-seg[ seg-filled tierClass]">` coloré au fur et à mesure que `gained` grimpe (couleurs de palier conservées, `bar-mid`/`bar-near`/`bar-close`). Remplace l'ancienne barre à largeur continue (`.mission-bar-fill`).

**Disparition immédiate des missions réussies** : `scene.js::refreshMissionUI()` filtre `missionManager.active.filter(m => !m.completed)` avant de passer la liste à `updateMissionUI` — une mission réussie disparaît du tableau au tour même. **Ne pas confondre avec** `COMPLETED_MISSION_VISIBLE_TURNS` (`variables.js`, = 5) : ce mécanisme de rétention dans `manager.active` reste nécessaire pour l'undo (`restoreMissionSnapshots`/`restoreMissions`, `missions.js`) et n'a pas été touché — seul l'affichage a été changé, pas le modèle de données.
