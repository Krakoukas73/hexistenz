# CONTEXT.md — Hexistenz

## 1. Nature du projet

Hexistenz est un jeu web de pose de tuiles hexagonales inspiré de Dorfromantik.

Le joueur pioche une tuile, la tourne, puis la pose sur une grille hexagonale. Chaque tuile est divisée en 6 secteurs triangulaires correspondant aux 6 directions d'un hexagone. Ces secteurs portent un biome ou un réseau : prairie, forêt, champ, village, eau, rail.

L'objectif est de construire une carte cohérente, connecter les biomes, compléter des missions, exploiter les cellules bonus et maximiser le score.

Stack technique volontairement minimal :

- JavaScript ES Modules natifs, sans bundler, sans transpileur.
- Three.js r160 chargé depuis CDN (`https://cdn.jsdelivr.net/npm/three@0.160.0/...`).
- PHP minimal pour highscores, multiplayer et services simples.
- JSON comme stockage.
- Pas de framework JS, pas de base SQL.

---

## 2. Coordonnées hexagonales

La grille utilise des **coordonnées axiales (q, r)** — un système à deux axes obliques standard pour les grilles hexagonales.

Conversions clés dans `stable/hex.js` :
- `axialToWorld(q, r)` → `{ x, y, z }` Three.js. Formule : `x = HEX_SIZE * 1.5 * q`, `z = HEX_SIZE * √3 * (r + q/2)`.
- `worldToAxial(x, z)` → `{ q, r }` avec arrondi cube correct.
- `makeHexKey(q, r)` → clé string `"q,r"` utilisée comme clé de Map pour `placedTiles`.

Les 6 directions voisines sont définies dans `HEX_DIRECTIONS` (`stable/placementRules.js`) avec leur arête correspondante (`n`, `ne`, `se`, `s`, `sw`, `nw`).

---

## 3. Structure d'une tuile

```js
{
  id: string,           // identifiant unique
  edges: {              // 6 secteurs indexés par direction
    n:  { type: 'grass', value: 1 },
    ne: 'water',        // peut être string ou objet
    se: { type: 'field', value: 3 },
    s:  'rail',
    sw: 'forest',
    nw: 'house'
  },
  center: 'grass',      // biome majoritaire, relie les secteurs via le centre
  rotation: 0           // 0-5 crans de 60°
}
```

Helpers dans `tileGenerator.js` :
- `getEdgeType(edge)` → string du biome (supporte string ou objet).
- `getEdgeValue(edge)` → valeur numérique du secteur (1 par défaut).
- `cloneEdge(edge)` → copie sûre préservant type + value.
- `generateTile()` → crée une tuile avec respect des contraintes réseau.
- `rotateTile(tile, steps)` → rotation immuable, préserve type+value ensemble.

Un `placedTile` est une tuile effectivement posée sur la grille :
```js
{
  tile: Tile,   // la tuile brute
  q: number,    // coordonnée axiale
  r: number,
  key: string   // makeHexKey(q, r)
}
```

`placedTiles` est une `Map<string, placedTile>` passée en paramètre à presque toutes les fonctions.

---

## 4. Types de biomes (EDGE_TYPES)

```
grass   → prairie (transition neutre)
field   → champ de blé (valeur variable, animation vent)
forest  → forêt (densité arbres, GLB)
house   → village (GLB maisons, fumée, bâtiments spéciaux)
water   → eau/rivière (plage, bateaux, sons)
rail    → voie ferrée (rails procéduraux, trains GLB)
```

Les biomes `water` et `rail` sont des **réseaux** (`NETWORK_EDGE_TYPES`) : ils doivent former des continuités. La génération (`tileGenerator.js`) applique `enforceNetworkContinuity` pour garantir que chaque réseau a au moins deux arêtes connectées ou forme une terminaison valide.

---

## 5. Boucle de jeu

1. Tuile courante affichée + tuile suivante prévisualisée.
2. Joueur choisit une cellule disponible et tourne la tuile.
3. Validation de placement (`canPlaceTileAt`, `getPlacementValidation`).
4. Pose → score calculé (`calculatePlacementScore` in `stable/scoring.js`).
5. Missions progressent (`advanceMissionTurn`, `maybeGenerateMissionForTile`).
6. Bonus vérifiés (`stable/bonusCells.js`, `stable/specialCells.js`).
7. Overlays visuels reconstruits (voir §9).
8. Grille étendue si nécessaire (`ensureGridCellsAroundHex`).
9. Tuile suivante devient courante.

