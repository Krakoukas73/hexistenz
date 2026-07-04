/**
 * environmentDirector.js — Squelette du directeur d'évènements environnementaux
 * (Phase 0 de la roadmap VFX : brume matinale, lucioles, pluie, orage, éclairs,
 * feu, panique animale, etc.).
 *
 * Ce module ne dessine RIEN : c'est uniquement la machine à états qui décide
 * quel évènement est actif, pendant combien de temps, et quelles exclusions/
 * dépendances s'appliquent entre eux. Les phases suivantes de la roadmap
 * brancheront les effets visuels/sonores réels sur les hooks onChange()
 * exposés ici (et, plus tard, le système de points via le même mécanisme).
 *
 * Cycle prévu dans scene.js :
 *   import { createEnvironmentDirector, updateEnvironmentDirector } from './environmentDirector.js';
 *   const environmentDirector = createEnvironmentDirector();
 *   // dans animate() :
 *   updateEnvironmentDirector(environmentDirector, timeSeconds);
 *
 * Déclenchement pour l'instant MANUEL uniquement (panneau debug, cf.
 * environmentDebugUi.js) : aucun tirage aléatoire automatique tant que les
 * effets réels ne sont pas branchés (évite de valider une machine à états
 * dans le vide).
 */

// ─── Catalogue des évènements ───────────────────────────────────────────────
// exclusiveGroup : un seul évènement actif à la fois par groupe (déclencher
//                  en stoppe un autre du même groupe).
// requires       : ne peut être déclenché que si cet autre évènement est actif ;
//                  s'arrête automatiquement en cascade si le prérequis s'arrête.
export const ENVIRONMENT_EVENTS = {
  morningMist: { label: 'Brume matinale',  category: 'ambient',  exclusiveGroup: 'weather', requires: null,    minDuration: 45, maxDuration: 90 },
  fireflies:   { label: 'Lucioles',        category: 'ambient',  exclusiveGroup: null,       requires: null,    minDuration: 60, maxDuration: 120 },
  rain:        { label: 'Pluie',           category: 'weather',  exclusiveGroup: 'weather',  requires: null,    minDuration: 30, maxDuration: 90 },
  storm:       { label: 'Orage',           category: 'weather',  exclusiveGroup: 'weather',  requires: null,    minDuration: 40, maxDuration: 100 },
  lightning:   { label: 'Éclair',          category: 'weather',  exclusiveGroup: null,       requires: 'storm', minDuration: 4,  maxDuration: 10 },
  fire:        { label: 'Feu',             category: 'hazard',   exclusiveGroup: null,       requires: null,    minDuration: 20, maxDuration: 60 },
  panic:       { label: 'Panique animale', category: 'creature', exclusiveGroup: null,       requires: 'fire',  minDuration: 8,  maxDuration: 20 }
};

export function createEnvironmentDirector() {
  return {
    active: new Map(),   // id -> { startedAt, expiresAt, label, category }
    listeners: new Set(),
    timeScale: 1.0        // multiplicateur de durée, exposé au panneau debug pour tester vite
  };
}

/** Abonnement aux changements d'état (déclenchement/arrêt). Retourne une fonction de désabonnement. */
export function onEnvironmentChange(director, listener) {
  director.listeners.add(listener);
  return () => director.listeners.delete(listener);
}

function _notify(director, eventId, kind) {
  for (const listener of director.listeners) listener(eventId, kind, director);
}

/** Déclenche un évènement. Retourne false si le prérequis (`requires`) n'est pas actif. */
export function triggerEnvironmentEvent(director, eventId, timeSeconds, { duration = null } = {}) {
  const def = ENVIRONMENT_EVENTS[eventId];
  if (!def) return false;
  if (def.requires && !director.active.has(def.requires)) return false;

  if (def.exclusiveGroup) {
    for (const [otherId, otherDef] of Object.entries(ENVIRONMENT_EVENTS)) {
      if (otherId !== eventId && otherDef.exclusiveGroup === def.exclusiveGroup) {
        stopEnvironmentEvent(director, otherId);
      }
    }
  }

  const span = duration ?? (def.minDuration + Math.random() * (def.maxDuration - def.minDuration));
  director.active.set(eventId, {
    startedAt: timeSeconds,
    expiresAt: timeSeconds + span * director.timeScale,
    label: def.label,
    category: def.category
  });
  _notify(director, eventId, 'start');
  return true;
}

/** Arrête un évènement (et en cascade tout évènement qui le `requires`). */
export function stopEnvironmentEvent(director, eventId) {
  if (!director.active.has(eventId)) return;
  director.active.delete(eventId);
  _notify(director, eventId, 'stop');

  for (const [otherId, otherDef] of Object.entries(ENVIRONMENT_EVENTS)) {
    if (otherDef.requires === eventId) stopEnvironmentEvent(director, otherId);
  }
}

export function stopAllEnvironmentEvents(director) {
  for (const id of [...director.active.keys()]) stopEnvironmentEvent(director, id);
}

export function isEnvironmentEventActive(director, eventId) {
  return director.active.has(eventId);
}

/** À appeler une fois par frame depuis animate(timeSeconds) : expire les évènements terminés. */
export function updateEnvironmentDirector(director, timeSeconds) {
  for (const [eventId, state] of director.active) {
    if (timeSeconds >= state.expiresAt) stopEnvironmentEvent(director, eventId);
  }
}

/** Snapshot lisible de l'état courant, pour le panneau debug et le futur hook de score. */
export function getEnvironmentSnapshot(director, timeSeconds) {
  return [...director.active.entries()].map(([id, state]) => ({
    id,
    label: state.label,
    category: state.category,
    remaining: Math.max(0, state.expiresAt - timeSeconds)
  }));
}

/**
 * Enveloppe de fondu 0..1 pour un évènement actif (fondu entrée + plateau + fondu
 * sortie), à consommer par les modules d'effet (brume, lucioles, etc.) pour éviter
 * les transitions brutales. Retourne 0 si l'évènement n'est pas actif.
 */
export function getEnvironmentEventFade(director, eventId, timeSeconds, { fadeIn = 6, fadeOut = 6 } = {}) {
  const state = director.active.get(eventId);
  if (!state) return 0;
  const elapsed = timeSeconds - state.startedAt;
  const remaining = state.expiresAt - timeSeconds;
  const inRamp  = fadeIn  > 0 ? Math.min(1, elapsed / fadeIn) : 1;
  const outRamp = fadeOut > 0 ? Math.min(1, remaining / fadeOut) : 1;
  return Math.max(0, Math.min(inRamp, outRamp));
}
