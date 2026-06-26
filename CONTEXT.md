# CONTEXT.md — Hexistenz

## 1. Nature du projet

Jeu web de pose de tuiles hexagonales inspiré de Dorfromantik. Le joueur pioche une tuile, la tourne, la pose sur une grille hexagonale. Chaque tuile a 6 secteurs triangulaires (biomes ou réseaux). Objectif : connecter les biomes, compléter des missions, maximiser le score.

Stack : JavaScript ES Modules natifs, sans bundler. Three.js r160 (CDN). PHP pour highscores/multiplayer. JSON stockage. Pas de framework, pas de SQL.

---

## 2. Coordonnées hexagonales

Grille **axiale (q, r)** — `stable/hex.js` :
- `axialToWorld(q, r)` → `{ x, y, z }` : `x = HEX_SIZE * 1.5 * q`, `z = HEX_SIZE * √3 * (r + q/2)`
- `worldToAxial(x, z)` → `{ q, r }` avec arrondi cube
- `makeHexKey(q, r)` → clé string `"q,r"` pour `placedTiles` (Map)

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

Score (`stable/scoring.js`) : +2 pose, +10 arête compatible, +25 réseau compatible, +50 tuile entourée + bonus cellules.

---

## 6. Règles de placement

`stable/placementRules.js` — `getPlacementValidation(hex, placedTiles, tile, specialCells)` → `{ valid, reason, conflicts }`.

Conditions : cellule libre dans grille active, au moins un voisin posé, pas de conflit réseau (`water`/`rail` doivent se prolonger ou terminer).

---

## 7. BFS de zones (`stable/zoneUtils.js`)

`collectZone(startTile, startEdge, type, placedTiles, visited, getNeighborsFn)` → `{ type, sectors, total }`

Deux variantes de voisinage :
- `getFullTextureNeighbors` (waterZoneOverlay, missions) : centre + intra-tuile + cross-tuile
- `getTextureNeighbors` local (fieldWaterEffectsOverlay) : centre + voisin hexagonal uniquement — **ne pas remplacer**

---

## 8. Terrain (`terrainHeight.js`)

- `getTerrainSurfaceY(point, type, salt)` → Y monde
- `getTerrainNormalAt(point, type, salt, options)` → normale surface (utilisée pour compensation de pente)
- `placeObjectOnTerrain(object, point, type, salt)` → position + orientation
- Relief procédural : somme sinus + bruit FNV-1a, désactivable par biome

---

## 9. Overlays visuels

Cycle : `createXxxOverlay()` → `rebuildXxxOverlay(group, placedTiles)` → `updateXxxOverlay(group, time)`. Orchestré par `scene.js`.

| Fichier | Contenu |
|---|---|
| `waterZoneOverlay.js` | BFS zones eau, hover, labels valeur |
| `waterBeachGeometry.js` | Plages procédurales (strip quads 2▲/segment) |
| `waterZoneBoundary.js` | Halos/contours de zone |
| `waterBoatOverlay.js` | Bateaux GLB animés, graphe nav |
| `fieldWaterEffectsOverlay.js` | Fleurs, roseaux, champignons, oiseaux, rochers |
| `forestOverlay.js` | Arbres GLB (InstancedMesh) |
| `houseOverlay.js` | Maisons, église, cimetière, tours de guet |
| `tileRailOverlay.js` | Rails procéduraux, traverses, ballast |
| `railTrainOverlay.js` | Trains GLB, wagons, gares terminus |
| `decorOverlay.js` | Orchestrateur props : moulins, tonneaux, barques, bancs, fontaines, cerfs... |
| `naturalPropsOverlay.js` | Fleurs/rochers/roseaux/bottes de foin (InstancedMesh) |
| `bonusCellChestOverlay.js` | Coffre animé sur chaque cellule bonus |
| `villageDecorOverlay.js` | Bancs, animaux, charrettes, tonneaux |
| `tileRoadOverlay.js` | **Routes désactivées** — GLBs archivés (.bak) |

