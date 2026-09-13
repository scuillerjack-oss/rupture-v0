// Audio de RUPTURE - entièrement procédural (Web Audio API), sans aucun
// fichier ni asset externe : aucune question de droits ne se pose puisque
// rien n'est ni enregistré ni redistribué (voir §7 de la demande V4.1 -
// "aucun asset aux droits incertains" ; une solution locale/procédurale est
// explicitement préférée). Toute la musique et tous les effets sont
// synthétisés en direct via des oscillateurs et enveloppes de gain -
// jamais de voix, jamais d'échantillon audio.
//
// V5.1 (deuxième correctif bêta sur l'audio - clarification du besoin) :
// la V5 avait remplacé le drone continu par des notes isolées séparées de
// 15 à 45s de silence. Retour explicite du joueur : ce n'était pas ce qui
// était demandé - il veut une véritable petite musique d'ambiance
// instrumentale (calme, posée, mélodique, discrète), ni un drone statique
// ni des sons ponctuels noyés dans le silence. Nouvelle approche générative
// à deux couches, jouées en continu tant que la musique est activée :
//
//  1) Une NAPPE (pad) harmonique de fond, très douce, faite de 3 notes
//     tenues (accord) qui changent lentement (progression Am -> F -> C ->
//     G -> Am, un cycle mineur cohérent avec l'atmosphère du jeu) toutes
//     les 45-75s, avec un fondu enchaîné de plusieurs secondes entre deux
//     accords - jamais un accord figé indéfiniment, jamais de coupure nette.
//  2) Une MÉLODIE générative éparse par-dessus, une note (parfois deux)
//     piochée dans la même gamme toutes les 3 à 9 secondes environ - assez
//     fréquent pour qu'on entende une vraie ligne mélodique qui bouge, pas
//     des notes isolées séparées par de longs silences.
// Chaque note (mélodie) et chaque accord (nappe) varie en timbre/durée/
// volume pour qu'aucune boucle identique ne soit perceptible, même en
// jouant longtemps. Le tout reste nettement plus discret que les effets
// sonores (crêtes de volume volontairement plus basses, voir plus bas) et
// filtré (passe-bas légèrement modulé, comme une respiration lente) pour
// ne jamais prendre le dessus sur le gameplay.
//
// Registre choisi (174-392Hz) : reste dans la zone déjà validée audible sur
// haut-parleur de téléphone en V4.2 (mesuré par rendu hors-ligne + filtre
// passe-haut 200Hz, corrigé par un décalage de deux octaves depuis le
// registre grave d'origine 55-82Hz).
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
let melodyTimer = null;
let chordTimer = null;
let filterLfo = null;
let currentPad = null; // { gain, oscs } - accord actuellement audible

function ensureContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  return ctx;
}

// Progression d'accords mineurs cohérente (i - VI - III - VII en La mineur),
// lente et cyclique - jamais un accord figé indéfiniment, jamais de
// dissonance surprenante. Fréquences dans le registre validé audible
// (174-392Hz, voir en-tête de fichier).
const CHORDS = [
  [220.0, 261.63, 329.63], // Am : A3 C4 E4
  [174.61, 220.0, 261.63], // F  : F3 A3 C4
  [261.63, 329.63, 392.0], // C  : C4 E4 G4
  [196.0, 246.94, 293.66] // G  : G3 B3 D4
];

// Gamme de La mineur naturel utilisée par la mélodie générative - couvre le
// même registre que les accords ci-dessus, pour rester harmoniquement
// cohérent avec la nappe à tout instant (aucune note de mélodie n'est
// jamais dissonante avec l'accord tenu, par construction).
const MELODY_SCALE = [174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0];

let chordIndex = -1;

function createPad(freqs, startTime) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.connect(musicFilter);
  const oscs = freqs.map((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(startTime);
    return osc;
  });
  return { gain, oscs };
}

function stopPad(pad, atTime) {
  pad.oscs.forEach((osc) => osc.stop(atTime + 0.05));
}

// Fondu enchaîné entre l'accord actuel et le suivant de la progression -
// jamais de coupure nette ni de changement audible d'un bloc à l'autre.
const PAD_PEAK = 0.045; // délibérément plus bas que la mélodie et très en dessous des effets sonores (0.12-0.18)
const CHORD_CROSSFADE_S = 5;

