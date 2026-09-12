import test from 'node:test';
import assert from 'node:assert/strict';

function installMemoryStorage() {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

installMemoryStorage();

const { createInitialState, beginNewGame, confirmOrigin } = await import('../src/engine/state.js');
const { simulateTick } = await import('../src/engine/simulation.js');
const { saveState, loadState, clearSave } = await import('../src/save.js');

test('saveState then loadState round-trips the game state', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'jotun');
  for (let i = 0; i < 5; i++) simulateTick(state);

  saveState(state);
  const loaded = loadState();
  assert.deepEqual(loaded, state);
});

test('loadState returns null when nothing was saved', () => {
  clearSave();
  assert.equal(loadState(), null);
});

test('clearSave removes a previously saved game', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'kelsor');
  saveState(state);
  assert.notEqual(loadState(), null);
  clearSave();
  assert.equal(loadState(), null);
});

test('loadState rejects a save with a mismatched version', () => {
  globalThis.localStorage.setItem('rupture-v0-save', JSON.stringify({ version: 999 }));
  assert.equal(loadState(), null);
});