---

## 10. Modèles GLB

Chargés via `GLTFLoader`. Pattern : prototype singleton, clone à chaque rebuild. GLBs animés : `cloneSkeleton` (SkeletonUtils) — **jamais `clone(true)`** (brise SkinnedMesh). Props non-animés : `prototype.clone(true)` est correct et partagent les matériaux.

**`decorOverlay.js`** est l'orchestrateur centralisé des props. `PROP_MODEL_DEFS` tableau `{ key, url, target, mode, correctionX?, sinkDepth? }`. `correctionX: Math.PI/2` pour GLB exportés Z-up (ex. moulin-2).

### Pools actifs (juin 2026)

**Maisons** (`houseVillageObjects.js`) — 3 variantes fantasy :
```js
HOUSE_GLB_MODEL_DEFS = [
  { key: 'maison-fantasy-1', spawnWeight: 55 },
  { key: 'maison-fantasy-2', spawnWeight: 22 },
  { key: 'maison-fantasy-3', spawnWeight: 15 },
]
// Rotation variée par index (seedKey:house-rotation:${index}) → pas de parallélisme visible
```

**Tours de guet** (`houseVillageObjects.js`) — pack GLB unique `Castle.glb`, 3 nœuds :
```js
WATCHTOWER_PACK_DEFS = [
  { key: 'tower-castle004', nodeName: 'Castle.004', spawnWeight: 33 },
  { key: 'tower-castle008', nodeName: 'Castle.008', spawnWeight: 33 },
  { key: 'tower-castle010', nodeName: 'Castle.010', spawnWeight: 34 },
]
```

**Gares terminus** (`railTrainOverlay.js`) — maisons fantasy réutilisées :
```js
STATION_MODEL_DEFS = [
  { key: 'maison-fantasy-2-station', weight: 3 },
  { key: 'maison-fantasy-3-station', weight: 2 },
]
// prepareStationGlbPrototype : castShadow=true sur tous les meshes (pas de _applySingleShadowCaster)
```

**Arbres** (`forestOverlay.js`) — 11 modèles InstancedMesh (`variables.js` → `TREE_MODEL_DEFS`) :
```js
birch, bushy_mini, pine_soft, poplar, tree_fir,
tree_complex_1, tree_complex_2,
tree_sapin_1, tree_sapin_2, tree_sapin_3, tree_sapin_4
```
HUD : `_TREE_SPECIES_MAP` dans `debugLightUi.js` — préfixes `tree_complex_` et `tree_sapin_` matchent les variantes numérotées.

**Brindilles** (`decorOverlay.js`) — `./glb/brindille.glb`, kind `'grass'`, taille `NATURAL_GRASS_TARGET_WIDTH × 0.70`, ×4 dans le pool → ~33% des herbes. `castShadow = false` (déco minuscule).

**Buissons retirés** — `Plant_Bush1`, `Plant_Bush2` supprimés du pool shrub.

**Moulins** (`fieldZonesOverlay.js`) — pool : moulin-2 et moulin-3 uniquement, 50/50. Moulin-1 retiré. `effectKind: 'field-flag-idle'` partagé par tous les moulins. LOD : `LOD_MILL_CULL_DISTANCE`.

**Fontaines** (`decorOverlay.js` / `villageDecorOverlay.js`) — pool 50/50 fontaine-1 / fontaine-2 (tirage `hashUnit < 0.5`). Tailles séparées : fontaine-1 `HEX_SIZE * 0.18 * 0.93 * 0.90` (−10%), fontaine-2 `HEX_SIZE * 0.18 * 0.93 * 0.80` (−20%).

**Église** (`houseVillageObjects.js`) — `eglise.glb`, size `4.5 * 0.93 * 0.92` (−7% −8%).

### Tailles modèles clés (post-réductions juin 2026)

