export const BALANCE = {
  startingCrisis: 18,
  spreadThreshold: 15,
  baseGrowthPerTick: 1.3,
  baseSpreadPerTick: 0.75,
  containmentDamping: 80,
  incomingSpreadContainmentDamping: 180,
  awarenessCatchupRate: 0.1,
  routeCloseAwarenessThreshold: 40,
  routeCloseCheckChance: 0.05,
  globalContainmentGainFactor: 0.135,
  influenceGainFactor: 0.035,
  earlyInfluenceTrickle: 0.62,
  influenceCap: 150,
  // V3 : course symétrique Anomalie 100 / Humanité 100 (V2 opposait 90 à 100).
  // Voir RUPTURE_V3_Rapport_Technique_Officiel.pdf pour la justification et
  // les simulations qui ont validé le recalibrage qui l'accompagne.
  victoryDominanceThreshold: 100,
  defeatContainmentThreshold: 100,
  maxDays: 2200,
  tension: {
    min: 0.005,
    max: 1.2,
    rampDays: 1800,
    power: 2.1
  },
  // Trade-offs (V2, conservés) : les branches ne sont plus des bonus "gratuits".
  propagationAwarenessBleed: 0.4,
  discretionIncomePenalty: 0.3,
  // Trade-offs (V3, nouveaux — voir simulation.js pour leur application) :
  // une Anomalie rendue réellement dangereuse est beaucoup plus alarmante
  // qu'une Anomalie simplement répandue (dangerosityAwarenessBleed est
  // volontairement plus de deux fois supérieur à propagationAwarenessBleed).
  dangerosityAwarenessBleed: 1.6,
  // Convertit la "portée" brute (crise pondérée par population) en progression
  // réelle vers la victoire. Sans aucun investissement en Dangerosité, cette
  // conversion plafonne à baseFactor : une Anomalie qui a touché 100% du monde
  // mais n'a jamais investi en Dangerosité ne peut PAS gagner seule. C'est le
  // mécanisme qui rend Propagation seule insuffisante (voir le rapport V3).
  severity: {
    baseFactor: 0.35
  },
  // Une fois la Réponse mondiale sérieusement engagée (au-delà de
  // mobilizationThreshold), l'Humanité commence à activement repousser
  // l'Anomalie dans chaque territoire, et pas seulement à ralentir sa
  // croissance. La Résilience atténue cette érosion (jusqu'à 80%, comme son
  // plafond usuel) mais ne l'annule jamais complètement : négliger totalement
  // la Résilience devient réellement dangereux une fois cette phase entamée,
  // sans que la Résilience soit obligatoire avant.
  humanity: {
    mobilizationThreshold: 15,
    maxSuppressionPerTick: 0.25
  },
  upgrades: {
    propagation: {
      label: 'Propagation',
      description: 'Augmente la vitesse de propagation vers les territoires voisins, mais rend aussi l’Anomalie plus visible.',
      maxLevel: 10,
      baseCost: 18,
      costGrowth: 1.1,
      effectPerLevel: 0.375
    },
    resilience: {
      label: 'Résilience',
      description: "Permet à l'Anomalie de mieux résister aux mesures de confinement, et devient essentielle une fois que l'Humanité mobilise une réponse sérieuse.",
      maxLevel: 10,
      baseCost: 20,
      costGrowth: 1.1,
      effectPerLevel: 0.225
    },
    discretion: {
      label: 'Discrétion',
      description: "Ralentit la prise de conscience mondiale et les fermetures de routes, au prix d'une Influence tirée un peu plus lentement.",
      maxLevel: 10,
      baseCost: 20,
      costGrowth: 1.1,
      effectPerLevel: 0.21
    },
    dangerosity: {
      label: 'Dangerosité',
      description: "Rend l'Anomalie réellement plus grave là où elle est déjà présente — indispensable pour transformer sa portée en une véritable victoire — mais l'expose beaucoup plus vite au regard du monde.",
      maxLevel: 10,
      baseCost: 20,
      costGrowth: 1.1,
      effectPerLevel: 0.11
    }
  }
};

// Facile/Difficile ne font varier qu'un seul levier : la vitesse à laquelle
// l'Humanité construit sa Réponse mondiale. Le seuil de victoire (100, comme
// le seuil de défaite) reste identique pour tous : c'est une course
// symétrique, seule la vitesse de l'adversaire change. Normal reste la seule
// référence finement simulée (voir le rapport V3) ; ce choix délibéré évite
// de multiplier les paramètres pour un jeu qui doit rester compact.
export const DIFFICULTIES = {
  easy: {
    label: 'Facile',
    globalContainmentGainFactor: 0.115
  },
  normal: {
    label: 'Normal',
    globalContainmentGainFactor: BALANCE.globalContainmentGainFactor
  },
  hard: {
    label: 'Difficile',
    globalContainmentGainFactor: 0.155
  }
};

export function upgradeCost(kind, currentLevel) {
  const cfg = BALANCE.upgrades[kind];
  return Math.round(cfg.baseCost * Math.pow(cfg.costGrowth, currentLevel));
}

export function tensionAt(day) {
  const { min, max, rampDays, power } = BALANCE.tension;
  const progress = Math.max(0, Math.min(1, day / rampDays));
  return min + (max - min) * Math.pow(progress, power);
}

// Étapes de la Réponse mondiale, dérivées de state.globalContainment plutôt
// que stockées séparément (moins d'état à maintenir/migrer). Purement
// descriptif pour le joueur (vue Monde, journal d'événements) ; le seuil de
// "Mobilisation" correspond exactement à humanity.mobilizationThreshold, pour
// que le journal et la mécanique de suppression racontent la même histoire.
const RESPONSE_PHASES = [
  { max: 5, key: 'ignorance', label: 'Ignorance' },
  { max: BALANCE.humanity.mobilizationThreshold, key: 'conscience', label: 'Conscience' },
  { max: 50, key: 'mobilisation', label: 'Mobilisation' },
  { max: 85, key: 'mesures', label: 'Contre-mesures actives' },
  { max: Infinity, key: 'maitrise', label: 'Maîtrise imminente' }
];

export function responsePhaseAt(globalContainment) {
  return RESPONSE_PHASES.find((phase) => globalContainment < phase.max) ?? RESPONSE_PHASES[RESPONSE_PHASES.length - 1];
}
