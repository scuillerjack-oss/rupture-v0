// Registre des migrations de sauvegarde, indexé par la version DE DÉPART
// qu'elles savent transformer. Un futur incrément de SAVE_VERSION qui peut
// être mappé proprement vers la nouvelle forme devrait ajouter une entrée
// ici plutôt que de laisser loadState() rejeter silencieusement l'ancienne
// sauvegarde (comportement conservé quand aucune migration n'est
// enregistrée : jamais d'état partiellement migré ou incohérent).
//
// Exemple pour une future version 3 qui ajouterait un champ :
//   2: (old) => ({ ...old, version: 3, monNouveauChamp: valeurParDefaut })
const MIGRATIONS = {};

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
