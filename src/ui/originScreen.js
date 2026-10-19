// V7 — choix de l'origine, plein écran sur la carte du monde, avec une fiche
// courte de la région touchée (population, routes, voisins, conseil) et le
// bouton « Commencer à <Nom> » (jamais l'identifiant : bug V6).
// Construit une fois ; update() ne touche que ce qui change.
import { h, setText, setHidden, setClass } from './dom.js';
import { createMapHost, loadWorldGeometry } from './mapHost.js';
import { originCard } from './playModel.js';

let routeKinds = null;
loadWorldGeometry().then((geo) => { routeKinds = geo?.ROUTE_KINDS ?? null; });

export function confirmOriginLabel(id) {
  const card = originCard(id);
  return card ? `Commencer à ${card.name}` : 'Choisis une région';
}

export function createOriginScreen(actions) {
  const root = h('div', { class: 'screen origin-screen', 'data-screen': 'origin' });
  const mapSurface = h('div', { class: 'origin-map' });

  const back = h('button', { class: 'origin-back', 'aria-label': 'Retour au menu', text: '‹', on: { click: () => actions.back() } });
  const headTitle = h('strong', { text: 'Où naît l’Anomalie ?' });
  const headSub = h('span', { class: 'origin-sub' });
  const head = h('div', { class: 'origin-head' }, [back, h('div', {}, [headTitle, headSub])]);

  const name = h('h3');
  const badge = h('span', { class: 'origin-badge', text: 'Départ difficile' });
  const facts = h('div', { class: 'origin-facts' });
  const neighbors = h('div', { class: 'origin-neighbors' });
  const advice = h('p', { class: 'origin-advice' });
  const confirm = h('button', { class: 'primary-btn origin-confirm', 'data-testid': 'confirm-origin', on: { click: () => selected && actions.confirm(selected) } });
  const empty = h('p', { class: 'origin-empty', text: 'Touche une région de la carte pour voir sa fiche.' });
  const card = h('div', { class: 'origin-card', 'data-testid': 'origin-card' }, [
    h('div', { class: 'origin-card-head' }, [name, badge]), facts, neighbors, advice, confirm
  ]);
  const panel = h('div', { class: 'origin-panel' }, [empty, card]);

  root.append(mapSurface, head, panel);

  const mapHost = createMapHost(mapSurface, {
    onTerritoryTap: (id) => actions.select(id),
    onBubbleTap: () => {},
    onRouteTap: () => {}
  });

  let selected = null;

  return {
    el: root,
    map: mapHost,
    update(state, { subtitle = '' } = {}) {
      mapHost.update(state, { mode: 'origin', targeting: null });
      setText(headSub, subtitle);
      selected = state.selectedId && state.territories?.[state.selectedId] ? state.selectedId : null;
      const c = selected ? originCard(selected, routeKinds) : null;
      setHidden(empty, Boolean(c));
      setHidden(card, !c);
      if (!c) return;
      setText(name, c.name);
      setHidden(badge, !c.hard);
      setText(facts, `Population ${c.population}/10 · ${c.routes} route${c.routes > 1 ? 's' : ''} (${c.routesText})`);
      setText(neighbors, `Voisins : ${c.neighbors.join(', ')}`);
      setText(advice, c.advice);
      setText(confirm, confirmOriginLabel(selected));
      setClass(card, 'hard', c.hard);
    },
    destroy() {
      mapHost.destroy();
      root.remove();
    }
  };
}
