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
const { renderHud } = await import('../src/ui/hud.js');
const { createServices } = await import('../src/services/index.js');

test('renderHud exposes exactly the four speed controls (pause/1x/2x/4x) during beta, regardless of services', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'jotun');
  const html = renderHud(state, 'territory', createServices());
  for (const speed of [0, 1, 2, 4]) {
    assert.match(html, new RegExp(`data-speed="${speed}"`));
  }
});

test('renderHud still works when no services object is passed (defensive, backward-compatible)', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'jotun');
  assert.doesNotThrow(() => renderHud(state, 'territory', undefined));
});
