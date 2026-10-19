// RUPTURE V7 — point d'entrée de l'interface.
//
// Changements V7 (cahier des charges §3.C) :
//  - Rendu INCRÉMENTAL : l'écran de jeu et le choix d'origine sont construits
//    une seule fois (ui/playScreen.js, ui/originScreen.js) puis mis à jour ;
//    plus aucun innerHTML de tout l'écran à chaque seconde, donc plus aucun
//    tap perdu. Les écrans statiques (menu, réglages, fin…) ne sont réécrits
//    que lorsque leur contenu change réellement.
//  - Boucle à 250 ms (≈ 4 mises à jour/s, contrat de la carte) : ×1 = 1 jour/s,
//    ×2 = 2 jours/s, ×4 = 4 jours/s, comme en V6, mais plus fluide.
//  - Toutes les fonctions moteur V7 passent par ui/engineV7.js (replis sûrs
//    tant que le moteur V7 n'est pas intégré).
//
// Rappel V-finale (correctif bêta §1) : NE JAMAIS charger la sauvegarde
// directement au démarrage ; le menu propose « Reprendre la partie ».
import {
  engineReady, createInitialState, beginNewGame, confirmOrigin, simulateTick,
  buyUpgrade, selectTerritory, setSpeed, collectBubble, abilityStatus, useAbility,
  chooseEventOption, getAbilities, dailySeed, randomSeed, createMeta, recordGame,
  isUnlocked, strainLabel, territoryName, registerEngine
} from './ui/engineV7.js';
import { upgradeCost, DIFFICULTIES } from './engine/balance.js';
import {
  saveState, loadState, clearSave,
  hasSeenTutorial, markTutorialSeen,
  getDifficultySetting, setDifficultySetting,
  hasCompletedFirstGame, markFirstGameCompleted,
  hasSeenTip, markTipSeen, resetTips,
  loadMeta, saveMeta, getStrainSetting, setStrainSetting,
  getDailyRecord, recordDailyResult
} from './save.js';
import {
  renderMenu, renderDifficultyPicker, renderTutorial, renderHelp, renderTipPopup,
  renderEnd, renderGameMenu, renderInterstitialAd
} from './ui/screens.js';
import { createPlayScreen, targetingFor } from './ui/playScreen.js';
import { createOriginScreen } from './ui/originScreen.js';
import { isGameOver, outcomeOf, starsOf, blockerModel } from './ui/playModel.js';
import { playSpeeds, nextSpeed } from './ui/hud.js';
import { createServices } from './services/index.js';
import { RUNTIME_CONFIG } from './config/runtime.js';
import { createAudio } from './audio/audio.js';

const app = document.getElementById('app');
const services = createServices();
const audio = createAudio();

window.addEventListener('error', (event) => {
  services.analytics.logError(event.error ?? event.message, { type: 'window-error' });
});
window.addEventListener('unhandledrejection', (event) => {
  services.analytics.logError(event.reason, { type: 'unhandled-rejection' });
});

// Deux conteneurs permanents : écrans statiques (gabarits HTML) et écrans
// vivants (jeu / origine), jamais détruits à chaque tick.
const staticRoot = document.createElement('div');
staticRoot.className = 'static-root';
const liveRoot = document.createElement('div');
liveRoot.className = 'live-root';
app.append(staticRoot, liveRoot);
let lastStaticHtml = null;

let state = createInitialState();
// view : 'main' (menu principal) | 'game' (partie, quel que soit son statut)
let view = 'main';
let showTutorial = false;
let tutorialPendingNewGame = false;
let showDifficultyPicker = false;
let showHelp = false;
let menuView = null; // null | 'menu' | 'settings' | 'confirm-restart'
let settingsReturnTo = null;
let pendingDifficulty = getDifficultySetting();
let pendingStrain = getStrainSetting();
let pendingSeed = null; // graine imposée (défi du jour) pour la prochaine partie
let meta = loadMeta(createMeta);
let lastSpeed = 1;
let targeting = null;
let endInfo = null; // { record, starsGained, daily } calculé une fois à la fin

