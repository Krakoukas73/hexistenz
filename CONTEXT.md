# CONTEXT.md — Hexistenz

## 1. Nature du projet

**Version courante : `v0.9.2`** (source unique : `variables.js` → `HEXISTENZ_VERSION`).

Jeu web contemplatif de pose de tuiles hexagonales, inspiré de Dorfromantik / The Settlers / HoMM. Le joueur pioche une tuile, la tourne, la pose sur une grille hexagonale. Chaque tuile a 6 secteurs triangulaires (biomes ou réseaux). Objectif : connecter les biomes, compléter des missions, maximiser le score.

Stack : JavaScript ES Modules natifs, sans bundler. Three.js r160 (CDN). PHP pour highscores/multiplayer. JSON stockage. Pas de framework, pas de SQL.

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
| `waterZoneOverlay.js` | BFS zones eau, hover, labels valeur |
| `waterSurfaceOverlay.js` | Nappe d'eau continue par zone, rivage organique (cf. §19) |
| `waterBeachGeometry.js` | Plages procédurales, alignées sur le rivage organique |
| `waterZoneBoundary.js` | Halos/contours de zone |
| `waterBoatOverlay.js` | Bateaux GLB animés, graphe nav |
| `forestOverlay.js` | Arbres GLB (InstancedMesh) |
| `houseOverlay.js` | Maisons, église, cimetière, tours de guet |
| `tileRailOverlay.js` | Rails procéduraux, traverses, ballast |
| `railTrainOverlay.js` | Trains GLB, wagons, gares terminus |
| `decorOverlay.js` | Orchestrateur props : moulins, fontaines, tonneaux, barques côtières, animaux… |
| `naturalPropsOverlay.js` | Fleurs/rochers/roseaux/bottes/cerfs (InstancedMesh) |
| `villageDecorOverlay.js` | Panneaux, charrettes, chiens, chevaux, tonneaux |
| `fieldWheatOverlay.js` | Brins de blé procéduraux, effets champ |
| `fieldZonesOverlay.js` | Moulins, bâtiments spéciaux champ, safe zones |
| `sheepOverlay.js` | Moutons animés (SkinnedMesh) sur les zones prairies |
| `bonusCellChestOverlay.js` | Coffre animé sur chaque cellule bonus |
| `tileRoadOverlay.js` | **Routes désactivées** — stubs no-op |

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

### Pass cinématique (`cinematicPass.js` + `shaders/shaderCinematique.js`)

Fragment shader, dans l'ordre d'exécution : **courbure écran (CRT)** (déforme l'UV en amont, anisotropie légère horizontale/verticale) → distorsion barillet (bâtie sur l'UV déjà courbée) → tilt-shift → aberration chromatique → gaussienne 9-taps → halation → **God Rays** → **bloom** (seuil + 8-tap radial) → vignette → grain film → scan lines, puis en toute fin **masque/assombrissement de bords CRT** (mix distance Chebyshev/radiale, indépendant des coins uniquement).

Uniforms clés : `uTilt`, `uFocusCenter`, `uFocusBand`, `uVignette`, `uGrain`, `uChromatic`, `uHalation`, `uBarrel`, `uScanLines` (0–6 px / cycle 8 px), `uGodRaysLength/Diffusion/Threshold`, `uBloomIntensity/Threshold/Radius/Softness`, `uCrtCurvature/Mask/CornerDark`, `uTime`, `uResolution` (injecté dans threeSetup.js — absent de CINEMATIC_SHADER.uniforms).

**Convention d'ajout d'effet** (God Rays, Bloom, Courbure écran) : un slider maître à `0` bypass tout le bloc GLSL (`if (uMaster > 0.001) { ... }`) — zéro coût GPU, zéro effet visuel — pendant que ses sous-paramètres peuvent avoir des défauts non-nuls sans risque puisqu'ils sont inertes tant que le maître est à 0. Bloom et Courbure écran ont chacun leur propre case à cocher `xxxEnabled` dans le HUD (§13), au même titre que God Rays/Tilt-shift.

