// V7 — point d'accès UNIQUE de l'interface aux fonctions du moteur décrites
// dans docs/V7-contrat-api.md.
//
// Pourquoi ce module : l'équipe Moteur écrit bubbles.js, abilities.js,
// events.js, forecast.js, meta.js EN MÊME TEMPS que l'interface. Tant qu'un
// fichier ou un nom n'existe pas, l'interface doit continuer de fonctionner
// (valeur neutre) au lieu de casser le build. Ordre de résolution d'un nom :
//   1. surcharges enregistrées par registerEngine() (tests, aperçu) ;
//   2. les modules V7 du contrat (bubbles, abilities, events, forecast, meta,
//      strains, rng) chargés par import dynamique à motif : Vite, esbuild et
//      Node savent tous l'empaqueter/le résoudre, et un fichier absent donne
//      simplement une promesse rejetée (attrapée) ;
//   3. simulation.js et state.js (toujours présents, import statique) ;
//   4. repli neutre défini ici.
// main.js attend `engineReady` avant le premier affichage.
// Toute fonction est appelée sous try/catch : une erreur moteur ne doit
// jamais figer l'écran de jeu.
import * as simulationNs from '../engine/simulation.js';
import * as stateNs from '../engine/state.js';
import { TERRITORIES, EDGES, getTerritory } from '../engine/territories.js';

const V7_ENGINE_FILES = ['bubbles', 'abilities', 'events', 'forecast', 'meta', 'strains', 'rng'];
const dynamicModules = [];

