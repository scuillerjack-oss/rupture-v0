import { TERRITORIES, getTerritory } from './territories.js';
import { BALANCE } from './balance.js';
import { adjacency, pushLog } from './state.js';
import { randomInt, pickOne } from './rng.js';
import { closeRoute, openRoute, routeKey } from './routes.js';

// V7 : événements à choix. Un imprévu tous les 30-45 jours, tiré à la graine
// selon la phase de la partie et l'état des régions. Tant qu'un événement est
// en attente (state.pendingEvent), simulateTick ne fait pas avancer le temps.
//
// Chaque événement : { id, phases, needs, title, text, options }.
//  - phases : 'early' (Réponse < 15), 'mid' (15-50), 'late' (>= 50).
//  - needs  : région ciblée - 'crisis' (touchée), 'aware' (consciente),
//    'clean' (pas encore touchée, voisine d'une région touchée),
//    'closed' (au moins une route fermée), ou null (monde entier).
//  - {region} dans les textes est remplacé par le nom de la région.
//  - effects (déclaratifs, appliqués par applyEffect) :
//    influence, crisis, awareness, awarenessAll, containment, response,
//    mod (multiplicateur temporaire), jam, openRoutes, closeRoutes, seed.

const PHASE_ALL = ['early', 'mid', 'late'];

