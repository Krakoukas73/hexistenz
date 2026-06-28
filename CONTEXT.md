# CONTEXT.md — Hexistenz

## 1. Nature du projet

**Version courante : `v0.9.1.2 beta`** (source unique : `variables.js` → `HEXISTENZ_VERSION`).

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
- Relief procédural : somme sinus + bruit FNV-1a, désactivable par biome
- Hauteurs surface par biome : grass≈0.082, house≈0.085, forest≈0.088, field≈0.094

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
| `waterBeachGeometry.js` | Plages procédurales |
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
| `bonusCellChestOverlay.js` | Coffre animé sur chaque cellule bonus |
| `tileRoadOverlay.js` | **Routes désactivées** — stubs no-op |

---

## 9. Modèles GLB

Chargés via `GLTFLoader`. Pattern : prototype singleton, clone à chaque rebuild. GLBs animés : `cloneSkeleton` (SkeletonUtils) — **jamais `clone(true)`** (brise SkinnedMesh). Props non-animés : `prototype.clone(true)` OK, matériaux partagés.

### Pools actifs

**Maisons** (`houseVillageObjects.js`) — 3 variantes médiévales, poids égaux :
```
maison-petite-1  (33% de fumée)
maison-petite-2  (33% de fumée)
maison-petite-3  (jamais de fumée — pas de cheminée visible)
HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.93 * 0.90 * 0.93 * 0.96 * 1.05 * 1.05
```

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

**Moulins** (`fieldZonesOverlay.js` via `decorOverlay.js`) — pool 50/50 :
```
field-flag-2 → moulin-2.glb
field-flag-3 → moulin-1.glb   (clé interne "field-flag-3", GLB = moulin-1)
```

**Charrettes** (`villageDecorOverlay.js`) — pool 50/50 :
```
cart-2 (charrette-2.glb), cart-3 (charrette-pleine.glb)  — charrette-1 retirée
cart-3: bypassBboxCheck: true, groundOffsetDelta: -0.020
```

**Fontaines** — pool 50/50 fontaine-1 / fontaine-2 :
```
fontaine-1: bypassBboxCheck: true, groundOffsetDelta: -0.017
fontaine-2: groundOffsetDelta: -0.004
```

**Meule** — 80% de chance dans villages avec au moins 1 secteur house. Sans hitbox.
```
meule.glb: bypassBboxCheck: true, groundOffsetDelta: +0.008
```

**Panneaux de signalisation** (`villageDecorOverlay.js`) — 3 variantes :
```
poteau-indicateur-1/2/3  (30–36% chance par arête village/forêt)
SIGNPOST_TARGET_HEIGHT    (mode: height)
```

**Barques côtières** (`villageDecorOverlay.js`) — pool 50/50 :
```
shore-boat-1 (barque-1.glb): bypassBboxCheck: true
shore-boat-2 (barque-2.glb)
SHORE_BOAT_TARGET_LENGTH * 0.65
```

**Tonneaux** (`villageDecorOverlay.js`) — pool 5 variantes :
```
barrel-1, barrel-2, barrel-3, barrel-4, barrel-5
BARREL_TARGET_WIDTH (défini dans decorOverlay.js)
```

**Animaux de village** (`villageDecorOverlay.js`) — GLBs individuels animés :
```
chien.glb  : ANIMAL_DOG_TARGET_WIDTH   (mode: length)
cheval.glb : ANIMAL_HORSE_TARGET_WIDTH (mode: length)
```

**Animaux sauvages** (`naturalPropsOverlay.js`) — InstancedMesh :
```
cerf.glb : NATURAL_DEER_TARGET_WIDTH — forêt / prairie / champ
```

**Champignons** (`naturalPropsOverlay.js`) — 2 variantes InstancedMesh :
```
mushroom-1.glb, mushroom-2.glb (mushroom-2: groundOffsetDelta: +0.008)
```

**Piles de bois** (`naturalPropsOverlay.js`) — 2 variantes, forêts uniquement :
```
pile-de-bois-1.glb (+23%), pile-de-bois-2.glb (+13% −12%)
```

