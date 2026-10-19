// V7 — Géométrie de la carte du monde (src/ui/worldGeometry.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TERRITORIES, EDGES } from '../src/engine/territories.js';
import {
  TERRITORY_SHAPES,
  ROUTE_KINDS,
  ROUTE_PATHS,
  CONTINENTS,
  LAKES,
  routeKey
} from '../src/ui/worldGeometry.js';

// ---- lecture des paths générés (uniquement M / L / Z) ----
function parseRings(d) {
  const rings = [];
  let cur = null;
  const re = /([MLZ])\s*([-\d.]+)?\s*([-\d.]+)?/g;
  let m;
  while ((m = re.exec(d))) {
    if (m[1] === 'M') {
      cur = [[+m[2], +m[3]]];
      rings.push(cur);
    } else if (m[1] === 'L') cur.push([+m[2], +m[3]]);
  }
  return rings;
}
function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inShape = (p, rings) => rings.some((r) => pointInRing(p, r));
function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function minRingDist(ra, rb) {
  let d = Infinity;
  for (const p of ra) for (let i = 0; i < rb.length; i++) d = Math.min(d, segDist(p, rb[i], rb[(i + 1) % rb.length]));
  return d;
}
function bbox(rings) {
  const pts = rings.flat();
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}
const RINGS = Object.fromEntries(TERRITORIES.map((t) => [t.id, parseRings(TERRITORY_SHAPES[t.id].path)]));

test('chaque territoire du moteur a une forme, avec ses identifiants inchangés', () => {
  assert.deepEqual(Object.keys(TERRITORY_SHAPES).sort(), TERRITORIES.map((t) => t.id).sort());
  for (const t of TERRITORIES) {
    const s = TERRITORY_SHAPES[t.id];
    assert.equal(typeof s.path, 'string');
    assert.ok(RINGS[t.id].length >= 1 && RINGS[t.id][0].length >= 6, `${t.id} : polygone trop pauvre`);
    for (const [x, y] of RINGS[t.id].flat()) assert.ok(x >= 0 && x <= 1000 && y >= 0 && y <= 1000, `${t.id} hors du viewBox`);
  }
});

test('3 à 4 continents + archipels, chaque territoire dans exactement un groupe', () => {
  const continents = CONTINENTS.filter((c) => c.id !== 'archipels');
  assert.ok(continents.length >= 3 && continents.length <= 4);
  const all = CONTINENTS.flatMap((c) => c.territories).sort();
  assert.deepEqual(all, TERRITORIES.map((t) => t.id).sort());
  assert.ok(CONTINENTS.find((c) => c.id === 'archipels').territories.length >= 2);
});

test('ROUTE_KINDS couvre exactement chaque EDGE du moteur (clé triée), avec un tracé', () => {
  const keys = EDGES.map(([a, b]) => routeKey(a, b)).sort();
  assert.deepEqual(Object.keys(ROUTE_KINDS).sort(), keys);
  for (const k of keys) {
    assert.ok(['land', 'sea', 'air'].includes(ROUTE_KINDS[k]), k);
    assert.ok(ROUTE_PATHS[k] && ROUTE_PATHS[k].path.startsWith('M'), `${k} sans tracé`);
    assert.ok(Number.isFinite(ROUTE_PATHS[k].midX) && Number.isFinite(ROUTE_PATHS[k].midY));
  }
  assert.equal(routeKey('kelsor', 'gora'), 'gora|kelsor');
  assert.equal(routeKey('gora', 'kelsor'), 'gora|kelsor');
});

test("chaque route 'land' relie deux polygones qui se touchent", () => {
  for (const [a, b] of EDGES) {
    if (ROUTE_KINDS[routeKey(a, b)] !== 'land') continue;
    const d = Math.min(...RINGS[a].flatMap((ra) => RINGS[b].map((rb) => minRingDist(ra, rb))));
    assert.ok(d < 1, `${a} et ${b} ne se touchent pas (écart ${d.toFixed(2)})`);
  }
});

test("deux territoires qui se touchent sont reliés par une route 'land' (pas de frontière fantôme)", () => {
  const ids = TERRITORIES.map((t) => t.id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]];
      const [ax0, ay0, ax1, ay1] = bbox(RINGS[a]);
      const [bx0, by0, bx1, by1] = bbox(RINGS[b]);
      if (ax1 < bx0 - 2 || bx1 < ax0 - 2 || ay1 < by0 - 2 || by1 < ay0 - 2) continue;
      const d = Math.min(...RINGS[a].flatMap((ra) => RINGS[b].map((rb) => minRingDist(ra, rb))));
      const kind = ROUTE_KINDS[routeKey(a, b)];
      if (d < 0.5) assert.equal(kind, 'land', `${a} touche ${b} mais la route est « ${kind ?? 'absente'} »`);
    }
  }
});

