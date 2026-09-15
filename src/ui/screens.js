import { renderMap, renderMapLegend } from './map.js';
import { renderHud } from './hud.js';
import { BALANCE, DIFFICULTIES } from '../engine/balance.js';
import { TERRITORIES } from '../engine/territories.js';
import { TIPS, TIP_ORDER } from './tips.js';

export function renderMenu(hasSave) {
  return `
    <div class="screen menu-screen">
      <h1>RUPTURE</h1>
      <p class="tagline">Une anomalie s'éveille. L'Humanité n'est pas encore prête.</p>
      <p class="hint">Choisissez un territoire, propagez l'anomalie, rendez-la réellement dangereuse avant que le monde ne se referme.</p>
      <div class="menu-actions">
        <button class="primary-btn" data-action="new-game">Nouvelle partie</button>
        ${hasSave ? '<button class="secondary-btn" data-action="resume-game">Reprendre la partie</button>' : ''}
        <button class="link-btn" data-action="show-help">Comment jouer ?</button>
        <button class="link-btn" data-action="open-settings">Paramètres</button>
      </div>
      <p class="version-tag">V5 — build bêta finale</p>
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

// Volontairement minimal (voir "Onboarding contextuel" dans la demande de
// finition UX) : présenter qui est l'Anomalie et l'objectif suffit avant de
// jouer. Chaque mécanique concrète (Influence, les quatre orientations, la
// Réponse mondiale...) n'est plus expliquée ici mais au moment où le joueur
// la rencontre réellement pour la première fois (voir renderTipPopup et
// main.js) - un vrai tutoriel de 40 pages avant la première partie serait
// exactement le problème que ce système corrige, pas une solution. Le texte
// complet reste consultable à tout moment via "Comment jouer ?" (renderHelp).
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
          <h3>ET ENSUITE ?</h3>
          <p>Chaque mécanique s'explique en une phrase la première fois que tu la rencontres. Retrouvable à tout moment depuis "Comment jouer ?".</p>
        </div>
      </div>
      <button class="primary-btn" data-action="tutorial-continue">JOUER</button>
    </div>`;
}

// Popup de conseil contextuel : affichée automatiquement une seule fois (voir
// hasSeenTip/markTipSeen dans save.js et les déclencheurs dans main.js),
// jamais réaffichée ensuite sauf réinitialisation volontaire depuis
// Paramètres. Contenu partagé avec renderHelp ci-dessous (ui/tips.js) - un
// conseil dit toujours la même chose qu'il apparaisse tout seul ou relu
// depuis l'aide.
export function renderTipPopup(tipId) {
  const tip = TIPS[tipId];
  if (!tip) return '';
  return `
    <div class="tip-popup" role="dialog" aria-live="polite" aria-label="${tip.title}">
      <div class="tip-popup-card">
        <h4>${tip.title}</h4>
        <p>${tip.body}</p>
        <button class="primary-btn tip-btn" data-action="dismiss-tip" data-tip="${tipId}">Compris</button>
      </div>
    </div>`;
}

