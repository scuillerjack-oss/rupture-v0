import { EDGES } from './territories.js';

// V7 : clé d'une route du moteur, 'a|b' avec a < b (ordre alphabétique) -
// même convention que src/ui/worldGeometry.js (ROUTE_KINDS) et worldMap.routeKey.
export function routeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function parseRouteKey(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('|');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return parts;
}

export const ROUTE_KEYS = EDGES.map(([a, b]) => routeKey(a, b));
const ROUTE_SET = new Set(ROUTE_KEYS);

export function isKnownRoute(key) {
  return ROUTE_SET.has(key);
}

// Une route est fermée dès qu'un des deux côtés l'a fermée (closedRoutes est
// tenu par territoire : `ts.closedRoutes` liste les voisins dont il bloque l'arrivée).
export function isRouteClosed(state, key) {
  const parts = parseRouteKey(key);
  if (!parts) return false;
  const [a, b] = parts;
  const ta = state.territories?.[a];
  const tb = state.territories?.[b];
  return Boolean(ta?.closedRoutes?.includes(b) || tb?.closedRoutes?.includes(a));
}

export function closedRouteKeys(state) {
  return ROUTE_KEYS.filter((key) => isRouteClosed(state, key));
}

export function openRoute(state, key) {
  const parts = parseRouteKey(key);
  if (!parts) return false;
  const [a, b] = parts;
  const ta = state.territories?.[a];
  const tb = state.territories?.[b];
  if (!ta || !tb) return false;
  ta.closedRoutes = ta.closedRoutes.filter((id) => id !== b);
  tb.closedRoutes = tb.closedRoutes.filter((id) => id !== a);
  return true;
}

export function closeRoute(state, key) {
  const parts = parseRouteKey(key);
  if (!parts) return false;
  const [a, b] = parts;
  const ta = state.territories?.[a];
  const tb = state.territories?.[b];
  if (!ta || !tb) return false;
  if (!ta.closedRoutes.includes(b)) ta.closedRoutes.push(b);
  if (!tb.closedRoutes.includes(a)) tb.closedRoutes.push(a);
  return true;
}
