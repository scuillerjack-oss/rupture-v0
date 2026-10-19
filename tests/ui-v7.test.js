// V7 — tests de l'interface (écran de jeu, modèle d'affichage, méta, production)
// avec un FAUX state qui contient les champs du contrat docs/V7-contrat-api.md
// (bubbles, pendingEvent, abilityCooldowns, outcome, adaptation…) et un faux
// moteur injecté par registerEngine (le vrai moteur V7 est écrit en parallèle).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './helpers/fakeDom.js';

const data = new Map();
globalThis.localStorage = {
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => data.set(k, String(v)),
  removeItem: (k) => data.delete(k)
};
installFakeDom();

const { createInitialState, beginNewGame, confirmOrigin } = await import('../src/engine/state.js');
const engine = await import('../src/ui/engineV7.js');
const model = await import('../src/ui/playModel.js');
const { createPlayScreen } = await import('../src/ui/playScreen.js');
const { confirmOriginLabel } = await import('../src/ui/originScreen.js');
const screens = await import('../src/ui/screens.js');
const save = await import('../src/save.js');
const { versionLabel } = await import('../src/config/version.js');
const { nextSpeed } = await import('../src/ui/hud.js');
const { versionCodeFor, readPackageVersion } = await import('../scripts/android-version.js');
const { betaConfig, BETA_URL } = await import('../scripts/apk-beta-config.js');

const ABILITIES = [
  { id: 'surge', label: 'Sursaut', description: '+crise', cost: 15, cooldownDays: 40, target: 'territory' },
  { id: 'jam', label: 'Brouillage', description: 'gèle', cost: 20, cooldownDays: 60, target: 'territory' },
  { id: 'breach', label: 'Percée', description: 'rouvre', cost: 25, cooldownDays: 80, target: 'route' }
];

function fakeEngine() {
  engine.registerEngine({
    ABILITIES,
    abilityStatus: (s, id) => {
      const a = ABILITIES.find((x) => x.id === id);
      const readyAt = s.abilityCooldowns?.[id] ?? 0;
      return { available: readyAt <= s.day && s.influence >= a.cost, reason: readyAt > s.day ? 'En recharge' : 'Influence insuffisante', cost: a.cost, readyInDays: Math.max(0, readyAt - s.day) };
    },
    abilityTargets: (_s, id) => (id === 'breach' ? ['esser|fenwick'] : ['jotun', 'gora']),
    forecastRace: () => ({ ruptureDay: 412, controlDay: 455 }),
    progressBlockers: () => [{ kind: 'gravity-cap', text: 'Gravité plafonnée : Dangerosité 8 requise' }]
  });
}

function fakeState() {
  const s = createInitialState();
  beginNewGame(s, 'normal');
  confirmOrigin(s, 'fenwick');
  s.day = 100;
  s.influence = 60;
  s.bubbles = [{ id: 'b1', kind: 'influence', territoryId: 'gora', value: 7, bornDay: 100, expiresDay: 108 }];
  s.pendingEvent = null;
  s.abilityCooldowns = { jam: 130 };
  s.adaptation = { branch: 'propagation', factor: 0.75, untilDay: 160 };
  s.outcome = null;
  return s;
}

const noop = () => {};
const actions = new Proxy({}, { get: (t, k) => t[k] ?? noop, set: (t, k, v) => { t[k] = v; return true; } });

test('rendu incrémental : les éléments de l\'écran de jeu sont créés une fois puis réutilisés', () => {
  fakeEngine();
  const screen = createPlayScreen(actions);
  const s = fakeState();
  screen.update(s, { targeting: null, lastSpeed: 1 });
  const buyBefore = screen.el.find((n) => n.dataset?.kind === 'propagation' && n.classList.contains('up-buy'));
  const nodesBefore = [...screen.el.walk()].length;
  for (let i = 0; i < 20; i += 1) {
    s.day += 1;
    s.influence += 3;
    screen.update(s, { targeting: null, lastSpeed: 1 });
  }
  const buyAfter = screen.el.find((n) => n.dataset?.kind === 'propagation' && n.classList.contains('up-buy'));
  assert.equal(buyAfter, buyBefore, 'le bouton d\'achat ne doit jamais être recréé pendant que le temps passe');
  assert.equal([...screen.el.walk()].length, nodesBefore);
  engine.resetEngineOverrides();
});

