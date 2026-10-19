// Batterie de simulations d'équilibrage de RUPTURE - V7 (simulations à graine).
//
// Ne truque pas les résultats : chaque robot est une heuristique honnête,
// jouée telle quelle contre le moteur réel (src/engine), sans connaissance
// privilégiée de l'issue. Depuis V7, tout le hasard du moteur dépend de la
// graine de la partie (state.seed) : chaque résultat est reproductible à
// l'identique (`node scripts/simulate-balance.mjs` rejoue exactement les mêmes
// parties). Les robots ont leur propre générateur, lui aussi à graine.
//
// Sections du rapport (docs/v7-simulation-results.json) :
//  - batterie : robots x difficultés, 18 origines x SEEDS_PER_ORIGIN graines ;
//  - cibles V7 : naïf sans bulles <= 40 % en Normal, cohérent 60-85 % en
//    Normal, Facile nettement plus facile que Normal ;
//  - sensibilité : chaque constante clé à ±10 %, écart du meilleur robot ;
//  - rythme : tension liée à l'escalade (escalationWeight) comparée à V6 ;
//  - durée : jours de jeu, et minutes réelles en ×1 (1 jour = 1 tick = 1 s,
//    voir TICK_MS dans src/main.js).
//
// Variables d'environnement :
//  RUPTURE_SIM_OUTPUT  chemin de sortie (défaut ../docs/v7-simulation-results.json)
//  RUPTURE_SIM_SEEDS   graines par origine (défaut 4)
//  RUPTURE_SIM_QUICK=1 batterie seule (pas de sensibilité ni de rythme)

import { writeFileSync } from 'node:fs';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import {
  simulateTick,
  buyUpgrade,
  collectBubble,
  abilityStatus,
  abilityTargets,
  useAbility,
  chooseEventOption
} from '../src/engine/simulation.js';
import { TERRITORIES } from '../src/engine/territories.js';
import { BALANCE, DIFFICULTIES, upgradeCost } from '../src/engine/balance.js';
import { randomAt } from '../src/engine/rng.js';

const OUTPUT_FILE = process.env.RUPTURE_SIM_OUTPUT || '../docs/v7-simulation-results.json';
const SEEDS_PER_ORIGIN = Number(process.env.RUPTURE_SIM_SEEDS) || 4;
const QUICK = process.env.RUPTURE_SIM_QUICK === '1';
// RUPTURE_SIM_SET='{"bubbles.researchValue":0.1,"difficulty.normal":0.15}' :
// surcharge des constantes pour explorer, sans modifier balance.js.
if (process.env.RUPTURE_SIM_SET) {
  for (const [path, value] of Object.entries(JSON.parse(process.env.RUPTURE_SIM_SET))) {
    if (path.startsWith('difficulty.')) {
      const [, diff, field = 'globalContainmentGainFactor'] = path.split('.');
      DIFFICULTIES[diff][field] = value;
      continue;
    }
    const parts = path.split('.');
    let obj = BALANCE;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
  }
}
const BOT_FILTER = process.env.RUPTURE_SIM_BOTS ? process.env.RUPTURE_SIM_BOTS.split(',') : null;
const MAX_TICKS = 3000;
const KINDS = ['propagation', 'dangerosity', 'resilience', 'discretion'];
const TICK_SECONDS_AT_X1 = 1; // src/main.js : TICK_MS = 1000, 1 tick par intervalle en ×1

// --- Générateur du robot (distinct de celui du moteur) ---
function botRng(seed) {
  let counter = 0;
  return () => randomAt(`bot:${seed}`, counter++);
}

function affordable(state, kind) {
  const cfg = BALANCE.upgrades[kind];
  return state.upgrades[kind] < cfg.maxLevel && state.influence >= upgradeCost(kind, state.upgrades[kind]);
}

function buyFirstAffordable(state, order) {
  for (const kind of order) {
    if (affordable(state, kind)) {
      buyUpgrade(state, kind);
      return true;
    }
  }
  return false;
}

function isMobilized(state) {
  return state.globalContainment >= BALANCE.humanity.mobilizationThreshold;
}

function reactiveOrder(state) {
  return isMobilized(state)
    ? ['resilience', 'dangerosity', 'propagation', 'discretion']
    : ['propagation', 'dangerosity', 'discretion', 'resilience'];
}

// --- Comportements élémentaires des robots ---

