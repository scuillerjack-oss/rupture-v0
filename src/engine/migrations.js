import { BALANCE } from './balance.js';

// Registre des migrations de sauvegarde, indexé par la version DE DÉPART
// qu'elles savent transformer. Un futur incrément de SAVE_VERSION qui peut
// être mappé proprement vers la nouvelle forme devrait ajouter une entrée
// ici plutôt que de laisser loadState() rejeter silencieusement l'ancienne
// sauvegarde (comportement conservé quand aucune migration n'est
// enregistrée : jamais d'état partiellement migré ou incohérent).
//
// Exemple pour une future version 3 qui ajouterait un champ :
//   2: (old) => ({ ...old, version: 3, monNouveauChamp: valeurParDefaut })
const MIGRATIONS = {
  // V4.1 : ajoute globalAwareness (Conscience mondiale) et globalMobilization
  // (accumulateur interne de suppression, distinct de la Réponse affichée -
  // voir simulation.js). globalAwareness est reconstituée à partir de la
  // moyenne des awareness déjà enregistrées par territoire dans la
  // sauvegarde V3 - plus fidèle qu'un simple 0, qui aurait fait repartir une
  // partie en cours d'une Conscience nulle malgré une progression déjà bien
  // engagée. L'ancien globalContainment (V3) était exactement cet
  // accumulateur avant que la Réponse affichée ne soit plafonnée par la
  // Conscience : il devient donc globalMobilization tel quel, et la nouvelle
  // Réponse affichée est recalculée en lui appliquant immédiatement le
  // plafond (jamais une Réponse déjà affichée plus haute que ce que le
  // nouveau plafond autoriserait).
  3: (old) => {
    const territories = old.territories && typeof old.territories === 'object' ? Object.values(old.territories) : [];
    const globalAwareness = territories.length
      ? territories.reduce((sum, t) => sum + (Number(t?.awareness) || 0), 0) / territories.length
      : 0;
    const globalMobilization = Number(old.globalContainment) || 0;
    const { responseCapBaseline, responseCapPower, fullConscienceLevel } = BALANCE.humanity;
    const fraction = Math.max(0, Math.min(1, globalAwareness / 100 / fullConscienceLevel));
    const responseCap = responseCapBaseline + (100 - responseCapBaseline) * Math.pow(fraction, responseCapPower);
    const globalContainment = Math.min(globalMobilization, responseCap);
    return { ...old, version: 4, globalAwareness, globalMobilization, globalContainment };
  },
  // V4.1 ajoute maxDominance et phaseLog, utilisés uniquement par le
  // récapitulatif de fin de partie (voir state.js). Aucun des deux n'a
  // d'historique dans une sauvegarde V4 : maxDominance part de la
  // Progression actuelle (minoration honnête - la vraie valeur maximale
  // n'a jamais été enregistrée, mais elle n'a certainement pas été
  // inférieure à la valeur courante) et phaseLog part vide plutôt que
  // d'inventer des jours de transition qui n'ont jamais été mesurés.
  4: (old) => ({
    ...old,
    version: 5,
    maxDominance: Number(old.dominance) || 0,
    phaseLog: []
  })
};

// Applique la chaîne de migrations nécessaire pour amener `raw` à
// targetVersion. Renvoie null si aucun chemin complet n'existe (version
// trop ancienne, ou future/inconnue) plutôt que de renvoyer un objet
// partiellement migré : mieux vaut perdre une sauvegarde proprement que
// démarrer une partie dans un état incohérent.
export function migrateSave(raw, targetVersion, registry = MIGRATIONS) {
  if (!raw || typeof raw.version !== 'number') return null;
  let current = raw;
  let steps = 0;
  const maxSteps = 50; // garde-fou contre une chaîne cyclique ou mal configurée
  while (current.version !== targetVersion) {
    const migrate = registry[current.version];
    if (!migrate) return null;
    current = migrate(current);
    steps += 1;
    if (steps > maxSteps) return null;
  }
  return current;
}
