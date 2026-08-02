// Passage bilingue FR/EN le 2026-07-12 : les 4 messages de statut + le nom par
// défaut viennent de json/languages/{french,english}.json (clé game.highscore),
// même mécanisme que helpTexts.js (top-level await + localStorage
// 'hexistenz_pres_lang'). Repli FR en dur à chaque site d'appel : ce sont des
// messages affichés pendant l'enregistrement du score (chemin critique), on
// évite un texte vide si le fetch échoue.
import { registerLangRefresh, getLangFile, getLangVersion } from './gameLangReactive.js';

const _langFile = getLangFile();

// `const` volontairement conservé, objet muté en place au changement de langue
// en jeu (cf. gameLangReactive.js / CONTEXT.md §21) : ces messages sont lus à
// chaque appel (setStatus), donc la mutation en place suffit à les rafraîchir.
const _hsText = await fetch(`./json/languages/${_langFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.highscore ?? {})
  .catch(err => {
    console.error(`[highscore] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

registerLangRefresh((data) => {
  const fresh = data?.game?.highscore ?? {};
  for (const k of Object.keys(_hsText)) delete _hsText[k];
  Object.assign(_hsText, fresh);
});

const API_URL = 'highscore.php';
const DEFAULT_NAME = _hsText.defaultName ?? 'Joueur';
// Persistance du pseudo (2026-07-11) : le pseudo est désormais demandé une seule fois,
// dans les menus de sélection avant partie (startupMenu.js, ex-multiplayerUi.js) — jamais reredemandé ici.
// Clé dédiée au classement, avec repli sur le pseudo multijoueur existant.
const NAME_STORAGE_KEY = 'hexistenz.playerName';

// Délai avant retour à l'écran de sélection après un enregistrement réussi
// (laisse le temps de lire "Score enregistré !").
const RETURN_TO_MENU_DELAY_MS = 700;

// Types de biomes suivis dans les stats de fin de partie (POST vers highscore.php).
// Le classement lui-même (lecture/affichage) vit uniquement dans la prez (index.php,
// rubrique Classement) — ce module ne fait plus JAMAIS de rendu de liste en jeu (2026-07-11).
const STAT_TYPES = ['grass', 'field', 'forest', 'house', 'water', 'rail'];

function loadStoredName() {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY)
      || localStorage.getItem('dorfromantik.multiplayer.name')
      || '';
  } catch {
    return '';
  }
}

function storeName(name) {
  try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch {}
}

export function createHighscoreUI(ui) {
  const elements = {
    modal: document.getElementById('highscoreModal'),
    scoreValue: document.getElementById('highscoreModalScoreValue'),
    saveButton: document.getElementById('btnSaveScore'),
    status: document.getElementById('highscoreStatus')
  };

  elements.saveButton?.addEventListener('click', () => submitCurrentScore(ui, elements));

  return elements;
}

// playerName : pseudo déjà connu (menu de sélection avant partie / multijoueur) —
// plus de champ pseudo dans ce modal, cf. feedback utilisateur 2026-07-11.
export function askHighscoreSubmit(elements, score, stats = null, playerName = '') {
  if (!elements || score <= 0) return;

  elements.currentScore = score;
  elements.currentStats = sanitizeGameStats(stats);
  elements.currentName = sanitizeName(playerName || loadStoredName() || DEFAULT_NAME);
  if (elements.scoreValue) elements.scoreValue.textContent = String(score);
  setStatus(elements, '');
  if (elements.saveButton) elements.saveButton.disabled = false;
  elements.modal?.classList.remove('hidden');
  elements.saveButton?.focus();
}

async function submitCurrentScore(ui, elements) {
  const score = Number(elements.currentScore ?? 0);
  const stats = sanitizeGameStats(elements.currentStats);
  const name = sanitizeName(elements.currentName || DEFAULT_NAME);

  if (score <= 0) return;
  setStatus(elements, _hsText.saving ?? 'Enregistrement...');
  if (elements.saveButton) elements.saveButton.disabled = true;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, stats })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.json();

    storeName(name); // mémorisé pour la prochaine partie — ne plus redemander

    setStatus(elements, _hsText.saved ?? 'Score enregistré ! Retour au menu...');

    // La partie est close : retour à l'écran de sélection de nouvelle partie.
    // window.location.pathname (sans query ?multi=) évite de laisser traîner le code
    // de la room terminée — de toute façon désormais refusée par le serveur (cf. §multiplayer.php).
    setTimeout(() => {
      window.location.href = window.location.pathname;
    }, RETURN_TO_MENU_DELAY_MS);
  } catch (error) {
    setStatus(elements, _hsText.error ?? 'Erreur highscore.');
    if (elements.saveButton) elements.saveButton.disabled = false;
    console.error(error);
  }
}

function sanitizeGameStats(stats) {
  if (!stats || typeof stats !== 'object') return null;

  const clean = {
    tiles: safeInt(stats.tiles),
    trainLines: safeInt(stats.trainLines),
    boatCount: safeInt(stats.boatCount),
    millCount: safeInt(stats.millCount),
    cometHits: safeInt(stats.cometHits),
    totals: {},
    largest: {}
  };

  for (const type of STAT_TYPES) {
    clean.totals[type] = safeInt(stats.totals?.[type]);
    clean.largest[type] = safeInt(stats.largest?.[type]);
  }

  return clean;
}

function safeInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(999999, Math.floor(number)));
}

function sanitizeName(value) {
  return String(value)
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .slice(0, 20) || DEFAULT_NAME;
}

function setStatus(elements, value) {
  if (elements.status) elements.status.textContent = value;
}
