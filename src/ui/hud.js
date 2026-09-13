import { getTerritory, TERRITORIES, SECTORS } from '../engine/territories.js';
import { BALANCE, upgradeCost } from '../engine/balance.js';
import { getAvailableSpeeds } from '../config/runtime.js';

const SPEED_LABELS = { 0: '⏸', 1: '1x', 2: '2x', 4: '4x' };

function speedButton(state, value, label) {
  const active = state.speed === value ? ' active' : '';
  return `<button class="speed-btn${active}" data-action="set-speed" data-speed="${value}">${label}</button>`;
}

const NEXT_LEVEL_EFFECT = {
  propagation: (pct) => `Prochain niveau : +${pct}% de vitesse de propagation vers les voisins (et un peu plus visible).`,
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

function computeSectorStats(state) {
  const bySector = new Map(SECTORS.map((s) => [s.id, { ...s, popSum: 0, crisisSum: 0, awarenessSum: 0, containmentSum: 0, count: 0, touched: 0, severe: 0, critical: 0 }]));
  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    const b = bySector.get(t.sector);
    if (!b) continue;
    b.count += 1;
    b.popSum += t.population;
    b.crisisSum += ts.crisis * t.population;
    b.awarenessSum += ts.awareness;
    b.containmentSum += ts.containment;
    if (ts.crisis > 0) b.touched += 1;
    if (ts.crisis >= 50) b.severe += 1;
    if (ts.crisis >= 75) b.critical += 1;
  }
  return [...bySector.values()].map((b) => ({
    ...b,
    dominance: b.popSum ? b.crisisSum / b.popSum : 0,
    awareness: b.count ? b.awarenessSum / b.count : 0,
    containment: b.count ? b.containmentSum / b.count : 0
  }));
}

function renderSectorPanel(state) {
  const sectors = computeSectorStats(state);
  return `
    <div class="sector-panel">
      ${sectors.map((s) => `
        <div class="sector-row">
          <div class="sector-row-head">
            <strong>${s.name}</strong>
            <span class="sector-count">${s.touched}/${s.count} régions touchées</span>
          </div>
          <div class="stat-line">Domination <div class="bar"><div class="bar-fill crisis" style="width:${s.dominance}%"></div></div></div>
          <div class="stat-line small">Sévères : ${s.severe} · Critiques : ${s.critical} · Confinement moyen : ${s.containment.toFixed(0)}%</div>
        </div>`).join('')}
    </div>`;
}

function renderTerritoryPanel(state) {
  const selected = state.selectedId ? getTerritory(state.selectedId) : null;
  const selectedState = state.selectedId ? state.territories[state.selectedId] : null;
  if (!selected) return '<div class="territory-panel empty">Touchez une région sur la carte.</div>';
  return `
    <div class="territory-panel">
      <h3>${selected.name}${state.originId === selected.id ? ' (origine)' : ''}</h3>
      <div class="stat-line">Crise <div class="bar"><div class="bar-fill crisis" style="width:${selectedState.crisis}%"></div></div></div>
      <div class="stat-line">Conscience <div class="bar"><div class="bar-fill awareness" style="width:${selectedState.awareness}%"></div></div></div>
      <div class="stat-line">Confinement local <div class="bar"><div class="bar-fill containment" style="width:${selectedState.containment}%"></div></div></div>
      <div class="stat-line small">Population relative : ${selected.population}/10</div>
      ${selectedState.closedRoutes.length ? `<div class="stat-line small">Routes fermées : ${selectedState.closedRoutes.length}</div>` : ''}
    </div>`;
}

export function renderHud(state, statsView, services) {
  const view = statsView === 'sectors' ? 'sectors' : 'territory';

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
        ${getAvailableSpeeds(services).map((speed) => speedButton(state, speed, SPEED_LABELS[speed])).join('')}
      </div>
      <div class="view-tabs">
        <button class="view-tab${view === 'territory' ? ' active' : ''}" data-action="set-stats-view" data-view="territory">Région</button>
        <button class="view-tab${view === 'sectors' ? ' active' : ''}" data-action="set-stats-view" data-view="sectors">Secteurs</button>
      </div>
      ${view === 'sectors' ? renderSectorPanel(state) : renderTerritoryPanel(state)}
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
