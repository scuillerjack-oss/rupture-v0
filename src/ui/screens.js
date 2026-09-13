import { renderMap, renderMapLegend } from './map.js';
import { renderHud } from './hud.js';
import { BALANCE, DIFFICULTIES } from '../engine/balance.js';
import { TERRITORIES } from '../engine/territories.js';

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
      <p class="version-tag">V4.1 — build bêta</p>
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

const UPGRADE_RECAP_LABELS = {
  propagation: 'Propagation',
  dangerosity: 'Dangerosité',
  resilience: 'Résilience',
  discretion: 'Discrétion'
};

// Compte-rendu de propagation, dérivé uniquement de l'état final (aucune
// donnée inventée) - même logique que hud.js:computeWorldStats, mais gardée
// locale à cet écran plutôt que partagée, l'un affichant une partie en
// cours et l'autre un bilan figé.
function computeSpreadStats(state) {
  let touched = 0;
  let severe = 0;
  let critical = 0;
  for (const t of TERRITORIES) {
    const ts = state.territories[t.id];
    if (ts.crisis > 0) touched += 1;
    if (ts.crisis >= 50) severe += 1;
    if (ts.crisis >= 75) critical += 1;
  }
  return { touched, total: TERRITORIES.length, severe, critical };
}

// Phrase de style courte, entièrement déterministe et locale (§8 : pas d'IA
// ni d'API externe) - construite uniquement à partir de chiffres réellement
// suivis par le moteur, jamais inventée. Peut produire des combinaisons
// différentes selon la partie, mais toujours honnête vis-à-vis des données.
function computeStyleAnalysis(state) {
  const { upgrades, reach, maxDominance, phaseLog, endReason } = state;
  const isVictory = state.status === 'victory';
  const total = upgrades.propagation + upgrades.dangerosity + upgrades.resilience + upgrades.discretion || 1;
  const dominant = Object.entries(upgrades).sort((a, b) => b[1] - a[1])[0];
  const isBalanced = Object.values(upgrades).every((v) => Math.abs(v / total - 0.25) < 0.12);
  const mobilizedEntry = phaseLog.find((p) => p.key === 'mobilisation');
  const advancedEntry = phaseLog.find((p) => p.key === 'mesures' || p.key === 'maitrise');

  const parts = [];
  if (reach - maxDominance > 30) {
    parts.push("Expansion très rapide, mais adaptation tardive à la transformer en réelle menace");
  } else if (dominant[0] === 'dangerosity' && dominant[1] >= 6) {
    parts.push('Une progression volontairement dangereuse, quitte à alarmer le monde très vite');
  } else if (isBalanced) {
    parts.push('Une approche équilibrée entre toutes les orientations');
  } else {
    parts.push(`Une stratégie centrée sur ${UPGRADE_RECAP_LABELS[dominant[0]]}`);
  }

  if (upgrades.discretion >= 6 && (!mobilizedEntry || mobilizedEntry.day > 400)) {
    parts.push('une discrétion qui a longtemps retardé la prise de conscience mondiale');
  } else if (upgrades.discretion <= 1 && mobilizedEntry) {
    parts.push('sans discrétion pour ralentir la réaction du monde');
  }

  if (!isVictory && endReason === 'containment') {
    parts.push(
      upgrades.resilience <= 3
        ? 'une résilience trop faible pour résister à la Réponse mondiale mobilisée'
        : 'une Réponse mondiale finalement trop rapide malgré la résilience développée'
    );
  } else if (isVictory && advancedEntry) {
    parts.push('une victoire arrachée alors que le monde avait déjà engagé des contre-mesures sérieuses');
  }

  return `${parts.join(', ')}.`;
}

export function renderEnd(state) {
  const isVictory = state.status === 'victory';
  const explanation = END_EXPLANATIONS[state.endReason]?.[isVictory ? 'victory' : 'defeat']
    || (isVictory ? "L'anomalie a durablement déstabilisé le monde." : 'Le monde a fini par contenir la crise.');
  const spread = computeSpreadStats(state);
  const style = computeStyleAnalysis(state);
  return `
    <div class="screen end-screen ${isVictory ? 'end-victory' : 'end-defeat'}">
      <h1>${isVictory ? 'VICTOIRE' : 'DÉFAITE'}</h1>
      <p>${explanation}</p>
      <div class="end-recap">
        <div class="end-stats">
          <div>Jours écoulés : ${state.day}</div>
          <div>Progression finale de l'Anomalie : ${state.dominance.toFixed(0)}% <span class="end-stat-hint">(max atteint : ${state.maxDominance.toFixed(0)}%, victoire à ${BALANCE.victoryDominanceThreshold}%)</span></div>
          <div>Conscience mondiale : ${state.globalAwareness.toFixed(0)}%</div>
          <div>Réponse mondiale : ${state.globalContainment.toFixed(0)}% <span class="end-stat-hint">(défaite à ${BALANCE.defeatContainmentThreshold}%)</span></div>
          <div>Portée (régions touchées) : ${spread.touched}/${spread.total} <span class="end-stat-hint">(sévères : ${spread.severe}, critiques : ${spread.critical})</span></div>
        </div>
        <div class="end-upgrades">
          ${Object.entries(UPGRADE_RECAP_LABELS).map(([kind, label]) => `<div class="end-upgrade-chip">${label} <strong>Niv. ${state.upgrades[kind]}</strong></div>`).join('')}
        </div>
        ${state.phaseLog.length ? `
          <div class="end-timeline">
            ${state.phaseLog.map((p) => `<div class="end-timeline-row"><span>${p.label}</span><span>Jour ${p.day}</span></div>`).join('')}
          </div>` : ''}
        <p class="end-style">${style}</p>
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
        <div class="settings-row">
          <span>Musique</span>
          <button class="toggle-btn${options.musicEnabled ? ' active' : ''}" data-action="toggle-music">${options.musicEnabled ? 'Activée' : 'Coupée'}</button>
        </div>
        <div class="settings-row">
          <span>Effets sonores</span>
          <button class="toggle-btn${options.sfxEnabled ? ' active' : ''}" data-action="toggle-sfx">${options.sfxEnabled ? 'Activés' : 'Coupés'}</button>
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
