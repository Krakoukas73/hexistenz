/**
 * fireOverlay.js — Feu (F1 allumage + F2 propagation), rendu CARTOON NET (cel, volumétrique).
 *
 * Un éclair frappe une tuile INFLAMMABLE (toutes sauf eau/rail/vide) → FOYER local qui brûle
 * longtemps, se propage aux voisins (biais vent, freiné pluie), noircit la tuile puis repousse.
 *
 * RENDU (2026-07-13, refonte « cel volumétrique ») — dans l'esprit du shader d'ÉCUME de l'eau
 * (bruit + seuil NET, aplats de couleur, pas de dégradé), mais version feu et EN VOLUME :
 *   - FLAMMES = MESH 3D (blob à lobes organiques, PAS un cône net) par foyer avec un shader cel :
 *     bruit animé qui MONTE, silhouette carvée au `discard` (langues nettes), couleurs en BANDES
 *     dures (cœur blanc→jaune→orange→rouge), liseré sombre au bord (contour cartoon). Opaque →
 *     vraie occlusion/volume.
 *   - FUMÉE = volutes lumpy (wawa-vfx, texture nuage), gris.
 *   - ÉTINCELLES = braises additives (wawa-vfx), gravité.
 *
 * Intégration scene.js :
 *   const fireOverlay = createFireOverlay(scene);
 *   updateFireOverlay(fireOverlay, environmentDirector, placedTiles, timeSeconds, deltaSeconds);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { VFXEmitter, VFXParticles, AppearanceMode } from '../vendor/wawa-vfx-vanilla.js';
import { isEnvironmentEventActive } from './environmentDirector.js';
import { getVfxSettings } from './vfxSettings.js';
import { onLightningStrike } from './lightningOverlay.js';
import { getTerrainSurfaceY } from './terrainHeight.js';
import { EDGE_TYPES, HEX_SIZE } from './variables.js';
import { axialToWorld, makeHexKey, worldToAxial } from './hex.js';
import { getGlobalWindUniforms } from './globalWind.js';
import { WORLD_CURVATURE_SHADER, WORLD_CURVATURE_UNIFORMS } from './worldCurvature.js';
import { getHitboxesNear } from './propHitboxRegistry.js';
import { GROUND_CLEARANCE } from './propPlacement.js';

const MAX_BURNING = 8;
const MAX_TRAIL_PER_FOYER = 6;   // marques de noircissement laissées par un foyer qui dérive
const MAX_SCORCH = MAX_BURNING * MAX_TRAIL_PER_FOYER;
const SMOKE_POOL = 220;
const EMBER_POOL = 200;
// Langues de flamme par foyer — cluster, jamais un cône unique. Relevé de 5 à 8 (2026-07-29) :
// les langues sont désormais réparties entre les props touchés (cf. _igniteTile), il en faut
// donc assez pour que CHAQUE objet en reçoive plusieurs et paraisse enveloppé, pas juste
// effleuré par une langue isolée.
const MAX_FLAMES_PER_FOYER = 8;

const GROW = 2.5, PLATEAU = 20.0, DECLINE = 8.0;
const CHARRED_HOLD = 6.0, REGROW = 12.0;
// Retour user 2026-07-29 : « ça ne fonctionne pas, je veux que quand le feu touche un truc, ça
// prenne feu, ça soit tout noir une fois brûlé, et ça revienne à la normale ensuite » — la rampe
// de noircissement des props réels calquait sa durée sur celle des FLAMMES (growD+platD, ≈22.5 s
// par défaut), pensée pour l'effet visuel du feu, pas pour un retour visible joueur. Résultat :
// plus de 20 s réelles pour qu'un arbre/maison touché devienne visiblement noir, ce qui ne se
// remarque quasiment jamais en jeu (caméra qui bouge, autres éclairs, fumée qui distrait). Le
// noircissement d'un prop doit être un feedback RAPIDE et net, indépendant de la durée réglable
// des flammes elles-mêmes.
const CHAR_RAMP = 3.5;   // secondes réelles (× dur) pour qu'un prop touché passe de sain à noir
const SPREAD_INTERVAL = 1.3;   // retour user 2026-07-28 : « pas assez de propagation » (était 2.6)
// Dérive du foyer dans le sens du vent (retour user 2026-07-28 : « le feu doit se déplacer
// plus que ça, on le voit quasi pas bouger ») — le cluster de flammes avance en continu sur le
// terrain pendant sa combustion, au lieu de rester figé sur son point d'allumage. La tache de
// noircissement suit le déplacement RÉEL (nouvelle marque tamponnée à intervalles réguliers de
// distance parcourue, cf. _stampScorchTrail) — elle correspond donc à ce qui a été vraiment
// brûlé, pas à un cercle fixe autour du point d'allumage.
const FIRE_DRIFT_SPEED = 0.045;  // unités monde / s — retour user 2026-07-28 : « encore un peu
                                  // rapide » après 0.073 (HEX_SIZE = 1 → traverse ~1 tuile en ~22 s)
const TRAIL_STAMP_DISTANCE = 0.16;   // unités monde parcourues entre deux tampons de trace
// Ramassage des props traversés par le foyer en cours de dérive (cf. updateFireOverlay).
// Intervalle : assez court pour ne rien rater à la vitesse de dérive (0.045 u/s), assez espacé
// pour que la requête spatiale reste négligeable. Plafond de cibles : borne le coût de
// recoloration par frame (chaque cible = un setColor, cf. cache de résolution d'instance).
const PICKUP_INTERVAL = 0.35;
const MAX_CHAR_TARGETS = 10;
// Pluie/orage : le feu se consume plus vite (×1 = vitesse normale en plus de l'écoulement
// naturel, donc 2× plus rapide au total) et a RAIN_DOUSE_PER_SEC de chance par seconde d'être
// noyé net. À 0.05 → un foyer sous l'averse est éteint prématurément dans ~2 cas sur 3 avant la
// fin de son plateau : « parfois », pas systématiquement.
// Recalibré 2026-07-30 après mesure. Point clé : un feu ne peut naître QUE pendant un orage
// (l'éclair exige `storm`), et fireOverlay considère rainy = rain || storm — donc « sous la
// pluie » est le cas GÉNÉRAL, jamais l'exception. Avec les valeurs initiales (1.0 / 0.05),
// mesuré sur 15 tirages : durée systématiquement divisée par deux (30.5 s → 15.3 s) ET 8 feux
// sur 15 noyés en plus, certains dès 2.8 s. Très loin du « parfois » demandé.
// Valeurs actuelles visées : ~1.35× plus rapide et ~1 feu sur 4 noyé (cf. mesure en doc session).
const RAIN_BURNOUT_ACCEL = 0.35;
const RAIN_DOUSE_PER_SEC = 0.013;

const NEIGHBORS = [
  { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
  { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
];

const NON_FLAMMABLE = new Set([EDGE_TYPES.water, EDGE_TYPES.rail]);
function _isFlammable(type) { return type != null && !NON_FLAMMABLE.has(type); }

// ─── Shader CEL du feu (volumétrique) : bruit animé qui monte → silhouette NETTE + bandes dures ──
const FIRE_NOISE_GLSL = /* glsl */ `
  float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vn(vec3 p){
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n000=h31(i), n100=h31(i+vec3(1,0,0)), n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
    float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1)), n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
    return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
               mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
  }
  float fbm2(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<2;i++){ v+=a*vn(p); p*=2.03; a*=0.5; } return v; }
  float fbm4(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vn(p); p*=2.02; a*=0.5; } return v; }
`;
const FIRE_VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  ${FIRE_NOISE_GLSL}
  uniform float uTime; uniform float uSeed; uniform float uIntensity;
  varying vec3 vLocal;
  void main() {
    vLocal = position;                       // cône : xz ∈ [-0.5,0.5] (base), y ∈ [0,1]
    vec3 p = position;
    float hh = clamp(p.y, 0.0, 1.0);
    // Déplacement des sommets par bruit animé qui monte → silhouette ORGANIQUE qui ondule
    // (fini le triangle net). Amplitude ↑ avec la hauteur, ↓ quand le feu meurt.
    // Retour user 2026-07-28 : « la forme organique doit plus évoluer / turbulence / blob » —
    // 2 couches superposées : bruit FIN existant (détail qui grésille) + une couche LENTE et
    // plus AMPLE (grosses ondulations qui font vraiment gonfler/tordre le blob dans le temps),
    // au lieu d'une seule fréquence de détail.
    float nn = fbm2(vec3(p.x * 3.6, p.y * 3.0 - uTime * 1.8, p.z * 3.6) + uSeed * 9.0);
    float nBig = fbm2(vec3(p.x * 1.25, p.y * 1.05 - uTime * 0.7, p.z * 1.25) + uSeed * 4.3);
    float amp = (0.16 + 0.55 * hh) * (0.55 + 0.45 * clamp(uIntensity, 0.0, 1.0));
    float ampBig = (0.14 + 0.45 * hh) * (0.55 + 0.45 * clamp(uIntensity, 0.0, 1.0));
    vec2 dir = length(p.xz) > 1e-4 ? normalize(p.xz) : vec2(0.0);
    p.xz += dir * ((nn - 0.5) * amp + (nBig - 0.5) * ampBig);
    // Retour user 2026-07-28 : « ombre en trait horizontal au pied des flammes » — l'anneau de
    // base (hh=0) restait parfaitement plat/net (jitter Y proportionnel à hh, donc nul à la
    // base) et lisait comme un artefact géométrique droit. Plancher non-nul (0.35) pour que la
    // base soit déjà irrégulière, pas seulement le reste de la langue.
    p.y  += ((nn - 0.5) * 0.14 + (nBig - 0.5) * 0.11) * (0.35 + 0.65 * hh);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    wp = dorfromantikApplyWorldCurvature(wp);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FIRE_FRAGMENT_SHADER = /* glsl */ `
  ${FIRE_NOISE_GLSL}
  uniform float uTime; uniform float uSeed; uniform float uIntensity;
  uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uOuter; uniform vec3 uEdge;
  varying vec3 vLocal;
  void main() {
    float h = clamp(vLocal.y, 0.0, 1.0);
    float n = fbm4(vec3(vLocal.x * 3.4, vLocal.y * 2.6 - uTime * 1.9, vLocal.z * 3.4) + uSeed * 13.0);
    float field = (1.0 - h) * 1.15 + n * 1.15 - 0.35;
    float thr = mix(1.05, 0.42, clamp(uIntensity, 0.0, 1.0));
    if (field < thr) discard;
    float f = field - thr;
    vec3 col;
    // Seuils relevés (2026-07-29) : avec les anciens, tout le bas de la langue tombait dans
    // uCore (crème quasi blanc) et le feu lisait « pâle », pas incandescent. Le cœur clair est
    // maintenant réservé à la zone vraiment la plus chaude ; l'orange et le rouge dominent.
    if (f > 0.95) col = uCore;
    else if (f > 0.62) col = uMid;
    else if (f > 0.28) col = uOuter;
    else col = uEdge;
    gl_FragColor = vec4(col, 1.0);
  }
`;
let _flameGeom = null;
// Silhouette organique (2026-07-28, retour user : « trop conique, la base au sol devrait être
// bien plus organique qu'un simple rond qui finit en cône ») : au lieu d'un THREE.ConeGeometry
// (base = disque net, pointe = sommet unique géométrique), chaque anneau a un rayon modulé par
// 2 fréquences de lobes déphasées (motif fixe, la variété entre langues vient de la rotation Y
// aléatoire par instance + du bruit animé du vertex shader par-dessus) → empreinte au sol en
// blob à lobes, et un petit plateau irrégulier en haut plutôt qu'une pointe géométrique unique.
function _getFlameGeom() {
  if (_flameGeom) return _flameGeom;
  const RADIAL = 12, RINGS = 7;
  const BASE_R = 0.5, TIP_R = 0.10;
  const LOBES_A = 3, LOBES_B = 5;
  const SEED = 2.618;
  const ringAt = (t) => {
    const lobe = (angle) => 1
      + 0.30 * Math.cos(angle * LOBES_A + SEED * 3.1)
      + 0.16 * Math.cos(angle * LOBES_B + SEED * 5.7 + 1.3);
    const r0 = BASE_R + (TIP_R - BASE_R) * Math.pow(t, 0.7);   // resserrement, reste large en bas
    const row = [];
    for (let i = 0; i < RADIAL; i += 1) {
      const angle = (i / RADIAL) * Math.PI * 2;
      const r = r0 * lobe(angle);
      row.push([Math.cos(angle) * r, t, Math.sin(angle) * r]);
    }
    return row;
  };
  const rings = [];
  for (let j = 0; j <= RINGS; j += 1) rings.push(ringAt(j / RINGS));
  const positions = [];
  for (let j = 0; j < RINGS; j += 1) {
    for (let i = 0; i < RADIAL; i += 1) {
      const iN = (i + 1) % RADIAL;
      const a = rings[j][i], b = rings[j][iN], c = rings[j + 1][i], d = rings[j + 1][iN];
      positions.push(...a, ...b, ...d, ...a, ...d, ...c);   // 2 triangles par quad, côté extérieur
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  _flameGeom = geom;
  return _flameGeom;
}
function _makeFlameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSeed: { value: 0 }, uIntensity: { value: 0 },
      uCore:  { value: new THREE.Color('#fff3cc') },
      uMid:   { value: new THREE.Color('#ffd23a') },
      uOuter: { value: new THREE.Color('#ff7a1e') },
      uEdge:  { value: new THREE.Color('#c62806') },
      // Manquant depuis l'origine (2026-07-29) : le vertex shader injecte
      // WORLD_CURVATURE_SHADER et appelle dorfromantikApplyWorldCurvature(wp), qui lit
      // uWorldCurvatureEnabled — jamais fourni ici (contrairement au matériau de suie, cf.
      // plus bas dans ce fichier). Sans lui, WebGL laisse l'uniform à sa valeur par défaut (0 =
      // courbure désactivée) alors que le reste du monde (terrain, props) applique bien la
      // courbure en mode "bouliste" : les flammes se retrouvent décalées en Y par rapport au
      // sol réel, de plus en plus loin du centre de la carte — invisibles/hors du champ dans un
      // village déjà éloigné de l'origine.
      uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled
    },
    vertexShader: FIRE_VERTEX_SHADER, fragmentShader: FIRE_FRAGMENT_SHADER,
    transparent: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide, fog: false
  });
}

