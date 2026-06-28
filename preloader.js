/**
 * preloader.js
 * Précharge tous les assets lourds (GLB + OGG) via fetch() avant d'afficher
 * les menus, pour éliminer les micro-freezes et les chargements tardifs en jeu.
 *
 * Les fichiers téléchargés tombent dans le cache HTTP du navigateur ; les
 * GLTFLoader et Audio qui viendront ensuite les trouveront déjà là.
 */

// ─── Liste exhaustive des GLB ─────────────────────────────────────────────────

const ASSETS_GLB = [
  // Arbres
  './glb/arbres/bouleau-1.glb',
  './glb/arbres/bouleau-2.glb',
  './glb/arbres/buisson.glb',
  './glb/arbres/peuplier.glb',
  './glb/arbres/sapin-1.glb',
  './glb/arbres/sapin-2.glb',
  './glb/arbres/sapin-3.glb',
  './glb/arbres/sapin-4.glb',
  './glb/arbres/sapin-5.glb',
  './glb/arbres/sapin-6.glb',
  './glb/arbres/sapin-7.glb',
  './glb/arbres/sapin-8.glb',
  './glb/arbres/sapin-9.glb',
  './glb/arbres/sapin-10.glb',
  './glb/arbres/sapin-11.glb',
  './glb/arbres/gros-arbre-1.glb',
  './glb/arbres/gros-arbre-2.glb',
  './glb/arbres/gros-arbre-3.glb',

  // Plantes / fleurs / champignons / roseaux
  './glb/plantes/plantes.glb',
  './glb/plantes/fougere.glb',
  './glb/plantes/roseau.glb',
  './glb/plantes/mushroom-1.glb',
  './glb/plantes/mushroom-2.glb',
  './glb/plantes/plante-haute.glb',
  './glb/plantes/flower-1.glb',
  './glb/plantes/flower-2.glb',
  './glb/plantes/flower-3.glb',
  './glb/plantes/flower-4.glb',
  './glb/plantes/berry/berry-1.glb',
  './glb/plantes/berry/berry-2.glb',
  './glb/plantes/berry/berry-3.glb',
  './glb/plantes/berry/berry-4.glb',
  './glb/plantes/berry/berry-5.glb',
  './glb/plantes/berry/berry-6.glb',

  // Décor naturel
  './glb/decor/rock-1.glb',
  './glb/decor/rock-2.glb',
  './glb/decor/rock-3.glb',
  './glb/decor/rock-4.glb',

  // Décor village / route
  './glb/decor/fontaine-1.glb',
  './glb/decor/fontaine-2.glb',
  './glb/decor/poteau-indicateur-1.glb',
  './glb/decor/poteau-indicateur-2.glb',
  './glb/decor/poteau-indicateur-3.glb',
  './glb/decor/tonneau-1.glb',
  './glb/decor/tonneau-2.glb',
  './glb/decor/tonneau-3.glb',
  './glb/decor/tonneau-4.glb',
  './glb/decor/tonneau-5.glb',
  './glb/decor/charrette-2.glb',
  './glb/decor/charrette-pleine.glb',
  './glb/decor/meule.glb',
  './glb/decor/botte-foin.glb',
  './glb/decor/coffre.glb',
  './glb/decor/barque-1.glb',
  './glb/decor/barque-2.glb',
  './glb/decor/pile-de-bois-1.glb',
  './glb/decor/pile-de-bois-2.glb',
  './glb/decor/bateau.glb',

  // Animaux
  './glb/animaux/birds.glb',
  './glb/animaux/chien.glb',
  './glb/animaux/cheval.glb',
  './glb/animaux/cerf.glb',

  // Bâtiments médiévaux
  './glb/batiments/medieval/maison-petite-1.glb',
  './glb/batiments/medieval/maison-petite-2.glb',
  './glb/batiments/medieval/maison-petite-3.glb',
  './glb/batiments/medieval/tour-1.glb',
  './glb/batiments/medieval/tour-2.glb',
  './glb/batiments/medieval/tour-3.glb',
  './glb/batiments/medieval/tour-4.glb',

  './glb/batiments/medieval/tour-6.glb',
  './glb/batiments/medieval/moulin-1.glb',
  './glb/batiments/medieval/moulin-2.glb',
  './glb/batiments/medieval/gare-eglise.glb',

  // Trains
  './glb/trains/train.glb',
  './glb/trains/rails.glb',

  // Astres
  './glb/astres/soleil.glb',
  './glb/astres/lune.glb',
];

// ─── Liste exhaustive des OGG ─────────────────────────────────────────────────

const ASSETS_OGG = [
  // Musiques
  './sounds/music-intro-1.ogg',
  './sounds/music-intro-2.ogg',
  './sounds/music-intro-3.ogg',
  './sounds/music-intro-4.ogg',
  './sounds/music-intro-5.ogg',
  './sounds/music-intro-6.ogg',
  './sounds/music-ingame.ogg',
  './sounds/music-ending.ogg',
  './sounds/chi-mai.ogg',

  // Ambiances spatiales
  './sounds/corbeaux-1.ogg',
  './sounds/corbeaux-2.ogg',
  './sounds/birds-1.ogg',
  './sounds/birds-2.ogg',
  './sounds/birds-3.ogg',
  './sounds/birds-4.ogg',
  './sounds/birds-5.ogg',
  './sounds/birds-6.ogg',
  './sounds/village.ogg',
  './sounds/plage-1.ogg',
  './sounds/plage-2.ogg',
  './sounds/plage-3.ogg',
  './sounds/train-1.ogg',
  './sounds/train-2.ogg',
  './sounds/train-3.ogg',
  './sounds/pirate.ogg',
];

