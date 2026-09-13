import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES, buildAdjacency } from '../src/engine/territories.js';
import { BALANCE, upgradeCost, tensionAt } from '../src/engine/balance.js';

const MAX_TICKS = 3000;

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

test('influence only grows and never goes negative through a full playthrough', () => {
  const state = freshGame();
  let previous = state.influence;
  runUntilEnd(state, (s) => {
    assert.ok(s.influence >= 0, `influence went negative at day ${s.day}`);
    assert.ok(s.influence >= previous - 1e-9, 'influence should never decrease on its own');
    previous = s.influence;
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

test('buyUpgrade refuses to exceed maxLevel', () => {
  const state = freshGame();
  state.influence = 1_000_000;
  const cfg = BALANCE.upgrades.propagation;
  for (let i = 0; i < cfg.maxLevel; i++) assert.equal(buyUpgrade(state, 'propagation'), true);
  assert.equal(state.upgrades.propagation, cfg.maxLevel);
  assert.equal(buyUpgrade(state, 'propagation'), false);
  assert.equal(state.upgrades.propagation, cfg.maxLevel);
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

test('global containment rises monotonically while the anomaly is active', () => {
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

test('active investment in upgrades can flip a passive-defeat scenario toward victory', () => {
  const state = freshGame();
  runUntilEnd(state, (s) => {
    buyUpgrade(s, 'propagation');
    buyUpgrade(s, 'discretion');
    buyUpgrade(s, 'resilience');
  });
  assert.equal(state.status, 'victory', 'diversified active upgrades should be enough to win');
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
// This test locks in the fix at the exact scenario reported: a single isolated
// upgrade purchase, tried at many different moments of the game and from every
// origin, must never be enough to win on its own.
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

test('Monte-Carlo: a sustained aggressive upgrade strategy wins from every origin', () => {
  let wins = 0;
  for (const origin of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(origin);
    runUntilEnd(state, (s) => {
      buyUpgrade(s, 'propagation');
      buyUpgrade(s, 'discretion');
      buyUpgrade(s, 'resilience');
    });
    if (state.status === 'victory') wins += 1;
    assert.ok(state.day > 100, `origin ${origin} ended suspiciously fast even with active upgrades (day ${state.day})`);
  }
  assert.equal(wins, TERRITORIES.length, 'a sustained diversified strategy should win from every origin');
});

// Regression test added after the first human smartphone beta: at day 287 the
// player had only ~20 Influence (barely enough for a first purchase), because
// the tension curve that paces the mid/late game also starves the very start
// of any real income. A tapering early trickle now covers that gap. Lock in
// the fix here, on several origins (the player is free to choose any origin -
// the fix must not be tuned around a single one).
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
  // ×2/×4 only change how many simulateTick() calls happen per render frame in
  // main.js; they must not change the simulation's own logic. We neutralize the
  // one source of randomness (route closures) so both runs are directly comparable
  // tick-for-tick, independent of any purchase timing.
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

function spendEverythingAffordable(state) {
  let boughtSomething = true;
  while (boughtSomething) {
    boughtSomething = false;
    for (const kind of ['propagation', 'resilience', 'discretion']) {
      const cfg = BALANCE.upgrades[kind];
      if (state.upgrades[kind] >= cfg.maxLevel) continue;
      if (upgradeCost(kind, state.upgrades[kind]) <= state.influence) {
        buyUpgrade(state, kind);
        boughtSomething = true;
      }
    }
  }
}

// REGRESSION (post-beta V1, V2 request): the beta reported that a player could
// leave the game running untouched for a long stretch, come back once, spend
// everything accumulated in a single lump sum, and still win reliably - the
// exact "pose ton telephone, reviens, achete sans reflechir, gagne" complaint.
// An Influence cap (BALANCE.influenceCap) now makes hoarding lossy: influence
// earned above the cap dissipates unused, so a single late dump buys less than
// steady spending would have over the same span.
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

test('checking in periodically every 100-200 days (a realistic casual pace) still wins reliably from every origin', () => {
  for (const interval of [100, 200]) {
    let wins = 0;
    for (const originId of TERRITORIES.map((t) => t.id)) {
      const state = freshGame(originId);
      for (let i = 0; i < MAX_TICKS && state.status === 'playing'; i++) {
        simulateTick(state);
        if (state.day % interval === 0) spendEverythingAffordable(state);
      }
      if (state.status === 'victory') wins += 1;
    }
    assert.equal(wins, TERRITORIES.length, `checking in every ${interval} days should still win from every origin, got ${wins}`);
  }
});
