# V7 — Contrat entre le moteur (`src/engine/`) et l'interface

Écrit par le chef de projet avant le travail des équipes. Toute fonction ci-dessous est exportée par le moteur,
pure (sans DOM), sûre à appeler à tout moment (renvoie `{ ok:false, error }` plutôt que lever une erreur).
Les champs d'état sont en lecture seule pour l'interface. Sauvegarde : `SAVE_VERSION` 7 avec migration depuis 6.

## Hasard
- `state.seed` (chaîne), `state.rngCounter` ; `beginNewGame(state, difficulty, { seed, strain })`.
- `dailySeed(date = new Date())` → `'AAAA-MM-JJ'` (défi du jour).

## Bulles — `src/engine/bubbles.js` (réexporté par `simulation.js`)
- `state.bubbles` : `[{ id, kind: 'influence'|'research', territoryId, value, bornDay, expiresDay }]`
  (créées/expirées par `simulateTick`).
- `collectBubble(state, id)` → `{ ok, kind, gain }` (influence ajoutée, ou Réponse retirée).

## Capacités — `src/engine/abilities.js`
- `ABILITIES` : `[{ id: 'surge'|'jam'|'breach', label, description, cost, cooldownDays, target: 'territory'|'route' }]`.
- `state.abilityCooldowns` : `{ [id]: dayDisponible }`.
- `abilityStatus(state, id)` → `{ available, reason, cost, readyInDays }`.
- `abilityTargets(state, id)` → liste d'ids de territoires (ou de routes `'a|b'`) valides.
- `useAbility(state, id, target)` → `{ ok, error }`.

## Événements — `src/engine/events.js`
- `state.pendingEvent` : `null` ou `{ id, title, text, territoryId?, options: [{ id, label, effectText, disabled?, reason? }] }`.
  Tant qu'il est non nul, `simulateTick` ne fait pas avancer le temps.
- `chooseEventOption(state, optionId)` → `{ ok, error, resultText }`.

## Adaptation de l'Humanité
- `state.adaptation` : `null` ou `{ branch, factor, untilDay }`.

## Projection et obstacles — `src/engine/forecast.js`
- `forecastRace(state)` → `{ ruptureDay: number|null, controlDay: number|null }` (n'altère pas `state`).
- `progressBlockers(state)` → `[{ kind, text }]` ex. `{ kind:'gravity-cap', text:'Gravité plafonnée : Dangerosité 8 requise' }`.

## Fin de partie
- `state.outcome` : `null` ou `{ result: 'victory'|'defeat', reason: 'rupture'|'control'|'stalled'|'tie', day, stars }`.

## Souches et méta
- `STRAINS` : `[{ id: 'standard'|'rumeur'|'fracture'|'echo', label, description, unlockStars }]` ; `state.strain`.
- `src/engine/meta.js` : `createMeta()`, `recordGame(meta, state)` → `{ meta, newRecord, starsGained }`,
  `isUnlocked(meta, strainId)`, `starsFor(state)` (1-3 selon difficulté et jour de victoire). Stockage par `save.js`.

## Inchangé
- `buyUpgrade(state, kind)`, `selectTerritory`, `setSpeed`, `TERRITORIES`, `EDGES` (mêmes identifiants et mêmes routes).

## Carte — `src/ui/worldMap.js` (équipe Carte) ↔ écran de jeu (équipe Interface)
Géométrie dans `src/ui/worldGeometry.js` (données pures, sans DOM : `CONTINENTS`, `TERRITORY_SHAPES[id] = { path, labelX, labelY, port?, airport? }`,
`ROUTE_KINDS['a|b'] = 'land'|'sea'|'air'`, clé de route triée alphabétiquement ; `viewBox` 0 0 1000 1000).
- `createWorldMap(container, { onTerritoryTap(id), onBubbleTap(bubbleId), onRouteTap(routeKey) })` → objet carte.
  La carte crée son SVG une seule fois, puis :
- `map.update(state, { mode: 'origin'|'play', targeting: null | { abilityId, kind: 'territory'|'route', validTargets: [...] } })`
  → mise à jour **incrémentale** (attributs/classes), jamais de `innerHTML` complet ; appelée à chaque tick (≈ 4 fois/s max).
- `map.recenter()`, `map.destroy()`. Pan/zoom au doigt gérés par la carte (un glisser ne déclenche pas de tap).
- `routeKey(a, b)` exporté (ordre alphabétique) ; `abilityTargets` du moteur renvoie les routes sous cette forme.
L'écran de jeu donne à la carte ≈ 60 % de la hauteur ; la carte remplit son conteneur (pas de taille fixe).