// Bulles : chaque bulle est « vue » à sa naissance ; touchée avec la
// probabilité `rate` (tirage du robot), sinon laissée expirer.
function handleBubbles(state, ctx, rate) {
  for (const b of [...state.bubbles]) {
    if (ctx.seenBubbles.has(b.id)) continue;
    ctx.seenBubbles.add(b.id);
    if (rate > 0 && ctx.rng() < rate) collectBubble(state, b.id);
  }
}

// Événements, robot naïf : première option disponible.
function chooseFirst(state) {
  const opt = state.pendingEvent.options.find((o) => !o.disabled) ?? state.pendingEvent.options[0];
  chooseEventOption(state, opt.id);
}

// Événements, robot cohérent : regarde 60 jours plus loin pour chaque
// option (copie de l'état, sans hasard ni nouvel événement) et garde celle
// qui laisse la meilleure marge Progression - Réponse.
function scoreAfter(state, optionId) {
  const copy = structuredClone(state);
  copy.__noRandom = true;
  const res = chooseEventOption(copy, optionId);
  if (!res.ok) return -Infinity;
  copy.features = { ...copy.features, events: false, bubbles: false, stall: false };
  for (let i = 0; i < 60 && copy.status === 'playing'; i++) {
    simulateTick(copy);
    buyFirstAffordable(copy, reactiveOrder(copy));
  }
  if (copy.status === 'victory') return 1000 - copy.day;
  if (copy.status === 'defeat') return -1000;
  return copy.dominance - copy.globalContainment + copy.influence * 0.05;
}

function chooseBest(state) {
  let best = null;
  let bestScore = -Infinity;
  for (const o of state.pendingEvent.options) {
    if (o.disabled) continue;
    const s = scoreAfter(state, o.id);
    if (s > bestScore) {
      bestScore = s;
      best = o.id;
    }
  }
  chooseEventOption(state, best ?? state.pendingEvent.options[0].id);
}

// Capacités, robot cohérent : Percée sur une route fermée qui touche une
// région en crise, Brouillage sur la région la plus consciente, Sursaut sur
// la région la plus peuplée encore loin de son plafond. Garde toujours de
// quoi acheter l'amélioration prioritaire (réserve) avant d'utiliser.
function useAbilities(state) {
  const reserve = (() => {
    const kind = reactiveOrder(state).find((k) => state.upgrades[k] < BALANCE.upgrades[k].maxLevel);
    return kind ? upgradeCost(kind, state.upgrades[kind]) * 0.5 : 0;
  })();
  const pop = Object.fromEntries(TERRITORIES.map((t) => [t.id, t.population]));
  const tryUse = (id, pick) => {
    const st = abilityStatus(state, id);
    if (!st.available || state.influence - st.cost < reserve) return;
    const targets = abilityTargets(state, id);
    const target = pick(targets);
    if (target) useAbility(state, id, target);
  };
  tryUse('breach', (targets) => {
    let best = null;
    let bestScore = 0;
    for (const key of targets) {
      const [a, b] = key.split('|');
      const ca = state.territories[a].crisis;
      const cb = state.territories[b].crisis;
      const score = Math.abs(ca - cb) * (pop[a] + pop[b]);
      if (Math.max(ca, cb) >= BALANCE.spreadThreshold && score > bestScore) {
        best = key;
        bestScore = score;
      }
    }
    return best;
  });
  if (isMobilized(state)) {
    tryUse('jam', (targets) => {
      const sorted = targets.sort((x, y) => state.territories[y].awareness * pop[y] - state.territories[x].awareness * pop[x]);
      return sorted[0];
    });
  }
  if (state.upgrades.dangerosity >= 3) {
    tryUse('surge', (targets) => {
      const cap = state.crisisCapHighWater;
      const sorted = targets.sort((x, y) => (cap - state.territories[y].crisis) * pop[y] - (cap - state.territories[x].crisis) * pop[x]);
      return sorted[0];
    });
  }
}

