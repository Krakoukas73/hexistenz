import { DEFAULT_VISUAL_ENVIRONMENT_CONFIG, cloneVisualConfig, applyColorGradingUniforms } from './visualEnvironment.js';

const SLIDERS = [
  ['renderer.toneMappingExposure', 'Exposition globale', 0.20, 3.00, 0.01],
  ['environment.fogDensity', 'Densité du brouillard', 0.000, 0.080, 0.001],
  ['lights.hemisphereIntensity', 'Lumière du ciel', 0.00, 2.00, 0.01],
  ['lights.sunIntensity', 'Intensité du soleil', 0.00, 8.00, 0.01],
  ['lights.sunOrbitRadius', 'Rayon orbite soleil', 2.0, 28.0, 0.1],
  ['lights.sunOrbitHeight', 'Hauteur du soleil', 1.0, 24.0, 0.1],
  ['lights.sunOrbitSpeed', 'Vitesse orbite soleil', 0.0, 0.30, 0.001],
  ['lights.sunVisualScale', 'Taille visuelle soleil', 0.20, 3.00, 0.01],
  ['lights.fillIntensity', 'Lumière de remplissage', 0.00, 1.00, 0.005],

  ['grading.brightness', 'Luminosité', -0.50, 0.50, 0.005],
  ['grading.contrast', 'Contraste', 0.40, 2.40, 0.01],
  ['grading.saturation', 'Saturation', 0.00, 2.40, 0.01],
  ['grading.vibrance', 'Vibrance', -1.00, 1.00, 0.01],
  ['grading.hue', 'Décalage de teinte', -0.50, 0.50, 0.001],
  ['grading.gamma', 'Gamma', 0.35, 2.50, 0.01],
  ['grading.blackLevel', 'Niveau des noirs', 0.00, 0.45, 0.001],
  ['grading.whiteLevel', 'Niveau des blancs', 0.55, 1.00, 0.001],
  ['grading.red', 'Canal rouge', 0.00, 2.00, 0.01],
  ['grading.green', 'Canal vert', 0.00, 2.00, 0.01],
  ['grading.blue', 'Canal bleu', 0.00, 2.00, 0.01],
  ['grading.redCurve', 'Courbe canal rouge', 0.30, 3.00, 0.01],
  ['grading.greenCurve', 'Courbe canal vert', 0.30, 3.00, 0.01],
  ['grading.blueCurve', 'Courbe canal bleu', 0.30, 3.00, 0.01],

  ['palette.strength', 'Force de la palette', 0.00, 1.00, 0.01],
  ['palette.saturation', 'Saturation de la palette', 0.00, 2.00, 0.01],
  ['palette.contrast', 'Contraste de la palette', 0.40, 2.00, 0.01],
  ['palette.warmShift', 'Balance chaud/froid', -0.20, 0.20, 0.001]
];

const COLORS = [
  ['environment.skyColor', 'Ciel'],
  ['environment.fogColor', 'Brouillard'],
  ['environment.domeColorTop', 'Dôme haut'],
  ['environment.domeColorBottom', 'Dôme bas'],
  ['lights.hemisphereSkyColor', 'Hémisphère ciel'],
  ['lights.hemisphereGroundColor', 'Hémisphère sol'],
  ['lights.sunColor', 'Soleil'],
  ['lights.fillColor', 'Remplissage'],
  ['palette.targets.field', 'Couleur champs'],
  ['palette.targets.forest', 'Couleur forêts'],
  ['palette.targets.grass', 'Couleur prairies'],
  ['palette.targets.house', 'Couleur villages'],
  ['palette.targets.rail', 'Couleur rails'],
  ['palette.targets.water', 'Couleur eau']
];


