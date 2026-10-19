// Compatibilité V6 -> V7 : l'ancien écran (screens.js) appelle encore renderMap()
// et renderMapLegend() sous forme de chaînes HTML. Ils délèguent désormais au
// dessin du monde V7 (worldMap.js) : même carte, mais statique (pas de pan/zoom,
// pas de bulles). L'écran V7 utilise createWorldMap() directement.
// Les taps passent toujours par data-action="select-territory" (délégation de main.js).
// Nécessite la feuille src/ui/worldMap.css.
import { buildWorldMarkup, crisisFill, CRITICAL_CRISIS } from './worldMap.js';

export { createWorldMap, routeKey } from './worldMap.js';

export function renderMap(state, selectable = true) {
  return `<div class="wm-root wm-static${state?.status === 'selecting-origin' ? ' wm-mode-origin' : ''}">${buildWorldMarkup({
    state,
    legacyActions: Boolean(selectable),
    idPrefix: 'wmlegacy',
    // ≈ 1000 unités affichées sur ~370 px : noms à ~12 px réels sur téléphone.
    staticScale: 2.6
  })}</div>`;
}

export function renderMapLegend() {
  const steps = [
    ['Stable', crisisFill(0)],
    ['Atteinte', crisisFill(25)],
    ['Grave', crisisFill(60)],
    ['Critique', crisisFill(CRITICAL_CRISIS + 15)]
  ];
  return `
    <div class="map-legend">
      ${steps.map(([label, color]) => `<span class="legend-item"><i class="legend-dot" style="background:${color}"></i>${label}</span>`).join('')}
      <span class="legend-item"><i class="legend-dot" style="background:transparent;box-shadow:inset 0 0 0 2px #7fc8ff"></i>Conscience</span>
    </div>`;
}
