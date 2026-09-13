import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES, buildAdjacency } from '../src/engine/territories.js';
import { BALANCE, upgradeCost, tensionAt } from '../src/engine/balance.js';

const MAX_TICKS = 3000;
const KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];

function freshGame(originId = 'fenwick') {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, originId);
  return state;
}

function runUntilEnd(state, onTick) {
  for (let i = 0; i < MAX_TICKS && state.status === 'playing'; i++) {
    simulateTick(state);
    if (onTick) onTick(state, i);
  }
  return state;
}

function buyRoundRobin(state) {
  for (const kind of KINDS) buyUpgrade(state, kind);
}

function spendEverythingAffordable(state) {
  let boughtSomething = true;
  while (boughtSomething) {
    boughtSomething = false;
    for (const kind of KINDS) {
      const cfg = BALANCE.upgrades[kind];
      if (state.upgrades[kind] >= cfg.maxLevel) continue;
      if (upgradeCost(kind, state.upgrades[kind]) <= state.influence) {
        buyUpgrade(state, kind);
        boughtSomething = true;
      }
    }
  }
}

test('simulateTick does nothing when the game is not playing', () => {
  const state = createInitialState();
  simulateTick(state);
  assert.equal(state.day, 0);
});

test('the origin territory crisis grows over time', () => {
  const state = freshGame();
  const start = state.territories.fenwick.crisis;
  simulateTick(state);
  assert.ok(state.territories.fenwick.crisis > start, 'crisis should grow after a tick');
  assert.equal(state.day, 1);
});

test('tensionAt ramps from a low starting value up to its maximum and stays capped', () => {
  const early = tensionAt(0);
  const mid = tensionAt(Math.round(BALANCE.tension.rampDays / 2));
  const late = tensionAt(BALANCE.tension.rampDays);
  const beyond = tensionAt(BALANCE.tension.rampDays * 2);
  assert.ok(early < mid && mid < late, 'tension should increase monotonically during the ramp');
  assert.equal(late, BALANCE.tension.max);
  assert.equal(beyond, BALANCE.tension.max, 'tension must not exceed its max after the ramp');
  assert.equal(tensionAt(0), BALANCE.tension.min);
});

test('propagation reaches a directly connected neighbor once the source crosses the spread threshold', () => {
  const state = freshGame('fenwick');
  const adjacency = buildAdjacency();
  const neighborIds = [...adjacency.get('fenwick')];
  let reached = false;
  for (let i = 0; i < MAX_TICKS && state.status === 'playing' && !reached; i++) {
    simulateTick(state);
    if (
      state.territories.fenwick.crisis >= BALANCE.spreadThreshold &&
      neighborIds.some((id) => state.territories[id].crisis > 0)
    ) {
      reached = true;
    }
  }
  assert.ok(reached, 'propagation should reach at least one neighbor before the game ends');
});

test('a territory with no infected neighbor and zero crisis stays at zero', () => {
  const state = freshGame('fenwick');
  const adjacency = buildAdjacency();
  const distantId = TERRITORIES.find((t) => t.id !== 'fenwick' && !adjacency.get('fenwick').has(t.id))?.id;
  assert.ok(distantId, 'test setup requires at least one non-adjacent territory');
  simulateTick(state);
  assert.equal(state.territories[distantId].crisis, 0);
});

test('influence never goes negative through a full playthrough (it may fall when suppression erodes income sources)', () => {
  runUntilEnd(freshGame(), (s) => {
    assert.ok(s.influence >= 0, `influence went negative at day ${s.day}`);
  });
});

test('buyUpgrade deducts the exact cost and increments the level', () => {
  const state = freshGame();
  state.influence = 1000;
  const cost = upgradeCost('propagation', 0);
  const ok = buyUpgrade(state, 'propagation');
  assert.equal(ok, true);
  assert.equal(state.upgrades.propagation, 1);
  assert.equal(state.influence, 1000 - cost);
});

test('buyUpgrade fails without enough influence and state is unchanged', () => {
  const state = freshGame();
  state.influence = 0;
  const ok = buyUpgrade(state, 'propagation');
  assert.equal(ok, false);
  assert.equal(state.upgrades.propagation, 0);
  assert.equal(state.influence, 0);
});

