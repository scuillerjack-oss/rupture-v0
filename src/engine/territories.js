export const TERRITORIES = [
  { id: 'arca',     name: 'Arca',     x: 15, y: 20, population: 6 },
  { id: 'boreal',   name: 'Boréal',   x: 40, y: 10, population: 8 },
  { id: 'cindra',   name: 'Cindra',   x: 65, y: 15, population: 5 },
  { id: 'delthia',  name: 'Delthia',  x: 85, y: 25, population: 4 },
  { id: 'esser',    name: 'Esser',    x: 25, y: 40, population: 7 },
  { id: 'fenwick',  name: 'Fenwick',  x: 50, y: 35, population: 9 },
  { id: 'gora',     name: 'Gora',     x: 75, y: 40, population: 6 },
  { id: 'halvern',  name: 'Halvern',  x: 10, y: 55, population: 3 },
  { id: 'ismer',    name: 'Ismer',    x: 35, y: 60, population: 5 },
  { id: 'jotun',    name: 'Jotun',    x: 55, y: 58, population: 8 },
  { id: 'kelsor',   name: 'Kelsor',   x: 78, y: 62, population: 6 },
  { id: 'lyrath',   name: 'Lyrath',   x: 20, y: 80, population: 4 },
  { id: 'meridia',  name: 'Meridia',  x: 45, y: 85, population: 7 },
  { id: 'nyxor',    name: 'Nyxor',    x: 70, y: 85, population: 5 },
  { id: 'vantis',   name: 'Vantis',   x: 5,  y: 35, population: 4 },
  { id: 'ashra',    name: 'Ashra',    x: 50, y: 5,  population: 6 },
  { id: 'corvel',   name: 'Corvel',   x: 92, y: 45, population: 5 },
  { id: 'tenlow',   name: 'Tenlow',   x: 92, y: 80, population: 4 }
];

export const EDGES = [
  ['arca', 'boreal'], ['arca', 'esser'],
  ['boreal', 'cindra'], ['boreal', 'fenwick'],
  ['cindra', 'delthia'], ['cindra', 'gora'],
  ['delthia', 'gora'],
  ['esser', 'fenwick'], ['esser', 'halvern'],
  ['fenwick', 'gora'], ['fenwick', 'jotun'],
  ['gora', 'kelsor'],
  ['halvern', 'ismer'],
  ['ismer', 'jotun'], ['ismer', 'lyrath'],
  ['jotun', 'kelsor'], ['jotun', 'meridia'],
  ['kelsor', 'nyxor'],
  ['lyrath', 'meridia'],
  ['meridia', 'nyxor'],
  ['vantis', 'arca'], ['vantis', 'halvern'],
  ['ashra', 'boreal'], ['ashra', 'cindra'],
  ['corvel', 'delthia'], ['corvel', 'kelsor'],
  ['tenlow', 'nyxor'], ['tenlow', 'kelsor']
];

export function buildAdjacency() {
  const adjacency = new Map();
  for (const t of TERRITORIES) adjacency.set(t.id, new Set());
  for (const [a, b] of EDGES) {
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }
  return adjacency;
}

export function getTerritory(id) {
  return TERRITORIES.find((t) => t.id === id);
}
