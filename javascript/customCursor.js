// ─── customCursor.js — curseur custom, socle prêt pour l'animé (2026-08-04) ───
// Contexte : le curseur statique (thème Médiéval uniquement) est géré en CSS
// pur (css/cursors.css, `[data-theme="ancien"] * { cursor: url(...) ... }`) —
// zéro JS, rendu natif du navigateur, la solution la plus fluide/compatible
// possible pour un curseur FIXE. Elle reste la valeur par défaut : ce module
// ne prend le relais que lorsqu'un curseur ANIMÉ est explicitement demandé,
// pour une raison technique incontournable :
//
// La propriété CSS `cursor: url()` n'anime PAS les GIF (ni aucun autre format
// animé) sur les navigateurs modernes (Chrome/Edge/Safari) — seule la 1ère
// image s'affiche, figée. Aucun moyen de contourner ça en CSS pur.
//
// Solution : un petit calque HTML (`#hzCursorFollower`, position:fixed,
// pointer-events:none) qui suit la souris et affiche un <img>. Rendu comme
// une image normale, un GIF animé (ou APNG) s'anime tout seul, nativement,
// sans aucune logique de sprite/frame à gérer en JS — la même simplicité que
// n'importe quelle <img> animée dans une page web. Suivi de la souris via
// `transform: translate3d()` (compositing GPU, aucun reflow/repaint coûteux)
// posé directement dans le handler `mousemove` (déjà cadencé par le
// navigateur à la fréquence d'affichage — pas besoin de rAF en plus).
//
// Bonus : contrairement au curseur CSS natif (limité en pratique à 32×32 pour
// une compatibilité universelle, 128×128 grand maximum), cette image n'a
// AUCUNE limite de taille — utile pour un curseur animé plus grand/détaillé.
//
// Portée : `setAnimated()`/`reset()` fonctionnent dans LES DEUX thèmes
// (Médiéval ET Bleu sidéral) — ce socle sert désormais de curseur de
// GAMEPLAY (survol tuile valide/invalide pendant la pose, cf. scene.js
// `updateHover`/`rebuildGhost`), une information qui doit rester visible
// quel que soit le thème graphique choisi. Seul le survol du cadre
// décoratif (`updateCadreHover`/`CADRE_HOVER_CLASS` ci-dessous) reste
// strictement Médiéval (seul thème avec un cadre) — vérifié à chaque appel
// ET via un MutationObserver sur l'attribut `data-theme` de <html> (aucun
// événement dédié n'existe côté themeManager.js pour un changement de
// thème, cf. son setTheme() — un observer léger, qui ne se déclenche
// qu'aux bascules de thème (rares, action utilisateur), est la façon la
// plus simple de rester synchronisé sans toucher aucun autre fichier).
//
// API exposée (window.hexistenzCursor, + exports ES pour import direct) :
//   setAnimated({ src, width, height, hotspotX = 0, hotspotY = 0 })
//     Active le calque : masque le curseur natif (classe `cursor-animated-
//     active` sur <html>, cf. css/cursors.css) et affiche `src` (GIF animé,
//     APNG, PNG fixe, SVG... tout ce qu'une <img> sait afficher) suivant la
//     souris. hotspotX/Y = décalage en pixels entre le coin haut-gauche de
//     l'image et le "point de clic" perçu (même logique que le hotspot de
//     `cursor: url() x y`), pour aligner précisément la pointe du dessin sur
//     la position réelle de la souris.
//   reset()
//     Désactive le calque, retour au curseur CSS statique (comportement par
//     défaut, déjà en place partout).
//
// Aucun appelant actuel dans le projet : socle prêt à être câblé sur un
// futur événement de gameplay (survol d'une tuile, pose en cours, sort en
// préparation...) le jour où un premier asset animé sera fourni — jamais
// invoqué tant qu'aucun code ne l'appelle explicitement, donc totalement
// sans effet de bord aujourd'hui au-delà de la mise en place du calque (masqué).