const HELP_TEXT = {
  'renderer.toneMappingExposure': 'Exposition générale du renderer Three.js. Augmente ou réduit la quantité globale de lumière avant l’étalonnage.',
  'environment.fogDensity': 'Densité du brouillard de scène. Plus la valeur monte, plus les éléments éloignés se fondent dans la couleur de brouillard.',
  'lights.hemisphereIntensity': 'Intensité de la lumière ambiante ciel/sol. Sert à éclairer les faces non touchées directement par le soleil.',
  'lights.sunIntensity': 'Puissance de la lumière directionnelle du soleil. Influence fortement les ombres et le relief.',
  'lights.sunOrbitRadius': 'Distance horizontale parcourue par le soleil autour de la scène. Change l’angle des ombres pendant l’orbite.',
  'lights.sunOrbitHeight': 'Hauteur verticale du soleil. Plus haut = ombres plus courtes ; plus bas = ombres plus longues et rasantes.',
  'lights.sunOrbitSpeed': 'Vitesse de déplacement orbital du soleil. À 0, les ombres deviennent statiques.',
  'lights.sunVisualScale': 'Taille apparente de l’objet soleil visible dans le ciel, sans changer directement sa puissance lumineuse.',
  'lights.fillIntensity': 'Lumière secondaire douce qui débouche les ombres. Utile pour éviter les zones trop noires.',

  'grading.brightness': 'Luminosité finale. Ajoute ou retire de la lumière après le rendu, comme un réglage d’étalonnage.',
  'grading.contrast': 'Contraste final. Augmente l’écart entre zones sombres et zones claires.',
  'grading.saturation': 'Saturation globale. Augmente ou réduit l’intensité de toutes les couleurs.',
  'grading.vibrance': 'Vibrance. Renforce surtout les couleurs faibles ou ternes en préservant davantage les couleurs déjà saturées.',
  'grading.hue': 'Décalage global de teinte. Fait tourner toutes les couleurs autour du cercle chromatique.',
  'grading.gamma': 'Correction gamma. Ajuste surtout les tons moyens sans agir comme une simple luminosité brute.',
  'grading.blackLevel': 'Niveau des noirs. Rehausse ou écrase le point noir, utile pour éviter un rendu trop bouché.',
  'grading.whiteLevel': 'Niveau des blancs. Contrôle le point blanc final, utile pour éviter une image brûlée ou trop plate.',
  'grading.red': 'Gain du canal rouge. Renforce ou réduit la composante rouge du rendu final.',
  'grading.green': 'Gain du canal vert. Renforce ou réduit la composante verte du rendu final.',
  'grading.blue': 'Gain du canal bleu. Renforce ou réduit la composante bleue du rendu final.',
  'grading.redCurve': 'Courbe du canal rouge. Modifie la réponse tonale du rouge, surtout dans les tons moyens.',
  'grading.greenCurve': 'Courbe du canal vert. Modifie la réponse tonale du vert, surtout dans les tons moyens.',
  'grading.blueCurve': 'Courbe du canal bleu. Modifie la réponse tonale du bleu, surtout dans les tons moyens.',

  'palette.strength': 'Force d’application de la palette sur les textures ciblées. Plus haut = recoloration plus visible.',
  'palette.saturation': 'Saturation appliquée après harmonisation palette. Permet de calmer ou pousser les textures recolorées.',
  'palette.contrast': 'Contraste appliqué aux couleurs harmonisées par palette.',
  'palette.warmShift': 'Balance chaud/froid de la palette. Valeur négative = plus froid ; positive = plus chaud.',

  'environment.skyColor': 'Couleur du fond de ciel du renderer.',
  'environment.fogColor': 'Couleur utilisée par le brouillard de scène.',
  'environment.domeColorTop': 'Couleur du haut du dôme d’environnement.',
  'environment.domeColorBottom': 'Couleur du bas du dôme d’environnement.',
  'lights.hemisphereSkyColor': 'Couleur de la partie ciel de la lumière hémisphérique.',
  'lights.hemisphereGroundColor': 'Couleur de la partie sol de la lumière hémisphérique.',
  'lights.sunColor': 'Couleur de la lumière du soleil.',
  'lights.fillColor': 'Couleur de la lumière de remplissage.',
  'palette.targets.field': 'Couleur cible utilisée pour harmoniser les textures de champs.',
  'palette.targets.forest': 'Couleur cible utilisée pour harmoniser les textures de forêts.',
  'palette.targets.grass': 'Couleur cible utilisée pour harmoniser les textures de prairies.',
  'palette.targets.house': 'Couleur cible utilisée pour harmoniser les textures de villages.',
  'palette.targets.rail': 'Couleur cible utilisée pour harmoniser les textures de rails.',
  'palette.targets.water': 'Couleur cible utilisée pour harmoniser les textures et shaders d’eau.'
};

