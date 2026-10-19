import { STRAINS } from './strains.js';

// V7 : méta-progression locale (sur le téléphone, sans serveur).
// Étoiles : pour chaque couple (difficulté, souche), on garde la MEILLEURE
// note obtenue (1 à 3) ; le total d'étoiles est la somme de ces meilleures
// notes. Rejouer la même chose ne rapporte rien de plus, progresser oui.
// Le stockage (localStorage) est fait par src/save.js.

export const META_VERSION = 1;

// Seuils de jour de victoire pour 3 / 2 étoiles en Normal ; décalés selon la difficulté.
export const STAR_DAYS = { three: 470, two: 540 };
const DIFFICULTY_BONUS = { easy: -1, normal: 0, hard: 1 };

export function createMeta() {
  return {
    version: META_VERSION,
    games: 0,
    wins: 0,
    bestStars: {},
    records: {},
    daily: {}
  };
}

function normalize(meta) {
  const base = createMeta();
  if (!meta || typeof meta !== 'object') return base;
  return {
    ...base,
    ...meta,
    bestStars: { ...(meta.bestStars || {}) },
    records: { ...(meta.records || {}) },
    daily: { ...(meta.daily || {}) }
  };
}

export function totalStars(meta) {
  const m = normalize(meta);
  return Object.values(m.bestStars).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

// Note d'une partie : 0 en cas de défaite ; 1 à 3 en cas de victoire selon le
// jour de victoire, +1 en Difficile, −1 en Facile (toujours au moins 1).
export function starsFor(state) {
  if (!state || state.status !== 'victory') return 0;
  const day = state.outcome?.day ?? state.day ?? 0;
  let stars = day <= STAR_DAYS.three ? 3 : day <= STAR_DAYS.two ? 2 : 1;
  stars += DIFFICULTY_BONUS[state.difficulty] ?? 0;
  return Math.max(1, Math.min(3, stars));
}

export function isUnlocked(meta, strainId) {
  const strain = STRAINS.find((s) => s.id === strainId);
  if (!strain) return false;
  return totalStars(meta) >= strain.unlockStars;
}

export function recordGame(meta, state) {
  const next = normalize(meta);
  if (!state || (state.status !== 'victory' && state.status !== 'defeat')) {
    return { meta: next, newRecord: false, starsGained: 0 };
  }
  next.games += 1;
  const won = state.status === 'victory';
  if (won) next.wins += 1;
  const key = `${state.difficulty || 'normal'}:${state.strain || 'standard'}`;
  const stars = starsFor(state);
  const previousStars = Number(next.bestStars[key]) || 0;
  const starsGained = Math.max(0, stars - previousStars);
  if (starsGained > 0) next.bestStars[key] = stars;

  let newRecord = false;
  const day = state.outcome?.day ?? state.day;
  if (won) {
    const prev = next.records[key];
    if (typeof prev !== 'number' || day < prev) {
      next.records[key] = day;
      newRecord = true;
    }
  }
  if (state.dailyChallenge && state.seed) {
    const prevDaily = next.daily[state.seed];
    const entry = { won, day, stars };
    const better =
      !prevDaily ||
      (won && !prevDaily.won) ||
      (won && prevDaily.won && day < prevDaily.day);
    if (better) {
      next.daily[state.seed] = entry;
      if (won) newRecord = true;
    }
    // On ne garde que les 30 derniers défis du jour.
    const seeds = Object.keys(next.daily).sort();
    while (seeds.length > 30) delete next.daily[seeds.shift()];
  }
  return { meta: next, newRecord, starsGained };
}
