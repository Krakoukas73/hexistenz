<?php /* generate.php — aucune lib PHP requise, tout se passe dans le navigateur */ ?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hexistenz — Générateur de carte</title>
<style>
:root{
  --bg:#070a0f; --panel:rgba(0,0,0,.68); --border:rgba(120,180,255,.30);
  --accent:#78b4ff; --gold:#f0a832; --text:rgba(220,240,255,.92);
  --text2:rgba(160,200,240,.60); --r:10px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{
  min-height:100%;
  background:radial-gradient(circle at 50% 40%,#121a24 0%,#070a0f 70%,#04060a 100%);
  color:var(--text);font-family:monospace;padding:2rem 1rem 4rem;
}
h1{font-size:1.35rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:.3rem}
.sub{color:var(--text2);font-size:.78rem;margin-bottom:1.8rem}
.card{
  background:var(--panel);border:1px solid var(--border);border-radius:var(--r);
  padding:1.4rem 1.6rem;margin-bottom:1.1rem;
  box-shadow:0 8px 28px rgba(0,0,0,.45);max-width:760px;
}
/* drop zone */
#dz{
  border:2px dashed var(--border);border-radius:8px;padding:2.4rem 1rem;
  text-align:center;cursor:pointer;transition:border-color .2s,background .2s;
  position:relative;
}
#dz.over{border-color:var(--accent);background:rgba(120,180,255,.07)}
#dz.has{border-style:solid;border-color:rgba(120,180,255,.55)}
#dz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
#dz p{color:var(--text2);font-size:.83rem;pointer-events:none}
#dz .ico{font-size:2.2rem;margin-bottom:.4rem;pointer-events:none}
#prev{max-width:100%;max-height:210px;display:none;margin-top:.9rem;border-radius:6px;border:1px solid var(--border)}
/* form */
.row{display:flex;flex-wrap:wrap;gap:.9rem;margin-top:1.1rem}
.f{display:flex;flex-direction:column;gap:.28rem;flex:1;min-width:130px}
label{color:var(--text2);font-size:.73rem;text-transform:uppercase;letter-spacing:.07em}
input[type=text],input[type=number]{
  background:rgba(0,0,0,.5);border:1px solid var(--border);color:var(--text);
  font-family:monospace;font-size:.88rem;padding:.45rem .65rem;border-radius:6px;outline:none;
  transition:border-color .2s;
}
input:focus{border-color:var(--accent)}
/* bouton */
#btn{
  margin-top:1.3rem;padding:.6rem 1.7rem;
  background:linear-gradient(135deg,#1a3d7a,#112a55);
  border:1px solid var(--accent);color:var(--accent);font-family:monospace;
  font-size:.88rem;letter-spacing:.06em;border-radius:6px;cursor:pointer;
  transition:all .2s;text-transform:uppercase;
}
#btn:hover:not(:disabled){background:linear-gradient(135deg,#2255a8,#1a3d7a)}
#btn:disabled{opacity:.35;cursor:default}
/* log */
#log{
  min-height:60px;max-height:260px;overflow-y:auto;font-size:.8rem;line-height:1.75;
  background:rgba(0,0,0,.5);border:1px solid var(--border);border-radius:8px;padding:.9rem;
  scrollbar-width:thin;scrollbar-color:var(--border) transparent;
}
#log .ok  {color:#4fc978} #log .info{color:var(--accent)}
#log .warn{color:var(--gold)} #log .err {color:#e05050}
/* progress */
#progress{height:4px;background:rgba(120,180,255,.15);border-radius:2px;margin-bottom:.9rem;overflow:hidden;display:none}
#pbar{height:100%;width:0%;background:linear-gradient(90deg,var(--accent),#4fc978);transition:width .15s}
/* stats */
.brow{display:flex;align-items:center;gap:.65rem;margin:.18rem 0;font-size:.79rem}
.swatch{width:11px;height:11px;border-radius:2px;flex-shrink:0}
.fill{height:7px;border-radius:3px;opacity:.75}
.cnt{color:var(--text2);min-width:3ch;text-align:right}
/* spinner */
.spin{
  display:inline-block;width:12px;height:12px;border:2px solid var(--border);
  border-top-color:var(--accent);border-radius:50%;animation:sp .55s linear infinite;vertical-align:middle;margin-right:.4rem;
}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>

