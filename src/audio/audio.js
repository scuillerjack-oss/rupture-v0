// Audio de RUPTURE - entièrement procédural (Web Audio API), sans aucun
// fichier ni asset externe : aucune question de droits ne se pose puisque
// rien n'est ni enregistré ni redistribué (voir §7 de la demande V4.1 -
// "aucun asset aux droits incertains" ; une solution locale/procédurale est
// explicitement préférée). Toute la musique et tous les effets sont
// synthétisés en direct via des oscillateurs et enveloppes de gain -
// jamais de voix, jamais d'échantillon audio.
//
// V5.2 (troisième correctif bêta sur l'audio - clarification du besoin) :
// la V5.1 proposait une ambiance générative continue (nappe d'accords en La
// mineur naturel + notes piochées au hasard). Retour explicite : perçue
// comme trop sombre/angoissante, et ce n'était toujours pas la demande - le
// joueur veut une véritable petite MÉLODIE instrumentale identifiable
// (calme, posée, curieuse/réfléchie), pas une nappe ambient ni un drone,
// aussi doux soit-il. Nouvelle approche, plus proche d'une vraie
// composition qu'une génération procédurale :
//
//  - Un thème mélodique COURT et FIXE (8 notes, contour simple qui monte
//    puis redescend) et une phrase réponse plus courte (6 notes,
//    descendante, volontairement ouverte) qui alternent à chaque
//    apparition - reconnaissables d'une fois sur l'autre (c'est le point
//    central de la demande), pas générées au hasard note par note.
//  - Gamme choisie : La DORIEN (A-B-C-D-E-F#-G), pas La mineur naturel. Le
//    6e degré rehaussé (F# au lieu de F) est précisément ce qui distingue
//    une couleur "pensive/curieuse" d'une couleur "triste/sombre" en theorie
//    modale usuelle - c'était la source la plus probable du ressenti
//    "angoissant" de la V5.1 (mineur naturel, harmonisé en power-chords
//    graves). Aucune basse menaçante, aucun timbre percussif.
//  - Chaque note du thème est légèrement humanisée (durée/volume/écart
//    temporel variés à chaque apparition, dans une fourchette étroite) pour
//    ne jamais sonner comme un enregistrement figé qui boucle à
//    l'identique, sans pour autant perdre le contour mélodique reconnu.
//  - Un unique support harmonique très doux (une note grave tenue, jamais un
//    accord complet) apparaît UNIQUEMENT pendant que le thème joue et
//    s'éteint avec lui - jamais de son continu entre deux apparitions.
//  - De vraies plages de silence (35 à 65 secondes) séparent chaque
//    apparition du thème : la musique reste présente et identifiable sans
//    jamais fatiguer en fond de partie, conformément à la demande explicite
//    "elle doit pouvoir tourner en fond sans fatiguer".
//
// Registre choisi (165-440Hz) : reste dans la zone déjà validée audible sur
// haut-parleur de téléphone en V4.2 (mesuré par rendu hors-ligne + filtre
// passe-haut 200Hz, corrigé par un décalage de deux octaves depuis le
// registre grave d'origine 55-82Hz) - la note de soutien la plus grave
// (F#3, 185Hz) reste dans cette zone.
//
// Effets : achat/amélioration, changement de phase de la Réponse mondiale
// (qui correspond aussi à la réaction humaine majeure - même événement dans
// ce moteur), victoire, défaite. Volontairement peu nombreux et discrets,
// non modifiés par cette passe (déjà validés en bêta) : accompagner
// l'action, jamais fatiguer.
import { getMusicSetting, setMusicSetting, getSfxSetting, setSfxSetting } from '../save.js';

let ctx = null;
let masterMusicGain = null;
let musicStarted = false;
let themeTimer = null;
let useAlternateTheme = false; // alterne thème principal / phrase réponse à chaque apparition

function ensureContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  return ctx;
}

// La Dorien (A3-A4) : A-B-C-D-E-F#-G-A. Le 6e degré rehaussé (F#, contre un
// Fa naturel en La mineur) donne une couleur pensive/curieuse plutôt que
// triste - voir l'en-tête de fichier. Fréquences en Hz.
const A3 = 220.0;
const B3 = 246.94;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const FS4 = 369.99;
const G4 = 392.0;
const A4 = 440.0;

