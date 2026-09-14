// Publicité — logique de fréquence RÉELLE, affichage SIMULÉ.
//
// Source de vérité : docs/RUPTURE_Audit_Economique_Precommercialisation.pdf
// (audit économique pré-commercialisation, §2, §8, §9 — chiffres et règles
// non réinventés ici). Modèle retenu : interstitiel AdMob uniquement,
// jamais pendant une partie, jamais autour de la toute première partie
// jouée, au plus 1 publicité par partie si la partie a réellement duré au
// moins 3 minutes (horloge murale, pas des jours simulés), sinon 1
// publicité toutes les `interstitialShortGameRatio` parties courtes - voir
// config/runtime.js pour ces deux paramètres.
//
// Distinction explicite (§4 de la demande) :
//  - RÉEL : shouldShowInterstitial() est une fonction pure qui applique
//    exactement la règle ci-dessus - aucun SDK requis pour ça, c'est de la
//    logique produit ordinaire, testée unitairement (tests/ads.test.js).
//  - SIMULÉ : showInterstitialAd() n'affiche jamais une vraie publicité
//    AdMob (aucun compte, aucun SDK connecté) - en environnement dev/bêta,
//    elle simule un délai + un événement "vu", clairement marqué comme tel
//    (resultKind: 'simulated'). Ne JAMAIS confondre ce résultat avec un
//    véritable affichage publicitaire facturable.
//  - PRÉPARÉ, PAS CONNECTÉ (web/PWA) ou RÉELLEMENT BRANCHÉ (Android natif) :
//    en environnement 'commercial', sur une build Android native
//    (Capacitor.isNativePlatform()), cette fonction appelle désormais le
//    vrai plugin AdMob (@capacitor-community/admob - voir
//    src/services/adapters/admob.js), avec l'unité publicitaire de TEST
//    officielle de Google par défaut (aucun compte requis, jamais un vrai
//    identifiant inventé) tant que VITE_ADMOB_INTERSTITIAL_UNIT_ID n'est
//    pas configurée. Sur web/PWA (aucun SDK AdMob natif possible), continue
//    de refuser explicitement d'agir ('not-connected').
import { Capacitor } from '@capacitor/core';
import { RUNTIME_CONFIG } from '../config/runtime.js';
import { logSecurityEvent } from '../save.js';
// Import dynamique : le SDK AdMob (@capacitor-community/admob) n'a aucune
// raison d'alourdir le bundle de la bêta web/PWA (environnement 'beta',
// jamais natif) - chargé uniquement si on atteint réellement la branche
// Android native + 'commercial' ci-dessous.

export function createAdsService(config = RUNTIME_CONFIG) {
  // Jeton anti-rejeu minimal : même si aucune publicité du modèle actuel ne
  // distribue de récompense (l'interstitiel n'accorde rien au joueur - voir
  // l'audit, aucune mécanique de "publicité récompensée" n'y est définie),
  // cette structure prépare la validation d'un futur événement publicitaire
  // qui accorderait quelque chose : un jeton à usage unique, jamais un
  // simple booléen, pour qu'une tentative de rejeu (appeler deux fois le
  // même callback de complétion) soit détectable. Volontairement en mémoire
  // seulement (pas dans localStorage) : un jeton de ce genre n'a de sens
  // que pour la session en cours, jamais restauré falsifiable après coup.
  // Propre à chaque instance de service (pas un module-level partagé) pour
  // rester testable indépendamment.
  const pendingTokens = new Set();

  function createAdToken() {
    const token = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    pendingTokens.add(token);
    return token;
  }

  function consumeAdToken(token) {
    if (!pendingTokens.has(token)) {
      // Jeton inconnu ou déjà consommé : tentative de rejeu potentielle -
      // journalisée pour diagnostic (jamais utilisée pour bloquer quoi que
      // ce soit côté client, voir save.js:logSecurityEvent).
      logSecurityEvent('ad-token-replay-or-unknown', { token });
      return false;
    }
    pendingTokens.delete(token);
    return true;
  }

  // Compteur de "parties courtes" consécutives non suivies d'une publicité,
  // pour appliquer fidèlement la règle dégradée (1 pub / N parties courtes)
  // de l'audit plutôt qu'un simple arrondi. Volontairement en mémoire (pas
  // persisté) : redémarrer l'app remet ce compteur à zéro, ce qui ne peut
  // que RETARDER une publicité, jamais en déclencher une supplémentaire —
  // sans risque pour le joueur ni pour le modèle de revenu.
  let shortGameStreak = 0;

  return {
    // RÉEL : décision pure, testable sans navigateur ni SDK. `context` :
    // { isFirstGameEver: boolean, gameDurationMs: number, isPremium: boolean }
    shouldShowInterstitial(context) {
      if (!config.adsEnabled) return false;
      if (context.isPremium) return false; // Premium retire la publicité (modèle audité, §3/§8)
      if (context.isFirstGameEver) return false; // jamais autour de la toute première partie
      if (context.gameDurationMs >= config.interstitialMinGameDurationMs) {
        shortGameStreak = 0;
        return true;
      }
      shortGameStreak += 1;
      if (shortGameStreak >= config.interstitialShortGameRatio) {
        shortGameStreak = 0;
        return true;
      }
      return false;
    },

    // SIMULÉ en dev/bêta (aucun SDK réel) ; explicitement NON CONNECTÉ en
    // environnement commercial (voir en-tête de fichier). Ne jamais
    // retourner `shown: true` sans que l'un ou l'autre cas ne se soit
    // réellement produit.
    async showInterstitialAd() {
      if (config.env === 'commercial') {
        if (Capacitor.isNativePlatform()) {
          const { createNativeAdMobAdapter } = await import('./adapters/admob.js');
          return createNativeAdMobAdapter().showInterstitialAd();
        }
        return { shown: false, resultKind: 'not-connected', reason: 'Aucun SDK AdMob connecté - voir docs/TRAJECTOIRE_COMMERCIALE.md' };
      }
      await new Promise((resolve) => setTimeout(resolve, 350)); // simule un court délai de chargement, pas un vrai réseau
      return { shown: true, resultKind: 'simulated' };
    },

    // Non consommé par aucune fonctionnalité de jeu actuelle (voir l'audit :
    // aucune mécanique de publicité récompensée n'est définie dans le
    // modèle retenu). Conservé comme interface prête, pas comme
    // fonctionnalité active - isRewardedAdAvailable() renvoie donc toujours
    // false tant qu'aucune décision produit ne crée cette mécanique.
    //
    // Ré-audité en V5.2 (demande explicite de tester "les publicités
    // récompensées et l'attribution exacte de leur récompense lorsqu'elles
    // sont prévues") : elles ne le sont PAS dans le modèle économique
    // actuellement retenu (interstitiel uniquement, voir l'audit
    // économique) - rien n'a donc été branché ici pour ne pas fabriquer une
    // mécanique de jeu qui n'a pas été décidée. Le jour où une mécanique de
    // récompense serait décidée (ex. bonus d'Influence), seul ce fichier
    // serait à réécrire (même plugin AdMob, méthodes reward-interstitial
    // déjà exposées par @capacitor-community/admob).
    isRewardedAdAvailable: () => false,
    async showRewardedAd() {
      return { shown: false, resultKind: 'not-implemented', reason: 'Aucune mécanique de publicité récompensée définie dans le modèle économique retenu' };
    },
    createAdToken,
    consumeAdToken
  };
}
