// V7 : les écrans statiques (menu, réglages, fin…) restent des gabarits HTML,
// mais ne sont affichés qu'à un changement d'écran, JAMAIS à chaque tick.
// L'écran de jeu et le choix d'origine sont construits une fois puis mis à
// jour (voir playScreen.js / originScreen.js).
import { BALANCE, DIFFICULTIES } from '../engine/balance.js';
import { TERRITORIES } from '../engine/territories.js';
import { TIPS, TIP_ORDER } from './tips.js';
import { escapeHtml } from './dom.js';
import { APP_VERSION, versionLabel } from '../config/version.js';
import { RUNTIME_CONFIG } from '../config/runtime.js';
import { endModel, starsString } from './playModel.js';
import { getStrains, isUnlocked, metaStars, territoryName } from './engineV7.js';

// options : { hasSave, meta, daily: { seed, record }, version, env }
export function renderMenu(hasSaveOrOptions = false) {
  const o = typeof hasSaveOrOptions === 'object' && hasSaveOrOptions !== null ? hasSaveOrOptions : { hasSave: Boolean(hasSaveOrOptions) };
  const stars = metaStars(o.meta);
  const daily = o.daily;
  const record = daily?.record;
  const dailyStatus = !record
    ? 'Pas encore joué aujourd’hui'
    : record.won
      ? `Record : ${starsString(record.bestStars)} · jour ${record.bestDay}`
      : `${record.played} essai${record.played > 1 ? 's' : ''}, pas encore gagné`;
  return `
    <div class="screen menu-screen">
      <h1>RUPTURE</h1>
      <p class="tagline">Une anomalie s'éveille. L'Humanité n'est pas encore prête.</p>
      <div class="menu-actions">
        ${o.hasSave ? '<button class="primary-btn" data-action="resume-game">Reprendre la partie</button>' : ''}
        <button class="${o.hasSave ? 'secondary-btn' : 'primary-btn'}" data-action="new-game">Nouvelle partie</button>
        ${daily ? `
        <button class="daily-btn" data-action="daily-challenge">
          <span class="daily-title">Défi du jour <small>${escapeHtml(daily.seed)}</small></span>
          <span class="daily-sub">Même monde pour tous aujourd’hui · ${escapeHtml(dailyStatus)}</span>
        </button>` : ''}
        <div class="menu-stars" data-testid="menu-stars">${stars} ★ gagnée${stars > 1 ? 's' : ''}</div>
        <div class="menu-links">
          <button class="link-btn" data-action="show-help">Comment jouer ?</button>
          <button class="link-btn" data-action="open-settings">Paramètres</button>
        </div>
      </div>
      <p class="version-tag" data-testid="version">${escapeHtml(versionLabel(o.version ?? APP_VERSION, o.env ?? RUNTIME_CONFIG.env))}</p>
    </div>`;
}

