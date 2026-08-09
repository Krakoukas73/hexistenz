# CONTEXT-2.md — Hexistenz V2 (base de conception)

> Ce document n'est PAS un journal de bord comme `CONTEXT.md` (qui documente le code V1 tel qu'il existe). C'est un **cahier des charges de démarrage** pour une réécriture V2 dans un vrai moteur de jeu (Godot, Unity, ou autre — non tranché, cf. §2), construit à partir de 60 jours de développement en commun sur la V1 : ce qui a marché, ce qui a coûté cher, et ce qui doit être posé correctement dès le jour 1 plutôt que corrigé au fil des signalements.
>
> Portée demandée : priorité à l'**architecture technique** et au **game design**, multijoueur **entièrement repensé** (pas repris tel quel), niveau de détail **cahier des charges structuré** (utilisable dès le premier jour de code).
>
> Sources : `CONTEXT.md` (46 sections, ~2000 lignes, V1) et l'expérience directe de correction de bugs/évolutions sur le jeu en production.

---

## 1. Ce qu'est Hexistenz — identité à préserver

Jeu contemplatif de pose de tuiles hexagonales, inspiré Dorfromantik / The Settlers / HoMM. Boucle : **pioche → rotation → pose → score → missions → bonus → extension de grille → tuile suivante**.

Chaque tuile a 6 secteurs triangulaires (un par arête hexagonale : N/NE/SE/S/SW/NW), chacun porteur d'un biome ou d'un réseau. Le joueur connecte les biomes entre tuiles adjacentes, complète des missions générées dynamiquement, maximise un score et une "efficacité" (score rapporté au nombre de tuiles posées).

Deux modes de courbure du monde ("platiste" / "bouliste"), deux thèmes graphiques (moderne "Bleu" / médiéval "Ancien"), 9 langues, TTS optionnel, multijoueur asynchrone par salons.