export const EVENTS = [
  // --- Début de partie : l'Anomalie se cache encore ---
  {
    id: 'festival', phases: ['early'], needs: 'crisis',
    title: 'Grand festival',
    text: 'Des foules immenses convergent vers {region} pour le festival d’été. Personne ne regarde ce qui circule entre les gens.',
    options: [
      { id: 'a', label: 'Profiter de la foule', effectText: 'Crise +10 à {region}, conscience +6 à {region}.', effects: [{ type: 'crisis', amount: 10 }, { type: 'awareness', amount: 6 }] },
      { id: 'b', label: 'Rester discret', effectText: '+12 d’Influence.', effects: [{ type: 'influence', amount: 12 }] }
    ]
  },
  {
    id: 'sceptic-press', phases: ['early'], needs: null,
    title: 'Presse sceptique',
    text: 'Un éditorialiste en vue ridiculise les « rumeurs d’anomalie ». Le monde a envie de le croire.',
    options: [
      { id: 'a', label: 'Laisser la rumeur mourir', effectText: 'Conscience mondiale ralentie de 30 % pendant 40 jours.', effects: [{ type: 'mod', key: 'awareness', factor: 0.7, days: 40 }] },
      { id: 'b', label: 'Exploiter le désordre', effectText: '+18 d’Influence, mais conscience +3 partout.', effects: [{ type: 'influence', amount: 18 }, { type: 'awarenessAll', amount: 3 }] }
    ]
  },
  {
    id: 'cargo', phases: ['early', 'mid'], needs: 'clean',
    title: 'Cargo en retard',
    text: 'Un cargo bloqué au large repart enfin vers {region}, chargé de marchandises… et de passagers clandestins.',
    options: [
      { id: 'a', label: 'Monter à bord', effectText: 'L’Anomalie s’installe à {region} (crise 8).', effects: [{ type: 'seed', amount: 8 }] },
      { id: 'b', label: 'Laisser partir', effectText: '+10 d’Influence.', effects: [{ type: 'influence', amount: 10 }] }
    ]
  },
  {
    id: 'blackout', phases: ['early', 'mid'], needs: 'crisis',
    title: 'Panne géante',
    text: 'Une panne d’électricité plonge {region} dans le noir pendant trois jours. Les réseaux d’information sont coupés.',
    options: [
      { id: 'a', label: 'Brouiller les pistes', effectText: 'Conscience figée 20 jours à {region}.', effects: [{ type: 'jam', days: 20 }] },
      { id: 'b', label: 'Gagner du terrain', effectText: 'Crise +7 à {region}.', effects: [{ type: 'crisis', amount: 7 }] }
    ]
  },
  {
    id: 'whistle', phases: ['early'], needs: 'aware',
    title: 'Lanceur d’alerte',
    text: 'Une chercheuse de {region} publie des notes inquiétantes sur un forum confidentiel.',
    options: [
      { id: 'a', label: 'Noyer l’info', effectText: '−15 d’Influence, conscience −10 à {region}.', cost: 15, effects: [{ type: 'influence', amount: -15 }, { type: 'awareness', amount: -10 }] },
      { id: 'b', label: 'Ignorer', effectText: 'Conscience +8 à {region}.', effects: [{ type: 'awareness', amount: 8 }] }
    ]
  },
  {
    id: 'pilgrimage', phases: ['early', 'mid'], needs: 'crisis',
    title: 'Pèlerinage',
    text: 'Des milliers de pèlerins quittent {region} pour rentrer chez eux, dans toutes les directions.',
    options: [
      { id: 'a', label: 'Les suivre', effectText: 'Propagation +30 % pendant 30 jours.', effects: [{ type: 'mod', key: 'spread', factor: 1.3, days: 30 }] },
      { id: 'b', label: 'Rester sur place', effectText: 'Crise +6 à {region}.', effects: [{ type: 'crisis', amount: 6 }] }
    ]
  },
  {
    id: 'budget-cut', phases: ['early'], needs: null,
    title: 'Coupes budgétaires',
    text: 'Plusieurs pays réduisent le budget de leurs agences sanitaires. Le monde regarde ailleurs.',
    options: [
      { id: 'a', label: 'Avancer dans l’ombre', effectText: 'Réponse mondiale ralentie de 20 % pendant 45 jours.', effects: [{ type: 'mod', key: 'response', factor: 0.8, days: 45 }] },
      { id: 'b', label: 'Encaisser', effectText: '+15 d’Influence.', effects: [{ type: 'influence', amount: 15 }] }
    ]
  },
  {
    id: 'harvest', phases: ['early', 'mid'], needs: 'crisis',
    title: 'Mauvaise récolte',
    text: 'La sécheresse ruine les récoltes à {region}. La population, affaiblie, se déplace vers les villes.',
    options: [
      { id: 'a', label: 'Frapper fort', effectText: 'Croissance +20 % pendant 30 jours, conscience +4 partout.', effects: [{ type: 'mod', key: 'growth', factor: 1.2, days: 30 }, { type: 'awarenessAll', amount: 4 }] },
      { id: 'b', label: 'Profiter discrètement', effectText: 'Crise +5 à {region}, +6 d’Influence.', effects: [{ type: 'crisis', amount: 5 }, { type: 'influence', amount: 6 }] }
    ]
  },
  {
    id: 'summit', phases: ['early', 'mid'], needs: null,
    title: 'Sommet international',
    text: 'Les dirigeants du monde se réunissent. L’Anomalie est inscrite, tout en bas, à l’ordre du jour.',
    options: [
      { id: 'a', label: 'Saboter les discussions', effectText: '−20 d’Influence, Réponse −3.', cost: 20, effects: [{ type: 'influence', amount: -20 }, { type: 'response', amount: -3 }] },
      { id: 'b', label: 'Laisser faire', effectText: 'Réponse +2, mais +10 d’Influence.', effects: [{ type: 'response', amount: 2 }, { type: 'influence', amount: 10 }] }
    ]
  },
  {
    id: 'smugglers', phases: PHASE_ALL, needs: 'closed',
    title: 'Contrebandiers',
    text: 'Un réseau de contrebandiers propose de faire passer « n’importe quoi » à travers la frontière de {region}.',
    options: [
      { id: 'a', label: 'Payer le passage', effectText: '−15 d’Influence : les routes de {region} rouvrent.', cost: 15, effects: [{ type: 'influence', amount: -15 }, { type: 'openRoutes' }] },
      { id: 'b', label: 'Refuser', effectText: '+8 d’Influence.', effects: [{ type: 'influence', amount: 8 }] }
    ]
  },
  // --- Milieu de partie : le monde se mobilise ---
  {
    id: 'lab-leak', phases: ['mid'], needs: 'aware',
    title: 'Fuite de laboratoire',
    text: 'Un laboratoire de {region} perd des échantillons de recherche dans un incendie.',
    options: [
      { id: 'a', label: 'Attiser l’incendie', effectText: 'Réponse −4, crise +6 à {region}.', effects: [{ type: 'response', amount: -4 }, { type: 'crisis', amount: 6 }] },
      { id: 'b', label: 'Faire diversion', effectText: 'Conscience −8 à {region}.', effects: [{ type: 'awareness', amount: -8 }] }
    ]
  },
  {
    id: 'quarantine', phases: ['mid', 'late'], needs: 'crisis',
    title: 'Quarantaine stricte',
    text: '{region} annonce une quarantaine stricte : plus personne n’entre ni ne sort.',
    options: [
      { id: 'a', label: 'Forcer les barrages', effectText: '−20 d’Influence : les routes de {region} restent ouvertes.', cost: 20, effects: [{ type: 'influence', amount: -20 }, { type: 'openRoutes' }] },
      { id: 'b', label: 'Se replier', effectText: 'Les routes de {region} ferment, crise +8 à l’intérieur.', effects: [{ type: 'closeRoutes' }, { type: 'crisis', amount: 8 }] }
    ]
  },
  {
    id: 'vaccine-rumor', phases: ['mid', 'late'], needs: null,
    title: 'Rumeur de remède',
    text: 'Une rumeur annonce un remède miracle. Les foules se ruent dans les pharmacies… et les unes des journaux.',
    options: [
      { id: 'a', label: 'Amplifier la rumeur', effectText: 'Réponse ralentie de 25 % pendant 30 jours, conscience +4 partout.', effects: [{ type: 'mod', key: 'response', factor: 0.75, days: 30 }, { type: 'awarenessAll', amount: 4 }] },
      { id: 'b', label: 'Laisser s’éteindre', effectText: '+14 d’Influence.', effects: [{ type: 'influence', amount: 14 }] }
    ]
  },
  {
    id: 'strike', phases: ['mid'], needs: 'aware',
    title: 'Grève des soignants',
    text: 'Épuisés, les soignants de {region} se mettent en grève.',
    options: [
      { id: 'a', label: 'En profiter', effectText: 'Confinement −15 à {region}, crise +5.', effects: [{ type: 'containment', amount: -15 }, { type: 'crisis', amount: 5 }] },
      { id: 'b', label: 'Rester invisible', effectText: 'Conscience −6 à {region}.', effects: [{ type: 'awareness', amount: -6 }] }
    ]
  },
  {
    id: 'mutation', phases: ['mid', 'late'], needs: null,
    title: 'Mutation spontanée',
    text: 'L’Anomalie se transforme d’elle-même. Plus agressive ? Plus discrète ? À toi de l’orienter.',
    options: [
      { id: 'a', label: 'Plus agressive', effectText: 'Croissance +25 % pendant 40 jours, conscience +5 partout.', effects: [{ type: 'mod', key: 'growth', factor: 1.25, days: 40 }, { type: 'awarenessAll', amount: 5 }] },
      { id: 'b', label: 'Plus discrète', effectText: 'Conscience ralentie de 30 % pendant 40 jours.', effects: [{ type: 'mod', key: 'awareness', factor: 0.7, days: 40 }] }
    ]
  },
  {
    id: 'border-protest', phases: ['mid', 'late'], needs: 'closed',
    title: 'Colère aux frontières',
    text: 'Des milliers de travailleurs bloqués manifestent contre la fermeture des frontières de {region}.',
    options: [
      { id: 'a', label: 'Soutenir le mouvement', effectText: 'Les routes de {region} rouvrent, conscience +5 à {region}.', effects: [{ type: 'openRoutes' }, { type: 'awareness', amount: 5 }] },
      { id: 'b', label: 'Rester à l’écart', effectText: '+10 d’Influence.', effects: [{ type: 'influence', amount: 10 }] }
    ]
  },
  {
    id: 'election', phases: ['mid'], needs: 'aware',
    title: 'Élections disputées',
    text: '{region} est en pleine campagne électorale. Aucun candidat ne veut parler de mauvaises nouvelles.',
    options: [
      { id: 'a', label: 'Semer le doute', effectText: '−10 d’Influence, conscience figée 25 jours à {region}.', cost: 10, effects: [{ type: 'influence', amount: -10 }, { type: 'jam', days: 25 }] },
      { id: 'b', label: 'Attendre le résultat', effectText: '+8 d’Influence.', effects: [{ type: 'influence', amount: 8 }] }
    ]
  },
  {
    id: 'migration', phases: ['mid'], needs: 'clean',
    title: 'Exode',
    text: 'Fuyant les régions touchées, des familles entières cherchent refuge à {region}.',
    options: [
      { id: 'a', label: 'Voyager avec elles', effectText: 'L’Anomalie s’installe à {region} (crise 10), conscience +3 partout.', effects: [{ type: 'seed', amount: 10 }, { type: 'awarenessAll', amount: 3 }] },
      { id: 'b', label: 'Les laisser partir', effectText: '+10 d’Influence.', effects: [{ type: 'influence', amount: 10 }] }
    ]
  },
  {
    id: 'satellite', phases: ['mid', 'late'], needs: null,
    title: 'Réseau satellite',
    text: 'Un nouveau réseau satellite permet à l’Humanité de suivre les foyers en temps réel.',
    options: [
      { id: 'a', label: 'Pirater le réseau', effectText: '−25 d’Influence, Réponse ralentie de 30 % pendant 35 jours.', cost: 25, effects: [{ type: 'influence', amount: -25 }, { type: 'mod', key: 'response', factor: 0.7, days: 35 }] },
      { id: 'b', label: 'Faire profil bas', effectText: 'Propagation −15 % pendant 30 jours, +12 d’Influence.', effects: [{ type: 'mod', key: 'spread', factor: 0.85, days: 30 }, { type: 'influence', amount: 12 }] }
    ]
  },
  {
    id: 'black-market', phases: ['mid'], needs: null,
    title: 'Marché noir',
    text: 'La pénurie fait flamber le marché noir. L’argent circule vite, loin des regards.',
    options: [
      { id: 'a', label: 'Y investir', effectText: 'Revenu d’Influence +25 % pendant 40 jours.', effects: [{ type: 'mod', key: 'income', factor: 1.25, days: 40 }] },
      { id: 'b', label: 'Encaisser tout de suite', effectText: '+16 d’Influence.', effects: [{ type: 'influence', amount: 16 }] }
    ]
  },
  // --- Fin de partie : l'Humanité contre-attaque ---
  {
    id: 'task-force', phases: ['late'], needs: 'crisis',
    title: 'Force d’intervention',
    text: 'Une force internationale débarque à {region} avec un matériel de pointe.',
    options: [
      { id: 'a', label: 'La disperser', effectText: '−20 d’Influence, confinement −20 à {region}.', cost: 20, effects: [{ type: 'influence', amount: -20 }, { type: 'containment', amount: -20 }] },
      { id: 'b', label: 'Encaisser le choc', effectText: 'Confinement +10 à {region}, mais +12 d’Influence.', effects: [{ type: 'containment', amount: 10 }, { type: 'influence', amount: 12 }] }
    ]
  },
  {
    id: 'panic', phases: ['late'], needs: null,
    title: 'Vent de panique',
    text: 'Les images des régions critiques font le tour du monde. La panique gagne les capitales.',
    options: [
      { id: 'a', label: 'Attiser la panique', effectText: 'Croissance +20 % pendant 30 jours, Réponse +2.', effects: [{ type: 'mod', key: 'growth', factor: 1.2, days: 30 }, { type: 'response', amount: 2 }] },
      { id: 'b', label: 'Laisser retomber', effectText: 'Conscience −3 partout.', effects: [{ type: 'awarenessAll', amount: -3 }] }
    ]
  },
  {
    id: 'breakthrough', phases: ['late'], needs: 'aware',
    title: 'Percée scientifique',
    text: 'Les chercheurs de {region} sont sur le point de comprendre comment fonctionne l’Anomalie.',
    options: [
      { id: 'a', label: 'Détruire leurs travaux', effectText: '−25 d’Influence, Réponse −5.', cost: 25, effects: [{ type: 'influence', amount: -25 }, { type: 'response', amount: -5 }] },
      { id: 'b', label: 'Laisser faire', effectText: 'Réponse +3, +14 d’Influence.', effects: [{ type: 'response', amount: 3 }, { type: 'influence', amount: 14 }] }
    ]
  },
  {
    id: 'curfew', phases: ['mid', 'late'], needs: 'crisis',
    title: 'Couvre-feu',
    text: '{region} impose un couvre-feu. Les rues se vident, mais les immeubles sont pleins.',
    options: [
      { id: 'a', label: 'Frapper de l’intérieur', effectText: 'Crise +9 à {region}.', effects: [{ type: 'crisis', amount: 9 }] },
      { id: 'b', label: 'Attendre la levée', effectText: 'Conscience −6 à {region}, +6 d’Influence.', effects: [{ type: 'awareness', amount: -6 }, { type: 'influence', amount: 6 }] }
    ]
  },
  {
    id: 'collapse', phases: ['late'], needs: 'crisis',
    title: 'Effondrement local',
    text: 'Les services publics de {region} s’effondrent. Plus personne ne coordonne la lutte.',
    options: [
      { id: 'a', label: 'Consolider', effectText: 'Confinement −15 à {region}, crise +6.', effects: [{ type: 'containment', amount: -15 }, { type: 'crisis', amount: 6 }] },
      { id: 'b', label: 'Puiser des ressources', effectText: '+20 d’Influence.', effects: [{ type: 'influence', amount: 20 }] }
    ]
  },
  {
    id: 'airlift', phases: ['mid', 'late'], needs: 'clean',
    title: 'Pont aérien',
    text: 'Un pont aérien humanitaire relie les régions touchées à {region}, encore épargnée.',
    options: [
      { id: 'a', label: 'Embarquer', effectText: 'L’Anomalie s’installe à {region} (crise 12), Réponse +1.', effects: [{ type: 'seed', amount: 12 }, { type: 'response', amount: 1 }] },
      { id: 'b', label: 'Rester au sol', effectText: '+10 d’Influence.', effects: [{ type: 'influence', amount: 10 }] }
    ]
  },
  {
    id: 'disinfo', phases: ['mid', 'late'], needs: null,
    title: 'Campagne de désinformation',
    text: 'Des milliers de faux comptes inondent les réseaux. Qui croire ? Plus personne ne sait.',
    options: [
      { id: 'a', label: 'Financer la campagne', effectText: '−20 d’Influence, conscience −6 partout.', cost: 20, effects: [{ type: 'influence', amount: -20 }, { type: 'awarenessAll', amount: -6 }] },
      { id: 'b', label: 'S’en tenir loin', effectText: 'Fermetures de routes −40 % pendant 30 jours.', effects: [{ type: 'mod', key: 'routeClose', factor: 0.6, days: 30 }] }
    ]
  },
  {
    id: 'storm', phases: PHASE_ALL, needs: 'crisis',
    title: 'Tempête',
    text: 'Une tempête historique s’abat sur {region}. Les secours sont débordés.',
    options: [
      { id: 'a', label: 'Profiter du chaos', effectText: 'Crise +7, confinement −8 à {region}.', effects: [{ type: 'crisis', amount: 7 }, { type: 'containment', amount: -8 }] },
      { id: 'b', label: 'Se faire oublier', effectText: 'Conscience figée 15 jours à {region}.', effects: [{ type: 'jam', days: 15 }] }
    ]
  },
  {
    id: 'defector', phases: ['late'], needs: null,
    title: 'Transfuge',
    text: 'Un haut responsable de la cellule de crise propose de livrer ses plans… contre un prix.',
    options: [
      { id: 'a', label: 'Acheter les plans', effectText: '−30 d’Influence, Réponse −6.', cost: 30, effects: [{ type: 'influence', amount: -30 }, { type: 'response', amount: -6 }] },
      { id: 'b', label: 'Refuser', effectText: 'Rien ne change.', effects: [] }
    ]
  },
  {
    id: 'cold-season', phases: PHASE_ALL, needs: null,
    title: 'Saison froide',
    text: 'L’hiver arrive dans l’hémisphère nord. Les gens restent enfermés, serrés les uns contre les autres.',
    options: [
      { id: 'a', label: 'Accélérer', effectText: 'Croissance +15 % pendant 45 jours.', effects: [{ type: 'mod', key: 'growth', factor: 1.15, days: 45 }] },
      { id: 'b', label: 'Économiser', effectText: '+12 d’Influence.', effects: [{ type: 'influence', amount: 12 }] }
    ]
  }
];