// Choisie explicitement avant CHAQUE nouvelle partie (nouvelle ou
// redémarrage) : en V2, la difficulté existait mais n'était accessible que
// via Paramètres, jamais proposée pendant le lancement lui-même - la bêta ne
// l'a jamais trouvée (voir RUPTURE_V3_Rapport_Technique_Officiel.pdf).
// V7 : on y choisit aussi la souche (débloquée par les étoiles).
export function renderDifficultyPicker(pendingDifficulty, options = {}) {
  const strains = getStrains();
  const meta = options.meta;
  const pendingStrain = options.pendingStrain ?? 'standard';
  const stars = metaStars(meta);
  return `
    <div class="screen menu-screen picker-screen">
      <h2>Nouvelle partie</h2>
      <h3 class="settings-subhead">Difficulté</h3>
      <div class="difficulty-options">
        ${Object.entries(DIFFICULTIES).map(([id, cfg]) => `
          <button class="difficulty-btn${pendingDifficulty === id ? ' active' : ''}" data-action="set-difficulty" data-difficulty="${id}">
            ${cfg.label}
          </button>`).join('')}
      </div>
      <p class="hint">Vitesse à laquelle l'Humanité construit sa Réponse mondiale. Fixée pour toute la partie.</p>
      ${strains.length > 1 ? `
      <h3 class="settings-subhead">Souche <small class="stars-owned">${stars} ★</small></h3>
      <div class="strain-options" data-testid="strains">
        ${strains.map((s) => {
          const unlocked = isUnlocked(meta, s.id);
          return `
          <button class="strain-btn${pendingStrain === s.id ? ' active' : ''}${unlocked ? '' : ' locked'}" data-action="set-strain" data-strain="${escapeHtml(s.id)}" ${unlocked ? '' : 'disabled'}>
            <strong>${unlocked ? '' : '🔒 '}${escapeHtml(s.label)}</strong>
            <span>${unlocked ? escapeHtml(s.description ?? '') : `Débloquée à ${s.unlockStars} ★`}</span>
          </button>`;
        }).join('')}
      </div>` : ''}
      <div class="menu-actions">
        <button class="primary-btn" data-action="confirm-difficulty-and-start">Choisir l’origine</button>
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
  const { upgrades, reach = 0, maxDominance = 0, endReason } = state;
  const phaseLog = state.phaseLog ?? [];
  const isVictory = state.outcome ? state.outcome.result === 'victory' : state.status === 'victory';
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

  if (!isVictory && (endReason === 'containment' || state.outcome?.reason === 'control')) {
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

// Chronologie de la partie : phases de la Réponse + jalons du journal
// (origine, événements choisis…) quand le moteur les fournit.
function timelineRows(state) {
  const rows = [];
  if (state.originId) rows.push({ day: 0, label: `Éveil à ${territoryName(state.originId)}` });
  for (const p of state.phaseLog ?? []) rows.push({ day: p.day, label: `Réponse : ${p.label}` });
  for (const e of state.eventLog ?? state.eventHistory ?? []) {
    if (e && Number.isFinite(e.day) && (e.title || e.label)) rows.push({ day: e.day, label: e.title ?? e.label });
  }
  const outcome = state.outcome;
  const endDay = outcome?.day ?? state.day;
  rows.push({ day: endDay, label: outcome?.result === 'victory' || state.status === 'victory' ? 'Rupture' : 'Fin de partie' });
  return rows.sort((a, b) => a.day - b.day).slice(0, 10);
}

// options : { record: { newRecord, bestDay, bestStars }, starsGained, daily }
export function renderEnd(state, options = {}) {
  const m = endModel(state) ?? { victory: false, title: 'DÉFAITE', text: '', day: state.day, stars: 0, reason: 'control' };
  const spread = computeSpreadStats(state);
  const style = computeStyleAnalysis(state);
  const rec = options.record ?? {};
  const recordLine = rec.newRecord
    ? '<div class="end-record new" data-testid="record">Nouveau record !</div>'
    : rec.bestDay
      ? `<div class="end-record" data-testid="record">Record : jour ${rec.bestDay}${rec.bestStars ? ` · ${starsString(rec.bestStars)}` : ''}</div>`
      : '';
  return `
    <div class="screen end-screen ${m.victory ? 'end-victory' : 'end-defeat'}" data-screen="end">
      <h1>${m.title}</h1>
      ${m.victory ? `<div class="end-stars" aria-label="${m.stars} étoile${m.stars > 1 ? 's' : ''} sur 3" data-testid="stars">${starsString(m.stars)}</div>` : ''}
      <p class="end-text" data-testid="end-text">${escapeHtml(m.text)}</p>
      ${options.daily ? `<p class="end-daily">Défi du jour ${escapeHtml(options.daily)}</p>` : ''}
      ${recordLine}
      ${options.starsGained ? `<div class="end-gain">+${options.starsGained} ★ pour débloquer les souches</div>` : ''}
      <div class="end-recap">
        <div class="end-stats">
          <div>Jour ${m.day} · Progression ${Math.floor(state.dominance ?? 0)}% · Réponse ${Math.floor(state.globalContainment ?? 0)}%</div>
          <div class="end-stat-hint">Victoire à ${BALANCE.victoryDominanceThreshold}% de Progression · défaite à ${BALANCE.defeatContainmentThreshold}% de Réponse</div>
          <div>Régions touchées : ${spread.touched}/${spread.total} <span class="end-stat-hint">(sévères : ${spread.severe}, critiques : ${spread.critical})</span></div>
        </div>
        <div class="end-upgrades">
          ${Object.entries(UPGRADE_RECAP_LABELS).map(([kind, label]) => `<div class="end-upgrade-chip">${label} <strong>Niv. ${state.upgrades?.[kind] ?? 0}</strong></div>`).join('')}
        </div>
        <div class="end-timeline" data-testid="timeline">
          ${timelineRows(state).map((r) => `<div class="end-timeline-row"><span>${escapeHtml(r.label)}</span><span>Jour ${r.day}</span></div>`).join('')}
        </div>
        <p class="end-style">${style}</p>
      </div>
      <div class="end-actions">
        <button class="primary-btn" data-action="replay">Rejouer</button>
        <button class="secondary-btn" data-action="go-menu">Menu</button>
      </div>
    </div>`;
}

// Premium V7 = « sans pub » UNIQUEMENT (×4 est gratuit pour tous : décision
// du studio, achats de confort seulement). Deux versions :
//  - build commercial : aucun libellé « simulation » ni achat gratuit ; tant
//    qu'aucun produit Play n'existe, l'achat est annoncé comme « bientôt »
//    (rien de payant n'est activé en V7).
//  - bêta/dev : boutons de test explicitement étiquetés.
function renderPremiumSection(options) {
  const isPremium = Boolean(options.isPremium);
  const env = options.env ?? RUNTIME_CONFIG.env;
  if (env === 'commercial') {
    return `
    <h3 class="settings-subhead">Sans pub</h3>
    ${isPremium
      ? '<p class="hint">Merci ! Aucune publicité entre les parties.</p>'
      : `<p class="hint">Achat unique pour retirer la publicité entre les parties. Aucun avantage de jeu : tout le reste est gratuit, vitesse ×4 comprise.</p>
      ${options.purchaseAvailable
        ? '<button class="primary-btn" data-action="premium-purchase">Retirer la pub</button><button class="link-btn" data-action="premium-restore">Restaurer un achat</button>'
        : '<p class="hint soon">Bientôt disponible.</p>'}`}`;
  }
  return `
    <h3 class="settings-subhead">Sans pub <span class="test-badge">test</span></h3>
    ${isPremium ? `
      <p class="hint">« Sans pub » actif (test, aucun paiement réel) : aucune publicité entre les parties.</p>
      <button class="secondary-btn" data-action="premium-reset-test">Désactiver (test)</button>
    ` : `
      <p class="hint">Achat unique prévu : retire la publicité. Aucun avantage de jeu (×4 gratuit pour tous).</p>
      <button class="secondary-btn" data-action="premium-purchase-test">Activer « sans pub » (test — aucun paiement)</button>
    `}`;
}

// Publicité interstitielle : cf. src/services/ads.js. N'apparaît jamais
// pendant une partie, uniquement entre deux parties. En bêta, un écran
// étiqueté « test » en tient la place ; en build commercial, jamais de
// libellé « simulation » (le vrai SDK s'affiche lui-même par-dessus).
export function renderInterstitialAd(env = RUNTIME_CONFIG.env) {
  if (env === 'commercial') {
    return `
    <div class="screen menu-overlay-screen interstitial-screen">
      <h2>Publicité</h2>
      <button class="primary-btn" data-action="interstitial-continue">Continuer</button>
    </div>`;
  }
  return `
    <div class="screen menu-overlay-screen interstitial-screen">
      <span class="test-badge">test</span>
      <h2>Emplacement publicitaire</h2>
      <p class="hint">Bêta : aucune vraie publicité. Cet écran occupe la place et le moment d'une publicité entre deux parties.</p>
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
        ${state && state.status === 'playing' ? `<p class="hint">Partie en cours : difficulté ${DIFFICULTIES[state.difficulty]?.label ?? 'Normal'} (fixée au démarrage).</p>` : ''}
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
        <button class="link-btn" data-action="go-menu">Menu principal (partie sauvegardée)</button>
      </div>
    </div>`;
}