<h1>⬡ Hexistenz — Map Generator</h1>
<p class="sub">Analyse une carte image → grille hexagonale jouable · Tout se passe dans le navigateur</p>

<div class="card">
  <div id="dz">
    <input type="file" id="fi" accept="image/*">
    <div class="ico">🗺️</div>
    <p id="dzp">Glissez une carte ici ou cliquez pour parcourir<br>
       <small style="opacity:.55">JPEG · PNG · WebP · GIF · BMP</small></p>
    <img id="prev">
  </div>

  <div class="row">
    <div class="f">
      <label>Nom de la carte</label>
      <input type="text" id="mname" value="MAP" maxlength="20" placeholder="PARIS, LONDON…">
    </div>
    <div class="f">
      <label>Tuiles min</label>
      <input type="number" id="tmin" value="500" min="100" max="1900" step="50">
    </div>
    <div class="f">
      <label>Tuiles max</label>
      <input type="number" id="tmax" value="1000" min="101" max="2000" step="50">
    </div>
  </div>

  <button id="btn" onclick="startGenerate()" disabled>⬡ Générer le ZIP</button>
</div>

<div class="card" id="logCard" style="display:none">
  <div id="progress"><div id="pbar"></div></div>
  <div id="log"></div>
  <div id="stats" style="margin-top:.9rem;display:none"></div>
</div>

<!-- Canvas caché pour lecture pixel -->
<canvas id="cvs" style="display:none"></canvas>

<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
'use strict';
// ═══════════════════════════════════════════════════════════════
//  HEXISTENZ MAP GENERATOR — traitement 100 % navigateur
//  Règles synchronisées avec tileGenerator.js / placementRules.js
//
//  Directions axiales (IDENTIQUES à placementRules.js) :
//    'n'  → voisin (q+1, r)    |  opposé : 's'
//    'ne' → voisin (q,   r+1)  |  opposé : 'sw'
//    'se' → voisin (q-1, r+1)  |  opposé : 'nw'
//    's'  → voisin (q-1, r)    |  opposé : 'n'
//    'sw' → voisin (q,   r-1)  |  opposé : 'ne'
//    'nw' → voisin (q+1, r-1)  |  opposé : 'se'
// ═══════════════════════════════════════════════════════════════

const HEX_DIRS = {
  n:[ 1, 0], ne:[ 0, 1], se:[-1, 1],
  s:[-1, 0], sw:[ 0,-1], nw:[ 1,-1]
};
const OPP   = {n:'s',ne:'sw',se:'nw',s:'n',sw:'ne',nw:'se'};
const EDGES = ['n','ne','se','s','sw','nw'];
const NETWORK_TYPES  = ['water','rail'];
const MIN_NET_SEG    = 3; // segment réseau min (pas de traits de 1 ou 2 tuiles)
const BG_THRESHOLD   = 0.62; // fraction de "fond" au-dessus de laquelle la tuile est exclue

// ── Couleurs & icônes pour l'UI
const B_COLOR = {water:'#5ab4f0',rail:'#cccccc',forest:'#3a8a40',grass:'#78a84a',house:'#b8a070',field:'#d4b84a'};
const B_ICON  = {water:'💧',rail:'🚇',forest:'🌲',grass:'🌿',house:'🏠',field:'🌾'};

// ════════════════════════════════
//  UI helpers
// ════════════════════════════════
const $     = id => document.getElementById(id);
const log   = (m, c='') => { const d=$('log'); d.innerHTML+=`<div${c?` class="${c}"`:''}>${m}</div>`; d.scrollTop=d.scrollHeight; };
const prog  = p => { $('pbar').style.width = p+'%'; };
let   curFile = null;