---

## 6. Règles de placement

Module : `stable/placementRules.js`

Conditions de placement valide :
- Cellule dans la grille active.
- Cellule non occupée.
- Au moins une arête adjacente à une tuile existante (sauf premier placement).
- Pas de conflit réseau : si une arête voisine est `water` ou `rail`, la nouvelle tuile doit avoir le même type en face (ou une terminaison valide).

Fonction centrale : `getPlacementValidation(hex, placedTiles, tile, specialCells)` retourne `{ valid, reason, conflicts }`.

`getOppositeEdge(edge)` retourne le nom de l'arête opposée : `n`↔`s`, `ne`↔`sw`, `se`↔`nw`.

---

## 7. BFS de zones (flood-fill biome)

Le jeu regroupe les secteurs contigus de même biome en **zones**. Ces zones servent à : rendre les plages, placer les bateaux, compter les missions, afficher les labels, orienter les overlays visuels.

### Algorithme commun (`stable/zoneUtils.js`)

```js
collectZone(startTile, startEdge, type, placedTiles, visited, getNeighborsFn)
// → { type, sectors: [{ tile, edge }], total }
```

BFS iteratif sur une pile. Chaque nœud est un `{ tile, edge }`. La clé de nœud est `makeNodeKey(tile.key, edge)` = `"q,r:direction"`.

**Deux variantes de voisinage :**

`getFullTextureNeighbors` (waterZoneOverlay, missions) :
1. Secteurs de même type sur la même tuile reliés via le `center`.
2. Secteurs contigus (prev/next dans EDGE_ORDER).
3. Secteur opposé sur la tuile hexagonale voisine.

`getTextureNeighbors` local (fieldWaterEffectsOverlay) :
1. Secteurs reliés via le `center`.
2. Secteur opposé sur la tuile voisine.
— Pas d'adjacence intra-tuile via EDGE_ORDER : les zones champ se propagent uniquement par le centre et les voisins hexagonaux.

`collectWaterZone` (waterBoatOverlay) :
- Variante autonome spécifique à `water` : utilise `isWaterEdge` et ne calcule pas de `total`.

### Où chaque fichier utilise le BFS

| Fichier | Fonction locale | Utilise |
|---|---|---|
| `waterZoneOverlay.js` | `collectTextureZone` | `collectZone` + `getFullTextureNeighbors` |
| `missions.js` | `collectTextureZone` | `collectZone` + `getFullTextureNeighbors` |
| `fieldWaterEffectsOverlay.js` | `collectTextureZone` | `collectZone` + local `getTextureNeighbors` |
| `waterBoatOverlay.js` | `collectWaterZone` | BFS autonome (eau uniquement) |
| `houseOverlay.js` | `collectHouseZone` | BFS autonome (villages) |

---

## 8. Système de terrain et hauteur (`terrainHeight.js`)

Chaque biome a une hauteur de surface différente (`BIOME_HEIGHT_RATIO`, `THIN_BIOME_DEPTH_RATIO` in `variables.js`).

Fonctions exportées principales :
- `getTerrainSurfaceY(point, type, salt, options)` → Y monde d'un point sur une tuile.
- `getTerrainNormalAt(point, type, salt, options)` → normale de surface pour orienter les objets.
- `placeObjectOnTerrain(object, point, type, salt, options)` → positionne + oriente un objet 3D.
- `getRailCenterY(point, salt)` / `getTrainRailY(point, salt)` → Y rail selon le relief.

Le relief procédural (`TERRAIN_RELIEF` in config) est généré via une somme de sinus + bruit FNV-1a. Il est désactivable par biome.

---

## 9. Overlays visuels

Les overlays sont des `THREE.Group` indépendants ajoutés à la scène au-dessus des tuiles. Chacun est responsable d'un aspect visuel d'un biome ou réseau.

### Cycle de vie d'un overlay

```
createXxxOverlay()         → crée le Group vide, l'ajoute à la scène
rebuildXxxOverlay(group, placedTiles)  → reconstruit entièrement au placement
updateXxxOverlay(group, time)          → animation en temps réel (animate loop)
```

`scene.js` orchestre tous les overlays. À chaque placement, il appelle les `rebuild` nécessaires. Dans la boucle d'animation, il appelle les `update`.

### Overlays actifs

