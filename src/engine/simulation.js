import { TERRITORIES } from './territories.js';
import { adjacency, pushLog } from './state.js';
import { BALANCE, upgradeCost, tensionAt } from './balance.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function simulateTick(state) {
  if (state.status !== 'playing') return;

  const snapshot = {};
  for (const t of TERRITORIES) snapshot[t.id] = state.territories[t.id].crisis;

  const tension = tensionAt(state.day);
  const propagationEffect = state.upgrades.propagation * BALANCE.upgrades.propagation.effectPerLevel;
  const resilienceEffect = clamp(state.upgrades.resilience * BALANCE.upgrades.resilience.effectPerLevel, 0, 0.8);
  const discretionEffect = clamp(state.upgrades.discretion * BALANCE.upgrades.discretion.effectPerLevel, 0, 0.8);

  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    const currentCrisis = snapshot[t.id];

    let growth = 0;
    if (currentCrisis > 0) {
      const containmentFactor = 1 - (ts.containment / BALANCE.containmentDamping) * (1 - resilienceEffect);
      growth = BALANCE.baseGrowthPerTick * Math.max(containmentFactor, 0.15) * tension;
    }

    let spreadIn = 0;
    for (const neighborId of adjacency.get(t.id)) {
      const neighborCrisis = snapshot[neighborId];
      if (neighborCrisis < BALANCE.spreadThreshold) continue;
      const spreadRate = BALANCE.baseSpreadPerTick * (1 + propagationEffect) * tension;
      const isClosed = ts.closedRoutes.includes(neighborId);
      // A closed route mostly blocks the anomaly, but enough Résilience lets it
      // partially force its way through anyway (resisting the containment measure
      // itself, not just its local effects).
      const routeFactor = isClosed ? resilienceEffect * 0.6 : 1;
      spreadIn += spreadRate * (neighborCrisis / 100) * routeFactor;
    }
    const incomingDamping = Math.max(
      1 - (ts.containment / BALANCE.incomingSpreadContainmentDamping) * (1 - resilienceEffect),
      0.2
    );
    spreadIn *= incomingDamping;

    const newCrisis = clamp(currentCrisis + growth + spreadIn, 0, 100);

    // Aggressive Propagation makes the Anomaly more conspicuous: a share of its
    // effect bleeds into how fast the world catches on, offsetting the pure
    // upside of spreading faster.
    const awarenessRate =
      BALANCE.awarenessCatchupRate * (1 + propagationEffect * BALANCE.propagationAwarenessBleed) * (1 - discretionEffect);
    ts.awareness = clamp(ts.awareness + (newCrisis - ts.awareness) * awarenessRate * tension, 0, 100);
    ts.containment = clamp(ts.containment + (ts.awareness * 0.6 - ts.containment) * 0.05 * tension, 0, 100);

    if (ts.awareness > BALANCE.routeCloseAwarenessThreshold) {
      for (const neighborId of adjacency.get(t.id)) {
        if (ts.closedRoutes.includes(neighborId)) continue;
        const chance = BALANCE.routeCloseCheckChance * (1 - discretionEffect) * tension;
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
  const containmentGainFactor = state.rules?.globalContainmentGainFactor ?? BALANCE.globalContainmentGainFactor;
  state.globalContainment = clamp(
    state.globalContainment + (awarenessSum / TERRITORIES.length) * containmentGainFactor * tension,
    0,
    100
  );
  // Crisis-driven income alone is scaled by tension, which starts extremely low so the
  // opening feels calm - but that also starves the player of any real choice for a very
  // long stretch. A separate, tapering trickle covers exactly that gap: it matters early
  // (when tension is near its minimum) and fades itself out as the real crisis-driven
  // economy takes over (tension rising toward 1), so it never inflates the mid/late game.
  const earlyTrickle = BALANCE.earlyInfluenceTrickle * clamp(1 - tension, 0, 1);
  // Discretion trades away some of the Influence a hidden Anomaly could otherwise extract.
  const incomeFactor = 1 - discretionEffect * BALANCE.discretionIncomePenalty;
  // Influence cannot be hoarded indefinitely: past the cap it dissipates unused. This is
  // what actually stops the "ignore the game for 500 days, then dump it all at once" pattern -
  // a lump purchase no longer buys as much as steady spending would have over the same span.
  state.influence = clamp(
    state.influence + influenceGain * BALANCE.influenceGainFactor * incomeFactor + earlyTrickle,
    0,
    BALANCE.influenceCap
  );
  state.day += 1;

  const victoryThreshold = state.rules?.victoryDominanceThreshold ?? BALANCE.victoryDominanceThreshold;
  if (state.dominance >= victoryThreshold) {
    state.status = 'victory';
    state.endReason = 'dominance';
    pushLog(
      state,
      `Domination mondiale atteinte (${state.dominance.toFixed(0)}% ≥ ${victoryThreshold}%). Victoire.`
    );
  } else if (state.globalContainment >= BALANCE.defeatContainmentThreshold) {
    state.status = 'defeat';
    state.endReason = 'containment';
    pushLog(state, 'Le confinement mondial a atteint 100 % avant votre domination. Défaite.');
  } else if (state.day >= BALANCE.maxDays) {
    state.status = 'defeat';
    state.endReason = 'timeout';
    pushLog(state, `Aucun camp n'a percé en ${BALANCE.maxDays} jours. Le monde reprend le contrôle par défaut.`);
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
