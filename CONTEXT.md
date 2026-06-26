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
- `getTerrainNormalAt(...)` → normale surface
- `placeObjectOnTerrain(object, point, type, salt)` → position + orientation
- Relief procédural : somme sinus + bruit FNV-1a, désactivable par biome

---

## 9. Overlays visuels

Cycle : `createXxxOverlay()` → `rebuildXxxOverlay(group, placedTiles)` → `updateXxxOverlay(group, time)`. Orchestré par `scene.js`.

| Fichier | Contenu |
|---|---|
| `waterZoneOverlay.js` | BFS zones eau, hover, labels valeur |
| `waterBeachGeometry.js` | Plages procédurales (v2 — strip quads 2▲/segment) |
| `waterZoneBoundary.js` | Halos/contours de zone |
| `waterBoatOverlay.js` | Bateaux GLB animés, graphe nav |
| `fieldWaterEffectsOverlay.js` | Fleurs, roseaux, champignons, oiseaux, rochers |
| `forestOverlay.js` | Arbres GLB (InstancedMesh) |
| `houseOverlay.js` | Maisons, église, cimetière, tours de guet |
| `tileRailOverlay.js` | Rails procéduraux, traverses, ballast |
| `railTrainOverlay.js` | Trains GLB, wagons (couleurs bois/métal/tissu) |
| `tileRoadOverlay.js` | **Routes désactivées** — GLBs archivés (.bak) |
| `decorOverlay.js` | Orchestrateur props : moulins, tonneaux, bancs, fontaines... |

---

## 10. Modèles GLB

Chargés via `GLTFLoader`. Pattern : prototype singleton, clone à chaque rebuild. GLBs animés : `cloneSkeleton` (SkeletonUtils) — **jamais `clone(true)`** (brise SkinnedMesh).

**`decorOverlay.js`** est l'orchestrateur centralisé des props. `PROP_MODEL_DEFS` tableau `{ key, url, target, mode, correctionX?, sinkDepth? }`. `correctionX: Math.PI/2` pour GLB exportés Z-up (ex. moulin-2).

### Pools actifs (juin 2026)

**Maisons** (`houseVillageObjects.js`) — 3 variantes, maison-1 retirée (8 911 tris) :
```js
{ key: 'maison-2', spawnWeight: 55 }
{ key: 'maison-3', spawnWeight: 30 }
{ key: 'maison-4', spawnWeight: 15 }
```

**Arbres** (`forestOverlay.js`) — 4 espèces, oak_round + dead retirés (~10k tris/instance) :
```js
TREE_MODEL_DEFS = [ birch, bushy_mini, pine_soft, poplar ]
```

**Watchtowers** — 3 variantes, watchtower-2/3/6 retirées :
```js
{ key: 'watchtower-1', spawnWeight: 10 }
{ key: 'watchtower-4', spawnWeight: 30 }
{ key: 'watchtower-5', spawnWeight: 30 }
```

### Tailles modèles clés

- `HOUSE_SCALE = HEX_SIZE * 0.1332 * 0.93`
- Église : `4.5 * 0.93`
- `BARREL_TARGET_WIDTH = HEX_SIZE * 0.1031 * 0.85`
- `BOAT_TARGET_LENGTH = 0.735 * 0.88 * 0.92`
- `NATURAL_FLOWER_TARGET_WIDTH` : cumulatif −12% (v0.8)
- `ANIMAL_CHICKEN_TARGET_WIDTH` : +10% (v0.8)
- `ANIMAL_CAT_TARGET_WIDTH` : +7% (v0.8)

### Routes — désactivées temporairement

`createRoadCenterOverlay` retourne `null`. `stone-road-droite.glb` et `stone-road-curve60.glb` archivés en `.glb.bak`. Raison : ces GLBs utilisent des `InterleavedBufferAttributes` incompatibles avec `mergeGeometries` (Three.js r160). À reprendre quand les GLBs seront remplacés par des meshes lowpoly à attributs standard.

### Architecture future — GLB packs et thèmes/biomes

Inspiré de `plantes.glb` (accès par index dans un pack multi-mesh) : regrouper les habitations dans des fichiers pack par thème/biome.

Structure cible :
```
/glb/habitations/
  medieval/pack-habitations.glb      ← variante actuelle
  neige/pack-habitations.glb         ← futur
  desert/pack-habitations.glb        ← futur
  ...
```

