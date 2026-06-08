// v0.1

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createGrid, axialToWorld } from './grid.js';
import { CameraControls } from './controls.js';

export function initScene() {

  // 💥 WAIT DOM READY
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScene);
    return;
  }

  const canvas = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  const controls = new CameraControls(camera, canvas);
  
  const keyZ = document.getElementById("keyZ"); 
  const keyQ = document.getElementById("keyQ"); 
  const keyS = document.getElementById("keyS"); 
  const keyD = document.getElementById("keyD");
  
  const tiles = new Map();
  const tileMeshes = new Map();
  let deck = [];
  let rotationIndex = 0; // 0 à 5 (hex = 6 orientations)
  let hoveredHex = null;

	const EDGE_COLOR = {
	  field: 0xF2D16B,   // champs de blé (jaune)
	  forest: 0x7A4E2D,  // forêt (marron)
	  water: 0x3A7DFF,   // eau (bleu)
	  rail: 0xDDDDDD,    // rails (gris clair)
	  house: 0xD14B4B,   // maisons (rouge brique)
	  grass: 0x2ECC71    // champs / prairie (vert)
	};
    
const btnResetCamera = document.getElementById("btnResetCamera");

btnResetCamera.addEventListener("click", (e) => {
  e.stopPropagation();
  controls.resetCamera();
});
	
	
	
	
	
  

  scene.add(createGrid());
	deck = [
	  generateTile(),
	  generateTile(),
	  generateTile(),
	  generateTile(),
	  generateTile()
	];

	updateTileUI();  

  const hoverMesh = createFillHex(0x33ff66);
  const selectedMesh = createFillHex(0xff3333);
  
	const ghostTile = new THREE.Group();
	ghostTile.visible = false;
	scene.add(ghostTile);  

  hoverMesh.visible = false;
  selectedMesh.visible = false;

  scene.add(hoverMesh);
  scene.add(selectedMesh);

  let selectedHex = null;

  // 💥 HUD SAFE BIND
  const dbgHover = document.getElementById("dbgHover");
  // const dbgLastHover = document.getElementById("dbgLastHover");
  const dbgSelected = document.getElementById("dbgSelected");



function buildGhost(edges) {
  ghostTile.clear();

  const rotatedEdges = rotateEdges(edges, rotationIndex);

  const mesh = createTileMesh(rotatedEdges);

  mesh.traverse(child => {
    if (child.material) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.35;
    }
  });

  ghostTile.add(mesh);
}


function generateTile() {
  return {
    edges: randomEdges()
  };
}

function randomEdges() {
  const types = ["field", "forest", "water", "rail", "house", "grass"];

  return {
    n: types[Math.floor(Math.random() * types.length)],
    ne: types[Math.floor(Math.random() * types.length)],
    se: types[Math.floor(Math.random() * types.length)],
    s: types[Math.floor(Math.random() * types.length)],
    sw: types[Math.floor(Math.random() * types.length)],
    nw: types[Math.floor(Math.random() * types.length)]
  };
}

const EDGE_ORDER = ["n", "ne", "se", "s", "sw", "nw"];

function rotateEdges(edges, steps) {
  const rotated = {};

  for (let i = 0; i < 6; i++) {
    const from = EDGE_ORDER[i];
    const to = EDGE_ORDER[(i + steps) % 6];
    rotated[to] = edges[from];
  }

  return rotated;
}



function createTileMesh(edges) {
  const group = new THREE.Group();

  const size = 1;

  // centre (debug base)
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 6),
    new THREE.MeshBasicMaterial({ color: 0x222833 })
  );
  center.rotation.x = -Math.PI / 2;
  group.add(center);

  // HEX VERTICES (dans le plan XZ)
  const vertices = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    vertices.push({
      x: Math.cos(angle) * size,
      z: Math.sin(angle) * size
    });
  }

  // EDGES = entre deux vertices
  const edgeDefs = [
    { key: "n",  a: 0, b: 1 },
    { key: "ne", a: 1, b: 2 },
    { key: "se", a: 2, b: 3 },
    { key: "s",  a: 3, b: 4 },
    { key: "sw", a: 4, b: 5 },
    { key: "nw", a: 5, b: 0 }
  ];

  edgeDefs.forEach(e => {

    const color = EDGE_COLOR[edges[e.key]];

    const va = vertices[e.a];
    const vb = vertices[e.b];

    const mx = (va.x + vb.x) / 2;
    const mz = (va.z + vb.z) / 2;

    const dx = vb.x - va.x;
    const dz = vb.z - va.z;

    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dz, dx);

    const geom = new THREE.BoxGeometry(length, 0.02, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color });

    const seg = new THREE.Mesh(geom, mat);

    seg.position.set(mx, 0.01, mz);
    seg.rotation.y = -angle;

    group.add(seg);
  });

  return group;
}











  function safeSet(el, value) {
    if (el) el.textContent = value;
  }

  
  
  
  
