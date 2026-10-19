import { BALANCE, dangerosityCapAt } from './balance.js';
import { simulateTick } from './simulation.js';
import { closedRouteKeys } from './routes.js';

// V7 : projection de la course, pour l'affichage seulement.
// Rejoue la suite de la partie sur une COPIE de l'état, sans hasard
// (__noRandom : aucune fermeture de route), sans événement ni bulle (revenu
// intégral, comme un joueur qui toucherait ~70 % des bulles), sans nouvel
// achat : « si tu ne fais plus rien, voilà où va la course ». N'altère jamais
// `state`. Renvoie le jour (absolu) où chaque camp conclurait, ou null s'il
// ne conclut pas dans l'horizon.
export const FORECAST_HORIZON_DAYS = 700;

function cloneState(state) {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

export function forecastRace(state, horizon = FORECAST_HORIZON_DAYS) {
  try {
    if (!state || state.status !== 'playing' || !state.territories) return { ruptureDay: null, controlDay: null };
    const copy = cloneState(state);
    copy.__noRandom = true;
    copy.pendingEvent = null;
    copy.features = { ...(copy.features || {}), bubbles: false, events: false, stall: false };
    copy.bubbles = [];
    copy.log = [];
    let ruptureDay = null;
    let controlDay = null;
    const endDay = Math.min(BALANCE.maxDays, (copy.day || 0) + horizon);
    while (copy.day < endDay && (ruptureDay === null || controlDay === null)) {
      simulateTick(copy);
      if (ruptureDay === null && copy.dominance >= BALANCE.victoryDominanceThreshold) ruptureDay = copy.day;
      if (controlDay === null && copy.globalContainment >= BALANCE.defeatContainmentThreshold) controlDay = copy.day;
      if (copy.status !== 'playing') {
        // On continue la course au-delà de la première arrivée : les deux
        // camps reçoivent une date (l'interface compare).
        copy.status = 'playing';
        copy.outcome = null;
        if (copy.day >= BALANCE.maxDays) break;
      }
    }
    return { ruptureDay, controlDay };
  } catch (e) {
    return { ruptureDay: null, controlDay: null };
  }
}

// V7 : ce qui empêche la Progression d'avancer, en clair. Remplace le « mur
// invisible des 93 % » : le joueur sait toujours ce qui le bloque.
export function progressBlockers(state) {
  const out = [];
  if (!state || !state.territories || !state.upgrades) return out;
  const { fullSeverityLevel, softZone } = BALANCE.severity;
  const danger = state.upgrades.dangerosity || 0;
  const cap = Math.max(state.crisisCapHighWater || 0, dangerosityCapAt(danger));
  let maxCrisis = 0;
  for (const ts of Object.values(state.territories)) maxCrisis = Math.max(maxCrisis, ts.crisis || 0);
  if (cap < 100 && maxCrisis >= cap - softZone) {
    out.push({
      kind: 'gravity-cap',
      text: `Gravité plafonnée : Dangerosité ${fullSeverityLevel} requise`,
      cap: Math.round(cap),
      requiredLevel: fullSeverityLevel
    });
  }
  const immunity = BALANCE.humanity.resilienceImmunityLevel;
  if ((state.suppressionPressure || 0) > 0.05 && (state.upgrades.resilience || 0) < immunity) {
    out.push({ kind: 'suppression', text: `La Réponse resserre la gravité : Résilience ${immunity} la neutralise` });
  }
  const a = state.adaptation;
  if (a && state.day < a.untilDay) {
    const label = BALANCE.upgrades[a.branch]?.label ?? a.branch;
    out.push({
      kind: 'adaptation',
      text: `L’Humanité s’adapte : ${label} −${Math.round((1 - a.factor) * 100)} % encore ${a.untilDay - state.day} jours`
    });
  }
  const closed = closedRouteKeys(state).length;
  if (closed >= 3) {
    out.push({ kind: 'routes', text: `${closed} routes fermées : la Percée peut en rouvrir une` });
  }
  const stall = state.stall;
  if (stall && state.features?.stall !== false) {
    const idle = (state.day || 0) - (stall.sinceDay || 0);
    if (idle >= BALANCE.stall.days / 2) {
      out.push({ kind: 'stall', text: `Plus aucune progression depuis ${idle} jours : la partie risque d’être perdue d’avance` });
    }
  }
  return out;
}
