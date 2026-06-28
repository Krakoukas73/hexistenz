/**
 * tileRoadOverlay.js — Routes en pierre (chemins de village).
 *
 * SUPPRIMÉ. Les GLBs stone-road-droite.glb / stone-road-curve60.glb ont été
 * retirés du projet (InterleavedBufferAttributes incompatibles avec
 * mergeGeometries Three.js r160, jamais activé en production).
 *
 * Les exports ci-dessous sont des stubs no-op maintenus pour compatibilité
 * avec l'appel dans tileMesh.js (createRoadCenterOverlay) qui retourne null.
 */

export function createRoadOverlay() {
  return null;
}

export function createRoadCenterOverlay(_edges, _sectorDefs, _createOuterVertices) {
  return null;
}
