import { createInitialState, beginNewGame, confirmOrigin } from './engine/state.js';
import { simulateTick, buyUpgrade, selectTerritory, setSpeed } from './engine/simulation.js';
import {
  saveState, loadState, clearSave,
  hasSeenTutorial, markTutorialSeen,
  getDifficultySetting, setDifficultySetting
} from './save.js';
import { renderMenu, renderDifficultyPicker, renderTutorial, renderSelectingOrigin, renderPlaying, renderEnd, renderGameMenu } from './ui/screens.js';
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

let state = loadState() || createInitialState();
let showTutorial = false;
let tutorialPendingNewGame = false;
let showDifficultyPicker = false;
let statsView = 'territory';

// menuView: null | 'menu' | 'settings' | 'confirm-restart'
let menuView = null;
let settingsReturnTo = null; // where "Retour" from Paramètres should go: null (main menu) or 'menu' (in-game)
let pendingDifficulty = getDifficultySetting();

function startNewGame() {
  clearSave();
  state = createInitialState();
  beginNewGame(state, getDifficultySetting());
}

// La difficulté est désormais choisie explicitement avant CHAQUE nouvelle
// partie (nouvelle ou redémarrage) plutôt que silencieusement héritée d'un
// éventuel passage antérieur par Paramètres - voir renderDifficultyPicker.
// Rien n'est détruit tant que "Continuer" n'a pas été cliqué : une ancienne
// partie en cours reste intacte si le joueur fait "Retour" depuis cet écran.
function beginNewGameFlow() {
  pendingDifficulty = getDifficultySetting();
  showDifficultyPicker = true;
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
      sfxEnabled: audio.isSfxEnabled()
    });
    return;
  }
  switch (state.status) {
    case 'selecting-origin':
      app.innerHTML = renderSelectingOrigin(state);
      break;
    case 'playing':
      app.innerHTML = renderPlaying(state, statsView, services);
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
    case 'show-tutorial':
      showTutorial = true;
      tutorialPendingNewGame = false;
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
      break;
    case 'buy-upgrade':
      if (buyUpgrade(state, target.dataset.kind)) audio.playPurchase();
      break;
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
    default:
      return;
  }

  saveState(state);
  render();
});

const TICK_MS = 1000;
setInterval(() => {
  if (document.hidden) return;
  if (showTutorial || showDifficultyPicker || menuView) return;
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
  if (state.status === 'victory') audio.playVictory();
  else if (state.status === 'defeat') audio.playDefeat();
  saveState(state);
  render();
}, TICK_MS);

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