// Drag & drop
const dz = $('dz');
['dragenter','dragover'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.add('over')}));
['dragleave','drop'].forEach(e=>dz.addEventListener(e,ev=>{ev.preventDefault();dz.classList.remove('over')}));
dz.addEventListener('drop', ev => { if(ev.dataTransfer.files[0]) setFile(ev.dataTransfer.files[0]); });
$('fi').addEventListener('change', ev => { if(ev.target.files[0]) setFile(ev.target.files[0]); });

function setFile(f) {
  if(!f.type.startsWith('image/')) return;
  curFile = f;
  const r = new FileReader();
  r.onload = e => {
    const img = $('prev');
    img.src = e.target.result; img.style.display='block';
    dz.classList.add('has');
    $('dzp').textContent = f.name + ' — prêt';
    $('btn').disabled = false;
  };
  r.readAsDataURL(f);
}

// ════════════════════════════════
//  POINT D'ENTRÉE
// ════════════════════════════════
async function startGenerate() {
  if(!curFile) return;
  if(typeof JSZip === 'undefined') { alert('JSZip non chargé — vérifiez votre connexion.'); return; }

  $('btn').disabled = true;
  $('logCard').style.display = '';
  $('log').innerHTML = ''; $('stats').style.display='none'; $('stats').innerHTML='';
  $('progress').style.display = ''; prog(0);

  const mapName  = ($('mname').value.trim().replace(/[^A-Z0-9_\-]/gi,'_') || 'MAP').toUpperCase().slice(0,20);
  const minTiles = Math.max(100, +$('tmin').value);
  const maxTiles = Math.min(2000, +$('tmax').value);

  log('<span class="spin"></span>Chargement de l\'image…', 'info');
  await tick();

  let imgData, imgW, imgH;
  try {
    ({imgData, imgW, imgH} = await loadAndSampleImage(curFile, 1100));
  } catch(e) { log('❌ '+e.message,'err'); $('btn').disabled=false; return; }

  log(`✓ Image ${imgW}×${imgH}px`, 'ok'); prog(10); await tick();

  // Taille hex en pixels
  const target = Math.round((minTiles + maxTiles) / 2);
  const S = computeHexSize(imgW, imgH, target);
  log(`⬡ Taille hex : ${S.toFixed(1)} px — cible ${target} tuiles`, 'info'); await tick();

  // Grille de biomes
  log('<span class="spin"></span>Analyse des couleurs…', 'info');
  const {biomeGrid, bgGrid} = buildBiomeGrid(imgData, imgW, imgH, S);
  prog(35); await tick();

  // Supprimer les tuiles de fond (bords organiques)
  for(const k of Object.keys(bgGrid)) if(bgGrid[k]) delete biomeGrid[k];

  // Ajuster au nombre de tuiles cible
  trimToRange(biomeGrid, minTiles, maxTiles, S, imgW, imgH);
  log(`✓ ${Object.keys(biomeGrid).length} tuiles après masquage fond`, 'ok'); prog(50); await tick();

  // Turbulence texturale (casse les grandes zones homogènes)
  applyTurbulence(biomeGrid, 0.13);

  // Nettoyage réseaux
  log('<span class="spin"></span>Cohérence eau & rail…', 'info');
  for(const net of NETWORK_TYPES) cleanupNetwork(biomeGrid, net);
  prog(70); await tick();

  // Construction des tuiles (arêtes + centre)
  const placed = buildPlacedTiles(biomeGrid);
  enhanceNetworkTermini(placed, biomeGrid);
  prog(85); await tick();

  const tileCount = Object.keys(placed).length;
  log(`✓ ${tileCount} tuiles finales`, 'ok');

  // Statistiques biomes
  const bstats = {};
  for(const b of Object.values(biomeGrid)) bstats[b] = (bstats[b]||0)+1;
  showStats(bstats, tileCount); prog(90); await tick();

  // JSON + ZIP
  log('<span class="spin"></span>Génération du JSON…', 'info');
  const json = buildRoomJson(Object.values(placed), mapName);
  const zip  = new JSZip();
  zip.file(`room_${mapName}.json`, json);
  const blob = await zip.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:9}});
  prog(100);

  // Téléchargement
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href=url; a.download=`room_${mapName}.zip`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 6000);

  log(`✓ Téléchargement lancé : <strong>room_${mapName}.zip</strong>`, 'ok');
  log('→ Copiez <code>room_'+mapName+'.json</code> dans le dossier <code>/json/games/</code> de Hexistenz', 'info');
  $('btn').disabled = false;
}

