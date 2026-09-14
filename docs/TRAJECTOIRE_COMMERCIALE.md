# RUPTURE — Trajectoire commerciale (PWA → bêta → monétisation → Android → publication)

**Avertissement à lire en premier :** ce document décrit une trajectoire.
**RUPTURE n'est toujours pas prêt pour une publication sur Google Play**,
mais la préparation technique a réellement avancé depuis la rédaction
initiale de ce document — voir `docs/SECRETS_ET_PRODUCTION.md` §1 pour
l'inventaire à jour (projet Android généré, AdMob et Play Billing
réellement branchés en sandbox) et le rapport technique V5.2 pour le
détail. Section 7 ci-dessous garde sa distinction stricte entre « préparé »
et « publiable », toujours valable : rien de ce qui a été branché ne
dispense des comptes/décisions listés en section 6.

## 0. Où en est RUPTURE aujourd'hui

PWA statique (Vite + JS vanilla), hébergée sur GitHub Pages, sauvegarde
locale uniquement (`localStorage`), aucun compte joueur, aucun serveur,
aucune donnée envoyée nulle part. C'est un atout pour la suite : la surface
à sécuriser/déclarer pour une publication est aujourd'hui minimale.

## 1. Étapes de la trajectoire

```
PWA actuelle (bêta privée, GitHub Pages)
        │
        ▼
Bêta gameplay (en cours — V2, résultats à venir)
        │
        ▼
Monétisation décidée (Premium ? Publicité ? Les deux ? Ni l'un ni l'autre ?)
        │   ← décision produit qui n'a pas encore été prise
        ▼
Empaquetage Android (packaging natif, voir section 2)
        │
        ▼
Conformité de publication (section 5) + tests fermés Play Console
        │
        ▼
Publication (interne → fermée → ouverte → production)
```

Chaque flèche est une étape distincte : ne pas empaqueter avant que le
gameplay soit stabilisé par la bêta, ne pas publier avant d'avoir réglé la
conformité, etc. Cette passe ne fait avancer que la préparation technique en
amont de l'empaquetage (voir `docs/ARCHITECTURE.md`) — aucune étape en aval
n'a été commencée.

## 2. Stratégie d'empaquetage Android recommandée

Deux approches sérieuses existent pour transformer une PWA en application
Android distribuable :

| Critère | **Capacitor** (recommandé) | TWA (Trusted Web Activity / Bubblewrap) |
|---|---|---|
| Principe | Coquille native + WebView, plugins natifs officiels | Le navigateur Chrome affiche la PWA plein écran dans une activité Android |
| Achats intégrés (Play Billing) | Plugin natif dédié (fiable, API Play Billing complète) | Passe par la Digital Goods API du navigateur — support et fiabilité plus inégaux |
| Publicité (AdMob, etc.) | Plugins natifs matures (ex. AdMob communautaire) | Non pris en charge nativement ; contournements fragiles |
| Effort de mise en place | Projet Android généré (Android Studio/Gradle) en plus du web | Très léger (un manifeste + Digital Asset Links) |
| Dépendance à un domaine public | Optionnelle (le contenu web peut être embarqué dans l'APK) | Obligatoire (l'appli charge le vrai site en HTTPS) |
| Mises à jour du contenu de jeu | Nécessite une nouvelle version d'appli si le contenu est embarqué (ou fetch réseau si servi à distance) | Automatiques dès que le site est mis à jour (pas de re-publication Play Store pour un changement purement web) |

**Recommandation :** Capacitor, précisément parce que la feuille de route
inclut Premium (Play Billing) et de la publicité (AdMob) — les deux
fonctionnent bien mieux avec de vrais plugins natifs qu'avec les API web
encore inégales que TWA doit utiliser pour les mêmes besoins. TWA resterait
une alternative valable si RUPTURE finissait par n'avoir ni achat ni
publicité — ce n'est pas le scénario prévu par le cahier des charges reçu.

