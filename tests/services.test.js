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

const { createServices } = await import('../src/services/index.js');
const { getAvailableSpeeds, RUNTIME_CONFIG } = await import('../src/config/runtime.js');

test('a fresh install is free, ad-free and silent by construction (no commercial feature is live)', () => {
  const services = createServices();
  assert.equal(services.premium.isPremium(), false);
  assert.equal(services.ads.isRewardedAdAvailable(), false);
  assert.doesNotThrow(() => services.analytics.logEvent('x', {}));
  assert.doesNotThrow(() => services.analytics.logError(new Error('x')));
});

test('setPremium flips the local flag and isPremium reflects it', () => {
  const services = createServices();
  services.premium.setPremium(true);
  assert.equal(services.premium.isPremium(), true);
  services.premium.setPremium(false);
  assert.equal(services.premium.isPremium(), false);
});

test('the real runtime config is beta/dev: every speed stays available regardless of premium status', () => {
  assert.notEqual(RUNTIME_CONFIG.env, 'commercial');
  const services = createServices();
  assert.deepEqual(getAvailableSpeeds(services), [0, 1, 2, 4]);
  services.premium.setPremium(false);
  assert.deepEqual(getAvailableSpeeds(services), [0, 1, 2, 4]);
});

test('a hypothetical future commercial build could gate specific speeds for non-Premium players', () => {
  // N'affecte jamais le RUNTIME_CONFIG réel (qui doit rester 'beta') : ce
  // test injecte une config alternative pour prouver que le mécanisme de
  // restriction fonctionnerait, sans l'activer.
  const commercialConfig = { env: 'commercial', premiumOnlySpeeds: [4] };
  const freeServices = { premium: { isPremium: () => false } };
  const premiumServices = { premium: { isPremium: () => true } };
  assert.deepEqual(getAvailableSpeeds(freeServices, commercialConfig), [0, 1, 2]);
  assert.deepEqual(getAvailableSpeeds(premiumServices, commercialConfig), [0, 1, 2, 4]);
});
