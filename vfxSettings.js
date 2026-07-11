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
    densite:    0.5, // 0..1 — nombre de gouttes
    vitesse:    10,  // vitesse de chute (unités monde/s)
    tailleGoutte: 0.045 // largeur du streak
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

export function getVfxSettings(effect) {
  return _settings[effect];
}

/** Snapshot complet (groundMist + fireflies + rain) — utilisé par le bouton "📋 Copier"
 * de l'EDA pour inclure les réglages fins météo dans l'export JSON d'une ambiance. */
export function getAllVfxSettings() {
  return _clone(_settings);
}

/** Applique un snapshot complet (voir getAllVfxSettings) — utilisé pour appliquer un
 * preset d'ambiance qui embarque ses propres réglages fins météo. */
export function setAllVfxSettings(snapshot) {
  if (!snapshot) return;
  for (const effect of Object.keys(_settings)) {
    if (snapshot[effect]) Object.assign(_settings[effect], snapshot[effect]);
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch (_) { /* stockage indisponible */ }
  for (const listener of _listeners) listener(null, null, null);
}

export function setVfxSetting(effect, key, value) {
  if (!_settings[effect] || !(key in _settings[effect])) return;
  _settings[effect][key] = value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch (_) { /* stockage indisponible */ }
  for (const listener of _listeners) listener(effect, key, value);
}

export function resetVfxSettings(effect) {
  Object.assign(_settings[effect], DEFAULTS[effect]);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch (_) {}
  for (const listener of _listeners) listener(effect, null, null);
}

/** Abonnement aux changements. Retourne une fonction de désabonnement. */
export function onVfxSettingsChange(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export { DEFAULTS as VFX_SETTINGS_DEFAULTS };