| Fichier | Biome | Contenu |
|---|---|---|
| `waterZoneOverlay.js` | eau + hover | API publique, BFS zone, hover, labels valeur |
| `waterBeachGeometry.js` | eau | Plages procédurales (géométrie seulement) |
| `waterZoneBoundary.js` | eau + hover | Halos et contours de zone, couleur de zone |
| `waterBoatOverlay.js` | eau | Bateaux GLB animés, graphe de navigation |
| `fieldWaterEffectsOverlay.js` | champ + eau bord | Fleurs, roseaux, champignons, oiseaux GLB animés, rochers |
| `forestOverlay.js` | forêt | Arbres GLB (bouleaux + mixte), placement procédural |
| `houseOverlay.js` | village | Maisons GLB, église, cimetière, tour de guet |
| `tileRailOverlay.js` | rail | Rails procéduraux, traverses, ballast |
| `railTrainOverlay.js` | rail | Trains GLB, wagons, réseau ferré, sons |

### Règle de performance

Ne pas reconstruire tous les overlays à chaque placement. Chaque `rebuild` reçoit `placedTiles` complet, mais doit être rapide. Les géométries Three.js et les matériaux sont déposés (`dispose`) dans `clearGroup` avant reconstruction.

---

## 10. Modèles GLB

Chargés via `GLTFLoader` (`three@0.160.0/examples/jsm/loaders/GLTFLoader.js`).

Pattern de chargement (exemple maisons) :
```js
let prototype = null;
function ensureModels(group) {
  if (prototype) return; // déjà chargé
  loader.load(url, gltf => {
    prototype = preparePrototype(gltf.scene, def);
    rebuildIfReady(group);
  });
}
// Au rebuild : clone prototype, normalise scale/pivot, place sur terrain.
```

Modèles connus : `bateau.glb`, `train.glb`, `wagon.glb`, `maison*.glb`, `church.glb`, `watchtower.glb`, `cemetery.glb`, `birch*.glb`, oiseaux (dans fieldWaterEffectsOverlay).

Avant d'utiliser un GLB : vérifier existence, orientation, échelle, pivot, hauteur terrain (`terrainHeight.js`), animations éventuelles.

---

## 11. Hash procédural (FNV-1a)

Utilisé pour le placement déterministe : mêmes coordonnées → même résultat visuel.

Trois variantes de précision dans `stable/hashUtils.js` (ne pas les unifier — changer la précision change le placement visuel) :

| Export | Formule | Usage |
|---|---|---|
| `hashUnitFull(text)` | `fnv1a / 4294967295` | forestOverlay, tileRailOverlay |
| `hashUnit100k(text)` | `(fnv1a % 100000) / 100000` | houseOverlay, waterBoatOverlay |
| `hashUnit10k(text)` | `(fnv1a % 10000) / 10000` | fieldWaterEffectsOverlay, railTrainOverlay |
| `hashNumber(value)` | `fnv1a brut (uint32)` | forestOverlay, fieldWaterEffectsOverlay, tileRailOverlay |

---

## 12. Géométrie hexagonale partagée

`stable/hexGeometry.js` exporte `createOuterVertices(radius)` — génère les 6 sommets du contour hexagonal :
```js
for i in 0..5: { x: cos(π/3 * i) * radius, z: sin(π/3 * i) * radius }
```

Le paramètre `radius` doit toujours être passé explicitement depuis les overlays qui utilisent `HEX_SIZE * TILE_VISUAL.radiusScale` (≠ `HEX_SIZE` par défaut).

---

## 13. Utilitaires partagés (`stable/`)

### `stable/tileUtils.js`
- `makeNodeKey(tileKey, edge)` → `"q,r:direction"` — clé de nœud BFS.
- `getTileEdgeType(placedTile, edge)` → type string du secteur.
- `getTileCenterType(placedTile)` → biome du centre, ou `null`.
- `clearGroup(group)` → vide un `THREE.Group` en disposant géométries et matériaux.
- `smoothstep(edge0, edge1, value)` → interpolation cubique clampée.

### `stable/zoneUtils.js`
- `collectZone(...)` → BFS flood-fill générique (voir §7).
- `getFullTextureNeighbors(...)` → adjacences complètes (centre + intra-tuile + cross-tuile).

### `stable/hashUtils.js`
Trois variantes FNV-1a (voir §11).

### `stable/hexGeometry.js`
`createOuterVertices(radius)` (voir §12).

