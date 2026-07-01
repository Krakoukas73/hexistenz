import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE } from './config.js';
import { axialToWorld } from './hex.js';
import { getEdgeType } from './tileGenerator.js';

const AUDIO_LAYERS = {
  crows: {
    urls: [
      './sounds/corbeaux-1.ogg',
      './sounds/corbeaux-2.ogg'
    ],
    maxVolume: 0.176,
    audibleRadius: HEX_SIZE * 7.82,   // −15 % (était 9.2)
    fullVolumeRadius: HEX_SIZE * 1.25,
    fadeSpeed: 0.92
  },
  birds: {
    // Pool partagé forêt + prairie (grass). foret.ogg renommé en birds-1.ogg.
    urls: [
      './sounds/birds-1.ogg',
      './sounds/birds-2.ogg',
      './sounds/birds-3.ogg',
      './sounds/birds-4.ogg',
      './sounds/birds-5.ogg',
      './sounds/birds-6.ogg'
    ],
    maxVolume: 0.3556,
    audibleRadius: HEX_SIZE * 8.0,
    fullVolumeRadius: HEX_SIZE * 1.35,
    fadeSpeed: 0.90
  },
  village: {
    url: './sounds/village.ogg',
    maxVolume: 0.3543,
    audibleRadius: HEX_SIZE * 8.0,
    fullVolumeRadius: HEX_SIZE * 1.25,
    fadeSpeed: 0.88
  },
  beach: {
    urls: [
      './sounds/plage-1.ogg',
      './sounds/plage-2.ogg',
      './sounds/plage-3.ogg'
    ],
    weights: [0.25, 0.25, 0.50],  // plage-3 favorisée à 50 %
    maxVolume: 0.1283,
    audibleRadius: HEX_SIZE * 5.78,   // −15 % (était 6.8)
    fullVolumeRadius: HEX_SIZE * 1.15,
    fadeSpeed: 0.88
  },
  train: {
    urls: [
      './sounds/train-1.ogg',
      './sounds/train-2.ogg',
      './sounds/train-3.ogg'
    ],
    maxVolume: 0.1584,
    audibleRadius: HEX_SIZE * 5.527,  // −10 % (était 6.141)
    fullVolumeRadius: HEX_SIZE * 1.25,
    fadeSpeed: 0.75
  },
  boat: {
    url: './sounds/pirate.ogg',
    maxVolume: 0.22,
    audibleRadius: HEX_SIZE * 3.825,  // −10 % (était 4.25)
    fullVolumeRadius: HEX_SIZE * 0.78,
    fadeSpeed: 0.60
  },
};

const PROXIMITY_REFRESH_SECONDS = 0.22;
const MASTER_VOLUME = 0.85;

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
 */
