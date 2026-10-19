#!/usr/bin/env node
// Générateur de la géométrie du monde de RUPTURE (V7, équipe Carte).
// Usage : node tools/carte/generate-geometry.mjs  -> réécrit src/ui/worldGeometry.js
//
// Principe : chaque continent est un contour grossier dessiné à la main, rendu
// « naturel » par déplacement fractal (graine fixe). À l'intérieur, les
// territoires sont les cellules d'un diagramme de puissance (Voronoï pondéré)
// de graines placées à la main ; des graines « lac » séparent les territoires
// qui ne doivent pas se toucher (pas d'EDGE entre eux). Les frontières
// partagées sont dentelées UNE fois puis réutilisées (inversées) par les deux
// territoires : pas de trou ni de chevauchement. Tout est déterministe.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TERRITORIES, EDGES } from '../../src/engine/territories.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------- hasard à graine ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- géométrie de base ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function boundaryDist(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}
function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// Déplacement fractal d'un segment (a -> b) ; rng dérivé des extrémités pour
// qu'un même segment donne toujours la même dentelure.
function jag(a, b, rough, minLen, rng) {
  const out = [];
  function rec(p, q, depth) {
    const len = dist(p, q);
    if (len < minLen || depth > 7) return;
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    const nx = -(q[1] - p[1]) / len;
    const ny = (q[0] - p[0]) / len;
    const off = (rng() * 2 - 1) * len * rough;
    const m = [mx + nx * off, my + ny * off];
    rec(p, m, depth + 1);
    out.push(m);
    rec(m, q, depth + 1);
  }
  rec(a, b, 0);
  return out; // points intermédiaires, sans a ni b
}
function jagRing(coarse, rough, minLen, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < coarse.length; i++) {
    const a = coarse[i];
    const b = coarse[(i + 1) % coarse.length];
    out.push(a, ...jag(a, b, rough, minLen, rng));
  }
  return out;
}

// ---------- données dessinées à la main ----------
// Contours grossiers (sens horaire à l'écran).
const CONTINENT_DEFS = [
  {
    id: 'hauteterre',
    name: 'Hauteterre',
    coarse: [
      [150, 150], [200, 114], [262, 120], [300, 92], [380, 82], [430, 100], [468, 112], [500, 128],
      [532, 190], [506, 250], [522, 330], [510, 384], [470, 440], [428, 500], [392, 462], [320, 456],
      [262, 488], [200, 458], [150, 400], [132, 330], [160, 270], [108, 224], [118, 180]
    ],
    seeds: [
      { id: 'arca', p: [222, 208], w: 0 },
      { id: 'boreal', p: [408, 176], w: 0 },
      { id: 'esser', p: [232, 376], w: 0 },
      { id: 'fenwick', p: [412, 362], w: 1500 },
      { id: 'lac-miroir', p: [318, 288], w: -5200, lake: 'Lac Miroir' }
    ]
  },
  {
    id: 'levant',
    name: 'Levant',
    coarse: [
      [600, 150], [650, 120], [700, 98], [770, 112], [830, 100], [880, 148], [930, 190], [910, 262],
      [876, 330], [840, 408], [800, 440], [772, 498], [732, 458], [680, 442], [640, 392], [622, 322],
      [596, 262], [572, 210]
    ],
    seeds: [
      { id: 'cindra', p: [690, 196], w: 0 },
      { id: 'delthia', p: [842, 236], w: 0 },
      { id: 'gora', p: [748, 372], w: 0 }
    ]
  },
  {
    id: 'australe',
    name: 'Australe',
    coarse: [
      [98, 566], [190, 546], [290, 566], [390, 548], [490, 566], [572, 548], [668, 566], [770, 556],
      [830, 572], [880, 600], [858, 640], [852, 684], [810, 762], [832, 842], [772, 912], [670, 924], [570, 902], [470, 932],
      [368, 914], [276, 904], [222, 862], [236, 800], [190, 760], [120, 716], [74, 640]
    ],
    seeds: [
      { id: 'halvern', p: [150, 622], w: 0 },
      { id: 'ismer', p: [330, 648], w: 0 },
      { id: 'jotun', p: [528, 640], w: 2000 },
      { id: 'kelsor', p: [736, 650], w: 0 },
      { id: 'lyrath', p: [318, 836], w: 0 },
      { id: 'meridia', p: [516, 842], w: 0 },
      { id: 'nyxor', p: [716, 830], w: 0 },
      { id: 'lac-ambre', p: [420, 742], w: -5200, lake: 'Lac d\'Ambre' },
      { id: 'lac-sombre', p: [624, 738], w: -5200, lake: 'Lac Sombre' },
      { id: 'golfe-halvern', p: [212, 736], w: -2600, sea: true }
    ]
  }
];

