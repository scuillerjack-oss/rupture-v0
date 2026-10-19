import { TERRITORIES, getTerritory } from './territories.js';
import { adjacency, pushLog, createV7Fields, defaultFeatures } from './state.js';
import { BALANCE, upgradeCost, tensionAt, responsePhaseAt, dangerosityCapAt, responseCapAt } from './balance.js';
import { nextRandom } from './rng.js';
import { strainMod } from './strains.js';
import { tickBubbles, splitIncome } from './bubbles.js';
import { maybeTriggerEvent, eventMod } from './events.js';
import { routeKey } from './routes.js';
import { starsFor } from './meta.js';

export { collectBubble } from './bubbles.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const UPGRADE_KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];

// V7 : complète un état d'une forme plus ancienne (état construit à la main,
// sauvegarde partiellement migrée) sans jamais écraser un champ présent.
export function ensureV7Fields(state) {
  if (state.features && Array.isArray(state.bubbles) && state.stall && state.abilityCooldowns && state.eventMods) return;
  const defaults = createV7Fields(state.day || 0);
  for (const [key, value] of Object.entries(defaults)) {
    if (state[key] === undefined) state[key] = value;
  }
  state.features = { ...defaultFeatures(), ...(state.features || {}) };
}

// V7 : niveau EFFECTIF d'une branche, après adaptation de l'Humanité (la
// branche visée perd une part de son effet tant que l'adaptation dure).
export function effectiveLevel(state, kind) {
  const level = state.upgrades[kind] || 0;
  const a = state.adaptation;
  if (a && a.branch === kind && state.day < a.untilDay) return level * a.factor;
  return level;
}

// V7 : à chaque nouvelle phase de Réponse, la branche la plus développée perd
// 25 % d'effet pendant 60 jours - diversifier devient payant.
function applyAdaptation(state) {
  let best = null;
  for (const kind of UPGRADE_KINDS) {
    const level = state.upgrades[kind] || 0;
    if (level > 0 && (!best || level > state.upgrades[best])) best = kind;
  }
  if (!best) return;
  const { factor, durationDays } = BALANCE.adaptation;
  state.adaptation = { branch: best, factor, untilDay: state.day + durationDays };
  const label = BALANCE.upgrades[best].label;
  pushLog(state, `L'Humanité s'adapte : ${label} perd ${Math.round((1 - factor) * 100)} % d'effet pendant ${durationDays} jours.`);
}

function isRouteShielded(state, a, b) {
  const until = state.routeShields?.[routeKey(a, b)];
  return typeof until === 'number' && state.day < until;
}

function isJammed(state, id) {
  const until = state.jams?.[id];
  return typeof until === 'number' && state.day < until;
}

