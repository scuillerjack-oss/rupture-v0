// V7 — modèle d'affichage de l'écran de jeu : fonctions PURES (sans DOM)
// qui traduisent l'état du moteur en textes/valeurs prêts à afficher.
// Séparées du rendu pour être testées sous Node avec un faux state
// (tests/playModel.test.js).
import { BALANCE, dangerosityCapAt, upgradeCost, responsePhaseAt } from '../engine/balance.js';
import {
  TERRITORIES, EDGES, territoryName, hasEngine,
  abilityStatus, getAbilities, forecastRace, progressBlockers, starsFor
} from './engineV7.js';

export const UPGRADE_ORDER = ['propagation', 'dangerosity', 'resilience', 'discretion'];
export const UPGRADE_ICONS = { propagation: '🌐', dangerosity: '☣', resilience: '🛡', discretion: '👁' };
export const ABILITY_ICONS = { surge: '⚡', jam: '📡', breach: '🔓' };
const ABILITY_FALLBACK = {
  surge: { label: 'Sursaut', description: 'Fait monter la crise dans une région.' },
  jam: { label: 'Brouillage', description: 'Fige la conscience d’une région quelques jours.' },
  breach: { label: 'Percée', description: 'Rouvre une route fermée.' }
};

const fmtPct = (v) => `${Math.max(0, Math.floor(Number(v) || 0))}%`;

export function hudModel(state) {
  return {
    progression: fmtPct(state.dominance),
    progressionValue: Number(state.dominance) || 0,
    response: fmtPct(state.globalContainment),
    responseValue: Number(state.globalContainment) || 0,
    influence: String(Math.floor(Number(state.influence) || 0)),
    day: String(state.day ?? 0),
    speed: Number(state.speed) || 0,
    phase: responsePhaseAt(Number(state.globalContainment) || 0).label
  };
}

function nextLevelText(kind, level) {
  const cfg = BALANCE.upgrades[kind];
  if (level >= cfg.maxLevel) return 'Niveau maximum atteint.';
  if (kind === 'dangerosity') {
    return `Prochain niveau : plafond de gravité d'une région ${Math.round(dangerosityCapAt(level))}% → ${Math.round(dangerosityCapAt(level + 1))}% (et alarme davantage le monde).`;
  }
  const pct = Math.round(cfg.effectPerLevel * 100);
  return {
    propagation: `Prochain niveau : +${pct}% de vitesse de propagation vers les voisins (et un peu plus visible).`,
    resilience: `Prochain niveau : +${pct}% de résistance aux mesures de confinement.`,
    discretion: `Prochain niveau : +${pct}% de ralentissement de la prise de conscience mondiale.`
  }[kind];
}

export function upgradeModels(state) {
  return UPGRADE_ORDER.map((kind) => {
    const cfg = BALANCE.upgrades[kind];
    const level = state.upgrades?.[kind] ?? 0;
    const maxed = level >= cfg.maxLevel;
    const cost = maxed ? null : upgradeCost(kind, level);
    const adapted = state.adaptation && state.adaptation.branch === kind && (state.day ?? 0) < state.adaptation.untilDay;
    return {
      kind,
      icon: UPGRADE_ICONS[kind],
      label: cfg.label,
      description: cfg.description,
      level,
      maxLevel: cfg.maxLevel,
      maxed,
      cost,
      costText: maxed ? 'Max' : `${cost}`,
      affordable: !maxed && (state.influence ?? 0) >= cost,
      nextText: nextLevelText(kind, level),
      adapted: Boolean(adapted)
    };
  });
}

export function abilityModels(state, targeting = null) {
  const list = getAbilities();
  return list.map((a) => {
    const status = abilityStatus(state, a.id);
    const fallback = ABILITY_FALLBACK[a.id] ?? {};
    const isTargeting = targeting?.abilityId === a.id;
    const ready = Boolean(status.available);
    const readyIn = Math.max(0, Math.ceil(Number(status.readyInDays) || 0));
    let sub;
    if (isTargeting) sub = 'Choisis la cible';
    else if (ready) sub = `${status.cost ?? a.cost} inf.`;
    else if (readyIn > 0) sub = `${readyIn} j`;
    else sub = `${status.cost ?? a.cost} inf.`;
    return {
      id: a.id,
      icon: ABILITY_ICONS[a.id] ?? '✦',
      label: a.label ?? fallback.label ?? a.id,
      description: a.description ?? fallback.description ?? '',
      target: a.target === 'route' ? 'route' : 'territory',
      cost: status.cost ?? a.cost,
      ready,
      readyInDays: readyIn,
      reason: status.reason ?? '',
      sub,
      targeting: isTargeting,
      // Recharge en cours : fraction restante pour la jauge (0 = prête).
      cooldownFraction: !ready && readyIn > 0 && a.cooldownDays ? Math.min(1, readyIn / a.cooldownDays) : 0
    };
  });
}

