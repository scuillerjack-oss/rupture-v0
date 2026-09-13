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

// --- Monétisation V-finale : modèle réel de l'audit économique ---
// (docs/RUPTURE_Audit_Economique_Precommercialisation.pdf, §2/§3/§8/§9) :
// pas pendant une partie, pas autour de la toute première, 1 pub/partie
// dès 3 minutes réelles, sinon 1 pub / 2 parties courtes.
const AD_CONFIG = { env: 'beta', adsEnabled: true, interstitialMinGameDurationMs: 180000, interstitialShortGameRatio: 2 };

test('shouldShowInterstitial never fires around the very first game ever completed', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService(AD_CONFIG);
  assert.equal(ads.shouldShowInterstitial({ isFirstGameEver: true, gameDurationMs: 999999, isPremium: false }), false);
});

test('shouldShowInterstitial never fires for a Premium player, however long the game', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService(AD_CONFIG);
  assert.equal(ads.shouldShowInterstitial({ isFirstGameEver: false, gameDurationMs: 999999, isPremium: true }), false);
});

test('shouldShowInterstitial fires for a real game lasting at least the configured threshold', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService(AD_CONFIG);
  assert.equal(ads.shouldShowInterstitial({ isFirstGameEver: false, gameDurationMs: 180000, isPremium: false }), true);
  assert.equal(ads.shouldShowInterstitial({ isFirstGameEver: false, gameDurationMs: 500000, isPremium: false }), true);
});

test('shouldShowInterstitial applies the degraded "1 per N short games" rule below the threshold, exactly at the configured ratio', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService(AD_CONFIG); // ratio = 2
  const shortGame = { isFirstGameEver: false, gameDurationMs: 10000, isPremium: false };
  assert.equal(ads.shouldShowInterstitial(shortGame), false, 'first short game: no ad yet');
  assert.equal(ads.shouldShowInterstitial(shortGame), true, 'second consecutive short game: ad due');
  assert.equal(ads.shouldShowInterstitial(shortGame), false, 'streak reset after the ad, first short game again: no ad');
});

test('shouldShowInterstitial never fires when adsEnabled is off, regardless of context', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService({ ...AD_CONFIG, adsEnabled: false });
  assert.equal(ads.shouldShowInterstitial({ isFirstGameEver: false, gameDurationMs: 999999, isPremium: false }), false);
});

test('showInterstitialAd is simulated in dev/beta and explicitly not-connected in a commercial build', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const betaAds = createAdsService(AD_CONFIG);
  const betaResult = await betaAds.showInterstitialAd();
  assert.equal(betaResult.shown, true);
  assert.equal(betaResult.resultKind, 'simulated');

  const commercialAds = createAdsService({ ...AD_CONFIG, env: 'commercial' });
  const commercialResult = await commercialAds.showInterstitialAd();
  assert.equal(commercialResult.shown, false);
  assert.equal(commercialResult.resultKind, 'not-connected');
});

test('ad completion tokens are single-use: a second consumption of the same token is rejected', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService(AD_CONFIG);
  const token = ads.createAdToken();
  assert.equal(ads.consumeAdToken(token), true);
  assert.equal(ads.consumeAdToken(token), false, 'replaying the same token must be rejected, not silently accepted');
  assert.equal(ads.consumeAdToken('never-issued'), false);
});

test('no rewarded-ad mechanic is active today: the model documented in the economic audit has none', async () => {
  const { createAdsService } = await import('../src/services/ads.js');
  const ads = createAdsService(AD_CONFIG);
  assert.equal(ads.isRewardedAdAvailable(), false);
  const result = await ads.showRewardedAd();
  assert.equal(result.shown, false);
});

test('purchasePremium grants a simulated-test entitlement in dev/beta, never confused with a store-verified one', async () => {
  const { createPremiumService } = await import('../src/services/premium.js');
  const premium = createPremiumService({ env: 'beta' });
  assert.equal(premium.isPremium(), false);
  const result = await premium.purchasePremium();
  assert.equal(result.granted, true);
  assert.equal(result.resultKind, 'simulated');
  assert.equal(premium.isPremium(), true);
  assert.equal(premium.getEntitlementSource(), 'simulated-test');
  premium.setPremium(false);
});

test('purchasePremium and restorePurchases refuse to act in a commercial build (no real billing connected)', async () => {
  const { createPremiumService } = await import('../src/services/premium.js');
  const premium = createPremiumService({ env: 'commercial' });
  const purchaseResult = await premium.purchasePremium();
  assert.equal(purchaseResult.granted, false);
  assert.equal(purchaseResult.resultKind, 'not-connected');
  assert.equal(premium.isPremium(), false, 'a commercial build must never grant Premium for free');

  const restoreResult = await premium.restorePurchases();
  assert.equal(restoreResult.restored, false);
  assert.equal(restoreResult.resultKind, 'not-connected');
});

test('restorePurchases reflects the current simulated entitlement in dev/beta', async () => {
  const { createPremiumService } = await import('../src/services/premium.js');
  const premium = createPremiumService({ env: 'beta' });
  await premium.purchasePremium();
  const result = await premium.restorePurchases();
  assert.equal(result.restored, true);
  assert.equal(result.resultKind, 'simulated');
  premium.setPremium(false);
});

// --- Scénario de contournement naïf (§6/§9 de la demande de finalisation) :
// un joueur pose directement `rupture-v0-premium=1` dans localStorage via les
// outils de développement de son navigateur, sans jamais passer par
// purchasePremium(). Documenté honnêtement : rien ici ne bloque ce joueur
// (impossible à empêcher réellement côté client, voir premium.js) mais
// l'anomalie doit être détectable après coup dans le journal de sécurité,
// jamais silencieuse.
test('a naive exploit (directly setting the premium flag in localStorage, bypassing purchasePremium) is not blocked but IS logged as an anomaly', async () => {
  const { setPremiumFlag, getSecurityLog } = await import('../src/save.js');
  const { createPremiumService } = await import('../src/services/premium.js');

  setPremiumFlag(false);
  globalThis.localStorage.setItem('rupture-v0-premium', '1'); // pas de clé source associée : exactement ce qu'un joueur ferait à la main
  globalThis.localStorage.removeItem('rupture-v0-security-log');

  const premium = createPremiumService({ env: 'beta' });
  assert.equal(premium.isPremium(), true, 'a local flag alone cannot be told apart from a real one - this is the documented, accepted limitation');
  assert.equal(premium.getEntitlementSource(), null, 'no legitimate source was ever recorded for this flag');

  const log = getSecurityLog();
  assert.ok(log.some((entry) => entry.type === 'premium-flag-unknown-source'), 'the anomaly must be diagnosable after the fact, even though it cannot be blocked client-side');

  setPremiumFlag(false);
});
