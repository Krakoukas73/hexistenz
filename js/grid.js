import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const HEX_SIZE = 1;

export function axialToWorld(q, r) {
  return {
    x: HEX_SIZE * 1.5 * q,
    z: HEX_SIZE * Math.sqrt(3) * (r + q / 2)
  };
}

export function createGrid() {
  const group = new THREE.Group();

  const radius = 10;

  const material = new THREE.LineBasicMaterial({
    color: 0x2a3440
  });

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {

      const pos = axialToWorld(q, r);

      const hex = createHexWire(pos.x, 0, pos.z, HEX_SIZE, material);
      group.add(hex);

      const label = createLabel(`${q},${r}`);
      label.position.set(pos.x, 0.01, pos.z);
      group.add(label);
    }
  }

  return group;
}













function createHexWire(x, y, z, size, material) {
  const geometry = new THREE.BufferGeometry();

  const points = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;

    points.push(
      new THREE.Vector3(
        x + size * Math.cos(angle),
        y,
        z + size * Math.sin(angle)
      )
    );
  }

  points.push(points[0].clone());

  geometry.setFromPoints(points);

  return new THREE.Line(geometry, material);
}



// AFFICHER LES COORDONNEES DANS L'HEXAGONE
function createLabel(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = 256;
  canvas.height = 128;

  // fond léger pour contraste (important)
  // ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  // ctx.fillRect(0, 0, canvas.width, canvas.height);

  // bord glow léger
  // ctx.strokeStyle = 'rgba(120, 180, 255, 0.25)';
  // ctx.lineWidth = 4;
  // ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // texte plus gros + plus lisible
  ctx.font = 'bold 44px Arial';
  ctx.fillStyle = 'rgba(220, 240, 255, 0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // glow texte (double draw)
  ctx.shadowColor = 'rgba(80, 160, 255, 0.8)';
  ctx.shadowBlur = 12;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);

  // 🔥 PLUS GRAND VISUELLEMENT
  sprite.scale.set(1.4, 0.7, 1);

  return sprite;
}