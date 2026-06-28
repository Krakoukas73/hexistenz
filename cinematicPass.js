/**
 * cinematicPass.js — Re-export de compatibilité.
 *
 * Le shader cinématique a été déplacé vers shaders/shaderCinematique.js.
 * Ce fichier reste en place pour ne pas modifier stable/threeSetup.js
 * (code validé qui importe CINEMATIC_SHADER depuis ce chemin).
 */
export { CINEMATIC_SHADER } from './shaders/shaderCinematique.js';