### Système de placement props (`decorOverlay.js` + `naturalPropsOverlay.js`)

`preparePropPrototype(def)` — normalise le GLB : ancre `box.min.y` à Y=0 dans l'espace wrapper, scale = `target / dimension`.

`bypassBboxCheck: true` — contourne la garde "bbox ANORMALE" pour les GLBs exportés sans "Apply All Transforms" dans Blender. La normalisation fonctionne quand même via `wrapper.scale = target / large_dimension`.

`groundOffsetDelta` — correction Y post-snap stockée dans `wrapper.userData.groundOffsetDelta`. Appliquée dans `collectNaturalPropInstances` **après** le bloc snap. Valeur négative = descendre.

**Snap block** (`collectNaturalPropInstances`) :
```js
snapLift = (clearance - groundOffset) + slopeSin * baseRadius
position.y += snapLift  // si > 0.0005
```
Sur terrain plat : `position.y = surfaceY + clearance` (résultat garanti).

**Clearances** (`getNaturalPropGroundClearance`) :
```js
rock      → 0.000
brindille → 0.010
default   → 0.004
```

**Positions Y fixes** :
```js
wheat blades : surfaceY + 0.004   (fieldWheatOverlay.js)
grass blades : surfaceY + 0.005   (grassBladeOverlay.js)
```

### Densités naturelles clés