**Ce qui a fait la valeur du jeu et doit survivre à la réécriture** : la lisibilité immédiate de la règle (un coup d'œil suffit à voir si une tuile est compatible), la contemplation (musique, ambiances météo/jour-nuit, caméra libre), et la profondeur optionnelle (missions, efficacité, multi) qui ne s'impose jamais au joueur qui veut juste poser des tuiles.

---

## 2. Choix de moteur — critères de décision (non tranché)

Aucun moteur n'est encore choisi. Ce document reste volontairement agnostique et la logique de jeu pure (§4-5) doit être écrite de façon à ne dépendre d'aucune API moteur (voir §3, "cœur de règles portable").

Critères à trancher avant de commencer, avec ce que l'expérience V1 suggère pour chacun :

| Critère | Ce que la V1 a révélé |
|---|---|
| Budget/licence | V1 était 100% gratuit (JS natif, PHP mutualisé). Si le projet reste non-commercial ou à budget serré, Godot élimine ce risque d'entrée. |
| Grille hexagonale | Aucun des deux moteurs n'a de support hexagonal natif complet — Godot a un `TileMap` avec mode hexagonal (2D) mais rien d'équivalent en 3D ; Unity n'a rien de natif non plus. Dans les deux cas, la math axiale (`axialToWorld`/`worldToAxial`, cf. §3) doit être réimplémentée à la main — ni l'un ni l'autre n'a d'avantage réel ici. |
| Rendu 3D stylisé (le jeu est en 3D, caméra libre, post-processing élaboré : CRT, bloom, tilt-shift, God rays, courbure de monde, fumée volumétrique) | Unity a un pipeline de rendu (URP/HDRP) et un écosystème de shaders plus mature pour ce niveau d'effets ; Godot 4 (Vulkan) a rattrapé une bonne partie mais avec moins de ressources tierces. À vérifier au moment de trancher : la faisabilité de reproduire précisément la courbure de monde en vertex shader (§6) et le ray-march de fumée/nuages (§6) dans le moteur choisi. |
| Équipe | Solo/petite équipe → Godot est réputé plus rapide à onboarder, code base plus légère à maintenir. Unity a plus de recrutement disponible si l'équipe grandit. |
| Web / portabilité | La V1 est 100% web (aucun install). Si cette contrainte reste forte, vérifier l'état de l'export HTML5/WebGL de chaque moteur au moment de la décision (historiquement variable en performance et en poids de build) — un critère potentiellement éliminatoire à vérifier en premier avant tout autre arbitrage. |
| Alternative "ne pas changer de stack" | Réécrire proprement en gardant Three.js + un vrai outillage (bundler, TypeScript, tests) reste une option à ne pas exclure d'office : la majorité des leçons de ce document (architecture UI, multijoueur, perf) s'appliquent alors identiquement, et tout le code de rendu existant (shaders, overlays) devient une base de portage directe plutôt qu'une réécriture. |

**Recommandation de méthode** : ne pas choisir le moteur avant d'avoir un prototype jouable minimal (grille + pose + score, sans art) dans les 2-3 candidats sérieux, sur un scope d'une demi-journée chacun — la V1 a montré que les vrais coûts (post-processing custom, hex math, perf à grande échelle) ne se révèlent pas dans un tutoriel "Hello World".

---

## 3. Cœur de règles — à garder engine-agnostique

La plus grosse leçon d'architecture de la V1 : les fichiers qui contiennent la **logique pure du jeu** (`hex.js`, `tileGenerator.js`, `zoneUtils.js`, `scoring.js`, `missions.js`, `gameRules.js`) n'ont **aucune dépendance à Three.js** — ce sont des fonctions pures sur des structures de données simples (objets, `Map`). C'est ce qui a permis, par exemple, de reconstruire une partie entière hors-scène pour le replay (`replayEngine.js`) sans dupliquer les règles.

**Recommandation V2** : préserver ce découpage strictement, quel que soit le moteur — un module "règles" testable en isolation (idéalement avec de vrais tests unitaires, absents en V1 faute d'outillage de build) et un module "présentation" qui consomme ces règles. Ce découpage rend aussi le choix de moteur réversible plus tard : le cœur de règles peut être écrit une fois (C#, GDScript, ou même rester en TypeScript compilé si le moteur le permet) et n'a pas à être réécrit si le moteur change.

### Spec technique reprise de la V1 (à réimplémenter, indépendamment du moteur)

- **Grille axiale (q, r)** : `axialToWorld(q, r) → {x, y, z}` avec `x = HEX_SIZE·1.5·q`, `z = HEX_SIZE·√3·(r + q/2)` ; conversion inverse par arrondi cube. Distance centre-à-centre = `HEX_SIZE·√3`, apothème = `HEX_SIZE·√3/2`.
- **Tuile** : `{ id, edges: {n, ne, se, s, sw, nw}, rotation }`, immuable — la rotation ne doit **jamais** recalculer une position/centre dérivée (piège vécu : un centre recalculé silencieusement désynchronise placement et rendu).
- **Biomes** : prairie, champ, forêt, village, eau, rail. Eau et rail sont des **réseaux** — continuité imposée explicitement à la génération (pas de tronçon qui s'arrête dans le vide), les 4 autres sont des biomes de zone simples.
- **BFS de zones** : deux variantes de voisinage à garder distinctes — une "texture complète" (centre + intra-tuile + inter-tuile, pour les zones affichées/missions) et une "locale" (centre + voisin hexagonal seul, pour les effets purement décoratifs comme le blé). Les fusionner par souci de simplicité a été explicitement déconseillé en V1 (`zoneUtils.js`, commentaire "ne pas remplacer") — les deux servent des besoins différents et une fusion casse subtilement l'un des deux usages.
- **Score** : +2 pose, +10 arête compatible, +25 réseau compatible, +50 tuile entourée, + cellules bonus. Simple, lisible en un coup d'œil pour le joueur — ne pas complexifier sans nécessité de gameplay validée (cf. philosophie, §11).
- **Missions** : modèle `{ baseline, target, gained = clamp(current − baseline, 0, target − baseline) }` — la progression est relative au moment de génération de la mission, pas absolue. Barre de progression graduée plutôt que continue (plus lisible à distance). Une mission réussie disparaît de l'affichage immédiatement mais reste un temps dans le modèle de données pour permettre l'undo — bien séparer "affichage" et "rétention pour undo", ce sont deux durées de vie différentes.
- **Efficacité** : score rapporté au nombre de tuiles posées, avec un seuil minimal de tuiles (`EFFICIENCY_MIN_TILES`) et un exposant de minoration en dessous de ce seuil, pour ne pas récompenser un score artificiellement élevé sur très peu de tuiles. Cette formule a été ajoutée tard en V1 (post-lancement) — en V2, la documenter et la figer dès la conception du scoring plutôt que de la superposer après coup évite un rework de tout le HUD score.
- **Courbure du monde** : formuler en **distance d'arc**, jamais en corde euclidienne. `drop = -R·(1 - cos(dist/R))` est défini partout et borné nativement (`|sin| ≤ 1`), contrairement à une formule en corde qui explose près de `dist = R` et nécessite un clamp arbitraire masquant le vrai problème. Levier direct pour un moteur avec un vertex shader custom ou un système de displacement.

---

## 4. Rendu, performance — leçons transposables

La V1 tourne dans un navigateur sans bundler (ES modules natifs, Three.js CDN) et a dû batailler pour la perf à la main ; un vrai moteur fournit une bonne partie de ceci nativement, mais les **principes** restent valables :

- **Instancing systématique** pour tout élément répété (arbres, moutons, décor de village) — payant dès quelques centaines d'instances. Piège vécu et transposable : un objet partagé avec un matériau custom (shader injecté) perd cette personnalisation au clonage si le moteur ne le copie pas automatiquement — toujours vérifier ce que fait exactement l'API d'instanciation du moteur choisi avec les matériaux/shaders personnalisés avant de construire tout un pipeline dessus.
- **LOD testé à intervalle, pas à chaque frame** (V1 : toutes les 9 frames) — un bon compromis coût/réactivité à réévaluer selon le moteur (beaucoup ont un système de LOD/culling déjà intégré, auquel cas ce point devient gratuit).
- **Pipeline de rebuild différé** : en V1, poser une tuile ne reconstruit pas immédiatement tous les overlays (eau, blé, rails) — les rebuilds coûteux sont debouncés/groupés. À reprendre : ne jamais recalculer une géométrie lourde de façon synchrone dans un handler d'input/événement fréquent (piège vécu avec les sliders du panneau de réglages : chaque `input` déclenchait un rebuild complet avant filtrage par clé — passer de ~0,30 ms à ~0,01 ms par évènement en filtrant juste ce qui doit réellement changer).
- **Mesurer le bon timer** : un chronomètre autour d'un appel de rendu mesure la soumission CPU, pas l'exécution GPU réelle (le rendu est asynchrone) — un goulot GPU peut rester invisible sur un profiler CPU naïf. Vérifier dès le départ quel outil de profiling du moteur choisi mesure réellement le temps GPU.
- **Post-processing hors scène-graph n'hérite d'aucune transformation globale automatiquement** (ex. courbure du monde, cf. §3) — toute logique world-space dans un shader de post-traitement doit répliquer manuellement ce que la scène applique ailleurs. Concerne tout moteur avec un système de post-processing séparé du scene-graph.
- **Un matériau non éclairé pour toute géométrie sans normales calculées** (buffer généré, pas de `normal` attribute) — un shader éclairé standard produit des NaN silencieux (triangles qui disparaissent) si la normale est nulle. Vérifier ce que fait le moteur choisi par défaut dans ce cas.

---

## 5. UI / thèmes — le piège central à éviter en V2

**C'est la leçon la plus coûteuse en temps de la V1**, à traiter en priorité architecturale dès le premier composant d'interface codé.

Le thème médiéval de la V1 pose une règle générique "tout `<strong>`/texte en gras est souligné" au niveau du thème global, avec des exceptions ajoutées container par container à chaque fois qu'un nouveau composant HUD révèle le problème. Résultat vécu : **5 rounds de correction sur le même bug visuel**, signalés à répétition par l'utilisateur ("3ème signalement", "problème récurrent"), chaque round élargissant une liste d'exceptions plutôt que de traiter la cause structurelle.

Cause structurelle : une règle de style posée au niveau global (thème) avec des **exceptions locales accumulées de façon réactive**, au lieu d'un système de composants où chaque composant déclare explicitement son propre style dès sa création.

**Pour la V2, quel que soit le moteur (systèmes de thèmes UI de Godot/Unity fonctionnent tous deux par ressources/styles réutilisables assignés explicitement, pas par cascade implicite comme le CSS)** :
- Ne jamais poser une règle de style "par défaut sur tout" avec l'intention de l'exclure au cas par cas — partir de styles explicites par composant, avec un thème comme simple palette de valeurs (couleurs, tailles) que chaque composant consomme consciemment.
- Dès qu'un nouveau composant HUD est ajouté, l'auditer contre le système de thème existant AU MOMENT de sa création, pas au premier signalement utilisateur.
- Documenter noir sur blanc, dans le design du thème, la liste exhaustive des composants qui existent et leur style attendu — la V1 n'a découvert son inventaire complet de composants texte qu'au 5ᵉ round, via un grep exhaustif fait a posteriori. Faire cet inventaire une fois, en V2, avant même d'écrire le premier style.

Autres leçons UI transposables :
- Toute modification de style/typo décidée "en théorie" (ex. resserrer l'espacement des lettres pour compenser un agrandissement de police) doit être **vérifiée visuellement en direct avant d'être figée** — une compensation mathématiquement cohérente s'est révélée illisible à l'usage et a dû être intégralement annulée.
- Un cache-busting explicite par fichier de style (paramètre de version basé sur la date de modification) est nécessaire dès qu'il y a plusieurs feuilles de style — un mécanisme de cache-busting posé seulement sur un fichier "parent" ne se propage pas automatiquement aux fichiers qu'il inclut, et un `@import` (équivalent CSS) ajoute une latence réseau supplémentaire invisible au premier chargement. Non directement applicable à un moteur de jeu (pas de CSS), mais le principe généralise : tout système de "hot reload"/versionnage d'assets doit couvrir la totalité de l'arbre de dépendances, pas seulement le point d'entrée.

---

## 6. i18n, accessibilité, audio

La V1 supporte 9 langues (dont une variante régionale et une variante "médiévale" easter egg) avec un système réactif de changement de langue sans rechargement, et une synthèse vocale (TTS) contextuelle (annonces de score, missions, changements de thème/langue).

**Ce qui a bien fonctionné et vaut la peine d'être repris en V2** :
- Un point d'entrée unique pour "langue actuelle" et un mécanisme d'abonnement (callbacks appelés à chaque changement) plutôt que de relire une variable globale partout — évite les incohérences entre composants qui se mettent à jour et ceux qui oublient.
- Chargement des données de langue à la demande (seule la langue par défaut est embarquée, les autres sont chargées au changement) plutôt que tout embarquer au démarrage — mesuré en V1 : gain de plusieurs centaines de Ko au premier chargement. Un moteur de jeu packagera différemment (assets bundlés), mais le principe "ne charger que ce qui sert" reste pertinent pour les paquets de langue volumineux (surtout avec du TTS ou du doublage).
- Les termes techniques (dans les panneaux de réglages avancés) ne doivent jamais être traduits/stylisés de façon fantaisiste même dans une langue à forte identité (ex. le "vieux français") — la clarté fonctionnelle prime sur la cohérence thématique pour tout ce qui touche à l'utilisabilité.

**Dette technique identifiée à ne pas reproduire sans réflexion** : la V1 duplique sa table de correspondance "code de langue interne → locale BCP-47 pour le TTS" dans plusieurs fichiers indépendants plutôt que de la centraliser — un choix assumé à l'époque (modules qui ne partagent pas le même graphe de dépendances) mais qui reste une source d'oubli si une langue est ajoutée sans mettre à jour toutes les copies. En V2, avec un vrai système de build/modules partagés, centraliser cette table dès le départ.

---

## 7. Multijoueur — à repenser entièrement

Le système multijoueur V1 ne doit **pas** être repris tel quel (demande explicite). Description pour mémoire, avec les leçons à en tirer :

**Architecture V1** : chaque partie multijoueur est un fichier JSON sur disque (`room_<code>.json`), lu/écrit via une API HTTP (PHP). Les clients **pollent** l'état toutes les 900 ms (pas de push serveur), envoient leur position de curseur à chaque déplacement souris. Verrouillage par fichier (`lock`) pour éviter les écritures concurrentes.

**Pourquoi la repenser plutôt que la porter** :
- Le polling HTTP à intervalle fixe est un choix par défaut d'absence d'infrastructure temps réel (pas de WebSocket disponible simplement en PHP mutualisé) — un vrai moteur de jeu a généralement une couche réseau dédiée (netcode Unity, high-level multiplayer API de Godot, ou un serveur dédié type Photon/Nakama/Colyseus) qui permet un vrai temps réel sans ce compromis.
- Le stockage "un fichier JSON = une partie" plafonne dur en taille (un plafond de taille de requête a dû être ajouté en urgence en V1) et ne permet aucune requête (lister/filtrer les parties se fait en scannant tous les fichiers). Une vraie base de données ou un service de rooms (même léger, type Redis) élimine cette classe de problèmes.
- **Leçon de concurrence directement transposable, quel que soit le mécanisme choisi en V2** : un verrou (lock, mutex, transaction) doit **persister** tant qu'il protège une ressource — le supprimer "en fin de requête" crée une fenêtre où deux clients peuvent croire détenir le verrou simultanément. Vécu en V1 : un `unlink()` du fichier de verrou en fin de traitement provoquait des écritures concurrentes silencieuses (aucune erreur visible, juste des données corrompues par intermittence) — mesuré à 0 collision après correctif contre des dizaines avant, sur charge concurrente identique.
- **Nettoyage des données obsolètes** : des curseurs de joueurs déconnectés depuis longtemps n'étaient jamais expirés côté serveur, dégradant progressivement les performances de rendu (recréation d'un mesh fantôme par curseur à chaque poll). Tout état partagé partagé entre clients doit avoir une durée de vie explicite (TTL) et un nettoyage actif — pas seulement une suppression décidée par le client qui s'en va (qui peut ne jamais arriver : fermeture d'onglet, crash).
- **Sécurité par défaut** : les fichiers de données serveur (parties, classement) étaient accessibles en listing/téléchargement direct via le serveur web tant qu'aucune règle explicite ne l'interdisait — même si l'accès applicatif normal ne passe jamais par cette voie. Réflexe à garder en V2 quel que soit le mode de stockage choisi : austerité par défaut, n'exposer explicitement que ce qui doit l'être.

**Recommandation V2** : traiter le multijoueur comme un vrai sous-système réseau dès la conception (état autoritaire côté serveur, delta-sync ou snapshot avec interpolation côté client), pas comme une persistance de fichiers exposée via une API REST basique. Le modèle de données du jeu (état de la grille, tuiles posées, joueurs) reste cependant directement réutilisable — c'est le mécanisme de transport/synchronisation qui doit changer, pas la structure de l'état.

---

## 8. Pièges génériques identifiés en V1 (transposables hors JS/PHP)

Une sélection des pièges les plus généralisables — la liste complète et très détaillée (avec bugs vécus, mesures avant/après) est dans `CONTEXT.md` §26 et §34, à consulter au moment d'implémenter la fonctionnalité correspondante en V2 :

- **Un clone d'objet/matériau ne copie pas forcément les hooks de personnalisation attachés dynamiquement** (ex. injection de shader) — vérifier explicitement ce que copie l'API de clonage du moteur choisi avant de bâtir un système sur des prototypes clonés.
- **Ne jamais rappeler une fonction d'injection de comportement sur un objet qui l'a déjà** sans réinitialisation propre — les injections qui se chaînent (A appelle B qui appelle C) empilent leurs effets à chaque rappel plutôt que de les remplacer, avec des erreurs qui peuvent n'apparaître qu'au 2ᵉ ou 3ᵉ appel.
- **Écritures fréquentes vers un stockage persistant (localStorage, fichier, DB) doivent être débouncées**, jamais synchrones dans un handler qui se déclenche à haute fréquence (slider, mouvement souris).
- **Une factorisation qui supprime du code dupliqué doit vérifier TOUS les points d'appel dans le fichier entier**, pas seulement ceux visibles dans le bloc qu'on est en train de modifier.
- **Un stall périodique dont la fréquence correspond à un timer connu** doit faire chercher un problème dans les *données* traitées par ce timer (volume, âge), pas dans le mécanisme lui-même qui "a l'air de marcher".
- **Mesurer avant/après pour toute optimisation revendiquée** — la V1 a systématiquement chiffré ("60 requêtes concurrentes : 14 erreurs → 0", "0,30 ms → 0,01 ms par évènement") plutôt que de se fier à une impression ; à conserver en V2, quel que soit l'outil de profiling disponible.

---

## 9. Philosophie de design (à conserver)

Les 4 principes qui ont guidé la V1 restent valables et devraient rester affichés en tête de tout futur document de règles de contribution :

1. Ne pas casser la grille (la mécanique centrale doit rester rock-solid).
2. Ne pas casser le gameplay validé (toute évolution s'ajoute, ne remplace pas sans preuve que l'ancien ne marchait pas).
3. Modifications minimales et chirurgicales.
4. Pas d'usine à gaz.

À ajouter, tirée spécifiquement de cette session de bilan :

5. **Face à un bug visuel/comportemental qui touche "une catégorie d'éléments similaires"** (tous les textes en gras, tous les conteneurs d'un certain type…), auditer exhaustivement cette catégorie dès le premier signalement plutôt que de corriger élément par élément au fil des signalements répétés de l'utilisateur.

---

## 10. Questions ouvertes à trancher avant de coder

Ce document est volontairement silencieux sur ces points — ils demandent une décision produit, pas seulement technique :

1. **Moteur final** (cf. §2) — à valider après un prototype comparatif court plutôt qu'en théorie.
2. **Scope de la V2 au lancement** : reprend-on l'intégralité des systèmes V1 (météo dynamique, jour/nuit, feu qui se propage, TTS 9 langues, replay/captures) ou un socle réduit d'abord, avec ces systèmes en itérations post-lancement ?
3. **Multijoueur** : temps réel synchrone (voir les joueurs bouger en direct) ou asynchrone par tour/salon comme en V1, mais sur une vraie infra réseau ? Ceci détermine fortement l'architecture serveur à choisir.
4. **Persistance des parties** : fichier/DB locale, service cloud managé, ou serveur dédié — dépend du modèle de coût visé et du choix multijoueur (point 3).
5. **Cible(s) de plateforme** : navigateur uniquement (comme la V1), ou aussi desktop/mobile natif ? Cela pèse directement sur le choix de moteur et sur l'architecture réseau.
6. **Art** : les assets 3D actuels (GLB) sont-ils repris tels quels au démarrage de la V2, ou l'occasion est-elle prise de refaire une passe artistique en même temps que la réécriture technique ?

---

*Document de base — à faire évoluer au fil des décisions prises pour la V2, sur le même modèle que `CONTEXT.md` pour la V1.*
