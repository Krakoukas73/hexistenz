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
    maxVolume: 0.24,
    audibleRadius: HEX_SIZE * 4.8,
    fullVolumeRadius: HEX_SIZE * 1.35,
    fadeSpeed: 1.40
  },
  forest: {
    url: './sounds/foret.ogg',
    maxVolume: 0.22,
    audibleRadius: HEX_SIZE * 5.4,
    fullVolumeRadius: HEX_SIZE * 1.65,
    fadeSpeed: 1.45
  },
  village: {
    url: './sounds/village.ogg',
    maxVolume: 0.18,
    audibleRadius: HEX_SIZE * 4.7,
    fullVolumeRadius: HEX_SIZE * 1.40,
    fadeSpeed: 1.35
  }
};

const PROXIMITY_REFRESH_SECONDS = 0.22;
const MASTER_VOLUME = 0.85;

export function createAmbientSoundDesign({ camera, canvas, placedTiles, fieldWaterEffectsOverlay }) {
  return new AmbientSoundDesign({ camera, canvas, placedTiles, fieldWaterEffectsOverlay });
}

class AmbientSoundDesign {
  constructor({ camera, canvas, placedTiles, fieldWaterEffectsOverlay }) {
    this.camera = camera;
    this.canvas = canvas;
    this.placedTiles = placedTiles;
    this.fieldWaterEffectsOverlay = fieldWaterEffectsOverlay;
    this.listener = new THREE.AudioListener();
    this.layers = new Map();
    this.tmpWorldPosition = new THREE.Vector3();
    this.lastTimeSeconds = 0;
    this.lastProximityRefresh = -Infinity;
    this.proximity = { crows: 0, forest: 0, village: 0 };
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

    sound.setBuffer(buffers[layer.currentBufferIndex % buffers.length]);
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

  computeBiomeProximity(type) {
    if (!this.placedTiles?.size) return 0;

    let closest = Infinity;
    const cameraX = this.camera.position.x;
    const cameraZ = this.camera.position.z;

    for (const placedTile of this.placedTiles.values()) {
      let matchingEdges = 0;
      for (const edge of EDGE_ORDER) {
        if (getEdgeType(placedTile.tile?.edges?.[edge]) === type) matchingEdges += 1;
      }
      if (matchingEdges <= 0) continue;

      const position = axialToWorld(placedTile.q, placedTile.r);
      const weightedDistance = Math.hypot(position.x - cameraX, position.z - cameraZ) / Math.min(1.85, 0.85 + matchingEdges * 0.17);
      if (weightedDistance < closest) closest = weightedDistance;
    }

    const def = type === EDGE_TYPES.house ? AUDIO_LAYERS.village : AUDIO_LAYERS.forest;
    return distanceToProximity(closest, def.fullVolumeRadius, def.audibleRadius);
  }

  computeCrowProximity() {
    const overlay = this.fieldWaterEffectsOverlay;
    if (!overlay) return 0;

    let closest = Infinity;
    const cameraX = this.camera.position.x;
    const cameraZ = this.camera.position.z;

    overlay.traverse(object => {
      if (object.userData?.effectKind !== 'bird-flock-orbit') return;
      object.getWorldPosition(this.tmpWorldPosition);
      const distance = Math.hypot(this.tmpWorldPosition.x - cameraX, this.tmpWorldPosition.z - cameraZ);
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

  const t = 1 - ((distance - fullVolumeRadius) / Math.max(0.001, audibleRadius - fullVolumeRadius));
  return THREE.MathUtils.smoothstep(t, 0, 1);
}