const tick = () => new Promise(r => setTimeout(r, 0));

// ════════════════════════════════
//  CHARGEMENT IMAGE → ImageData
// ════════════════════════════════
function loadAndSampleImage(file, maxDim) {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    const url  = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if(w === 0 || h === 0) { reject(new Error('Image vide.')); return; }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const cvs = $('cvs'); cvs.width = w; cvs.height = h;
      const ctx = cvs.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,w,h);
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      resolve({imgData, imgW:w, imgH:h});
    };
    img.onerror = () => reject(new Error('Impossible de décoder l\'image.'));
    img.src = url;
  });
}

// ════════════════════════════════
//  TAILLE HEX EN PIXELS
//  Surface par tuile ≈ S² × 2.598 (hex "flat-top")
// ════════════════════════════════
function computeHexSize(w, h, n) {
  const s = Math.sqrt(w * h / (n * 2.598));
  return Math.max(8, Math.min(100, s));
}

// ════════════════════════════════
//  HEX → PIXEL (même formule que axialToWorld)
// ════════════════════════════════
function hexToPixel(q, r, S, cx, cy) {
  return [cx + S * 1.5 * q, cy + S * 1.732 * (r + q * 0.5)];
}

// ════════════════════════════════
//  CONSTRUCTION DE LA GRILLE BIOMES
// ════════════════════════════════
function buildBiomeGrid(imgData, imgW, imgH, S) {
  const cx = imgW / 2, cy = imgH / 2;
  const qR = Math.ceil(imgW / (S * 1.5))  + 2;
  const rR = Math.ceil(imgH / (S * 1.732)) + 2;
  const biomeGrid = {}, bgGrid = {};

  for(let q = -qR; q <= qR; q++) {
    for(let r = -rR; r <= rR; r++) {
      const [px, py] = hexToPixel(q, r, S, cx, cy);
      if(px < -S || px > imgW+S || py < -S || py > imgH+S) continue;
      const [biome, bgFrac] = sampleHexBiome(imgData, imgW, imgH, Math.round(px), Math.round(py), S);
      const k = `${q},${r}`;
      biomeGrid[k] = biome;
      bgGrid[k] = bgFrac > BG_THRESHOLD;
    }
  }
  return {biomeGrid, bgGrid};
}

// ════════════════════════════════
//  ÉCHANTILLONNAGE D'UNE TUILE
// ════════════════════════════════
function sampleHexBiome(imgData, imgW, imgH, cx, cy, S) {
  const scores = {water:0, rail:0, forest:0, grass:0, house:0, field:0};
  let bgCount = 0, total = 0;
  const d = imgData.data;
  const step = Math.max(1, Math.round(S / 5));
  const iR   = Math.ceil(S);

  for(let dy = -iR; dy <= iR; dy += step) {
    for(let dx = Math.round(-iR*1.5); dx <= Math.round(iR*1.5); dx += step) {
      if(!inFlatHex(dx, dy, S)) continue;
      const px = cx + dx, py = cy + dy;
      if(px < 0 || px >= imgW || py < 0 || py >= imgH) { bgCount++; total++; continue; }
      const i  = (py * imgW + px) * 4;
      const r  = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
      if(a < 50) { bgCount++; total++; continue; } // transparent

      const ps = pixelScores(r, g, b);
      for(const [bio, sc] of Object.entries(ps)) {
        if(bio === '_bg') bgCount += sc > 0 ? 1 : 0;
        else scores[bio] += sc;
      }
      total++;
    }
  }

  const bgFrac = total > 0 ? bgCount / total : 1;
  // Réseaux détectés si ≥ 12 % des échantillons les identifient
  const wFrac = total > 0 ? scores.water / (total * 10) : 0;
  const rFrac = total > 0 ? scores.rail  / (total * 10) : 0;
  if(wFrac > 0.12) return ['water', bgFrac];
  if(rFrac > 0.12) return ['rail',  bgFrac];

  // Biome dominant
  let best = 'grass', bestSc = -1;
  for(const [b, s] of Object.entries(scores)) if(s > bestSc) { best = b; bestSc = s; }
  return [best, bgFrac];
}