controls.onHover = (hex) => {

  hoveredHex = hex;

  const key = `${hex.q},${hex.r}`;

  if (tiles.has(key)) {
    ghostTile.visible = false;
    return;
  }

  const pos = axialToWorld(hex.q, hex.r);

  ghostTile.position.set(pos.x, 0.003, pos.z);
  ghostTile.visible = true;

  buildGhost(deck[0].edges);

  safeSet(dbgHover, `${hex.q},${hex.r}`);
};




  
	  
controls.onClick = (hex) => {
	
	ghostTile.visible = false;

  const key = `${hex.q},${hex.r}`;
  if (tiles.has(key)) return;

	const baseTile = deck[0];
	const tile = {
	  edges: rotateEdges(baseTile.edges, rotationIndex)
	};

  tiles.set(key, {
    q: hex.q,
    r: hex.r,
    edges: tile.edges
  });

  const pos = axialToWorld(hex.q, hex.r);

  const mesh = createTileMesh(tile.edges);

  mesh.position.set(pos.x, 0.003, pos.z);

  scene.add(mesh);
  tileMeshes.set(key, mesh);

  selectedHex = hex;

  selectedMesh.position.set(pos.x, 0.004, pos.z);
  selectedMesh.visible = true;

  safeSet(dbgSelected, `${hex.q},${hex.r}`);

  deck.shift();
  deck.push(generateTile());

  updateTileUI();
};
  
  
  
function renderMini(tile) {
  if (!tile) return "";

  const c = EDGE_COLOR;
  const e = tile.edges;

  function col(x) {
    return "#" + c[x].toString(16).padStart(6, "0");
  }

  return `
    <div style="width:40px;height:40px;display:grid;grid-template-columns:repeat(3,1fr);gap:2px">
      <div></div>
      <div style="background:${col(e.n)}"></div>
      <div></div>

      <div style="background:${col(e.nw)}"></div>
      <div></div>
      <div style="background:${col(e.ne)}"></div>

      <div style="background:${col(e.sw)}"></div>
      <div></div>
      <div style="background:${col(e.se)}"></div>

      <div></div>
      <div style="background:${col(e.s)}"></div>
      <div></div>
    </div>
  `;
} 


function updateTileUI() {
  const active = document.getElementById("activeTile");
  const next = document.getElementById("nextTile");

  if (!deck.length) return;

  if (active) active.innerHTML = renderMini(deck[0]);
  if (next) next.innerHTML = renderMini(deck[1]);
} 
  

	function setKey(el, active) {
	  if (!el) return;
	  el.classList.toggle("active", active);
	}
	
	function getTileColor(type) {
	switch(type) {
    case "grass": return 0x3bd16f;
    default: return 0xffffff;
  }
}

  function animate() {
    requestAnimationFrame(animate);
	controls.update(); // 💥 IMPORTANT

	setKey(keyZ, controls.keys.z);
	setKey(keyQ, controls.keys.q);
	setKey(keyS, controls.keys.s);
	setKey(keyD, controls.keys.d);	
	
    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  
  
  
window.addEventListener("keydown", (e) => {

  if (e.key.toLowerCase() === "r") {
    rotationIndex = (rotationIndex + 1) % 6;

    // refresh ghost immédiatement
    const hex = hoveredHex;
    if (hex) {
      const key = `${hex.q},${hex.r}`;
      if (!tiles.has(key)) {
        buildGhost(deck[0].edges);
      }
    }
  }
});  




  function createFillHex(color) {
  const shape = new THREE.Shape();
  const size = 1;

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;

    const x = Math.cos(angle) * size;
    const z = Math.sin(angle) * size;

    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }

  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;

  return mesh;
}
  
  
  
  
  
}