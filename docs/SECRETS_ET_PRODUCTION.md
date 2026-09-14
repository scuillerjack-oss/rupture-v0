# RUPTURE — Secrets, configuration de production et packaging mobile

Ce document accompagne `docs/TRAJECTOIRE_COMMERCIALE.md` (stratégie
Capacitor) et `docs/RUPTURE_Audit_Economique_Precommercialisation.pdf`
(modèle économique). Il documente ce qui est réellement préparé/branché à
ce jour, ce qui reste simulé, et précisément ce que vous devrez
créer/protéger vous-même avant une vraie publication. Rien ici ne prétend
qu'une intégration réelle existe alors qu'elle ne l'est pas.

**V5.2 (préparation Google Play réelle)** : cette révision remplace l'état
décrit dans les phases précédentes (`android/` non généré, AdMob/Billing
non branchés) — voir le rapport technique V5.2 pour le détail complet de
l'audit et des choix faits.

## 1. Réel / simulé / préparé — inventaire complet

| Élément | Statut | Détail |
|---|---|---|
| Logique de fréquence publicitaire (`shouldShowInterstitial`) | **RÉEL** | Fonction pure, testée, applique exactement la règle de l'audit économique. |
| Affichage d'une publicité (`showInterstitialAd`) | **SIMULÉ (web/PWA) / RÉEL sandbox (Android natif)** | Sur Android natif en environnement `commercial`, appelle réellement AdMob (`@capacitor-community/admob`) avec l'unité de TEST officielle de Google par défaut - voir §5. Sur web/PWA, toujours simulé (dev/bêta) ou `not-connected` (commercial web, cas hypothétique). |
| Restriction de vitesse ×4 par Premium (`getAvailableSpeeds`) | **RÉEL, mais inactif en bêta** | La logique s'applique réellement, mais seulement si `env==='commercial'` (voir §3) - la PWA bêta déployée reste x1/x2/x4 libres. |
| Achat Premium (`purchasePremium`) | **SIMULÉ (web/PWA) / RÉEL sandbox (Android natif)** | Sur Android natif en environnement `commercial`, appelle réellement Google Play Billing via le plugin local `RuptureBillingPlugin` - voir §5. Exige qu'un produit existe déjà dans la Play Console (externe, non fait ici). Sur web/PWA, `simulated-test` (dev/bêta) ou `not-connected`. |
| Restauration d'achats (`restorePurchases`) | **Même statut que l'achat** | Voir ci-dessus - `queryActivePurchases` côté plugin natif. |
| Jetons anti-rejeu pour un futur événement publicitaire à récompense | **PRÉPARÉ, non consommé** | Aucune mécanique de publicité récompensée n'est définie dans le modèle économique retenu - la structure existe pour l'accueillir sans réécriture. |
| Journal d'anomalies de monétisation (`logSecurityEvent`) | **RÉEL (diagnostic uniquement)** | Jamais utilisé pour bloquer un joueur - un journal local n'est pas une protection. |
| Projet Android (Capacitor) | **GÉNÉRÉ ET COMMITTÉ** | `android/` existe, compile en CI (voir `.github/workflows/android-build.yml`). Icônes/splash réels générés depuis l'icône PWA existante. Voir §4. |
| Compte développeur Google Play | **NON CRÉÉ** | À votre charge, voir §2. |
| SDK AdMob réel (compte/App ID réel) | **NON CONNECTÉ** | Le code est branché (voir ci-dessus) mais tourne sur l'App ID/unité de TEST de Google tant qu'un vrai compte n'existe pas - voir §2 et §5. |
| Google Play Billing réel (produit Play Console) | **NON CONNECTÉ** | Le code est branché mais aucun produit n'existe côté Play Console - voir §2 et §5. |
| Politique de confidentialité / formulaire Data safety | **NON RÉDIGÉS** | À votre charge, voir §6. |

## 2. Comptes et décisions qui vous appartiennent

Rien de ce qui suit n'a été créé, deviné ou simulé par cette passe :

- **Compte développeur Google Play** (frais unique, ~25 $US - hors périmètre
  de l'audit économique à votre demande explicite).
- **Compte AdMob** + création d'une application AdMob (donne l'App ID à
  placer dans la variable d'environnement `ADMOB_APP_ID` au moment du build
  Android, voir §3/§5) + création de la vraie unité publicitaire
  interstitielle (`VITE_ADMOB_INTERSTITIAL_UNIT_ID`).
- **Produit "Premium" dans la Play Console** (Monétiser > Produits gérés,
  un achat unique non consommable) + son identifiant exact dans
  `VITE_PLAY_PRODUCT_ID` — nécessaire même pour tester en sandbox (Play
  Billing refuse tout produit qui n'existe pas côté Play Console pour cet
  applicationId/signature, quel que soit le code).
- **License testers** (Play Console > Configuration > Test de licence) :
  liste d'adresses Gmail dont les achats ne sont jamais facturés - c'est le
  mécanisme officiel de sandbox pour Play Billing, aucun autre ne
  l'égale (voir §5).