let tipQueue = [];
function queueTip(id) {
  if (hasSeenTip(id) || tipQueue.includes(id)) return;
  tipQueue.push(id);
}

// Monétisation (services/ads.js) : horloge murale de la partie en cours.
let gameStartedAt = null;
let lastCompletedGameDurationMs = null;
let lastCompletedGameWasFirst = false;
let showInterstitial = false;
let afterInterstitial = null;

const isDailySeed = (seed) => typeof seed === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(seed);

function hasResumableSave() {
  const saved = loadState();
  return Boolean(saved) && !isGameOver(saved) && saved.status !== 'menu';
}

function startNewGame() {
  clearSave();
  state = createInitialState();
  const seed = pendingSeed ?? randomSeed();
  const strain = isUnlocked(meta, pendingStrain) ? pendingStrain : 'standard';
  beginNewGame(state, getDifficultySetting(), { seed, strain, daily: isDailySeed(seed) });
  pendingSeed = null;
  targeting = null;
  endInfo = null;
  lastSpeed = 1;
  view = 'game';
  playScreen?.closeDrawer();
}

function actuallyBeginNewGameFlow() {
  pendingDifficulty = getDifficultySetting();
  pendingStrain = getStrainSetting();
  showDifficultyPicker = true;
}

// Une seule vérification publicitaire par partie réellement terminée, avant
// la partie suivante (jamais pendant une partie, jamais autour de la toute
// première) — inchangé depuis V6.
function withInterstitial(next) {
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
      services.ads.showInterstitialAd();
      afterInterstitial = next;
      return;
    }
  }
  next();
}

