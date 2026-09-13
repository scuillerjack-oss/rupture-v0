// Configuration d'exécution centralisée — le seul endroit du code qui sache
// dans quel "environnement" tourne ce build. Rien d'autre ne doit tester
// l'environnement directement : tout le reste lit une valeur déjà résolue
// depuis ce module (voir docs/ARCHITECTURE.md, section "Configuration").
//
// 'commercial' ne correspond à aucun build réel pour l'instant : c'est un
// espace réservé documenté pour la future version Google Play, où certaines
// de ces valeurs différeraient (voir docs/TRAJECTOIRE_COMMERCIALE.md).
export const BUILD_ENV = 'beta'; // 'dev' | 'beta' | 'commercial'

const ALL_SPEEDS = [0, 1, 2, 4];

export const RUNTIME_CONFIG = {
  env: BUILD_ENV,
  // Vitesses qui nécessiteraient Premium dans un futur build commercial.
  // Vide pendant dev/bêta : conformément à la demande explicite, x1/x2/x4
  // doivent rester intégralement accessibles pendant le développement et
  // les bêta-tests, quel que soit le contenu de cette liste.
  premiumOnlySpeeds: [],
  adsEnabled: false,
  analyticsEnabled: false
};

// Calcule les vitesses réellement proposées au joueur. En dev/bêta,
// renvoie toujours la liste complète — même si premiumOnlySpeeds contenait
// une valeur par erreur, l'environnement 'beta' l'ignore volontairement.
// Seul un futur environnement 'commercial' appliquerait une restriction,
// et seulement pour un joueur non-Premium.
export function getAvailableSpeeds(services, config = RUNTIME_CONFIG) {
  if (config.env !== 'commercial') return ALL_SPEEDS;
  const isPremium = services?.premium?.isPremium?.() ?? false;
  return ALL_SPEEDS.filter((speed) => isPremium || !config.premiumOnlySpeeds.includes(speed));
}
