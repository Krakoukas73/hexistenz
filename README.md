
<img width="1536" height="1024" alt="Hexistenz hero" src="https://github.com/user-attachments/assets/8561d479-a1cc-4e50-8dfd-75b394e7f7d2" />


<div align="center">

# ⬡ Hexistenz

**🇫🇷 Un monde hexagonal low-poly qui vit dans votre navigateur.**  
**🇬🇧 A low-poly hexagonal world that lives in your browser.**

No install · No login · Just play

[![Play Now](https://img.shields.io/badge/▶%20Jouer%20%2F%20Play-online-brightgreen?style=for-the-badge)](https://hexistenz.com)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black?style=flat-square&logo=threedotjs)](https://threejs.org)
[![WebGL](https://img.shields.io/badge/WebGL-2.0-red?style=flat-square)](https://www.khronos.org/webgl/)
[![No bundler](https://img.shields.io/badge/no%20bundler-ES%20Modules-blue?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

</div>

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

---

## 🌍 Biomes

| Biome | 🇫🇷 | 🇬🇧 |
|---|---|---|
| 🌿 `grass` | Prairie — socle paisible | Meadow — the peaceful base |
| 🌾 `field` | Champ de blé agité par le vent | Wind-swept wheat field |
| 🌲 `forest` | Forêt de bouleaux 3D | 3D birch forest |
| 🏘️ `house` | Village avec maisons, tours, moulins, église | Village with houses, towers, windmills, church |
| 🌊 `water` | Eau avec bateaux, plages, profondeur | Water with boats, beaches, depth shading |
| 🚂 `rail` | Voie ferrée avec trains animés et wagons | Railway with animated trains and wagons |

> 🇫🇷 Les biomes `water` et `rail` sont des **réseaux** : si vous brisez la continuité d'un fleuve ou d'une voie, la règle de placement vous l'interdit.  
> 🇬🇧 `water` and `rail` are **networks**: if you break the continuity of a river or a railway, placement is forbidden.

---

## 🎯 Missions

🇫🇷 Des **missions dynamiques** apparaissent au fil de la partie : atteindre une zone d'eau de taille 12, construire un village de 8 secteurs, prolonger la voie ferrée jusqu'à un certain seuil… Les réussir rapporte des **bonus de cellules spéciales** qui apparaissent sur la grille et offrent des multiplicateurs de score quand on les recouvre.

🇬🇧 **Dynamic missions** appear as you play: reach a water zone of size 12, build a village of 8 sectors, extend the railway past a given threshold… Completing them unlocks **special bonus cells** on the grid that trigger score multipliers when covered.

---

## 👥 Multijoueur / Multiplayer

🇫🇷 Le jeu propose un **mode multijoueur en ligne** : créez une partie, jouez ensemble, et comparez votre score sur le **tableau des high scores** partagé. Toujours sans installation — un navigateur suffit.

🇬🇧 The game includes an **online multiplayer mode**: create a session, share the game, and compare your score on the **shared leaderboard**. Still no install — a browser is all you need.

---

## 🖼️ Rendu visuel / Visual rendering

🇫🇷 Hexistenz mise sur un rendu soigné avec un pipeline post-processing Three.js complet :

🇬🇧 Hexistenz aims for polished visuals with a full Three.js post-processing pipeline:

- **Étalonnage couleur / Color grading** — exposition, contraste, saturation, gamma, vibrance réglables en direct
- **Modes rétro / Retro modes** — pixelisation CGA (4 couleurs), EGA (16 couleurs), Amiga (32 couleurs OCS), Noir & Blanc, Phosphore vert
- **Dégradé eau / Water depth** — carte de profondeur procédurale, zones de plage, bateaux animés
- **Courbure mondiale / World curvature** — mode bouliste qui arrondit l'horizon
- **Ciel étoilé + comètes / Starfield + comets** — le ciel est vivant

---

## 🔊 Son / Audio

🇫🇷 Ambiances spatiales dynamiques par biome : bruissement de forêt, vagues, trains au loin, cris de corbeaux, musique d'ambiance. Muet/son : touche **M**.

🇬🇧 Dynamic spatial ambiences per biome: rustling forest, waves, distant trains, crow calls, ambient music. Mute/unmute: press **M**.

---

## ⌨️ Contrôles / Controls

| Action | 🇫🇷 | 🇬🇧 |
|---|---|---|
| Clic gauche / Left click | Poser la tuile | Place the tile |
| Clic droit / Right click | Faire pivoter | Rotate |
| Molette / Scroll | Zoom | Zoom |
| Clic milieu + drag | Panoramique | Pan |
| `M` | Muet | Mute |
| `I` | Mode immersif | Immersive mode |

---

## 🛠️ Stack technique / Tech stack

🇫🇷 Zéro framework, zéro bundler, zéro dépendance npm. Juste des ES Modules natifs, du WebGL, et du PHP côté serveur pour les scores.

🇬🇧 Zero framework, zero bundler, zero npm dependency. Just native ES Modules, WebGL, and PHP server-side for scores.

```
Three.js r160 (CDN, ES Module)  ·  WebGL 2.0  ·  Canvas 2D
JavaScript ES Modules (no bundler)  ·  PHP  ·  JSON storage
```

> 🇫🇷 Le projet est développé entièrement en **vibe coding** — principalement avec **Claude** et **Codex** — dans une approche de prototypage rapide, d'expérimentation continue et de gameplay émergent.  
> 🇬🇧 The project is developed entirely through **vibe coding** — mainly with **Claude** and **Codex** — with a strong emphasis on rapid prototyping, continuous experimentation and emergent gameplay.

---



<img width="1536" height="1024" alt="21" src="https://github.com/user-attachments/assets/f243058f-9801-44d0-9436-e86f12e14804" />


---

<div align="center">

*🇫🇷 Fait avec curiosité, Three.js et beaucoup de tuiles.*  
*🇬🇧 Made with curiosity, Three.js and a lot of tiles.*

# ⬡ 

</div>
