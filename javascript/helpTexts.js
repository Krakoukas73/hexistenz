// ─── helpTexts.js — dictionnaire LUT_HELP (textes d'aide contextuelle) ──────
// Extrait de help.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// pur dictionnaire de textes, aucune logique. La partie tooltip DOM générique
// (ensureHelpTooltip, attachHelpTooltip, etc.) est dans helpTooltip.js.
// help.js reste un ré-export faîtier pour ne rien casser chez les 5 importateurs.
//
// Passage bilingue FR/EN le 2026-07-12 : les ~150 textes ne sont plus
// hardcodés ici mais chargés depuis json/languages/{french,english}.json
// (clé "game.help", flat — les clés internes contiennent déjà des points,
// ex. 'renderer.toneMappingExposure', donc pas de dot-path imbriqué comme
// dans index.php/tr()). La langue suit le même choix que la prez, mémorisé
// dans localStorage sous 'hexistenz_pres_lang' (cf. index.php/setLang).
//
// Chargement via top-level await, précédent déjà en place dans
// edaPanelWiring.js (fetch de ambiances.json) : le graphe de modules ES
// attend la résolution avant que les importateurs n'exécutent leur propre
// code, donc LUT_HELP est garanti pleinement peuplé pour ui.js,
// startupMenu.js, multiplayerRooms.js, edaPanelWiring.js et hud_fps.js.

import { registerLangRefresh, getLangFile, getLangVersion } from './gameLangReactive.js';

const _langFile = getLangFile();

// ─── Aide contextuelle des sliders et couleurs du panneau LUT ───────────────
// `const` volontairement conservé : l'objet est MUTÉ EN PLACE (jamais réassigné)
// par le callback ci-dessous quand la langue change en jeu (cf. gameLangReactive.js).
// Garder la même référence d'objet pour toujours est important : certains appelants
// (delegateHelpTooltip(el, attr, LUT_HELP)) capturent cette référence une seule fois
// à l'attache — si on réassignait LUT_HELP à un nouvel objet, ces références
// deviendraient périmées. La mutation en place les garde à jour automatiquement.
export const LUT_HELP = await fetch(`./json/languages/${_langFile}.json?v=${getLangVersion()}`)
  .then(r => r.json())
  .then(data => data?.game?.help ?? {})
  .catch(err => {
    console.error(`[helpTexts] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

registerLangRefresh((data) => {
  const fresh = data?.game?.help ?? {};
  for (const k of Object.keys(LUT_HELP)) delete LUT_HELP[k];
  Object.assign(LUT_HELP, fresh);
});
