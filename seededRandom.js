// Générateur déterministe local utilisé uniquement au démarrage d'une partie MULTI.
// Le SOLO conserve Math.random(), donc comportement historique intact.
export function hashStringToSeed(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seedValue) {
  let state = hashStringToSeed(seedValue) || 0x9e3779b9;
  return function seededRandom() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function withSeededRandom(seedValue, callback) {
  const previousRandom = Math.random;
  Math.random = createSeededRandom(seedValue);
  try {
    return callback();
  } finally {
    Math.random = previousRandom;
  }
}
