import { renderMap, renderMapLegend } from './map.js';
import { renderHud } from './hud.js';
import { BALANCE, DIFFICULTIES } from '../engine/balance.js';

export function renderMenu(hasSave) {
  return `
    <div class="screen menu-screen">
      <h1>RUPTURE</h1>
      <p class="tagline">Une anomalie s'éveille. Le monde n'est pas encore prêt.</p>
      <p class="hint">Choisissez un territoire, propagez l'anomalie, améliorez-la avant que le monde ne se referme.</p>
      <div class="menu-actions">
        <button class="primary-btn" data-action="new-game">Nouvelle partie</button>
        ${hasSave ? '<button class="secondary-btn" data-action="resume-game">Reprendre la partie</button>' : ''}
        <button class="link-btn" data-action="show-tutorial">Comment jouer ?</button>
        <button class="link-btn" data-action="open-settings">Paramètres</button>
      </div>
      <p class="version-tag">V2 — build bêta</p>
    </div>`;
}

export function renderTutorial() {
  return `
    <div class="screen tutorial-screen">
      <div class="tutorial-card">
        <div class="tutorial-block">
          <h3>QUI JE SUIS</h3>
          <p>Tu contrôles une Anomalie apparue dans le réseau.</p>
        </div>
        <div class="tutorial-block">
          <h3>MON OBJECTIF</h3>
          <p>Étends ton influence avant que le monde ne parvienne à te contenir.</p>
        </div>
        <div class="tutorial-block">
          <h3>MA RESSOURCE</h3>
          <p>Tu gagnes de l'Influence, à investir pour faire évoluer l'Anomalie.</p>
        </div>
        <div class="tutorial-block">
          <h3>MES TROIS ORIENTATIONS</h3>
          <p><strong>Propagation</strong> → facilite ton expansion, mais te rend plus visible.</p>
          <p><strong>Résilience</strong> → améliore ta résistance au confinement.</p>
          <p><strong>Discrétion</strong> → retarde la réaction du monde, au prix d'un peu d'Influence.</p>
        </div>
      </div>
      <button class="primary-btn" data-action="tutorial-continue">JOUER</button>
    </div>`;
}

export function renderSelectingOrigin(state) {
  return `
    <div class="screen origin-screen">
      <div class="origin-header">
        <h2>Choisissez votre point de départ</h2>
        <p>Touchez un territoire sur la carte pour y implanter l'anomalie.</p>
      </div>
      <div class="map-container">${renderMap(state, true)}</div>
      ${renderMapLegend()}
      ${state.selectedId ? `<button class="primary-btn confirm-origin" data-action="confirm-origin" data-id="${state.selectedId}">Commencer à ${state.selectedId}</button>` : ''}
    </div>`;
}

export function renderPlaying(state, statsView) {
  return `
    <div class="screen play-screen">
      <div class="map-container">
        <button class="menu-fab" data-action="open-game-menu" aria-label="Menu">☰</button>
        ${renderMap(state, true)}${renderMapLegend()}
      </div>
      ${renderHud(state, statsView)}
    </div>`;
}

const END_EXPLANATIONS = {
  dominance: {
    victory: 'Votre domination mondiale a dépassé le seuil critique avant que le monde ne vous contienne.',
    defeat: ''
  },
  containment: {
    victory: '',
    defeat: 'Le confinement mondial a atteint 100 % avant que votre domination ne soit suffisante.'
  },
  timeout: {
    victory: '',
    defeat: "Ni l'anomalie ni le monde n'ont pris le dessus à temps : par défaut, la crise est considérée comme contenue."
  }
};

export function renderEnd(state) {
  const isVictory = state.status === 'victory';
  const explanation = END_EXPLANATIONS[state.endReason]?.[isVictory ? 'victory' : 'defeat']
    || (isVictory ? "L'anomalie a durablement déstabilisé le monde." : 'Le monde a fini par contenir la crise.');
  return `
    <div class="screen end-screen ${isVictory ? 'end-victory' : 'end-defeat'}">
      <h1>${isVictory ? 'VICTOIRE' : 'DÉFAITE'}</h1>
      <p>${explanation}</p>
      <div class="end-stats">
        <div>Jours écoulés : ${state.day}</div>
        <div>Domination atteinte : ${state.dominance.toFixed(0)}% <span class="end-stat-hint">(seuil de victoire : ${state.rules?.victoryDominanceThreshold ?? BALANCE.victoryDominanceThreshold}%)</span></div>
        <div>Confinement mondial : ${state.globalContainment.toFixed(0)}% <span class="end-stat-hint">(seuil de défaite : 100%)</span></div>
      </div>
      <button class="primary-btn" data-action="new-game">Recommencer</button>
    </div>`;
}

export function renderGameMenu(view, state, options) {
  if (view === 'settings') {
    const current = options.pendingDifficulty;
    return `
      <div class="screen menu-overlay-screen">
        <h2>Paramètres</h2>
        <h3 class="settings-subhead">Difficulté (prochaine partie)</h3>
        <div class="difficulty-options">
          ${Object.entries(DIFFICULTIES).map(([id, cfg]) => `
            <button class="difficulty-btn${current === id ? ' active' : ''}" data-action="set-difficulty" data-difficulty="${id}">
              ${cfg.label}
            </button>`).join('')}
        </div>
        ${state ? `<p class="hint">Partie en cours : difficulté ${DIFFICULTIES[state.difficulty]?.label ?? 'Normal'} (fixée au démarrage).</p>` : ''}
        <h3 class="settings-subhead">Audio</h3>
        <div class="settings-row disabled">
          <span>Musique</span>
          <span class="coming-soon">Bientôt disponible</span>
        </div>
        <div class="settings-row disabled">
          <span>Effets sonores</span>
          <span class="coming-soon">Bientôt disponible</span>
        </div>
        <button class="secondary-btn" data-action="close-settings">Retour</button>
      </div>`;
  }

  if (view === 'confirm-restart') {
    return `
      <div class="screen menu-overlay-screen">
        <h2>Nouvelle partie ?</h2>
        <p class="hint">La partie en cours sera définitivement perdue.</p>
        <div class="menu-actions">
          <button class="primary-btn danger" data-action="confirm-restart">Oui, recommencer</button>
          <button class="secondary-btn" data-action="cancel-restart">Annuler</button>
        </div>
      </div>`;
  }

  // view === 'menu'
  return `
    <div class="screen menu-overlay-screen">
      <h2>Menu</h2>
      <div class="menu-actions">
        <button class="primary-btn" data-action="close-menu">Reprendre la partie</button>
        <button class="secondary-btn" data-action="request-restart">Nouvelle partie</button>
        <button class="secondary-btn" data-action="open-settings">Paramètres</button>
      </div>
    </div>`;
}
