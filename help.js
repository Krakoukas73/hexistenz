// help.js — Textes d'aide et tutoriels pour le HUD LUT de Hexistenz
// Ce fichier centralise toute l'aide contextuelle de l'interface.
// À compléter avec de nouveaux guides et tutoriels au fur et à mesure.

// ─── Système de tooltip partagé ──────────────────────────────────────────────
// Utilisé par debugLightUi.js, highscore.js, ui.js, multiplayerUi.js, etc.
// Le CSS est injecté ici, indépendamment du démarrage du jeu, pour que les tooltips
// fonctionnent aussi dans les menus pré-partie (avant initScene / installDebugLightCss).

const _TOOLTIP_CSS = `
#lutHelpTooltip {
  position: fixed;
  z-index: 9999;
  max-width: 240px;
  padding: 8px 11px;
  border-radius: 9px;
  background: rgba(6,12,26,0.96);
  border: 1px solid rgba(120,180,255,0.28);
  box-shadow: 0 6px 24px rgba(0,0,0,0.65), 0 0 0 1px rgba(120,180,255,0.06);
  backdrop-filter: blur(12px);
  color: rgba(205,225,255,0.94);
  font: 11px/1.55 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: none;
  opacity: 0;
  transform: translateY(5px);
  transition: opacity 0.14s ease, transform 0.14s ease;
}
#lutHelpTooltip.visible {
  opacity: 1;
  transform: translateY(0);
}
`;

export function ensureHelpTooltip() {
  if (document.getElementById('lutHelpTooltip')) return;
  // Injecter le CSS si pas encore fait
  if (!document.getElementById('lutHelpTooltipCss')) {
    const s = document.createElement('style');
    s.id = 'lutHelpTooltipCss';
    s.textContent = _TOOLTIP_CSS;
    document.head.appendChild(s);
  }
  const tt = document.createElement('div');
  tt.id = 'lutHelpTooltip';
  document.body.appendChild(tt);
}

export function moveHelpTooltip(e) {
  const tt = document.getElementById('lutHelpTooltip');
  if (!tt) return;
  const w = tt.offsetWidth || 240;
  const x = Math.min(e.clientX + 16, window.innerWidth - w - 10);
  const y = Math.max(6, e.clientY - 10);
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}

export function showHelpTooltip(e, text) {
  if (!text) return;
  const tt = document.getElementById('lutHelpTooltip');
  if (!tt) return;
  tt.textContent = text;
  tt.classList.add('visible');
  moveHelpTooltip(e);
}

export function hideHelpTooltip() {
  const tt = document.getElementById('lutHelpTooltip');
  if (tt) tt.classList.remove('visible');
}

/** Attache les événements de tooltip sur un élément (mouseenter/move/leave). */
export function attachHelpTooltip(el, text) {
  if (!el || !text) return;
  el.addEventListener('mouseenter', e => showHelpTooltip(e, text));
  el.addEventListener('mousemove',  moveHelpTooltip);
  el.addEventListener('mouseleave', hideHelpTooltip);
}

/**
 * Délégation de tooltip sur un conteneur parent (pour les innerHTML rebuilt).
 * Chaque descendant portant data-[attr] déclenche le tooltip.
 * @param {Element} container
 * @param {string} attr  ex : 'stat-help' pour data-stat-help
 * @param {Object} helpMap  { key: text } ou null pour lire LUT_HELP[key]
 */
export function delegateHelpTooltip(container, attr, helpMap = null) {
  if (!container) return;
  const dataAttr = 'data-' + attr;
  container.addEventListener('mouseover', e => {
    const el = e.target.closest('[' + dataAttr + ']');
    const key = el?.getAttribute(dataAttr);
    if (!key) { hideHelpTooltip(); return; }
    const text = (helpMap ?? LUT_HELP)[key] ?? '';
    showHelpTooltip(e, text);
  });
  container.addEventListener('mousemove', e => {
    if (e.target.closest('[' + dataAttr + ']')) moveHelpTooltip(e);
  });
  container.addEventListener('mouseleave', hideHelpTooltip);
}

