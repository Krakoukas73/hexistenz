/**
 * vfxSettings.js — Réglages en direct (live-tunable) pour chaque effet VFX,
 * consommés par weatherVfxOverlay.js / morningMistOverlay.js et exposés dans
 * environmentDebugUi.js (sliders affichés sous chaque évènement actif).
 * Persistés en localStorage comme contentDensity.js.
 *
 * Un seul objet mutable par effet ; modifier une valeur via setVfxSetting()
 * persiste + notifie les abonnés (onVfxSettingsChange) qui réappliquent les
 * réglages sur l'overlay concerné (voir *.updateSettings()/_applySettings()).
 */

const STORAGE_KEY = 'hexistenz_vfx_settings';

const DEFAULTS = {
  groundMist: {
    densite:   0.5,  // 0..1 — couverture du voile (0=quasi rien, 0.5=moyen, 1=nappe presque pleine)
    compacite: 0.5,  // 0..1 — netteté/opacité (0=voile fin et diffus, 1=nappe dense et découpée)
    elevation: 0.15  // unités monde — hauteur moyenne de la nappe (ondule autour de cette valeur, pas plate)
  },
  fireflies: {
    densite: 0.5,  // 0..1 — nombre de lucioles
    taille:  0.14, // unités monde — taille de base d'une luciole
    vagabondage: 0.9, // amplitude de la dérive erratique
    scintillement: 0.85 // 0..1 — intensité du clignotement
  },
  rain: {
    // Pas de réglage de vitesse : dans la vraie vie, la vitesse de chute d'une goutte dépend
    // de sa taille et plafonne à une vitesse terminale — on simule directement cette vitesse
    // terminale (constante, cf. TERMINAL_FALL_SPEED dans weatherVfxOverlay.js) plutôt que
    // d'exposer un curseur qui n'aurait pas de sens physique isolé de la taille.
    densite:      0.5,   // 0..1 — densité de gouttes (max slider = pluie battante, cf. MAX_DROPS_PER_ANCHOR)
    tailleGoutte: 0.005, // taille du streak — au-delà de ~0.005 ça devient trop gros (retour user 2026-07-11)
    impactSol:    0.6    // 0..1 — intensité des taches d'impact au sol (0 = désactivé)
  },
  clouds: {
    densite:   0.10, // 0..1 — couverture (proportion de tuiles portant un nuage). Volontairement
                     //        clairsemé : quelques cumulus « cute » distincts, pas un mur continu.
    altitude:  5.0,  // unités monde — hauteur de la nappe de nuages au-dessus du sol (assez haut
                     //                pour flotter, éviter le mur à l'horizon en caméra rasante)
    epaisseur: 0.6   // taille/boursouflure d'un nuage (0.1=petit et net, 1.5=gros)
  },
  storm: {
    frequenceEclairs:  0.5, // 0..1 — nombre d'éclairs par minute (mappé sur un intervalle mini/maxi)
    luminositeEclair:  1.0, // 0..2 — intensité du flash + du halo bleuté
    intensitePluie:    1.6  // multiplicateur appliqué sur les réglages "rain" pendant l'orage
  }
};

function _load() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return _clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    const merged = _clone(DEFAULTS);
    for (const effect of Object.keys(merged)) {
      Object.assign(merged[effect], parsed[effect] ?? {});
    }
    return merged;
  } catch (_) {
    return _clone(DEFAULTS);
  }
}

function _clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const _settings = _load();
const _listeners = new Set();

// ─── Écriture localStorage debouncée (200 ms) — 2026-07-28 ───────────────────
// Divergence assumée par rapport au fichier livré par Cyril (à reporter lors d'un
// futur merge) : les sliders VFX de la rubrique 8 du panel EDA appellent
// setVfxSetting() à chaque évènement `input`, soit ~60 fois par seconde pendant un
// drag. localStorage.setItem est SYNCHRONE et re-sérialise TOUT l'objet _settings à
// chaque appel → saccades au drag. L'objet en mémoire et les listeners restent
// notifiés immédiatement (aucun retard visuel) ; seule l'écriture disque est
// différée. `pagehide` garantit qu'un réglage suivi d'une fermeture immédiate de
// l'onglet (< 200 ms) n'est pas perdu.
let _saveTimer = null;

function _flushSettings() {
  if (_saveTimer !== null) { clearTimeout(_saveTimer); _saveTimer = null; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch (_) { /* stockage indisponible */ }
}

function _scheduleSave() {
  if (_saveTimer === null) _saveTimer = setTimeout(_flushSettings, 200);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', _flushSettings);
}

export function getVfxSettings(effect) {
  return _settings[effect];
}

export function setVfxSetting(effect, key, value) {
  if (!_settings[effect] || !(key in _settings[effect])) return;
  _settings[effect][key] = value;
  _scheduleSave();
  for (const listener of _listeners) listener(effect, key, value);
}

export function resetVfxSettings(effect) {
  Object.assign(_settings[effect], DEFAULTS[effect]);
  _scheduleSave();
  for (const listener of _listeners) listener(effect, null, null);
}

/** Abonnement aux changements. Retourne une fonction de désabonnement. */
export function onVfxSettingsChange(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

// ─── État du switch par item (rubrique 2 EDA) ───────────────────────────────
// Pour les effets à évènement (brume/lucioles/pluie/orage...) ce switch EST le
// déclencheur (cf. hud_eda.js) — environmentDirector reste la source de vérité de
// l'état "actif" et n'est JAMAIS persisté (Map en mémoire, toujours vide au
// chargement) : ces switches-là repartent donc déjà à off à coup sûr. Pour 'clouds'
// (pas d'évènement propre) ce flag EST en plus le on/off réel du rendu (cf.
// rainCloudOverlay.js).
//
// PAS de persistance localStorage pour ce flag (retiré le 2026-07-09, après une
// clé 'hexistenz_vfx_expanded' puis 'hexistenz_vfx_expanded_v2' qui laissaient
// toutes les deux 'clouds' coincé sur `true` d'une session à l'autre — le switch
// "Nuages de pluie" apparaissait coché au chargement sans nuages affichés, cf.
// retour utilisateur répété). En mémoire seulement → false à chaque rechargement
// de page, sans exception possible.
const _expanded = {};

export function isVfxGroupExpanded(effect) {
  return !!_expanded[effect];
}

export function setVfxGroupExpanded(effect, value) {
  _expanded[effect] = !!value;
}

export { DEFAULTS as VFX_SETTINGS_DEFAULTS };