test('buyUpgrade refuses to exceed maxLevel, for all four branches', () => {
  for (const kind of KINDS) {
    const state = freshGame();
    state.influence = 1_000_000;
    const cfg = BALANCE.upgrades[kind];
    for (let i = 0; i < cfg.maxLevel; i++) assert.equal(buyUpgrade(state, kind), true);
    assert.equal(state.upgrades[kind], cfg.maxLevel);
    assert.equal(buyUpgrade(state, kind), false);
    assert.equal(state.upgrades[kind], cfg.maxLevel);
  }
});

test('buyUpgrade rejects an unknown upgrade kind', () => {
  const state = freshGame();
  state.influence = 1000;
  assert.equal(buyUpgrade(state, 'nonexistent'), false);
});

test('local reactions rise with crisis: awareness and containment increase for an infected territory', () => {
  const state = freshGame('fenwick');
  for (let i = 0; i < 400; i++) simulateTick(state);
  const ts = state.territories.fenwick;
  assert.ok(ts.awareness > 0, 'awareness should rise once crisis is present');
  assert.ok(ts.containment > 0, 'containment should follow awareness upward');
});

test('global containment (Réponse mondiale) rises monotonically while the anomaly is active', () => {
  const state = freshGame();
  let previous = state.globalContainment;
  runUntilEnd(state, (s) => {
    assert.ok(s.globalContainment >= previous - 1e-9, 'global containment should not decrease');
    assert.ok(s.globalContainment >= 0 && s.globalContainment <= 100, 'global containment must stay in [0,100]');
    previous = s.globalContainment;
  });
});

test('victory triggers once dominance crosses the threshold, with a clear reason', () => {
  const state = freshGame();
  runUntilEnd(state);
  assert.ok(state.status === 'victory' || state.status === 'defeat', 'the game must reach an end state');
  if (state.status === 'victory') {
    assert.ok(state.dominance >= BALANCE.victoryDominanceThreshold);
    assert.equal(state.endReason, 'dominance');
  }
});

test('defeat triggers once global containment reaches 100 without upgrades (passive play)', () => {
  const state = freshGame();
  runUntilEnd(state);
  assert.equal(state.status, 'defeat');
  assert.equal(state.endReason, 'containment');
  assert.equal(state.globalContainment, 100);
});

test('a safety cap forces the game to end even in a frozen edge case', () => {
  const state = freshGame();
  state.day = BALANCE.maxDays - 1;
  simulateTick(state);
  assert.equal(state.status, 'defeat');
  assert.equal(state.endReason, 'timeout');
});

test('engine invariants hold over an extended run: no NaN, no negative stats, bounded values', () => {
  const state = freshGame('gora');
  runUntilEnd(state, (s) => {
    assert.ok(Number.isFinite(s.influence) && s.influence >= 0);
    assert.ok(Number.isFinite(s.dominance) && s.dominance >= 0 && s.dominance <= 100);
    assert.ok(Number.isFinite(s.reach) && s.reach >= 0 && s.reach <= 100);
    assert.ok(s.dominance <= s.reach + 1e-9, 'progression (severity-weighted) must never exceed raw reach');
    assert.ok(Number.isFinite(s.globalContainment) && s.globalContainment >= 0 && s.globalContainment <= 100);
    for (const t of TERRITORIES) {
      const ts = s.territories[t.id];
      assert.ok(Number.isFinite(ts.crisis) && ts.crisis >= 0 && ts.crisis <= 100, `${t.id} crisis out of bounds`);
      assert.ok(Number.isFinite(ts.awareness) && ts.awareness >= 0 && ts.awareness <= 100);
      assert.ok(Number.isFinite(ts.containment) && ts.containment >= 0 && ts.containment <= 100);
    }
  });
  assert.ok(state.day <= BALANCE.maxDays, 'the game must not run past the safety cap');
});

// Regression test added after the first human smartphone beta: the player reported
// winning after being essentially passive, having made only "about one" purchase.
test('REGRESSION (post-beta V0->V1): a single isolated upgrade purchase must never win, from any origin, at any timing', () => {
  const buyDays = [1, 5, 20, 50, 100, 150, 200, 300, 400, 500, 600, 700];
  for (const originId of TERRITORIES.map((t) => t.id)) {
    for (const buyDay of buyDays) {
      const state = freshGame(originId);
      let bought = false;
      runUntilEnd(state, (s) => {
        if (!bought && s.day >= buyDay) {
          buyUpgrade(s, 'propagation');
          bought = true;
        }
      });
      assert.equal(
        state.status,
        'defeat',
        `origin=${originId} buyDay=${buyDay} should stay a defeat with a single isolated purchase, got ${state.status} (dom=${state.dominance.toFixed(1)})`
      );
    }
  }
});

