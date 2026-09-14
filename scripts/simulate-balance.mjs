// Batterie de simulations de pré-équilibrage pour RUPTURE (V3, V3.1, V4, V4.1, V4.2, V5.2...).
// Ne truque pas les résultats : chaque stratégie est un heuristique honnête,
// exécuté tel quel contre le moteur réel (src/engine), sans connaissance
// privilégiée de l'issue. Sert à révéler les faiblesses du moteur, pas à les
// cacher. Depuis V4.1, chaque stratégie est rejouée sur les trois difficultés
// (easy/normal/hard) : Facile/Normal/Difficile doivent avoir des rôles
// réellement distincts, ce qui se vérifie et ne se décrète pas. Résultats
// bruts écrits dans docs/v5.2-simulation-results.json.

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
  },

  // --- Famille "implantation puis bascule tardive" (V5.2, audit bêta) ---
  // Stratégie exacte jouée par l'utilisateur lors de la bêta manuelle V5.1
  // qui a motivé cette passe (défaite jour 532, Progression bloquée à 98%
  // max, Résilience 0) : Discrétion et Propagation à un niveau modéré (5),
  // implantation mondiale, PUIS bascule complète sur Dangerosité jusqu'au
  // maximum. Résilience jamais investie - le pari "all-in" le plus risqué de
  // cette famille : aucune protection une fois la Réponse mondiale mobilisée.
  'furtive-bascule-resilience0': (state) => {
    if (state.upgrades.discretion < 5) {
      if (affordable(state, 'discretion')) buyUpgrade(state, 'discretion');
      return;
    }
    if (state.upgrades.propagation < 5) {
      if (affordable(state, 'propagation')) buyUpgrade(state, 'propagation');
      return;
    }
    if (affordable(state, 'dangerosity')) buyUpgrade(state, 'dangerosity');
  },

  // Même bascule tardive, mais une Résilience FAIBLE (jusqu'à 3) est achetée
  // une fois la Réponse mondiale mobilisée - le pari reste risqué mais n'est
  // plus un renoncement total à toute protection.
  'furtive-bascule-resilience-faible': (state) => {
    if (state.upgrades.discretion < 5) {
      if (affordable(state, 'discretion')) buyUpgrade(state, 'discretion');
      return;
    }
    if (state.upgrades.propagation < 5) {
      if (affordable(state, 'propagation')) buyUpgrade(state, 'propagation');
      return;
    }
    if (isMobilized(state) && state.upgrades.resilience < 3) {
      if (affordable(state, 'resilience')) buyUpgrade(state, 'resilience');
      return;
    }
    if (affordable(state, 'dangerosity')) buyUpgrade(state, 'dangerosity');
  },

  // Même bascule tardive, avec une Résilience MOYENNE (jusqu'à 6) une fois
  // mobilisé - toujours un pari offensif, mais nettement plus prudent.
  'furtive-bascule-resilience-moyenne': (state) => {
    if (state.upgrades.discretion < 5) {
      if (affordable(state, 'discretion')) buyUpgrade(state, 'discretion');
      return;
    }
    if (state.upgrades.propagation < 5) {
      if (affordable(state, 'propagation')) buyUpgrade(state, 'propagation');
      return;
    }
    if (isMobilized(state) && state.upgrades.resilience < 6) {
      if (affordable(state, 'resilience')) buyUpgrade(state, 'resilience');
      return;
    }
    if (affordable(state, 'dangerosity')) buyUpgrade(state, 'dangerosity');
  }
};

function runOne(strategyName, originId, difficulty = 'normal') {
  const decide = STRATEGIES[strategyName];
  const state = createInitialState();
  beginNewGame(state, difficulty);
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
    difficulty,
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

const DIFFICULTIES_TESTED = ['easy', 'normal', 'hard'];

const results = [];
for (const difficulty of DIFFICULTIES_TESTED) {
  for (const strategyName of Object.keys(STRATEGIES)) {
    for (const t of TERRITORIES) {
      results.push(runOne(strategyName, t.id, difficulty));
    }
  }
}

// --- Analysis ---
// Groupé par (stratégie, difficulté) - V4.1 ajoute la difficulté comme
// dimension permanente de la batterie (voir §5 : Facile/Normal/Difficile
// doivent avoir des rôles réellement distincts, vérifié par simulation et
// non postulé).
const byStrategy = {};
for (const r of results) {
  const key = `${r.strategy}::${r.difficulty}`;
  byStrategy[key] ??= [];
  byStrategy[key].push(r);
}

const summary = [];
for (const rows of Object.values(byStrategy)) {
  const strategy = rows[0].strategy;
  const difficulty = rows[0].difficulty;
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
    difficulty,
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

for (const difficulty of DIFFICULTIES_TESTED) {
  console.log(`=== RESUME (${difficulty}) ===`);
  console.table(summary.filter((s) => s.difficulty === difficulty));
}
console.log('=== TOTAL simulations :', results.length, '===');

writeFileSync(
  new URL('../docs/v5.2-simulation-results.json', import.meta.url),
  JSON.stringify({ generatedAt: new Date().toISOString(), totalRuns: results.length, summary, results }, null, 2)
);

console.log('Résultats bruts écrits dans docs/v5.2-simulation-results.json');