const EVENTS_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function phaseOf(state) {
  const r = state.globalContainment || 0;
  if (r < BALANCE.humanity.mobilizationThreshold) return 'early';
  if (r < 50) return 'mid';
  return 'late';
}

// Multiplicateur temporaire actif pour une clé (produit des effets en cours).
export function eventMod(state, key) {
  const list = state?.eventMods?.[key];
  if (!Array.isArray(list) || !list.length) return 1;
  let f = 1;
  for (const m of list) if (state.day < m.untilDay) f *= m.factor;
  return f;
}

function pruneMods(state) {
  if (!state.eventMods) return;
  for (const key of Object.keys(state.eventMods)) {
    state.eventMods[key] = state.eventMods[key].filter((m) => state.day < m.untilDay);
    if (!state.eventMods[key].length) delete state.eventMods[key];
  }
}

function hasClosedRoute(state, id) {
  const ts = state.territories[id];
  if (ts.closedRoutes.length) return true;
  for (const n of adjacency.get(id)) if (state.territories[n].closedRoutes.includes(id)) return true;
  return false;
}

function candidates(state, needs) {
  const ts = (t) => state.territories[t.id];
  switch (needs) {
    case 'crisis':
      return TERRITORIES.filter((t) => ts(t).crisis >= 10);
    case 'aware':
      return TERRITORIES.filter((t) => ts(t).awareness >= 15);
    case 'clean':
      return TERRITORIES.filter((t) => ts(t).crisis === 0 && [...adjacency.get(t.id)].some((n) => state.territories[n].crisis > 0));
    case 'closed':
      return TERRITORIES.filter((t) => hasClosedRoute(state, t.id));
    default:
      return null;
  }
}

