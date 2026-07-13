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
const _refreshCallbacks = [];
const _jsonCache = {}; // { fr: {...}, en: {...} } — évite de re-fetcher au aller-retour

export function getGameLang() {
  try {
    return localStorage.getItem('hexistenz_pres_lang') === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

async function _loadLangJson(lang) {
  if (_jsonCache[lang]) return _jsonCache[lang];
  const file = lang === 'en' ? 'english' : 'french';
  const data = await fetch(`./json/languages/${file}.json`)
    .then(r => r.json())
    .catch(err => {
      console.error(`[gameLangReactive] Impossible de charger ${file}.json`, err);
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
  if (getGameLang() === lang) return;
  try { localStorage.setItem('hexistenz_pres_lang', lang); } catch {}
  document.documentElement.dataset.lang = lang;
  const data = await _loadLangJson(lang);
  for (const cb of _refreshCallbacks) {
    try { cb(data); } catch (e) { console.error('[gameLangReactive] callback de rafraîchissement en erreur', e); }
  }
}