**API** : `postprocess.getCinemaSettings()`, `applyCinemaSettings(partial)`, `toggleCinema()`. **Touche T**. Persistance localStorage `hexistenz_cinema_v1`. Config intégrée dans chaque preset d'`ambiances.json`.

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

## 13. Panel CUSTOMISATION / EDA (`debugLightUi.js` + `json/ambiances.json`)

Touche **E** → ouvre/ferme le panel EDA (Éditeur de Direction Artistique). Touche **F** → HUD perf avancé (FPS détaillé), indépendant de l'EDA.

**Layout (refonte juillet 2026)** : le panel n'affiche plus 3 colonnes simultanées mais **3 onglets** sous le header, chaque onglet organisé en 2 colonnes. Header (`AMBIANCES` + presets) et footer (undo/redo, 📋 Copier, comparer) restent communs, plein-largeur, au-dessus/en-dessous des onglets. Forme du monde et Jour/Nuit, auparavant des boutons de footer, sont désormais des cases à cocher dans l'onglet Environnement (rubriques 5 et 6, cf. tableau ci-dessous). Largeur du panel : `LUT_WIDTH_FACTOR = 2` × largeur `#tileUI` (réduite de 3 à 2 depuis le passage en onglets — 2 colonnes au lieu de 3 à afficher). Hauteur **fixe** `calc(100vh - 28px)`. Onglet actif persisté dans `localStorage['hexistenz_eda_tab']`, bascule sans coût de layout (`display:none` sur les panels inactifs).

Numérotation à plat par onglet (repart de 1, ordre de lecture colonne A puis colonne B — plus de rubrique "parente" séparée de ses sous-rubriques, sauf VENT qui garde un niveau de sous-numérotation) :

| Onglet | Colonne A | Colonne B |
|---|---|---|
| **LUT** | 1. Brouillard · 2. Astre lumineux | 3. Étalonnage · 4. Palette biomes |
| **Cinématique** | 1. CINÉMATIQUE (vignette/grain/aberration/halation/barillet/scanlines) · 2. God Rays · 3. Tilt-shift · 4. Bloom | 5. Pixélisation · 6. Courbure écran (CRT) |
| **Environnement** | 1. Écume · 2. Sillage bateau · 3. Nuages | 4. Vent (4.1 Blés, 4.2 Herbes, 4.3 Arbres) · 5. Forme du monde · 6. Jour/Nuit |

