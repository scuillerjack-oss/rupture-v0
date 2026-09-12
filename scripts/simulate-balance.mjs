// Batterie de simulations de pré-équilibrage pour RUPTURE.
// Ne truque pas les résultats : chaque stratégie est un heuristique honnête,
// exécuté tel quel contre le moteur réel (src/engine), sans connaissance
// privilégiée de l'issue. Sert à révéler les faiblesses du moteur, pas à les
// cacher. Résultats bruts écrits dans docs/v1-simulation-results.json.

import { writeFileSync } from 'node:fs';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES } from '../src/engine/territories.js';
import { BALANCE, upgradeCost } from '../src/engine/balance.js';

const MAX_TICKS = 3000;
const KINDS = ['propagation', 'resilience', 'discretion'];

function cheapestAffordable(state, kinds) {
  let best = null;
  for (const kind of kinds) {
    const cfg = BALANCE.upgrades[kind];
    const level = state.upgrades[kind];
    if (level >= cfg.maxLevel) continue;
    const cost = upgradeCost(kind, level);
    if (state.influence < cost) continue;
    if (!best || cost < best.cost) best = { kind, cost };
  }
  return best?.kind ?? null;
}

function makeDominant(preferredKind) {
  const others = KINDS.filter((k) => k !== preferredKind);
  return (state) => {
    const cfg = BALANCE.upgrades[preferredKind];
    if (state.upgrades[preferredKind] < cfg.maxLevel) {
      if (cheapestAffordable(state, [preferredKind])) buyUpgrade(state, preferredKind);
      return;
    }
    const kind = cheapestAffordable(state, others);
    if (kind) buyUpgrade(state, kind);
  };
}

const STRATEGIES = {
  passive: () => {},

  // "Dominant" strategies hoard influence exclusively for their preferred track
  // until it is fully maxed, only then spending on the others. A strategy that
  // bought "whichever is affordable, preferring X" turned out to converge with
  // every other strategy (affordability is usually a one-at-a-time gate), which
  // hid any real difference between orientations -- this hoarding version is
  // what actually exercises "committing to Propagation vs Discretion" as
  // genuinely different playstyles.
  'propagation-dominante': (state) => makeDominant('propagation')(state),
  'resilience-dominante': (state) => makeDominant('resilience')(state),
  'discretion-dominante': (state) => makeDominant('discretion')(state),

  equilibree: (state) => {
    // Buys whichever affordable upgrade currently has the lowest level (ties -> cheapest).
    let candidate = null;
    for (const kind of KINDS) {
      const cfg = BALANCE.upgrades[kind];
      const level = state.upgrades[kind];
      if (level >= cfg.maxLevel) continue;
      const cost = upgradeCost(kind, level);
      if (state.influence < cost) continue;
      if (!candidate || level < candidate.level || (level === candidate.level && cost < candidate.cost)) {
        candidate = { kind, level, cost };
      }
    }
    if (candidate) buyUpgrade(state, candidate.kind);
  },

  agressive: (state) => {
    for (const kind of KINDS) buyUpgrade(state, kind);
  },

  prudente: (state) => {
    // Saves up: only buys once influence is at least 2x the cost of some affordable upgrade.
    const kind = cheapestAffordable(state, KINDS);
    if (kind) {
      const cost = upgradeCost(kind, state.upgrades[kind]);
      if (state.influence >= cost * 2) buyUpgrade(state, kind);
    }
  },

  'semi-aleatoire': (state) => {
    if (Math.random() < 0.08) {
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      buyUpgrade(state, kind);
    }
  }
};

function runOne(strategyName, originId) {
  const decide = STRATEGIES[strategyName];
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, originId);

  let totalEarned = 0;
  let totalSpent = 0;
  let ticks = 0;
  let firstPurchaseDay = null;
  let secondPurchaseDay = null;
  let purchaseCount = 0;
  for (; ticks < MAX_TICKS && state.status === 'playing'; ticks++) {
    const beforeTick = state.influence;
    simulateTick(state);
    const afterTick = state.influence;
    totalEarned += Math.max(0, afterTick - beforeTick);

    const upgradesBefore = state.upgrades.propagation + state.upgrades.resilience + state.upgrades.discretion;
    decide(state);
    const upgradesAfter = state.upgrades.propagation + state.upgrades.resilience + state.upgrades.discretion;
    if (upgradesAfter > upgradesBefore) {
      purchaseCount += upgradesAfter - upgradesBefore;
      if (firstPurchaseDay === null) firstPurchaseDay = state.day;
      else if (secondPurchaseDay === null) secondPurchaseDay = state.day;
    }
    const afterDecide = state.influence;
    totalSpent += Math.max(0, afterTick - afterDecide);
  }

  return {
    strategy: strategyName,
    origin: originId,
    status: state.status,
    endReason: state.endReason,
    days: state.day,
    firstPurchaseDay,
    secondPurchaseDay,
    purchaseCount,
    dominance: Number(state.dominance.toFixed(2)),
    globalContainment: Number(state.globalContainment.toFixed(2)),
    influenceRemaining: Number(state.influence.toFixed(2)),
    influenceEarned: Number(totalEarned.toFixed(2)),
    influenceSpent: Number(totalSpent.toFixed(2)),
    upgrades: { ...state.upgrades },
    hitTickCap: ticks >= MAX_TICKS
  };
}

const results = [];
for (const strategyName of Object.keys(STRATEGIES)) {
  for (const t of TERRITORIES) {
    results.push(runOne(strategyName, t.id));
  }
}

// --- Analysis ---
const byStrategy = {};
for (const r of results) {
  byStrategy[r.strategy] ??= [];
  byStrategy[r.strategy].push(r);
}

const summary = [];
for (const [strategy, rows] of Object.entries(byStrategy)) {
  const wins = rows.filter((r) => r.status === 'victory').length;
  const days = rows.map((r) => r.days);
  const stuck = rows.filter((r) => r.hitTickCap);
  const incoherent = rows.filter(
    (r) =>
      !Number.isFinite(r.dominance) ||
      !Number.isFinite(r.globalContainment) ||
      r.dominance < 0 ||
      r.dominance > 100 ||
      r.globalContainment < 0 ||
      r.globalContainment > 100
  );
  const earned = rows.map((r) => r.influenceEarned);
  const spent = rows.map((r) => r.influenceSpent);
  const firstDays = rows.map((r) => r.firstPurchaseDay).filter((d) => d !== null);
  const secondDays = rows.map((r) => r.secondPurchaseDay).filter((d) => d !== null);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  summary.push({
    strategy,
    runs: rows.length,
    victoires: wins,
    premierAchatJourMoyen: avg(firstDays),
    deuxiemeAchatJourMoyen: avg(secondDays),
    defaites: rows.length - wins,
    tauxVictoire: `${Math.round((wins / rows.length) * 100)}%`,
    dureeJoursMin: Math.min(...days),
    dureeJoursMax: Math.max(...days),
    dureeJoursMoyenne: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    influenceGagneeMoyenne: Math.round(earned.reduce((a, b) => a + b, 0) / earned.length),
    influenceDepenseeMoyenne: Math.round(spent.reduce((a, b) => a + b, 0) / spent.length),
    partiesBloqueesOuNonTerminees: stuck.length,
    etatsIncoherents: incoherent.length
  });
}

console.log('=== RESUME PAR STRATEGIE (', results.length, 'simulations au total ) ===');
console.table(summary);

writeFileSync(
  new URL('../docs/v1-simulation-results.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), totalRuns: results.length, summary, results }, null, 2)
);

console.log('Résultats bruts écrits dans docs/v1-simulation-results.json');