test("routes 'sea' / 'air' : ports et aéroports présents aux deux bouts", () => {
  for (const [a, b] of EDGES) {
    const kind = ROUTE_KINDS[routeKey(a, b)];
    if (kind === 'sea') {
      assert.ok(TERRITORY_SHAPES[a].port && TERRITORY_SHAPES[b].port, `port manquant sur ${a}|${b}`);
    }
    if (kind === 'air') {
      assert.ok(TERRITORY_SHAPES[a].airport && TERRITORY_SHAPES[b].airport, `aéroport manquant sur ${a}|${b}`);
      assert.ok(inShape([TERRITORY_SHAPES[a].airport.x, TERRITORY_SHAPES[a].airport.y], RINGS[a]), `aéroport de ${a} hors de ${a}`);
    }
  }
  const kinds = new Set(Object.values(ROUTE_KINDS));
  assert.ok(kinds.has('land') && kinds.has('sea') && kinds.has('air'));
});

test('aucun polygone ne chevauche un autre (échantillonnage sur grille)', () => {
  const boxes = Object.fromEntries(TERRITORIES.map((t) => [t.id, bbox(RINGS[t.id])]));
  for (let x = 1; x < 1000; x += 4) {
    for (let y = 1; y < 1000; y += 4) {
      const p = [x + 0.37, y + 0.71]; // décalé pour ne pas tomber pile sur une arête
      let owners = 0;
      for (const t of TERRITORIES) {
        const [x0, y0, x1, y1] = boxes[t.id];
        if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
        if (inShape(p, RINGS[t.id])) owners++;
      }
      assert.ok(owners <= 1, `chevauchement en (${p[0]}, ${p[1]})`);
    }
  }
});

test('les lacs ne recouvrent aucun territoire', () => {
  for (const lake of LAKES) {
    const ring = parseRings(lake.path)[0];
    const [x0, y0, x1, y1] = bbox([ring]);
    const c = [(x0 + x1) / 2, (y0 + y1) / 2];
    assert.ok(pointInRing(c, ring));
    for (const t of TERRITORIES) assert.ok(!inShape(c, RINGS[t.id]), `${lake.id} sur ${t.id}`);
  }
});

test("le point d'étiquette est dans son polygone, avec de la marge pour le nom", () => {
  for (const t of TERRITORIES) {
    const s = TERRITORY_SHAPES[t.id];
    const p = [s.labelX, s.labelY];
    assert.ok(inShape(p, RINGS[t.id]), `étiquette de ${t.id} hors du polygone`);
    const margin = Math.min(...RINGS[t.id].map((r) => Math.min(...r.map((_, i) => segDist(p, r[i], r[(i + 1) % r.length])))));
    assert.ok(margin >= 12, `étiquette de ${t.id} trop près du bord (${margin.toFixed(1)})`);
  }
});

test('les noms ne se chevauchent pas à la vue d’ensemble d’un téléphone (390 px de large)', () => {
  const scale = 390 / 1000; // vue d'ensemble : le monde tient dans la largeur
  const CHAR = 7.4; // px par caractère (12 px, gras) — cohérent avec le générateur
  const boxes = TERRITORIES.map((t) => {
    const s = TERRITORY_SHAPES[t.id];
    const hw = (t.name.length * CHAR) / 2 / scale;
    return { id: t.id, x0: s.labelX - hw, x1: s.labelX + hw, y0: s.labelY - 8 / scale, y1: s.labelY + 8 / scale };
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      assert.ok(!overlap, `les noms ${a.id} et ${b.id} se chevauchent`);
    }
  }
});

test('chaque territoire propose plusieurs emplacements de bulle', () => {
  for (const t of TERRITORIES) {
    const spots = TERRITORY_SHAPES[t.id].bubbleSpots;
    assert.ok(Array.isArray(spots) && spots.length >= 3, t.id);
    for (const [dx, dy] of spots) assert.ok(Math.hypot(dx, dy) >= 30, `bulle de ${t.id} collée au nom`);
  }
});
