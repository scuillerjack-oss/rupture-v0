// Registre unique des conseils contextuels (onboarding progressif) : chaque
// entrée est affichée en popup la première fois que sa mécanique est
// réellement rencontrée (voir main.js pour les déclencheurs précis), et
// reste consultable à tout moment depuis "Comment jouer ?" (renderHelp,
// ui/screens.js) - un seul texte source, jamais deux versions qui
// pourraient diverger avec le temps.
export const TIPS = {
  influence: {
    title: 'Influence',
    body: "Votre ressource. Gagnée automatiquement selon la gravité de la crise dans vos régions. Dépensez-la pour développer l'Anomalie."
  },
  propagation: {
    title: 'Propagation',
    body: 'Accélère la diffusion vers les régions voisines. Vous rend aussi plus visible.'
  },
  dangerosity: {
    title: 'Dangerosité',
    body: "Transforme votre étendue en réelle progression (ce qui compte pour la victoire) — mais alarme fortement le monde."
  },
  resilience: {
    title: 'Résilience',
    body: "Vous aide à résister une fois que l'Humanité mobilise sa Réponse mondiale contre vous."
  },
  discretion: {
    title: 'Discrétion',
    body: "Retarde la prise de conscience du monde, au prix d'un peu d'Influence en moins."
  },
  worldResponse: {
    title: 'Réponse mondiale',
    body: "L'Humanité commence à réagir. Conscience mesure ce qu'elle comprend ; Réponse mesure ce qu'elle fait concrètement contre vous — à 100%, c'est la défaite."
  }
};

export const TIP_ORDER = ['influence', 'propagation', 'dangerosity', 'resilience', 'discretion', 'worldResponse'];
