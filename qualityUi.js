/**
 * qualityUi.js — Réglage de densité de contenu (qualité / FPS).
 *
 * Bouton flottant « ⚙ QUALITÉ » (bas-droite) + panneau avec presets et slider.
 * Pilote contentDensity.setContentDensity() → reconstruit tout le contenu scalé
 * (props naturels, herbe, moutons). Persisté en localStorage.
 *
 * Réduire la densité allège le parcours du graphe et la charge GPU (vertices)
 * → vise 60 FPS sur machine faible. N'affecte pas le terrain, l'eau, les
 * bâtiments, les personnages (gameplay).
 */

import { getContentDensity, setContentDensity, MIN_DENSITY, MAX_DENSITY } from './contentDensity.js';

const PRESETS = [
  { label: 'Faible',  value: 0.30 },
  { label: 'Moyen',   value: 0.55 },
  { label: 'Élevé',   value: 0.80 },
  { label: 'Max',     value: 1.00 },
];

let _built = false;

export function createQualityUi() {
  if (_built || typeof document === 'undefined') return;
  _built = true;

  const panel = document.createElement('div');
  panel.id = 'qualityPanel';
  Object.assign(panel.style, {
    position: 'fixed', right: '12px', bottom: '92px', width: '230px',
    padding: '12px 14px', background: 'rgba(20,16,28,0.92)',
    border: '1px solid rgba(200,170,255,0.35)', borderRadius: '10px',
    color: '#efe6ff', font: '11px/1.4 system-ui, sans-serif', zIndex: '99999',
    display: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.45)'
  });

  const title = document.createElement('div');
  title.textContent = 'QUALITÉ / DENSITÉ';
  Object.assign(title.style, { fontWeight: '700', letterSpacing: '0.5px', color: '#c8aaff', marginBottom: '8px' });
  panel.appendChild(title);

  const hint = document.createElement('div');
  hint.textContent = 'Moins de props/herbe = plus de FPS. N’affecte pas le jeu.';
  Object.assign(hint.style, { opacity: '0.6', fontSize: '10px', marginBottom: '10px' });
  panel.appendChild(hint);

  // Presets
  const presetRow = document.createElement('div');
  Object.assign(presetRow.style, { display: 'flex', gap: '4px', marginBottom: '10px' });
  const presetBtns = [];
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.label;
    Object.assign(b.style, {
      flex: '1', padding: '5px 2px', cursor: 'pointer', font: 'inherit',
      background: 'rgba(200,170,255,0.15)', color: '#efe6ff',
      border: '1px solid rgba(200,170,255,0.4)', borderRadius: '6px'
    });
    b.onclick = () => { setContentDensity(p.value); syncUi(); };
    presetRow.appendChild(b);
    presetBtns.push({ el: b, value: p.value });
  }
  panel.appendChild(presetRow);

  // Slider fin
  const valLabel = document.createElement('div');
  Object.assign(valLabel.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' });
  const valText = document.createElement('span'); valText.textContent = 'Densité';
  const valNum  = document.createElement('span'); valNum.style.color = '#c8aaff';
  valLabel.appendChild(valText); valLabel.appendChild(valNum);
  panel.appendChild(valLabel);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(MIN_DENSITY); slider.max = String(MAX_DENSITY); slider.step = '0.05';
  slider.style.width = '100%';
  // Débounce : le rebuild est coûteux, on attend la fin du drag.
  let _t = null;
  slider.oninput = () => {
    valNum.textContent = Math.round(parseFloat(slider.value) * 100) + '%';
    clearTimeout(_t);
    _t = setTimeout(() => { setContentDensity(parseFloat(slider.value)); syncUi(); }, 220);
  };
  panel.appendChild(slider);

  function syncUi() {
    const d = getContentDensity();
    slider.value = String(d);
    valNum.textContent = Math.round(d * 100) + '%';
    for (const { el, value } of presetBtns) {
      const active = Math.abs(value - d) < 0.001;
      el.style.background = active ? 'rgba(200,170,255,0.45)' : 'rgba(200,170,255,0.15)';
    }
  }

  const toggle = document.createElement('button');
  toggle.textContent = '⚙ QUALITÉ';
  Object.assign(toggle.style, {
    position: 'fixed', right: '90px', bottom: '12px', padding: '6px 10px',
    cursor: 'pointer', background: 'rgba(20,16,28,0.92)', color: '#efe6ff',
    border: '1px solid rgba(200,170,255,0.5)', borderRadius: '8px',
    font: '11px system-ui, sans-serif', zIndex: '99999'
  });
  toggle.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; syncUi(); };

  document.body.appendChild(panel);
  document.body.appendChild(toggle);
  syncUi();
}