```js
// Maisons
HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.93 * 0.90          // −10% −7% −10%
HOUSE_GLB_MODEL_DEFS[0].size = 1.55 * 0.95 * 0.80 * 1.08 * 0.94
HOUSE_GLB_MODEL_DEFS[1].size = 1.60 * 0.95 * 0.90 * 0.94
HOUSE_GLB_MODEL_DEFS[2].size = 1.75 * 0.95 * 0.90 * 0.94

// Props
BARREL_TARGET_WIDTH        = HEX_SIZE * 0.1031 * 0.85 * 0.88 * 0.93 * 0.88 * 0.92 * 0.92
SHORE_BOAT_TARGET_LENGTH   = HEX_SIZE * 0.175 * 0.88 * 0.92
NATURAL_DEER_TARGET_WIDTH  = HEX_SIZE * 0.16 * 0.88 * 0.92 * 0.92 * 0.92
CHEST_TARGET_WIDTH         = HEX_SIZE * 0.20 * 1.6 * 1.5 * 1.35 * 0.70   // coffre bonus (−30%)
TREE_SIZE_MULTIPLIER       = 1.65 * 0.88 * 0.94
FOUNTAIN_1_TARGET_WIDTH    = HEX_SIZE * 0.18 * 0.93 * 0.90               // fontaine-1 (−7% −10%)
FOUNTAIN_2_TARGET_WIDTH    = HEX_SIZE * 0.18 * 0.93 * 0.80               // fontaine-2 (−7% −20%)

// Plantes
NATURAL_FLOWER_TARGET_WIDTH = HEX_SIZE * 0.047 * 0.85 * 0.93 * 0.85 * 0.85 * 0.90 * 0.88 * 0.94
NATURAL_GRASS_TARGET_WIDTH  = HEX_SIZE * 0.058 * 1.15 * 0.91 * 0.87 * 0.94
NATURAL_SHRUB_TARGET_WIDTH  = HEX_SIZE * 0.095 * 0.91 * 0.87 * 0.94
NATURAL_REED_TARGET_HEIGHT  = HEX_SIZE * 0.105 * 0.85 * 0.93 * 0.88 * 0.85 * 0.92 * 0.94
```

### Routes — désactivées temporairement

`createRoadCenterOverlay` retourne `null`. GLBs archivés en `.glb.bak` : incompatibilité `InterleavedBufferAttributes` + `mergeGeometries` (Three.js r160).

---

## 11. Hash procédural (`stable/hashUtils.js`)

FNV-1a — **ne pas unifier les variantes** (changer la précision change le placement visuel) :

| Export | Usage |
|---|---|
| `hashUnitFull(text)` | forestOverlay, tileRailOverlay |
| `hashUnit100k(text)` | houseOverlay, waterBoatOverlay |
| `hashUnit10k(text)` | fieldWaterEffectsOverlay, railTrainOverlay |
| `hashNumber(value)` | forestOverlay, fieldWaterEffectsOverlay, tileRailOverlay |

---

## 12. Utilitaires partagés (`stable/`)

- `hex.js` : `axialToWorld`, `worldToAxial`, `makeHexKey`, `createHexFill`
- `hexGeometry.js` : `createOuterVertices(radius)` — toujours passer `radius = HEX_SIZE * TILE_VISUAL.radiusScale`
- `tileUtils.js` : `makeNodeKey`, `getTileEdgeType`, `clearGroup`, `smoothstep`
- `zoneUtils.js` : `collectZone`, `getFullTextureNeighbors`
- `placementRules.js` : `canPlaceTileAt`, `getPlacementValidation`, `HEX_DIRECTIONS`, `getOppositeEdge`
- `scoring.js` : `calculatePlacementScore`
- `worldCurvature.js` : `getWorldCurvatureDrop`, `markNoWorldCurvature`
- `threeSetup.js` : `createRenderer`, `createCamera`, `createPixelPostprocess`, `applySceneShadowFlags`
- `hexLabelFont.js` : `HEX_FONT_FAMILY`, `sharedLabelCache`, `hexFontReady` (Promise FontFace DeltaBlock)