Avantages : 1 seul chargement GLB par biome → fort gain DC et VRAM (partage matériaux), sélection par index plutôt que par URL. Même logique déjà fonctionnelle avec `plantes.glb`.

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
- `threeSetup.js` : `createRenderer`, `createCamera`, `createPixelPostprocess`, `updateWorldCurvedSprites`
- `hexLabelFont.js` : `HEX_FONT_FAMILY`, `sharedLabelCache`, `hexFontReady` (Promise FontFace DeltaBlock)

---

## 13. Configuration (`variables.js` / `config.js`)

`config.js` = `export * from './variables.js'`. Constantes critiques :
- `HEX_SIZE = 1`, `EDGE_ORDER = ['n','ne','se','s','sw','nw']`, `SECTOR_DEFS`
- `TILE_VISUAL` : `radiusScale`, `waterY`, `railSurfaceY`, `tileThickness`
- `TERRAIN_RELIEF`, `EDGE_COLOR`, `EDGE_WEIGHTS`

---

## 14. Rendu et post-processing

Pipeline Three.js r160 : `RenderPixelatedPass → ShaderPass(COLOR_GRADING_SHADER) → OutputPass` via `EffectComposer`.

`colorGradingPass` toujours actif — quand pixelisation off, `pixelPass` neutralisé (size=1, strengths=0) mais composer tourne quand même. `debugLightUi.js` (bouton bas-gauche, panel bas-droite) applique `applyColorGradingUniforms` à chaque slider. Préférences persistées en localStorage (`hexistenz_lut_v1`).

LUT defaults (juin 2026) : `toneMappingExposure: 2.40`, `brightness: 0.000`, `contrast: 1.020`, `saturation: 1.02`, `vibrance: 0.10`, `gamma: 1.030`, `sunIntensity: 2.15`, `hemisphereIntensity: 0.38`.

**Quantification palette rétro** (`visualEnvironment.js`) : uniforms `uPaletteColors[32]` + `uPaletteSize` + `uPaletteDither`. Comparaison en espace sRGB (raw hex parsing — **ne pas passer par `new THREE.Color()`**). `paletteDither = 0.7` pour NB/CGA/EGA, `0.5` pour Amiga.

**Dithering couleur-hash** (pas Bayer) : `RenderPixelatedPass` garantit que tous les pixels d'un même bloc ont la même couleur → `hash(color)` identique → décision uniforme par bloc. Quantification 8 bits avant le hash. **Ne pas revenir au Bayer** : grille secondaire visible à l'intérieur des blocs.

**Monkey-patch `RenderPixelatedPass`** (`stable/threeSetup.js`) : r160 rend la scène deux fois. Le patch surcharge `pixelPass.render` pour sauter le rendu normals quand `normalEdgeStrength < 0.005`.

**SHIFT+Espace — super-immersif** : active `gridOnlyMode` ET masque tous les HUDs via `body.huds-force-hidden`. `toggleGridOnlyMode(false)` retire le class automatiquement.

---

## 15. Labels de zones (`tileLabels.js` + `waterZoneOverlay.js`)

Sprites canvas hexagonaux — ratio W/H = 2/√3 ≈ 1.155. Font **DeltaBlock** (`fonts/DeltaBlock-Regular.ttf`).

- Chargement garanti : `document.fonts.load('900 96px DeltaBlock')` (unique API garantissant la dispo canvas). URL **relative** (`./fonts/`) obligatoire.
- Texte : `ctx.font = '900 130px DeltaBlock'`, `ctx.letterSpacing = '7px'` (multi-chars).
- **Échelle proportionnelle par famille** : `rescaleZoneLabels(overlay)` — `factor = 1 + 0.35 * (value / maxOfType)`.
- LOD : `LOD_ZONE_LABEL_CULL_DISTANCE = 40.0`

---

## 16. InstancedMesh

`forestOverlay.js` (arbres) et `fieldWaterEffectsOverlay.js` (fleurs/roseaux/champignons) et `tileRailOverlay.js` (traverses) utilisent `THREE.InstancedMesh`. Pattern : collect matrices → build mesh.

Patch vent `stable/globalWind.js` requis pour `USE_INSTANCING` :
```glsl
#ifdef USE_INSTANCING
  vec4 gwWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
#else
  vec4 gwWorld = modelMatrix * vec4(position, 1.0);
#endif
```

---

## 17. LOD

Seuils dans `variables.js` (−8% par rapport aux valeurs v0.8 — ×0.92, juin 2026) :