**Ce que cela implique concrètement (non fait dans cette passe) :** ajouter
Capacitor au projet (`@capacitor/core`, `@capacitor/android`), générer un
projet Android (`npx cap add android`), configurer `capacitor.config.json`
pour pointer vers `dist/` (build Vite existant, embarqué tel quel — aucune
réécriture du jeu), puis ouvrir/compiler ce projet Android avec Android
Studio. Le moteur de jeu (`src/engine/`) et l'UI (`src/ui/`) n'ont besoin
d'aucune modification pour cela : c'est précisément ce que la séparation
décrite dans `docs/ARCHITECTURE.md` doit permettre.

## 3. Points techniques identifiés

- **Dépendances futures :** Node/npm (déjà présent), Android SDK + Android
  Studio, Java/Kotlin (fournis par Capacitor/Gradle), un compte développeur
  Google Play (payant, une fois).
- **Cycle de vie :** la boucle de simulation (`src/main.js`) vérifie déjà
  `document.hidden` pour suspendre le jeu — ce même mécanisme fonctionne
  nativement dans une WebView Capacitor lors d'une mise en arrière-plan
  Android ; aucun changement structurel identifié comme nécessaire ici.
- **Stockage/sauvegarde :** `localStorage` fonctionne normalement dans une
  WebView Capacitor (stockage propre à l'application, pas de partage
  intersite à craindre). Le registre de migrations ajouté dans cette passe
  (`src/engine/migrations.js`) devient plus important ici : un joueur Android
  qui met à jour l'application ne doit pas perdre sa progression à chaque
  version, contrairement à un bêta-testeur actuel qui recharge simplement la
  PWA.
- **Comportement hors ligne :** déjà assuré par le service worker existant
  (cache-first sur les assets) — un empaquetage Capacitor embarquant `dist/`
  directement dans l'APK fonctionnerait hors ligne par construction, sans
  même dépendre du service worker.
- **Mises à jour :** à distinguer clairement — mise à jour du **code du
  jeu** (aujourd'hui : simple redéploiement GitHub Pages ; demain sur
  Android : nouvelle version d'APK/AAB à faire valider par Play Store, sauf
  architecture hybride avec contenu chargé à distance, à décider plus tard)
  et mise à jour des **données de sauvegarde** (couverte par les
  migrations).
- **Achats intégrés :** brancher un plugin Play Billing Capacitor derrière
  `src/services/premium.js` (le seul fichier à réécrire, voir
  `docs/ARCHITECTURE.md` section 2).
- **Publicité :** brancher un plugin AdMob Capacitor derrière
  `src/services/ads.js`.
- **Permissions :** RUPTURE ne demande aujourd'hui aucune permission
  Android sensible (pas de caméra, localisation, contacts…) — seul l'accès
  réseau serait requis si des services distants (ads/analytics) sont
  ajoutés. C'est un net avantage pour la vitesse de revue Play Store.