### `stable/hex.js`
`axialToWorld`, `worldToAxial`, `makeHexKey`, `createHexFill`.

### `stable/placementRules.js`
`canPlaceTileAt`, `getPlacementValidation`, `HEX_DIRECTIONS`, `getOppositeEdge`, `setPlacementGridKeys`.

### `stable/scoring.js`
`calculatePlacementScore` — arêtes compatibles, réseaux, tuile entourée.

### `stable/worldCurvature.js`
Courbure du monde (mode platiste vs bouliste). `getWorldCurvatureDrop`, `markNoWorldCurvature`.

### `stable/threeSetup.js`
`createRenderer`, `createCamera`, `createPixelPostprocess` (EffectComposer + RenderPixelatedPass + OutputPass), `updateWorldCurvedSprites`.

---

## 14. Configuration centrale (`config.js` / `variables.js`)

`config.js` ne fait que `export * from './variables.js'`. Tout est dans `variables.js`.

Constantes critiques (ne pas renommer les clés) :
- `HEX_SIZE = 1` — taille logique d'un hex Three.js. Tout le monde 3D en dépend.
- `EDGE_ORDER = ['n', 'ne', 'se', 's', 'sw', 'nw']` — ordre canonique des 6 arêtes. Ne pas modifier.
- `SECTOR_DEFS` — définit `a` et `b` (indices de sommets) pour chaque secteur.
- `TILE_VISUAL` — `radiusScale`, `centerRadiusScale`, `waterY`, `railSurfaceY`, `tileThickness`, `sectorY`.
- `TERRAIN_RELIEF` — `enabled`, `baseAmplitude`, `typeAmplitude`, `edgeFadeStart`, `segments`, `innerSegments`.
- `EDGE_COLOR` — couleurs Three.js par biome (format `0xRRGGBB`).
- `EDGE_WEIGHTS` — poids génération aléatoire des biomes.

---

## 15. Rendu et post-processing

Three.js r160, WebGL renderer, ombres optionnelles.

Pipeline : `RenderPixelatedPass` → `OutputPass` via `EffectComposer`.

Le HUD post-processing (`stable/postprocessHud.js`) expose des sliders pour : luminosité, contraste, saturation, vibrance, teinte, gamma, noirs, blancs, canaux RGB, force palette, mode monde. C'est un LUT maison via uniforms shader.

Modes monde :
- **Platiste** : grille plane standard.
- **Bouliste** : courbure appliquée via `worldCurvature.js` — les tuiles semblent poser sur une planète. Sprites et labels doivent utiliser `markNoWorldCurvature` pour rester plats.

---

## 16. Score

`stable/scoring.js` — `calculatePlacementScore(hex, placedTiles, tile, specialCells)` :
- `+2` par tuile posée.
- `+10` par arête compatible (biome identique en face).
- `+25` par arête réseau compatible (`water` ou `rail`).
- `+50` si la tuile est entourée de 6 voisins.
- Bonus cellules spéciales.

---

## 17. Missions

`missions.js` — objectifs dynamiques générés pendant la partie.

Types de missions : zone eau, forêt, champ, village, rail, trains, bateaux.

Le BFS `collectTextureZone` (via `collectZone` de `zoneUtils.js`) comptabilise la taille totale des zones pour chaque mission.

Récompenses : `MISSION_REWARD = 100` points + `MISSION_TILE_REWARD = 3` tuiles supplémentaires.

Les missions ont un seuil croissant. `maybeGenerateMissionForTile` génère une mission à la pose si les conditions sont réunies (probabilité `MISSION_CHANCE = 0.20`).

---

## 18. Audio (`soundDesign.js`)

Son spatialisé selon la carte. Sons connus : forêt, village, plage/eau, bateau, train, corbeaux, musique menu, musique ingame.

Règle importante : les sons train ne se déclenchent qu'à la présence réelle d'un train (objet GLB existant), pas d'un simple secteur rail.

**Touche M** — `toggleMute(ambientSoundDesign)` (exportée depuis `soundDesign.js`) coupe/rétablit tous les sons (musique HTML Audio + ambiance THREE.Audio). `AmbientSoundDesign.setMuted(bool)` force immédiatement les volumes à 0 et court-circuite `update()` tant que muet.

---

## 19. Multiplayer

