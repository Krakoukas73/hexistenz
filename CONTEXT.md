# CONTEXT.md — Hexistenz

## 1. Nature du projet

**Version courante : `v0.9.4.2.2`** (source unique : `variables.js` → `HEXISTENZ_VERSION`).

Jeu web contemplatif de pose de tuiles hexagonales, inspiré de Dorfromantik / The Settlers / HoMM. Le joueur pioche une tuile, la tourne, la pose sur une grille hexagonale. Chaque tuile a 6 secteurs triangulaires (biomes ou réseaux). Objectif : connecter les biomes, compléter des missions, maximiser le score.

Stack : JavaScript ES Modules natifs, sans bundler. Three.js r160 (CDN). PHP pour highscores/multiplayer. JSON stockage. Pas de framework, pas de SQL.

**Le jeu est entièrement traduit en 9 langues : FR/EN/ES/IT/PT/DE/RU + `fr-CA` + `fr-MED`** (prez `index.php`, jeu `game.php`, panneau EDA compris), via l'architecture i18n scalable `LANG_FILES`/`data-i18n` (cf. §21, entrées 2026-07-14/15/16, et §35 pour l'allemand/russe/médiéval). Sélecteur de langue accessible en jeu à tout moment, sans rechargement — contenu traduit dans `json/languages/*.json`.

Les deux dernières sont des variantes de saveur, pas des langues au sens strict :
- `fr-CA` — québécois, easter egg, sélecteur **"QC"**.
- `fr-MED` — **français médiéval (XIIe siècle)**, sélecteur **"XII"**, fichier `french-medieval.json`.
  Français moderne enrichi de vocabulaire et de tournures de chroniqueur : orthographe strictement
  moderne (contrainte TTS — l'ancien français réel est mal prononcé par la synthèse vocale) et
  lisibilité immédiate exigée. Trois passes d'intensification successives (2026-07-29/30), la
  dernière ayant retiré « moult »/« céans » devenus des tics au profit d'inversions sujet-verbe,
  de négations « ne… point / ne… mie » et d'un lexique plus large. Sa locale TTS est `fr-FR`.
  ⚠️ Les infobulles techniques du panneau EDA y restent délibérément claires et utilisables :
  les termes techniques (LUT, bloom, GPU, FPS, shader) ne sont jamais traduits ni habillés.

**Réglages par défaut au tout premier lancement (2026-07-31, demande explicite)** — aucune préférence enregistrée (localStorage vide, pas de cookie) :
- **Langue : `fr-CA`** (auparavant `fr`). Repli changé aux 4 points qui en décidaient : `gameLangReactive.js::getGameLang()` (jeu, source de vérité unique), le script de pré-hydratation de `game.php` (attribut `data-lang` avant le premier paint), et les 2 replis équivalents de la prez `index.php` (`$prefLang` côté PHP + `setLang()` côté JS). Un visiteur ayant déjà choisi une langue garde ce choix — rien ne change pour lui. Le HUD/la prez restent rendus en français par le PHP le temps que le JS bascule vers fr-CA (même flash bref déjà existant pour tout visiteur revenant dans une langue non-française).
- **Thème : `ancien`** (médiéval) — **déjà le défaut depuis le 2026-07-17** (cf. §32), aucune modification nécessaire ici.
- Vérifié en direct (192.168.0.41, jeu ET prez) sur un profil sans localStorage/cookies : `data-lang="fr-CA"`/`data-theme="ancien"` posés dès le premier paint, textes affichés en français canadien ("Choisis c'est quoi la forme de ta planète, asteur…").

**Intro de la prez (`hero.tagline`) — phrase de clôture ajoutée (2026-07-31, demande explicite)** : une dernière phrase, après le paragraphe existant, annonce que le jeu est jouable dès maintenant et traduit en 9 langues, y compris le vieux français du XIIe siècle (`fr-MED`) — mise en avant volontaire de cette langue "easter egg" dans l'argumentaire public. Ajoutée aux 9 `json/languages/*.json` (clé `hero.tagline`, juste avant le `btn_play`), chacune dans le registre déjà établi pour sa langue (fr-CA en québécois informel, fr-MED en tournure de chroniqueur avec inversion sujet-verbe). Vérifiée en direct sur 8 des 9 langues (fr, en, es, it, pt, de, ru, fr-CA, fr-MED) via `setLang()`.

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
| `weatherVfxOverlay.js` | Lucioles via moteur particules `wawa-vfx-vanilla` — piloté par `environmentDirector` (cf. §29). Partie pluie retirée le 2026-07-12 au profit de `rainCloudOverlay.js` |
| `rainCloudOverlay.js` | Nuages metaball (marching-cubes) + pluie tombant de chaque nuage + impacts au sol + **chape d'orage** (plan bosselé à silhouette « patatoïde », altitude/opacité réglables) — piloté par `environmentDirector` et le switch « Nuages de pluie » de la rubrique 8 (cf. §29). À distinguer de `cloudSky.js` (nuages d'horizon) |
| `lightningOverlay.js` | Éclairs : zébrure (TubeGeometry midpoint-displacement) + halo + `PointLight`, point de frappe tiré sous les nuages. Expose le hook `onLightningStrike(listener)` (cf. §36) |
| `fireOverlay.js` | Feu allumé par la foudre : flammes montant sur les vrais modèles 3D à leur hauteur réelle, noircissement puis repousse, dérive au vent, propagation aux voisines, extinction par la pluie (cf. §36) |

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

**Depuis le 2026-07-09 (merge VFX Cyril, cf. §29), les hooks ne sont plus inertes** : déclencher `groundMist`/`fireflies`/`rain`/`storm` active l'effet visuel correspondant (fondu entrée/sortie) via `shaders/morningMistOverlay.js`, `weatherVfxOverlay.js` (lucioles) et `rainCloudOverlay.js` (nuages + pluie + impacts, depuis le 2026-07-12). `lightning` et `fire` sont rendus depuis le 2026-07-30 (`lightningOverlay.js`/`fireOverlay.js`, cf. §36) ; seul `panic` reste déclenchable sans rendu visuel. Leurs paramètres fins sont pilotés dans la **même rubrique 8** (cf. sous-section suivante) :

**Réglages VFX MÉTÉO — fusionnés dans la rubrique 8 (2026-07-10, ex-rubrique 2 indépendante)** : trois groupes de sliders (🌫️ Brume matinale / ✨ Lucioles / 🌧️ Pluie-Orage), chacun avec un bouton ↺ réinitialiser, affichés sous les boutons de déclenchement d'évènements et le bouton `⏹ Tout arrêter` de la rubrique 8 (même conteneur `.debug-light-weather-section`, même thème « météo »). Contrairement à EAU/VENT/NUAGES (getters/setters dédiés par overlay), ces réglages passent par le store commun `vfxSettings.js` (`getVfxSettings`/`setVfxSetting`/`resetVfxSettings`, persistance localStorage gérée là-bas). Générés dans `hud_eda.js` (`#debugLightVfxControls`, déplacé dans le markup mais toujours peuplé par le même `querySelector('#debugLightVfxControls')` — sélection par id, insensible à l'emplacement) via `createRawSlider` — hors export 📋 Copier (réglage machine, pas « regard »), undo/redo câblé via `pushUndo`. Classe CSS `.debug-light-vfx-section` (ex-wrapper à en-tête propre "2. VFX MÉTÉO") supprimée de `debugLightUi.js`, devenue morte après la fusion.

**Persistance des réglages du panel — `makeStore()` + debounce (2026-07-28, §34)** : les 6 groupes qui persistent en localStorage (CINÉMA, PIX, EAU, VENT, NUAGES, LUT) passent par un helper unique `makeStore(key)` → `{ read, write }`, remplaçant 5 paires `_readXStored()`/`_storeXSettings()` identiques au nom de clé près. **Les écritures sont debouncées à 200 ms** (un seul timer + une `Map` de pending pour toutes les clés), avec `flush` sur `pagehide`. Raison : chaque slider commit à chaque évènement `input`, soit ~60 écritures/seconde pendant un drag, et `localStorage.setItem` est synchrone. La valeur en mémoire s'applique toujours immédiatement — le différé ne concerne que le disque. `vfxSettings.js` a reçu le même traitement (divergence assumée vs le fichier livré par Cyril). Les 3 `setItem` restants (onglet actif, clic de preset, bascule jour/nuit) sont sur des clics, pas des drags : laissés directs.

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
propHitboxRegistry.js          Registre hitboxes collision props (évite chevauchements) + poignées `meta` pour le feu (cf. §36)
lightningOverlay.js            Éclairs + hook onLightningStrike (cf. §36)
fireOverlay.js                 Feu : allumage par la foudre, combustion des modèles 3D, propagation (cf. §36)
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

**Ne JAMAIS supprimer un fichier verrou en fin de requête** — `with_room_lock()` (`multiplayer.php`) faisait `@unlink($lockPath)` au shutdown. Deux dégâts : (1) pendant la suppression, un `fopen()` concurrent sur le même chemin échoue (violation de partage Windows) → HTTP 500 en rafale dès que poll 900 ms et envois de curseur se chevauchent ; (2) plus grave et silencieux, **l'exclusion mutuelle saute** — A détient le verrou et supprime le fichier, B en recrée un NEUF et verrouille celui-là, les deux écrivent `room_*.json` en même temps. Un verrou est un jeton de 0 octet : il doit persister entre les requêtes. Mesuré : 20 requêtes concurrentes → 14 × 500 avant, 60 → 0 après. cf. §34.

**`define()` n'est pas hoisté, contrairement aux déclarations de fonctions** — en PHP, une fonction déclarée en bas de fichier est utilisable en haut, mais une constante `define()` placée au même endroit ne l'est PAS : elle s'exécute à la volée. Poser une constante de configuration à côté de la fonction qui la consomme, alors qu'un bloc de code plus haut l'utilise aussi, lève une `Error: Undefined constant` en PHP 8 et casse tout l'endpoint. Toujours déclarer ces constantes en tête de fichier. Piège rencontré en gatant `MULTIPLAYER_DEBUG` (§34).

**`@import` CSS : pas de preload scanner, et pas de cache-busting hérité** — un `@import` n'est découvert qu'après téléchargement ET parsing du fichier qui le contient : les feuilles importées ne démarrent qu'au second aller-retour réseau, tout en bloquant le rendu. Surtout, **ajouter `?v=` au fichier parent ne revalide PAS les fichiers importés** (leurs URL restent stables) : on peut modifier `eda.css` pendant des semaines sans qu'un visiteur récurrent ne voie le changement. Toujours des `<link>` explicites, chacun avec son propre `?v=filemtime()`. cf. §34.

