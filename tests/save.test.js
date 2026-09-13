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

// V3 change de forme la sauvegarde (nouvelle branche Dangerosité, nouvelle
// formule de victoire) d'une façon qui réinterpréterait silencieusement une
// progression V2 déjà acquise - voir state.js et le rapport V3. Aucune
// migration 2->3 n'est enregistrée : une sauvegarde V2 doit donc être
// rejetée proprement, jamais acceptée avec une branche manquante.
test('a V2-shaped save (no dangerosity branch, old victory rules) is rejected cleanly rather than silently reinterpreted', () => {
  const v2Save = {
    version: 2,
    status: 'playing',
    day: 400,
    upgrades: { propagation: 5, resilience: 2, discretion: 1 },
    territories: {},
    rules: { victoryDominanceThreshold: 90, globalContainmentGainFactor: 0.135 }
  };
  globalThis.localStorage.setItem('rupture-v0-save', JSON.stringify(v2Save));
  assert.equal(loadState(), null);
});
