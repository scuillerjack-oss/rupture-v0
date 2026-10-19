// Démo autonome de la carte V7 (sans le reste du jeu).
// Assemblage : node tools/carte/build-demo.mjs  -> tools/carte/dist/
import { createWorldMap, routeKey } from '../../src/ui/worldMap.js';
import { TERRITORIES, EDGES } from '../../src/engine/territories.js';

const params = new URLSearchParams(location.search);

// Faux état : crises variées, conscience, confinement, routes fermées, bulles.
const SCENARIO = {
  fenwick: { crisis: 92, awareness: 70, containment: 40, closed: ['gora'] },
  boreal: { crisis: 78, awareness: 55, containment: 32, closed: [] },
  esser: { crisis: 55, awareness: 35, containment: 18, closed: ['halvern'] },
  arca: { crisis: 30, awareness: 20, containment: 8, closed: [] },
  jotun: { crisis: 64, awareness: 48, containment: 25, closed: [] },
  ismer: { crisis: 20, awareness: 12, containment: 4, closed: [] },
  kelsor: { crisis: 12, awareness: 85, containment: 55, closed: ['corvel', 'tenlow'] },
  cindra: { crisis: 6, awareness: 4, containment: 0, closed: [] },
  meridia: { crisis: 40, awareness: 22, containment: 10, closed: [] }
};

function makeState() {
  const territories = {};
  for (const t of TERRITORIES) {
    const s = SCENARIO[t.id] || { crisis: 0, awareness: 0, containment: 0, closed: [] };
    territories[t.id] = { id: t.id, crisis: s.crisis, awareness: s.awareness, containment: s.containment, closedRoutes: [...s.closed] };
  }
  return {
    day: 120,
    originId: 'fenwick',
    selectedId: 'jotun',
    territories,
    bubbles: [
      { id: 1, kind: 'influence', territoryId: 'fenwick', value: 6, bornDay: 116, expiresDay: 124 },
      { id: 2, kind: 'influence', territoryId: 'boreal', value: 4, bornDay: 119, expiresDay: 127 },
      { id: 3, kind: 'research', territoryId: 'kelsor', value: 1, bornDay: 113, expiresDay: 121 },
      { id: 4, kind: 'influence', territoryId: 'jotun', value: 12, bornDay: 118, expiresDay: 126 }
    ]
  };
}

const state = makeState();
let mode = params.get('mode') === 'origin' ? 'origin' : 'play';
let targeting = null;
let running = true;
let nextBubble = 10;
const logEl = document.getElementById('log');
const log = (m) => (logEl.textContent = m);

const map = createWorldMap(document.getElementById('map'), {
  onTerritoryTap(id, info) {
    state.selectedId = id;
    if (targeting) {
      log(info?.valid ? `Capacité « ${targeting.abilityId} » lancée sur ${id}` : `${id} n'est pas une cible valide`);
      if (info?.valid) setTargeting(null);
    } else {
      log(`Territoire touché : ${id}`);
    }
    refresh();
  },
  onBubbleTap(id) {
    const b = state.bubbles.find((x) => x.id === id);
    state.bubbles = state.bubbles.filter((x) => x.id !== id);
    log(b ? `Bulle ${b.kind === 'research' ? 'bleue' : 'rouge'} touchée (${b.territoryId})` : `Bulle ${id}`);
    refresh();
  },
  onRouteTap(key) {
    const [a, b] = key.split('|');
    state.territories[a].closedRoutes = state.territories[a].closedRoutes.filter((x) => x !== b);
    state.territories[b].closedRoutes = state.territories[b].closedRoutes.filter((x) => x !== a);
    log(`Percée sur la route ${key}`);
    setTargeting(null);
    refresh();
  }
});

function validFor(kind) {
  if (kind === 'route') {
    return EDGES.filter(([a, b]) => state.territories[a].closedRoutes.includes(b) || state.territories[b].closedRoutes.includes(a)).map(
      ([a, b]) => routeKey(a, b)
    );
  }
  return TERRITORIES.filter((t) => state.territories[t.id].crisis > 0).map((t) => t.id);
}
function setTargeting(id) {
  targeting = id ? { abilityId: id, kind: id === 'breach' ? 'route' : 'territory', validTargets: validFor(id === 'breach' ? 'route' : 'territory') } : null;
  for (const b of document.querySelectorAll('[data-target]')) b.classList.toggle('on', targeting?.abilityId === b.dataset.target);
}
function refresh() {
  map.update(state, { mode, targeting });
}

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    for (const x of document.querySelectorAll('[data-mode]')) x.classList.toggle('on', x === b);
    if (mode === 'origin') setTargeting(null);
    refresh();
  });
}
for (const b of document.querySelectorAll('[data-target]')) {
  b.addEventListener('click', () => {
    setTargeting(targeting?.abilityId === b.dataset.target ? null : b.dataset.target);
    refresh();
  });
}
document.querySelector('[data-run]').addEventListener('click', (e) => {
  running = !running;
  e.target.textContent = running ? 'Pause' : 'Lecture';
});

if (params.get('target')) setTargeting(params.get('target'));
for (const x of document.querySelectorAll('[data-mode]')) x.classList.toggle('on', x.dataset.mode === mode);

// Boucle ≈ 4 mises à jour / s : la crise monte, des bulles naissent et expirent.
const ids = TERRITORIES.map((t) => t.id);
let rnd = 7;
const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
let updates = 0;
let updateMs = 0;
setInterval(() => {
  if (running && params.get('still') === null) {
    state.day += 0.25;
    for (const id of ids) {
      const ts = state.territories[id];
      if (ts.crisis > 0) ts.crisis = Math.min(100, ts.crisis + 0.15);
      ts.awareness = Math.min(100, ts.awareness + 0.05);
    }
    state.bubbles = state.bubbles.filter((b) => b.expiresDay > state.day);
    if (rand() < 0.08 && state.bubbles.length < 6) {
      const hot = ids.filter((id) => state.territories[id].crisis > 15);
      const t = hot[Math.floor(rand() * hot.length)];
      state.bubbles.push({ id: nextBubble++, kind: rand() < 0.25 ? 'research' : 'influence', territoryId: t, value: Math.round(2 + rand() * 8), bornDay: state.day, expiresDay: state.day + 8 });
    }
  }
  const t0 = performance.now();
  refresh();
  updateMs += performance.now() - t0;
  updates++;
  window.__wmStats = { updates, avgMs: updateMs / updates, nodes: document.querySelectorAll('#map *').length };
}, 250);

refresh();
window.__wm = map;
window.__wmState = state;
window.__wmRefresh = refresh;
window.__wmSetTargeting = (id) => {
  setTargeting(id);
  refresh();
};
