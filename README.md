<img width="1708" height="1264" alt="automne" src="https://github.com/user-attachments/assets/4ecd15c3-71cc-4315-acd6-0ca35f902205" />

<div align="center">

# ⬡ Hexistenz

**🇫🇷 Un monde hexagonal low-poly qui vit dans votre navigateur.**  
**🇬🇧 A low-poly hexagonal world that lives in your browser.**

No install · No login · Just play

[![Play Now](https://img.shields.io/badge/▶%20Jouer%20%2F%20Play-online-brightgreen?style=for-the-badge)](https://www.hexistenz.world)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=flat-square&logo=threedotjs)](https://threejs.org)
[![WebGL](https://img.shields.io/badge/WebGL-2.0-red?style=flat-square)](https://www.khronos.org/webgl/)
[![No bundler](https://img.shields.io/badge/no%20bundler-ES%20Modules-blue?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

</div>

---

## 🌐 Jouez en ligne / Play online

> 🇫🇷 Aucune installation. Aucun compte. Ouvrez le lien, posez votre première tuile.  
> 🇬🇧 No install. No account. Open the link, place your first tile.

### **[▶ hexistenz.world](https://www.hexistenz.world)**

---

## 🇫🇷 C'est quoi ?  /  🇬🇧 What is it?

> 🇫🇷 Hexistenz est un jeu de pose de tuiles hexagonales jouable **directement dans le navigateur**, sans installation. Inspiré de **Dorfromantik** et de l'esprit de **The Settlers (Blue Byte, 1993)**, il vous invite à construire patiemment un monde cohérent : prairies, forêts, champs, villages, voies ferrées, rivières et côtes s'assemblent tuile par tuile dans un univers 3D low-poly temps réel.
>
> 🇬🇧 Hexistenz is a hex tile-placement game playable **directly in your browser** — nothing to install, nothing to download. Inspired by **Dorfromantik** and the spirit of **The Settlers (Blue Byte, 1993)**, it invites you to patiently build a coherent world: meadows, forests, fields, villages, railways, rivers and coastlines come together tile by tile in a real-time 3D low-poly universe.

---

## 🎮 Gameplay

### 🇫🇷 Le principe
Chaque tour, vous piochez une **tuile hexagonale** composée de 6 secteurs triangulaires — chacun portant un biome ou un réseau (eau, rail). Vous la faites **pivoter**, la **posez** sur la grille, et le monde grandit.

La mécanique centrale : **les connexions**. Prolonger une zone de même nature rapporte des points. Relier un réseau (fleuve, voie ferrée) à son voisin donne un gros bonus. Entourer complètement une tuile déclenche un multiplicateur.

### 🇬🇧 The basics
Each turn you draw a **hex tile** made of 6 triangular sectors — each carrying a biome or a network type (water, rail). You **rotate** it, **place** it on the grid, and the world grows.

The core mechanic: **connections**. Extending a zone of the same type earns points. Linking a network (river, railway) to its neighbour gives a big bonus. Fully surrounding a tile triggers a multiplier.

### 🎯 Scoring

| Action | 🇫🇷 | 🇬🇧 | Points |
|---|---|---|---|
| Pose | Tuile placée | Tile placed | +2 |
| Arête compatible | Biomes identiques | Matching biomes | +10 |
| Arête réseau | Eau ou rail continu | Continuous water/rail | +25 |
| Tuile entourée | 6 voisins remplis | 6 neighbours filled | +50 |
| Cellule bonus | Case spéciale recouverte | Special cell covered | ×bonus |

---

## 🌍 Biomes

| Biome | 🇫🇷 | 🇬🇧 |
|---|---|---|
| 🌿 `grass` | Prairie — socle paisible du monde | Meadow — the peaceful base layer |
| 🌾 `field` | Champ de blé agité par un vent procédural | Wind-swept wheat field with procedural shader |
| 🌲 `forest` | Forêt de bouleaux : arbres GLB 3D, hauteur et densité variables, brume basse | 3D birch forest: GLB trees, variable height and density, low mist |
| 🏘️ `house` | Village vivant : maisons, tours, moulins, église, chemins de pierre | Living village: houses, towers, windmills, church, stone paths |
| 🌊 `water` | Rivière et côtes : rivage organique, vagues et écume animées, plages, bateaux à sillage | River & coast: organic shoreline, animated waves and foam, beaches, boats with wake |
| 🚂 `rail` | Voie ferrée avec trains 3D animés, wagons, fumée volumétrique | Railway with animated 3D trains, wagons, volumetric smoke |

> 🇫🇷 Les biomes `water` et `rail` sont des **réseaux** : la continuité est imposée par les règles de placement. Briser un fleuve ou une voie ferrée est interdit — vous devrez trouver comment raccorder.  
> 🇬🇧 `water` and `rail` are **networks**: continuity is enforced by placement rules. Breaking a river or a railway is forbidden — you'll have to figure out how to connect.

---

## 🎯 Missions

🇫🇷 Des **missions dynamiques** apparaissent au fil de la partie, tirées aléatoirement parmi neuf types :

| Mission | 🇫🇷 | 🇬🇧 |
|---|---|---|
| 🌲 Forêt | Atteindre une zone boisée d'une certaine taille | Reach a forest zone of a given size |
| 🛖 Village | Construire un village comptant N secteurs | Build a village of N sectors |
| 🛤️ Voie ferrée | Étendre la voie jusqu'à un seuil | Extend the railway past a threshold |
| 🚂 Trains | Faire circuler N trains simultanément | Run N trains simultaneously |
| ⛵ Bateaux | Accumuler N bateaux sur les voies d'eau | Accumulate N boats on waterways |
| 💧 Voie d'eau | Relier une étendue d'eau de taille N | Connect a waterway of size N |
| 🌿 Prairie | Étendre les prairies jusqu'au seuil | Extend meadows to the threshold |
| 🌾 Champs de blé | Cultiver une zone de champs suffisante | Cultivate a large enough field zone |
| ⚙️ Moulins | Faire tourner N moulins à vent dans les champs | Spin N windmills in the wheat fields |

🇫🇷 Réussir une mission fait apparaître entre 1 et 5 **cellules bonus** sur la grille, signalées visuellement. Les recouvrir avec une tuile déclenche un **multiplicateur de score**.

🇬🇧 Completing a mission spawns 1 to 5 **bonus cells** on the grid, visually highlighted. Covering them with a tile triggers a **score multiplier**.

---

## ☀️ Cycle jour / nuit — Day / Night cycle

🇫🇷 Le soleil orbite en temps réel autour du monde. Sa trajectoire modifie dynamiquement l'éclairage directionnel, la teinte des ombres et l'atmosphère générale. Via le panneau LUT, vous pouvez :
- basculer entre **mode Soleil** (jour ensoleillé) et **mode Lune** (nuit étoilée)
- activer ou désactiver l'**orbite du soleil** pour figer la lumière
- ajuster vitesse, rayon et hauteur de l'orbite

🇬🇧 The sun orbits the world in real time. Its trajectory dynamically alters directional lighting, shadow tones, and overall atmosphere. Via the LUT panel you can:
- switch between **Sun mode** (daytime) and **Moon mode** (starlit night)
- toggle **sun orbit** to freeze the light
- adjust orbit speed, radius, and height

---

## 🎨 LUT & Ambiances

🇫🇷 Un panneau d'**étalonnage en direct** (touche `L`) expose l'intégralité du pipeline de rendu, organisé en sections :

- **Rendu** — exposition, gamma, saturation, contraste, vibrance
- **Brouillard** — densité, couleur, distance
- **Lumières** — lumière ambiante, directionnelle, orbite solaire
- **Étalonnage** — pipeline final post-rendu Three.js
- **Palette biomes** — harmonisation chromatique par type de terrain

Des **presets d'ambiance** (chargés depuis `ambiances.json`) permettent de basculer en un clic entre des atmosphères radicalement différentes : automne chaud, été vif, aube laiteuse, nuit lunaire, crépuscule... Chaque preset embarque ses réglages LUT, son mode de pixelisation et sa configuration cinématique.

🇬🇧 A **live color-grading panel** (press `L`) exposes the full rendering pipeline, organized into sections:

- **Render** — exposure, gamma, saturation, contrast, vibrance
- **Fog** — density, color, distance
- **Lights** — ambient, directional, solar orbit
- **Grading** — final post-render Three.js pipeline
- **Biome palette** — chromatic harmonization per terrain type

**Ambiance presets** (loaded from `ambiances.json`) let you switch in one click between radically different atmospheres: warm autumn, vivid summer, milky dawn, lunar night, dusk… Each preset bundles its own LUT settings, pixelization mode, and cinematic configuration.

---

## 🖼️ Rendu visuel / Visual rendering

🇫🇷 Hexistenz mise sur un rendu soigné avec un pipeline post-processing Three.js complet et des shaders dédiés par biome :

🇬🇧 Hexistenz aims for polished visuals with a full Three.js post-processing pipeline and dedicated per-biome shaders:

- **Étalonnage couleur / Color grading** — exposition, contraste, saturation, gamma, vibrance réglables en direct
- **Effets cinématiques / Cinematic effects** `T` — vignette, grain argentique, scan lines style CRT
- **Modes rétro / Retro modes** — pixelisation CGA (4 couleurs), EGA (16 couleurs), Amiga OCS (32 couleurs), Noir & Blanc, Phosphore vert
- **Vent procédural / Procedural wind** — shader dédié animant herbes, lames de prairie et épis de blé de façon cohérente sur l'ensemble de la carte
- **Fumée volumétrique / Volumetric smoke** — pass shader sur les cheminées de trains et les toits de village
- **Eau vivante / Living water** — nappe continue au rivage organique, vagues et écume animées façon aquarelle, bateaux avec sillage, plages procédurales
- **Courbure mondiale / World curvature** — mode bouliste qui arrondit l'horizon comme un globe
- **Ciel étoilé + comètes / Starfield + comets** — shader d'univers lointain, comètes traversant le ciel en temps réel
- **Relief procédural / Procedural terrain** — hauteur de surface par biome via somme de sinus + bruit FNV-1a

---

## 🔊 Son / Audio

🇫🇷 Ambiances spatiales dynamiques par biome : bruissement de forêt, vagues, trains au loin, cris de corbeaux, musique d'ambiance. Muet/son : touche **M**.

🇬🇧 Dynamic spatial ambiences per biome: rustling forest, waves, distant trains, crow calls, ambient music. Mute/unmute: press **M**.

---

## 👥 Multijoueur / Multiplayer

🇫🇷 Le jeu propose un **mode multijoueur en ligne** : créez une partie, partagez le code, jouez ensemble sur la même grille, et comparez votre score sur le **tableau des high scores** partagé. Toujours sans installation — un navigateur suffit.

🇬🇧 The game includes an **online multiplayer mode**: create a session, share the code, play together on the same grid, and compare your score on the **shared leaderboard**. Still no install — a browser is all you need.

---

## ⌨️ Contrôles / Controls

| Touche / Key | 🇫🇷 | 🇬🇧 |
|---|---|---|
| Clic gauche / Left click | Poser la tuile | Place the tile |
| Clic droit / Right click | Faire pivoter | Rotate |
| Molette / Scroll | Zoom | Zoom |
| Clic milieu + drag | Panoramique | Pan |
| `M` | Muet / Son | Mute / Unmute |
| `I` | Mode immersif (masque HUD) | Immersive mode (hide HUD) |
| `Shift+Espace` | Super-immersif (masque tout) | Super-immersive (hide everything) |
| `L` | Panneau LUT & ambiances | LUT & ambiance panel |
| `T` | Effets cinématiques on/off | Cinematic effects on/off |

---

## 🛠️ Stack technique / Tech stack

🇫🇷 Zéro framework, zéro bundler, zéro dépendance npm. Juste des ES Modules natifs, du WebGL, et du PHP côté serveur pour les scores.

🇬🇧 Zero framework, zero bundler, zero npm dependency. Just native ES Modules, WebGL, and PHP server-side for scores.

```
Three.js r160 (CDN, ES Module)  ·  WebGL 2.0  ·  Canvas 2D
JavaScript ES Modules (no bundler)  ·  PHP  ·  JSON storage
Shaders GLSL dédiés : eau · herbe · blé · ciel · étoiles · fumée · cinématique · environnement
```

> 🇫🇷 Le projet est développé entièrement en **vibe coding** — principalement avec **Claude** et **Codex** — dans une approche de prototypage rapide, d'expérimentation continue et de gameplay émergent.  
> 🇬🇧 The project is developed entirely through **vibe coding** — mainly with **Claude** and **Codex** — with a strong emphasis on rapid prototyping, continuous experimentation and emergent gameplay.

---

<img width="1699" height="1258" alt="bouliste" src="https://github.com/user-attachments/assets/00508169-fbb7-4824-bdf2-08bba168a349" />
<img width="1713" height="1268" alt="amiga" src="https://github.com/user-attachments/assets/59ab76a1-4c9e-4a34-8d0d-26ac4367e532" />
<img width="1717" height="1267" alt="ete-vif" src="https://github.com/user-attachments/assets/aded7d15-75a5-42f0-aa30-160bac9f3583" />
<img width="1709" height="1262" alt="jour" src="https://github.com/user-attachments/assets/356d4a56-cad0-457d-8695-b9f1cbcbca76" />

---

<div align="center">

*🇫🇷 Fait avec curiosité, Three.js et beaucoup de tuiles.*  
*🇬🇧 Made with curiosity, Three.js and a lot of tiles.*

# ⬡

</div>
