// ─── railTrainConstants.js — constantes partagées du système ferroviaire ────
// Extrait de railTrainOverlay.js le 2026-07-11 (découpage sans risque, cf. CONTEXT.md §21) :
// fichier de constantes pures, zéro logique, zéro état — sert de hub commun à railGraph.js,
// railStations.js, railTrainVehicle.js, railTrackGlb.js et railTrainOverlay.js (l'orchestrateur)
// pour éviter tout import circulaire entre ces modules.
import { HEX_SIZE, TILE_VISUAL } from './config.js';

export const TRAIN_Y = (TILE_VISUAL.railY ?? -0.043) - 0.050; // centre train = sous la surface du rail
export const TRAIN_SPEED = 0.18;
export const TRAIN_CURVE_SLOW_DISTANCE = HEX_SIZE * 0.30;
export const TRAIN_ROTATION_SMOOTHING = 0.085;
export const TRAIN_TERMINUS_SLOW_DISTANCE = HEX_SIZE * 0.72;
export const TRAIN_VISUAL_SCALE = 0.75;
export const TRAIN_SIZE_SCALE = 0.672 * 0.88 * 1.06 * 1.13 * 0.92;           // −40% +12% −12% +6% +13% −8% taille trains/wagons
export const TRAIN_SCALE = HEX_SIZE * 0.153 * TRAIN_VISUAL_SCALE * TRAIN_SIZE_SCALE;
export const TRAIN_UNIT_SPACING = HEX_SIZE * 0.30 * TRAIN_VISUAL_SCALE * TRAIN_SIZE_SCALE;
// Interprétation de wagonCount dans createTrainObject :
//   0 = locomotive seule
//   1 = loco + wagon ravitaillement (wagon1)
//   2–7 = loco + ravitaillement + 1–6 wagons voyageurs (wagon2)
export const TRAIN_MAX_WAGONS = 7; // 1 supply + 6 voyageurs max
export const PORT_SCALE = 1.002;
export const TRACK_HUB_RADIUS = HEX_SIZE * 0.185;
export const TRACK_MIN_CURVE_RADIUS = HEX_SIZE * 0.34;
export const MOTION_SAMPLE_SPACING = HEX_SIZE * 0.045;
export const MOTION_SMOOTH_PASSES = 3;
export const STATION_Y = (TILE_VISUAL.railY ?? 0.052) - 0.060;
export const STATION_TARGET_LENGTH = HEX_SIZE * 0.43 * 0.80 * 0.96 * 0.93 * 0.90 * 0.94; // −20% −4% −7% −10% −6%
export const STATION_TRACK_CLEARANCE = HEX_SIZE * 0.32;
export const STATION_TERMINUS_BACKSET = HEX_SIZE * 0.08;
export const STATION_MODEL_DEFS = [
  { key: 'gare-eglise-station', url: './glb/batiments/medieval/gare-eglise.glb', weight: 1 }
];
