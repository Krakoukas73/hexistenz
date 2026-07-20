// ─── parchmentVariant.js — variation aléatoire manuscrit-1.png / manuscrit-2.png (2026-07-20) ───
// Demande explicite : 2 variantes désormais disponibles pour le fond parchemin
// 9-slice du thème Médiéval ("pour éviter les effets de répétition de l'UI") —
// plusieurs cartes identiques (.creature-card ×8, .gallery-card ×8, .daynight-card
// ×6, .audio-card ×4, .step-card ×4, .eda-showcase-card ×3, .hero-inspi-card ×3,
// .biome-card/.faction-card ×2) partagent aujourd'hui exactement la même texture
// border-image, très visible côte à côte sur le même écran (index.php).
//
// CSS seul ne peut pas piocher aléatoirement par instance (pas de random() natif,
// et une seule règle de classe peint identiquement toutes ses instances). Ce
// script tire au sort, INDÉPENDAMMENT pour chaque élément concerné, laquelle des
// 2 images utiliser, en posant simplement l'attribut `data-parchment-variant="2"`
// sur les élements tirés en variante 2 (via dataset, donc portée à l'élément
// seul). Chacune des 27 déclarations `border-image-source` concernées (cf.
// CONTEXT.md §32) est accompagnée d'une règle jumelle
// `[data-theme="ancien"] SELECTEUR[data-parchment-variant="2"] { border-image-
// source: url(".../images/manuscrit-2.png"); }` juste après la règle d'origine
// (restée en dur sur manuscrit-1.png, le fallback naturel si l'attribut n'est
// jamais posé) — donc AUCUN effet en thème Bleu sidéral (l'attribut n'y est
// jamais consommé) ni sur un navigateur où ce script serait bloqué.
//
// 🐛 Piège rencontré (2026-07-20) — 1ère version utilisait une custom property
// CSS (`--parchment-tex`) posée en style inline avec une url() relative au
// DOCUMENT (ex. "images/manuscrit-2.png"). Ça ne s'affichait JAMAIS : une url()
// à l'intérieur d'une custom property n'est résolue qu'au moment de sa
// substitution via var(), relative à la feuille de style QUI CONTIENT le
// var() (ex. css/eda.css), pas à l'endroit où la propriété a été posée. Le
// chemin relatif se résolvait donc en `css/images/manuscrit-2.png` (un niveau
// de trop, 404 silencieux) plutôt que `images/manuscrit-2.png` — border-image
// retombait sur son fallback invisible. Fix : abandon des custom properties
// pour ce besoin, retour à une 2e règle CSS statique par site (chemin relatif
// écrit en dur dans le bon fichier, donc toujours résolu correctement),
// sélectionnée via un simple attribut posé par ce script — zéro ambiguïté de
// résolution d'URL possible.
//
// Idempotent (dataset.parchmentVariant posé après le 1er tirage) : un élément
// déjà tranché n'est jamais re-tiré au sort si le script est ré-invoqué (bascule
// de thème, resize...) — pas de flicker entre v1/v2 en cours de session. Tous les
// éléments listés ci-dessous sont rendus par PHP au chargement de la page (aucune
// carte n'est créée dynamiquement en JS) : un seul passage au DOMContentLoaded
// suffit, pas besoin de MutationObserver.

// Tous les sélecteurs qui portent une paire de règles border-image-source
// manuscrit-1/manuscrit-2 en thème "ancien" (cf. base.css/deck.css/eda.css/
// help.css/missions.css/multiplayerUi.css/snapshotGalleryOverlay.css/
// themes/medieval.css).
const PARCHMENT_SELECTORS = [
  // Prez (index.php) — cartes répétées : c'est ici que la répétition était la
  // plus visible (plusieurs instances de la même classe sur le même écran).
  '.mission-card',
  '.biome-card',
  '.faction-card',
  '.creature-card',
  '.audio-card',
  '.daynight-card',
  '.hs-card',
  '.hs-empty',
  '.hero-inspi-card',
  '.step-card',
  '.gallery-card',
  '.eda-showcase-card',
  '.room-demo',
  'nav',
  '.stats-bar',
  '.kbd-strip',
  '.score-pills',
  // In-game (game.php) — éléments uniques : la variante est tirée une fois par
  // chargement de page plutôt qu'entre plusieurs instances simultanées.
  '#scorePanel',
  '.missionsBox',
  '.mode-panel',
  '.help-panel',
  '.fps-counter',
  '.replay-panel',
  '#kbdHintHud',
  '.debug-light-body',
  '.tileDeckBox',
  '.snapshot-gallery-panel',
];

const PARCHMENT_QUERY = PARCHMENT_SELECTORS.join(', ');

export function applyParchmentVariants(root = document) {
  const elements = root.querySelectorAll(PARCHMENT_QUERY);
  elements.forEach((el) => {
    if (el.dataset.parchmentVariant) return; // déjà tranché, ne pas re-tirer au sort
    el.dataset.parchmentVariant = Math.random() < 0.5 ? '2' : '1';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyParchmentVariants());
} else {
  applyParchmentVariants();
}