function fill(text, name) {
  return name ? text.replaceAll('{region}', name) : text.replaceAll('{region}', 'la région');
}

function buildPending(state, event, territoryId) {
  const name = territoryId ? getTerritory(territoryId)?.name : null;
  return {
    id: event.id,
    title: event.title,
    text: fill(event.text, name),
    ...(territoryId ? { territoryId } : {}),
    options: event.options.map((o) => {
      const disabled = typeof o.cost === 'number' && state.influence < o.cost;
      return {
        id: o.id,
        label: o.label,
        effectText: fill(o.effectText, name),
        ...(disabled ? { disabled: true, reason: `Il faut ${o.cost} d’Influence.` } : {})
      };
    })
  };
}

// Appelée en fin de tick. Déclenche un événement quand son jour est venu.
export function maybeTriggerEvent(state) {
  pruneMods(state);
  if (state.pendingEvent || state.day < state.nextEventDay) return null;
  const phase = phaseOf(state);
  const eligible = [];
  for (const event of EVENTS) {
    if (!event.phases.includes(phase)) continue;
    if (event.needs && !candidates(state, event.needs).length) continue;
    eligible.push(event);
  }
  let fresh = eligible.filter((e) => !state.seenEvents.includes(e.id));
  if (!fresh.length) {
    // Tous vus : on recommence le paquet (sans répéter le dernier).
    const last = state.seenEvents[state.seenEvents.length - 1];
    state.seenEvents = [];
    fresh = eligible.filter((e) => e.id !== last);
  }
  const { intervalMin, intervalMax } = BALANCE.events;
  state.nextEventDay = state.day + randomInt(state, intervalMin, intervalMax);
  const event = pickOne(state, fresh);
  if (!event) return null;
  const territory = event.needs ? pickOne(state, candidates(state, event.needs)) : null;
  state.seenEvents.push(event.id);
  state.pendingEvent = buildPending(state, event, territory?.id ?? null);
  return state.pendingEvent;
}