```js
flower (prairie) : moy 86.5  (+13%)
flower (autres)  : moy 23.5  (+13%)
grass (plantes)  : moy 216   (+20%)   // pool : berry-1..6 (71%) + plant-misc + plante-1..7
brindille        : moy 14.5
shrub            : moy 30
rock (prairie)   : moy 6.5   (+16%)
rock (forêt)     : moy 4.5
wheat blades     : WHEAT_BLADE_COUNT = 2129
mushroom         : dans forêts et prairies
deer             : dans forêts, prairies, champs
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

### Pass cinématique (`cinematicPass.js`)

8 effets dans le fragment shader : distorsion barillet → tilt-shift → aberration chromatique → gaussienne 9-taps → halation → vignette → grain film → scan lines.

Uniforms clés : `uTilt`, `uFocusCenter`, `uFocusBand`, `uVignette`, `uGrain`, `uChromatic`, `uHalation`, `uBarrel`, `uScanLines` (0–6 px / cycle 8 px), `uTime`, `uResolution` (injecté dans threeSetup.js — absent de CINEMATIC_SHADER.uniforms).

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
2. **Intersection slab Y** `[SMOKE_Y_BASE=-0.05, SMOKE_Y_TOP=1.3]` → `tMin`, `tMax`.
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

## 13. LUT / Presets (`debugLightUi.js` + `json/ambiances.json`)

Bouton **L** → panel LUT. Bouton **C** → CUSTOMISATION. **📋 Copier** : exporte `{ lut, pix, cinema }`.

Presets `json/ambiances.json` (16) : Défaut, Brume côtière, Minuit, Automne, Été vif, Hiver, Vieux sépia, Forêt nordique, Test colorimétrie, Désert doré, Noir&Blanc (scanLines=4), Apple II (scanLines=4) / CGA (scanLines=4) / EGA (scanLines=3) (pixelSize=3), Amiga (pixelSize=2, scanLines=2), Psyché-LSD.

Chargé via `fetch('./json/ambiances.json')` dans `debugLightUi.js`.

**Quantification palette rétro** (`visualEnvironment.js`) : uniforms `uPaletteColors[40]` + `uPaletteSize` + `uPaletteDither`. Comparaison en espace sRGB (raw hex — ne pas passer par `new THREE.Color()`).

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

Seuils dans `variables.js` :

| Cible | Constante | Valeur |
|---|---|---|
| Fleurs, champignons | `LOD_MICRO_CULL_DISTANCE` | 6.6 |
| Plantes (végétation, shrubs) | `LOD_PLANT_CULL_DISTANCE` | 4.8 |
| Brins d'herbe (GPU) | `LOD_GRASS_CULL_DISTANCE` | 6.4 |
| Blé (chunks) | `LOD_WHEAT_CULL_DISTANCE` | 5.6 |
| Rochers | `LOD_ROCK_CULL_DISTANCE` | 7.2 |
| Décor bord de route | `LOD_ROAD_DECOR_CULL_DISTANCE` | — |
| Poteaux indicateurs | `LOD_SIGN_CULL_DISTANCE` | 7.9 |
| Props village | `LOD_VILLAGE_PROP_CULL_DISTANCE` | 8.6 |
| Barques échouées | `LOD_SHORE_BOAT_CULL_DISTANCE` | 9.2 |
| Animaux (cerfs, chiens, chevaux) | `LOD_ANIMAL_CULL_DISTANCE` | 9.6 |
| Trains | `LOD_TRAIN_CULL_DISTANCE` | 9.9 |
| Fontaines | `LOD_FOUNTAIN_CULL_DISTANCE` | 9.8 |
| Corbeaux | `LOD_CROW_CULL_DISTANCE` | — |
| Bateaux animés | `LOD_BOAT_CULL_DISTANCE` | 10.3 |
| Arbres | `LOD_TREE_CULL_DISTANCE` | 12.2 |
| Moulins | `LOD_MILL_CULL_DISTANCE` | 12.6 |
| Bâtiments | `LOD_HOUSE_CULL_DISTANCE` | 12.7 |
| Watchtowers | `LOD_WATCHTOWER_CULL_DISTANCE` | 13.2 |
| Rails | `LOD_RAIL_TRACK_CULL_DISTANCE` | 14.4 |
| Labels zones | `LOD_ZONE_LABEL_CULL_DISTANCE` | 28.2 |

Test dans `animate()` toutes les 9 frames. Après rebuild via `overlayRebuildQueue`, `lod()` appelé immédiatement.

---

## 16. Pipeline perf — rebuild différé (`scene.js`)

`overlayRebuildQueue = new Map<name, {rebuild, lod}>()` — coalescing automatique, 1 overlay traité par frame.

**BFS ciblé waterZone** : `affectedHex` → BFS partiel sur 7 hexes. Full rebuild si `null` (undo, chargement, multijoueur).

---

## 17. InstancedMesh

`forestOverlay.js`, `naturalPropsOverlay.js`, `tileRailOverlay.js` utilisent `THREE.InstancedMesh`. Pattern : collect matrices → build mesh.

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

## 19. Shader eau (`realisticWater.js` + `shaders/shaderEau.js`)

`ShaderMaterial` unique mis en cache → 1 Mesh fusionné dans `terrainMerge`.

**Attribute bathymétrique `aShoreDepth`** : posé CPU dans `tileMesh.js`. Anneau 1 (×0.60) + Anneau 2 (×0.20) → [0,1]. Propagation au placement : `updateTileShoreDepth()` sur voisins + `rebuildTerrainMerge()`.

**Vertex shader** : 4 composantes de vague (swellA, swellB, chopA, chopB), amplitudes réduites ~15-20%. Atténuation rive : `shoreWaveFactor = mix(0.18, 1.0, smoothstep(0, 0.65, aShoreDepth))` — clapotis résiduel minimum 0.18. Abaissement moyen : `-0.012` (évite de recouvrir les plages).

**Fragment pipeline** (10 étapes) :
1. **Normales vague** — dérivées finies hL/hR/hU/hD (eps=0.12), même formule que vertex.
2. **Voronoï grande échelle (5u)** — `voronoiBorder()` deux passes (iquilezles) → `voroDir` (direction courant) + `borderD1`.
   - Passe 1 : 3×3, cellule la plus proche.
   - Passe 2 : 5×5 centré, distance exacte au bord (`dot(½(minVec+r), normalize(r−minVec))`).
3. **FBM advecté par courant** — double sample P_Malin ("Where the River Goes") : deux samples décalés de 0.5 en temps, crossfade → élimine l'artefact de glissement. Cycle ~24s (`tCycle = uTime * 0.042`). `fbmFlowDXY` : 4 octaves, alternance `flow *= -0.75` → méandres.
4. **Normale finale** : `normalize(waveNorm * 0.48 + flowNorm * 0.52)`.
5. **Fresnel** — `(1 − NdotV) × 0.55`.
6. **Voronoï couleur (2.8u)** — `voronoiBorder()` bords précis → modulation `(smoothstep(0, 0.40, borderD2) − 0.5) × 0.65` (±0.28 effective).
7. **Bathymétrie** — `depth = vShoreDepth^0.6`, `t = 1 − depth` → finalT clamped [0.02, 0.96].
8. **Couleur de base** — `mix(uDeepColor, uShallowColor, finalT)`.
9. **Ombrage** — diffuse + specular (pow 14, ×0.14) + Fresnel teinté ×0.50.
10. **Gamma** — `pow(base, 0.88)`.

`voronoi()` supprimé — remplacé partout par `voronoiBorder()` (bords précis vs gradient radial flou).

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
terrainMerge.js                Fusion meshes terrain par biome (~14 DCs)
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
waterZoneOverlay.js            BFS zones eau, labels sprites
waterBeachGeometry.js          Plages procédurales
waterZoneBoundary.js           Halos/contours de zone
waterBoatOverlay.js            Bateaux GLB animés
realisticWater.js              ShaderMaterial eau réaliste
shaders/shaderEau.js           GLSL eau
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
worldCurvature.js              Courbure monde GPU + picking souris
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
```