function crossfadeToNextChord() {
  if (!musicStarted || !ctx) return;
  chordIndex = (chordIndex + 1) % CHORDS.length;
  const now = ctx.currentTime;
  const nextPad = createPad(CHORDS[chordIndex], now);
  nextPad.gain.gain.linearRampToValueAtTime(PAD_PEAK, now + CHORD_CROSSFADE_S);

  if (currentPad) {
    const oldPad = currentPad;
    oldPad.gain.gain.linearRampToValueAtTime(0, now + CHORD_CROSSFADE_S);
    stopPad(oldPad, now + CHORD_CROSSFADE_S);
  }
  currentPad = nextPad;

  const nextChangeMs = 45000 + Math.random() * 30000; // 45-75s : lent, jamais rythmique
  chordTimer = setTimeout(crossfadeToNextChord, nextChangeMs);
}

function playMelodyNote(now, freq) {
  const type = Math.random() < 0.6 ? 'sine' : 'triangle';
  const duration = 1.6 + Math.random() * 1.8; // 1.6 à 3.4s : une vraie respiration mélodique
  const peak = 0.06 + Math.random() * 0.05; // au-dessus de la nappe, sous les effets sonores
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.3); // attaque douce, jamais percussive
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(musicFilter);
  osc.start(now);
  osc.stop(now + duration + 0.1);
}

// Mélodie générative éparse (esprit "ambient génératif", à la Brian Eno) :
// une note (parfois deux, 1 fois sur 4, en petit intervalle mélodique) toutes
// les 3 à 9 secondes environ - assez fréquent pour former une vraie ligne
// mélodique continue à l'oreille, jamais des notes isolées noyées dans un
// grand silence, et jamais deux passages consécutifs identiques (note,
// timbre, durée et volume varient à chaque fois).
function scheduleMelodyEvent() {
  if (!musicStarted || !ctx) return;
  const now = ctx.currentTime;
  const noteIndex = Math.floor(Math.random() * MELODY_SCALE.length);
  playMelodyNote(now, MELODY_SCALE[noteIndex]);
  if (Math.random() < 0.25) {
    // Une deuxième note voisine dans la gamme (petit mouvement mélodique),
    // jamais un grand saut - reste posé.
    const step = Math.random() < 0.5 ? 1 : -1;
    const secondIndex = Math.min(MELODY_SCALE.length - 1, Math.max(0, noteIndex + step));
    playMelodyNote(now + 0.5 + Math.random() * 0.4, MELODY_SCALE[secondIndex]);
  }
  const gapMs = 3000 + Math.random() * 6000; // 3-9s : présence mélodique continue, pas des îlots isolés
  melodyTimer = setTimeout(scheduleMelodyEvent, gapMs);
}

function startMusicGraph() {
  if (!ctx || musicStarted) return;
  musicStarted = true;

  const master = ctx.createGain();
  master.gain.value = 1; // le volume réel est porté par chaque couche (pad/mélodie), pas par ce gain global
  master.connect(ctx.destination);
  masterMusicGain = master;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 950;
  filter.connect(master);
  musicFilter = filter;

  // Légère respiration du filtre (mouvement très lent du timbre, ~28s de
  // période) pour que la nappe ne sonne jamais complètement statique même
  // pendant un accord tenu.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 1 / 28;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();
  filterLfo = lfo;

  // Premier accord immédiat (fondu d'entrée doux) puis mélodie après un
  // court délai, pour ne pas tout faire démarrer d'un coup au clic de
  // déverrouillage.
  chordIndex = -1;
  currentPad = null;
  crossfadeToNextChord();
  melodyTimer = setTimeout(scheduleMelodyEvent, 4000 + Math.random() * 3000);
}

function stopMusicGraph() {
  if (!musicStarted) return;
  musicStarted = false;
  if (melodyTimer) clearTimeout(melodyTimer);
  if (chordTimer) clearTimeout(chordTimer);
  melodyTimer = null;
  chordTimer = null;
  if (filterLfo) {
    try {
      filterLfo.stop();
    } catch (e) {
      // déjà arrêté - sans conséquence
    }
  }
  filterLfo = null;
  currentPad = null;
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
