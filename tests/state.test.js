import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { TERRITORIES } from '../src/engine/territories.js';
import { BALANCE } from '../src/engine/balance.js';

test('createInitialState produces a menu state with all territories at zero and the fourth branch present', () => {
  const state = createInitialState();
  assert.equal(state.status, 'menu');
  assert.equal(state.day, 0);
  assert.equal(state.influence, 0);
  assert.deepEqual(state.upgrades, { propagation: 0, resilience: 0, discretion: 0, dangerosity: 0 });
  assert.equal(state.responsePhase, 'ignorance');
  assert.equal(Object.keys(state.territories).length, TERRITORIES.length);
  for (const t of TERRITORIES) {
    assert.equal(state.territories[t.id].crisis, 0);
    assert.equal(state.territories[t.id].awareness, 0);
    assert.equal(state.territories[t.id].containment, 0);
    assert.deepEqual(state.territories[t.id].closedRoutes, []);
  }
});

test('beginNewGame resets to origin selection with a clean slate', () => {
  const state = createInitialState();
  state.influence = 999;
  state.day = 50;
  beginNewGame(state);
  assert.equal(state.status, 'selecting-origin');
  assert.equal(state.day, 0);
  assert.equal(state.influence, 0);
  assert.equal(state.originId, null);
  for (const t of TERRITORIES) {
    assert.equal(state.territories[t.id].crisis, 0);
  }
});

test('confirmOrigin seeds the chosen territory and starts the game', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'fenwick');
  assert.equal(state.status, 'playing');
  assert.equal(state.originId, 'fenwick');
  assert.equal(state.territories.fenwick.crisis, BALANCE.startingCrisis);
  for (const t of TERRITORIES) {
    if (t.id !== 'fenwick') assert.equal(state.territories[t.id].crisis, 0);
  }
});

test('confirmOrigin is a no-op outside selecting-origin status', () => {
  const state = createInitialState();
  confirmOrigin(state, 'fenwick');
  assert.equal(state.status, 'menu');
  assert.equal(state.originId, null);
});

test('a new game after a previous run does not bleed state from the old run', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'arca');
  state.territories.arca.crisis = 80;
  state.territories.boreal.closedRoutes.push('arca');
  state.influence = 500;
  state.upgrades.propagation = 3;
  state.upgrades.dangerosity = 4;

  beginNewGame(state);
  assert.equal(state.territories.arca.crisis, 0);
  assert.deepEqual(state.territories.boreal.closedRoutes, []);
  assert.equal(state.influence, 0);
  assert.equal(state.upgrades.propagation, 0);
  assert.equal(state.upgrades.dangerosity, 0);
});

test('beginNewGame resolves an unknown difficulty to normal instead of crashing', () => {
  const state = createInitialState();
  beginNewGame(state, 'nonexistent');
  assert.equal(state.difficulty, 'normal');
});