**Vider `group.children` à la main laisse `child.parent` renseigné** — le motif `while (group.children.length) group.children.pop()` sert à retirer des enfants SANS disposer leurs geometry/material partagés (cache d'InstancedMesh). L'intention est bonne, l'implémentation non : les objets retirés continuent de pointer vers leur ancien parent. `group.clear()` fait exactement ce qui est voulu — détache et remet `parent` à null — sans jamais toucher aux ressources. Pour un group dont les enfants possèdent leurs propres ressources, `group.remove(child)` PUIS `disposeObject3D(child)`. cf. §34.

**`localStorage.setItem` dans un handler `input` = saccades** — les sliders émettent un évènement `input` par frame de drag (~60/s) ; `setItem` est SYNCHRONE et re-sérialise tout l'objet à chaque appel. Tout commit de réglage doit être debouncé (200 ms) avec un `flush` sur `pagehide` pour ne rien perdre si l'onglet se ferme entre-temps. La valeur en mémoire, elle, s'applique immédiatement — aucun retard visuel. Même remarque pour tout travail lourd branché sur un `onChange` de réglage : filtrer sur la CLÉ modifiée avant de reconstruire quoi que ce soit (cf. `rainCloudOverlay`, §34).

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

## 29. VFX Météo (`environmentDirector.js` + `shaders/morningMistOverlay.js` + `weatherVfxOverlay.js` + `rainCloudOverlay.js` + `vfxSettings.js`)

Système d'effets météo visuels piloté par événements, intégré le 2026-07-09 (cf. §21), enrichi le 2026-07-12 par le système « nuages metaball + pluie + impacts » de Cyril.

**Chef d'orchestre — `environmentDirector.js`** : catalogue `ENVIRONMENT_EVENTS` (morningMist/fireflies/rain/storm/lightning/fire/panic). API : `triggerEnvironmentEvent(director, id, t, { duration })`/`stopEnvironmentEvent`/`stopAllEnvironmentEvents`/`isEnvironmentEventActive`/`onEnvironmentChange`/`updateEnvironmentDirector`/`getEnvironmentEventFade` (fondus entrée/sortie, défaut 6 s). `duration: Infinity` accepté — utilisé par les switches manuels du HUD pour empêcher l'auto-expiration en debug. Déclenchement manuel via rubrique EDA « 8. Météo » (§13).

**Overlays visuels** (branchés sur le director) :
- `shaders/morningMistOverlay.js` — nappe de brume volumétrique, respecte la courbure du monde (`WORLD_CURVATURE_SHADER`/`_UNIFORMS`). Réagit à l'event `groundMist`.
- `weatherVfxOverlay.js` — **lucioles uniquement** depuis le 2026-07-12 (la partie pluie a été retirée au profit de `rainCloudOverlay.js`). Moteur de particules `vendor/wawa-vfx-vanilla.js` (`VFXEmitter`/`VFXParticles`/`AppearanceMode`). Signature `updateWeatherVfxOverlay(overlay, director, t, dt)` — plus de `focusPoint`/`controls.target`.
- `rainCloudOverlay.js` — nuages type Animal Crossing (metaballs marching-cubes précalculés, fusionnés en 1 mesh opaque via `mergeGeometries`), pluie streak tombant sous chaque nuage (InstancedMesh billboard cylindrique, chute animée GPU), impacts au sol (disques posés à `getTerrainSurfaceY`, hors du group qui dérive au vent). **Distinct de `cloudSky.js`** (nuages d'horizon décoratifs, mode jour). Réagit aux events `rain`/`storm` **et** au switch UI « Nuages de pluie » (`isVfxGroupExpanded('clouds')`) — pas de nuages, pas de pluie. Maillage marching-cubes mis en cache par seed (`_cloudGeomCache`) → coût à la 1re construction seulement (~30 ms) ; reposer une tuile ne recalcule au pire qu'un nuage. Noms de meshes **à ne pas renommer** (lus par `sceneProfiler.js::_classifyInstanced`) : `hexistenz-vfx-rain`, `hexistenz-vfx-rain-impact`, `hexistenz-vfx-rain-clouds*`. API : `createRainCloudOverlay(scene)`, `rebuildRainCloudOverlay(overlay, placedTiles)` (appelé par `rebuildInitialDerivedOverlays`), `updateRainCloudOverlay(overlay, director, t, dt)`, `getRainCloudAnchors(overlay)` (prévu pour un futur `lightningOverlay.js`, non livré).
  - **Réaction aux réglages filtrée par CLÉ (2026-07-28, §34)** : `onVfxSettingsChange((effect, key) => …)` ne reconstruit que pour `clouds.densite`/`clouds.epaisseur`. `clouds.altitude` → `_applyCloudAltitude()` (translation `mesh.position.y` + uniform `uAltitude`, altitude bakée mémorisée dans `overlay._bakedCloudAltitude`) ; `rain.tailleGoutte` → `_applyRainDropSize()` (2 uniforms) ; `rain.densite`/`rain.impactSol` → **rien** (déjà lus chaque frame via `uActiveRatio`/`uIntensity`). Avant ce filtrage, traîner n'importe lequel de ces 6 sliders déclenchait un rebuild complet 60 fois par seconde.

- `lightningOverlay.js` + `fireOverlay.js` — **livrés le 2026-07-30** (merge Cyril, cf. §36). `panic` reste le seul évènement non rendu visuellement.

**Chape d'orage (`rainCloudOverlay.js`, 2026-07-30)** — pendant l'orage, un unique grand plan bosselé double-face recouvre le plateau, en plus des cumulus. Deux pièges y sont documentés en dur :
- Son **altitude est portée par `canopyMesh.position.y`**, pas cuite dans la géométrie : le curseur EDA la déplace sans reconstruire le plan 72×72 (le bruit du vertex shader est indexé sur `wp.xz`, un décalage en Y ne le modifie pas).
- Sa **silhouette** n'est pas rectangulaire : une texture de couverture 128² (`_buildCanopyCoverage`) est calculée **au rebuild uniquement**, en tamponnant un dégradé radial par tuile posée et en gardant le max — l'union des disques épouse le plateau, le dégradé donne le fondu. Uniforms `uCoverage`/`uCoverageOrigin`/`uCoverageSize`, initialisés à une texture 1×1 opaque pour que le 1er frame avant rebuild reste identique à l'ancien comportement.
- ⚠️ **`opaciteChape` défaut 0.72, pas 1.** À 1 la carte est totalement masquée sous orage (bug remonté en jeu). L'ambiance sombre de l'orage ne vient PAS de cette opacité mais de `updateStormAmbience()` dans `scene.js` : on peut donc baisser l'opacité sans perdre l'atmosphère.

**Store de réglages — `vfxSettings.js`** : `getVfxSettings(effect)`/`setVfxSetting(effect, key, value)`/`resetVfxSettings(effect)`/`onVfxSettingsChange(listener)` + `VFX_SETTINGS_DEFAULTS` + `isVfxGroupExpanded(effect)`/`setVfxGroupExpanded(effect, bool)` (état des switches par item, **volontairement non persisté** — en mémoire seulement, false à chaque rechargement). Effets : `groundMist`, `fireflies`, `rain` (densite/tailleGoutte/impactSol), `clouds` (densite/altitude/epaisseur), `storm` (frequenceEclairs/luminositeEclair/intensitePluie/**altitudeChape**/**opaciteChape**), **`fire`** (probaAllumage/densiteFlammes/duree/taille/propagation). `_load()` repart toujours d'un clone des `DEFAULTS` et n'y surcharge que les clés effectivement stockées : **ajouter une clé ne casse pas un localStorage existant**, elle arrive à sa valeur par défaut. Écritures localStorage debouncées 200 ms (§34). `getAllVfxSettings`/`setAllVfxSettings` ont été retirés le 2026-07-12 (remplacement complet par la version Cyril) : le snapshot Undo/Redo et l'export 📋 Copier passent par les helpers locaux `_snapshotAllVfx()`/`_restoreAllVfx()` d'`edaPanelWiring.js`, qui itèrent sur `_VFX_EFFECT_KEYS`. Zone couverte = `VFX_WORLD_RADIUS` (`variables.js`, 15 unités).

**Câblage `scene.js`** : `environmentDirector` créé en premier, puis `weatherVfxOverlay` et `rainCloudOverlay`. Dans `animate()`, un `deltaSeconds` clampé (`Math.min(0.1, …)` via `_vfxPrevTimeSeconds`) alimente `updateEnvironmentDirector` → `updateMorningMist` → `updateWeatherVfxOverlay(…, t, dt)` → `updateRainCloudOverlay(…, director, t, dt)`. `rebuildRainCloudOverlay(overlay, placedTiles)` est appelé dans `rebuildInitialDerivedOverlays()`.

**Imports THREE** : les overlays utilisent l'URL CDN `three@0.160.0`, `wawa-vfx-vanilla.js` le specifier nu `"three"` — l'importmap `game.php` remappe les deux vers `./vendor/three.module.js` (instance unique). `rainCloudOverlay.js` importe en plus `MarchingCubes` et `mergeGeometries` depuis `three@0.160.0/examples/jsm/…` (non bundlés).

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

**Architecture CSS** — `css/themes/bleu.css`/`css/themes/medieval.css` (déplacés dans ce sous-dossier dédié le 2026-07-17, rangement organisationnel : seuls les fichiers spécifiques aux 2 thèmes vivent hors de `css/`, tout le reste de `css/` reste où il est ; renommés 2 fois le même jour, `theme-bleu.css`/`theme-ancien.css` → `theme-bleu.css`/`theme-medieval.css` → `bleu.css`/`medieval.css`, noms de fichiers seuls — la valeur interne du thème reste `ancien` partout : `data-theme="ancien"`, `localStorage`, `THEMES` de `themeManager.js` — `<link>` mis à jour à chaque fois dans `index.php`/`game.php`/`snapshots.php`, commentaires croisés mis à jour dans `base.css`/`help.css`/`multiplayerUi.css`/`presentation.css`/`themeManager.js`) scopent tout ce qui est intrinsèque à chaque thème pour les cartes de la prez (`.mission-card`, `.biome-card`, `.faction-card`, `.creature-card`, `.audio-card`, `.daynight-card`, `.hs-card`, `.hero-inspi-card`, `.stats-bar`, `.step-card`, `.kbd-strip`, `.gallery-card`, `.eda-showcase-card`, `.room-demo`) ; layout partagé (grid/flex/tailles/structure images) reste dans `presentation.css`. Le reste du HUD in-game (score/missions/aide/FPS/EDA/deck/galerie snapshot/replay/menus pre-game/bandeau) est thémé directement via des blocs `[data-theme="..."]` dans `base.css`/`eda.css`/`help.css`/`missions.css`/`highscore.css`/`deck.css`/`snapshots.css`/`multiplayerUi.css`/`startupMenu.css`/`snapshotGalleryOverlay.css` — pas dans les 2 fichiers `theme-*.css`. `images/manuscrit-1.png` reste absent du dossier `images/` : `border-image` retombe sur `border: 50px solid transparent` (invisible mais mise en page non cassée) — rendu réel jamais vérifié avec la texture.

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

**📐 Badge hexagonal — pattern définitif établi, à réutiliser pour tout futur "contour" hexagonal (2026-07-19)** : chantier `.hs-meta-item .icon` (rubrique "Les meilleurs bâtisseurs", prez) puis `.hs-rank`, laborieux (4 itérations avant validation utilisateur). Le pattern final, désormais la référence pour tout nouveau badge hexagonal dans le projet :
- **Ne jamais** appliquer de `clip-path` hexagonal directement sur l'élément qui porte le contenu (texte/emoji) — dès que le contenu déborde légèrement du pincement, il est tronqué net. Le pincement réel d'un hexagone (`polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)`) est trop serré pour ça.
- **Ne jamais** combiner `border` (propriété CSS classique) avec un `clip-path` sur le même élément — la bordure est calculée sur la boîte carrée d'origine puis retaillée en biais par le clip, donnant une épaisseur incohérente (quasi nulle par endroits) sur les 4 côtés obliques de l'hexagone, aspect "pointillé/cassé".
- **Solution retenue** : DEUX pseudo-éléments (`::before`/`::after`) portant chacun un hexagone PLEIN (même `clip-path`, pas de `border`) superposés — `::before` = grand hexagone à la couleur de bordure, `::after` = hexagone inset (2-3px) à la couleur de fond. L'anneau visible entre les deux est une épaisseur ABSOLUE uniforme sur les 6 côtés. Élément porteur (`.icon`/`.hs-rank`) : `position:relative; z-index:0` (indispensable pour confiner les `z-index:-1/-2` des pseudo-éléments — sinon ils s'échappent dans le contexte d'empilement du parent et se retrouvent peints sous le fond de la carte, invisibles) ; ne porte lui-même ni fond ni bordure, seulement layout + contenu, jamais recadré.
- **Proportions validées** (largeur > hauteur, ratio ≈1.18, plus large qu'un carré) : `.hs-rank` 62×52px (élargi depuis 52×52 carré), `.hs-meta-item .icon` 40×34px (élargi depuis 34×34 carré) — **ce ratio largeur/hauteur ≈1.18 (proche du vrai ratio d'un hexagone "à plat" régulier, 2/√3≈1.1547) est désormais la référence pour tout futur hexagone de contour** : partir d'un carré, élargir la largeur d'environ 18-19% en gardant la hauteur.
- Contraste (thème ancien) : fond `#f0e6d0` quasi identique au parchemin environnant rendait l'hexagone invisible malgré une bordure correcte — remplacé par fond saturé (`#c9a869`/`#4a3623` selon élément) + bordure sombre (`#4a3623`/`#332415`) + `filter:drop-shadow` sur la couche de bordure, même famille "cachet de cire" que `.biome-tag`/`.hs-rank`.
- Historique complet des 4 tentatives (clip-path direct → pincement adouci → border+clip-path → double-hexagone) conservé dans les commentaires CSS de `presentation.css`/`themes/medieval.css`/`themes/bleu.css` — relire ces commentaires avant toute nouvelle tentative sur un badge hexagonal.

**🐛 Régression thème bleu — 3 layouts cassés par `.internal-parchment`, jamais testés en bleu depuis son ajout (découvert 2026-07-19)** : `.stats-bar` (3 stats empilées verticalement), `.hs-card` (grille cassée), `.kbd-strip` (grille cassée) — tous en thème **bleu** uniquement. Root cause : le wrapper `.internal-parchment` ajouté dans le HTML de toutes les cartes le 2026-07-18 (cf. entrée ci-dessus) n'a été neutralisé QUE côté ancien (`display:flex`/`grid` par carte, pour le bleed) — jamais côté bleu, où il n'a besoin d'aucun traitement spécial. Le DIV supplémentaire s'intercalait donc entre chaque carte et ses enfants directs, cassant tout flex/grid qui comptait sur cette relation directe. Fix générique en une ligne dans `themes/bleu.css` : `[data-theme="bleu"] .internal-parchment { display: contents; }` — retire le wrapper de la boîte de mise en page (enfants redeviennent enfants directs) sans le supprimer du DOM ; safe car aucun style bleu ne dépend de `.internal-parchment` comme boîte réelle (le scroll de `#scorePanel` par ex. reste porté par `#scorePanel` lui-même en bleu, cf. `base.css`). **Leçon : toute future modification structurelle du HTML des cartes doit être testée dans LES DEUX thèmes avant validation, pas seulement celui en cours d'édition.**

**🏁 Finitions bandeau fixe (`nav`) + fond carte + score en parchemin — chantier clos (2026-07-19)** :

- **Fond carte.jpg (thème ancien)** : `.bg-layer` remplace le fond étoilé par `images/carte.jpg` (`background-attachment:fixed`, `cover`) + voile crème semi-opaque en couche superposée (`linear-gradient` sous l'image, même `background-size/position`) pour garantir un contraste suffisant sur tout le texte "flottant" (hors titres/parchemins), quelle que soit la zone de l'image sous le texte. Une vingtaine de sélecteurs repassés en encre sombre (`#2a1c0f`/`#332415`/`#4a3623`/`#6b4e10`) + halo `text-shadow`/`filter:drop-shadow` clair en complément (double sécurité).
- **`--border` retheme les séparateurs** : `[data-theme="ancien"] { --border: rgba(74,54,35,0.35); }` — un seul override de variable CSS suffit à corriger tous les séparateurs horizontaux (bleutés par défaut) car ils consomment tous `var(--border)`, y compris en style inline.
- **`.score-pills`** converti au pattern parchemin standard (`border-image` 9-slice + wrapper `.internal-parchment`), comme les 14 autres types de cartes.
- **Hover box-shadow retiré** sur `.creature-card`/`.faction-card`/`.daynight-card` (générait le bug des "4 coins" disgracieux sur les images).
- **Bandeau `nav` thémé** : parchemin partiel (cellules 4/6/7/8/9 du 9-slice, pas de cellule 1/2/3 en haut — le bandeau est collé au bord supérieur de la fenêtre) via `border-width: 0 50px 50px 50px` + `border-image-slice: 50 fill`. Marge 30px gauche/droite (`left/right:30px`) pour le détacher des bords de la fenêtre.
- **🪤 Piège résolu — "fond plus clair sur les menus du header"** signalé 2 fois avant d'être bien compris : ce n'était PAS la cellule 5 (fill) du 9-slice (jamais en cause), mais une règle `[data-theme="ancien"] .nav-links { background:#ede2c3; ... }` écrite pour le seul panneau mobile/déroulant mais jamais scopée à `@media (max-width:860px)`/`body.nav-compact` — elle peignait donc en permanence un fond clair derrière `<ul id="navLinks">` même en barre desktop 1 ligne. Fix : déclarations déplacées dans les 2 contextes réels où `.nav-links` devient un dropdown.
- **🪤 Piège résolu — réduction de la hauteur du bandeau, mauvais côté touché deux fois** : demande "réduire la marge intérieure basse du bandeau, interdiction de toucher aux marges de 50px (border-image)". 1ère tentative fautive : `padding` réduit uniformément haut+bas (12px→2px) — a écrasé le haut alors que `border-top:0` (rien d'autre ne protège visuellement le haut) : régression signalée par l'utilisateur. Fix définitif : `padding-top` restauré à 12px (intact), toute la réduction portée sur `padding-bottom` (12px→0, le bord-image 50px contient déjà sa propre marge visuelle via le grain du parchemin). Hauteur finale du bandeau : 104px (-28px vs 132px d'origine), `.nav-cta` (le plus grand élément, 42px) jamais rogné.
- **Bascule "sandwich" (hamburger) anticipée** : le CSS `body.nav-compact` existait déjà (dupliqué du media query `max-width:860px`) mais n'était jamais posé par aucun JS — seul le seuil `860px` fixe déclenchait le mode mobile, laissant une zone intermédiaire où les 11 liens retombaient sur 3+ lignes sans bascule. Ajout `updateNavCompact()` (`index.php`, appelée au chargement + resize débouncé 120ms + à chaque changement de langue) : mesure réellement le nombre de rangées de `<li>` (via leurs `top` réels) et bascule `body.nav-compact` dès que ça dépasse 2 lignes, quelle que soit la largeur exacte de la fenêtre.
- **🪤 Piège JS rencontré** — première version de `updateNavCompact()` fermait sur la variable externe `navLinks` (déclarée plus haut dans le même script) et levait `ReferenceError: Cannot access 'navLinks' before initialization` à l'exécution, cause non élucidée (une seule déclaration confirmée par grep, pas de collision de nom visible). Contournement robuste : la fonction relit elle-même `document.getElementById('navLinks')` en interne plutôt que de fermer sur la variable externe — plus fiable, à réutiliser si le même symptôme réapparaît ailleurs.

**🧹 Relecture demandée + homogénéisation `nav`/`.score-pills` (2026-07-19)** : suite à une demande explicite de relecture ("customisations bien dans le bon CSS ? code mort ? incohérent ?"), 2 défauts trouvés et corrigés dans `themes/medieval.css` — un commentaire du bloc `nav` documentait encore une valeur intermédiaire abandonnée (108px, padding-bottom 4px) laissée à côté du commentaire décrivant l'état final réel (104px, padding-bottom 0) ; le commentaire d'en-tête du fichier (portée déclarée) ne mentionnait ni `nav` ni `.score-pills`, ajoutés cette session. Un 3ème point, architectural et pré-existant, a été signalé puis corrigé sur demande utilisateur : contrairement aux 14 cartes de la prez (chacune avec un bloc `[data-theme="bleu"]` explicite dans `bleu.css`), le look bleu de `nav` et `.score-pill` vivait directement non scopé dans `presentation.css` (le thème ancien le remplaçait entièrement). Homogénéisé : `presentation.css` ne garde plus que le layout partagé (position/display/gap/structure), tout le look bleu (fond, bordures, couleurs, `background`/`border`/`border-radius` des toggles, liens, `.nav-cta`, `.score-pill`) a été extrait vers des blocs `[data-theme="bleu"]` dédiés dans `bleu.css`, symétriques de `medieval.css`. Vérifié en live (bleu ET ancien, desktop + nav-compact) : rendu pixel-identique à avant, seule la localisation du code a changé. Au passage, 2 redondances supprimées dans `medieval.css` : des `border-color`/`border-bottom-color` explicites qui dupliquaient une valeur déjà héritée via la redéfinition de la custom property `--border` sous `[data-theme="ancien"]`.

**🖼️ Images des parchemins (prez) — bord grignoté + fusion alpha + lucioles animées — chantier clos, "PREZ validée à 100%" (2026-07-19)** : demande initiale — intégrer les 28 photos posées dans les cartes parchemin de la prez (hors `.gallery-img`, exclu par choix explicite) de façon moins "plaquée rectangle net". `index.php` : chaque image ciblée (hero-inspi ×3, biome-banner ×6, creature-banner ×8, faction-img ×2, daynight-img ×6, eda-showcase-img ×3) enveloppée dans `<div class="parchment-picture parchment-picture--<variant> [--fill|--absolute|--auto]">`, variante `--v1`..`--v5` cyclée via l'index de boucle PHP (`$i % 5`) pour éviter la répétition visuelle. CSS dans `themes/medieval.css` (section "IMAGES DES PARCHEMINS", scope `[data-theme="ancien"]` uniquement) :
- **`clip-path` en bruit fin, PAS en amplitude** — 3 itérations avant la bonne version, retour utilisateur explicite à chaque fois : v1 (3 variantes, ~13 points, amplitude ≤1.5%) et v2 (5 variantes, ~30 points, 0.2-3%) jugées trop sages/invisibles à cette échelle ; une v3 a alors poussé l'AMPLITUDE (0-24%, alternance bord-plein/entaille) — erreur d'axe, résultat "vulgaire" : zigzags façon éclair qui tranchaient le texte des bandeaux (`biome-name`/`creature-name`). **Leçon générale, à réappliquer à tout futur besoin de bord "plus détaillé"** : le bon levier n'est PAS l'amplitude mais la DENSITÉ DE POINTS (bruit fin plutôt que jitter grossier). Version retenue et validée : 5 variantes générées par bruit multi-octave (PRNG `mulberry32` seedé, script Node jetable, non conservé dans le repo), 56 points chacune (~15/bord), amplitude contenue à 0.2-2% — lecture "grignoté/érodé" crédible, aucune ligne droite agressive, texte des bandeaux intact.
- **Fusion réelle avec le parchemin dessous** — `mask-image`/`-webkit-mask-image` (`radial-gradient(ellipse 92% 90% at center, #000 62%, rgba(0,0,0,0.5) 84%, transparent 100%)`) appliqué DIRECTEMENT sur `<img>`, rendant les pixels de la photo elle-même transparents en bord de découpe (vrai fondu alpha) plutôt qu'une 1ère tentative rejetée qui peignait des ronds couleur papier opaques par-dessus (`::before`) — approximation invisible en pratique. `filter: saturate(0.88) sepia(0.08) contrast(0.96) brightness(1.01)` (vieillissement léger) + `::after` grain/rayures (`repeating-radial-gradient`/`repeating-linear-gradient`, `mix-blend-mode:multiply`, opacité 0.18).
- **🐛 Bug clip-path posé sur le mauvais élément** — `.biome-banner-overlay`/`.creature-banner-overlay` (dégradé sombre portant le texte) sont des SIBLINGS de `.parchment-picture` (pas des descendants), donc jamais affectés par son `clip-path` : tache grise/bleue rectangulaire visible dans les coins désormais transparents de l'image. Fix : la classe `--vN` posée sur le conteneur EXTÉRIEUR (`.biome-banner`/`.creature-banner`, déjà `position:relative;overflow:hidden`) plutôt que sur le seul wrapper interne — un `clip-path` sur un parent découpe tout son sous-arbre rendu (image + overlay) comme une seule forme. **Règle générale : tout `clip-path` destiné à "découper visuellement une carte" doit être posé sur le conteneur qui possède TOUS les calques visuels concernés, jamais sur un seul enfant si d'autres calques (overlay, dégradé, texte) doivent suivre la même découpe.**
- **🔥 Lucioles (`particles.js`)** — le champ d'étoiles bleu/blanc existant (`particlesJS`, bas de `index.php`) était masqué en thème ancien (`display:none`). Remplacé par `window.initParticles(theme)` (config `PARTICLE_CONFIGS.bleu`/`.ancien`, détruit proprement `pJSDom`+canvas avant de reconstruire) appelé une fois au chargement + à chaque bascule de thème via `setTheme()` (garde `if (window.initParticles)`, la fonction n'existe pas encore au tout 1er appel de `setTheme()` car le script `particles.js` est chargé plus bas dans la page). 3 itérations de réglages avant validation, chacune sur retour utilisateur explicite :
  1. Invisibles malgré une config JS correcte (couleur/nombre vérifiés en direct) — cause réelle : `#particles-js` et `.bg-layer` (fond carte.jpg quasi opaque en ancien) partagent `z-index:0` en `position:fixed`, `.bg-layer` étant injecté après dans le DOM le recouvrait entièrement. Fix : `[data-theme="ancien"] #particles-js { z-index: 1; }`.
  2. Palette 1 (or/crème/vert clairs) invisible une fois le z-index corrigé — contraste quasi nul sur fond parchemin clair (contrairement au bleu/blanc sur ciel nocturne du thème classique, où le contraste est élevé par nature). Palette 2 (ambre/bronze/vert vifs et sombres, bon contraste) jugée "trop colorée, s'intègre mal". Palette 3 (retenue) : tons désaturés `#a68a5b`/`#8f7a4a`/`#9c8354`/`#7d8f6a` (sable/bronze/sauge, même famille que l'encre du texte hors-parchemin).
  3. "Plus nombreuses, plus rapides, plus petites, plus opaques" — `number` 40→90, `move.speed` 0.5→1.6, `size.value` 3.8→2.2, `opacity.value` 0.7→0.9 (palette v3 conservée, c'est elle qui marche visuellement).
- Chantier déclaré "validé à 100%" par l'utilisateur — prez complète (thèmes + nav + parchemin d'images + lucioles) considérée close.

**🖼️ Extension `.gallery-img` (rubrique "Plusieurs atmosphères", 8 presets) au grignotage parchemin — 3e demande, 3 tentatives (2026-07-19)** : oubliée du chantier ci-dessus par choix initial explicite, réclamée ensuite ("tu vois bien que les images de la rubrique 'ambiance' ne sont pas grignotées comme les autres"). Root cause du délai : `.gallery-card` porte lui-même le `border-image` 9-slice (bordure transparente 50px) — appliquer `clip-path` directement dessus découpe la boîte AVEC sa bordure, et une érosion fine (0.2-2%) tombe alors entièrement dans la zone transparente invisible, sans jamais toucher visuellement l'image. 1ère tentative (wrapper `--absolute` sur `.gallery-card`) : images réduites à hauteur 0 (conflit avec une règle du 2026-07-18 forçant tous les `.gallery-img` en flux naturel `position:static`). 2e tentative (classes posées sur `.gallery-card` sans wrapper) : image visible mais clip-path invisible (cause ci-dessus). **Fix retenu** : nouveau wrapper dédié `.gallery-picture` (porte `parchment-picture parchment-picture--vN`) inséré entre `.internal-parchment` et `<img>`/`.gallery-overlay` — laisse `.gallery-card` (bordure 9-slice) et le flux naturel de l'image intacts. Ajout d'un override `.gallery-card--contain .gallery-img` (3 sélecteurs de spécificité) pour que le letterboxing pixel-art des 3 presets `--contain` (ega/cga/apple2) batte la règle générique `.parchment-picture img` désormais aussi matchée via `.gallery-picture`. **Règle générale ajoutée à celle du bug overlay (§ ci-dessus)** : si le conteneur candidat pour `clip-path` porte AUSSI un `border-image` 9-slice, ne jamais y poser le clip-path directement — toujours introduire un wrapper interne dédié entre ce conteneur et les calques visuels (image + overlay).

**🏷️ Renommage libellé thème "bleu" → "Bleu sidéral" (2026-07-19)** : clé interne INCHANGÉE (`data-theme="bleu"`, `localStorage['hexistenz_theme']`, `THEMES=['bleu','ancien']` dans `themeManager.js`) — seul le libellé AFFICHÉ change, même convention que le renommage antérieur de `ancien`→"Médiéval". Deux emplacements par langue mis à jour dans les 6 fichiers `json/languages/*.json` : `theme.bleu` (sélecteur `#theme-toggle` de la prez) et `game.eda.themeNames.bleu` (sélecteur in-game `#gameThemeSelect`, retraduction réactive). Traductions retenues : FR/QC "Bleu sidéral", EN "Astral Blue", ES/PT "Azul sideral", IT "Blu siderale". Fallback JS codé en dur dans `edaPanelHost.js` (`themeNames?.bleu ?? 'Bleu'`) et l'option statique initiale du `<select>` (avant 1er fetch JSON) mis à jour en cohérence (`'Bleu sidéral'`/`BLEU SIDÉRAL`). Vérifié en direct (fetch des 6 JSON + lecture DOM `#theme-toggle` sur `index.php`).

**🖼️ Annulation transparence bords + fix bord inférieur droit (2026-07-20)** : l'effet `mask-image`/`mask-mode:luminance` posé sur `.parchment-picture img`/`::after`/`::before` (`themes/medieval.css`) — 5-6 tentatives ratées d'affilée — annulé intégralement sur demande explicite ("effets merdique de transparence... c'est raté depuis 5/6 demandes") : toutes les déclarations `--edge-mask*`/`mask-*`/`-webkit-mask-*` retirées, seul le `clip-path` d'érosion (§ ci-dessus, validé et jamais remis en cause) reste actif. Au passage, bug distinct trouvé et corrigé sur `.daynight-card`/`.eda-showcase-card` : le bord inférieur des images restait droit (non érodé) car `margin-bottom:16px` était posé sur `.daynight-img`/`.eda-showcase-img` (l'`<img>` lui-même, À L'INTÉRIEUR du `.parchment-picture` recadré par `clip-path`) au lieu du wrapper `.parchment-picture` — la marge de l'enfant remontait dans la hauteur auto du parent `overflow:hidden` (contexte de formatage par bloc), créant un espace non découpé sous l'image visible. Fix : marge déplacée sur `.daynight-card .parchment-picture`/`.eda-showcase-card .parchment-picture`.

**🔊 Popup M "Sons activés/désactivés" (2026-07-20)** : touche M (`scene.js`) affiche désormais `showCenterMessage()` (même popup géant centré que le changement de thème/langue) au lieu de seulement basculer le son en silence. `toggleMute(ambientSoundDesign)` (déjà existant, `musicPlayer.js`) retourne l'état muet — texte choisi selon ce retour. Clé `game.sound.{on,off}` ajoutée aux 6 `json/languages/*.json` (même pattern réactif top-level `await fetch` + `registerLangRefresh` que `_snapshotCapturedText`).

**🎨 Sélecteurs langue/thème in-game figés en chrome bleu sidéral en thème médiéval — fix (2026-07-20)** : `#gameLangSelect`/`#gameThemeSelect` avaient été explicitement exclus de la conversion `button2.png` du 2026-07-19 ("pas des boutons CTA", cf. commentaire `eda.css`) — oubli signalé par l'utilisateur. Ajoutés au même traitement border-image 3-slice que leurs voisins du bandeau (`#snapshotBtn`/`#galleryBtn`/etc.), avec une particularité : `.debug-light-lang-select` pose un `background-image` 2 couches (dégradé + flèche SVG dorée) réécrit en 1 seule couche (flèche seule, marron `#4a3623`, fond transparent — le parchemin vient du border-image fill).

**📏 Normalisation typo de TOUS les boutons custom médiévaux sur la référence Abandonner/Nouvelle partie (2026-07-20)** : demande explicite d'uniformité — tous les boutons `button2.png` (pre-game + in-game) alignés sur `.abandon-button`/`.new-game-button` (`highscore.css`, référence : `monospace`/11px/900/`letter-spacing:0.06em`). 3 familles étaient divergentes (auditées via un agent dédié avant correction) : `.debug-light-toggle` (bandeau topbar + `#gameLangSelect`/`#gameThemeSelect`, `eda.css`) — hérité 800/0.08em, sans `font-family`/`font-size` du tout ; `.debug-light-weather-stopall` (`eda.css`) — juste `letter-spacing:0.08em` au lieu de 0.06em ; `.mode-panel button` (pre-game Créer/Rejoindre/Retour + Planiste/Globiste, `multiplayerUi.css`) — le plus divergent, hérité Georgia serif ~16px/800/0.04em. **Choix délibéré** : les 4 propriétés ajoutées/corrigées DANS les blocs `[data-theme="ancien"] ...` déjà existants plutôt que dans les classes de base non scopées — évite de propager le changement au thème Bleu sidéral, qui garde ses valeurs d'origine. Les boutons déjà en 11px/monospace/900/0.06em via leur classe de base (`.debug-light-tab-btn`, export Copier/Undo/etc., `.debug-light-weather-btn`, `.debug-light-preset-btn`) n'ont pas été touchés. Vérifié via `getComputedStyle` en direct sur les 2 écrans (pre-game + in-game) : tous les boutons retournent exactement `{fontFamily:"monospace", fontSize:"11px", fontWeight:"900", letterSpacing:"0.66px"}`, identique à la référence.

**🔠 Capitalisation Créer/Rejoindre/Retour (2026-07-20)** : demande explicite d'uniformité — ces 3 boutons pre-game (`multiplayerRooms.btnCreate/btnJoin/btnBack`) étaient en casse mixte dans les 6 `json/languages/*.json` alors que leurs boutons voisins sont tout en capitales. Root cause : littéraux JSON en casse mixte, pas une règle CSS `text-transform` manquante. Fix : valeurs uppercased dans les 6 fichiers (`"CRÉER"/"REJOINDRE"/"RETOUR"`, `"CREATE"/"JOIN"/"BACK"`, `"CREAR"/"UNIRSE"/"VOLVER"`, `"CREA"/"UNISCITI"/"INDIETRO"`, `"CRIAR"/"JUNTAR-TE"/"VOLTAR"`).

**🎲 Variation aléatoire manuscrit-1/manuscrit-2 (2026-07-20)** : l'utilisateur a fourni 2 variantes du fond parchemin (`images/manuscrit-1.png`/`manuscrit-2.png`, 9-slicing identique, pour casser l'effet de répétition visuelle sur les ~30 emplacements parchemin de l'UI). Nouveau module `javascript/parchmentVariant.js` : au chargement (+ idempotent via `dataset.parchmentVariant`), tire à pile ou face `data-parchment-variant="1"|"2"` par instance sur une liste fixe de sélecteurs (14 cartes prez + `.mode-panel`/`#scorePanel`/`.missionsBox`/`.fps-counter`/`.replay-panel`/`#kbdHintHud`/`.debug-light-body`/`.tileDeckBox`/`.snapshot-gallery-panel`), chargé en `<script type="module">` dans `index.php` ET `game.php`.
- **🐛 Bug résolu — manuscrit-2.png ne s'affichait jamais** : 1ère approche (variable CSS `--parchment-tex` posée en JS via `style.setProperty` avec une URL relative, substituée par `var()` dans les CSS) — cause root : une URL relative dans une custom property se résout au moment de la SUBSTITUTION, dans la feuille de style qui contient le `var()`, PAS dans le contexte où la propriété a été fixée. Les fichiers CSS à profondeurs différentes (`css/eda.css` → `../images/`, `css/themes/medieval.css` → `../../images/`) ne pouvaient donc jamais partager la même valeur JS. **Fix définitif** : abandon total des custom properties pour ce cas — les 27 déclarations `border-image-source` restent en `url("...manuscrit-1.png")` figé, chacune suivie d'une règle statique jumelle `[data-theme="ancien"] SELECTEUR[data-parchment-variant="2"] { border-image-source: url("...manuscrit-2.png"); }` écrite directement avec le bon chemin relatif dans chaque fichier source — élimine toute ambiguïté de résolution d'URL. **Règle générale à retenir : ne jamais faire porter une URL relative par une custom property CSS destinée à être consommée depuis plusieurs fichiers à profondeurs de dossier différentes.**
- Renommage complet `manuscrit.png`→`manuscrit-1.png` propagé (CSS/JS/CONTEXT.md).

**📐 Refonte hero-title / nav-logo / hero-version (prez, 2026-07-20)** :
- `.hero-title` agrandi (`clamp(68px,9vw,128px)`→`clamp(78px,10vw,160px)`), vérifié en direct qu'il n'occupe pas toute la largeur du conteneur.
- Header simplifié : `.nav-logo` ne garde que l'hexagone ⬡ (texte "HEXISTENZ" + version retirés du nav), agrandi en 2 passes (26px→40px→56px) puis aligné verticalement sur `.nav-links` via `position:relative; top:5px` (mesuré empiriquement par `getBoundingClientRect`, l'alignement flex par défaut divergeait à cause du padding asymétrique des liens de nav).
- "HEXISTENZ" + version déplacés en fin de `.hero-title` (`<span class="hero-version">`, alimenté par `$version` extrait par regex de `HEXISTENZ_VERSION` dans `javascript/variables.js` — source de vérité unique, confirmée par grep repo-wide). Reset explicite de l'héritage du gradient-text-clip du titre (`background:none; -webkit-background-clip:initial; -webkit-text-fill-color:initial`) sur ce span, sinon il hérite du texte transparent du dégradé du H1.
- `HEXISTENZ_VERSION` : v0.9.3.11 → v0.9.3.18 → v0.9.3.19 → **v0.9.3.22** (au fil des demandes, cf. §33 pour la suite).

**📣 Intro prez (`hero.tagline`) enrichie — jeu contemplatif, multijoueur, largeur, gras (2026-07-20)**, 4 demandes successives sur les 6 langues :
1. Ajout d'une phrase sur multijoueur/sauvegardes reprises/galerie de captures/replays accélérés.
2. Ajout d'une définition explicite de "jeu contemplatif" en phrase d'ouverture ("pensé pour les joueurs qui aiment observer longuement un monde et ses détails, sans se soucier du temps" — ES/IT/PT alignés sur la même structure en 4 paragraphes que FR/EN/QC, qui avaient été faits en 1er).
3. Passage de texte compact à volubile : 4 paragraphes séparés par `<br><br>` (le rendu passe par `el.innerHTML = value`, pas `textContent`, donc le HTML brut dans les JSON est bien interprété) ; `.hero-tagline` élargi `max-width:420px`→`720px` puis **`100%`** (occupe toute la largeur de `.hero-inner`, en grid `1fr` donc pas de colonne voisine à préserver) — signalé par l'utilisateur comme n'utilisant qu'un tiers puis un tiers de la largeur possible.
4. 4 phrases clé mises en gras (`<strong>`) dans les 6 langues : ouverture "jeu contemplatif", "Posez des tuiles hexagonales", "Jouez seul ou en multijoueur", "capturez vos plus beaux instants dans la galerie de captures" (et équivalents traduits).
5. Reformulation FR "pour celles et ceux qui aiment" → "pour les joueurs qui aiment" (retrait explicite de la formulation inclusive, FR uniquement — les autres langues n'avaient pas cette tournure).
6. Précision "replays en ligne téléchargeables" ajoutée à la fin du dernier paragraphe, dans les 6 langues (une 1ère passe n'avait couvert que le FR — corrigé sur rappel explicite de l'utilisateur : "les 6 langues sont concernées, on a 6 langues").

**🔠 Majuscules Créer/Rejoindre/Retour (2026-07-20)** : signalé comme incohérent — ces 3 boutons pre-game (`multiplayerRooms.btnCreate`/`btnJoin`/`btnBack`) étaient les seuls du panneau `.mode-panel` en casse mixte (aucun `text-transform:uppercase` en CSS sur `.mode-panel button`, contrairement à une fausse piste initiale) alors que leurs voisins du même écran (`worldShape.flat/globe` "PLATISTE"/"BOULISTE", `nameChoice.confirm` "CONTINUER →") sont des chaînes JSON littéralement en majuscules. Les 3 clés passées en capitales dans les 6 `json/languages/*.json`, pas de changement CSS (cohérent avec le pattern déjà établi du fichier).

## 33. Prez (musique/responsive) + HUD FPS/EDA basse résolution — chantier clos (2026-07-20, v0.9.3.19 → v0.9.3.22)

**🎵 Musique de fond auto sur la prez** : nouveau script inline (`index.php`, fin de `<body>`) — tire aléatoirement `sounds/music-ingame-1.ogg`/`-2.ogg`, `loop=true`, fade-in `requestAnimationFrame` jusqu'à `TARGET_VOLUME=0.070` (même palier que `MUSIC_MAX_VOLUME`, `musicPlayer.js`). Politique autoplay navigateur gérée comme le pattern existant `installMusicUnlock()` : tentative directe, sinon écouteur `pointerdown`/`keydown` one-shot en fallback.

**📐 Largeurs `.hero-tagline`/`.section-sub` corrigées à 100%** (`presentation.css`) : les deux avaient un `max-width` figé (720px/580px) bien inférieur à la largeur réelle de leur conteneur (`.hero-inner`/section, grid `1fr` — pas de colonne voisine à préserver) — signalé 2 fois par l'utilisateur. `max-width:100%` remplace la valeur fixe dans les deux cas.

**🎨 Gras tasteful sur les 12 `.section-sub`/promo** (6 langues) : `factions.sub`, `biomes.sub`, `gameplay.sub`, `missions.sub`, `gallery.sub`, `creatures.sub`, `audio.sub`, `daynnight.sub`, `multi.sub`, `multi.gallery_promo`, `multi.replay_promo`, `eda.sub` — un seul `<strong>` par texte sur l'expression clé, choisi par langue (pas de traduction littérale mot-à-mot du gras).

**🐛 Fix responsive `.gallery-card` (rubrique "Plusieurs atmosphères")** : à largeur de navigateur réduite, les images (psyché-LSD notamment) apparaissaient minuscules/disproportionnées. Root cause : 5 des 8 cartes portent un `style="grid-column:span 2"` INLINE (posé par PHP) ; le média-query mobile ne redéclarait `grid-column:span 1` que sur `.gallery-card:nth-child(1)` et SANS `!important` — inefficace sur 2 plans (ne ciblait qu'1 carte sur 5, et un style inline bat toujours une règle de classe quelle que soit la spécificité). Fix : `.gallery-card { grid-column: span 1 !important; }` dans le bloc `@media (max-width:900px)`, cible les 8 cartes.

**🖥️ HUD FPS replié masqué à faible hauteur de navigateur (1920×1080 compris)** : `@media (max-height:960px) { .fps-counter{display:none} .debug-light-panel.fps-hud-fullscreen .fps-counter{display:flex} }` (`eda.css`) — le HUD déployé (touche F) reste toujours visible, seul le badge replié se masque. **Seuil réel 960px, pas 800px** : un navigateur réellement redimensionné à 1920×1080 ne laisse qu'~895px de `window.innerHeight` (chrome navigateur ~185px) — un premier seuil à 800px avait été posé sans test empirique à cette résolution précise et ne se déclenchait donc jamais dans le cas pourtant explicitement visé ; corrigé après un bug signalé avec capture d'écran (chevauchement `#fps-counter`/`#scorePanel`).

**🖥️ Bandeau langue/thème/FPS/EDA fusionné sur une seule ligne** (`edaPanelHost.js`) — les 2 `<select>` et les 2 boutons partagent désormais UNE rangée `.debug-light-btn-row`, quelle que soit la hauteur du navigateur (économie de hauteur verticale empilée).

**Addendum 2026-07-31, demande explicite — 2 correctifs supplémentaires sur ce même bandeau :**
- **Badge FPS replié rendu INVISIBLE en permanence** (`css/eda.css`, règle `.fps-counter`) : jusqu'ici il restait affiché en continu (résumé FPS/CPU/GPU, `_buildHud()` avec `_fpsHudExpanded=false`), seul le panneau détaillé (touche F) était optionnel. `display: none` posé par défaut sur `.fps-counter`, ré-autorisé UNIQUEMENT par `.debug-light-panel.fps-hud-fullscreen .fps-counter { display: flex; }` — posée par `_syncFpsFullscreen()` (`hud_fps.js`) quand `_fpsHudExpanded=true`, donc seulement via la touche F ou le bouton FPS du bandeau. Rend caduques (laissées en place, inoffensives) les anciennes règles qui ne masquaient le badge replié que dans des cas particuliers (`body.grid-only-mode`, `@media max-height:960px` ci-dessus — cette dernière simplifiée en simple note historique, son comportement étant désormais couvert par le nouveau défaut).
- **Les 2 rangées de boutons fusionnées en UNE SEULE** (`edaPanelHost.js`) : 📷/🖼️/🎬/😃/🔊 d'un côté et langue/thème/FPS/EDA de l'autre (2 lignes depuis le 2026-07-20 ci-dessus) partagent maintenant un seul `.debug-light-btn-row` — les 9 contrôles s'alignent horizontalement. `.debug-light-btn-rows` (wrapper colonne) conservé tel quel malgré son enfant unique désormais, pour ne pas toucher au reste du CSS.
- Vérifié en direct (192.168.0.41, thème médiéval) : badge FPS totalement absent au chargement et après fermeture du panneau détaillé, réapparaît en plein (60 FPS, détail complet) au clic sur FPS/touche F ; les 9 contrôles confirmés sur une seule ligne par capture d'écran.

**🐛🐛🐛 Panneau EDA illisible/tronqué à faible hauteur — 3 itérations avant la bonne solution, 2 régressions corrigées en cours de route :**
1. **1ère cause** (bandeau ambiances + onglets + footer tous `flex-shrink:0`) : tout le déficit de hauteur retombait sur `.debug-light-tab-panels`, l'écrasant à ~25px — techniquement scrollable (`overflow-y:auto`) mais visuellement inexploitable. 1ère tentative fautive : rendre `.debug-light-body` (+ `.internal-parchment` ancien) ET `.debug-light-header` (bandeau ambiances) rétrécissables/scrollables — **régression signalée** : le bandeau ambiances doit rester incompressible, jamais rétréci ni scrollé. Revert intégral de ces 2 changements (`.debug-light-header` → `flex-shrink:0` fixe, `.debug-light-body`/`.internal-parchment` ancien → `overflow:hidden` comme à l'origine).
2. **Vraie root cause du "scroll pas effectif"** : `.debug-light-columns` (flux journal `columns:3`) portait SA PROPRE hauteur bornée (`flex:1 1 auto; min-height:0`) EN MÊME TEMPS que `overflow-y:auto`. Or **le CSS multi-colonnes ne déborde jamais verticalement sur sa propre boîte** — passé la hauteur impartie, le navigateur ajoute une 4e/5e colonne EN PLUS (à droite), jamais une extension vers le bas ; avec `overflow-x:hidden`, ces colonnes en trop étaient invisibles et à jamais inaccessibles, alors que la scrollbar verticale n'avait elle-même rien à faire défiler (chaque colonne tient par définition dans la hauteur impartie). **Fix définitif** : le scroll/la hauteur bornée sont désormais portés par `.debug-light-tab-panels` (parent), pas par `.debug-light-columns` lui-même — celui-ci n'a plus ni `flex`/`min-height`/`overflow` propres, il se dimensionne à sa hauteur naturelle de contenu (jamais de 4e colonne, aucune limite ne le contraint), et c'est son ancêtre borné qui scrolle pour révéler l'intégralité du bloc. **Règle générale : ne jamais poser `overflow-y:auto` directement sur un élément `columns:N` qui a lui-même une hauteur bornée — toujours déporter le scroll sur un conteneur ANCÊTRE non-multicol.** `.debug-light-tab-panels` garde un plancher `min-height:220px` (seul élément flexible du groupe, bandeau ambiances/onglets/footer restant `flex-shrink:0` fixes).
3. **🎨 Régression cosmétique corrigée séparément** : le thème médiéval héritait des couleurs bleutées codées en dur du thème "Bleu sidéral" sur les sliders (`.debug-light-row input[type="range"]`, communes aux 2 thèmes faute de redéclaration) et sur l'ascenseur `.debug-light-tab-panels` (nouveau, cf. point 2) — jamais thémé côté ancien. Fix : overrides `[data-theme="ancien"]` dédiés (piste/pouce du slider + `scrollbar-color`/`::-webkit-scrollbar-thumb`) en `#8a6a2a`/`#f0e0b8` (même accent doré "cachet de cire" que les titres de rubrique EDA), au lieu du bleu `rgba(120,170/180,255,...)`.

Vérifié en direct (Claude in Chrome) : real 1920×1080 (895px `innerHeight`), 750px et 550px de hauteur fenêtre, 2 thèmes, footer/onglets/ambiances tous atteignables après fix, sliders/ascenseur médiévaux dorés.

---

## 34. Audit code (JS/CSS/PHP) — chantier clos (2026-07-28, v0.9.3.22 → v0.9.3.23)

Relecture systématique demandée par l'utilisateur, sans modification avant validation. 16 points relevés, priorisés en 3 lots ; 4 points explicitement écartés (voir fin de section). Tout a été **vérifié en direct sur 192.168.0.41** via Claude in Chrome (mesures d'instrumentation, pas d'appréciation à l'œil).

### 🐛 Le vrai bug : `with_room_lock()` supprimait son propre fichier verrou

Découvert hors audit, en instrumentant la console F12 que l'utilisateur signalait saturée d'erreurs 500 (`Impossible de créer le verrou multiplayer dans /json/games.`).

`multiplayer.php::with_room_lock()` faisait `@unlink($lockPath)` dans son `register_shutdown_function`. Deux conséquences :
1. **Fenêtre d'échec** — pendant la suppression, un `fopen()` concurrent sur le même chemin échoue (sous Windows, ouvrir un fichier en cours de suppression lève une violation de partage) → HTTP 500. En jeu, le poll (900 ms) et les envois de curseur (à chaque déplacement souris) se chevauchent en permanence.
2. **Exclusion mutuelle rompue, et silencieuse** (le plus grave) — si A détient le verrou puis supprime le fichier, B recrée un fichier NEUF et verrouille celui-là : deux requêtes croient tenir le verrou simultanément et peuvent écrire `room_*.json` concurremment.

**Un fichier verrou est un jeton de 0 octet : il doit PERSISTER.** `unlink` retiré, plus une boucle de 5 tentatives `fopen` espacées de 20 ms (filet pour un verrou laissé par l'ancienne version en cours de suppression).

Mesuré avant/après : **20 requêtes concurrentes → 14 × HTTP 500** ; après correctif, **60 requêtes concurrentes → 0 erreur**, et 12 s d'activité curseur soutenue sans une ligne de console.

### Lot 1 — chemin chaud du panel EDA

- **`rainCloudOverlay.js`** — `onVfxSettingsChange` reçoit désormais `(effect, key)` et filtre par CLÉ. Avant, n'importe quel réglage `clouds`/`rain` déclenchait un rebuild complet (19 200 instances de pluie + 2 880 impacts avec un `getTerrainSurfaceY()` chacun + `mergeGeometries` de 32 maillages), à chaque évènement `input` d'un drag (~60/s). Sur les 6 réglages, seuls `clouds.densite` et `clouds.epaisseur` touchent réellement la géométrie ; `clouds.altitude` passe par `_applyCloudAltitude()` (translation `mesh.position.y` + uniform, l'altitude bakée étant mémorisée dans `overlay._bakedCloudAltitude`), `rain.tailleGoutte` par `_applyRainDropSize()` (2 uniforms), et `rain.densite`/`rain.impactSol` ne demandent RIEN (déjà lus chaque frame par `updateRainCloudOverlay` via `uActiveRatio`/`uIntensity`). Mesuré : 4 sliders sur 6 passés de ~0,30 ms à ~0,01 ms par évènement (**~25×**), et ce sur un plateau VIDE — l'écart est bien plus large en partie réelle.
- **`edaPanelWiring.js` + `vfxSettings.js`** — les 5 paires `_readXStored()`/`_storeXSettings()` (CINÉMA/PIX/EAU/VENT/NUAGES), strictement identiques au nom de clé près, deviennent un `makeStore(key)` unique. **Écritures `localStorage` debouncées à 200 ms** : chaque slider commit à chaque `input`, or `localStorage.setItem` est SYNCHRONE et re-sérialise tout l'objet — saccades garanties au drag. Un seul timer + une `Map` de pending pour les 6 clés (`saveLutConfig` inclus), `flush` sur `pagehide` pour ne rien perdre si l'onglet se ferme sous les 200 ms. Même traitement dans `vfxSettings.js` (**divergence assumée vs le fichier livré par Cyril**, à reporter lors d'un futur merge). Mesuré : 60 évènements `input` → **0 écriture pendant le drag, 1 après** (contre 60).
- **`characterOverlay.js` / `houseOverlay.js` / `tileUtils.js`** — `group.clear()` remplace `while (children.length) children.pop()`. L'intention (ne pas disposer des geometry/material partagés en cache) était juste et documentée, mais vider le tableau à la main laisse `child.parent` pointant vers le group → InstancedMesh orphelins se croyant attachés. `clear()` détache ET remet `parent` à null sans toucher aux ressources. `clearGroup` (tileUtils) passe par `group.remove(child)` avant `disposeObject3D`.

### Lot 2 — surface serveur

- **`debug_paths()`** renvoyait le chemin ABSOLU du serveur, ses droits d'écriture et la LISTE COMPLÈTE des parties existantes, à quiconque déclenchait une erreur (`?action=poll&code=XXXX` inconnu suffisait). Vérifié par grep : aucun de ces champs n'est lu côté JS. Gaté derrière `MULTIPLAYER_DEBUG` (false), tout comme les messages d'exception bruts. **La constante est déclarée en TÊTE de fichier** : `define()` n'est pas hoisté comme les déclarations de fonctions, et le bloc `try` l'utilise dès ses premières lignes — la placer près de `debug_paths()` casserait tout le multi au premier appel.
- **`MAX_POST_BYTES` = 2 Mo** sur le corps POST de `multiplayer.php`, qui n'en avait aucun (contrairement à `snapshot.php`, plafonné à 15 Mo) : un client pouvait POSTer un `state` arbitrairement gros, `json_decode`é puis réécrit tel quel sur disque.
- **`json/.htaccess` + `json/games/.htaccess`** (serveur identifié : Apache 2.4.58). L'auto-index était actif : `GET json/games/` listait les 10 codes de parties et chaque `room_*.json` était téléchargeable en clair, hors API ; `highscores.json` (pseudos + stats) idem. Ces fichiers ne sont JAMAIS demandés par le navigateur — `multiplayer.php`, `highscore.php` et `index.php` les lisent via `__DIR__`, ce que `.htaccess` n'affecte pas. Vérifié après coup : `json/games/` **403**, `room_SMALL.json` **403**, `highscores.json` **403**, `ambiances.json` **200**, `languages/french.json` **200**, `multiplayer.php?action=list` **200**.

### Lot 3 + allègement de la prez

- **`scene.js`** — les 3 `scene.getObjectByName()` PAR FRAME (étoiles, lumière soleil, cible soleil) sont mémoïsés via `_sceneRef(cached, name)`, `entry.parent` servant de sentinelle pour re-résoudre si l'objet quitte la scène. `getObjectByName` parcourt récursivement tout le graphe : c'était 3 traversées complètes 60 fois/s pour des objets créés une fois au montage. Le `.clone()` du vecteur de direction solaire est remplacé par un `Vector3` de travail (`_sunDirScratch`).
- **`visualEnvironment.js`** — `applyVisualEnvironment()` faisait 5 `getObjectByName()` par appel (3 lumières + cible du soleil + soleil visible), or `apply()` est appelé à chaque `input` de slider LUT via `applyAll()`. Cache `WeakMap(scene → Map(nom → objet))` (`_cachedByName`), et les 3 `findOrCreate*Light` passent par un `_findOrCreate` commun (supprime aussi la triplication du motif).
- **`game.php` + `css/style.css`** — la chaîne de 9 `@import` de `style.css` devient 13 `<link>` explicites, **chacun avec son propre `?v=<filemtime>`**. Deux défauts corrigés d'un coup : (1) un `@import` n'est découvert qu'après téléchargement ET parsing du fichier qui le contient, invisible pour le preload scanner → un aller-retour réseau supplémentaire avant que les 9 feuilles ne démarrent, tout en bloquant le rendu ; (2) les URL d'`@import` ne portaient aucun `?v=`, donc bumper `style.css` ne revalidait jamais `base.css`/`eda.css`/`help.css`… (cause probable des « aucun effet »/« exactement pareil » signalés de longue date sur les HUD — le commentaire `game.php` l'avait à moitié identifié, mais la parade ne propageait pas). `style.css` est vidé et commenté, plus lié nulle part, supprimable une fois les caches en circulation expirés.
- **`index.php` — i18n à la demande** : PHP embarquait les 6 fichiers de langue (≈408 Ko) dans le `<head>` de chaque chargement, dont ~340 Ko jamais utilisés. Désormais seuls le français (repli obligatoire de `resolveI18n` + langue du rendu PHP) et, s'il diffère, la langue préférée du visiteur — lue dans un **cookie** `hexistenz_pres_lang` posé par `setLang()`. Les autres arrivent via `ensureLang(l)` en `fetch('./json/languages/<file>.json')` à la bascule (une requête, mise en cache navigateur). `setLang` devient `async`. Le cookie ne sert QU'À choisir quoi pré-charger : absent ou inconnu → repli français, aucun risque fonctionnel. Mesuré : **i18n 408 → 58 Ko, page 470 → 140 Ko**, bascules es/it/fr vérifiées, aucun clignotement pour un visiteur qui revient dans sa langue.

### Écarté sciemment

- **Clés `localStorage` incohérentes** (`dorfromantik.multiplayer.name`, `dorfoPixelPostprocessSettings.v4`, `hexistenz_*`, `hexistenz.playerName`) — renommer casserait les préférences de tous les joueurs pour zéro bénéfice fonctionnel. L'incohérence est laide mais inerte. À ne faire qu'avec une vraie migration lecture-ancienne-clé → écriture-nouvelle.
- **`setInterval` sans `clearInterval`** (`edaPanelWiring.js` refresh météo 500 ms, `scene.js` poll multi 900 ms) — aucun impact tant qu'il n'y a pas de démontage/remontage de scène. À ressortir si le jeu passe en navigation SPA.
- **Bloc de surcharge `.help-panel` après la media query** (`help.css` l.~314) — fonctionne aujourd'hui parce que les propriétés ne se recouvrent pas, mais tout ajout dans l'un des deux blocs peut silencieusement annuler l'autre. Réordonner demanderait de re-tester l'aide à plusieurs largeurs pour un problème qui ne se manifeste pas encore.
- **Authentification multijoueur** — site public mais faible affluence, parties entre amis (arbitrage utilisateur). Le durcissement s'est limité au `.htaccess` ci-dessus ; l'action `list` reste ouverte car c'est une vraie fonctionnalité (sélecteur de parties du menu).

### Code mort identifié (non supprimé, à traiter à l'occasion)

`css/postprocessHud.css` (3,7 Ko, plus chargé nulle part — seul un commentaire de `style.css` y fait référence) · `replayGallery.js::openReplayGallery` jamais appelé (overlay inatteignable) · `startupMenuShared.js::getPlayerNameFromCookie`/`savePlayerNameCookie` (le nom joueur passe en réalité par `localStorage`) · `environmentDirector.js::getEnvironmentSnapshot` · `gridRegions.js::getRegionOccupancy`. (`getRainCloudAnchors` est mort aussi mais documenté/assumé pour le futur `lightningOverlay`.)

---

## 35. TTS ingame — annonces vocales (`ttsAnnouncer.js`)

Lit à voix haute, dans la langue actuellement sélectionnée (9 langues), certains évènements de jeu via la Web Speech API du navigateur (`SpeechSynthesis`), sans service externe.

**Module central : `javascript/ttsAnnouncer.js`.** Suit le même mécanisme réactif top-level-await + `registerLangRefresh` que le reste du code i18n (cf. §20/§30) : les gabarits de phrases sont chargés une fois depuis `game.tts` (`json/languages/*.json`) puis mis à jour automatiquement si la langue change en cours de partie.

### Déclencheurs

Tous câblés au(x) choke point(s) unique(s) de leur action, jamais dupliqués par entrée (touche/bouton/clic overlay) :

- `announcePoints(score)` — à chaque pose qui rapporte un score strictement positif (`scene.js::placeTile`, même condition que `showScorePopup`).
- `announceMissionCompleted(completedMissions)` — une seule annonce même si plusieurs missions se terminent d'un coup, précédée d'un jingle (cf. pools ci-dessous).
- `announceNewMission(mission)` — titre via `formatMissionTitle()` (`missionLabels.js`), précédée d'un jingle.
- `announceEdaOpened()` / `announceHelpOpened()` — à l'ouverture des panneaux EDA/Aide (`edaPanelWiring.js::_setLutOpen`, `scene.js::toggleHelp`).
- `announceStatsIfChanged(stats)` — un compteur (moulins/trains/bateaux/comètes) annoncé individuellement s'il a changé depuis le dernier appel (`scene.js::refreshStatsUI`) ; aucune annonce au premier appel (évite un "0 moulins" parasite au chargement). Texte préfixé "Tu as {n}..." (FR) / équivalent informel par langue.
- `announceVoiceOn()` / `announceSoundOn()` — uniquement à la RÉACTIVATION des touches T/M respectivement (jamais à la coupure, silence par définition).
- `announceLanguageChanged()` / annonce de thème — au changement via les sélecteurs `#gameLangSelect`/`#gameThemeSelect` (jeu) et `#langSelect`/`#themeSelect` (prez, cf. plus bas).

### File d'attente de tour vs annonces UI isolées

Deux régimes distincts, volontaires :

- **Annonces de tour** (`announcePoints`/`announceMissionCompleted`/`announceNewMission`/`announceStatsIfChanged`) passent par une file maison — `_enqueue()`/`_queueGen`/`_queueTail` (Promises chaînées) — plutôt que par la file interne de `speechSynthesis`, qui ne sait pas intercaler un fichier audio (jingle) au bon moment. Chaque job n'est exécuté qu'une fois le précédent RÉELLEMENT terminé : `_speakAndWait(text)` résout sur `utterance.onend`/`onerror` plutôt que de rendre la main dès l'appel de `speak()`. `resetTtsQueue()` (appelée une seule fois en tout début de la séquence d'annonces de `placeTile()`) incrémente `_queueGen` et réinitialise `_queueTail` en plus de `speechSynthesis.cancel()` — les jobs déjà empilés d'un tour précédent (génération périmée) sont silencieusement ignorés plutôt que de parler en retard.
- **Annonces UI isolées** (EDA/aide/voix-on/son-on/langue/thème) appellent `resetTtsQueue()` puis `speak()` classique (fire-and-forget) — retour immédiat sur une action ponctuelle, pas besoin d'attendre la fin de l'énoncé.

### Jingles de mission — pools + séquencement

`announceNewMission`/`announceMissionCompleted` sont précédées d'un jingle audio ponctuel, tiré au hasard (`_pickCue(urls)`, `Math.random()`, pas d'anti-répétition) dans un pool : `MISSION_NEW_SOUND_URLS` (3 variantes, `mission-new-1/2/3.ogg`) et `MISSION_SUCCESS_SOUND_URLS` (4 variantes, `mission-succes-1/2/3/4.ogg`). Les 7 fichiers sont dans `ASSETS_OGG` (`preloader.js`).

Séquence voulue : **SON complet → 150 ms de silence → TTS** (`_playCueThenSpeak`, `MISSION_SOUND_TO_TTS_DELAY_MS = 150`). Deux bugs corrigés au fil de l'implémentation, tous deux dus à une approche "fire-and-forget" trop optimiste :
1. **Ordre cassé sur un tour à 3 annonces** — chaque `announce*` appelait `speak()` indépendamment, en comptant sur la file interne `speechSynthesis` (correcte pour l'ordre des voix) mais celle-ci ne sait rien du jingle hors-TTS ; le jingle de la 3e annonce partait donc immédiatement à l'appel JS, avant que les 2 premières phrases aient fini. Fixé par la file maison ci-dessus.
2. **Chevauchement son/TTS** — `_playCue()` ne faisait que DÉMARRER le jingle puis rendait la main aussitôt ; les 150 ms étaient donc comptés depuis le DÉBUT du son, pas sa FIN. Invisible avec l'ancien fichier unique (~1,2 s), flagrant avec les variantes de pool plus longues (`mission-new-2.ogg` mesuré à 2,39 s). Fix : `_playCue()` retourne désormais une Promise résolue sur l'évènement `ended`/`error` de l'`Audio`, attendue avant le `_waitMs(150)`. Vérifié en direct avec horodatage réel : `mission-new-2.ogg` (2391 ms) → TTS démarré à 2557 ms (+166 ms) ; `mission-succes-3.ogg` (3043 ms) → TTS démarré à 3197 ms (+154 ms) — aucun chevauchement.

### Sélection de voix (`_pickVoice`)

Priorité à une voix système correspondant EXACTEMENT à la locale BCP-47 (`TTS_LOCALES` : fr→fr-FR, en→en-US, es→es-ES, it→it-IT, pt→pt-PT, de→de-DE, ru→ru-RU, fr-CA→fr-CA, fr-MED→fr-FR), sinon repli sur la même famille (`fr-*`). L'étape de correspondance exacte utilise `.filter()` (pas `.find()`) pour pouvoir choisir PARMI plusieurs voix exactes quand la langue en a plusieurs installées (cas allemand/russe, cf. ci-dessous), puis applique `FALLBACK_VOICE_HINTS` à cet ensemble filtré.

**Voix masculine forcée pour DE et RU** (exigence explicite) : `FALLBACK_VOICE_HINTS.de`/`.ru` listent des noms de voix masculines connues (Stefan/Markus/Conrad/Yannick/Klaus côté DE) ; sélectionnées en priorité si présentes parmi les voix "de-DE"/"ru-RU" installées. Vérifié avec des voix simulées (monkey-patch `speechSynthesis.getVoices()`) faute de plusieurs voix natives disponibles sur le poste de test.

**fr-CA distinct de fr** : aucune voix `fr-CA` dédiée n'est installée sur le poste testé — `FALLBACK_VOICE_HINTS` choisit alors un nom de voix différent de celui utilisé par `fr` pur au sein de la famille `fr-*`, pour un rendu au moins audiblement distinct (les 2 gabarits de texte sont de toute façon différents — fr-CA en registre "québécois" volontairement enjoué).

### Langues (9) et cache-busting JSON

Les gabarits `game.tts.*` sont traduits dans les 9 `json/languages/*.json` (fr/en/es/it/pt/de/ru/fr-CA/fr-MED). `german.json`/`russian.json`/`french-medieval.json` suivent le même pattern d'intégration à 3 lignes (`LANG_FILES` dans `gameLangReactive.js`, `$LANG_FILES` dans `index.php`, `<option>` dans le sélecteur `edaPanelHost.js`) — `game.php` n'a besoin d'aucune modification, son `$langVersion` scanne `json/languages/*.json` via `glob()`.

Les `fetch()` de `json/languages/*.json` (21 points, 18 fichiers JS) sont cache-bustés via `?v=<filemtime>` (`getLangVersion()`/`getLangUrl()`, `gameLangReactive.js`), alignés sur le même système que le CSS. **Exception documentée, hors périmètre** : `index.php` (la prez) a son propre mécanisme `ensureLang()` de chargement paresseux, cache long assumé comme choix de perf pour cette page précise.

### Touche `T` (jeu) et `M`/`T` (prez)

**En jeu** : `T` coupe/rétablit les annonces vocales UNIQUEMENT (musique/ambiance gérées séparément par `M` → `musicPlayer.js::toggleMute`, ré-exportées via `soundDesign.js`). État de session, pas de persistance. Documentée dans l'aide (touche `H`) et dans `index.php` (rubrique Contrôles clavier), 9 langues.

**Sur la prez `index.php`** — page hors du graphe de modules du jeu (tout son JS est un `<script>` classique, pas `type="module"`) : les touches étaient déjà documentées dans le bandeau clavier mais purement décoratives (aucun effet sur la page elle-même) jusqu'à leur câblage effectif. `M` coupe/rétablit `initPrezMusic()` (l'instance `Audio` est exposée via `window.__prezMusicAudio` pour que le listener clavier la joigne ; `.muted` plutôt qu'un volume à 0, pour ne pas interférer avec le fondu d'entrée). `T` coupe/rétablit `speakPrez()` via le garde-fou `_prezTtsMuted`. Confirmation vocale à la réactivation seulement, réutilise les clés déjà traduites `game.sound.on/off`/`game.tts.voiceOn/Off` (aucune nouvelle clé). `isPrezFormTarget()` exclut `input`/`select`/`textarea`/`contentEditable` du handler — nécessaire ici (contrairement au jeu) car la prez a 2 `<select>` visibles (langue/thème) où taper `m`/`t` doit rester un raccourci de sélection natif.

Un toast `#prez-toast` (`css/presentation.css`, variables de thème existantes `--bg-card`/`--text`/`--gold`, donc cohérent avec les 2 thèmes sans code additionnel) confirme visuellement LES DEUX directions pour M et T — nécessaire car la page n'a pas de popup central comme le jeu, et une coupure sans aucun retour (ni son ni visuel) donnait l'impression que la touche "ne faisait rien".

`speakPrez()` — mécanisme autonome dupliqué de `ttsAnnouncer.js` (TTS_LOCALES/FALLBACK_VOICE_HINTS/_pickVoice) plutôt qu'importé : la prez a son propre système de langue (`setLang()`/`I18N`/`ensureLang()`), indépendant de `gameLangReactive.js` — les callbacks `registerLangRefresh` de `ttsAnnouncer.js` ne se déclenchent que via `setGameLang()`, jamais appelée par la prez. `setLang(l, announce=true)`/`setTheme(th, announce=true)` : les appels d'initialisation (restauration depuis `localStorage` au chargement) passent `announce=false` pour ne jamais parler toute seule au chargement.

### Pièges connus / hors périmètre

**Cache HTTP des modules JS** : `<script type="module">` et les `import` internes n'ont AUCUN cache-busting (contrairement au JSON i18n et au CSS) — un navigateur ayant déjà chargé le jeu peut garder un fichier `.js` en cache indéfiniment, y compris après un edit confirmé sur disque. Symptôme typique : une fonction "n'existe pas" ou un comportement pré-édit persiste malgré le code à jour sur le serveur. Un rechargement forcé (Ctrl+Shift+R) suffit systématiquement ; gap connu, jamais traité (portée jugée trop large pour l'instant).
---

## 36. Orage → Éclair → Feu (`lightningOverlay.js` + `fireOverlay.js`) — travaux Cyril, mergés 2026-07-30

Chaîne visée par la roadmap : **Orage → Éclair frappe une tuile → Feu → propagation → Panique animale → extinction → conséquences (score)**. Au 2026-07-30 : **F1 clos, F2 en grande partie fait**, P1 (panique) et S1 (score/son) non commencés. Le feu est **purement cosmétique** : aucun impact gameplay, décision de design encore ouverte.

### Ce que ça fait

`lightningOverlay.js` tire un point de frappe sous les nuages via `getRainCloudAnchors()` et notifie `(x, z, t)` par le hook **`onLightningStrike(listener)`**. `fireOverlay.js` s'y abonne : si la tuile frappée est inflammable (tout sauf `water`/`rail`), un **foyer** s'allume avec une probabilité réglable.

Cycle par objet touché : les flammes montent **le long du modèle 3D**, dimensionnées sur sa **hauteur réelle** ; l'objet vire à la teinte feu puis au noir charbonné (`CHAR_RAMP` 3.5 s) ; une fois consumé les flammes **retombent et se détachent**, puis repartent avec la dérive du foyer ; après extinction, maintien charbonné puis **repousse** vers la couleur d'origine. Rien n'est détruit définitivement.

Couvre arbres, maisons, tours de guet, moulins, bottes de paille. Les **rochers se couvrent de suie sans jamais s'enflammer** (`flammable: false`). Le foyer dérive au vent, **accroche les props rencontrés en route** (horloge de combustion propre à chacun), se propage aux tuiles voisines avec un biais vent, et **s'arrête au bord de l'eau** comme au bord du plateau.

### `propHitboxRegistry.js` — point de rendez-vous props ↔ feu

Le registre transporte désormais une poignée `meta` optionnelle, **sans rien connaître de THREE.js ni de l'instancing** :

| champ | rôle |
|---|---|
| `setColor(color)` | recolore l'instance ou l'objet unique ; `null` = restaure l'original |
| `height` | **hauteur réelle** du modèle |
| `kind: 'landmark'` | tour, moulin — posés 1× par tuile/zone |
| `flammable: false` | rocher — noircit mais n'attire aucune flamme |

Trois pièges à ne pas « simplifier » :

1. **`height` est indispensable** : le rayon de hitbox ne dit rien de la hauteur (tour : rayon 0.218, hauteur 0.411). C'est exactement ce qui rendait les flammes invisibles sur les grands modèles.
2. **La résolution d'instance se fait PAR POSITION, pas par index mémorisé** (`_findInstanceIndexNear`). Un index capté à la collecte devient faux dès le rebuild suivant — or toute pose de tuile en déclenche un.
3. **`getPropRegistryGeneration()` est un impératif de perf**, pas un confort. Le feu appelle `setColor` à chaque frame sur chaque objet en train de brûler ; la recherche par position est en O(nb instances). Le compteur permet aux closures de mettre leur résultat en cache et de ne le recalculer qu'au rebuild réel.

Les `landmark` (tour, moulin) sont **recherchés séparément** : posés une fois par tuile/zone, ils ne sont jamais garantis parmi les 3 props les plus proches. Les inflammables sont **triés en premier** pour qu'une nuée de rochers ne sature pas les places de cibles au détriment d'une maison voisine.

### ⚠️ Bug de fond corrigé au passage (hors périmètre feu)

Dans `scene.js`, chemin de synchro multijoueur, `resetPropHitboxRegistry()` était appelé **à chaque poll** alors que les rebuilds qui repeuplent le registre sont **conditionnels** :

```js
resetPropHitboxRegistry();                          // ← était à CHAQUE poll
if (_addedKeys.length > 0 || _removedCount > 0) {   // ← rebuilds seulement si changement
```

Registre vidé en boucle et jamais reconstruit, silencieusement (aucune erreur console). Mesuré sur 225 tuiles : **0 hitbox → 610** après correction (dont 380 inflammables, 176 rochers, 19 repères). Impact au-delà du feu : **`tryResolve()` était aveugle**, les props « mous » (tonneaux, charrettes, bancs, panneaux) pouvaient se placer en chevauchant maisons et arbres. Le reset est désormais **à l'intérieur** du bloc conditionnel.

### Perf — mesures réelles

`MAX_FLAMES_PER_FOYER = 8` (relevé de 5), `MAX_BURNING = 8` foyers, `MAX_CHAR_TARGETS = 10` par foyer. Coût **fill-bound**.

En conditions réelles (orage + éclairs + feu, réglages par défaut) : **60 FPS constants, GPU ~34 %**. En test de stress artificiel (proba d'allumage 1, fréquence d'éclairs 1, taille et densité de flammes au maximum) : **effondrement à 1-2 FPS**. Ce n'est pas une régression, c'est le comportement fill-bound annoncé — une partie réelle ne compte que 1 à 2 foyers.

### Extinction par la pluie — recalibrée après mesure

Défaut de conception trouvé le 2026-07-30 : un feu ne peut naître **QUE** pendant un orage (l'éclair exige `storm`), et `fireOverlay` teste `rainy = rain || storm` — or `rain` et `storm` sont mutuellement exclusifs (`exclusiveGroup: 'weather'`). Donc **« sous la pluie » est le cas général, jamais l'exception**.

| | ancien (1.0 / 0.05) | actuel (0.35 / 0.013) |
|---|---|---|
| durée sous pluie | 15.3 s (**÷2**) | 19.8 s (65 %) |
| foyers noyés | **53 %** (8/15) | **23 %** (7/30) |

Constantes : `RAIN_BURNOUT_ACCEL = 0.35`, `RAIN_DOUSE_PER_SEC = 0.013`.

*Piège de mesure, si le test est refait* : une tuile dont la dérive est bloquée fait sauter `age` à `growD+platD` (8 s au lieu de 30.5 s) et fausse tout. Choisir une tuile où la dérive passe.

### HUD FPS

Meshes nommés `hexistenz-vfx-fire*` et `hexistenz-vfx-lightning*`, classés dans `sceneProfiler.js` (catégories « Feu » et « Éclairs »), dans `_classifyInstanced` (fumée/braises = `VFXParticles`) **et** `_classifyMesh` (flammes, lueur, décalque, zébrure). ⚠️ La règle `startsWith('hexistenz-vfx-fire')` exclut explicitement `hexistenz-vfx-fireflies` — les lucioles commencent par le même préfixe.

### Réglages EDA

Rubrique **🔥 Feu** (onglet Environnement) : `probaAllumage`, `densiteFlammes`, `duree`, `taille`, `propagation` — libellés i18n dans les 9 langues sous `game.eda.labels.vfx.fire`.

### Limite connue

⬜ **Pas de mémoire du sol consumé** : rien n'empêche un nouveau foyer de rallumer une tuile déjà brûlée. C'est le **seul point restant de F2**.

### Fausse piste documentée — LOD ≠ chape

Un symptôme « la grille et les objets disparaissent d'un coup à une certaine hauteur caméra, seuls les badges hexagonaux flottent sur le vide » a d'abord été attribué à la chape d'orage. **C'est faux.** Mesure A/B à caméra strictement identique : **359 draw calls et 6 casters d'ombre, orage allumé COMME éteint**. Le culling vient des `updateXxxLOD` (`child.visible = distSq < cullDistSq && frustum.intersectsSphere(sphere)`, booléen sec sur la distance caméra→objet), mécanisme **préexistant** et volontaire, avec des seuils serrés (arbres 11.0, maisons 11.4, tours 11.9, rails 13.0). Les badges survivent parce qu'ils sont du DOM superposé au canvas. Comportement validé tel quel par l'utilisateur — **ne pas y toucher**.

## 37. HUD basse résolution — `#debugLightPanel` + `#scorePanel` (chantier clos, 2026-07-31, v0.9.3.34 — sans bump)

Objectif utilisateur : rendre le jeu jouable sur écran étroit/FHD, où deux HUD débordaient ou envahissaient l'écran. Trois correctifs dans `css/eda.css` et `css/base.css`, deux d'entre eux corrigés une 2e fois après retour utilisateur (régressions).

### `#debugLightPanel` — alignement à droite + wrap 2 lignes

Les 9 boutons/selects du bandeau in-game (photo/galerie/replay/TTS/son/langue/thème/FPS/EDA) vivent dans `.debug-light-left-col`, seul enfant visible de `.debug-light-panel` (`display:flex; justify-content:space-between`) tant que `.debug-light-body` (panel EDA déployé) est masqué — **un unique enfant flex sous `space-between` se colle mécaniquement à `flex-start` (gauche)**, indépendamment du nom de la classe. `.debug-light-btn-row` n'avait par ailleurs aucun `flex-wrap`, donc les 9 contrôles (chacun `flex-shrink:0`) débordaient hors écran en basse résolution au lieu de passer à la ligne.

Fix retenu : `.debug-light-btn-row { flex-wrap: wrap; max-width: calc(100vw - 28px); justify-content: flex-end; }` (borne fluide, pas de media query — se déclenche dès que le contenu dépasse). Pour l'alignement à droite, **1ère version fautive** : `.debug-light-panel.collapsed { justify-content: flex-end }`, qui déplaçait toute la boîte `.debug-light-left-col` — y compris `#fps-counter` (HUD FPS avancé, touche F), logé dans le même conteneur, qui doit rester ancré à gauche quel que soit l'état des boutons. Fix correctif : `.debug-light-panel.collapsed .debug-light-left-col { width: 100% }` (élargit la boîte uniquement en état replié, aucun effet sur le panel EDA déployé) + `.debug-light-btn-rows { align-self: flex-end }` (pousse seulement les boutons dans cette boîte élargie). `#fps-counter` garde l'`align-items:flex-start` par défaut du parent — les deux widgets sont désormais positionnés indépendamment l'un de l'autre.

### `#scorePanel` — masquage automatique en basse résolution

Le bloc joueur/partie + `stats-card-grid` (6 cartes biomes) passe déjà `width: calc(100vw - 28px)` sous 1050px (règle préexistante, `base.css`) ; en dessous d'une certaine largeur, ce panneau élargi + son contenu **occupe la quasi-totalité de l'écran et rend le plateau injouable** (plus de place pour interagir avec les tuiles).

**1ère version fautive** : nouveau seuil `@media (max-width: 600px) { #scorePanel { display: none !important } }`, distinct du seuil 1050px déjà en place pour la même carte. Résultat : zone morte 600–1050px où rien ne cachait le panneau, avec un symptôme différent par thème — thème bleu : la règle `width:calc(100vw-28px)` restait seule active, panneau étiré pleine largeur au lieu de disparaître ; thème ancien : `[data-theme="ancien"] #scorePanel` impose sa propre largeur fixe (`310px`, **hors media query**, spécificité ID+attribut) qui l'emporte de toute façon sur la règle générique de largeur, donc le panneau semblait « jamais masqué » dans cette plage. Fix : aligner le seuil de masquage sur **1050px**, identique à celui déjà établi pour ce panneau — plus de zone intermédiaire, `display:none !important` l'emporte dans les deux thèmes (l'importance prime toujours sur la spécificité, y compris face à la règle `[data-theme="ancien"] #scorePanel { display:flex }` non `!important`). `#arcadeScore` (petit score en haut à gauche) n'est pas concerné, reste toujours affiché.

### Piège méthodologique — cache CSS lors de la vérification live

Après le 1er correctif du `#debugLightPanel`, une vérification live semblait passer (`getComputedStyle` renvoyait la nouvelle règle) alors que le navigateur servait en fait une **version encore en cache** de `eda.css` dans l'onglet ouvert depuis le début de session — masquant la régression FPS jusqu'au signalement utilisateur. Un `document.styleSheets` + inspection directe de `cssRules` (plutôt que `getComputedStyle`, qui peut refléter un état DOM déjà modifié par un test précédent) a confirmé l'absence de la règle attendue ; une **navigation fraîche** (pas juste un re-fetch) l'a fait apparaître. Le cache-busting `?v=<?= $cssVersion ?>` (PHP, `filemtime`) est fiable pour un nouveau chargement de page — pas pour un onglet déjà ouvert de longue date pendant une session de vérifications successives. Pour toute vérification live portant sur un fichier CSS modifié en cours de session : renaviguer (pas seulement re-tester en JS) avant de conclure.

## 38. Classement par efficacité + HUD efficacité en jeu + tooltips hover (chantier clos, 2026-08-01, v0.9.3.34 → v0.9.3.35)

### Rubrique Classement de la prez (`index.php`) — tri par efficacité

Le classement (top 10 au lieu de 5, détail sur les 6 meilleurs au lieu de 3) n'est plus trié par score brut mais par une nouvelle métrique **efficacité**, canonique dans `javascript/variables.js` : `confidence = (min(tiles, EFFICIENCY_MIN_TILES) / EFFICIENCY_MIN_TILES) ^ EFFICIENCY_MIN_TILES_EXPONENT` puis `efficiency = (score / tiles) * confidence` (tiles=0 → 0). `EFFICIENCY_MIN_TILES = 20`, exposant quadratique (2, pas linéaire — pénalise plus fortement les parties très courtes dont le ratio score/tuiles n'est pas significatif). `index.php` mire ces 2 constantes depuis `variables.js` par regex (même mécanisme déjà établi pour `HEXISTENZ_VERSION`), calcule `efficiency`/`confidence` côté PHP pour chaque highscore et trie dessus (`usort` sur `efficiency` au lieu de `score`). Chaque carte affiche désormais aussi le nombre de comètes interceptées (après les moulins, inconditionnel même hors détail) et un suffixe "pts" traduit après le score (`scores.pts_suffix`, 9 langues). Hiérarchie visuelle inversée : l'efficacité (grande, `--font-title`) domine, le score (petit, atténué) passe en second — reflète que le classement se base sur l'efficacité, pas le score brut.

### HUD arcade in-game — ligne d'efficacité sous le score

`#arcadeScore` (haut gauche, `game.php`) est passé d'une simple ligne à une colonne flex : `.arcade-score-row` (score + suffixe "pts") suivie de `.arcade-efficiency`, calculée dans `ui.js::updateScoreUI()` avec la **même formule et les mêmes constantes** que la prez (import direct depuis `variables.js`, pas de duplication). `#scorePanel` (bloc joueur/stats) a dû être redescendu (`top: 104px → 134px → 158px`, valeurs mesurées en direct à chaque itération, jamais estimées) pour ne pas chevaucher cette nouvelle ligne.

### Tooltips hover sur score/efficacité + thème médiéval du tooltip partagé

`#dbgScore`/`.arcade-score-row` et `#dbgEfficiency` ont reçu un tooltip (`attachHelpTooltip`, système déjà utilisé pour les stats) expliquant respectivement que ce sont les points du joueur, et le principe de l'efficacité en insistant sur le fait que le classement mondial s'y base (nouvelles clés `game.help["game.score"]`/`["game.efficiency"]`, 9 langues). Le libellé affiché a aussi été préfixé ("Efficacité : 17.1%", `game.ui.hud.efficiencyLabel`, 9 langues), et `.arcade-efficiency` recalée sur les mêmes effets CSS que `.arcade-score-row` (blanc, double `text-shadow`) à 65% de la taille (80px→52px, 60px→39px en compact) au lieu de sa propre teinte bleu pâle.

**Bug retour utilisateur** : le hover ne déclenchait rien du tout. Cause : `#arcadeScore` porte `pointer-events: none` (pour ne pas gêner les clics sur le plateau 3D en dessous), hérité par ses enfants — aucun hover réel n'était possible sur `.arcade-score-row`/`.arcade-efficiency` tant qu'ils n'annulaient pas explicitement cet héritage. **Piège méthodologique notable** : les vérifications précédentes utilisaient `element.dispatchEvent(new MouseEvent(...))` en JS, qui déclenche l'écouteur directement sur la cible sans passer par le hit-testing CSS — donc `pointer-events:none` ne bloque pas un événement synthétique, seulement un vrai clic/survol matériel. Le bug est passé inaperçu jusqu'au retour utilisateur avec un hover réel. Fix : `pointer-events: auto` explicite sur `.arcade-score-row` et `.arcade-efficiency`. Leçon : pour vérifier qu'un hover fonctionne réellement, utiliser un hover matériel (`computer` tool) en plus/à la place d'un `dispatchEvent`, qui peut donner un faux positif.

L'UI des tooltips (`#lutHelpTooltip`, CSS injecté en JS par `helpTooltip.js`, base "bleu sidéral" partagée game-wide) a reçu un override `[data-theme="ancien"] #lutHelpTooltip` dans `css/themes/medieval.css` (palette "cachet de cire" déjà utilisée pour `.fps-hud-close`/`.debug-light-close` : fond `#4a3623`, texte `#f0e6d0`, police Georgia) — l'attribut+ID bat l'ID seul du CSS injecté quel que soit l'ordre d'injection, pas de `!important` nécessaire.

**Bug pré-existant découvert en vérifiant ce dernier point** (non lié à cette session, daté du 19/07) : un commentaire CSS jamais fermé (`/* 2026-07-19 — 4e passe : le fondu rectangulaire (2 linear-gradient`, suivi directement de `}` sans `*/`) après `.parchment-picture--v2` **avalait tout le CSS qui suivait dans le fichier** jusqu'au premier `*/` rencontré plus loin — soit `.parchment-picture--v3/v4/v5` (jamais appliquées), `.parchment-picture::after`, et tout override ajouté en fin de fichier, y compris le nouveau tooltip médiéval. Symptôme trompeur : `fetch()` sur `medieval.css` renvoyait bien le contenu à jour (texte brut, aucune notion de syntaxe), et même une requête `cache:no-store`/hard-reload semblait "fonctionner" ; seule l'inspection de `document.styleSheets[i].cssRules` (nombre de règles réellement parsées, très inférieur au nombre de sélecteurs présents dans le fichier) a révélé que le **parseur CSS du navigateur**, pas le cache HTTP, était en cause — un commentaire non fermé peut se refermer bien plus loin que prévu sur le tout premier `*/` suivant, quel que soit le nombre de `/* */` qu'il traverse au passage (pas de nesting). Le même motif exact était dupliqué 4 fois (après v2/v3/v4/v5) ; les 4 ont été refermés. Vérification a posteriori : comptage de `{`/`}` sur le texte débarrassé de ses commentaires (balance à 0) comme test de non-régression rapide pour ce genre de bug.

## 39. Cadre décoratif ingame (`#footerBanner`/`#headerBanner`/`#leftBanner`/`#rightBanner`) — chantier clos (2026-08-01, v0.9.3.35 → v0.9.3.39)

Bannière ornementale (lierre/pierre) affichée uniquement en thème médiéval, ingame (`game.php`), jamais sur la prez (`index.php`). Née comme simple bandeau bas (`#footerBanner`), étendue sur demande explicite en **cadre complet à 4 côtés** autour de l'écran de jeu.

### 4 éléments, 1 seule image source

Les 4 côtés réutilisent tous la **même image** (renommée `footer2.png` → `cadre.png` en toute fin de chantier, demande explicite — seule l'`url()` change, image identique) :
- `#footerBanner` : bande horizontale collée en bas (`bottom:0`), orientation native.
- `#headerBanner` : même bande, collée en haut (`top:0`), `transform: rotate(180deg)` (d'où `background-position` inversé `top left` au lieu de `bottom left` pour compenser le retournement).
- `#leftBanner`/`#rightBanner` : bandes verticales. Technique — un conteneur `width:85px; height:100vh; overflow:hidden` habille un pseudo-élément `::before` qui, lui, est une bande horizontale classique (`width:100vh; height:85px`, même `background-size`), centré (`top/left:50%`) puis tourné à `rotate(90deg)`/`rotate(-90deg)` autour de son propre centre. Centrer avant de tourner garantit un alignement pixel-perfect sur le conteneur quelle que soit la hauteur d'écran (pas de calcul de `translate` dépendant de la résolution).
- `z-index` : header/footer à 5, left/right à **4** (inférieur) — demande explicite "les côtés passent sous le header/footer" aux 4 coins, pour un raccord visuel propre sans double-épaisseur.
- Masquage par défaut (thème bleu) centralisé dans `css/base.css` (`display:none` sur les 4 IDs), réaffichage uniquement via `[data-theme="ancien"]` dans `medieval.css`.

### Historique des itérations de taille/technique (background-size)

Chaîne de retours utilisateur, chacun vérifié en direct (Claude-in-Chrome) avant le suivant :
1. `<img>` étiré `width:100vw;height:auto` → rejeté (disproportionné à 5120px de large).
2. `<div>` + `background-repeat:repeat-x` sur le fichier original 792×50 (`footer.png`, redimensionné sur disque — **fichier écrasé irréversiblement, pas de git**) → rejeté ("trop zoomé").
3. `background-size: auto 28px` → "trop petit" ; `auto 38px` → accepté temporairement.
4. Nouveau fichier `footer2.png` (1885×119, RGBA natif) + `auto 19px` (−50%) → `auto 53px` (+180%).
5. **Bug seam** : `background-size: auto <hauteur>` laisse le navigateur calculer une largeur de motif non entière (ex. 1885×53/119=839.34px) → dérive d'arrondi cumulative sur le `repeat-x` → interstice de 1px visible par endroits, alors que le fichier est nativement seamless. **Fix définitif** : toujours fixer largeur ET hauteur en pixels ENTIERS dans `background-size` (jamais `auto <valeur>`), ratio source 1885:119 respecté par arrondi. → `1172px 74px` (+40%) → `1346px 85px` (+15%, valeur finale).
6. **Bug troncature (bord bas uniquement)** : lors du dernier passage à 85px, le `background-size` du footer avait été mis à jour mais la propriété `height` du conteneur était restée à l'ancienne valeur (74px) — oubli. Avec `background-position: bottom left`, un conteneur plus petit que le motif rogne le HAUT de celui-ci (l'ancrage bas restant fixe), d'où l'asymétrie visible seulement sur ce côté. Fix : `height` alignée sur `background-size` (85px partout, comme header/left/right depuis le début). **Leçon reprise du bug #33/#34 (`box-sizing`/`max-height`)** : toute paire `background-size`/`height` (ou plus généralement toute paire de constantes qui doivent rester égales) doit être mise à jour **ensemble**, jamais l'une sans l'autre — sinon la dérive est silencieuse jusqu'au prochain retour visuel.

### Fichier source

`images/cadre.png` (ex-`footer2.png`), 1885×119px, mode RGBA natif (transparence vérifiée par histogramme alpha avant usage, non retouchée), motif nativement seamless horizontalement. Le fichier `footer.png` original (792×50, mode P, recadré à la volée en tout début de chantier) reste sur disque mais n'est plus référencé nulle part.

### Écartement des HUD par rapport au cadre (2026-08-01, v0.9.3.37 → v0.9.3.38)

Une fois le cadre posé sur les 4 côtés, les HUD (score/efficacité, panneau stats, tuile courante/suivante, missions, EDA, HUD FPS, 9 boutons rouges bas-droite) chevauchaient ou frôlaient les bords. Écartement fait exclusivement via des overrides `[data-theme="ancien"]` (zéro régression thème bleu, vérifié à chaque round par bascule live `document.documentElement.setAttribute('data-theme','bleu')`).

Historique de la marge, itérée en 4 rounds suite aux retours utilisateur successifs :

- Round 1 : +85px sur tous les éléments concernés (`#arcadeScore`, `#scorePanel`, `#tileUI`, `.missionsBox` via héritage flex, `.debug-light-panel`).
- Round 2 : jugé trop large → repassé à +65px partout, plus corrections ponctuelles (EDA et HUD FPS sortaient de l'écran par le haut ; score/efficacité masqués par le manuscrit stats de partie).
- Round 3 : marge finale ramenée à 52px (65→52) sur l'ensemble des éléments, et le cadre + ses 4 côtés passés en z-index au-dessus de tout le reste de l'interface (`#footerBanner`/`#headerBanner` : 99999 ; `#leftBanner`/`#rightBanner` : 99998, un cran sous header/footer pour préserver le passage sous les coins). Ancien maximum du projet avant ce chantier : 20000 (snapshots.css).
- Round 4 (ajustements fins) : score/efficacité/stats de partie redescendus de 12px (marge haut jugée trop grande) ; marge cadre pour tuile courante/suivante et missions réduite de 10px supplémentaires.

Formules de dérivation utilisées à chaque round pour éviter de réintroduire le bug de chevauchement (documentées dans les CSS eux-mêmes) :
- `#scorePanel` top = `#arcadeScore` top + écart d'origine constant.
- `.debug-light-body` (corps EDA) height/max-height = calc(100vh − (top visé + bordure 9-slice 100px + marge basse visée)).
- `.debug-light-panel.fps-hud-fullscreen` top = marge cadre visée (jamais thémé avant ce chantier, d'où le bug initial de débordement en haut).

Fonctionnalité ajoutée en cours de route : les 9 boutons rouges (`.debug-light-btn-rows`) se masquent automatiquement dès qu'EDA ou le HUD FPS est ouvert (`body.lut-panel-open` / `body.fps-hud-deployed`), ce qui simplifie l'équation d'espace vertical (suggestion de l'utilisateur lui-même).

### Bug tooltips sous le cadre — leçon CSS injecté en JS (2026-08-01)

Les tooltips hover (petits popups d'aide) sur les 9 boutons rouges restaient affichés SOUS le cadre malgré un premier correctif de z-index dans `eda.css`. Cause réelle : `javascript/helpTooltip.js::ensureHelpTooltip()` injecte à l'exécution son propre `<style>` en fin de `<head>` avec sa propre règle `#lutHelpTooltip` — cette règle, injectée après le chargement de `eda.css`, gagne la cascade à spécificité égale et rend tout changement dans `eda.css` inopérant (dead code). Corrigé à la source dans `helpTooltip.js` : z-index 20500 → 100000 (au-dessus du cadre à 99999). La règle laissée dans `eda.css` est conservée en synchronisation par clarté mais n'a aucun effet réel — commentée en ce sens.

Leçon générale pour ce projet : avant de modifier un z-index ou une règle CSS qui semble ne pas s'appliquer, vérifier si un fichier JS n'injecte pas une règle concurrente au runtime (`document.head.appendChild(styleTag)`), qui prime sur les feuilles `<link>` statiques à spécificité égale du fait de son ordre d'insertion tardif dans le DOM.

### Fix ESC sur HUD FPS déployé (2026-08-01)

La touche ESC fermait déjà l'EDA quand il était ouvert. Comportement étendu au HUD FPS déployé (`.fps-hud-fullscreen`) : ESC le ferme désormais au lieu d'ouvrir l'aide, via un nouveau garde-fou dans `scene.js` (handler clavier, ~L716), symétrique à celui de l'EDA (clique sur `.fps-hud-close` s'il existe, puis `return`).

Note technique de vérification : ce fix a d'abord semblé ne pas s'appliquer en live malgré un code correct sur disque — diagnostiqué comme un cache HTTP navigateur sur le module JS (`scene.js` n'a aucun cache-busting contrairement aux CSS qui utilisent `?v=filemtime()`), confirmé par `fetch()` (cache par défaut, contenu périmé) vs `fetch(url,{cache:'no-store'})` (contenu à jour). Lacune préexistante du projet, non corrigée ici (hors périmètre de la demande) — juste contournée pour la vérification via hard-reload.

### Cadre médiéval sur la prez (`index.php`) — même image, nav repositionné (2026-08-01, v0.9.3.38 → v0.9.3.39)

Demande explicite : "le même cadre sur la prez en thème médiéval : tu le poses par dessus tout le reste, simplement." Repris à l'identique du cadre ingame (même fichier `images/cadre.png`, mêmes dimensions/background-size 1346×85, même z-index 99999 header/footer et 99998 gauche/droite) sur 4 nouveaux ids dédiés — `#prezFooterBanner`/`#prezHeaderBanner`/`#prezLeftBanner`/`#prezRightBanner` (ajoutés dans `index.php`, juste après `.bg-layer`). Ids distincts des `#footerBanner`/etc. du jeu car **`css/themes/medieval.css` est chargé à la fois par `game.php` ET `index.php`** — réutiliser les mêmes ids aurait fait apparaître le cadre du jeu sur la prez et inversement. Masquage par défaut (thème bleu) ajouté dans `css/presentation.css` (fichier toujours chargé par la prez, même logique que `base.css` côté jeu).

`<nav>` (bandeau menu de la prez, `position:fixed`, seul endroit du projet à utiliser `<nav>`, cf. `index.php`) recouvert par la nouvelle bande haute du cadre (`top:0` → `85px`) : repositionné en 4 itérations suite aux retours successifs de l'utilisateur, `[data-theme="ancien"] nav` (themes/medieval.css) uniquement (thème bleu non concerné, `top:0` d'origine inchangé) :

1. `top: 85px` — décale le nav sous la bande haute du cadre (aucun chevauchement).
2. "trou béant en haut et sans texture" — `border-width` du nav passait de `0 50px 50px 50px` (pas de bord sur le dessus, valeur d'origine v3) à `50px` partout : le dessus du bandeau nav n'avait jusque-là aucune texture (`background:none`, rien pour habiller le dessus), laissant voir le fond plat de la page entre le bas du cadre et le haut du contenu du nav. Comblé par un bord-image top identique aux 3 autres côtés (même `manuscrit-1.png`, mêmes coins 9-slice). `top` remonté à `73px` (-12px) dans la foulée.
3. "gap entre le cadre partie haute et le header des menus" — `top: 73px → 48px` (-25px) : le bord-image top de 50px + padding-top 12px du nav restait en grande partie SOUS le cadre (`pointer-events:none`, purement décoratif, aucun souci fonctionnel), mais le contenu du nav (logo/liens) n'émergeait qu'à `top + 62px`, laissant un espace visible sous le cadre.
4. "toujours pas collé en haut" — `top: 48px → 23px` (-25px encore). Formule finale : contenu du nav apparaît à `navTop + border-top(50) + padding-top(12) = 23 + 62 = 85px`, exactement la valeur du bas du cadre (`#prezHeaderBanner`, `bottom: 85px` en coordonnées écran) → gap nul, vérifié en direct (`getBoundingClientRect()` sur `.nav-logo` vs le cadre : écart de -2px, dans la marge d'erreur du rendu).

Piège à retenir si ce nav est encore retouché : la formule utile n'est PAS son `top` seul, mais `top + border-top-width + padding-top` (le contenu visible émerge seulement après avoir traversé le bord-image ET le padding) — comparer cette somme à la hauteur du cadre haut (85px), pas `top` directement.

## 40. Contenu masqué/tronqué sous le cadre en basse résolution — 4 correctifs (2026-08-01, v0.9.3.39 → v0.9.4.1)

Suite directe du chantier §39 (cadre décoratif) : plusieurs surfaces différentes se sont révélées, une par une, jamais réellement testées en basse résolution (largeur OU hauteur de viewport réduite). Chantier clos, tous les cas vérifiés en direct (Claude-in-Chrome, `resize_window` + `getBoundingClientRect()`) de 420px à 900px de hauteur/largeur, 2 thèmes.

### a. `.container` de la prez déborde du cadre en largeur réduite

`.container` (`presentation.css`) n'avait que 24px de padding horizontal — très inférieur aux bandes verticales du cadre (`#prezLeftBanner`/`#prezRightBanner`, 85px de large chacune, z-index 99998). Sous ~1150px de large, le padding ne suffisait plus à dégager le cadre, qui passait par-dessus (z-index supérieur) et masquait titres/images/sections. Fix scopé `[data-theme="ancien"] .container { padding: 0 100px; }` (85px de cadre + 15px de respiration) — sans effet sur les grands écrans (le padding ne joue que quand `.container` touche ses propres bords, `max-width:1100px` prenant le relais au-delà). Thème bleu non concerné (pas de cadre), déjà correct.

### b. HUD missions/stats de partie chevauchent le bandeau de 9 boutons en basse hauteur

`#tileUI`/`.missionsBox` (`deck.css`/`missions.css`) et `#scorePanel`/`.stats-panel` (`base.css`) réservaient chacun une marge basse de seulement 20px dans leur `max-height` — une constante héritée d'avant l'existence du cadre ET de `.debug-light-panel` (le bandeau des 9 boutons rouges, ancré en bas, pouvant grandir à 82px sur 2 rangées en largeur réduite). Résultat : les deux HUD pouvaient légalement s'étendre jusqu'à chevaucher le bandeau de boutons et passer sous le cadre bas.

Piège additionnel découvert en cours de route : pour `#scorePanel` en thème médiéval, une règle `@media (max-height: 1100px)` — qui s'applique dans la quasi-totalité des cas visés — définissait sa PROPRE valeur de `max-height`, jamais mise à jour en même temps que la règle non-compacte ; corriger uniquement cette dernière n'avait donc aucun effet visible. Les 2 versions (compacte et non-compacte) ont dû être synchronisées.

Réserves mesurées en direct et portées de 20px à :
- Bleu : 100px (`.debug-light-panel` bottom:4px + 82px de boutons + 10px de respiration).
- Médiéval : 152px (bottom:56px du bandeau, déjà décalé par le cadre, + 82px + 10px).

### c. Menus pre-game (`.mode-screen`/`.mode-panel`, `startupMenu.js`) — 3 itérations

Le plus long correctif du lot, avec une régression corrigée en cours de route :

1. **1ère tentative (rejetée)** : `.mode-screen` (l'écran plein écran qui centre le parchemin pre-game) n'avait ni scroll ni `max-height` — en basse hauteur, `.mode-panel` débordait sans aucun moyen d'y accéder. Corrigé en rendant `.mode-screen` lui-même scrollable (`overflow-y:auto` + `align-items:safe center`) — **mais ceci nécessitait aussi de remonter son z-index (9999→100000) au-dessus du cadre (99999) pour rester cliquable, ce qui a fait disparaître le cadre visuellement derrière le menu**. Retour utilisateur immédiat ("tu as retiré le cadre... incohérent") : le cadre doit rester au-dessus du menu, exactement comme il encadre le reste du jeu.
2. **2e tentative** : z-index de `.mode-screen` restauré à 9999 (jamais retouché depuis), scroll déplacé DANS le parchemin lui-même (`.mode-panel` borné par `max-height` + `.internal-parchment`, son enfant, qui reçoit le scroll réel) — même schéma que `#scorePanel`/`.missionsBox` (§39, point b). Piège découvert au passage : `.internal-parchment` est `display:contents` en thème **bleu** (`themes/bleu.css`) — un wrapper transparent sans boîte propre, un `overflow-y:auto` dessus n'a donc aucun effet en bleu ; le scroll doit vivre sur `.mode-panel` lui-même par défaut (couvre le bleu), le thème médiéval inversant ce choix (`.internal-parchment` a une vraie boîte 9-slice là-bas).
3. **3e tentative (correctif du correctif)** : malgré (2), le parchemin médiéval restait tronqué sous le cadre sans marge. Cause : le calcul de `max-height` oubliait la bordure 9-slice du parchemin (50px haut + 50px bas = 100px, `box-sizing:content-box` donc ajoutée PAR-DESSUS `max-height`, jamais incluse dedans) et utilisait un plancher de `margin-top` supposé fixe (120px, valeur haute du `clamp()`) qui ne correspondait pas à la vraie valeur en vigueur sous 760px de hauteur (`@media (max-height:760px)` la fixe à 112px). Déficit d'environ 108px, invisible tant que `.mode-screen` restait centré sans scroll propre — l'excédent se répartissait alors de façon imprévisible entre le haut et le bas de l'écran (piège de la centration flexbox "unsafe" avec contenu en overflow). Fix structurel : une custom property CSS (`--mp-margin-top`, définie et mise à jour par `startupMenu.css`, y compris sous son propre `@media`) est désormais LUE par la règle médiéval (`multiplayerUi.css`) pour son propre calcul de `max-height` — les deux valeurs ne peuvent plus diverger. Marge basse portée à 100px (85px de cadre + 15px, pas la convention réduite à 52px utilisée ailleurs dans le HUD in-game — jamais validée par l'utilisateur pour ce panneau spécifique).

Résultat final : `.mode-screen` reste à z-index 9999 (sous le cadre, inchangé depuis l'origine) ; `.mode-panel`/`.internal-parchment` portent le scroll réel, bornés par une `max-height` qui tient compte de tout l'overhead non-shrinkable (marge, bordure/padding) des deux thèmes.

### Bump

`HEXISTENZ_VERSION` : `v0.9.3.39` → `v0.9.4.1` (saut de version mineure, demande explicite — ce chantier clôt une série de corrections consécutives sur le thème médiéval en basse résolution, cf. §39 et ce paragraphe).

## 41. Aide basse résolution, masquage HUD, mute prez, largeur EDA, presets God Rays/Tilt-shift (2026-08-01/02, v0.9.4.1 → v0.9.4.2)

Série de corrections ponctuelles, sans lien architectural entre elles autre que la basse résolution / le panel EDA.

### a. Aide (touche H) tronquée en basse résolution (régression)

Même famille de bug que §40 mais sur `.help-panel` (`help.css`), pas encore traitée à l'époque : `width`/`max-height` réservaient seulement `calc(100vw/vh - 150px)`, insuffisant face au cadre (100px de marge+buffer par côté + 100px de bordure 9-slice propre = 300px de réserve totale nécessaire, panneau centré donc double réserve comme `.mode-panel` en §40c, pas la convention réduite 52px des HUD de coin). Porté à `calc(... - 300px)`. `.internal-parchment` du panneau passait aussi de `overflow:hidden` (clip silencieux) à `overflow-y:auto` (scroll réel).

### b. Masquage HUD stats/missions sous seuils de résolution

`#scorePanel` (`base.css`) avait déjà un seuil `@media (max-width:1050px)` ; `.missionsBox` (`missions.css`) reçoit désormais le même seuil largeur (demande explicite : mêmes triggers que scorePanel). Les deux reçoivent en plus un seuil hauteur `@media (max-height:700px)` (valeur choisie par jugement — sous les résolutions desktop courantes type 1080p, effective sur fenêtres réellement basses ; validée en direct à 565px/715px de hauteur utile).

### c. Mute TTS de la prez aligné sur le jeu (touche M)

`speakPrez()` (`index.php`) ne vérifiait que `_prezTtsMuted` (touche T) ; ajout de la vérification `_prezSoundMuted` (touche M) en tête de fonction, symétrique du `speak()` ingame (`ttsAnnouncer.js`). M coupe désormais aussi les TTS de la prez (sélecteurs langue/thème inclus), pas seulement la musique.

### d. Largeur du panel EDA — 3 réductions successives + 2 colonnes

`LUT_WIDTH_FACTOR` (`edaPanelWiring.js`, multiplicateur appliqué à `#tileUI.offsetWidth` par `_syncLutWidth()`) réduit en 3 passes sur demande explicite : `2.8` → `2.296` (−18%) → `1.8368` (−20% de plus) → `1.56128` (−15% de plus). Fallback CSS initial `.debug-light-body { width: min(Npx, ...) }` (`eda.css`) synchronisé à chaque passe (620px → 508px → 406px → 345px) pour éviter un flash plus large que la taille finale. `.debug-light-columns` (flux "journal" de chaque onglet) passé de `columns:3` à `columns:2`.

### e. Presets d'ambiance EDA — désactiver God Rays / activer Tilt-shift (6 ambiances)

Demande : les boutons Défaut, Automne, Été vif, Hiver, Nordique, Désert doivent désactiver God Rays et activer Tilt-shift du cinématique. Ajout de `"godRaysEnabled": false` et `"tiltShiftEnabled": true` dans le bloc `cinema` de ces 6 presets (`json/ambiances.json`) — les 8 autres presets (Brume, Sépia, Pong, Apple II, CGA, EGA, Amiga, Psyché-LSD) non concernés, laissés inchangés. Chaque `_commitX()` (ex. `_commitCin`) fait un merge PARTIEL sur l'état courant, donc un champ absent d'un preset hérite silencieusement de la valeur précédemment active — d'où la nécessité de fixer explicitement les 2 clés dans chaque preset ciblé plutôt que de compter sur un défaut global.

**Bug de cache découvert en vérifiant en direct** : `VISUAL_PRESETS = await fetch('./json/ambiances.json')` (`edaPanelWiring.js`, chargé une fois au niveau module) n'avait aucun paramètre de cache-busting — même bug que celui corrigé en juillet pour `json/languages/*.json` (cf. §35, `getLangUrl()`/`HEXISTENZ_LANG_VERSION`). Le navigateur pouvait continuer à servir un `ambiances.json` périmé indéfiniment après modification sur disque, y compris après un rechargement forcé. Fix : `?v=${HEXISTENZ_VERSION}` ajouté à ce fetch (import de `HEXISTENZ_VERSION` depuis `variables.js`), même mécanisme que `cssVersion` côté PHP pour les feuilles de style. Vérifié en direct dans Chrome (6 presets ciblés + 1 preset témoin non affecté).

### Bump

`HEXISTENZ_VERSION` : `v0.9.4.1` → `v0.9.4.2` (demande explicite).

## 42. Bonus cell 1500→500 pts, fix flash HUD pre-game, typo Enchanted-Land sur la prez en thème médiéval (2026-08-03, v0.9.4.2 → v0.9.4.2.2)

### a. Récompense case bonus : 1500 → 500 points

Changement de valeur pure, 3 emplacements synchronisés (demande explicite) : `BONUS_CELL_SCORE` (`javascript/bonusCells.js`, la constante réellement consommée par `scene.js::placeTile` pour le calcul de score), la pastille `+1500`→`+500` de la rubrique "comment jouer" de la prez (`index.php`), l'aide en jeu touche H (`game.php`), et le texte descriptif complet dans les 9 fichiers `json/languages/*.json` ("...rapportent immédiatement +1500 points." → "+500 points."). `javascript/variables.js` contient une 2e constante `BONUS_CELL_SCORE` du même nom mais dans un module différent (jamais importée par `scene.js`, code mort pour ce mécanisme) — laissée telle quelle, hors scope.

### b. Flash disgracieux des HUD in-game au chargement de la prez

Bug signalé : entre la fin du préchargement (`preloader.js`) et l'affichage du menu pre-game (`.mode-screen`, choix bouliste/platiste), les HUD `#scorePanel`/`#tileUI`/`.missionsBox`/`#arcadeScore` de `game.php` s'affichaient brièvement — ces éléments n'avaient jamais eu de masquage par défaut (aucun `display:none` tant qu'aucun JS ne les cache), et le fondu de sortie du preloader (`dismissOverlay()`, ~700ms de transition CSS) laisse transparaître la page en dessous pendant l'animation, avant que `showStartupScreen()` (synchrone, opaque, z-index 9999) ne recouvre l'écran.

Fix : classe `game-not-started` posée par défaut sur `<body>` (`game.php`), qui masque les 4 HUD via `display:none !important` (`base.css`) tant qu'elle est présente ; retirée uniquement au vrai lancement de la partie, dans `multiplayerRooms.js::startMultiplayerScene()` juste après `overlay.remove()` du menu pre-game — jamais avant, jamais en revenant sur un menu. Vérifié en direct (computed style avant/après retrait de la classe).

### c. Typo "Enchanted-Land" (police gothique fournie par l'utilisateur, `fonts/Enchanted-Land.otf`) sur les textes de corps de la prez en thème médiéval — chantier itératif en ~10 rounds

Mécanisme central : `presentation.css` définit `--font-body`/`--font-title` dans `:root` (jamais utilisées par `game.php`, qui n'importe pas `presentation.css` et écrit ses `font-family` en dur — donc toute redéfinition de `--font-body` scopée `[data-theme="ancien"]` est **sans aucun effet sur le jeu/HUD**, uniquement sur la prez). `medieval.css` redéfinit `--font-body: 'EnchantedLand', Georgia, 'Times New Roman', serif;` sous `[data-theme="ancien"]` — tout texte de la prez consommant cette variable (en cascade depuis `body { font-family: var(--font-body) }`) bascule donc automatiquement, y compris via héritage pour les éléments sans `font-family` propre.

**Réglages typographiques appliqués** (tous scopés `[data-theme="ancien"]`, medieval.css) :
- `@font-face` avec `size-adjust: 180%` (police visuellement petite à taille égale ; 200% d'abord, puis −10% sur demande explicite) ;
- `word-spacing: 0.16em`, `line-height: 1.7` et `font-weight: 400` posés une fois sur `[data-theme="ancien"]` (héritage, cascade CSS) ;
- `letter-spacing` resserré (`-0.015em`) testé puis **entièrement retiré** sur demande explicite finale (letters à espacement normal) ;
- `<strong>`/`<b>` perdent leur gras (400, pas de graisse alternative dans le fichier statique) et gagnent un `text-decoration: underline` à la place (gras jugé illisible avec cette police) ;
- `line-height` unifié à **2.0** sur tous les sélecteurs EnchantedLand ayant leur propre valeur explicite (`.mission-desc`, `.biome-desc`, `.faction-desc`, `.creature-desc`, `.audio-desc`, `.daynight-list li`, `.step-desc`, `.eda-showcase-desc`, `.section-sub`, `.hero-tagline`, `.hero-inspi`, `.population-note`, `.multi-feature-list li`, `body`) — un texte avec line-height propre n'hérite JAMAIS de celui d'un ancêtre, d'où la nécessité de lister individuellement chaque sélecteur plutôt que de compter sur la règle globale ;
- `font-size` des textes à 15px ramenés à 14px (`.hero-tagline`), et ceux à 11/11.5px ramenés à 12px (`.mission-desc`, `.audio-desc`, `.eda-showcase-desc`, `.hero-inspi`, `.population-group-label`, `.footer-copy`, `.footer-sep`) ;
- `text-shadow: 0 0 4px rgba(255,250,235,0.8), 0 1px 2px rgba(255,250,235,0.6)` (valeur validée, celle déjà utilisée par `.hero-subtitle`) appliqué à tout texte EnchantedLand qui n'avait pas déjà exactement cette valeur (la plupart n'avaient rien ou une ancienne valeur single-layer `0 0 3px`/alpha 0.75) — **sauf** `.population-tag` (retiré explicitement, le flou du glow devenait plus voyant que le texte à cette petite taille de pastille).

**Exclusions explicites** (texte qui reste en Space Mono/Georgia malgré l'héritage de `var(--font-body)`, avec reset `word-spacing`/`line-height`/`text-shadow` dédié pour empêcher toute fuite par héritage depuis `body`) : le bandeau `nav` et ses enfants (`.nav-cta`, liens, `#theme-toggle select`/`#lang-toggle select` — ces derniers ont leur propre règle scopée par ID, plus spécifique que "nav", d'où une fuite initiale corrigée séparément), `.btn-primary`/`.btn-secondary`, `.hero-version`/`.hero-version-date`, `.biome-tag`, `.gallery-label span` (mot-clé + nom de preset galerie), `.footer-link`, `.section-label`, `.gameplay-ui-caption`, le contenu des `<kbd>` de la rubrique "Contrôles clavier" (fuite initiale via une règle `.kbd-strip kbd { font-family: var(--font-body) }` dédiée dans `presentation.css`, plus spécifique que l'héritage du conteneur `.kbd-strip-item`), et tout le groupe `.hs-card`/`.stats-bar`/`.kbd-strip`/`.room-demo` (highscores, stats de partie, démo de salle multi — jamais passés à EnchantedLand, reset word-spacing/line-height/text-shadow posé sur le CONTENEUR pour couvrir tous les descendants sans valeur propre en une seule règle).

**Bugs de fuite par héritage rencontrés et corrigés** (`text-shadow`/`word-spacing`/`line-height` sont des propriétés CSS héritées — un reset posé sur `body` se propage à TOUT descendant sans déclaration propre, y compris dans des zones explicitement exclues de la police elle-même) : `.nav-links a`, `#theme-toggle select`/`#lang-toggle select`, `.hs-date`/`.hs-name`/`.stat-num`/`.stat-label`/`.kbd-strip kbd`/`.room-code`/`.room-score-name`, `.biome-tag`/`.gallery-label span`/`.hero-version-date` — chacun corrigé par un reset explicite ciblé (jamais un reset générique qui aurait écrasé les valeurs propres de `.nav-cta`/`.btn-primary`/`.hero-version`/`.footer-link`, qui ont leurs propres `text-shadow` intentionnels en `presentation.css`).

**Piège de cascade récurrent** : plusieurs déclarations `[data-theme="ancien"] .section-sub { ... text-shadow: ... }` etc. existaient DÉJÀ plus bas dans `medieval.css` (ancien travail, thème parchemin) — même spécificité que les nouvelles règles consolidées posées plus haut dans ce round, donc la déclaration la PLUS BASSE dans le fichier gagnait toujours, silencieusement. Corrigé en éditant directement ces déclarations préexistantes plutôt qu'en ajoutant une règle concurrente plus haut.

Chantier non définitif — l'utilisateur a validé "le reste semble okay pour la prez" mais le rendu reste un TEST (annulation possible : 3 blocs isolés dans `medieval.css` — `@font-face`, redéfinition `--font-body`, réservations nav/boutons — documentés en commentaire dès la 1ʳᵉ passe).

**Prochaine étape (annoncée, pas commencée)** : étendre EnchantedLand aux menus pre-game et in-game (HUD de jeu), hors scope de ce round qui ne couvrait que la prez (`index.php`).

### Bump

`HEXISTENZ_VERSION` : `v0.9.4.2` → `v0.9.4.2.2` (demande explicite).

## 43. Typo Enchanted-Land étendue aux menus pre-game + HUD in-game, cohérence taille/graisse/interligne avec la prez (2026-08-03, v0.9.4.2.2 → v0.9.4.2.3)

Suite directe du §42 (qui ne couvrait que la prez, `index.php`) : extension d'EnchantedLand aux menus pre-game (`.mode-panel`, partagé par `startupMenu.js`/`multiplayerRooms.js`) et à une liste ciblée de titres/labels du HUD in-game (`game.php`), avec les mêmes règles de base que la prez (jamais sous 12px, jamais sur boutons/formulaires/chiffres/scores, jamais de gras).

### a. Textes convertis

Pre-game (`css/multiplayerUi.css`, scope `.mode-panel`) : `.mode-copy`/`.mode-shape-note` (`<p>`, textes descriptifs) et `.multi-status` (messages de statut, y compris code de partie). Exclusions : `label`/`input`/`select`/`select option`/boutons, repassés en Georgia explicitement pour ne pas hériter d'EnchantedLand.

In-game (fichiers CSS respectifs) : `H1 id="helpTitle"` (`help.css`), `div class="title"` (`css/themes/medieval.css`, partagé par `.tileDeckBox`/`.missionsBox`), `div class="score-title"` (`base.css`), `div class="debug-light-main-title"` (`eda.css`, titre du panneau EDA), `LI class="mission-empty"` (`missions.css`, message "aucune mission").

### b. Bugs de fuite/incohérence corrigés au fil des rounds

- **Text-shadow illisible sur fond sombre** : retiré sur `.lutHelpTooltip`, les 3 titres d'onglet du HUD "LUT", et les `<kbd>` de l'aide (glow clair hérité de `body`, invisible/illisible sur fond sombre).
- **Casse tout-capitales** : `.title`/`.score-title`/`.debug-light-main-title`/`#helpTitle` passaient encore en MAJUSCULES (héritées du CSS `text-transform:uppercase` et/ou du texte source déjà en capitales dans `json/languages/*.json`) — fix via `text-transform: lowercase` sur l'élément + `::first-letter { text-transform: uppercase }`. Piège rencontré sur `.stats-title` : `::first-letter` ne s'applique jamais à un conteneur `display:flex` (exclusion du spec CSS) — corrigé en repassant `#statsPanel .stats-title` à `display:block` (le seul usage du sélecteur dans tout le projet, `::after` décoratif déjà désactivé donc aucune régression).
- **Letter-spacing non nul** : chacun des 5 éléments in-game héritait un letter-spacing de sa règle de base non thémée (0.18em/0.16em/0.14em/-0.06em selon les cas, pensés pour Bebas Neue/Space Mono) — reset à `normal` partout, cohérence stricte avec la prez ("aucun letter-spacing sur les typos enchanted-land, jamais !").
- **Font-weight non standard** : `.stats-title`/`.debug-light-main-title` héritaient `font-weight: 900` de leur règle de base (pensée pour capitales condensées), `#helpTitle` gardait le gras natif du `<h1>` (700, jamais redéfini), `.mission-empty` avait 500 — tous ramenés à `font-weight: 400` (jamais de gras sur EnchantedLand, règle absolue).
- **Font-size incohérent** : `.score-title`/`.stats-title` étaient à 12px, `.mode-copy`/`.mode-shape-note`/`.multi-status` n'avaient AUCUN override et héritaient donc de la taille par défaut du navigateur (~16px, hors convention, sans reset de graisse) — tous unifiés à **14px** (même valeur que `.title`, déjà validée) ; `.debug-light-main-title` était déjà à 14px, inchangé.
- **Line-height incohérent (pre-game)** : `.mode-panel p` (règle de base non thémée) impose `line-height: 1.45`, une valeur EXPLICITE qui n'hérite donc jamais du réglage global `line-height: 1.7` posé sur `[data-theme="ancien"]` (html) — override dédié à **`line-height: 2.0`**, la même valeur que tous les textes de corps EnchantedLand de la prez (`body`/`.biome-desc`/etc., §42). `.multi-status` héritait déjà correctement du `body` (2.0), aucune fuite là — vérifié en direct plutôt que supposé.
- **Word-spacing/letter-spacing pre-game** : vérifiés en direct (`getComputedStyle`) après le fix ci-dessus — déjà corrects par héritage naturel du réglage global `[data-theme="ancien"]` (`word-spacing: 0.16em`, letter-spacing `normal`), aucune règle supplémentaire nécessaire.
- **`#helpTitle` trop grand, tronqué, sortait de l'écran** : `.help-header h1` (base.css) est calibré pour Bebas Neue très condensée avec `font-size: clamp(30px, 4vw, 52px)` — combiné au `size-adjust: 180%` global d'EnchantedLand (§42), ce même font-size rendait visuellement jusqu'à ~94px effectifs, largement de quoi déborder du panneau/chevaucher le bouton de fermeture selon la largeur d'écran. Fix : taille fixe `font-size: 28px` (le clamp responsive n'a pas de sens pour cette police), `line-height: 1.2`.

### c. Méthode de vérification

Chaque correctif vérifié en direct dans Chrome (`getComputedStyle` sur `fontFamily`/`fontSize`/`fontWeight`/`letterSpacing`/`lineHeight`/`textShadow`/`display` + captures d'écran), en naviguant le vrai flux de jeu (choix de forme du monde → FONDER/REJOINDRE → HUD in-game → panneau EDA → panneau d'aide) plutôt qu'en se fiant au seul code source, plusieurs bugs de fuite par héritage n'étant visibles qu'au rendu.

### Bump

`HEXISTENZ_VERSION` : `v0.9.4.2.2` → `v0.9.4.2.3` (demande explicite).

## 44. Curseurs custom par thème (`css/cursors.css` + `javascript/customCursor.js`) — chantier clos (2026-08-04, v0.9.4.2.3 → v0.9.4.3)

Remplacement du curseur natif du navigateur par des curseurs custom (assets `cursors/kenney-cursor-pack/`), sur l'intégralité du site (prez `index.php`, menus pre-game, HUD in-game `game.php`, galerie `snapshots.php`, replays), avec un jeu d'images distinct par thème graphique.

### a. Curseurs par thème (`css/cursors.css`, sélecteur `[data-theme="..."] *` + `!important`)

Nécessaire car de nombreux éléments du projet déclarent déjà leur propre `cursor: pointer` explicite (sélecteur de type, spécificité supérieure à `*`) — sans `!important` le reset global serait silencieusement ignoré partout où un `cursor` est déjà posé.

- **Thème Médiéval** (`[data-theme="ancien"]`) : `gauntlet_open.png` par défaut (gant ouvert), `gauntlet_point.png` (doigt tendu) au survol d'un élément cliquable, `door_exit.png` sur les 4 boutons "Jouer" de la prez (`a[href="game.php"]` — nav.play, hero.btn_play, multi.btn_create, scores.try_luck).
- **Thème Bleu sidéral** (`[data-theme="bleu"]`) : `hand_open.png` par défaut, `hand_point.png` au survol d'un élément cliquable, `target_round_b.png` sur les mêmes 4 boutons "Jouer", `hand_closed.png` tant que le bouton de la souris est maintenu enfoncé (`*:active`, natif, aucun JS — `:active` se propage à l'élément pressé et à tous ses ancêtres jusqu'à `<html>`, donc couvre même un clic sur une zone "vide").
- **Éléments "cliquables"** (règle commune aux 2 thèmes, spécificité type/attribut > `*` générique) : `a`, `button`, `input[type="button/submit/checkbox/radio/range"]`, `select`, `label[for]`, `[role="button"]`, `[onclick]`, `.cursor-pointer`, **et tout champ de saisie texte** — `input:not([type])` (le type HTML par défaut d'un `<input>` est "text", donc `input[type="text"]` seul ne suffit pas à couvrir les champs sans attribut `type`, comme ceux de `multiplayerRooms.js`), `input[type="text"/"password"/"search"/"email"/"number"/"tel"/"url"]`, `textarea`.
- **Exception** : la liste DÉPLIÉE d'un `<select>` (au clic) est dessinée par l'OS, entièrement hors DOM/CSS — aucune règle `cursor` ne peut l'atteindre, sur aucun site. Le `<select>` fermé obéit normalement aux règles ci-dessus.

### b. Survol du cadre décoratif (`javascript/customCursor.js`, thème Médiéval uniquement)

Au survol du cadre décoratif (les 4 bandeaux `#headerBanner`/`#footerBanner`/`#leftBanner`/`#rightBanner`, §39), le gant redevient `gauntlet_open.png`. Piège rencontré : une 1ère version ciblait directement ces 4 sélecteurs en CSS — sans effet, car ces éléments ont TOUS `pointer-events: none` (volontaire, pour laisser passer les clics vers le contenu en dessous). Un élément avec `pointer-events: none` n'est jamais hit-testé par le navigateur : aucune règle `cursor` posée dessus ne peut jamais s'appliquer, quelle que soit sa spécificité — `getComputedStyle()` peut pourtant afficher la bonne valeur, ce qui a produit un faux positif de vérification (corrigé après retour utilisateur, vérifié ensuite via un vrai survol simulé). Fix réel : détection de zone en JS (`updateCadreHover()`, souris à moins de 85px d'un bord de fenêtre — même valeur que la taille du cadre) qui pose une classe `cadre-hover` sur `<html>`, exploitée par une règle CSS dédiée de spécificité supérieure.

### c. Socle curseur animé (`customCursor.js::setAnimated()`/`reset()`)

Préparé mais non utilisé à ce jour (aucun asset animé dans le projet) : `cursor: url()` n'anime aucun GIF/APNG sur les navigateurs modernes (seule la 1ère image s'affiche) — un calque `<img>` `#hzCursorFollower` (`position:fixed`, suit la souris via `translate3d()` dans le handler `mousemove`) est prêt à prendre le relais du curseur CSS statique le jour où un asset animé sera fourni.

### d. Fix collatéral — `snapshots.php` cassé

Un second `<?php` avait été inséré par erreur alors qu'un bloc PHP était déjà ouvert depuis la ligne 1 (jamais refermé par un `?>` entre les deux) → `Parse error: unexpected token "<"` ligne 74, galerie de captures entièrement inaccessible. Supprimé, aucune autre modification du fichier — vérifié en direct sur le serveur réel (18 captures affichées correctement).

### Bump

`HEXISTENZ_VERSION` : `v0.9.4.2.3` → `v0.9.4.3` (demande explicite).

## 45. Curseurs custom — correctifs et polish, déplacement des assets — chantier clos (2026-08-05, v0.9.4.3 → v1.0.0)

Suite directe du §44 : plusieurs correctifs sur le système de curseurs custom, un ajout gameplay, un polish visuel, et un déplacement d'assets — clôturés avec le passage en v1.0.0.

### a. Descendants d'éléments cliquables (`css/cursors.css`)

Les règles "cliquable" du §44 (`[data-theme="..."] a, button, ...`) ne ciblaient que l'élément cliquable lui-même — ses enfants (`<span>` emoji/label des boutons de preset EDA, `<mark>` des raccourcis clavier des 9 boutons HUD `.debug-light-panel`) retombaient sur la règle par défaut (`gauntlet_open.png`/`hand_open.png`) dès que la souris passait du bouton à son contenu interne, car CSS résout le `cursor` de chaque élément indépendamment par spécificité — un enfant ne "hérite" pas de la règle plus spécifique posée sur son parent. Fix : règle dédiée par thème, mêmes sélecteurs racine suffixés `*` (`a *, button *, label *, [role="button"] *, [onclick] *, .cursor-pointer *`), même spécificité que la règle parent donc aucun conflit d'ordre — couvre tout élément cliquable existant ou futur sans liste ad-hoc par cas.

### b. Checkbox switches sans attribut `for` (`css/cursors.css` + `customCursor.js`)

Les switches de l'EDA (`<label class="pix-switch"><input type="checkbox"/><span></span></label>`, association implicite par imbrication) ne matchaient jamais le sélecteur `label[for]` utilisé jusqu'ici — ni eux ni leur `<span>` visuel (le rail/curseur du switch, seul élément réellement survolé en pratique). `label[for]` → `label` (sans condition d'attribut) dans les 2 CSS et dans `CLICKABLE_SELECTOR` (JS, utilisé par la détection cadre-hover).

### c. Curseur de pose de tuile ne cède plus la place au survol du HUD

Le curseur animé de gameplay (`line_cross.png`/`disabled.png`, §pose de tuile) masque tout curseur natif tant qu'il est actif (classe `cursor-animated-active` → `cursor: none !important` global) — y compris au survol des 9 boutons HUD, qui restaient donc invisibles/mal indiqués par-dessus une tuile en cours de pose. Fix dans `onMouseMove` (`customCursor.js`) : si le curseur animé est actif ET que l'élément réellement survolé est cliquable (même `CLICKABLE_SELECTOR`), le calque animé est temporairement masqué (opacité 0, classe retirée) pour laisser réapparaître le curseur "cliquable" natif du thème ; restauré automatiquement dès que la souris quitte l'élément cliquable.

### d. Drop shadow léger sur tous les curseurs, 2 thèmes

`cursor: url()` ne supporte aucun filtre CSS — impossible d'ajouter une ombre en CSS pur sur les 7 curseurs natifs (gauntlet_open/point, door_exit, hand_open/point/closed, target_round_b). Ombre pré-cuite dans le PNG via un script Python (PIL) : canvas élargi 32×32 → 44×44 (+6px de marge par bord), silhouette de l'image originale en noir semi-transparent (alpha 160/255) décalée de (2,2) et floutée (GaussianBlur r=1.4), image d'origine recomposée par-dessus. Fichiers `<nom>_shadow.png` à côté des originaux (jamais modifiés) ; hotspot de chaque règle CSS = ancien hotspot + 6. Pour `line_cross.png`/`disabled.png` (affichés via `<img>` `#hzCursorFollower`, pas `cursor: url()`) : simple `filter: drop-shadow(2px 2px 1.5px rgba(0,0,0,0.55))` CSS sur `#hzCursorFollower img` — couvre aussi tout futur curseur animé sans retouche d'asset.

### e. `user-select: none` en jeu uniquement (`css/cursors.css`)

Scope `body:not(.game-not-started)` — cette classe est posée par défaut sur `<body>` (`game.php`) et retirée uniquement au lancement réel de la partie (`multiplayerRooms.js::startMultiplayerScene`, même pattern que §37 pour `#scorePanel`/`#tileUI`), donc les menus pre-game (champs pseudo/code de partie) restent sélectionnables normalement — seul le plateau de jeu proprement dit est concerné. `input`/`textarea`/`[contenteditable]` explicitement ré-autorisés par précaution. `cursors.css` n'est chargé que par `game.php`, jamais par la prez `index.php`.

### f. TTS thème — préfixe "Thème " (prez + in-game)

Le changement de thème via le sélecteur (prez `#themeSelect` et in-game `#gameThemeSelect`) annonçait juste le nom du thème ("Bleu sidéral") — préfixé désormais par le mot "Thème" traduit dans les 9 langues (`game.tts.themeChanged`, gabarit `{theme}`, ex. `"Thème {theme}"` en FR, `"Thème {theme}, mon chum"` en fr-CA). Côté in-game : nouvelle fonction `announceThemeChanged()` dans `ttsAnnouncer.js`. Côté prez : `resolveI18n(lang, 'game.tts.themeChanged')` réutilisé directement (même fichiers `json/languages/*.json` chargés en entier dans `I18N`).

### g. Déplacement des assets — `/cursors` → `/vendor/cursors`

Le dossier `cursors/kenney-cursor-pack/` déplacé sous `vendor/cursors/kenney-cursor-pack/` (cohérence avec les autres dépendances tierces déjà sous `vendor/`, ex. `three.module.js`, `wawa-vfx-vanilla.js`). Toutes les références adaptées : les 10 `cursor: url('../cursors/...')` de `css/cursors.css` → `'../vendor/cursors/...'`, et les 2 chemins `'cursors/...'` de `scene.js` (`TILE_HOVER_CURSOR_VALID`/`INVALID`) → `'vendor/cursors/...'`. Aucune autre référence dans le projet (préloader, PHP) ne pointait vers ce dossier. Vérifié en direct : les 2 thèmes, prez et in-game, curseurs statiques et animé de pose de tuile — tous chargent correctement depuis le nouveau chemin, aucun 404.

### Bump

`HEXISTENZ_VERSION` : `v0.9.4.3` → `v1.0.0` (demande explicite — première version "stable" du projet).

## 46. Classement prez à 19, pastille version+date ingame, polish curseur/typo médiéval, clarification captures/replays — chantier clos (2026-08-08, v1.0.0 → v1.0.2.4)

Série de petites demandes ponctuelles du même jour, sans lien architectural entre elles hormis leur cible commune (prez `index.php` et/ou HUD in-game en thème médiéval). Toutes vérifiées en direct sur `http://192.168.0.41/hexistenz/` (jamais sur `hexistenz.world`).

### a. Cap du classement de la prez — 10 → 19 entrées

`index.php` : `$highscores = array_slice($clean, 0, 10)` → `array_slice($clean, 0, 19)` (~l.181), commentaire d'en-tête "top 19" (~l.127) et 3 commentaires internes mentionnant "jusqu'à 19" (~l.918, ~l.920, ~l.948). `json/highscores.json` ne contenait que 6 entrées réelles au moment de la vérification — pas un bug, juste peu de parties soumises au classement à ce jour (à ne pas confondre avec `/json/games/room_*.json`, cf. point f ci-dessous).

### b. Soulignement `<strong>`/`<b>` en thème médiéval — bug récurrent, 5 rounds

`[data-theme="ancien"] strong, [data-theme="ancien"] b { text-decoration: underline; }` (`css/themes/medieval.css` ~l.129, préexistant, posé comme marqueur d'emphase volontaire) peint un soulignement qui s'étend visuellement à travers les descendants inline d'un `<strong>`/`<b>` même si ceux-ci déclarent leur propre `text-decoration` — `text-decoration` n'est pourtant pas héritée au sens strict CSS, d'où plusieurs faux diagnostics en cours de route. Corrigé en 5 rounds successifs (3 signalements utilisateur, dont un explicitement qualifié de "problème récurrent"), chaque fois en élargissant une règle d'exception `text-decoration: none` construite autour de `[data-theme="ancien"] .stat-num` (`css/themes/medieval.css` ~l.1063-1116) :
- **Round 1** : `.stat-num` seul — insuffisant, le HUD "Stats de partie" (`#statsPanel .stats-metrics`) n'utilise pas cette classe, ses chiffres sont directement des `<strong id="statGrass">` etc.
- **Round 2** : ajout `.stats-metrics strong` — couvre enfin ce HUD.
- **Round 3** : ajout `.stats-num-group strong` — les 4 compteurs moulins/trains/bateaux/comètes (`.stats-summary-row`) utilisent un conteneur différent, toujours ratés.
- **Round 4** ("3e signalement") : ajout `.score-strip strong` — les nombres de bonus (+2/+10/+25/+50/+100/+500) de l'aide (touche H) sont des `<strong>` nus dans un 3e conteneur distinct.
- **Round 5** (audit exhaustif demandé explicitement — "vérifie que d'autres conteneurs ne sont pas affectés... demande mon avis si modif") : grep de tous les `<strong>`/`<b>` statiques et générés en JS sur tout le projet → ajout `.fps-hud-row strong`/`.fps-hud-cat-count` (HUD FPS, touche F, 54 éléments générés en template string) et `.rule-line strong` (libellés Eau/Rail/Bonus/Joker du HUD Aide) — ce dernier acceptant de retirer un soulignement qui était à l'origine l'emphase intentionnelle posée au round de conception initial de `medieval.css`, sur demande explicite d'uniformiser à zéro soulignement.

**Leçon consignée dans le CSS lui-même** (commentaires ~l.1069-1112) : face à un bug visuel "un conteneur avec du texte en gras", grep exhaustif dès le 1er signalement plutôt que de patcher container par container au fil de signalements répétés — c'est ce pattern qui a produit 3 allers-retours frustrants.

### c. Curseur animé de pose de tuile actif au survol des menus/HUD

`javascript/customCursor.js`, `CLICKABLE_SELECTOR` (~l.85-111, partagé entre la suspension du survol du cadre et le curseur animé tuile disponible/indisponible de `scene.js::setTileHoverCursor`) — jusque-là ne listait que des éléments réellement cliquables (bouton, lien, input…) ; en quittant une tuile disponible pour survoler la zone non cliquable d'un panneau (padding, texte, fond de menu), aucun sélecteur ne matchait et le curseur de pose restait affiché par-dessus le HUD. Fix : ajout de sélecteurs de CONTENEURS entiers — `#scorePanel`, `#statsPanel`, `.tileDeckBox`, `.missionsBox`, `#helpOverlay`, `.debug-light-panel`, `#highscoreModal`, `#abandonConfirmModal`. Vérifié via dispatch d'événements `mousemove` synthétiques sur chaque conteneur.

### d. Pastille version + date ingame (`#gameVersionBadge`, `game.php` ~l.241)

Ajout d'une pastille discrète affichant `$gameVersion` (regex sur `HEXISTENZ_VERSION`) + date de dernière release, en plusieurs rounds :
- **Position/contraste** — d'abord bas-DROITE, invisible en thème médiéval : diagnostic initial erroné ("texte brun sur parchemin clair"), erratum après vérification aux captures — le coin bas-droit où vit la pastille est en réalité la partie SOMBRE du cadre (pierre/lierre foncé), pas le parchemin. Couleur unifiée sur les 2 thèmes (blanc translucide + double `text-shadow`), la surcharge brune médiévale spécifique retirée. Puis contraste/taille encore accentués sur retour "toujours pas lisible" (opacité 0.45 → 0.75, `text-shadow` renforcé). Repositionnée bas-GAUCHE (le bas-droit est pris par `.debug-light-panel`, les 9 boutons + HUD FPS/EDA). Taille finale +15% (10px → 11.5px), `css/base.css` ~l.49-61.
- **Date** — `#gameVersionDate` (span), calculée côté PHP (`filemtime()` sur `variables.js`, mois en français, `game.php` ~l.80-91) puis reformatée côté JS par langue via `Intl.DateTimeFormat` dans `javascript/gameHudI18n.js::updateGameVersionDate()` (appelée à chaque `registerLangRefresh` + au chargement initial si langue ≠ fr) — même pattern que `#heroVersionDate`/`updateVersionDate()` déjà existant sur la prez (`index.php` ~l.1083), dupliqué plutôt qu'importé (le jeu et la prez ne partagent pas le même graphe de modules ES). Séparateur " • " ajouté entre version et date sur demande explicite.
- **Conteneur en thème médiéval uniquement** (`[data-theme="ancien"] #gameVersionBadge`, `css/themes/medieval.css` ~l.1871-1877) — coins arrondis (`border-radius:8px`), fond sombre translucide `rgba(20, 14, 8, 0.44)` (posé à 0.55 puis réduit de 20% sur demande explicite "doit rester subtile"). Le thème Bleu garde le texte nu sans fond.
- **Tentative équivalente sur la prez EXPLICITEMENT ANNULÉE** : une pastille `#prezVersionBadge` (bas-gauche, par-dessus le cadre médiéval prez) avait été ajoutée à `index.php` + `css/presentation.css`, câblée sur `updateVersionDate()`, puis entièrement retirée le même jour sur demande explicite ("c'était une erreur" — commentaire laissé en trace, `css/presentation.css` ~l.413-416). La prez garde donc seulement sa version en ligne dans le titre (`.hero-version-wrap`/`#heroVersionDate`), pas de pastille en coin — **ne pas la réintroduire par erreur** dans un futur round.

### e. Typographie Enchanted-Land médiévale — 14px → 15px, resserrement tenté puis annulé

9 sélecteurs `[data-theme="ancien"]` en police `EnchantedLand` passés de `font-size: 14px` à `15px` : `.score-title`, `.stats-title`, `.stats-summary-card span:not(.stats-emoji)`, `.stats-card-head span:not(.stats-icon)` (`css/base.css`) ; `.title`, `.hero-tagline` (`css/themes/medieval.css`) ; `.debug-light-main-title` (surcharge dans le bloc `[data-theme="ancien"]`, `css/eda.css` — le thème Bleu reste à 14px) ; `.mode-panel p`, `.multi-status` (`css/multiplayerUi.css`).

Un resserrement `letter-spacing: -0.07em` (-7%), tenté en compensation de l'agrandissement sur les 9 mêmes sélecteurs, a été **entièrement annulé** sur retour utilisateur explicite ("moche et illisible") — tous repassés à `letter-spacing: normal`, conformément à la convention déjà établie de longue date ("aucun letter-spacing sur Enchanted-Land", posée au round du 2026-08-03, cf. §42/§43). Leçon : cette police (`size-adjust:180%` dans le `@font-face`, §42) a un rendu qui ne supporte pas le tracking négatif — toujours vérifier en live avant de figer ce type de compensation typographique "logique sur le papier".

### f. Clarification `/json/games` vs `highscores.json` (question factuelle, pas un bug)

`/json/games/room_CODE.json` (~50 fichiers au moment de l'audit) est la source de vérité de `multiplayer.php` (reprise de chronique via le menu "chroniques ouvertes/backups", `?multi=CODE`) **et** de la galerie de replays (`replays.php`/`replaysPage.js`, qui scanne ce dossier via `multiplayer.php?action=listall`). `highscore.php` ne touche **que** `json/highscores.json`, jamais `/json/games`. Donc : supprimer de vieux fichiers `/json/games/room_*.json` ne casse jamais le classement, mais rend la chronique correspondante définitivement non-reprenable et la retire de la galerie de replays. Aucun nom de fichier n'est codé en dur (`room_NEW.json`/`room_DEBUG.json`/`room_REPLAY.json` vus dans le dossier sont d'anciens codes de chronique saisis manuellement, pas des fichiers système).

### Bump

`HEXISTENZ_VERSION`, en 6 paliers successifs au fil des demandes du jour : `v1.0.0` → `v1.0.1` (lot de corrections soulignement) → `v1.0.2` (fixes de visibilité de la pastille version) → `v1.0.2.1` (schéma à 4 segments, demandé tel quel) → `v1.0.2.2` (retrait pastille prez) → `v1.0.2.3` (séparateur + conteneur arrondi médiéval + opacité -20%) → `v1.0.2.4` (agrandissement typo Enchanted-Land + annulation letter-spacing). Chaque bump validé via `node --check --input-type=module < javascript/variables.js`.

---

## 47. Passe d'humour sur les 9 fichiers de langue — chantier clos (2026-08-08, v1.0.2.4 → v1.0.2.5)

Demande explicite : "davantage d'humour dans les 9 traductions de tous les texte, en particulier sur les versions FR, canadiennes et surtout XIIème siècle". Décisions produit validées par l'utilisateur avant exécution (`AskUserQuestion`) :
- Le panneau technique EDA (réglages LUT/bloom/GPU/FPS/météo) reçoit désormais AUSSI de l'humour — **inverse la règle établie au §32/§43** qui l'imposait volontairement sobre/clair dans toutes les langues, y compris `fr-MED`, pour rester utilisable. Cette règle antérieure est donc caduque à partir de ce round.
- Les libellés d'UI purement fonctionnels (boutons d'action, messages d'erreur bruts, labels de formulaire, raccourcis clavier bruts) restent SANS humour — doivent rester lisibles/actionnables en une fraction de seconde.
- Les 6 langues étrangères (EN/ES/IT/PT/DE/RU) adaptent l'ESPRIT de l'humour à leur propre registre comique plutôt que de traduire littéralement les blagues françaises (un jeu de mots FR ne survit pas à la traduction mot à mot).

**Exécution** : 9 agents en parallèle, un par fichier `json/languages/*.json`, chacun avec un brief dédié (contexte du jeu, calibrage du ton sur l'exemple déjà en place `factions.flat.desc`/`factions.globe.desc` — humour pince-sans-rire, jamais lourd), rappel des contraintes techniques (préserver clés/placeholders/balises HTML/`\n` à l'identique, ne jamais toucher aux libellés fonctionnels, valider via `python3 -c "import json; json.load(...)"` après coup). Les 9 fichiers validés syntaxiquement, structure de clés inchangée (vérifié par comparaison avant/après sur plusieurs fichiers), et vérification live sur 192.168.0.41 (fetch direct des JSON servis) confirmant le nouveau contenu.

**Priorités respectées** (env. 70-250 textes retouchés par fichier selon la langue, jamais les libellés fonctionnels) :
- **`french-medieval.json`** (priorité n°1 explicite) — le panneau EDA passe entièrement dans une métaphore de scriptorium/atelier de moine enlumineur (`eda.label` : "Éditeur de direction artistique (EDA)" → "Atelier du moine enlumineur (EDA)" ; en-têtes d'onglets, tooltips FPS/draw calls/bloom réécrits dans le même registre). Toujours orthographe strictement moderne (contrainte TTS, cf. §1/§46) — l'humour vient du décalage de registre (chroniqueur grave narrant des banalités modernes), jamais d'un archaïsme orthographique forcé.
- **`fr-CA.json`** — humour québécois amplifié (ex. `scores.empty` : "Y'a encore rien pantoute au palmarès — sois le premier à poser une tuile.").
- **`french.json`** — référence/base, humour dense sur tout le contenu narratif + panneau EDA (ex. `factions.globe.desc` : ajout de "Pour ceux qui font confiance à la NASA.", en écho à `factions.flat.desc` déjà existant).
- **6 langues restantes** — passes dédiées avec humour réinventé dans le registre propre à chaque langue (ex. DE : blague classique sur la ponctualité des trains allemands appliquée au biome `rail` ; RU : "милосердно для овец" sur le bouton d'arrêt météo global).

**Mémoire à jour** : la règle "jamais de fantaisie sur les termes techniques EDA en `fr-MED`" (posée au §43) est explicitement remplacée par celle-ci — ne pas la réintroduire par erreur dans un futur round sans redemander confirmation, le produit a changé d'avis sciemment.

### Bump

`v1.0.2.4` → **`v1.0.2.5`** (passe d'humour 9 langues). Validé via `node --check --input-type=module < javascript/variables.js`.

## 48. 3 nouvelles langues — Néerlandais, Polonais, Turc (10e/11e/12e) — chantier clos (2026-08-09, v1.0.2.5 → v1.0.2.6)

Demande explicite, ajoutée en 3 temps : d'abord le néerlandais seul ("D'abord Néerlandais, ensuite on vérifie et enfin polonais"), vérifié en direct, puis le polonais, puis dans un round suivant le turc. Chacune des 3 langues suit strictement le même processus, calqué sur celui du 9e ajout (`fr-MED`, §46) : fichier `json/languages/*.json` traduit par un agent dédié à partir de `english.json` (choisi comme base plutôt que `french.json` — déjà passé par la passe d'humour du §47, culturellement plus proche des 3 langues cibles que le français), avec humour PARTOUT (y compris le panneau technique EDA, règle en vigueur depuis le §47) sauf sur les libellés purement fonctionnels (boutons, erreurs brutes, raccourcis clavier, labels de slider), adapté à l'esprit comique propre à chaque langue plutôt que traduit mot à mot.

**8 points de raccordement, identiques pour les 3 langues** (checklist établie au §46, reconfirmée à l'identique) :
1. `json/languages/<nom>.json` — traduction complète, clés identiques à `english.json` (validé par diff récursif Python, 0 manquante/0 en trop, pour les 3 fichiers).
2. `javascript/gameLangReactive.js` — `LANG_FILES` (code → fichier).
3. `javascript/edaPanelHost.js` — `<option>` dans `#gameLangSelect` (sélecteur EDA in-game).
4. `index.php` — `$LANG_FILES` PHP (le `<select>` de la prez est auto-généré, rien d'autre à toucher côté prez).
5. `index.php` — `TTS_LOCALES_PREZ` (JS inline).
6. `javascript/ttsAnnouncer.js` — `TTS_LOCALES` (`nl-NL` / `pl-PL` / `tr-TR`, pas de hint de voix genrée ajouté, comme pour le néerlandais — à ajouter seulement si un besoin réel est identifié en test).
7. `javascript/gameHudI18n.js` — `GAME_VERSION_DATE_LOCALES` (formatage `Intl.DateTimeFormat` de la date de la pastille version).
8. `javascript/snapshotsPage.js` + `javascript/replaysPage.js` — `LOCALES` (formatage date galeries captures/replays).

**Fichiers sources des traductions** : chaque `*.json` créé par un agent dédié avec brief complet (ton, règle EDA-avec-humour, contrainte clés/placeholders identiques). Exemples de ton retenu :
- **Néerlandais** (`dutch.json`, 1223 lignes) — registre sec/pince-sans-rire ; ex. `audio.silence.desc` compare le silence sonore à "une réunion où ton patron pense que tu es pleinement attentif".
- **Polonais** (`polish.json`, 1223 lignes) — même registre pince-sans-rire ; ex. `game.help.game.efficiency` conclut par "la qualité avant la quantité, comme ta grand-mère l'a toujours dit."
- **Turc** (`turkish.json`, 1224 lignes) — ex. `hero.tagline` prolonge la blague du "vieux français du XIIe siècle" ; `game.help.quality.density` garde la blague "le cheptel de moutons sent les coupes budgétaires en premier" dans le tooltip technique FPS/densité.

**Validation** : `node --check --input-type=module` OK sur les 6 fichiers JS touchés (communs aux 3 langues) ; `python3 -c "import json; json.load(...)"` OK sur les 3 nouveaux JSON. Vérification live sur 192.168.0.41 pour chaque langue : cache HTTP des modules JS parfois périmé en cours de session de test (fetch avec `{cache:'reload'}` sur les 6 fichiers JS avant re-navigation pour forcer le rafraîchissement — pas un bug de prod, juste un artefact de cache navigateur pendant les tests successifs) — une fois la cache purgée, confirmé pour chacune des 3 langues : sélecteur EDA + sélecteur prez affichent le nouveau code (NL/PL/TR), `setGameLang()` traduit tout le HUD (`[data-i18n]`), pastille de date formatée dans la bonne locale (ex. néerlandais "9 augustus 2026", polonais "9 sierpnia 2026", turc "9 Ağustos 2026"), fichier JSON accessible et `game.langName` correct ("Nederlands"/"Polski"/"Türkçe"), locale TTS câblée.

### Bump

`v1.0.2.5` → **`v1.0.2.6`** (10e/11e/12e langues : néerlandais, polonais, turc). Validé via `node --check --input-type=module < javascript/variables.js`.
