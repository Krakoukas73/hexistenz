// ─── snapshotsPage.js — logique de la galerie de captures (snapshots.php) ────────────
// Page autonome, hors du graphe de modules du jeu (scene.js ne l'importe jamais) —
// chargée soit directement (URL), soit dans l'<iframe> ouvert par snapshotGallery.js.
// Réutilise gameLangReactive.js uniquement pour LIRE la langue déjà choisie en jeu
// (même clé localStorage 'hexistenz_pres_lang') : pas de sélecteur de langue ici, la
// galerie hérite simplement de la langue courante du jeu.
import { getGameLang, getLangFile, getLangVersion } from './gameLangReactive.js';

const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', 'fr-CA': 'fr-CA', de: 'de-DE', ru: 'ru-RU', 'fr-MED': 'fr-FR', nl: 'nl-NL', pl: 'pl-PL', tr: 'tr-TR' };
const BATCH_SIZE = 30;

async function loadTexts() {
  const file = getLangFile(getGameLang());
  const data = await fetch(`./json/languages/${file}.json?v=${getLangVersion()}`)
    .then(r => r.json())
    .catch(() => ({}));
  return data?.game?.gallery ?? {};
}

function formatCaptionDate(isoDate, locale) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const timePart = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${datePart} · ${timePart}`;
}

function formatCaptionMeta(item, texts) {
  const parts = [];
  if (Number.isFinite(item.tiles)) {
    parts.push((texts.tilesCount ?? 'Partie de {n} tuiles').replace('{n}', item.tiles));
  }
  if (item.mode === 'bouliste') parts.push(texts.modeBouliste ?? 'Mode bouliste');
  else if (item.mode === 'platiste') parts.push(texts.modePlatiste ?? 'Mode platiste');
  return parts.join(' · ');
}

function buildItemEl(item, index, locale, texts, onOpen) {
  const a = document.createElement('div');
  a.className = 'gallery-item';
  a.dataset.index = String(index);

  const img = document.createElement('img');
  // Miniature légère pour la grille (2026-07-15) — la pleine résolution (item.url)
  // n'est chargée que dans la visionneuse plein écran, cf. initViewer ci-dessous.
  img.src = item.thumbUrl ?? item.url;
  img.loading = 'lazy';
  img.alt = '';
  img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
  a.appendChild(img);

  const caption = document.createElement('div');
  caption.className = 'gallery-caption';
  const dateEl = document.createElement('div');
  dateEl.className = 'gallery-caption-date';
  dateEl.textContent = formatCaptionDate(item.date, locale);
  caption.appendChild(dateEl);
  const meta = formatCaptionMeta(item, texts);
  if (meta) {
    const metaEl = document.createElement('div');
    metaEl.className = 'gallery-caption-meta';
    metaEl.textContent = meta;
    caption.appendChild(metaEl);
  }
  a.appendChild(caption);

  a.addEventListener('click', () => onOpen(index));
  return a;
}

function initViewer(items, locale, texts) {
  const viewer   = document.getElementById('galleryViewer');
  const imgEl    = document.getElementById('galleryViewerImg');
  const capEl    = document.getElementById('galleryViewerCaption');
  const btnPrev  = document.getElementById('galleryViewerPrev');
  const btnNext  = document.getElementById('galleryViewerNext');
  let current = -1;

  function render() {
    const item = items[current];
    if (!item) return;
    imgEl.src = item.url;
    const dateLine = formatCaptionDate(item.date, locale);
    const metaLine = formatCaptionMeta(item, texts);
    capEl.innerHTML = '';
    const dateEl = document.createElement('div');
    dateEl.className = 'gallery-caption-date';
    dateEl.textContent = dateLine;
    capEl.appendChild(dateEl);
    if (metaLine) {
      const metaEl = document.createElement('div');
      metaEl.className = 'gallery-caption-meta';
      metaEl.textContent = metaLine;
      capEl.appendChild(metaEl);
    }
    btnPrev.style.visibility = items.length > 1 ? 'visible' : 'hidden';
    btnNext.style.visibility = items.length > 1 ? 'visible' : 'hidden';
  }

  function open(index) {
    current = index;
    render();
    viewer.hidden = false;
  }
  function close() {
    viewer.hidden = true;
    imgEl.src = '';
  }
  function step(delta) {
    if (!items.length) return;
    current = (current + delta + items.length) % items.length;
    render();
  }

  // Pas de croix de fermeture (retirée le 2026-07-15, superposée avec celle du panneau
  // parent quand la galerie est ouverte en overlay in-game — disgracieux). À la place :
  // cliquer sur l'image agrandie OU n'importe où ailleurs dans la visionneuse ferme —
  // seuls les boutons ‹/› (navigation) échappent à cette règle.
  btnPrev.addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
  btnNext.addEventListener('click', (e) => { e.stopPropagation(); step(1); });
  viewer.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!viewer.hidden) { close(); return; }
      // Visionneuse déjà fermée : un 2e ESC doit fermer la galerie elle-même. Quand la
      // page tourne dans l'<iframe> de l'overlay in-game (snapshotGallery.js), un keydown
      // ne traverse jamais vers le document parent (documents distincts) — on le signale
      // donc explicitement par postMessage. Sans effet en accès direct (hors iframe),
      // où window.parent === window.
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'hexistenz:closeSnapshotGallery' }, window.location.origin);
      }
      return;
    }
    if (viewer.hidden) return;
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  return { open };
}

async function init() {
  const lang = getGameLang();
  const locale = LOCALES[lang] ?? 'fr-FR';
  const texts = await loadTexts();

  const titleEl = document.getElementById('galleryTitle');
  const countEl = document.getElementById('galleryCount');
  const gridEl  = document.getElementById('galleryGrid');
  const emptyEl = document.getElementById('galleryEmpty');
  const sentinel = document.getElementById('galleryScrollSentinel');

  if (texts.title) titleEl.textContent = texts.title;
  document.title = `Hexistenz — ${texts.title ?? 'Galerie de captures'}`;

  let items = [];
  try {
    items = JSON.parse(document.getElementById('snap-data')?.textContent || '[]');
  } catch { items = []; }

  if (!items.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = texts.empty ?? 'Aucune capture pour l\'instant.';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = String(items.length);

  const viewer = initViewer(items, locale, texts);

  // Chargement progressif : un premier lot est rendu immédiatement, le reste est ajouté
  // par lots au fil du scroll (IntersectionObserver sur une sentinelle en bas de page) —
  // évite de créer/charger d'un coup des centaines de miniatures si le dossier grossit.
  let rendered = 0;
  function renderNextBatch() {
    const end = Math.min(rendered + BATCH_SIZE, items.length);
    for (let i = rendered; i < end; i++) {
      gridEl.appendChild(buildItemEl(items[i], i, locale, texts, viewer.open));
    }
    rendered = end;
    if (rendered >= items.length && observer) observer.disconnect();
  }

  let observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) renderNextBatch();
    }, { rootMargin: '600px' });
    observer.observe(sentinel);
  }

  renderNextBatch();
}

init();