test('Monte-Carlo: passive play does not produce a systematic instant win or an unreachable victory', () => {
  const outcomes = { victory: 0, defeat: 0 };
  for (const origin of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(origin);
    runUntilEnd(state);
    outcomes[state.status] = (outcomes[state.status] || 0) + 1;
    assert.ok(state.day > 100, `origin ${origin} ended suspiciously fast (day ${state.day})`);
  }
  assert.equal(outcomes.defeat, TERRITORIES.length, 'passive play (no upgrades) should consistently lose in this balance');
});

// V3.1 : depuis que la Résilience doit être investie sérieusement pour
// neutraliser le resserrement du plafond une fois l'Humanité mobilisée (voir
// simulation.js), un round-robin aveugle (qui ne réagit jamais à l'état du
// monde) n'est plus suffisant pour gagner de façon fiable - seul l'ORDRE
// d'achat (Résilience priorisée une fois mobilisé) fait la différence, à
// dépense égale. Comparaison mesurée, pas un chiffre choisi à l'avance.
test('Monte-Carlo: a state-aware reactive strategy wins meaningfully more often than blind round-robin, from a majority of origins', () => {
  let roundRobinWins = 0;
  let reactiveWins = 0;
  for (const origin of TERRITORIES.map((t) => t.id)) {
    const roundRobinState = freshGame(origin);
    runUntilEnd(roundRobinState, buyRoundRobin);
    if (roundRobinState.status === 'victory') roundRobinWins += 1;
    assert.ok(roundRobinState.day > 100, `origin ${origin} ended suspiciously fast even with active upgrades (day ${roundRobinState.day})`);

    const reactiveState = freshGame(origin);
    runUntilEnd(reactiveState, buyReactively);
    if (reactiveState.status === 'victory') reactiveWins += 1;
  }
  assert.ok(
    reactiveWins > roundRobinWins,
    `a state-aware order should win more often (${reactiveWins}/${TERRITORIES.length}) than blind round-robin (${roundRobinWins}/${TERRITORIES.length})`
  );
  assert.ok(
    reactiveWins >= TERRITORIES.length / 2,
    `a well-adapted strategy should win from at least half the origins, got ${reactiveWins}/${TERRITORIES.length}`
  );
});

// V3 : la Propagation ne doit plus, seule, pouvoir gagner - la conversion de
// portée en progression réelle exige un minimum de Dangerosité (voir
// balance.js: severity.baseFactor). Une Anomalie extrêmement répandue mais
// jamais rendue dangereuse doit rester bloquée loin du seuil de victoire.
test('V3: maxing Propagation (and only Propagation) can spread everywhere but cannot reach victory alone', () => {
  for (const origin of ['fenwick', 'jotun']) {
    const state = freshGame(origin);
    runUntilEnd(state, (s) => {
      if (s.upgrades.propagation < BALANCE.upgrades.propagation.maxLevel) buyUpgrade(s, 'propagation');
    });
    assert.notEqual(state.status, 'victory', `origin=${origin}: Propagation-only should never reach victory`);
    assert.ok(
      state.reach > 20,
      `origin=${origin}: Propagation-only should still spread noticeably before being pushed back (reach=${state.reach.toFixed(1)})`
    );
  }
});

// V3.1 (bêta manuelle, demande explicite §2) : à Dangerosité 0, une région
// doit pouvoir être touchée mais jamais devenir Sévère (>=50) ou Critique
// (>=75) - vérifié sur TOUT le déroulé de la partie, pas seulement à la fin.
test('V3.1: with Dangerosity at 0, no territory ever becomes Sévère or Critique (crisis stays below 50)', () => {
  const state = freshGame('fenwick');
  runUntilEnd(state, (s) => {
    // Investit dans tout SAUF Dangerosité, pour pousser la crise aussi fort
    // que possible sans jamais l'ouvrir.
    for (const kind of ['propagation', 'resilience', 'discretion']) buyUpgrade(s, kind);
    for (const t of TERRITORIES) {
      assert.ok(
        s.territories[t.id].crisis < 50,
        `${t.id} reached Sévère/Critique (crisis=${s.territories[t.id].crisis.toFixed(1)}) despite Dangerosité=0 at day ${s.day}`
      );
    }
  });
  assert.equal(state.upgrades.dangerosity, 0, 'test setup error: Dangerosity should never have been purchased');
});

