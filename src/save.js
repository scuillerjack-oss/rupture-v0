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

// Persisté à vie sur l'appareil (jamais réinitialisé par une simple
// fermeture d'app) : sert uniquement à garantir qu'aucune publicité
// n'apparaît jamais autour de la toute première partie réellement terminée
// par ce joueur - voir services/ads.js et l'audit économique.
const FIRST_GAME_DONE_KEY = 'rupture-v0-first-game-done';

export function hasCompletedFirstGame() {
  try {
    return localStorage.getItem(FIRST_GAME_DONE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function markFirstGameCompleted() {
  try {
    localStorage.setItem(FIRST_GAME_DONE_KEY, '1');
  } catch (e) {
    console.warn('Impossible de mémoriser la fin de la première partie', e);
  }
}

// Conseils contextuels (onboarding progressif, voir ui/tips.js et main.js) :
// chaque conseil n'est affiché QU'UNE SEULE FOIS, la première fois que le
// joueur rencontre réellement la mécanique concernée - mémorisé
// indépendamment de la sauvegarde de partie, comme hasSeenTutorial ci-dessus
// (une nouvelle partie ne doit jamais refaire découvrir un conseil déjà vu).
// resetTips() permet volontairement de tout redéclencher (bouton
// Paramètres), pour un joueur qui voudrait revoir la progression complète.
const TIPS_SEEN_KEY = 'rupture-v0-tips-seen';

function readSeenTips() {
  try {
    const raw = localStorage.getItem(TIPS_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function hasSeenTip(id) {
  return Boolean(readSeenTips()[id]);
}

export function markTipSeen(id) {
  try {
    const seen = readSeenTips();
    seen[id] = true;
    localStorage.setItem(TIPS_SEEN_KEY, JSON.stringify(seen));
  } catch (e) {
    console.warn('Impossible de mémoriser le conseil vu', e);
  }
}

export function resetTips() {
  try {
    localStorage.removeItem(TIPS_SEEN_KEY);
  } catch (e) {
    console.warn('Impossible de réinitialiser les conseils', e);
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

const MUSIC_KEY = 'rupture-v0-music';
const SFX_KEY = 'rupture-v0-sfx';

// Musique et effets sonores sont activés par défaut (silencieux uniquement
// si le joueur les désactive explicitement), et persistent indépendamment
// l'un de l'autre - voir src/audio/audio.js.
export function getMusicSetting() {
  try {
    return localStorage.getItem(MUSIC_KEY) !== '0';
  } catch (e) {
    return true;
  }
}

export function setMusicSetting(enabled) {
  try {
    localStorage.setItem(MUSIC_KEY, enabled ? '1' : '0');
  } catch (e) {
    console.warn('Impossible de mémoriser le réglage de musique', e);
  }
}

export function getSfxSetting() {
  try {
    return localStorage.getItem(SFX_KEY) !== '0';
  } catch (e) {
    return true;
  }
}

export function setSfxSetting(enabled) {
  try {
    localStorage.setItem(SFX_KEY, enabled ? '1' : '0');
  } catch (e) {
    console.warn('Impossible de mémoriser le réglage des effets sonores', e);
  }
}

// Indicateur Premium local (voir src/services/premium.js). AUCUN achat réel
// n'est vérifié ici : c'est un cache local rapide, jamais une preuve
// d'achat. `PREMIUM_SOURCE_KEY` documente explicitement l'origine de ce
// cache, pour ne jamais confondre une valeur simulée avec une valeur
// réellement vérifiée par une plateforme (Play Billing) le jour où celle-ci
// sera connectée - voir docs/RUPTURE_Rapport_Technique_Final.pdf, section
// sécurité de la monétisation.
const PREMIUM_KEY = 'rupture-v0-premium';
const PREMIUM_SOURCE_KEY = 'rupture-v0-premium-source';

export function getPremiumFlag() {
  try {
    return localStorage.getItem(PREMIUM_KEY) === '1';
  } catch (e) {
    return false;
  }
}

// source : 'simulated-test' (dev/bêta, aucune plateforme réelle impliquée)
// ou 'store-verified' (réservé à une future intégration réelle - jamais
// écrit par le code actuel). Toujours interroger cette valeur avant de
// traiter isPremium() comme autre chose qu'un cache d'affichage.
export function setPremiumFlag(value, source = 'simulated-test') {
  try {
    if (value) {
      localStorage.setItem(PREMIUM_KEY, '1');
      localStorage.setItem(PREMIUM_SOURCE_KEY, source);
    } else {
      localStorage.removeItem(PREMIUM_KEY);
      localStorage.removeItem(PREMIUM_SOURCE_KEY);
    }
  } catch (e) {
    console.warn('Impossible de mémoriser le statut Premium', e);
  }
}

export function getPremiumSource() {
  try {
    return localStorage.getItem(PREMIUM_SOURCE_KEY) || null;
  } catch (e) {
    return null;
  }
}

// Journal minimal d'anomalies de monétisation (diagnostic uniquement, voir
// §6/§7 de la demande de finalisation) : jamais utilisé pour bloquer quoi
// que ce soit côté client (un journal local n'est pas une protection), mais
// permet de repérer après coup un état incohérent (ex. Premium actif sans
// source connue) pendant les bêtas et après publication. Anneau borné :
// jamais plus de 20 entrées, pour rester un diagnostic léger, pas un
// stockage illimité.
const SECURITY_LOG_KEY = 'rupture-v0-security-log';
const SECURITY_LOG_MAX = 20;

export function logSecurityEvent(type, details = {}) {
  try {
    const raw = localStorage.getItem(SECURITY_LOG_KEY);
    const log = raw ? JSON.parse(raw) : [];
    log.push({ type, details, at: new Date().toISOString() });
    while (log.length > SECURITY_LOG_MAX) log.shift();
    localStorage.setItem(SECURITY_LOG_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn('Journalisation de sécurité impossible', e);
  }
}

export function getSecurityLog() {
  try {
    const raw = localStorage.getItem(SECURITY_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// --- V7 : méta-progression locale (étoiles, records, souches) et défi du jour ---
// Tout reste sur le téléphone (aucun serveur). La FORME de la méta appartient
// au moteur (src/engine/meta.js : createMeta/recordGame) ; ce fichier ne fait
// que la stocker et la relire. Clés nouvelles : les clés V6 ci-dessus ne
// changent pas.
const META_KEY = 'rupture-v7-meta';
const DAILY_KEY = 'rupture-v7-daily';
const STRAIN_KEY = 'rupture-v7-strain';

export function loadMeta(createDefault = () => ({ totalStars: 0, games: 0, records: {} })) {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return createDefault();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : createDefault();
  } catch (e) {
    return createDefault();
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    return true;
  } catch (e) {
    console.warn('Impossible de mémoriser la progression', e);
    return false;
  }
}

export function getStrainSetting() {
  try {
    return localStorage.getItem(STRAIN_KEY) || 'standard';
  } catch (e) {
    return 'standard';
  }
}

export function setStrainSetting(strainId) {
  try {
    localStorage.setItem(STRAIN_KEY, strainId);
  } catch (e) {
    console.warn('Impossible de mémoriser la souche choisie', e);
  }
}

function readDaily() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

// Record personnel du défi du jour `seed` ('AAAA-MM-JJ') :
// { played, won, bestStars, bestDay } ou null s'il n'a jamais été joué.
export function getDailyRecord(seed) {
  return readDaily()[seed] ?? null;
}

// Enregistre une partie du défi du jour ; renvoie { record, newRecord }.
// Seuls les 14 derniers jours sont gardés (stockage borné).
export function recordDailyResult(seed, { won, stars = 0, day }) {
  const all = readDaily();
  const prev = all[seed] ?? { played: 0, won: false, bestStars: 0, bestDay: null };
  const fasterWin = Boolean(won) && (prev.bestDay === null || day < prev.bestDay);
  const newRecord = Boolean(won) && (fasterWin || stars > prev.bestStars);
  const record = {
    played: prev.played + 1,
    won: prev.won || Boolean(won),
    bestStars: Math.max(prev.bestStars, won ? stars : 0),
    bestDay: fasterWin ? day : prev.bestDay
  };
  all[seed] = record;
  const keys = Object.keys(all).sort();
  while (keys.length > 14) delete all[keys.shift()];
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Impossible de mémoriser le défi du jour', e);
  }
  return { record, newRecord };
}
