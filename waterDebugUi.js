/**
 * waterDebugUi.js — Panneau de réglage live de l'eau (écume + sillage).
 *
 * Sliders branchés sur les setters temps réel :
 *   realisticWater.setWaterFoamParams() / getWaterFoamParams()
 *   waterBoatOverlay.setWakeParams()    / getWakeParams()
 *
 * Bouton « 📋 Copier » : copie le JSON des réglages courants (water + wake)
 * dans le presse-papiers (fallback execCommand pour file:// / HTTP). Colle-le
 * dans le chat ou dans WATER_RENDER une fois un look validé.
 *
 * Bouton flottant « 💧 EAU » (bas-droite) pour afficher/masquer le panneau.
 */

import { getWaterFoamParams, setWaterFoamParams } from './realisticWater.js';
import { getWakeParams, setWakeParams } from './waterBoatOverlay.js';

const WATER_SLIDERS = [
  { key: 'foamWidth',    label: 'Écume — portée',     min: 0,     max: 1.2,  step: 0.01 },
  { key: 'foamScale',    label: 'Écume — finesse',    min: 1,     max: 12,   step: 0.1  },
  { key: 'foamDensity',  label: 'Écume — densité rive', min: 0,    max: 0.65, step: 0.005 },
  { key: 'foamAmbient',  label: 'Écume — surface',     min: 0,     max: 0.60, step: 0.005 },
  { key: 'foamSharp',    label: 'Écume — netteté',    min: 0.002, max: 0.08, step: 0.002 },
  { key: 'foamSpeed',    label: 'Écume — vitesse',    min: 0,     max: 15,   step: 0.1 },
  { key: 'deepDistance', label: 'Dégradé — étendue',  min: 0.2,   max: 2.0,  step: 0.05 },
  { key: 'opacity',      label: 'Eau — opacité',      min: 0.3,   max: 1.0,  step: 0.02 }
];

const WAKE_SLIDERS = [
  { key: 'armWidth', label: 'Sillage — largeur branche', min: 0.01, max: 0.25, step: 0.005 },
  { key: 'spread',   label: 'Sillage — divergence V',    min: 0,    max: 1.2,  step: 0.02 },
  { key: 'length',   label: 'Sillage — longueur',        min: 0.4,  max: 1.3,  step: 0.05 },
  { key: 'scale',    label: 'Sillage — finesse',         min: 2,    max: 16,   step: 0.2  },
  { key: 'density',  label: 'Sillage — densité',         min: 0,    max: 0.5,  step: 0.005 },
  { key: 'opacity',  label: 'Sillage — opacité',         min: 0.2,  max: 1.0,  step: 0.02 }
];

let _built = false;

export function createWaterDebugPanel() {
  if (_built || typeof document === 'undefined') return;
  _built = true;

  const panel = document.createElement('div');
  panel.id = 'waterDebugPanel';
  Object.assign(panel.style, {
    position: 'fixed', right: '12px', bottom: '52px', width: '270px',
    maxHeight: '70vh', overflowY: 'auto', padding: '12px 14px',
    background: 'rgba(12,20,28,0.92)', border: '1px solid rgba(120,200,240,0.35)',
    borderRadius: '10px', color: '#dff', font: '11px/1.4 system-ui, sans-serif',
    zIndex: '99999', display: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.45)'
  });

  const water = getWaterFoamParams();
  const wake = getWakeParams();

  panel.appendChild(_section('EAU / ÉCUME'));
  for (const s of WATER_SLIDERS) panel.appendChild(_slider(s, water[s.key], v => setWaterFoamParams({ [s.key]: v })));

  panel.appendChild(_section('SILLAGE BATEAU (V)'));
  for (const s of WAKE_SLIDERS) panel.appendChild(_slider(s, wake[s.key], v => setWakeParams({ [s.key]: v })));

  const copyBtn = document.createElement('button');
  copyBtn.textContent = '📋 Copier les réglages';
  Object.assign(copyBtn.style, {
    width: '100%', marginTop: '10px', padding: '7px', cursor: 'pointer',
    background: 'rgba(120,200,240,0.18)', color: '#dff',
    border: '1px solid rgba(120,200,240,0.5)', borderRadius: '7px', font: 'inherit'
  });
  copyBtn.onclick = () => {
    const json = JSON.stringify({ water: getWaterFoamParams(), wake: getWakeParams() }, null, 2);
    _copy(json);
    copyBtn.textContent = '✓ Copié !';
    setTimeout(() => { copyBtn.textContent = '📋 Copier les réglages'; }, 1600);
  };
  panel.appendChild(copyBtn);

  const toggle = document.createElement('button');
  toggle.textContent = '💧 EAU';
  Object.assign(toggle.style, {
    position: 'fixed', right: '12px', bottom: '12px', padding: '6px 10px',
    cursor: 'pointer', background: 'rgba(12,20,28,0.92)', color: '#dff',
    border: '1px solid rgba(120,200,240,0.5)', borderRadius: '8px',
    font: '11px system-ui, sans-serif', zIndex: '99999'
  });
  toggle.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };

  document.body.appendChild(panel);
  document.body.appendChild(toggle);
}

function _section(title) {
  const h = document.createElement('div');
  h.textContent = title;
  Object.assign(h.style, { margin: '6px 0 4px', fontWeight: '700', letterSpacing: '0.5px', color: '#9fe6ff' });
  return h;
}

function _slider(def, value, onChange) {
  const row = document.createElement('div');
  row.style.margin = '6px 0';

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  const lab = document.createElement('span'); lab.textContent = def.label;
  const val = document.createElement('span'); val.textContent = _fmt(value); val.style.color = '#9fe6ff';
  head.appendChild(lab); head.appendChild(val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = def.min; input.max = def.max; input.step = def.step; input.value = value;
  input.style.width = '100%';
  input.oninput = () => { const v = parseFloat(input.value); val.textContent = _fmt(v); onChange(v); };

  row.appendChild(head); row.appendChild(input);
  return row;
}

function _fmt(v) { return (Math.round(v * 1000) / 1000).toString(); }

function _copy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => _copyFallback(text));
  } else {
    _copyFallback(text);
  }
}

function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}
