import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class CameraControls {
  constructor(camera, domElement) {

    this.camera = camera;
    this.dom = domElement;

    this.target = new THREE.Vector3(0, 0, 0);

    // orbit state
    this.spherical = new THREE.Spherical();
    this.spherical.radius = 15;
    this.spherical.theta = Math.PI / 4;
    this.spherical.phi = Math.PI / 3;

	// default camera state
	this.defaultRadius = 15;
	this.defaultTheta = Math.PI / 4;
	this.defaultPhi = Math.PI / 3;

    this.minRadius = 3;
    this.maxRadius = 80;

    this.rotateSpeed = 0.005;
    this.zoomSpeed = 1.2;

    // input
    this.isLeftDown = false;
    this.isRightDown = false;

    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.dragStartPoint = null;
    this.dragStartTarget = null;

    this.prev = new THREE.Vector2();

	this.keys = {
	  z: false,
	  q: false,
	  s: false,
	  d: false
	};

	this.keySpeed = 0.15;	

    // hover system
    this.currentHex = null;
    this.onHover = null;

    this._bindEvents();
    this._updateCamera();
	
	this.onClick = null;
	this.uiBlocked = false;
  }

  // -------------------------
  // EVENTS
  // -------------------------

  _bindEvents() {
    this.dom.addEventListener('contextmenu', e => e.preventDefault());

    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isLeftDown = true;
        this.dragStartPoint = null;
        this.dragStartTarget = null;
      }

      if (e.button === 2) {
        this.isRightDown = true;
      }

      this.prev.set(e.clientX, e.clientY);
    });
	
	this.dom.addEventListener('mousedown', (e) => {
	  if (this.uiBlocked) return;

	  if (e.button === 0) {
		if (this.onClick && this.currentHex) {
		  this.onClick(this.currentHex);
		}
	  }
	});

    window.addEventListener('mouseup', () => {
      this.isLeftDown = false;
      this.isRightDown = false;
      this.dragStartPoint = null;
      this.dragStartTarget = null;
    });

    this.dom.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.prev.x;
      const dy = e.clientY - this.prev.y;

      // rotation
      if (this.isRightDown) {
        this.spherical.theta -= dx * this.rotateSpeed;
        this.spherical.phi -= dy * this.rotateSpeed;

        const EPS = 0.000001;
        this.spherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, this.spherical.phi));
      }

      // pan
      if (this.isLeftDown) {
        this._pan(e.clientX, e.clientY);
      }

      // hover
      this._updateHover(e.clientX, e.clientY);

      this.prev.set(e.clientX, e.clientY);
      this._updateCamera();
    });

    this.dom.addEventListener('wheel', (e) => {
      e.preventDefault();

      this.spherical.radius *= (e.deltaY > 0) ? this.zoomSpeed : 1 / this.zoomSpeed;
      this.spherical.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.spherical.radius));

      this._updateCamera();
    });
	
	
	window.addEventListener('keydown', (e) => {
	  const k = e.key.toLowerCase();
	  if (this.keys[k] !== undefined) {
		this.keys[k] = true;
	  }
	});

	window.addEventListener('keyup', (e) => {
	  const k = e.key.toLowerCase();
	  if (this.keys[k] !== undefined) {
		this.keys[k] = false;
	  }
	});	
	
  }

  // -------------------------
  // CAMERA UPDATE
  // -------------------------

  _updateCamera() {

    const offset = new THREE.Vector3();

    offset.x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
    offset.y = this.spherical.radius * Math.cos(this.spherical.phi);
    offset.z = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);

    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
  
	update() {
	  this._applyKeyboardMovement();
	  this._updateCamera();
	}  
  
	_applyKeyboardMovement() {

	  const forward = new THREE.Vector3();
	  const right = new THREE.Vector3();

	  this.camera.getWorldDirection(forward);
	  forward.y = 0;
	  forward.normalize();

	  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

	  if (this.keys.z) this.target.add(forward.clone().multiplyScalar(this.keySpeed));
	  if (this.keys.s) this.target.add(forward.clone().multiplyScalar(-this.keySpeed));

	  if (this.keys.q) this.target.add(right.clone().multiplyScalar(-this.keySpeed));
	  if (this.keys.d) this.target.add(right.clone().multiplyScalar(this.keySpeed));
	}  
  

  // -------------------------
  // PAN (stable world drag)
  // -------------------------

  _getWorldPoint(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();

    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.plane, hit);

    return ok ? hit : null;
  }

  
  
  _pan(clientX, clientY) {
    const worldPoint = this._getWorldPoint(clientX, clientY);
    if (!worldPoint) return;

    if (!this.dragStartPoint) {
      this.dragStartPoint = worldPoint.clone();
      this.dragStartTarget = this.target.clone();
      return;
    }

    const delta = new THREE.Vector3()
      .copy(this.dragStartPoint)
      .sub(worldPoint);

    this.target.copy(this.dragStartTarget).add(delta);
  }
  
  

  // -------------------------
  // HOVER SYSTEM
  // -------------------------

_updateHover(clientX, clientY) {
  const world = this._getWorldPoint(clientX, clientY);
  if (!world) return;

  const hex = this.worldToAxial(world.x, world.z, 1);

  if (this.currentHex &&
      this.currentHex.q === hex.q &&
      this.currentHex.r === hex.r) {
    return;
  }

  this.currentHex = hex;

  if (this.onHover) {
    this.onHover(hex, world);
  }
}

  // -------------------------
  // HEX MATH (CORRECT AXIAL)
  // -------------------------

	worldToAxial(x, z, size = 1) {

  const q = (2/3 * x) / size;
  const r = (-1/3 * x + Math.sqrt(3)/3 * z) / size;

  return this._roundHex(q, r);
}


  _roundHex(q, r) {
    let x = q;
    let z = r;
    let y = -x - z;

    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    const dx = Math.abs(rx - x);
    const dy = Math.abs(ry - y);
    const dz = Math.abs(rz - z);

    if (dx > dy && dx > dz) {
      rx = -ry - rz;
    } else if (dy > dz) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }

    return { q: rx, r: rz };
  }
  
  
resetCamera() {
  this.target.set(0, 0, 0);

  this.spherical.radius = 15;
  this.spherical.theta = Math.PI / 4;
  this.spherical.phi = Math.PI / 3;

  this._updateCamera();
}
  
}