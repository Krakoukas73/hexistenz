/**
 * environmentDebugUi.js — Panneau de test du directeur d'environnement (Phase 0).
 *
 * Aucun effet visuel réel ici : ce panneau sert uniquement à déclencher/
 * arrêter manuellement chaque évènement (brume, lucioles, pluie, orage,
 * éclair, feu, panique) pour valider la machine à états — exclusions de
 * groupe, dépendances (`requires`), expiration automatique — avant que les
 * phases suivantes n'y branchent les rendus.
 *
 * Bouton flottant « 🌦 ENV » (bas-gauche, au-dessus des boutons DEBUG FPS/EDA).
 */

import {
  ENVIRONMENT_EVENTS,
  onEnvironmentChange,
  triggerEnvironmentEvent,
  stopEnvironmentEvent,
  stopAllEnvironmentEvents,
  isEnvironmentEventActive
} from './environmentDirector.js';

let _built = false;

export function createEnvironmentDebugPanel(director) {
  if (_built || typeof document === 'undefined') return;
  _built = true;

  const panel = document.createElement('div');
  panel.id = 'environmentDebugPanel';
  Object.assign(panel.style, {
    position: 'fixed', left: '12px', bottom: '92px', width: '250px',
    maxHeight: '60vh', overflowY: 'auto', padding: '12px 14px',
    background: 'rgba(12,20,28,0.92)', border: '1px solid rgba(160,220,140,0.35)',
    borderRadius: '10px', color: '#e6ffe0', font: '11px/1.4 system-ui, sans-serif',
    zIndex: '99999', display: 'none', boxShadow: '0 6px 24px rgba(0,0,0,0.45)'
  });

  panel.appendChild(_section('DIRECTEUR D’ENVIRONNEMENT'));

  const rows = new Map();
  for (const [id, def] of Object.entries(ENVIRONMENT_EVENTS)) {
    const row = _eventRow(id, def, director);
    rows.set(id, row);
    panel.appendChild(row.el);
  }

  const stopAllBtn = document.createElement('button');
  stopAllBtn.textContent = '⏹ Tout arrêter';
  Object.assign(stopAllBtn.style, _buttonStyle());
  stopAllBtn.style.marginTop = '10px';
  stopAllBtn.onclick = () => stopAllEnvironmentEvents(director);
  panel.appendChild(stopAllBtn);

  const refresh = () => { for (const row of rows.values()) row.refresh(); };
  onEnvironmentChange(director, refresh);
  setInterval(refresh, 500); // rafraîchit aussi le compte à rebours entre deux transitions

  const toggle = document.createElement('button');
  toggle.textContent = '\u{1F326}️ ENV';
  Object.assign(toggle.style, {
    position: 'fixed', left: '12px', bottom: '52px', padding: '6px 10px',
    cursor: 'pointer', background: 'rgba(12,20,28,0.92)', color: '#e6ffe0',
    border: '1px solid rgba(160,220,140,0.5)', borderRadius: '8px',
    font: '11px system-ui, sans-serif', zIndex: '99999'
  });
  toggle.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };

  document.body.appendChild(panel);
  document.body.appendChild(toggle);
}

function _eventRow(id, def, director) {
  const el = document.createElement('div');
  el.style.margin = '6px 0';
  el.style.paddingBottom = '6px';
  el.style.borderBottom = '1px solid rgba(160,220,140,0.15)';

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  head.style.alignItems = 'center';

  const lab = document.createElement('span');
  lab.textContent = def.label + (def.requires ? ` (nécessite ${ENVIRONMENT_EVENTS[def.requires].label})` : '');
  lab.style.flex = '1';

  const status = document.createElement('span');
  status.style.color = '#9fe6a0';
  status.style.marginRight = '6px';

  const btn = document.createElement('button');
  Object.assign(btn.style, _buttonStyle());
  btn.style.width = 'auto';
  btn.style.padding = '3px 8px';

  const refresh = () => {
    const active = isEnvironmentEventActive(director, id);
    status.textContent = active ? '● actif' : '';
    btn.textContent = active ? 'Stop' : 'Déclencher';
    btn.disabled = !active && def.requires && !isEnvironmentEventActive(director, def.requires);
    btn.style.opacity = btn.disabled ? '0.4' : '1';
  };

  btn.onclick = () => {
    if (isEnvironmentEventActive(director, id)) stopEnvironmentEvent(director, id);
    else triggerEnvironmentEvent(director, id, performance.now() * 0.001);
    refresh();
  };

  head.appendChild(lab);
  head.appendChild(status);
  head.appendChild(btn);
  el.appendChild(head);
  refresh();

  return { el, refresh };
}

function _section(title) {
  const h = document.createElement('div');
  h.textContent = title;
  Object.assign(h.style, { margin: '0 0 8px', fontWeight: '700', letterSpacing: '0.5px', color: '#9fe6a0' });
  return h;
}

function _buttonStyle() {
  return {
    width: '100%', padding: '5px', cursor: 'pointer',
    background: 'rgba(160,220,140,0.18)', color: '#e6ffe0',
    border: '1px solid rgba(160,220,140,0.5)', borderRadius: '7px', font: 'inherit'
  };
}