// Hex "flat-top" : width = 2S, height = S√3
function inFlatHex(dx, dy, S) {
  const ax = Math.abs(dx) / S;
  const ay = Math.abs(dy) / (S * 0.866);
  return ax <= 1 && ay <= 1 && (ax * 0.5 + ay) <= 1;
}

// ════════════════════════════════
//  CLASSIFICATION COULEUR → SCORES BIOME
//  Calibré pour cartes géo / plans de ville / cartes IGN / plans de métro
// ════════════════════════════════
function pixelScores(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const sc = {water:0, rail:0, forest:0, grass:0, house:0, field:0, _bg:0};

  // Fond très clair → background
  if(l > 0.89) { sc._bg = 10; return sc; }
  // Très sombre → tracé / voie ferrée / route principale
  if(l < 0.14) { sc.rail = 10; return sc; }

  // ── EAU : bleu / cyan / bleu-gris ──
  if(h >= 185 && h <= 258 && s > 0.28 && l > 0.28) {
    sc.water += 10;
    // Bleu marine foncé = plutôt ligne de métro
    if(l < 0.38 && s > 0.55) sc.rail += 5;
  }

  // ── RAIL : couleurs vives non-naturelles (lignes métro sur plan) ──
  const isNatGreen = h >= 75  && h <= 165 && s > 0.22;
  const isNatBlue  = h >= 185 && h <= 258 && s > 0.28 && l > 0.38;
  if(s > 0.55 && l >= 0.28 && l <= 0.73 && !isNatGreen && !isNatBlue) sc.rail += 9;
  // Gris moyen = routes / rails sur fond de carte
  if(s < 0.13 && l >= 0.33 && l <= 0.68) sc.rail += 5;

  // ── FORÊT : vert foncé (parcs, bois) ──
  if(h >= 75 && h <= 165 && s > 0.25 && l < 0.46) sc.forest += 9;
  // ── PRAIRIE : vert clair ──
  if(h >= 75 && h <= 165 && s > 0.16 && l >= 0.46 && l <= 0.82) sc.grass += 8;

  // ── CHAMP : jaune / doré / ocre clair ──
  if(h >= 42 && h <= 82 && s > 0.28 && l > 0.48) sc.field += 8;

  // ── MAISON : tons chauds neutres, beige, urbain clair ──
  if(h >= 12 && h <= 58 && s >= 0.07 && s <= 0.46 && l >= 0.38 && l <= 0.84) sc.house += 7;
  if(l >= 0.74 && l <= 0.89 && s < 0.16) sc.house += 5; // blanc cassé = zone bâtie

  return sc;
}