function applyEffect(state, effect, territoryId) {
  const ts = territoryId ? state.territories[territoryId] : null;
  switch (effect.type) {
    case 'influence':
      state.influence = clamp(state.influence + effect.amount, 0, BALANCE.influenceCap);
      break;
    case 'crisis':
      if (ts) {
        const cap = Math.max(state.crisisCapHighWater || 0, ts.crisis);
        ts.crisis = clamp(Math.min(cap, ts.crisis + effect.amount), 0, 100);
      }
      break;
    case 'seed':
      if (ts && ts.crisis === 0) ts.crisis = Math.min(effect.amount, Math.max(state.crisisCapHighWater || 0, effect.amount));
      break;
    case 'awareness':
      if (ts) ts.awareness = clamp(ts.awareness + effect.amount, 0, 100);
      break;
    case 'awarenessAll':
      for (const t of TERRITORIES) {
        const s = state.territories[t.id];
        if (effect.amount > 0 && s.crisis === 0) continue;
        s.awareness = clamp(s.awareness + effect.amount, 0, 100);
      }
      break;
    case 'containment':
      if (ts) ts.containment = clamp(ts.containment + effect.amount, 0, 100);
      break;
    case 'response':
      if (effect.amount < 0) {
        const before = state.globalContainment;
        state.globalContainment = clamp(state.globalContainment + effect.amount, 0, 100);
        state.responseDebt = (state.responseDebt || 0) + (before - state.globalContainment);
      } else {
        state.globalContainment = clamp(state.globalContainment + effect.amount, 0, 100);
        state.globalMobilization = clamp((state.globalMobilization || 0) + effect.amount, 0, 100);
      }
      break;
    case 'mod': {
      state.eventMods ??= {};
      state.eventMods[effect.key] ??= [];
      state.eventMods[effect.key].push({ factor: effect.factor, untilDay: state.day + effect.days });
      break;
    }
    case 'jam':
      if (territoryId) state.jams = { ...(state.jams || {}), [territoryId]: Math.max(state.jams?.[territoryId] ?? 0, state.day + effect.days) };
      break;
    case 'openRoutes':
      if (territoryId) for (const n of adjacency.get(territoryId)) openRoute(state, routeKey(territoryId, n));
      break;
    case 'closeRoutes':
      if (territoryId) for (const n of adjacency.get(territoryId)) closeRoute(state, routeKey(territoryId, n));
      break;
    default:
      break;
  }
}