- **Compte marchand Google Play** (nécessaire pour toucher les revenus
  Premium - se configure au moment de la création du produit ci-dessus).
- Si iOS est un jour envisagé : **compte Apple Developer Program** (payant,
  annuel) - non traité ici, hors périmètre (Google Play / Android
  uniquement).
- **Keystore d'upload Android** (génération locale, `keytool` - voir
  `android/keystore.properties.example`) - sans lui, aucun build ne peut
  être signé pour une vraie soumission (voir §4).
- **Choix définitif de l'appId Android** (`com.scuillerjackoss.rupture`,
  utilisé partout - `capacitor.config.json`, `android/app/build.gradle` -
  reste un PLACEHOLDER cohérent, à confirmer avant toute publication car
  permanent une fois soumis).

## 3. Configuration et secrets — ce qui ne se committe jamais

`.env.example` (committé, sans valeur réelle) documente la forme des
variables lues par Vite (web) au moment du build. Copiez-le en `.env.local`
(déjà ignoré par `.gitignore`) pour vos vraies valeurs.

**Une variable à part, `ADMOB_APP_ID`, n'est PAS une variable Vite** : elle
est lue directement par Gradle (`android/app/build.gradle`, sans préfixe
`VITE_`) au moment du build Android, car elle doit être injectée dans
`AndroidManifest.xml` avant même que le code web ne s'exécute — à définir
dans votre shell ou en secret CI, jamais dans `.env.local` (qui ne
concerne que Vite).

**Ne JAMAIS committer, quel que soit l'emplacement :**

| Secret | Où il apparaît plus tard | Comment le protéger |
|---|---|---|
| Mot de passe du keystore Android | `android/keystore.properties` (voir `.example` à côté) | Gestionnaire de mots de passe personnel. Une perte = impossibilité de publier une mise à jour sous le même appId. |
| Fichier keystore (`.jks`/`.keystore`) | Généré localement (`keytool`, voir `android/keystore.properties.example`) | Sauvegarde chiffrée hors du dépôt (déjà exclu, voir `.gitignore`). Play App Signing (recommandé, activé par défaut) réduit ce risque : Google conserve la clé de signature finale, ce keystore ne sert qu'à l'upload. |
| Clé de compte de service Google Play (si publication automatisée via CI) | Play Console > API Access | Jamais dans le dépôt ; en secret CI (GitHub Actions "Secrets") si un jour un pipeline de publication est ajouté - aucun n'existe aujourd'hui (`android-build.yml` construit mais ne publie jamais). |
| `google-services.json` (si Firebase Analytics/Crashlytics ajoutés) | Firebase Console | Déjà dans `.gitignore`. Ce fichier identifie votre projet Firebase - pas un mot de passe en soi, mais à ne pas exposer publiquement par prudence. |
| Toute clé d'API serveur à privilège élevé | Seulement si un backend est un jour ajouté (non prévu, voir §7) | N'existe pas aujourd'hui. |

**Ce qui n'est PAS un secret sensible** (peut apparaître dans le code/l'APK
public sans risque particulier, mais reste spécifique à votre compte donc
non inventé ici) : l'App ID AdMob, l'unité publicitaire AdMob, l'identifiant
du produit Play Billing, la clé publique de licence Play Console (sert à
vérifier une signature, pas à en produire une).

## 4. Packaging Android (Capacitor) — état réel

**Fait** (vérifié, pas simulé) :
- `android/` généré (`npx cap add android`) et committé — décision changée
  depuis les phases précédentes : `android/` n'est plus exclu du dépôt
  (voir `.gitignore`, qui explique pourquoi), précisément parce que cette
  passe y ajoute de vraies configurations à préserver (versionCode/
  versionName, signature, plugin Billing local) plutôt que de le
  régénérer à l'identique à chaque fois.
- `versionCode`/`versionName` définis (`android/app/build.gradle`) —
  `versionCode` DOIT être incrémenté manuellement à chaque nouvelle
  soumission Play Console (elle refuse sinon), `package.json` reste la
  source de vérité pour la version du jeu web.
- Icônes et écran de démarrage réels générés (`@capacitor/assets`) depuis
  l'icône PWA existante (`assets/icon.png`, source conservée pour pouvoir
  régénérer plus tard), sur le fond sombre de la charte (`#0b0f14`).
- Orientation verrouillée en portrait (cohérent avec `manifest.webmanifest`).
- Build réellement vérifié en CI (`.github/workflows/android-build.yml`,
  sur les runners GitHub Actions) — **pas dans cet environnement de
  développement**, dont la politique réseau bloque `dl.google.com` (dépôt
  Maven d'Android) : `./gradlew` y échoue dès la résolution du plugin
  Android Gradle lui-même (403 Forbidden, vérifié). Les runners GitHub
  Actions ont le SDK Android préinstallé et un accès réseau normal.

**Ce qu'il reste à faire, de votre côté, avant une vraie publication :**

1. Générer un keystore d'upload réel (`android/keystore.properties.example`
   documente la commande exacte) — sans lui, le build "release" retombe
   sciemment sur la signature de debug (voir `android/app/build.gradle`),
   qui compile et s'installe mais n'est PAS soumissible à Google Play.
