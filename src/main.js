import { createInitialState, beginNewGame, confirmOrigin } from './engine/state.js';
import { simulateTick, buyUpgrade, selectTerritory, setSpeed } from './engine/simulation.js';
import {
  saveState, loadState, clearSave,
  hasSeenTutorial, markTutorialSeen,
  getDifficultySetting, setDifficultySetting,
  hasCompletedFirstGame, markFirstGameCompleted,
  hasSeenTip, markTipSeen, resetTips
} from './save.js';
import { renderMenu, renderDifficultyPicker, renderTutorial, renderHelp, renderTipPopup, renderSelectingOrigin, renderPlaying, renderEnd, renderGameMenu, renderInterstitialAd } from './ui/screens.js';
import { createServices } from './services/index.js';
import { createAudio } from './audio/audio.js';

const app = document.getElementById('app');
const services = createServices();
const audio = createAudio();

// Aucun fournisseur analytics réel n'est branché (adaptateur no-op) : ce
// n'est qu'un point d'entrée déjà en place pour une future remontée
// d'erreurs, sans effet observable aujourd'hui.
window.addEventListener('error', (event) => {
  services.analytics.logError(event.error ?? event.message, { type: 'window-error' });
});
window.addEventListener('unhandledrejection', (event) => {
  services.analytics.logError(event.reason, { type: 'unhandled-rejection' });
});

// V-finale (correctif bêta §1) : NE JAMAIS charger la sauvegarde directement
// en mémoire au démarrage. Un rechargement de page (fermeture complète de
// l'app, ou simple éviction de la WebView par l'OS mobile en arrière-plan -
// les deux sont indiscernables d'un point de vue web) déclenche un nouveau
// chargement de ce module ; démarrer directement en 'playing' ici court-
// circuitait le menu et donnait l'impression que RUPTURE "ne fermait
// jamais" la partie précédente. Le menu (état initial, toujours affiché en
// premier) propose déjà "Reprendre la partie" quand une sauvegarde existe
// (voir renderMenu/l'action 'resume-game' ci-dessous) : c'est desormais
// l'UNIQUE façon d'y revenir. Rien n'est perdu (la sauvegarde elle-même
// n'est pas touchée) - seule la reprise automatique et silencieuse est
// supprimée. Le cycle premier-plan/arrière-plan PENDANT une session normale
// (verrouillage de l'écran, changement d'app bref) ne recharge pas ce
// module (voir document.hidden dans la boucle de simulation plus bas) : ce
// correctif ne l'affecte donc pas.
let state = createInitialState();
let showTutorial = false;
let tutorialPendingNewGame = false;
let showDifficultyPicker = false;
let showHelp = false;
let statsView = 'territory';

// Onboarding contextuel : file d'attente de conseils pas encore vus (voir
// ui/tips.js et save.js:hasSeenTip/markTipSeen). Une file plutôt qu'un seul
// "pendingTip" : plusieurs mécaniques peuvent en théorie devenir vraies au
// même tick (typiquement en reprenant une sauvegarde déjà avancée d'un
// joueur existant) - jamais empilées à l'écran, montrées une par une.
let tipQueue = [];

function queueTip(id) {
  if (hasSeenTip(id) || tipQueue.includes(id)) return;
  tipQueue.push(id);
}

// menuView: null | 'menu' | 'settings' | 'confirm-restart'
let menuView = null;
let settingsReturnTo = null; // where "Retour" from Paramètres should go: null (main menu) or 'menu' (in-game)
let pendingDifficulty = getDifficultySetting();

// Monétisation (voir services/ads.js, services/premium.js) : horloge murale
// réelle de la partie en cours (pas des jours simulés) pour appliquer la
// règle de fréquence publicitaire exacte de l'audit économique. Volontairement
// en mémoire seulement - un redémarrage complet de l'app perd la trace d'une
// partie non terminée, ce qui ne peut jamais déclencher une publicité en
// trop (voir services/ads.js pour le raisonnement complet).
let gameStartedAt = null;
let lastCompletedGameDurationMs = null;
let lastCompletedGameWasFirst = false;
let showInterstitial = false;
let afterInterstitial = null;

function startNewGame() {
  clearSave();
  state = createInitialState();
  beginNewGame(state, getDifficultySetting());
}

