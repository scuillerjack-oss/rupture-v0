# RUPTURE — Projet 3, V3

Simulation de stratégie : le joueur pilote une Anomalie abstraite qui se répand sur un réseau de 18 territoires fictifs, face à une Humanité qui détecte, mobilise et finit par tenter de la maîtriser. Course symétrique à 100 % des deux côtés — voir la section « Boucle de jeu » plus bas.

Ce projet est indépendant de MURPHY et FRONTIÈRES : aucun code ni asset partagé.

## Stack

- JavaScript vanilla (ES modules), sans framework UI.
- Bundler : [Vite](https://vitejs.dev/).
- Rendu de la carte : SVG (graphe de nœuds/routes, pas de carte géographique réaliste).
- Persistance : `localStorage`.
- PWA : `manifest.webmanifest` + service worker (cache runtime), installable sur écran d'accueil Android.
- Hébergement : GitHub Pages, déploiement automatique via GitHub Actions à chaque push sur `main`.

## Structure

```
src/
  engine/
    territories.js   territoires + graphe de connectivité
    balance.js        constantes de gameplay (croissance, coûts, seuils, phases de Réponse)
    state.js           état initial, démarrage de partie, choix d'origine
    simulation.js      boucle de simulation (tick), achats d'améliorations
    migrations.js      registre de migrations de sauvegarde entre versions
  ui/
    map.js             rendu SVG de la carte
    hud.js              ressources, vitesse/pause, améliorations, panneaux Région/Monde
    screens.js          assemblage des écrans (menu, difficulté, choix origine, jeu, fin)
  services/            interfaces Premium/Publicité/Analytics (adaptateurs no-op)
  config/runtime.js    configuration centralisée dev/bêta/commercial
  save.js               sauvegarde/chargement localStorage
  main.js                boucle principale, gestion des événements, rendu
public/
  manifest.webmanifest, icons/, sw.js
tests/
  state.test.js, simulation.test.js, save.test.js, migrations.test.js,
  services.test.js, hud.test.js   suite node:test
scripts/simulate-balance.mjs      batterie de simulations multi-stratégies
.github/workflows/deploy.yml      tests + build + déploiement GitHub Pages
```

## Architecture et trajectoire commerciale

- `docs/ARCHITECTURE.md` — séparation jeu / services, configuration
  centralisée, migrations de sauvegarde.
- `docs/TRAJECTOIRE_COMMERCIALE.md` — trajectoire PWA → bêta → monétisation →
  Android/Google Play → publication, et ce qui reste à décider.

## Développement local

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

Suite basée sur `node:test` (aucune dépendance externe), exécutée avant chaque build en CI. Couvre : initialisation, propagation, économie d'Influence, achats d'améliorations (4 branches) et leurs limites, réactions locales et mondiales, suppression active une fois l'Humanité mobilisée, victoire, défaite, filet de sécurité anti-boucle infinie, sauvegarde/reprise et rejet propre d'une sauvegarde d'une version différente, nouvelle partie sans contamination de l'ancienne, invariants numériques (pas de NaN/valeur négative/hors bornes), et plusieurs simulations Monte-Carlo comparant stratégies naïves et réfléchies sur les 18 origines.

```bash
npm run simulate
```

Rejoue une batterie de ~180 parties (10 stratégies × 18 origines, dont plusieurs délibérément mauvaises/naïves) et écrit `docs/v3-simulation-results.json`.

## Build de production

```bash
npm run build
npm run preview
```

## Déploiement

Le déploiement est automatique sur push vers `main` (voir `.github/workflows/deploy.yml`). Prérequis unique côté GitHub : activer Pages sur ce dépôt avec la source **GitHub Actions** (Settings → Pages → Build and deployment → Source : GitHub Actions).

URL stable une fois activé : `https://<owner>.github.io/rupture-v0/`.

## Boucle de jeu (V3)

1. Nouvelle partie → choix explicite de la difficulté (Facile/Normal/Difficile), puis du territoire d'origine sur la carte.
2. L'Anomalie se répand le long des routes ouvertes, selon la connectivité et quatre orientations : **Propagation** (étend la portée, rend plus visible), **Dangerosité** (convertit cette portée en progression réelle, alarme fortement le monde), **Résilience** (indispensable pour résister une fois l'Humanité mobilisée), **Discrétion** (retarde la réaction du monde, au prix d'un peu d'Influence).
3. Chaque territoire développe une conscience de la crise et un confinement local ; l'Humanité construit une **Réponse mondiale** (Ignorance → Conscience → Mobilisation → Contre-mesures → Maîtrise) qui, une fois suffisamment mobilisée, repousse activement l'Anomalie — la Résilience atténue cette érosion sans jamais l'annuler.
4. Victoire : la progression réelle de l'Anomalie (portée pondérée par la Dangerosité, jamais la seule étendue brute) atteint 100 %.
5. Défaite : la Réponse mondiale atteint 100 % avant (ou filet de sécurité si aucun des deux seuils n'est atteint avant `maxDays`).
6. Sauvegarde locale automatique à chaque action et chaque tick ; reprise possible depuis le menu. Un menu en cours de partie (☰) permet de reprendre, recommencer (avec confirmation) ou changer de paramètres sans perdre la partie en cours tant que rien n'est confirmé.
7. L'écran de fin et la vue Monde (onglet à côté de la vue Région) indiquent explicitement où en est la course des deux côtés.

## Note d'équilibrage (pré-équilibrage technique, pas définitif)

Sans aucune amélioration achetée, la partie est perdue de façon fiable depuis n'importe quelle origine (vérifié par simulation Monte-Carlo automatisée). Au-delà de ce constat de base, l'objectif explicite de la V3 est que la RÉPARTITION et le SÉQUENÇAGE des achats comptent au moins autant que leur volume : Propagation seule ne suffit plus à gagner, négliger totalement la Résilience devient risqué une fois l'Humanité mobilisée, et rusher la Dangerosité avant d'être prêt peut provoquer une réaction mondiale dangereuse. Voir `docs/v3-simulation-results.json` et le rapport technique V3 pour les taux de victoire mesurés par stratégie — c'est aussi le point précis que la prochaine bêta humaine devra confirmer ou contredire.

## Rapports techniques

Voir `docs/RUPTURE_V*_Rapport_Technique_Officiel.pdf` pour l'état détaillé fait/testé/déployé de chaque version, et `docs/RUPTURE_Architecture_Rapport_Technique_Officiel.pdf` pour la préparation à la publication future.