// V3.1 (demande explicite §2) : Propagation élevée + Dangerosité 0 doit
// quand même permettre une large diffusion (beaucoup de régions touchées),
// même si leur gravité individuelle reste plafonnée.
test('V3.1: high Propagation with Dangerosity at 0 still reaches most territories', () => {
  const state = freshGame('fenwick');
  runUntilEnd(state, (s) => {
    if (s.upgrades.propagation < BALANCE.upgrades.propagation.maxLevel) buyUpgrade(s, 'propagation');
  });
  const touched = TERRITORIES.filter((t) => state.territories[t.id].crisis > 0).length;
  assert.ok(
    touched >= TERRITORIES.length - 2,
    `Propagation-only should still touch nearly every territory, got ${touched}/${TERRITORIES.length}`
  );
  assert.ok(state.reach >= 70, `Propagation-only should reach a wide share of the population, got reach=${state.reach.toFixed(1)}`);
});

// V3.1 (demande explicite §3) : la courbe de Réponse mondiale doit être
// lissée (montée plus progressive à conscience faible/moyenne) sans changer
// le danger final (conscience totale -> même résultat qu'une progression
// linéaire). Testé directement sur la formule de mise en forme, isolée de
// toute autre dynamique.
test('V3.1: the world response curve is smoothed at low/mid awareness but unchanged at the extremes', () => {
  const { responseCurvePower } = BALANCE.humanity;
  assert.ok(responseCurvePower > 1, 'a smoothing exponent > 1 is required to slow the early/mid ramp');
  const shape = (awarenessFraction) => Math.pow(awarenessFraction, responseCurvePower) * 100;
  assert.equal(shape(0), 0, 'no awareness should still mean no response progress');
  assert.equal(shape(1), 100, 'full awareness must still drive the response at full strength (danger not neutralized)');
  assert.ok(
    shape(0.5) < 50,
    `at half awareness, the shaped response (${shape(0.5).toFixed(1)}) should lag behind a linear one (50) - that is the smoothing`
  );
});

// V3 : une fois la Réponse mondiale mobilisée (au-delà du seuil), l'Humanité
// repousse activement l'Anomalie ; la Résilience atténue cette érosion.
// Vérifié directement sur un tick isolé, à état initial identique, pour
// mesurer le mécanisme lui-même plutôt qu'une partie entière.
test('V3: once the world response is mobilized, zero Résilience erodes crisis faster than high Résilience', () => {
  function tickWithResilience(resilienceLevel) {
    const state = freshGame('fenwick');
    state.upgrades.resilience = resilienceLevel;
    state.territories.fenwick.crisis = 80;
    state.globalContainment = BALANCE.humanity.mobilizationThreshold + 30; // clairement mobilisé
    const before = state.territories.fenwick.crisis;
    simulateTick(state);
    return before - state.territories.fenwick.crisis; // perte nette de crise ce tick
  }
  const lossAtZero = tickWithResilience(0);
  const lossAtMax = tickWithResilience(BALANCE.upgrades.resilience.maxLevel);
  assert.ok(lossAtZero > lossAtMax, `zero Résilience should erode faster (${lossAtZero}) than max Résilience (${lossAtMax}) once mobilized`);
});

test('V3: below the mobilization threshold, Résilience level has no active-suppression effect yet', () => {
  function crisisAfterOneTick(resilienceLevel) {
    const state = freshGame('fenwick');
    state.upgrades.resilience = resilienceLevel;
    state.territories.fenwick.crisis = 80;
    state.globalContainment = BALANCE.humanity.mobilizationThreshold - 10; // pas encore mobilisé
    simulateTick(state);
    return state.territories.fenwick.crisis;
  }
  // Sans mobilisation, la Résilience n'agit encore que sur la croissance/la
  // propagation (comme en V2), pas sur une érosion active - la différence
  // entre 0 et max doit donc être minime comparée au cas mobilisé ci-dessus.
  const at0 = crisisAfterOneTick(0);
  const atMax = crisisAfterOneTick(BALANCE.upgrades.resilience.maxLevel);
  assert.ok(Math.abs(at0 - atMax) < 1, `pre-mobilization Résilience should barely matter yet (0=${at0.toFixed(2)}, max=${atMax.toFixed(2)})`);
});

