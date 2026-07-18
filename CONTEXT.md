# CONTEXT.md — Hexistenz

## 1. Nature du projet

**Version courante : `v0.9.2.6.10`** (source unique : `variables.js` → `HEXISTENZ_VERSION`).

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
themeManager.js                 Plomberie thème graphique (getTheme/setTheme/applyTheme,
                                localStorage hexistenz_theme, data-theme) — ajouté 2026-07-17, cf. §32
                                (thème "ancien" pas encore câblé visuellement)
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
replayEngine.js                       Relecture accélérée de la partie en cours (bouton bandeau 🎬 / touche V) — monde
                                       reconstruit tuile par tuile dans des groupes 3D parallèles (jamais les groupes
                                       réels), play/pause/vitesse ×1-×8/restart/enregistrement vidéo WebM (2026-07-16, §21)
```

---

## 21. Historique — épisodes non couverts ailleurs

La quasi-totalité des évolutions passées (eau, courbure monde, panel EDA, fumée, ciel, LOD, pools de props, HUD…) est documentée à l'**état courant** dans ses sections dédiées (§6 à §20) — inutile de dupliquer un journal des changements en plus. Seuls les épisodes suivants (chronologiques) ne sont capturés nulle part ailleurs — root causes, décisions arbitrées avec l'utilisateur, pièges non génériques :

**⚠️ Merge VFX Cyril intégralement annulé** (2026-07-03) : un merge annoncé (god rays, feu/tornade/éclair/embers, cycle jour/nuit progressif, brume, audio VFX — 14 fichiers dont `vfxEngine.js`, `dayNightCycle.js`, `effectScheduler.js`, `mistManager.js`, `particlePool.js`, `effects/*`, `shaders/shaderGodRays.js`, `shaders/shaderParticles.js`) a été entièrement défait sur décision utilisateur ("aucune n'a été validée"). Aucun de ces fichiers n'existe dans les sources, `HEXISTENZ_VERSION` est resté à `v0.9.1.10`. **Ne pas supposer ce système présent** dans une future session — vérifier par `grep`/`find` avant de s'y référer.

**Merge du système eau (intégration Cyril, 2026-07-01)** — branche partie d'une base vieille de 3 jours, 3 régressions repérées et écartées à l'intégration (suppression `sheepOverlay`, retour `TREE_WIND.strength` à 0.062, perte d'arguments `maybeGenerateMissionForTile`/`updateDeckUI`). Leçon : rediffer chaque fichier touché, pas seulement merger — cf. piège §26.

**⚙️ Throttle GPU périodique résolu — curseurs multijoueur fantômes jamais expirés** (2026-07-06, v0.9.2) : GPU throttlant jusqu'à 100% même caméra/scène immobiles. Root cause : `multiplayer.php::update_cursor()` ajoutait un curseur par `playerId` à chaque survol distant mais n'en supprimait **jamais** côté serveur — une room de test avait accumulé 21 curseurs fantômes, certains vieux de +24 jours, chacun recréant un mesh de tuile transparent via `renderRemoteCursors()` toutes les 900ms. Fix : purge automatique par TTL (20s) côté serveur (`prune_stale_cursors()`) + filtre défensif client. Résultat validé : GPU 100% → 2-3% en caméra haute idle. cf. piège §26.

**📋 Merge Cyril → sources live (2026-07-07)** puis **ajustements utilisateur (07-08)** : dossier reçu de Cyril, fusionné manuellement fichier par fichier (pas de git). Même piège que le merge eau du 07-01 : branche partie d'une base antérieure au 07-06, plusieurs fichiers réintroduisaient des régressions sur des optims déjà validées (instancing personnages, LOD baies/herbe, reflets eau) — chaque fichier rediffé individuellement avant merge.
- **Adopté** : `contentDensity.js`/`qualityUi.js` (densité de contenu, bouton "⚙ QUALITÉ", appliqué à moutons/herbe/props naturels, PAS aux personnages) ; frustum culling rail/bateau ; réglages perf `threeSetup.js` ; simplification shader d'eau (retrait Fresnel/glints) ; scaffolding VFX Phase 0/1a inerte (branché seulement au 07-09).
- **Rejeté** (version live gardée, plus récente/validée) : personnages non instanciés, retrait du `lodFactor` eau, fumée désactivée par défaut, diagnostics per-frame (throttle GPU déjà résolu).
- **Retouches du 07-08** : touche C (cinéma) retirée intégralement (l'utilisateur n'en voulait plus) — master switch CINÉMATIQUE reste accessible uniquement via sa case EDA. Bouton flottant `qualityUi.js` supprimé, contenu migré dans le panel EDA (rubrique 7 "Qualité/densité", réglage machine hors undo/redo/export). Prez : clic gauche/droit + molette ajoutés au bandeau raccourcis, fumée volumétrique passée du placeholder CSS à la vraie image.

**📋 EDA — refonte flux journal 3 colonnes + rubrique Météo (2026-07-08)** : cinq changements consécutifs, tous validés au fil de l'eau.
- **Layout 3 colonnes fluides type journal** — CSS `columns: 3; column-gap: 14px` sur `.debug-light-columns` (`break-inside: avoid` par rubrique) à la place du flex 2-colonnes rigide par onglet ; panel élargi +40%. Markup aplati (retrait des wrappers de scroll/colonnes dédiés).
- **⚠️ Piège backticks CSS** — écran noir (`SyntaxError`) : des backticks stylistiques dans des commentaires CSS fermaient prématurément le template literal JS `installDebugLightCss`. **Interdit d'utiliser des backticks dans tout commentaire à l'intérieur d'un template literal** (cf. mémoire `feedback-backticks-template-css`).
- **Rubrique 8 Météo** — fusion de l'ex-HUD flottant `environmentDebugUi.js` dans l'onglet Environnement (API du director inchangée, aucun hook cassé). Fichier `environmentDebugUi.js` supprimé.
- **Titres de rubrique uniformisés** — bandeau fond sombre + liseré, `text-transform: uppercase` (cause de l'incohérence de casse signalée : Météo/God Rays/Tilt-shift restaient en Title Case).
- **Séparateurs horizontaux retirés** au profit du flux journal + `margin-bottom` uniforme.
- **Boutons Météo alignés sur la charte EDA** (padding/rayon/ombre alignés sur `.debug-light-preset-btn`).

**📋 Prez — nav mobile + variété des personnages (2026-07-08)** : nav responsive cassée sous 900px → hamburger + dropdown. Le seuil pixel-perfect s'est révélé impossible à caler (signalé "trop tôt" après plusieurs remontées) — remplacé par un fallback tolérant (`flex-wrap` à 1300px avant bascule dropdown à 860px). Leçon : face à un seuil responsive contesté, préférer un fallback qui absorbe l'incertitude plutôt qu'ajuster un chiffre exact. `#creatures` enrichie d'un bloc listant les 22 archétypes réels (la vitrine n'en montrait que 3).

**📋 Merge VFX météo Cyril → sources live (2026-07-09, validé)** : intégration du moteur d'effets météo qui branche enfin les hooks `environmentDirector` inertes depuis le 07-07. Système décrit à l'état courant en **§29**. Contrairement aux deux merges précédents, celui-ci était **propre** (diff confirmé superset strict, uniquement des ajouts) → copie directe sans risque.

**📋 Authentification joueur — OAuth étudié puis abandonné (2026-07-11)** : pas de DB/sessions côté serveur, réplique de test en HTTP seul aurait cassé le flux "tester en local avant prod" pour un vrai OAuth. Décision utilisateur : abandon, fix minimal retenu — `localStorage['hexistenz.playerName']`, champ pseudo préempli, conservé après soumission réussie.

**📋 Factorisation doublons triviaux + régression `clonePlain` (2026-07-11)** : audit complet sur demande utilisateur ("factoriser ce qui peut l'être, pas de duplicatas") — seul le lot "doublons triviaux à risque nul" autorisé. Dix identifiants consolidés (`escapeHtml`→`domUtils.js`, `mulberry32`/`pickRandom`→`random.js`, `easeInOutSine`/`clamp`→`tileUtils.js`, `hashRagged*`/`hash01`→import direct depuis `raggedEdge.js`, `serializeMissionManager`/`clonePlain`→`missions.js`, `getHexDistance`→`hex.js`, `shortestHueDelta` canonique dans `realisticWater.js`, `getGridPlaneY()`→constante `GROUND_CLEARANCE`).
**Régression vécue** : suppression du `clonePlain` local de `multiplayerUi.js` en ne vérifiant son usage que dans un seul appelant du même fichier — 4 autres appels indépendants (deck/specialCells/bonusCells, sérialisation multi) l'utilisaient encore, cassant le chargement de partie. Fix : ajouté à l'import depuis `missions.js`. cf. piège §26.

**📋 Popup de score central "+N" (`scorePopup.js`, 2026-07-10)** : module autonome, valeur affichée brièvement au centre écran après une pose LOCALE (seul point d'appel `scene.js::placeTile()`). `css/scorePopup.css` lié séparément via `<link>`, **pas** importé par `style.css` — ne pas oublier ce lien si `style.css` est réorganisé. Web Animations API (un seul `Animation` actif, annulé/relancé si nouveau score pendant l'anim). État final : `font-size` 208px (mobile 132px), `ANIM_DURATION_MS=1650`, `prefers-reduced-motion` : fondu 650ms. Leçon : l'utilisateur a redemandé "plus grand/plus long" deux fois d'affilée le même jour — si un 3ᵉ tour survient, augmenter directement par palier plutôt que redemander une valeur précise.

**📋 EDA — fusion VFX MÉTÉO dans la rubrique 8 Météo (2026-07-10)** : résout une collision de numérotation ("2. VFX MÉTÉO" coexistait avec "2. Sillage bateau"). Contenu de l'ex-rubrique 2 déplacé physiquement dans la rubrique 8 (câblage JS inchangé, sélection par id). Numérotation finale à plat : 1 Écume · 2 Sillage bateau · 3 Nuages · 4 Vent · 5 Forme du monde · 6 Jour/Nuit · 7 Qualité/densité · 8 Météo.

**🐛 Bug highscore.js — panneau HUD invisible en permanence (2026-07-11)** : score/stats jamais écrits. Root cause : `css/highscore.css` contenait une règle orpheline `.highscore-panel { display: none; }` sans aucun toggle — le panneau entier était invisible en permanence. Fix : règle supprimée.

**📋 Refonte modal fin de partie + verrou anti-rejeu (2026-07-11)** : trois demandes consécutives sur ce même flux.
- **Modal centré, plus gros, sans liste** — prompt pseudo/OK sorti de `#scorePanel` vers `#highscoreModal` (overlay plein écran). La LISTE des highscores a été supprimée du jeu (ne vit plus que dans la prez, déjà lue côté PHP) ; `highscore.js` ne fait plus que le `POST` de soumission.
- **Pseudo retiré du modal** — toujours connu à l'avance (saisi dans les menus de démarrage avant partie).
- **"Enregistrer" clôt la partie** — redirection sans query `?multi=` vers l'écran de sélection après POST réussi, évite de laisser traîner le code d'une room terminée.
- **Confirmation d'abandon** — nouveau modal `#abandonConfirmModal`, `abandonGame()` exécuté seulement après confirmation.
- **Verrou anti-rejeu serveur** — une partie terminée ne doit plus jamais être rejouable. Root cause : `gameOver:true` n'était jamais poussé au serveur (le seul autre point de sync a lieu AVANT que `gameOver` passe à `true`). Fix : `endGame()` appelle `persistMultiplayerState()` explicitement. Nouvelle fonction PHP `room_is_finished()` : liste ET jonction directe (`?multi=CODE`) rejettent désormais ces rooms — double verrou.

**📋 Prez — carte "meilleurs bâtisseurs" (2026-07-11)** : piège de communication (pas de code) — "les autres stats" voulait dire UN SEUL bloc visuel regroupant locomotives/bateaux/moulins/comètes ET détail biomes, pas deux `<div>` distincts ; a demandé une dizaine d'allers-retours avant clarification. Toute future retouche doit d'abord relire la structure complète avant de modifier un sous-élément.

**📋 Stat "moulins" ajoutée au classement (2026-07-11)** : `millCount` propagé `highscore.js`→`highscore.php`→`index.php`. Absente des scores enregistrés avant ce fix (comportement attendu, pas un bug).

**📋 Audits fichiers volumineux/mal nommés/mal placés — 4 rounds (2026-07-11)** : série de 4 audits validés par l'utilisateur, mêmes critères (découpage sans risque, renommage, déplacement, code mort), chacun confirmé avant le suivant.
- **Round 1** : CSS extrait de `debugLightUi.js` (~1150 lignes injectées via template literal, devenues **`css/eda.css`** statique — élimine au passage le risque de piège backticks du 07-08). Renommage `debugLightUi.js`→`edaPanelHost.js`, `hud_eda.js`→`edaPanelWiring.js` (les anciens noms ne disaient rien de leur rôle réel réel). `waterBoatOverlay.js`/`morningMistOverlay.js` déplacés dans `shaders/` (GLSL embarqué, comme les autres modules shader). Non retenu (risque jugé trop élevé) : découpage de `scene.js`/`edaPanelWiring.js` (closures géantes), fusion des lissages de polyligne rail dupliqués, renommage de `config.js`.
- **Round 2** : `railTrainOverlay.js` scindé en 5 fichiers (constants/graph/stations/vehicle/glb) ; `help.js` scindé (textes vs affichage) ; `multiplayerUi.js` renommé `startupMenu.js` et scindé (carrousel/rooms/état partagé) ; `soundDesign.js` scindé (musique/ambiances) ; CSS extrait de `preloader.js`. Code mort supprimé : `addNaturalPropCluster`, `getTerrainTopY` (confirmés orphelins par grep repo-wide).
- **Round 3** : `waterZoneOverlay.js`→`waterZoneLabels.js`, `tileTextures.js`→`tileTextureDrawing.js`, `missions.js`→`missionLabels.js`, `decorOverlay.js`→`decorPropModels.js`+`decorBirdModels.js`. `TERRAIN_RELIEF` locale orpheline supprimée dans `tileMesh.js` (ne pas confondre avec la constante EXPORTÉE homonyme de `variables.js`, toujours vivante).
  - **🪤 Piège vécu — `Identifier 'propGlbLibrary' has already been declared`** : régression cassant le rendu de la grille. Root cause : le découpage de `decorOverlay.js` a été fait via un trim `sed -n '1,808p'` en bash, mais l'ancien bloc "état singleton partagé" se trouvait DANS la plage conservée et n'a pas été retiré séparément — conflit avec le nouvel import du même identifiant. **Leçon : un trim de fichier par plage de lignes (sed/bash) ne remplace pas une relecture ciblée des blocs déplacés — toujours grep chaque identifiant déplacé APRÈS le trim, ne pas se fier uniquement à `node --check` sur un état intermédiaire.**
- **Round 4** : nettoyage fichiers JS < 1Ko, consigne stricte de proposer avant d'agir suite au piège ci-dessus. 2 candidats retenus sur 7 : `cinematicPass.js` supprimé (ré-export de compatibilité, un seul importateur redirigé) ; `tileRoadOverlay.js` supprimé (stub no-op confirmé). 5 écartés volontairement (`config.js`, `main.js`, `gameRules.js`, `domUtils.js`, `glbLoader.js` — trop risqués ou légitimement petits).
- Vérifié à chaque round : `node --check` + grep croisé imports, aucune référence orpheline.

**📋 Passage bilingue FR/EN — prez + jeu (2026-07-12, architecture depuis remplacée)** : première extension du bilingue à tout le jeu, via dual-render `data-fr`/`data-en` + CSS `[data-lang]`. **Intégralement remplacée le 2026-07-14** par le système scalable `data-i18n`/`LANG_FILES` (cf. ci-dessous) — ne reste d'actualité que les clés JSON créées et la correction du badge prez "Solo & Multi" → "Multijoueur" seul (plus de vrai mode solo, cf. entrée 2026-07-06).

**🪤 Piège — corruption de fichiers via bash lecture-réécriture sur mount réseau (2026-07-12/13, résolu)** : lors d'une première tentative d'ajout de l'espagnol, des scripts bash (lecture-puis-réécriture sur `X:\...`) ont réellement tronqué 3 fichiers sur disque — pas un problème d'affichage. L'utilisateur a restauré un backup complet plutôt que poursuivre le diagnostic. **Leçon retenue (cf. mémoire `feedback-verif-mount-cowork`) : ne plus jamais faire de lecture-puis-réécriture bash sur ce mount, utiliser exclusivement Read/Edit/Write.** L'espagnol a été réintroduit avec succès le 2026-07-14 (cf. entrée trilingue ci-dessous).

**📋 Réorganisation fichiers JS → `javascript/` (2026-07-13, post-restauration backup)** : tous les modules `.js` du jeu déplacés de la racine de `_sources` vers un sous-dossier `javascript/` (99 fichiers). Les `.php`/`css/`/`json/`/`images/`/`fonts/`/`vendor/` restent à la racine. Cf. §20.

**📋 Refonte page d'aide en jeu — touche H (2026-07-13)** : plusieurs demandes successives sur `game.php`/`css/help.css`.
- **Carte "Contrôles" — hauteur** : deux premières tentatives de fix (CSS Grid épinglé via `nth-of-type`, puis `grid-template-areas`) ont chacune provoqué un chevauchement visuel avec la rangée suivante — root cause jamais formellement isolée (piste retenue : rangées Grid "auto" imbriquées dans un conteneur flex rétréci `overflow-y:auto`). **Fix robuste retenu : refonte complète en flexbox imbriqué**, plus aucun CSS Grid multi-lignes pour la disposition des cartes — un empilement flexbox ne peut structurellement pas produire de chevauchement.
- **Carte "Placement" fusionnée dans "Objectif du jeu" → "Règles de base"**, contenu retravaillé en 4 puces courtes.
- **Largeur du panneau d'aide** +22% ; **espacement liste à puces** : `margin-top` sans effet, piège de spécificité CSS classique (`.help-card ul` battait `.placement-list` seule).

**📋 Sélecteur de langue in-game + textes JS rendus réactifs (2026-07-13, 2 passes)** : jusque-là le choix de langue ne se faisait qu'au chargement de la page — demande de pouvoir changer de langue **en cours de partie**.
- **Passe 1 (rejetée deux fois)** — `location.reload()` au clic : rejetée (renvoyait au menu en pleine partie). Deux boutons `#gameLangFr`/`#gameLangEn` sans reload : rejetée aussi — (1) pas scalable ("quand il y aura 18 langues, tu créras 18 boutons ?") ; (2) ne traduisait que le dual-render `data-fr`/`data-en`, pas les textes sourcés en JS.
- **Passe 2 (retenue)** — nouveau module **`gameLangReactive.js`**, point d'entrée unique `setGameLang(lang)` : écrit `dataset.lang`/`localStorage` PUIS notifie tous les modules bilingues abonnés via `registerLangRefresh(cb)`. Sélecteur unique `<select id="gameLangSelect">` (`edaPanelHost.js`) — ajouter une langue ne demande qu'une `<option>`.
- **Réactivité des 9 modules bilingues concernés** : les objets de texte restent `const` et sont **mutés en place** (`Object.assign`), jamais réassignés — nécessaire car plusieurs sites d'appel capturent la référence une seule fois. `helpTooltip.js` accepte aussi une fonction `() => texte` résolue à l'affichage plutôt qu'à l'attache.
- **2 bugs signalés après coup** : HUD missions en cours partiellement figé (rien ne déclenchait de re-rendu immédiat au changement de langue seul — fix via `registerLangRefresh`) ; "Aucune mission" figé en français (chaîne codée en dur malgré une clé JSON existante — exportée en `HUD_TEXT`).

**📋 Refonte i18n scalable + jeu trilingue FR/EN/ES + rattrapage EDA (2026-07-14)** : suite du rollback ES du 2026-07-12/13 — nouvelle tentative précédée d'une refonte architecturale demandée explicitement pour éviter de re-router un système binaire à chaque langue ajoutée.
- **`gameLangReactive.js` généralisé** — passe d'un ternaire binaire à une validation contre une map `LANG_FILES = { fr, en, es, ... }` + export `getLangFile(lang)`. Les 11 modules JS qui dupliquaient chacun leur propre calcul binaire migrés vers ce point d'entrée unique.
- **`index.php`/`game.php` réécrits** — abandon du dual-render `data-fr`/`data-en` (bloqué à 2 langues) au profit d'un attribut unique `data-i18n="chemin.pointé"` résolu par un moteur générique (`gameHudI18n.js` côté jeu, moteur inline côté prez statique). Sélecteur devient un vrai `<select>` scalable.
- **Panneau EDA traduit pour la première fois** — signalé après coup : ce panneau n'avait **jamais** été branché à un système de traduction (gap préexistant). Nouveau schéma JSON `game.eda`, `data-i18n`/`data-i18n-title` sur tous les en-têtes/toggles/sliders/boutons.
- **Rattrapage** — noms des ambiances (presets, clé stable par preset) et onglet CINÉMATIQUE (resté hors du premier passage, sliders statiques du HTML) branchés séparément après signalement.
- Vérifié à chaque étape : parité clé-à-clé confirmée via relecture Read tool (le cache bash montrait du contenu périmé — piège récurrent, cf. mémoire `feedback-verif-mount-cowork`).

**📋 Ajout de l'italien (IT) — 4e langue (2026-07-14)** : bénéfice direct de la refonte i18n scalable — contrairement au rollback ES du 07-12/13, cet ajout s'est fait sans accroc.
- `json/languages/italian.json` créé (traduction intégrale de `french.json`, 921 clés, parité vérifiée programmatiquement). Créé d'abord sans branchement, connecté ensuite sur confirmation.
- **Intégration = 3 lignes, exactement comme prévu par l'architecture** : `LANG_FILES` (`gameLangReactive.js`), `$LANG_FILES` (`index.php`), `<option value="it">IT</option>` (`edaPanelHost.js`). Aucun autre fichier à toucher (le reste reconnaît automatiquement toute langue présente dans `LANG_FILES`) — ce pattern à 3 lignes s'est répété identique pour le portugais (07-15) et le fr-CA (07-15, cf. entrées ci-dessous).
- **⚠️ Anomalie de montage repérée, corrigée par l'utilisateur** : `json/languages/` contenait une copie complète de la racine du projet (probable artefact du point de montage bash, cf. mémoire `feedback-verif-mount-cowork`) — signalé sans être touché, nettoyé par l'utilisateur lui-même le jour même.

**📋 Brins de blé — dimensions réduites de 12% (2026-07-14)** : `variables.js` — `WHEAT_GLOBAL_HEIGHT` `0.04288→0.0377344`, `WHEAT_BLADE_WIDTH` `0.001496→0.00131648`. Vent/plage aléatoire par brin non touchés — la réduction s'applique uniformément à travers ces facteurs existants.

**📋 Audit qualité des 4 langues + corrections de traduction (2026-07-14)** : audit ciblé sur l'EXACTITUDE SÉMANTIQUE des traductions (pas seulement la parité de clés déjà vérifiée à chaque étape). 12 incohérences réelles trouvées et corrigées dans `json/languages/{english,spanish,italian}.json` :
- **EN** — "prairie" traduite 3 façons différentes → harmonisé sur "Meadow(s)". `nav.links.gallery` "Moods" décorrélé du reste → "Presets".
- **ES** — "God Rays" traduit 3 façons différentes → harmonisé. Accord de genre fautif sur `scores.empty`. Tooltip du slider `vibrance` désaligné de son propre libellé.
- **IT** — `bouliste/platiste` = "Globo"/"Piano" (mot ambigu) → "Piatto". **Vrai contresens** : `village_women`/`village_men` traduits identiques au tag `farmer` (confondait habitant et métier) → renommés "Paesane"/"Paesani". Collision `game.eda.ambiances` "AMBIENTI" avec l'onglet "Ambiente" → "ATMOSFERE".
- Aucun contresens trouvé dans la grosse section technique des ~150 tooltips shaders — point de risque principal identifié avant l'audit, révélé propre.

**📋 Capture d'écran serveur — bouton 📷 (2026-07-15)** : bouton dans le bandeau FPS/EDA/langue qui capture le rendu 3D (sans HUD) et l'enregistre côté serveur en JPEG dans `/snapshots`.
- **Constat clé qui a simplifié l'implémentation** : le `<canvas id="app">` (Three.js) ne contient QUE le rendu 3D — le HUD est un overlay DOM séparé jamais dessiné dans le canvas. `canvas.toBlob()` est donc nativement "propre". Seule exception : `hoverZoneOverlay` (contour de survol) est un vrai objet Three.js, masqué le temps de la capture.
- **`snapshotCapture.js`** (nouveau) — `captureSnapshot(canvas, quality)` : `canvas.toBlob('image/jpeg')` → POST du blob brut vers `snapshot.php`.
- **`snapshot.php`** (nouveau) — valide le magic number JPEG, plafonne à 15Mo, crée `/snapshots` à la volée, écriture atomique tmp+rename, nom de fichier **généré côté serveur uniquement** (jamais fourni par le client).
- **Rattrapage** — les 4 tooltips du bandeau (FPS/EDA/📷/langue) étaient en dur en français. Une première passe incorrecte utilisait l'attribut `title` natif ; l'utilisateur a signalé que le jeu utilise partout ailleurs le tooltip custom stylisé `lutHelpTooltip` (`attachHelpTooltip`/`LUT_HELP`) — jamais `title`. Corrigé en conséquence.

**📋 Galerie de captures — snapshots.php (2026-07-15)** : page dédiée affichant en mosaïque les captures de `/snapshots`, ouverte en overlay par-dessus le jeu sans quitter la partie.
- **Métadonnées de partie** — `snapshot.php` accepte `?tiles=N&mode=bouliste|platiste`, écrit un sidecar `.json` à côté du `.jpg` (même pattern atomique).
- **`snapshots.php`** — scanne `/snapshots` côté serveur, embarque la liste en JSON ; rendu (mosaïque, légendes, visionneuse) 100% côté client via `snapshotsPage.js`.
- **Mosaïque** (`css/snapshots.css`) — colonnes CSS façon Pinterest, légende révélée au survol, chargement progressif par lots via `IntersectionObserver`.
- **Visionneuse plein écran** — navigation ‹/›, Échap ferme. **Itération sur la fermeture** : une croix dédiée se superposait visuellement à celle du panneau parent (signalé disgracieux), une correction intermédiaire l'a juste déplacée (toujours jugée disgracieuse) — solution finale : **aucune croix**, cliquer n'importe où dans la visionneuse ferme (boutons ‹/› en `stopPropagation()`).
- **Overlay in-game** — bouton 🖼️ (`#galleryBtn`), `snapshotGallery.js` (nouveau) : overlay DOM + `<iframe src="./snapshots.php">` (cache-bust à l'ouverture, `about:blank` à la fermeture). Le canvas WebGL continue de tourner derrière.
- **i18n** — `game.gallery.*` dans les 4 langues ; `snapshotsPage.js` réutilise `gameLangReactive.js` en lecture seule pour hériter de la langue du jeu.

**📋 Ajout du portugais (PT) — 5e langue (2026-07-15)** : sur feu vert explicite, même bénéfice direct de la refonte i18n scalable que pour l'italien — aucun accroc. `json/languages/portuguese.json` créé (traduction intégrale, 893 clés, parité vérifiée par Grep — le mount bash affichait une version périmée de `french.json` pendant la vérification, cf. mémoire `feedback-verif-mount-cowork`). Intégration = mêmes 3 lignes que l'italien. Choix de traduction notables : "tuile"→"peça" ; bouliste/platiste→"Globo"/"Plano" (registre nom-descriptif, pas les adjectifs de faction) ; `village_women`/`village_men`→"Aldeãs"/"Aldeões" (distinct de `farmer`, même vigilance que l'audit IT du 07-14).

**📋 Galerie — dates PT non localisées + double ESC (2026-07-15)** : deux retouches après l'ajout du PT.
- **Bug dates PT** — `snapshotsPage.js` avait un `LOCALES` codé en dur décorrélé de `LANG_FILES`, jamais mis à jour à l'ajout du portugais (dates retombaient sur `fr-FR`). Fix ciblé, `LOCALES` reste décorrélé de `LANG_FILES` par design minimal — à garder en tête si une langue future est ajoutée.
- **Second Échap ferme la galerie entière** — un `keydown` dans l'`<iframe>` de `snapshots.php` ne remonte jamais au document parent (deux `Document` distincts, pas de bubbling cross-frame). Fix via `postMessage`/`message` entre `snapshotsPage.js` et `snapshotGallery.js`.

**📋 HUD aide — cartes de score épurées + typo Bebas Neue agrandie (2026-07-15)** : les 6 pastilles `.score-strip` simplifiées ("+2 points"→"+2"). Typo passée de `monospace` 24px à `BebasNeue`, grossie deux fois sur demande explicite jusqu'à 44px (33px en écran étroit).

**📋 Barres de progression missions — refonte glossy façon CSSFlow (2026-07-15)** : remplacement du rendu à graduations discrètes (`MAX_TICKS=24` segments) par un unique `<div class="mission-bar-fill">` en `width:${ratio*100}%`, sur un modèle CSS fourni par l'utilisateur (CodePen dérivé du travail de Thibaut Courouble/CSSFlow, licence MIT). Palette reprise à l'identique du CodePen (rouge→vert par tiers de progression), sur demande explicite de ne pas garder l'ancienne palette bleu/cyan/vert/or.

**📋 Popup central "Capture faite !" au clic sur 📷 (2026-07-15)** : réutilisation du popup de score plutôt qu'un nouveau composant — `scorePopup.js` généralisé avec un export `showCenterMessage(text)` (logique d'affichage/anim factorisée hors de `showScorePopup(score)`). Piège CSS résolu au passage : `#scorePopup` (pensé pour un court "+N") laissait un texte plus long retour-à-la-ligne et décentré (`left` sans `right` calcule une largeur shrink-to-fit basée sur l'espace disponible, pas le contenu) — fix via `width:max-content`+`white-space:nowrap`.

**📋 Logo `images/logo2.png` réduit de 30% (2026-07-15)** : `.mode-logo` (menus pré-partie) et `#preloader-logo` (écran de chargement), seuls emplacements (grep repo-wide).

**📋 Raccourcis clavier C (capture) et G (galerie) (2026-07-15)** : relais direct `.click()` vers le bouton HUD existant plutôt qu'une duplication de logique — garantit que tout garde-fou déjà présent sur le bouton s'applique aussi au raccourci.

**📋 Libellés `<kbd>` non traduits — 3 vagues de correctifs (2026-07-15)** : plusieurs libellés de touches restaient en dur en français dans l'aide en jeu et/ou la prez, repérés au fil de comparaisons entre les deux pages — même schéma de fix à chaque fois (`data-i18n` sur le `<kbd>` + clé dans les 5 langues). Vague 3 : audit complet des raccourcis actifs de `scene.js`, 4 manquants trouvés et ajoutés (zoom, SHIFT, SHIFT+ESPACE, ESC).
- **Refonte visuelle du bandeau `.kbd-strip`** — passé de 12 à 16 raccourcis, illisible en ligne flex dense → grille de cartes (`grid-template-columns:repeat(auto-fit,minmax(230px,1fr))`).
- **🐛 Bug largeur + troncature de texte** — `.kbd-strip` avait un `max-width` plus étroit que `.score-pills` (fix : retiré). Texte tronqué en dur sur le premier encart : piège flexbox classique, un enfant flex a `min-width:auto` par défaut et ne peut pas rétrécir sous la largeur de son contenu — fix `min-width:0`+`flex:1 1 auto` sur le span de description, `<kbd>` d'un même raccourci regroupés dans un `.kbd-group` dédié.

**📋 Prez — titres de section pour les rubriques Galerie et Contrôles (2026-07-15)** : deux ajouts de titres `<h2 class="section-title">`, texte promotionnel galerie sorti de `multi.features` vers un titre+paragraphe dédiés ; séparation visuelle transférée de `.kbd-strip` vers son nouveau titre.

**📋 Ajout du français québécois (`fr-CA`) — 6e langue, easter egg humoristique (2026-07-15)** : sur demande explicite et très détaillée de l'utilisateur (glossaire, dosage des jurons, sections à adapter vs sections à garder standard), copie intégrale de la structure de `french.json` (769 clés, parité vérifiée par comptage grep) réadaptée en québécois pour ~130 chaînes visibles/significatives.
- **Fichier `json/languages/fr-CA.json`** — env. 75-80% français standard/légèrement québécois, ~15-20% vocabulaire authentique (game/partie, pis/et, sacrer son camp/quitter, câline, ostentation dosée), ~5% touches absurdes/sacres, sans caricature (pas de phonétique systématique type "moé/icitte", pas de sketch sur chaque phrase). Sacres dosés selon la consigne : "câline" utilisée 2 fois (confirmation d'abandon, écran de choix de forme du monde), "en maudit" 1 fois (adjectif FPS "splendide"), "tabarnak" 1 seule fois (confirmation d'enregistrement de score) — "ostie"/"crisse" volontairement absents. Zéro sacre dans `game.help.*` (tooltips techniques longues) ni dans les libellés EDA (LUT/Bloom/Tilt-shift/etc., laissés intégralement en français standard comme les autres langues).
- **Sections adaptées** : nav, hero, factions, biomes (tags + 2 descriptions), missions (sous-titre), gameplay (étapes, pills de score, titre/libellés clavier), créatures, audio, environnement jour/nuit (sous-titre), multijoueur, palmarès, footer, `game.gallery.*`, une partie de `game.eda.footer`/`weatherGroups`/`modeActuel`/`preregalages`, HUD en jeu (`game.ui.hud.*`, `game.ui.help.controls.*`), highscore, `game.multiplayerRooms.*`, `game.startupMenu.worldShape.note`, preloader, `game.fpsAdjectives`. Sections gardées volontairement standard : `game.help.*` (tooltips techniques), `game.missionHelp.*`/`missionTitles.*` (risque de casser la pluralisation `{one,other}`), labels EDA techniques, textes de règles précises (placement, eau/rail, cases bonus/noires).
- **Intégration** — 3 points de branchement identiques aux ajouts précédents (IT/PT) : `LANG_FILES` (`gameLangReactive.js`, clé `'fr-CA': 'fr-CA'`), `$LANG_FILES` (`index.php`, même clé/fichier), `<option value="fr-CA">QC</option>` dans le sélecteur in-game (`edaPanelHost.js`). Différence par rapport aux langues précédentes : la clé utilisée est `fr-CA` (pas un code 2 lettres) — vérifié au préalable qu'aucun code du projet ne suppose une clé à 2 caractères (ni `LANG_FILES`, ni `$LANG_FILES`/`strtoupper($code)` de la prez, ni `dataset.lang`) ; seule adaptation nécessaire : ajout d'une entrée `'fr-CA': 'fr-CA'` dans `LOCALES` (`snapshotsPage.js`) pour le formatage de dates de la galerie (repli silencieux sur `fr-FR` sinon, non bloquant mais moins précis).
- Vérifié : JSON valide (`python3 -c "json.load(...)"`), parité clés 769/769 vs `french.json` (comptage grep `^\s*"key":`), `node --check` sur les 3 fichiers JS modifiés.

**📋 Miniatures pour la galerie de captures — saga complète, résolue en prod (2026-07-15)** : signalé par l'utilisateur — les captures de `/snapshots` (déjà ≈1Mo/pièce) étaient chargées en pleine résolution comme miniatures dans la grille mosaïque. Non tenable à l'échelle.
- **`snapshotThumb.php` (nouveau)** — fonction partagée `hexistenz_generate_thumbnail()`, tentée dans l'ordre GD → Imagick → binaire externe via `exec()` (`convert`/`magick`/`gm convert`/`ffmpeg`, souvent présents au niveau système même quand les extensions PHP ne le sont pas). Repli final : image pleine résolution servie telle quelle (galerie fonctionnelle, juste plus lourde). Écriture atomique tmp+rename comme les autres endpoints.
- **Root cause du 1er échec en environnement de test local** : GD était chargé mais compilé sans support JPEG (libjpeg) — `function_exists('imagecreatefromjpeg')` renvoyait déjà `false`, repli silencieux non détecté avant l'ajout d'un journal dédié `/snapshots/thumb_debug.log` (`hexistenz_thumb_log()`, best-effort). Le journal a ensuite confirmé qu'aucune des 3 voies (GD/Imagick/binaire) n'était disponible dans ce sandbox local — **limitation d'environnement, pas un bug de code**, confirmé fonctionnel en production dès le déploiement (les 3 voies restent des replis légitimes selon l'hébergement).
- **`snapshot.php`/`snapshots.php`** — génèrent la miniature à la volée à l'écriture (et en backfill pour les captures antérieures au système, au premier scan du dossier) ; `snapshotsPage.js` charge `item.thumbUrl ?? item.url` dans la grille, l'image pleine résolution restant chargée uniquement dans la visionneuse plein écran.
- **Simplification finale demandée** — suppression du sous-dossier `/snapshots/thumbs/`, miniatures écrites directement dans `/snapshots` avec le suffixe `_thumb` avant l'extension ; le scan `glob('*.jpg')` filtre désormais explicitement ce suffixe pour ne pas remonter les miniatures comme de fausses captures.
- 🪤 **Piège rencontré pendant la vérification** — un `wc -l`/`python` via bash sur `snapshotThumb.php` juste après sa réécriture a montré un fichier tronqué, faisant croire à un déséquilibre d'accolades. Cf. mémoire `feedback-verif-mount-cowork` : seul le Read tool fait foi sur un fichier tout juste modifié.

**📋 Moutons — densité +20% et probabilité "marcheur" +25% (2026-07-15)** : `javascript/sheepOverlay.js`, demande explicite de rendre les prairies plus vivantes.
- **Densité** — `TILES_PER_SHEEP` (1 mouton par N tuiles prairie connexes) réduit de `0.292` à `0.243333` (plus la constante est petite, plus il y a de moutons par zone) — +20% relatif.
- **Distribution des types** — seuil du tirage `marcheur` (`_populateZone`) passé de `r < 0.30` à `r < 0.375` (+25% relatif, 30%→37.5%), prélevé entièrement sur le pool `brouteur` (50%→42.5%) ; le pool `immobile` reste inchangé à 20%.

**📋 README — mention explicite des 6 langues (2026-07-15)** : `README.md`, section bilingue FR/EN, remplacé "entièrement quintilingue" par "entièrement traduit en 6 langues" avec mention explicite du canadien/québécois (drapeau 🇨🇦) aux côtés des 5 autres.

**📋 Version — bump `v0.9.2.6.5` → `v0.9.2.6.10` (2026-07-15)** : `javascript/variables.js` (`HEXISTENZ_VERSION`), demande explicite de l'utilisateur. Aucun changement de code associé à ce bump en particulier — reflète l'ensemble des travaux du jour (fr-CA, moutons, miniatures galerie).

**📋 Popup `scorePopup` sur changement de langue in-game (2026-07-15)** : demande explicite — réutiliser le mécanisme central `scorePopup.js` (même popup que les "+N" de score et "Capture faite !") pour confirmer visuellement le changement de langue, en affichant le nom de la langue nouvellement sélectionnée **dans cette langue**.
- **Nouvelle clé `game.langName`** ajoutée dans les 6 fichiers `json/languages/*.json` (juste après `superImmersifExitHint`, avant `fpsAdjectives`) : `"Français"`, `"English"`, `"Español"`, `"Italiano"`, `"Português"`, `"Québécois"` (fr-CA).
- **`gameLangReactive.js`** — `setGameLang()` importe désormais `showCenterMessage` de `scorePopup.js` et l'appelle en toute fin de fonction, après notification de tous les callbacks réactifs (`data?.game?.langName ?? lang` en repli), donc le popup s'affiche une fois la traduction déjà effective à l'écran.
- Aucun souci de dépendance circulaire : `scorePopup.js` n'importe rien d'autre, et son no-op silencieux (`if (!el) return`) si `#scorePopup` est absent du DOM rend l'import sûr même depuis des pages sans jeu (ex. `snapshotsPage.js`, qui importe aussi `gameLangReactive.js` pour la locale des dates).
- Vérifié : parité de la clé `langName` dans les 6 fichiers (relecture Read tool ligne par ligne — le check bash `node --check`/`python json.load` a de nouveau montré du contenu tronqué sur plusieurs fichiers juste après édition, cf. mémoire `feedback-verif-mount-cowork`, non représentatif de l'état réel).

**📋 fr-CA — 4 salves d'accentuation successives + glossaire final (2026-07-15)** : suite directe de l'ajout initial de `fr-CA`, quatre demandes consécutives pour pousser l'authenticité québécoise, en respectant à chaque fois la consigne de dosage de l'utilisateur ("pas de rabâchage", puis explicitement "seulement 10-15% des chaînes québécisées" pour rester crédible plutôt que caricatural).
- **Round 1-3** — élargissement du vocabulaire à des sections jusque-là standard, puis jurons ciblés dans les chaînes de notification/erreur/confirmation uniquement (jamais dans `game.help.*` ni les libellés EDA techniques).
- **Round 4 — glossaire détaillé fourni par l'utilisateur** : appliqué sélectivement (~17 clés), PAS wholesale (ex. "ON REPART ÇA !", "C'EST BEAU", "Pas pire pantoute !"). Délibérément exclu : renommages de noms de biomes/catégories structurelles (risque de confusion trop élevé pour un gain cosmétique) et la mécanique de "messages humoristiques rares" du glossaire, inexistante dans le code (signalée plutôt que construite d'initiative).
- Vérifié : parité de clés 770/770 après chaque salve (le bash mount a de nouveau affiché du JSON tronqué juste après édition — re-vérifié via Read tool, cf. mémoire `feedback-verif-mount-cowork`).

**📋 `DEBUG_FLAGS` — gating des diagnostics de production, phases 0-5 (2026-07-16)** : constat initial — beaucoup de code de diagnostic (scans périodiques de scène, watchers de programmes shader, mesures de freeze/mémoire) tournait en permanence en production, même sans personne pour lire la console. Le coût réel n'est pas le `console.log` mais le CALCUL fait pour le nourrir (`scene.traverse()` complets, etc.). Objectif : garder toute l'instrumentation, la rendre silencieuse par défaut, sans jamais désactiver un effet de bord fonctionnel mêlé au même bloc.
- **`variables.js`** — nouvelle constante `DEBUG_FLAGS` (5 catégories : `performance`/`shaders`/`assets`/`multiplayer`/`overlays`), toutes à `false` par défaut.
- **Phases 1-4** — gaté par catégorie : diagnostics perf de `scene.js` (RAF-STALL, FLASH-DIAG, GEO-DELTA, GPU-SPIKE-WATCH…), diagnostics shaders (`checkBiomeMaterialFlicker`, `findTransparentBiomeUsers`, warnings de timing), logs de rebuild forêt/rail, logs de rotation prop/dump GLB. Règle constante à chaque phase : tout effet de bord fonctionnel (`renderer.compile()`, `warmUpAllPrograms()`, `tickFps()`, bounding-box anormale qui désactive un prop) et tout `console.warn`/`error` de type échec réel restent **toujours actifs**, jamais gatés — seule la mesure/instrumentation pure est silencieuse par défaut.
- **Phase 5 (multijoueur) — auditée, rien à gater** : les 5 fonctions de sync couplées à l'état de jeu partagé n'ont que 3 `console.warn` d'échec réseau réel dans des blocs `catch` — exactement le type d'erreur exclu du principe de `DEBUG_FLAGS`. Catégorie déclarée mais aucun site branché dessus.
- Méthode : chaque phase validée avant la suivante, `node --check` après chaque fichier, vérification systématique par grep que les effets de bord fonctionnels restent inconditionnels.
- **Suite (2026-07-16)** — l'utilisateur a fourni un dump console F12 réel, révélant plusieurs sites de log oubliés (fichiers non touchés lors de l'audit initial). Gatés à leur tour : `[TRAVERSE-DIAG]` (`scene.js`), `[DECOR-ANIM] registry` (`decorOverlay.js`), logs de chargement GLB astre/tours/train. Laissés volontairement actifs : marqueur anti-cache `[SCENE-JS-BUILD]` (cf. [[project-hexistenz-deploy-flow]]), erreur bounding box anormale (signal réel). `scene.js` logue désormais `HEXISTENZ_VERSION` en tout premier, non gaté, pour identifier le build chargé sans dérouler la console.

**📋 Fix "l'astre suit la caméra" — bug tracé depuis le tout premier jour du projet (2026-07-16)** : l'astre (soleil/lune) suit sa trajectoire circulaire correctement, mais toute translation caméra (clavier et souris) décalait l'intégralité de la trajectoire dans la même direction.
- **Cause racine** — `controls.target` (point de visée, bouge à chaque pan) servait de centre d'orbite à la fois pour `sun`/`sunTarget` (lumière invisible projetant les ombres) **et** pour `sunVisual` (le mesh visible). Les deux n'ont pourtant pas le même besoin : `sun`/`sunTarget` DOIT suivre la caméra pour garder un frustum d'ombre étroit (perf shadow-map −40% DC), alors que `sunVisual` ne devrait suivre que le temps.
- **Fix** — `updateSunShadowOrbit()` calcule désormais DEUX focus distincts : `focus` (= `controls.target`, inchangé, pour la lumière/ombres) et `visualFocus` (centre fixe de la grille) pour `sunVisual` uniquement. La direction d'éclairage reste un vecteur d'offset invariant par translation du focus — aucun changement pour l'éclairage/ombres.
- Vérifié avant modif (sur demande explicite) : audit de tous les consommateurs de la position de l'astre (labels de zone, sliders EDA d'orbite) — aucune dépendance à comment le focus est calculé, pas de régression. Risque accepté : l'astre s'éloigne désormais davantage de la caméra selon la position sur la grille, passera moins souvent derrière un arbre/tour proche (occlusion) — effet secondaire du fix, pas une régression. Testé en jeu (clavier + souris) — validé.

**📋 Feature "Replay" — relecture accélérée de la partie en cours (2026-07-16)** : nouveau fichier `replayEngine.js`, demandé explicitement ("Option A sinon rien" — reconstruction complète du monde depuis le vide, pas une simple tournée guidée). Contrainte technique clé : le terrain est fusionné (~14 draw calls) dès la pose, impossible de cacher/révéler UNE tuile fusionnée individuellement — solution retenue : rejouer les fonctions `rebuildX(group, subset)` déjà existantes sur un sous-ensemble croissant de `placementHistory`, dans des groupes 3D **parallèles** aux groupes réels (jamais modifiés, juste masqués → sûr par construction).
- **Ouverture** — bouton 🎬 (`#replayBtn`) ou touche **V**. **HUD replay** flottant en haut d'écran (caméra reste manipulable), boutons restart/enregistrement vidéo/play-pause/vitesse ×1-×8/fermer.
- **Enregistrement vidéo** — capture le canvas via `captureStream(30)`+`MediaRecorder` (WebM natif navigateur, pas de dépendance serveur), téléchargement auto du blob à l'arrêt.
- **Rythme** — `BASE_INTERVAL_MS=700` (doublé depuis 350ms après retour "trop rapide", surtout sensible à ×4/×8).
- **Limitations documentées** : pas de rejeu des cellules bonus, overlays statiques pendant le replay, pas de scrubbing arrière.
- **Bugs corrigés en cours de chantier** : fumée volumétrique lisant les groupes réels au lieu des groupes replay (maisons/trains fantômes avant révélation) ; ESC fermait le replay ET ouvrait l'aide (double listener — même fix capture+`stopImmediatePropagation()` que la galerie) ; tooltips du HUD replay s'affichant sous le panneau (z-index insuffisant).
- **🚫 Galerie de replays — tentée puis abandonnée (2026-07-16)** : chantier exploratoire pour lister/rejouer N'IMPORTE QUELLE partie (nouvel endpoint serveur, page dédiée, overlay, généralisation de `replayEngine.js`). L'utilisateur a explicitement demandé l'abandon au profit du bouton d'enregistrement direct — tout le code **intégralement reverté** (aucune trace résiduelle, vérifié par grep repo-wide).
  - Recherche annexe ayant mené à un nettoyage utile : `startupMenu.js::renderHome()`/`renderNameChoice()` (écran solo/multi) étaient du **code mort inatteignable** depuis le retrait du menu solo/multi du 07-11 — supprimé avec ses imports devenus inutiles.
- Documentation (raccourci V) ajoutée à l'aide, la prez et le README, parité vérifiée dans les 6 langues.

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

---

## 31. Captures & Replay — vue d'ensemble (référence rapide)

Trois fonctionnalités liées, chacune activable au clavier sans jamais quitter la partie. Détail chronologique complet des chantiers dans §21 (entrées 2026-07-15/16) — cette section est un résumé de référence, pas un historique.

**📷 Capture d'écran (touche `C` ou bouton `#snapshotBtn`)** — `snapshotCapture.js` fige le canvas via `canvas.toBlob('image/jpeg')` et envoie le JPEG + un sidecar JSON de métadonnées (date, nombre de tuiles, mode platiste/bouliste) à `snapshot.php`, qui les écrit dans `/snapshots` et génère une miniature (`snapshotThumb.php`, 3 voies de repli : GD → Imagick → binaire externe via `exec()`). Popup de confirmation "Capture faite !" via `scorePopup.js::showCenterMessage()`.

**🖼️ Galerie des captures (touche `G` ou bouton `#galleryBtn`, toggle depuis 2026-07-16)** — `snapshotGallery.js` ouvre `snapshots.php` dans un `<iframe>` overlay plein écran (le canvas WebGL continue de tourner derrière). `snapshots.php` scanne `/snapshots`, embarque la liste triée en JSON, `snapshotsPage.js` rend la mosaïque (colonnes CSS façon Pinterest, chargement progressif par lot) + une visionneuse plein écran avec navigation ‹/›. `isSnapshotGalleryOpen()` exposé pour que la touche `G` referme la galerie si elle est déjà ouverte plutôt que de la rouvrir sans effet.

**🎬 Replay de la partie (touche `V` ou bouton `#replayBtn`, toggle)** — `replayEngine.js` reconstruit le monde tuile par tuile dans des groupes 3D parallèles aux groupes réels (jamais modifiés, juste masqués le temps du replay). HUD flottant : restart 🔁, play/pause ⏸/▶, vitesse ×1/×2/×4/×8, fermer ✕. Détail architecture complet en §21.

**🔴 Enregistrement vidéo (bouton dans le HUD replay)** — capture le `<canvas id="app">` via `canvas.captureStream(30)` + `MediaRecorder` (format WebM natif navigateur, aucun serveur impliqué). Téléchargement automatique du fichier `.webm` à l'arrêt de l'enregistrement.

**Documentation synchronisée à chaque ajout de raccourci** : aide en jeu (`game.php`, touche H, clés `game.ui.help.controls.*`), bandeau de la prez (`index.php`, clés `gameplay.kbd.*`), tableau `README.md`, et section dédiée `README.md` "📸 Captures & Replay" — parité vérifiée dans les 6 fichiers de langue à chaque fois.

## 32. Thèmes graphiques (Bleu / Médiéval) — chantier clos, ~100% de l'UI convertie (prez + menus pre-game + tout le HUD in-game)

2 thèmes graphiques pour tout le HUD. **Bleu** (fonds légèrement transparents et bleutés, liseré bleu lumineux, coins arrondis). **Médiéval** (clé interne `ancien`, INCHANGÉE — seul le libellé affiché a été renommé en cours de route — parchemin, CSS `border-image` 9-slice reproduit STRICTEMENT depuis une démo validée par l'utilisateur, `parchemin.html` à la racine des sources, non chargé par le jeu).

**Plomberie** — `javascript/themeManager.js` (calqué sur `gameLangReactive.js`) : `THEMES=['bleu','ancien']`, `getTheme()`/`setTheme()`/`applyTheme()`, persistance `localStorage['hexistenz_theme']`, applique `document.documentElement.dataset.theme`. **Thème par défaut = `ancien` (Médiéval) depuis 2026-07-17** (auparavant `bleu`) : `<html data-theme="ancien">` posé par défaut + tous les fallbacks (`getTheme()`, script inline précoce avant paint dans `index.php`/`game.php`/`snapshots.php` — le dernier via iframe same-origin, partage le même `localStorage`) retombent désormais sur `ancien` si aucune préférence n'est encore enregistrée en `localStorage`, plutôt que `bleu`. Sélecteurs : `#theme-toggle` (prez, `index.php`) et `<select id="gameThemeSelect">` in-game (`edaPanelHost.js`, juste après le sélecteur de langue) — les deux passent par `themeManager.js`, pas de rechargement de page. i18n : clés `theme.bleu`/`theme.ancien` (libellé affiché "Médiéval") + `game.eda.themeNames.*` (retraduction réactive du select in-game) dans les 6 langues.

**Architecture CSS** — `css/themes/bleu.css`/`css/themes/medieval.css` (déplacés dans ce sous-dossier dédié le 2026-07-17, rangement organisationnel : seuls les fichiers spécifiques aux 2 thèmes vivent hors de `css/`, tout le reste de `css/` reste où il est ; renommés 2 fois le même jour, `theme-bleu.css`/`theme-ancien.css` → `theme-bleu.css`/`theme-medieval.css` → `bleu.css`/`medieval.css`, noms de fichiers seuls — la valeur interne du thème reste `ancien` partout : `data-theme="ancien"`, `localStorage`, `THEMES` de `themeManager.js` — `<link>` mis à jour à chaque fois dans `index.php`/`game.php`/`snapshots.php`, commentaires croisés mis à jour dans `base.css`/`help.css`/`multiplayerUi.css`/`presentation.css`/`themeManager.js`) scopent tout ce qui est intrinsèque à chaque thème pour les cartes de la prez (`.mission-card`, `.biome-card`, `.faction-card`, `.creature-card`, `.audio-card`, `.daynight-card`, `.hs-card`, `.hero-inspi-card`, `.stats-bar`, `.step-card`, `.kbd-strip`, `.gallery-card`, `.eda-showcase-card`, `.room-demo`) ; layout partagé (grid/flex/tailles/structure images) reste dans `presentation.css`. Le reste du HUD in-game (score/missions/aide/FPS/EDA/deck/galerie snapshot/replay/menus pre-game/bandeau) est thémé directement via des blocs `[data-theme="..."]` dans `base.css`/`eda.css`/`help.css`/`missions.css`/`highscore.css`/`deck.css`/`snapshots.css`/`multiplayerUi.css`/`startupMenu.css`/`snapshotGalleryOverlay.css` — pas dans les 2 fichiers `theme-*.css`. `images/manuscrit.png` reste absent du dossier `images/` : `border-image` retombe sur `border: 50px solid transparent` (invisible mais mise en page non cassée) — rendu réel jamais vérifié avec la texture.

**Patterns établis, à réutiliser pour toute future zone à thémer** :
- **Cellule centrale du 9-slice sans padding/margin** — texte/image collés aux bords contre le motif du parchemin (contrairement au thème bleu, qui garde son padding).
- **Marge sous une image bannière** : `margin-bottom` sur le conteneur de l'image, PAS `padding-bottom` sur son overlay interne (qui n'espace que le texte à l'intérieur de l'image).
- **Chips/badges "cachet de cire"** — thème bleu : fond translucide clair + texte pastel (pensé pour fond sombre) ; thème ancien : inversion en fond saturé sombre + texte clair, même identité de teinte par catégorie mais assombrie. Même principe pour les boutons d'action (`.new-game-button`/`.abandon-button`, `#debugLightCopy/Redo/Compare` bleu vs `#debugLightUndo/Reset` rouge).
- **Encre sombre + serif uniforme** — `color: #332415`/`#4a3623`, `font-family: Georgia, "Times New Roman", serif` sur tout texte posé sur parchemin ; les éléments superposés à une image/dégradé sombre indépendant restent inchangés (jamais sur fond parchemin).
- **Groupement en une seule boîte** — `.kbd-strip` (17 raccourcis) : UN SEUL parchemin englobant, pas une boîte par item ; les `<kbd>` individuels gardent leur badge cachet de cire pour rester repérables. Idem `.stats-bar` (une seule boîte pour toute la barre, pas une par `.stat-item`).
- **Piège styles inline** — un `style="color:..."` codé en dur bat toujours une règle de classe `[data-theme]` en spécificité CSS ; grep `style="` sur toute nouvelle zone à thémer avant de commencer (rencontré sur `.room-demo`, corrigé en classes dédiées).
- **Piège spécificité `#id`** — une règle `#id .classes` bat toujours `[data-theme="..."] .classes` (attribut) quel que soit l'ordre des règles ; toute règle `#id` qui fixe une couleur en dur doit être dupliquée avec le même `#id` dans sa variante thémée (rencontré sur `#statsPanel .stat-num`).
- **Simplification volontaire répétée à plusieurs endroits** : les accents colorés déjà identitaires/déjà sombres (biomes, catégories FPS d'abord classées "partagées" avant d'être fixées, badges de rubrique EDA `rgba(0,0,0,0.45)`, boutons chrome flottants, sliders/switches/tooltip LUT) restent communs aux deux thèmes tant qu'ils sont lisibles sur fond clair ET sombre — corrigé a posteriori (accents FPS déployé, titres de rubrique EDA, vert des adjectifs FPS/CPU/GPU) chaque fois qu'un cas s'est révélé illisible sur parchemin, via des variables CSS thémées (`--fps-c-*`) plutôt que des hex figés.
- **Voiles/fonds pleine page jamais thémés** — seule la "carte" convertit (`.help-overlay`, `.mode-screen--with-background`, backdrop de la visionneuse galerie) ; ils restent identiques dans les deux thèmes par convention.

**Chantier de clôture (logo pre-game, `.tileDeckBox`, iframe galerie, ESC/E-F immersif, croix de fermeture)** :
- Fix régression logo `.mode-logo` : repassé en flux normal (`display:block`) au lieu d'un `position:absolute` mal calé qui chevauchait le texte suivant ; réduit de 25%.
- `.tileDeckBox` (nouveau, enveloppe `.tilePreviewRow`+`.tileCountRow`) : zéro effet en bleu, parchemin en médiéval — pattern à réutiliser pour toute future paire de div à thémer ensemble.
- Galerie de captures : le popup (`.snapshot-gallery-panel`) était thémé mais son contenu réel vit dans `snapshots.php`, chargé en `<iframe>` — document HTML séparé jamais raccordé à `[data-theme]`, d'où fond/textes figés en bleu. Fix : même script de restauration + `<link>` theme-*.css que `game.php`, et `css/snapshots.css` réécrit en blocs thémés (visionneuse plein écran volontairement laissée sombre dans les 2 thèmes, convention lightbox).
- ESC dans la galerie de captures ouvrait aussi l'aide (même cause que le fix replay du 2026-07-16 : deux listeners `keydown` sur `document`) — fix par écoute en phase de capture + `stopImmediatePropagation()`.
- Touches E/F désynchronisaient l'état interne en super-immersif (`body.huds-force-hidden`) : les boutons FPS/EDA sont masqués/désactivés mais les listeners globaux continuaient de basculer l'état en douce — ignorés tant que ce mode est actif.
- ESC en mode (super-)immersif ouvrait l'aide en plus de fermer le mode (`scene.js`) — `return` immédiat manquant après `toggleGridOnlyMode(false)`.
- Bandeau in-game réorganisé sur 3 lignes (photo/galerie/replay, langue/thème, FPS/EDA) via un conteneur colonne `.debug-light-btn-rows`.
- Croix de fermeture stylées ajoutées en haut à droite des HUD FPS/EDA (`.fps-hud-close`, `.debug-light-close`), thémées bleu/médiéval comme les boutons d'export.
- Relecture complète + recherche de code mort (demande explicite) : aucun code mort fonctionnel trouvé, seulement des commentaires d'en-tête stales corrigés (`themeManager.js`, `theme-bleu.css`, `theme-ancien.css`).

**Chantier considéré clos par l'utilisateur** ("tout est full-validé") — ~100% de l'UI (prez + menus pre-game + tout le HUD in-game) est scindée `theme-bleu.css`/`theme-ancien.css` ou porte ses propres règles `[data-theme]`.

**Chantier `.internal-parchment` (bleed marge négative) — 2026-07-18, très laborieux (nombreux allers-retours avant la bonne solution)** :

Pattern final validé pour TOUS les parchemins in-game : `<div class="carte"><div class="internal-parchment">...contenu...</div></div>`, avec en thème ancien `.carte { overflow: visible; }` et `.carte > .internal-parchment { margin: -20px -25px -20px -25px; }` (+ tout scroll/clamp réel déplacé SUR `.internal-parchment` lui-même : `overflow-y:auto`/`overflow:hidden`+`flex:1 1 auto; min-height:0`). Concerne `#scorePanel`, `.fps-counter`, `.help-panel`, `.debug-light-body` (`base.css`/`eda.css`/`help.css`).

Pièges rencontrés dans l'ordre, à ne plus reproduire :
- **Cache CSS absent sur `game.php`** — contrairement à `index.php`, aucun `<link>` n'avait de `?v=` : les CSS pouvaient rester en cache indéfiniment. Fix identique à `index.php` : `$cssVersion` = mtime max de tous les CSS concernés, apposé en query string sur chaque `<link>`.
- **`box-sizing:border-box` + gros border-image ajouté sans agrandir la boîte** — passer d'une bordure fine (thème bleu) à `border:50px` (ancien) sur un élément `box-sizing:border-box` à largeur/hauteur fixes grignote le contenu du montant de la bordure ajoutée. Fix : `box-sizing:content-box` côté ancien uniquement, `width`/`max-width`/`max-height` ne portent alors que sur le contenu.
- **Cascade CSS par PROPRIÉTÉ, pas par bloc** — une règle générale `[data-theme="ancien"] .internal-parchment { margin:-20px -25px -20px -25px; }` (dans `themes/medieval.css`, chargée sur TOUTE page ancien) continue de s'appliquer à un élément si sa règle plus spécifique ne redéclare pas `margin` — ne jamais compter sur "ne pas écrire la propriété" pour la neutraliser, il faut l'écraser explicitement.
- **`overflow:hidden` sur l'élément qui porte la marge négative = bleed invisible/tronqué** — piège final et le plus long à isoler : mettre `margin:0` sur `.internal-parchment` pour "éviter la troncature" annule purement et simplement l'effet demandé (aucune différence visuelle = symptôme identique à "aucun effet"). La bonne solution n'est pas de renoncer au bleed mais de déplacer le clip/scroll réel vers `.internal-parchment` lui-même (qui ne recadre jamais sa propre marge, seulement le contenu de ses enfants) et de laisser l'élément parent en `overflow:visible`.
- Diagnostiqué en connectant Claude in Chrome en direct sur `192.168.0.41/hexistenz/game.php` (capture d'écran + zoom + `getComputedStyle`) après plusieurs rounds d'hypothèses fausses sans preuve visuelle — utile de le refaire en priorité pour tout futur bug CSS "je ne vois pas d'effet".

**Suite du chantier `.internal-parchment` — 6 régressions/finitions signalées après coup (2026-07-19)** :

- **⚠️ Règle absolue établie : ne jamais redimensionner le border-image 9-slice pour corriger une marge perçue comme excessive.** Une première tentative avait réduit `.replay-panel` de `border:50px` à `border:25px` pour "moins de padding" — rejetée explicitement par l'utilisateur comme régression cassant l'harmonie de l'UI (tous les parchemins doivent partager la même échelle de bordure 50px). Revert du border, correction du perçu par la **marge négative de bleed** à la place (`.replay-panel > .internal-parchment` : `-10px`→`-40px` haut/bas). **Ce pattern remplace définitivement toute tentation de toucher au border-image** — cf. mémoire `feedback-placement-sol-simplicite` pour le pattern jumeau côté placement 3D (une seule constante simple plutôt qu'une approximation par cas).
- **`#scorePanel` marge négative du haut** — perçue comme insuffisante malgré une valeur déjà géométriquement exacte (vérifié `getBoundingClientRect()`), approfondie `-20px`→`-40px` par pragmatisme plutôt que d'argumenter la mesure : la perception visuelle de l'utilisateur prime sur la preuve mathématique quand les deux divergent sur un réglage cosmétique fin.
- **🐛 Ascenseur cyan sur fond parchemin** — un `scrollbar-color` déjà correct restait sans effet : Chromium donne toujours priorité aux pseudo-éléments `::-webkit-scrollbar-*` dès qu'UNE règle de ce type existe sur un sélecteur correspondant, même non liée. Fix générique `[data-theme="ancien"] .internal-parchment::-webkit-scrollbar-thumb` (`themes/medieval.css`) — **ne couvre pas** `.fps-hud-body`, élément de scroll réel mais distinct de `.internal-parchment` dans le HUD FPS déployé ; second correctif dédié nécessaire dans `eda.css`.
- **4 cellules du deck (tuile courante/suivante/restantes/posées)** — reviennent sur une décision antérieure explicite du 2026-07-17 ("gardent leur propre carte sombre, inchangée") : l'utilisateur a demandé leur conversion complète au parchemin (fond clair translucide, texte encre `#332415`, plus de cyan). `deck.css` : `.tileBox`/`.deckRemainingBox` déthémés, `.title` en `Georgia, "Times New Roman", serif` comme `.missionsBox` (vérifié sans collision de spécificité avec la règle plus précise de `.missionsBox .title`).
- **Bouton copier du HUD FPS (`.fps-hud-copy`) bleu foncé oublié** — contrairement à son voisin `.fps-hud-close`, jamais thémé depuis la conversion FPS du 2026-07-17. Ajouté dans `eda.css` (fond/texte palette ancien standard). Vérifié en live dans les deux états plié/déplié.
- **🪤 Piège de vérification live rencontré** — après un premier check `getComputedStyle` montrant encore les anciennes valeurs bleues, le hard-reload navigateur (`Ctrl+Shift+R`) a suffi à trancher : le menu de démarrage du jeu (choix de forme du monde → sélection de partie → rejoindre) doit être rejoué à chaque nouvelle session Claude-in-Chrome avant que `#fps-counter` existe dans le DOM — ne pas confondre "élément absent du DOM" avec "CSS non appliqué", vérifier d'abord l'état d'avancement du menu de démarrage.

**🪤 Correction d'une affirmation périmée — galerie de replays PAS intégralement revertée (constaté 2026-07-19)** : l'entrée §21 du 2026-07-16 affirmait "aucune trace résiduelle, vérifié par grep repo-wide" pour l'abandon de la galerie de replays généralisée. Un grep récent montre que **3 fichiers orphelins subsistent sur disque** (`replays.php`, `javascript/replayGallery.js`, `javascript/replaysPage.js`) — non référencés par aucun autre fichier du projet (confirmé par grep croisé), donc bien morts fonctionnellement, mais jamais supprimés. Signalé ici plutôt que fixé d'initiative (suppression de fichiers hors du périmètre de la tâche en cours) — à nettoyer lors d'un prochain audit de fichiers morts.
