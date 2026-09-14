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
  // V4 (§1) : relevé de 0.62 à 1.15 pour compenser la tension qui monte plus
  // vite (voir tension.power ci-dessus) - cette source fond d'elle-même à
  // mesure que la tension augmente (clamp(1-tension,0,1)), donc l'augmenter
  // ici ne gonfle QUE le tout début de partie, jamais l'économie de fin de
  // partie (qui reste gouvernée par influenceGainFactor, inchangé). Calibré
  // par simulation (pas choisi a priori) : la valeur la plus basse qui
  // rétablit un budget suffisant sans transformer une stratégie naïve ou
  // délibérément mauvaise en stratégie gagnante - voir le rapport V4 pour
  // le balayage complet (une compensation trop généreuse fait gagner
  // TOUTES les stratégies, y compris les mauvaises, en quelques crans).
  earlyInfluenceTrickle: 1.15,
  // V6 (chantier A, audit approfondi - voir docs/v6-influence-cap-audit.json
  // et scripts/audit-influence-cap.mjs) : relevé de 150 à 200. Le
  // commentaire d'origine (V1->V2) présentait ce plafond comme LA protection
  // anti-cheese contre "négliger 500 jours puis tout dépenser d'un coup" -
  // mesuré comme FAUX dans le moteur actuel : ce pattern reste à 0 victoire
  // sur 90 essais (18 origines x 5 essais) à TOUTE valeur de cap testée, y
  // compris 300/500/1000/Infinity - la vraie protection est désormais
  // ailleurs (croissance de crise non proportionnelle au temps déjà passé,
  // plafond de gravité fermé sans Dangerosité investie, réaction
  // Conscience/Mobilisation qui rattrape un pic tardif de Dangerosité avant
  // que la crise n'ait le temps de monter - voir simulation.js). Le cap à
  // 150 avait en revanche un effet secondaire jamais mesuré jusqu'ici : une
  // épargne délibérée et raisonnable de 150 jours avant de pivoter vers une
  // stratégie cohérente tombait à 0% de victoires (contre ~78% pour la même
  // stratégie sans délai), un résultat directement contraire à l'intention
  // du design ("épargne légitime puis pivot" doit rester viable). Testé par
  // pas de 25 de 150 à 300 : le taux de victoire de ce pivot légitime saute
  // de 0% à ~48-59% dès que le cap dépasse 150, sans gain supplémentaire net
  // au-delà de 200 (plateau bruité 50-59% jusqu'à 300). 200 est donc la
  // valeur la plus basse qui corrige la zone morte identifiée, sans changer
  // la hiérarchie des 14 stratégies déjà validées (batterie complète
  // rejouée à 150 vs 200, 18 origines x 3 difficultés : tous les écarts
  // observés sont dans le bruit d'une seule partie par origine, ±1-2
  // parties sur 18, jamais une bascule "tout le monde gagne" comme les
  // falaises déjà documentées en V4.1/V4.2) et sans transformer le hoarding
  // dégénéré en stratégie viable (toujours 0/90 à cap=200, y compris pour un
  // dump encore plus tardif, jour 700).
  influenceCap: 200,
  // V3 : course symétrique Anomalie 100 / Humanité 100 (V2 opposait 90 à 100).
  // Voir RUPTURE_V3_Rapport_Technique_Officiel.pdf pour la justification et
  // les simulations qui ont validé le recalibrage qui l'accompagne.
  victoryDominanceThreshold: 100,
  defeatContainmentThreshold: 100,
  maxDays: 2200,
  // V4 (bêta manuelle post-V3.1, §1) : mesuré à ~774-778 jours médians toutes
  // stratégies confondues avant ce recalibrage - bien au-delà de la cible de
  // design (~450-550 jours). rampDays reste inchangé (1800) : le réduire
  // comprime TOUTE la courbe (avant ET après mobilisation) à parts égales,
  // ce qui a été mesuré casser des stratégies patientes entières (furtive
  // puis frappe tombe à 0/18) avant même de rétablir un budget d'Influence
  // suffisant - voir RUPTURE_V4_Rapport_Technique_Officiel.pdf §1. Réduire
  // seulement `power` (2.1 -> 1.3) avance la tension plus tôt SANS changer
  // où elle plafonne : cela raccourcit spécifiquement la phase calme de
  // début de partie, en laissant la fenêtre post-mobilisation quasiment
  // intacte en jours absolus - donc en croissance en proportion du temps
  // total. Combiné à earlyInfluenceTrickle (voir plus bas) pour rétablir un
  // budget d'Influence suffisant sur la durée réduite.
  //
  // V4.1 (§4) : hypothèse testée puis REJETÉE d'allonger encore vers
  // ~550-700j en retouchant `power` ou earlyInfluenceTrickle. Mesuré par
  // simulation (18 origines x 3 stratégies) : power 1.3->1.4 seul suffit à
  // faire gagner equilibree-naive (stratégie délibérément mauvaise) à 89%
  // (16/18) au lieu de 6% ; power 1.5+ fait gagner TOUTES les stratégies à
  // 100%, naïves comprises - la falaise "tout le monde gagne" déjà identifiée
  // en V4 se reproduit à l'identique. À l'inverse, earlyInfluenceTrickle
  // 1.15->1.0 fait tomber reactive-coherente (meilleure stratégie testée) à
  // 0/18 - budget d'Influence trop court pour boucler la moindre victoire.
  // Les deux leviers naturels de la durée sont donc chacun une falaise dans
  // un sens ou l'autre, sans palier intermédiaire stable trouvé au voisinage
  // de la calibration actuelle : l'économie reste au point de bascule
  // critique déjà documenté en V4. Conservé tel quel (power=1.3,
  // earlyInfluenceTrickle=1.15) plutôt que de forcer l'hypothèse au prix de
  // la hiérarchie de stratégies tout juste rétablie. Durée résultante
  // (~480-570j pour les stratégies gagnantes en Normal) légèrement sous la
  // fourchette visée mais couvre déjà les objectifs réels du §4 (fenêtre de
  // réaction, phase finale tendue) sans les symptômes qui avaient motivé
  // cette demande (voir la correction Conscience/Réponse ci-dessous, qui
  // était la vraie cause du ressenti "trop court" rapporté en bêta).
  tension: {
    min: 0.005,
    max: 1.2,
    rampDays: 1800,
    power: 1.3
  },
  // Trade-offs (V2, conservés) : les branches ne sont plus des bonus "gratuits".
  propagationAwarenessBleed: 0.4,
  discretionIncomePenalty: 0.3,
  // Trade-offs (V3, nouveaux — voir simulation.js pour leur application) :
  // une Anomalie rendue réellement dangereuse est beaucoup plus alarmante
  // qu'une Anomalie simplement répandue (dangerosityAwarenessBleed est
  // volontairement plus de deux fois supérieur à propagationAwarenessBleed).
  dangerosityAwarenessBleed: 1.6,
  // V3.1 : Dangerosité ne multiplie plus un agrégat abstrait après coup - elle
  // plafonne directement la crise que peut atteindre CHAQUE territoire. Sans
  // aucun investissement, la crise d'un territoire ne peut jamais dépasser
  // activeCeiling (elle reste "Active", jamais Sévère/Critique - voir
  // src/ui/map.js pour les seuils de couleur), quelle que soit la Propagation :
  // l'Anomalie peut se répandre partout (spreadThreshold=15 reste bien en
  // dessous du plafond) sans devenir réellement grave nulle part. Chaque
  // niveau de Dangerosité relève ce plafond linéairement jusqu'à 100 au
  // niveau maximum - voir dangerosityCapAt().
  severity: {
    activeCeiling: 45,
    // Le plafond atteint 100% dès ce niveau plutôt qu'au niveau maximum
    // (10) : les tout derniers niveaux de Dangerosité servent alors à
    // libérer de l'Influence pour les trois autres branches plutôt qu'à
    // rester un palier obligatoire supplémentaire avant de pouvoir gagner.
    fullSeverityLevel: 8
  },
  // Une fois la Réponse mondiale sérieusement engagée (au-delà de
  // mobilizationThreshold), l'Humanité referme le plafond de gravité que
  // Dangerosité avait ouvert (voir simulation.js). Négliger totalement la
  // Résilience devient réellement dangereux une fois cette phase entamée,
  // sans que la Résilience soit obligatoire avant ; y investir à fond
  // (resilienceImmunityLevel) neutralise entièrement ce resserrement -
  // seuil volontairement élevé (mais pas le niveau maximum) : un engagement
  // réel et coûteux sur une branche entière, pas un palier anodin.
  //
  // V4.1 (bêta manuelle post-V4, §2) : l'ancien responseCurvePower façonnait
  // la VITESSE à laquelle l'accumulateur interne progresse (voir
  // simulation.js: state.globalMobilization) - un mécanisme qui reste
  // nécessaire tel quel pour préserver la pression de suppression locale déjà
  // calibrée en V3.1/V4 (voir plus bas). Le vrai problème diagnostiqué était
  // ailleurs : rien ne plafonnait la VALEUR ATTEIGNABLE de la Réponse
  // affichée au joueur - un accumulateur strictement croissant finit toujours
  // par atteindre 100 avec assez de temps, même alimenté par une Conscience
  // qui plafonne loin en dessous de 100% (mesuré : la partie perdue en bêta à
  // 95% de Progression avait une Réponse à 100% sans que le monde n'ait
  // jamais pleinement compris la menace). Corrigé en ajoutant un PLAFOND sur
  // la Réponse affichée (et seule condition de défaite), gouverné par la
  // Conscience actuelle - le même principe que severity/dangerosityCapAt pour
  // la gravité par région : la Réponse peut commencer tôt
  // (responseCapBaseline > 0 dès conscience quasi nulle, l'Humanité n'attend
  // pas de tout savoir pour réagir) mais ne peut atteindre 100 - et donc
  // conclure la partie par défaite - que si la Conscience mondiale est
  // elle-même proche de 100%. voir responseCapAt() et simulation.js.
  humanity: {
    mobilizationThreshold: 15,
    maxSuppressionPerTick: 0.25,
    resilienceImmunityLevel: 8,
    responseCurvePower: 1.6,
    // V5.2 (audit bêta post-V5.1, défaite jour 532, Dangerosité 10, Résilience
    // 0, Progression bloquée à 98% max) : suppressionRate dépendait de
    // mobilizationProgress de façon INSTANTANÉE - une bascule tardive vers
    // Dangerosité maximale (dangerosityAwarenessBleed=1.6) fait bondir la
    // Conscience puis `globalMobilization` en quelques dizaines de jours,
    // convertissant la pression de suppression en plafond fermé presque
    // aussi vite que le nouveau plafond ouvert par Dangerosité, sans jamais
    // laisser de fenêtre réelle pour que la crise grimpe jusqu'à ce plafond.
    // suppressionInertiaRate donne à la pression EFFECTIVE (state.
    // suppressionPressure) une vraie inertie face à mobilizationProgress
    // (calculé instantanément) - même principe que ts.containment qui
    // rattrape ts.awareness progressivement (voir simulation.js), pas une
    // nouvelle mécanique inventée. Calibré par simulation (pas choisi a
    // priori) : suffisamment lent pour laisser une fenêtre réelle à une
    // implantation mondiale déjà massive (18/18 critiques) de convertir un
    // pic de Dangerosité tardif en victoire AVANT que la suppression ne
    // referme le plafond, mais pas au point de rendre la Résilience
    // superflue ni de garantir la victoire - voir le rapport V5.2 pour le
    // balayage de valeurs testées.
    suppressionInertiaRate: 0.015,

    // responseCapBaseline/fullConscienceLevel/responseCapPower : calibrés par
    // simulation (234+ runs, plusieurs familles de stratégies), pas choisis a
    // priori. La Conscience moyenne réelle n'atteint jamais littéralement
    // 100% en pratique (elle poursuit un plafond de crise par territoire qui
    // peut lui-même rester suppimé) - un plafond de Réponse qui n'ouvrirait
    // qu'à Conscience=100% exactement rendrait la défaite par Réponse
    // totalement inatteignable, quelle que soit la stratégie (mesuré : 0/162
    // défaites par Réponse sur toute la batterie à fullConscienceLevel=1,
    // y compris pour les pires stratégies). fullConscienceLevel=0.7 reprend
    // le même principe que severity.fullSeverityLevel : un seuil élevé mais
    // réellement atteignable (70% de Conscience, pas 100%) au-delà duquel la
    // Réponse peut se conclure pleinement. Vérifié : toute défaite par
    // Réponse mesurée se produit à Conscience >= 70% (jamais en dessous),
    // corrigeant directement le cas rapporté en bêta (défaite à 95% de
    // Progression / 100% de Réponse avec une Conscience très incomplète).
    responseCapBaseline: 25,
    fullConscienceLevel: 0.7,
    responseCapPower: 2
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
      // V4.2 (bêta manuelle post-V4.1, défaite jour 581, Résilience Niv.5/10,
      // 99% de Progression max contre 100% de Réponse) : demande explicite de
      // faire en sorte que développer la Résilience ralentisse mesurablement
      // la Réponse/mobilisation, calibrée par simulation. QUATRE hypothèses
      // ont été conçues et testées avec la même rigueur (moyennées sur 5
      // essais x 18 origines = 90 parties par valeur, pas un seul run, pour
      // écarter le bruit des fermetures de routes aléatoires) ; TOUTES ont
      // été REJETÉES - voir le rapport V4.2 pour le détail complet des
      // mesures :
      //  1) ralentir la croissance de globalMobilization proportionnellement
      //     à la Résilience (dès le début de partie, puis seulement après le
      //     seuil de mobilisation, puis seulement après des seuils encore
      //     plus tardifs jusqu'à 85%) : dans TOUS les cas, dès 10-15% de
      //     plafond de ralentissement, une ou plusieurs stratégies
      //     auparavant perdantes (dont equilibree-naive, non réactive)
      //     basculent à 90-100% de victoires ;
      //  2) abaisser resilienceImmunityLevel (immunité totale au resserrement
      //     du plafond de gravité atteinte plus tôt) : dès 7 au lieu de 8,
      //     equilibree-naive passe de 6% à 72% ;
      //  3) plafonner resilienceEffectForSuppression en dessous de 100%
      //     (jamais d'immunité totale) : falaise inverse - TOUTES les
      //     stratégies, y compris réactive-cohérente (78%), tombent à 0% ;
      //  4) une petite marge sur le SEUIL DE VICTOIRE (Progression) plutôt
      //     que sur la Réponse : dès 2 points de marge au niveau maximum,
      //     equilibree-naive passe de 5,6% à 94,4% et réactive-cohérente
      //     atteint 100% - la même falaise, côté opposé de la course.
      // Un cinquième essai (relever effectPerLevel, qui n'agit que sur la
      // résistance locale au confinement - croissance/propagation, jamais
      // sur la course Réponse/Progression elle-même) ne produit AUCUNE
      // falaise, mais aussi AUCUN effet mesurable une fois correctement
      // échantillonné (90 parties/valeur) : furtive-puis-frappe reste entre
      // 35% et 41% de 0,225 à 0,50, sans tendance - un premier relevé
      // ponctuel (un seul run) avait suggéré un effet réel (28%->50%), qui
      // s'est révélé être du bruit statistique en le remesurant proprement.
      // Conclusion documentée plutôt que forcée (conformément à la consigne
      // explicite de la demande) : la course Réponse/Progression de cette
      // version repose sur une marge extrêmement étroite pour de nombreuses
      // stratégies simultanément - un point de bascule net, pas une marge
      // progressive, quel que soit le côté de la course touché. Aucun levier
      // sûr ET réellement efficace n'a été trouvé cette passe. effectPerLevel
      // reste donc inchangé (0,225, valeur V4.1) plutôt que de porter un
      // changement sans bénéfice mesurable.
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
      description: "Permet aux régions où l'Anomalie est présente de devenir réellement graves (Sévères puis Critiques), au lieu de rester simplement actives — mais l'expose beaucoup plus vite au regard du monde.",
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
//
// V4.1 (§5) : revérifié avec le mécanisme Conscience/Réponse corrigé, sur
// toute la batterie (docs/v4.1-simulation-results.json). Ce seul levier
// suffit à produire une hiérarchie réelle et honnête, sans nouveau
// paramètre : Facile pardonne le jeu naïf (equilibree-naive 94%,
// furtive-puis-frappe 44%, reactive-coherente 100%) ; Normal reste la
// référence (equilibree-naive 6%, furtive-puis-frappe 39%,
// reactive-coherente 78%) ; Difficile punit franchement sans être
// mathématiquement impossible (equilibree-naive et furtive-puis-frappe à
// 0%, mais reactive-coherente conserve 44% - une stratégie maîtrisée garde
// une vraie chance). Aucune des trois difficultés ne produit de résultats
// quasi identiques aux deux autres.
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

// Plafond de crise atteignable par un territoire pour un niveau de
// Dangerosité donné : activeCeiling (aucun investissement) jusqu'à 100 (niveau
// maximum), linéairement. Exportée pour que le HUD affiche la traduction
// réelle de chaque niveau (voir src/ui/hud.js) au lieu d'un chiffre inventé.
export function dangerosityCapAt(level) {
  const { activeCeiling, fullSeverityLevel } = BALANCE.severity;
  const fraction = Math.max(0, Math.min(1, level / fullSeverityLevel));
  return activeCeiling + (100 - activeCeiling) * fraction;
}

// Plafond de Réponse mondiale atteignable pour une fraction de Conscience
// moyenne donnée (0 à 1) : responseCapBaseline dès conscience quasi nulle,
// jusqu'à 100 dès que la Conscience atteint fullConscienceLevel (90%, pas
// 100% exactement - voir le commentaire sur fullConscienceLevel : la
// Conscience moyenne réelle n'approche jamais littéralement 100%).
// L'exposant (>1) garde le plafond proche de sa base sur une grande partie
// de la plage - l'essentiel de l'ouverture se produit tard, rendant ce
// dernier palier perceptible plutôt qu'une simple asymptote lointaine.
// Exportée pour que le HUD puisse expliquer la mécanique (voir
// src/ui/hud.js), comme dangerosityCapAt.
export function responseCapAt(awarenessFraction) {
  const { responseCapBaseline, responseCapPower, fullConscienceLevel } = BALANCE.humanity;
  const fraction = Math.max(0, Math.min(1, awarenessFraction / fullConscienceLevel));
  return responseCapBaseline + (100 - responseCapBaseline) * Math.pow(fraction, responseCapPower);
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
