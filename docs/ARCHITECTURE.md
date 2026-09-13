# RUPTURE — Architecture technique

Ce document décrit l'architecture réelle de RUPTURE après la passe de
préparation « publication future » (voir aussi `docs/TRAJECTOIRE_COMMERCIALE.md`
pour la trajectoire produit). Il ne décrit **pas** un gameplay ou un
équilibrage — voir les rapports `RUPTURE_V*_Rapport_Technique_Officiel.pdf`
pour cela.

## 1. Audit — état trouvé avant cette passe

Avant toute modification, l'architecture de RUPTURE V2 (commit `4327c36`) a
été examinée pour identifier ce qui était déjà correctement séparé et ce qui
risquait de devenir de la dette technique à mesure que le projet
grossirait vers une publication commerciale.

**Déjà bien séparé (aucune modification nécessaire) :**

- `src/engine/` (territories, balance, state, simulation) ne connaît ni le
  DOM, ni `localStorage`, ni aucune notion de plateforme. C'est un noyau pur,
  testable en isolation (`node --test` ne charge jamais de navigateur) — et
  c'est exactement le noyau qu'une future coquille Android devra pouvoir
  réutiliser tel quel.
- `src/ui/` (map, hud, screens) ne fait que du templating de chaînes de
  caractères à partir de l'état reçu en paramètre ; aucun accès direct à
  `localStorage` ou à une API navigateur au-delà de ce qui est explicitement
  passé.
- `src/save.js` est l'unique point de contact avec `localStorage` — bonne
  encapsulation déjà en place.
- `src/main.js` est la seule « colle » : DOM, moteur, sauvegarde, cycle de
  vie du service worker. C'est le bon endroit pour brancher de futurs
  services, et le seul.

**Dette identifiée et corrigée dans cette passe :**

1. **Vitesses codées en dur dans l'UI.** `src/ui/hud.js` construisait
   directement les quatre boutons de vitesse (`0/1/2/4`). Or une piste
   commerciale déjà actée est que certaines vitesses pourraient devenir
   Premium en version commerciale. Sans point d'indirection, cette règle
   commerciale aurait fini par s'écrire directement dans le template HTML du
   HUD — mélangeant présentation et logique commerciale. → extrait vers
   `src/config/runtime.js`.
2. **Aucune interface pour les futurs services commerciaux.** Aucune notion
   de Premium, publicité ou analytics n'existait nulle part. Ce n'est pas un
   défaut en soi (rien n'en avait besoin jusqu'ici), mais toute
   implémentation future aurait dû improviser un point d'entrée à chaud,
   probablement en touchant `main.js`, `hud.js` et `screens.js` en même
   temps. → interfaces de service ajoutées maintenant, avant qu'un besoin
   réel ne force une intégration précipitée.
3. **Sauvegarde à bascule brutale.** `SAVE_VERSION` (actuellement 2) faisait
   déjà ce qu'il fallait de sûr — une version différente est rejetée
   proprement, jamais un état incohérent — mais sans aucun mécanisme pour
   *migrer* une ancienne sauvegarde. Supprimer la progression à chaque
   changement de version est acceptable en bêta interne ; ce le sera
   beaucoup moins pour de vrais joueurs sur Google Play. → registre de
   migration ajouté (vide pour l'instant : aucune migration n'est encore
   nécessaire, seule l'infrastructure l'est).
4. **Aucune distinction dev/bêta/commercial nulle part.** Un seul build,
   une seule configuration. Correct pour une bêta interne à diffusion
   privée ; deviendra un problème le jour où le build commercial doit se
   comporter différemment (ex. vitesses restreintes) sans dupliquer le
   projet. → un seul module de configuration centralisée, pas un pipeline de
   build séparé (voir section « Ce qui n'a pas été fait », plus bas).

**Ce qui n'a volontairement pas été touché :** `src/engine/balance.js`,
`simulation.js`, `territories.js`, le rendu de la carte, le HUD (hors la
seule ligne des boutons de vitesse), le CSS, le pipeline CI/CD
(`.github/workflows/deploy.yml`), le service worker, le manifeste PWA. Rien
dans cette liste n'avait de justification produit concrète pour être modifié
maintenant.

## 2. Séparation jeu / services

```
src/engine/*        →  noyau de jeu pur (aucune dépendance externe)
src/ui/*             →  présentation (reçoit state + services en paramètres)
src/services/*       →  interfaces + adaptateurs "locaux" (no-op) :
                          premium.js    statut Premium (indicateur local)
                          ads.js         publicité (interface, non consommée)
                          analytics.js   analytics / erreurs (no-op)
                          index.js       point d'assemblage unique
src/config/runtime.js →  configuration centralisée (env, vitesses dispo.)
src/save.js           →  unique point de contact localStorage
src/engine/migrations.js → registre de migrations de sauvegarde
src/main.js           →  colle : instancie les services, câble tout
```

Règle : **`src/engine/` et `src/ui/` ne créent jamais un adaptateur
concret.** `main.js` est seul à appeler `createServices()` ; tout le reste
reçoit l'objet `services` en paramètre (ou une valeur déjà résolue de
`src/config/runtime.js`). Un futur fournisseur réel (Google Play Billing,
AdMob, un service d'analytics) s'implémente en réécrivant un seul fichier
sous `src/services/`, sans toucher au moteur ni à l'UI.

Ce qui est réellement câblé aujourd'hui (mais sans aucun effet observable,
puisque tous les adaptateurs sont des no-op) :

