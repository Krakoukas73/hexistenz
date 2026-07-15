// ─── gameHudI18n.js — traduction réactive du HUD statique de game.php ──────
// Ajouté le 2026-07-14 dans le cadre de la refonte i18n scalable (cf. CONTEXT.md
// §21, en parallèle de la refonte de la prez index.php) : jusqu'ici le HUD (score,
// stats, aide) était rendu côté PHP en dual-render data-fr/data-en + bascule CSS
// [data-lang], exactement comme l'ancienne prez — donc bloqué à FR/EN et jamais
// mis à jour pour une 3e langue (ES). Remplacé par UN SEUL attribut
// data-i18n="chemin.pointé" par élément (repli FR affiché par PHP par défaut), et
// ce petit moteur qui réutilise le mécanisme réactif déjà en place pour les textes
// JS (tooltips, missions, HUD FPS...) : gameLangReactive.js.
//
// Étendu le 2026-07-14 (même jour, suite au signalement utilisateur) pour couvrir
// aussi le panneau EDA (édition LUT/Cinématique/Environnement, edaPanelWiring.js) :
// ce panneau était construit à 100% en français en dur, jamais branché au système
// de langue. `data-i18n-title` ajouté en plus de `data-i18n` pour les tooltips
// (attribut title, pas juste le texte visible). `applyCurrentLang()` exporté pour
// que edaPanelWiring.js puisse forcer une traduction immédiate juste après avoir
// construit son DOM dynamique (sliders EAU/VENT/NUAGES/VFX créés à l'exécution,
// après le premier passage de ce moteur si la langue sauvegardée n'est pas FR).
import { getGameLang, registerLangRefresh, getLangFile } from './gameLangReactive.js';

function resolve(data, path) {
  return path.split('.').reduce((node, key) => (node && typeof node === 'object') ? node[key] : undefined, data);
}

function applyGameI18n(data) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const value = resolve(data, el.getAttribute('data-i18n'));
    if (value != null) el.innerHTML = value;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const value = resolve(data, el.getAttribute('data-i18n-title'));
    if (value != null) el.title = value;
  });
}

// S'enregistre auprès de gameLangReactive.js : appelé à chaque setGameLang() en jeu.
registerLangRefresh(applyGameI18n);

function _loadCurrentLangData() {
  const lang = getGameLang();
  return fetch(`./json/languages/${getLangFile(lang)}.json`).then(r => r.json());
}

// Le HTML servi par PHP est toujours en FR (repli par défaut, pas de flash-free
// multi-langue possible côté serveur ici). Si la langue sauvegardée n'est pas FR,
// on applique la traduction dès que possible après le premier paint.
const _initialLang = getGameLang();
if (_initialLang !== 'fr') {
  _loadCurrentLangData()
    .then(applyGameI18n)
    .catch(err => console.error('[gameHudI18n] Impossible de charger la langue initiale', err));
}

// Exporté pour les modules qui construisent du DOM [data-i18n] APRÈS ce premier
// passage (ex. edaPanelWiring.js::wireEdaPanel, dont les sliders EAU/VENT/NUAGES/
// VFX sont assemblés à l'exécution) : rejouer la traduction pour la langue courante
// une fois ce DOM en place, sans attendre un futur changement de langue.
export function applyCurrentLang() {
  if (getGameLang() === 'fr') return; // le repli PHP/HTML est déjà en FR
  _loadCurrentLangData()
    .then(applyGameI18n)
    .catch(err => console.error('[gameHudI18n] Impossible de réappliquer la langue courante', err));
}