---

## 13. Configuration (`variables.js` / `config.js`)

`config.js` = `export * from './variables.js'`. Constantes critiques :
- `HEX_SIZE = 1`, `EDGE_ORDER = ['n','ne','se','s','sw','nw']`, `SECTOR_DEFS`
- `TILE_VISUAL` : `radiusScale`, `waterY`, `railSurfaceY`, `tileThickness`
- `TERRAIN_RELIEF`, `EDGE_COLOR`, `EDGE_WEIGHTS`

---

## 14. Rendu et post-processing

Pipeline Three.js r160 : `RenderPixelatedPass → ShaderPass(COLOR_GRADING_SHADER) → ShaderPass(CINEMATIC_SHADER) → OutputPass` via `EffectComposer`.

`colorGradingPass` toujours actif — quand pixelisation off, `pixelPass` neutralisé (size=1, strengths=0) mais composer tourne quand même.

**Monkey-patch `RenderPixelatedPass`** (`stable/threeSetup.js`) : r160 rend la scène deux fois. Le patch surcharge `pixelPass.render` pour sauter le rendu normals quand `normalEdgeStrength < 0.005`.

### Pass cinématique (`cinematicPass.js` + `stable/threeSetup.js`)

Shader GLSL unique — toujours dans le pipeline, court-circuité par `if (uEnabled < 0.5)` quand désactivé (coût GPU ≈ 0). Activé par défaut par chaque preset d'ambiance.

**7 effets (dans l'ordre d'application dans le fragment shader) :**

0. **Distorsion barillet** — appliquée EN PREMIER sur les UV : `uv = 0.5 + bc*(1 + uBarrel*dot(bc,bc)*3.2)`. Tous les effets suivants opèrent sur ces UV distordus. Défaut `0.0`.
1. **Tilt-shift** — flou gaussien 9 taps vertical (σ=1.8), intensité quadratique hors bande nette. `blur = distFromBand² × uTilt × 0.062` (offset UV par sample). Très doux au bord de la bande, fort aux extrêmes.
2. **Aberration chromatique** — décalage radial R/B depuis le centre, amplifié aux bords ET dans les zones floues (caAmt dépend de blur). Chaque canal (R, G, B) a son propre UV et son propre blur.
3. **Gaussienne 9-taps par canal** — R/G/B accumulés séparément dans la même boucle (27 samples total).
4. **Halation** — 8 samples en croix (H+V à 2 distances), seuil luminance 0.72, tinte chaud `vec3(1.5, 0.65, 0.40)`. Simule le saignement de lumière dans l'émulsion argentique. Défaut `0.0`.
5. **Vignette** — `pow(1 - dot(dir*1.35, dir*1.35), uVignette*2+0.15)` — centre lumineux, coins assombris.
6. **Grain film animé** — deux bruits white superposés, temps = `uTime × 0.041`, amplitude `uGrain × 0.040`.
7. **Scan lines** — période **8 px** : `slDark = step(0.5, uScanLines) * (1 - step(uScanLines, mod(vUv.y*res.y, 8.0)))`, opacité 0.52. `uScanLines` = **0–6** px sombres par cycle de 8 px (slider entier). Court-circuité à 0 quand `uScanLines=0`. Valeurs par preset : Noir&Blanc=1, Amiga=3, Apple II / CGA / EGA=4.

**Uniforms exposés** :