- `src/ui/hud.js` calcule les vitesses affichées via
  `getAvailableSpeeds(services)` au lieu de les coder en dur. En
  configuration bêta actuelle (`RUNTIME_CONFIG.env = 'beta'`), cette fonction
  renvoie toujours `[0, 1, 2, 4]`, quel que soit le statut Premium — conforme
  à l'exigence que les vitesses restent intégralement accessibles pendant le
  développement et les bêtas.
- `src/main.js` route les erreurs JS non interceptées
  (`window.onerror` / `unhandledrejection`) vers `services.analytics.logError`
  — actuellement un no-op, mais le point d'entrée existe déjà.

Ce qui est défini mais volontairement **non consommé** :

- `src/services/ads.js` : aucune fonctionnalité de jeu n'utilise
  aujourd'hui de publicité, donc rien n'appelle encore cette interface.
  Elle existe pour qu'une future fonctionnalité (ex. publicité récompensée
  pour un bonus) n'ait qu'à l'appeler, jamais à parler à un SDK directement.

## 3. Configuration centralisée (`src/config/runtime.js`)

Un seul module possède la notion d'environnement :

```js
export const BUILD_ENV = 'beta'; // 'dev' | 'beta' | 'commercial'
```

`'commercial'` ne correspond à aucun build réel aujourd'hui — c'est un
espace réservé documenté. Tant que `BUILD_ENV !== 'commercial'`,
`getAvailableSpeeds()` renvoie systématiquement la liste complète des
vitesses, même si `premiumOnlySpeeds` contenait une valeur par erreur : la
bêta ne peut pas être accidentellement restreinte par une configuration
commerciale mal renseignée.

Aucune condition commerciale n'est dispersée ailleurs dans le code : c'est
le seul fichier qui aurait à changer pour faire naître un vrai troisième
environnement de build.

## 4. Sauvegardes et migrations (`src/engine/migrations.js`)

`save.js` tente désormais une migration avant de rejeter une sauvegarde de
version différente :

```js
if (parsed.version === SAVE_VERSION) return parsed;
return migrateSave(parsed, SAVE_VERSION); // null si aucun chemin n'existe
```

Le registre de migrations est vide aujourd'hui (aucune migration n'est
encore nécessaire : V2 est la première fois que ce mécanisme existe). Une
future version qui change la forme de la sauvegarde de façon mappable
devrait ajouter une entrée `{ ancienneVersion: (old) => nouvelleForme }`
plutôt que de compter sur le rejet. Quand aucun chemin de migration
n'existe, le comportement reste strictement celui d'avant : rejet propre
(`null`), jamais un état partiellement migré ou incohérent.

## 5. Ce qui n'a pas été fait (et pourquoi)

Conformément au principe « le minimum d'architecture aujourd'hui qui évitera
une reconstruction demain », n'ont **pas** été faits dans cette passe :

- Un pipeline de build séparé dev/bêta/commercial (un seul `vite.config.js`,
  une seule configuration CI). Un module de configuration suffit tant qu'un
  seul build est réellement publié.
- Un scaffold Android/Capacitor dans le dépôt (voir
  `docs/TRAJECTOIRE_COMMERCIALE.md` pour l'analyse — implémenter maintenant
  serait une reconstruction prématurée d'un projet qui n'a pas encore fini
  sa bêta gameplay).
- Une intégration réelle de Google Play Billing, AdMob ou d'un fournisseur
  analytics. Aucun compte, aucune décision commerciale n'a été pris — les
  interfaces existent, aucun fournisseur n'est branché derrière.
- Un système d'internationalisation, un moteur audio, ou tout autre système
  non explicitement demandé pour cette passe.

## 6. Non-régression vérifiée pour cette passe

Aucun changement de gameplay, d'équilibrage ou d'expérience visible n'est
attendu — vérifié :

- 45/45 tests automatisés passent (34 hérités + 11 nouveaux couvrant
  `migrations.js`, `services/*` et le rendu des vitesses par `hud.js`).
- Batterie de 162 simulations rejouée : résultats strictement identiques aux
  valeurs déjà publiées dans le rapport V2 (aux variations aléatoires
  près, préexistantes et inchangées, de la stratégie semi-aléatoire et des
  fermetures de routes).
- Suite E2E navigateur (menu, paramètres, difficulté, secteurs, PWA, mobile
  360/412px) rejouée sur un build frais : 0 erreur console, aucun
  débordement, les quatre boutons de vitesse (`⏸ 1x 2x 4x`) rendus à
  l'identique.