Rubriques avec interrupteur on/off dans leur en-tête (grise les contrôles sans réinitialiser les valeurs) : Étalonnage, Palette biomes, CINÉMATIQUE, God Rays, Tilt-shift, **Bloom**, Pixélisation, **Courbure écran**, **Écume** (🫧), **Sillage bateau** (🚤), **VENT** (coupe l'ondulation blé + prairie + arbres simultanément — cf. plus bas). Bloom et Courbure écran, ajoutés en juillet 2026, suivent exactement le même mécanisme de case à cocher que God Rays/Tilt-shift : la valeur du slider reste mémorisée, seul l'uniform effectif est forcé à 0 quand décoché. Écume/Sillage bateau (`hud_eda.js`, rubriques 1/2 de l'onglet Environnement) suivent depuis le 2026-07-03 le même mécanisme : décoché → `foamWidth/foamDensity/foamAmbient` (écume) ou `density/opacity` (sillage) forcés à 0 en live via `setWaterFoamParams`/`setWakeParams`, valeurs mémorisées intactes.

**Tout paramètre de ce panel (LUT, cinéma, eau, vent, nuages…) est réglable en direct pendant la partie** : chaque slider commit immédiatement sur le pipeline GPU (aucune recompilation shader hors cas explicitement documentés, ex. reconstruction forêt pour le vent des arbres), avec undo/redo et export JSON via 📋 Copier.

**Auto-masquage réciproque** : quand l'EDA est ouvert (`body.lut-panel-open`), `#scorePanel` et le mini-HUD clavier (`#kbdHintHud`, "H ou ESC → aide") sont masqués ; ils réapparaissent à la fermeture. `#scorePanel` partage ce mécanisme avec le HUD FPS avancé (`_syncFpsFullscreen()` — masqué si EDA ouvert OU HUD FPS développé).

**Emojis de rubrique/sous-rubrique** : agrandis ×1.35 via un span dédié `.rubrique-emoji` (`font-size: 1.35em`, relatif au parent — reste correct aussi bien à 12px (rubriques) qu'à 11px (sous-rubriques)).

Presets `json/ambiances.json` (**14**, vérifié 2026-07-04) : Défaut, Brume, Automne, Été vif, Hiver, Sépia, Nordique, Désert, Pong (pixelSize=15, scanLines=4, worldShapeMode forcé "platiste"), Apple II (scanLines=4, pixelSize=3), CGA (scanLines=4, pixelSize=3), EGA (scanLines=3, pixelSize=3), Amiga (pixelSize=2, scanLines=2), Psyché-LSD. Chargé via `fetch('./json/ambiances.json')`.

**📋 Copier** : exporte `{ lut, pix, cinema, water, wind, cloud, dayNight }` en JSON (`pix` inclut `worldShapeMode`). Undo/redo couvrent les 6 catégories LUT/pix/cinema/water/wind/cloud (`_snapshotAll`/`_restoreSnapshot`) — Forme du monde et Jour/Nuit en restent délibérément exclus (réglages "monde", pas "regard"), mais sont bien inclus dans l'export 📋 Copier.

**Quantification palette rétro** (`visualEnvironment.js`) : uniforms `uPaletteColors[40]` + `uPaletteSize` + `uPaletteDither`. Comparaison en espace sRGB (raw hex — ne pas passer par `new THREE.Color()`).

### Onglet Environnement — rubrique 4. VENT

Regroupe 3 sources de vent indépendantes, avec un interrupteur on/off global qui les coupe toutes les trois sans écraser les valeurs mémorisées (`_applyWindLive` applique `strength`/`sway` effectifs à 0 seulement en live) :

- **Blé/prairie** (`fieldWheatOverlay.js` / `grassBladeOverlay.js`) : uniforms simples (`uWindStrength`, `uWindSpeed`, + `uWindSway` pour la prairie) — modifiables en live, aucune recompilation shader. Getters/setters exportés : `getWheatWindParams/setWheatWindParams`, `getGrassWindParams/setGrassWindParams`.
- **Arbres** (`forestOverlay.js`) : le vent est cuit dans la SOURCE du shader (`onBeforeCompile`, `TREE_WIND`), pas de simples uniforms. `setTreeWindParams(group, partial)` ne patche jamais les matériaux déjà posés en place (piège vécu, cf. §26) : il met à jour `TREE_WIND` puis déclenche un **rebuild forêt complet debounced** (180 ms, `rebuildForestOverlay`) — seule voie sûre pour réappliquer le vent sans empiler des injections GLSL dupliquées.

### Onglet Environnement — rubrique 3. NUAGES

`cloudSky.js` expose désormais `uCloudScale` / `uCloudSpeed` en uniforms (remplacent les constantes GLSL figées `0.026202` / `0.09450` de `shaders/shaderCiel.js`), en plus de `uCoverage` déjà existant. Getters/setters : `getCloudSkyParams/setCloudSkyParams`. Réglable en live, aucune recompilation (l'upgrade "exposer uCoverage dans le panneau" listée en §27.C est donc faite, avec scale/vitesse en bonus). Rubrique déplacée en colonne A (avec Écume/Sillage bateau) depuis juillet 2026.

### Onglet Environnement — rubriques 5. Forme du monde / 6. Jour-Nuit

Anciennement des boutons à bascule dans le footer du panel EDA, ces deux réglages sont désormais des cases à cocher (`.pix-switch`) en colonne B de l'onglet Environnement, comme les autres rubriques. Chaque rubrique n'a qu'une case : cochée = premier état (Bouliste / Jour), décochée = second état (Platiste / Nuit), avec un `<output>` texte affichant le mode actuel. Les deux réglages restent hors undo/redo ("réglage monde, pas regard"), mais sont inclus dans l'export 📋 Copier (`pix.worldShapeMode` et `dayNight`).

---

## 14. Labels de zones (`waterZoneOverlay.js` + `tileLabels.js`)

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

**Réglages live** : intégrés dans le panel CUSTOMISATION/EDA (onglet Environnement, rubriques 1 "🫧 Écume" et 2 "🚤 Sillage bateau", cf. §13) — sliders écume (portée, finesse, densité rive/surface, netteté, vitesse, étendue dégradé, opacité) + sillage bateau (largeur, divergence, longueur, finesse, densité, opacité). Setters/getters : `getWaterFoamParams/setWaterFoamParams` (`realisticWater.js`), `getWakeParams/setWakeParams` (`waterBoatOverlay.js`). `waterDebugUi.js` (ancien panneau flottant autonome 💧 EAU, fusionné dans l'EDA) supprimé le 2026-07-04 — code mort, `createWaterDebugPanel()` n'était plus appelé nulle part.

**Sillage bateau** (`waterBoatOverlay.js`) : ruban en V dynamique (`WAKE_MAX_POINTS = 26`), dense près du bateau et se dissipant vers l'arrière (gradient de densité dans `foamPattern`), `ShaderMaterial` singleton partagé par tous les sillages. Points enregistrés à distance ABSOLUE derrière le bateau (`dBehind`, anti-pop à l'ajout/retrait d'un point) ; tête du ruban recollée au bateau chaque frame (apex fluide, pas de saut au commit d'un nouveau segment). Fondu de queue qui atteint vraiment 0 (`smoothstep(0.45, 1.0, vAlong)`, plus d'arrêt net). **LOD bateau (fix 2026-07-03)** : `updateWaterBoatLOD` calcule désormais la distance caméra↔bateau en 3D complet (X+Y+Z) au lieu de XZ seul — corrige un bug où la vue verticale (top-down, caméra XZ ≈ bateau XZ, dist2D≈0) rendait les bateaux toujours visibles quelle que soit l'altitude caméra.

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

> Tous les fichiers sont à la **racine**. Le sous-dossier `stable/` a été supprimé mi-2026.

### Arborescence JSON (données persistées serveur)

```
json/
  ambiances.json        Presets LUT (16 presets) — chargé par debugLightUi.js
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
tileMesh.js / tileTextures.js  Géométrie et textures tuiles
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
tileRoadOverlay.js             Routes — stubs no-op (GLBs supprimés)
railTrainOverlay.js            Trains GLB, wagons, gares
waterZoneOverlay.js            BFS zones eau, labels sprites, calcule et transmet le shoreMap organique
waterSurfaceOverlay.js         Nappe d'eau continue par zone (surface+riverbed+jupe), rivage organique
shoreField.js                  shoreNoise/shoreSteepness — bruit de rivage organique, buildShoreDisplacementMap
waterBeachGeometry.js          Plages procédurales, épouse le rivage organique via shoreMap partagé
waterZoneBoundary.js           Halos/contours de zone (générique tous biomes, bords droits)
waterBoatOverlay.js            Bateaux GLB animés + sillage en V (écume)
realisticWater.js              ShaderMaterial eau « cute cartoon » + écume Danil, réglages live
shaders/shaderEau.js           GLSL eau (aShoreDist/aSteep) + FOAM_GLSL partagé (eau + sillage)
fieldWheatOverlay.js           Brins de blé procéduraux, BFS local
fieldZonesOverlay.js           Moulins, bâtiments spéciaux, safe zones
grassBladeOverlay.js           Brins d'herbe Bezier animés
forestOverlay.js               Arbres InstancedMesh
houseOverlay.js                Village GLB
houseVillageMaterials.js       Matériaux partagés maisons/village
houseVillageObjects.js         Maisons, tours, église
decorOverlay.js                Orchestrateur props décor + PROP_MODEL_DEFS + constantes partagées
naturalPropsOverlay.js         Fleurs, rochers, roseaux, bottes, cerfs (InstancedMesh)
villageDecorOverlay.js         Panneaux, charrettes, chiens, chevaux, barques côtières
bonusCellChestOverlay.js       Coffres animés cellules bonus
threeSetup.js                  Renderer, caméra, postprocess, layers, IBL, sun orbit
cinematicPass.js               CINEMATIC_SHADER (tilt-shift, grain, aberration…), touche T
visualEnvironment.js           LUT, lumières, environnement IBL, config défaut
debugLightUi.js                Panneau CUSTOMISATION + HUD perf + sceneProfiler
sceneProfiler.js               Comptage DC/triangles/objets par catégorie (HUD)
worldCurvature.js              Courbure monde GPU (calotte, drop en cos) + picking souris + tilt props (§19b)
shadowCulling.js               Culling ombres par distance
soundDesign.js                 Audio spatial, layers, chi-mai, corbeaux, ambiances
globalWind.js / starUniverse.js / cometSky.js
cloudSky.js / shaders/shaderCiel.js   Ciel volumétrique nuages procéduraux
smokeVolumePass.js                    ShaderPass fumée volumétrique (maisons + locos)
shaders/shaderFumee.js                GLSL ray-march fumée (Gaussian évasé, turbulence 4 octaves, depth test)
hashUtils.js / hexLabelFont.js / tileLabels.js
bonusCells.js / specialCells.js / highscore.js
multiplayerClient.js / multiplayerUi.js / controls.js / missions.js
ui.js / help.js / grid.js / gridRegions.js
contentDensity.js                     Multiplicateur densité contenu (qualité/FPS), scaledCount/scaledCountMin (§21)
qualityUi.js                          Bouton flottant "⚙ QUALITÉ" + presets/slider, pilote contentDensity.js
environmentDirector.js                Machine à états évènements environnementaux (Phase 0 VFX) — INERTE, rien n'est branché
environmentDebugUi.js                 Panneau debug "🌦 ENV" pour tester manuellement environmentDirector.js
morningMistOverlay.js                 Modulation fog pour évènement 'morningMist' — NON appelée dans animate() (dormant)
```

---

## 21. Historique — épisodes non couverts ailleurs

La quasi-totalité des évolutions passées (eau, courbure monde, panel EDA, fumée, ciel, LOD, pools de props, HUD…) est documentée à l'**état courant** dans ses sections dédiées (§6 à §20) — inutile de dupliquer un journal des changements en plus. Seuls les deux épisodes suivants ne sont capturés nulle part ailleurs :

**⚠️ Merge VFX Cyril intégralement annulé** (2026-07-03) : un merge annoncé (god rays, feu/tornade/éclair/embers, cycle jour/nuit progressif, brume, audio VFX — 14 fichiers dont `vfxEngine.js`, `dayNightCycle.js`, `effectScheduler.js`, `mistManager.js`, `particlePool.js`, `effects/*`, `shaders/shaderGodRays.js`, `shaders/shaderParticles.js`) a été entièrement défait sur décision utilisateur ("aucune n'a été validée"). Aucun de ces fichiers n'existe dans les sources, `HEXISTENZ_VERSION` est resté à `v0.9.1.10`. **Ne pas supposer ce système présent** dans une future session — vérifier par `grep`/`find` avant de s'y référer.

**Merge du système eau (intégration Cyril, 2026-07-01)** — la branche fusionnée partait d'une base vieille de 3 jours ; 3 régressions ont été repérées et écartées à l'intégration : suppression de `sheepOverlay` dans `scene.js`, retour de `TREE_WIND.strength` à 0.062 (annulait le fix "brindilles", §9), perte d'arguments dans `maybeGenerateMissionForTile`/`updateDeckUI`. Leçon : re-fusionner une branche ancienne exige de rediffer chaque fichier touché, pas seulement de merger — cf. piège en §26.

**⚙️ Throttle GPU périodique résolu — curseurs multijoueur fantômes jamais expirés** (2026-07-06, v0.9.2) : investigation de ~2 jours sur un GPU qui throttlait (jusqu'à 100%) même caméra/scène strictement immobiles, en solo comme en multi — sauf qu'il n'existe plus de vrai mode solo dans Hexistenz (toute partie est jouable en multijoueur via `?multi=CODE`). Root cause : `multiplayer.php::update_cursor()` ajoutait un curseur par `playerId` à chaque survol distant mais n'en supprimait **jamais** côté serveur. Une room de test (`room_SMALL.json`) avait accumulé 21 curseurs fantômes, certains vieux de +24 jours, tous `visible=true` pour toujours — chacun faisait recréer un mesh de tuile transparent (`DoubleSide`) via `renderRemoteCursors()` (scene.js) toutes les 900ms (`setInterval(refreshMultiplayerRoom, 900)`), soit le cycle de ~51-54 frames observé depuis le début. Le nombre de fantômes grossissait à chaque nouvelle session de test, expliquant l'aggravation progressive du symptôme au fil des jours. Fix : purge automatique par TTL (20s) côté serveur (`prune_stale_cursors()`, appelée sur `poll` et `cursor`) + filtre défensif identique côté client. Résultat validé : GPU 100% → 2-3% en caméra haute idle. cf. piège en §26.

**📋 Merge Cyril → sources live (2026-07-07)** : dossier `hexistenz-merge-piregwan-2026-07-06/` reçu de Cyril (zip, cf. workflow ci-dessus), fusionné manuellement fichier par fichier dans les sources (pas de git ici). La branche Cyril partait d'une base antérieure au 2026-07-06 — **même piège que le merge eau du 07-01** (ci-dessus) : plusieurs de ses fichiers réintroduisaient des régressions sur des optims déjà validées depuis (instancing personnages §9/§17, `LOD_GRASS_CULL_DISTANCE` −10%, `_LOD_HEIGHT_MIN_FACTOR` 0.80, reclassement LOD des baies en `'plant'`, VOLUMETRIC_SMOKE_ENABLED, reflets eau). Chaque fichier a été rediffé individuellement avant merge (cf. piège §21/§26 déjà documenté). Décisions retenues avec l'utilisateur :
- **Adopté tel quel** : `contentDensity.js`/`qualityUi.js` (nouveau système de densité de contenu, bouton "⚙ QUALITÉ") appliqué à moutons/herbe/props naturels (PAS aux personnages, cf. ci-dessous) ; frustum culling ajouté à `updateRailTrainLOD`/`updateWaterBoatLOD` ; `threeSetup.js` (antialias:false, `MAX_PIXEL_RATIO=1.0`, masquage de sous-arbres lourds pendant `renderTextLayer`) ; `FOREST_CHUNK_SIZE=6` (chunk arbres distinct de `HEX_CHUNK_SIZE`) ; simplification du shader d'eau (retrait Fresnel/glints, validé par l'utilisateur — eau plus "flat cartoon") ; scaffolding VFX Phase 0/1a inerte (`environmentDirector.js`, `environmentDebugUi.js`, `morningMistOverlay.js` — aucun effet visuel, `updateMorningMist`/`updateEnvironmentDirector` non appelés dans `animate()`).
- **Rejeté (gardé la version actuelle, plus récente/validée)** : `characterOverlay.js`, `decorOverlay.js`, `sceneProfiler.js` (la branche Cyril revenait à des personnages GLB individuels non instanciés + son propre density-gate — l'instancing déjà validé (378→62 dc) couvre mieux le problème perf ; pas de density-gate sur les personnages dans ce merge) ; `waterSurfaceOverlay.js` (Cyril retirait le paramètre `lodFactor` de réduction LOD selon hauteur caméra) ; `VOLUMETRIC_SMOKE_ENABLED=false` (fumée reste activée par défaut, choix utilisateur) ; les fonctions de diagnostic per-frame dans `scene.js` (`warmUpAllPrograms`/`checkProgramChurn`/`checkBiomeMaterialFlicker`/`findTransparentBiomeUsers`/`[RAF-STALL]`, cf. throttle GPU ci-dessus déjà résolu) — laissées en l'état, retrait différé sur confirmation explicite de l'utilisateur.
- Données runtime (`json/highscores.json`, `json/games/room_*.json`) : non touchées, la copie de Cyril était une capture plus ancienne.

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

Case à cocher `#dayNightToggle` dans `hud_eda.js` — onglet Environnement, rubrique 6 "Jour / Nuit" (déplacée du footer en juillet 2026). Dispatche `hexistenz:dayNightChange` (CustomEvent), lu par scene.js et par le panel lui-même (pour resynchroniser la case si l'événement vient d'ailleurs, ex. init aléatoire jour/nuit dans `scene.js`).

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

### E. Effets cinématiques (`cinematicPass.js` + `shaders/shaderCinematique.js`)

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
