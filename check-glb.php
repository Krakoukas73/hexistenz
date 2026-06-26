<?php
// GLB Asset Browser - scan récursif du dossier 3d_glb
// Place ce fichier à côté du dossier 3d_glb dans XAMPP.

$rootDir = __DIR__ . DIRECTORY_SEPARATOR . 'glb';
$rootUrl = 'glb';
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

    .unused-diagonal {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    }

    .quality-badge {
      position: absolute;
      bottom: 6px;
      right: 6px;
      font-size: 24px;
      line-height: 1;
      z-index: 11;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.9));
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
      <h1>GLB browser des assets de Hexistenz</h1>
      <div class="stats"><span id="visibleCount">0</span> / <span id="totalCount">0</span> assets</div>
    </div>
    <div class="tools">
      <input id="search" type="search" placeholder="Filtrer par nom ou dossier...">
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

    <section id="log-section" style="margin-top:32px; border-top:1px solid var(--border); padding-top:20px;">
      <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px; flex-wrap:wrap;">
        <h2 style="margin:0; font-size:16px; text-transform:uppercase; letter-spacing:0.04em;">Rapport complet — tous les GLB</h2>
        <span id="log-status" style="color:var(--muted); font-size:13px;">Chargement des stats…</span>
        <button id="log-copy-btn" style="margin-left:auto; display:none;" title="Copier toutes les stats pour Claude">📋 Copier le rapport</button>
      </div>
      <div id="log-table-wrap" style="overflow-x:auto;">
        <table id="log-table" style="width:100%; border-collapse:collapse; font-family:Consolas,Monaco,monospace; font-size:12px; display:none;">
          <thead>
            <tr style="border-bottom:1px solid var(--border); color:var(--muted); text-align:left;">
              <th style="padding:6px 10px; cursor:pointer;" data-col="name">Fichier ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="size">Taille ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="tris">Polys ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="dc">DC ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="tex">Tex ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="gpu">~GPU ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="mat">Mat ↕</th>
              <th style="padding:6px 8px; cursor:pointer; text-align:right;" data-col="anim">Anim ↕</th>
              <th style="padding:6px 10px;">Dimensions tex</th>
            </tr>
          </thead>
          <tbody id="log-tbody"></tbody>
        </table>
      </div>
    </section>
  </main>

  <script>
    window.GLB_ASSETS = <?php echo json_encode($assets, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

    const PER_PAGE = 12;

    const allAssets = window.GLB_ASSETS || [];
    const grid = document.getElementById('grid');
    const empty = document.getElementById('empty');
    const searchInput = document.getElementById('search');
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
      return Math.max(1, Math.ceil(filtered.length / PER_PAGE));
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
      const start = (page - 1) * PER_PAGE;
      const items = filtered.slice(start, start + PER_PAGE);

      items.forEach(asset => {
        const card = document.createElement('article');
        card.className = 'card';

        const viewport = document.createElement('div');
        viewport.className = 'viewport';
        const note = document.createElement('div');
        note.className = 'lazy-note';
        note.textContent = 'Chargement...';
        viewport.appendChild(note);

        if (asset.path.includes('/unused')) {
          const diag = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          diag.setAttribute('class', 'unused-diagonal');
          diag.setAttribute('viewBox', '0 0 100 100');
          diag.setAttribute('preserveAspectRatio', 'none');
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
          line.setAttribute('x2', '100'); line.setAttribute('y2', '100');
          line.setAttribute('stroke', '#f87171');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          diag.appendChild(line);
          viewport.appendChild(diag);
        }

        const info = document.createElement('div');
        info.className = 'info';

        const filename = document.createElement('div');
        filename.className = 'filename';
        filename.textContent = assetDisplayPath(asset);
        filename.title = 'Cliquer pour copier le chemin relatif';
        filename.addEventListener('click', () => copyText(assetDisplayPath(asset)));

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

    /** Chemin relatif au dossier /glb/ : "/sous-dossier/fichier.glb" ou "fichier.glb" */
    function assetDisplayPath(asset) {
      return asset.folder ? `/${asset.folder}/${asset.name}` : asset.name;
    }

    async function copyText(text) {
      // Fallback execCommand pour HTTP local (XAMPP / pas de HTTPS)
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;width:1px;height:1px;';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        console.error('Copie échouée', e);
        return false;
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
      controls.enablePan = true;
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
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

          const triangles     = countTriangles(object);
          const stats         = countStats(object);
          const animationCount = Array.isArray(gltf.animations) ? gltf.animations.length : 0;
          if (meta) {
            meta.innerHTML = buildMetaHtml(asset.size || 0, triangles, stats, animationCount);
          }

          const gpuMbQ = stats.gpuBytes / (1024 * 1024);
          const hasRed = stats.meshes >= 8 || gpuMbQ >= 40 || stats.textures >= 6 || stats.materials >= 5;
          const hasOrange = stats.meshes >= 3 || gpuMbQ >= 10 || stats.textures >= 3 || stats.materials >= 2;
          const badge = document.createElement('div');
          badge.className = 'quality-badge';
          badge.textContent = hasRed ? '❌' : (hasOrange ? '⚠️' : '✅');
          container.appendChild(badge);

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

    /** Compte meshes (= DC), textures uniques (avec dimensions) et matériaux uniques dans un objet GLB. */
    function countStats(object) {
      let meshes = 0;
      const texMap = new Map(); // uuid → {w, h}
      const matSet = new Set();
      const TEX_SLOTS = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','alphaMap','lightMap'];
      object.traverse(child => {
        if (!child.isMesh) return;
        meshes++;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (!mat) return;
          matSet.add(mat.uuid);
          TEX_SLOTS.forEach(slot => {
            const tex = mat[slot];
            if (tex?.uuid && !texMap.has(tex.uuid)) {
              const w = tex.image?.width  ?? 0;
              const h = tex.image?.height ?? 0;
              texMap.set(tex.uuid, { w, h });
            }
          });
        });
      });
      const texSizes = [...texMap.values()];
      // Estimation VRAM GPU : w×h×4 octets × 4/3 (mipmaps)
      const gpuBytes = texSizes.reduce((s, t) => s + (t.w * t.h * 4 * 4 / 3), 0);
      return { meshes, textures: texMap.size, materials: matSet.size, texSizes, gpuBytes };
    }

    /** Résume les dimensions de texture de façon compacte : "3×2048 + 2×1024" */
    function formatTexSizes(texSizes) {
      if (!texSizes.length) return '';
      const groups = {};
      texSizes.forEach(({ w, h }) => {
        const dim = Math.max(w, h);
        const key = dim > 0 ? `${dim}` : '?';
        groups[key] = (groups[key] || 0) + 1;
      });
      return Object.entries(groups)
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([dim, cnt]) => cnt > 1 ? `${cnt}×${dim}px` : `${dim}px`)
        .join(' + ');
    }

    /** Construit le HTML de la ligne meta avec code couleur. */
    function buildMetaHtml(sizeBytes, triangles, stats, animCount) {
      const col = (v, lo, hi, loC, midC, hiC) =>
        `color:${v >= hi ? hiC : v >= lo ? midC : loC}`;

      const dcC   = col(stats.meshes,   3, 8,  'var(--accent)', '#fbbf24', '#f87171');
      const texC  = col(stats.textures, 3, 6,  'var(--accent)', '#fbbf24', '#f87171');
      const matC  = col(stats.materials,2, 5,  'var(--accent)', '#fbbf24', '#f87171');

      // GPU VRAM : vert < 10 MB, orange 10-40 MB, rouge > 40 MB
      const gpuMb   = stats.gpuBytes / (1024 * 1024);
      const gpuC    = gpuMb >= 40 ? '#f87171' : gpuMb >= 10 ? '#fb923c' : 'var(--accent)';
      const gpuStr  = stats.texSizes.length ? formatTexSizes(stats.texSizes) : '';
      const gpuTitle = gpuStr ? `${gpuStr} — ~${gpuMb.toFixed(0)} MB GPU (avec mipmaps)` : '';

      let html = `${formatBytes(sizeBytes)}`
               + ` <span style="color:var(--muted)">·</span> ${formatNumber(triangles)} ▲`
               + ` <span style="color:var(--muted)">·</span> <span style="${dcC}">${stats.meshes} DC</span>`
               + ` <span style="color:var(--muted)">·</span> <span style="${texC}" title="${gpuTitle}">${stats.textures} tex</span>`;
      if (stats.gpuBytes > 0)
        html += ` <span style="color:var(--muted)">·</span> <span style="color:${gpuC}" title="${gpuTitle}">~${gpuMb.toFixed(0)} MB GPU</span>`;
      if (stats.materials > 1)
        html += ` <span style="color:var(--muted)">·</span> <span style="${matC}">${stats.materials} mat</span>`;
      if (animCount)
        html += ` <span style="color:var(--muted)">·</span> 🎬 ${animCount} anim`;
      return html;
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
    prevButtons.forEach(btn => btn.addEventListener('click', () => changePage(-1)));
    nextButtons.forEach(btn => btn.addEventListener('click', () => changePage(1)));

    window.addEventListener('resize', () => renderPage());

    renderPage();

    // ===== RAPPORT COMPLET — chargement en arrière-plan =====
    const logStatus   = document.getElementById('log-status');
    const logCopyBtn  = document.getElementById('log-copy-btn');
    const logTable    = document.getElementById('log-table');
    const logTbody    = document.getElementById('log-tbody');

    let _logRows  = [];      // résultats triés
    let _logSort  = { col: 'gpu', dir: -1 }; // tri initial : GPU desc

    const COL_NUM = new Set(['size','tris','dc','tex','gpu','mat','anim']);

    async function initLog() {
      if (!allAssets.length) { logStatus.textContent = 'Aucun GLB.'; return; }
      const CONCURRENCY = 4;
      const results = new Array(allAssets.length).fill(null);
      let done = 0;

      function updateProgress() {
        logStatus.textContent = `Chargement des stats… ${done}/${allAssets.length}`;
      }
      updateProgress();

      async function loadOne(i) {
        const asset = allAssets[i];
        return new Promise(resolve => {
          new GLTFLoader().load(asset.path, gltf => {
            const triangles  = countTriangles(gltf.scene);
            const stats      = countStats(gltf.scene);
            const animCount  = Array.isArray(gltf.animations) ? gltf.animations.length : 0;
            results[i] = { asset, triangles, stats, animCount };
            // Libérer la mémoire du chargement background
            gltf.scene.traverse(o => {
              if (o.geometry) o.geometry.dispose();
              if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => { for (const k in m) { if (m[k]?.isTexture) m[k].dispose(); } m.dispose(); });
              }
            });
            done++; updateProgress(); resolve();
          }, undefined, () => {
            results[i] = { asset, error: true, triangles: 0, stats: { meshes: 0, textures: 0, materials: 0, texSizes: [], gpuBytes: 0 }, animCount: 0 };
            done++; updateProgress(); resolve();
          });
        });
      }

      // Batches de CONCURRENCY
      for (let i = 0; i < allAssets.length; i += CONCURRENCY) {
        const batch = [];
        for (let j = i; j < Math.min(i + CONCURRENCY, allAssets.length); j++) batch.push(loadOne(j));
        await Promise.all(batch);
      }

      _logRows = results.filter(Boolean);
      logStatus.textContent = `${_logRows.length} GLB chargés`;
      logCopyBtn.style.display = '';
      sortAndRenderLog();
    }

    function sortAndRenderLog() {
      const { col, dir } = _logSort;
      _logRows.sort((a, b) => {
        let va, vb;
        switch (col) {
          case 'name': va = a.asset.name.toLowerCase(); vb = b.asset.name.toLowerCase(); return dir * (va < vb ? -1 : va > vb ? 1 : 0);
          case 'size': va = a.asset.size || 0; vb = b.asset.size || 0; break;
          case 'tris': va = a.triangles; vb = b.triangles; break;
          case 'dc':   va = a.stats.meshes;    vb = b.stats.meshes;    break;
          case 'tex':  va = a.stats.textures;  vb = b.stats.textures;  break;
          case 'gpu':  va = a.stats.gpuBytes;  vb = b.stats.gpuBytes;  break;
          case 'mat':  va = a.stats.materials; vb = b.stats.materials; break;
          case 'anim': va = a.animCount;       vb = b.animCount;       break;
          default: va = 0; vb = 0;
        }
        return dir * (va - vb);
      });
      renderLogTable();
    }

    function renderLogTable() {
      logTbody.innerHTML = '';
      _logRows.forEach(row => {
        const { asset, triangles, stats, animCount, error } = row;
        const gpuMb  = stats.gpuBytes / (1024 * 1024);
        const gpuC   = gpuMb >= 40 ? '#f87171' : gpuMb >= 10 ? '#fb923c' : '#4ade80';
        const dcC    = stats.meshes >= 8 ? '#f87171' : stats.meshes >= 3 ? '#fbbf24' : '#4ade80';
        const texDims = formatTexSizes(stats.texSizes);

        const isUnused = asset.path.includes('/unused');
        const tr = document.createElement('tr');
        tr.style.cssText = `border-bottom:1px solid rgba(58,70,82,0.5);${isUnused ? ' opacity:0.42; filter:grayscale(0.5);' : ''}`;
        tr.innerHTML = `
          <td style="padding:5px 10px; color:${isUnused ? 'var(--muted)' : 'var(--text)'};">${error ? '⚠ ' : ''}${assetDisplayPath(asset)}</td>
          <td style="padding:5px 8px; text-align:right; color:var(--muted);">${formatBytes(asset.size || 0)}</td>
          <td style="padding:5px 8px; text-align:right; color:var(--muted);">${formatNumber(triangles)}</td>
          <td style="padding:5px 8px; text-align:right; color:${dcC};">${stats.meshes}</td>
          <td style="padding:5px 8px; text-align:right; color:var(--muted);">${stats.textures}</td>
          <td style="padding:5px 8px; text-align:right; font-weight:bold; color:${gpuC};">${gpuMb > 0 ? '~' + gpuMb.toFixed(0) + ' MB' : '—'}</td>
          <td style="padding:5px 8px; text-align:right; color:var(--muted);">${stats.materials || '—'}</td>
          <td style="padding:5px 8px; text-align:right; color:${animCount ? '#fbbf24' : 'var(--muted)'};">${animCount || '—'}</td>
          <td style="padding:5px 10px; color:var(--muted);">${texDims || '—'}</td>
        `;
        logTbody.appendChild(tr);
      });
      logTable.style.display = '';
    }

    // Tri au clic sur les en-têtes
    document.querySelectorAll('#log-table th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (_logSort.col === col) {
          _logSort.dir *= -1;
        } else {
          _logSort.col = col;
          _logSort.dir = COL_NUM.has(col) ? -1 : 1; // nombres desc, texte asc
        }
        sortAndRenderLog();
      });
    });

    // Bouton copier
    logCopyBtn.addEventListener('click', async () => {
      const date = new Date().toLocaleDateString('fr-FR');
      const lines = [
        `=== GLB Rapport Hexistenz — ${date} ===`,
        `Fichier                                 | Taille   |   Polys | DC  | Tex | ~GPU     | Mat | Anim | Dimensions tex`,
        `----------------------------------------|----------|---------|-----|-----|----------|-----|------|-----------------------------`,
      ];
      // Pour le copié : trié par GPU desc
      const sorted = [..._logRows].sort((a, b) => b.stats.gpuBytes - a.stats.gpuBytes);
      sorted.forEach(row => {
        const { asset, triangles, stats, animCount } = row;
        const gpuMb  = stats.gpuBytes > 0 ? `~${(stats.gpuBytes / (1024*1024)).toFixed(0)} MB` : '—';
        const texDims = formatTexSizes(stats.texSizes) || '—';
        const pad = (s, n) => String(s).padStart(n);
        const padL = (s, n) => String(s).padEnd(n);
        lines.push(
          `${padL(assetDisplayPath(asset), 40)}| ${padL(formatBytes(asset.size||0), 9)}| ${pad(formatNumber(triangles), 7)} | ${pad(stats.meshes, 3)} | ${pad(stats.textures, 3)} | ${padL(gpuMb, 9)}| ${pad(stats.materials||0, 3)} | ${pad(animCount||0, 4)} | ${texDims}`
        );
      });
      const text = lines.join('\n');
      const ok = await copyText(text);
      logCopyBtn.textContent = ok ? '✅ Copié !' : '❌ Échec — voir console';
      setTimeout(() => { logCopyBtn.textContent = '📋 Copier le rapport'; }, 2000);
    });

    initLog();
  </script>
</body>
</html>
