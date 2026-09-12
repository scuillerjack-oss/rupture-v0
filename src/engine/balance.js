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
  influenceGainFactor: 0.09,
  victoryDominanceThreshold: 75,
  defeatContainmentThreshold: 100,
  maxDays: 400,
  upgrades: {
    propagation: {
      label: 'Propagation',
      description: 'Augmente la vitesse de propagation vers les territoires voisins.',
      maxLevel: 5,
      baseCost: 18,
      costGrowth: 1.6,
      effectPerLevel: 0.75
    },
    resilience: {
      label: 'Résilience',
      description: "Réduit l'effet freinateur du confinement local sur la crise.",
      maxLevel: 5,
      baseCost: 20,
      costGrowth: 1.6,
      effectPerLevel: 0.45
    },
    discretion: {
      label: 'Discrétion',
      description: "Ralentit la prise de conscience mondiale et les fermetures de routes.",
      maxLevel: 5,
      baseCost: 20,
      costGrowth: 1.6,
      effectPerLevel: 0.42
    }
  }
};

export function upgradeCost(kind, currentLevel) {
  const cfg = BALANCE.upgrades[kind];
  return Math.round(cfg.baseCost * Math.pow(cfg.costGrowth, currentLevel));
}
