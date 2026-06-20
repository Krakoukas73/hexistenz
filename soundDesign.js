import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { EDGE_ORDER, EDGE_TYPES, HEX_SIZE } from './config.js';
import { axialToWorld } from './stable/hex.js';
import { getEdgeType } from './tileGenerator.js';

const AUDIO_LAYERS = {
  crows: {
    urls: [
      './sounds/corbeaux-1.ogg',
      './sounds/corbeaux-2.ogg'
    ],
    maxVolume: 0.22,
    audibleRadius: HEX_SIZE * 9.2,
    fullVolumeRadius: HEX_SIZE * 1.25,
    fadeSpeed: 0.92
  },
  forest: {
    url: './sounds/foret.ogg',
    maxVolume: 0.20,
    audibleRadius: HEX_SIZE * 8.0,
    fullVolumeRadius: HEX_SIZE * 1.35,
    fadeSpeed: 0.90
  },
  village: {
    url: './sounds/village.ogg',
    maxVolume: 0.22,
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
    maxVolume: 0.18,
    audibleRadius: HEX_SIZE * 6.8,
    fullVolumeRadius: HEX_SIZE * 1.15,
    fadeSpeed: 0.88
  },
  train: {
    urls: [
      './sounds/train-1.ogg',
      './sounds/train-2.ogg',
      './sounds/train-3.ogg'
    ],
    maxVolume: 0.20,
    audibleRadius: HEX_SIZE * 8.5,
    fullVolumeRadius: HEX_SIZE * 1.25,
    fadeSpeed: 0.75
  },
  boat: {
    url: './sounds/pirate.ogg',
    maxVolume: 0.27,
    audibleRadius: HEX_SIZE * 4.25,
    fullVolumeRadius: HEX_SIZE * 0.78,
    fadeSpeed: 0.60
  },
  sacred: {
    urls: [
      './sounds/deogratias.ogg',
      './sounds/eglise.ogg'
    ],
    randomize: true,
    maxVolume: 0.55,
    audibleRadius: HEX_SIZE * 6.0,
    fullVolumeRadius: HEX_SIZE * 0.85,
    fadeSpeed: 0.62
  }
};

const PROXIMITY_REFRESH_SECONDS = 0.22;
const MASTER_VOLUME = 0.85;

const MUSIC_TRACKS = {
  intro: './sounds/music-intro.ogg',
  ingame: './sounds/music-ingame.ogg',
  ending: './sounds/music-ending.ogg'
};

const MUSIC_MAX_VOLUME = 0.070;
const MUSIC_FADE_SPEED = 0.42;
const musicState = {
  tracks: new Map(),
  targetKey: null,
  unlocked: false,
  unlockInstalled: false,
  lastFrameSeconds: 0,
  frameRequested: false
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

function ensureMusicTracks() {
  if (musicState.tracks.size) return;

  for (const [key, url] of Object.entries(MUSIC_TRACKS)) {
    const audio = new Audio(url);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.dataset.currentVolume = '0';
    audio.dataset.targetVolume = '0';
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
    const targetVolume = key === musicState.targetKey ? MUSIC_MAX_VOLUME : 0;
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
    this.proximity = { crows: 0, forest: 0, village: 0, beach: 0, train: 0, boat: 0, sacred: 0 };
    this.unlocked = false;
    this.started = false;

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

    const bufferIndex = layer.def.randomize
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

  update(timeSeconds) {
    const deltaSeconds = Math.min(0.08, Math.max(0.001, timeSeconds - (this.lastTimeSeconds || timeSeconds)));
    this.lastTimeSeconds = timeSeconds;

    if ((timeSeconds - this.lastProximityRefresh) >= PROXIMITY_REFRESH_SECONDS) {
      this.lastProximityRefresh = timeSeconds;
      this.proximity.crows = this.computeCrowProximity();
      this.proximity.forest = this.computeBiomeProximity(EDGE_TYPES.forest);
      this.proximity.village = this.computeBiomeProximity(EDGE_TYPES.house);
      this.proximity.beach = this.computeBiomeProximity(EDGE_TYPES.water);
      this.proximity.train = this.computeRailProximity();
      this.proximity.boat = this.computeBoatProximity();
      this.proximity.sacred = this.computeSacredProximity();
    }

    for (const [key, layer] of this.layers.entries()) {
      const target = (this.proximity[key] ?? 0) * layer.def.maxVolume * MASTER_VOLUME;
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
      : type === EDGE_TYPES.water
        ? AUDIO_LAYERS.beach
        : AUDIO_LAYERS.forest;
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

  computeSacredProximity() {
    const overlay = this.houseOverlay;
    if (!overlay) return 0;

    let closest = Infinity;
    this.updateCameraWorldPosition();

    overlay.traverse(object => {
      const name = object.name ?? '';
      const parentName = object.parent?.name ?? '';
      const isSacred = name.includes('eglise-glb-village-church-instance')
        || name.includes('dolmen-glb-village-church-slot-instance')
        || parentName.includes('village-church-or-dolmen-glb-large-zone-reward');
      if (!isSacred) return;

      object.getWorldPosition(this.tmpWorldPosition);
      const distance = this.distanceToCamera(this.tmpWorldPosition);
      if (distance < closest) closest = distance;
    });

    const def = AUDIO_LAYERS.sacred;
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
