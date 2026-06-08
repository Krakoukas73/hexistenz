import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { worldToAxial } from './hex.js';

const DEFAULT_CAMERA = {
  radius: 15,
  theta: Math.PI / 4,
  phi: Math.PI / 3
};

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
    this.rotateSpeed = 0.005;
    this.zoomSpeed = 1.2;
    this.keySpeed = 0.15;

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
    window.addEventListener('keydown', event => this.setKey(event.key, true));
    window.addEventListener('keyup', event => this.setKey(event.key, false));
  }

  update() {
    this.applyKeyboardMovement();
    this.updateCamera();
  }

  reset() {
    this.target.set(0, 0, 0);
    this.spherical.radius = DEFAULT_CAMERA.radius;
    this.spherical.theta = DEFAULT_CAMERA.theta;
    this.spherical.phi = DEFAULT_CAMERA.phi;
    this.updateCamera();
  }

  zoom(deltaY) {
    this.spherical.radius *= deltaY > 0 ? this.zoomSpeed : 1 / this.zoomSpeed;
    this.spherical.radius = THREE.MathUtils.clamp(
      this.spherical.radius,
      this.minRadius,
      this.maxRadius
    );
    this.updateCamera();
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
    this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, 0.000001, Math.PI - 0.000001);
  }

  applyKeyboardMovement() {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (this.keys.z) this.target.addScaledVector(forward, this.keySpeed);
    if (this.keys.s) this.target.addScaledVector(forward, -this.keySpeed);
    if (this.keys.q) this.target.addScaledVector(right, -this.keySpeed);
    if (this.keys.d) this.target.addScaledVector(right, this.keySpeed);
  }

  pan(clientX, clientY) {
    const worldPoint = this.getWorldPoint(clientX, clientY);
    if (!worldPoint) return;

    if (!this.dragStartPoint) {
      this.dragStartPoint = worldPoint.clone();
      this.dragStartTarget = this.target.clone();
      return;
    }

    this.target.copy(this.dragStartTarget).add(this.dragStartPoint.clone().sub(worldPoint));
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
    if (this.currentHex && this.currentHex.q === hex.q && this.currentHex.r === hex.r) return;

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
    const normalized = key.toLowerCase();
    if (this.keys[normalized] !== undefined) this.keys[normalized] = active;
  }

  updateCamera() {
    const offset = new THREE.Vector3();
    offset.x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
    offset.y = this.spherical.radius * Math.cos(this.spherical.phi);
    offset.z = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);

    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
}