- **Orientation/affichage mobile :** `manifest.webmanifest` fixe déjà
  `"orientation": "portrait"` ; à reporter dans la configuration Android
  (verrouillage d'orientation natif) lors de l'empaquetage.
- **Exigences de publication pertinentes :** voir section 5.

## 4. Monétisation — ce qui est préparé et ce qui ne l'est pas

Préparé (voir `docs/ARCHITECTURE.md`) : interface Premium (statut
local, à remplacer par une vraie vérification d'achat), interface publicité
(non consommée par aucune fonctionnalité pour l'instant), point
d'indirection pour restreindre certaines vitesses aux joueurs Premium en
configuration commerciale uniquement.

Non préparé et volontairement laissé en suspens : quel contenu exact serait
Premium (au-delà de la piste « vitesses » déjà donnée), s'il y aura de la
publicité classique, récompensée, ou les deux, le montant/modèle
(achat unique, abonnement), et si RUPTURE restera gratuit avec Premium
optionnel ou payant dès le départ. Toutes ces questions sont des décisions
produit, pas des sujets techniques.

## 5. Exigences de publication (aperçu, non exhaustif)

- Compte développeur Google Play (frais unique).
- Format **Android App Bundle (.aab)**, signé (Play App Signing recommandé).
- Cibler un niveau d'API Android récent (l'exigence minimale évolue chaque
  année — à vérifier au moment de l'empaquetage réel, pas maintenant).
- Fiche store : description, captures d'écran, icône, politique de
  confidentialité **hébergée publiquement** (obligatoire dès qu'une
  publicité, un analytics ou tout traitement de données est présent).
- Formulaire « Sécurité des données » (Data safety) déclarant précisément ce
  qui est collecté — aujourd'hui rien, mais ce formulaire devra être mis à
  jour dès qu'un SDK de publicité ou d'analytics réel sera intégré.
- Questionnaire de classification par âge/contenu.
- Déclaration des achats intégrés et de la publicité si ces fonctionnalités
  sont activées.
- Passage recommandé par les canaux de test Play Console (interne → fermé →
  ouvert) avant la production.

## 6. Listes demandées

**Préparé maintenant (dans le dépôt, testé) :**
- Configuration centralisée dev/bêta/commercial (`src/config/runtime.js`).
- Interfaces de services découplées du moteur : Premium, Publicité,
  Analytics/erreurs (`src/services/`), assemblées par `main.js` uniquement.
- Indicateur Premium local (`getPremiumFlag`/`setPremiumFlag`) et point
  d'indirection pour restreindre des vitesses en configuration commerciale
  (inactif en bêta, testé pour les deux cas).
- Registre de migrations de sauvegarde (`src/engine/migrations.js`), câblé
  dans `save.js`, avec garde contre tout état incohérent.
- Point d'entrée pour une future remontée d'erreurs (`window.onerror`
  routé vers `services.analytics.logError`, no-op aujourd'hui).
- Cette documentation (audit + trajectoire).

**Volontairement non implémenté :**
- Tout projet Android/Capacitor réel dans le dépôt.
- Toute intégration réelle de Google Play Billing, d'AdMob ou d'un
  fournisseur analytics.
- Toute interface joueur pour un achat Premium (aucun écran d'achat
  n'existe).
- Moteur audio/musique (les réglages sont visibles dans les Paramètres
  mais désactivés — préparé côté UI depuis la V2, rien de plus ajouté ici).
- Un pipeline de build/CI séparé pour un flavor « commercial ».
- Politique de confidentialité, formulaire Data safety, fiche store.

**Nécessitera une décision ou un compte externe (de votre côté) :**
- Choix définitif du contenu Premium et de son modèle économique.
- Choix d'un fournisseur de publicité (AdMob ou autre) et création du
  compte associé.
- Décision sur l'usage ou non d'un service d'analytics/erreurs, et lequel.
- Création du compte développeur Google Play (payant).
- Décision sur le nom, l'identité visuelle finale et la fiche store.
- Décision sur l'hébergement définitif (conserver GitHub Pages comme
  contenu embarqué dans l'APK, ou migrer vers un domaine propre) si une
  architecture hybride avec contenu distant est un jour souhaitée.
- Rédaction de la politique de confidentialité et des réponses au
  questionnaire de classification par âge.
- Décision sur l'ajout de musique/effets sonores (et leur création ou achat
  de licence).

## 7. Préparé ≠ publiable

Cette passe rend RUPTURE **prêt à recevoir**, plus tard et sans
reconstruction, les briques listées en section 6. Elle ne rend PAS RUPTURE
publiable : aucun projet Android n'existe, aucun compte développeur n'est
créé, aucune conformité (confidentialité, sécurité des données,
classification) n'est traitée, et le gameplay lui-même est encore en bêta
manuelle. La distinction est volontairement stricte pour éviter toute
ambiguïté sur l'état réel du projet.
