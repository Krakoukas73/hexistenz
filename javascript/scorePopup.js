// ─── Popup de score central (module autonome) ────────────────────────────────
// Affiche brièvement "+N" au centre exact de l'écran après une pose de tuile
// LOCALE validée. Purement DOM + Web Animations API — aucune dépendance à
// Three.js ni à la caméra, aucun calcul de score. Reçoit une valeur déjà
// calculée et se contente de l'afficher sur #scorePopup (élément unique,
// défini dans game.php, styles dans css/scorePopup.css).
//
// Appel voulu : scene.js::placeTile(), juste après `lastScore = placedTile.score`
// et `updateScoreUI(...)`. Volontairement PAS branché dans updateScoreUI() elle-même,
// qui tourne aussi pendant l'init, l'undo, la sync multijoueur (applyRemoteGameState)
// et l'extension de grille (expandGridAroundPlacedTile) — aucun de ces cas ne doit
// déclencher le popup.

const ANIM_DURATION_MS = 1650;
const ANIM_DURATION_REDUCED_MS = 650;

// Une seule Animation active à la fois — jamais d'empilement, jamais de second élément DOM.
let _activeAnimation = null;

function _prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function _buildKeyframes(reduced) {
  if (reduced) {
    // Rendu réduit : simple fondu, aucune mise à l'échelle ni overshoot.
    return [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0, offset: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.11 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.89 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0, offset: 1 }
    ];
  }
  return [
    { transform: 'translate(-50%, -50%) scale(0.35)', opacity: 0, offset: 0 },    // apparition
    { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.144 },// overshoot
    { transform: 'translate(-50%, -50%) scale(1)',    opacity: 1, offset: 0.204 },// retour rapide
    { transform: 'translate(-50%, -50%) scale(1)',    opacity: 1, offset: 0.848 },// maintien lisible, encore plus long
    { transform: 'translate(-50%, -50%) scale(1.8)',  opacity: 0, offset: 1 }     // disparition
  ];
}

// Coeur partagé du popup : pose le texte, (re)lance l'anim, annule proprement
// une éventuelle animation encore en cours (cf. showScorePopup ci-dessous pour
// le détail du comportement d'annulation/remplacement).
function _showCenterPopup(text, { isMessage = false } = {}) {
  const el = document.getElementById('scorePopup');
  if (!el) return; // #scorePopup absent du DOM (page sans jeu) — no-op silencieux

  el.textContent = text;
  el.classList.toggle('scorePopup--message', isMessage);

  if (_activeAnimation) {
    _activeAnimation.cancel();
    _activeAnimation = null;
  }

  const reduced = _prefersReducedMotion();

  _activeAnimation = el.animate(_buildKeyframes(reduced), {
    duration: reduced ? ANIM_DURATION_REDUCED_MS : ANIM_DURATION_MS,
    easing: 'ease-out',
    fill: 'forwards'
  });

  _activeAnimation.onfinish = () => { _activeAnimation = null; };
  // Rien à nettoyer sur cancel() : l'appel qui annule relance toujours immédiatement
  // une nouvelle animation dans la foulée (cf. ci-dessus).
}

/**
 * Affiche "+N" au centre de l'écran pour un score de pose strictement positif.
 * N'affiche rien pour un score nul, négatif, ou non numérique. Si un nouveau
 * score arrive pendant qu'une animation est en cours, l'active est annulée
 * proprement (`cancel()`) et remplacée immédiatement par la nouvelle valeur.
 *
 * @param {number} score - valeur du dernier coup (ex. placedTile.score)
 */
export function showScorePopup(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return;
  _showCenterPopup(`+${Math.round(value)}`);
}

/**
 * Affiche un texte arbitraire (déjà traduit par l'appelant) au centre de
 * l'écran, avec la même animation que showScorePopup — ajouté le 2026-07-15
 * pour le message "Capture faite !" du bouton 📷 (cf. scene.js). Même règle
 * d'annulation/remplacement qu'un score qui arriverait entre-temps.
 *
 * @param {string} text - texte déjà résolu dans la langue courante
 */
export function showCenterMessage(text) {
  if (!text) return;
  _showCenterPopup(String(text), { isMessage: true });
}