// ─── Texture de GLOW (halo radial doux) : additif derrière les flammes cel → look cartoon ─────
let _glowTex = null;
function _makeGlowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  _glowTex = t; return t;
}

// ─── Texture volute de fumée (cartoon) ────────────────────────────────────────────────────────
let _smokeTex = null;
function _makeSmokeTexture() {
  if (_smokeTex) return _smokeTex;
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 96, 96); x.filter = 'blur(3px)'; x.fillStyle = '#ffffff';
  for (const [px, py, r] of [[48,60,27],[30,54,20],[66,54,20],[40,40,18],[58,42,18],[48,32,16]]) {
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  _smokeTex = t; return t;
}

// Retour user 2026-07-29 : la croix de 2 plans de suie (overlay externe) faisait un artefact
// visible et moche sous certains angles. Remplacée par une vraie teinte du modèle touché
// (instanceColor sur forestOverlay.js/houseOverlay.js, cf. FIRE_TINT_COLOR/CHAR_COLOR plus
// bas et propHitboxRegistry.js pour le mécanisme de callback setColor).
const FIRE_TINT_COLOR = new THREE.Color('#ff6a1a');
const CHAR_COLOR = new THREE.Color('#0d0805');
const _WHITE_CHAR = new THREE.Color(1, 1, 1);
const _CHAR_SCRATCH = new THREE.Color();

