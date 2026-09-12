import { SAVE_VERSION } from './engine/state.js';

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
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed;
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
