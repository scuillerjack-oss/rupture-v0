import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInitialState, beginNewGame, confirmOrigin, SAVE_VERSION } from '../src/engine/state.js';
import {
  simulateTick,
  buyUpgrade,
  collectBubble,
  ABILITIES,
  abilityStatus,
  abilityTargets,
  useAbility,
  EVENTS,
  chooseEventOption,
  forecastRace,
  progressBlockers,
  STRAINS,
  dailySeed,
  effectiveLevel
} from '../src/engine/simulation.js';
import { TERRITORIES, EDGES } from '../src/engine/territories.js';
import { BALANCE, tensionAt } from '../src/engine/balance.js';
import { randomAt, nextRandom } from '../src/engine/rng.js';
import { routeKey, ROUTE_KEYS, isRouteClosed, closeRoute } from '../src/engine/routes.js';
import { migrateSave } from '../src/engine/migrations.js';

function v7Game(originId = 'fenwick', seed = 'test', difficulty = 'normal', extra = {}) {
  const state = createInitialState();
  beginNewGame(state, difficulty, { seed, ...extra });
  confirmOrigin(state, originId);
  return state;
}

// Avance en répondant à tout événement par sa première option disponible.
function advance(state, days) {
  for (let i = 0; i < days && state.status === 'playing'; i++) {
    if (state.pendingEvent) {
      const opt = state.pendingEvent.options.find((o) => !o.disabled) ?? state.pendingEvent.options[0];
      chooseEventOption(state, opt.id);
    }
    simulateTick(state);
  }
  return state;
}

function playFull(seed, originId = 'jotun') {
  const state = v7Game(originId, seed);
  const order = ['propagation', 'dangerosity', 'resilience', 'discretion'];
  let n = 0;
  for (let i = 0; i < 3000 && state.status === 'playing'; i++) {
    if (state.pendingEvent) chooseEventOption(state, state.pendingEvent.options.find((o) => !o.disabled)?.id ?? 'b');
    simulateTick(state);
    for (const b of [...state.bubbles]) if (randomAt('p', n++) < 0.7) collectBubble(state, b.id);
    for (const k of order) if (buyUpgrade(state, k)) break;
  }
  return state;
}

// --- Hasard à graine ---

test('V7 hasard : aucune occurrence de Math.random dans src/engine', () => {
  const dir = new URL('../src/engine/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const code = readFileSync(new URL(file, dir), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!code.includes('Math.random'), `${file} utilise encore Math.random`);
  }
});

test('V7 hasard : beginNewGame enregistre la graine, la souche et un compteur', () => {
  const state = createInitialState();
  beginNewGame(state, 'normal', { seed: 'abc', strain: 'rumeur' });
  assert.equal(state.seed, 'abc');
  assert.equal(state.strain, 'rumeur');
  assert.ok(Number.isInteger(state.rngCounter));
  beginNewGame(state, 'normal', { strain: 'inconnue' });
  assert.equal(state.strain, 'standard');
  assert.ok(typeof state.seed === 'string' && state.seed.length > 0, 'graine automatique si absente');
});

test('V7 hasard : même graine + mêmes actions = partie identique ; graine différente = partie différente', () => {
  const a = playFull('graine-1');
  const b = playFull('graine-1');
  const c = playFull('graine-2');
  assert.deepEqual(a, b);
  assert.notDeepEqual(
    { day: a.day, d: a.dominance, log: a.log },
    { day: c.day, d: c.dominance, log: c.log }
  );
});

test('V7 hasard : nextRandom avance le compteur et reste dans [0,1)', () => {
  const state = { seed: 'x', rngCounter: 0 };
  const values = Array.from({ length: 1000 }, () => nextRandom(state));
  assert.equal(state.rngCounter, 1000);
  for (const v of values) assert.ok(v >= 0 && v < 1);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, `distribution déséquilibrée (moyenne ${mean})`);
  assert.equal(randomAt('x', 5), randomAt('x', 5));
});

test('V7 hasard : une partie sauvegardée puis reprise continue exactement la même suite', () => {
  const a = v7Game('gora', 'reprise');
  advance(a, 150);
  const copy = JSON.parse(JSON.stringify(a));
  advance(a, 200);
  advance(copy, 200);
  assert.deepEqual(copy, a);
});

