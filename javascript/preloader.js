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
  './glb/decor/fontaine-3.glb',
  './glb/decor/poteau-indicateur-1.glb',
  './glb/decor/poteau-indicateur-2.glb',
  './glb/decor/poteau-indicateur-3.glb',
  './glb/decor/tonneau-1.glb',
  './glb/decor/tonneau-2.glb',
  './glb/decor/tonneau-3.glb',
  './glb/decor/tonneau-4.glb',
  './glb/decor/tonneau-5.glb',
  './glb/decor/charrette-1.glb',
  './glb/decor/charrette-2.glb',
  './glb/decor/charrette-pleine.glb',
  './glb/decor/charrette-3.glb',
  './glb/decor/meule.glb',
  './glb/decor/botte-foin.glb',
  './glb/decor/gold.glb',
  './glb/decor/barque-1.glb',
  './glb/decor/barque-2.glb',
  './glb/decor/barque-3.glb',
  './glb/decor/pile-de-bois-1.glb',
  './glb/decor/pile-de-bois-2.glb',
  './glb/decor/pile-de-bois-3.glb',
  './glb/decor/pile-de-bois-4.glb',
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
  './glb/astres/lune_melies.glb',
];

// ─── Liste exhaustive des PNG ─────────────────────────────────────────────────
// 2026-08-01 — demande explicite : le cadre décoratif ingame (thème médiéval,
// #footerBanner/#headerBanner/#leftBanner/#rightBanner, cf. CONTEXT.md §39)
// n'était préchargé nulle part (aucun tableau PNG n'existait avant ce round —
// seuls GLB et OGG l'étaient). Sans préchargement, le motif du cadre pouvait
// apparaître avec un léger délai/pop-in à la première ouverture du thème
// médiéval. cadre.png (ex-footer2.png, cf. §39) est réutilisé tel quel sur
// les 4 côtés — un seul fetch suffit à couvrir header/footer/left/right.
const ASSETS_IMG = [
  './images/cadre.png',
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
  './sounds/music-ingame-1.ogg',
  './sounds/music-ingame-2.ogg',
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

  // UI — annonces missions (cf. ttsAnnouncer.js::announceNewMission/announceMissionCompleted).
  // 2026-07-31 (2e demande) — chaque jingle est devenu un pool de variantes tirées
  // au hasard (3 pour nouvelle mission, 4 pour mission réussie) : les 7 fichiers
  // doivent tous être préchargés, pas seulement celui qui sera pioché en premier.
  './sounds/ui/mission-new-1.ogg',
  './sounds/ui/mission-new-2.ogg',
  './sounds/ui/mission-new-3.ogg',
  './sounds/ui/mission-succes-1.ogg',
  './sounds/ui/mission-succes-2.ogg',
  './sounds/ui/mission-succes-3.ogg',
  './sounds/ui/mission-succes-4.ogg',
];

// ─── UI ───────────────────────────────────────────────────────────────────────
// CSS extrait le 2026-07-11 vers css/preloader.css (découpage sans risque, cf.
// CONTEXT.md §21) : ex-injectStyles(), ~82 lignes de CSS injecté via template
// literal JS, aucune closure. Chargé statiquement via @import dans css/style.css,
// plus besoin d'injection JS au runtime.
//
// Passage bilingue FR/EN le 2026-07-12 : le texte "Chargement…" vient de
// json/languages/{french,english}.json (clé game.preloader), même mécanisme
// que les autres modules (top-level await + localStorage 'hexistenz_pres_lang').
// Repli FR en dur : c'est le tout premier écran affiché, avant même le fetch.
import { getLangFile, getLangVersion } from './gameLangReactive.js';

const _langFile = getLangFile();