// ─── Aide contextuelle des sliders et couleurs du panneau LUT ───────────────
export const LUT_HELP = {

  // ── Rendu ──────────────────────────────────────────────────────────────────
  'renderer.toneMappingExposure':
    `Exposition globale du renderer (ACESFilmic). Contrôle la quantité de lumière atteignant le "capteur" avant tout étalonnage.
Valeurs < 1 assombrissent l'ensemble, > 2 peuvent saturer les hautes lumières.
Typique : 1.2–1.8 pour un rendu naturel.`,

  // ── Brouillard ─────────────────────────────────────────────────────────────
  'environment.fogDensity':
    `Densité du brouillard exponentiel (FogExp2). Actif uniquement quand "Fin linéaire" est à 0.
La visibilité chute très rapidement : à 0.07 la scène est quasi-opaque.
Pour un champ visuel contrôlé, préférer le mode linéaire via "Début" et "Fin".`,

  'environment.fogNear':
    `Distance en unités 3D où le brouillard linéaire commence.
Dès que "Fin" > 0, bascule automatiquement de FogExp2 vers THREE.Fog(near, far).
À 0 : brouillard dès le premier plan. À 5 : les objets proches restent nets.`,

  'environment.fogFar':
    `Distance où le brouillard linéaire est complètement opaque.
Mettre à 0 pour revenir au mode exponentiel.
Exemple : Début = 3, Fin = 18 → champ visuel de 15 unités — immersif sans tout noyer.`,

  // ── Lumières ───────────────────────────────────────────────────────────────
  'lights.hemisphereIntensity':
    `Intensité de la lumière hémisphérique (ciel + sol).
Éclaire les faces non exposées au soleil direct.
Trop haute : aplat les ombres et supprime le relief. Trop basse : faces arrière dans le noir total.`,

  'lights.sunIntensity':
    `Puissance de la lumière directionnelle (soleil).
Détermine la dureté des ombres et le contraste de relief.
Des valeurs > 5 peuvent cramer les surfaces claires si l'exposition globale est aussi élevée.`,

  'lights.sunOrbitRadius':
    `Rayon de l'orbite circulaire du soleil autour du centre de la scène.
Un rayon faible (< 5) donne une lumière très inclinée depuis le centre ; grand (> 20) : lumière plus rasante depuis les bords.`,

  'lights.sunOrbitHeight':
    `Hauteur verticale du soleil au-dessus du plan de la scène.
Élevé = ombres courtes, lumière zénithale. Bas = ombres longues et rasantes (heure dorée ou coucher).`,

  'lights.sunOrbitSpeed':
    `Vitesse angulaire du soleil en radians/seconde.
À 0.06, un tour complet dure ≈ 100 secondes. À 0 : soleil fixe. À 1 : ombres qui tournent rapidement.`,

  'lights.sunVisualScale':
    `Taille apparente du disque solaire dans le ciel.
Purement visuel — n'affecte ni la puissance lumineuse ni les ombres.`,

  'lights.fillIntensity':
    `Intensité d'une lumière de remplissage douce (fill light), opposée au soleil.
Débouche les zones d'ombre dures. Utile pour éviter les parties entièrement noires sous les surplombs ou au dos des collines.`,

  // ── Étalonnage ─────────────────────────────────────────────────────────────
  'grading.brightness':
    `Décalage de luminosité additionnel appliqué après le rendu.
Ajoute une valeur constante à tous les canaux.
Diffère de l'exposition : n'amplifie pas les hautes lumières, ne change pas le tonemapping.`,

  'grading.contrast':
    `Contraste global via pivotement autour du 50% gris.
> 1 : écarte les sombres et les clairs (look cinématique). < 1 : compresse (look mat/délavé).
Aux extrêmes → aplat noir ou blanc.`,

  'grading.saturation':
    `Saturation globale. Mélange la version grise (luma) et la couleur originale.
0 = niveaux de gris. 1 = normal. > 1 = hypersaturé.
Aux valeurs très élevées (3+), les couleurs débordent et peuvent inverser.`,

  'grading.vibrance':
    `Vibrance intelligente : renforce les couleurs ternes tout en épargnant les teintes déjà saturées.
Plus doux que la saturation brute pour les verts naturels.
Négatif : atténue les couleurs vives en priorité.`,

  'grading.hue':
    `Rotation globale de toutes les teintes sur le cercle chromatique.
±0.5 = demi-tour (rouge ↔ cyan). Subtil à faible valeur.
Utile pour corriger une dominante ou créer une palette décalée.`,

  'grading.gamma':
    `Correction gamma appliquée sur les tons moyens.
< 1 = tons moyens plus clairs ; > 1 = plus sombres.
N'agit pas linéairement sur les extrêmes (noirs / blancs purs).`,

  'grading.blackLevel':
    `Niveau du point noir. Remonte les noirs purs vers le gris.
Crée un look "filmique délavé" ou "lifted blacks".
Trop haut = perte de profondeur et de densité dans les ombres.`,

  'grading.whiteLevel':
    `Niveau du point blanc. Compresse les hautes lumières en dessous de 1.0.
À 0.871 : les blancs purs deviennent crème, aucune zone ne claque.
Utile pour un look doux, "S-curve" subtile.`,

  'grading.red':
    `Gain multiplicatif du canal rouge après étalonnage.
> 1 chauffe la scène (teinte orangée/ambrée). < 1 la refroidit.
Combiné avec vert et bleu, permet une correction fine de balance des blancs.`,

  'grading.green':
    `Gain multiplicatif du canal vert.
Le vert est dominant dans la luminance perçue (≈ 59%).
Baisser ce canal donne un effet violacé/magenta ; l'augmenter verdit et éclaircit perceptivement.`,

  'grading.blue':
    `Gain multiplicatif du canal bleu.
Augmenter donne une ambiance froide/nocturne. Réduire assèche les bleus pour un look chaud ou sépia.`,

  'grading.redCurve':
    `Courbe tonale du rouge : applique une puissance sur le canal.
< 1 = courbe convexe (rehausse les tons moyens rouges). > 1 = creuse les tons moyens.
Agit après le gain rouge.`,

  'grading.greenCurve':
    `Courbe tonale du vert. Modèle la réponse du canal vert dans les tons moyens.
Utile pour affiner le contraste perçu sans toucher aux extrêmes.`,

  'grading.blueCurve':
    `Courbe tonale du bleu. Permet de modeler l'ambiance dans les tons intermédiaires.
Courbe < 1 = bleus plus denses dans les tons clairs. > 1 = bleus creusés (look chaud dans les mids).`,

  // ── Palette biomes ─────────────────────────────────────────────────────────
  'palette.strength':
    `Force globale de l'harmonisation de palette sur les textures ciblées.
0 : aucun effet. 1 : les textures sont entièrement recolorées vers leur couleur cible.
Fonctionne par correspondance de nom de matériau GLB.`,

  'palette.saturation':
    `Saturation appliquée après l'harmonisation palette.
< 1 : calme les textures recolorées. > 1 : les intensifie.
Permet d'ajuster sans retouch er les couleurs cibles.`,

  'palette.contrast':
    `Contraste appliqué aux couleurs après harmonisation.
Un léger boost (1.05–1.2) renforce la lisibilité des textures recolorées.`,

  'palette.warmShift':
    `Décalage chaud/froid global appliqué à toute la palette biomes.
Négatif → teintes plus froides/bleues. Positif → teintes plus chaudes/dorées.`,

  // ── Couleurs d'environnement ───────────────────────────────────────────────
  'environment.skyColor':
    `Couleur de fond du renderer, visible au-delà du dôme et des objets.
En général sombre pour ne pas percer derrière les décors.`,

  'environment.fogColor':
    `Couleur du brouillard, exponentiel ou linéaire.
C'est vers cette teinte que les objets se fondent avec la distance.
Doit correspondre à la couleur de ciel pour un horizon cohérent.`,

  'environment.domeColorTop':
    `Couleur du sommet du dôme atmosphérique sphérique.
Visible dans le ciel au-dessus des objets (si domeOpacity > 0).`,

  'environment.domeColorBottom':
    `Couleur de la base du dôme atmosphérique.
Simule l'horizon ou une brume basse au niveau du sol.`,

  // ── Couleurs lumières ──────────────────────────────────────────────────────
  'lights.hemisphereSkyColor':
    `Teinte de la composante "ciel" de la lumière hémisphérique.
Colore les faces orientées vers le haut (toits, surfaces planes).`,

  'lights.hemisphereGroundColor':
    `Teinte de la composante "sol" de la lumière hémisphérique.
Colore les faces orientées vers le bas (dessous des ponts, ventre des maisons).`,

  'lights.sunColor':
    `Couleur de la lumière directionnelle du soleil.
Orangée au coucher, blanche en journée, bleutée avec un ciel couvert.
Influence fortement la couleur des ombres projetées.`,

  'lights.fillColor':
    `Couleur de la lumière de remplissage (fill light).
Généralement complémentaire au soleil pour équilibrer les ombres.`,

  // ── Couleurs biomes ────────────────────────────────────────────────────────
  'palette.targets.field':
    `Couleur cible pour l'harmonisation des textures de champs cultivés.`,

  'palette.targets.forest':
    `Couleur cible pour les textures de forêts et arbres.`,

  'palette.targets.grass':
    `Couleur cible pour les prairies et pelouses.`,

  'palette.targets.house':
    `Couleur cible pour les maisons et bâtiments de villages.`,

  'palette.targets.rail':
    `Couleur cible pour les rails et infrastructures ferrées.`,

  'palette.targets.water':
    `Couleur cible pour l'eau (lacs, rivières, mer).`,

  // ── Pixelisation ───────────────────────────────────────────────────────────
  'pix.pixelSize':
    `Taille d'un pixel en unités d'écran. À 1 : résolution native. À 8 : rendu très pixelisé façon 8-bit.
Valeurs élevées réduisent la charge GPU (moins de fragments à calculer) et renforcent le look rétro.
Combiné avec les contours, donne un style lowpoly + outline.`,

  'pix.normalEdge':
    `Intensité des contours basés sur les normales de surface.
Détecte les arêtes entre plans de direction différente (ex : bord d'un toit, coin d'un mur).
0 = aucun contour normal. 1 = contours forts sur toutes les transitions géométriques.`,

  'pix.depthEdge':
    `Intensité des contours basés sur la profondeur (z-buffer).
Trace des silhouettes entre les objets à des distances différentes.
Complémentaire au contour normal : ensemble ils donnent un look cartoon ou BD.`,

  'pix.worldShape':
    `Choisit la courbure apparente du monde.
"Bouliste" : la terre est une sphère, l'horizon est courbé — effet mini-planète.
"Platiste" : pas de courbure, vue plate traditionnelle — look isométrique classique.`,

  // ── Cinéma ─────────────────────────────────────────────────────────────────
  'cin.tilt':
    `Intensité de l'effet tilt-shift : flou progressif en haut et en bas du cadre.
Simule une optique à bascule qui réduit la profondeur de champ au centre.
Donne l'illusion d'une maquette miniature — très fort à 1.`,

  'cin.focusCenter':
    `Position verticale du centre de netteté du tilt-shift.
0 = en haut du cadre, 0.5 = centre, 1 = bas.
Déplacer vers le bas met la netteté sur les éléments au sol.`,

  'cin.focusBand':
    `Largeur de la bande nette du tilt-shift (en fraction de la hauteur).
0.1 = bande très fine, 0.5 = moitié de l'image nette, 1 = tout net (effet désactivé).`,

  'cin.vignette':
    `Assombrissement des bords et coins du cadre.
Simule la chute de lumière aux extrémités d'un objectif grand-angle.
Renforce l'impression de profondeur et guide le regard vers le centre.`,

  'cin.grain':
    `Quantité de bruit filmique ajouté par-dessus le rendu.
Simule les imperfections d'une pellicule argentique ou d'un capteur sensible.
Discret à 0.2, omniprésent à 1.`,

  'cin.chromatic':
    `Aberration chromatique : décalage lateral des canaux couleur vers les bords.
Simule les défauts d'un objectif imparfait qui ne focalise pas toutes les longueurs d'onde au même point.
Subtil à 0.2, psychédélique au-delà de 0.7.`,

  'cin.halation':
    `Halo lumineux autour des zones très claires, typique de la pellicule argentique.
La lumière forte "saigne" légèrement sur les zones sombres voisines.
Ajoute chaleur et organicité — beau sur les couchers de soleil.`,

  'cin.barrel':
    `Distorsion en barillet : les bords de l'image sont repoussés vers l'extérieur.
Simule les objectifs fisheye ou grand-angle. Renforce l'aspect "caméra de surveillance" ou lo-fi.
À 1, l'image est fortement bombée.`,

  'cin.scanLines':
    `Lignes horizontales sombres entrelacées, imitant un moniteur CRT ou une vieille télé.
0 = aucune scanline. 6 = lignes très marquées, look rétro-TV.
Puissant combiné avec une palette CGA/EGA pour l'esthétique vintage.`,

  // ── STATISTIQUES DE LA PARTIE (HUD performances) ──────────────────────────
  'stats.drawCalls':
    `Nombre total d'appels de rendu (draw calls) émis par Three.js ce frame.
Chaque objet visible coûte au moins 1 draw call — les ombres en ajoutent.
> 200 dc : attention aux performances sur GPU mobiles.`,

  'stats.trackedDc':
    `Draw calls attribués aux catégories d'objets trackés (tuiles, arbres, rails…).
La différence avec le total = draw calls non catégorisés (UI, helpers, skybox…).`,

  'stats.shadows':
    `Draw calls estimés utilisés pour le rendu des ombres (shadow map).
Chaque objet "castant" une ombre re-rend la scène depuis la perspective du soleil.
Réduire le shadowMapSize ou le nombre de casters pour diminuer ce coût.`,

  'stats.triangles':
    `Nombre total de triangles rendus ce frame.
Indicateur de complexité géométrique — les ombres doublent ce chiffre.
Des mesh LOD (niveau de détail) réduisent ce nombre à distance.`,

  'stats.objects':
    `Nombre total d'objets 3D (Mesh, Group…) trackés dans la scène.
Ne correspond pas exactement aux draw calls : un objet peut générer plusieurs passes.`,

  'stats.textures':
    `Nombre de textures actives en mémoire GPU.
Une texture non libérée reste en VRAM. Surveiller après chargement de nouvelles tuiles.`,

  'stats.shaders':
    `Nombre de programmes shader (GLSL) compilés et actifs.
Chaque combinaison de matériau + defines = un shader. Trop de variantes = stutter à la première frame.`,

  // ── STATISTIQUES DE LA PARTIE (panneau de jeu) ────────────────────────────
  'game.tiles':
    `Nombre total de tuiles posées sur le plateau depuis le début de la partie.
Chaque tuile peut appartenir à un ou plusieurs biomes selon sa composition.`,

  'game.trains':
    `Lignes de train formées : une ligne = deux gares connectées par des rails continus.
Plus la ligne est longue, plus les points de score sont élevés.`,

  'game.boats':
    `Bateaux actifs : un bateau apparaît sur chaque étendue d'eau entourée de terres.
Chaque bateau génère des points tant qu'il reste "à flot".`,

  'game.comets':
    `Comètes interceptées : événements aléatoires qui traversent le plateau.
Placer une tuile à l'endroit prédit au bon moment permet de les intercepter.`,

  'game.grass':
    `Tuiles de prairie totales posées.
Surface max = plus grande zone de prairie contiguë (tuiles adjacentes du même biome).`,

  'game.largestGrass':
    `Plus grande zone de prairie contiguë (en nombre de tuiles connectées).
Une grande zone contiguë rapporte plus de points à la fin de la partie.`,

  'game.field':
    `Tuiles de champ de blé totales posées.
Les champs adjacents à des villages ou des rivières donnent des bonus.`,

  'game.largestField':
    `Plus grande zone de champ contiguë. Détermine le bonus de récolte final.`,

  'game.forest':
    `Tuiles de forêt totales posées.
Les forêts denses (grandes zones) sont des refuges fauniques et rapportent plus.`,

  'game.largestForest':
    `Plus grande forêt contiguë. Les forêts > 7 tuiles déclenchent parfois des événements spéciaux.`,

  'game.house':
    `Tuiles de village totales posées.
Les maisons isolées valent peu ; un village dense et bien relié au réseau ferré rapporte beaucoup.`,

  'game.largestHouse':
    `Plus grand village contigu. Un village = maisons adjacentes.
Des villages nombreux et denses maximisent le bonus urbain.`,

  'game.water':
    `Tuiles d'eau totales posées (lacs, rivières, mer).
L'eau bordant d'autres biomes crée des zones côtières valorisées.`,

  'game.largestWater':
    `Plus grande étendue d'eau contiguë. Un lac > 5 tuiles peut accueillir des bateaux supplémentaires.`,

  'game.rail':
    `Tuiles de voie ferrée totales posées.
Les rails seuls ne rapportent rien — c'est la connexion entre deux gares qui crée une ligne.`,

  'game.largestRail':
    `Voie ferrée la plus longue contiguë (en tuiles). Indicateur de la portée maximale du réseau.`,

  // ── Boîtes tuiles (tileUI droite) ────────────────────────────────────────
  'game.activeTile':
    `La tuile que tu vas poser au prochain coup.
Déplace le curseur avec Z/Q/S/D, tourne avec R, et pose avec ESPACE.
Chaque face de la tuile correspond à un biome — planifie tes connexions !`,

  'game.nextTile':
    `La prochaine tuile qui entrera en jeu après que tu auras posé la tuile courante.
Anticipe sa forme pour préparer la meilleure case d'accueil.`,

  'game.deckRemaining':
    `Nombre de tuiles restantes dans la pioche.
La partie se termine quand la pioche est vide — optimise chaque placement !`,

  // ── Highscores : chips de stats ───────────────────────────────────────────
  'hs.summary':
    `Résumé de la partie : tuiles posées, lignes de train, bateaux, comètes interceptées.`,

  'hs.grass':
    `Prairie — tuiles totales / plus grande zone contiguë.`,

  'hs.field':
    `Champ de blé — tuiles totales / plus grande zone contiguë.`,

  'hs.forest':
    `Forêt — tuiles totales / plus grande zone contiguë.`,

  'hs.house':
    `Village — tuiles totales / plus grande zone contiguë.`,

  'hs.water':
    `Eau — tuiles totales / plus grande étendue contiguë.`,

  'hs.rail':
    `Voie ferrée — tuiles totales / plus longue voie contiguë.`,

  // ── HUD FPS ────────────────────────────────────────────────────────────────
  'fps.fps':
    `Images par seconde rendues par le moteur Three.js.
60 FPS = rendu fluide et budget frame respecté. < 30 FPS = ralentissements perceptibles.
La valeur vire au rouge quand le budget frame (16.7 ms) est systématiquement dépassé.`,

  'fps.adj':
    `Évaluation qualitative de la fluidité courante.
Vert (Excellent / Fluide) : tout va bien. Orange (Honnête / Correct) : acceptable mais surveillez.
Rouge (Serré / Haletant / À bout) : le moteur est sous pression — cherchez le goulot.`,

  'fps.cpu':
    `Pourcentage du budget frame (16.7 ms) consommé par le thread JavaScript.
Comprend la logique de jeu, les mises à jour d'overlays, les animations et les GC pauses.
> 80 % : le CPU est le goulot — réduire la fréquence des updates ou le nombre d'overlays actifs.`,

  'fps.gpu':
    `Pourcentage du budget frame consommé par le rendu GPU.
Estimé via le delta de requestAnimationFrame — pas un timer GPU exact (WebGL query non disponible).
> 80 % : le GPU est saturé — réduire les draw calls, la résolution de rendu ou les ombres.`,

  // ── Menus pré-partie ──────────────────────────────────────────────────────
  'menu.solo':
    `Mode solo — joue seul, à ton rythme.
Tes scores sont soumis au classement global une fois la partie terminée.`,

  'menu.multi':
    `Mode multijoueur — joue en temps réel avec d'autres joueurs.
Crée une salle et partage le code, ou rejoins une partie existante.`,

  'menu.platiste':
    `Géométrie plate — la grille est posée sur un plan horizontal.
Meilleure lisibilité et comportement prévisible : recommandé pour débuter.`,

  'menu.bouliste':
    `Géométrie sphérique — les tuiles suivent la courbure d'une planète.
Vue plus immersive, mais la grille courbe peut désorienter au début.`,

  'menu.confirm':
    `Valider et passer à l'étape suivante.`,

  'menu.create':
    `Créer une nouvelle salle multijoueur.
Un code unique est généré automatiquement — partage-le aux autres joueurs pour qu'ils te rejoignent.`,

  'menu.join':
    `Rejoindre une salle existante avec le code indiqué ci-dessus.`,

  'menu.back':
    `Revenir à l'écran d'accueil.`,

  // ── HUD principal (score/tuiles/dernier coup) ─────────────────────────────
  'game.gridPercent':
    `Nombre de tuiles placées sur la grille depuis le début de la partie.
Chaque pose augmente ce compteur, y compris en mode multijoueur.`,

  'game.lastScore':
    `Points gagnés lors du dernier placement.
Inclut le bonus de zone si la tuile a agrandi ou fermé une zone contiguë, et les éventuels bonus de mission.`,

  // ── Boutons de partie ──────────────────────────────────────────────────────
  'game.newGame':
    `Démarrer une nouvelle partie.
La partie en cours reste active et jouable — vous pouvez y revenir à tout moment depuis le menu.`,

  'game.abandonGame':
    `Abandonner la partie en cours.
La partie sera définitivement close : vous ne pourrez plus y rejouer ni soumettre de nouveau score.`,
};