function beginNewGameFlow() {
  withInterstitial(actuallyBeginNewGameFlow);
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

// --- Écrans vivants ---------------------------------------------------------
let playScreen = null;
let originScreen = null;

function toast(text) {
  playScreen?.showToast(text);
}

const playActions = {
  openMenu() {
    targeting = null;
    menuView = 'menu';
    refresh(true);
  },
  togglePause() {
    if (state.speed > 0) {
      lastSpeed = state.speed;
      setSpeed(state, 0);
    } else {
      setSpeed(state, lastSpeed || 1);
    }
    refresh(true);
  },
  cycleSpeed() {
    const speeds = playSpeeds(services);
    const from = state.speed > 0 ? state.speed : lastSpeed;
    const next = state.speed > 0 ? nextSpeed(from, speeds) : from || 1;
    lastSpeed = next;
    setSpeed(state, next);
    refresh(true);
  },
  buy(kind) {
    const level = state.upgrades[kind];
    const cost = upgradeCost(kind, level);
    if (buyUpgrade(state, kind)) {
      audio.playPurchase();
      playScreen?.pulseUpgrade(kind, cost);
      if (level === 0) queueTip(kind);
      refresh(true);
    }
  },
  openDrawer(kind) {
    playScreen?.openDrawer(kind);
    refresh(true);
  },
  closeDrawer() {
    playScreen?.closeDrawer();
    refresh(true);
  },
  abilityTap(id) {
    if (targeting?.abilityId === id) {
      targeting = null;
      refresh(true);
      return;
    }
    const ability = getAbilities().find((a) => a.id === id);
    if (!ability) return;
    const status = abilityStatus(state, id);
    if (!status.available) {
      toast(status.reason || `${ability.label} n'est pas prête.`);
      return;
    }
    targeting = targetingFor(state, ability);
    if (!targeting.validTargets.length) {
      toast(`${ability.label} : aucune cible valide pour l'instant.`);
      targeting = null;
    }
    refresh(true);
  },
  cancelTargeting() {
    targeting = null;
    refresh(true);
  },
  territoryTap(id) {
    if (targeting && targeting.kind === 'territory') {
      applyAbility(id);
      return;
    }
    if (targeting) return; // ciblage de route : un tap de région ne fait rien
    selectTerritory(state, id);
    refresh(true);
  },
  routeTap(key) {
    if (targeting && targeting.kind === 'route') applyAbility(key);
  },
  bubbleTap(bubbleId, pointer) {
    const bubble = (state.bubbles ?? []).find((b) => b.id === bubbleId);
    const result = collectBubble(state, bubbleId);
    if (!result?.ok) return;
    const kind = result.kind ?? bubble?.kind;
    const gain = Math.round(Number(result.gain) || 0);
    if (kind === 'research') playScreen?.floatGain(`Réponse −${gain || 1}`, pointer, 'research');
    else playScreen?.floatGain(`+${gain}`, pointer, 'gain');
    audio.playPurchase();
    refresh(true);
  },
  chooseOption(optionId) {
    const result = chooseEventOption(state, optionId);
    if (result?.ok === false) {
      toast(result.error || 'Choix impossible.');
      return;
    }
    if (result?.resultText) toast(result.resultText);
    saveState(state);
    refresh(true);
  }
};

function applyAbility(target) {
  if (!targeting) return;
  const { abilityId, label, validTargets } = targeting;
  if (!validTargets.includes(target)) {
    toast(`${label} : cible non valide.`);
    return;
  }
  const result = useAbility(state, abilityId, target);
  if (result?.ok) {
    targeting = null;
    playScreen?.pulseAbility(abilityId);
    audio.playPurchase();
    toast(result.message || result.resultText || `${label} : ${target.includes('|') ? target.split('|').map(territoryName).join('–') : territoryName(target)}`);
    saveState(state);
  } else {
    toast(result?.error || `${label} impossible.`);
  }
  refresh(true);
}

const originActions = {
  select(id) {
    selectTerritory(state, id);
    refresh(true);
  },
  confirm(id) {
    const result = confirmOrigin(state, id);
    if (result && result.ok === false) {
      console.warn('Origine refusée', result.error);
      return;
    }
    gameStartedAt = Date.now();
    saveState(state);
    refresh(true);
  },
  back() {
    view = 'main';
    refresh(true);
  }
};

function ensurePlayScreen() {
  if (!playScreen) {
    playScreen = createPlayScreen(playActions);
    liveRoot.appendChild(playScreen.el);
  }
  return playScreen;
}

function ensureOriginScreen() {
  if (!originScreen) {
    originScreen = createOriginScreen(originActions);
    liveRoot.appendChild(originScreen.el);
  }
  return originScreen;
}

function originSubtitle() {
  const parts = [DIFFICULTIES[state.difficulty]?.label ?? 'Normal'];
  if (state.strain && state.strain !== 'standard') parts.push(`souche ${strainLabel(state.strain)}`);
  if (isDailySeed(state.seed)) parts.push(`défi du jour ${state.seed}`);
  return parts.join(' · ');
}

// --- Rendu -------------------------------------------------------------------
function staticHtml() {
  if (showInterstitial) return renderInterstitialAd();
  if (showHelp) return renderHelp();
  if (showDifficultyPicker) return renderDifficultyPicker(pendingDifficulty, { meta, pendingStrain });
  if (showTutorial) return renderTutorial();
  if (menuView) {
    return renderGameMenu(menuView, view === 'game' ? state : null, {
      pendingDifficulty,
      musicEnabled: audio.isMusicEnabled(),
      sfxEnabled: audio.isSfxEnabled(),
      isPremium: services.premium.isPremium(),
      premiumSource: services.premium.getEntitlementSource(),
      purchaseAvailable: services.premium.isPurchaseAvailable?.() ?? false,
      env: RUNTIME_CONFIG.env
    });
  }
  if (view === 'main') {
    const seed = dailySeed();
    return renderMenu({ hasSave: hasResumableSave(), meta, daily: { seed, record: getDailyRecord(seed) } });
  }
  if (isGameOver(state)) {
    return renderEnd(state, { ...(endInfo ?? {}), daily: isDailySeed(state.seed) ? state.seed : null });
  }
  return null;
}

function currentTipHtml() {
  return tipQueue.length ? renderTipPopup(tipQueue[0]) : null;
}

function refresh() {
  const html = staticHtml();
  const live = html === null ? (state.status === 'selecting-origin' ? 'origin' : state.status === 'playing' ? 'play' : null) : null;

  if (html !== null) {
    if (html !== lastStaticHtml) {
      staticRoot.innerHTML = html;
      lastStaticHtml = html;
    }
  } else if (lastStaticHtml !== null) {
    staticRoot.innerHTML = '';
    lastStaticHtml = null;
  }
  staticRoot.hidden = html === null;
  liveRoot.hidden = live === null;

  if (live === 'origin') {
    const screen = ensureOriginScreen();
    screen.el.hidden = false;
    if (playScreen) playScreen.el.hidden = true;
    screen.update(state, { subtitle: originSubtitle() });
  } else if (live === 'play') {
    const screen = ensurePlayScreen();
    screen.el.hidden = false;
    // L'écran d'origine ne sert plus pendant la partie : libéré (sa carte
    // n'a pas à rester en mémoire ni à recevoir des mises à jour).
    if (originScreen) {
      originScreen.destroy();
      originScreen = null;
    }
    screen.update(state, { targeting, lastSpeed, tipHtml: currentTipHtml() });
  }
}

const render = () => refresh();

// --- Actions des écrans statiques (délégation) -------------------------------
app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || !app.contains(target)) return;
  const action = target.dataset.action;
  audio.unlock();

  switch (action) {
    case 'new-game':
      beginNewGameFlow();
      break;
    case 'daily-challenge':
      pendingSeed = dailySeed();
      beginNewGameFlow();
      break;
    case 'replay': {
      // Rejouer : même difficulté et souche ; le défi du jour se rejoue avec
      // la même graine (c'est le principe du record du jour).
      const seed = isDailySeed(state.seed) ? state.seed : null;
      withInterstitial(() => {
        pendingSeed = seed;
        if (state.strain) pendingStrain = state.strain;
        if (state.difficulty) setDifficultySetting(state.difficulty);
        startNewGame();
        render();
      });
      break;
    }
    case 'go-menu':
      menuView = null;
      targeting = null;
      if (view === 'game' && !isGameOver(state)) saveState(state);
      view = 'main';
      break;
    case 'confirm-difficulty-and-start':
      proceedAfterDifficultyPicked();
      break;
    case 'cancel-difficulty-picker':
      showDifficultyPicker = false;
      pendingSeed = null;
      break;
    case 'show-help':
      showHelp = true;
      break;
    case 'close-help':
      showHelp = false;
      break;
    case 'dismiss-tip': {
      markTipSeen(target.dataset.tip);
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
      if (saved && !isGameOver(saved)) {
        state = saved;
        view = 'game';
        targeting = null;
        endInfo = null;
        if (state.status === 'playing' && !gameStartedAt) gameStartedAt = Date.now();
      }
      break;
    }
    case 'set-difficulty':
      pendingDifficulty = target.dataset.difficulty;
      setDifficultySetting(pendingDifficulty);
      break;
    case 'set-strain':
      if (isUnlocked(meta, target.dataset.strain)) {
        pendingStrain = target.dataset.strain;
        setStrainSetting(pendingStrain);
      }
      break;

    // --- menu en partie / réglages ---
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

    // --- monétisation (Premium = « sans pub » uniquement) ---
    case 'interstitial-continue': {
      showInterstitial = false;
      const resume = afterInterstitial;
      afterInterstitial = null;
      if (resume) resume();
      break;
    }
    case 'premium-purchase':
    case 'premium-purchase-test':
      services.premium.purchasePremium().then(render);
      break;
    case 'premium-restore':
    case 'premium-restore-test':
      services.premium.restorePurchases().then(render);
      break;
    case 'premium-reset-test':
      services.premium.setPremium(false);
      break;
    default:
      return;
  }

  if (view === 'game' && state.status !== 'menu') saveState(state);
  render();
});