const FOLLOWER_ID = 'hzCursorFollower';
const ACTIVE_CLASS = 'cursor-animated-active';
// 2026-08-04 — demande explicite : gauntlet_open.png au survol du cadre
// décoratif (#headerBanner/#footerBanner/#leftBanner/#rightBanner). Ces 4
// éléments ont `pointer-events: none` (medieval.css, pour laisser passer les
// clics vers le contenu en dessous) — un élément avec pointer-events:none
// n'est JAMAIS hit-testé par le navigateur, donc AUCUNE règle `cursor` posée
// dessus ne peut jamais s'appliquer, quelle que soit sa spécificité. Seule
// solution : calculer nous-mêmes si la souris est dans la bande du cadre (85px
// sur chaque bord — même valeur que la hauteur/largeur du cadre dans
// medieval.css, aucune CSS custom property dédiée à lire dynamiquement) et
// poser une classe sur <html> en conséquence ; cf. `[data-theme="ancien"]
// .cadre-hover *` dans css/cursors.css.
const CADRE_SIZE = 85;
const CADRE_HOVER_CLASS = 'cadre-hover';
// 2026-08-05 — demande explicite : les 9 boutons du HUD FPS/debug (bas-droite,
// `.debug-light-panel`) sont volontairement positionnés à quelques pixels du
// bord de l'écran (cf. CONTEXT.md §39/§214 — marge cadre réduite au fil des
// rounds) et tombent donc DANS la bande des 85px de `updateCadreHover()` —
// leur survol posait `cadre-hover` sur <html> et masquait le curseur
// "cliquable" (gauntlet_point.png) sous gauntlet_open.png, alors que ce sont
// de vrais boutons cliquables (contrairement au cadre décoratif, qui lui a
// `pointer-events: none`). Repris de la même liste de sélecteurs "cliquable"
// que `css/cursors.css` (a/button/inputs/select/label/[role=button]/
// [onclick]/.cursor-pointer/champs texte) : si l'élément réellement survolé
// (`e.target`, PAS juste sa position écran) matche l'un d'eux, le survol du
// cadre est explicitement annulé — quelle que soit sa proximité du bord.
const CLICKABLE_SELECTOR = [
  'a', 'button', 'select', 'textarea', '[role="button"]', '[onclick]', '.cursor-pointer',
  'input:not([type])', 'input[type="button"]', 'input[type="submit"]',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="range"]',
  'input[type="text"]', 'input[type="password"]', 'input[type="search"]',
  'input[type="email"]', 'input[type="number"]', 'input[type="tel"]', 'input[type="url"]',
  // 2026-08-05 (2e correctif) — `label` sans condition `[for]` : couvre aussi
  // les labels-wrapper (`<label class="pix-switch"><input type="checkbox"/>
  // <span></span></label>`, cf. edaPanelWiring.js) qui associent leur input
  // par imbrication plutôt que par attribut `for` — cf. commentaire détaillé
  // dans css/cursors.css pour le même correctif côté CSS.
  'label',
  // 2026-08-08 — demande explicite : "survoler un menu doit immédiatement
  // déclencher le curseur par défaut". Jusqu'ici, seuls les éléments
  // RÉELLEMENT cliquables (bouton, lien, input...) suspendaient le curseur
  // animé de gameplay (line_cross.png/disabled.png, cf. scene.js
  // setTileHoverCursor) — en quittant une tuile disponible pour survoler la
  // zone NON-cliquable d'un panneau HUD (padding, texte, fond d'un menu),
  // e.target ne matchait aucun de ces sélecteurs, donc le curseur de tuile
  // restait affiché par-dessus le menu au lieu de repasser en curseur par
  // défaut. Fix : ajout des conteneurs de HUD/menus eux-mêmes (pas
  // seulement leurs boutons) — un survol N'IMPORTE OÙ à l'intérieur suspend
  // désormais le curseur animé, quelle que soit la zone précise survolée.
  '#scorePanel', '#statsPanel', '.tileDeckBox', '.missionsBox',
  '#helpOverlay', '.debug-light-panel', '#highscoreModal',
  '#abandonConfirmModal',
].join(', ');

let followerEl = null;
let imgEl = null;
let lastX = 0;
let lastY = 0;
let currentHotspotX = 0;
let currentHotspotY = 0;
let isActive = false;
let isOverCadre = false;

function isMedievalTheme() {
  return document.documentElement.dataset.theme === 'ancien';
}

function updateCadreHover(x, y, target) {
  // Uniquement pertinent en thème Médiéval (seul thème avec un cadre
  // décoratif) — évite tout calcul inutile en thème Bleu sidéral.
  // 2026-08-05 — un élément cliquable réellement survolé (bouton, lien...)
  // annule le survol du cadre même s'il est géométriquement dans la bande des
  // 85px (cf. commentaire CLICKABLE_SELECTOR plus haut) — sinon son propre
  // curseur "cliquable" se retrouvait masqué par gauntlet_open.png.
  const onClickable = !!(target && target.closest && target.closest(CLICKABLE_SELECTOR));
  const over = !onClickable && isMedievalTheme() && (
    x < CADRE_SIZE || y < CADRE_SIZE ||
    x > window.innerWidth - CADRE_SIZE || y > window.innerHeight - CADRE_SIZE
  );
  if (over === isOverCadre) return; // évite de toucher classList à chaque pixel
  isOverCadre = over;
  document.documentElement.classList.toggle(CADRE_HOVER_CLASS, over);
}

function ensureFollower() {
  if (followerEl) return followerEl;
  followerEl = document.createElement('div');
  followerEl.id = FOLLOWER_ID;
  imgEl = document.createElement('img');
  imgEl.alt = '';
  imgEl.draggable = false;
  followerEl.appendChild(imgEl);
  document.body.appendChild(followerEl);
  return followerEl;
}

