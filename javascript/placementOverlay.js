import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { registerLangRefresh, getLangFile } from './gameLangReactive.js';

const _langFile = getLangFile();

const _poText = await fetch(`./json/languages/${_langFile}.json`)
  .then(r => r.json())
  .then(data => data?.game?.placementOverlay ?? {})
  .catch(err => {
    console.error(`[placementOverlay] Impossible de charger ${_langFile}.json`, err);
    return {};
  });

registerLangRefresh((data) => {
  const fresh = data?.game?.placementOverlay ?? {};
  for (const k of Object.keys(_poText)) delete _poText[k];
  Object.assign(_poText, fresh);
});

export function createPlacementFeedbackOverlay(validation) {
  const group = new THREE.Group();
  const color = validation.valid ? 0x35ff70 : 0xff3030;
  const radius = 1.02;
  const points = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0.055, Math.sin(angle) * radius));
  }

  points.push(points[0].clone());
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
  ));

  for (const conflict of validation.conflicts ?? []) {
    const marker = createConflictMarker(conflict.edge);
    group.add(marker);
  }

  return group;
}

export function getPlacementLabel(validation) {
  if (validation.valid) return _poText.ok ?? 'OK';
  if (validation.reason === 'OUT_OF_GRID') return _poText.outOfGrid ?? 'HORS GRILLE';
  if (validation.reason !== 'INVALID_NETWORK_CONNECTION') return validation.reason ?? (_poText.forbidden ?? 'INTERDIT');

  return validation.conflicts
    ?.map(conflict => `${formatEdgeType(conflict.ownType)} ≠ ${formatEdgeType(conflict.neighborType)}`)
    .join(', ') || (_poText.incompatibleNetwork ?? 'RÉSEAU INCOMPATIBLE');
}

function createConflictMarker(edge) {
  const angle = getEdgeAngle(edge);
  const marker = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.44, 0.035, 0.08);
  const material = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  const barA = new THREE.Mesh(geometry, material);
  const barB = new THREE.Mesh(geometry, material);

  // Y relevé au-dessus des épis de blé (surfaceY champ ≈0.094 + brin jusqu'à ≈0.052,
  // cf. WHEAT_HEIGHT_MAX*WHEAT_GLOBAL_HEIGHT dans variables.js) : à 0.075 la croix
  // passait partiellement sous les blés les plus hauts et devenait illisible.
  marker.position.set(Math.cos(angle) * 0.82, 0.17, Math.sin(angle) * 0.82);
  marker.rotation.y = -angle;
  barA.rotation.y = Math.PI / 4;
  barB.rotation.y = -Math.PI / 4;

  marker.add(barA, barB);
  return marker;
}

function getEdgeAngle(edge) {
  return {
    n: Math.PI / 6,
    ne: Math.PI / 2,
    se: Math.PI * 5 / 6,
    s: Math.PI * 7 / 6,
    sw: Math.PI * 3 / 2,
    nw: Math.PI * 11 / 6
  }[edge] ?? 0;
}

function formatEdgeType(type) {
  return _poText.edgeTypes?.[type] ?? {
    field: 'champ',
    forest: 'forêt',
    water: 'eau',
    rail: 'rail',
    house: 'maison',
    grass: 'prairie'
  }[type] ?? type;
}
