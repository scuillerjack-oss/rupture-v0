import { TERRITORIES, EDGES } from '../engine/territories.js';
import { BALANCE } from '../engine/balance.js';

function crisisColor(crisis) {
  if (crisis <= 0) return '#2a3038';
  if (crisis < 25) return '#4f7cff';
  if (crisis < 50) return '#c9a227';
  if (crisis < 75) return '#e06b2d';
  return '#d13b3b';
}

export function renderMap(state, selectable) {
  const edgeLines = EDGES.map(([a, b]) => {
    const ta = TERRITORIES.find((t) => t.id === a);
    const tb = TERRITORIES.find((t) => t.id === b);
    const closed =
      state.territories[a].closedRoutes.includes(b) || state.territories[b].closedRoutes.includes(a);
    const flowing =
      !closed &&
      (state.territories[a].crisis >= BALANCE.spreadThreshold || state.territories[b].crisis >= BALANCE.spreadThreshold);
    const cls = ['route', closed && 'route-closed', flowing && 'route-flowing'].filter(Boolean).join(' ');
    return `<line x1="${ta.x}" y1="${ta.y}" x2="${tb.x}" y2="${tb.y}" class="${cls}" />`;
  }).join('');

  const nodes = TERRITORIES.map((t) => {
    const ts = state.territories[t.id];
    const isOrigin = state.originId === t.id;
    const isSelected = state.selectedId === t.id;
    const isCritical = ts.crisis >= 75;
    const radius = 3.2 + t.population * 0.35;
    const cls = [
      'node',
      selectable && 'node-selectable',
      isSelected && 'node-selected',
      isCritical && 'node-critical'
    ].filter(Boolean).join(' ');
    return `
      <g class="${cls}" data-action="select-territory" data-id="${t.id}">
        <circle cx="${t.x}" cy="${t.y}" r="${radius + 2}" class="node-hit" />
        ${isCritical ? `<circle cx="${t.x}" cy="${t.y}" r="${radius}" class="node-pulse" fill="${crisisColor(ts.crisis)}" />` : ''}
        <circle cx="${t.x}" cy="${t.y}" r="${radius}" fill="${crisisColor(ts.crisis)}" class="node-circle${isOrigin ? ' node-origin' : ''}" />
        <text x="${t.x}" y="${t.y + radius + 5}" class="node-label">${t.name}</text>
      </g>`;
  }).join('');

  return `
    <svg viewBox="0 0 100 100" class="world-map" preserveAspectRatio="xMidYMid meet">
      <g class="routes">${edgeLines}</g>
      <g class="nodes">${nodes}</g>
    </svg>`;
}

export function renderMapLegend() {
  return `
    <div class="map-legend">
      <span class="legend-item"><i class="legend-dot" style="background:#2a3038"></i>Stable</span>
      <span class="legend-item"><i class="legend-dot" style="background:#4f7cff"></i>Naissante</span>
      <span class="legend-item"><i class="legend-dot" style="background:#c9a227"></i>Active</span>
      <span class="legend-item"><i class="legend-dot" style="background:#e06b2d"></i>Sévère</span>
      <span class="legend-item"><i class="legend-dot" style="background:#d13b3b"></i>Critique</span>
    </div>`;
}