// Îles-territoires : une ou plusieurs îles (la première porte le nom).
const ISLAND_DEFS = {
  vantis: [
    [[48, 400], [86, 382], [112, 420], [106, 478], [80, 522], [46, 508], [34, 456]],
    [[62, 548], [80, 542], [86, 560], [66, 568]]
  ],
  ashra: [
    [[436, 40], [480, 22], [548, 26], [590, 44], [578, 70], [528, 80], [470, 74]],
    [[606, 52], [630, 44], [646, 58], [626, 72]]
  ],
  corvel: [
    [[918, 420], [954, 408], [978, 446], [970, 500], [938, 528], [908, 494], [904, 450]],
    [[930, 556], [952, 552], [956, 572], [934, 576]]
  ],
  tenlow: [
    [[880, 768], [926, 756], [960, 790], [950, 846], [906, 862], [874, 826]],
    [[904, 890], [934, 882], [948, 904], [920, 920]],
    [[970, 732], [986, 728], [990, 748], [972, 752]]
  ]
};

// Îlots décoratifs (aucun territoire).
const ISLET_DEFS = [
  [[536, 470], [552, 464], [560, 478], [544, 484]],
  [[30, 280], [46, 270], [56, 290], [38, 298]],
  [[960, 330], [976, 322], [984, 340], [966, 346]],
  [[120, 948], [142, 940], [150, 958], [128, 964]],
  [[606, 960], [626, 954], [632, 970], [612, 974]],
  [[300, 500], [316, 496], [320, 510], [304, 514]]
];

const SEA_LABELS = [
  { text: 'Océan Pâle', x: 170, y: 58 },
  { text: 'Mer des Brumes', x: 760, y: 50 },
  { text: 'Mer Intérieure', x: 612, y: 528 },
  { text: 'Mer de Cendre', x: 880, y: 960 },
  { text: 'Golfe d\'Halvern', x: 150, y: 820 }
];

const LAND = new Set([
  'arca|boreal', 'arca|esser', 'boreal|fenwick', 'esser|fenwick',
  'cindra|delthia', 'cindra|gora', 'delthia|gora',
  'halvern|ismer', 'ismer|jotun', 'ismer|lyrath', 'jotun|kelsor', 'jotun|meridia',
  'kelsor|nyxor', 'lyrath|meridia', 'meridia|nyxor'
]);
const AIR = new Set(['fenwick|jotun', 'ashra|cindra', 'corvel|kelsor', 'kelsor|tenlow']);
// Courbure imposée (décalage du point de contrôle, en unités) pour certaines routes.
const ROUTE_BEND = {
  'boreal|cindra': 0, 'fenwick|gora': 0, 'esser|halvern': -30, 'fenwick|jotun': 60,
  'gora|kelsor': -40, 'arca|vantis': 30, 'halvern|vantis': -20, 'ashra|boreal': -20,
  'ashra|cindra': -30, 'corvel|delthia': 20, 'corvel|kelsor': 40, 'nyxor|tenlow': 20, 'kelsor|tenlow': -50
};

// Emplacement souhaité du port quand le calcul automatique tombe mal.
const PORT_HINT = { boreal: [500, 110], arca: [110, 240], vantis: [84, 382], halvern: [110, 560], esser: [220, 470] };

