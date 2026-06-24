<?php
// GLB Asset Browser - scan récursif du dossier 3d_glb
// Place ce fichier à côté du dossier 3d_glb dans XAMPP.

$rootDir = __DIR__ . DIRECTORY_SEPARATOR . '3d_glb';
$rootUrl = '3d_glb';
$assets = [];

if (is_dir($rootDir)) {
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($rootDir, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $file) {
        if ($file->isFile() && strtolower($file->getExtension()) === 'glb') {
            $absolutePath = $file->getPathname();
            $relativePath = substr($absolutePath, strlen($rootDir) + 1);
            $relativePath = str_replace(DIRECTORY_SEPARATOR, '/', $relativePath);

            $assets[] = [
                'name' => basename($relativePath),
                'path' => $rootUrl . '/' . $relativePath,
                'folder' => dirname($relativePath) === '.' ? '' : dirname($relativePath),
                'size' => $file->getSize(),
            ];
        }
    }

    usort($assets, function ($a, $b) {
        return strcasecmp($a['path'], $b['path']);
    });
}
?><!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GLB Asset Browser</title>
  <style>
    :root {
      --bg: #121416;
      --panel: #1d2228;
      --panel2: #242b33;
      --text: #e8edf2;
      --muted: #9aa7b4;
      --border: #3a4652;
      --accent: #7cc7ff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: radial-gradient(circle at top, #202833 0, var(--bg) 40%, #090a0c 100%);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(18, 20, 22, 0.92);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .stats {
      color: var(--muted);
      font-size: 13px;
    }

    .tools {
      margin-left: auto;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    input, select, button {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 14px;
    }

    input { width: 260px; }
    button { cursor: pointer; }
    button:hover { border-color: var(--accent); }

    main { padding: 18px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }

    @media (max-width: 1400px) {
      .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }

    @media (max-width: 950px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 620px) {
      .grid { grid-template-columns: 1fr; }
      input { width: 100%; }
      .tools { margin-left: 0; width: 100%; }
    }

    .card {
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015));
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 12px 28px rgba(0,0,0,0.28);
      min-height: 330px;
      display: flex;
      flex-direction: column;
    }

    .viewport {
      height: 245px;
      background: #191d22;
      position: relative;
    }

    .viewport canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .lazy-note {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-size: 13px;
      pointer-events: none;
    }

    .info {
      padding: 10px 12px 12px;
      border-top: 1px solid var(--border);
      background: rgba(0,0,0,0.14);
    }

    .filename {
      font-weight: bold;
      font-size: 14px;
      word-break: break-word;
      cursor: pointer;
      color: var(--text);
    }

    .filename:hover { color: var(--accent); }

    .meta {
      color: var(--accent);
      margin-top: 7px;
      font-family: Consolas, Monaco, monospace;
      font-size: 12px;
    }

    .path {
      color: var(--muted);
      margin-top: 5px;
      font-family: Consolas, Monaco, monospace;
      font-size: 12px;
      word-break: break-all;
      cursor: pointer;
    }

    .pager {
      margin: 18px 0 0;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      color: var(--muted);
    }

    .empty {
      padding: 30px;
      border: 1px dashed var(--border);
      border-radius: 12px;
      color: var(--muted);
      background: rgba(255,255,255,0.03);
    }
  </style>

  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <header>
    <div>
      <h1>GLB Asset Browser</h1>
      <div class="stats"><span id="visibleCount">0</span> / <span id="totalCount">0</span> assets</div>
    </div>
    <div class="tools">
      <input id="search" type="search" placeholder="Filtrer par nom ou dossier...">
      <select id="perPage">
        <option value="12">12/page</option>
        <option value="24" selected>24/page</option>
        <option value="48">48/page</option>
        <option value="96">96/page</option>
      </select>
      <button id="prevBtn">◀</button>
      <span id="pageLabel">Page 1/1</span>
      <button id="nextBtn">▶</button>
    </div>
  </header>

  <main>
    <div id="grid" class="grid"></div>
    <div id="empty" class="empty" style="display:none"></div>
    <div class="pager">
      <button id="prevBtn2">◀ Précédent</button>
      <span id="pageLabel2">Page 1/1</span>
      <button id="nextBtn2">Suivant ▶</button>
    </div>
  </main>

  <script>
    window.GLB_ASSETS = <?php echo json_encode($assets, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

    const allAssets = window.GLB_ASSETS || [];
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const searchInput = document.getElementById('search');
    const perPageSelect = document.getElementById('perPage');
    const totalCount = document.getElementById('totalCount');
    const visibleCount = document.getElementById('visibleCount');
    const pageLabels = [document.getElementById('pageLabel'), document.getElementById('pageLabel2')];
    const prevButtons = [document.getElementById('prevBtn'), document.getElementById('prevBtn2')];
    const nextButtons = [document.getElementById('nextBtn'), document.getElementById('nextBtn2')];

    const loader = new GLTFLoader();
    let page = 1;
    let filtered = [...allAssets];
    let activeViewers = [];

    totalCount.textContent = allAssets.length;

    function disposeViewer(viewer) {
      if (!viewer) return;
      viewer.disposed = true;
      if (viewer.frame) cancelAnimationFrame(viewer.frame);
      if (viewer.controls) viewer.controls.dispose();
      if (viewer.renderer) {
        viewer.renderer.dispose();
        if (viewer.renderer.domElement && viewer.renderer.domElement.parentNode) {
          viewer.renderer.domElement.parentNode.removeChild(viewer.renderer.domElement);
        }
      }
      if (viewer.scene) {
        viewer.scene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(mat => {
              for (const key in mat) {
                const value = mat[key];
                if (value && value.isTexture) value.dispose();
              }
              mat.dispose();
            });
          }
        });
      }
    }

    function clearViewers() {
      activeViewers.forEach(disposeViewer);
      activeViewers = [];
      grid.innerHTML = '';
    }

    function applyFilter() {
      const q = searchInput.value.trim().toLowerCase();
      filtered = allAssets.filter(asset => {
        return !q || asset.path.toLowerCase().includes(q) || asset.name.toLowerCase().includes(q);
      });
      page = 1;
      renderPage();
    }

    function getPageCount() {
      return Math.max(1, Math.ceil(filtered.length / Number(perPageSelect.value)));
    }

    function updatePager() {
      const pageCount = getPageCount();
      if (page > pageCount) page = pageCount;
      pageLabels.forEach(el => el.textContent = `Page ${page}/${pageCount}`);
      prevButtons.forEach(btn => btn.disabled = page <= 1);
      nextButtons.forEach(btn => btn.disabled = page >= pageCount);
      visibleCount.textContent = filtered.length;
    }

    function renderPage() {
      clearViewers();
      updatePager();

      if (!allAssets.length) {
        empty.style.display = 'block';
        empty.textContent = 'Aucun GLB trouvé. Place ce fichier à côté du dossier 3d_glb, puis ouvre-le via XAMPP/PHP.';
        return;
      }

      if (!filtered.length) {
        empty.style.display = 'block';
        empty.textContent = 'Aucun résultat pour ce filtre. Même Bender ne peut pas afficher ce qui n’existe pas.';
        return;
      }

      empty.style.display = 'none';
      const perPage = Number(perPageSelect.value);
      const start = (page - 1) * perPage;
      const items = filtered.slice(start, start + perPage);

      items.forEach(asset => {
        const card = document.createElement('article');
        card.className = 'card';

        const viewport = document.createElement('div');
        viewport.className = 'viewport';
        const note = document.createElement('div');
        note.className = 'lazy-note';
        note.textContent = 'Chargement...';
        viewport.appendChild(note);

        const info = document.createElement('div');
        info.className = 'info';

        const filename = document.createElement('div');
        filename.className = 'filename';
        filename.textContent = asset.name;
        filename.title = 'Cliquer pour copier le nom';
        filename.addEventListener('click', () => copyText(asset.name));

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${formatBytes(asset.size || 0)} · polys: calcul...`;

        const path = document.createElement('div');
        path.className = 'path';
        path.textContent = asset.path;
        path.title = 'Cliquer pour copier le chemin';
        path.addEventListener('click', () => copyText(asset.path));

        info.appendChild(filename);
        info.appendChild(meta);
        info.appendChild(path);
        card.appendChild(viewport);
        card.appendChild(info);
        grid.appendChild(card);

        createViewer(viewport, note, asset, meta);
      });
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
      const units = ['o', 'Ko', 'Mo', 'Go'];
      let value = bytes;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      const decimals = unitIndex === 0 || value >= 100 ? 0 : 1;
      return `${value.toFixed(decimals)} ${units[unitIndex]}`;
    }

    function formatNumber(value) {
      return new Intl.NumberFormat('fr-FR').format(Math.round(value || 0));
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        console.log(text);
      }
    }

    function createViewer(container, note, asset, meta) {
      const width = container.clientWidth || 320;
      const height = container.clientHeight || 240;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x191d22);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 10000);
      camera.position.set(3, 2, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      container.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.8;

      const hemi = new THREE.HemisphereLight(0xffffff, 0x2b3038, 2.4);
      scene.add(hemi);

      const dir = new THREE.DirectionalLight(0xffffff, 2.2);
      dir.position.set(4, 8, 6);
      scene.add(dir);

      const gridHelper = new THREE.GridHelper(6, 6, 0x384452, 0x2b333d);
      scene.add(gridHelper);

      const viewer = { scene, camera, renderer, controls, disposed: false, frame: null, clock: new THREE.Clock(), mixers: [] };
      activeViewers.push(viewer);

      loader.load(
        asset.path,
        gltf => {
          if (viewer.disposed) return;
          note.remove();
          const object = gltf.scene;
          scene.add(object);
          prepareMaterials(object);
          fitObject(object, camera, controls);

          const triangles = countTriangles(object);
          const animationCount = Array.isArray(gltf.animations) ? gltf.animations.length : 0;
          if (meta) {
            meta.textContent = `${formatBytes(asset.size || 0)} · ${formatNumber(triangles)} polys` + (animationCount ? ` · ${animationCount} anim.` : '');
          }

          if (animationCount) {
            const mixer = new THREE.AnimationMixer(object);
            gltf.animations.forEach(clip => {
              const action = mixer.clipAction(clip);
              action.play();
            });
            viewer.mixers.push(mixer);
          }
        },
        undefined,
        error => {
          console.error('Erreur GLB:', asset.path, error);
          note.textContent = 'Erreur chargement';
        }
      );

      function animate() {
        if (viewer.disposed) return;
        viewer.frame = requestAnimationFrame(animate);
        const delta = viewer.clock.getDelta();
        viewer.mixers.forEach(mixer => mixer.update(delta));
        controls.update();
        renderer.render(scene, camera);
      }
      animate();
    }

    function countTriangles(object) {
      let triangles = 0;
      object.traverse(child => {
        if (!child.isMesh || !child.geometry) return;
        const geometry = child.geometry;
        if (geometry.index) {
          triangles += geometry.index.count / 3;
        } else if (geometry.attributes && geometry.attributes.position) {
          triangles += geometry.attributes.position.count / 3;
        }
      });
      return triangles;
    }

    function prepareMaterials(object) {
      object.traverse(child => {
        if (!child.isMesh) return;
        child.frustumCulled = false;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => {
          if (!mat) return;
          mat.side = THREE.DoubleSide;
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.needsUpdate = true;
        });
      });
    }

    function fitObject(object, camera, controls) {
      object.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      if (!isFinite(maxDim) || maxDim <= 0) return;

      object.position.x -= center.x;
      object.position.y -= box.min.y;
      object.position.z -= center.z;
      object.updateMatrixWorld(true);

      const distance = Math.max(maxDim * 1.8, 2.5);
      camera.position.set(distance, distance * 0.7, distance);
      camera.near = distance / 100;
      camera.far = distance * 100;
      camera.updateProjectionMatrix();

      controls.target.set(0, Math.max(size.y * 0.35, 0.25), 0);
      controls.update();
    }

    function changePage(delta) {
      const pageCount = getPageCount();
      page = Math.min(pageCount, Math.max(1, page + delta));
      renderPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    searchInput.addEventListener('input', applyFilter);
    perPageSelect.addEventListener('change', () => { page = 1; renderPage(); });
    prevButtons.forEach(btn => btn.addEventListener('click', () => changePage(-1)));
    nextButtons.forEach(btn => btn.addEventListener('click', () => changePage(1)));

    window.addEventListener('resize', () => renderPage());

    renderPage();
  </script>
</body>
</html>