function roundDay(d) {
  return Math.round(d / 5) * 5;
}

// « Rupture prévue jour ~X / Maîtrise ~Y » ; null si le moteur ne sait pas
// encore projeter (aucune projection inventée côté interface).
export function forecastText(state) {
  if (!hasEngine('forecastRace')) return null;
  const f = forecastRace(state);
  const parts = [];
  if (Number.isFinite(f.ruptureDay)) parts.push(`Rupture prévue jour ~${roundDay(f.ruptureDay)}`);
  if (Number.isFinite(f.controlDay)) parts.push(`Maîtrise ~${roundDay(f.controlDay)}`);
  if (!parts.length) return 'Course indécise';
  let lead = 'neutral';
  if (Number.isFinite(f.ruptureDay) && (!Number.isFinite(f.controlDay) || f.ruptureDay < f.controlDay)) lead = 'ahead';
  else if (Number.isFinite(f.controlDay)) lead = 'behind';
  return { text: parts.join(' / '), lead };
}

// Obstacle principal. Repli local tant que progressBlockers n'existe pas :
// le mur de gravité V6 (crise bloquée au plafond de Dangerosité) est
// calculable à partir des données déjà publiques du moteur.
export function blockerModel(state) {
  if (hasEngine('progressBlockers')) {
    const list = progressBlockers(state);
    return list.length ? { kind: list[0].kind, text: list[0].text } : null;
  }
  const level = state.upgrades?.dangerosity ?? 0;
  const full = BALANCE.severity.fullSeverityLevel;
  if (level >= full || state.status !== 'playing') return null;
  const cap = dangerosityCapAt(level);
  const territories = Object.values(state.territories || {});
  const capped = territories.filter((t) => t.crisis >= cap - 0.5).length;
  if (capped >= 3) return { kind: 'gravity-cap', text: `Gravité plafonnée : Dangerosité ${full} requise` };
  return null;
}

export function adaptationText(state) {
  const a = state.adaptation;
  if (!a || !(state.day < a.untilDay)) return null;
  const label = BALANCE.upgrades[a.branch]?.label ?? a.branch;
  const loss = Math.round((1 - (Number(a.factor) || 0.75)) * 100);
  return `L'Humanité s'adapte : ${label} −${loss}% jusqu'au jour ${a.untilDay}`;
}

// --- Journal ---
const ID_TO_NAME = new Map(TERRITORIES.map((t) => [t.id, t.name]));
const ID_PATTERN = new RegExp(`\\b(${TERRITORIES.map((t) => t.id).join('|')})\\b`, 'g');

// Bug V6 : le journal affichait des identifiants (« Point de départ :
// fenwick »). Ici, tout identifiant de territoire devient son nom.
export function humanizeLogLine(line) {
  const text = typeof line === 'string' ? line : (line?.text ?? '');
  return text.replace(ID_PATTERN, (id) => ID_TO_NAME.get(id) ?? id);
}

// Bug V6 : la consigne « Choisissez un territoire de départ… » restait dans
// le journal pendant toute la partie. Elle n'a de sens qu'avant le départ.
const STALE_ONCE_PLAYING = [/^Choisissez un territoire de départ/];

export function visibleLog(state, max = 6) {
  const lines = Array.isArray(state.log) ? state.log : [];
  const playing = state.status !== 'selecting-origin';
  return lines
    .filter((l) => !(playing && STALE_ONCE_PLAYING.some((re) => re.test(typeof l === 'string' ? l : l?.text ?? ''))))
    .slice(0, max)
    .map(humanizeLogLine);
}

export function latestLogLine(state) {
  return visibleLog(state, 1)[0] ?? '';
}

// --- Territoire sélectionné / fiche d'origine ---
const NEIGHBORS = new Map(TERRITORIES.map((t) => [t.id, []]));
for (const [a, b] of EDGES) {
  NEIGHBORS.get(a).push(b);
  NEIGHBORS.get(b).push(a);
}

