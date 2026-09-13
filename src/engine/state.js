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
export const SAVE_VERSION = 3;

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
    globalContainment: 0,
    dominance: 0,
    reach: 0,
    responsePhase: 'ignorance',
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
  state.dominance = 0;
  state.reach = 0;
  state.responsePhase = 'ignorance';
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
