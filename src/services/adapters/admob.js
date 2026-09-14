// RUPTURE V5.2 — adaptateur AdMob réel (build Android natif uniquement).
//
// N'est appelé par ads.js QUE lorsque Capacitor.isNativePlatform() est vrai
// (jamais depuis la PWA/le navigateur - le plugin natif n'y existe pas).
// Utilise l'unité publicitaire de TEST officielle de Google par défaut
// (documentée publiquement, jamais un identifiant inventé) tant que
// VITE_ADMOB_INTERSTITIAL_UNIT_ID n'est pas fournie - permet un vrai
// affichage publicitaire (test, non facturable, sans compte AdMob) pendant
// toute la bêta. Voir docs/SECRETS_ET_PRODUCTION.md.
import { AdMob } from '@capacitor-community/admob';

// ID de test interstitiel Android officiel de Google (public, documenté par
// Google dans sa propre documentation AdMob "Test ads") :
// https://developers.google.com/admob/android/test-ads
const GOOGLE_TEST_INTERSTITIAL_UNIT_ID = 'ca-app-pub-3940256099942544/1033173712';

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  await AdMob.initialize({ initializeForTesting: !getUnitId().realId });
  initialized = true;
}

function getUnitId() {
  const configured = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_ADMOB_INTERSTITIAL_UNIT_ID : undefined;
  return configured ? { id: configured, realId: true } : { id: GOOGLE_TEST_INTERSTITIAL_UNIT_ID, realId: false };
}

export function createNativeAdMobAdapter() {
  return {
    async showInterstitialAd() {
      await ensureInitialized();
      const { id, realId } = getUnitId();
      await AdMob.prepareInterstitial({ adId: id });
      await AdMob.showInterstitial();
      return { shown: true, resultKind: realId ? 'real' : 'sandbox-test-ad' };
    }
  };
}

// Exposé pour les tests (jamais utilisé par le jeu) : vérifie quelle unité
// serait utilisée sans devoir charger le SDK natif.
export const __test__ = { getUnitId, GOOGLE_TEST_INTERSTITIAL_UNIT_ID };