// --- Fin de partie -----------------------------------------------------------
function handleGameOver() {
  const outcome = outcomeOf(state);
  const victory = outcome?.result === 'victory';
  if (victory) audio.playVictory();
  else audio.playDefeat();
  targeting = null;
  playScreen?.closeDrawer();

  const result = recordGame(meta, state);
  if (result?.meta) {
    meta = result.meta;
    saveMeta(meta);
  }
  const stars = starsOf(state);
  let record = { newRecord: Boolean(result?.newRecord) };
  if (isDailySeed(state.seed)) {
    const daily = recordDailyResult(state.seed, { won: victory, stars, day: outcome?.day ?? state.day });
    record = { newRecord: daily.newRecord, bestDay: daily.record.bestDay, bestStars: daily.record.bestStars };
  }
  endInfo = { record, starsGained: result?.starsGained ?? 0 };

  lastCompletedGameWasFirst = !hasCompletedFirstGame();
  if (lastCompletedGameWasFirst) markFirstGameCompleted();
  lastCompletedGameDurationMs = gameStartedAt ? Date.now() - gameStartedAt : 0;
  gameStartedAt = null;
}

// --- Boucle de simulation ----------------------------------------------------
const FRAME_MS = 250;
let tickBudget = 0;
let lastSaveAt = 0;