// Met à jour disabled/reason des options en attente selon l'Influence
// actuelle (elle peut changer pendant la pause : bulle, achat).
export function refreshPendingEvent(state) {
  const pending = state?.pendingEvent;
  if (!pending) return;
  const event = EVENTS_BY_ID.get(pending.id);
  if (!event) return;
  for (const shown of pending.options) {
    const option = event.options.find((o) => o.id === shown.id);
    const disabled = typeof option?.cost === 'number' && state.influence < option.cost;
    if (disabled) {
      shown.disabled = true;
      shown.reason = `Il faut ${option.cost} d’Influence.`;
    } else {
      delete shown.disabled;
      delete shown.reason;
    }
  }
}

export function chooseEventOption(state, optionId) {
  const pending = state?.pendingEvent;
  if (!pending) return { ok: false, error: 'Aucun événement en attente.' };
  const event = EVENTS_BY_ID.get(pending.id);
  if (!event) {
    state.pendingEvent = null;
    return { ok: false, error: 'Événement inconnu.' };
  }
  const option = event.options.find((o) => o.id === optionId);
  if (!option) return { ok: false, error: 'Option inconnue.' };
  if (typeof option.cost === 'number' && state.influence < option.cost) {
    return { ok: false, error: `Il faut ${option.cost} d’Influence.` };
  }
  const territoryId = pending.territoryId ?? null;
  for (const effect of option.effects) applyEffect(state, effect, territoryId);
  const shown = pending.options.find((o) => o.id === optionId);
  const resultText = `${pending.title} — ${option.label} : ${shown?.effectText ?? ''}`.trim();
  state.eventHistory = [...(state.eventHistory || []), { day: state.day, id: event.id, option: option.id }].slice(-40);
  state.pendingEvent = null;
  pushLog(state, resultText);
  return { ok: true, error: null, resultText };
}
