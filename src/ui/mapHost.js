// V7 — hôte de la carte du monde dans l'écran de jeu.
//
// La vraie carte est src/ui/worldMap.js (équipe Carte, contrat dans
// docs/V7-contrat-api.md). Ce module :
//  - essaie de la charger par import dynamique (motif `./world${nom}.js` :
//    Vite/esbuild l'empaquettent s'il existe, sinon la promesse est rejetée
//    sans casser le build) ainsi que sa feuille ./worldMap.css ;
//  - sinon, retombe sur l'ancienne carte V6 (renderMap de map.js), redessinée
//    SEULEMENT quand son aspect change (signature), jamais à chaque tick.
// L'interface ne parle qu'à l'objet renvoyé par createMapHost : même forme que
// la carte du contrat (update / recenter / destroy), plus `kind`.
import { renderMap } from './map.js';
import { TERRITORIES } from '../engine/territories.js';
import { safeImport } from './engineV7.js';

let worldMapModulePromise = null;
let worldGeometryPromise = null;

const MAP_NAME = 'Map';
const GEOMETRY_NAME = 'Geometry';

export function loadWorldMapModule() {
  if (!worldMapModulePromise) {
    worldMapModulePromise = safeImport(() => import(`./world${MAP_NAME}.js`))
      .then((mod) => (typeof mod?.createWorldMap === 'function' ? mod : null));
    // Feuille de style de la carte : chargée seulement si elle existe
    // (sous Node, l'import d'un .css échoue proprement : ignoré).
    if (typeof document !== 'undefined') safeImport(() => import(`./world${MAP_NAME}.css`));
  }
  return worldMapModulePromise;
}

export function loadWorldGeometry() {
  if (!worldGeometryPromise) {
    worldGeometryPromise = safeImport(() => import(`./world${GEOMETRY_NAME}.js`));
  }
  return worldGeometryPromise;
}

// Signature de l'aspect de l'ancienne carte : ne redessiner que si une
// région change de palier de crise, de sélection ou de routes fermées.
function legacySignature(state) {
  const parts = [state.selectedId, state.originId];
  for (const [id, t] of Object.entries(state.territories || {})) {
    const bucket = t.crisis <= 0 ? 0 : t.crisis < 25 ? 1 : t.crisis < 50 ? 2 : t.crisis < 75 ? 3 : 4;
    parts.push(id, bucket, (t.closedRoutes || []).length);
  }
  return parts.join(',');
}

function createLegacyMap(container, handlers) {
  const root = document.createElement('div');
  root.className = 'legacy-map';
  container.appendChild(root);
  let lastSig = null;
  const onClick = (event) => {
    const bubble = event.target.closest('[data-bubble]');
    if (bubble && root.contains(bubble)) {
      event.stopPropagation();
      handlers.onBubbleTap?.(bubble.dataset.bubble);
      return;
    }
    const node = event.target.closest('[data-id]');
    if (!node || !root.contains(node)) return;
    event.stopPropagation();
    handlers.onTerritoryTap?.(node.dataset.id);
  };
  root.addEventListener('click', onClick);
  return {
    kind: 'legacy',
    update(state, opts = {}) {
      const bubbles = Array.isArray(state.bubbles) ? state.bubbles : [];
      const sig = `${legacySignature(state)}|${opts.mode}|${opts.targeting?.abilityId ?? ''}|${bubbles.map((b) => b.id).join(',')}`;
      if (sig === lastSig) return;
      lastSig = sig;
      // L'ancienne carte porte data-action="select-territory" : on le retire
      // pour que seul l'hôte gère le tap (pas de double traitement).
      root.innerHTML = renderMap(state, true).replaceAll('data-action="select-territory"', '');
      // Bulles (repli minimal ; la vraie carte V7 les dessine elle-même).
      const svg = root.querySelector('svg');
      if (svg && bubbles.length) {
        const NS = 'http://www.w3.org/2000/svg';
        const layer = document.createElementNS(NS, 'g');
        for (const b of bubbles) {
          const t = TERRITORIES.find((x) => x.id === b.territoryId);
          if (!t) continue;
          const c = document.createElementNS(NS, 'circle');
          c.setAttribute('cx', t.x + 4);
          c.setAttribute('cy', t.y - 4);
          c.setAttribute('r', 3.4);
          c.setAttribute('class', `legacy-bubble legacy-bubble-${b.kind}`);
          c.setAttribute('data-bubble', b.id);
          layer.appendChild(c);
        }
        svg.appendChild(layer);
      }
      if (opts.targeting?.validTargets) {
        for (const id of opts.targeting.validTargets) {
          root.querySelector(`[data-id="${id}"]`)?.classList.add('node-target');
        }
      }
    },
    recenter() {},
    destroy() {
      root.removeEventListener('click', onClick);
      root.remove();
    }
  };
}

// Crée la carte dans `container`. Renvoie tout de suite un hôte utilisable ;
// la vraie carte remplace l'ancienne dès que son module est chargé.
export function createMapHost(container, handlers = {}) {
  let impl = createLegacyMap(container, handlers);
  let lastArgs = null;
  let destroyed = false;

  loadWorldMapModule().then((mod) => {
    if (!mod || destroyed) return;
    try {
      const real = mod.createWorldMap(container, handlers);
      impl.destroy();
      impl = { kind: 'world', ...wrap(real) };
      if (lastArgs) impl.update(...lastArgs);
    } catch (e) {
      console.warn('Carte du monde indisponible, ancienne carte conservée', e);
    }
  });

  function wrap(real) {
    return {
      update: (...args) => real.update(...args),
      recenter: () => real.recenter?.(),
      destroy: () => real.destroy?.()
    };
  }

  return {
    get kind() { return impl.kind; },
    update(state, opts) {
      lastArgs = [state, opts];
      try {
        impl.update(state, opts);
      } catch (e) {
        console.warn('Mise à jour de la carte impossible', e);
      }
    },
    recenter() { impl.recenter(); },
    destroy() {
      destroyed = true;
      impl.destroy();
    }
  };
}
