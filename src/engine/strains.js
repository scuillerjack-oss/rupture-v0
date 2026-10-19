// V7 : souches. Pas de nouveau système : chaque souche n'est qu'un jeu de
// multiplicateurs appliqués aux constantes de BALANCE pendant le tick (voir
// simulation.js). Débloquées par les étoiles gagnées (voir meta.js).
export const STRAINS = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'L’Anomalie telle qu’on la connaît. Aucun bonus, aucun défaut.',
    unlockStars: 0,
    mods: {}
  },
  {
    id: 'rumeur',
    label: 'Rumeur',
    description: 'Se propage beaucoup plus vite d’une région à l’autre, mais attire aussi l’attention plus tôt.',
    unlockStars: 3,
    mods: { spread: 1.2, awareness: 1.12 }
  },
  {
    id: 'fracture',
    label: 'Fracture',
    description: 'Les régions touchées s’aggravent plus vite, mais chaque crise grave alarme davantage le monde.',
    unlockStars: 8,
    mods: { growth: 1.15, dangerosityBleed: 1.25 }
  },
  {
    id: 'echo',
    label: 'Écho',
    description: 'Les bulles d’Influence valent bien plus, mais le revenu passif baisse : il faut toucher la carte.',
    unlockStars: 15,
    mods: { bubbleValue: 1.35, income: 0.85 }
  }
];

export function getStrain(id) {
  return STRAINS.find((s) => s.id === id) ?? STRAINS[0];
}

// Multiplicateur de la souche active pour une clé donnée (1 par défaut).
export function strainMod(state, key) {
  const value = getStrain(state?.strain).mods[key];
  return typeof value === 'number' ? value : 1;
}