// 2026-08-05 (3e correctif) — demande explicite : le curseur animé de
// gameplay (line_cross.png/disabled.png, posé par scene.js pendant que le
// joueur pose une tuile) masque TOUT curseur natif tant qu'il est actif
// (classe `cursor-animated-active` → `cursor: none !important` sur tous les
// éléments, cf. css/cursors.css) — y compris quand la souris survole un des
// 9 boutons du HUD debug-light-panel en bas à droite. Le calque suivant la
// souris (#hzCursorFollower) n'a aucune notion de ce qu'il y a en-dessous :
// il continue d'afficher l'icône de validité de tuile même par-dessus un
// bouton cliquable, ce qui est trompeur ("JE L'AI POSÉE !"). Fix : à chaque
// mousemove, si le curseur animé est actif ET que l'élément réellement
// survolé est cliquable (même liste CLICKABLE_SELECTOR que le cadre-hover
// ci-dessus), on suspend temporairement l'affichage animé (masque le calque,
// retire la classe qui neutralise `cursor`) pour laisser réapparaître le
// curseur "cliquable" natif du thème (gauntlet_point.png / hand_point.png).
// Dès que la souris quitte l'élément cliquable, le calque et la classe sont
// restaurés — la prochaine mise à jour de hover de tuile (scene.js) reprend
// la main normalement, aucun état à re-synchroniser explicitement.
function onMouseMove(e) {
  lastX = e.clientX;
  lastY = e.clientY;
  const onClickable = !!(e.target && e.target.closest && e.target.closest(CLICKABLE_SELECTOR));
  updateCadreHover(lastX, lastY, e.target);
  if (!isActive || !followerEl) return;
  if (onClickable) {
    followerEl.style.opacity = '0';
    document.documentElement.classList.remove(ACTIVE_CLASS);
    return;
  }
  document.documentElement.classList.add(ACTIVE_CLASS);
  followerEl.style.opacity = '1';
  followerEl.style.transform = `translate3d(${lastX - currentHotspotX}px, ${lastY - currentHotspotY}px, 0)`;
}

function onMouseLeaveDoc(e) {
  // e.relatedTarget === null quand le pointeur quitte réellement la fenêtre
  // (et pas juste un élément interne) — évite de cacher le calque à chaque
  // survol de bordure d'élément.
  if (isActive && followerEl && !e.relatedTarget) {
    followerEl.style.opacity = '0';
  }
}

function onMouseEnterDoc() {
  if (isActive && followerEl) {
    followerEl.style.opacity = '1';
  }
}

let listenersBound = false;
function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseout', onMouseLeaveDoc, { passive: true });
  document.addEventListener('mouseover', onMouseEnterDoc, { passive: true });
}
// 2026-08-04 — écouteurs branchés IMMÉDIATEMENT (pas seulement à l'intérieur
// de setAnimated()) : le survol du cadre décoratif (cf. updateCadreHover) est
// une fonctionnalité de base du curseur statique, pas un cas d'usage
// optionnel comme le curseur animé — elle doit fonctionner même si
// setAnimated() n'est jamais appelé.
bindListenersOnce();

/**
 * Active un curseur animé (ou n'importe quelle image) qui suit la souris.
 * Fonctionne dans les deux thèmes (Médiéval et Bleu sidéral) — cf. note de
 * portée en tête de fichier.
 */
export function setAnimated({ src, width = 48, height = 48, hotspotX = 0, hotspotY = 0 } = {}) {
  if (!src) return false;
  bindListenersOnce();
  ensureFollower();
  imgEl.src = src;
  imgEl.style.width = width + 'px';
  imgEl.style.height = height + 'px';
  currentHotspotX = hotspotX;
  currentHotspotY = hotspotY;
  followerEl.style.opacity = '1';
  followerEl.style.transform = `translate3d(${lastX - hotspotX}px, ${lastY - hotspotY}px, 0)`;
  document.documentElement.classList.add(ACTIVE_CLASS);
  isActive = true;
  return true;
}

/** Revient au curseur CSS statique par défaut (css/cursors.css). */
export function reset() {
  isActive = false;
  document.documentElement.classList.remove(ACTIVE_CLASS);
  if (followerEl) followerEl.style.opacity = '0';
}

// Bascule de thème (sélecteur prez ou futur sélecteur in-game) → le calque
// animé (setAnimated/reset) reste actif dans les deux thèmes (cf. note de
// portée en tête de fichier), seul le survol du cadre décoratif (strictement
// Médiéval, seul thème qui en a un) doit être annulé si on quitte "ancien".
new MutationObserver(() => {
  if (isOverCadre && !isMedievalTheme()) {
    isOverCadre = false;
    document.documentElement.classList.remove(CADRE_HOVER_CLASS);
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

if (typeof window !== 'undefined') {
  window.hexistenzCursor = { setAnimated, reset };
}