---

## 21. Travaux récents (juin–juillet 2026)

| Changement | Détail |
|---|---|
| Déplacement `stable/` → racine | 28 fichiers, imports `'../'` → `'./'` |
| Shader eau rebâti | FBM advecté + double sample P_Malin + Voronoï bords précis (voronoiBorder deux passes) |
| Routes supprimées | `tileRoadOverlay.js` → stubs, GLBs retirés |
| Système prop placement | `bypassBboxCheck`, `groundOffsetDelta`, snap clearance par kind, `propHitboxRegistry`, `propPlacement.js` |
| Pools charrettes | cart-2 / cart-3 (50/50), charrette-1 retirée |
| Tours de guet | Pool tour-1/2/3/4/6, tour-5 retirée |
| Meule en village | 80% de chance, sans hitbox |
| LOD props végétation | PLANT −15%, WHEAT −15%, GRASS −15% |
| Blé : position | surfaceY + 0.004 (validé) |
| Brins d'herbe | surfaceY + 0.005 |
| Arbres | TREE_GROUND_OFFSET = -0.005 |
| Densités | Fleurs +13%, plantes +20%, rochers +16% |
| **Ciel volumétrique** | `cloudSky.js` + `shaders/shaderCiel.js` — value noise FBM (hashIQ), Beer-Lambert, sphère atmosphérique |
| **Mode jour/nuit** | HUD dropdown `#dayNightMode`, event `hexistenz:dayNightChange`, localStorage `hexistenz_daynightmode` |
| **Comètes bloquées de jour** | `cometSky.visible = !isSoleil`; `updateCometSky` conditionnel dans animate |
| **Fumée volumétrique** | `smokeVolumePass.js` + `shaders/shaderFumee.js` — ray-march slab-borné, Gaussian évasé, turbulence 4 octaves, depth test via `beautyRenderTarget.depthTexture`. Maisons petite-1/2 (33%), petite-3 exclue. Locos ×1.14 / maisons ×0.86. LOD calqué exactement sur les overlays. Buffer 48 sources, locos en priorité. |
| **Rebuild forest incrémental** | `HEX_CHUNK_SIZE=3`, param `changedTile`, `userData.chunkKey` sur chaque IM |
| **Freeze multiplayer résolu** | `applyRemoteGameState` skip overlays si 0 tuiles changées (sync no-op) |
| **Animaux sauvages** | Cerfs (InstancedMesh, `cerf.glb`) — forêt / prairie / champ |
| **Animaux de village** | Chiens (`chien.glb`) + Chevaux (`cheval.glb`) — GLBs individuels animés |
| **Panneaux signalisation** | poteau-indicateur-1/2/3 — 30–36% chance par arête |
| **Piles de bois** | pile-de-bois-1/2 — forêts uniquement |
| **Berry pool** | berry-1..6 — dominent le pool grass (71% des instances) |
| **Nouveaux presets** | Hiver (désaturation froide, vignette forte) + Psyché-LSD (saturation ×2.2, brouillard linéaire) |
| **Chi-mai proximité** | `FIELD_MAX_DIST` : `HEX_SIZE * 1.2` → `HEX_SIZE * 0.72` (caméra doit être sur la tuile field) |
| **Shadow map adaptive** | Extent `clamp(8, 18, cameraY * 0.58)` — −40% DC shadow vs ±24u fixe |
| **IBL RoomEnvironment** | `scene.environmentIntensity = 0.25` — lumière indirecte cohérente sur tous GLBs |
| **SUN_LAYER dédié** | Astre rendu en 3e passe (après labels), indépendant du contenu GLB |
| **Fontaines** | groundOffsetDelta corrigé : fontaine-1 → −0.017, fontaine-2 → −0.004 |
| **Arborescence JSON** | `json/` à la racine : `ambiances.json`, `highscores.json`, `games/room_*.json`. Chemins mis à jour dans `multiplayer.php`, `highscore.php`, `debugLightUi.js`, `generate.php`, `multiplayerUi.js` |
| **HUD score — cartes résumé** | Emojis 🚂⛵☄️ après le nombre (`stats-num-group`, taille 30×30px, fond `rgba(0,0,0,0.22)` arrondi). Label "Comètes interceptées" → "Comètes". Fond `.stats-boats` et `.stats-tiles` harmonisés avec `.stats-trains` (dégradé gris neutre). Règle `.stats-summary-card span` restreinte à `:not(.stats-emoji)` |
| **HUD score — tooltips** | Textes d'aide au survol sur les 3 boîtes tuiles (game.activeTile / game.nextTile / game.deckRemaining) dans `help.js` + `ui.js` |
| **Missions — tooltips** | `MISSION_HELP` exporté de `missions.js` (une explication par type). Délégation via `data-mission-tip` + `delegateHelpTooltip` dans `ui.js` |
| **Aide tooltip "Rejoindre"** | Phrase "partie doit être en attente…" supprimée de `help.js` (`menu.join`) |
| **#tileUI fond transparent** | Suppression de `overflow-y: auto / overflow-x: hidden` sur `#tileUI` — c'était le scroll container Chrome qui peignait un fond gris |
| **Page de présentation** | `index.php` (ex-`presentation.php`) — landing page bilingue FR/EN, standalone, CSS dans `css/presentation.css`. `game.php` = ex-`index.php`. `HEXISTENZ_VERSION` lue par regex PHP depuis `variables.js`. |

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

