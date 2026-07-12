// ─── missionLabels.js — icônes/aide/formatage textuel des missions ─────────
// Extrait de missions.js le 2026-07-11 (round 3, découpage sans risque, cf.
// CONTEXT.md §21) : présentation (icônes, textes d'aide, titres formatés),
// séparée du cycle de vie du manager de missions. Importe MISSION_TYPE_LABEL
// depuis missions.js (source canonique) — dépendance à sens unique, aucun
// cycle (missions.js n'importe rien d'ici).
// Importateurs externes : ui.js (MISSION_TYPE_ICON, MISSION_HELP), scene.js
// (formatMissionTitle) — mis à jour pour pointer ici au lieu de missions.js.
//
// Passage bilingue FR/EN le 2026-07-12 : un seul fetch top-level du JSON de
// langue courant (même mécanisme que LUT_HELP dans helpTexts.js — localStorage
// 'hexistenz_pres_lang'), dont on dérive :
//   - MISSION_HELP (game.missionHelp)      — dictionnaire plat, inchangé (1/2)
//   - MISSION_TITLES (game.missionTitles)  — templates {one, other} par type,
//     remplace MISSION_TITLE_BUILDERS (2/2). Les mots FR à pluriel irrégulier
//     (bateau→bateaux) ou toujours-pluriel (arbres/maisons/rails/cases) sont
//     gérés en stockant les 2 formes déjà rédigées dans le JSON plutôt qu'une
//     règle de suffixe générique — robuste à n'importe quelle langue/mot.
import { EDGE_TYPES } from './config.js';
import { MISSION_TYPE_LABEL } from './missions.js';

function getGameLang() {
  try {
    return localStorage.getItem('hexistenz_pres_lang') === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

const _langFile = getGameLang() === 'en' ? 'english' : 'french';

const _langData = await fetch(`./json/languages/${_langFile}.json`)
  .then(r => r.json())
  .catch(err => {
    console.error(`[missionLabels] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

export const MISSION_TYPE_ICON = {
  [EDGE_TYPES.forest]: '🌲',
  [EDGE_TYPES.house]:  '🛖',
  [EDGE_TYPES.rail]:   '🛤️',
  [EDGE_TYPES.water]:  '💧',
  [EDGE_TYPES.grass]:  '🌿',
  [EDGE_TYPES.field]:  '🌾',
  train:               '🚂',
  boat:                '⛵',
  mill:                '⚙️',
};

export const MISSION_HELP = _langData?.game?.missionHelp ?? {};

// Conservée mais non appelée (remplacée par formatMissionTitle) — documenté ainsi
// dans CONTEXT.md avant ce découpage, laissée intacte par prudence (pas dans le
// périmètre de suppression de code mort validé ce round).
export function formatMissionLabel(mission, progressByType = new Map()) {
  const progress = Math.min(progressByType.get(mission.type) ?? 0, mission.target);
  const unit = mission.unit ? ` ${mission.unit}` : '';
  const label = MISSION_TYPE_LABEL[mission.type] ?? mission.label;
  return `${label} : ${progress}/${mission.target}${unit}`;
}

// Phrase courte affichée au-dessus de la barre de progression dans le HUD (2026-07-11) —
// une par type de mission, au format "Verbe + objectif chiffré" (ex: "Construire un
// village de 17 maisons"), demande explicite utilisateur. Bilingue depuis le
// 2026-07-12 (2/2) via templates {one, other} + substitution {target}.
const MISSION_TITLES = _langData?.game?.missionTitles ?? {};

export function formatMissionTitle(mission) {
  const entry = MISSION_TITLES[mission.type];
  const tpl = entry && (mission.target === 1 ? (entry.one ?? entry.other) : (entry.other ?? entry.one));
  if (tpl) return tpl.replace('{target}', mission.target);
  return `${MISSION_TYPE_LABEL[mission.type] ?? mission.label} : ${mission.target}`;
}