| Cible | Constante | Valeur |
|---|---|---|
| Plantes/fleurs/champignons | `LOD_MICRO_CULL_DISTANCE` | 6.6 |
| Plantes (végétation) | `LOD_PLANT_CULL_DISTANCE` | 5.6 |
| Blé (chunks) | `LOD_WHEAT_CULL_DISTANCE` | 6.6 |
| Panneaux | `LOD_SIGN_CULL_DISTANCE` | 7.9 |
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
| Corbeaux | `LOD_CROW_CULL_DISTANCE` | 9.7 |
| Labels zones | `LOD_ZONE_LABEL_CULL_DISTANCE` | 40.0 |

Test dans `animate()` bloc `(shadowRefreshFrame % 9) === 0`. Exception : après un rebuild via `overlayRebuildQueue`, `lod()` est appelé **immédiatement** dans le même frame.

---

## 18. Pipeline perf — rebuild différé (`scene.js`)

**Différés** : `overlayRebuildQueue = new Map<name, {rebuild, lod}>()` — coalescing automatique, 1 overlay traité par frame.

| Clé queue | rebuild | lod |
|---|---|---|
| `'rail'` | `rebuildRailTrainOverlay` | `updateRailTrainLOD` |
| `'boat'` | `rebuildWaterBoatOverlay` | `updateWaterBoatLOD` |
| `'wheat'` | `rebuildFieldWheatOverlay` | `updateFieldWheatLOD` |
| `'forest'` | `rebuildForestOverlay` | `updateForestLOD` |
| `'house'` | `rebuildHouseOverlay` | `updateHouseLOD` |
| `'decor'` | `rebuildDecorOverlay` | `updateNaturalPropsLOD` + `updateFieldDecorLOD` |

**BFS ciblé waterZone** : `affectedHex` → BFS partiel sur 7 hexes. Full rebuild si `null` (undo, chargement, multijoueur).

---

## 19. Merge géométrique (`mergeGeometries`)

Pattern utilisé pour fusionner N objets identiques en 1 Mesh (1 DC). Import : `BufferGeometryUtils.js` (CDN Three.js r160).

**Traverses rail** (`tileRailOverlay.js`) : InstancedMesh partagé entre tiles — 1 DC pour toutes les traverses.

**Poulets village** (`villageDecorOverlay.js`) : `_mergeVillageChickens(group)` appelée à la fin de `createRoadsideVillageProps`. Fusionne tous les `'village-animal-chicken-glb'` en 1 Mesh centré sur le centroïde (pour que `child.position` reste valide pour le scan LOD). Résultat : **57 DC → 1 DC**.

**Piège InterleavedBufferAttributes** : les GLBs exportés en GLTF compact ont des attributs entrelacés. `mergeGeometries` ne les supporte pas (`mergeAttributes() failed`). Solution : `_deinterleaveGeo(src)` — accès direct via `attr.data.array`, `attr.data.stride`, `attr.offset`. Three.js r160 **n'a pas de `getComponent(i, c)`** — erreur si utilisé.

**Piège routes** : `stone-road-*.glb` utilisent aussi des InterleavedBufferAttributes → routes désactivées (voir §10).

---

## 20. Audio (`soundDesign.js`)

Sons spatiaux : forêt, village, plage/eau, bateau, train, corbeaux, musique. Sons train : uniquement à la présence d'un train GLB réel. **Touche M** : `toggleMute(ambientSoundDesign)` coupe tout.

---

## 21. Architecture fichiers (principaux)

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
├── railTrainOverlay.js          Trains GLB, wagons
├── waterZoneOverlay.js          BFS zones eau, labels
├── waterBeachGeometry.js        Plages (v2 strip quads)
├── waterBoatOverlay.js          Bateaux GLB
├── fieldWaterEffectsOverlay.js  Micro-props naturels
├── forestOverlay.js             Arbres InstancedMesh
├── houseOverlay.js              Village GLB
├── decorOverlay.js              Orchestrateur props décor
├── fieldZonesOverlay.js         Moulins, drapeaux, oiseaux
├── naturalPropsOverlay.js       Fleurs, rochers, roseaux (InstancedMesh)
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
    ├── terrainMerge.js          Fusion meshes terrain par biome
    ├── globalWind.js / starUniverse.js / cometSky.js
    ├── hashUtils.js / hexLabelFont.js
    ├── bonusCells.js / specialCells.js / highscore.js
    └── multiplayerClient.js / controls.js