test('bug V6 « taps perdus » : un achat touché entre deux ticks est bien transmis', () => {
  fakeEngine();
  const bought = [];
  const screen = createPlayScreen({ ...actions, buy: (k) => bought.push(k) });
  const s = fakeState();
  screen.update(s, { targeting: null, lastSpeed: 1 });
  const btn = screen.el.find((n) => n.dataset?.kind === 'dangerosity' && n.classList.contains('up-buy'));
  s.day += 1; screen.update(s, { targeting: null, lastSpeed: 1 }); // tick
  btn.click(); // tap juste après
  s.day += 1; screen.update(s, { targeting: null, lastSpeed: 1 }); // tick
  assert.deepEqual(bought, ['dangerosity']);
  engine.resetEngineOverrides();
});

test('écran de jeu : capacités, projection, obstacle et adaptation affichés depuis le contrat', () => {
  fakeEngine();
  const screen = createPlayScreen(actions);
  const s = fakeState();
  screen.update(s, { targeting: null, lastSpeed: 1 });
  const text = (cls) => screen.el.byClass(cls)?.textContent;
  assert.match(text('chip-forecast'), /Rupture prévue jour ~410 \/ Maîtrise ~455/);
  assert.match(text('chip-blocker'), /Gravité plafonnée : Dangerosité 8 requise/);
  assert.match(text('chip-adapt'), /Propagation −25% jusqu'au jour 160/);
  const abilityBtns = screen.el.findAll((n) => n.classList.contains('ability-btn'));
  assert.equal(abilityBtns.length, 3);
  const jam = abilityBtns.find((b) => b.dataset.ability === 'jam');
  assert.match(jam.textContent, /30 j/, 'une capacité en recharge affiche les jours restants');
  engine.resetEngineOverrides();
});

test('fenêtre d\'événement : 2 options, option désactivée expliquée, choix transmis', () => {
  const chosen = [];
  const screen = createPlayScreen({ ...actions, chooseOption: (id) => chosen.push(id) });
  const s = fakeState();
  s.pendingEvent = { id: 'ev', title: 'Manifestation', text: 'La foule.', territoryId: 'gora', options: [
    { id: 'a', label: 'Attiser', effectText: '+12 Influence' },
    { id: 'b', label: 'Se cacher', effectText: '−8', disabled: true, reason: 'Requiert Discrétion 2' }
  ] };
  screen.update(s, { targeting: null, lastSpeed: 1 });
  const layer = screen.el.byClass('event-layer');
  assert.equal(layer.hidden, false);
  assert.match(layer.textContent, /Gora/, 'le lieu est affiché par son nom');
  const opts = layer.findAll((n) => n.classList.contains('event-option'));
  assert.equal(opts.length, 2);
  assert.match(opts[1].textContent, /Requiert Discrétion 2/);
  opts[1].click();
  opts[0].click();
  assert.deepEqual(chosen, ['a']);
  s.pendingEvent = null;
  screen.update(s, { targeting: null, lastSpeed: 1 });
  assert.equal(layer.hidden, true);
});

test('mode ciblage : bandeau visible avec « Annuler »', () => {
  const cancelled = [];
  const screen = createPlayScreen({ ...actions, cancelTargeting: () => cancelled.push(1) });
  const s = fakeState();
  screen.update(s, { targeting: { abilityId: 'surge', kind: 'territory', label: 'Sursaut', validTargets: ['jotun'] }, lastSpeed: 1 });
  const banner = screen.el.byClass('target-banner');
  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /Sursaut : touche une région/);
  banner.byClass('target-cancel').click();
  assert.equal(cancelled.length, 1);
});

test('bug V6 : « Commencer à Fenwick », jamais l\'identifiant', () => {
  assert.equal(confirmOriginLabel('fenwick'), 'Commencer à Fenwick');
  assert.equal(model.originCard('boreal').name, 'Boréal');
});

test('bug V6 : le journal affiche des noms et plus la consigne périmée de choix d\'origine', () => {
  const s = createInitialState();
  beginNewGame(s, 'normal');
  assert.match(model.latestLogLine(s), /Choisissez un territoire/);
  confirmOrigin(s, 'fenwick');
  const lines = model.visibleLog(s);
  assert.ok(lines.every((l) => !/Choisissez un territoire/.test(l)), 'consigne périmée retirée une fois la partie lancée');
  assert.match(lines[0], /Point de départ : Fenwick/);
  assert.doesNotMatch(lines.join(' '), /\bfenwick\b/);
});