export function createDebugLightUI({ visualEnvironment, postprocess }) {
  if (!visualEnvironment) return null;

  installDebugLightCss();

  const state = visualEnvironment.config ?? cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG);
  const root = document.createElement('section');
  root.id = 'debugLightPanel';
  root.className = 'debug-light-panel collapsed';
  root.innerHTML = `
    <button id="debugLightToggle" class="debug-light-toggle" type="button" title="Ouvrir ou fermer le panneau d’étalonnage LUT">LUT</button>
    <div class="debug-light-body">
      <div class="debug-light-head">
        <strong>ÉTALONNAGE VISUEL</strong>
        <button id="debugLightReset" type="button">Reset</button>
      </div>
      <div class="debug-light-switches">
        <label title="Active ou désactive l’étalonnage final appliqué après le rendu Three.js."><input id="debugGradingEnabled" type="checkbox"> Étalonnage final</label>
        <label title="Active ou désactive l’harmonisation de palette sur les textures ciblées."><input id="debugPaletteEnabled" type="checkbox"> Palette textures</label>
        <label title="Active ou désactive le mouvement orbital du soleil et donc des ombres."><input id="debugSunOrbitEnabled" type="checkbox"> Orbite soleil</label>
      </div>
      <div id="debugLightControls" class="debug-light-controls"></div>
      <div class="debug-light-export">
        <button id="debugLightExport" type="button">Exporter JSON</button>
        <button id="debugLightCopy" type="button">Copier</button>
      </div>
      <textarea id="debugLightJson" spellcheck="false"></textarea>
    </div>
  `;

  document.body.appendChild(root);

  const controls = root.querySelector('#debugLightControls');
  const json = root.querySelector('#debugLightJson');
  const gradingEnabled = root.querySelector('#debugGradingEnabled');
  const paletteEnabled = root.querySelector('#debugPaletteEnabled');
  const sunOrbitEnabled = root.querySelector('#debugSunOrbitEnabled');

  gradingEnabled.checked = state.grading?.enabled !== false;
  paletteEnabled.checked = state.palette?.enabled !== false;
  sunOrbitEnabled.checked = state.lights?.sunOrbitEnabled !== false;

  gradingEnabled.addEventListener('change', () => {
    setPath(state, 'grading.enabled', gradingEnabled.checked);
    applyAll();
  });

  paletteEnabled.addEventListener('change', () => {
    setPath(state, 'palette.enabled', paletteEnabled.checked);
    applyAll();
  });

  sunOrbitEnabled.addEventListener('change', () => {
    setPath(state, 'lights.sunOrbitEnabled', sunOrbitEnabled.checked);
    applyAll();
  });

  for (const [path, label, min, max, step] of SLIDERS) {
    controls.appendChild(createSlider(state, path, label, min, max, step, applyAll));
  }

  for (const [path, label] of COLORS) {
    controls.appendChild(createColorPicker(state, path, label, applyAll));
  }

  root.querySelector('#debugLightToggle').addEventListener('click', () => root.classList.toggle('collapsed'));
  root.querySelector('#debugLightExport').addEventListener('click', () => exportJson());
  root.querySelector('#debugLightCopy').addEventListener('click', async () => {
    exportJson();
    try { await navigator.clipboard.writeText(json.value); } catch (error) { console.warn('[debugLightUI] copie presse-papiers impossible', error); }
  });
  root.querySelector('#debugLightReset').addEventListener('click', () => {
    replaceDeep(state, cloneVisualConfig(DEFAULT_VISUAL_ENVIRONMENT_CONFIG));
    refreshInputs(root, state);
    applyAll();
    exportJson();
  });

  applyAll();
  exportJson();

  return {
    element: root,
    exportJson,
    applyAll
  };

  function applyAll() {
    visualEnvironment.apply(state);
    applyColorGradingUniforms(postprocess?.colorGradingPass, state);
  }

  function exportJson() {
    json.value = JSON.stringify(visualEnvironment.exportConfig(), null, 2);
  }
}

function createSlider(state, path, label, min, max, step, onChange) {
  const row = document.createElement('label');
  row.className = 'debug-light-row';

  const value = Number(getPath(state, path));
  const help = getHelpText(path);
  row.title = help;
  row.innerHTML = `
    <span title="${escapeHtml(help)}">${label}</span>
    <input data-path="${path}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" title="${escapeHtml(help)}">
    <output title="Valeur actuelle">${formatNumber(value)}</output>
  `;

  const input = row.querySelector('input');
  const output = row.querySelector('output');
  input.addEventListener('input', () => {
    const next = Number(input.value);
    setPath(state, path, next);
    output.textContent = formatNumber(next);
    onChange();
  });

  return row;
}