function isTimeFrozen() {
  return document.hidden || view !== 'game' || showTutorial || showDifficultyPicker || showHelp
    || menuView || showInterstitial || tipQueue.length > 0 || Boolean(targeting)
    || Boolean(state.pendingEvent) || state.status !== 'playing' || !(state.speed > 0);
}

function frame() {
  // Fin de partie décidée hors d'un tick (choix d'événement, capacité…) :
  // l'écran de fin doit quand même apparaître, une seule fois.
  if (view === 'game' && isGameOver(state) && !endInfo) {
    handleGameOver();
    saveState(state);
    render();
    return;
  }
  if (isTimeFrozen()) {
    tickBudget = 0;
    return;
  }
  tickBudget += (state.speed * FRAME_MS) / 1000;
  const phaseBefore = state.responsePhase;
  let ran = 0;
  while (tickBudget >= 1 && ran < 8) {
    tickBudget -= 1;
    ran += 1;
    simulateTick(state);
    if (state.status !== 'playing' || state.pendingEvent || isGameOver(state)) {
      tickBudget = 0;
      break;
    }
  }
  if (!ran) return;

  if (state.responsePhase !== phaseBefore) audio.playPhaseChange();
  if (phaseBefore === 'ignorance' && state.responsePhase !== 'ignorance') queueTip('worldResponse');
  if (state.influence > 0) queueTip('influence');
  if ((state.bubbles ?? []).length) queueTip('bubbles');
  if (getAbilities().some((a) => abilityStatus(state, a.id).available)) queueTip('abilities');
  if (state.pendingEvent) queueTip('events');
  if (blockerModel(state)?.kind === 'gravity-cap') queueTip('gravityWall');

  if (isGameOver(state)) {
    handleGameOver();
    saveState(state);
  } else {
    const now = Date.now();
    if (now - lastSaveAt > 1000 || state.pendingEvent) {
      saveState(state);
      lastSaveAt = now;
    }
  }
  render();
}

engineReady.then(() => {
  render();
  setInterval(frame, FRAME_MS);
});

// Aide aux tests de bout en bout (Playwright) : lecture de l'état, et
// injection d'un faux moteur V7 (registerEngine) pour vérifier l'interface
// avant l'intégration du vrai moteur. Sans effet en jeu normal.
window.__rupture = {
  get state() { return state; },
  get view() { return view; },
  registerEngine,
  refresh: () => refresh()
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
