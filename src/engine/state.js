import { TERRITORIES, buildAdjacency } from './territories.js';
import { BALANCE, DIFFICULTIES } from './balance.js';

// V3 change la forme de la sauvegarde de façon non réinterprétable pour une
// partie V2 en cours : nouvelle branche Dangerosité (upgrades.dangerosity),
// et surtout une formule de victoire différente (progression pondérée par la
// sévérité, seuil 100 au lieu de 90). Une migration purement technique
// (ajouter dangerosity:0) est possible, mais elle changerait silencieusement
// ce qu'une progression déjà acquise signifie pour le joueur - pire qu'un
// redémarrage franc. Choix documenté dans le rapport V3 : aucune migration
// 2->3 n'est enregistrée, une sauvegarde V2 est donc proprement rejetée.
//
// V4.1 ajoute state.globalAwareness (Conscience mondiale, suivie séparément
// de la Réponse - voir simulation.js). Contrairement à V2->V3, cette
// évolution EST proprement mappable : une sauvegarde V3 en cours contient
// déjà l'awareness de chaque territoire, il suffit d'en calculer la moyenne
// pour reconstituer une Conscience mondiale cohérente avec la partie déjà
// jouée - voir migrations.js. Une partie en cours ne perd donc pas sa
// progression pour ce changement.
//
// V4.1 (§8) ajoute aussi maxDominance (plus haute Progression jamais
// atteinte - peut différer de la Progression finale car la Dangerosité peut
// redescendre le plafond de gravité une fois la Réponse mobilisée, voir
// simulation.js) et phaseLog (jours de passage de chaque phase de Réponse),
// utilisés uniquement par le récapitulatif de fin de partie. Une sauvegarde
// V4 en cours n'a pas cet historique : la migration initialise maxDominance
// à la Progression actuelle (minoration honnête plutôt qu'une valeur
// inventée) et phaseLog à vide plutôt que de reconstituer un historique
// qui n'a jamais été enregistré.
//
// V5.2 (bêta manuelle post-V5.1, audit Progression/Résilience) ajoute deux
// champs liés au plafond de crise (voir simulation.js) :
//  - suppressionPressure : accumulateur interne à inertie qui lisse la
//    pression de suppression - une Anomalie qui bascule tardivement en
//    Dangerosité maximale ne se retrouve plus suppimée du jour au lendemain
//    simplement parce que la mobilisation interne a bondi d'un coup. Une
//    sauvegarde V5 en cours n'a pas cet historique : la migration le
//    reconstitue à la valeur qu'il aurait "en régime établi" à cet instant
//    précis (mobilizationProgress courant), pas à zéro - repartir de zéro
//    offrirait un répit à une partie déjà mobilisée, jamais gagné en jouant.
//  - crisisCapHighWater : plafond de crise à cliquet (ne redescend jamais) -
//    corrige un écart entre l'intention documentée depuis V3.1 ("une
//    réduction du plafond, jamais une érosion de la crise déjà acquise") et
//    le comportement réel observé (une crise déjà gagnée pouvait être
//    reprise si la suppression continuait de progresser après coup). Une
//    sauvegarde V5 en cours n'a pas cet historique : reconstitué à la plus
//    haute crise déjà atteinte par un territoire (plancher honnête - ce
//    plafond n'a certainement jamais été inférieur à une crise déjà
//    observée).
export const SAVE_VERSION = 6;

export function createTerritoryStates() {
  const map = {};
  for (const t of TERRITORIES) {
    map[t.id] = {
      id: t.id,
      crisis: 0,
      awareness: 0,
      containment: 0,
      closedRoutes: []
    };
  }
  return map;
}

function createInitialUpgrades() {
  return { propagation: 0, resilience: 0, discretion: 0, dangerosity: 0 };
}

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    status: 'menu',
    day: 0,
    speed: 1,
    originId: null,
    influence: 0,
    // Réponse mondiale AFFICHÉE au joueur - seule condition de défaite,
    // désormais plafonnée par la Conscience (globalAwareness ci-dessous) -
    // voir simulation.js: responseCapAt().
    globalContainment: 0,
    // Accumulateur interne (jamais affiché) qui alimente la pression de
    // suppression locale - formule héritée telle quelle de V3.1/V4. Distinct
    // de globalContainment depuis V4.1 : voir simulation.js pour pourquoi
    // les deux ne peuvent plus être la même valeur.
    globalMobilization: 0,
    // Pression de suppression EFFECTIVE (0-1), avec inertie - distincte de
    // mobilizationProgress (calculée instantanément à partir de
    // globalMobilization) : voir simulation.js pour pourquoi cette
    // distinction existe.
    suppressionPressure: 0,
    // Plafond de crise à cliquet (0-100) - voir simulation.js. Grandeur
    // globale (aucune de ses composantes n'est spécifique à un territoire).
    crisisCapHighWater: 0,
    // Conscience mondiale moyenne (0-100) : à quel point l'Humanité comprend
    // la menace, suivie séparément de la Réponse - voir simulation.js.
    globalAwareness: 0,
    dominance: 0,
    // Plus haute Progression jamais atteinte - distincte de `dominance`
    // (valeur courante, qui peut redescendre) : voir simulation.js et le
    // récapitulatif de fin de partie (ui/screens.js).
    maxDominance: 0,
    reach: 0,
    responsePhase: 'ignorance',
    // Jour de passage de chaque phase de Réponse mondiale (hors 'ignorance',
    // déjà la phase de départ) - alimente le récapitulatif de fin de partie.
    // Borné par construction : au plus une entrée par phase (voir
    // RESPONSE_PHASES dans balance.js), jamais rejouée en arrière (la
    // Réponse affichée ne redescend jamais).
    phaseLog: [],
    dominanceMilestoneLogged: false,
    upgrades: createInitialUpgrades(),
    territories: createTerritoryStates(),
    selectedId: null,
    endReason: null,
    difficulty: 'normal',
    rules: { ...DIFFICULTIES.normal },
    log: []
  };
}

export function beginNewGame(state, difficulty = 'normal') {
  const resolvedDifficulty = DIFFICULTIES[difficulty] ? difficulty : 'normal';
  state.status = 'selecting-origin';
  state.day = 0;
  state.speed = 1;
  state.originId = null;
  state.influence = 0;
  state.globalContainment = 0;
  state.globalMobilization = 0;
  state.suppressionPressure = 0;
  state.crisisCapHighWater = 0;
  state.globalAwareness = 0;
  state.dominance = 0;
  state.maxDominance = 0;
  state.reach = 0;
  state.responsePhase = 'ignorance';
  state.phaseLog = [];
  state.dominanceMilestoneLogged = false;
  state.upgrades = createInitialUpgrades();
  state.territories = createTerritoryStates();
  state.selectedId = null;
  state.difficulty = resolvedDifficulty;
  state.rules = { ...DIFFICULTIES[resolvedDifficulty] };
  state.log = ['Choisissez un territoire de départ pour votre anomalie.'];
}

export function confirmOrigin(state, originId) {
  if (state.status !== 'selecting-origin') return;
  state.originId = originId;
  state.territories[originId].crisis = BALANCE.startingCrisis;
  state.selectedId = originId;
  state.status = 'playing';
  pushLog(state, `Point de départ : ${originId}. L'anomalie commence à se répandre.`);
}

export const adjacency = buildAdjacency();

export function pushLog(state, message) {
  state.log.unshift(message);
  if (state.log.length > 30) state.log.length = 30;
}
