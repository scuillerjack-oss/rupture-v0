import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { simulateTick, buyUpgrade } from '../src/engine/simulation.js';
import { TERRITORIES, buildAdjacency } from '../src/engine/territories.js';
import { BALANCE, upgradeCost } from '../src/engine/balance.js';

function freshGame(originId = 'fenwick') {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, originId);
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

test('propagation reaches a directly connected neighbor once the source crosses the spread threshold', () => {
  const state = freshGame('fenwick');
  const adjacency = buildAdjacency();
  const neighborIds = [...adjacency.get('fenwick')];
  for (let i = 0; i < 40; i++) simulateTick(state);
  assert.ok(state.territories.fenwick.crisis >= BALANCE.spreadThreshold);
  const anyNeighborInfected = neighborIds.some((id) => state.territories[id].crisis > 0);
  assert.ok(anyNeighborInfected, 'at least one neighbor should have been reached by propagation');
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
  for (let i = 0; i < 60 && state.status === 'playing'; i++) {
    simulateTick(state);
    assert.ok(state.influence >= 0, `influence went negative at day ${state.day}`);
    assert.ok(state.influence >= previous - 1e-9, 'influence should never decrease on its own');
    previous = state.influence;
  }
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
  for (let i = 0; i < 15; i++) simulateTick(state);
  const ts = state.territories.fenwick;
  assert.ok(ts.awareness > 0, 'awareness should rise once crisis is present');
  assert.ok(ts.containment > 0, 'containment should follow awareness upward');
});

test('global containment rises monotonically while the anomaly is active', () => {
  const state = freshGame();
  let previous = state.globalContainment;
  for (let i = 0; i < 40 && state.status === 'playing'; i++) {
    simulateTick(state);
    assert.ok(state.globalContainment >= previous - 1e-9, 'global containment should not decrease');
    assert.ok(state.globalContainment >= 0 && state.globalContainment <= 100, 'global containment must stay in [0,100]');
    previous = state.globalContainment;
  }
});

test('victory triggers once dominance crosses the threshold, with a clear reason', () => {
  const state = freshGame();
  for (let i = 0; i < 60 && state.status === 'playing'; i++) simulateTick(state);
  assert.ok(state.status === 'victory' || state.status === 'defeat', 'the game must reach an end state');
  if (state.status === 'victory') {
    assert.ok(state.dominance >= BALANCE.victoryDominanceThreshold);
    assert.equal(state.endReason, 'dominance');
  }
});

test('defeat triggers once global containment reaches 100 without upgrades (passive play)', () => {
  const state = freshGame();
  for (let i = 0; i < 200 && state.status === 'playing'; i++) simulateTick(state);
  assert.equal(state.status, 'defeat');
  assert.equal(state.endReason, 'containment');
  assert.equal(state.globalContainment, 100);
});

test('active investment in upgrades can flip a passive-defeat scenario toward victory', () => {
  const state = freshGame();
  for (let i = 0; i < 200 && state.status === 'playing'; i++) {
    simulateTick(state);
    buyUpgrade(state, 'propagation');
    buyUpgrade(state, 'discretion');
    buyUpgrade(state, 'resilience');
  }
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
  for (let i = 0; i < 250 && state.status === 'playing'; i++) {
    simulateTick(state);
    assert.ok(Number.isFinite(state.influence) && state.influence >= 0);
    assert.ok(Number.isFinite(state.dominance) && state.dominance >= 0 && state.dominance <= 100);
    assert.ok(Number.isFinite(state.globalContainment) && state.globalContainment >= 0 && state.globalContainment <= 100);
    for (const t of TERRITORIES) {
      const ts = state.territories[t.id];
      assert.ok(Number.isFinite(ts.crisis) && ts.crisis >= 0 && ts.crisis <= 100, `${t.id} crisis out of bounds`);
      assert.ok(Number.isFinite(ts.awareness) && ts.awareness >= 0 && ts.awareness <= 100);
      assert.ok(Number.isFinite(ts.containment) && ts.containment >= 0 && ts.containment <= 100);
    }
  }
  assert.ok(state.day <= BALANCE.maxDays, 'the game must not run past the safety cap');
});

test('Monte-Carlo: passive play does not produce a systematic instant win or an unreachable victory', () => {
  const outcomes = { victory: 0, defeat: 0 };
  for (const origin of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(origin);
    for (let i = 0; i < 250 && state.status === 'playing'; i++) simulateTick(state);
    outcomes[state.status] = (outcomes[state.status] || 0) + 1;
    assert.ok(state.day > 5, `origin ${origin} ended suspiciously fast (day ${state.day})`);
  }
  assert.equal(outcomes.defeat, TERRITORIES.length, 'passive play (no upgrades) should consistently lose in this balance');
});

test('Monte-Carlo: an aggressive upgrade strategy wins from most origins, and none in an absurd way', () => {
  let wins = 0;
  for (const origin of TERRITORIES.map((t) => t.id)) {
    const state = freshGame(origin);
    for (let i = 0; i < 250 && state.status === 'playing'; i++) {
      simulateTick(state);
      buyUpgrade(state, 'propagation');
      buyUpgrade(state, 'discretion');
      buyUpgrade(state, 'resilience');
    }
    if (state.status === 'victory') wins += 1;
    assert.ok(state.day > 20, `origin ${origin} ended suspiciously fast even with active upgrades (day ${state.day})`);
  }
  // Origin choice is meant to matter: low-connectivity territories are intentionally
  // harder. A naive "buy everything every tick" bot should still win from a clear
  // majority of origins; the remaining harder ones are a known balance note for the
  // human beta (see the technical report) rather than a broken mechanic.
  assert.ok(wins >= 10, `expected at least 10/14 origins winnable with a simple aggressive strategy, got ${wins}`);
});
