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
  // Vitesse réservée à Premium dans un futur build commercial (modèle
  // audité : ×1/×2 gratuites, ×4 Premium - voir
  // docs/RUPTURE_Audit_Economique_Precommercialisation.pdf §3/§8). Cette
  // valeur ne s'applique QUE si env==='commercial' (voir
  // getAvailableSpeeds ci-dessous) : pendant dev/bêta, x1/x2/x4 restent
  // intégralement accessibles quel que soit ce contenu, conformément à la
  // demande explicite de ne jamais restreindre la bêta gameplay en cours.
  premiumOnlySpeeds: [4],
  // Active la LOGIQUE de fréquence publicitaire réelle (services/ads.js) -
  // n'affiche jamais une vraie publicité (aucun SDK connecté, voir ce
  // fichier) : en dev/bêta l'affichage reste simulé et clairement labellisé
  // dans l'UI, jamais confondu avec un vrai revenu publicitaire.
  adsEnabled: true,
  // Règle de fréquence exacte retenue dans l'audit économique (§2, §8, §9) :
  // 1 publicité par partie si la partie a réellement duré au moins ce
  // seuil (horloge murale), sinon 1 publicité toutes les
  // `interstitialShortGameRatio` parties plus courtes.
  interstitialMinGameDurationMs: 3 * 60 * 1000,
  interstitialShortGameRatio: 2,
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
