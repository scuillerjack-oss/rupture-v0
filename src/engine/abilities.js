import { TERRITORIES, getTerritory } from './territories.js';
import { BALANCE } from './balance.js';
import { pushLog } from './state.js';
import { ROUTE_KEYS, isRouteClosed, openRoute, parseRouteKey } from './routes.js';

// V7 : capacités actives ciblées (coût en Influence + recharge en jours).
const CFG = BALANCE.abilities;

export const ABILITIES = [
  {
    id: 'surge',
    label: 'Sursaut',
    description: `Fait grimper d’un coup la crise d’une région déjà touchée (+${CFG.surge.crisisGain}, dans la limite du plafond de gravité).`,
    cost: CFG.surge.cost,
    cooldownDays: CFG.surge.cooldownDays,
    target: 'territory'
  },
  {
    id: 'jam',
    label: 'Brouillage',
    description: `Fige la conscience d’une région pendant ${CFG.jam.durationDays} jours : elle ne comprend plus ce qui lui arrive.`,
    cost: CFG.jam.cost,
    cooldownDays: CFG.jam.cooldownDays,
    target: 'territory'
  },
  {
    id: 'breach',
    label: 'Percée',
    description: `Rouvre une route fermée ; elle ne pourra pas être refermée pendant ${CFG.breach.shieldDays} jours.`,
    cost: CFG.breach.cost,
    cooldownDays: CFG.breach.cooldownDays,
    target: 'route'
  }
];

function getAbility(id) {
  return ABILITIES.find((a) => a.id === id);
}

function cooldownDay(state, id) {
  const d = state?.abilityCooldowns?.[id];
  return typeof d === 'number' ? d : 0;
}

function isJammed(state, id) {
  const until = state.jams?.[id];
  return typeof until === 'number' && state.day < until;
}

export function abilityTargets(state, id) {
  const ability = getAbility(id);
  if (!ability || !state?.territories) return [];
  if (id === 'surge') {
    const cap = state.crisisCapHighWater || 0;
    return TERRITORIES.filter((t) => {
      const c = state.territories[t.id]?.crisis ?? 0;
      return c > 0 && c < Math.max(cap, 1) - 0.5;
    }).map((t) => t.id);
  }
  if (id === 'jam') {
    return TERRITORIES.filter((t) => {
      const ts = state.territories[t.id];
      return ts && ts.awareness > 0 && !isJammed(state, t.id);
    }).map((t) => t.id);
  }
  if (id === 'breach') return ROUTE_KEYS.filter((key) => isRouteClosed(state, key));
  return [];
}

export function abilityStatus(state, id) {
  const ability = getAbility(id);
  if (!ability) return { available: false, reason: 'Capacité inconnue.', cost: 0, readyInDays: 0 };
  const cost = ability.cost;
  if (!state || state.status !== 'playing') return { available: false, reason: 'La partie n’est pas en cours.', cost, readyInDays: 0 };
  if (state.pendingEvent) return { available: false, reason: 'Un événement attend ta décision.', cost, readyInDays: 0 };
  const readyInDays = Math.max(0, cooldownDay(state, id) - state.day);
  if (readyInDays > 0) return { available: false, reason: `Recharge : encore ${readyInDays} jours.`, cost, readyInDays };
  if (state.influence < cost) return { available: false, reason: `Il faut ${cost} d’Influence.`, cost, readyInDays: 0 };
  if (!abilityTargets(state, id).length) {
    const reason = id === 'breach' ? 'Aucune route fermée.' : id === 'jam' ? 'Aucune région consciente à brouiller.' : 'Aucune région ne peut monter davantage.';
    return { available: false, reason, cost, readyInDays: 0 };
  }
  return { available: true, reason: null, cost, readyInDays: 0 };
}

export function useAbility(state, id, target) {
  const ability = getAbility(id);
  if (!ability) return { ok: false, error: 'Capacité inconnue.' };
  const status = abilityStatus(state, id);
  if (!status.available) return { ok: false, error: status.reason };
  if (!abilityTargets(state, id).includes(target)) return { ok: false, error: 'Cible invalide.' };

  let message;
  if (id === 'surge') {
    const ts = state.territories[target];
    const cap = Math.max(state.crisisCapHighWater || 0, ts.crisis);
    ts.crisis = Math.min(cap, ts.crisis + CFG.surge.crisisGain);
    message = `Sursaut à ${getTerritory(target).name} : la crise s’emballe.`;
  } else if (id === 'jam') {
    state.jams = { ...(state.jams || {}), [target]: state.day + CFG.jam.durationDays };
    message = `Brouillage à ${getTerritory(target).name} : la conscience est figée ${CFG.jam.durationDays} jours.`;
  } else {
    openRoute(state, target);
    state.routeShields = { ...(state.routeShields || {}), [target]: state.day + CFG.breach.shieldDays };
    const [a, b] = parseRouteKey(target);
    message = `Percée : la route ${getTerritory(a).name} – ${getTerritory(b).name} est rouverte.`;
  }
  state.influence -= ability.cost;
  state.abilityCooldowns = { ...(state.abilityCooldowns || {}), [id]: state.day + ability.cooldownDays };
  state.abilityUses = (state.abilityUses || 0) + 1;
  pushLog(state, message);
  return { ok: true, error: null, message };
}