**Uniforms** : `uTime, uSunDir, uSkyZenith, uSkyHorizon, uSunColor, uCoverage (0.41), uEnabled`.

**État courant** (freq/vitesse après ajustements cumulés) :
```glsl
vec3 p = pos * 0.026202 + vec3(0.0, 0.0, -uTime * 0.09450);
```
Historique vitesse : 0.2 → 0.164 (−18%) → 0.128 (−22%) → 0.105 (−18%) → 0.09450 (−10%).
Historique fréquence (taille) : 0.0212242 → 0.023582 (−10%) → 0.026202 (−10%).

**`cloudSky.visible` est toujours `true`** — c'est `uEnabled` qui active/désactive le rendu nuages. En mode nuit le gradient de ciel uni reste visible (couleurs nocturnes).

---

## 23. Mode Jour / Nuit

`isSoleil` (booléen mutable dans scene.js) — persistent via `localStorage('hexistenz_daynightmode')`.

HUD dropdown `#dayNightMode` dans `debugLightUi.js` — sous "forme du monde". Dispatche `hexistenz:dayNightChange` (CustomEvent), lu par scene.js.

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

**Astres GLB** (`threeSetup.js`) : `soleil.glb` + `lune.glb` chargés à l'init. Visibilité contrôlée par `setAstreMode(scene, isSoleil)`. `SUN_LAYER=2` — rendu après labels, devant tout.

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

## 25. Profil de performance (HUD — référence juin 2026)

Mesure représentative (59 FPS, GPU-bound à 82%) :

