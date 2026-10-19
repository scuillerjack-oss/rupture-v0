// V7 : hasard à graine. Plus aucun Math.random dans le moteur : tout tirage
// passe par nextRandom(state), qui dépend uniquement de state.seed (chaîne)
// et de state.rngCounter (entier, incrémenté à chaque tirage). Les deux sont
// sérialisés avec la sauvegarde : une partie reprise continue exactement la
// même suite de tirages, et deux parties de même graine jouées de la même
// façon sont identiques (défi du jour, simulations reproductibles).

const hashCache = new Map();

// FNV-1a 32 bits : transforme la graine (chaîne) en entier.
export function hashSeed(seed) {
  const str = String(seed ?? '');
  const cached = hashCache.get(str);
  if (cached !== undefined) return cached;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  if (hashCache.size > 256) hashCache.clear();
  hashCache.set(str, h);
  return h;
}

// splitmix32 : mélange (graine, compteur) en un flottant dans [0, 1).
function mix(x) {
  let t = (x + 0x9e3779b9) | 0;
  t ^= t >>> 16;
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return (t >>> 0) / 4294967296;
}

export function randomAt(seed, counter) {
  return mix((hashSeed(seed) + Math.imul(counter | 0, 0x9e3779b9)) | 0);
}

export function nextRandom(state) {
  const counter = Number.isInteger(state.rngCounter) ? state.rngCounter : 0;
  state.rngCounter = counter + 1;
  return randomAt(state.seed, counter);
}

// Entier uniforme dans [min, max] (bornes incluses).
export function randomInt(state, min, max) {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function pickOne(state, list) {
  if (!list.length) return undefined;
  return list[Math.floor(nextRandom(state) * list.length)];
}

// Tirage pondéré : `weights[i]` >= 0. Renvoie undefined si tout est nul.
export function pickWeighted(state, list, weightOf) {
  let total = 0;
  for (const item of list) total += Math.max(0, weightOf(item));
  if (total <= 0) return undefined;
  let r = nextRandom(state) * total;
  for (const item of list) {
    r -= Math.max(0, weightOf(item));
    if (r < 0) return item;
  }
  return list[list.length - 1];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Graine du défi du jour : la date locale du téléphone, 'AAAA-MM-JJ'.
export function dailySeed(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

let autoSeedCounter = 0;
// Graine par défaut quand l'interface n'en fournit pas : unique, mais sans
// Math.random (horloge + compteur).
export function autoSeed() {
  autoSeedCounter += 1;
  return `p-${Date.now().toString(36)}-${autoSeedCounter.toString(36)}`;
}
