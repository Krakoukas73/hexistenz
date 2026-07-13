// ─── musicPlayer.js — musique HTML Audio (intro/ingame/ending/chi-mai) ──────
// Extrait de soundDesign.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// lecteur musique (fondus, playlist ingame, duck bateau, mode chi-mai), couplage à
// sens unique seulement avec ambientSoundDesign.js (celui-ci appelle setMusicDuck/
// setChiMaiMode d'ici, jamais l'inverse). soundDesign.js reste un ré-export faîtier.

const INTRO_POOL = [
  './sounds/music-intro-1.ogg',
  './sounds/music-intro-2.ogg',
  './sounds/music-intro-3.ogg',
  './sounds/music-intro-4.ogg',
  './sounds/music-intro-5.ogg',
  './sounds/music-intro-6.ogg',
];
function pickIntro() {
  return INTRO_POOL[Math.floor(Math.random() * INTRO_POOL.length)];
}

const INGAME_POOL = {
  urls:    ['./sounds/music-ingame-1.ogg', './sounds/music-ingame-2.ogg'],
  weights: [0.50, 0.50],
};

function pickIngameTrack() {
  const { urls, weights } = INGAME_POOL;
  return urls[weightedRandom(weights)];
}

const MUSIC_TRACKS = {
  intro:   pickIntro(),
  ingame:  pickIngameTrack(),
  ending:  './sounds/music-ending.ogg',
  chiMai:  './sounds/chi-mai.ogg',
};

const MUSIC_MAX_VOLUME = 0.070;
const MUSIC_TRACK_VOLUMES = {
  chiMai: MUSIC_MAX_VOLUME * 1.60 * 1.80 * 1.80,  // 0.36288 (+60 % puis +80 % puis +80 %)
};
// Layers dont le volume est réduit de 55 % quand chi-mai est actif
const CHI_MAI_DUCK_LAYERS = new Set(['train', 'beach', 'crows']);
const MUSIC_FADE_SPEED = 0.42;
const musicState = {
  tracks: new Map(),
  targetKey: null,
  unlocked: false,
  unlockInstalled: false,
  lastFrameSeconds: 0,
  frameRequested: false,
  duckFactor: 1.0,      // 1.0 = plein volume, 0.0 = silence (duck bateau)
  _preChiMaiKey: null,  // piste mémorisée avant activation chi-mai
};

export function startMenuMusic() {
  setMusicTrack('intro');
}

export function startIngameMusic() {
  setMusicTrack('ingame');
}

export function startEndingMusic() {
  setMusicTrack('ending');
}

function setMusicTrack(key) {
  ensureMusicTracks();
  installMusicUnlock();
  musicState.targetKey = key;

  if (musicState.unlocked) startMusicTracks();
  requestMusicFadeFrame();
}

function advanceIngamePool() {
  const audio = musicState.tracks.get('ingame');
  if (!audio) return;
  audio.src = pickIngameTrack();
  audio.load();
  if (musicState.targetKey === 'ingame' && musicState.unlocked) {
    audio.play().catch(() => {});
  }
  requestMusicFadeFrame();
}

function ensureMusicTracks() {
  if (musicState.tracks.size) return;

  for (const [key, url] of Object.entries(MUSIC_TRACKS)) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = 0;
    audio.dataset.currentVolume = '0';
    audio.dataset.targetVolume = '0';

    if (key === 'ingame') {
      audio.loop = false;
      audio.addEventListener('ended', advanceIngamePool);
    } else {
      audio.loop = true;
    }

    musicState.tracks.set(key, audio);
  }
}

function installMusicUnlock() {
  if (musicState.unlockInstalled) return;
  musicState.unlockInstalled = true;

  const unlock = () => {
    musicState.unlocked = true;
    startMusicTracks();
    requestMusicFadeFrame();
  };

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}

function startMusicTracks() {
  for (const audio of musicState.tracks.values()) {
    if (!audio.paused) continue;
    audio.play().catch(() => {
      // Les navigateurs peuvent refuser tant qu'aucune interaction réelle n'a eu lieu.
      // On garde la cible en mémoire : le prochain pointerdown/keydown relancera proprement.
    });
  }
}

function requestMusicFadeFrame() {
  if (musicState.frameRequested) return;
  musicState.frameRequested = true;
  requestAnimationFrame(updateMusicFades);
}

function updateMusicFades(nowMs) {
  musicState.frameRequested = false;
  const nowSeconds = nowMs * 0.001;
  const deltaSeconds = Math.min(0.08, Math.max(0.001, nowSeconds - (musicState.lastFrameSeconds || nowSeconds)));
  musicState.lastFrameSeconds = nowSeconds;

  let stillFading = false;

  for (const [key, audio] of musicState.tracks.entries()) {
    const _trackMaxVol = MUSIC_TRACK_VOLUMES[key] ?? MUSIC_MAX_VOLUME;
    const targetVolume = key === musicState.targetKey ? _trackMaxVol * musicState.duckFactor : 0;
    const currentVolume = Number(audio.dataset.currentVolume ?? audio.volume ?? 0);
    const step = MUSIC_FADE_SPEED * deltaSeconds;
    const nextVolume = moveTowards(currentVolume, targetVolume, step);

    audio.dataset.currentVolume = String(nextVolume);
    audio.volume = Math.max(0, Math.min(1, nextVolume));

    if (Math.abs(nextVolume - targetVolume) > 0.002) stillFading = true;
    if (musicState.unlocked && key === musicState.targetKey && audio.paused) audio.play().catch(() => {});
    if (key !== musicState.targetKey && nextVolume <= 0.002 && !audio.paused) audio.pause();
  }

  if (stillFading) requestMusicFadeFrame();
}

function moveTowards(current, target, step) {
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return target;
}

/**
 * Atténue la musique principale proportionnellement à la proximité du bateau.
 * factor 1.0 = volume normal · 0.0 = silence complet.
 */
export function setMusicDuck(factor) {
  musicState.duckFactor = Math.max(0, Math.min(1, factor));
  requestMusicFadeFrame();
}

/**
 * Active / désactive le mode chi-mai (caméra basse dans les champs).
 * Quand actif : bascule sur chi-mai.ogg, coupe music-ingame et pirate.ogg.
 * Quand inactif : restaure la piste précédente.
 */
export function setChiMaiMode(active) {
  if (active) {
    if (musicState.targetKey === 'chiMai') return;
    musicState._preChiMaiKey = musicState.targetKey; // mémoriser ingame/intro/ending
    setMusicTrack('chiMai');
  } else {
    if (musicState.targetKey !== 'chiMai') return;
    setMusicTrack(musicState._preChiMaiKey ?? 'ingame');
    musicState._preChiMaiKey = null;
  }
}

/**
 * Sélection aléatoire pondérée dans un pool de buffers.
 * weights : tableau de poids (même longueur que buffers).
 * Exportée : réutilisée par ambientSoundDesign.js (playAlternatingLayer).
 */
export function weightedRandom(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ─── Mute global ─────────────────────────────────────────────────────────────

let _globalMuted = false;

/**
 * Active ou désactive tous les sons (musique + ambiance).
 * Retourne le nouvel état muet (true = muet).
 */
export function toggleMute(ambientSoundDesign) {
  _globalMuted = !_globalMuted;

  // Musique HTML Audio
  for (const audio of musicState.tracks.values()) {
    audio.muted = _globalMuted;
  }

  // Ambiance THREE.Audio
  ambientSoundDesign?.setMuted(_globalMuted);

  return _globalMuted;
}
