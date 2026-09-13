import { TERRITORIES } from './territories.js';
import { adjacency, pushLog } from './state.js';
import { BALANCE, upgradeCost, tensionAt, responsePhaseAt, dangerosityCapAt } from './balance.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function simulateTick(state) {
  if (state.status !== 'playing') return;

  const snapshot = {};
  for (const t of TERRITORIES) snapshot[t.id] = state.territories[t.id].crisis;

  const tension = tensionAt(state.day);
  const propagationEffect = state.upgrades.propagation * BALANCE.upgrades.propagation.effectPerLevel;
  const resilienceEffect = clamp(state.upgrades.resilience * BALANCE.upgrades.resilience.effectPerLevel, 0, 0.8);
  const discretionEffect = clamp(state.upgrades.discretion * BALANCE.upgrades.discretion.effectPerLevel, 0, 0.8);
  const dangerosityEffect = state.upgrades.dangerosity * BALANCE.upgrades.dangerosity.effectPerLevel;

  // L'Humanité ne se contente plus de ralentir la croissance de l'Anomalie :
  // une fois sa Réponse mondiale sérieusement engagée, elle referme aussi le
  // plafond de gravité que Dangerosité avait ouvert. `state.globalContainment`
  // reflète l'état AVANT ce tick (il n'est recalculé qu'après la boucle,
  // comme en V2) : léger décalage d'un tick, sans effet observable, déjà le
  // cas pour awareness/containment.
  //
  // Modélisée comme une réduction du plafond plutôt qu'une érosion
  // proportionnelle de la crise déjà acquise : une érosion proportionnelle
  // ne converge jamais exactement vers un palier (elle s'en approche sans
  // jamais l'atteindre). Le seuil de mobilisation (15%) est franchi tôt dans
  // quasiment toute partie sérieuse et ne redescend jamais : une victoire par
  // Progression resterait donc mathématiquement impossible dès la
  // mobilisation, quel que soit l'investissement du joueur, si rien ne
  // pouvait un jour ramener ce resserrement à zéro. Une Résilience investie
  // jusqu'à humanity.resilienceImmunityLevel neutralise donc entièrement CE
  // resserrement spécifique. Les autres usages de la Résilience (croissance
  // locale, amortissement de la propagation entrante) restent plafonnés à
  // 80% comme avant : cette neutralisation complète est spécifique à la
  // mobilisation.
  const resilienceEffectForSuppression = clamp(
    state.upgrades.resilience / BALANCE.humanity.resilienceImmunityLevel,
    0,
    1
  );
  const mobilizationThreshold = BALANCE.humanity.mobilizationThreshold;
  const mobilizationProgress = clamp(
    (state.globalContainment - mobilizationThreshold) / (100 - mobilizationThreshold),
    0,
    1
  );
  const suppressionRate =
    BALANCE.humanity.maxSuppressionPerTick * mobilizationProgress * (1 - resilienceEffectForSuppression) * tension;
  // Plafond de crise partagé par tous les territoires ce tick : d'abord fixé
  // par la Dangerosité (dangerosityCapAt), puis resserré par la Réponse
  // mondiale mobilisée - jamais annulé (voir suppressionRate), la Résilience
  // atténuant ce resserrement sans jamais l'annuler complètement.
  const crisisCap = dangerosityCapAt(state.upgrades.dangerosity) * (1 - suppressionRate);

  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    const currentCrisis = snapshot[t.id];

    let growth = 0;
    if (currentCrisis > 0) {
      const containmentFactor = 1 - (ts.containment / BALANCE.containmentDamping) * (1 - resilienceEffect);
      growth = BALANCE.baseGrowthPerTick * Math.max(containmentFactor, 0.15) * tension;
    }

    let spreadIn = 0;
    for (const neighborId of adjacency.get(t.id)) {
      const neighborCrisis = snapshot[neighborId];
      if (neighborCrisis < BALANCE.spreadThreshold) continue;
      const spreadRate = BALANCE.baseSpreadPerTick * (1 + propagationEffect) * tension;
      const isClosed = ts.closedRoutes.includes(neighborId);
      // A closed route mostly blocks the anomaly, but enough Résilience lets it
      // partially force its way through anyway (resisting the containment measure
      // itself, not just its local effects).
      const routeFactor = isClosed ? resilienceEffect * 0.6 : 1;
      spreadIn += spreadRate * (neighborCrisis / 100) * routeFactor;
    }
    const incomingDamping = Math.max(
      1 - (ts.containment / BALANCE.incomingSpreadContainmentDamping) * (1 - resilienceEffect),
      0.2
    );
    spreadIn *= incomingDamping;

    let newCrisis = clamp(currentCrisis + growth + spreadIn, 0, 100);
    // Sans Dangerosité, un territoire peut être largement atteint (la
    // Propagation continue de fonctionner normalement, spreadThreshold=15
    // reste bien en dessous du plafond) mais jamais réellement grave : sa
    // crise ne peut pas dépasser crisisCap (Active, jamais Sévère/Critique -
    // resserré au fil de la mobilisation de l'Humanité, voir plus haut).
    newCrisis = Math.min(newCrisis, crisisCap);

    // Propagation ET Dangerosité rendent l'Anomalie plus visible ; une
    // Anomalie rendue dangereuse est bien plus alarmante qu'une Anomalie
    // simplement répandue (dangerosityAwarenessBleed > propagationAwarenessBleed).
    const awarenessRate =
      BALANCE.awarenessCatchupRate *
      (1 + propagationEffect * BALANCE.propagationAwarenessBleed + dangerosityEffect * BALANCE.dangerosityAwarenessBleed) *
      (1 - discretionEffect);
    ts.awareness = clamp(ts.awareness + (newCrisis - ts.awareness) * awarenessRate * tension, 0, 100);
    ts.containment = clamp(ts.containment + (ts.awareness * 0.6 - ts.containment) * 0.05 * tension, 0, 100);

    if (ts.awareness > BALANCE.routeCloseAwarenessThreshold) {
      for (const neighborId of adjacency.get(t.id)) {
        if (ts.closedRoutes.includes(neighborId)) continue;
        const chance = BALANCE.routeCloseCheckChance * (1 - discretionEffect) * tension;
        if (Math.random() < chance) {
          ts.closedRoutes.push(neighborId);
          pushLog(state, `${t.name} ferme sa frontière avec un territoire voisin.`);
        }
      }
    }

    ts.crisis = newCrisis;
  }

  let weightedCrisis = 0;
  let touchedPopulation = 0;
  let totalPopulation = 0;
  let awarenessSum = 0;
  let influenceGain = 0;

  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    weightedCrisis += ts.crisis * t.population;
    if (ts.crisis > 0) touchedPopulation += t.population;
    totalPopulation += t.population;
    awarenessSum += ts.awareness;
    influenceGain += (ts.crisis * t.population) / 100;
  }

  // "Portée" : quelle part de la population mondiale vit désormais dans une
  // région touchée, indépendamment de sa gravité réelle - gouvernée par
  // Propagation. Reste ouverte jusqu'à 100% même à Dangerosité 0.
  state.reach = clamp((touchedPopulation / totalPopulation) * 100, 0, 100);
  // "Progression" (ce qui compte pour la victoire) : gravité réelle moyenne,
  // pondérée par population. Chaque territoire étant plafonné par
  // crisisCap (voir plus haut), la Progression reste mathématiquement
  // toujours <= Portée, et ne peut approcher 100 qu'avec une Dangerosité
  // développée - gouvernée par Dangerosité.
  state.dominance = clamp(weightedCrisis / totalPopulation, 0, 100);

  const containmentGainFactor = state.rules?.globalContainmentGainFactor ?? BALANCE.globalContainmentGainFactor;
  // Lisse la transition "conscience faible -> réponse sérieuse" (voir
  // BALANCE.humanity.responseCurvePower) sans changer le danger final : à
  // conscience nulle ou totale, le résultat est inchangé (0^p=0, 1^p=1).
  const awarenessFraction = clamp(awarenessSum / TERRITORIES.length / 100, 0, 1);
  const shapedAwareness = Math.pow(awarenessFraction, BALANCE.humanity.responseCurvePower) * 100;
  state.globalContainment = clamp(
    state.globalContainment + shapedAwareness * containmentGainFactor * tension,
    0,
    100
  );

  // Journal : uniquement les transitions de phase de la Réponse mondiale
  // (détection initiale comprise) plutôt qu'un événement par tick ou par
  // achat — voir buyUpgrade, qui ne journalise plus rien.
  const phase = responsePhaseAt(state.globalContainment);
  if (phase.key !== state.responsePhase) {
    state.responsePhase = phase.key;
    if (phase.key !== 'ignorance') {
      pushLog(state, `Réponse mondiale : nouvelle phase — ${phase.label}.`);
    }
  }
  if (!state.dominanceMilestoneLogged && state.dominance >= 50) {
    state.dominanceMilestoneLogged = true;
    pushLog(state, 'L\'Anomalie franchit un seuil critique de progression mondiale.');
  }

  // Crisis-driven income alone is scaled by tension, which starts extremely low so the
  // opening feels calm - but that also starves the player of any real choice for a very
  // long stretch. A separate, tapering trickle covers exactly that gap: it matters early
  // (when tension is near its minimum) and fades itself out as the real crisis-driven
  // economy takes over (tension rising toward 1), so it never inflates the mid/late game.
  const earlyTrickle = BALANCE.earlyInfluenceTrickle * clamp(1 - tension, 0, 1);
  // Discretion trades away some of the Influence a hidden Anomaly could otherwise extract.
  const incomeFactor = 1 - discretionEffect * BALANCE.discretionIncomePenalty;
  // Influence cannot be hoarded indefinitely: past the cap it dissipates unused. This is
  // what actually stops the "ignore the game for 500 days, then dump it all at once" pattern -
  // a lump purchase no longer buys as much as steady spending would have over the same span.
  state.influence = clamp(
    state.influence + influenceGain * BALANCE.influenceGainFactor * incomeFactor + earlyTrickle,
    0,
    BALANCE.influenceCap
  );
  state.day += 1;

  if (state.dominance >= BALANCE.victoryDominanceThreshold) {
    state.status = 'victory';
    state.endReason = 'dominance';
    pushLog(
      state,
      `Progression mondiale de l'Anomalie complète (${state.dominance.toFixed(0)}% ≥ ${BALANCE.victoryDominanceThreshold}%). Victoire.`
    );
  } else if (state.globalContainment >= BALANCE.defeatContainmentThreshold) {
    state.status = 'defeat';
    state.endReason = 'containment';
    pushLog(state, 'La Réponse mondiale a atteint la maîtrise complète avant votre victoire. Défaite.');
  } else if (state.day >= BALANCE.maxDays) {
    state.status = 'defeat';
    state.endReason = 'timeout';
    pushLog(state, `Aucun camp n'a percé en ${BALANCE.maxDays} jours. Le monde reprend le contrôle par défaut.`);
  }
}

export function buyUpgrade(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  if (!cfg) return false;
  const level = state.upgrades[kind];
  if (level >= cfg.maxLevel) return false;
  const cost = upgradeCost(kind, level);
  if (state.influence < cost) return false;
  state.influence -= cost;
  state.upgrades[kind] = level + 1;
  return true;
}

export function selectTerritory(state, id) {
  state.selectedId = id;
}

export function setSpeed(state, speed) {
  state.speed = speed;
}