```

---

## 22. État perf (juin 2026)

**Cible actuelle** : ~35 FPS, GPU-bound (render ~28ms / 16.7ms budget).

| Catégorie | DC | État |
|---|---|---|
| Forêt (4 espèces) | ~12 | ✅ InstancedMesh |
| Traverses | 17 | ✅ InstancedMesh |
| Poulets village | 1 | ✅ mergeGeometries |
| Poulets champ | 2 | ✅ InstancedMesh |
| Routes | 0 | ⏸️ désactivées |
| Maison-2 | ~93 | ⚠️ 3 mat/maison → atlas Blender |
| Maison-3 | ~72 | ⚠️ idem |
| Tours de guet | ~18 | ⚠️ ~4 700 tris/instance |
| Trains | ~144 | ⚠️ architecture CSS/SVG à remplacer par GLB InstancedMesh |
| Eau (filets+brume+gouttes) | ~240 | ⚠️ 1 obj = 1 DC |
| Voies ferrées | ~91 | ⚠️ à merger comme les traverses |

**Ombres** : `applySceneShadowFlags` (toutes les 20 frames) — verrouillage :
```js
mesh.castShadow = false;
mesh.userData.disableCastShadow  = true;   // lu par applySceneShadowFlags
mesh.userData.shadowFlagsApplied = true;   // skip au prochain passage
```
`_applySingleShadowCaster(root)` : 1 caster par GLB bâtiment (le mesh le plus grand).

---

## 23. HUD Perf (`debugLightUi.js`)

`tickFps(renderer, scene, perfTiming?)` : scan toutes les 2s, refresh 500ms. Boutons bas-gauche : **F** (HUD), **P** (pixelisation), **L** (LUT).

Contenu HUD :
- FPS + indices 🎮 GPU% / ⚙️ CPU% inline
- Draw calls / Triangles / Textures / Shaders
- **Colonnes triables** par obj/DC/☂/▲
- **Catégories** : Forêt / Bâtiments / Nature / Animaux / Village / Transport / Eau / Terrain / Divers

Classification : `_traverseNode` distingue InstancedMesh (préfixe nom), GLB Group (substring), Mesh ordinaire (biome/effet). `_TREE_SPECIES_MAP` : `{ birch, bushy_mini, pine_soft, poplar }` (oak_round + dead retirés).

---

## 24. Pièges connus

**Hexagone plat** — canvas labels : ratio W/H doit être 2/√3 ≈ 1.155.

**Font pas appliquée** — `hexFontReady` est async. Sans `.then(() => texture.needsUpdate = true)`, le cache garde la version system-ui. URL **relative** (`./fonts/`) obligatoire.

**Hash procédural** — ne pas unifier les 3 précisions FNV-1a.

**`createOuterVertices`** — toujours passer `radius = HEX_SIZE * TILE_VISUAL.radiusScale`.

**`clone(true)` brise SkinnedMesh** — utiliser `cloneSkeleton` (SkeletonUtils).

**InterleavedBufferAttributes** — `mergeGeometries` échoue silencieusement. Three.js r160 n'a pas de `getComponent()`. Désentrelacer via `attr.data.array[i * stride + offset + c]`.

**GLB Z-up** — `correctionX: Math.PI/2` dans PROP_MODEL_DEFS, appliqué *avant* calcul Box3.

**BFS fieldWaterEffects** — `getTextureNeighbors` simplifié (pas d'adjacence intra-tuile) — intentionnel.

**Charrettes** — vérifier absence arête `water`/`rail` avant placement.

**Sons train** — déclencher sur train GLB réel, pas sur secteur rail.

**Dithering palette rétro** — saturation/vibrance élevée → bruit de speckle. Presets rétro : `saturation: 1.0, vibrance: 0.0` obligatoire.

**`normalEdgeStrength`/`depthEdgeStrength` presets rétro** — mettre à `0`. `RenderPixelatedPass` dessine sinon des contours 1px parasites.

**colorGradingPass** — toujours passer par `composer.render()`. `renderer.render()` direct bypasse l'étalonnage.

**Depth map eau** — arête→voisin : `EDGE_ORDER[i]` face à `_HEX_DIRS[(6-i)%6]` (pas `(i+1)%6`).

**LUT panel CSS** — `pointer-events: none` sur `.debug-light-panel` ; `pointer-events: auto` sur toggle et body uniquement.

**SHIFT+Espace** — entre en super-immersif. Regular Espace ne déclenche plus si `event.shiftKey`. `toggleGridOnlyMode(false)` retire `body.huds-force-hidden`.

---

## 25. Philosophie

1. Ne pas casser la grille.
2. Ne pas casser le gameplay validé.
3. Modifications minimales et chirurgicales.
4. Pas d'usine à gaz.