```
Draw calls : 2569   (HUD trackés : 1740 | Ombres/passes : ≈829, ☂395 casters)
Triangles  : 22 453 095   (trackés : 11 524 527)
Textures   : 334
Shaders    : 71
```

Catégories dominantes en DC :
- Maison petite : 390 dc (151 obj) — mesh très fragmenté
- Corbeaux : 100 dc (10 obj) — 1 DC par volatile
- Micro-props : 23 dc (14 325 obj) — très bien batché (InstancedMesh)
- Fleurs : 12 dc (4 426 obj), Plantes : 38 dc (4 128 obj)

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

**groundOf
**groundOffsetDelta** — valeur négative = descendre. Appliquée **après** snap, pas avant.

**colorGradingPass** — toujours passer par `composer.render()`. `renderer.render()` direct bypasse l'étalonnage.

**Depth map eau** — arête→voisin : `EDGE_ORDER[i]` face à `_HEX_DIRS[(6-i)%6]` (pas `(i+1)%6`).

**Shadow culling** — ne pas définir `castShadowOriginal` sur les meshes à ombres volontairement désactivées : `applySceneShadowFlags` ne restaure que si `typeof castShadowOriginal === 'boolean'`.

**Chi-mai** — `FIELD_MAX_DIST = HEX_SIZE * 0.72` (< apothème 0.866). La caméra doit être physiquement sur la tuile field pour déclencher.

---

## 27. Systèmes graphiques — référence upgrade

Regroupe tous les points d'entrée pour un upgrade visuel futur. Chaque système est localisé et indépendant.

### A. Pipeline de rendu post-processing

**Ordre des passes** : `RenderPixelatedPass → SmokeVolumePass → colorGradingPass → cinematicPass → OutputPass`

**3 passes renderer par frame** :
1. `WORLD_LAYER=0` → composer (postprocess complet)
2. `TEXT_LAYER=1` → renderer direct, clearDepth seul (labels nets, non pixelisés)
3. `SUN_LAYER=2` → renderer direct, en dernier (astres devant tout)

**Upgrades pipeline** :
- Remplacer `BasicShadowMap` par `PCFSoftShadowMap` (`threeSetup.js`)
- Augmenter la résolution shadow map (actuellement 1024×1024)
- Ajouter une passe SSAO entre `RenderPixelatedPass` et `SmokeVolumePass`
- Ajouter un bloom sélectif (eau, feu, comètes) après `colorGradingPass`
- `WebGL2` + `logarithmicDepthBuffer: true` pour réduire le z-fighting lointain

---

### B. Shader eau (`realisticWater.js` + `shaders/shaderEau.js`)

ShaderMaterial unique, 1 mesh fusionné `terrainMerge`, 10 étapes fragment.

**Upgrades** :
- Réflexions dynamiques via `CubeCamera` ou `WebGLRenderTarget`
- Caustiques : texture animée projetée sur le fond (bathymétrie `aShoreDepth` déjà disponible)
- Mousse de rive : shader foam sur `aShoreDepth ≈ 0`
- Spray GPU sur les arêtes de rive (`aShoreDepth < 0.1`)

---

### C. Ciel volumétrique (`cloudSky.js` + `shaders/shaderCiel.js`)

Sphère BackSide r=500, ray-march value noise FBM 4 octaves, Beer-Lambert.

**Upgrades** :
- Nuages 3D Worley (cellulaire) pour des cumulus plus réalistes
- Scattering Rayleigh/Mie physique (teinte orange/rouge au coucher de soleil)
- God rays : radial blur depuis `uSunDir` projeté
- Éclairs nocturnes : flash aléatoire basse fréquence (mode nuit)
- `uCoverage = 0.41` : exposer dans le panneau LUT pour contrôle temps réel

---

### D. Fumée volumétrique (`smokeVolumePass.js` + `shaders/shaderFumee.js`)

ShaderPass, ray-march slab `Y[-0.05, 1.3]`, 48 pas, Gaussian évasé, 4 octaves turbulence, depth test.

