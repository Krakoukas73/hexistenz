import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { worldToAxial } from './hex.js';

const DEFAULT_CAMERA = {
  radius: 15,
  theta: Math.PI / 4,
  phi: Math.PI / 3
};

const MIN_POLAR_ANGLE = 0.000001;
const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;

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

    this.minRadius = 3;
    this.maxRadius = 80;
    this.rotateSpeed = 0.0026;
    // Zoom amorti : une molette Windows ne doit pas catapulter la caméra
    // comme un ascenseur de mine sans frein.
    this.zoomStep = 0.72;
    this.zoomDamping = 0.28;
    // Déplacement clavier volontairement amorti : ZQSD ne doit pas transformer
    // la caméra en mobylette volée par un gobelin sous amphétamines.
    this.keySpeed = 0.06325;
    this.keySmoothing = 0.16;
    this.keyStopSmoothing = 0.20;
    this.keyboardVelocity = new THREE.Vector3();
    this.panDragScale = 0.45;
    this.desiredRadius = this.spherical.radius;

    this.keys = { z: false, q: false, s: false, d: false };
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

    this.bindEvents();
    this.updateCamera();
  }

  bindEvents() {
    this.dom.addEventListener('contextmenu', event => event.preventDefault());
    this.dom.addEventListener('mousedown', event => this.handleMouseDown(event));
    this.dom.addEventListener('mousemove', event => this.handleMouseMove(event));
    this.dom.addEventListener('wheel', event => this.handleWheel(event), { passive: false });

    window.addEventListener('mouseup', () => this.stopDragging());
    window.addEventListener('keydown', event => {
      if (this.setKey(event.key, true)) event.preventDefault();
    });
    window.addEventListener('keyup', event => {
      if (this.setKey(event.key, false)) event.preventDefault();
    });
  }

  update() {
    this.applyKeyboardMovement();
    this.updateCamera();
  }

  reset() {
    this.target.set(0, 0, 0);
    this.spherical.radius = DEFAULT_CAMERA.radius;
    this.desiredRadius = DEFAULT_CAMERA.radius;
    this.spherical.theta = DEFAULT_CAMERA.theta;
    this.spherical.phi = DEFAULT_CAMERA.phi;
    this.updateCamera();
  }

  zoom(deltaY) {
    const direction = Math.sign(deltaY) || 0;
    if (!direction) return;

    // Wheel classique : deltaY vaut souvent 100 ou 120. Trackpad : valeurs fines.
    // On borne pour garder un zoom précis, progressif, presque mètre par mètre.
    const wheelStrength = THREE.MathUtils.clamp(Math.abs(deltaY) / 120, 0.18, 1);
    const deltaRadius = direction * this.zoomStep * wheelStrength;

    this.desiredRadius = THREE.MathUtils.clamp(
      this.desiredRadius + deltaRadius,
      this.minRadius,
      this.maxRadius
    );
  }

  handleMouseDown(event) {
    if (event.button === 0) {
      if (this.onClick && this.currentHex) this.onClick(this.currentHex);
      this.isLeftDown = true;
      this.dragStartPoint = null;
      this.dragStartTarget = null;
    }

    if (event.button === 2) this.isRightDown = true;
    this.prev.set(event.clientX, event.clientY);
  }

  handleMouseMove(event) {
    const dx = event.clientX - this.prev.x;
    const dy = event.clientY - this.prev.y;

    if (this.isRightDown) this.rotateCamera(dx, dy);
    if (this.isLeftDown) this.pan(event.clientX, event.clientY);

    this.updateHover(event.clientX, event.clientY);
    this.prev.set(event.clientX, event.clientY);
    this.updateCamera();
  }

  handleWheel(event) {
    event.preventDefault();
    this.updateHover(event.clientX, event.clientY);

    if (this.onWheel) this.onWheel(this.currentHex, event.deltaY);
    else this.zoom(event.deltaY);
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

    if (desiredVelocity.lengthSq() > 0) {
      desiredVelocity.normalize().multiplyScalar(this.keySpeed);
      this.keyboardVelocity.lerp(desiredVelocity, this.keySmoothing);
    } else {
      this.keyboardVelocity.lerp(new THREE.Vector3(0, 0, 0), this.keyStopSmoothing);
    }

    if (this.keyboardVelocity.lengthSq() > 0.000001) {
      this.target.add(this.keyboardVelocity);
    } else {
      this.keyboardVelocity.set(0, 0, 0);
    }
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
    this.target.lerp(desiredTarget, 0.55);
  }

  stopDragging() {
    this.isLeftDown = false;
    this.isRightDown = false;
    this.dragStartPoint = null;
    this.dragStartTarget = null;
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
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
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