// --- Robots ---
// Chaque robot : { bubbles: taux de bulles touchées, events: 'first'|'best',
// abilities: bool, buy(state, ctx) }.
const BOTS = {
  passif: { bubbles: 0, events: 'first', abilities: false, buy: () => {} },

  // Cible V7 : <= 40 % en Normal. « J'achète ce qui est disponible » dans un
  // ordre fixe, ne touche jamais la carte (ni bulle, ni capacité).
  'achete-disponible': { bubbles: 0, events: 'first', abilities: false, buy: (s) => buyFirstAffordable(s, KINDS) },

  'achats-aleatoires': {
    bubbles: 0.3,
    events: 'first',
    abilities: false,
    buy: (s, ctx) => {
      if (ctx.rng() < 0.08) buyUpgrade(s, KINDS[Math.floor(ctx.rng() * KINDS.length)]);
    }
  },

  // Le meilleur robot V6 (réactif), mais sans toucher la carte.
  'reactif-sans-bulles': { bubbles: 0, events: 'first', abilities: false, buy: (s) => buyFirstAffordable(s, reactiveOrder(s)) },

  // Cible V7 : 60-85 % en Normal. Réactif + touche ~70 % des bulles +
  // capacités + choix d'événements réfléchis.
  'coherent-70': { bubbles: 0.7, events: 'best', abilities: true, buy: (s) => buyFirstAffordable(s, reactiveOrder(s)) },
  // Ablation : mêmes bulles, mais événements au hasard de la 1re option et
  // aucune capacité - mesure ce que rapportent les décisions sur la carte.
  'coherent-70-sans-decisions': { bubbles: 0.7, events: 'first', abilities: false, buy: (s) => buyFirstAffordable(s, reactiveOrder(s)) },
  'coherent-40': { bubbles: 0.4, events: 'best', abilities: true, buy: (s) => buyFirstAffordable(s, reactiveOrder(s)) },
  'coherent-95': { bubbles: 0.95, events: 'best', abilities: true, buy: (s) => buyFirstAffordable(s, reactiveOrder(s)) },

  // Diversification face à l'adaptation : comme coherent-70 mais n'achète
  // jamais la branche visée par l'adaptation en cours.
  'coherent-diversifie': {
    bubbles: 0.7,
    events: 'best',
    abilities: true,
    buy: (s) => buyFirstAffordable(s, reactiveOrder(s).filter((k) => k !== s.adaptation?.branch))
  },

  'furtive-puis-frappe': {
    bubbles: 0.7,
    events: 'best',
    abilities: true,
    buy: (s) => {
      if (s.upgrades.discretion < 5) return buyFirstAffordable(s, ['discretion', 'propagation']);
      if (isMobilized(s)) return buyFirstAffordable(s, ['resilience', 'dangerosity', 'propagation']);
      return buyFirstAffordable(s, ['propagation', 'dangerosity', 'discretion']);
    }
  },

  'dangerosite-precoce': {
    bubbles: 0.7,
    events: 'first',
    abilities: false,
    buy: (s) => {
      if (s.upgrades.dangerosity < BALANCE.upgrades.dangerosity.maxLevel) return affordable(s, 'dangerosity') && buyUpgrade(s, 'dangerosity');
      return buyFirstAffordable(s, ['propagation', 'resilience', 'discretion']);
    }
  },

  'accumulation-tardive': {
    bubbles: 0.7,
    events: 'first',
    abilities: false,
    buy: (s) => {
      if (s.day < 300) return;
      let bought = true;
      while (bought) bought = buyFirstAffordable(s, KINDS);
    }
  }
};

function runOne(botName, originId, difficulty, seed, overrides = {}) {
  const bot = BOTS[botName];
  const state = createInitialState();
  beginNewGame(state, difficulty, { seed, strain: overrides.strain ?? 'standard', features: overrides.features });
  if (overrides.rules) Object.assign(state.rules, overrides.rules(state.rules));
  confirmOrigin(state, originId);
  const ctx = { rng: botRng(`${botName}:${seed}`), seenBubbles: new Set() };
  let firstResponseDay = null;
  let events = 0;
  let ticks = 0;
  for (; ticks < MAX_TICKS && state.status === 'playing'; ticks++) {
    if (state.pendingEvent) {
      events += 1;
      if (bot.events === 'best') chooseBest(state);
      else chooseFirst(state);
    }
    simulateTick(state);
    if (firstResponseDay === null && state.globalContainment >= 5) firstResponseDay = state.day;
    handleBubbles(state, ctx, bot.bubbles);
    if (bot.abilities) useAbilities(state);
    bot.buy(state, ctx);
  }
  return {
    bot: botName,
    origin: originId,
    difficulty,
    seed,
    status: state.status,
    reason: state.outcome?.reason ?? null,
    days: state.day,
    stars: state.outcome?.stars ?? 0,
    firstResponseDay,
    events,
    bubblesSpawned: state.bubblesSpawned,
    bubblesCollected: state.bubblesCollected,
    abilityUses: state.abilityUses,
    dominance: Number(state.dominance.toFixed(2)),
    globalContainment: Number(state.globalContainment.toFixed(2)),
    upgrades: { ...state.upgrades },
    hitTickCap: ticks >= MAX_TICKS
  };
}

