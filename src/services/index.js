// Point d'assemblage unique des services plateforme/commerciaux. main.js
// est seul responsable d'appeler createServices() et de distribuer l'objet
// obtenu ; src/engine et src/ui ne doivent jamais importer un adaptateur
// concret directement, uniquement recevoir cette forme en paramètre (voir
// docs/ARCHITECTURE.md, section "Séparation jeu / services").
import { createPremiumService } from './premium.js';
import { createAdsService } from './ads.js';
import { createAnalyticsService } from './analytics.js';

export function createServices() {
  return {
    premium: createPremiumService(),
    ads: createAdsService(),
    analytics: createAnalyticsService()
  };
}
