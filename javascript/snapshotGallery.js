// ─── snapshotGallery.js — overlay in-game pour la galerie de captures ────────────────
// Ouvre snapshots.php dans un <iframe> plein écran par-dessus le jeu (même pattern que
// helpOverlay/EDA : overlay DOM fixed, le canvas WebGL et sa boucle de rendu continuent
// de tourner derrière, aucune navigation hors de game.php). Ajouté le 2026-07-15 à la
// demande explicite de l'utilisateur ("sans quitter le jeu").
//
// L'iframe est créée une seule fois puis réutilisée, mais son `src` est réinitialisé
// (avec un cache-bust `?t=...`) à CHAQUE ouverture — sinon une capture prise après la
// première ouverture n'apparaîtrait jamais dans une galerie déjà chargée en mémoire.

let overlayEl = null;
let frameEl = null;

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.id = 'snapshotGalleryOverlay';
  overlayEl.className = 'snapshot-gallery-overlay hidden';
  overlayEl.setAttribute('aria-hidden', 'true');
  overlayEl.innerHTML = `
    <div class="snapshot-gallery-panel" role="dialog" aria-modal="true">
      <button id="snapshotGalleryClose" class="snapshot-gallery-close" type="button" aria-label="Fermer">×</button>
      <iframe id="snapshotGalleryFrame" class="snapshot-gallery-frame" title="Galerie de captures"></iframe>
    </div>
  `;
  document.body.appendChild(overlayEl);
  frameEl = overlayEl.querySelector('#snapshotGalleryFrame');

  overlayEl.querySelector('#snapshotGalleryClose').addEventListener('click', closeSnapshotGallery);
  // Clic sur le voile (en dehors du panneau) : ferme, comme les autres overlays du jeu.
  overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeSnapshotGallery(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) closeSnapshotGallery();
  });
  // 2e ESC dans la visionneuse plein écran (snapshots.php) : un keydown dans l'<iframe>
  // ne bulle jamais vers ce document parent (documents distincts), donc la page interne
  // le signale explicitement par postMessage une fois sa propre visionneuse déjà fermée.
  // cf. snapshotsPage.js — signalé par l'utilisateur 2026-07-15.
  window.addEventListener('message', (e) => {
    if (e.source === frameEl?.contentWindow && e.data?.type === 'hexistenz:closeSnapshotGallery') {
      closeSnapshotGallery();
    }
  });
}

export function openSnapshotGallery() {
  ensureOverlay();
  frameEl.src = `./snapshots.php?t=${Date.now()}`;
  overlayEl.classList.remove('hidden');
  overlayEl.setAttribute('aria-hidden', 'false');
}

export function closeSnapshotGallery() {
  if (!overlayEl) return;
  overlayEl.classList.add('hidden');
  overlayEl.setAttribute('aria-hidden', 'true');
  frameEl.src = 'about:blank'; // libère l'iframe, force un rechargement frais à la prochaine ouverture
}