function seedsFor(originId) {
  return Array.from({ length: SEEDS_PER_ORIGIN }, (_, i) => `sim-${originId}-${i}`);
}

function runBattery(botName, difficulty, overrides) {
  const rows = [];
  for (const t of TERRITORIES) for (const seed of seedsFor(t.id)) rows.push(runOne(botName, t.id, difficulty, seed, overrides));
  return rows;
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round = (v, d = 0) => (v === null ? null : Number(v.toFixed(d)));
const pct = (n, d) => round((n / d) * 100, 1);

function summarize(rows) {
  const wins = rows.filter((r) => r.status === 'victory');
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
  const spawned = rows.reduce((a, r) => a + r.bubblesSpawned, 0);
  const collected = rows.reduce((a, r) => a + r.bubblesCollected, 0);
  const allDays = rows.map((r) => r.days);
  const winDays = wins.map((r) => r.days);
  return {
    bot: rows[0].bot,
    difficulty: rows[0].difficulty,
    runs: rows.length,
    victoires: wins.length,
    tauxVictoire: pct(wins.length, rows.length),
    raisons: reasons,
    joursMoyens: round(avg(allDays)),
    joursMoyensVictoire: round(avg(winDays)),
    minutesX1Moyennes: round((avg(allDays) * TICK_SECONDS_AT_X1) / 60, 1),
    minutesX1MoyennesVictoire: winDays.length ? round((avg(winDays) * TICK_SECONDS_AT_X1) / 60, 1) : null,
    premierJourReponse5: round(avg(rows.map((r) => r.firstResponseDay).filter((d) => d !== null))),
    evenementsParPartie: round(avg(rows.map((r) => r.events)), 1),
    bullesTouchees: spawned ? pct(collected, spawned) : null,
    capacitesParPartie: round(avg(rows.map((r) => r.abilityUses)), 1),
    etoilesMoyennesVictoire: wins.length ? round(avg(wins.map((r) => r.stars)), 2) : null,
    partiesBloquees: rows.filter((r) => r.hitTickCap).length
  };
}

// --- 1. Batterie principale ---
const t0 = Date.now();
const DIFFS = ['easy', 'normal', 'hard'];
const summary = [];
for (const difficulty of DIFFS) {
  for (const botName of Object.keys(BOTS)) {
    if (BOT_FILTER && !BOT_FILTER.includes(botName) && !['achete-disponible', 'coherent-70'].includes(botName)) continue;
    summary.push(summarize(runBattery(botName, difficulty)));
  }
}
const find = (bot, diff) => summary.find((s) => s.bot === bot && s.difficulty === diff);
for (const d of DIFFS) {
  console.log(`=== ${d} ===`);
  console.table(
    summary
      .filter((s) => s.difficulty === d)
      .map((s) => ({ bot: s.bot, win: s.tauxVictoire, jours: s.joursMoyens, joursV: s.joursMoyensVictoire, minV: s.minutesX1MoyennesVictoire, rep5: s.premierJourReponse5, ev: s.evenementsParPartie, bulles: s.bullesTouchees, cap: s.capacitesParPartie }))
  );
}

const best = summary
  .filter((s) => s.difficulty === 'normal' && s.bot !== 'passif')
  .reduce((a, b) => (b.tauxVictoire > a.tauxVictoire ? b : a));

const targets = {
  naifSansBullesNormalMax40: { valeur: find('achete-disponible', 'normal').tauxVictoire, ok: find('achete-disponible', 'normal').tauxVictoire <= 40 },
  coherent70Normal60a85: { valeur: find('coherent-70', 'normal').tauxVictoire, ok: find('coherent-70', 'normal').tauxVictoire >= 60 && find('coherent-70', 'normal').tauxVictoire <= 85 },
  facileNettementPlusFacile: {
    naif: [find('achete-disponible', 'easy').tauxVictoire, find('achete-disponible', 'normal').tauxVictoire],
    coherent: [find('coherent-70', 'easy').tauxVictoire, find('coherent-70', 'normal').tauxVictoire],
    ok: find('achete-disponible', 'easy').tauxVictoire - find('achete-disponible', 'normal').tauxVictoire >= 15 &&
      find('coherent-70', 'easy').tauxVictoire > find('coherent-70', 'normal').tauxVictoire
  },
  dureeVictoireCoherentNormalMinutesX1: {
    valeur: find('coherent-70', 'normal').minutesX1MoyennesVictoire,
    cible: '6 à 8',
    ok: find('coherent-70', 'normal').minutesX1MoyennesVictoire >= 6 && find('coherent-70', 'normal').minutesX1MoyennesVictoire <= 8
  },
  meilleurRobotNormal: { bot: best.bot, tauxVictoire: best.tauxVictoire }
};
console.log('=== CIBLES V7 ===');
console.log(JSON.stringify(targets, null, 2));

// --- 2. Sensibilité ±10 % (meilleur robot cohérent, Normal) ---
function withConstant(path, factor, fn) {
  const parts = path.split('.');
  let obj = BALANCE;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  const key = parts[parts.length - 1];
  const original = obj[key];
  obj[key] = original * factor;
  try {
    return fn();
  } finally {
    obj[key] = original;
  }
}

const SENSITIVITY_CONSTANTS = [
  'influenceGainFactor',
  'earlyInfluenceTrickle',
  'baseGrowthPerTick',
  'baseSpreadPerTick',
  'awarenessCatchupRate',
  'dangerosityAwarenessBleed',
  'humanity.maxSuppressionPerTick',
  'bubbles.incomeShare',
  'rules.globalContainmentGainFactor'
];

const sensitivity = [];
if (!QUICK) {
  const reference = find('coherent-70', 'normal').tauxVictoire;
  for (const path of SENSITIVITY_CONSTANTS) {
    const row = { constante: path, reference };
    for (const factor of [0.9, 1.1]) {
      let rate;
      if (path === 'rules.globalContainmentGainFactor') {
        const rows = runBattery('coherent-70', 'normal', { rules: (r) => ({ globalContainmentGainFactor: r.globalContainmentGainFactor * factor }) });
        rate = summarize(rows).tauxVictoire;
      } else {
        rate = withConstant(path, factor, () => summarize(runBattery('coherent-70', 'normal')).tauxVictoire);
      }
      row[factor === 0.9 ? 'moins10' : 'plus10'] = rate;
    }
    row.ecartMax = round(Math.max(Math.abs(row.moins10 - reference), Math.abs(row.plus10 - reference)), 1);
    row.ok = row.ecartMax <= 15;
    sensitivity.push(row);
  }
  console.log('=== SENSIBILITÉ ±10 % (coherent-70, Normal) ===');
  console.table(sensitivity);
}

// --- 3. Rythme : tension liée à l'escalade ---
const rhythm = [];
if (!QUICK) {
  for (const weight of [0, 0.25, 0.5]) {
    const original = BALANCE.tension.escalationWeight;
    BALANCE.tension.escalationWeight = weight;
    try {
      const row = { escalationWeight: weight };
      for (const bot of ['achete-disponible', 'coherent-70']) {
        for (const d of ['easy', 'normal']) {
          const s = summarize(runBattery(bot, d));
          row[`${bot}:${d}`] = s.tauxVictoire;
          if (bot === 'coherent-70' && d === 'normal') {
            row.joursMoyensVictoire = s.joursMoyensVictoire;
            row.premierJourReponse5 = s.premierJourReponse5;
          }
        }
      }
      rhythm.push(row);
    } finally {
      BALANCE.tension.escalationWeight = original;
    }
  }
  console.log('=== RYTHME (escalationWeight) ===');
  console.table(rhythm);
}

const elapsed = Math.round((Date.now() - t0) / 1000);
writeFileSync(
  new URL(OUTPUT_FILE, import.meta.url),
  JSON.stringify(
    {
      version: 7,
      note:
        'Simulations à graine (src/engine/rng.js) : rejouer ce script redonne exactement ces chiffres. Durée réelle : 1 jour de jeu = 1 tick = 1 s en ×1 (src/main.js, TICK_MS = 1000).',
      seedsPerOrigin: SEEDS_PER_ORIGIN,
      runsPerCell: TERRITORIES.length * SEEDS_PER_ORIGIN,
      tickSecondsAtX1: TICK_SECONDS_AT_X1,
      constantes: {
        bubbles: BALANCE.bubbles,
        abilities: BALANCE.abilities,
        events: BALANCE.events,
        adaptation: BALANCE.adaptation,
        stall: BALANCE.stall,
        tension: BALANCE.tension,
        severity: BALANCE.severity,
        difficultes: Object.fromEntries(Object.entries(DIFFICULTIES).map(([k, v]) => [k, v.globalContainmentGainFactor]))
      },
      cibles: targets,
      summary,
      sensibilite: sensitivity,
      rythme: rhythm,
      dureeCalculSecondes: elapsed
    },
    null,
    2
  )
);
console.log(`Résultats écrits dans ${OUTPUT_FILE.replace('../', '')} (${elapsed} s)`);
