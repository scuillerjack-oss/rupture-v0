import { TERRITORIES } from './territories.js';
import { adjacency, pushLog } from './state.js';
import { BALANCE, upgradeCost } from './balance.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function simulateTick(state) {
  if (state.status !== 'playing') return;

  const snapshot = {};
  for (const t of TERRITORIES) snapshot[t.id] = state.territories[t.id].crisis;

  const propagationEffect = state.upgrades.propagation * BALANCE.upgrades.propagation.effectPerLevel;
  const resilienceEffect = clamp(state.upgrades.resilience * BALANCE.upgrades.resilience.effectPerLevel, 0, 0.8);
  const discretionEffect = clamp(state.upgrades.discretion * BALANCE.upgrades.discretion.effectPerLevel, 0, 0.8);

  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    const currentCrisis = snapshot[t.id];

    let growth = 0;
    if (currentCrisis > 0) {
      const containmentFactor = 1 - (ts.containment / BALANCE.containmentDamping) * (1 - resilienceEffect);
      growth = BALANCE.baseGrowthPerTick * Math.max(containmentFactor, 0.15);
    }

    let spreadIn = 0;
    for (const neighborId of adjacency.get(t.id)) {
      if (ts.closedRoutes.includes(neighborId)) continue;
      const neighborCrisis = snapshot[neighborId];
      if (neighborCrisis >= BALANCE.spreadThreshold) {
        const spreadRate = BALANCE.baseSpreadPerTick * (1 + propagationEffect);
        spreadIn += spreadRate * (neighborCrisis / 100);
      }
    }
    const incomingDamping = Math.max(1 - ts.containment / BALANCE.incomingSpreadContainmentDamping, 0.2);
    spreadIn *= incomingDamping;

    const newCrisis = clamp(currentCrisis + growth + spreadIn, 0, 100);

    ts.awareness = clamp(
      ts.awareness + (newCrisis - ts.awareness) * BALANCE.awarenessCatchupRate * (1 - discretionEffect),
      0,
      100
    );
    ts.containment = clamp(ts.containment + (ts.awareness * 0.6 - ts.containment) * 0.05, 0, 100);

    if (ts.awareness > BALANCE.routeCloseAwarenessThreshold) {
      for (const neighborId of adjacency.get(t.id)) {
        if (ts.closedRoutes.includes(neighborId)) continue;
        const chance = BALANCE.routeCloseCheckChance * (1 - discretionEffect);
        if (Math.random() < chance) {
          ts.closedRoutes.push(neighborId);
          pushLog(state, `${t.name} ferme sa frontière avec un territoire voisin.`);
        }
      }
    }

    ts.crisis = newCrisis;
  }

  let weightedCrisis = 0;
  let totalPopulation = 0;
  let awarenessSum = 0;
  let influenceGain = 0;

  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    weightedCrisis += ts.crisis * t.population;
    totalPopulation += t.population;
    awarenessSum += ts.awareness;
    influenceGain += (ts.crisis * t.population) / 100;
  }

  state.dominance = clamp(weightedCrisis / totalPopulation, 0, 100);
  state.globalContainment = clamp(
    state.globalContainment + (awarenessSum / TERRITORIES.length) * BALANCE.globalContainmentGainFactor,
    0,
    100
  );
  state.influence += influenceGain * BALANCE.influenceGainFactor;
  state.day += 1;

  if (state.dominance >= BALANCE.victoryDominanceThreshold) {
    state.status = 'victory';
    pushLog(state, 'Le monde a basculé. Victoire.');
  } else if (state.globalContainment >= BALANCE.defeatContainmentThreshold) {
    state.status = 'defeat';
    pushLog(state, 'Le confinement mondial est total. Défaite.');
  }
}

export function buyUpgrade(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  if (!cfg) return false;
  const level = state.upgrades[kind];
  if (level >= cfg.maxLevel) return false;
  const cost = upgradeCost(kind, level);
  if (state.influence < cost) return false;
  state.influence -= cost;
  state.upgrades[kind] = level + 1;
  pushLog(state, `Amélioration ${cfg.label} niveau ${level + 1} acquise.`);
  return true;
}

export function selectTerritory(state, id) {
  state.selectedId = id;
}

export function setSpeed(state, speed) {
  state.speed = speed;
}
