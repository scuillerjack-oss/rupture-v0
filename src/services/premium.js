// Adaptateur Premium local. Aucun achat réel n'est intégré : le statut est
// un simple indicateur stocké côté appareil, pensé pour qu'un futur flux
// d'achat (Google Play Billing ou autre plateforme) n'ait qu'à appeler
// setPremiumFlag(true) après une transaction vérifiée, sans toucher au
// reste du jeu.
//
// Limite assumée et documentée (voir docs/TRAJECTOIRE_COMMERCIALE.md) :
// un indicateur localStorage n'est PAS une preuve d'achat fiable pour une
// vraie commercialisation. Une intégration réelle devra vérifier
// l'entitlement via la plateforme (Play Billing, restauration d'achat)
// plutôt que de faire confiance à cette seule valeur locale.
import { getPremiumFlag, setPremiumFlag } from '../save.js';

export function createPremiumService() {
  return {
    isPremium: () => getPremiumFlag(),
    setPremium: (value) => setPremiumFlag(Boolean(value))
  };
}
