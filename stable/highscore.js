const API_URL = 'highscore.php';
const DEFAULT_NAME = 'Joueur';

const STAT_TYPES = [
  ['grass',  '🌿', 'stats-grass-chip',  'Prairie'],
  ['field',  '🌾', 'stats-field-chip',  'Champs'],
  ['forest', '🌲', 'stats-forest-chip', 'Forêt'],
  ['house',  '🏘️', 'stats-house-chip',  'Village'],
  ['water',  '💧', 'stats-water-chip',  'Eau'],
  ['rail',   '🛤️', 'stats-rail-chip',   'Rail']
];

export function createHighscoreUI(ui) {
  const elements = {
    list: document.getElementById('highscoreList'),
    submitBox: document.getElementById('highscoreSubmit'),
    nameInput: document.getElementById('highscoreName'),
    saveButton: document.getElementById('btnSaveScore'),
    status: document.getElementById('highscoreStatus')
  };

  elements.saveButton?.addEventListener('click', () => submitCurrentScore(ui, elements));
  elements.nameInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') submitCurrentScore(ui, elements);
  });

  loadHighscores(elements);
  return elements;
}

export function askHighscoreSubmit(elements, score, gridPercent = 0, stats = null) {
  if (!elements || score <= 0) return;

  const normalizedGridPercent = normalizeGridPercent(gridPercent);
  elements.currentScore = score;
  elements.currentGridPercent = normalizedGridPercent;
  elements.currentStats = sanitizeGameStats(stats);
  elements.submitBox?.classList.remove('hidden');
  setStatus(elements, `Score final : ${score} · Grille : ${normalizedGridPercent.toFixed(1)}%`);
  elements.nameInput?.focus();
}

async function submitCurrentScore(ui, elements) {
  const score = Number(elements.currentScore ?? 0);
  const gridPercent = normalizeGridPercent(elements.currentGridPercent ?? 0);
  const stats = sanitizeGameStats(elements.currentStats);
  const name = sanitizeName(elements.nameInput?.value || DEFAULT_NAME);

  if (score <= 0) return;
  setStatus(elements, 'Enregistrement...');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, gridPercent, stats })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    elements.currentScore = 0;
    elements.currentGridPercent = 0;
    elements.currentStats = null;
    elements.submitBox?.classList.add('hidden');
    if (elements.nameInput) elements.nameInput.value = '';
    renderHighscores(elements, data.scores || []);
    setStatus(elements, 'Score enregistré.');
  } catch (error) {
    setStatus(elements, 'Erreur highscore.');
    console.error(error);
  }
}

async function loadHighscores(elements) {
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderHighscores(elements, data.scores || []);
    setStatus(elements, '');
  } catch (error) {
    renderHighscores(elements, []);
    setStatus(elements, 'Highscore indisponible.');
    console.error(error);
  }
}

function renderHighscores(elements, scores) {
  if (!elements.list) return;

  if (!scores.length) {
    elements.list.innerHTML = '<li>Aucun score</li>';
    return;
  }

  elements.list.innerHTML = scores
    .slice(0, 10)
    .map((entry, index) => {
      const gridPercent = normalizeGridPercent(entry.gridPercent ?? 0);
      const rankBadge = getRankBadge(index);
      const stats = sanitizeGameStats(entry.stats);
      const statLine = renderCompactStats(stats);
      return `
        <li>
          <div class="highscore-entry-main">
            <span class="highscore-player">${rankBadge}${escapeHtml(entry.name)}</span>
            ${statLine}
          </div>
          <strong>${Number(entry.score) || 0}<em>${gridPercent.toFixed(1)}%</em></strong>
        </li>`;
    })
    .join('');
}

function renderCompactStats(stats) {
  if (!stats) return '';

  const textureChips = STAT_TYPES
    .map(([type, emoji, className, label]) => {
      const total = safeInt(stats.totals?.[type]);
      const largest = safeInt(stats.largest?.[type]);
      if (total === 0 && largest === 0) return '';
      const tooltip = `${label} : ${total} secteur(s) au total · zone max contiguë : ${largest}`;
      return `<span class="highscore-stat-chip ${className}" title="${tooltip}">${emoji}${total}/${largest}</span>`;
    })
    .join('');

  const tiles   = safeInt(stats.tiles);
  const trains  = safeInt(stats.trainLines);
  const boats   = safeInt(stats.boatCount);
  const comets  = safeInt(stats.cometHits);
  const summaryTitle = `⬢ ${tiles} tuile(s) posée(s) · 🚂 ${trains} ligne(s) de train · ⛵ ${boats} bateau(x) · ☄️ ${comets} comète(s) interceptée(s)`;
  const summary = `<span class="highscore-stat-chip stats-summary-chip" title="${summaryTitle}">⬢${tiles} 🚂${trains} ⛵${boats} ☄️${comets}</span>`;

  return `<div class="highscore-stats-line">${summary}${textureChips}</div>`;
}

function getRankBadge(index) {
  const medal = ['🥇', '🥈', '🥉'][index];
  return medal ? `<span class="highscore-rank-medal">${medal}</span>` : '<span class="highscore-rank-medal"></span>';
}

function sanitizeGameStats(stats) {
  if (!stats || typeof stats !== 'object') return null;

  const clean = {
    tiles: safeInt(stats.tiles),
    trainLines: safeInt(stats.trainLines),
    boatCount: safeInt(stats.boatCount),
    cometHits: safeInt(stats.cometHits),
    totals: {},
    largest: {}
  };

  for (const [type] of STAT_TYPES) {
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

function normalizeGridPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number * 10) / 10));
}

function sanitizeName(value) {
  return String(value)
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .slice(0, 20) || DEFAULT_NAME;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function setStatus(elements, value) {
  if (elements.status) elements.status.textContent = value;
}
