import { getTerritory, TERRITORIES } from '../engine/territories.js';
import { BALANCE, DIFFICULTIES, upgradeCost, responsePhaseAt, dangerosityCapAt } from '../engine/balance.js';
import { getAvailableSpeeds } from '../config/runtime.js';

const SPEED_LABELS = { 0: '⏸', 1: '1x', 2: '2x', 4: '4x' };

function speedButton(state, value, label) {
  const active = state.speed === value ? ' active' : '';
  return `<button class="speed-btn${active}" data-action="set-speed" data-speed="${value}">${label}</button>`;
}

const UPGRADE_ORDER = ['propagation', 'dangerosity', 'resilience', 'discretion'];

const NEXT_LEVEL_EFFECT = {
  propagation: (pct) => `Prochain niveau : +${pct}% de vitesse de propagation vers les voisins (et un peu plus visible).`,
  resilience: (pct) => `Prochain niveau : +${pct}% de résistance aux mesures de confinement (locales et à la propagation).`,
  discretion: (pct) => `Prochain niveau : +${pct}% de ralentissement de la prise de conscience mondiale.`
};

// Dangerosité ne suit pas le schéma générique "+X% d'un effet" des trois
// autres branches : son effet réel est un plafond de gravité par région
// (voir dangerosityCapAt). Le texte affiche donc la traduction exacte de la
// mécanique - le plafond actuel et celui du prochain niveau - plutôt qu'un
// pourcentage esthétique déconnecté du moteur.
function dangerosityNextLevelText(level) {
  const currentCap = Math.round(dangerosityCapAt(level));
  const nextCap = Math.round(dangerosityCapAt(level + 1));
  return `Prochain niveau : porte le plafond de gravité d'une région de ${currentCap}% à ${nextCap}% (et alarme davantage le monde).`;
}

function upgradeRow(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  const level = state.upgrades[kind];
  const maxed = level >= cfg.maxLevel;
  const cost = maxed ? '—' : upgradeCost(kind, level);
  const canAfford = !maxed && state.influence >= upgradeCost(kind, level);
  const nextLevelText = maxed
    ? 'Niveau maximum atteint.'
    : kind === 'dangerosity'
      ? dangerosityNextLevelText(level)
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

function computeWorldStats(state) {
  let touched = 0;
  let severe = 0;
  let critical = 0;
  let awarenessSum = 0;
  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    if (ts.crisis > 0) touched += 1;
    if (ts.crisis >= 50) severe += 1;
    if (ts.crisis >= 75) critical += 1;
    awarenessSum += ts.awareness;
  }
  return {
    touched,
    total: TERRITORIES.length,
    severe,
    critical,
    awareness: awarenessSum / TERRITORIES.length,
    phase: responsePhaseAt(state.globalContainment)
  };
}

function renderWorldPanel(state) {
  const w = computeWorldStats(state);
  return `
    <div class="world-panel">
      <div class="stat-line small">Difficulté : ${DIFFICULTIES[state.difficulty]?.label ?? 'Normal'} · Régions touchées : ${w.touched}/${w.total} · Sévères : ${w.severe} · Critiques : ${w.critical}</div>
      <div class="stat-line">Portée (étendue brute) <div class="bar"><div class="bar-fill crisis" style="width:${state.reach}%"></div></div></div>
      <div class="stat-line">Progression réelle de l'Anomalie <div class="bar"><div class="bar-fill crisis" style="width:${state.dominance}%"></div></div></div>
      <div class="stat-line">Conscience mondiale <div class="bar"><div class="bar-fill awareness" style="width:${w.awareness}%"></div></div></div>
      <div class="stat-line">Réponse mondiale — ${w.phase.label} <div class="bar"><div class="bar-fill containment" style="width:${state.globalContainment}%"></div></div></div>
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
  const view = statsView === 'world' ? 'world' : 'territory';

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
          <span class="metric-label">Progression</span>
          <span class="metric-value">${state.dominance.toFixed(0)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Réponse mondiale</span>
          <span class="metric-value">${state.globalContainment.toFixed(0)}%</span>
        </div>
      </div>
      <div class="speed-controls">
        ${getAvailableSpeeds(services).map((speed) => speedButton(state, speed, SPEED_LABELS[speed])).join('')}
      </div>
      <div class="view-tabs">
        <button class="view-tab${view === 'territory' ? ' active' : ''}" data-action="set-stats-view" data-view="territory">Région</button>
        <button class="view-tab${view === 'world' ? ' active' : ''}" data-action="set-stats-view" data-view="world">Monde</button>
      </div>
      ${view === 'world' ? renderWorldPanel(state) : renderTerritoryPanel(state)}
      <div class="upgrades-panel">
        ${UPGRADE_ORDER.map((kind) => upgradeRow(state, kind)).join('')}
      </div>
      <div class="log-panel">
        ${state.log.slice(0, 6).map((l) => `<div class="log-line">${l}</div>`).join('')}
      </div>
    </div>`;
}