test('V7 dailySeed : date locale au format AAAA-MM-JJ', () => {
  assert.equal(dailySeed(new Date(2026, 9, 5, 12)), '2026-10-05');
  assert.match(dailySeed(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dailySeed(new Date('invalide')), /^\d{4}-\d{2}-\d{2}$/);
});

test('V7 hasard : deux défis du jour de même date sont strictement identiques', () => {
  const seed = dailySeed(new Date(2026, 9, 19));
  const a = v7Game('arca', seed, 'normal', { daily: true });
  const b = v7Game('arca', seed, 'normal', { daily: true });
  advance(a, 300);
  advance(b, 300);
  assert.deepEqual(a, b);
  assert.equal(a.dailyChallenge, true);
});

// --- Bulles ---

test('V7 bulles : naissent sur une région en crise, expirent après lifetimeDays', () => {
  const state = v7Game('fenwick', 'bulles');
  let seen = null;
  for (let i = 0; i < 200 && !seen; i++) {
    advance(state, 1);
    seen = state.bubbles.find((b) => b.kind === 'influence');
  }
  assert.ok(seen, 'une bulle d’influence doit apparaître');
  assert.ok(state.territories[seen.territoryId].crisis > 0, 'sur une région touchée');
  assert.equal(seen.expiresDay - seen.bornDay, BALANCE.bubbles.lifetimeDays);
  assert.ok(seen.value > 0);
  const id = seen.id;
  while (state.day < seen.expiresDay && state.status === 'playing') {
    if (state.pendingEvent) chooseEventOption(state, 'b');
    simulateTick(state);
  }
  assert.ok(!state.bubbles.some((b) => b.id === id), 'la bulle doit avoir expiré');
  assert.deepEqual(collectBubble(state, id).ok, false);
});

test('V7 bulles : collectBubble verse l’Influence de la bulle et la retire', () => {
  const state = v7Game('fenwick', 'collecte');
  let bubble;
  for (let i = 0; i < 200 && !bubble; i++) {
    advance(state, 1);
    bubble = state.bubbles.find((b) => b.kind === 'influence');
  }
  state.influence = 0;
  const res = collectBubble(state, bubble.id);
  assert.equal(res.ok, true);
  assert.equal(res.kind, 'influence');
  assert.ok(Math.abs(res.gain - bubble.value) < 0.01);
  assert.ok(Math.abs(state.influence - bubble.value) < 0.01);
  assert.equal(collectBubble(state, bubble.id).ok, false, 'une bulle ne se touche qu’une fois');
  assert.equal(collectBubble(state, 'inconnue').ok, false);
});

test('V7 bulles : une bulle « recherche » retire de la Réponse et ne revient pas au tick suivant', () => {
  const state = v7Game('fenwick', 'recherche');
  state.globalContainment = 30;
  state.bubbles.push({ id: 'r1', kind: 'research', territoryId: 'fenwick', value: 1, bornDay: state.day, expiresDay: state.day + 8 });
  const res = collectBubble(state, 'r1');
  assert.equal(res.ok, true);
  assert.equal(res.kind, 'research');
  assert.equal(state.globalContainment, 29);
  assert.ok(state.responseDebt > 0);
});

test('V7 bulles : revenu V6 retrouvé à ~70 % de bulles touchées (direct + bulles)', () => {
  // Règles identiques sauf les bulles ; Influence jamais dépensée et jamais
  // plafonnée : on compare le total encaissé.
  function earned(withBubbles, rate) {
    const original = BALANCE.influenceCap;
    BALANCE.influenceCap = Infinity;
    try {
      const state = v7Game('jotun', 'revenu', 'normal', {
        features: { bubbles: withBubbles, events: false, adaptation: false, stall: false }
      });
      let n = 0;
      for (let i = 0; i < 400; i++) {
        simulateTick(state);
        for (const b of [...state.bubbles]) {
          if (b.__seen) continue;
          b.__seen = true;
          if (randomAt('rate', n++) < rate) collectBubble(state, b.id);
        }
      }
      return state.influence;
    } finally {
      BALANCE.influenceCap = original;
    }
  }
  const v6 = earned(false, 0);
  const at70 = earned(true, 0.7);
  const at0 = earned(true, 0);
  assert.ok(Math.abs(at70 / v6 - 1) < 0.12, `à 70 % de bulles, revenu ${at70.toFixed(0)} vs V6 ${v6.toFixed(0)}`);
  assert.ok(at0 < v6 * (1 - BALANCE.bubbles.incomeShare) + 1, 'sans toucher aucune bulle, on perd la part des bulles');
});

// --- Capacités ---

test('V7 capacités : ABILITIES respecte le contrat', () => {
  assert.deepEqual(ABILITIES.map((a) => a.id), ['surge', 'jam', 'breach']);
  for (const a of ABILITIES) {
    assert.ok(a.label && a.description && a.cost > 0 && a.cooldownDays > 0);
    assert.ok(['territory', 'route'].includes(a.target));
  }
});

test('V7 capacités : Sursaut augmente la crise sans dépasser le plafond, coûte et recharge', () => {
  const state = v7Game('fenwick', 'sursaut');
  state.upgrades.dangerosity = 10;
  advance(state, 60);
  state.influence = 100;
  const targets = abilityTargets(state, 'surge');
  assert.ok(targets.includes('fenwick'));
  const before = state.territories.fenwick.crisis;
  const res = useAbility(state, 'surge', 'fenwick');
  assert.equal(res.ok, true);
  assert.ok(state.territories.fenwick.crisis > before);
  assert.ok(state.territories.fenwick.crisis <= Math.max(state.crisisCapHighWater, before) + 1e-9);
  assert.equal(state.influence, 100 - BALANCE.abilities.surge.cost);
  const st = abilityStatus(state, 'surge');
  assert.equal(st.available, false);
  assert.equal(st.readyInDays, BALANCE.abilities.surge.cooldownDays);
  assert.equal(useAbility(state, 'surge', 'fenwick').ok, false);
});

test('V7 capacités : Brouillage fige la conscience de la région ciblée', () => {
  const state = v7Game('fenwick', 'brouillage');
  advance(state, 200);
  state.influence = 100;
  assert.ok(abilityTargets(state, 'jam').includes('fenwick'));
  assert.equal(useAbility(state, 'jam', 'fenwick').ok, true);
  const frozen = state.territories.fenwick.awareness;
  state.features.events = false;
  for (let i = 0; i < BALANCE.abilities.jam.durationDays - 1; i++) simulateTick(state);
  assert.equal(state.territories.fenwick.awareness, frozen);
  simulateTick(state);
  simulateTick(state);
  assert.notEqual(state.territories.fenwick.awareness, frozen, 'la conscience repart après le brouillage');
});

test('V7 capacités : Percée rouvre une route fermée (clé a|b triée) et la protège', () => {
  const state = v7Game('fenwick', 'percee');
  const key = routeKey('jotun', 'fenwick');
  assert.equal(key, 'fenwick|jotun');
  assert.equal(abilityStatus(state, 'breach').available, false);
  closeRoute(state, key);
  state.influence = 100;
  assert.deepEqual(abilityTargets(state, 'breach'), [key]);
  assert.equal(useAbility(state, 'breach', 'jotun|fenwick').ok, false, 'clé non triée refusée');
  assert.equal(useAbility(state, 'breach', key).ok, true);
  assert.equal(isRouteClosed(state, key), false);
  assert.ok(state.routeShields[key] > state.day);
});

test('V7 capacités : toutes les routes sont des clés triées présentes dans EDGES', () => {
  assert.equal(ROUTE_KEYS.length, EDGES.length);
  for (const key of ROUTE_KEYS) {
    const [a, b] = key.split('|');
    assert.ok(a < b);
  }
});

test('V7 capacités : erreurs renvoyées sans lever (inconnue, cible invalide, pas d’Influence)', () => {
  const state = v7Game('fenwick', 'erreurs');
  assert.equal(useAbility(state, 'nope', 'fenwick').ok, false);
  state.influence = 0;
  const res = useAbility(state, 'surge', 'fenwick');
  assert.equal(res.ok, false);
  assert.match(res.error, /Influence/);
  state.influence = 100;
  assert.equal(useAbility(state, 'surge', 'atlantide').ok, false);
  assert.doesNotThrow(() => abilityStatus(null, 'surge'));
  assert.deepEqual(abilityTargets(null, 'surge'), []);
});

// --- Événements ---

test('V7 événements : ~30 événements à 2 options, textes en français', () => {
  assert.ok(EVENTS.length >= 28 && EVENTS.length <= 35, `${EVENTS.length} événements`);
  const ids = new Set();
  for (const e of EVENTS) {
    assert.ok(!ids.has(e.id), `id en double ${e.id}`);
    ids.add(e.id);
    assert.equal(e.options.length, 2);
    assert.ok(e.title && e.text.length > 30);
    for (const o of e.options) assert.ok(o.label && o.effectText);
  }
});

test('V7 événements : le premier arrive entre 30 et 40 jours, puis tous les 30-45 jours', () => {
  const state = v7Game('jotun', 'rythme');
  const days = [];
  for (let i = 0; i < 400 && state.status === 'playing'; i++) {
    if (state.pendingEvent) {
      days.push(state.day);
      chooseEventOption(state, state.pendingEvent.options.find((o) => !o.disabled)?.id ?? 'b');
    }
    simulateTick(state);
  }
  assert.ok(days[0] >= BALANCE.events.firstMin && days[0] <= BALANCE.events.firstMax, `premier au jour ${days[0]}`);
  for (let i = 1; i < days.length; i++) {
    const gap = days[i] - days[i - 1];
    assert.ok(gap >= BALANCE.events.intervalMin && gap <= BALANCE.events.intervalMax, `écart ${gap}`);
  }
  assert.ok(days.length >= 8);
});

test('V7 événements : pendingEvent met simulateTick en pause, chooseEventOption reprend', () => {
  const state = v7Game('jotun', 'pause');
  while (!state.pendingEvent) simulateTick(state);
  const day = state.day;
  const snapshot = JSON.stringify(state.territories);
  for (let i = 0; i < 10; i++) simulateTick(state);
  assert.equal(state.day, day);
  assert.equal(JSON.stringify(state.territories), snapshot);
  const p = state.pendingEvent;
  assert.ok(p.id && p.title && p.text && p.options.length === 2);
  assert.ok(!p.text.includes('{region}'));
  const opt = p.options.find((o) => !o.disabled);
  const res = chooseEventOption(state, opt.id);
  assert.equal(res.ok, true);
  assert.ok(res.resultText.length > 0);
  assert.equal(state.pendingEvent, null);
  simulateTick(state);
  assert.equal(state.day, day + 1);
});

test('V7 événements : option inconnue ou trop chère refusée sans lever', () => {
  const state = v7Game('jotun', 'refus');
  assert.equal(chooseEventOption(state, 'a').ok, false, 'aucun événement en attente');
  state.pendingEvent = { id: 'defector', title: 't', text: 't', options: [{ id: 'a', label: 'x', effectText: 'x' }, { id: 'b', label: 'y', effectText: 'y' }] };
  state.influence = 0;
  const res = chooseEventOption(state, 'a');
  assert.equal(res.ok, false);
  assert.match(res.error, /Influence/);
  assert.equal(chooseEventOption(state, 'zzz').ok, false);
  assert.equal(chooseEventOption(state, 'b').ok, true);
});

test('V7 événements : une option trop chère est marquée disabled et se réactive si l’Influence remonte', () => {
  const state = v7Game('jotun', 'disabled');
  state.influence = 0;
  state.pendingEvent = { id: 'defector', title: 't', text: 't', options: [{ id: 'a', label: 'x', effectText: 'x' }, { id: 'b', label: 'y', effectText: 'y' }] };
  simulateTick(state);
  assert.equal(state.pendingEvent.options[0].disabled, true);
  assert.ok(state.pendingEvent.options[0].reason);
  state.influence = 100;
  simulateTick(state);
  assert.ok(!state.pendingEvent.options[0].disabled);
});

test('V7 événements : tirés selon la phase (aucun événement « tardif » en début de partie)', () => {
  const lateOnly = new Set(EVENTS.filter((e) => e.phases.length === 1 && e.phases[0] === 'late').map((e) => e.id));
  const state = v7Game('jotun', 'phase');
  for (let i = 0; i < 300 && state.status === 'playing'; i++) {
    if (state.pendingEvent) {
      if (state.globalContainment < BALANCE.humanity.mobilizationThreshold) assert.ok(!lateOnly.has(state.pendingEvent.id));
      chooseEventOption(state, state.pendingEvent.options.find((o) => !o.disabled)?.id ?? 'b');
    }
    simulateTick(state);
  }
});

// --- Adaptation ---

test('V7 adaptation : à chaque nouvelle phase, la branche la plus développée perd 25 % pendant 60 jours', () => {
  const state = v7Game('fenwick', 'adapt');
  state.upgrades.dangerosity = 6;
  state.upgrades.propagation = 2;
  state.globalMobilization = 80;
  state.globalAwareness = 60;
  for (const t of TERRITORIES) state.territories[t.id].awareness = 60;
  let guard = 0;
  while (!state.adaptation && guard++ < 50) {
    if (state.pendingEvent) chooseEventOption(state, 'b');
    simulateTick(state);
  }
  assert.ok(state.adaptation, 'une adaptation doit avoir lieu au changement de phase');
  assert.equal(state.adaptation.branch, 'dangerosity');
  assert.equal(state.adaptation.factor, 0.75);
  // Déclenchée pendant le tick, avant le passage au jour suivant.
  assert.equal(state.adaptation.untilDay - (state.day - 1), BALANCE.adaptation.durationDays);
  assert.equal(effectiveLevel(state, 'dangerosity'), 4.5);
  assert.equal(effectiveLevel(state, 'propagation'), 2);
  assert.ok(progressBlockers(state).some((b) => b.kind === 'adaptation'));
});

test('V7 adaptation : désactivée en mode classique (règles V6)', () => {
  const state = createInitialState();
  beginNewGame(state, 'normal');
  confirmOrigin(state, 'fenwick');
  state.upgrades.dangerosity = 6;
  for (let i = 0; i < 600 && state.status === 'playing'; i++) simulateTick(state);
  assert.equal(state.adaptation, null);
});

// --- Mur des 93 % et obstacles ---

test('V7 gravité : la montée ralentit progressivement sous le plafond au lieu de buter net', () => {
  function crisisAfter(softCap) {
    const state = v7Game('fenwick', 'soft', 'normal', { features: { softCap, events: false, bubbles: false, adaptation: false } });
    state.day = 600;
    state.upgrades.dangerosity = 4;
    // Plafond de Dangerosité 4 = 72,5 : on part à 4 points sous ce plafond.
    state.territories.fenwick.crisis = 68.5;
    state.crisisCapHighWater = 0;
    simulateTick(state);
    return state.territories.fenwick.crisis;
  }
  assert.ok(crisisAfter(true) < crisisAfter(false), 'près du plafond, la croissance est freinée');
});

test('V7 obstacles : « Gravité plafonnée : Dangerosité 8 requise » quand les régions butent', () => {
  const state = v7Game('fenwick', 'mur');
  state.upgrades.dangerosity = 5;
  state.territories.fenwick.crisis = 78;
  state.crisisCapHighWater = 79;
  const blockers = progressBlockers(state);
  const cap = blockers.find((b) => b.kind === 'gravity-cap');
  assert.ok(cap);
  assert.equal(cap.text, 'Gravité plafonnée : Dangerosité 8 requise');
  state.upgrades.dangerosity = 8;
  state.crisisCapHighWater = 100;
  assert.ok(!progressBlockers(state).some((b) => b.kind === 'gravity-cap'));
  assert.deepEqual(progressBlockers(null), []);
});

// --- Projection ---

test('V7 projection : forecastRace n’altère pas l’état et donne des jours futurs', () => {
  const state = v7Game('jotun', 'proj');
  state.upgrades.dangerosity = 8;
  state.upgrades.propagation = 6;
  state.upgrades.resilience = 8;
  advance(state, 200);
  const before = JSON.stringify(state);
  const f = forecastRace(state);
  assert.equal(JSON.stringify(state), before);
  assert.ok('ruptureDay' in f && 'controlDay' in f);
  assert.ok(f.ruptureDay === null || f.ruptureDay > state.day);
  assert.ok(f.controlDay === null || f.controlDay > state.day);
  assert.ok(f.ruptureDay !== null || f.controlDay !== null);
  assert.deepEqual(forecastRace(createInitialState()), { ruptureDay: null, controlDay: null });
});

// --- Fin de partie ---

test('V7 fin : outcome rempli à la victoire, avec étoiles 1-3', () => {
  const state = v7Game('fenwick', 'fin');
  state.upgrades.dangerosity = 10;
  for (const t of TERRITORIES) state.territories[t.id].crisis = 100;
  state.crisisCapHighWater = 100;
  simulateTick(state);
  assert.equal(state.status, 'victory');
  assert.equal(state.outcome.result, 'victory');
  assert.equal(state.outcome.reason, 'rupture');
  assert.equal(state.outcome.day, state.day);
  assert.ok(state.outcome.stars >= 1 && state.outcome.stars <= 3);
  assert.equal(state.endReason, 'dominance', 'endReason V6 conservé pour l’écran de fin');
});

test('V7 fin : égalité au même tick tranchée et expliquée (tie)', () => {
  const state = v7Game('fenwick', 'egalite');
  state.upgrades.dangerosity = 10;
  for (const t of TERRITORIES) {
    state.territories[t.id].crisis = 100;
    state.territories[t.id].awareness = 100;
  }
  state.crisisCapHighWater = 100;
  state.globalMobilization = 100;
  state.globalContainment = 99.99;
  simulateTick(state);
  assert.equal(state.outcome.reason, 'tie');
  assert.equal(state.outcome.result, 'victory');
  assert.match(state.log[0], /Égalité/);
});

test('V7 fin : défaite par la Réponse -> reason control', () => {
  const state = v7Game('fenwick', 'control');
  for (const t of TERRITORIES) state.territories[t.id].awareness = 100;
  state.globalMobilization = 100;
  state.globalContainment = 99.99;
  simulateTick(state);
  assert.equal(state.status, 'defeat');
  assert.equal(state.outcome.reason, 'control');
  assert.equal(state.outcome.stars, 0);
});

test('V7 fin : une partie figée se termine par une défaite anticipée expliquée (stalled), bien avant le jour 2200', () => {
  const state = v7Game('jotun', 'figee');
  advance(state, 3000);
  assert.equal(state.status, 'defeat');
  assert.equal(state.outcome.reason, 'stalled');
  assert.ok(state.day < 1000, `partie passive terminée au jour ${state.day}`);
  assert.match(state.log[0], /course est jouée/);
});

test('V7 fin : une partie qui progresse encore n’est jamais déclarée figée', () => {
  const state = v7Game('jotun', 'progresse');
  state.stall.sinceDay = 0;
  state.day = 400;
  // La Progression recalculée par le tick dépasse le meilleur score retenu.
  state.stall.bestDominance = 0;
  state.globalContainment = 50;
  simulateTick(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.stall.sinceDay, state.day);
});

// --- Souches ---

test('V7 souches : 4 souches du contrat, multiplicateurs appliqués', () => {
  assert.deepEqual(STRAINS.map((s) => s.id), ['standard', 'rumeur', 'fracture', 'echo']);
  for (const s of STRAINS) assert.ok(s.label && s.description && typeof s.unlockStars === 'number');
  assert.equal(STRAINS[0].unlockStars, 0);
  function spreadAfter(strain) {
    const state = v7Game('fenwick', 'souche', 'normal', { strain, features: { events: false } });
    advance(state, 250);
    return TERRITORIES.reduce((sum, t) => sum + state.territories[t.id].crisis, 0);
  }
  assert.ok(spreadAfter('rumeur') > spreadAfter('standard'), 'Rumeur se propage plus vite');
});

// --- Rythme ---

test('V7 rythme : tension liée au calendrier seul (escalationWeight = 0, gardé V6 après mesure)', () => {
  assert.equal(BALANCE.tension.escalationWeight, 0);
  assert.equal(tensionAt(300, 90), tensionAt(300, 0));
  const original = BALANCE.tension.escalationWeight;
  BALANCE.tension.escalationWeight = 0.5;
  try {
    assert.ok(tensionAt(300, 90) > tensionAt(300, 0), 'l’option mesurée avance la tension avec l’escalade');
    assert.ok(tensionAt(300, 0) >= tensionAt(300), 'jamais sous le calendrier');
  } finally {
    BALANCE.tension.escalationWeight = original;
  }
});

// --- Sauvegarde ---

test('V7 sauvegarde : SAVE_VERSION 7 et migration 6 -> 7 sans renommer aucune clé', () => {
  assert.equal(SAVE_VERSION, 7);
  const v6 = createInitialState();
  beginNewGame(v6, 'normal');
  confirmOrigin(v6, 'kelsor');
  for (let i = 0; i < 120; i++) simulateTick(v6);
  const raw = JSON.parse(JSON.stringify(v6));
  for (const key of ['seed', 'rngCounter', 'strain', 'dailyChallenge', 'features', 'bubbles', 'bubbleSeq', 'bubblePool', 'nextInfluenceBubbleDay',
    'nextResearchBubbleDay', 'bubblesSpawned', 'bubblesCollected', 'abilityCooldowns', 'abilityUses', 'jams', 'routeShields', 'pendingEvent',
    'nextEventDay', 'seenEvents', 'eventHistory', 'eventMods', 'adaptation', 'stall', 'outcome']) delete raw[key];
  raw.version = 6;
  const migrated = migrateSave(raw, 7);
  assert.ok(migrated);
  assert.equal(migrated.version, 7);
  for (const key of Object.keys(raw)) if (key !== 'version') assert.deepEqual(migrated[key], raw[key], `clé ${key} modifiée`);
  assert.deepEqual(Object.keys(migrated.territories).sort(), TERRITORIES.map((t) => t.id).sort());
  assert.ok(migrated.seed && Number.isInteger(migrated.rngCounter));
  assert.equal(migrated.strain, 'standard');
  assert.deepEqual(migrated.bubbles, []);
  assert.equal(migrated.pendingEvent, null);
  assert.ok(migrated.nextEventDay > migrated.day, 'pas d’événement immédiat à la reprise');
  assert.equal(migrated.features.bubbles, true);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 300 && migrated.status === 'playing'; i++) {
      if (migrated.pendingEvent) chooseEventOption(migrated, 'b');
      simulateTick(migrated);
    }
  });
});