export const routeKey =(a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---------- clip avec étiquettes d'arêtes ----------
// Polygone = [{ p:[x,y], tag }] ; tag = nature de l'arête p -> suivant : 'c' (côte) ou 'b:<id>'.
function clipHalfPlane(poly, f, tagOut) {
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const cur = poly[k];
    const nxt = poly[(k + 1) % poly.length];
    const fc = f(cur.p);
    const fn = f(nxt.p);
    const inter = () => {
      const t = fc / (fc - fn);
      return [cur.p[0] + (nxt.p[0] - cur.p[0]) * t, cur.p[1] + (nxt.p[1] - cur.p[1]) * t];
    };
    if (fc <= 0) {
      out.push({ p: cur.p, tag: cur.tag });
      if (fn > 0) out.push({ p: inter(), tag: tagOut });
    } else if (fn <= 0) {
      out.push({ p: inter(), tag: cur.tag });
    }
  }
  return out;
}

// ---------- construction ----------
const snapPool = [];
function snap(p) {
  for (const q of snapPool) if (Math.abs(q[0] - p[0]) < 0.6 && Math.abs(q[1] - p[1]) < 0.6) return q;
  const r = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
  snapPool.push(r);
  return r;
}

const cells = {}; // id -> { ring:[[x,y]...], kind:'territory'|'lake'|'sea', borders:{other: [[pts]]}, continent }
const borderCache = new Map();
function borderPoints(a, b) {
  const ka = `${a[0]},${a[1]}`;
  const kb = `${b[0]},${b[1]}`;
  const forward = ka < kb;
  const key = forward ? `${ka}|${kb}` : `${kb}|${ka}`;
  if (!borderCache.has(key)) {
    const [p, q] = forward ? [a, b] : [b, a];
    borderCache.set(key, jag(p, q, 0.16, 9, mulberry32(hashStr(key))));
  }
  const pts = borderCache.get(key);
  return forward ? pts : [...pts].reverse();
}

const problems = [];
const continentsOut = [];
for (const def of CONTINENT_DEFS) {
  const coast = jagRing(def.coarse, 0.2, 7, hashStr(def.id));
  const coastTagged = coast.map((p) => ({ p, tag: 'c' }));
  for (const s of def.seeds) {
    let poly = coastTagged;
    for (const o of def.seeds) {
      if (o === s) continue;
      const [px, py] = s.p;
      const [qx, qy] = o.p;
      const c = qx * qx + qy * qy - (px * px + py * py) - o.w + s.w;
      const f = (x) => 2 * (x[0] * (qx - px) + x[1] * (qy - py)) - c;
      poly = clipHalfPlane(poly, f, `b:${o.id}`);
    }
    // Arêtes de frontière dont le milieu sort du continent = pont au-dessus de l'eau (bug de conception).
    const ring = [];
    const borders = {};
    for (let k = 0; k < poly.length; k++) {
      const a = snap(poly[k].p);
      const b = snap(poly[(k + 1) % poly.length].p);
      if (a === b) continue;
      ring.push(a);
      const tag = poly[k].tag;
      if (tag.startsWith('b:')) {
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (!pointInPoly(mid, coast)) problems.push(`${s.id}: frontière avec ${tag.slice(2)} hors du continent`);
        const other = tag.slice(2);
        const isSeaish = def.seeds.find((x) => x.id === other)?.sea;
        const inner = isSeaish ? jag(a, b, 0.2, 7, mulberry32(hashStr(`${a}|${b}`))) : borderPoints(a, b);
        ring.push(...inner);
        if (!isSeaish) (borders[other] ||= []).push([a, ...inner, b]);
      }
    }
    cells[s.id] = { ring, kind: s.lake ? 'lake' : s.sea ? 'sea' : 'territory', name: s.lake, borders, continent: def.id, seed: s.p };
  }
  continentsOut.push({ id: def.id, name: def.name, territories: def.seeds.filter((s) => !s.lake && !s.sea).map((s) => s.id) });
}

