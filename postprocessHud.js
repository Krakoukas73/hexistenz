const STORAGE_KEY = 'dorfoPixelPostprocessSettings.v3';

const DEFAULTS = Object.freeze({
  enabled: true,
  pixelSize: 2,
  normalEdgeStrength: 0.20,
  depthEdgeStrength: 0.25
});

export function createPostprocessHud(postprocess) {
  if (!postprocess) return null;

  const settings = normalizeSettings({ ...DEFAULTS, ...postprocess.getSettings?.(), ...readStoredSettings() });
  postprocess.applySettings?.(settings);

  const panel = document.createElement('aside');
  panel.id = 'postprocessHud';
  panel.className = 'postprocess-hud';
  panel.innerHTML = `
    <div class="postprocess-hud__head">
      <div>
        <div class="postprocess-hud__title">PIXEL POSTPROCESS</div>
        <div class="postprocess-hud__subtitle">Rendu 3D uniquement</div>
      </div>
      <label class="postprocess-switch" title="Activer / désactiver le postprocess pixelisé">
        <input id="ppEnabled" type="checkbox" />
        <span></span>
      </label>
    </div>

    <label class="postprocess-control">
      <span>Pixels <strong id="ppPixelSizeValue"></strong></span>
      <input id="ppPixelSize" type="range" min="1" max="10" step="1" />
    </label>

    <label class="postprocess-control">
      <span>Contour relief <strong id="ppNormalEdgeValue"></strong></span>
      <input id="ppNormalEdge" type="range" min="0" max="1" step="0.01" />
    </label>

    <label class="postprocess-control">
      <span>Contour profondeur <strong id="ppDepthEdgeValue"></strong></span>
      <input id="ppDepthEdge" type="range" min="0" max="1" step="0.01" />
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
    panel.classList.toggle('postprocess-hud--disabled', !current.enabled);
  }

  function commit(partial) {
    const next = normalizeSettings({ ...current, ...partial });
    postprocess.applySettings?.(next);
    renderControls(next);
    storeSettings(next);
  }

  controls.enabled.addEventListener('change', () => commit({ enabled: controls.enabled.checked }));
  controls.pixelSize.addEventListener('input', () => commit({ pixelSize: Number(controls.pixelSize.value) }));
  controls.normalEdgeStrength.addEventListener('input', () => commit({ normalEdgeStrength: Number(controls.normalEdgeStrength.value) }));
  controls.depthEdgeStrength.addEventListener('input', () => commit({ depthEdgeStrength: Number(controls.depthEdgeStrength.value) }));
  controls.reset.addEventListener('click', event => {
    event.stopPropagation();
    commit(DEFAULTS);
  });

  // Évite qu'un clic/drag sur le HUD déplace la caméra. Satan a déjà assez de boulot.
  for (const eventName of ['pointerdown', 'pointermove', 'wheel', 'click', 'dblclick']) {
    panel.addEventListener(eventName, event => event.stopPropagation(), { passive: false });
  }

  renderControls(current);
  return { element: panel, getSettings: () => ({ ...current }) };
}

function normalizeSettings(settings) {
  return {
    enabled: Boolean(settings.enabled),
    pixelSize: clamp(Math.round(Number(settings.pixelSize) || DEFAULTS.pixelSize), 1, 10),
    normalEdgeStrength: clamp(Number(settings.normalEdgeStrength) || 0, 0, 1),
    depthEdgeStrength: clamp(Number(settings.depthEdgeStrength) || 0, 0, 1)
  };
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