// Aide permanente ("Comment jouer ?", accessible depuis le menu principal et
// le menu en partie) : rassemble volontairement TOUT ce que les popups
// contextuelles expliquent une à une, pour qu'un joueur qui a oublié un
// détail puisse le relire sans que le jeu ne lui réimpose rien.
export function renderHelp() {
  return `
    <div class="screen tutorial-screen help-screen">
      <h2>Comment jouer</h2>
      <div class="tutorial-card">
        <div class="tutorial-block">
          <h3>QUI JE SUIS</h3>
          <p>Tu contrôles une Anomalie apparue dans le réseau.</p>
        </div>
        <div class="tutorial-block">
          <h3>MON OBJECTIF</h3>
          <p>Rendre ta progression réelle avant que l'Humanité ne parvienne à te maîtriser : une course à 100% des deux côtés.</p>
        </div>
        ${TIP_ORDER.map((id) => `
          <div class="tutorial-block">
            <h3>${TIPS[id].title.toUpperCase()}</h3>
            <p>${TIPS[id].body}</p>
          </div>`).join('')}
      </div>
      <button class="primary-btn" data-action="close-help">Fermer</button>
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
  const awarenessEntry = phaseLog.find((p) => p.key === 'conscience');
  const mobilizedEntry = phaseLog.find((p) => p.key === 'mobilisation');
  const advancedEntry = phaseLog.find((p) => p.key === 'mesures' || p.key === 'maitrise');
  // V5.2 (audit bêta) : "alarmer le monde très vite" ne doit être affirmé que
  // si le monde a RÉELLEMENT réagi tôt (phase Conscience atteinte tôt dans
  // la partie) - le niveau final de Dangerosité seul ne dit rien du moment
  // où elle a été investie. Bug réel corrigé : une Dangerosité tardive
  // (implantation longue puis bascule tardive) affichait quand même "très
  // vite" simplement parce qu'elle finissait au niveau le plus élevé.
  const alarmedEarly = Boolean(awarenessEntry) && awarenessEntry.day < 200;

  const parts = [];
  if (reach - maxDominance > 30) {
    parts.push("Expansion très rapide, mais adaptation tardive à la transformer en réelle menace");
  } else if (dominant[0] === 'dangerosity' && dominant[1] >= 6 && alarmedEarly) {
    parts.push('Une progression volontairement dangereuse, quitte à alarmer le monde très vite');
  } else if (dominant[0] === 'dangerosity' && dominant[1] >= 6 && awarenessEntry) {
    parts.push(`Une progression rendue dangereuse à un stade avancé (jour ${awarenessEntry.day}), une fois solidement implantée`);
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

// Premium : cf. src/services/premium.js. TOUJOURS étiqueté "simulation" /
// "test" dans l'interface tant qu'aucun module Google Play Billing / App
// Store réel n'est connecté - conformément à la demande explicite de ne
// jamais créer un faux sentiment de finalisation. `options.premiumSource`
// vaut 'simulated-test' (seule valeur possible aujourd'hui) ou null.
function renderPremiumSection(options) {
  const isPremium = Boolean(options.isPremium);
  return `
    <h3 class="settings-subhead">Premium <span class="test-badge">${isPremium ? 'simulation' : 'aperçu'}</span></h3>
    ${isPremium ? `
      <p class="hint">Premium actif : vitesse ×4 débloquée, aucune publicité entre les parties.
        Statut réel : <strong>${options.premiumSource === 'store-verified' ? 'achat vérifié par un store' : 'simulation de test (aucun paiement réel)'}</strong>.</p>
      <button class="secondary-btn" data-action="premium-reset-test">Désactiver Premium (test uniquement)</button>
    ` : `
      <p class="hint">2,99€, achat unique : retire la publicité et débloque la vitesse ×4. Aucun avantage stratégique, aucune méta-monnaie.</p>
      <button class="primary-btn" data-action="premium-purchase-test">Simuler l'achat (test — aucun paiement réel)</button>
      <button class="link-btn" data-action="premium-restore-test">Restaurer un achat (simulation)</button>
    `}`;
}

// Publicité interstitielle : cf. src/services/ads.js. N'apparaît jamais
// pendant une partie, uniquement entre deux parties, et jamais un vrai
// contenu publicitaire (aucun SDK connecté) - clairement étiqueté.
export function renderInterstitialAd() {
  return `
    <div class="screen menu-overlay-screen interstitial-screen">
      <span class="test-badge">simulation</span>
      <h2>Publicité (simulation)</h2>
      <p class="hint">Aucun réseau publicitaire réel n'est encore connecté à RUPTURE. Cet écran occupe la même place, au même moment, qu'une vraie publicité interstitielle une fois AdMob branché.</p>
      <button class="primary-btn" data-action="interstitial-continue">Continuer</button>
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
        ${renderPremiumSection(options)}
        <h3 class="settings-subhead">Audio</h3>
        <div class="settings-row">
          <span>Musique</span>
          <button class="toggle-btn${options.musicEnabled ? ' active' : ''}" data-action="toggle-music">${options.musicEnabled ? 'Activée' : 'Coupée'}</button>
        </div>
        <div class="settings-row">
          <span>Effets sonores</span>
          <button class="toggle-btn${options.sfxEnabled ? ' active' : ''}" data-action="toggle-sfx">${options.sfxEnabled ? 'Activés' : 'Coupés'}</button>
        </div>
        <h3 class="settings-subhead">Aide</h3>
        <button class="secondary-btn" data-action="reset-tips">Réafficher tous les conseils</button>
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
        <button class="secondary-btn" data-action="show-help">Comment jouer ?</button>
        <button class="secondary-btn" data-action="open-settings">Paramètres</button>
      </div>
    </div>`;
}