Architecture HTTP polling (pas de WebSocket). Backend PHP (`multiplayer.php`), stockage JSON (`/games`). Client : `stable/multiplayerClient.js` + `multiplayerUi.js`. Room code partagé, synchronisation de l'état de carte, curseurs des joueurs.

---

## 20. Highscores

`highscore.php` + `highscores.json` + `stable/highscore.js`. Pas de compte joueur, pas de SQL. Envoi en fin de partie, tri et affichage public.

---

## 21. Architecture fichiers

```
/
├── index.php               Point d'entrée HTML
├── config.js               Re-export de variables.js (alias historique)
├── variables.js            Toutes les constantes réglables du jeu
├── main.js                 Bootstrap : options, init scène
├── scene.js                Orchestrateur : état jeu, boucle, overlays, UI
├── tileGenerator.js        Génération et rotation de tuiles
├── tileMesh.js             Géométrie 3D des tuiles (maillage sectorisé)
├── tileTextures.js         Textures procédurales par biome
├── terrainHeight.js        Surface Y, relief, normale terrain, placement objets
├── tileRailOverlay.js      Rails procéduraux, traverses, ballast
├── railTrainOverlay.js     Trains GLB, wagons, animation réseau ferré
├── waterZoneOverlay.js     API zone eau : BFS, hover, labels
├── waterBeachGeometry.js   Géométrie plage procédurale
├── waterZoneBoundary.js    Halos et contours de zone, couleur
├── waterBoatOverlay.js    Bateaux GLB, graphe navigation eau
├── fieldWaterEffectsOverlay.js  Fleurs, roseaux, oiseaux, champignons, rochers
├── forestOverlay.js        Arbres GLB (6 variants) — InstancedMesh
├── houseOverlay.js    Maisons GLB, église, cimetière, tour de guet
├── realisticWater.js       Shader eau réaliste (reflets, ripple)
├── visualEnvironment.js    Lumières, ciel, environnement visuel
├── soundDesign.js          Audio spatial
├── missions.js             Système de missions dynamiques
├── ui.js                   HUD (score, deck, missions, aide)
├── multiplayerUi.js        UI multiplayer
├── debugLightUi.js         Panneau debug lumière
├── tileLabels.js           Labels texte sur tuiles
├── variables.js            Réglages humains (couleurs, tailles, weights...)
│
└── stable/                 Modules matures, peu modifiés
    ├── hex.js              Coordonnées axiales, makeHexKey, axialToWorld
    ├── grid.js             Grille hexagonale, cellules disponibles, expansion
    ├── gridRegions.js      Régions de grille, expansion dynamique
    ├── placementRules.js   Validation placement, HEX_DIRECTIONS, getOppositeEdge
    ├── scoring.js          Calcul score placement
    ├── gameRules.js        Règles deck, bonus tuiles
    ├── controls.js         CameraControls (orbit + zoom)
    ├── worldCurvature.js   Courbure monde (platiste/bouliste)
    ├── threeSetup.js       Renderer, caméra, post-processing, ombres
    ├── postprocessHud.js   HUD réglages post-processing
    ├── placementOverlay.js Feedback visuel de placement (preview)
    ├── bonusCells.js       Cellules bonus (étoiles, score multiplié)
    ├── specialCells.js     Cellules spéciales
    ├── highscore.js        Highscores client
    ├── globalWind.js       Vent global (direction, force)
    ├── starUniverse.js     Fond étoilé
    ├── cometSky.js         Comètes animées
    ├── random.js           pickRandom, pickWeighted
    ├── multiplayerClient.js  Client HTTP polling multiplayer
    │
    ├── hashUtils.js        FNV-1a : hashUnitFull / hashUnit100k / hashUnit10k / hashNumber
    ├── hexGeometry.js      createOuterVertices(radius)
    ├── tileUtils.js        makeNodeKey, getTileEdgeType, getTileCenterType, clearGroup, smoothstep
    └── zoneUtils.js        collectZone (BFS), getFullTextureNeighbors
```

---

## 22. InstancedMesh — stratégie rendu haute-fréquence

### Pourquoi

Sur les grandes grilles, le nombre de draw calls WebGL explose (~3000–6000+ avec le rendu clone-par-clone). `THREE.InstancedMesh` permet de dessiner N copies d'une géométrie en un seul draw call via une matrice par instance (`Matrix4`).

### Fichiers concernés

