// V7 — écran de jeu, construit UNE fois puis mis à jour (rendu incrémental).
//
// Mise en page (390×844, sans défilement) :
//   HUD une ligne + barre de course
//   carte (flex:1 ≈ 60 % de la hauteur) avec, en surimpression :
//     - en haut : projection de la course, obstacle, adaptation de l'Humanité
//     - en bas  : fiche de la région touchée + bandeau du dernier événement
//     - bandeau de ciblage (capacité en cours + « Annuler »)
//   barre des 3 capacités
//   barre compacte des 4 améliorations (une ligne chacune) ; toucher le nom
//   ouvre le tiroir de détail, toucher le prix achète.
// Les fenêtres (événement, tiroir) sont des couches au-dessus, créées une fois.
import { h, setText, setClass, setHidden, setDisabled, setAttr, setStyle } from './dom.js';
import { createHud } from './hud.js';
import { createMapHost } from './mapHost.js';
import {
  upgradeModels, abilityModels, forecastText, blockerModel, adaptationText,
  latestLogLine, territoryModel
} from './playModel.js';
import { territoryName, abilityTargets } from './engineV7.js';

function routeLabel(key) {
  const [a, b] = String(key).split('|');
  return `${territoryName(a)}–${territoryName(b)}`;
}

export function createPlayScreen(actions) {
  const root = h('div', { class: 'screen play-screen', 'data-screen': 'playing' });

  // --- HUD ---
  const hud = createHud({
    onMenu: () => actions.openMenu(),
    onPause: () => actions.togglePause(),
    onSpeed: () => actions.cycleSpeed()
  });

  // --- Carte + surimpressions ---
  const mapBox = h('div', { class: 'play-map' });
  const mapSurface = h('div', { class: 'play-map-surface' });
  mapBox.appendChild(mapSurface);

  const forecastEl = h('div', { class: 'chip chip-forecast', 'data-testid': 'forecast' });
  const blockerEl = h('div', { class: 'chip chip-blocker', 'data-testid': 'blocker' });
  const adaptationEl = h('div', { class: 'chip chip-adapt', 'data-testid': 'adaptation' });
  const topInfo = h('div', { class: 'map-top-info' }, [forecastEl, blockerEl, adaptationEl]);

  const recenterBtn = h('button', { class: 'map-recenter', 'aria-label': 'Recentrer la carte', text: '⌖', on: { click: () => mapHost.recenter() } });

  const terrName = h('strong');
  const terrStats = h('span', { class: 'terr-stats' });
  const terrCard = h('div', { class: 'terr-card', 'data-testid': 'territory-card' }, [terrName, terrStats]);
  const logBanner = h('div', { class: 'log-banner', 'data-testid': 'log-banner', 'aria-live': 'polite' });
  const bottomInfo = h('div', { class: 'map-bottom-info' }, [terrCard, logBanner]);

  const targetText = h('span', { class: 'target-text' });
  const targetChips = h('div', { class: 'target-chips' });
  const targetCancel = h('button', { class: 'target-cancel', text: 'Annuler', 'data-testid': 'cancel-targeting', on: { click: () => actions.cancelTargeting() } });
  const targetBanner = h('div', { class: 'target-banner', 'data-testid': 'targeting' }, [targetText, targetChips, targetCancel]);

  const floatLayer = h('div', { class: 'float-layer', 'aria-hidden': 'true' });
  mapBox.append(topInfo, recenterBtn, bottomInfo, targetBanner);

  // Dernière position touchée sur la carte : sert à faire s'envoler le gain
  // d'une bulle à l'endroit exact du doigt (la carte ne donne que l'id).
  let lastPointer = null;
  mapBox.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, { capture: true });

  const mapHost = createMapHost(mapSurface, {
    onTerritoryTap: (id) => actions.territoryTap(id),
    onBubbleTap: (bubbleId) => actions.bubbleTap(bubbleId, lastPointer),
    onRouteTap: (key) => actions.routeTap(key)
  });

  // --- Capacités ---
  const abilityBar = h('div', { class: 'ability-bar', 'data-testid': 'abilities' });
  const abilityButtons = new Map();
  function ensureAbilityButtons(models) {
    const ids = models.map((m) => m.id).join(',');
    if (abilityBar.dataset.ids === ids) return;
    abilityBar.dataset.ids = ids;
    abilityBar.replaceChildren();
    abilityButtons.clear();
    for (const m of models) {
      const icon = h('span', { class: 'ab-icon', text: m.icon });
      const label = h('span', { class: 'ab-label', text: m.label });
      const sub = h('span', { class: 'ab-sub' });
      const gauge = h('span', { class: 'ab-gauge' });
      const btn = h('button', { class: 'ability-btn', 'data-ability': m.id, on: { click: () => actions.abilityTap(m.id) } }, [gauge, icon, h('span', { class: 'ab-text' }, [label, sub])]);
      abilityButtons.set(m.id, { btn, sub, gauge, label });
      abilityBar.appendChild(btn);
    }
    setHidden(abilityBar, models.length === 0);
  }

  // --- Améliorations ---
  const upgradeBar = h('div', { class: 'upgrade-bar', 'data-testid': 'upgrades' });
  const upgradeRows = new Map();
  for (const m of upgradeModels({ upgrades: {}, influence: 0 })) {
    const name = h('span', { class: 'up-name' });
    const level = h('span', { class: 'up-level' });
    const adapted = h('span', { class: 'up-adapted', text: '−25 %', title: "L'Humanité s'adapte" });
    const info = h('button', { class: 'up-info', 'aria-label': `Détail ${m.label}`, on: { click: () => actions.openDrawer(m.kind) } }, [
      h('span', { class: 'up-icon', text: m.icon }), name, level, adapted
    ]);
    const buy = h('button', { class: 'up-buy', 'data-kind': m.kind, on: { click: () => actions.buy(m.kind) } });
    const row = h('div', { class: 'upgrade-line', 'data-kind': m.kind }, [info, buy]);
    row.addEventListener('animationend', () => row.classList.remove('pulse'));
    upgradeRows.set(m.kind, { row, name, level, buy, adapted });
    upgradeBar.appendChild(row);
  }

  // --- Tiroir de détail d'amélioration ---
  const drawerTitle = h('h3');
  const drawerLevel = h('span', { class: 'drawer-level' });
  const drawerDesc = h('p', { class: 'drawer-desc' });
  const drawerNext = h('p', { class: 'drawer-next' });
  const drawerAdapt = h('p', { class: 'drawer-adapt' });
  const drawerBuy = h('button', { class: 'primary-btn drawer-buy', on: { click: () => drawerKind && actions.buy(drawerKind) } });
  const drawerClose = h('button', { class: 'secondary-btn drawer-close', text: 'Fermer', on: { click: () => actions.closeDrawer() } });
  const drawerCard = h('div', { class: 'drawer-card', role: 'dialog' }, [
    h('div', { class: 'drawer-head' }, [drawerTitle, drawerLevel]), drawerDesc, drawerNext, drawerAdapt,
    h('div', { class: 'drawer-actions' }, [drawerBuy, drawerClose])
  ]);
  const drawer = h('div', { class: 'drawer', 'data-testid': 'drawer', on: { click: (e) => { if (e.target === drawer) actions.closeDrawer(); } } }, [drawerCard]);
  let drawerKind = null;

  // --- Fenêtre d'événement ---
  const evTitle = h('h3');
  const evPlace = h('div', { class: 'event-place' });
  const evText = h('p', { class: 'event-text' });
  const evOptions = h('div', { class: 'event-options' });
  const evCard = h('div', { class: 'event-card', role: 'dialog', 'aria-modal': 'true' }, [
    h('div', { class: 'event-kicker', text: 'ÉVÉNEMENT · temps en pause' }), evTitle, evPlace, evText, evOptions
  ]);
  const eventLayer = h('div', { class: 'event-layer', 'data-testid': 'event' }, [evCard]);
  let shownEventKey; // undefined : rien encore affiché (≠ null « aucun événement »)
  eventLayer.hidden = true;
  drawer.hidden = true;

  // --- Retour du choix / toasts ---
  const toast = h('div', { class: 'toast', 'aria-live': 'polite' });
  let toastTimer = null;

  // --- Conseils ---
  const tipLayer = h('div', { class: 'tip-layer' });
  let shownTip = null;

  root.append(hud.el, mapBox, abilityBar, upgradeBar, drawer, eventLayer, toast, tipLayer, floatLayer);

  function renderEvent(ev) {
    const key = ev ? `${ev.id}:${ev.options?.map((o) => `${o.id}${o.disabled ? 'x' : ''}`).join(',')}` : null;
    if (key === shownEventKey) return;
    shownEventKey = key;
    setHidden(eventLayer, !ev);
    if (!ev) return;
    setText(evTitle, ev.title ?? 'Événement');
    setText(evPlace, ev.territoryId ? `📍 ${territoryName(ev.territoryId)}` : '');
    setHidden(evPlace, !ev.territoryId);
    setText(evText, ev.text ?? '');
    evOptions.replaceChildren(...(ev.options ?? []).slice(0, 2).map((o) => h('button', {
      class: 'event-option',
      'data-option': o.id,
      disabled: o.disabled ? true : undefined,
      on: { click: () => actions.chooseOption(o.id) }
    }, [
      h('strong', { text: o.label }),
      h('span', { class: 'event-effect', text: o.disabled ? (o.reason || 'Indisponible') : (o.effectText || '') })
    ])));
  }

  function update(state, ui) {
    hud.update(state, { lastSpeed: ui.lastSpeed });

    // Carte (la carte V7 a son propre bouton « recentrer »)
    mapHost.update(state, { mode: 'play', targeting: ui.targeting });
    setHidden(recenterBtn, mapHost.kind === 'world');

    // Surimpressions du haut
    const f = forecastText(state);
    setHidden(forecastEl, !f);
    if (f) {
      setText(forecastEl, typeof f === 'string' ? f : f.text);
      setClass(forecastEl, 'ahead', f.lead === 'ahead');
      setClass(forecastEl, 'behind', f.lead === 'behind');
    }
    const blocker = blockerModel(state);
    setHidden(blockerEl, !blocker);
    if (blocker) setText(blockerEl, `⚠ ${blocker.text}`);
    const adapt = adaptationText(state);
    setHidden(adaptationEl, !adapt);
    if (adapt) setText(adaptationEl, adapt);

    // Fiche de la région touchée
    const t = territoryModel(state, state.selectedId);
    setHidden(terrCard, !t || Boolean(ui.targeting));
    if (t) {
      setText(terrName, `${t.name}${t.isOrigin ? ' · origine' : ''}`);
      setText(terrStats, `Crise ${t.crisis}% · Conscience ${t.awareness}% · Confinement ${t.containment}%${t.closedRoutes ? ` · ${t.closedRoutes} route${t.closedRoutes > 1 ? 's' : ''} fermée${t.closedRoutes > 1 ? 's' : ''}` : ''}`);
    }

    // Bandeau du dernier événement du journal (animé quand il change)
    const line = latestLogLine(state);
    if (logBanner.textContent !== line) {
      setText(logBanner, line);
      logBanner.classList.remove('fresh');
      void logBanner.offsetWidth;
      logBanner.classList.add('fresh');
    }
    setHidden(logBanner, !line);

    // Ciblage
    setHidden(targetBanner, !ui.targeting);
    if (ui.targeting) {
      const kindText = ui.targeting.kind === 'route' ? 'une route fermée' : 'une région';
      setText(targetText, `${ui.targeting.label} : touche ${kindText} sur la carte`);
      const chipsKey = mapHost.kind === 'legacy' ? ui.targeting.validTargets.join(',') : '';
      if (targetChips.dataset.key !== chipsKey) {
        targetChips.dataset.key = chipsKey;
        targetChips.replaceChildren(...(chipsKey ? ui.targeting.validTargets.slice(0, 4).map((target) => h('button', {
          class: 'target-chip',
          text: ui.targeting.kind === 'route' ? routeLabel(target) : territoryName(target),
          on: { click: () => (ui.targeting.kind === 'route' ? actions.routeTap(target) : actions.territoryTap(target)) }
        })) : []));
      }
      if (!ui.targeting.validTargets.length) setText(targetText, `${ui.targeting.label} : aucune cible valide pour l'instant`);
    }

    // Capacités
    const abilities = abilityModels(state, ui.targeting);
    ensureAbilityButtons(abilities);
    for (const m of abilities) {
      const b = abilityButtons.get(m.id);
      if (!b) continue;
      setText(b.sub, m.sub);
      setClass(b.btn, 'ready', m.ready);
      setClass(b.btn, 'targeting', m.targeting);
      setClass(b.btn, 'cooling', !m.ready && m.readyInDays > 0);
      setAttr(b.btn, 'aria-label', `${m.label} — ${m.ready ? 'prête' : m.reason || 'indisponible'}`);
      setStyle(b.gauge, 'width', `${Math.round(m.cooldownFraction * 100)}%`);
    }

    // Améliorations
    for (const m of upgradeModels(state)) {
      const r = upgradeRows.get(m.kind);
      setText(r.name, m.label);
      setText(r.level, `${m.level}/${m.maxLevel}`);
      setText(r.buy, m.maxed ? 'Max' : `${m.cost} inf.`);
      setDisabled(r.buy, !m.affordable);
      setClass(r.row, 'affordable', m.affordable);
      setHidden(r.adapted, !m.adapted);
      if (drawerKind === m.kind) {
        setText(drawerTitle, `${m.icon} ${m.label}`);
        setText(drawerLevel, `Niv. ${m.level}/${m.maxLevel}`);
        setText(drawerDesc, m.description);
        setText(drawerNext, m.nextText);
        setText(drawerAdapt, m.adapted ? "L'Humanité s'est adaptée à cette branche : effet réduit pour l'instant." : '');
        setHidden(drawerAdapt, !m.adapted);
        setText(drawerBuy, m.maxed ? 'Niveau maximum' : `Améliorer — ${m.cost} inf.`);
        setDisabled(drawerBuy, !m.affordable);
      }
    }
    setHidden(drawer, !drawerKind);

    // Événement à choix
    renderEvent(state.pendingEvent ?? null);

    // Conseil
    const tip = ui.tipHtml ?? null;
    if (tip !== shownTip) {
      shownTip = tip;
      tipLayer.innerHTML = tip ?? '';
    }
  }

  function rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function floatText(text, at, cls = '') {
    const pos = at ?? rectCenter(hud.influenceEl);
    const rootRect = root.getBoundingClientRect();
    const el = h('span', { class: `float-num ${cls}`, text });
    el.style.left = `${pos.x - rootRect.left}px`;
    el.style.top = `${pos.y - rootRect.top}px`;
    el.addEventListener('animationend', () => el.remove());
    floatLayer.appendChild(el);
    // Filet de sécurité : jamais d'accumulation si l'animation ne finit pas.
    setTimeout(() => el.remove(), 1600);
  }

  return {
    el: root,
    update,
    map: mapHost,
    openDrawer(kind) { drawerKind = kind; },
    closeDrawer() { drawerKind = null; },
    get drawerKind() { return drawerKind; },
    pulseUpgrade(kind, cost) {
      const r = upgradeRows.get(kind);
      if (!r) return;
      r.row.classList.remove('pulse');
      void r.row.offsetWidth;
      r.row.classList.add('pulse');
      floatText(`−${cost}`, rectCenter(r.buy), 'spend');
    },
    pulseAbility(id) {
      const b = abilityButtons.get(id);
      if (!b) return;
      b.btn.classList.remove('pulse');
      void b.btn.offsetWidth;
      b.btn.classList.add('pulse');
    },
    floatGain(text, at, cls) { floatText(text, at, cls); },
    showToast(text) {
      if (!text) return;
      setText(toast, text);
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
    },
    destroy() {
      clearTimeout(toastTimer);
      mapHost.destroy();
      root.remove();
    }
  };
}

// Cibles valides pour le ciblage d'une capacité (contrat : abilityTargets).
export function targetingFor(state, ability) {
  return {
    abilityId: ability.id,
    kind: ability.target === 'route' ? 'route' : 'territory',
    label: ability.label,
    validTargets: abilityTargets(state, ability.id)
  };
}