function actuallyBeginNewGameFlow() {
  pendingDifficulty = getDifficultySetting();
  showDifficultyPicker = true;
}

// La difficulté est désormais choisie explicitement avant CHAQUE nouvelle
// partie (nouvelle ou redémarrage) plutôt que silencieusement héritée d'un
// éventuel passage antérieur par Paramètres - voir renderDifficultyPicker.
// Rien n'est détruit tant que "Continuer" n'a pas été cliqué : une ancienne
// partie en cours reste intacte si le joueur fait "Retour" depuis cet écran.
//
// Monétisation : évalue ici, une seule fois par partie réellement terminée,
// si une publicité interstitielle (simulée, voir services/ads.js) doit
// s'intercaler avant de proposer la partie suivante - jamais pendant une
// partie, jamais autour de la toute première. Un redémarrage en cours de
// partie (partie jamais terminée) ne consomme ni ne déclenche cette
// vérification : seule une victoire/défaite réelle alimente
// lastCompletedGameDurationMs (voir la boucle de simulation plus bas).
function beginNewGameFlow() {
  if (lastCompletedGameDurationMs !== null) {
    const context = {
      isFirstGameEver: lastCompletedGameWasFirst,
      gameDurationMs: lastCompletedGameDurationMs,
      isPremium: services.premium.isPremium()
    };
    lastCompletedGameDurationMs = null;
    lastCompletedGameWasFirst = false;
    if (services.ads.shouldShowInterstitial(context)) {
      showInterstitial = true;
      services.ads.showInterstitialAd(); // simulation - voir renderInterstitialAd()/le bouton "Continuer"
      afterInterstitial = actuallyBeginNewGameFlow;
      return;
    }
  }
  actuallyBeginNewGameFlow();
}

function proceedAfterDifficultyPicked() {
  showDifficultyPicker = false;
  if (!hasSeenTutorial()) {
    showTutorial = true;
    tutorialPendingNewGame = true;
  } else {
    startNewGame();
  }
}

