// Audio de RUPTURE - entièrement procédural (Web Audio API), sans aucun
// fichier ni asset externe : aucune question de droits ne se pose puisque
// rien n'est ni enregistré ni redistribué (voir §7 de la demande V4.1 -
// "aucun asset aux droits incertains" ; une solution locale/procédurale est
// explicitement préférée). Toute la musique et tous les effets sont
// synthétisés en direct via des oscillateurs et enveloppes de gain.
//
// Musique : un drone ambiant continu (pas un sample qui boucle) - il n'y a
// donc littéralement pas de point de boucle à soigner, la question du
// "loop propre" ne se pose pas. Discret, légèrement inquiétant (intervalle
// mineur, filtre passe-bas sombre), volume faible par défaut.
//
// Effets : achat/amélioration, changement de phase de la Réponse mondiale
// (qui correspond aussi à la réaction humaine majeure - même événement dans
// ce moteur), victoire, défaite. Volontairement peu nombreux et discrets :
// accompagner l'action, jamais fatiguer.
import { getMusicSetting, setMusicSetting, getSfxSetting, setSfxSetting } from '../save.js';

let ctx = null;
let masterMusicGain = null;
let musicNodes = null;
let musicStarted = false;
let plucker = null;

function ensureContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  return ctx;
}

// Drone ambiant : deux voix graves détonnées (fondamentale + tierce mineure)
// passées dans un filtre passe-bas, plus une voix de quinte très douce
// modulée lentement en amplitude pour une légère "respiration". Aucune
// donnée enregistrée : tout est généré en continu tant que la musique est
// activée, donc jamais de raccord de boucle à faire.
function startMusicGraph() {
  if (!ctx || musicStarted) return;
  musicStarted = true;

  const master = ctx.createGain();
  master.gain.value = 0.14;
  master.connect(ctx.destination);
  masterMusicGain = master;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  filter.connect(master);

  const voices = [];
  const freqs = [55, 65.4, 82.4]; // fondamentale, tierce mineure, quinte (Hz)
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = i === 0 ? 0.55 : 0.22;
    osc.connect(gain);
    gain.connect(filter);
    osc.start();
    voices.push({ osc, gain });
  });

  // LFO lent sur la voix de quinte pour une respiration discrète, pas un
  // volume constant et statique.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.06;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.1;
  lfo.connect(lfoGain);
  lfoGain.connect(voices[2].gain.gain);
  lfo.start();

  musicNodes = { master, filter, voices, lfo };

  // Ponctuation éparse : un "pluck" doux toutes les ~9-16s, jamais deux fois
  // le même timing exact - une présence, pas un métronome.
  const schedulePluck = () => {
    if (!musicStarted || !ctx) return;
    const now = ctx.currentTime;
    const pluckOsc = ctx.createOscillator();
    pluckOsc.type = 'sine';
    pluckOsc.frequency.value = freqs[1] * 2;
    const pluckGain = ctx.createGain();
    pluckGain.gain.setValueAtTime(0, now);
    pluckGain.gain.linearRampToValueAtTime(0.05, now + 0.05);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    pluckOsc.connect(pluckGain);
    pluckGain.connect(filter);
    pluckOsc.start(now);
    pluckOsc.stop(now + 2);
    plucker = setTimeout(schedulePluck, 9000 + Math.random() * 7000);
  };
  plucker = setTimeout(schedulePluck, 4000);
}

function stopMusicGraph() {
  if (!musicStarted) return;
  musicStarted = false;
  if (plucker) clearTimeout(plucker);
  plucker = null;
  if (musicNodes) {
    for (const { osc } of musicNodes.voices) {
      try { osc.stop(); } catch { /* déjà arrêté */ }
    }
    try { musicNodes.lfo.stop(); } catch { /* déjà arrêté */ }
  }
  musicNodes = null;
  masterMusicGain = null;
}

function tone({ freq, type = 'sine', start = 0, duration = 0.12, peak = 0.18, glideTo = null }) {
  if (!ctx) return;
  const now = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + Math.min(0.02, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

export function createAudio() {
  let musicEnabled = getMusicSetting();
  let sfxEnabled = getSfxSetting();

  function applyMusicState() {
    if (!ctx) return;
    if (musicEnabled && document.visibilityState !== 'hidden') startMusicGraph();
    else stopMusicGraph();
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') {
      ctx.suspend().catch(() => {});
    } else {
      ctx.resume().catch(() => {});
      applyMusicState();
    }
  });

  return {
    // À appeler sur le tout premier geste utilisateur (les navigateurs
    // bloquent l'audio tant qu'aucune interaction n'a eu lieu) - sans effet
    // si déjà déverrouillé.
    unlock() {
      const created = ensureContext();
      if (!created) return;
      if (created.state === 'suspended') created.resume().catch(() => {});
      applyMusicState();
    },
    isMusicEnabled: () => musicEnabled,
    isSfxEnabled: () => sfxEnabled,
    setMusicEnabled(value) {
      musicEnabled = Boolean(value);
      setMusicSetting(musicEnabled);
      applyMusicState();
    },
    setSfxEnabled(value) {
      sfxEnabled = Boolean(value);
      setSfxSetting(sfxEnabled);
    },
    // Achat/amélioration validée (même geste dans ce moteur : voir buyUpgrade).
    playPurchase() {
      if (!sfxEnabled || !ctx) return;
      tone({ freq: 520, duration: 0.09, peak: 0.16 });
      tone({ freq: 780, start: 0.05, duration: 0.1, peak: 0.12 });
    },
    // Changement de phase de la Réponse mondiale = réaction humaine majeure
    // perceptible (même événement dans ce moteur - voir simulation.js).
    playPhaseChange() {
      if (!sfxEnabled || !ctx) return;
      tone({ freq: 220, type: 'triangle', duration: 0.35, peak: 0.14, glideTo: 330 });
    },
    playVictory() {
      if (!sfxEnabled || !ctx) return;
      [523, 659, 784, 1046].forEach((freq, i) => {
        tone({ freq, type: 'triangle', start: i * 0.12, duration: 0.5, peak: 0.16 });
      });
    },
    playDefeat() {
      if (!sfxEnabled || !ctx) return;
      tone({ freq: 220, type: 'sawtooth', duration: 1.1, peak: 0.13, glideTo: 110 });
    }
  };
}
