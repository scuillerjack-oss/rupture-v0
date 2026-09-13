import { renderMap, renderMapLegend } from './map.js';
import { renderHud } from './hud.js';
import { BALANCE, DIFFICULTIES } from '../engine/balance.js';

export function renderMenu(hasSave) {
  return `
    <div class="screen menu-screen">
      <h1>RUPTURE</h1>
      <p class="tagline">Une anomalie s'éveille. L'Humanité n'est pas encore prête.</p>
      <p class="hint">Choisissez un territoire, propagez l'anomalie, rendez-la réellement dangereuse avant que le monde ne se referme.</p>
      <div class="menu-actions">
        <button class="primary-btn" data-action="new-game">Nouvelle partie</button>
        ${hasSave ? '<button class="secondary-btn" data-action="resume-game">Reprendre la partie</button>' : ''}
        <button class="link-btn" data-action="show-tutorial">Comment jouer ?</button>
        <button class="link-btn" data-action="open-settings">Paramètres</button>
      </div>
      <p class="version-tag">V3 — build bêta</p>
    </div>`;
}

// Choisie explicitement avant CHAQUE nouvelle partie (nouvelle ou
// redémarrage) : en V2, la difficulté existait mais n'était accessible que
// via Paramètres, jamais proposée pendant le lancement lui-même - la bêta ne
// l'a jamais trouvée (voir RUPTURE_V3_Rapport_Technique_Officiel.pdf).
export function renderDifficultyPicker(pendingDifficulty) {
  return `
    <div class="screen menu-screen">
      <h2>Choisissez la difficulté</h2>
      <p class="hint">Détermine la vitesse à laquelle l'Humanité construit sa Réponse mondiale. Elle reste fixée pour toute la partie, mais vous pouvez consulter la difficulté en cours depuis la vue Monde.</p>
      <div class="difficulty-options">
        ${Object.entries(DIFFICULTIES).map(([id, cfg]) => `
          <button class="difficulty-btn${pendingDifficulty === id ? ' active' : ''}" data-action="set-difficulty" data-difficulty="${id}">
            ${cfg.label}
          </button>`).join('')}
      </div>
      <div class="menu-actions">
        <button class="primary-btn" data-action="confirm-difficulty-and-start">Continuer</button>
        <button class="link-btn" data-action="cancel-difficulty-picker">Retour</button>
      </div>
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
          <p>Rendre ta progression réelle avant que l'Humanité ne parvienne à te maîtriser : une course à 100% des deux côtés.</p>
        </div>
        <div class="tutorial-block">
          <h3>MA RESSOURCE</h3>
          <p>Tu gagnes de l'Influence, à investir pour faire évoluer l'Anomalie.</p>
        </div>
        <div class="tutorial-block">
          <h3>MES QUATRE ORIENTATIONS</h3>
          <p><strong>Propagation</strong> → étend ta portée, mais te rend plus visible.</p>
          <p><strong>Dangerosité</strong> → transforme ta portée en réelle progression, mais alarme fortement le monde.</p>
          <p><strong>Résilience</strong> → indispensable pour résister une fois que l'Humanité mobilise sa réponse.</p>
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

export function renderPlaying(state, statsView, services) {
  return `
    <div class="screen play-screen">
      <div class="map-container">
        <button class="menu-fab" data-action="open-game-menu" aria-label="Menu">☰</button>
        ${renderMap(state, true)}${renderMapLegend()}
      </div>
      ${renderHud(state, statsView, services)}
    </div>`;
}

const END_EXPLANATIONS = {
  dominance: {
    victory: "Votre progression a atteint 100% avant que l'Humanité n'achève sa maîtrise.",
    defeat: ''
  },
  containment: {
    victory: '',
    defeat: "La Réponse mondiale a atteint la maîtrise complète avant votre progression. Défaite."
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
        <div>Progression de l'Anomalie : ${state.dominance.toFixed(0)}% <span class="end-stat-hint">(victoire à ${BALANCE.victoryDominanceThreshold}%)</span></div>
        <div>Réponse mondiale : ${state.globalContainment.toFixed(0)}% <span class="end-stat-hint">(défaite à ${BALANCE.defeatContainmentThreshold}%)</span></div>
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
        ${state ? `<p class="hint">Partie en cours : difficulté ${DIFFICULTIES[state.difficulty]?.label ?? 'Normal'} (fixée au démarrage, aussi consultable depuis la vue Monde).</p>` : ''}
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