2. Créer le compte développeur Google Play, l'application, et au minimum
   une piste de test interne.
3. Confirmer/modifier l'`appId` (`com.scuillerjackoss.rupture`) AVANT la
   première soumission (voir §2 — permanent une fois publié).
4. Décider si l'icône adaptative actuelle (générée automatiquement depuis
   l'icône PWA plate) convient, ou mérite une retouche graphique
   premier-plan/arrière-plan séparée — non fait ici (déciderait d'un rendu
   visuel que cette passe n'a pas les moyens de produire sans deviner).

**Permissions** : seule `INTERNET` est déclarée (nécessaire pour AdMob/Play
Billing) — aucune permission sensible (caméra, localisation, contacts).

## 5. SDK réels branchés (AdMob, Play Billing) — état et sandbox

**AdMob** (`src/services/ads.js` + `src/services/adapters/admob.js`,
plugin `@capacitor-community/admob`) : réellement appelé sur build Android
native + environnement `commercial`. Utilise l'unité de TEST interstitielle
officielle de Google (`ca-app-pub-3940256099942544/1033173712`) et l'App ID
de TEST officiel (`ca-app-pub-3940256099942544~3347511713`) tant que
`VITE_ADMOB_INTERSTITIAL_UNIT_ID`/`ADMOB_APP_ID` ne sont pas configurées —
**ces identifiants de test sont documentés publiquement par Google et ne
nécessitent aucun compte** : la publicité sandbox fonctionne dès
l'installation de l'app, réellement (vrai SDK, vraie requête réseau vers
les serveurs de test de Google), sans jamais être facturable.

**Play Billing** (`src/services/premium.js` +
`src/services/adapters/playBilling.js`, plugin LOCAL
`android/.../RuptureBillingPlugin.java`) : réellement appelé dans les mêmes
conditions, à condition que `VITE_PLAY_PRODUCT_ID` soit configuré — ce que
cette passe ne peut PAS faire à votre place (le produit doit exister dans
votre Play Console). **Pourquoi un plugin local plutôt qu'une dépendance
npm tierce** : le seul plugin Capacitor Play Billing librement disponible
et à jour trouvé lors de l'audit (`capacitor-billing`, un seul mainteneur)
s'est révélé incomplet à l'inspection de son code natif : aucune méthode de
restauration des achats (`queryPurchasesAsync` jamais appelé), et une
méthode `finishTransaction` déclarée côté JS mais jamais implémentée côté
natif. Plutôt que de brancher un composant connu incomplet, un petit
plugin local (4 méthodes : détails produit, achat, restauration,
acquittement) a été écrit directement sur Play Billing Library.

**Sandbox Play Billing — mécanisme officiel, pas une simulation** :
contrairement à AdMob, Play Billing n'a pas d'"identifiant de test"
universel — il exige TOUJOURS qu'un produit existe dans la Play Console
pour l'`applicationId`/la signature exacts de l'app installée. Le mécanisme
de test officiel de Google est la liste des **license testers** (Play
Console > Configuration > Test de licence) : un compte Gmail qui y figure
peut acheter le produit réel sans jamais être facturé, en conditions
sinon identiques à un achat réel (même flux Play, même vérification, même
attribution). Aucun raccourci de ce plugin ne remplace cette étape — elle
reste entièrement de votre ressort (compte, produit, testeur).

**Consentement publicitaire (RGPD/EEE)** : non intégré (SDK gratuit "User
Messaging Platform" de Google) — à faire avant le premier appel
publicitaire réel (pas seulement sandbox) si l'audience européenne est
ciblée (voir l'audit économique §1).

## 6. Conformité de publication (rappel, non traité ici)

Voir `docs/TRAJECTOIRE_COMMERCIALE.md` section 5 pour la liste complète.
Rien de ce qui suit n'a été rédigé par cette passe (décisions produit,
pas des sujets techniques) : politique de confidentialité (hébergement
statique gratuit suffisant, ex. GitHub Pages), formulaire "Sécurité des
données" (à mettre à jour : AdMob et Play Billing sont désormais de vrais
SDK connectés dès qu'un vrai compte existe, ce formulaire devra le
refléter), questionnaire de classification par âge, fiche store
(description, captures d'écran).

## 7. Rappel — la règle financière durable reste inchangée

Conformément à l'audit économique (§6, garde-fous) : n'ajoutez jamais un
service à facturation variable non plafonnée (backend, base de données
cloud en plan payant, fonctions serverless facturées à l'usage) sans
configurer des alertes de budget et des plafonds de dépense stricts AVANT
toute intégration. Aucun backend n'est nécessaire pour publier RUPTURE tel
que préparé par cette passe.
