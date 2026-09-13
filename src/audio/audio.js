// Audio de RUPTURE - entièrement procédural (Web Audio API), sans aucun
// fichier ni asset externe : aucune question de droits ne se pose puisque
// rien n'est ni enregistré ni redistribué (voir §7 de la demande V4.1 -
// "aucun asset aux droits incertains" ; une solution locale/procédurale est
// explicitement préférée). Toute la musique et tous les effets sont
// synthétisés en direct via des oscillateurs et enveloppes de gain.
//
// Musique : une ambiance minimaliste par événements espacés (PAS un fond
// continu) - de vraies plages de silence entre chaque note, jamais une
// tonalité qui tourne en boucle pendant toute la partie.
//
// V-finale (correctif bêta) : la V4.2 utilisait un drone continu (3
// oscillateurs jouant sans interruption pendant toute la partie). Retour de
// bêta explicite : perçu comme "une seule note continue", fatiguant. Plutôt
// que de retravailler un système continu (risque de rester fatiguant sous
// une autre forme), remplacé par une approche volontairement plus simple :
// aucun son ne joue en continu, une seule note (ou parfois deux, à quelques
// centaines de ms d'écart) toutes les 15 à 45 secondes environ, avec de
// vraies plages de silence entre - conforme à l'instruction explicite
// "le silence partiel est largement préférable à une mauvaise bande-son
// continue". Chaque événement varie (note choisie au hasard dans un petit
// accord mineur cohérent, timbre, durée) pour éviter toute répétition
// perçue comme une note unique.
//
// V4.2 (hérité, toujours valable pour les fréquences choisies) : le registre
// grave d'origine (55-82Hz) était quasi inaudible sur haut-parleur de
// téléphone (~12% de l'énergie survivant au-dessus de 200Hz, mesuré par
// rendu hors-ligne + filtre passe-haut). Le nouveau palette de notes reste
// dans le registre alors validé comme audible (165-440Hz).
//
// Effets : achat/amélioration, changement de phase de la Réponse mondiale
// (qui correspond aussi à la réaction humaine majeure - même événement dans
// ce moteur), victoire, défaite. Volontairement peu nombreux et discrets,
// non modifiés par cette passe (déjà validés en bêta) : accompagner
// l'action, jamais fatiguer.
import { getMusicSetting, setMusicSetting, getSfxSetting, setSfxSetting } from '../save.js';

let ctx = null;
let masterMusicGain = null;
let musicFilter = null;
let musicStarted = false;
let ambientTimer = null;

function ensureContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  return ctx;
}

// Petit accord mineur cohérent (le même esprit que l'ancien drone), mais
// jamais joué en continu : une seule note piochée au hasard dans cette
// palette à chaque événement, pour que deux événements consécutifs sonnent
// rarement pareil. Registre déjà validé audible sur haut-parleur de
// téléphone (165-440Hz, voir commentaire en tête de fichier).
const AMBIENT_NOTES = [165, 220, 261.6, 329.6, 440];

function playAmbientNote(now, freq) {
  const type = Math.random() < 0.7 ? 'sine' : 'triangle';
  const duration = 1.4 + Math.random() * 2; // 1.4 à 3.4s : une vraie respiration, pas un clic
  const peak = 0.09 + Math.random() * 0.07; // discret, jamais dominant
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.25); // attaque douce, pas percussive
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(musicFilter);
  osc.start(now);
  osc.stop(now + duration + 0.1);
}

// Un seul événement ambiant : une note, et parfois (1 fois sur 5) une
// deuxième note de l'accord juste après - jamais plus, pour rester discret.
// Puis un vrai silence avant le prochain (15-45s, avec occasionnellement un
// silence deux fois plus long) : conforme à la demande explicite de
// "vraies périodes de silence", pas un fond qui tourne.
function scheduleAmbientEvent() {
  if (!musicStarted || !ctx) return;
  const now = ctx.currentTime;
  const note = AMBIENT_NOTES[Math.floor(Math.random() * AMBIENT_NOTES.length)];
  playAmbientNote(now, note);
  if (Math.random() < 0.2) {
    const second = AMBIENT_NOTES[Math.floor(Math.random() * AMBIENT_NOTES.length)];
    playAmbientNote(now + 0.3 + Math.random() * 0.25, second);
  }
  let gapMs = 15000 + Math.random() * 30000;
  if (Math.random() < 0.25) gapMs += 15000 + Math.random() * 15000; // silence plus long, occasionnel
  ambientTimer = setTimeout(scheduleAmbientEvent, gapMs);
}

function startMusicGraph() {
  if (!ctx || musicStarted) return;
  musicStarted = true;

  const master = ctx.createGain();
  master.gain.value = 1; // le volume réel est porté par chaque note (peak), pas par ce gain global
  master.connect(ctx.destination);
  masterMusicGain = master;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.connect(master);
  musicFilter = filter;

  // Premier événement après un court délai (pas immédiatement au
  // déverrouillage, pour ne pas coïncider avec un clic de l'interface).
  ambientTimer = setTimeout(scheduleAmbientEvent, 3000 + Math.random() * 4000);
}

function stopMusicGraph() {
  if (!musicStarted) return;
  musicStarted = false;
  if (ambientTimer) clearTimeout(ambientTimer);
  ambientTimer = null;
  musicFilter = null;
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
