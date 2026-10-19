// V7 — HUD en UNE ligne : menu / Progression / Réponse / Influence / jour /
// pause / vitesse, plus une fine barre de course (Progression contre
// Réponse) juste en dessous.
//
// Rendu incrémental : createHud() crée les éléments une seule fois ;
// update() ne change que les textes/classes qui ont réellement changé.
// Aucun innerHTML à chaque tick : un bouton touché n'est jamais remplacé
// sous le doigt (bug V6 des taps perdus).
import { getAvailableSpeeds } from '../config/runtime.js';
import { h, setText, setClass, setStyle, setAttr } from './dom.js';
import { hudModel } from './playModel.js';

export const SPEED_LABELS = { 0: '⏸', 1: '×1', 2: '×2', 4: '×4' };

// Vitesses proposées (hors pause) : toujours ×1/×2/×4 en V7 (×4 gratuit pour
// tous — décision du studio, voir config/runtime.js).
export function playSpeeds(services) {
  return getAvailableSpeeds(services).filter((s) => s > 0);
}

// Vitesse suivante quand on touche le bouton de vitesse (×1 → ×2 → ×4 → ×1).
export function nextSpeed(current, speeds) {
  const list = speeds.length ? speeds : [1];
  const i = list.indexOf(current);
  return list[(i + 1) % list.length] ?? list[0];
}

function metric(cls, label) {
  const value = h('span', { class: 'hud-value' });
  const el = h('div', { class: `hud-metric ${cls}` }, [h('span', { class: 'hud-label', text: label }), value]);
  return { el, value };
}

export function createHud({ onMenu, onPause, onSpeed }) {
  const menuBtn = h('button', { class: 'hud-menu', 'aria-label': 'Menu', text: '☰', on: { click: () => onMenu?.() } });
  const prog = metric('m-prog', 'Progression');
  const resp = metric('m-resp', 'Réponse');
  const inf = metric('m-inf', 'Influence');
  const day = metric('m-day', 'Jour');
  const pauseBtn = h('button', { class: 'hud-pause', 'aria-label': 'Pause', 'data-testid': 'pause', on: { click: () => onPause?.() } });
  const speedBtn = h('button', { class: 'hud-speed', 'aria-label': 'Vitesse', 'data-testid': 'speed', on: { click: () => onSpeed?.() } });
  const bar = h('div', { class: 'hud-bar' }, [menuBtn, prog.el, resp.el, inf.el, day.el, pauseBtn, speedBtn]);

  const raceProg = h('span', { class: 'race-prog' });
  const raceResp = h('span', { class: 'race-resp' });
  const race = h('div', { class: 'race-bar', 'aria-hidden': 'true' }, [raceProg, raceResp]);

  const el = h('div', { class: 'hud' }, [bar, race]);

  return {
    el,
    influenceEl: inf.el,
    update(state, { lastSpeed = 1 } = {}) {
      const m = hudModel(state);
      setText(prog.value, m.progression);
      setText(resp.value, m.response);
      setText(inf.value, m.influence);
      setText(day.value, m.day);
      setAttr(resp.el, 'title', m.phase);
      const paused = m.speed <= 0;
      setText(pauseBtn, paused ? '▶' : '⏸');
      setAttr(pauseBtn, 'aria-label', paused ? 'Reprendre' : 'Pause');
      setClass(pauseBtn, 'active', paused);
      setText(speedBtn, SPEED_LABELS[paused ? lastSpeed : m.speed] ?? `×${m.speed}`);
      setClass(resp.el, 'danger', m.responseValue >= 70);
      setStyle(raceProg, 'width', `${Math.min(100, m.progressionValue) / 2}%`);
      setStyle(raceResp, 'width', `${Math.min(100, m.responseValue) / 2}%`);
    }
  };
}