function render() {
  if (showInterstitial) {
    app.innerHTML = renderInterstitialAd();
    return;
  }
  if (showHelp) {
    app.innerHTML = renderHelp();
    return;
  }
  if (showDifficultyPicker) {
    app.innerHTML = renderDifficultyPicker(pendingDifficulty);
    return;
  }
  if (showTutorial) {
    app.innerHTML = renderTutorial();
    return;
  }
  if (menuView) {
    app.innerHTML = renderGameMenu(menuView, state, {
      pendingDifficulty,
      musicEnabled: audio.isMusicEnabled(),
      sfxEnabled: audio.isSfxEnabled(),
      isPremium: services.premium.isPremium(),
      premiumSource: services.premium.getEntitlementSource()
    });
    return;
  }
  switch (state.status) {
    case 'selecting-origin':
      app.innerHTML = renderSelectingOrigin(state);
      break;
    case 'playing':
      app.innerHTML = renderPlaying(state, statsView, services)
        + (tipQueue.length ? renderTipPopup(tipQueue[0]) : '');
      break;
    case 'victory':
    case 'defeat':
      app.innerHTML = renderEnd(state);
      break;
    default:
      app.innerHTML = renderMenu(Boolean(loadState()));
  }
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  // Les navigateurs bloquent l'audio tant qu'aucun geste utilisateur n'a eu
  // lieu : ce clic (quel qu'il soit) sert aussi de déverrouillage, sans
  // effet perceptible si déjà fait.
  audio.unlock();

  switch (action) {
    case 'new-game':
      beginNewGameFlow();
      break;
    case 'confirm-difficulty-and-start':
      proceedAfterDifficultyPicked();
      break;
    case 'cancel-difficulty-picker':
      showDifficultyPicker = false;
      break;
    case 'show-help':
      showHelp = true;
      break;
    case 'close-help':
      showHelp = false;
      break;
    case 'dismiss-tip': {
      const id = target.dataset.tip;
      markTipSeen(id);
      tipQueue.shift();
      break;
    }
    case 'reset-tips':
      resetTips();
      tipQueue = [];
      break;
    case 'tutorial-continue':
      markTutorialSeen();
      showTutorial = false;
      if (tutorialPendingNewGame) {
        startNewGame();
        tutorialPendingNewGame = false;
      }
      break;
    case 'resume-game': {
      const saved = loadState();
      if (saved) state = saved;
      break;
    }
    case 'select-territory':
      selectTerritory(state, target.dataset.id);
      break;
    case 'confirm-origin':
      confirmOrigin(state, target.dataset.id);
      gameStartedAt = Date.now();
      break;
    case 'buy-upgrade': {
      const kind = target.dataset.kind;
      const levelBefore = state.upgrades[kind];
      if (buyUpgrade(state, kind)) {
        audio.playPurchase();
        if (levelBefore === 0) queueTip(kind);
      }
      break;
    }
    case 'set-speed':
      setSpeed(state, Number(target.dataset.speed));
      break;
    case 'set-stats-view':
      statsView = target.dataset.view;
      break;

    // --- in-game menu / settings ---
    case 'open-game-menu':
      menuView = 'menu';
      break;
    case 'close-menu':
      menuView = null;
      break;
    case 'open-settings':
      settingsReturnTo = menuView === 'menu' ? 'menu' : null;
      pendingDifficulty = getDifficultySetting();
      menuView = 'settings';
      break;
    case 'close-settings':
      menuView = settingsReturnTo;
      break;
    case 'set-difficulty':
      pendingDifficulty = target.dataset.difficulty;
      setDifficultySetting(pendingDifficulty);
      break;
    case 'toggle-music':
      audio.setMusicEnabled(!audio.isMusicEnabled());
      break;
    case 'toggle-sfx':
      audio.setSfxEnabled(!audio.isSfxEnabled());
      break;
    case 'request-restart':
      menuView = 'confirm-restart';
      break;
    case 'cancel-restart':
      menuView = 'menu';
      break;
    case 'confirm-restart':
      menuView = null;
      beginNewGameFlow();
      break;

    // --- monétisation (voir services/ads.js, services/premium.js) ---
    case 'interstitial-continue': {
      showInterstitial = false;
      const resume = afterInterstitial;
      afterInterstitial = null;
      if (resume) resume();
      break;
    }
    case 'premium-purchase-test':
      services.premium.purchasePremium().then(render);
      break;
    case 'premium-restore-test':
      services.premium.restorePurchases().then(render);
      break;
    case 'premium-reset-test':
      services.premium.setPremium(false);
      break;
    default:
      return;
  }

  saveState(state);
  render();
});

const TICK_MS = 1000;
setInterval(() => {
  if (document.hidden) return;
  if (showTutorial || showDifficultyPicker || showHelp || menuView || showInterstitial || tipQueue.length) return;
  if (state.status !== 'playing' || state.speed <= 0) return;
  const phaseBefore = state.responsePhase;
  for (let i = 0; i < state.speed; i += 1) {
    simulateTick(state);
    if (state.status !== 'playing') break;
  }
  // Un seul son même si plusieurs ticks (vitesse x2/x4) ont fait progresser
  // la phase en une seule boucle : la Réponse mondiale ne peut que
  // progresser (jamais reculer), comparer avant/après la boucle suffit.
  if (state.responsePhase !== phaseBefore) audio.playPhaseChange();
  // Onboarding contextuel (voir plus haut) : Influence et Réponse mondiale
  // ne se "débloquent" pas par un clic mais émergent naturellement de la
  // simulation - déclenchées ici plutôt qu'à l'achat d'une amélioration.
  if (phaseBefore === 'ignorance' && state.responsePhase !== 'ignorance') queueTip('worldResponse');
  if (state.influence > 0) queueTip('influence');
  if (state.status === 'victory' || state.status === 'defeat') {
    if (state.status === 'victory') audio.playVictory();
    else audio.playDefeat();
    // Monétisation : n'alimente la décision publicitaire qu'à partir d'une
    // partie réellement terminée (jamais un abandon/redémarrage en cours de
    // partie, jamais plusieurs fois pour la même partie - voir
    // beginNewGameFlow, seul consommateur de ces deux variables).
    lastCompletedGameWasFirst = !hasCompletedFirstGame();
    if (lastCompletedGameWasFirst) markFirstGameCompleted();
    lastCompletedGameDurationMs = gameStartedAt ? Date.now() - gameStartedAt : 0;
    gameStartedAt = null;
  }
  saveState(state);
  render();
}, TICK_MS);

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
