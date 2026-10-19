// V7 — Carte du monde de RUPTURE (équipe Carte).
// Contrat : docs/V7-contrat-api.md, section « Carte ».
//
//   const map = createWorldMap(container, { onTerritoryTap, onBubbleTap, onRouteTap });
//   map.update(state, { mode: 'origin' | 'play', targeting: null | { abilityId, kind, validTargets } });
//   map.recenter(); map.destroy();
//
// Le SVG est construit UNE fois (createWorldMap). update() ne touche ensuite qu'à
// des attributs / classes / styles déjà présents, en mémorisant la dernière valeur
// écrite pour ne rien réécrire d'inchangé ; seules les bulles (qui naissent et
// meurent) ajoutent ou retirent un petit groupe chacune.
//
// Pan / zoom : le monde est un <g> transformé (translate + scale). Les éléments
// qui doivent garder une taille d'écran constante (noms, icônes, bulles, badges)
// sont « contre-zoomés » (scale 1/zoom) : noms lisibles à tous les zooms.
//
// Ce module s'importe sans DOM (sous Node) : seules les fonctions appelées
// touchent `document`.
import { TERRITORIES, EDGES } from '../engine/territories.js';
import { BALANCE } from '../engine/balance.js';
import {
  WORLD_SIZE,
  TERRITORY_SHAPES,
  ROUTE_KINDS,
  ROUTE_PATHS,
  LAKES,
  COASTS,
  ISLETS,
  RELIEF,
  SEA_LABELS,
  routeKey
} from './worldGeometry.js';

export { routeKey };

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------- seuils
export const CRITICAL_CRISIS = 75; // même seuil que la légende V6 (« Critique »)
export const STRONG_CONTAINMENT = 30; // containment plafonne vers 60 (= 0,6 × conscience) : 30 = confinement fort
const LABEL_FONT_PX = 12;
const BUBBLE_RADIUS_PX = 25; // diamètre 50 px réels (≥ 44 px demandés)
const MAX_ZOOM_FACTOR = 6; // par rapport à la vue d'ensemble
const TAP_SLOP_PX = 9;

// ---------------------------------------------------------------- couleurs
// Terres au calme : tons « carte de nuit » légèrement variés par territoire.
const CALM_TONES = ['#33463c', '#3a4a3b', '#2f4440', '#3d4b3f', '#344a43', '#38483a'];
const DARK_RED = [122, 30, 30];
const CRIT_LO = [168, 34, 28];
const CRIT_HI = [232, 62, 46];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** Couleur de remplissage d'un territoire selon sa crise (0-100). Pure, testée. */
export function crisisFill(crisis, calmHex = CALM_TONES[0]) {
  const c = Math.max(0, Math.min(100, Number(crisis) || 0));
  const base = hexToRgb(calmHex);
  if (c <= 0) return rgb(base);
  if (c < CRITICAL_CRISIS) {
    // Montée douce : on voit la première atteinte (t mini 0,12) puis le rouge sombre s'installe.
    const t = 0.12 + 0.88 * Math.pow(c / CRITICAL_CRISIS, 0.85);
    return rgb(mix(base, DARK_RED, t));
  }
  return rgb(mix(CRIT_LO, CRIT_HI, (c - CRITICAL_CRISIS) / (100 - CRITICAL_CRISIS)));
}

/** Liseré de conscience : largeur (px écran, liseré intérieur visible = moitié) et opacité. Pure. */
export function awarenessStroke(awareness) {
  const a = Math.max(0, Math.min(100, Number(awareness) || 0));
  if (a < 4) return { width: 0, opacity: 0 };
  return { width: Math.round((2 + (a / 100) * 8) * 10) / 10, opacity: Math.round((0.35 + (a / 100) * 0.6) * 100) / 100 };
}

/** État d'une route du moteur : 'closed' | 'flowing' | 'idle'. Pure. */
export function routeStatus(state, a, b) {
  const ta = state?.territories?.[a];
  const tb = state?.territories?.[b];
  if (!ta || !tb) return 'idle';
  if ((ta.closedRoutes || []).includes(b) || (tb.closedRoutes || []).includes(a)) return 'closed';
  if (ta.crisis >= BALANCE.spreadThreshold || tb.crisis >= BALANCE.spreadThreshold) return 'flowing';
  return 'idle';
}

