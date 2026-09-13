// Batterie de simulations de pré-équilibrage pour RUPTURE (V3, V3.1, V4...).
// Ne truque pas les résultats : chaque stratégie est un heuristique honnête,
// exécuté tel quel contre le moteur réel (src/engine), sans connaissance
// privilégiée de l'issue. Sert à révéler les faiblesses du moteur, pas à les
// cacher. Résultats bruts écrits dans docs/v4-simulation-results.json.

import { writeFileSync } from 'node:fs';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES } from '../src/engine/territories.js';
import { BALANCE, upgradeCost } from '../src/engine/balance.js';

const MAX_TICKS = 3000;
const KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];

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

// --- Stratégies "mauvaises ou naïves" (demandées explicitement, §8) ---

const STRATEGIES = {
  passive: () => {},

  'achats-aleatoires': (state) => {
    if (Math.random() < 0.08) {
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
      buyUpgrade(state, kind);
    }
  },

  // Investissement quasi exclusif dans Propagation : hoarde Propagation
  // jusqu'au niveau max avant de considérer autre chose. Doit démontrer que
  // la Propagation seule ne suffit plus (voir aussi le test unitaire dédié).
  'propagation-exclusive': (state) => {
    if (state.upgrades.propagation < BALANCE.upgrades.propagation.maxLevel) {
      if (affordable(state, 'propagation')) buyUpgrade(state, 'propagation');
      return;
    }
    buyFirstAffordable(state, ['dangerosity', 'resilience', 'discretion']);
  },

  // Dangerosité maximale trop tôt : hoarde Dangerosité en premier, avant
  // toute Résilience ou Discrétion - doit alarmer le monde très vite sans
  // aucune défense en place.
  'dangerosite-precoce': (state) => {
    if (state.upgrades.dangerosity < BALANCE.upgrades.dangerosity.maxLevel) {
      if (affordable(state, 'dangerosity')) buyUpgrade(state, 'dangerosity');
      return;
    }
    buyFirstAffordable(state, ['propagation', 'resilience', 'discretion']);
  },

  // Résilience totalement négligée : jamais achetée, quoi qu'il arrive.
  // Doit devenir dangereux une fois la Réponse mondiale mobilisée.
  'resilience-negligee': (state) => {
    buyFirstAffordable(state, ['propagation', 'dangerosity', 'discretion']);
  },

  // Discrétion totalement négligée : jamais achetée. Le monde réagit plus
  // vite, sans aucun ralentissement.
  'discretion-negligee': (state) => {
    buyFirstAffordable(state, ['propagation', 'dangerosity', 'resilience']);
  },

  // Accumulation d'Influence puis achats tardifs : ignore tout jusqu'au
  // jour 600, puis dépense tout ce qui est finançable d'un coup. État
  // suivi sur `state` (jamais dans une fermeture partagée entre runs).
  'accumulation-tardive': (state) => {
    if (state.__lateSpent || state.day < 600) return;
    state.__lateSpent = true;
    spendEverythingAffordable(state);
  },

  // Répartition équilibrée mais sans tenir compte de la situation : achète
  // toujours dans le même ordre fixe, sans jamais regarder l'état du monde
  // (ni mobilisation, ni conscience). C'est la stratégie "naïve" de
  // référence que les stratégies cohérentes doivent battre.
  'equilibree-naive': (state) => {
    buyFirstAffordable(state, KINDS);
  },

  // --- Stratégies "cohérentes et réfléchies" (§8) ---

  // Réactive : offensive (Propagation/Dangerosité) tant que le monde n'a pas
  // mobilisé de réponse sérieuse, puis priorité à la Résilience une fois
  // cette étape franchie - la seule chose qui distingue cette stratégie de
  // "equilibree-naive" est l'ORDRE, décidé à partir de l'état du jeu.
  'reactive-coherente': (state) => {
    const order = isMobilized(state)
      ? ['resilience', 'dangerosity', 'propagation', 'discretion']
      : ['propagation', 'dangerosity', 'discretion', 'resilience'];
    buyFirstAffordable(state, order);
  },

  // Furtive puis frappe : construit d'abord une bonne Discrétion (retarde
  // la réaction du monde) tout en étendant la Propagation, ne commence à
  // investir dans la Dangerosité qu'une fois discrète et bien répandue,
  // puis bascule vers la Résilience si le monde mobilise malgré tout.
  'furtive-puis-frappe': (state) => {
    if (state.upgrades.discretion < 5) {
      buyFirstAffordable(state, ['discretion', 'propagation']);
      return;
    }
    if (isMobilized(state)) {
      buyFirstAffordable(state, ['resilience', 'dangerosity', 'propagation']);
      return;
    }
    buyFirstAffordable(state, ['propagation', 'dangerosity', 'discretion']);
  },

  // --- Familles supplémentaires demandées explicitement pour V4 (§3) ---

  // Discrétion prioritaire : maximise Discrétion avant tout le reste,
  // bascule vers l'offensive puis (si mobilisé) vers la Résilience une fois
  // Discrétion épuisée. Distincte de "furtive-puis-frappe" (qui ne pousse
  // Discrétion qu'à 5 avant de bifurquer) : ici Discrétion va jusqu'au bout.
  'discretion-prioritaire': (state) => {
    if (state.upgrades.discretion < BALANCE.upgrades.discretion.maxLevel) {
      if (affordable(state, 'discretion')) buyUpgrade(state, 'discretion');
      return;
    }
    buyFirstAffordable(state, isMobilized(state) ? ['resilience', 'dangerosity', 'propagation'] : ['propagation', 'dangerosity', 'resilience']);
  },

  // Résilience développée plus tôt : à l'inverse de "resilience-negligee",
  // maximise la Résilience en tout premier, avant même que le monde n'ait
  // commencé à mobiliser une réponse - un pari sur la survie à long terme
  // plutôt que sur la vitesse d'expansion initiale.
  'resilience-precoce': (state) => {
    if (state.upgrades.resilience < BALANCE.upgrades.resilience.maxLevel) {
      if (affordable(state, 'resilience')) buyUpgrade(state, 'resilience');
      return;
    }
    buyFirstAffordable(state, ['propagation', 'dangerosity', 'discretion']);
  },

  // Stratégie exacte jouée par l'utilisateur lors de la bêta manuelle V3.1
  // qui a motivé cette passe (défaite jour 746, 98% de Progression contre
  // 100% de Réponse mondiale - une partie extrêmement serrée) : Propagation
  // à fond, puis Discrétion à fond, puis Dangerosité/Résilience au mieux
  // selon le temps restant. Conservée telle quelle pour vérifier l'effet
  // réel du recalibrage V4 sur ce cas concret, sans le forcer à gagner.
  'beta-utilisateur-v3.1': (state) => {
    if (state.upgrades.propagation < BALANCE.upgrades.propagation.maxLevel) {
      if (affordable(state, 'propagation')) buyUpgrade(state, 'propagation');
      return;
    }
    if (state.upgrades.discretion < BALANCE.upgrades.discretion.maxLevel) {
      if (affordable(state, 'discretion')) buyUpgrade(state, 'discretion');
      return;
    }
    buyFirstAffordable(state, isMobilized(state) ? ['resilience', 'dangerosity'] : ['dangerosity', 'resilience']);
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
  let mobilizedAtDay = null;
  for (; ticks < MAX_TICKS && state.status === 'playing'; ticks++) {
    const beforeTick = state.influence;
    simulateTick(state);
    const afterTick = state.influence;
    totalEarned += Math.max(0, afterTick - beforeTick);
    if (mobilizedAtDay === null && isMobilized(state)) mobilizedAtDay = state.day;

    const upgradesBefore = KINDS.reduce((sum, k) => sum + state.upgrades[k], 0);
    decide(state);
    const upgradesAfter = KINDS.reduce((sum, k) => sum + state.upgrades[k], 0);
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
    mobilizedAtDay,
    purchaseCount,
    dominance: Number(state.dominance.toFixed(2)),
    reach: Number(state.reach.toFixed(2)),
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
      !Number.isFinite(r.reach) ||
      r.dominance < 0 ||
      r.dominance > 100 ||
      r.globalContainment < 0 ||
      r.globalContainment > 100 ||
      r.reach < 0 ||
      r.reach > 100
  );
  const earned = rows.map((r) => r.influenceEarned);
  const spent = rows.map((r) => r.influenceSpent);
  const firstDays = rows.map((r) => r.firstPurchaseDay).filter((d) => d !== null);
  const secondDays = rows.map((r) => r.secondPurchaseDay).filter((d) => d !== null);
  const winDays = rows.filter((r) => r.status === 'victory').map((r) => r.days);
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  summary.push({
    strategy,
    runs: rows.length,
    victoires: wins,
    premierAchatJourMoyen: avg(firstDays),
    deuxiemeAchatJourMoyen: avg(secondDays),
    defaites: rows.length - wins,
    tauxVictoire: `${Math.round((wins / rows.length) * 100)}%`,
    dureeJoursMinVictoire: winDays.length ? Math.min(...winDays) : null,
    dureeJoursMaxVictoire: winDays.length ? Math.max(...winDays) : null,
    dureeJoursMoyenneVictoire: avg(winDays),
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
  new URL('../docs/v4-simulation-results.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), totalRuns: results.length, summary, results }, null, 2)
);

console.log('Résultats bruts écrits dans docs/v4-simulation-results.json');