function weightedRandom(weights) {
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

export function isGlobalMuted() {
  return _globalMuted;
}

export function createAmbientSoundDesign({ camera, canvas, placedTiles, fieldWaterEffectsOverlay, railTrainOverlay, waterBoatOverlay, houseOverlay }) {
  return new AmbientSoundDesign({ camera, canvas, placedTiles, fieldWaterEffectsOverlay, railTrainOverlay, waterBoatOverlay, houseOverlay });
}

class AmbientSoundDesign {
  constructor({ camera, canvas, placedTiles, fieldWaterEffectsOverlay, railTrainOverlay, waterBoatOverlay, houseOverlay }) {
    this.camera = camera;
    this.canvas = canvas;
    this.placedTiles = placedTiles;
    this.fieldWaterEffectsOverlay = fieldWaterEffectsOverlay;
    this.railTrainOverlay = railTrainOverlay;
    this.waterBoatOverlay = waterBoatOverlay;
    this.houseOverlay = houseOverlay;
    this.listener = new THREE.AudioListener();
    this.layers = new Map();
    this.tmpWorldPosition = new THREE.Vector3();
    this.tmpSourcePosition = new THREE.Vector3();
    this.tmpCameraWorldPosition = new THREE.Vector3();
    this.lastTimeSeconds = 0;
    this.lastProximityRefresh = -Infinity;
    this.proximity = { crows: 0, birds: 0, village: 0, beach: 0, train: 0, boat: 0 };
    this._chiMaiActive = false;
    this.unlocked = false;
    this.started = false;
    this.muted = false;

    this.camera.add(this.listener);
    this.createLayers();
    this.installAudioUnlock(canvas);
  }

  createLayers() {
    const loader = new THREE.AudioLoader();

    for (const [key, def] of Object.entries(AUDIO_LAYERS)) {
      const sound = new THREE.Audio(this.listener);
      sound.setLoop(!def.urls?.length);
      sound.setVolume(0);
      sound.userData.currentVolume = 0;
      sound.userData.targetVolume = 0;
      const layer = { def, sound, loaded: false, buffers: [], currentBufferIndex: 0 };
      this.layers.set(key, layer);

      if (def.urls?.length) {
        let pending = def.urls.length;

        def.urls.forEach((url, index) => {
          loader.load(
            url,
            buffer => {
              layer.buffers[index] = buffer;
              pending -= 1;

              if (pending === 0) {
                layer.loaded = true;
                if (this.unlocked) this.startLoadedLoops();
              }
            },
            undefined,
            error => console.warn(`[soundDesign] impossible de charger ${url}`, error)
          );
        });

        continue;
      }

      loader.load(
        def.url,
        buffer => {
          sound.setBuffer(buffer);
          layer.loaded = true;
          if (this.unlocked) this.startLoadedLoops();
        },
        undefined,
        error => console.warn(`[soundDesign] impossible de charger ${def.url}`, error)
      );
    }
  }

  installAudioUnlock(canvas) {
    const unlock = () => {
      this.unlocked = true;
      this.listener.context?.resume?.();
      this.startLoadedLoops();
    };

    canvas?.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  startLoadedLoops() {
    for (const layer of this.layers.values()) {
      if (!layer.loaded || layer.sound.isPlaying) continue;

      if (layer.def.urls?.length) {
        this.playAlternatingLayer(layer);
      } else {
        layer.sound.play();
      }
    }
    this.started = true;
  }

  playAlternatingLayer(layer) {
    const sound = layer.sound;
    const buffers = layer.buffers.filter(Boolean);
    if (!buffers.length || sound.isPlaying) return;

    const bufferIndex = layer.def.weights
      ? weightedRandom(layer.def.weights.slice(0, buffers.length))
      : layer.def.randomize
        ? Math.floor(Math.random() * buffers.length)
        : layer.currentBufferIndex % buffers.length;

    sound.setBuffer(buffers[bufferIndex]);
    sound.setLoop(false);
    sound.play();

    const source = sound.source;
    const defaultOnEnded = source?.onended;

    if (source) {
      source.onended = event => {
        defaultOnEnded?.call(sound, event);
        layer.currentBufferIndex = (layer.currentBufferIndex + 1) % buffers.length;

        if (this.unlocked) this.playAlternatingLayer(layer);
      };
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      for (const layer of this.layers.values()) {
        layer.sound.userData.currentVolume = 0;
        if (layer.loaded) layer.sound.setVolume(0);
      }
    }
  }

  update(timeSeconds) {
    if (this.muted) return;

    const deltaSeconds = Math.min(0.08, Math.max(0.001, timeSeconds - (this.lastTimeSeconds || timeSeconds)));
    this.lastTimeSeconds = timeSeconds;

    if ((timeSeconds - this.lastProximityRefresh) >= PROXIMITY_REFRESH_SECONDS) {
      this.lastProximityRefresh = timeSeconds;
      this.proximity.crows = this.computeCrowProximity();
      this.proximity.birds = this.computeBirdsProximity();
      this.proximity.village = this.computeBiomeProximity(EDGE_TYPES.house);
      this.proximity.beach = this.computeBiomeProximity(EDGE_TYPES.water);
      this.proximity.train = this.computeRailProximity();
      this.proximity.boat  = this.computeBoatProximity();

      // ── Chi-mai : caméra très basse au-dessus des champs de blé ─────────────
      const _chiMaiProx = this.computeChiMaiProximity();
      // Hystérésis : activation à 0.15, désactivation à 0.05 (évite les on/off rapides)
      const _newChiMai = this._chiMaiActive
        ? _chiMaiProx > 0.05
        : _chiMaiProx > 0.15;
      if (_newChiMai !== this._chiMaiActive) {
        this._chiMaiActive = _newChiMai;
        setChiMaiMode(this._chiMaiActive);
      }

      if (this._chiMaiActive) {
        // Chi-mai actif : silence bateau + pas de duck (chi-mai EST la musique)
        this.proximity.boat = 0;
        setMusicDuck(1);
      } else {
        // Normal : duck musique proportionnel à la proximité du bateau
        setMusicDuck(1 - this.proximity.boat);
      }
    }

    for (const [key, layer] of this.layers.entries()) {
      const chiMaiDuck = (this._chiMaiActive && CHI_MAI_DUCK_LAYERS.has(key)) ? 0.45 : 1;
      const target = (this.proximity[key] ?? 0) * layer.def.maxVolume * MASTER_VOLUME * chiMaiDuck;
      this.fadeLayer(layer, target, deltaSeconds);
    }
  }

  fadeLayer(layer, targetVolume, deltaSeconds) {
    const sound = layer.sound;
    const currentVolume = sound.userData.currentVolume ?? 0;
    const step = Math.max(0.001, layer.def.fadeSpeed * deltaSeconds);
    const nextVolume = THREE.MathUtils.lerp(currentVolume, targetVolume, Math.min(1, step));

    sound.userData.currentVolume = nextVolume;
    if (layer.loaded) sound.setVolume(nextVolume);
  }


  updateCameraWorldPosition() {
    if (this.camera?.getWorldPosition) {
      this.camera.getWorldPosition(this.tmpCameraWorldPosition);
      return this.tmpCameraWorldPosition;
    }

    this.tmpCameraWorldPosition.copy(this.camera?.position ?? new THREE.Vector3());
    return this.tmpCameraWorldPosition;
  }

  distanceToCamera(worldPosition) {
    const cameraPosition = this.tmpCameraWorldPosition;
    return Math.hypot(
      worldPosition.x - cameraPosition.x,
      worldPosition.y - cameraPosition.y,
      worldPosition.z - cameraPosition.z
    );
  }

  computeBiomeProximity(type) {
    if (!this.placedTiles?.size) return 0;

    let closest = Infinity;
    this.updateCameraWorldPosition();

    for (const placedTile of this.placedTiles.values()) {
      let matchingEdges = 0;
      for (const edge of EDGE_ORDER) {
        if (getEdgeType(placedTile.tile?.edges?.[edge]) === type) matchingEdges += 1;
      }
      if (matchingEdges <= 0) continue;

      const position = axialToWorld(placedTile.q, placedTile.r);
      this.tmpSourcePosition.set(position.x, position.y ?? 0, position.z);
      const weightedDistance = this.distanceToCamera(this.tmpSourcePosition) / Math.min(1.85, 0.85 + matchingEdges * 0.17);
      if (weightedDistance < closest) closest = weightedDistance;
    }

    const def = type === EDGE_TYPES.house
      ? AUDIO_LAYERS.village
      : AUDIO_LAYERS.beach;
    return distanceToProximity(closest, def.fullVolumeRadius, def.audibleRadius);
  }

  computeBirdsProximity() {
    // Forêt ET prairie (grass) partagent le même pool birds{N}.ogg.
    // On prend la tuile la plus proche toutes biomes confondus.
    if (!this.placedTiles?.size) return 0;

    const BIRD_TYPES = new Set([EDGE_TYPES.forest, EDGE_TYPES.grass]);
    let closest = Infinity;
    this.updateCameraWorldPosition();

    for (const placedTile of this.placedTiles.values()) {
      let matchingEdges = 0;
      for (const edge of EDGE_ORDER) {
        if (BIRD_TYPES.has(getEdgeType(placedTile.tile?.edges?.[edge]))) matchingEdges += 1;
      }
      if (matchingEdges <= 0) continue;

      const position = axialToWorld(placedTile.q, placedTile.r);
      this.tmpSourcePosition.set(position.x, position.y ?? 0, position.z);
      const weightedDistance = this.distanceToCamera(this.tmpSourcePosition) / Math.min(1.85, 0.85 + matchingEdges * 0.17);
      if (weightedDistance < closest) closest = weightedDistance;
    }

    const def = AUDIO_LAYERS.birds;
    return distanceToProximity(closest, def.fullVolumeRadius, def.audibleRadius);
  }

  computeRailProximity() {
    const overlay = this.railTrainOverlay;
    if (!overlay) return 0;

    let closest = Infinity;
    this.updateCameraWorldPosition();

    overlay.traverse(object => {
      const name = object.name ?? '';
      if (!name.includes('train-locomotive') && !name.includes('train-wagon')) return;
      object.getWorldPosition(this.tmpWorldPosition);
      const distance = this.distanceToCamera(this.tmpWorldPosition);
      if (distance < closest) closest = distance;
    });

    const def = AUDIO_LAYERS.train;
    return distanceToProximity(closest, def.fullVolumeRadius, def.audibleRadius);
  }

  computeBoatProximity() {
    let closest = Infinity;
    this.updateCameraWorldPosition();

    const scanBoatOverlay = overlay => {
      if (!overlay) return;
      overlay.traverse(object => {
        const name = object.name ?? '';
        if (!name.includes('water-boat-glb') && !name.includes('animated-water-boat')) return;
        object.getWorldPosition(this.tmpWorldPosition);
        const distance = this.distanceToCamera(this.tmpWorldPosition);
        if (distance < closest) closest = distance;
      });
    };

    scanBoatOverlay(this.fieldWaterEffectsOverlay);
    scanBoatOverlay(this.waterBoatOverlay);

    const def = AUDIO_LAYERS.boat;
    return distanceToProximity(closest, def.fullVolumeRadius, def.audibleRadius);
  }

  computeCrowProximity() {
    const overlay = this.fieldWaterEffectsOverlay;
    if (!overlay) return 0;

    let closest = Infinity;
    this.updateCameraWorldPosition();

    overlay.traverse(object => {
      if (object.userData?.effectKind !== 'bird-flock-orbit') return;
      object.getWorldPosition(this.tmpWorldPosition);
      const distance = this.distanceToCamera(this.tmpWorldPosition);
      if (distance < closest) closest = distance;
    });

    const def = AUDIO_LAYERS.crows;
    return distanceToProximity(closest, def.fullVolumeRadius, def.audibleRadius);
  }

  computeChiMaiProximity() {
    // Déclenche chi-mai quand la caméra est très basse ET au-dessus d'un champ (field).
    if (!this.placedTiles?.size) return 0;

    const CAMERA_MAX_HEIGHT = HEX_SIZE * 0.50;  // au-dessus : chi-mai = 0
    const CAMERA_MIN_HEIGHT = HEX_SIZE * 0.15;  // en dessous : chi-mai = plein effet
    const FIELD_MAX_DIST    = HEX_SIZE * 0.72;  // rayon XZ autour du centre de la tuile (< apothème 0.866 → caméra doit être sur la tuile field)

    const cameraPos = this.updateCameraWorldPosition();
    const camY = cameraPos.y;

    if (camY > CAMERA_MAX_HEIGHT) return 0;

    // Facteur hauteur : 1 au ras du sol, 0 au seuil haut
    const heightFactor = 1 - Math.max(0, Math.min(1,
      (camY - CAMERA_MIN_HEIGHT) / (CAMERA_MAX_HEIGHT - CAMERA_MIN_HEIGHT)
    ));

    // Chercher la tuile field la plus proche en XZ
    let closestXZ = Infinity;
    for (const placedTile of this.placedTiles.values()) {
      let hasField = false;
      for (const edge of EDGE_ORDER) {
        if (getEdgeType(placedTile.tile?.edges?.[edge]) === EDGE_TYPES.field) { hasField = true; break; }
      }
      if (!hasField) continue;

      const pos = axialToWorld(placedTile.q, placedTile.r);
      const distXZ = Math.hypot(cameraPos.x - pos.x, cameraPos.z - pos.z);
      if (distXZ < closestXZ) closestXZ = distXZ;
    }

    if (closestXZ >= FIELD_MAX_DIST) return 0;

    // Facteur position : 1 au centre de la tuile, 0 au bord du rayon
    const fieldFactor = 1 - closestXZ / FIELD_MAX_DIST;

    return heightFactor * fieldFactor;
  }
}

function distanceToProximity(distance, fullVolumeRadius, audibleRadius) {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= fullVolumeRadius) return 1;
  if (distance >= audibleRadius) return 0;

  const span = Math.max(0.0001, audibleRadius - fullVolumeRadius);
  const normalizedDistance = THREE.MathUtils.clamp((distance - fullVolumeRadius) / span, 0, 1);

  // Courbe continue : évite le vieux comportement 1 -> 0.5 -> 0 qui coupait
  // brutalement les trains/bateaux dès que la caméra reculait ou montait.
  const smoothDistance = normalizedDistance * normalizedDistance * (3 - (2 * normalizedDistance));
  return 1 - smoothDistance;
}