function createColorPicker(state, path, label, onChange) {
  const row = document.createElement('label');
  row.className = 'debug-light-row color-row';

  const value = normalizeHex(getPath(state, path));
  const help = getHelpText(path);
  row.title = help;
  row.innerHTML = `
    <span title="${escapeHtml(help)}">${label}</span>
    <input data-path="${path}" type="color" value="${value}" title="${escapeHtml(help)}">
    <output title="Valeur actuelle">${value}</output>
  `;

  const input = row.querySelector('input');
  const output = row.querySelector('output');
  input.addEventListener('input', () => {
    setPath(state, path, input.value);
    output.textContent = input.value;
    onChange();
  });

  return row;
}

function refreshInputs(root, state) {
  root.querySelector('#debugGradingEnabled').checked = state.grading?.enabled !== false;
  root.querySelector('#debugPaletteEnabled').checked = state.palette?.enabled !== false;
  root.querySelector('#debugSunOrbitEnabled').checked = state.lights?.sunOrbitEnabled !== false;

  root.querySelectorAll('[data-path]').forEach(input => {
    const value = getPath(state, input.dataset.path);
    input.value = input.type === 'color' ? normalizeHex(value) : Number(value);
    const output = input.parentElement?.querySelector('output');
    if (output) output.textContent = input.type === 'color' ? input.value : formatNumber(Number(input.value));
  });
}

function installDebugLightCss() {
  if (document.getElementById('debugLightCss')) return;

  const style = document.createElement('style');
  style.id = 'debugLightCss';
  style.textContent = `
    .debug-light-panel {
      position: fixed;
      right: 14px;
      top: 14px;
      z-index: 3000;
      width: min(390px, calc(100vw - 28px));
      max-height: calc(100vh - 28px);
      color: #f4ead6;
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: auto;
    }

    .debug-light-toggle {
      position: absolute;
      right: 0;
      top: 0;
      width: 64px;
      height: 34px;
      border: 1px solid rgba(255,255,255,0.28);
      border-radius: 10px;
      color: #1c140c;
      background: linear-gradient(135deg, #ffd36d, #b58239);
      font-weight: 800;
      letter-spacing: 0.08em;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }

    .debug-light-body {
      margin-top: 44px;
      padding: 12px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 14px;
      background: rgba(14, 20, 28, 0.88);
      backdrop-filter: blur(7px);
      box-shadow: 0 18px 55px rgba(0,0,0,0.45);
    }

    .debug-light-panel.collapsed .debug-light-body { display: none; }

    .debug-light-head,
    .debug-light-switches,
    .debug-light-export {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .debug-light-head button,
    .debug-light-export button {
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 8px;
      color: #f6ecd6;
      background: rgba(255,255,255,0.08);
      cursor: pointer;
      padding: 4px 8px;
    }

    .debug-light-controls {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      max-height: 49vh;
      overflow: auto;
      padding-right: 4px;
    }

    .debug-light-row {
      display: grid;
      grid-template-columns: 122px 1fr 58px;
      align-items: center;
      gap: 8px;
    }

    .debug-light-row input[type="range"] { width: 100%; }
    .debug-light-row input[type="color"] {
      width: 100%;
      height: 24px;
      border: 0;
      background: transparent;
    }

    .debug-light-row output {
      color: #ffd995;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    #debugLightJson {
      width: 100%;
      height: 112px;
      box-sizing: border-box;
      resize: vertical;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      color: #d8f7ff;
      background: rgba(0,0,0,0.40);
      padding: 8px;
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
  `;
  document.head.appendChild(style);
}


function getHelpText(path) {
  return HELP_TEXT[path] ?? 'Réglage visuel du panneau LUT.';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getPath(source, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], source);
}

function setPath(source, path, value) {
  const keys = path.split('.');
  let cursor = source;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

function replaceDeep(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    target[key] = value && typeof value === 'object' && !Array.isArray(value) ? replaceDeep({}, value) : value;
  }
  return target;
}

function normalizeHex(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value;
  return '#ffffff';
}

function formatNumber(value) {
  return Number(value).toFixed(Math.abs(value) < 0.1 ? 3 : 2);
}
