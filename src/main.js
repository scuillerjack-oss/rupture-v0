import { createInitialState, beginNewGame, confirmOrigin } from './engine/state.js';
import { simulateTick, buyUpgrade, selectTerritory, setSpeed } from './engine/simulation.js';
import { saveState, loadState, clearSave, hasSeenTutorial, markTutorialSeen } from './save.js';
import { renderMenu, renderTutorial, renderSelectingOrigin, renderPlaying, renderEnd } from './ui/screens.js';

const app = document.getElementById('app');

let state = loadState() || createInitialState();
let showTutorial = false;
let tutorialPendingNewGame = false;

function startNewGame() {
  clearSave();
  state = createInitialState();
  beginNewGame(state);
}

function render() {
  if (showTutorial) {
    app.innerHTML = renderTutorial();
    return;
  }
  switch (state.status) {
    case 'selecting-origin':
      app.innerHTML = renderSelectingOrigin(state);
      break;
    case 'playing':
      app.innerHTML = renderPlaying(state);
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

  switch (action) {
    case 'new-game':
      if (!hasSeenTutorial()) {
        showTutorial = true;
        tutorialPendingNewGame = true;
      } else {
        startNewGame();
      }
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
      buyUpgrade(state, target.dataset.kind);
      break;
    case 'set-speed':
      setSpeed(state, Number(target.dataset.speed));
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
  if (state.status !== 'playing' || state.speed <= 0) return;
  for (let i = 0; i < state.speed; i += 1) {
    simulateTick(state);
    if (state.status !== 'playing') break;
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
