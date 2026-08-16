// ─── replaysPage.js — logique de la galerie de replays (replays.php) ─────────────────
// Page autonome, hors du graphe de modules du jeu (scene.js ne l'importe jamais) —
// chargée soit directement (URL), soit dans l'<iframe> ouvert par replayGallery.js.
// Contrairement à snapshotsPage.js (données embarquées côté PHP), la liste des parties
// est récupérée en direct via multiplayer.php?action=listall — pas de scan disque
// dupliqué côté PHP, une seule source de vérité (multiplayer.php).
import { getGameLang, getLangFile, getLangVersion } from './gameLangReactive.js';

const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', 'fr-CA': 'fr-CA', de: 'de-DE', ru: 'ru-RU', 'fr-MED': 'fr-FR', nl: 'nl-NL', pl: 'pl-PL', sv: 'sv-SE', tr: 'tr-TR', da: 'da-DK', no: 'nb-NO', fi: 'fi-FI', el: 'el-GR' };

async function loadTexts() {
  const file = getLangFile(getGameLang());
  const data = await fetch(`./json/languages/${file}.json?v=${getLangVersion()}`)
    .then(r => r.json())
    .catch(() => ({}));
  return data?.game?.replayGallery ?? {};
}

function formatDate(ms, locale) {
  const d = new Date(Number(ms) || 0);
  if (Number.isNaN(d.getTime()) || !ms) return '';
  const datePart = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const timePart = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${datePart} · ${timePart}`;
}

function formatPlayers(room, texts) {
  if (Array.isArray(room.players) && room.players.length) return room.players.join(', ');
  return texts.unknownPlayer ?? 'Joueur inconnu';
}

function formatMeta(room, locale, texts) {
  const parts = [];
  const tilesLabel = (texts.tilesCount ?? '{n} tuiles').replace('{n}', room.tiles ?? 0);
  parts.push(tilesLabel);
  if (Number.isFinite(room.score)) {
    parts.push((texts.scoreLabel ?? 'Score {n}').replace('{n}', room.score));
  }
  const dateLabel = formatDate(room.updatedAt, locale);
  if (dateLabel) parts.push(dateLabel);
  return parts.join(' · ');
}

function buildCardEl(room, locale, texts, onOpen) {
  const card = document.createElement('div');
  card.className = 'replay-card';
  card.dataset.code = room.code;

  const code = document.createElement('div');
  code.className = 'replay-card-code';
  code.textContent = room.code;
  card.appendChild(code);

  const body = document.createElement('div');
  body.className = 'replay-card-body';

  const players = document.createElement('div');
  players.className = 'replay-card-players';
  players.textContent = formatPlayers(room, texts);
  body.appendChild(players);

  const meta = document.createElement('div');
  meta.className = 'replay-card-meta';
  meta.textContent = formatMeta(room, locale, texts);
  body.appendChild(meta);

  card.appendChild(body);

  const badge = document.createElement('div');
  badge.className = room.finished ? 'replay-card-badge replay-card-badge--finished' : 'replay-card-badge replay-card-badge--ongoing';
  badge.textContent = room.finished ? (texts.badgeFinished ?? 'Terminée') : (texts.badgeOngoing ?? 'En cours');
  card.appendChild(badge);

  card.addEventListener('click', () => onOpen(room.code));
  return card;
}

function openReplay(code) {
  // Dans l'overlay in-game (replayGallery.js) : signale le choix au parent, qui ferme
  // la galerie et charge le replay dans la scène 3D réelle (cette page n'a pas de canvas
  // Three.js). En accès direct (hors iframe), pas d'action possible — la galerie replay
  // n'a de sens qu'intégrée au jeu (contrairement aux snapshots, pas de visionneuse
  // autonome possible ici).
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'hexistenz:openReplay', code }, window.location.origin);
  }
}

async function init() {
  const lang = getGameLang();
  const locale = LOCALES[lang] ?? 'fr-FR';
  const texts = await loadTexts();

  const titleEl = document.getElementById('galleryTitle');
  const countEl = document.getElementById('galleryCount');
  const gridEl  = document.getElementById('galleryGrid');
  const emptyEl = document.getElementById('galleryEmpty');

  if (texts.title) titleEl.textContent = texts.title;
  document.title = `Hexistenz — ${texts.title ?? 'Galerie de replays'}`;

  let rooms = [];
  try {
    const res = await fetch('./multiplayer.php?action=listall', { method: 'GET' });
    const data = await res.json();
    if (data?.ok && Array.isArray(data.rooms)) rooms = data.rooms;
  } catch (err) {
    console.error('[replaysPage] Impossible de charger la liste des parties', err);
  }

  if (!rooms.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = texts.empty ?? 'Aucune partie pour l\'instant.';
    countEl.textContent = '';
    return;
  }

  countEl.textContent = String(rooms.length);
  for (const room of rooms) {
    gridEl.appendChild(buildCardEl(room, locale, texts, openReplay));
  }
}

init();
