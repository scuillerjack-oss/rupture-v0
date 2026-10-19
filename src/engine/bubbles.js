import { TERRITORIES, getTerritory } from './territories.js';
import { BALANCE } from './balance.js';
import { randomInt, pickWeighted } from './rng.js';
import { strainMod } from './strains.js';

// V7 : bulles à toucher sur la carte.
//  - « influence » (rouge) : sur une région en crise ; la toucher verse de
//    l'Influence. Alimentée par une part du revenu passif (incomeShare) mise
//    de côté dans state.bubblePool : un joueur qui touche
//    referenceCollectRate (70 %) des bulles retrouve exactement le revenu V6 ;
//    au-delà il gagne plus, en dessous il gagne moins (jamais moins de
//    1 - incomeShare du revenu V6).
//  - « research » (bleue) : sur une région très consciente ; la toucher
//    retire un point de Réponse mondiale (et crée une petite dette qui se
//    résorbe lentement, voir simulation.js).
// Durée de vie : lifetimeDays jours de jeu (~8 s en ×1).

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Sépare le revenu d'un tick : renvoie la part versée directement, met le
// reste dans la cagnotte des bulles.
export function splitIncome(state, income) {
  const share = BALANCE.bubbles.incomeShare;
  state.bubblePool = (state.bubblePool || 0) + income * share;
  return income * (1 - share);
}

function spawn(state, kind, territoryId, value) {
  state.bubbleSeq = (state.bubbleSeq || 0) + 1;
  const bubble = {
    id: `b${state.bubbleSeq}`,
    kind,
    territoryId,
    value: Math.round(value * 100) / 100,
    bornDay: state.day,
    expiresDay: state.day + BALANCE.bubbles.lifetimeDays
  };
  state.bubbles.push(bubble);
  state.bubblesSpawned = (state.bubblesSpawned || 0) + 1;
  return bubble;
}

function freeTerritory(state, candidates) {
  const taken = new Set(state.bubbles.map((b) => b.territoryId));
  const free = candidates.filter((t) => !taken.has(t.id));
  return free.length ? free : candidates;
}

// Appelée par simulateTick après l'avancée du jour : expire, puis fait naître.
export function tickBubbles(state) {
  const cfg = BALANCE.bubbles;
  state.bubbles = state.bubbles.filter((b) => b.expiresDay > state.day);

  if (state.day >= state.nextInfluenceBubbleDay) {
    const count = state.bubbles.filter((b) => b.kind === 'influence').length;
    const inCrisis = TERRITORIES.filter((t) => state.territories[t.id].crisis >= 1);
    if (count < cfg.maxInfluenceBubbles && inCrisis.length && state.bubblePool > 0) {
      const pool = freeTerritory(state, inCrisis);
      const target = pickWeighted(state, pool, (t) => state.territories[t.id].crisis * t.population);
      if (target) {
        const value = (state.bubblePool / cfg.referenceCollectRate) * strainMod(state, 'bubbleValue');
        state.bubblePool = 0;
        spawn(state, 'influence', target.id, value);
      }
    }
    state.nextInfluenceBubbleDay = state.day + randomInt(state, cfg.influenceIntervalMin, cfg.influenceIntervalMax);
  }

  if (state.day >= state.nextResearchBubbleDay) {
    const count = state.bubbles.filter((b) => b.kind === 'research').length;
    const aware = TERRITORIES.filter((t) => state.territories[t.id].awareness >= cfg.researchAwarenessThreshold);
    if (count < cfg.maxResearchBubbles && aware.length && state.globalContainment > 0) {
      const target = pickWeighted(state, freeTerritory(state, aware), (t) => state.territories[t.id].awareness);
      if (target) spawn(state, 'research', target.id, cfg.researchValue);
    }
    state.nextResearchBubbleDay = state.day + randomInt(state, cfg.researchIntervalMin, cfg.researchIntervalMax);
  }
}

export function collectBubble(state, id) {
  if (!state || !Array.isArray(state.bubbles)) return { ok: false, error: 'Aucune bulle.' };
  if (state.status !== 'playing') return { ok: false, error: 'La partie n’est pas en cours.' };
  const index = state.bubbles.findIndex((b) => b.id === id);
  if (index < 0) return { ok: false, error: 'Cette bulle a disparu.' };
  const bubble = state.bubbles[index];
  if (bubble.expiresDay <= state.day) {
    state.bubbles.splice(index, 1);
    return { ok: false, error: 'Cette bulle a disparu.' };
  }
  state.bubbles.splice(index, 1);
  state.bubblesCollected = (state.bubblesCollected || 0) + 1;
  if (bubble.kind === 'influence') {
    const before = state.influence;
    state.influence = clamp(state.influence + bubble.value, 0, BALANCE.influenceCap);
    return { ok: true, kind: 'influence', gain: Math.round((state.influence - before) * 100) / 100 };
  }
  const before = state.globalContainment;
  state.globalContainment = clamp(state.globalContainment - bubble.value, 0, 100);
  const gain = before - state.globalContainment;
  state.responseDebt = (state.responseDebt || 0) + gain;
  return { ok: true, kind: 'research', gain: Math.round(gain * 100) / 100, territoryName: getTerritory(bubble.territoryId)?.name };
}
