import { SAVE_VERSION } from './engine/state.js';
import { migrateSave } from './engine/migrations.js';

const KEY = 'rupture-v0-save';

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('Sauvegarde impossible', e);
    return false;
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version === SAVE_VERSION) return parsed;
    // Version différente : tente une migration enregistrée plutôt que de
    // rejeter directement. migrateSave renvoie null si aucun chemin
    // n'existe (même comportement de rejet propre qu'avant).
    return migrateSave(parsed, SAVE_VERSION);
  } catch (e) {
    console.warn('Lecture de sauvegarde impossible', e);
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn('Suppression de sauvegarde impossible', e);
  }
}

const TUTORIAL_KEY = 'rupture-v0-tutorial-seen';

export function hasSeenTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch (e) {
    console.warn('Impossible de mémoriser que le tutoriel a été vu', e);
  }
}

const DIFFICULTY_KEY = 'rupture-v0-difficulty';

export function getDifficultySetting() {
  try {
    return localStorage.getItem(DIFFICULTY_KEY) || 'normal';
  } catch (e) {
    return 'normal';
  }
}

export function setDifficultySetting(difficulty) {
  try {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch (e) {
    console.warn('Impossible de mémoriser la difficulté choisie', e);
  }
}

// Indicateur Premium local (voir src/services/premium.js). Aucun achat réel
// n'existe : ce n'est qu'un indicateur côté appareil, faux par défaut.
const PREMIUM_KEY = 'rupture-v0-premium';

export function getPremiumFlag() {
  try {
    return localStorage.getItem(PREMIUM_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function setPremiumFlag(value) {
  try {
    if (value) localStorage.setItem(PREMIUM_KEY, '1');
    else localStorage.removeItem(PREMIUM_KEY);
  } catch (e) {
    console.warn('Impossible de mémoriser le statut Premium', e);
  }
}
