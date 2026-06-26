import { getWorldShapeMode, setWorldShapeMode } from './worldCurvature.js';

const STORAGE_KEY = 'dorfoPixelPostprocessSettings.v4';

const DEFAULTS = Object.freeze({
  enabled: false,
  pixelSize: 2,
  normalEdgeStrength: 0.20,
  depthEdgeStrength: 0.25,
  worldShapeMode: 'bouliste'
});

/** @deprecated PIX HUD fusionné dans le panel CUSTOMISATION de debugLightUi.js */
export function createPostprocessHud(_postprocess, _options = {}) {
  // No-op : la gestion PIX est désormais intégrée dans createDebugLightUI
  return null;
  // eslint-disable-next-line no-unreachable
  if (!_postprocess) return null;

  const settings = normalizeSettings({ ...DEFAULTS, ...postprocess.getSettings?.(), ...readStoredSettings(), ...options });
  postprocess.applySettings?.(settings);
  setWorldShapeMode(settings.worldShapeMode);

  const panel = document.createElement('aside');
  panel.id = 'postprocessHud';
  panel.className = 'postprocess-hud';
  panel.innerHTML = `
    <div class="postprocess-hud__head">
      <div>
        <div class="postprocess-hud__title">PIXELISATION DE LA GRILLE</div>
      </div>
      <label class="postprocess-switch" title="Activer / désactiver le postprocess pixelisé">
        <input id="ppEnabled" type="checkbox" />
        <span></span>
      </label>
      <button id="ppClose" class="postprocess-close-btn" type="button" title="Fermer">✕</button>
    </div>

    <label class="postprocess-control">
      <span>Rayon (pixels) <strong id="ppPixelSizeValue"></strong></span>
      <input id="ppPixelSize" type="range" min="1" max="50" step="1" />
    </label>

    <label class="postprocess-control">
      <span>Contour relief <strong id="ppNormalEdgeValue"></strong></span>
      <input id="ppNormalEdge" type="range" min="0" max="1" step="0.01" />
    </label>

    <label class="postprocess-control">
      <span>Contour profondeur <strong id="ppDepthEdgeValue"></strong></span>
      <input id="ppDepthEdge" type="range" min="0" max="1" step="0.01" />
    </label>

    <label class="postprocess-control">
      <span>Forme du monde <strong id="ppWorldShapeValue"></strong></span>
      <select id="ppWorldShape" class="postprocess-select">
        <option value="bouliste">Bouliste</option>
        <option value="platiste">Platiste</option>
      </select>
    </label>

    <button id="ppReset" class="postprocess-reset" type="button">Réinitialiser</button>
  `;

  document.body.appendChild(panel);

  const controls = {
    enabled: panel.querySelector('#ppEnabled'),
    pixelSize: panel.querySelector('#ppPixelSize'),
    pixelSizeValue: panel.querySelector('#ppPixelSizeValue'),
    normalEdgeStrength: panel.querySelector('#ppNormalEdge'),
    normalEdgeStrengthValue: panel.querySelector('#ppNormalEdgeValue'),
    depthEdgeStrength: panel.querySelector('#ppDepthEdge'),
    depthEdgeStrengthValue: panel.querySelector('#ppDepthEdgeValue'),
    worldShapeMode: panel.querySelector('#ppWorldShape'),
    worldShapeModeValue: panel.querySelector('#ppWorldShapeValue'),
    reset: panel.querySelector('#ppReset')
  };

  let current = settings;

  function renderControls(nextSettings) {
    current = normalizeSettings(nextSettings);
    controls.enabled.checked = current.enabled;
    controls.pixelSize.value = String(current.pixelSize);
    controls.pixelSizeValue.textContent = String(current.pixelSize);
    controls.normalEdgeStrength.value = String(current.normalEdgeStrength);
    controls.normalEdgeStrengthValue.textContent = current.normalEdgeStrength.toFixed(2);
    controls.depthEdgeStrength.value = String(current.depthEdgeStrength);
    controls.depthEdgeStrengthValue.textContent = current.depthEdgeStrength.toFixed(2);
    controls.worldShapeMode.value = current.worldShapeMode;
    controls.worldShapeModeValue.textContent = current.worldShapeMode === 'platiste' ? 'plat' : 'courbé';
    panel.classList.toggle('postprocess-hud--disabled', !current.enabled);
  }

  function commit(partial) {
    const next = normalizeSettings({ ...current, ...partial });
    postprocess.applySettings?.(next);
    setWorldShapeMode(next.worldShapeMode);
    renderControls(next);
    storeSettings(next);
  }

  controls.enabled.addEventListener('change', () => commit({ enabled: controls.enabled.checked }));
  controls.pixelSize.addEventListener('input', () => commit({ pixelSize: Number(controls.pixelSize.value) }));
  controls.normalEdgeStrength.addEventListener('input', () => commit({ normalEdgeStrength: Number(controls.normalEdgeStrength.value) }));
  controls.depthEdgeStrength.addEventListener('input', () => commit({ depthEdgeStrength: Number(controls.depthEdgeStrength.value) }));
  controls.worldShapeMode.addEventListener('change', () => commit({ worldShapeMode: controls.worldShapeMode.value }));
  controls.reset.addEventListener('click', event => {
    event.stopPropagation();
    commit(DEFAULTS);
  });

  panel.querySelector('#ppClose').addEventListener('click', event => {
    event.stopPropagation();
    panel.style.display = 'none';
    // Notifier debugLightUi pour re-syncer l'état du bouton PIX
    document.dispatchEvent(new CustomEvent('postprocess-hud-closed'));
  });

  // Évite qu'un clic/drag sur le HUD déplace la caméra. Satan a déjà assez de boulot.
  for (const eventName of ['pointerdown', 'pointermove', 'wheel', 'click', 'dblclick']) {
    panel.addEventListener(eventName, event => event.stopPropagation(), { passive: false });
  }

  renderControls(current);

  // Synchroniser le HUD si les settings sont modifiés depuis l'extérieur (ex: preset clic)
  postprocess.onExternalSettingsChange?.(changed => {
    renderControls({ ...current, ...changed });
  });

  return { element: panel, getSettings: () => ({ ...current }) };
}

function normalizeSettings(settings) {
  return {
    enabled: Boolean(settings.enabled),
    pixelSize: clamp(Math.round(Number(settings.pixelSize) || DEFAULTS.pixelSize), 1, 50),
    normalEdgeStrength: clamp(Number(settings.normalEdgeStrength) || 0, 0, 1),
    depthEdgeStrength: clamp(Number(settings.depthEdgeStrength) || 0, 0, 1),
    worldShapeMode: normalizeWorldShapeMode(settings.worldShapeMode ?? getWorldShapeMode())
  };
}

function normalizeWorldShapeMode(value) {
  return value === 'platiste' ? 'platiste' : 'bouliste';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStoredSettings() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSettings(settings) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage indisponible : aucun drame, juste pas de persistance.
  }
}
