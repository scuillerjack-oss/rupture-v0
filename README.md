# RUPTURE — Projet 3, V0

Prototype de stratégie / simulation de crise mondiale. Le joueur pilote une anomalie abstraite qui déstabilise un réseau de 14 territoires fictifs pendant que le monde réagit (conscience, confinement local, fermetures de routes, confinement mondial).

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
    balance.js        constantes de gameplay (croissance, coûts, seuils)
    state.js           état initial, démarrage de partie, choix d'origine
    simulation.js      boucle de simulation (tick), achats d'améliorations
  ui/
    map.js             rendu SVG de la carte
    hud.js              ressources, vitesse/pause, améliorations, panneau territoire
    screens.js          assemblage des écrans (menu, choix origine, jeu, fin)
  save.js               sauvegarde/chargement localStorage
  main.js                boucle principale, gestion des événements, rendu
public/
  manifest.webmanifest, icons/, sw.js
tests/
  state.test.js, simulation.test.js, save.test.js   suite node:test
.github/workflows/deploy.yml   tests + build + déploiement GitHub Pages
```

## Développement local

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

Suite basée sur `node:test` (aucune dépendance externe), exécutée avant chaque build en CI. Couvre : initialisation, propagation, économie d'Influence, achats d'améliorations et leurs limites, réactions locales et globales, victoire, défaite, filet de sécurité anti-boucle infinie, sauvegarde/reprise, nouvelle partie sans contamination de l'ancienne, invariants numériques (pas de NaN/valeur négative/hors bornes), et deux simulations Monte-Carlo (les 14 origines en jeu passif, les 14 origines en jeu actif).

## Build de production

```bash
npm run build
npm run preview
```

## Déploiement

Le déploiement est automatique sur push vers `main` (voir `.github/workflows/deploy.yml`). Prérequis unique côté GitHub : activer Pages sur ce dépôt avec la source **GitHub Actions** (Settings → Pages → Build and deployment → Source : GitHub Actions).

URL stable une fois activé : `https://<owner>.github.io/rupture-v0/`.

## Boucle de jeu (V0)

1. Nouvelle partie → choix du territoire d'origine sur la carte.
2. L'anomalie se propage le long des routes ouvertes, en fonction de la connectivité et des améliorations achetées (Propagation, Résilience, Discrétion).
3. Chaque territoire développe une conscience de la crise, un confinement local, et peut fermer ses routes.
4. Victoire : la domination mondiale (crise moyenne pondérée par population) atteint 75 %.
5. Défaite : le confinement mondial atteint 100 % avant (ou filet de sécurité à 400 jours si aucun des deux seuils n'est atteint).
6. Sauvegarde locale automatique à chaque action et chaque tick ; reprise possible depuis le menu.
7. L'écran de fin indique explicitement quel seuil a été franchi (jamais de victoire/défaite sans explication).

## Note d'équilibrage (pré-équilibrage technique, pas définitif)

Sans aucune amélioration achetée, la partie est perdue de façon fiable depuis n'importe quelle origine (vérifié par simulation Monte-Carlo automatisée) : les upgrades ne sont pas optionnels, ils sont nécessaires. Avec une stratégie active (achat systématique dès que possible), la victoire est atteignable depuis au moins 10 des 14 territoires de départ ; les origines les moins connectées (ex. Delthia, Lyrath, Nyxor) restent plus difficiles avec une stratégie naïve — c'est un choix de conception assumé (le point de départ doit compter) plutôt qu'un bug, mais c'est aussi le point précis que la bêta humaine devra confirmer ou contredire.

## Limites connues de la V0

Voir le rapport technique V0 (PDF) livré séparément pour l'état détaillé fait/testé/déployé et les éléments reportés à la V1.