/** Borne une vue {scale, tx, ty} pour un conteneur w×h (le monde reste en vue). Pure. */
export function clampView(view, w, h, fitScale) {
  const minScale = fitScale * 0.85;
  const maxScale = fitScale * MAX_ZOOM_FACTOR;
  const scale = Math.max(minScale, Math.min(maxScale, view.scale));
  const size = WORLD_SIZE * scale;
  const clampAxis = (t, viewport) => {
    if (size <= viewport) return (viewport - size) / 2;
    const slack = viewport * 0.25; // on peut pousser un peu au-delà du bord
    return Math.max(viewport - size - slack, Math.min(slack, t));
  };
  return { scale, tx: clampAxis(view.tx, w), ty: clampAxis(view.ty, h) };
}

/** Vue d'ensemble : tout le monde visible, centré. Pure. */
export function fitView(w, h) {
  const scale = Math.max(0.05, Math.min(w, h) / WORLD_SIZE) * 0.98;
  return { scale, tx: (w - WORLD_SIZE * scale) / 2, ty: (h - WORLD_SIZE * scale) / 2 };
}

const TERRITORY_INDEX = Object.fromEntries(TERRITORIES.map((t, i) => [t.id, i]));
const calmTone = (id) => CALM_TONES[(TERRITORY_INDEX[id] * 5 + 1) % CALM_TONES.length];

// ---------------------------------------------------------------- balisage statique
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function mountainPath(x, y, s) {
  const w = 16 * s;
  const h = 11 * s;
  return `M${x - w} ${y + h * 0.5}L${x - w * 0.25} ${y - h}L${x + w * 0.15} ${y - h * 0.2}L${x + w * 0.45} ${y - h * 0.6}L${x + w} ${y + h * 0.5}`;
}

/**
 * Balisage SVG complet du monde. `state` facultatif : s'il est fourni, les
 * remplissages sont posés directement (utilisé par renderMap(), version chaîne
 * compatible V6). `legacyActions` ajoute data-action="select-territory" pour
 * l'ancien écran (délégation de clic de main.js).
 */
/** Icônes sous le nom : ◉ origine, 🛡 confinement fort. Pure. */
export function territoryIcons(state, id) {
  const ts = state?.territories?.[id];
  if (!ts) return '';
  const out = [];
  if (state.originId === id) out.push('◉');
  if ((ts.containment || 0) >= STRONG_CONTAINMENT) out.push('🛡');
  return out.join(' ');
}