test('bug V6 : le menu affiche la version réelle (package.json), plus « V5 »', () => {
  const html = screens.renderMenu({ hasSave: false, version: '7.0.0', env: 'beta' });
  assert.match(html, /V7\.0\.0/);
  assert.doesNotMatch(html, /V5/);
  assert.equal(versionLabel('7.0.0', 'commercial'), 'V7.0.0');
  assert.equal(readPackageVersion(), '7.0.0');
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(vite, /__APP_VERSION__/);
});

test('menu : défi du jour et étoiles ; choix de partie : souches verrouillées par les étoiles', () => {
  engine.registerEngine({ STRAINS: [
    { id: 'standard', label: 'Standard', description: '', unlockStars: 0 },
    { id: 'rumeur', label: 'Rumeur', description: 'vite', unlockStars: 3 },
    { id: 'echo', label: 'Écho', description: 'discrète', unlockStars: 10 }
  ] });
  // Format réel de src/engine/meta.js : étoiles = somme de bestStars.
  const meta = { ...engine.createMeta(), bestStars: { 'normal:standard': 3, 'hard:standard': 1 } };
  assert.equal(engine.metaStars(meta), 4);
  const menu = screens.renderMenu({ hasSave: true, meta, daily: { seed: '2026-10-19', record: { played: 1, won: true, bestStars: 2, bestDay: 380 } } });
  assert.match(menu, /Défi du jour/);
  assert.match(menu, /jour 380/);
  assert.match(menu, /4 ★/);
  const picker = screens.renderDifficultyPicker('normal', { meta, pendingStrain: 'standard' });
  assert.match(picker, /data-strain="rumeur" (?!disabled)/);
  assert.match(picker, /data-strain="echo" disabled/);
  assert.match(picker, /Débloquée à 10 ★/);
  engine.resetEngineOverrides();
});

test('écran de fin : étoiles, record, chronologie, Rejouer / Menu ; égalité et défaite anticipée expliquées', () => {
  const s = fakeState();
  s.outcome = { result: 'victory', reason: 'rupture', day: 398, stars: 2 };
  s.phaseLog = [{ key: 'conscience', label: 'Conscience', day: 120 }];
  let html = screens.renderEnd(s, { record: { newRecord: true }, starsGained: 2 });
  assert.match(html, /★★☆/);
  assert.match(html, /Nouveau record/);
  assert.match(html, /Éveil à Fenwick/);
  assert.match(html, /data-action="replay"/);
  assert.match(html, /data-action="go-menu"/);
  s.outcome = { result: 'defeat', reason: 'tie', day: 450, stars: 0 };
  html = screens.renderEnd(s);
  assert.match(html, /ÉGALITÉ/);
  assert.match(html, /même instant/);
  s.outcome = { result: 'defeat', reason: 'stalled', day: 520, stars: 0 };
  html = screens.renderEnd(s);
  assert.match(html, /DÉFAITE ANTICIPÉE/);
  assert.match(html, /ne bougeait plus/);
  s.outcome = { result: 'defeat', reason: 'stalled', day: 520, stars: 0, text: 'Texte du moteur.' };
  assert.match(screens.renderEnd(s), /Texte du moteur\./, 'outcome.text du moteur est prioritaire');
});

test('méta locale : étoiles et records stockés ; défi du jour avec record personnel', () => {
  const s = fakeState();
  s.status = 'victory';
  s.outcome = { result: 'victory', reason: 'rupture', day: 400, stars: 3 };
  const r = engine.recordGame(engine.createMeta(), s);
  assert.equal(r.starsGained, engine.starsFor(s));
  assert.ok(r.starsGained >= 1);
  save.saveMeta(r.meta);
  assert.equal(engine.metaStars(save.loadMeta()), r.starsGained, 'la méta stockée par save.js se relit à l\'identique');
  const again = engine.recordGame(save.loadMeta(), s);
  assert.equal(again.starsGained, 0, 'rejouer le même résultat ne redonne pas d\'étoiles');
  const d1 = save.recordDailyResult('2026-10-19', { won: true, stars: 2, day: 420 });
  assert.equal(d1.newRecord, true);
  const d2 = save.recordDailyResult('2026-10-19', { won: true, stars: 2, day: 450 });
  assert.equal(d2.newRecord, false);
  assert.equal(save.getDailyRecord('2026-10-19').bestDay, 420);
  assert.equal(engine.dailySeed(new Date(2026, 9, 5)), '2026-10-05');
});