// V3 : la Dangerosité alarme le monde beaucoup plus vite que la Propagation,
// à niveau de crise égal (dangerosityAwarenessBleed > propagationAwarenessBleed
// une fois ramené au même ordre de grandeur d'effet). Comparaison isolée sur
// le seul territoire d'origine, tôt (avant que les voisins ne soient
// atteints) : à ce stade Propagation n'a encore aucun effet sur SA PROPRE
// crise (elle ne joue que sur la diffusion vers les voisins) - la crise du
// territoire d'origine est donc quasi identique dans les deux scénarios, ce
// qui isole proprement l'effet sur la conscience.
test('V3: rushing Dangerosity early raises local awareness faster than rushing Propagation, at matched crisis levels', () => {
  function awarenessAfter(kind, level, days) {
    const state = freshGame('fenwick');
    state.upgrades[kind] = level;
    for (let i = 0; i < days; i++) simulateTick(state);
    return state.territories.fenwick;
  }
  const days = 80;
  const level = 6;
  const viaDangerosity = awarenessAfter('dangerosity', level, days);
  const viaPropagation = awarenessAfter('propagation', level, days);
  assert.ok(
    Math.abs(viaDangerosity.crisis - viaPropagation.crisis) < 0.01,
    'this comparison requires matched crisis levels on the origin territory to be meaningful'
  );
  assert.ok(
    viaDangerosity.awareness > viaPropagation.awareness,
    `rushing Dangerosity (awareness=${viaDangerosity.awareness.toFixed(2)}) should alarm the world more, at equal crisis, than rushing Propagation (awareness=${viaPropagation.awareness.toFixed(2)})`
  );
});

test('REGRESSION (post-beta1): the first affordable upgrade purchase arrives within a reasonable early window, from any origin', () => {
  const cost = upgradeCost('propagation', 0);
  for (const originId of ['jotun', 'fenwick', 'arca', 'lyrath', 'nyxor', 'halvern']) {
    const state = freshGame(originId);
    let firstAffordableDay = null;
    for (let i = 0; i < 200 && firstAffordableDay === null; i++) {
      simulateTick(state);
      if (state.influence >= cost) firstAffordableDay = state.day;
    }
    assert.ok(
      firstAffordableDay !== null && firstAffordableDay <= 60,
      `origin=${originId}: first affordable purchase should land well before day 60, got ${firstAffordableDay}`
    );
  }
});

test('speed (×1/×2/×4) is purely cosmetic: batching ticks (as ×2/×4 do) yields the exact same state as ticking one by one', () => {
  const originalRandom = Math.random;
  Math.random = () => 1; // never below routeCloseCheckChance -> no random route closures

  try {
    const totalTicks = 500;

    const sequential = freshGame('fenwick');
    for (let i = 0; i < totalTicks; i++) simulateTick(sequential);

    const batched = freshGame('fenwick');
    let done = 0;
    while (done < totalTicks) {
      const batch = Math.min(4, totalTicks - done);
      for (let i = 0; i < batch; i++) simulateTick(batched);
      done += batch;
    }

    assert.equal(sequential.day, batched.day);
    assert.equal(sequential.status, batched.status);
    assert.equal(sequential.dominance, batched.dominance);
    assert.equal(sequential.globalContainment, batched.globalContainment);
    assert.equal(sequential.influence, batched.influence);
    for (const t of TERRITORIES) {
      assert.equal(sequential.territories[t.id].crisis, batched.territories[t.id].crisis, `${t.id} crisis diverged`);
    }
  } finally {
    Math.random = originalRandom;
  }
});

// REGRESSION (post-beta V1, V2 request): leaving the game running untouched for a
// long stretch, then spending everything accumulated in one lump sum, must not
// reliably win - the influence cap (BALANCE.influenceCap) makes hoarding lossy.
test('REGRESSION (post-beta V1->V2): a single very-late lump-sum purchase, after total neglect, must not reliably win', () => {
  let wins = 0;
  for (const originId of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(originId);
    let spent = false;
    for (let i = 0; i < MAX_TICKS && state.status === 'playing'; i++) {
      simulateTick(state);
      if (!spent && state.day >= 600) {
        spendEverythingAffordable(state);
        spent = true;
      }
    }
    if (state.status === 'victory') wins += 1;
  }
  assert.ok(
    wins <= 2,
    `a single dump at day 600 after total neglect should fail on almost every origin, got ${wins}/${TERRITORIES.length} wins`
  );
});

