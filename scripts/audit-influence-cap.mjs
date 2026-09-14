// RUPTURE V6 - Chantier A : audit approfondi du plafond d'Influence
// (BALANCE.influenceCap, actuellement 150 dans src/engine/balance.js).
//
// Objectif : reproduire puis approfondir le constat préliminaire d'une
// session interrompue (0 victoire / 90 essais pour le pattern "tout
// accumuler puis tout dépenser au jour 350", 18 origines x 5 essais, testé
// avec plusieurs plafonds y compris Infinity). Ce script ne modifie AUCUN
// fichier du moteur : il importe BALANCE tel quel et mute uniquement
// `influenceCap` en mémoire, entre deux lots de simulations, pour comparer
// plusieurs valeurs sur le moteur réel autrement inchangé.
//
// Deux familles de comportement testées (cahier des charges V6, chantier A) :
//   - hoarding dégénéré : neglige tout jusqu'au jour N, puis dépense tout ce
//     qui est finançable d'un coup, puis continue de neglicher (pas de
//     pivot réel - juste un dump isolé). Testé pour N = 250/350/500/700.
//   - épargne légitime puis pivot : n'achète rien pendant 150 jours (délai
//     raisonnable, bien avant la mobilisation typique ~jour 445 en Normal),
//     PUIS adopte une stratégie cohérente et réactive pour le reste de la
//     partie (jamais de retour à la négligence).
// Deux stratégies de contrôle (jamais affectées par un hoard tardif, pour
// vérifier qu'un cap plus haut ne les perturbe pas) : equilibree-naive et
// reactive-coherente, telles que définies dans scripts/simulate-balance.mjs.
//
// Chaque combinaison (stratégie x cap) est rejouée sur les 18 origines x 5
// essais (aléa des fermetures de route) = 90 parties, en difficulté Normal.

import { writeFileSync } from 'node:fs';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES } from '../src/engine/territories.js';
import { BALANCE, upgradeCost } from '../src/engine/balance.js';

const MAX_TICKS = 3000;
const TRIALS_PER_ORIGIN = 5;
const KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];
const CAP_VALUES = [150, 175, 200, 225, 250, 300];
const HOARD_DAYS = [350, 700];
const PIVOT_DAYS = [100, 150, 250];

function affordable(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  return state.upgrades[kind] < cfg.maxLevel && state.influence >= upgradeCost(kind, state.upgrades[kind]);
}

function buyFirstAffordable(state, order) {
  for (const kind of order) {
    if (affordable(state, kind)) {
      buyUpgrade(state, kind);
      return true;
    }
  }
  return false;
}

function isMobilized(state) {
  return state.globalContainment >= BALANCE.humanity.mobilizationThreshold;
}

function spendEverythingAffordable(state) {
  let bought = true;
  while (bought) {
    bought = false;
    for (const kind of KINDS) {
      if (affordable(state, kind)) {
        buyUpgrade(state, kind);
        bought = true;
      }
    }
  }
}

function makeHoardStrategy(dumpDay) {
  return (state) => {
    if (state.__dumped || state.day < dumpDay) return;
    state.__dumped = true;
    spendEverythingAffordable(state);
  };
}

function makeEpargnePivot(pivotDay) {
  return (state) => {
    if (state.day < pivotDay) return;
    const order = isMobilized(state)
      ? ['resilience', 'dangerosity', 'propagation', 'discretion']
      : ['propagation', 'dangerosity', 'discretion', 'resilience'];
    buyFirstAffordable(state, order);
  };
}

function equilibreeNaive(state) {
  buyFirstAffordable(state, KINDS);
}

function reactiveCoherente(state) {
  const order = isMobilized(state)
    ? ['resilience', 'dangerosity', 'propagation', 'discretion']
    : ['propagation', 'dangerosity', 'discretion', 'resilience'];
  buyFirstAffordable(state, order);
}

const STRATEGIES = {
  ...Object.fromEntries(HOARD_DAYS.map((d) => [`hoarding-degenere-j${d}`, makeHoardStrategy(d)])),
  ...Object.fromEntries(PIVOT_DAYS.map((d) => [`epargne-legitime-pivot-j${d}`, makeEpargnePivot(d)])),
  'equilibree-naive': equilibreeNaive,
  'reactive-coherente': reactiveCoherente
};

function runOne(strategyName, originId, seed) {
  const decide = STRATEGIES[strategyName];
  const state = createInitialState();
  beginNewGame(state, 'normal');
  confirmOrigin(state, originId);

  let maxInfluenceSeen = 0;
  let ticks = 0;
  for (; ticks < MAX_TICKS && state.status === 'playing'; ticks++) {
    simulateTick(state);
    if (state.influence > maxInfluenceSeen) maxInfluenceSeen = state.influence;
    decide(state);
  }

  return {
    strategy: strategyName,
    origin: originId,
    seed,
    status: state.status,
    endReason: state.endReason,
    days: state.day,
    dominance: Number(state.dominance.toFixed(2)),
    globalContainment: Number(state.globalContainment.toFixed(2)),
    maxInfluenceSeen: Number(maxInfluenceSeen.toFixed(2)),
    influenceFinal: Number(state.influence.toFixed(2)),
    upgrades: { ...state.upgrades },
    hitTickCap: ticks >= MAX_TICKS
  };
}

const allResults = [];
const summaryByCap = [];

for (const cap of CAP_VALUES) {
  BALANCE.influenceCap = cap;
  for (const strategyName of Object.keys(STRATEGIES)) {
    const rows = [];
    for (const t of TERRITORIES) {
      for (let seed = 0; seed < TRIALS_PER_ORIGIN; seed++) {
        const r = runOne(strategyName, t.id, seed);
        rows.push(r);
        allResults.push(r);
      }
    }
    const wins = rows.filter((r) => r.status === 'victory').length;
    const maxInf = rows.map((r) => r.maxInfluenceSeen);
    const days = rows.map((r) => r.days);
    summaryByCap.push({
      cap: cap === Infinity ? 'Infinity' : cap,
      strategy: strategyName,
      runs: rows.length,
      victoires: wins,
      tauxVictoire: `${Math.round((wins / rows.length) * 100)}%`,
      maxInfluenceSeenMoyenne: Math.round(maxInf.reduce((a, b) => a + b, 0) / maxInf.length),
      maxInfluenceSeenMax: Math.round(Math.max(...maxInf)),
      dureeJoursMoyenne: Math.round(days.reduce((a, b) => a + b, 0) / days.length)
    });
  }
}

console.log('=== AUDIT INFLUENCE CAP - RESUME ===');
console.table(summaryByCap);
console.log(`Total simulations : ${allResults.length}`);

writeFileSync(
  new URL('../docs/v6-influence-cap-audit.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), capValues: CAP_VALUES.map(c => c === Infinity ? 'Infinity' : c), hoardDays: HOARD_DAYS, pivotDays: PIVOT_DAYS, totalRuns: allResults.length, summary: summaryByCap, results: allResults }, null, 2)
);
console.log('Résultats bruts écrits dans docs/v6-influence-cap-audit.json');