test('replis sûrs : sans moteur V7, aucune fonction ne lève et l\'interface reste neutre', () => {
  // Simule un moteur où les noms V7 sont ABSENTS (surcharges à null).
  engine.registerEngine(Object.fromEntries(['ABILITIES', 'abilityTargets', 'abilityStatus', 'useAbility', 'collectBubble',
    'forecastRace', 'progressBlockers', 'chooseEventOption', 'STRAINS', 'createMeta', 'recordGame', 'starsFor', 'totalStars'].map((n) => [n, null])));
  const s = fakeState();
  assert.deepEqual(engine.getAbilities(), []);
  assert.deepEqual(engine.abilityTargets(s, 'surge'), []);
  assert.equal(engine.useAbility(s, 'surge', 'gora').ok, false);
  assert.equal(engine.collectBubble(s, 'b1').ok, false);
  assert.equal(model.forecastText(s), null);
  s.pendingEvent = { id: 'x', options: [] };
  assert.equal(engine.chooseEventOption(s, 'a').ok, true);
  assert.equal(s.pendingEvent, null, 'le repli ne laisse jamais la partie bloquée sur un événement');
  assert.equal(engine.getStrains().length, 1);
  assert.equal(engine.recordGame(engine.createMeta(), { ...s, status: 'victory', difficulty: 'normal' }).starsGained >= 1, true);
  engine.resetEngineOverrides();
});

test('beginNewGame reçoit TOUJOURS un objet d\'options (sinon le moteur reste en règles V6)', () => {
  const calls = [];
  engine.registerEngine({ beginNewGame: (...a) => calls.push(a) });
  engine.beginNewGame({}, 'normal');
  engine.beginNewGame({}, 'hard', { seed: '2026-10-19', strain: 'standard', daily: true });
  assert.deepEqual(calls[0][2], {});
  assert.equal(calls[1][2].daily, true);
  engine.resetEngineOverrides();
});

test('vitesse : ×1 → ×2 → ×4 → ×1', () => {
  assert.equal(nextSpeed(1, [1, 2, 4]), 2);
  assert.equal(nextSpeed(4, [1, 2, 4]), 1);
});

test('production : build commercial sans « simulation » ni achat gratuit ; Premium = sans pub', () => {
  const menu = screens.renderGameMenu('settings', null, { env: 'commercial', isPremium: false, purchaseAvailable: false });
  assert.doesNotMatch(menu, /[Ss]imul/);
  assert.doesNotMatch(menu, /premium-purchase-test|test-badge/);
  assert.match(menu, /Sans pub/);
  assert.doesNotMatch(menu, /×4 Premium|débloque la vitesse/);
  assert.doesNotMatch(screens.renderInterstitialAd('commercial'), /[Ss]imul|test/);
  const beta = screens.renderGameMenu('settings', null, { env: 'beta', isPremium: false });
  assert.match(beta, /aucun paiement/);
});

test('production : base relative, versionCode automatique, APK de bêta chargé depuis GitHub Pages', () => {
  assert.match(readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8'), /base: '\.\/'/);
  assert.equal(versionCodeFor('7.0.0'), 70000000);
  assert.equal(versionCodeFor('7.0.0', 42), 70000042);
  assert.ok(versionCodeFor('7.1.0', 0) > versionCodeFor('7.0.0', 999));
  const cfg = betaConfig(JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8')));
  assert.equal(cfg.server.url, BETA_URL);
  assert.equal(BETA_URL, 'https://scuillerjack-oss.github.io/rupture-v0/');
  const committed = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(committed.server?.url, undefined, 'l\'AAB garde le jeu embarqué : pas de server.url committé');
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.start_url, './');
});

test('relecture V7 : la projection n’est recalculée qu’une fois par jour de jeu', async () => {
  const sim = await import('../src/engine/simulation.js');
  const st = await import('../src/engine/state.js');
  const { forecastText } = await import('../src/ui/playModel.js');
  const state = st.createInitialState ? st.createInitialState() : null;
  if (!state || !sim.beginNewGame) return;
  sim.beginNewGame(state, 'normal', { seed: 'cache-test' });
  const a = forecastText(state); const b = forecastText(state);
  assert.deepEqual(a, b);
});

test('relecture V7 : le texte d’égalité de repli donne la victoire à l’Anomalie (comme le moteur)', async () => {
  const { END_TEXTS } = await import('../src/ui/playModel.js');
  assert.match(END_TEXTS.tie, /Anomalie l'emporte/);
});
