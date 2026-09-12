import { TERRITORIES, buildAdjacency } from './territories.js';
import { BALANCE } from './balance.js';

export const SAVE_VERSION = 1;

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
    upgrades: { propagation: 0, resilience: 0, discretion: 0 },
    territories: createTerritoryStates(),
    selectedId: null,
    endReason: null,
    log: []
  };
}

export function beginNewGame(state) {
  state.status = 'selecting-origin';
  state.day = 0;
  state.speed = 1;
  state.originId = null;
  state.influence = 0;
  state.globalContainment = 0;
  state.dominance = 0;
  state.upgrades = { propagation: 0, resilience: 0, discretion: 0 };
  state.territories = createTerritoryStates();
  state.selectedId = null;
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