| Fichier | Props instanciées | Props clone (inchangé) |
|---|---|---|
| `forestOverlay.js` | Tous les arbres (6 variants : birch, bushy_mini, oak_round, pine_soft, dead, poplar) | — |
| `fieldWaterEffectsOverlay.js` | Fleurs (4 variants), roseaux, champignons | Rochers (taille côtière variable) |

### Pattern collect → build

1. **Collect** : parcourir toutes les tuiles, calculer chaque matrice d'instance avec un `Object3D` dummy réutilisé (`_instanceDummy` / `_propInstanceDummy`), stocker `matrix.clone()` dans un `Map<variantKey, Matrix4[]>`.
2. **Build** : pour chaque variant, traverser le prototype, `geometry.clone().applyMatrix4(child.matrixWorld)` (cuit la transform du wrapper `normalizeModel`/`preparePropPrototype` dans la géo), `material.clone()`, créer `InstancedMesh(geo, mat, count)`, affecter les matrices, `instanceMatrix.needsUpdate = true`.

Le prototype n'est **jamais** ajouté à la scène. Il faut appeler `prototype.updateMatrixWorld(true)` avant de lire `child.matrixWorld`.

### Scale

La scale de base (issue du wrapper) est cuite dans la géométrie. La matrice d'instance ne contient que le **jitter** (`setScalar(jitter)`). Ne pas passer wrapper.scale dans la matrice d'instance.

### Dispose

Les géométries et matériaux clonés à chaque rebuild sont **la propriété des InstancedMesh** — pas des prototypes. Le chemin `clearGroup` (arbres) et `disposeOverlayChildren` (arbres) dispose correctement les clones sans toucher aux prototypes.

### globalWind + InstancedMesh

Le shader vent (`stable/globalWind.js`) utilisait `modelMatrix * vec4(position, 1.0)` pour calculer la position monde. Avec `InstancedMesh`, `modelMatrix` est la transform du mesh, pas de l'instance. Patch appliqué :

```glsl
#ifdef USE_INSTANCING
  vec4 gwWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
#else
  vec4 gwWorld = modelMatrix * vec4(position, 1.0);
#endif
```

`position.y` (espace local) pour `heightStart`/`heightEnd` reste correct pour les deux chemins.

### Variante stable par TREE_MODEL_DEFS

`collectTreeInstances` utilise `TREE_MODEL_DEFS.map(d => d.key).filter(k => treeLibrary.has(k))` pour un ordre stable indépendant de l'ordre de chargement async des GLB. L'index `pickMixedModelIndex` pointe dans cette liste triée.

---

## 23. Système LOD (Level Of Detail)

### Principe

Les objets Three.js sont masqués (`visible = false`) au-delà d'une distance caméra seuil. Le test est effectué dans la boucle `animate()` de `scene.js`, dans le bloc `(shadowRefreshFrame % 3) === 0` — soit ~20 Hz à 60 fps.

La caméra est positionnée à `radius = 15`, `phi = π/3` → hauteur Y ≈ 7.5, décalage horizontal XZ ≈ 13 unités depuis la cible. La composante Y² (≈ 56) gonfle les distances 3D pour les objets posés au sol (Y ≈ 0), ce dont les seuils 3D tiennent compte.

**Exception bateaux animés** (`waterBoatOverlay.js`) : la comparaison est **XZ uniquement** (`dx*dx + dz*dz`) pour éviter que Y² consomme tout le budget de distance sur terrain plat.

### Seuils centralisés dans `variables.js`

| Constante | Valeur | Comparaison | Cible |
|---|---|---|---|
| `LOD_MICRO_CULL_DISTANCE` | 16.0 | 3D | Fleurs, roseaux, champignons (InstancedMesh chunks) |
| `LOD_SIGN_CULL_DISTANCE` | 17.0 | 3D par item | Panneaux indicateurs |
| `LOD_SHORE_BOAT_CULL_DISTANCE` | 18.0 | 3D par item | Barques échouées (shore-inert-boat) |
| `LOD_BOAT_CULL_DISTANCE` | 15.0 | **XZ uniquement** | Bateaux animés (waterBoatOverlay) |
| `LOD_ROCK_CULL_DISTANCE` | 26.0 | 3D (chunks) | Rochers (InstancedMesh chunks) |
| `LOD_PAVED_ROAD_CULL_DISTANCE` | 28.0 | 3D | Réseaux de routes pavées GLB |
| `LOD_RAIL_TRACK_CULL_DISTANCE` | 30.0 | 3D | Rails/traverses/ballast |
| `LOD_ROAD_DECOR_CULL_DISTANCE` | 30.0 | 3D par item | Bancs, moulins, corbeaux, drapeaux |
| `LOD_TRAIN_CULL_DISTANCE` | 38.0 | 3D | Trains + gares |
| `LOD_HOUSE_CULL_DISTANCE` | 32.0 | 3D | Bâtiments village |

