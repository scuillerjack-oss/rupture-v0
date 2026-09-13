// Interface analytics / remontée d'erreurs. Aucun fournisseur réel n'est
// intégré (aucune décision/compte pris pour l'instant) : l'adaptateur local
// ne fait rien, mais main.js route déjà les erreurs non interceptées à
// travers cette interface — brancher un vrai fournisseur plus tard consiste
// uniquement à réécrire ce fichier, sans toucher au reste du jeu.
export function createAnalyticsService() {
  return {
    logEvent: (_name, _params) => {},
    logError: (_error, _context) => {}
  };
}