**Upgrades** :
- Couleur par source : locos (gris charbon) vs maisons (blanc/beige)
- Connecter `globalWind.js` pour dériver la fumée dans la direction du vent
- `MAX_SMOKE_SOURCES = 48` → augmenter si grilles denses (attention perf shader)
- Réduire ou désactiver si preset "pluie" ajouté

---

### E. Effets cinématiques (`cinematicPass.js`)

8 effets fragment : barillet → tilt-shift → aberration chromatique → gaussienne 9-taps → halation → vignette → grain film → scan lines.

**Upgrades** :
- Depth of field vrai basé sur le depth buffer (tDepth) — remplacer tilt-shift horizontal
- Motion blur : accumulation frame précédente × matrice MVP précédente
- Aberration chromatique : 5-sample anamorphique (actuellement 3-sample radial)
- LUT 3D : remplacer la correction couleur par une `DataTexture3D` (Three.js r160 supporté)

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

**Forêt** (`forestOverlay.js`) : vertex shader de balancement troncs/feuillages (même principe vent blé).

---

### H. Courbure du monde (`worldCurvature.js`)

Vertex shader GPU, mode "bouliste".

**Upgrades** :
- Fog exponentiel coloré en fonction de la courbure (`gl_Position.z`) pour profondeur
- Bande horizon glow calquée sur `uSkyHorizon` du ciel

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
remplacer les InstancedMesh lointains par des sprites pré-rendus (`Sprite` ou atlas billboard) au-delà d'un seuil de distance
- **Shadow LOD** : `rebuildShadowCasters` toutes les 180 frames — passer à une liste d'exclusion par distance (`applyShadowCulling` déjà partiel)
- **Frustum culling InstancedMesh** : actuellement absent — ajouter un `InstancedMesh.frustumCulled = true` explicite ou un filtre BVH pour les forêts denses
- **Wheat chunk LOD** : `LOD_WHEAT_CULL_DISTANCE = 5.6` — envisager un fade progressif (alpha) plutôt qu'un cull abrupt

---

### G. Shaders terrain et végétation

**Brins d'herbe** (`grassBladeOverlay.js`) : Bezier animés, `LOD_GRASS_CULL_DISTANCE = 6.4`.
- Upgrade : passer à un **geometry shader** ou **compute shader** pour déplacer la génération vers le GPU. Actuellement CPU pur.

**Blé** (`fieldWheatOverlay.js`) : WHEAT_BLADE_COUNT = 2129, BFS local, chunks.
- Upgrade : ajouter un **vertex shader de vent** sur les brins (sin(uTime + position.x) × amplitude), connecté à `globalWind.js`

**Forêt** (`forestOverlay.js`) : InstancedMesh, 11 modèles.
- Upgrade : **vertex shader de balancement** sur les troncs/feuillages (même principe que le vent blé), masqué par le `TREE_SIZE_MULTIPLIER` déjà en place

---

### H. Courbure du monde (`worldCurvature.js`)

Vertex shader GPU — mode "bouliste" courbe les tuiles vers l'horizon.

**Points d'upgrade** :
- **Atmosphere haze** : ajouter un fog exponentiel coloré en fonction de la courbure (`gl_Position.z`) pour renforcer l'effet de profondeur
- **Horizon glow** : ajouter une bande lumineuse à l'horizon calquée sur `uSkyHorizon` du ciel

---

### I. IBL et éclairage global

**État actuel** : `PMREMGenerator + RoomEnvironment`, `environmentIntensity = 0.25`.

**Points d'upgrade** :
- **HDRI dynamique** : remplacer `RoomEnvironment` par un HDRI qui change selon jour/nuit (WebGL2 `DataTexture` ou `EXRLoader`)
- **Light probes par tuile** : `LightProbe` spatiales pour capter la couleur locale (prairie verte vs eau bleue) et l'appliquer aux GLBs environnants
- **Ambient occlusion baked** : pré-calculer AO sur les maisons/tours et stocker dans un vertex color channel secondaire

---

## 28. Philosophie

1. Ne pas casser la grille.
2. Ne pas casser le gameplay validé.
3. Modifications minimales et chirurgicales.
4. Pas d'usine à gaz.