### Hiérarchie effective (petits → gros, disparition progressive)

Distance XZ effective (avec Y≈7.5 de hauteur caméra) :
1. Fleurs/roseaux/champignons → ~14.1 XZ
2. Panneaux indicateurs → ~14.9 XZ
3. Barques échouées → ~14.9 XZ
4. Bateaux animés → 15.0 XZ (comparaison XZ directe)
5. Rochers → ~24.9 XZ
6. Routes pavées → ~26.9 XZ
7. Rails/bancs/moulins/crows → ~28.9–29.1 XZ
8. Bâtiments village → ~31.1 XZ
9. Trains/gares → ~37.2 XZ

### Implémentations

**Chunks LOD** (forêt + micro-props) : `InstancedMesh` regroupé en chunks de `HEX_CHUNK_SIZE` tuiles. Le test compare la distance caméra au centre (`worldBoundingSphere`) du chunk. Seuil élargi ~20 % par rapport à la distance visible pour compenser : le centre peut être loin alors que le bord du chunk est encore proche.

**Per-item LOD** (`roadsideDecorObjects`) : liste plate `{ object, center, lodDistSq }` construite dans `rebuildFieldWaterEffectsOverlay`. Inclut : drapeaux, bancs, panneaux, **barques échouées** (`water-shore-inert-boat-glb`). Mise à jour par `updateFieldDecorLOD()`.

**Inline LOD** (scene.js, bloc %3) : scan direct de `placedTiles`, `mesh.getObjectByName(...)`, toggle `visible`. Utilisé pour `procedural-volume-rail-track` et `village-stone-road-glb-network` — une seule boucle, `distanceToSquared` calculé une fois par tile.

**Overlay LOD** (fonctions dédiées, bloc %3) : `updateWaterBoatLOD`, `updateRailTrainLOD`, `updateHouseLOD`.

### Règles

- Toutes les constantes LOD dans `variables.js`. Zéro valeur magique dispersée.
- Ne jamais comparer en 3D pour des objets posés au sol quand la hauteur caméra perturbe le résultat — préférer XZ ou calibrer le seuil.
- Les petits objets disparaissent **avant** les gros quand on dézoome.
- Aucun impact sur le rendu proche (les seuils sont calibrés bien au-delà du rayon de tuile visible).

---

## 24. Pièges connus

**Grille invisible** — import cassé, erreur JS au chargement, `scene.js`, `stable/grid.js`, `stable/worldCurvature.js`.

**Clipping** — near/far plane caméra, shader courbure, mauvais calcul de hauteur.

**Objets flottants** — placement Y codé en dur, non-utilisation de `terrainHeight.js`, mauvais pivot ou scale du GLB.

**Hash procédural** — ne jamais unifier les 3 variantes de précision FNV-1a. Changer la précision change le placement visuel (positions des arbres, maisons, trains).

**createOuterVertices** — toujours passer `radius` explicitement quand on veut `HEX_SIZE * TILE_VISUAL.radiusScale`. La valeur par défaut dans `hexGeometry.js` est `HEX_SIZE` seul.

**Sons incorrects** — sons train déclenchés par rail au lieu de train GLB réel.

**Constantes fantômes** — une constante déclarée n'est pas forcément utilisée. Chercher son usage avant de modifier.

**BFS zone** — `fieldWaterEffectsOverlay.js` utilise intentionnellement un `getTextureNeighbors` simplifié (pas d'adjacence intra-tuile). Ne pas le remplacer par `getFullTextureNeighbors`.

---

## 25. Ce qu'on fera / ne fera pas

À faire : polish graphique, lisibilité HUD, rebuild incrémental des overlays.

Pas prévu : React, Vue, TypeScript, framework, WebSocket obligatoire, SQL pour scores, bundler obligatoire.

---

## 26. Philosophie

1. Ne pas casser la grille.
2. Ne pas casser le gameplay validé.
3. Modifications minimales et chirurgicales.
4. Pas d'usine à gaz.
