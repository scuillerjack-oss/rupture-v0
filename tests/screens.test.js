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
const { simulateTick, buyUpgrade } = await import('../src/engine/simulation.js');
const { renderEnd, renderGameMenu } = await import('../src/ui/screens.js');

function playUntilEnd(state, decide, maxTicks = 3000) {
  for (let i = 0; i < maxTicks && state.status === 'playing'; i++) {
    simulateTick(state);
    decide(state);
  }
  return state;
}

test('renderEnd does not throw for a passive-play defeat (upgrades never bought)', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'jotun');
  playUntilEnd(state, () => {}); // passif : défaite garantie par timeout (voir tests/simulation.test.js)
  assert.equal(state.status, 'defeat');
  let html;
  assert.doesNotThrow(() => {
    html = renderEnd(state);
  });
  assert.match(html, /DÉFAITE/);
  assert.match(html, /Conscience mondiale/);
  assert.match(html, new RegExp(`Jours écoulés : ${state.day}`));
  // Niveau 0 partout : le récap doit rester honnête plutôt que planter sur des upgrades vides.
  assert.match(html, /Niv\. 0/);
});

test('renderEnd shows a non-empty phaseLog timeline once the world has reacted, and a non-empty style phrase', () => {
  const state = createInitialState();
  beginNewGame(state);
  confirmOrigin(state, 'fenwick');
  const KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];
  playUntilEnd(state, (s) => {
    for (const kind of KINDS) {
      if (s.upgrades[kind] < 10 && s.influence >= 0) {
        buyUpgrade(s, kind);
      }
    }
  });
  assert.ok(state.phaseLog.length > 0, 'a reasonably active game should reach at least one Réponse phase beyond ignorance');
  const html = renderEnd(state);
  assert.match(html, /end-timeline-row/);
  assert.match(html, /end-style/);
  // maxDominance ne doit jamais être inférieur à la Progression finale.
  assert.ok(state.maxDominance >= state.dominance - 0.001);
});

test('renderGameMenu settings view reflects music/sfx enabled state via active class and label', () => {
  const html = renderGameMenu('settings', null, { pendingDifficulty: 'normal', musicEnabled: true, sfxEnabled: false });
  assert.match(html, /toggle-btn active"[^>]*>Activée/);
  assert.match(html, /toggle-btn"[^>]*>Coupés/);
});
