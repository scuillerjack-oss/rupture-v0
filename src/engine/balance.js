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
  victoryDominanceThreshold: 90,
  defeatContainmentThreshold: 100,
  maxDays: 2200,
  tension: {
    min: 0.005,
    max: 1.2,
    rampDays: 1800,
    power: 2.1
  },
  // Trade-offs (V2) : les branches ne sont plus des bonus "gratuits".
  // Propagation agressive rend l'Anomalie plus visible (le monde réagit plus vite) ;
  // Discrétion, en gardant l'Anomalie discrète, réduit ce qu'elle peut en tirer.
  propagationAwarenessBleed: 0.4,
  discretionIncomePenalty: 0.3,
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
      description: "Permet à l'Anomalie de mieux résister aux mesures de confinement, localement et lors de sa propagation.",
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
    }
  }
};

// Facile/Difficile ne sont volontairement pas finement calibrés : Normal reste la
// référence validée par les bêtas (661 et 698 jours). Seuls deux leviers varient,
// pour que l'architecture supporte la difficulté sans multiplier les paramètres.
export const DIFFICULTIES = {
  easy: {
    label: 'Facile',
    victoryDominanceThreshold: 85,
    globalContainmentGainFactor: 0.115
  },
  normal: {
    label: 'Normal',
    victoryDominanceThreshold: BALANCE.victoryDominanceThreshold,
    globalContainmentGainFactor: BALANCE.globalContainmentGainFactor
  },
  hard: {
    label: 'Difficile',
    victoryDominanceThreshold: 93,
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
