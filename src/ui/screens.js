import { renderMap, renderMapLegend } from './map.js';
import { renderHud } from './hud.js';

export function renderMenu(hasSave) {
  return `
    <div class="screen menu-screen">
      <h1>RUPTURE</h1>
      <p class="tagline">Une anomalie s'éveille. Le monde n'est pas encore prêt.</p>
      <p class="hint">Choisissez un territoire, propagez l'anomalie, améliorez-la avant que le monde ne se referme.</p>
      <div class="menu-actions">
        <button class="primary-btn" data-action="new-game">Nouvelle partie</button>
        ${hasSave ? '<button class="secondary-btn" data-action="resume-game">Reprendre la partie</button>' : ''}
      </div>
      <p class="version-tag">V0 — build bêta</p>
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

export function renderPlaying(state) {
  return `
    <div class="screen play-screen">
      <div class="map-container">${renderMap(state, true)}${renderMapLegend()}</div>
      ${renderHud(state)}
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
        <div>Domination atteinte : ${state.dominance.toFixed(0)}% <span class="end-stat-hint">(seuil de victoire : 75%)</span></div>
        <div>Confinement mondial : ${state.globalContainment.toFixed(0)}% <span class="end-stat-hint">(seuil de défaite : 100%)</span></div>
      </div>
      <button class="primary-btn" data-action="new-game">Recommencer</button>
    </div>`;
}
