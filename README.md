
<img width="1536" height="1024" alt="Hexistenz hero" src="https://github.com/user-attachments/assets/8561d479-a1cc-4e50-8dfd-75b394e7f7d2" />

<div align="center">

# ⬡ Hexistenz

**🇫🇷 Un monde hexagonal low-poly qui vit dans votre navigateur.**  
**🇬🇧 A low-poly hexagonal world that lives in your browser.**

`v0.14` · No install · No login · Just play

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

🇫🇷 Le jeu propose un **mode multijoueur en ligne** : créez une partie, partagez le lien, et comparez votre score sur le **tableau des high scores** partagé. Toujours sans installation — un navigateur suffit.

🇬🇧 The game includes an **online multiplayer mode**: create a session, share the link, and compare your score on the **shared leaderboard**. Still no install — a browser is all you need.

---

## 🖼️ Rendu visuel / Visual rendering

🇫🇷 Hexistenz mise sur un rendu soigné avec un pipeline post-processing Three.js complet :

🇬🇧 Hexistenz aims for polished visuals with a full Three.js post-processing pipeline:

- **Étalonnage couleur / Color grading** — exposition, contraste, saturation, gamma, vibrance réglables en direct
- **Modes rétro / Retro modes** — pixelisation CGA (4 couleurs), EGA (16 couleurs), Amiga (32 couleurs OCS), Noir & Blanc, Phosphore vert
- **Dégradé eau / Water depth** — carte de profondeur procédurale, zones de plage, bateaux animés
- **Courbure mondiale / World curvature** — mode bouliste qui arrondit l'horizon
- **Ciel étoilé + comètes / Starfield + comets** — le ciel est vivant
- **Animation hex du menu / Hex pixelization on menu** — les fonds du menu démarrage se pixelisent progressivement en hexagones puis reviennent à la netteté (animation `sin²`, canvas 2D)

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

## 📸 Screenshots

<img width="1536" height="1024" alt="30" src="https://github.com/user-attachments/assets/91c0b898-6243-42c3-9c3c-9f9b1a838a4e" />
<img width="1672" height="941" alt="06" src="https://github.com/user-attachments/assets/f13c20d9-d687-4fbf-ba24-52a11bd00c72" />
<img width="1536" height="1024" alt="25" src="https://github.com/user-attachments/assets/e5416dcf-f382-456c-a107-8f1ef662bcc1" />
<img width="1672" height="941" alt="05" src="https://github.com/user-attachments/assets/dc25fd6e-53ba-453f-8387-e94823822c4d" />
<img width="1536" height="1024" alt="09" src="https://github.com/user-attachments/assets/f3433ebe-cc06-4ecc-9a9e-b97d8b7b1dda" />
<img width="1536" height="1024" alt="13" src="https://github.com/user-attachments/assets/f24a20ab-3e65-461f-a754-b2223f072c33" />
<img width="1536" height="1024" alt="11" src="https://github.com/user-attachments/assets/ffa951f1-e7ae-4097-991a-3ffe014c8d0c" />
<img width="1672" height="941" alt="19" src="https://github.com/user-attachments/assets/5feedc33-a247-4734-a360-f5c68da2af93" />
<img width="1536" height="1024" alt="29" src="https://github.com/user-attachments/assets/bccb3ffc-8312-4ce0-9534-c4d35c3ef61b" />
<img width="1536" height="1024" alt="15" src="https://github.com/user-attachments/assets/9cfd8960-db6c-485f-9641-a0eff5eb2249" />
<img width="1672" height="941" alt="07" src="https://github.com/user-attachments/assets/02f4ddec-9645-4061-aeb6-ef932d029362" />
<img width="1672" height="941" alt="08" src="https://github.com/user-attachments/assets/926d1cb1-ffe9-44f5-9404-bddb52bce11a" />
<img width="1536" height="1024" alt="28" src="https://github.com/user-attachments/assets/092fc005-2282-4ae7-b03a-f6a5cfa2af7f" />
<img width="1536" height="1024" alt="26" src="https://github.com/user-attachments/assets/a9bfce25-16bb-44b6-9a2c-88655d45cd7b" />
<img width="1672" height="941" alt="02" src="https://github.com/user-attachments/assets/b5ba1637-53a1-415d-93a1-6af2ca5aa4c0" />
<img width="1536" height="1024" alt="16" src="https://github.com/user-attachments/assets/4f6ed129-1518-4b87-9f1b-49c4ca3e9ca8" />
<img width="1672" height="941" alt="10" src="https://github.com/user-attachments/assets/3f9469ca-a988-4305-afda-2588b3e5edb7" />
<img width="1536" height="1024" alt="14" src="https://github.com/user-attachments/assets/b7e2aa99-ba73-4cb8-88d2-d924085946b1" />
<img width="1672" height="941" alt="22" src="https://github.com/user-attachments/assets/047bba90-cd76-4d4b-8c0f-080dd3011311" />
<img width="1536" height="1024" alt="31" src="https://github.com/user-attachments/assets/fd73b3b4-a398-498a-b0e1-937f36ebf673" />
<img width="1536" height="1024" alt="20" src="https://github.com/user-attachments/assets/0020f0ca-58e3-462c-8d60-d03b27573a75" />
<img width="1672" height="941" alt="23" src="https://github.com/user-attachments/assets/e9c63261-a2fe-4025-9762-9013220170fc" />
<img width="1672" height="941" alt="01" src="https://github.com/user-attachments/assets/e6261592-b993-4eee-8fe3-ac54abcdb08d" />
<img width="1672" height="941" alt="12" src="https://github.com/user-attachments/assets/e92adb04-408e-4fcc-b649-ddc32f03881e" />
<img width="1672" height="941" alt="18" src="https://github.com/user-attachments/assets/753364aa-1e03-46eb-a130-221515089b1a" />
<img width="1536" height="1024" alt="17" src="https://github.com/user-attachments/assets/c125de82-7d20-4c88-b1b0-d77fde5be341" />
<img width="1672" height="941" alt="24" src="https://github.com/user-attachments/assets/983b94ff-69e8-43ca-ab08-f07526577e1b" />
<img width="1672" height="941" alt="03" src="https://github.com/user-attachments/assets/cf513d8d-c79a-41cb-a7a4-72bc23db3938" />
<img width="1536" height="1024" alt="21" src="https://github.com/user-attachments/assets/f243058f-9801-44d0-9436-e86f12e14804" />
<img width="1672" height="941" alt="04" src="https://github.com/user-attachments/assets/8fb6dc58-2437-44ed-913b-a2fc35c0c0c0" />

---

<div align="center">

*🇫🇷 Fait avec curiosité, Three.js et beaucoup de tuiles.*  
*🇬🇧 Made with curiosity, Three.js and a lot of tiles.*

</div>
