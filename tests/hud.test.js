import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fakeDom.js';

function installMemoryStorage() {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

installMemoryStorage();
installFakeDom();

const { createInitialState, beginNewGame, confirmOrigin } = await import('../src/engine/state.js');
const { createHud, playSpeeds } = await import('../src/ui/hud.js');
const { createServices } = await import('../src/services/index.js');

// V7 : HUD en une ligne, ×4 gratuit pour tous (pause = bouton séparé).
test('the HUD offers ×1/×2/×4 to everyone, with or without services', () => {
  assert.deepEqual(playSpeeds(createServices()), [1, 2, 4]);
  assert.deepEqual(playSpeeds(undefined), [1, 2, 4]);
});

test('the one-line HUD shows Progression / Réponse / Influence / jour / vitesse and updates in place', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'jotun');
  const hud = createHud({});
  hud.update(state, { lastSpeed: 1 });
  const first = hud.el.byClass('m-day');
  state.day = 42;
  state.influence = 17.8;
  state.speed = 4;
  hud.update(state, { lastSpeed: 1 });
  assert.equal(hud.el.byClass('m-day'), first, 'same element reused');
  assert.match(hud.el.textContent, /Progression/);
  assert.match(hud.el.textContent, /Réponse/);
  assert.match(hud.el.textContent, /Influence17/);
  assert.match(hud.el.textContent, /Jour42/);
  assert.match(hud.el.byClass('hud-speed').textContent, /×4/);
});
