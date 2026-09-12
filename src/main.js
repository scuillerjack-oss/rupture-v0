import { createInitialState, beginNewGame, confirmOrigin } from './engine/state.js';
import { simulateTick, buyUpgrade, selectTerritory, setSpeed } from './engine/simulation.js';
import { saveState, loadState, clearSave } from './save.js';
import { renderMenu, renderSelectingOrigin, renderPlaying, renderEnd } from './ui/screens.js';

const app = document.getElementById('app');

let state = loadState() || createInitialState();

function render() {
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
      clearSave();
      state = createInitialState();
      beginNewGame(state);
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

const TICK_MS = 700;
setInterval(() => {
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