test('influence never exceeds its cap and stays finite/non-negative through passive accumulation', () => {
  const state = freshGame();
  for (let i = 0; i < 1000; i++) {
    simulateTick(state);
    assert.ok(Number.isFinite(state.influence));
    assert.ok(state.influence >= 0 && state.influence <= BALANCE.influenceCap);
  }
});

// V3 finding (measured, not assumed - see RUPTURE_V3_Rapport_Technique_Officiel.pdf):
// checking in periodically is no longer enough on its own if the SPENDING
// ITSELF ignores the game's state. spendEverythingAffordable buys in a fixed
// order (Propagation, Dangerosité, Résilience, Discrétion) regardless of how
// mobilized the world's Response already is - exactly the "répartition
// équilibrée mais sans tenir compte de la situation" naive pattern the
// design brief asked to make measurably worse than reactive play. This is a
// deliberate result of V3, not a bug: it replaces a V2-era test that expected
// this exact non-reactive pattern to still win reliably.
test('V3: a naive, non-reactive periodic spending pattern (fixed order, ignores world response) no longer wins reliably', () => {
  let wins = 0;
  for (const originId of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(originId);
    for (let i = 0; i < MAX_TICKS && state.status === 'playing'; i++) {
      simulateTick(state);
      if (state.day % 100 === 0) spendEverythingAffordable(state);
    }
    if (state.status === 'victory') wins += 1;
  }
  assert.ok(
    wins <= 4,
    `a naive fixed-order spending pattern should now fail on most origins, got ${wins}/${TERRITORIES.length} wins`
  );
});

// The same periodic check-in cadence, but reacting to one piece of state -
// prioritizing Résilience once the world's Response is mobilized, offense
// (Propagation/Dangerosité) otherwise - wins reliably. This is the
// "stratégie cohérente et réfléchie" the design brief asked to keep viable:
// the same influence income, spent in an order that respects the game's own
// causality, is enough on its own to flip the outcome.
function buyReactively(state) {
  const mobilized = state.globalContainment >= BALANCE.humanity.mobilizationThreshold;
  const order = mobilized
    ? ['resilience', 'dangerosity', 'propagation', 'discretion']
    : ['propagation', 'dangerosity', 'discretion', 'resilience'];
  for (const kind of order) {
    const cfg = BALANCE.upgrades[kind];
    if (state.upgrades[kind] >= cfg.maxLevel) continue;
    if (upgradeCost(kind, state.upgrades[kind]) <= state.influence) {
      buyUpgrade(state, kind);
      return true;
    }
  }
  return false;
}

// The same reactive priority, but exercised every tick rather than in
// periodic batches - matching how an actual play session works (the HUD
// updates live; a real player taps "buy" as soon as something lights up,
// they don't bank days of income before deciding).
//
// V3.1 : depuis que la Résilience doit être investie jusqu'à
// humanity.resilienceImmunityLevel pour neutraliser entièrement le
// resserrement du plafond de gravité (voir simulation.js), le budget total
// nécessaire a augmenté ; certaines origines les moins bien connectées
// n'accumulent pas assez d'Influence à temps pour tout financer avant que
// la Réponse mondiale ne conclue. Mesuré honnêtement à 13/18 (72%) plutôt
// que forcé à 18/18 - cohérent avec l'origine de départ qui a toujours
// compté dans ce jeu (voir README) et avec la demande explicite de ne pas
// garantir la victoire en Normal.
test('V3: a reactive spending order (Résilience once mobilized, offense otherwise), exercised live, wins from most origins', () => {
  let wins = 0;
  const days = [];
  for (const originId of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(originId);
    for (let i = 0; i < MAX_TICKS && state.status === 'playing'; i++) {
      simulateTick(state);
      buyReactively(state);
    }
    if (state.status === 'victory') {
      wins += 1;
      days.push(state.day);
    }
  }
  assert.ok(
    wins >= TERRITORIES.length * 0.6,
    `a live reactive spending order should win from a solid majority of origins, got ${wins}/${TERRITORIES.length}`
  );
});