// instanceColor MULTIPLIE la couleur/texture d'origine (three.js) — teinter en orange clair
// reste donc discret sur une texture déjà colorée (retour user 2026-07-29 : « la maison est un
// peu rouge mais c'est tout »). Le noircissement, lui, fonctionne quelle que soit la texture de
// base (multiplier par du quasi-noir tend toujours vers le noir). D'où une rampe CONTINUE
// (pas 2 paliers figés) : blanc → teinte feu (0..40%) → noir charbonné (40..100%), recalculée
// chaque frame tant qu'un foyer a des cibles réelles — le prop s'assombrit visiblement au fil
// de la combustion au lieu de rester figé sur une teinte à peine perceptible pendant 30 s.
function _charColorAt(t) {
  if (t <= 0) return _WHITE_CHAR;
  if (t >= 1) return CHAR_COLOR;
  if (t < 0.4) return _CHAR_SCRATCH.copy(_WHITE_CHAR).lerp(FIRE_TINT_COLOR, t / 0.4);
  return _CHAR_SCRATCH.copy(FIRE_TINT_COLOR).lerp(CHAR_COLOR, (t - 0.4) / 0.6);
}

// ─── Décalque de noircissement ────────────────────────────────────────────────────────────────
const SCORCH_VERTEX_SHADER = /* glsl */ `
  ${WORLD_CURVATURE_SHADER}
  varying vec2 vUv;
  void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); wp = dorfromantikApplyWorldCurvature(wp); gl_Position = projectionMatrix * viewMatrix * wp; }
`;
const SCORCH_FRAGMENT_SHADER = /* glsl */ `
  // Footprint organique : rayon bruité par angle (pas un disque net) + croissance animée
  // (uGrowth 0→1 pendant la montée du foyer) — écho léger et pas cher de la logique d'écume de
  // l'eau (bord irrégulier par seuillage de bruit), sans le champ de distance BFS coûteux.
  uniform float uOpacity; uniform vec3 uColor; uniform float uSeed; uniform float uGrowth;
  varying vec2 vUv;
  float h1(float n){ return fract(sin(n) * 43758.5453); }
  float blobNoise(float a, float seed){
    float s = a * 2.5 + seed;
    float i = floor(s);
    return mix(h1(i), h1(i + 1.0), fract(s));
  }
  void main() {
    vec2 p = vUv - vec2(0.5);
    float ang = atan(p.y, p.x);
    float wobble = 0.5 * blobNoise(ang, uSeed) + 0.5 * blobNoise(ang * 2.7 + 11.0, uSeed);
    float maxR = 0.46 * (0.68 + 0.5 * wobble);        // rayon irrégulier par angle, jamais > 0.5
    float grown = maxR * clamp(uGrowth, 0.05, 1.0);   // la tache grandit avec l'âge du foyer
    float core = grown * 0.30;
    float a = smoothstep(grown, core, length(p));
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;
let _scorchGeom = null;
function _getScorchGeom() { if (!_scorchGeom) _scorchGeom = new THREE.PlaneGeometry(1, 1); return _scorchGeom; }

function _smokeSettings(s) {
  const t = 0.35 + s.taille * 0.8;
  return {
    loop: true, duration: 1.0, nbParticles: Math.round(4 + s.densiteFlammes * 8), spawnMode: 'time',
    particlesLifetime: [1.6, 3.0],
    // Retour user 2026-07-28 : « la fumée doit commencer de plus bas, niveau du sol » — la
    // fumée naissait à 0.5-0.8 (bien au-dessus des flammes, flameH max ≈0.19), déconnectée du
    // foyer. Démarre maintenant quasi au sol, monte à travers/depuis la base des flammes.
    startPositionMin: [-0.14, 0.02, -0.14], startPositionMax: [0.14, 0.12, 0.14],
    directionMin: [-0.15, 0.8, -0.15], directionMax: [0.15, 1.2, 0.15],
    speed: [0.35, 0.8], size: [t * 1.0, t * 2.4],
    colorStart: ['#6b6560', '#565049'], colorEnd: ['#332f2b', '#242120']
  };
}
function _emberSettings(s) {
  const t = 0.03 + s.taille * 0.05;
  return {
    loop: true, duration: 1.0, nbParticles: Math.round(3 + s.densiteFlammes * 7), spawnMode: 'time',
    particlesLifetime: [0.5, 1.1],
    startPositionMin: [-0.1, 0.1, -0.1], startPositionMax: [0.1, 0.4, 0.1],
    directionMin: [-0.5, 0.9, -0.5], directionMax: [0.5, 1.9, 0.5],
    speed: [1.2, 2.6], size: [t, t * 1.8],
    colorStart: ['#ffe89a', '#ffb64a'], colorEnd: ['#ff5a1a', '#7a1204']
  };
}

export function createFireOverlay(scene) {
  const s0 = getVfxSettings('fire');
  const smokeTex = _makeSmokeTexture();
  const glowTex = _makeGlowTexture();

  // Fumée : volutes (particules).
  const smokeParticles = new VFXParticles('hexistenz-vfx-fire-smoke', {
    nbParticles: SMOKE_POOL, renderMode: 'billboard',
    intensity: 1.0, fadeAlpha: [0.14, 0.6], fadeSize: [0.2, 1.0], blendingMode: THREE.NormalBlending
  }, undefined, smokeTex);   // (name, settings, store, alphaMap, geometry)
  const smokeMesh = smokeParticles.getMesh();
  smokeMesh.name = 'hexistenz-vfx-fire-smoke';
  smokeMesh.frustumCulled = false; smokeMesh.visible = false; smokeMesh.userData.skipPaletteHarmony = true;
  scene.add(smokeMesh);

  // Étincelles : braises additives.
  const emberParticles = new VFXParticles('hexistenz-vfx-fire-embers', {
    nbParticles: EMBER_POOL, renderMode: 'billboard', appearance: AppearanceMode.Circular,
    intensity: 2.6, fadeAlpha: [0.05, 0.7], fadeSize: [0.1, 0.85], gravity: [0, -1.4, 0], blendingMode: THREE.AdditiveBlending
  });
  const emberMesh = emberParticles.getMesh();
  emberMesh.name = 'hexistenz-vfx-fire-embers';
  emberMesh.frustumCulled = false; emberMesh.visible = false; emberMesh.userData.skipPaletteHarmony = true;
  scene.add(emberMesh);

  // Slots brûlants : 1 MESH flamme (cel) + 1 émetteur fumée + 1 émetteur braises.
  const burnSlots = [];
  for (let i = 0; i < MAX_BURNING; i += 1) {
    // Cluster de langues de flamme indépendantes (jamais un cône unique) — chacune a son propre
    // matériau (uSeed distinct) pour que le bruit du shader ne soit pas synchronisé entre elles.
    const flameMeshes = [];
    for (let f = 0; f < MAX_FLAMES_PER_FOYER; f += 1) {
      const flameMesh = new THREE.Mesh(_getFlameGeom(), _makeFlameMaterial());
      flameMesh.name = 'hexistenz-vfx-fire-flames';
      flameMesh.frustumCulled = false; flameMesh.visible = false; flameMesh.userData.skipPaletteHarmony = true;
      scene.add(flameMesh);
      flameMeshes.push(flameMesh);
    }

    // Halo de glow (sprite additif radial) derrière le cluster de flammes cel → look cartoon.
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color('#ff7a1e'), blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, depthTest: true, opacity: 0, fog: false
    }));
    glow.name = 'hexistenz-vfx-fire-glow';
    glow.visible = false; glow.userData.skipPaletteHarmony = true;
    scene.add(glow);

    const smokeEmitter = new VFXEmitter('hexistenz-vfx-fire-smoke', _smokeSettings(s0));
    smokeEmitter.name = `hexistenz-vfx-fire-smoke-emitter-${i}`; smokeEmitter.shouldEmit = false; scene.add(smokeEmitter);
    const emberEmitter = new VFXEmitter('hexistenz-vfx-fire-embers', _emberSettings(s0));
    emberEmitter.name = `hexistenz-vfx-fire-ember-emitter-${i}`; emberEmitter.shouldEmit = false; scene.add(emberEmitter);

    burnSlots.push({ inUse: false, flameMeshes, flameCount: 0, glow, smokeEmitter, emberEmitter });
  }

  const scorchSlots = [];
  for (let i = 0; i < MAX_SCORCH; i += 1) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#140b06') }, uSeed: { value: 0 }, uGrowth: { value: 0 }, uWorldCurvatureEnabled: WORLD_CURVATURE_UNIFORMS.uWorldCurvatureEnabled },
      vertexShader: SCORCH_VERTEX_SHADER, fragmentShader: SCORCH_FRAGMENT_SHADER,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false
    });
    const mesh = new THREE.Mesh(_getScorchGeom(), mat);
    mesh.name = 'hexistenz-vfx-fire-scorch'; mesh.rotation.x = -Math.PI / 2;
    mesh.frustumCulled = false; mesh.visible = false; mesh.userData.skipPaletteHarmony = true;
    scene.add(mesh);
    scorchSlots.push({ inUse: false, mesh });
  }

  const fireLight = new THREE.PointLight(0xff7a2a, 0, 9, 2);
  fireLight.name = 'hexistenz-vfx-fire-light';
  scene.add(fireLight);

  const overlay = {
    smokeParticles, emberParticles, burnSlots, scorchSlots, fireLight,
    registry: new Map(), _fireMasterOn: false, _flicker: 1
  };

  onLightningStrike((x, z, timeSeconds, meta) => {
    if (!overlay._fireMasterOn) return;
    const type = meta?.tile?.tile?.center;
    if (!_isFlammable(type)) return;
    if (meta.q == null || meta.r == null) return;
    const s = getVfxSettings('fire');
    const proba = s.probaAllumage * (0.55 + 0.45 * (meta.intensity ?? 1));
    if (Math.random() > proba) return;
    _igniteTile(overlay, meta.q, meta.r, type);
  });

  return overlay;
}

function _acquire(pool) { const slot = pool.find(s => !s.inUse); if (slot) slot.inUse = true; return slot ?? null; }

function _findBurnTargets(x, z) {
  // Points d'ancrage des flammes : les vrais props "durs" déjà posés sur/près de la tuile
  // (arbres, maisons, rochers — cf. propHitboxRegistry.js) si il y en a, sinon le centre de
  // la tuile (prairie/champ nus). Retour user 2026-07-28 : « le feu doit se propager aux
  // modèles 3D, maisons, arbres, tout » — plusieurs petits foyers sur les props réels de la
  // tuile plutôt qu'un unique cluster générique en son centre.
  // r = rayon réel du hitbox quand la cible est un vrai prop (utilisé pour dimensionner la
  // suie, cf. _igniteTile) ; null pour le repli centre-de-tuile (rien à noircir, ce n'est pas
  // un objet).
  let hits = getHitboxesNear(x, z, HEX_SIZE * 0.62);
  // Repli élargi (2026-07-29, retour user : « on a les flammes au pied du moulin mais il
  // s'enflamme pas ») — un moulin est posé UNE SEULE FOIS au centre de toute une zone de champ
  // connectée (souvent bien plus grande qu'une tuile, cf. getZoneCenter/collectFieldZones), pas
  // par tuile comme les arbres/maisons. Le rayon serré ci-dessus rate donc presque toujours ce
  // genre de repère "un par zone" : le feu affichait des flammes visuellement proches sans
  // jamais réellement le trouver. Deuxième passe, rayon bien plus large, UNIQUEMENT si rien de
  // proche n'a été trouvé (coût rare — l'allumage n'a lieu qu'à l'impact d'un éclair).
  if (!hits.length) hits = getHitboxesNear(x, z, HEX_SIZE * 3.5);
  // Tri : les props INFLAMMABLES d'abord, puis par distance. Depuis que les rochers portent eux
  // aussi un setColor (ils se couvrent de suie sans brûler), un tri purement par distance les
  // laissait occuper les 3 places de cibles dans une zone caillouteuse — la maison ou l'arbre
  // juste derrière ne prenait alors jamais feu.
  const rank = (h) => (h.meta?.flammable === false ? 1 : 0);
  hits.sort((a, b) => (rank(a) - rank(b))
    || (((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2)));
  let picked = hits.slice(0, 3);

  // Repères "un seul par tuile/zone" (tour, moulin — meta.kind === 'landmark') : jamais garantis
  // de figurer parmi les 3 props les plus proches dès qu'il y a plusieurs maisons/arbres autour
  // (retour user 2026-07-29 : « manque les tours, les moulins »). Recherchés séparément sur un
  // rayon large et ajoutés explicitement s'ils ne sont pas déjà sélectionnés — au lieu de
  // dépendre du hasard du tri par distance parmi des props ordinaires bien plus nombreux.
  // Rayon volontairement modéré (≈1 tuile) : à 3.5 tuiles, on accrochait un moulin situé à
  // l'autre bout de sa zone, ce qui étirait le cluster de flammes sur plusieurs tuiles (feu
  // "éclaté" au lieu d'un foyer). Un repère plus lointain sera atteint par la propagation.
  const landmarks = getHitboxesNear(x, z, HEX_SIZE * 1.05).filter(h => h.meta?.kind === 'landmark');
  if (landmarks.length) {
    landmarks.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
    const nearest = landmarks[0];
    if (!picked.some(h => h.meta === nearest.meta)) picked = [...picked, nearest];
  }

  if (!picked.length) return [{ x, z, r: null, meta: null }];
  return picked.map(h => ({ x: h.x, z: h.z, r: h.r, meta: h.meta }));
}

// Empreinte réelle du CLUSTER de flammes (centroïde + étendue), pas juste le point d'ancrage
// (retour user 2026-07-29 : « les traces au sol doivent suivre exactement les blobs de feu, là
// c'est trop approximatif ») — chaque langue a son propre offset (dx,dz) autour de l'ancre,
// parfois dispersé sur plusieurs props réels (cf. targets/landmarks dans _igniteTile) ; la trace
// noircie doit être centrée sur où les flammes SONT vraiment, pas sur l'ancre choisie au hasard
// parmi les cibles.
function _flameClusterFootprint(burn, foyerX, foyerZ) {
  const n = burn.flameCount;
  // Position RÉELLE de chaque langue : les langues accrochées à un prop sont en absolu et ne
  // suivent pas la dérive, leur dx/dz d'origine est donc périmé dès que le foyer a bougé —
  // s'en servir décalait la trace au sol par rapport aux flammes réellement visibles.
  const ox = [], oz = [];
  let sx = 0, sz = 0;
  for (let f = 0; f < n; f += 1) {
    const off = burn.flameOffsets[f];
    ox[f] = (off.anchored ? off.ax : foyerX + off.dx) - foyerX;
    oz[f] = (off.anchored ? off.az : foyerZ + off.dz) - foyerZ;
    sx += ox[f]; sz += oz[f];
  }
  const mx = sx / n, mz = sz / n;
  let reach = 0;
  for (let f = 0; f < n; f += 1) {
    // Rayon propre de chaque langue inclus : la trace couvre ce que les flammes recouvrent
    // vraiment, y compris quand elles ont des tailles très différentes (arbre vs tour).
    reach = Math.max(reach, Math.hypot(ox[f] - mx, oz[f] - mz) + burn.flameOffsets[f].r * 1.5);
  }
  return { x: foyerX + mx, z: foyerZ + mz, size: reach * 2 };
}

function _stampScorchTrail(overlay, foyer) {
  // Nouveau tampon de trace au sol à la position COURANTE (déjà dérivée) du foyer — pas
  // d'animation de montée (ça marque un endroit déjà brûlé, pas un foyer qui s'installe),
  // juste une courte apparition (cf. boucle de update dans updateFireOverlay).
  if (foyer.scorchTrail.length >= MAX_TRAIL_PER_FOYER) return;
  const slot = _acquire(overlay.scorchSlots);
  if (!slot) return;
  const footprint = _flameClusterFootprint(foyer.burn, foyer.x, foyer.z);
  slot.mesh.position.set(footprint.x, foyer.y + 0.04, footprint.z);
  slot.mesh.scale.set(footprint.size, footprint.size, 1);
  slot.mesh.material.uniforms.uOpacity.value = 0;
  slot.mesh.material.uniforms.uSeed.value = Math.random() * 10;
  slot.mesh.material.uniforms.uGrowth.value = 1;
  slot.mesh.visible = true;
  foyer.scorchTrail.push({ slot, size: footprint.size, bornAt: foyer.age });
  foyer.lastStampX = foyer.x;
  foyer.lastStampZ = foyer.z;
}

function _igniteTile(overlay, q, r, type) {
  const key = makeHexKey(q, r);
  if (overlay.registry.has(key)) return false;
  const burn = _acquire(overlay.burnSlots);
  if (!burn) return false;
  const scorch = _acquire(overlay.scorchSlots);
  if (!scorch) { burn.inUse = false; return false; }

  const pos = axialToWorld(q, r);
  const x = pos.x, z = pos.z;
  const y = getTerrainSurfaceY({ x, z }, type, 0, { exactMeshSurface: false });
  const s = getVfxSettings('fire');

  // Échelle alignée sur les props déjà posés sur une tuile — pas sur la tuile elle-même
  // (hitboxRadius house≈0.16, watchtower≈0.22, barrel≈0.05, HEX_SIZE=1, cf. variables.js) :
  // un foyer doit lire comme "un feu qui prend sur/à côté de ces éléments", pas comme une
  // tuile entière en flammes. Chaque langue est petite ; c'est le CLUSTER qui donne le volume.
  // Retour user 2026-07-28 : « trop hauts et pas assez étendus en surface » → langues plus
  // basses et plus larges, cluster bien plus dispersé (davantage de surface au sol par foyer).
  // Taille de repli (tuile nue : prairie/champ sans aucun objet) — petit feu au sol.
  const bareR = 0.09 + s.taille * 0.11;
  const bareH = 0.075 + s.taille * 0.11;
  const flameCount = Math.min(MAX_FLAMES_PER_FOYER, 3 + Math.round(s.densiteFlammes * 5)); // 3 à 8

  // Ancrage sur les vrais props de la tuile (arbres/maisons/rochers) si il y en a — sinon
  // repli sur le centre de la tuile (prairie/champ nus).
  const targets = _findBurnTargets(x, z);
  // Ancre RÉELLE du foyer (2026-07-29, retour user : « sol pas noirci à l'endroit exact où
  // passe le feu ») — jusqu'ici flammes/suie ciblaient targets[0] mais la trace au sol, le
  // halo, la fumée et le point de départ de la dérive restaient au CENTRE DE TUILE (x,z),
  // potentiellement à ~0,6 unité du prop réellement visé → décalage visible entre le feu et
  // ce qu'il est censé brûler. Tout est maintenant posé sur le même point : targets[0]
  // (= centre de tuile si aucun prop réel trouvé, donc rien ne change dans ce cas).
  const anchorX = targets[0].x, anchorZ = targets[0].z;
  const anchorY = getTerrainSurfaceY({ x: anchorX, z: anchorZ }, type, 0, { exactMeshSurface: false });

  burn.flameCount = flameCount;
  burn.flameOffsets = burn.flameOffsets ?? new Array(MAX_FLAMES_PER_FOYER);
  // Chaque langue est dimensionnée sur la CIBLE qu'elle brûle (2026-07-29, retour user :
  // « on a eu des plus grosses flammes mais ça ne fonctionne toujours pas comme attendu DU
  // TOUT »). Avant : une taille unique tirée du seul curseur `taille`, appliquée telle quelle
  // partout, avec une géométrie ~2× plus large que haute → en grossissant, ça donnait de larges
  // FLAQUES orange posées à plat sur le terrain (constaté en capture), jamais « l'objet brûle ».
  // Maintenant : rayon pris sur l'emprise réelle du prop (t.r) et hauteur sur sa hauteur réelle
  // (t.height, fournie par forestOverlay/houseOverlay/fieldZonesOverlay/naturalPropsOverlay) —
  // donc des langues VERTICALES, serrées sur l'objet et plus hautes que lui, qui l'enveloppent.
  // Cibles réelles noircissables, chacune avec SA propre progression de combustion (startAge) —
  // indispensable depuis que le foyer en ramasse de nouvelles en cours de route (cf.
  // updateFireOverlay) : un arbre atteint 15 s après l'allumage doit brûler puis noircir à
  // partir de CE moment-là, pas apparaître déjà tout noir.
  const charTargets = [];
  for (const t of targets) {
    if (!t.meta?.setColor) continue;
    charTargets.push({ meta: t.meta, x: t.x, z: t.z, r: t.r, height: t.meta.height ?? t.r * 2.2, startAge: 0 });
  }

  let maxSpread = 0;
  for (let f = 0; f < MAX_FLAMES_PER_FOYER; f += 1) {
    const mesh = burn.flameMeshes[f];
    if (f >= flameCount) { mesh.visible = false; continue; }
    // Répartition des langues sur les cibles (f % targets.length) : chaque prop touché reçoit
    // ses propres langues plutôt qu'un unique cluster étalé entre eux.
    const target = targets[f % targets.length];
    // Un prop marqué `flammable: false` (rocher) noircit mais n'accueille pas de langue
    // dimensionnée sur lui : le feu brûle AUTOUR, à taille de feu de sol.
    const isProp = target.r != null && target.meta?.flammable !== false;
    const tR = isProp ? target.r : bareR;
    // Repli si un prop n'a pas déclaré sa hauteur : ~2.2× son emprise (proportion typique d'un
    // objet debout), jamais la hauteur "tonneau" d'avant.
    const tH = isProp ? (target.meta?.height ?? tR * 2.2) : bareH;
    const sizeMul = 0.75 + Math.random() * 0.5;
    // Langue plus étroite que l'objet (elle le lèche) et d'une hauteur du même ordre que lui :
    // elle doit MONTER le long du modèle sans l'ensevelir — sinon le prop disparaît sous les
    // flammes et on ne voit plus le noircissement se faire dessous (tout l'intérêt de l'effet).
    const fR = tR * 0.50 * sizeMul * (0.75 + s.taille * 0.6);
    const fH = tH * 1.00 * sizeMul * (0.75 + s.taille * 0.6);
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * tR * 0.6;
    const ax = target.x + Math.cos(ang) * dist;
    const az = target.z + Math.sin(ang) * dist;
    // Une langue posée sur un VRAI prop reste accrochée à lui en absolu : le foyer dérive avec
    // le vent, mais une flamme qui brûle une maison ne doit pas glisser hors de la maison
    // (retour user 2026-07-29 : des objets sur la trajectoire ne prennent pas feu — le pendant
    // du même bug). Seul un feu de tuile nue suit la dérive en relatif.
    burn.flameOffsets[f] = isProp
      ? { anchored: true, ax, az, ay: getTerrainSurfaceY({ x: ax, z: az }, type, 0, { exactMeshSurface: false }),
          dx: ax - anchorX, dz: az - anchorZ, r: fR, hTall: fH,
          targetIdx: charTargets.findIndex(c => c.meta === target.meta) }
      : { anchored: false, ax, az, ay: anchorY,
          dx: ax - anchorX, dz: az - anchorZ, r: fR, hTall: fH, targetIdx: -1 };
    maxSpread = Math.max(maxSpread, Math.hypot(ax - anchorX, az - anchorZ) + fR);
    mesh.position.set(ax, burn.flameOffsets[f].ay + GROUND_CLEARANCE, az);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.set(fR * 2.0, fH, fR * 2.0);
    mesh.material.uniforms.uSeed.value = Math.random() * 10;
    mesh.material.uniforms.uIntensity.value = 0;
    mesh.visible = true;
  }
  const flameH = Math.max(...Array.from({ length: flameCount }, (_, f) => burn.flameOffsets[f].hTall));
  burn.flameH = flameH;
  burn.clusterSpread = maxSpread;

  // Halo : suit la taille des flammes, pas l'étendue du ciblage — sans plafond il devenait un
  // immense voile orange qui noyait toute la scène (et cachait le noircissement en dessous).
  const glowSize = flameH * 1.8 + Math.min(maxSpread, flameH) * 1.2;
  burn.glow.position.set(anchorX, anchorY + flameH * 0.45, anchorZ);
  burn.glow.scale.set(glowSize, glowSize, 1);
  burn.glow.material.opacity = 0;
  burn.glow.visible = true;

  burn.smokeEmitter.position.set(anchorX, anchorY, anchorZ);
  burn.emberEmitter.position.set(anchorX, anchorY, anchorZ);
  burn.smokeEmitter.updateSettings(_smokeSettings(s));
  burn.emberEmitter.updateSettings(_emberSettings(s));
  burn.smokeEmitter.restart(); burn.emberEmitter.restart();
  burn.smokeEmitter.shouldEmit = true; burn.emberEmitter.shouldEmit = true;

  // Tache au sol calée sur l'empreinte RÉELLE du cluster de flammes (centroïde + étendue des
  // langues, cf. _flameClusterFootprint) — pas seulement l'ancre — bord organique (cf. shader),
  // grandit avec l'âge du foyer plutôt que de fondre en opacité à taille figée. D'autres tampons
  // suivront le long du trajet réellement parcouru par le foyer qui dérive (cf.
  // _stampScorchTrail) — la trace correspond ainsi à ce qui a été vraiment brûlé, pas à un
  // unique cercle fixe autour du point d'allumage (retour user 2026-07-28).
  const footprint = _flameClusterFootprint(burn, anchorX, anchorZ);
  scorch.mesh.position.set(footprint.x, anchorY + 0.04, footprint.z);
  scorch.mesh.scale.set(footprint.size, footprint.size, 1);
  scorch.mesh.material.uniforms.uOpacity.value = 0;
  scorch.mesh.material.uniforms.uSeed.value = Math.random() * 10;
  scorch.mesh.material.uniforms.uGrowth.value = 0;
  scorch.mesh.visible = true;

  // Le vrai modèle change de couleur (2026-07-29, retour user — remplace la croix de suie,
  // jugée moche) : chaque prop réel touché (meta.setColor, fourni par forestOverlay.js /
  // houseOverlay.js / fieldZonesOverlay.js / naturalPropsOverlay.js via propHitboxRegistry.js)
  // prend une teinte feu puis noircit selon SA propre progression, et revient à sa couleur
  // d'origine à la repousse (_endFoyer).
  overlay.registry.set(key, {
    key, q, r, x: anchorX, y: anchorY, z: anchorZ, type, age: 0, intensity: 0, burn,
    scorchTrail: [{ slot: scorch, size: footprint.size, bornAt: 0 }],
    charTargets,
    // Rayon dans lequel le foyer enflamme les props qu'il rencontre en dérivant. Plancher pour
    // qu'un feu allumé sur une tuile nue puisse quand même attraper ce qui se trouve autour.
    reach: Math.max(maxSpread, HEX_SIZE * 0.30),
    pickupTimer: 0,
    nextFlameSlot: 0,
    lastStampX: anchorX, lastStampZ: anchorZ,
    spreadTimer: Math.random() * SPREAD_INTERVAL
  });
  return true;
}

// Redirige une langue de flamme vers un prop fraîchement atteint par le foyer, dimensionnée sur
// LUI (rayon + hauteur réels). Round-robin sur les slots : quand toutes les langues sont prises,
// on réutilise la plus ancienne — son objet précédent est de toute façon déjà noirci à ce
// stade, donc il n'a plus besoin d'une grande flamme.
function _retargetFlameTo(foyer, ci, s) {
  const burn = foyer.burn;
  if (!burn || !burn.flameCount) return;
  const t = foyer.charTargets[ci];
  const slot = foyer.nextFlameSlot % burn.flameCount;
  foyer.nextFlameSlot = (foyer.nextFlameSlot + 1) % burn.flameCount;
  const sizeMul = 0.75 + Math.random() * 0.5;
  const ang = Math.random() * Math.PI * 2;
  const dist = Math.random() * t.r * 0.6;
  const ax = t.x + Math.cos(ang) * dist;
  const az = t.z + Math.sin(ang) * dist;
  const off = burn.flameOffsets[slot];
  off.anchored = true;
  off.ax = ax; off.az = az;
  off.ay = getTerrainSurfaceY({ x: ax, z: az }, foyer.type, 0, { exactMeshSurface: false });
  off.r = t.r * 0.50 * sizeMul * (0.75 + s.taille * 0.6);
  off.hTall = t.height * 1.00 * sizeMul * (0.75 + s.taille * 0.6);
  off.targetIdx = ci;
  const mesh = burn.flameMeshes[slot];
  mesh.rotation.y = Math.random() * Math.PI * 2;
  mesh.material.uniforms.uSeed.value = Math.random() * 10;
}

function _releaseBurn(foyer) {
  if (!foyer.burn) return;
  for (const mesh of foyer.burn.flameMeshes) {
    mesh.visible = false;
    mesh.material.uniforms.uIntensity.value = 0;
  }
  foyer.burn.glow.visible = false;
  foyer.burn.glow.material.opacity = 0;
  foyer.burn.smokeEmitter.shouldEmit = false;
  foyer.burn.emberEmitter.shouldEmit = false;
  foyer.burn.inUse = false;
  foyer.burn = null;
}

function _endFoyer(overlay, foyer) {
  _releaseBurn(foyer);
  for (const stamp of foyer.scorchTrail) {
    stamp.slot.mesh.visible = false;
    stamp.slot.mesh.material.uniforms.uOpacity.value = 0;
    stamp.slot.inUse = false;
  }
  foyer.scorchTrail = [];
  for (const t of foyer.charTargets) t.meta.setColor(null);   // reset couleur d'origine (repousse)
  foyer.charTargets = [];
  overlay.registry.delete(foyer.key);
}

function _trySpread(overlay, placedTiles, foyer, chanceBase, wind) {
  if (!placedTiles) return;
  const cands = [];
  for (const d of NEIGHBORS) {
    const nq = foyer.q + d.q, nr = foyer.r + d.r;
    if (overlay.registry.has(makeHexKey(nq, nr))) continue;
    const pt = placedTiles.get(makeHexKey(nq, nr));
    if (!pt) continue;
    const type = pt.tile?.center;
    if (!_isFlammable(type)) continue;
    const b = axialToWorld(nq, nr);
    let dx = b.x - foyer.x, dz = b.z - foyer.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const dot = wind.x * dx + wind.y * dz;
    cands.push({ nq, nr, type, w: 0.3 + 0.7 * Math.max(0, dot) });
  }
  if (!cands.length) return;
  if (Math.random() > chanceBase) return;
  let tot = 0; for (const c of cands) tot += c.w;
  let pick = cands[0], rnd = Math.random() * tot;
  for (const c of cands) { rnd -= c.w; if (rnd <= 0) { pick = c; break; } }
  _igniteTile(overlay, pick.nq, pick.nr, pick.type);
}

export function updateFireOverlay(overlay, environmentDirector, placedTiles, timeSeconds, deltaSeconds) {
  overlay._fireMasterOn = isEnvironmentEventActive(environmentDirector, 'fire');
  const s = getVfxSettings('fire');
  const dur = Math.max(0.2, s.duree);
  const growD = GROW * dur, platD = PLATEAU * dur, declD = DECLINE * dur;
  const burnEnd = growD + platD + declD;
  const charEnd = burnEnd + CHARRED_HOLD;
  const regrowEnd = charEnd + REGROW;
  const charRampEnd = Math.min(growD + platD, CHAR_RAMP * dur);   // noircissement rapide, découplé de la durée des flammes
  // Hauteur d'un feu "normal" (sol nu) — cible vers laquelle redescendent les langues une fois
  // leur objet consumé. Même formule que le repli de _igniteTile.
  const bareH = 0.075 + s.taille * 0.11;

  overlay._flicker = 0.72 + 0.28 * Math.abs(Math.sin(timeSeconds * 11.7) * Math.sin(timeSeconds * 5.3 + 1.3));

  const rainy = isEnvironmentEventActive(environmentDirector, 'rain') || isEnvironmentEventActive(environmentDirector, 'storm');
  const spreadChance = (s.propagation ?? 0.6) * (rainy ? 0.45 : 1);
  const wind = getGlobalWindUniforms().uGlobalWindDirection.value;

  let maxIntensity = 0, bestX = 0, bestY = 0, bestZ = 0;
  let anySmoke = false, anyEmber = false;

  for (const foyer of overlay.registry.values()) {
    foyer.age += deltaSeconds;

    // Extinction par la pluie (retour user 2026-07-29 : « la pluie ralentit le feu oui, mais
    // parfois l'éteint »). Jusqu'ici la pluie ne faisait que freiner la CONTAGION : un foyer
    // déjà allumé brûlait son cycle complet en pleine averse. Deux effets désormais : il se
    // consume plus vite, et il a une probabilité par seconde d'être noyé — auquel cas il bascule
    // directement dans son déclin (les flammes retombent en quelques secondes, l'objet reste
    // charbonné et repousse normalement), plutôt que de disparaître d'un coup.
    if (rainy && foyer.age < burnEnd) {
      foyer.age += deltaSeconds * RAIN_BURNOUT_ACCEL;
      if (Math.random() < RAIN_DOUSE_PER_SEC * deltaSeconds) {
        foyer.age = Math.max(foyer.age, growD + platD + declD * 0.5);
      }
    }

    if (foyer.age < burnEnd) {
      let inten;
      if (foyer.age < growD) inten = foyer.age / growD;
      else if (foyer.age < growD + platD) inten = 1;
      else inten = 1 - (foyer.age - growD - platD) / declD;
      foyer.intensity = Math.max(0, Math.min(1, inten));

      // Dérive lente du foyer dans le sens du vent — le cluster de flammes avance sur le
      // terrain pendant sa combustion (retour user 2026-07-28). La tache de noircissement
      // n'est PAS déplacée : elle reste la trace au sol du point d'allumage.
      const nextX = foyer.x + wind.x * FIRE_DRIFT_SPEED * deltaSeconds;
      const nextZ = foyer.z + wind.y * FIRE_DRIFT_SPEED * deltaSeconds;
      const nextAxial = worldToAxial(nextX, nextZ);
      // La tuile visée doit exister ET être inflammable : le test ne portait que sur son
      // existence, si bien qu'un foyer pouvait dériver tranquillement au milieu d'un lac
      // (retour user 2026-07-29). Le feu s'arrête au bord de l'eau comme au bord du plateau.
      const nextTile = placedTiles?.get(makeHexKey(nextAxial.q, nextAxial.r));
      if (nextTile && _isFlammable(nextTile.tile?.center)) {
        foyer.x = nextX;
        foyer.z = nextZ;
        foyer.y = getTerrainSurfaceY({ x: foyer.x, z: foyer.z }, foyer.type, 0, { exactMeshSurface: false });
      } else if (foyer.age < growD + platD) {
        // Retour user 2026-07-28 : « il se déplace hors des tuiles... plutôt que mourir au
        // bord de la map » — dérive bloquée dès qu'elle sortirait du plateau posé ; le foyer
        // ne dérive plus mais continue son cycle normalement jusqu'au déclin naturel (il ne
        // s'éteint pas brutalement, il finit juste de brûler sur place, au bord).
        foyer.age = growD + platD;
      }

      if (foyer.intensity > maxIntensity) { maxIntensity = foyer.intensity; bestX = foyer.x; bestY = foyer.y; bestZ = foyer.z; }

      // ── Props rencontrés en cours de dérive ──────────────────────────────────────────────
      // Retour user 2026-07-29 : « on a toujours des objets qui sont sur la trajectoire des
      // flammes mais ne prennent pas feu du tout ». Les cibles étaient figées à l'allumage
      // (_findBurnTargets appelé une seule fois, sur le centre de la tuile) alors que le foyer
      // DÉRIVE ensuite avec le vent : tout ce qu'il traversait n'était jamais touché. Le foyer
      // ramasse maintenant en continu les props qui entrent dans son rayon, chacun démarrant sa
      // propre combustion à ce moment-là.
      foyer.pickupTimer += deltaSeconds;
      if (foyer.pickupTimer >= PICKUP_INTERVAL && foyer.charTargets.length < MAX_CHAR_TARGETS) {
        foyer.pickupTimer = 0;
        // Inflammables d'abord (même raison que dans _findBurnTargets) : sans ce tri, une nuée
        // de rochers pouvait saturer les MAX_CHAR_TARGETS places et empêcher un arbre ou une
        // maison rencontrés au même moment de prendre feu.
        const nearby = getHitboxesNear(foyer.x, foyer.z, foyer.reach)
          .filter(h => h.meta?.setColor)
          .sort((a, b) => (a.meta.flammable === false ? 1 : 0) - (b.meta.flammable === false ? 1 : 0));
        for (const h of nearby) {
          // Dédoublonnage par POSITION et non par identité de meta : un rebuild de scène
          // ré-enregistre des closures neuves pour les mêmes props physiques.
          if (foyer.charTargets.some(c => Math.abs(c.x - h.x) < 1e-3 && Math.abs(c.z - h.z) < 1e-3)) continue;
          foyer.charTargets.push({
            meta: h.meta, x: h.x, z: h.z, r: h.r,
            height: h.meta.height ?? h.r * 2.2, startAge: foyer.age
          });
          // Un rocher entre dans les cibles (il se couvre de suie) mais n'attire aucune langue.
          if (h.meta.flammable !== false) _retargetFlameTo(foyer, foyer.charTargets.length - 1, s);
          if (foyer.charTargets.length >= MAX_CHAR_TARGETS) break;
        }
      }

      if (foyer.burn) {
        for (let f = 0; f < foyer.burn.flameCount; f += 1) {
          const mesh = foyer.burn.flameMeshes[f];
          const off = foyer.burn.flameOffsets[f];
          // Une langue accrochée à un prop reste sur LUI (absolu) ; seule une flamme de tuile
          // nue suit la dérive du foyer.
          const px = off.anchored ? off.ax : foyer.x + off.dx;
          const pz = off.anchored ? off.az : foyer.z + off.dz;
          const py = off.anchored ? off.ay : foyer.y;
          // Hauteur : haute tant que l'objet se consume, puis retour à une hauteur de feu
          // NORMALE une fois qu'il est charbonné (retour user 2026-07-29 : « une fois l'objet
          // brûlé passé, les flammes doivent revenir à une hauteur normale et pas aussi
          // hautes ») — ce sont des braises sur une ruine, plus un bâtiment en train de flamber.
          // Repli sur l'horloge du FOYER quand la langue n'est rattachée à aucune cible
          // colorable (targetIdx < 0) : props sans setColor (rochers), ou feu de tuile nue.
          // Sans ce repli, ces langues gardaient leur hauteur « objet en train de flamber »
          // indéfiniment, alors que le reste du foyer était déjà retombé.
          let charProg;
          if (off.targetIdx >= 0) {
            const ct = foyer.charTargets[off.targetIdx];
            charProg = ct ? Math.min(1, Math.max(0, (foyer.age - ct.startAge) / charRampEnd)) : 1;
          } else {
            charProg = Math.min(1, foyer.age / charRampEnd);
          }
          const h = off.hTall + (bareH - off.hTall) * charProg;
          // Objet consumé → la langue se DÉTACHE et repart avec la dérive du foyer (retour user
          // 2026-07-29 : « on voit plus les flammes se déplacer »). L'ancrage absolu empêche une
          // flamme de glisser hors de la maison qu'elle brûle, mais s'il est définitif le feu se
          // fige sur ses cibles initiales et n'avance plus jamais. Le cycle correct est : je
          // m'accroche à l'objet → je le consume → je me détache et je continue ma route (quitte
          // à m'accrocher au prochain, cf. _retargetFlameTo).
          if (off.anchored && charProg >= 1) {
            off.anchored = false;
            off.dx = px - foyer.x;   // repart de sa position courante, sans saut visuel
            off.dz = pz - foyer.z;
            off.targetIdx = -1;
          }
          mesh.position.set(px, py + GROUND_CLEARANCE, pz);
          mesh.scale.set(off.r * 2.0, h, off.r * 2.0);
          const fu = mesh.material.uniforms;
          fu.uTime.value = timeSeconds;
          fu.uIntensity.value = foyer.intensity;
        }
        foyer.burn.glow.position.set(foyer.x, foyer.y + foyer.burn.flameH * 0.45, foyer.z);
        foyer.burn.glow.material.opacity = foyer.intensity * (0.4 + 0.6 * overlay._flicker) * 0.55;
        foyer.burn.smokeEmitter.position.set(foyer.x, foyer.y, foyer.z);
        foyer.burn.emberEmitter.position.set(foyer.x, foyer.y, foyer.z);
        foyer.burn.smokeEmitter.shouldEmit = true;
        foyer.burn.emberEmitter.shouldEmit = foyer.intensity > 0.15;
        foyer.burn.smokeEmitter.update(timeSeconds, deltaSeconds);
        foyer.burn.emberEmitter.update(timeSeconds, deltaSeconds);
        anySmoke = true; anyEmber = true;
      }

      // Tampon initial : grandit avec la montée du foyer (propagation organique intra-tuile).
      const firstStamp = foyer.scorchTrail[0];
      firstStamp.slot.mesh.material.uniforms.uGrowth.value = Math.min(1, foyer.age / growD);
      firstStamp.slot.mesh.material.uniforms.uOpacity.value = Math.min(1, foyer.age / (growD + platD * 0.5)) * 0.9;
      // Tampons suivants (posés en cours de dérive) : courte apparition puis pleine opacité —
      // ils marquent une trace déjà brûlée, pas un foyer qui s'installe.
      for (let ti = 1; ti < foyer.scorchTrail.length; ti += 1) {
        const stamp = foyer.scorchTrail[ti];
        stamp.slot.mesh.material.uniforms.uOpacity.value = Math.min(1, (foyer.age - stamp.bornAt) / 0.6) * 0.9;
      }
      // Nouveau tampon si le foyer a assez dérivé depuis le dernier — la trace suit le trajet
      // réellement parcouru (retour user 2026-07-28 : « la trace noircie doit correspondre à
      // ce qui a été réellement brûlé »).
      if (Math.hypot(foyer.x - foyer.lastStampX, foyer.z - foyer.lastStampZ) >= TRAIL_STAMP_DISTANCE) {
        _stampScorchTrail(overlay, foyer);
      }

      // Assombrissement continu des props réels touchés — chacun sur SA propre horloge
      // (startAge), pas sur l'âge du foyer : un objet attrapé en cours de dérive doit démarrer
      // sa combustion à zéro au lieu d'apparaître instantanément noir.
      for (const t of foyer.charTargets) {
        t.meta.setColor(_charColorAt(Math.min(1, Math.max(0, (foyer.age - t.startAge) / charRampEnd))));
      }

      if (foyer.age > growD) {
        foyer.spreadTimer += deltaSeconds;
        if (foyer.spreadTimer >= SPREAD_INTERVAL) { foyer.spreadTimer = 0; _trySpread(overlay, placedTiles, foyer, spreadChance, wind); }
      }
    } else {
      foyer.intensity = 0;
      // Reste noir pendant la phase charbonnée, puis revient progressivement à la normale
      // pendant la repousse — en phase avec le fondu de la trace au sol (op ci-dessous).
      // Fondu global de repousse, mais borné par la progression PROPRE de chaque cible : un
      // objet attrapé tard n'a pas à sauter au noir plein juste parce que le foyer, lui, a fini.
      const fade = foyer.age < charEnd ? 1 : Math.max(0, 1 - (foyer.age - charEnd) / REGROW);
      for (const tg of foyer.charTargets) {
        const own = Math.min(1, Math.max(0, (foyer.age - tg.startAge) / charRampEnd));
        tg.meta.setColor(_charColorAt(Math.min(own, fade)));
      }
      if (foyer.burn) {
        for (const mesh of foyer.burn.flameMeshes) mesh.visible = false;
        foyer.burn.glow.visible = false;
        foyer.burn.emberEmitter.shouldEmit = false;
        foyer.burn.smokeEmitter.shouldEmit = foyer.age < burnEnd + 1.6;
        foyer.burn.smokeEmitter.update(timeSeconds, deltaSeconds);
        if (foyer.burn.smokeEmitter.shouldEmit) anySmoke = true;
        if (foyer.age >= burnEnd + 1.6) _releaseBurn(foyer);
      }
      const op = foyer.age < charEnd ? 1 : Math.max(0, 1 - (foyer.age - charEnd) / REGROW);
      for (const stamp of foyer.scorchTrail) stamp.slot.mesh.material.uniforms.uOpacity.value = op * 0.9;
      if (foyer.age >= regrowEnd) _endFoyer(overlay, foyer);
    }
  }

  if (maxIntensity > 0.001) overlay.fireLight.position.set(bestX, bestY + 0.6, bestZ);
  overlay.fireLight.intensity = maxIntensity * overlay._flicker * (5 + 7 * s.densiteFlammes);

  overlay.smokeParticles.getMesh().visible = anySmoke;
  overlay.emberParticles.getMesh().visible = anyEmber;
  overlay.smokeParticles.update(timeSeconds);
  overlay.emberParticles.update(timeSeconds);
}
