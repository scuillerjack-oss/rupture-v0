import { getTerritory } from '../engine/territories.js';
import { BALANCE, upgradeCost } from '../engine/balance.js';

function speedButton(state, value, label) {
  const active = state.speed === value ? ' active' : '';
  return `<button class="speed-btn${active}" data-action="set-speed" data-speed="${value}">${label}</button>`;
}

const NEXT_LEVEL_EFFECT = {
  propagation: (pct) => `Prochain niveau : +${pct}% de vitesse de propagation vers les voisins.`,
  resilience: (pct) => `Prochain niveau : +${pct}% de résistance aux mesures de confinement (locales et à la propagation).`,
  discretion: (pct) => `Prochain niveau : +${pct}% de ralentissement de la prise de conscience mondiale.`
};

function upgradeRow(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  const level = state.upgrades[kind];
  const maxed = level >= cfg.maxLevel;
  const cost = maxed ? '—' : upgradeCost(kind, level);
  const canAfford = !maxed && state.influence >= upgradeCost(kind, level);
  const nextLevelText = maxed
    ? 'Niveau maximum atteint.'
    : NEXT_LEVEL_EFFECT[kind](Math.round(cfg.effectPerLevel * 100));
  return `
    <div class="upgrade-row">
      <div class="upgrade-info">
        <div class="upgrade-title-row">
          <strong>${cfg.label}</strong>
          <span class="upgrade-level">Niv. ${level}/${cfg.maxLevel}${maxed ? '' : ` → ${level + 1}`}</span>
        </div>
        <p>${cfg.description}</p>
        <p class="upgrade-next">${nextLevelText}</p>
      </div>
      <button class="upgrade-btn" data-action="buy-upgrade" data-kind="${kind}" ${maxed || !canAfford ? 'disabled' : ''}>
        ${maxed ? 'Max' : `${cost} inf.`}
      </button>
    </div>`;
}

export function renderHud(state) {
  const selected = state.selectedId ? getTerritory(state.selectedId) : null;
  const selectedState = state.selectedId ? state.territories[state.selectedId] : null;

  const territoryPanel = selected
    ? `
      <div class="territory-panel">
        <h3>${selected.name}${state.originId === selected.id ? ' (origine)' : ''}</h3>
        <div class="stat-line">Crise <div class="bar"><div class="bar-fill crisis" style="width:${selectedState.crisis}%"></div></div></div>
        <div class="stat-line">Conscience <div class="bar"><div class="bar-fill awareness" style="width:${selectedState.awareness}%"></div></div></div>
        <div class="stat-line">Confinement local <div class="bar"><div class="bar-fill containment" style="width:${selectedState.containment}%"></div></div></div>
        <div class="stat-line small">Population relative : ${selected.population}/10</div>
        ${selectedState.closedRoutes.length ? `<div class="stat-line small">Routes fermées : ${selectedState.closedRoutes.length}</div>` : ''}
      </div>`
    : '';

  return `
    <div class="hud">
      <div class="hud-top">
        <div class="metric">
          <span class="metric-label">Jour</span>
          <span class="metric-value">${state.day}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Influence</span>
          <span class="metric-value">${Math.floor(state.influence)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Domination</span>
          <span class="metric-value">${state.dominance.toFixed(0)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Confinement mondial</span>
          <span class="metric-value">${state.globalContainment.toFixed(0)}%</span>
        </div>
      </div>
      <div class="speed-controls">
        ${speedButton(state, 0, '⏸')}
        ${speedButton(state, 1, '1x')}
        ${speedButton(state, 2, '2x')}
        ${speedButton(state, 4, '4x')}
      </div>
      ${territoryPanel}
      <div class="upgrades-panel">
        ${upgradeRow(state, 'propagation')}
        ${upgradeRow(state, 'resilience')}
        ${upgradeRow(state, 'discretion')}
      </div>
      <div class="log-panel">
        ${state.log.slice(0, 6).map((l) => `<div class="log-line">${l}</div>`).join('')}
      </div>
    </div>`;
}