const islandRings = {};
for (const [id, list] of Object.entries(ISLAND_DEFS)) {
  islandRings[id] = list.map((coarse, i) => jagRing(coarse, 0.22, 5, hashStr(`${id}-${i}`)));
  cells[id] = { ring: islandRings[id][0], extra: islandRings[id].slice(1), kind: 'territory', borders: {}, continent: null };
}
continentsOut.push({ id: 'archipels', name: 'Archipels', territories: Object.keys(ISLAND_DEFS) });

// ---------- vérifications de conception ----------
for (const [a, b] of EDGES) {
  const k = routeKey(a, b);
  const touching = Boolean(cells[a].borders[b]);
  if (LAND.has(k) && !touching) problems.push(`route terrestre ${k} : territoires non contigus`);
  if (!LAND.has(k) && touching) problems.push(`${k} : se touchent mais route déclarée maritime/aérienne`);
}
const edgeSet = new Set(EDGES.map(([a, b]) => routeKey(a, b)));
for (const [id, c] of Object.entries(cells)) {
  if (c.kind !== 'territory') continue;
  for (const other of Object.keys(c.borders)) {
    if (cells[other].kind !== 'territory') continue;
    if (!edgeSet.has(routeKey(id, other))) problems.push(`${id} touche ${other} sans route`);
  }
}

// ---------- étiquettes, ports, aéroports ----------
const landRings = [];
for (const c of Object.values(cells)) if (c.kind === 'territory') landRings.push(c.ring, ...(c.extra || []));
const isetRings = ISLET_DEFS.map((r, i) => jagRing(r, 0.25, 4, hashStr(`islet-${i}`)));
const onLand = (p) => landRings.some((r) => pointInPoly(p, r)) || isetRings.some((r) => pointInPoly(p, r));

function bestInterior(ring, bias, avoid = []) {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null;
  let bestScore = -Infinity;
  const step = 3;
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      const p = [x, y];
      if (!pointInPoly(p, ring)) continue;
      // Une étiquette est plus large que haute : on mesure la marge en ellipse.
      const dH = Math.min(boundaryDist([x - 22, y], ring), boundaryDist([x + 22, y], ring), boundaryDist(p, ring));
      let score = dH - (bias ? dist(p, bias) * 0.08 : 0);
      for (const a of avoid) score -= Math.max(0, a.r - dist(p, a.p)) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}

const partners = {};
for (const [a, b] of EDGES) {
  const k = routeKey(a, b);
  const kind = LAND.has(k) ? 'land' : AIR.has(k) ? 'air' : 'sea';
  (partners[a] ||= []).push({ id: b, kind });
  (partners[b] ||= []).push({ id: a, kind });
}

