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
const {
  saveState,
  loadState,
  clearSave,
  hasCompletedFirstGame,
  markFirstGameCompleted,
  getPremiumFlag,
  setPremiumFlag,
  getPremiumSource,
  logSecurityEvent,
  getSecurityLog
} = await import('../src/save.js');

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

// --- V-finale : indicateurs de monétisation (voir docs/SECRETS_ET_PRODUCTION.md) ---

test('hasCompletedFirstGame is false until markFirstGameCompleted is called, and persists afterwards', () => {
  globalThis.localStorage.removeItem('rupture-v0-first-game-done');
  assert.equal(hasCompletedFirstGame(), false);
  markFirstGameCompleted();
  assert.equal(hasCompletedFirstGame(), true);
});

test('setPremiumFlag(true) writes an entitlement source, and clearing it removes both keys', () => {
  setPremiumFlag(false);
  assert.equal(getPremiumFlag(), false);
  assert.equal(getPremiumSource(), null);

  setPremiumFlag(true, 'simulated-test');
  assert.equal(getPremiumFlag(), true);
  assert.equal(getPremiumSource(), 'simulated-test');

  setPremiumFlag(false);
  assert.equal(getPremiumFlag(), false);
  assert.equal(getPremiumSource(), null, 'clearing Premium must also clear its source, never leave a stale one behind');
});

test('setPremiumFlag defaults to a simulated-test source when none is given', () => {
  setPremiumFlag(true);
  assert.equal(getPremiumSource(), 'simulated-test');
  setPremiumFlag(false);
});

test('setPremiumFlag can record a store-verified source, distinct from a simulated one', () => {
  setPremiumFlag(true, 'store-verified');
  assert.equal(getPremiumSource(), 'store-verified');
  setPremiumFlag(false);
});

test('logSecurityEvent records type, details and a timestamp; getSecurityLog returns them in order', () => {
  globalThis.localStorage.removeItem('rupture-v0-security-log');
  logSecurityEvent('test-event-a', { foo: 1 });
  logSecurityEvent('test-event-b', { bar: 2 });
  const log = getSecurityLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].type, 'test-event-a');
  assert.deepEqual(log[0].details, { foo: 1 });
  assert.equal(typeof log[0].at, 'string');
  assert.equal(log[1].type, 'test-event-b');
});

test('the security log is a bounded ring buffer: it never grows past its cap', () => {
  globalThis.localStorage.removeItem('rupture-v0-security-log');
  for (let i = 0; i < 30; i++) logSecurityEvent('flood', { i });
  const log = getSecurityLog();
  assert.equal(log.length, 20, 'a diagnostic log must stay bounded, never grow without limit');
  assert.equal(log[log.length - 1].details.i, 29, 'the ring buffer must keep the most recent entries, not the oldest');
});

test('getSecurityLog returns an empty array when nothing was ever logged', () => {
  globalThis.localStorage.removeItem('rupture-v0-security-log');
  assert.deepEqual(getSecurityLog(), []);
});
