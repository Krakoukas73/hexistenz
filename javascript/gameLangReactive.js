// ─── gameLangReactive.js — orchestrateur central du changement de langue en jeu ───
// Ajouté le 2026-07-13 : les textes JS bilingues (tooltips LUT, HUD clavier, titres
// de mission, highscore, placement, multijoueur, FPS) étaient chargés UNE SEULE FOIS
// au démarrage de chaque module (top-level await), contrairement aux data-fr/data-en
// de game.php qui basculent instantanément via CSS. Résultat signalé par l'utilisateur :
// changer de langue en cours de partie ne traduisait qu'une partie des textes.
//
// Principe : chaque module bilingue s'enregistre ici avec un callback qui reçoit le
// JSON complet de la nouvelle langue et réassigne (ou re-render) ses propres textes.
// setGameLang() est le SEUL point d'entrée qui doit être appelé par le sélecteur du
// HUD in-game (edaPanelHost.js) : il écrit localStorage + dataset.lang, PUIS notifie
// tous les callbacks, donc la mise à jour est toujours synchrone et complète.
//
// Ajouté le 2026-07-15 : confirmation visuelle du changement de langue via le popup
// central "scorePopup" (même mécanisme que les "+N" de score et "Capture faite !") —
// affiche le nom de la langue nouvellement sélectionnée, DANS cette langue (clé
// game.langName du JSON qu'on vient de charger, présente dans les 6 langues).
import { showCenterMessage } from './scorePopup.js';

const _refreshCallbacks = [];
const _jsonCache = {}; // { fr: {...}, en: {...}, es: {...} } — évite de re-fetcher au aller-retour

// Ajouté le 2026-07-14 : passage à N langues (ES) — auparavant getGameLang()/_loadLangJson
// utilisaient un ternaire binaire (`=== 'en' ? 'en' : 'fr'`) qui aurait silencieusement
// réduit toute 3e langue à 'fr'. Centralisé ici : LANG_FILES est la SEULE source de vérité
// pour la liste des langues supportées et leur fichier JSON associé. Ajouter une langue =
// une ligne ici (+ une <option> dans le <select> du HUD), rien d'autre à toucher.
export const LANG_FILES = { fr: 'french', en: 'english', es: 'spanish', it: 'italian', pt: 'portuguese', 'fr-CA': 'fr-CA', de: 'german', ru: 'russian', 'fr-MED': 'french-medieval', nl: 'dutch', pl: 'polish', tr: 'turkish' };

export function getGameLang() {
  try {
    const stored = localStorage.getItem('hexistenz_pres_lang');
    // 2026-07-31 — langue par défaut au tout premier lancement (aucune valeur en
    // localStorage) : "fr-CA" (français canadien) sur demande explicite, à la
    // place du français standard utilisé jusqu'ici. N'affecte que les visiteurs
    // sans préférence déjà enregistrée ; quiconque a déjà choisi une langue garde
    // ce choix (lu depuis localStorage ci-dessus, jamais écrasé).
    return Object.prototype.hasOwnProperty.call(LANG_FILES, stored) ? stored : 'fr-CA';
  } catch {
    return 'fr-CA';
  }
}

/** Résout le nom de fichier JSON pour une langue donnée (par défaut la langue courante). */
export function getLangFile(lang = getGameLang()) {
  return LANG_FILES[lang] ?? LANG_FILES.fr;
}

// 2026-07-29 — cache-busting (même bug/fix que le CSS, cf. CONTEXT.md §26) : tous
// les fetch() de json/languages/*.json à travers le code (une vingtaine d'appels,
// un par module bilingue) n'avaient aucun ?v=, donc le navigateur pouvait continuer
// à servir une traduction périmée indéfiniment après modification sur disque — cause
// confirmée d'un retour utilisateur "toujours pareil" sur le texte TTS fr-CA. La
// version est calculée côté PHP (mtime le plus récent parmi tous les fichiers de
// langue, cf. game.php/snapshots.php/replays.php) et exposée via
// window.HEXISTENZ_LANG_VERSION — un seul point de lecture ici, réutilisé par TOUS
// les appelants (getLangUrl), plutôt que de dupliquer la query string partout.
export function getLangVersion() {
  return (typeof window !== 'undefined' && window.HEXISTENZ_LANG_VERSION) || '';
}

/** URL complète (avec cache-busting) du fichier JSON d'une langue. */
export function getLangUrl(lang = getGameLang()) {
  return `./json/languages/${getLangFile(lang)}.json?v=${getLangVersion()}`;
}

async function _loadLangJson(lang) {
  if (_jsonCache[lang]) return _jsonCache[lang];
  const data = await fetch(getLangUrl(lang))
    .then(r => r.json())
    .catch(err => {
      console.error(`[gameLangReactive] Impossible de charger ${getLangFile(lang)}.json`, err);
      return {};
    });
  _jsonCache[lang] = data;
  return data;
}

/** Un module bilingue s'enregistre avec un callback (data) => void, appelé à chaque changement de langue. */
export function registerLangRefresh(cb) {
  _refreshCallbacks.push(cb);
}

/** Point d'entrée unique pour basculer la langue en jeu (appelé par le sélecteur du HUD). */
export async function setGameLang(lang) {
  if (!Object.prototype.hasOwnProperty.call(LANG_FILES, lang)) lang = 'fr-CA';
  if (getGameLang() === lang) return;
  try { localStorage.setItem('hexistenz_pres_lang', lang); } catch {}
  document.documentElement.dataset.lang = lang;
  const data = await _loadLangJson(lang);
  for (const cb of _refreshCallbacks) {
    try { cb(data); } catch (e) { console.error('[gameLangReactive] callback de rafraîchissement en erreur', e); }
  }
  showCenterMessage(data?.game?.langName ?? lang);
}