// ════════════════════════════════
//  RGB → HSL
// ════════════════════════════════
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max + min) / 2;
  if(max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  let h;
  if     (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if(max === g) h = ((b - r) / d + 2) / 6;
  else               h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

// ════════════════════════════════
//  AJUSTEMENT [min, max] TUILES
// ════════════════════════════════
function trimToRange(grid, min, max, S, imgW, imgH) {
  const keys = Object.keys(grid);
  if(keys.length <= max && keys.length >= min) return;
  if(keys.length > max) {
    // Supprimer les tuiles les plus éloignées du centre image
    const cx = imgW/2, cy = imgH/2;
    const sorted = keys.sort((a,b) => {
      const [qa,ra] = a.split(',').map(Number);
      const [qb,rb] = b.split(',').map(Number);
      const [pax,pay] = hexToPixel(qa,ra,S,cx,cy);
      const [pbx,pby] = hexToPixel(qb,rb,S,cx,cy);
      const da = (pax-cx)**2+(pay-cy)**2, db = (pbx-cx)**2+(pby-cy)**2;
      return db - da; // les plus éloignés en premier
    });
    const toRm = keys.length - max;
    for(let i = 0; i < toRm; i++) delete grid[sorted[i]];
  }
}

// ════════════════════════════════
//  TURBULENCE TEXTURALE
//  Casse les grandes zones homogènes en introduisant des biomes voisins cohérents.
//  Règle : plus une tuile est entourée du même biome, plus elle est eligible.
//  Les réseaux (eau, rail) sont toujours préservés.
//  Biomes de substitution autorisés (cohérents visuellement) :
//    house  → grass, field       (quartiers entrecoupés de verdure)
//    grass  → field, house       (campagne avec champs et hameaux)
//    field  → grass              (champs parsemés de prairies)
//    forest → grass              (lisières de forêt)
// ════════════════════════════════
function applyTurbulence(grid, strength = 0.13) {
  const TURB = {
    house:  ['grass','field'],
    grass:  ['field','house'],
    field:  ['grass'],
    forest: ['grass'],
  };
  for(const [key, bio] of Object.entries(grid)) {
    if(NETWORK_TYPES.includes(bio)) continue;
    const alts = TURB[bio]; if(!alts) continue;

    const [q,r] = key.split(',').map(Number);
    let same = 0;
    for(const [dq,dr] of Object.values(HEX_DIRS)) {
      if(grid[`${q+dq},${r+dr}`] === bio) same++;
    }
    // Seulement à l'intérieur d'une zone (≥3 voisins identiques)
    // Probabilité proportionnelle à l'homogénéité locale
    if(same < 3) continue;
    const prob = strength * (same - 2) / 4; // 0..strength
    if(Math.random() > prob) continue;
    grid[key] = alts[Math.floor(Math.random() * alts.length)];
  }
}

// ════════════════════════════════
//  NETTOYAGE RÉSEAU EAU / RAIL
//  1. Supprimer les composantes connexes < MIN_NET_SEG tuiles
//  2. Élaguer les branches mortes de longueur 2 (dead-end → terminus seul)
// ════════════════════════════════
function cleanupNetwork(grid, netType) {
  // BFS composantes
  const netKeys = Object.keys(grid).filter(k => grid[k] === netType);
  const visited = new Set();
  const components = [];

  for(const start of netKeys) {
    if(visited.has(start)) continue;
    const comp = [], queue = [start];
    while(queue.length) {
      const cur = queue.shift();
      if(visited.has(cur)) continue;
      visited.add(cur); comp.push(cur);
      const [q,r] = cur.split(',').map(Number);
      for(const [dq,dr] of Object.values(HEX_DIRS)) {
        const nk = `${q+dq},${r+dr}`;
        if(grid[nk] === netType && !visited.has(nk)) queue.push(nk);
      }
    }
    components.push(comp);
  }

  // Supprimer composantes trop courtes
  for(const comp of components) {
    if(comp.length < MIN_NET_SEG) {
      for(const k of comp) grid[k] = fallbackBiome(k, grid, netType);
    }
  }

  // Élagage dead-ends de longueur 2 (boucle jusqu'à stabilité)
  let changed = true;
  while(changed) {
    changed = false;
    for(const k of Object.keys(grid)) {
      if(grid[k] !== netType) continue;
      const [q,r] = k.split(',').map(Number);
      const netNbs = Object.values(HEX_DIRS)
        .map(([dq,dr]) => `${q+dq},${r+dr}`)
        .filter(nk => grid[nk] === netType);
      if(netNbs.length !== 1) continue;
      // Vérifier si ce voisin unique est lui aussi un terminus
      const [nq,nr] = netNbs[0].split(',').map(Number);
      const vNetNbs = Object.values(HEX_DIRS)
        .map(([dq,dr]) => `${nq+dq},${nr+dr}`)
        .filter(nk => grid[nk] === netType);
      if(vNetNbs.length === 1) {
        // Segment de 2 → supprimer les deux
        grid[k]       = fallbackBiome(k,       grid, netType);
        grid[netNbs[0]] = fallbackBiome(netNbs[0], grid, netType);
        changed = true;
      }
    }
  }
}

function fallbackBiome(key, grid, exclude) {
  const [q,r] = key.split(',').map(Number);
  const counts = {};
  for(const [dq,dr] of Object.values(HEX_DIRS)) {
    const nb = grid[`${q+dq},${r+dr}`];
    if(nb && nb !== exclude && !NETWORK_TYPES.includes(nb)) counts[nb] = (counts[nb]||0)+1;
  }
  const best = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return best ? best[0] : 'grass';
}

// ════════════════════════════════
//  CONSTRUCTION DES TUILES PLACÉES
// ════════════════════════════════
function buildPlacedTiles(grid) {
  const placed = {};
  let id = 1;
  for(const [key, bio] of Object.entries(grid)) {
    const [q,r] = key.split(',').map(Number);
    const edges  = computeEdges(q, r, bio, grid);
    const center = computeCenter(edges, bio);
    placed[key] = {
      q, r, key,
      tile: {
        id: 't' + String(id++).padStart(4,'0'),
        edges, center, rotation: 0
      },
      score: 2,
      bonusTilesAwarded: 0,
      completedMissions: [],
      missionBonusTilesAwarded: 0,
      generatedMission: null,
      missionTurnBefore: 0,
      purgedMissions: [],
      consumedSpecialCell: null,
      consumedBonusCell: null,
    };
  }
  return placed;
}

// Biomes qu'une arête peut "emprunter" depuis un voisin (transitions naturelles)
// Clé = biome de la tuile, valeur = biomes voisins acceptables comme arête
const EDGE_BLEED_ACCEPT = {
  house:  new Set(['grass','field','forest']),
  grass:  new Set(['field','house','forest']),
  field:  new Set(['grass','house']),
  forest: new Set(['grass','field']),
};

// Bruit interne (arête ≠ biome même sans voisin différent)
const EDGE_INTRA_NOISE = {
  house:  ['grass','field'],
  grass:  ['field','house'],
  field:  ['grass'],
  forest: ['grass'],
};

// Probabilité de bleeding depuis un voisin différent
const P_BLEED  = 0.40;
// Probabilité de bruit interne (voisin identique / absent)
const P_INTRA  = 0.18;

function computeEdges(q, r, bio, grid) {
  const edges = {};
  for(const [edge, [dq,dr]] of Object.entries(HEX_DIRS)) {
    const nk  = `${q+dq},${r+dr}`;
    const nbo = grid[nk];

    if(NETWORK_TYPES.includes(bio)) {
      // Réseau : arête réseau si voisin = même réseau, sinon biome environnant
      edges[edge] = (nbo === bio) ? e(bio) : e(localSurround(bio, q, r, grid));
    } else {
      let edgeBio = bio;

      if(nbo && nbo !== bio && !NETWORK_TYPES.includes(nbo)) {
        // Voisin de biome différent → bleeding selon acceptation
        const accept = EDGE_BLEED_ACCEPT[bio];
        if(accept?.has(nbo) && Math.random() < P_BLEED) edgeBio = nbo;
      } else {
        // Voisin identique ou hors-grille → bruit interne
        const noise = EDGE_INTRA_NOISE[bio];
        if(noise && Math.random() < P_INTRA) {
          edgeBio = noise[Math.floor(Math.random() * noise.length)];
        }
      }
      edges[edge] = e(edgeBio);
    }
  }
  return edges;
}

function localSurround(netType, q, r, grid) {
  for(const [dq,dr] of Object.values(HEX_DIRS)) {
    const nb = grid[`${q+dq},${r+dr}`];
    if(nb && !NETWORK_TYPES.includes(nb)) return nb;
  }
  return 'grass';
}

// ════════════════════════════════
//  VALEURS D'ARÊTES (sync tileGenerator.js : pickForestValue, pickHouseValue, pickFieldValue)
//  forest → 1-6 équipondéré  |  house → 1-4  |  field → 1-2  |  autres → toujours 1
// ════════════════════════════════
function pickEdgeValue(type) {
  switch(type) {
    case 'forest': return 1 + Math.floor(Math.random() * 6); // [1..6]
    case 'house':  return 1 + Math.floor(Math.random() * 4); // [1..4]
    case 'field':  return 1 + Math.floor(Math.random() * 2); // [1..2]
    default: return 1;
  }
}

// Edge object format (cohérent avec createEdge de tileGenerator.js)
const e = (type, value) => ({type, value: value ?? pickEdgeValue(type)});

// Reproduit pickCenterFromEdges de tileGenerator.js
// Pour les biomes non-réseau : centre = type d'arête dominant (tiebreak → bio)
function computeCenter(edges, bio) {
  const vals = Object.values(edges);
  // Réseaux d'abord (règles strictes)
  const wc = vals.filter(x => x.type === 'water').length;
  if(wc >= 2) return 'water';
  if(vals.some(x => x.type === 'rail')) return 'rail';
  // Biome dominant
  const counts = {};
  for(const ed of vals) counts[ed.type] = (counts[ed.type]||0) + 1;
  let best = bio, bestN = 0;
  for(const [t, n] of Object.entries(counts)) {
    if(n > bestN) { best = t; bestN = n; }
  }
  return best;
}

// ════════════════════════════════
//  AMÉLIORATION DES TERMINAISONS
//  Règle : center = 'water'|'rail' requiert ≥ 2 arêtes du type réseau.
//  Un terminus (1 voisin réseau) reçoit une 2ᵉ arête réseau pointant
//  hors de la grille (le fleuve / la ligne continue hors-carte).
// ════════════════════════════════
function enhanceNetworkTermini(placed, grid) {
  for(const [key, pt] of Object.entries(placed)) {
    const bio = grid[key];
    if(!NETWORK_TYPES.includes(bio)) continue;
    const netEdges = Object.values(pt.tile.edges).filter(x => x.type === bio);
    if(netEdges.length >= 2) continue;
    // Chercher une arête pointant hors-grille
    const [q,r] = key.split(',').map(Number);
    for(const [edge, [dq,dr]] of Object.entries(HEX_DIRS)) {
      if(!grid[`${q+dq},${r+dr}`]) {
        pt.tile.edges[edge] = e(bio);
        break;
      }
    }
    pt.tile.center = computeCenter(pt.tile.edges, bio);
  }
}

// ════════════════════════════════
//  GÉNÉRATION DU JSON ROOM
//  Format identique à serializeCurrentGameState (scene.js)
// ════════════════════════════════
function buildRoomJson(tileList, mapName) {
  const now = Date.now();
  const ids = tileList.map(t => t.tile.id);
  const room = {
    code: mapName,
    createdAt: now, updatedAt: now,
    players: {}, cursors: {},
    state: {
      schemaVersion: 1, roomCode: mapName,
      createdAt: now, updatedAt: now,
      totalScore: tileList.length * 2,
      lastScore: 2, rotationIndex: 0, gameOver: false,
      placedTiles: tileList,
      placementHistory: [],
      specialCells: [],
      bonusCells: [],
      missionManager: {
        active: [],
        generatedTileIds: ids,
        targetLevelByType: {},
        nextId: 1,
        turn: tileList.length
      },
      players: {}, stats: {}
    }
  };
  return JSON.stringify(room, null, 2);
}

// ════════════════════════════════
//  STATS & UI
// ════════════════════════════════
function showStats(stats, total) {
  const sa = $('stats'); sa.style.display='';
  const maxN = Math.max(...Object.values(stats));
  sa.innerHTML = '<div style="color:var(--text2);font-size:.73rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.4rem">Répartition des biomes</div>';
  const sorted = Object.entries(stats).sort((a,b)=>b[1]-a[1]);
  for(const [biome, n] of sorted) {
    const pct = Math.round(n/total*100);
    const w   = Math.round(n/maxN*140);
    sa.innerHTML += `
      <div class="brow">
        <div class="swatch" style="background:${B_COLOR[biome]??'#888'}"></div>
        <span style="min-width:64px">${B_ICON[biome]??''} ${biome}</span>
        <div class="fill" style="width:${w}px;background:${B_COLOR[biome]??'#888'}"></div>
        <span class="cnt">${n}</span>
        <span style="color:var(--text2);font-size:.73rem;margin-left:.2rem">${pct}%</span>
      </div>`;
  }
}
</script>
</body>
</html>