export function routeKindsFor(id, routeKinds = null) {
  const counts = { land: 0, sea: 0, air: 0 };
  for (const other of NEIGHBORS.get(id) ?? []) {
    const key = [id, other].sort().join('|');
    const kind = routeKinds?.[key] ?? 'land';
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function originCard(id, routeKinds = null) {
  const t = TERRITORIES.find((x) => x.id === id);
  if (!t) return null;
  const neighbors = NEIGHBORS.get(id) ?? [];
  const kinds = routeKindsFor(id, routeKinds);
  const routeParts = [];
  if (kinds.land) routeParts.push(`${kinds.land} terrestre${kinds.land > 1 ? 's' : ''}`);
  if (kinds.sea) routeParts.push(`${kinds.sea} maritime${kinds.sea > 1 ? 's' : ''}`);
  if (kinds.air) routeParts.push(`${kinds.air} aérienne${kinds.air > 1 ? 's' : ''}`);
  let advice;
  if (neighbors.length >= 4) advice = 'Carrefour : propagation rapide, mais tout le monde te voit venir.';
  else if (neighbors.length <= 2 && t.population <= 4) advice = 'Isolée et discrète : départ lent, mais l’Humanité tarde à réagir.';
  else if (t.population >= 8) advice = 'Très peuplée : beaucoup d’Influence dès le début.';
  else if (neighbors.length <= 2) advice = 'Peu de routes : surveille les fermetures de frontière.';
  else advice = 'Départ équilibré : un bon choix pour apprendre.';
  return {
    id,
    name: t.name,
    population: t.population,
    routes: neighbors.length,
    routesText: routeParts.join(', ') || `${neighbors.length}`,
    neighbors: neighbors.map(territoryName),
    advice,
    hard: neighbors.length <= 2 && t.population <= 4
  };
}

export function territoryModel(state, id) {
  if (!id || !state.territories?.[id]) return null;
  const ts = state.territories[id];
  return {
    id,
    name: territoryName(id),
    crisis: Math.round(ts.crisis),
    awareness: Math.round(ts.awareness),
    containment: Math.round(ts.containment),
    isOrigin: state.originId === id,
    closedRoutes: (ts.closedRoutes || []).length
  };
}

// --- Fin de partie ---
const LEGACY_REASON = { dominance: 'rupture', containment: 'control', timeout: 'stalled' };

export function isGameOver(state) {
  return Boolean(state.outcome) || state.status === 'victory' || state.status === 'defeat';
}

export function outcomeOf(state) {
  if (state.outcome) return state.outcome;
  if (state.status !== 'victory' && state.status !== 'defeat') return null;
  return {
    result: state.status,
    reason: LEGACY_REASON[state.endReason] ?? (state.status === 'victory' ? 'rupture' : 'control'),
    day: state.day,
    stars: null
  };
}

export function starsOf(state) {
  const outcome = outcomeOf(state);
  if (!outcome || outcome.result !== 'victory') return 0;
  if (Number.isFinite(outcome.stars)) return Math.max(0, Math.min(3, outcome.stars));
  return starsFor(state);
}

export const END_TEXTS = {
  rupture: "Ta progression a atteint 100 % avant que l'Humanité n'achève sa maîtrise.",
  control: "La Réponse mondiale a atteint la maîtrise complète avant ta progression.",
  stalled: "La course était jouée : ta progression ne bougeait plus depuis longtemps et la Réponse mondiale dominait. Plutôt que de te laisser attendre, la partie s'arrête.",
  tie: "Égalité parfaite : ta progression et la Réponse mondiale ont atteint 100 % au même instant. Dans RUPTURE, une égalité revient à l'Humanité — il te fallait un jour d'avance."
};

export function endModel(state) {
  const outcome = outcomeOf(state);
  if (!outcome) return null;
  const victory = outcome.result === 'victory';
  const title = victory ? 'VICTOIRE' : outcome.reason === 'tie' ? 'ÉGALITÉ' : outcome.reason === 'stalled' ? 'DÉFAITE ANTICIPÉE' : 'DÉFAITE';
  return {
    victory,
    reason: outcome.reason,
    title,
    // Le moteur V7 fournit l'explication prête à afficher (outcome.text).
    text: outcome.text || END_TEXTS[outcome.reason] || (victory ? END_TEXTS.rupture : END_TEXTS.control),
    day: outcome.day ?? state.day,
    stars: starsOf(state)
  };
}

export function starsString(n, max = 3) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}