| Uniform | Défaut | Rôle |
|---|---|---|
| `uTilt` | 0.60 | Intensité flou tilt-shift |
| `uFocusCenter` | 0.50 | Centre vertical bande nette |
| `uFocusBand` | 0.35 | Largeur bande nette |
| `uVignette` | 0.55 | Intensité vignette |
| `uGrain` | 0.30 | Intensité grain film |
| `uChromatic` | 0.45 | Aberration chromatique |
| `uHalation` | 0.0 | Halation (bloom chaud hautes lumières) |
| `uBarrel` | 0.0 | Distorsion barillet |
| `uScanLines` | 0.0 | Lignes CRT (0–6 px sombres / cycle 8 px, entier) |
| `uTime` | — | Mis à jour chaque frame par `threeSetup.js` |
| `uResolution` | — | `THREE.Vector2`, injecté par `threeSetup.js` après création du ShaderPass |

**Note** : `uResolution` n'est PAS dans la définition `CINEMATIC_SHADER.uniforms` (évite la dépendance THREE dans `cinematicPass.js`). Il est injecté dans `threeSetup.js` : `cinemaPass.uniforms.uResolution = { value: new THREE.Vector2(...) }`.

**API exposée** (`postprocess.*`) : `getCinemaSettings()`, `applyCinemaSettings(partial)`, `onExternalCinemaChange(cb)`, `toggleCinema()`.

**Touche T** (`scene.js`) → `postprocess.toggleCinema()`.

**Persistance** : `localStorage` clé `hexistenz_cinema_v1`.

**Intégration presets** : la config cinéma est intégrée dans chaque preset de `ambiances.json` (champ `cinema`). Handler : `preset.cinema ?? { enabled: true }`. Le bouton "Copier" exporte `{ lut, pix, cinema }`. Le bouton "Réinitialiser" remet `CIN_DEFAULTS` (`enabled: false`, `halation: 0`, `barrel: 0`). Mode Comparer snapshot/restore le cinéma avec `_cinBeforeCompare`.

**SHIFT+Espace — super-immersif** : active `gridOnlyMode` ET masque tous les HUDs via `body.huds-force-hidden`.

**Quantification palette rétro** (`visualEnvironment.js`) : uniforms `uPaletteColors[32]` + `uPaletteSize` + `uPaletteDither`. Comparaison en espace sRGB (raw hex — **ne pas passer par `new THREE.Color()`**). Dithering couleur-hash (pas Bayer) : quantification 8 bits avant le hash.

---

## 15. LUT — Étalonnage visuel (`debugLightUi.js`)

Bouton **L** (bas-gauche) → panel LUT bas-droite. Préférences persistées en localStorage (`hexistenz_lut_v1`).

