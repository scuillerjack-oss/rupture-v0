import test from 'node:test';
import assert from 'node:assert/strict';

// V5.2 (préparation Android/monétisation sandbox) : ces adaptateurs ne sont
// appelés par ads.js/premium.js que sur une vraie build Android native
// (Capacitor.isNativePlatform()) - impossible à exercer ici (aucun SDK
// Android, aucun appareil dans cet environnement, voir le rapport
// technique). Ce que ces tests vérifient reste réel et utile : le module
// s'importe sans lever d'exception hors d'un contexte natif (registerPlugin
// doit rester sûr à appeler côté web), et la logique de sélection
// d'identifiant (test Google par défaut vs variable d'environnement) est
// une fonction pure, testable sans aucun SDK.

test('the AdMob adapter module imports cleanly outside a native context (no native bridge required at import time)', async () => {
  await assert.doesNotReject(import('../src/services/adapters/admob.js'));
});

test('the AdMob adapter defaults to the official Google test interstitial unit ID when none is configured', async () => {
  const { __test__ } = await import('../src/services/adapters/admob.js');
  const { id, realId } = __test__.getUnitId();
  assert.equal(id, __test__.GOOGLE_TEST_INTERSTITIAL_UNIT_ID);
  assert.equal(realId, false, 'the default test ad unit must never be reported as a real one');
});

test('the Play Billing adapter module imports cleanly outside a native context (registerPlugin must be safe to call from the web)', async () => {
  await assert.doesNotReject(import('../src/services/adapters/playBilling.js'));
});

test('the Play Billing adapter refuses to act when no product ID is configured, on both purchase and restore', async () => {
  const { createNativePlayBillingAdapter } = await import('../src/services/adapters/playBilling.js');
  const adapter = createNativePlayBillingAdapter();
  const purchase = await adapter.purchasePremium();
  assert.equal(purchase.granted, false);
  assert.equal(purchase.resultKind, 'not-connected');
  const restore = await adapter.restorePurchases();
  assert.equal(restore.restored, false);
  assert.equal(restore.resultKind, 'not-connected');
});