// Selon l'outil, un module absent donne une promesse rejetée (Vite, Node) ou
// une exception SYNCHRONE (esbuild) : les deux cas sont absorbés.
export function safeImport(loader) {
  try {
    return Promise.resolve(loader()).catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}

export const engineReady = Promise.all(
  V7_ENGINE_FILES.map((name) => safeImport(() => import(`../engine/${name}.js`))
    .then((mod) => { if (mod) dynamicModules.push(mod); }))
).then(() => dynamicModules.length);

const overrides = {};
const staticModules = [simulationNs, stateNs];

export function registerEngine(names) {
  Object.assign(overrides, names || {});
}

export function resetEngineOverrides() {
  for (const k of Object.keys(overrides)) delete overrides[k];
}

function lookup(name) {
  if (overrides[name] !== undefined) return overrides[name];
  // simulation.js d'abord : il réexporte bubbles.js et reste la référence.
  for (const mod of [...staticModules, ...dynamicModules]) {
    if (mod && mod[name] !== undefined) return mod[name];
  }
  return undefined;
}

export function hasEngine(name) {
  return lookup(name) !== undefined;
}

function call(name, fallback, args) {
  const fn = lookup(name);
  if (typeof fn !== 'function') return typeof fallback === 'function' ? fallback(...args) : fallback;
  try {
    return fn(...args);
  } catch (e) {
    console.warn(`Moteur : ${name} a échoué`, e);
    return typeof fallback === 'function' ? fallback(...args) : fallback;
  }
}

export { TERRITORIES, EDGES, getTerritory };

export function territoryName(id) {
  return getTerritory(id)?.name ?? id ?? '';
}

// --- Inchangé (V6) ---
export const createInitialState = (...a) => call('createInitialState', () => ({ status: 'menu' }), a);
export const beginNewGame = (state, difficulty, opts = {}) => call('beginNewGame', undefined, [state, difficulty, opts]);
export const confirmOrigin = (...a) => call('confirmOrigin', undefined, a);
export const simulateTick = (...a) => call('simulateTick', undefined, a);
export const buyUpgrade = (...a) => Boolean(call('buyUpgrade', false, a));
export const selectTerritory = (...a) => call('selectTerritory', undefined, a);
export const setSpeed = (state, speed) => call('setSpeed', (s, v) => { s.speed = v; }, [state, speed]);

// --- Hasard ---
function localDailySeed(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export const dailySeed = (date = new Date()) => call('dailySeed', localDailySeed, [date]);

export function randomSeed() {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// --- Bulles ---
export const collectBubble = (state, id) =>
  call('collectBubble', { ok: false, error: 'Bulles indisponibles' }, [state, id]) || { ok: false };

// --- Capacités ---
export function getAbilities() {
  const list = lookup('ABILITIES');
  return Array.isArray(list) ? list : [];
}
export const abilityStatus = (state, id) =>
  call('abilityStatus', { available: false, reason: 'Indisponible', cost: 0, readyInDays: 0 }, [state, id])
  || { available: false, reason: 'Indisponible', cost: 0, readyInDays: 0 };
export const abilityTargets = (state, id) => {
  const t = call('abilityTargets', [], [state, id]);
  return Array.isArray(t) ? t : [];
};
export const useAbility = (state, id, target) =>
  call('useAbility', { ok: false, error: 'Capacité indisponible' }, [state, id, target]) || { ok: false };

// --- Événements ---
export const chooseEventOption = (state, optionId) =>
  call('chooseEventOption', (s) => { if (s) s.pendingEvent = null; return { ok: true, resultText: '' }; }, [state, optionId])
  || { ok: false };

// --- Projection et obstacles ---
export const forecastRace = (state) =>
  call('forecastRace', { ruptureDay: null, controlDay: null }, [state]) || { ruptureDay: null, controlDay: null };
export const progressBlockers = (state) => {
  const b = call('progressBlockers', [], [state]);
  return Array.isArray(b) ? b : [];
};

// --- Souches et méta ---
const STANDARD_STRAIN = { id: 'standard', label: 'Standard', description: "L'Anomalie telle qu'elle s'est éveillée.", unlockStars: 0 };
export function getStrains() {
  const list = lookup('STRAINS');
  return Array.isArray(list) && list.length ? list : [STANDARD_STRAIN];
}
export function strainLabel(id) {
  return getStrains().find((s) => s.id === id)?.label ?? STANDARD_STRAIN.label;
}
// Repli local de la méta tant que src/engine/meta.js n'existe pas : même
// forme de retour que le contrat, logique minimale (meilleures étoiles par
// difficulté/souche, cumul des étoiles nouvellement gagnées).
const neutralMeta = () => ({ totalStars: 0, games: 0, records: {} });

export function fallbackStars(state) {
  const outcome = state?.outcome;
  const victory = outcome ? outcome.result === 'victory' : state?.status === 'victory';
  if (!victory) return 0;
  if (Number.isFinite(outcome?.stars)) return Math.max(0, Math.min(3, outcome.stars));
  const day = outcome?.day ?? state.day ?? 0;
  let stars = 1;
  if (state.difficulty === 'normal' || state.difficulty === 'hard') stars += 1;
  if (state.difficulty === 'hard' || day <= 420) stars += 1;
  return Math.min(3, stars);
}

function fallbackRecordGame(meta, state) {
  const base = meta && typeof meta === 'object' ? meta : neutralMeta();
  const next = { ...base, records: { ...(base.records || {}) } };
  const key = `${state.difficulty || 'normal'}:${state.strain || 'standard'}`;
  const prev = next.records[key] || { bestStars: 0, bestDay: null, wins: 0 };
  const stars = fallbackStars(state);
  const victory = stars > 0;
  const day = state.outcome?.day ?? state.day ?? 0;
  const starsGained = Math.max(0, stars - (prev.bestStars || 0));
  const newRecord = victory && (prev.bestDay === null || day < prev.bestDay);
  next.records[key] = {
    bestStars: Math.max(prev.bestStars || 0, stars),
    bestDay: newRecord ? day : prev.bestDay,
    wins: (prev.wins || 0) + (victory ? 1 : 0)
  };
  next.games = (base.games || 0) + 1;
  next.totalStars = (base.totalStars || 0) + starsGained;
  return { meta: next, newRecord, starsGained };
}

export const createMeta = () => call('createMeta', neutralMeta, []) || neutralMeta();
export const recordGame = (meta, state) =>
  call('recordGame', fallbackRecordGame, [meta, state]) || { meta, newRecord: false, starsGained: 0 };
export function isUnlocked(meta, strainId) {
  if (strainId === 'standard') return true;
  return Boolean(call('isUnlocked', (m, id) => {
    const strain = getStrains().find((s) => s.id === id);
    return Boolean(strain) && metaStars(m) >= (strain.unlockStars ?? Infinity);
  }, [meta, strainId]));
}
export function metaStars(meta) {
  if (!meta) return 0;
  const v = meta.totalStars ?? meta.stars;
  return Number.isFinite(v) ? v : 0;
}
export const starsFor = (state) => {
  const v = call('starsFor', fallbackStars, [state]);
  return Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : fallbackStars(state);
};

// --- Carte ---
export function localRouteKey(a, b) {
  return [a, b].sort().join('|');
}