export function simulateTick(state) {
  if (state.status !== 'playing') return;
  ensureV7Fields(state);
  // V7 : un événement à choix met la partie en pause (voir events.js).
  if (state.pendingEvent) return;
  const features = state.features;

  const snapshot = {};
  for (const t of TERRITORIES) snapshot[t.id] = state.territories[t.id].crisis;

  const tension = tensionAt(state.day, state.globalAwareness);
  const propagationEffect = effectiveLevel(state, 'propagation') * BALANCE.upgrades.propagation.effectPerLevel;
  const resilienceEffect = clamp(effectiveLevel(state, 'resilience') * BALANCE.upgrades.resilience.effectPerLevel, 0, 0.8);
  const discretionEffect = clamp(effectiveLevel(state, 'discretion') * BALANCE.upgrades.discretion.effectPerLevel, 0, 0.8);
  const dangerosityEffect = effectiveLevel(state, 'dangerosity') * BALANCE.upgrades.dangerosity.effectPerLevel;
  // V7 : multiplicateurs de souche (strains.js) et d'événements temporaires (events.js).
  const growthMod = strainMod(state, 'growth') * eventMod(state, 'growth');
  const spreadMod = strainMod(state, 'spread') * eventMod(state, 'spread');
  const awarenessMod = strainMod(state, 'awareness') * eventMod(state, 'awareness');
  const dangerosityBleedMod = strainMod(state, 'dangerosityBleed');
  const routeCloseMod = eventMod(state, 'routeClose');

  // L'Humanité ne se contente plus de ralentir la croissance de l'Anomalie :
  // une fois sa mobilisation sérieusement engagée, elle referme aussi le
  // plafond de gravité que Dangerosité avait ouvert. `state.globalMobilization`
  // reflète l'état AVANT ce tick (il n'est recalculé qu'après la boucle) :
  // léger décalage d'un tick, sans effet observable.
  //
  // V4.1 (§2) : `globalMobilization` est un accumulateur interne distinct de
  // `globalContainment` (la Réponse mondiale affichée au joueur et seule
  // condition de défaite - voir plus bas, désormais plafonnée par la
  // Conscience). Une première version faisait dépendre CE mécanisme de
  // suppression locale directement de la Conscience courante plutôt que de
  // cet accumulateur : la Conscience seule monte trop lentement pour
  // reproduire la pression de suppression déjà validée en V3.1/V4 - mesuré :
  // 18/18 victoires pour pratiquement toute stratégie, y compris des
  // stratégies jusque-là perdantes, quels que soient mobilizationThreshold,
  // maxSuppressionPerTick ou même l'économie entière retestée jusqu'aux
  // réglages V3.1 d'origine. Conserver cet accumulateur (formule inchangée
  // depuis V3.1) préserve intégralement la pression de suppression déjà
  // calibrée, tandis que le nouveau plafond ci-dessous ne change QUE ce qui
  // déclenche la défaite - une correction chirurgicale plutôt qu'une
  // renégociation de tout l'équilibrage.
  //
  // Modélisée comme une réduction du plafond plutôt qu'une érosion
  // proportionnelle de la crise déjà acquise : une érosion proportionnelle
  // ne converge jamais exactement vers un palier (elle s'en approche sans
  // jamais l'atteindre). Une Résilience investie jusqu'à
  // humanity.resilienceImmunityLevel neutralise entièrement CE resserrement
  // spécifique. Les autres usages de la Résilience (croissance locale,
  // amortissement de la propagation entrante) restent plafonnés à 80% comme
  // avant : cette neutralisation complète est spécifique à la mobilisation.
  const resilienceEffectForSuppression = clamp(
    effectiveLevel(state, 'resilience') / BALANCE.humanity.resilienceImmunityLevel,
    0,
    1
  );
  const mobilizationThreshold = BALANCE.humanity.mobilizationThreshold;
  // Cible INSTANTANÉE de la pression de suppression, dérivée de
  // globalMobilization (état avant ce tick, même convention que le reste de
  // cette fonction). `state.suppressionPressure` (mis à jour en bas de
  // cette fonction) la RATTRAPE avec inertie plutôt que de la refléter tout
  // de suite - voir BALANCE.humanity.suppressionInertiaRate.
  const mobilizationProgress = clamp(
    (state.globalMobilization - mobilizationThreshold) / (100 - mobilizationThreshold),
    0,
    1
  );
  const suppressionRate =
    BALANCE.humanity.maxSuppressionPerTick * state.suppressionPressure * (1 - resilienceEffectForSuppression) * tension;
  // Plafond de crise partagé par tous les territoires ce tick : d'abord fixé
  // par la Dangerosité (dangerosityCapAt), puis resserré par la Réponse
  // mondiale mobilisée - jamais annulé (voir suppressionRate), la Résilience
  // atténuant ce resserrement sans jamais l'annuler complètement.
  const dangerosityCap = dangerosityCapAt(effectiveLevel(state, 'dangerosity'));
  const instantCrisisCap = dangerosityCap * (1 - suppressionRate);
  // V5.2 : plafond effectif à cliquet - ne redescend jamais une fois monté
  // (voir state.js/migrations.js pour son historique). crisisCap est une
  // grandeur GLOBALE (aucune de ses composantes n'est spécifique à un
  // territoire), donc un seul cliquet suffit pour tous. Corrige un vrai
  // écart entre l'intention documentée depuis V3.1 ("une réduction du
  // plafond, jamais une érosion de la crise déjà acquise") et le
  // comportement réel observé (Math.min seul reprenait quand même de la
  // crise déjà gagnée dès que la mobilisation continuait de progresser après
  // coup). Limite honnête documentée dans le rapport V5.2 : ce cliquet
  // protège aussi les gains obtenus AVANT que la mobilisation ne soit
  // réellement engagée (suppressionRate encore nul) - une implantation qui
  // atteint son plafond de Dangerosité pendant cette fenêtre voit ce gain
  // protégé pour le reste de la partie, ce qui réduit la marge que la
  // Résilience peut encore reprendre UNE FOIS cette fenêtre passée pour ce
  // cas précis (voir le rapport pour la mesure et l'explication complètes).
  state.crisisCapHighWater = Math.max(state.crisisCapHighWater, instantCrisisCap);
  const crisisCap = state.crisisCapHighWater;

  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    const currentCrisis = snapshot[t.id];

    let growth = 0;
    if (currentCrisis > 0) {
      const containmentFactor = 1 - (ts.containment / BALANCE.containmentDamping) * (1 - resilienceEffect);
      growth = BALANCE.baseGrowthPerTick * Math.max(containmentFactor, 0.15) * tension * growthMod;
    }

    let spreadIn = 0;
    for (const neighborId of adjacency.get(t.id)) {
      const neighborCrisis = snapshot[neighborId];
      if (neighborCrisis < BALANCE.spreadThreshold) continue;
      const spreadRate = BALANCE.baseSpreadPerTick * (1 + propagationEffect) * tension * spreadMod;
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

    // V7 : « mur des 93 % » adouci. Tant que le plafond de gravité n'est pas
    // complètement ouvert, la montée ralentit progressivement en approchant
    // du plafond au lieu de buter d'un coup (et progressBlockers l'explique).
    if (features.softCap && crisisCap < 100) {
      const { softZone, softFloor } = BALANCE.severity;
      const room = crisisCap - currentCrisis;
      if (room < softZone) {
        const slow = clamp(room / softZone, softFloor, 1);
        growth *= slow;
        spreadIn *= slow;
      }
    }
    let newCrisis = clamp(currentCrisis + growth + spreadIn, 0, 100);
    // Sans Dangerosité, un territoire peut être largement atteint (la
    // Propagation continue de fonctionner normalement, spreadThreshold=15
    // reste bien en dessous du plafond) mais jamais réellement grave : sa
    // crise ne peut pas dépasser crisisCap (Active, jamais Sévère/Critique -
    // resserré au fil de la mobilisation de l'Humanité, voir plus haut).
    // crisisCap est désormais un plafond à cliquet (jamais redescendu, voir
    // sa définition plus haut) : un Math.min simple suffit ici, il ne peut
    // plus jamais reprendre de la crise déjà acquise.
    newCrisis = Math.min(newCrisis, crisisCap);

    // Propagation ET Dangerosité rendent l'Anomalie plus visible ; une
    // Anomalie rendue dangereuse est bien plus alarmante qu'une Anomalie
    // simplement répandue (dangerosityAwarenessBleed > propagationAwarenessBleed).
    const awarenessRate =
      BALANCE.awarenessCatchupRate *
      (1 + propagationEffect * BALANCE.propagationAwarenessBleed + dangerosityEffect * BALANCE.dangerosityAwarenessBleed * dangerosityBleedMod) *
      (1 - discretionEffect) *
      awarenessMod;
    // V7 : « Brouillage » (abilities.js) fige la Conscience locale.
    if (!isJammed(state, t.id)) {
      ts.awareness = clamp(ts.awareness + (newCrisis - ts.awareness) * awarenessRate * tension, 0, 100);
    }
    ts.containment = clamp(ts.containment + (ts.awareness * 0.6 - ts.containment) * 0.05 * tension, 0, 100);

    if (ts.awareness > BALANCE.routeCloseAwarenessThreshold) {
      for (const neighborId of adjacency.get(t.id)) {
        if (ts.closedRoutes.includes(neighborId)) continue;
        // V7 : une route rouverte par « Percée » reste protégée un temps.
        if (isRouteShielded(state, t.id, neighborId)) continue;
        const chance = BALANCE.routeCloseCheckChance * (1 - discretionEffect) * tension * routeCloseMod;
        // V7 : tirage à graine (rng.js) au lieu de Math.random. La projection
        // de course (forecast.js) coupe ce hasard (__noRandom) : aucune fermeture.
        const roll = state.__noRandom ? 1 : nextRandom(state);
        if (roll < chance) {
          ts.closedRoutes.push(neighborId);
          const neighborName = getTerritory(neighborId)?.name ?? neighborId;
          pushLog(state, `${t.name} ferme sa frontière avec ${neighborName}.`);
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
  if (state.dominance > state.maxDominance) state.maxDominance = state.dominance;

  const containmentGainFactor =
    (state.rules?.globalContainmentGainFactor ?? BALANCE.globalContainmentGainFactor) * eventMod(state, 'response');
  // V4.1 (§2) : la Réponse mondiale progresse toujours à une vitesse
  // proportionnelle à la Conscience moyenne actuelle (awarenessFraction*100),
  // mais ne peut plus JAMAIS dépasser responseCapAt(awarenessFraction) - le
  // même principe que le plafond de gravité par région (dangerosityCapAt),
  // appliqué cette fois à la capacité de l'Humanité à mener sa Réponse à
  // terme plutôt qu'à seulement la déclencher. Sans ce plafond, un
  // accumulateur strictement croissant finit toujours par atteindre 100 avec
  // assez de temps, même alimenté par une Conscience qui plafonne loin en
  // dessous de 100% - c'est exactement l'incohérence ressentie en bêta V4
  // (défaite par Réponse à 100% alors que le monde n'avait jamais pleinement
  // compris la menace).
  const awarenessFraction = clamp(awarenessSum / TERRITORIES.length / 100, 0, 1);
  // Conscience mondiale : progresse librement, sans plafond. Sert de base au
  // plafond de la Réponse ci-dessous, et reste affichée telle quelle au
  // joueur (Vue Monde) comme mesure distincte de la Réponse.
  state.globalAwareness = awarenessFraction * 100;

  // Accumulateur interne (formule héritée de V3.1/V4, volontairement
  // inchangée - voir le commentaire en haut de tick) : lisse la transition
  // "conscience faible -> réaction sérieuse" via responseCurvePower, sans
  // plafond propre à cette étape (seul le 0-100 final le borne). C'est cet
  // accumulateur, jamais la Conscience brute, qui alimente la pression de
  // suppression locale (mobilizationProgress, en haut de tick).
  const shapedAwareness = Math.pow(awarenessFraction, BALANCE.humanity.responseCurvePower) * 100;
  state.globalMobilization = clamp(
    state.globalMobilization + shapedAwareness * containmentGainFactor * tension,
    0,
    100
  );

  // V5.2 : la pression de suppression EFFECTIVE rattrape mobilizationProgress
  // (calculé en haut de tick, avant la mise à jour ci-dessus) avec inertie -
  // même mécanique que ts.containment qui rattrape ts.awareness (voir plus
  // haut) - plutôt que de le refléter instantanément. C'est cette valeur,
  // pas mobilizationProgress brut, qui gouverne suppressionRate (voir le
  // calcul de crisisCap en haut de tick, au tick SUIVANT).
  state.suppressionPressure = clamp(
    state.suppressionPressure + (mobilizationProgress - state.suppressionPressure) * BALANCE.humanity.suppressionInertiaRate * tension,
    0,
    1
  );

  // V4.1 (§2) : la Réponse mondiale AFFICHÉE - et seule condition de défaite -
  // ne peut plus jamais dépasser responseCapAt(awarenessFraction), même si
  // l'accumulateur interne (ci-dessus) continue de progresser au-delà : le
  // même principe que le plafond de gravité par région (dangerosityCapAt),
  // appliqué cette fois à la capacité de l'Humanité à mener sa Réponse à
  // terme plutôt qu'à seulement la déclencher. Sans ce plafond, un
  // accumulateur strictement croissant finit toujours par atteindre 100 avec
  // assez de temps, même alimenté par une Conscience qui plafonne loin en
  // dessous de 100% - c'est exactement l'incohérence ressentie en bêta V4
  // (défaite par Réponse à 100% alors que le monde n'avait jamais pleinement
  // compris la menace). La Réponse affichée ne redescend jamais (voir le
  // test dédié) : si le plafond baisse sous la valeur déjà acquise (la
  // Conscience moyenne peut légèrement refluer), la nouvelle croissance est
  // simplement nulle, jamais un recul de l'acquis.
  // V7 : les bulles « recherche » touchées (bubbles.js) retirent des points
  // de Réponse ; une dette (responseDebt) qui se résorbe lentement empêche de
  // les regagner dès le tick suivant quand le plafond est la contrainte active.
  const responseDebt = Math.max(0, state.responseDebt || 0);
  const responseCap = responseCapAt(awarenessFraction);
  const grown = Math.min(state.globalMobilization, responseCap) - responseDebt;
  state.globalContainment = clamp(Math.max(state.globalContainment, grown), 0, 100);
  if (responseDebt > 0) state.responseDebt = responseDebt * (1 - BALANCE.bubbles.researchDebtDecay);

  // Journal : uniquement les transitions de phase de la Réponse mondiale
  // (détection initiale comprise) plutôt qu'un événement par tick ou par
  // achat — voir buyUpgrade, qui ne journalise plus rien.
  const phase = responsePhaseAt(state.globalContainment);
  if (phase.key !== state.responsePhase) {
    state.responsePhase = phase.key;
    if (phase.key !== 'ignorance') {
      pushLog(state, `Réponse mondiale : nouvelle phase — ${phase.label}.`);
      state.phaseLog.push({ day: state.day, key: phase.key, label: phase.label });
      if (features.adaptation) applyAdaptation(state);
    }
  }
  if (state.adaptation && state.day >= state.adaptation.untilDay) state.adaptation = null;
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
  const incomeFactor = (1 - discretionEffect * BALANCE.discretionIncomePenalty) * strainMod(state, 'income') * eventMod(state, 'income');
  const income = influenceGain * BALANCE.influenceGainFactor * incomeFactor + earlyTrickle;
  // V7 : une part du revenu passif alimente les bulles à toucher (bubbles.js) ;
  // le reste tombe directement dans la réserve, comme en V6.
  const direct = features.bubbles ? splitIncome(state, income) : income;
  // Influence cannot be hoarded indefinitely: past the cap it dissipates unused. This is
  // what actually stops the "ignore the game for 500 days, then dump it all at once" pattern -
  // a lump purchase no longer buys as much as steady spending would have over the same span.
  state.influence = clamp(state.influence + direct, 0, BALANCE.influenceCap);
  state.day += 1;

  if (features.bubbles) tickBubbles(state);

  const rupture = state.dominance >= BALANCE.victoryDominanceThreshold;
  const control = state.globalContainment >= BALANCE.defeatContainmentThreshold;
  if (rupture && control) {
    // V7 : égalité au même tick, tranchée clairement en faveur de la Rupture
    // (même résultat qu'en V6, où la Progression était testée en premier),
    // désormais nommée et expliquée au joueur.
    endGame(state, 'victory', 'tie', 'dominance',
      'Égalité le même jour : la Rupture est atteinte au moment où la Réponse conclut. À égalité, l’Anomalie l’emporte. Victoire de justesse.');
  } else if (rupture) {
    endGame(state, 'victory', 'rupture', 'dominance',
      `Progression mondiale de l'Anomalie complète (${state.dominance.toFixed(0)}% ≥ ${BALANCE.victoryDominanceThreshold}%). Victoire.`);
  } else if (control) {
    endGame(state, 'defeat', 'control', 'containment', 'La Réponse mondiale a atteint la maîtrise complète avant votre victoire. Défaite.');
  } else if (state.day >= BALANCE.maxDays) {
    endGame(state, 'defeat', 'stalled', 'timeout', `Aucun camp n'a percé en ${BALANCE.maxDays} jours. Le monde reprend le contrôle par défaut.`);
  } else if (features.stall && checkStalled(state)) {
    const days = state.day - state.stall.sinceDay;
    endGame(state, 'defeat', 'stalled', 'stalled',
      `La course est jouée : aucune progression depuis ${days} jours et la Réponse mondiale domine (${Math.round(state.globalContainment)} % contre ${Math.round(state.dominance)} % de Progression). Défaite anticipée.`);
  }

  // V7 : un imprévu tous les 30-45 jours (events.js), seulement si la partie continue.
  if (state.status === 'playing' && features.events) maybeTriggerEvent(state);
}

// V7 : la partie est-elle figée ? Plus de progression depuis stall.days jours
// ET Réponse mondiale devant la Progression : la course est jouée (défaite
// anticipée expliquée au lieu de minutes d'attente). Sans aucune progression
// pendant deux fois ce délai, la partie est figée quoi qu'il arrive (Réponse
// bloquée par une Conscience trop basse : V6 attendait le jour 2200).
function checkStalled(state) {
  const { days, epsilon } = BALANCE.stall;
  if (state.dominance > state.stall.bestDominance + epsilon) {
    state.stall.bestDominance = state.dominance;
    state.stall.sinceDay = state.day;
    return false;
  }
  const idle = state.day - state.stall.sinceDay;
  if (idle >= days && state.globalContainment >= state.dominance) return true;
  return idle >= days * 2;
}

function endGame(state, result, reason, endReason, message) {
  state.status = result;
  state.endReason = endReason;
  state.outcome = { result, reason, day: state.day, stars: 0, text: message };
  state.outcome.stars = starsFor(state);
  state.pendingEvent = null;
  state.bubbles = [];
  pushLog(state, message);
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

export { ABILITIES, abilityStatus, abilityTargets, useAbility } from './abilities.js';
export { EVENTS, chooseEventOption } from './events.js';
export { forecastRace, progressBlockers } from './forecast.js';
export { STRAINS } from './strains.js';
export { dailySeed } from './rng.js';
