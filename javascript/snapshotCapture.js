// ─── snapshotCapture.js — capture du canvas WebGL en JPEG + envoi serveur ──────────
// Le <canvas> Three.js ne contient QUE le rendu 3D (monde + sprites texte + post-
// processing, cf. threeSetup.js::renderWorldLayer/renderTextLayer) — le HUD (score,
// boutons, panneaux EDA/aide/missions...) est un overlay DOM séparé positionné par-
// dessus en CSS, jamais dessiné DANS le canvas. Il n'y a donc RIEN à masquer côté DOM
// pour obtenir une capture "propre" : canvas.toBlob() suffit à lui seul.
// Seule exception réelle : hoverZoneOverlay (contour pointillé de survol) est un objet
// Three.js visible dans le rendu — masqué par l'appelant (scene.js) le temps de la
// capture, exactement comme le fait déjà le mode super-immersif (SHIFT+Espace).
//
// Ajouté le 2026-07-14 à la demande de l'utilisateur (captures serveur dans /snapshots,
// cf. CONTEXT.md §21). Volontairement minimal et autonome (pas de dépendance à
// gameLangReactive/edaPanelWiring) : un seul export, appelé depuis scene.js.
//
// Étendu le 2026-07-15 (galerie snapshots.php) : tiles/mode passés en query string sur
// l'URL POST — le corps reste le JPEG brut inchangé, snapshot.php les persiste dans un
// sidecar .json à côté de l'image.

/**
 * Capture le contenu courant d'un canvas WebGL en JPEG et l'envoie à snapshot.php,
 * qui l'enregistre côté serveur dans /snapshots.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} [options]
 * @param {number} [options.quality=0.92] - qualité JPEG (0-1)
 * @param {number|null} [options.tiles=null] - nombre de tuiles posées (métadonnée galerie)
 * @param {string|null} [options.mode=null] - 'bouliste' | 'platiste' (métadonnée galerie)
 * @returns {Promise<{ success: true, filename: string }>}
 */
export async function captureSnapshot(canvas, { quality = 0.92, tiles = null, mode = null } = {}) {
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Capture du canvas impossible (toBlob a retourné null — WebGL context perdu ?)');

  const params = new URLSearchParams();
  if (Number.isFinite(tiles)) params.set('tiles', String(tiles));
  if (mode === 'bouliste' || mode === 'platiste') params.set('mode', mode);
  const qs = params.toString();

  const res = await fetch(`./snapshot.php${qs ? '?' + qs : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });

  let data = null;
  try { data = await res.json(); } catch { /* réponse non-JSON — géré ci-dessous */ }

  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `Échec de l'envoi de la capture (HTTP ${res.status})`);
  }
  return data;
}