export function buildWorldMarkup({ state = null, legacyActions = false, idPrefix = 'wm', staticScale = null } = {}) {
  const p = idPrefix;
  const parts = [];
  parts.push(
    `<svg class="wm-svg" xmlns="${SVG_NS}" role="img" aria-label="Carte du monde"` +
      (legacyActions ? ` viewBox="0 0 ${WORLD_SIZE} ${WORLD_SIZE}" preserveAspectRatio="xMidYMid meet"` : '') +
      '>'
  );
  parts.push('<defs>');
  parts.push(
    `<radialGradient id="${p}-sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#0f2233"/><stop offset="0.6" stop-color="#0a1824"/><stop offset="1" stop-color="#060d14"/></radialGradient>`
  );
  parts.push(
    `<radialGradient id="${p}-bub-influence" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ff8a73"/><stop offset="0.55" stop-color="#e2382b"/><stop offset="1" stop-color="#8f1610"/></radialGradient>`
  );
  parts.push(
    `<radialGradient id="${p}-bub-research" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#9fd2ff"/><stop offset="0.55" stop-color="#2f80e0"/><stop offset="1" stop-color="#123e86"/></radialGradient>`
  );
  for (const t of TERRITORIES) {
    parts.push(`<clipPath id="${p}-clip-${t.id}"><path d="${TERRITORY_SHAPES[t.id].path}"/></clipPath>`);
  }
  parts.push('</defs>');
  parts.push(`<rect class="wm-sea-bg" x="-5000" y="-5000" width="11000" height="11000" fill="url(#${p}-sea)"/>`);
  parts.push('<g class="wm-world">');

  // Graticule (méridiens / parallèles discrets).
  let grat = '';
  for (let v = 100; v < WORLD_SIZE; v += 100) grat += `M${v} -60V1060M-60 ${v}H1060`;
  parts.push(`<path class="wm-graticule" d="${grat}"/>`);

  // Hauts-fonds autour des côtes (continents + îles-territoires + îlots).
  const islandPaths = ['vantis', 'ashra', 'corvel', 'tenlow'].map((id) => TERRITORY_SHAPES[id].path);
  const allCoasts = [...COASTS.map((c) => c.path), ...islandPaths, ...ISLETS];
  parts.push(`<g class="wm-shallows-outer">${allCoasts.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  parts.push(`<g class="wm-shallows">${allCoasts.map((d) => `<path d="${d}"/>`).join('')}</g>`);
  parts.push(`<g class="wm-islets">${ISLETS.map((d) => `<path d="${d}"/>`).join('')}</g>`);

  // Territoires.
  parts.push('<g class="wm-lands">');
  for (const t of TERRITORIES) {
    const ts = state?.territories?.[t.id];
    const fill = crisisFill(ts?.crisis ?? 0, calmTone(t.id));
    const cls = ['wm-terr'];
    if (state?.selectedId === t.id) cls.push('wm-selected');
    if (state?.originId === t.id) cls.push('wm-origin');
    parts.push(
      `<path class="${cls.join(' ')}" d="${TERRITORY_SHAPES[t.id].path}" data-wm-terr="${t.id}"` +
        (legacyActions ? ` data-action="select-territory" data-id="${t.id}"` : '') +
        ` style="fill:${fill}"/>`
    );
  }
  parts.push('</g>');

  // Pulsation critique (une copie par territoire, affichée seulement si critique).
  parts.push('<g class="wm-pulses">');
  for (const t of TERRITORIES) {
    const crit = (state?.territories?.[t.id]?.crisis ?? 0) >= CRITICAL_CRISIS;
    parts.push(`<path class="wm-pulse${crit ? ' wm-on' : ''}" d="${TERRITORY_SHAPES[t.id].path}" data-pulse="${t.id}"/>`);
  }
  parts.push('</g>');

  parts.push(`<g class="wm-lakes">${LAKES.map((l) => `<path d="${l.path}"/>`).join('')}</g>`);
  parts.push(
    `<g class="wm-relief">${RELIEF.map(([x, y, s]) => `<path d="${mountainPath(x, y, s)}"/>`).join('')}</g>`
  );

  // Liseré de conscience (contour intérieur, découpé par la forme).
  parts.push('<g class="wm-aware">');
  for (const t of TERRITORIES) {
    parts.push(
      `<path d="${TERRITORY_SHAPES[t.id].path}" clip-path="url(#${p}-clip-${t.id})" data-aware="${t.id}" style="stroke-width:0;opacity:0"/>`
    );
  }
  parts.push('</g>');
  // Contour de sélection / ciblage (au-dessus du liseré).
  parts.push('<g class="wm-outlines">');
  for (const t of TERRITORIES) {
    parts.push(`<path d="${TERRITORY_SHAPES[t.id].path}" data-outline="${t.id}"/>`);
  }
  parts.push('</g>');

  // Routes.
  parts.push('<g class="wm-routes">');
  for (const [a, b] of EDGES) {
    const k = routeKey(a, b);
    const kind = ROUTE_KINDS[k];
    const st = state ? routeStatus(state, a, b) : 'idle';
    parts.push(
      `<path class="wm-route wm-route-${kind} wm-${st}" d="${ROUTE_PATHS[k].path}" data-route="${k}"/>` +
        `<path class="wm-route-hit" d="${ROUTE_PATHS[k].path}" data-wm-route="${k}"/>`
    );
  }
  parts.push('</g>');

  // Éléments à taille d'écran constante (contre-zoomés) : data-cs="x y".
  // Carte statique (renderMap) : échelle fixe posée dès le balisage.
  const cs = (x, y) => `data-cs="${x} ${y}"` + (staticScale ? ` transform="translate(${x} ${y}) scale(${staticScale})"` : '');
  parts.push('<g class="wm-overlay">');
  for (const s of SEA_LABELS) {
    parts.push(`<g class="wm-cs wm-sea-label" ${cs(s.x, s.y)}><text>${esc(s.text)}</text></g>`);
  }
  for (const t of TERRITORIES) {
    const sh = TERRITORY_SHAPES[t.id];
    if (sh.port) {
      parts.push(
        `<g class="wm-cs wm-port" ${cs(sh.port.x, sh.port.y)}><circle class="wm-dot" r="2.6"/><g class="wm-pin"><circle r="9"/><text y="0.5">⚓</text></g></g>`
      );
    }
    if (sh.airport) {
      parts.push(
        `<g class="wm-cs wm-airport" ${cs(sh.airport.x, sh.airport.y)}><circle class="wm-dot" r="2.6"/><g class="wm-pin"><circle r="9"/><text y="0.5">✈</text></g></g>`
      );
    }
  }
  for (const [a, b] of EDGES) {
    const k = routeKey(a, b);
    const r = ROUTE_PATHS[k];
    const closed = state && routeStatus(state, a, b) === 'closed';
    parts.push(
      `<g class="wm-cs wm-route-badge${closed ? ' wm-show-closed' : ''}" ${cs(r.midX, r.midY)} data-badge="${k}" data-wm-route="${k}">` +
        '<circle class="wm-badge-hit" r="22"/><circle class="wm-badge-target" r="15"/>' +
        '<circle class="wm-badge-closed" r="10"/><path class="wm-badge-x" d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5"/></g>'
    );
  }
  for (const t of TERRITORIES) {
    const sh = TERRITORY_SHAPES[t.id];
    const ts = state?.territories?.[t.id];
    const playing = state && state.status !== 'selecting-origin';
    const icons = playing && ts ? territoryIcons(state, t.id) : '';
    const lcls = ['wm-cs', 'wm-label'];
    if (state?.selectedId === t.id) lcls.push('wm-selected');
    if (playing && (ts?.crisis ?? 0) >= CRITICAL_CRISIS) lcls.push('wm-critical');
    parts.push(
      `<g class="${lcls.join(' ')}" ${cs(sh.labelX, sh.labelY)} data-label="${t.id}" data-wm-terr="${t.id}"` +
        (legacyActions ? ` data-action="select-territory" data-id="${t.id}"` : '') +
        '>' +
        `<rect class="wm-label-hit" x="-40" y="-14" width="80" height="40"/>` +
        `<text class="wm-name" y="0">${esc(t.name)}</text>` +
        `<text class="wm-icons" y="15">${icons}</text>` +
        '</g>'
    );
  }
  parts.push('<g class="wm-bubbles"></g>');
  parts.push('</g>'); // overlay
  parts.push('</g>'); // world
  parts.push('</svg>');
  return parts.join('');
}

// ---------------------------------------------------------------- carte interactive
export function createWorldMap(container, callbacks = {}) {
  const cb = {
    onTerritoryTap: callbacks.onTerritoryTap || (() => {}),
    onBubbleTap: callbacks.onBubbleTap || (() => {}),
    onRouteTap: callbacks.onRouteTap || (() => {})
  };
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'wm-root';
  // Préfixe d'identifiants unique : plusieurs cartes peuvent coexister (origine puis jeu).
  const idPrefix = `wm${Math.random().toString(36).slice(2, 8)}`;
  root.innerHTML =
    buildWorldMarkup({ idPrefix }) +
    '<button type="button" class="wm-recenter" aria-label="Recentrer la carte" hidden>⌖</button>';
  container.appendChild(root);

  const svg = root.querySelector('svg');
  const world = svg.querySelector('.wm-world');
  const bubbleLayer = svg.querySelector('.wm-bubbles');
  const recenterBtn = root.querySelector('.wm-recenter');

  const byAttr = (attr) => {
    const out = {};
    for (const el of svg.querySelectorAll(`[${attr}]`)) out[el.getAttribute(attr)] = el;
    return out;
  };
  const terrEls = {};
  for (const el of svg.querySelectorAll('path[data-wm-terr]')) terrEls[el.getAttribute('data-wm-terr')] = el;
  const pulseEls = byAttr('data-pulse');
  const awareEls = byAttr('data-aware');
  const outlineEls = byAttr('data-outline');
  const routeEls = byAttr('data-route');
  const badgeEls = byAttr('data-badge');
  const labelEls = byAttr('data-label');
  const iconEls = {};
  for (const [id, el] of Object.entries(labelEls)) iconEls[id] = el.querySelector('.wm-icons');

  // Éléments contre-zoomés : position monde fixe, transform recalculé au zoom.
  const csItems = [];
  for (const el of svg.querySelectorAll('[data-cs]')) {
    const [x, y] = el.getAttribute('data-cs').split(' ').map(Number);
    csItems.push({ el, x, y });
  }

  // Mémo des dernières valeurs écrites (aucune écriture DOM inutile).
  const memo = new Map();
  function setOnce(el, key, value, write) {
    const k = el;
    let m = memo.get(k);
    if (!m) memo.set(k, (m = {}));
    if (m[key] === value) return;
    m[key] = value;
    write(value);
  }
  const setClass = (el, cls, on) => setOnce(el, `c:${cls}`, Boolean(on), (v) => el.classList.toggle(cls, v));
  const setStyle = (el, prop, value) => setOnce(el, `s:${prop}`, value, (v) => el.style.setProperty(prop, v));
  const setText = (el, value) => setOnce(el, 't', value, (v) => (el.textContent = v));

  // ------------------------------------------------ vue (pan / zoom)
  let width = 0;
  let height = 0;
  let fit = { scale: 1, tx: 0, ty: 0 };
  let view = { scale: 1, tx: 0, ty: 0 };
  let userMoved = false;
  let rafPending = false;
  let lastCsScale = -1;

  function applyView() {
    rafPending = false;
    world.setAttribute('transform', `translate(${view.tx.toFixed(2)} ${view.ty.toFixed(2)}) scale(${view.scale.toFixed(5)})`);
    if (view.scale !== lastCsScale) {
      lastCsScale = view.scale;
      const k = (1 / view.scale).toFixed(5);
      for (const it of csItems) it.el.setAttribute('transform', `translate(${it.x} ${it.y}) scale(${k})`);
      for (const b of bubbles.values()) b.el.setAttribute('transform', bubbleTransform(b));
      root.style.setProperty('--wm-zoom', String(view.scale / fit.scale));
      // Décor qui n'a de sens qu'en vue rapprochée / éloignée.
      root.classList.toggle('wm-zoomed', view.scale > fit.scale * 1.6);
    }
    recenterBtn.hidden = !userMoved;
  }
  function scheduleView() {
    if (rafPending) return;
    rafPending = true;
    (doc.defaultView?.requestAnimationFrame || ((f) => setTimeout(f, 16)))(applyView);
  }
  function setView(next) {
    view = clampView(next, width, height, fit.scale);
    scheduleView();
  }
  function measure() {
    const r = svg.getBoundingClientRect();
    width = r.width || container.clientWidth || 360;
    height = r.height || container.clientHeight || 360;
    fit = fitView(width, height);
    if (!userMoved) view = { ...fit };
    else view = clampView(view, width, height, fit.scale);
    lastCsScale = -1;
    scheduleView();
  }
  function zoomAt(px, py, factor) {
    const scale = Math.max(fit.scale * 0.85, Math.min(fit.scale * MAX_ZOOM_FACTOR, view.scale * factor));
    const wx = (px - view.tx) / view.scale;
    const wy = (py - view.ty) / view.scale;
    userMoved = true;
    setView({ scale, tx: px - wx * scale, ty: py - wy * scale });
  }

  const RO = doc.defaultView?.ResizeObserver;
  const ro = RO ? new RO(() => measure()) : null;
  if (ro) ro.observe(root);
  measure();

  // ------------------------------------------------ gestes
  const pointers = new Map();
  let gesture = null; // { kind:'pan'|'pinch', ... }
  let downTarget = null;
  let moved = false;

  function localPoint(e) {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function startPan() {
    const [p] = pointers.values();
    gesture = { kind: 'pan', sx: p.x, sy: p.y, tx: view.tx, ty: view.ty };
  }
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    gesture = {
      kind: 'pinch',
      d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      s0: view.scale,
      wx: (mx - view.tx) / view.scale,
      wy: (my - view.ty) / view.scale
    };
  }
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, localPoint(e));
    if (pointers.size === 1) {
      downTarget = e.target;
      moved = false;
      startPan();
    } else if (pointers.size === 2) {
      moved = true; // un pincement n'est jamais un tap
      startPinch();
    }
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      /* navigateur sans capture : sans conséquence */
    }
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, localPoint(e));
    if (!gesture) return;
    if (gesture.kind === 'pan' && pointers.size === 1) {
      const [p] = pointers.values();
      const dx = p.x - gesture.sx;
      const dy = p.y - gesture.sy;
      if (!moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      moved = true;
      userMoved = true;
      setView({ scale: view.scale, tx: gesture.tx + dx, ty: gesture.ty + dy });
    } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const scale = Math.max(fit.scale * 0.85, Math.min(fit.scale * MAX_ZOOM_FACTOR, (gesture.s0 * d) / gesture.d0));
      userMoved = true;
      setView({ scale, tx: mx - gesture.wx * scale, ty: my - gesture.wy * scale });
    }
  }
  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && wasSingle && !moved && downTarget) dispatchTap(downTarget);
    if (pointers.size === 1) {
      startPan(); // fin de pincement : on continue en glisser, sans tap
    } else if (pointers.size === 0) {
      gesture = null;
      downTarget = null;
    }
  }
  function onWheel(e) {
    e.preventDefault();
    const p = localPoint(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(p.x, p.y, Math.exp(-delta * 0.0018));
  }
  function onDblClick(e) {
    const p = localPoint(e);
    zoomAt(p.x, p.y, 1.8);
  }
  function onRecenter(e) {
    e.stopPropagation();
    api.recenter();
  }

  // ------------------------------------------------ taps
  let current = { mode: 'play', targeting: null, valid: new Set() };
  function dispatchTap(target) {
    const el = target.closest ? target : target.parentElement;
    if (!el) return;
    const bubble = el.closest('[data-wm-bubble]');
    if (bubble) {
      const id = bubble.getAttribute('data-wm-bubble');
      const b = bubbles.get(id);
      if (b && !b.popping) {
        b.popping = true;
        b.el.classList.add('wm-bubble-pop');
      }
      cb.onBubbleTap(b ? b.rawId : id);
      return;
    }
    const route = el.closest('[data-wm-route]');
    if (route && current.targeting?.kind === 'route') {
      const k = route.getAttribute('data-wm-route');
      if (current.valid.has(k)) {
        cb.onRouteTap(k);
        return;
      }
    }
    const terr = el.closest('[data-wm-terr]');
    if (terr) {
      const id = terr.getAttribute('data-wm-terr');
      const valid = current.targeting ? current.targeting.kind === 'territory' && current.valid.has(id) : true;
      flash(id);
      cb.onTerritoryTap(id, { valid });
    }
  }
  function flash(id) {
    const el = outlineEls[id];
    if (!el) return;
    el.classList.remove('wm-flash');
    void el.getBoundingClientRect?.();
    el.classList.add('wm-flash');
  }

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('dblclick', onDblClick);
  recenterBtn.addEventListener('click', onRecenter);
  // Les taps sont gérés en pointerup : on coupe le « click » natif qui suit pour
  // qu'il n'atteigne pas la délégation globale de main.js.
  const swallowClick = (e) => e.stopPropagation();
  svg.addEventListener('click', swallowClick);

  // ------------------------------------------------ bulles
  const bubbles = new Map(); // id -> { el, x, y, slot, ring, popping }
  const RING_LEN = 2 * Math.PI * (BUBBLE_RADIUS_PX + 4);
  function bubbleTransform(b) {
    const k = 1 / view.scale;
    return `translate(${b.x} ${b.y}) scale(${k.toFixed(5)}) translate(${b.dx} ${b.dy})`;
  }
  // Choisit, parmi les emplacements préférés du territoire, le premier qui ne recouvre
  // aucune bulle déjà affichée (calculé à l'échelle de la vue d'ensemble : le pire cas).
  function pickSpot(sh) {
    const spots = sh.bubbleSpots && sh.bubbleSpots.length ? sh.bubbleSpots : [[0, -38]];
    const s = fit.scale;
    const minD = BUBBLE_RADIUS_PX * 2 + 4;
    let best = spots[0];
    let bestOverlap = Infinity;
    for (const [dx, dy] of spots) {
      const px = sh.labelX * s + dx;
      const py = sh.labelY * s + dy;
      let overlap = 0;
      for (const o of bubbles.values()) {
        if (o.popping) continue;
        const d = Math.hypot(px - (o.x * s + o.dx), py - (o.y * s + o.dy));
        overlap += Math.max(0, minD - d);
      }
      if (overlap === 0) return [dx, dy];
      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        best = [dx, dy];
      }
    }
    return best;
  }
  function createBubble(b) {
    const sh = TERRITORY_SHAPES[b.territoryId];
    if (!sh) return null;
    const [dx, dy] = pickSpot(sh);
    const g = doc.createElementNS(SVG_NS, 'g');
    const kind = b.kind === 'research' ? 'research' : 'influence';
    g.setAttribute('class', `wm-bubble wm-bubble-${kind}`);
    g.setAttribute('data-wm-bubble', String(b.id));
    const r = BUBBLE_RADIUS_PX;
    const sign = kind === 'research' ? '−' : '+';
    const glyph = kind === 'research' ? '🔬' : '⚡';
    g.innerHTML =
      `<circle class="wm-bubble-hit" r="${r + 6}"/>` +
      `<circle class="wm-bubble-ring" r="${r + 4}" stroke-dasharray="${RING_LEN.toFixed(1)}"/>` +
      `<circle class="wm-bubble-body" r="${r}" fill="url(#${idPrefix}-bub-${kind})"/>` +
      `<text class="wm-bubble-glyph" y="-6">${glyph}</text>` +
      `<text class="wm-bubble-value" y="12">${sign}${esc(formatValue(b.value))}</text>`;
    const entry = { el: g, x: sh.labelX, y: sh.labelY, dx, dy, ring: g.querySelector('.wm-bubble-ring'), popping: false, rawId: b.id };
    g.setAttribute('transform', bubbleTransform(entry));
    bubbleLayer.appendChild(g);
    return entry;
  }
  function formatValue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  }
  function updateBubbles(state, show) {
    const list = show && Array.isArray(state.bubbles) ? state.bubbles : [];
    const seen = new Set();
    for (const b of list) seen.add(String(b.id));
    // On retire d'abord les bulles disparues : leur place se libère pour les nouvelles.
    for (const [id, entry] of bubbles) {
      if (seen.has(id)) continue;
      bubbles.delete(id);
      memo.delete(entry.ring);
      memo.delete(entry.el);
      if (entry.popping) setTimeout(() => entry.el.remove(), 260);
      else entry.el.remove();
    }
    for (const b of list) {
      const id = String(b.id);
      let entry = bubbles.get(id);
      if (!entry) {
        entry = createBubble(b);
        if (!entry) continue;
        bubbles.set(id, entry);
      }
      const life = Math.max(1e-6, (b.expiresDay ?? 0) - (b.bornDay ?? 0));
      const left = Math.max(0, Math.min(1, ((b.expiresDay ?? 0) - (state.day ?? 0)) / life));
      const off = (RING_LEN * (1 - left)).toFixed(1);
      setOnce(entry.ring, 'off', off, (v) => entry.ring.setAttribute('stroke-dashoffset', v));
      setClass(entry.el, 'wm-bubble-ending', left < 0.3);
    }
  }

  // ------------------------------------------------ update
  function update(state, opts = {}) {
    if (!state || !state.territories) return;
    const mode = opts.mode === 'origin' ? 'origin' : 'play';
    const targeting = mode === 'play' && opts.targeting && Array.isArray(opts.targeting.validTargets) ? opts.targeting : null;
    const valid = new Set(targeting ? targeting.validTargets.map(String) : []);
    current = { mode, targeting, valid };

    setClass(root, 'wm-mode-origin', mode === 'origin');
    setClass(root, 'wm-targeting', Boolean(targeting));
    setClass(root, 'wm-targeting-route', targeting?.kind === 'route');

    for (const t of TERRITORIES) {
      const id = t.id;
      const ts = state.territories[id];
      if (!ts) continue;
      const crisis = Math.round(ts.crisis || 0);
      setStyle(terrEls[id], 'fill', crisisFill(mode === 'origin' ? 0 : crisis, calmTone(id)));
      setClass(pulseEls[id], 'wm-on', mode === 'play' && crisis >= CRITICAL_CRISIS);

      const aw = awarenessStroke(mode === 'origin' ? 0 : ts.awareness);
      setStyle(awareEls[id], 'stroke-width', `${aw.width}px`);
      setStyle(awareEls[id], 'opacity', String(aw.opacity));

      const isTarget = targeting?.kind === 'territory' && valid.has(id);
      const dim = Boolean(targeting) && !isTarget;
      setClass(terrEls[id], 'wm-dim', dim);
      setClass(labelEls[id], 'wm-dim', dim);
      setClass(outlineEls[id], 'wm-target', isTarget);
      setClass(outlineEls[id], 'wm-selected', state.selectedId === id);
      setClass(labelEls[id], 'wm-selected', state.selectedId === id);
      setClass(outlineEls[id], 'wm-origin', mode === 'play' && state.originId === id);

      let icons = '';
      if (mode === 'play') {
        if (state.originId === id) icons += '◉';
        if ((ts.containment || 0) >= STRONG_CONTAINMENT) icons += (icons ? ' ' : '') + '🛡';
      }
      setText(iconEls[id], icons);
      setClass(labelEls[id], 'wm-critical', mode === 'play' && crisis >= CRITICAL_CRISIS);
    }

    for (const [a, b] of EDGES) {
      const k = routeKey(a, b);
      const st = mode === 'origin' ? 'idle' : routeStatus(state, a, b);
      const el = routeEls[k];
      setClass(el, 'wm-closed', st === 'closed');
      setClass(el, 'wm-flowing', st === 'flowing');
      setClass(el, 'wm-idle', st === 'idle');
      const isTarget = targeting?.kind === 'route' && valid.has(k);
      setClass(el, 'wm-target', isTarget);
      const badge = badgeEls[k];
      setClass(badge, 'wm-show-closed', st === 'closed');
      setClass(badge, 'wm-target', isTarget);
    }

    updateBubbles(state, mode === 'play');
  }

  const api = {
    element: root,
    update,
    recenter() {
      userMoved = false;
      view = { ...fit };
      lastCsScale = -1;
      scheduleView();
    },
    /** Centre la vue sur un territoire (zoom facultatif, par rapport à la vue d'ensemble). */
    focusTerritory(id, zoom = 2.2) {
      const sh = TERRITORY_SHAPES[id];
      if (!sh) return;
      const scale = fit.scale * zoom;
      userMoved = true;
      setView({ scale, tx: width / 2 - sh.labelX * scale, ty: height / 2 - sh.labelY * scale });
    },
    /** Zoom programmatique autour du centre (boutons, tests). */
    zoomBy(factor) {
      zoomAt(width / 2, height / 2, factor);
    },
    getView() {
      return { ...view, zoom: view.scale / fit.scale, width, height };
    },
    destroy() {
      if (ro) ro.disconnect();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerUp);
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('dblclick', onDblClick);
      svg.removeEventListener('click', swallowClick);
      recenterBtn.removeEventListener('click', onRecenter);
      bubbles.clear();
      memo.clear();
      root.remove();
    }
  };
  return api;
}
