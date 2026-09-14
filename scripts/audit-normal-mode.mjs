// RUPTURE V6 - Chantier B : audit du rythme Conscience/Mobilisation/Réponse
// en mode Normal. Sert à vérifier si le repère de bêta (Conscience
// ~jour398, Mobilisation ~jour445, victoire jour478, Réponse 38%,
// Conscience moyenne 53%) est un cas isolé ou un comportement systématique
// du moteur actuel, PUIS à tester si un levier ciblé peut avancer ce rythme
// sans casser la hiérarchie de stratégies déjà validée.
//
// Conclusion de cet audit (voir docs/v6-normal-mode-audit.json pour le
// détail complet) : le repère de bêta EST systématique (toute stratégie
// gagnante en Normal reste en phase "Ignorance" pendant ~75-80% de la
// partie, Conscience/Mobilisation n'émergent qu'après le jour ~350-400).
// Trois leviers naturels ont été testés pour avancer ce rythme
// (awarenessCatchupRate, humanity.responseCurvePower,
// dangerosityAwarenessBleed) : les trois reproduisent la même falaise déjà
// documentée en V4/V4.1/V4.2 pour des leviers voisins - soit un effet de
// calendrier négligeable (quelques jours) pour un coût catastrophique
// (stratégies auparavant gagnantes qui tombent à 0%, ou au contraire
// passent à 100% - jamais un déplacement progressif), soit les deux à la
// fois. AUCUN changement n'a donc été appliqué à ces constantes : la
// calibration actuelle est déjà au point d'équilibre, la modifier
// "forcerait l'hypothèse" du cahier des charges au lieu de la vérifier
// (voir §9). Conservé tel quel, avec cette décision documentée plutôt que
// silencieuse.

import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES } from '../src/engine/territories.js';
import { BALANCE, upgradeCost } from '../src/engine/balance.js';
import { writeFileSync } from 'node:fs';

const MAX_TICKS = 3000;
const KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];

function affordable(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  return state.upgrades[kind] < cfg.maxLevel && state.influence >= upgradeCost(kind, state.upgrades[kind]);
}
function buyFirstAffordable(state, order) {
  for (const kind of order) {
    if (affordable(state, kind)) { buyUpgrade(state, kind); return true; }
  }
  return false;
}
function isMobilized(state) { return state.globalContainment >= BALANCE.humanity.mobilizationThreshold; }

const STRATEGIES = {
  'reactive-coherente': (state) => buyFirstAffordable(state, isMobilized(state) ? ['resilience','dangerosity','propagation','discretion'] : ['propagation','dangerosity','discretion','resilience']),
  'furtive-puis-frappe': (state) => {
    if (state.upgrades.discretion < 5) return buyFirstAffordable(state, ['discretion','propagation']);
    if (isMobilized(state)) return buyFirstAffordable(state, ['resilience','dangerosity','propagation']);
    return buyFirstAffordable(state, ['propagation','dangerosity','discretion']);
  },
  'dangerosite-precoce': (state) => {
    if (state.upgrades.dangerosity < BALANCE.upgrades.dangerosity.maxLevel) {
      if (affordable(state,'dangerosity')) buyUpgrade(state,'dangerosity');
      return;
    }
    buyFirstAffordable(state, ['propagation','resilience','discretion']);
  },
  // Approxime le build final rapporté en bêta (P5/D9/R3/Disc5) : Discrétion
  // et Propagation modérées d'abord, puis Dangerosité poussée fort, avec un
  // peu de Résilience une fois mobilisé - proche de "furtive-bascule-resilience-faible".
  'beta-build-approx': (state) => {
    if (state.upgrades.discretion < 5) { if (affordable(state,'discretion')) buyUpgrade(state,'discretion'); return; }
    if (state.upgrades.propagation < 5) { if (affordable(state,'propagation')) buyUpgrade(state,'propagation'); return; }
    if (isMobilized(state) && state.upgrades.resilience < 3) { if (affordable(state,'resilience')) buyUpgrade(state,'resilience'); return; }
    if (affordable(state,'dangerosity')) buyUpgrade(state,'dangerosity');
  }
};

function runOne(strategyName, originId) {
  const decide = STRATEGIES[strategyName];
  const state = createInitialState();
  beginNewGame(state, 'normal');
  confirmOrigin(state, originId);
  let conscienceDay = null, mobilisationDay = null;
  for (let i = 0; i < MAX_TICKS && state.status === 'playing'; i++) {
    simulateTick(state);
    if (conscienceDay === null && state.globalContainment >= 5) conscienceDay = state.day;
    if (mobilisationDay === null && state.globalContainment >= BALANCE.humanity.mobilizationThreshold) mobilisationDay = state.day;
    decide(state);
  }
  return {
    strategy: strategyName, origin: originId, status: state.status, days: state.day,
    conscienceDay, mobilisationDay,
    dominance: Number(state.dominance.toFixed(1)), reach: Number(state.reach.toFixed(1)),
    globalContainment: Number(state.globalContainment.toFixed(1)), globalAwareness: Number(state.globalAwareness.toFixed(1)),
    upgrades: { ...state.upgrades }
  };
}