const _plText = await fetch(`./json/languages/${_langFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.preloader ?? {})
  .catch(err => {
    console.error(`[preloader] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

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
    <div id="preloader-count"></div>
    <div id="preloader-label">${_plText.loading ?? 'Chargement…'}</div>
    <div id="preloader-filename"></div>
  `;
  document.body.appendChild(el);
  return el;
}

// 2026-08-01 — demande explicite : afficher, sous la barre, le nombre de
// fichiers déjà préchargés (ex: "45 fichiers/138 fichiers") ET, sur la même
// ligne, le poids déjà téléchargé en Mo (ex: "9 Mo/82 Mo"). Le total en Mo
// doit être connu AVANT le début du téléchargement réel (sinon le
// dénominateur resterait à 0 jusqu'à la fin) : on fait donc un premier passage
// de requêtes HEAD (légères, en parallèle) pour lire Content-Length de chaque
// asset et sommer le poids total, puis on accumule le poids réellement reçu
// (arrayBuffer().byteLength, cf. fetchAsset) au fil des téléchargements.
function setProgress(overlay, loaded, total, url, loadedBytes, totalBytes) {
  const bar      = overlay.querySelector('#preloader-bar');
  const count    = overlay.querySelector('#preloader-count');
  const label    = overlay.querySelector('#preloader-label');
  const filename = overlay.querySelector('#preloader-filename');
  const pct      = total > 0 ? Math.round((loaded / total) * 100) : 0;
  if (bar)   bar.style.width = pct + '%';
  if (count) {
    const loadedMB = Math.round((loadedBytes ?? 0) / 1e6);
    const totalMB  = Math.round((totalBytes ?? 0) / 1e6);
    count.textContent = (_plText.loadingCount ?? '{loaded} fichiers / {total} fichiers · {loadedMB} Mo / {totalMB} Mo')
      .replace('{loaded}', loaded)
      .replace('{total}', total)
      .replace('{loadedMB}', loadedMB)
      .replace('{totalMB}', totalMB);
  }
  if (label)    label.textContent = (_plText.loadingPct ?? 'Chargement… {pct} %').replace('{pct}', pct);
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
 * Retourne le poids réellement reçu (octets), 0 en cas d'échec — ce poids
 * réel (et non le Content-Length annoncé) alimente le compteur "X Mo/Y Mo".
 */
async function fetchAsset(url) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      // Consommer le body pour que le navigateur finalise bien la mise en cache.
      const buf = await response.arrayBuffer();
      return buf.byteLength;
    }
  } catch (_) {
    // Fichier absent ou erreur réseau : on continue.
  }
  return 0;
}

/**
 * Requête HEAD légère pour connaître à l'avance le poids (Content-Length)
 * d'un asset, sans le télécharger. Utilisée uniquement pour établir le total
 * en Mo affiché dès le début du chargement (cf. setProgress). Silencieuse en
 * cas d'échec (serveur sans support HEAD, fichier absent, etc.) — l'asset
 * contribuera alors 0 au total annoncé, mais son poids réel sera quand même
 * compté au numérateur lors du fetch complet qui suit.
 */
async function headSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) {
      const len = response.headers.get('content-length');
      if (len) return parseInt(len, 10) || 0;
    }
  } catch (_) {
    // Ignoré : le total sera simplement sous-estimé pour ce fichier.
  }
  return 0;
}

// ─── Point d'entrée public ────────────────────────────────────────────────────

/**
 * Affiche l'écran de chargement, précharge tous les assets,
 * puis appelle `onReady()` une fois terminé.
 */
export async function showPreloader(onReady) {
  const overlay = createOverlay();

  const all    = [...ASSETS_GLB, ...ASSETS_IMG, ...ASSETS_OGG];
  const total  = all.length;
  let   loaded = 0;

  // Pré-passe HEAD (parallèle, léger) pour connaître le poids total annoncé
  // avant de lancer les vrais téléchargements — sinon le dénominateur "Y Mo"
  // resterait à 0 jusqu'à la toute fin (cf. commentaires ci-dessus).
  const sizes      = await Promise.all(all.map(headSize));
  const totalBytes = sizes.reduce((a, b) => a + b, 0);
  let   loadedBytes = 0;

  setProgress(overlay, 0, total, '', loadedBytes, totalBytes);

  // Lancer tous les fetch en parallèle, mettre à jour la barre au fil de l'eau
  const tasks = all.map(url =>
    fetchAsset(url).then(bytes => {
      loaded += 1;
      loadedBytes += bytes;
      setProgress(overlay, loaded, total, url, loadedBytes, totalBytes);
    })
  );

  await Promise.allSettled(tasks);

  // Petit répit visuel à 100 % avant de retirer l'overlay
  await new Promise(r => setTimeout(r, 280));

  await dismissOverlay(overlay);
  onReady();
}