const shapes = {};
const centers = {};
for (const t of TERRITORIES) {
  const c = cells[t.id];
  const xs = c.ring.map((p) => p[0]);
  const ys = c.ring.map((p) => p[1]);
  centers[t.id] = c.seed || [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
// Boîte d'étiquette (nom + ligne d'icônes) en unités monde, à une échelle d'écran donnée.
// Doit rester cohérente avec worldMap.css (.wm-name 12px gras, .wm-icons 15px dessous).
const NAME_CHAR_PX = 7.4;
function labelBox(id, label, scale, pad = 0) {
  const name = TERRITORIES.find((t) => t.id === id).name;
  const halfW = (name.length * NAME_CHAR_PX) / 2 + 3 + pad;
  return { x0: label[0] - halfW / scale, x1: label[0] + halfW / scale, y0: label[1] - (9 + pad) / scale, y1: label[1] + (22 + pad) / scale };
}
function boxIntrusion(p, r, box) {
  const dx = Math.max(box.x0 - p[0], 0, p[0] - box.x1);
  const dy = Math.max(box.y0 - p[1], 0, p[1] - box.y1);
  return Math.max(0, r - Math.hypot(dx, dy));
}
// Échelles de référence : vue d'ensemble sur téléphone (390 px de large) et zoom où les icônes apparaissent.
const FIT_SCALE = 0.38;
const ICON_SCALE = FIT_SCALE * 1.6;

const labels = {};
for (const t of TERRITORIES) labels[t.id] = bestInterior(cells[t.id].ring, centers[t.id]);

for (const t of TERRITORIES) {
  const c = cells[t.id];
  const label = labels[t.id];
  const shape = { label };
  const sea = (partners[t.id] || []).filter((p) => p.kind === 'sea');
  const iconR = 10 / ICON_SCALE;
  const ownBox = labelBox(t.id, label, ICON_SCALE);
  if (sea.length) {
    // Port : point de côte proche des partenaires maritimes, hors de la boîte du nom.
    let best = null;
    let bestScore = Infinity;
    for (const p of c.ring) {
      if (c.continent && !isCoastPoint(p, c)) continue;
      let s = 0;
      if (PORT_HINT[t.id]) s = dist(p, PORT_HINT[t.id]);
      else for (const q of sea) s += dist(p, centers[q.id]) / sea.length;
      s += boxIntrusion(p, iconR, ownBox) * 60;
      if (s < bestScore) {
        bestScore = s;
        best = p;
      }
    }
    shape.port = best;
  }
  const air = (partners[t.id] || []).filter((p) => p.kind === 'air');
  if (air.length) {
    const target = air.reduce((acc, q) => [acc[0] + centers[q.id][0] / air.length, acc[1] + centers[q.id][1] / air.length], [0, 0]);
    let best = label;
    let bestScore = Infinity;
    const xs = c.ring.map((p) => p[0]);
    const ys = c.ring.map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 3) {
        const p = [x, y];
        if (!pointInPoly(p, c.ring)) continue;
        const edge = boundaryDist(p, c.ring);
        let s = dist(p, target) * 0.3 + Math.max(0, 9 - edge) * 30;
        s += boxIntrusion(p, iconR, ownBox) * 60;
        if (shape.port) s += Math.max(0, 2 * iconR - dist(p, shape.port)) * 60;
        if (s < bestScore) {
          bestScore = s;
          best = p;
        }
      }
    }
    shape.airport = best;
  }
  shapes[t.id] = shape;
}

// Bulles : décalage (px écran) depuis le nom, choisi pour ne recouvrir aucun autre nom ni badge de route
// à la vue d'ensemble. Appelé après le calcul des routes.
function placeBubbles(routeMids) {
  const BUBBLE_R = 27;
  const OFFSETS = [[0, -38], [0, 46], [-52, -16], [52, -16], [-52, 22], [52, 22], [-40, -40], [40, -40], [-40, 46], [40, 46], [-88, 0], [88, 0]];
  for (const t of TERRITORIES) {
    const label = labels[t.id];
    const scored = OFFSETS.map((off, i) => {
      const p = [label[0] + off[0] / FIT_SCALE, label[1] + off[1] / FIT_SCALE];
      let s = i * 0.3;
      for (const o of TERRITORIES) {
        if (o.id === t.id) continue;
        s += boxIntrusion(p, BUBBLE_R / FIT_SCALE, labelBox(o.id, labels[o.id], FIT_SCALE, 2)) * 4;
      }
      for (const m of routeMids) s += Math.max(0, (BUBBLE_R + 12) / FIT_SCALE - dist(p, m)) * 3;
      if (p[0] < 28 / FIT_SCALE || p[0] > 1000 - 28 / FIT_SCALE || p[1] < 30 / FIT_SCALE || p[1] > 1000 - 28 / FIT_SCALE) s += 500;
      if (!pointInPoly(p, cells[t.id].ring)) s += 40;
      return { off, s };
    });
    scored.sort((x, y) => x.s - y.s);
    shapes[t.id].bubbles = scored.slice(0, 6).map((x) => x.off);
  }
}
function isCoastPoint(p, c) {
  // Sur la côte = pas un sommet partagé avec une autre cellule non maritime.
  for (const o of Object.values(cells)) {
    if (o === c || o.kind === 'sea') continue;
    if (o.ring.some((q) => q === p)) return false;
  }
  return true;
}