**Bouton "📋 Copier paramètres"** : copie `{ lut, pix, cinema }` en JSON dans le presse-papiers (avec fallback `execCommand` pour HTTP/file://). Feedback visuel "✓ Copié !" 1,6 s. Permet d'envoyer l'état exact LUT + pixelisation + cinéma pour affinage.

### Presets d'ambiance — `ambiances.json` (juin 2026)

Les presets sont chargés depuis **`ambiances.json`** via `await fetch('./ambiances.json')` (top-level await ES module). Chaque preset contient `{ name, bg, pixelization?, delta, cinema }`. La pixelisation et la config cinéma sont intégrées directement — plus de map `_PRESET_CINEMA` en JS.

| Preset | Notes | scanLines |
|---|---|---|
| ⭐ Défaut | Base neutre, pixelisation off | 0 |
| 🌫️ Brume côtière | Bleu-gris froid, brouillard dense | 0 |
| 🌑 Minuit | Quasi-monochrome (saturation 0.20) | 0 |
| 🍂 Automne | Rouge-orangé, +saturation palette | 0 |
| ☀️ Été vif | Vert vif, haute exposition | 0 |
| 📜 Vieux sépia | Couleurs lessivées (saturation 0.28) | 0 |
| 🌲 Forêt nordique | Froid, bleu-vert | 0 |
| 🏜️ Désert doré | Très jaune, vert presque absent | 0 |
| ⚫ Noir & Blanc | Palette 2 couleurs, pixel 3 | 1 |
| 🖥️ Apple II | Phosphore vert CRT, pixel 3 | 4 |
| PC CGA (4 couleurs) | Cyan/magenta/blanc/noir, pixel 3 | 4 |
| PC EGA (16 couleurs) | 16 couleurs adaptées jeu, pixel 3 | 4 |
| Amiga | 37 couleurs OCS, pixel 2 | 3 |

Presets retirés : Matin doré, Crépuscule, Clair de lune, Conte de fées.

---

## 16. Labels de zones (`tileLabels.js` + `waterZoneOverlay.js`)

Sprites canvas hexagonaux — ratio W/H = 2/√3 ≈ 1.155. Font **DeltaBlock** (`fonts/DeltaBlock-Regular.ttf`).

- Chargement garanti : `document.fonts.load('900 96px DeltaBlock')`.
- **Échelle proportionnelle par famille** : `rescaleZoneLabels(overlay)` — `factor = 1 + 0.35 * (value / maxOfType)`.
- LOD : `LOD_ZONE_LABEL_CULL_DISTANCE = 40.0`

---

## 17. InstancedMesh

`forestOverlay.js` (arbres), `fieldWaterEffectsOverlay.js` (fleurs/roseaux/champignons), `naturalPropsOverlay.js` (props naturels), `tileRailOverlay.js` (traverses) utilisent `THREE.InstancedMesh`. Pattern : collect matrices → build mesh.

Patch vent `stable/globalWind.js` requis pour `USE_INSTANCING`.

**Bottes de foin** (`naturalPropsOverlay.js`) : restent verticales (`alignToSlope: false`) mais reçoivent une compensation de pente `slopeSin × radius` via `getTerrainNormalAt`, pour que la face basse repose sur le point le plus bas de l'empreinte circulaire.

---

## 18. LOD

Seuils dans `variables.js` :

| Cible | Constante | Valeur |
|---|---|---|
| Plantes/fleurs/champignons | `LOD_MICRO_CULL_DISTANCE` | 6.6 |
| Plantes (végétation) | `LOD_PLANT_CULL_DISTANCE` | 5.6 |
| Blé (chunks) | `LOD_WHEAT_CULL_DISTANCE` | 6.6 |
| Rochers | `LOD_ROCK_CULL_DISTANCE` | 7.2 |
| Props village (bancs…) | `LOD_VILLAGE_PROP_CULL_DISTANCE` | 8.6 |
| Barques échouées | `LOD_SHORE_BOAT_CULL_DISTANCE` | 9.2 |
| Animaux | `LOD_ANIMAL_CULL_DISTANCE` | 9.6 |
| Fontaines | `LOD_FOUNTAIN_CULL_DISTANCE` | 9.8 |
| Bateaux animés | `LOD_BOAT_CULL_DISTANCE` | 10.3 (XZ seul) |
| Moulins | `LOD_MILL_CULL_DISTANCE` | 12.6 |
| Bâtiments | `LOD_HOUSE_CULL_DISTANCE` | 12.7 |
| Arbres | `LOD_TREE_CULL_DISTANCE` | 12.2 |
| Watchtowers | `LOD_WATCHTOWER_CULL_DISTANCE` | 13.2 |
| Rails | `LOD_RAIL_TRACK_CULL_DISTANCE` | 14.4 |
| Trains | `LOD_TRAIN_CULL_DISTANCE` | 9.9 |
| Labels zones | `LOD_ZONE_LABEL_CULL_DISTANCE` | 40.0 |

Test dans `animate()` bloc `(shadowRefreshFrame % 9) === 0`. Exception : après rebuild via `overlayRebuildQueue`, `lod()` est appelé immédiatement.

---

## 19. Pipeline perf — rebuild différé (`scene.js`)

**Différés** : `overlayRebuildQueue = new Map<name, {rebuild, lod}>()` — coalescing automatique, 1 overlay traité par frame.

**BFS ciblé waterZone** : `affectedHex` → BFS partiel sur 7 hexes. Full rebuild si `null` (undo, chargement, multijoueur).

---

## 20. Merge géométrique (`mergeGeometries`)

Pattern utilisé pour fusionner N objets identiques en 1 Mesh (1 DC). Import : `BufferGeometryUtils.js` (CDN Three.js r160).

**Traverses rail** : InstancedMesh partagé — 1 DC pour toutes les traverses.

**Poulets village** (`villageDecorOverlay.js`) : `_mergeVillageChickens(group)` — 57 DC → 1 DC.

**Piège InterleavedBufferAttributes** : GLBs exportés GLTF compact → `mergeGeometries` échoue. Désentrelacer via `attr.data.array[i * stride + offset + c]`. Three.js r160 **n'a pas de `getComponent(i, c)`**.

---

## 21. Système d'ombres

### Cycle (toutes les N frames)

- **Toutes les 120 frames** : `applySceneShadowFlags(scene)` (`stable/threeSetup.js`)
- **Toutes les 180 frames** : `rebuildShadowCasters(scene)` + `applyShadowCulling(focusPoint, maxDist)` (`stable/shadowCulling.js`)

### Pattern bâtiments / props GLB

Chaque bâtiment ou prop GLB utilise `_applySingleShadowCaster(root)` : sélectionne le mesh le plus grand (par nombre de triangles), lui seul a `castShadow=true`.

Lors de la création d'une instance :
```js
prototype.traverse(obj => {
  obj.userData.castShadowOriginal = obj.castShadow; // true pour le caster, false pour les autres
  obj.userData.shadowFlagsApplied = true;
});
```

### Restauration post-culling (fix juin 2026)

`applyShadowCulling` peut désactiver `castShadow` sur des bâtiments distants. `applySceneShadowFlags` restaure via `castShadowOriginal` :
```js
if (object.userData?.shadowFlagsApplied) {
  if (typeof object.userData.castShadowOriginal === 'boolean') {
    object.castShadow = object.userData.castShadowOriginal;
  }
  return;
}
// Pour les nouveaux meshes (ex: gares) : stocke castShadowOriginal au premier passage
object.castShadow = object.userData?.disableCastShadow ? false : true;
object.userData.castShadowOriginal = object.castShadow;
object.userData.shadowFlagsApplied = true;
```

Les gares (`prepareStationGlbPrototype`) ne pré-appliquent pas `shadowFlagsApplied` — elles sont traitées et mémorisées automatiquement au premier passage d'`applySceneShadowFlags`.

### Désactivation complète (oiseaux, InstancedMesh non-casters)
```js
mesh.castShadow = false;
mesh.userData.disableCastShadow  = true;
mesh.userData.shadowFlagsApplied = true;
// castShadowOriginal non défini → applySceneShadowFlags ne restaure rien
```

---

## 22. HUD Perf (`debugLightUi.js`)

`tickFps(renderer, scene, perfTiming?)` : scan toutes les 2s, refresh 500ms. Boutons bas-gauche : **F** (HUD perf), **CUSTOM** (CUSTOMISATION LUT+PIX — raccourci **C**).

Contenu HUD :
- FPS + indices 🎮 GPU% / ⚙️ CPU% inline
- Draw calls / Triangles / Textures / Shaders
- **Colonnes triables** par obj/DC/☂/▲
- **Catégories** : Forêt / Bâtiments / Nature / Animaux / Village / Transport / Eau / Terrain / Divers

---

## 23. Audio (`soundDesign.js`)

Sons spatiaux : forêt, village, plage/eau, bateau, train, corbeaux, musique. **Touche M** : coupe tout.

---

## 24. Architecture fichiers (principaux)

```
/
├── config.js / variables.js     Constantes
├── main.js                      Bootstrap
├── scene.js                     Orchestrateur
├── tileGenerator.js             Génération tuiles
├── tileMesh.js / tileTextures.js  Géométrie et textures
├── terrainHeight.js             Surface Y, relief, normale
├── tileRailOverlay.js           Rails procéduraux
├── tileRoadOverlay.js           Routes (désactivées — GLBs archivés)
├── railTrainOverlay.js          Trains GLB, wagons, gares
├── waterZoneOverlay.js          BFS zones eau, labels
├── waterBeachGeometry.js        Plages
├── waterBoatOverlay.js          Bateaux GLB
├── fieldWaterEffectsOverlay.js  Micro-props naturels
├── forestOverlay.js             Arbres InstancedMesh
├── houseOverlay.js              Village GLB
├── decorOverlay.js              Orchestrateur props décor
├── naturalPropsOverlay.js       Fleurs, rochers, roseaux, bottes de foin (InstancedMesh)
├── bonusCellChestOverlay.js     Coffres animés cellules bonus
├── villageDecorOverlay.js       Bancs, animaux, charrettes, tonneaux
├── houseVillageObjects.js       Maisons, tours, église
├── realisticWater.js            Shader eau (depth map)
├── visualEnvironment.js         LUT, lumières, environnement
├── debugLightUi.js              Panneau ÉTALONNAGE VISUEL + HUD perf
├── soundDesign.js               Audio spatial
│
└── stable/
    ├── hex.js / hexGeometry.js / tileUtils.js / zoneUtils.js
    ├── placementRules.js / scoring.js / gameRules.js
    ├── threeSetup.js / worldCurvature.js / postprocessHud.js
    ├── shadowCulling.js         Culling ombres par distance
    ├── terrainMerge.js          Fusion meshes terrain par biome
    ├── globalWind.js / starUniverse.js / cometSky.js
    ├── hashUtils.js / hexLabelFont.js
    ├── bonusCells.js / specialCells.js / highscore.js
    └── multiplayerClient.js / controls.js
```

---

## 25. Pièges connus

**Hexagone plat** — canvas labels : ratio W/H doit être 2/√3 ≈ 1.155.

**Font pas appliquée** — `hexFontReady` est async. URL **relative** (`./fonts/`) obligatoire.

**Hash procédural** — ne pas unifier les 3 précisions FNV-1a.

**`createOuterVertices`** — toujours passer `radius = HEX_SIZE * TILE_VISUAL.radiusScale`.

**`clone(true)` brise SkinnedMesh** — utiliser `cloneSkeleton` (SkeletonUtils).

**InterleavedBufferAttributes** — `mergeGeometries` échoue silencieusement. Three.js r160 n'a pas de `getComponent()`. Désentrelacer via `attr.data.array[i * stride + offset + c]`.

**GLB Z-up** — `correctionX: Math.PI/2` dans PROP_MODEL_DEFS, appliqué *avant* calcul Box3.

**Dithering palette rétro** — saturation/vibrance élevée → bruit de speckle. Presets rétro : `saturation: 1.0, vibrance: 0.0, normalEdgeStrength: 0, depthEdgeStrength: 0` obligatoires.

**colorGradingPass** — toujours passer par `composer.render()`. `renderer.render()` direct bypasse l'étalonnage.

**Depth map eau** — arête→voisin : `EDGE_ORDER[i]` face à `_HEX_DIRS[(6-i)%6]` (pas `(i+1)%6`).

**Sons train** — déclencher sur train GLB réel, pas sur secteur rail.

**Shadow culling** — ne pas définir `castShadowOriginal` sur les meshes à ombres volontairement désactivées (oiseaux, etc.) : `applySceneShadowFlags` ne restaure que si `typeof castShadowOriginal === 'boolean'`.

---

## 26. Philosophie

1. Ne pas casser la grille.
2. Ne pas casser le gameplay validé.
3. Modifications minimales et chirurgicales.
4. Pas d'usine à gaz.