const rows = [];
for (const strategyName of Object.keys(STRATEGIES)) {
  for (const t of TERRITORIES) rows.push(runOne(strategyName, t.id));
}

for (const strategyName of Object.keys(STRATEGIES)) {
  const rs = rows.filter(r => r.strategy === strategyName);
  const wins = rs.filter(r => r.status === 'victory');
  const avg = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
  console.log(`\n=== ${strategyName} (${wins.length}/${rs.length} victoires) ===`);
  console.log('conscienceDay (moy, victoires):', avg(wins.map(r=>r.conscienceDay).filter(x=>x!==null)));
  console.log('mobilisationDay (moy, victoires):', avg(wins.map(r=>r.mobilisationDay).filter(x=>x!==null)));
  console.log('jour victoire (moy):', avg(wins.map(r=>r.days)));
  console.log('globalContainment à la fin (moy, victoires):', avg(wins.map(r=>r.globalContainment)));
  console.log('globalAwareness à la fin (moy, victoires):', avg(wins.map(r=>r.globalAwareness)));
  console.log('build moyen (victoires):', wins.length ? KINDS.map(k => `${k}:${avg(wins.map(r=>r.upgrades[k]))}`).join(' ') : 'n/a');
}

// --- Balayage de leviers candidats (résultat : tous rejetés, voir en-tête) ---
function sweepLever(paramPath, values, restore) {
  const rows2 = [];
  for (const value of values) {
    setParam(paramPath, value);
    for (const strategyName of Object.keys(STRATEGIES)) {
      const rs = TERRITORIES.map((t) => runOne(strategyName, t.id));
      const wins = rs.filter((r) => r.status === 'victory');
      const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
      rows2.push({
        lever: paramPath,
        value,
        strategy: strategyName,
        runs: rs.length,
        victoires: wins.length,
        tauxVictoire: `${Math.round((wins.length / rs.length) * 100)}%`,
        conscienceDayMoyen: avg(wins.map((r) => r.conscienceDay).filter((x) => x !== null)),
        mobilisationDayMoyen: avg(wins.map((r) => r.mobilisationDay).filter((x) => x !== null))
      });
    }
  }
  restore();
  return rows2;
}

function setParam(path, value) {
  if (path === 'awarenessCatchupRate') BALANCE.awarenessCatchupRate = value;
  if (path === 'humanity.responseCurvePower') BALANCE.humanity.responseCurvePower = value;
  if (path === 'dangerosityAwarenessBleed') BALANCE.dangerosityAwarenessBleed = value;
}

const baseline = {
  awarenessCatchupRate: BALANCE.awarenessCatchupRate,
  responseCurvePower: BALANCE.humanity.responseCurvePower,
  dangerosityAwarenessBleed: BALANCE.dangerosityAwarenessBleed
};

const leverResults = [
  ...sweepLever('awarenessCatchupRate', [0.10, 0.13, 0.16, 0.20, 0.25], () => { BALANCE.awarenessCatchupRate = baseline.awarenessCatchupRate; }),
  ...sweepLever('humanity.responseCurvePower', [1.6, 1.4, 1.2, 1.0], () => { BALANCE.humanity.responseCurvePower = baseline.responseCurvePower; }),
  ...sweepLever('dangerosityAwarenessBleed', [1.6, 1.8, 2.0, 2.4], () => { BALANCE.dangerosityAwarenessBleed = baseline.dangerosityAwarenessBleed; })
];

console.log('\n=== BALAYAGE DE LEVIERS (tous rejetés - voir en-tête du fichier) ===');
console.table(leverResults);

writeFileSync(
  new URL('../docs/v6-normal-mode-audit.json', import.meta.url),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    betaReference: {
      victoryDay: 478, anomalie: '100%', conscience: '53%', reponseMondiale: '38%',
      regions: '18/18', build: 'Propagation 5 / Danger 9 / Résilience 3 / Discrétion 5',
      apparitionConscience: '~jour 398', apparitionMobilisation: '~jour 445'
    },
    currentStateAudit: rows,
    leverSweep: leverResults,
    decision: 'Aucune modification appliquée aux constantes tension/awareness/réponse : les trois leviers testés reproduisent une falaise (effet négligeable ou effondrement/plafond de taux de victoire), déjà documentée pour des leviers voisins en V4/V4.1/V4.2. Conservé tel quel, décision documentée conformément au §9 du cahier des charges V6.'
  }, null, 2)
);
console.log('\nRésultats bruts écrits dans docs/v6-normal-mode-audit.json');