test('V7 sauvegarde : une partie V6 terminée reçoit un outcome reconstitué', () => {
  const raw = { ...JSON.parse(JSON.stringify(createInitialState())), version: 6, status: 'victory', endReason: 'dominance', day: 450, difficulty: 'normal' };
  delete raw.outcome;
  const migrated = migrateSave(raw, 7);
  assert.equal(migrated.outcome.result, 'victory');
  assert.equal(migrated.outcome.reason, 'rupture');
  assert.equal(migrated.outcome.stars, 3);
  const timeout = migrateSave({ ...raw, status: 'defeat', endReason: 'timeout' }, 7);
  assert.equal(timeout.outcome.reason, 'stalled');
});

test('V7 sauvegarde : chaîne complète 3 -> 7', () => {
  const v3 = { version: 3, globalContainment: 10, day: 100, territories: { arca: { crisis: 10, awareness: 20 } } };
  const migrated = migrateSave(v3, 7);
  assert.equal(migrated.version, 7);
  assert.ok(migrated.seed);
});

// --- Contrat : fonctions sûres ---

test('V7 contrat : confirmOrigin affiche le nom et refuse une origine inconnue sans lever', () => {
  const state = createInitialState();
  beginNewGame(state, 'normal', { seed: 'nom' });
  assert.equal(confirmOrigin(state, 'atlantide').ok, false);
  assert.equal(state.status, 'selecting-origin');
  assert.equal(confirmOrigin(state, 'fenwick').ok, true);
  assert.match(state.log[0], /Fenwick/);
});

test('V7 contrat : fermetures de frontière nommées (plus de « un territoire voisin »)', () => {
  const state = v7Game('fenwick', 'frontiere');
  state.upgrades.dangerosity = 10;
  state.upgrades.propagation = 10;
  advance(state, 500);
  const lines = state.log.filter((l) => l.includes('ferme sa frontière'));
  for (const l of lines) assert.ok(!l.includes('un territoire voisin'), l);
});
