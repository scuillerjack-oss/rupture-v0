// Premium — modèle RÉEL, achat SIMULÉ.
//
// Source de vérité : docs/RUPTURE_Audit_Economique_Precommercialisation.pdf
// (§3, §8). Premium = achat unique 2,99€ = retire la publicité + débloque
// la vitesse ×4. Aucun avantage stratégique, aucune méta-monnaie, aucune
// dégradation du contenu gratuit — le gameplay complet (×1, ×2, toutes les
// orientations) reste jouable sans Premium.
//
// Distinction explicite (§4 de la demande) :
//  - RÉEL : isPremium()/getEntitlementSource() lisent un état réel (pas un
//    exemple de code) ; getAvailableSpeeds() (config/runtime.js) applique
//    réellement la restriction ×4 en environnement 'commercial'.
//  - SIMULÉ : purchasePremium()/restorePurchases() ne parlent à AUCUNE
//    plateforme de paiement réelle (aucun compte Google Play Billing/App
//    Store n'existe). En dev/bêta, elles accordent un entitlement marqué
//    'simulated-test' - jamais confondu avec un achat réel (voir
//    getEntitlementSource()).
//  - PRÉPARÉ, PAS CONNECTÉ (web/PWA) ou RÉELLEMENT BRANCHÉ (Android natif) :
//    en environnement 'commercial', sur une build Android native
//    (Capacitor.isNativePlatform()), ces deux fonctions appellent
//    désormais le vrai plugin Play Billing local (voir
//    src/services/adapters/playBilling.js et
//    android/.../RuptureBillingPlugin.java) - un achat y déclenche le vrai
//    flux Play (utilisable en sandbox via un compte "license tester" Play
//    Console, sans frais réel). Sur web/PWA (aucun Play Billing possible)
//    ou si VITE_PLAY_PRODUCT_ID n'est pas configuré, ces fonctions
//    continuent de refuser explicitement d'agir ('not-connected') plutôt
//    que de simuler un achat gratuit qui déclencherait une interface
//    Premium sans transaction réelle.
//
// Sécurité assumée et documentée (§6/§7 de la demande) : un flag
// localStorage, même nommé "vérifié", reste modifiable par un utilisateur
// muni des outils de développement de son navigateur - aucune obfuscation
// côté client ne change cela réellement. La vraie protection, une fois
// Play Billing connecté, est la vérification de l'achat par la plateforme
// (reçu signé, `Purchase.acknowledge()`), jamais une valeur locale seule.
// Ce fichier sépare donc explicitement isPremium() (cache d'affichage
// rapide) de getEntitlementSource() (d'où vient cette valeur), pour qu'un
// futur code de vérification n'ait qu'à écrire 'store-verified' au bon
// endroit sans réécrire le reste du jeu.
import { Capacitor } from '@capacitor/core';
import {
  getPremiumFlag,
  setPremiumFlag,
  getPremiumSource,
  logSecurityEvent
} from '../save.js';
import { RUNTIME_CONFIG } from '../config/runtime.js';
// Import dynamique (voir ads.js) : le pont vers RuptureBillingPlugin n'a
// aucune raison d'alourdir le bundle de la bêta web/PWA.

export function createPremiumService(config = RUNTIME_CONFIG) {
  // Garde de cohérence : un Premium actif dont la source n'est ni
  // 'simulated-test' ni 'store-verified' n'a pas pu être écrit par ce
  // fichier - journalisé pour diagnostic, jamais utilisé pour bloquer le
  // joueur (voir en-tête : ce n'est pas une protection, juste un
  // diagnostic).
  const isPremium = () => getPremiumFlag();
  const source = () => getPremiumSource();
  if (isPremium() && source() !== 'simulated-test' && source() !== 'store-verified') {
    logSecurityEvent('premium-flag-unknown-source', { source: source() });
  }

  return {
    isPremium,
    getEntitlementSource: source,

    // Réservé aux tests/scripts internes (ex. batteries de simulation qui
    // veulent forcer un état) - jamais appelé depuis un flux d'achat réel.
    // Conservé pour compatibilité avec le code existant qui l'utilisait
    // déjà comme point d'indirection unique.
    setPremium: (value) => setPremiumFlag(Boolean(value), 'simulated-test'),

    async purchasePremium() {
      if (config.env === 'commercial') {
        if (Capacitor.isNativePlatform()) {
          const { createNativePlayBillingAdapter } = await import('./adapters/playBilling.js');
          const result = await createNativePlayBillingAdapter().purchasePremium();
          if (result.granted) setPremiumFlag(true, 'store-verified');
          return result;
        }
        return { granted: false, resultKind: 'not-connected', reason: 'Aucun module Google Play Billing / App Store connecté - voir docs/TRAJECTOIRE_COMMERCIALE.md' };
      }
      await new Promise((resolve) => setTimeout(resolve, 300)); // simule un court délai, pas un vrai réseau de paiement
      setPremiumFlag(true, 'simulated-test');
      return { granted: true, resultKind: 'simulated' };
    },

    async restorePurchases() {
      if (config.env === 'commercial') {
        if (Capacitor.isNativePlatform()) {
          const { createNativePlayBillingAdapter } = await import('./adapters/playBilling.js');
          const result = await createNativePlayBillingAdapter().restorePurchases();
          if (result.restored) setPremiumFlag(true, 'store-verified');
          return result;
        }
        return { restored: false, resultKind: 'not-connected', reason: 'Aucun module de restauration d\'achats connecté - voir docs/TRAJECTOIRE_COMMERCIALE.md' };
      }
      return { restored: isPremium(), resultKind: 'simulated' };
    }
  };
}
