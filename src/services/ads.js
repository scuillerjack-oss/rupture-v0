// Interface publicité. Aucun SDK réel n'est intégré (aucun compte/fournisseur
// choisi pour l'instant) : ceci ne fait que fixer la forme que le moteur/UI
// pourraient appeler plus tard (publicité classique, publicité récompensée),
// pour qu'un futur fournisseur (ex. AdMob via un plugin natif) se branche ici
// sans que src/engine ou src/ui n'aient jamais à connaître son existence.
//
// Non câblé à une fonctionnalité de jeu pour l'instant : aucune fonctionnalité
// publicitaire n'existe encore côté gameplay. Prêt à être consommé le jour où
// l'une d'elles sera conçue.
export function createAdsService() {
  return {
    isRewardedAdAvailable: () => false,
    showRewardedAd: async () => ({ shown: false, reason: 'not-implemented' }),
    showInterstitialAd: async () => ({ shown: false, reason: 'not-implemented' })
  };
}