// Thème principal : contour simple qui monte puis redescend (arche), la
// forme la plus naturellement mémorisable. Chaque entrée est {freq, beat}
// où `beat` est sa position (en temps relatifs) - permet un tempo légèrement
// humanisé sans perdre l'intervalle entre les notes.
const THEME_MAIN = [A3, C4, E4, FS4, E4, C4, B3, A3];
// Phrase réponse : plus courte, descendante, volontairement laissée ouverte
// (ne revient pas jusqu'à la tonique) - alterne avec le thème principal pour
// que de longues sessions ne rejouent pas exactement la même chose à
// chaque fois, sans perdre le fil mélodique reconnu (même gamme, même
// esprit).
const THEME_ANSWER = [E4, D4, C4, B3, A3, C4];

const NOTE_BEAT_S = 1.15; // tempo de base, lent et posé ("andante")
// Soutien grave très doux : F#3 (185Hz, 6e degré à l'octave inférieure) -
// reste dans le registre validé audible sur haut-parleur de téléphone
// (165-440Hz, voir en-tête de fichier) contrairement à une octave complète
// sous A3, qui retomberait dans le registre grave déjà identifié comme
// inaudible en V4.2.
const SUPPORT_NOTE = 185.0;

function playMelodyNote(now, freq, isLast) {
  const type = Math.random() < 0.7 ? 'sine' : 'triangle';
  // Notes liées (léger chevauchement) pour un rendu legato, jamais saccadé -
  // la dernière note du thème respire un peu plus longtemps avant le
  // silence qui suit.
  const duration = (isLast ? 1.8 : 1.1) + Math.random() * 0.3;
  const peak = 0.075 + Math.random() * 0.035; // présent (c'est la mélodie, l'élément principal), mais net en dessous des effets sonores (0.12-0.18)
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.15); // attaque douce, jamais percussive
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(masterMusicGain);
  osc.start(now);
  osc.stop(now + duration + 0.1);
}

function playSupportNote(now, totalDuration) {
  // Un seul soutien grave et très doux, présent UNIQUEMENT pendant que le
  // thème joue - jamais de son continu entre deux apparitions (voir
  // en-tête). Fondu d'entrée/sortie doux pour ne jamais créer de coupure
  // audible.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = SUPPORT_NOTE;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.025, now + 1); // très en retrait, un simple ancrage harmonique
  gain.gain.setValueAtTime(0.025, now + totalDuration - 1.2);
  gain.gain.linearRampToValueAtTime(0, now + totalDuration);
  osc.connect(gain);
  gain.connect(masterMusicGain);
  osc.start(now);
  osc.stop(now + totalDuration + 0.1);
}

// Joue une apparition complète du thème (choisi selon useAlternateTheme) :
// une note à la fois, légèrement humanisée en tempo/volume/durée à chaque
// fois pour ne jamais sonner comme un enregistrement figé qui boucle à
// l'identique - sans jamais perdre le contour mélodique (les intervalles
// entre les notes restent exacts, seul le tempo global respire un peu).
function playThemeOnce() {
  if (!musicStarted || !ctx) return;
  const notes = useAlternateTheme ? THEME_ANSWER : THEME_MAIN;
  useAlternateTheme = !useAlternateTheme;

  const now = ctx.currentTime;
  const tempoVariation = 0.9 + Math.random() * 0.25; // +-12% environ, jamais deux apparitions rigoureusement identiques
  let cursor = 0;
  notes.forEach((freq, i) => {
    playMelodyNote(now + cursor, freq, i === notes.length - 1);
    cursor += NOTE_BEAT_S * tempoVariation * (0.92 + Math.random() * 0.16);
  });
  const totalDuration = cursor + 1.5;
  playSupportNote(now, totalDuration);

  const gapMs = (35 + Math.random() * 30) * 1000; // 35-65s de vrai silence avant la prochaine apparition
  themeTimer = setTimeout(playThemeOnce, totalDuration * 1000 + gapMs);
}

function startMusicGraph() {
  if (!ctx || musicStarted) return;
  musicStarted = true;

  const master = ctx.createGain();
  master.gain.value = 1; // le volume réel est porté par chaque note (peak), pas par ce gain global
  master.connect(ctx.destination);
  masterMusicGain = master;

  // Première apparition après un court délai (pas immédiatement au
  // déverrouillage, pour ne pas coïncider avec un clic de l'interface).
  useAlternateTheme = false;
  themeTimer = setTimeout(playThemeOnce, 3000 + Math.random() * 3000);
}

function stopMusicGraph() {
  if (!musicStarted) return;
  musicStarted = false;
  if (themeTimer) clearTimeout(themeTimer);
  themeTimer = null;
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