// ─── UI ───────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('preloader-styles')) return;
  const style = document.createElement('style');
  style.id = 'preloader-styles';
  style.textContent = `
    #preloader-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      background:
        radial-gradient(circle at 50% 15%, rgba(115, 190, 255, 0.10), transparent 34%),
        linear-gradient(135deg, #071019 0%, #111827 46%, #05070b 100%);
      transition: opacity 0.55s ease;
    }

    #preloader-overlay.fade-out {
      opacity: 0;
      pointer-events: none;
    }

    #preloader-logo {
      width: min(440px, 72vw);
      object-fit: contain;
      filter: drop-shadow(0 14px 28px rgba(0,0,0,0.55));
      margin-bottom: 20px;
      display: block;
      user-select: none;
      pointer-events: none;
    }

    #preloader-hex-ring {
      width: 64px;
      height: 64px;
      margin-bottom: 28px;
      animation: preloader-hex-spin 2.4s linear infinite;
      opacity: 0.72;
    }

    @keyframes preloader-hex-spin {
      from { transform: rotate(0deg);   }
      to   { transform: rotate(360deg); }
    }

    #preloader-bar-wrap {
      width: min(320px, 64vw);
      height: 3px;
      background: rgba(255,255,255,0.08);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 14px;
    }

    #preloader-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      border-radius: 2px;
      transition: width 0.18s ease-out;
    }

    #preloader-label {
      font-family: system-ui, sans-serif;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(180, 210, 255, 0.42);
      margin-bottom: 6px;
    }

    #preloader-filename {
      font-family: system-ui, sans-serif;
      font-size: 10px;
      letter-spacing: 0.06em;
      color: rgba(180, 210, 255, 0.22);
      max-width: min(320px, 64vw);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function createOverlay() {
  const el = document.createElement('div');
  el.id = 'preloader-overlay';
  el.innerHTML = `
    <img id="preloader-logo" src="images/logo2.png" alt="Hexistenz" />
    <svg id="preloader-hex-ring" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill="none"
        stroke="rgba(96,165,250,0.55)"
        stroke-width="2"
        stroke-dasharray="10 4"
      />
      <polygon
        points="32,10 51,21 51,43 32,54 13,43 13,21"
        fill="none"
        stroke="rgba(59,130,246,0.28)"
        stroke-width="1"
      />
    </svg>
    <div id="preloader-bar-wrap">
      <div id="preloader-bar"></div>
    </div>
    <div id="preloader-label">Chargement…</div>
    <div id="preloader-filename"></div>
  `;
  document.body.appendChild(el);
  return el;
}

function setProgress(overlay, loaded, total, url = '') {
  const bar      = overlay.querySelector('#preloader-bar');
  const label    = overlay.querySelector('#preloader-label');
  const filename = overlay.querySelector('#preloader-filename');
  const pct      = total > 0 ? Math.round((loaded / total) * 100) : 0;
  if (bar)      bar.style.width = pct + '%';
  if (label)    label.textContent = `Chargement… ${pct} %`;
  if (filename) filename.textContent = url ? url.split('/').pop() : '';
}

function dismissOverlay(overlay) {
  return new Promise(resolve => {
    overlay.classList.add('fade-out');
    overlay.addEventListener('transitionend', () => {
      overlay.remove();
      resolve();
    }, { once: true });
    // Sécurité : si la transition ne se déclenche pas (ex: prefers-reduced-motion)
    setTimeout(resolve, 700);
  });
}

// ─── Fetch d'un asset individuel ─────────────────────────────────────────────

/**
 * Charge un asset via fetch() pour le mettre dans le cache HTTP.
 * Les erreurs (404, réseau) sont silencieuses : on avance quand même.
 */
async function fetchAsset(url) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      // Consommer le body pour que le navigateur finalise bien la mise en cache.
      await response.arrayBuffer();
    }
  } catch (_) {
    // Fichier absent ou erreur réseau : on continue.
  }
}

// ─── Point d'entrée public ────────────────────────────────────────────────────

/**
 * Affiche l'écran de chargement, précharge tous les assets,
 * puis appelle `onReady()` une fois terminé.
 */
export async function showPreloader(onReady) {
  injectStyles();
  const overlay = createOverlay();

  const all    = [...ASSETS_GLB, ...ASSETS_OGG];
  const total  = all.length;
  let   loaded = 0;

  setProgress(overlay, 0, total);

  // Lancer tous les fetch en parallèle, mettre à jour la barre au fil de l'eau
  const tasks = all.map(url =>
    fetchAsset(url).then(() => {
      loaded += 1;
      setProgress(overlay, loaded, total, url);
    })
  );

  await Promise.allSettled(tasks);

  // Petit répit visuel à 100 % avant de retirer l'overlay
  await new Promise(r => setTimeout(r, 280));

  await dismissOverlay(overlay);
  onReady();
}
