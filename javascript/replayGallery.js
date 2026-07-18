// ─── replayGallery.js — overlay in-game pour la galerie de replays ───────────────────
// Ouvre replays.php dans un <iframe> plein écran par-dessus le jeu, même pattern EXACT
// que snapshotGallery.js (demande explicite utilisateur 2026-07-16 : "comme la galerie
// de snapshots"). Différence clé : au clic sur une carte, replays.php/replaysPage.js
// envoie un postMessage 'hexistenz:openReplay' avec le code de la partie choisie — cet
// overlay se ferme alors et délègue l'ouverture réelle du replay (dans la scène 3D, pas
// dans l'iframe) au callback fourni par scene.js via setReplayOpenHandler().

let overlayEl = null;
let frameEl = null;
let _onOpenReplay = null;

/** Enregistre le callback appelé avec le code de room choisi dans la galerie
 *  (scene.js y branche replayController.openFromRoom(code)). */
export function setReplayOpenHandler(handler) {
  _onOpenReplay = handler;
}

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.id = 'replayGalleryOverlay';
  overlayEl.className = 'snapshot-gallery-overlay hidden';
  overlayEl.setAttribute('aria-hidden', 'true');
  overlayEl.innerHTML = `
    <div class="snapshot-gallery-panel" role="dialog" aria-modal="true">
      <button id="replayGalleryClose" class="snapshot-gallery-close" type="button" aria-label="Fermer">×</button>
      <iframe id="replayGalleryFrame" class="snapshot-gallery-frame" title="Galerie de replays"></iframe>
    </div>
  `;
  document.body.appendChild(overlayEl);
  frameEl = overlayEl.querySelector('#replayGalleryFrame');

  overlayEl.querySelector('#replayGalleryClose').addEventListener('click', closeReplayGallery);
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeReplayGallery(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) closeReplayGallery();
  });
  window.addEventListener('message', (e) => {
    if (e.source !== frameEl?.contentWindow) return;
    if (e.data?.type === 'hexistenz:openReplay' && e.data.code) {
      const code = e.data.code;
      closeReplayGallery();
      _onOpenReplay?.(code);
    }
  });
}

export function openReplayGallery() {
  ensureOverlay();
  frameEl.src = `./replays.php?t=${Date.now()}`;
  overlayEl.classList.remove('hidden');
  overlayEl.setAttribute('aria-hidden', 'false');
}

export function closeReplayGallery() {
  if (!overlayEl) return;
  overlayEl.classList.add('hidden');
  overlayEl.setAttribute('aria-hidden', 'true');
  frameEl.src = 'about:blank';
}
