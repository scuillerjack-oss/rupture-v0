// V7 — Carte interactive (src/ui/worldMap.js) et compatibilité de src/ui/map.js.
// Le DOM réel (pan/zoom, taps) est vérifié dans Chrome mobile simulé via tools/carte/demo.html ;
// ici : fonctions pures et balisage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, beginNewGame, confirmOrigin } from '../src/engine/state.js';
import { TERRITORIES, EDGES } from '../src/engine/territories.js';
import {
  crisisFill,
  awarenessStroke,
  routeStatus,
  clampView,
  fitView,
  territoryIcons,
  buildWorldMarkup,
  createWorldMap,
  routeKey,
  CRITICAL_CRISIS,
  STRONG_CONTAINMENT
} from '../src/ui/worldMap.js';
import { renderMap, renderMapLegend } from '../src/ui/map.js';
import { readFileSync } from 'node:fs';

const lum = (c) => {
  const [r, g, b] = c.match(/\d+/g).map(Number);
  return { r, g, b };
};

test('crisisFill : calme -> rouge sombre -> rouge vif critique', () => {
  const calm = lum(crisisFill(0));
  const mid = lum(crisisFill(50));
  const crit = lum(crisisFill(CRITICAL_CRISIS));
  const max = lum(crisisFill(100));
  assert.ok(calm.g >= calm.r, 'le calme n’est pas rouge');
  assert.ok(mid.r > mid.g * 2, 'crise moyenne = rouge sombre');
  assert.ok(crit.r > mid.r && max.r > crit.r, 'le rouge s’intensifie');
  assert.notEqual(crisisFill(0), crisisFill(5), 'une première atteinte se voit');
  assert.equal(crisisFill(-10), crisisFill(0));
  assert.equal(crisisFill(150), crisisFill(100));
  assert.equal(crisisFill(Number.NaN), crisisFill(0));
});

test('awarenessStroke : invisible à 0, plus épais et plus opaque avec la conscience', () => {
  assert.deepEqual(awarenessStroke(0), { width: 0, opacity: 0 });
  const a = awarenessStroke(30);
  const b = awarenessStroke(90);
  assert.ok(b.width > a.width && b.opacity > a.opacity);
  assert.ok(b.opacity <= 1);
});

test('routeStatus lit closedRoutes des deux côtés et le seuil de propagation', () => {
  const s = createInitialState();
  beginNewGame(s);
  assert.equal(routeStatus(s, 'arca', 'boreal'), 'idle');
  s.territories.arca.crisis = 40;
  assert.equal(routeStatus(s, 'arca', 'boreal'), 'flowing');
  s.territories.boreal.closedRoutes.push('arca');
  assert.equal(routeStatus(s, 'arca', 'boreal'), 'closed');
  assert.equal(routeStatus(s, 'boreal', 'arca'), 'closed');
  assert.equal(routeStatus(s, 'arca', 'inconnu'), 'idle');
});

test('fitView / clampView : monde entier visible, zoom borné, pas de fuite hors écran', () => {
  const fit = fitView(390, 506);
  assert.ok(1000 * fit.scale <= 390);
  const tooBig = clampView({ scale: fit.scale * 100, tx: 0, ty: 0 }, 390, 506, fit.scale);
  assert.ok(tooBig.scale <= fit.scale * 6 + 1e-9);
  const tooSmall = clampView({ scale: fit.scale * 0.1, tx: 9999, ty: -9999 }, 390, 506, fit.scale);
  assert.ok(tooSmall.scale >= fit.scale * 0.85 - 1e-9);
  // monde plus petit que l'écran : centré, pas déplaçable
  assert.equal(tooSmall.tx, (390 - 1000 * tooSmall.scale) / 2);
  const zoomed = clampView({ scale: fit.scale * 3, tx: 5000, ty: -50000 }, 390, 506, fit.scale);
  assert.ok(zoomed.tx <= 390 * 0.25 && zoomed.ty >= 506 - 1000 * zoomed.scale - 506 * 0.25);
});

test('territoryIcons : origine et confinement fort', () => {
  const s = createInitialState();
  beginNewGame(s);
  confirmOrigin(s, 'jotun');
  assert.equal(territoryIcons(s, 'jotun'), '◉');
  s.territories.kelsor.containment = STRONG_CONTAINMENT;
  assert.equal(territoryIcons(s, 'kelsor'), '🛡');
  assert.equal(territoryIcons(s, 'arca'), '');
});

test('buildWorldMarkup : un élément par territoire, route, nom ; aucun id moteur renommé', () => {
  const html = buildWorldMarkup();
  for (const t of TERRITORIES) {
    assert.ok(html.includes(`data-wm-terr="${t.id}"`), t.id);
    assert.ok(html.includes(`>${t.name}<`), t.name);
  }
  for (const [a, b] of EDGES) assert.ok(html.includes(`data-route="${routeKey(a, b)}"`));
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
});

test('renderMap (compatibilité V6) garde data-action="select-territory" et marque les routes fermées', () => {
  const s = createInitialState();
  beginNewGame(s);
  confirmOrigin(s, 'fenwick');
  s.territories.fenwick.closedRoutes.push('gora');
  const html = renderMap(s, true);
  for (const t of TERRITORIES) assert.ok(html.includes(`data-action="select-territory" data-id="${t.id}"`));
  assert.match(html, /wm-route-badge wm-show-closed"[^>]*data-badge="fenwick\|gora"/);
  assert.match(html, /scale\(2\.6\)/, 'échelle fixe des noms en carte statique');
  assert.match(renderMapLegend(), /Critique/);
});

test('createWorldMap : aucune écriture DOM au moment de l’import (module utilisable sous Node)', () => {
  assert.equal(typeof createWorldMap, 'function');
  assert.equal(typeof globalThis.document, 'undefined');
});

test('worldMap.js : update() ne recrée ni listener ni innerHTML global (lecture du source)', () => {
  const src = readFileSync(new URL('../src/ui/worldMap.js', import.meta.url), 'utf8');
  const updateBody = src.slice(src.indexOf('function update(state'), src.indexOf('const api = {'));
  assert.ok(updateBody.length > 200);
  assert.ok(!/addEventListener/.test(updateBody), 'pas de listener dans update()');
  assert.ok(!/root\.innerHTML|svg\.innerHTML|container\.innerHTML/.test(updateBody), 'pas de innerHTML global dans update()');
});