// ---------- routes maritimes / aériennes ----------
function quad(a, ctrl, b, t) {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1]];
}
const ROUTES = {};
const ROUTE_GEOM = {};
for (const [a, b] of EDGES) {
  const k = routeKey(a, b);
  const kind = LAND.has(k) ? 'land' : AIR.has(k) ? 'air' : 'sea';
  ROUTES[k] = kind;
  const [ia, ib] = k.split('|');
  if (kind === 'land') {
    const segs = cells[ia].borders[ib];
    const pts = segs.flat();
    // Badge = point de la frontière le plus proche du milieu des deux noms.
    const la = shapes[ia].label;
    const lb = shapes[ib].label;
    const m = [(la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2];
    let mid = pts[0];
    for (const p of pts) if (dist(p, m) < dist(mid, m)) mid = p;
    ROUTE_GEOM[k] = { path: segs.map((s) => 'M' + s.map(fmt).join('L')).join(''), midX: r1(mid[0]), midY: r1(mid[1]) };
    continue;
  }
  const pa = kind === 'sea' ? shapes[ia].port : shapes[ia].airport;
  const pb = kind === 'sea' ? shapes[ib].port : shapes[ib].airport;
  const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  const len = dist(pa, pb);
  const nx = -(pb[1] - pa[1]) / len;
  const ny = (pb[0] - pa[0]) / len;
  let bend = ROUTE_BEND[k] ?? 0;
  if (kind === 'sea') {
    // Plus petite courbure qui garde la route en mer.
    const tries = [bend];
    for (let d = 15; d <= 180; d += 15) tries.push(bend + d, bend - d);
    let ok = false;
    for (const tb of tries) {
      const ctrl = [m[0] + nx * tb, m[1] + ny * tb];
      let wet = true;
      for (let t = 0.08; t <= 0.92; t += 0.02) {
        if (onLand(quad(pa, ctrl, pb, t))) {
          wet = false;
          break;
        }
      }
      if (wet) {
        bend = tb;
        ok = true;
        break;
      }
    }
    if (!ok) problems.push(`route maritime ${k} : traverse une terre`);
  }
  const ctrl = [m[0] + nx * bend, m[1] + ny * bend];
  const mid = quad(pa, ctrl, pb, 0.5);
  ROUTE_GEOM[k] = { path: `M${fmt(pa)}Q${fmt(ctrl)} ${fmt(pb)}`, midX: r1(mid[0]), midY: r1(mid[1]) };
}

placeBubbles(Object.values(ROUTE_GEOM).map((r) => [r.midX, r.midY]));

// ---------- relief ----------
const relief = [];
{
  const rng = mulberry32(777);
  const labels = Object.values(shapes).map((s) => s.label);
  const allLand = Object.values(cells).filter((c) => c.kind === 'territory' && c.continent);
  let guard = 0;
  while (relief.length < 46 && guard++ < 20000) {
    const c = allLand[Math.floor(rng() * allLand.length)];
    const xs = c.ring.map((p) => p[0]);
    const ys = c.ring.map((p) => p[1]);
    const p = [Math.min(...xs) + rng() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rng() * (Math.max(...ys) - Math.min(...ys))];
    if (!pointInPoly(p, c.ring) || boundaryDist(p, c.ring) < 16) continue;
    if (labels.some((l) => Math.abs(l[0] - p[0]) < 70 && Math.abs(l[1] - p[1]) < 34)) continue;
    if (relief.some((r) => dist(r, p) < 34)) continue;
    relief.push([r1(p[0]), r1(p[1]), r1(0.8 + rng() * 0.6)]);
  }
}

// ---------- sortie ----------
function r1(v) {
  return Math.round(v * 10) / 10;
}
function fmt(p) {
  return `${r1(p[0])} ${r1(p[1])}`;
}
function ringPath(ring) {
  return 'M' + ring.map(fmt).join('L') + 'Z';
}

if (problems.length) {
  console.error('PROBLÈMES DE GÉOMÉTRIE :\n - ' + problems.join('\n - '));
  process.exitCode = 1;
}

const TERRITORY_SHAPES = {};
for (const t of TERRITORIES) {
  const c = cells[t.id];
  const s = shapes[t.id];
  const entry = { path: [c.ring, ...(c.extra || [])].map(ringPath).join(''), labelX: r1(s.label[0]), labelY: r1(s.label[1]) };
  if (s.port) entry.port = { x: r1(s.port[0]), y: r1(s.port[1]) };
  if (s.airport) entry.airport = { x: r1(s.airport[0]), y: r1(s.airport[1]) };
  entry.bubbleSpots = s.bubbles;
  if (area(c.ring) > 0 === false) void 0;
  TERRITORY_SHAPES[t.id] = entry;
}
const LAKES = Object.entries(cells)
  .filter(([, c]) => c.kind === 'lake')
  .map(([id, c]) => ({ id, name: c.name, path: ringPath(c.ring) }));
const COASTS = CONTINENT_DEFS.map((d) => ({ id: d.id, path: ringPath(jagRing(d.coarse, 0.2, 7, hashStr(d.id))) }));

const json = (v) => JSON.stringify(v, null, 0);
const lines = [];
lines.push('// FICHIER GÉNÉRÉ par tools/carte/generate-geometry.mjs — ne pas modifier à la main.');
lines.push('// Données pures (sans DOM). Repère : viewBox 0 0 1000 1000.');
lines.push('');
lines.push("export const WORLD_VIEWBOX = '0 0 1000 1000';");
lines.push('export const WORLD_SIZE = 1000;');
lines.push('');
lines.push('export function routeKey(a, b) {');
lines.push('  return a < b ? `${a}|${b}` : `${b}|${a}`;');
lines.push('}');
lines.push('');
lines.push('// Continents (et « archipels » pour les îles-territoires).');
lines.push(`export const CONTINENTS = ${json(continentsOut)};`);
lines.push('');
lines.push('// Forme de chaque territoire : path SVG (plusieurs îles possibles), point d\'étiquette, port / aéroport,\n// emplacements de bulles par ordre de préférence (bubbleSpots : décalages en px écran depuis le nom).');
lines.push('export const TERRITORY_SHAPES = {');
for (const t of TERRITORIES) lines.push(`  ${t.id}: ${json(TERRITORY_SHAPES[t.id])},`);
lines.push('};');
lines.push('');
lines.push('// Nature de chaque route du moteur (EDGES) : frontière terrestre, route maritime ou aérienne.');
lines.push(`export const ROUTE_KINDS = ${json(ROUTES)};`);
lines.push('');
lines.push('// Tracé de chaque route : frontière partagée (land) ou courbe port->port / aéroport->aéroport ; mid = badge.');
lines.push('export const ROUTE_PATHS = {');
for (const k of Object.keys(ROUTE_GEOM)) lines.push(`  ${json(k)}: ${json(ROUTE_GEOM[k])},`);
lines.push('};');
lines.push('');
lines.push('// Décor : lacs (séparent des territoires non voisins), contours des continents, îlots, relief, mers.');
lines.push(`export const LAKES = ${json(LAKES)};`);
lines.push(`export const COASTS = ${json(COASTS)};`);
lines.push(`export const ISLETS = ${json(isetRings.map(ringPath))};`);
lines.push(`export const RELIEF = ${json(relief)};`);
lines.push(`export const SEA_LABELS = ${json(SEA_LABELS)};`);
lines.push('');
writeFileSync(join(ROOT, 'src/ui/worldGeometry.js'), lines.join('\n'));
console.log(`worldGeometry.js écrit (${problems.length} problème(s)).`);
