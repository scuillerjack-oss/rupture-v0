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
  },
  // V7 : nouvelles mécaniques (cahier des charges §3.B/§3.C).
  bubbles: {
    title: 'Bulles',
    body: "Touche les bulles sur la carte avant qu'elles ne disparaissent : rouge = Influence gagnée, bleue = recherche humaine sabotée (Réponse −1). Une bonne partie de ton Influence passe par elles."
  },
  abilities: {
    title: 'Capacités',
    body: "Sursaut, Brouillage et Percée se paient en Influence puis se rechargent. Touche une capacité, puis sa cible sur la carte (« Annuler » si tu changes d'avis). Le temps est en pause pendant que tu vises."
  },
  gravityWall: {
    title: 'Mur de gravité',
    body: "Ta progression plafonne : tes régions sont au maximum de gravité permis par ta Dangerosité. Monte Dangerosité (niveau 8 pour la gravité complète) pour repartir."
  },
  events: {
    title: 'Événements',
    body: "Le monde t'impose parfois un choix entre deux options. Le temps s'arrête jusqu'à ta décision : lis l'effet de chaque option avant de toucher."
  }
};

export const TIP_ORDER = ['influence', 'propagation', 'dangerosity', 'resilience', 'discretion', 'worldResponse', 'bubbles', 'abilities', 'gravityWall', 'events'];
