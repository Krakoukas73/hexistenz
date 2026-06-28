import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { worldToAxial } from './hex.js';
import { getWorldCurvatureDrop, intersectWorldCurvature } from './worldCurvature.js';

const DEFAULT_CAMERA = {
  radius: 15,
  theta: Math.PI / 4,
  phi: Math.PI / 3
};

const MIN_POLAR_ANGLE = 0.000001;
const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;
const CLICK_DRAG_CANCEL_DISTANCE = 6;
const SHIFT_NAVIGATION_MULTIPLIER = 3.5;

export class CameraControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.target = new THREE.Vector3(0, 0, 0);

    this.spherical = new THREE.Spherical(
      DEFAULT_CAMERA.radius,
      DEFAULT_CAMERA.phi,
      DEFAULT_CAMERA.theta
    );

    // Zoom minimum abaissé au maximum : mode ras-du-sol.
    this.minRadius = 0.15;
    this.maxRadius = 80;
    this.rotateSpeed = 0.0026;
    // Zoom amorti : easing cinéma, la molette glisse vers la cible.
    this.zoomStep = 0.58;
    this.zoomDamping = 0.18;   // original 0.24 → compromis cinéma
    // Vitesse clavier adaptée à l'altitude.
    // Cinéma = entre l'original abrupte et la version trop molle.
    this.keySpeed = 0.065;
    this.keyNearSpeed = 0.020;   // −43% vs original 0.035 : doux au sol, pas mort
    this.keyFarSpeed = 1.8;
    this.keyDistanceExponent = 1.8;
    this.keySmoothing = 0.130;
    this.keyNearSmoothing = 0.060;   // plus d'inertie près du sol (était 0.090)
    this.keyFarSmoothing = 0.160;
    this.keyStopSmoothing = 0.110;
    this.keyNearStopSmoothing = 0.055; // freinage plus progressif au sol (était 0.080)
    this.keyFarStopSmoothing = 0.150;
    this.keyboardVelocity = new THREE.Vector3();
    this.panDragScale = 0.45;
    this.desiredRadius = this.spherical.radius;

    this.keys = { z: false, q: false, s: false, d: false };
    this.shiftBoostActive = false;
    this.currentHex = null;

    this.onHover = null;
    this.onClick = null;
    this.onWheel = null;

    this.isLeftDown = false;
    this.isRightDown = false;
    this.prev = new THREE.Vector2();
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.dragStartPoint = null;
    this.dragStartTarget = null;
    this.leftDownStart = null;
    this.leftDownHex = null;
    this.leftDownMoved = false;

    this.bindEvents();
    this.updateCamera();
  }

  bindEvents() {
    this.dom.addEventListener('contextmenu', event => event.preventDefault());
    this.dom.addEventListener('mousedown', event => this.handleMouseDown(event));
    this.dom.addEventListener('mousemove', event => this.handleMouseMove(event));
    this.dom.addEventListener('wheel', event => this.handleWheel(event), { passive: false });

    window.addEventListener('mouseup', event => this.handleMouseUp(event));
    window.addEventListener('keydown', event => {
      this.shiftBoostActive = event.shiftKey;
      // Les raccourcis système/jeu (Ctrl+Z, Alt+..., etc.) ne doivent pas être
      // avalés par le déplacement caméra. ZQSD reste actif sans modificateur.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (this.setKey(event.key, true)) event.preventDefault();
    });
    window.addEventListener('keyup', event => {
      this.shiftBoostActive = event.shiftKey && event.key !== 'Shift';
      if (this.setKey(event.key, false)) event.preventDefault();
    });
    window.addEventListener('blur', () => {
      this.shiftBoostActive = false;
      Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
      this.keyboardVelocity.set(0, 0, 0);
    });
  }

  update() {
    this.applyKeyboardMovement();
    this.updateCamera();
  }

  reset() {
    this.target.set(0, getWorldCurvatureDrop(0, 0), 0);
    this.spherical.radius = DEFAULT_CAMERA.radius;
    this.desiredRadius = DEFAULT_CAMERA.radius;
    this.spherical.theta = DEFAULT_CAMERA.theta;
    this.spherical.phi = DEFAULT_CAMERA.phi;
    this.updateCamera();
  }

  zoom(deltaY, boosted = false) {
    const direction = Math.sign(deltaY) || 0;
    if (!direction) return;

    // Wheel classique : deltaY vaut souvent 100 ou 120. Trackpad : valeurs fines.
    // Le pas s'adapte sur TOUTE la plage minRadius→maxRadius :
    //   - ras-du-sol : micro-pas ultra-précis
    //   - vue éloignée : grande enjambée réactive
    const wheelStrength = THREE.MathUtils.clamp(Math.abs(deltaY) / 120, 0.18, 1);
    const nearFactor = THREE.MathUtils.clamp(
      (this.desiredRadius - this.minRadius) / Math.max(0.001, DEFAULT_CAMERA.radius - this.minRadius),
      0,
      1
    );
    const adaptiveStep = THREE.MathUtils.lerp(this.zoomStep * 0.22, this.zoomStep, nearFactor);
    const boostMultiplier = boosted ? SHIFT_NAVIGATION_MULTIPLIER : 1;
    const deltaRadius = direction * adaptiveStep * wheelStrength * boostMultiplier;

    this.desiredRadius = THREE.MathUtils.clamp(
      this.desiredRadius + deltaRadius,
      this.minRadius,
      this.maxRadius
    );
  }

  handleMouseDown(event) {
    this.updateHover(event.clientX, event.clientY);

    if (event.button === 0) {
      this.isLeftDown = true;
      this.dragStartPoint = null;
      this.dragStartTarget = null;
      this.leftDownStart = new THREE.Vector2(event.clientX, event.clientY);
      this.leftDownHex = this.currentHex ? { ...this.currentHex } : null;
      this.leftDownMoved = false;
    }

    if (event.button === 2) this.isRightDown = true;
    this.prev.set(event.clientX, event.clientY);
  }

  handleMouseMove(event) {
    const dx = event.clientX - this.prev.x;
    const dy = event.clientY - this.prev.y;

    if (this.isRightDown) this.rotateCamera(dx, dy);
    if (this.isLeftDown) {
      if (this.leftDownStart) {
        const dragDistance = this.leftDownStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
        if (dragDistance > CLICK_DRAG_CANCEL_DISTANCE) this.leftDownMoved = true;
      }
      this.pan(event.clientX, event.clientY);
    }

    this.updateHover(event.clientX, event.clientY);
    this.prev.set(event.clientX, event.clientY);
    this.updateCamera();
  }

  handleWheel(event) {
    event.preventDefault();
    this.updateHover(event.clientX, event.clientY);

    if (this.onWheel) this.onWheel(this.currentHex, event.deltaY, event.shiftKey);
    else this.zoom(event.deltaY, event.shiftKey);
  }

  rotateCamera(dx, dy) {
    this.spherical.theta -= dx * this.rotateSpeed;
    this.spherical.phi -= dy * this.rotateSpeed;
    this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);
  }

  applyKeyboardMovement() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const desiredVelocity = new THREE.Vector3();
    if (this.keys.z) desiredVelocity.add(forward);
    if (this.keys.s) desiredVelocity.addScaledVector(forward, -1);
    if (this.keys.q) desiredVelocity.addScaledVector(right, -1);
    if (this.keys.d) desiredVelocity.add(right);

    const distanceFactor = this.getKeyboardDistanceFactor();
    const moveSpeed = this.getKeyboardMoveSpeed(distanceFactor) * this.getNavigationMultiplier();
    const moveSmoothing = THREE.MathUtils.lerp(this.keyNearSmoothing, this.keyFarSmoothing, distanceFactor);
    const stopSmoothing = THREE.MathUtils.lerp(this.keyNearStopSmoothing, this.keyFarStopSmoothing, distanceFactor);

    if (desiredVelocity.lengthSq() > 0) {
      desiredVelocity.normalize().multiplyScalar(moveSpeed);
      this.keyboardVelocity.lerp(desiredVelocity, moveSmoothing);
    } else {
      this.keyboardVelocity.lerp(new THREE.Vector3(0, 0, 0), stopSmoothing);
    }

    if (this.keyboardVelocity.lengthSq() > 0.000001) {
      this.target.add(this.keyboardVelocity);
      this.target.y = getWorldCurvatureDrop(this.target.x, this.target.z);
    } else {
      this.keyboardVelocity.set(0, 0, 0);
    }
  }

  getNavigationMultiplier() {
    return this.shiftBoostActive ? SHIFT_NAVIGATION_MULTIPLIER : 1;
  }

  getKeyboardDistanceFactor() {
    const radius = Math.max(this.spherical.radius, this.desiredRadius);
    const normalized = THREE.MathUtils.clamp(
      (radius - this.minRadius) / (this.maxRadius - this.minRadius),
      0,
      1
    );

    // Smoothstep maison : évite le changement brutal de vitesse pendant le zoom.
    return normalized * normalized * (3 - 2 * normalized);
  }

  getKeyboardMoveSpeed(distanceFactor) {
    const radiusScale = Math.pow(
      THREE.MathUtils.clamp(this.spherical.radius / DEFAULT_CAMERA.radius, 0.20, 5.0),
      this.keyDistanceExponent
    );
    const scaledSpeed = this.keySpeed * radiusScale;
    const distanceSpeed = THREE.MathUtils.lerp(this.keyNearSpeed, this.keyFarSpeed, distanceFactor);

    // On prend le plus généreux des deux modèles : près du sol ça reste fin,
    // très loin ça cavale enfin au lieu de ramper comme un modem 56k agonisant.
    return THREE.MathUtils.clamp(
      Math.max(scaledSpeed, distanceSpeed),
      this.keyNearSpeed,
      this.keyFarSpeed
    );
  }

  pan(clientX, clientY) {
    const worldPoint = this.getWorldPoint(clientX, clientY);
    if (!worldPoint) return;

    if (!this.dragStartPoint) {
      this.dragStartPoint = worldPoint.clone();
      this.dragStartTarget = this.target.clone();
      return;
    }

    const desiredTarget = this.dragStartTarget.clone().add(
      this.dragStartPoint.clone().sub(worldPoint).multiplyScalar(this.panDragScale)
    );
    desiredTarget.y = getWorldCurvatureDrop(desiredTarget.x, desiredTarget.z);
    this.target.lerp(desiredTarget, 0.55);
  }

  handleMouseUp(event) {
    if (event.button === 0 && this.isLeftDown) {
      this.updateHover(event.clientX, event.clientY);
      const releasedOnStartHex = this.leftDownHex && this.currentHex
        && this.leftDownHex.q === this.currentHex.q
        && this.leftDownHex.r === this.currentHex.r;

      if (!this.leftDownMoved && releasedOnStartHex && this.onClick) {
        this.onClick(this.currentHex);
      }
    }

    if (event.button === 2) this.isRightDown = false;
    this.stopDragging();
  }

  stopDragging() {
    this.isLeftDown = false;
    this.isRightDown = false;
    this.dragStartPoint = null;
    this.dragStartTarget = null;
    this.leftDownStart = null;
    this.leftDownHex = null;
    this.leftDownMoved = false;
  }

  updateHover(clientX, clientY) {
    const world = this.getWorldPoint(clientX, clientY);
    if (!world) return;

    const hex = worldToAxial(world.x, world.z);

    this.currentHex = hex;
    if (this.onHover) this.onHover(hex, world);
  }

  getWorldPoint(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = intersectWorldCurvature(this.raycaster.ray, new THREE.Vector3());
    if (hit) return hit;

    // Secours plat si la courbure est désactivée ou si le rayon rate la surface.
    const flatHit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, flatHit) ? flatHit : null;
  }

  setKey(key, active) {
    const aliases = {
      arrowup: 'z',
      arrowleft: 'q',
      arrowdown: 's',
      arrowright: 'd'
    };

    const normalized = key.toLowerCase();
    const mappedKey = aliases[normalized] || normalized;

    if (this.keys[mappedKey] === undefined) return false;
    this.keys[mappedKey] = active;
    return true;
  }

  updateCamera() {
    // En mode bouliste, la cible caméra doit rester collée à la surface courbée.
    // Sinon, sur les cellules ajoutées loin du centre, le zoom vise encore le plan y=0 :
    // impression de mur invisible + clipping des tuiles proches.
    this.target.y = getWorldCurvatureDrop(this.target.x, this.target.z);
    this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);
    this.spherical.radius = THREE.MathUtils.lerp(
      this.spherical.radius,
      this.desiredRadius,
      this.zoomDamping
    );

    if (Math.abs(this.spherical.radius - this.desiredRadius) < 0.001) {
      this.spherical.radius = this.desiredRadius;
    }

    const offset = new THREE.Vector3();
    offset.x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
    offset.y = this.spherical.radius * Math.cos(this.spherical.phi);
    offset.z = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);

    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
}
