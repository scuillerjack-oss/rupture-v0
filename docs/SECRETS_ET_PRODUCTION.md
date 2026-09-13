# RUPTURE — Secrets, configuration de production et packaging mobile

Ce document accompagne `docs/TRAJECTOIRE_COMMERCIALE.md` (stratégie déjà
actée : Capacitor) et `docs/RUPTURE_Audit_Economique_Precommercialisation.pdf`
(modèle économique déjà validé). Il documente ce qui a été réellement
préparé dans cette passe de finalisation, ce qui reste simulé, et
précisément ce que vous devrez créer/protéger vous-même avant une vraie
publication. Rien ici ne prétend qu'une intégration réelle existe alors
qu'elle ne l'est pas.

## 1. Réel / simulé / préparé — inventaire complet

| Élément | Statut | Détail |
|---|---|---|
| Logique de fréquence publicitaire (`shouldShowInterstitial`) | **RÉEL** | Fonction pure, testée, applique exactement la règle de l'audit économique. |
| Affichage d'une publicité (`showInterstitialAd`) | **SIMULÉ** | Aucun SDK connecté. Écran placeholder clairement étiqueté "simulation" en dev/bêta ; refuse d'agir en environnement `commercial`. |
| Restriction de vitesse ×4 par Premium (`getAvailableSpeeds`) | **RÉEL, mais inactif en bêta** | La logique s'applique réellement, mais seulement si `env==='commercial'` (voir §3) - la PWA bêta déployée reste x1/x2/x4 libres. |
| Achat Premium (`purchasePremium`) | **SIMULÉ** | Aucun compte Google Play Billing/App Store connecté. Accorde un entitlement marqué `simulated-test` en dev/bêta ; refuse d'agir en environnement `commercial`. |
| Restauration d'achats (`restorePurchases`) | **SIMULÉ** | Même statut que ci-dessus. |
| Jetons anti-rejeu pour un futur événement publicitaire à récompense | **PRÉPARÉ, non consommé** | Aucune mécanique de publicité récompensée n'est définie dans le modèle économique retenu - la structure existe pour l'accueillir sans réécriture. |
| Journal d'anomalies de monétisation (`logSecurityEvent`) | **RÉEL (diagnostic uniquement)** | Jamais utilisé pour bloquer un joueur - un journal local n'est pas une protection. |
| Projet Android (Capacitor) | **PRÉPARÉ, pas généré** | `capacitor.config.json` + dépendances npm présentes. `npx cap add android` n'a PAS été exécuté (nécessite Android SDK/Studio, indisponibles dans cet environnement) - voir §4. |
| Compte développeur Google Play | **NON CRÉÉ** | À votre charge, voir §2. |
| SDK AdMob réel | **NON CONNECTÉ** | À votre charge, voir §2 et §5. |
| Google Play Billing réel | **NON CONNECTÉ** | À votre charge, voir §2 et §5. |
| Politique de confidentialité / formulaire Data safety | **NON RÉDIGÉS** | À votre charge, voir §6. |

## 2. Comptes et décisions qui vous appartiennent

Rien de ce qui suit n'a été créé, deviné ou simulé par cette passe :

- **Compte développeur Google Play** (frais unique, ~25 $US - hors périmètre
  de l'audit économique à votre demande explicite).
- **Compte AdMob** + création d'une application AdMob (donne l'App ID à
  placer dans `.env.local`, voir §3).
- **Compte marchand Google Play** (nécessaire pour toucher les revenus
  Premium - se configure au moment de la création du produit dans la Play
  Console).
- Si iOS est un jour envisagé : **compte Apple Developer Program** (payant,
  annuel) - non traité en détail ici, hors périmètre de l'audit économique
  actuel (Google Play / Android uniquement).
- **Choix définitif de l'appId Android** (`com.scuillerjackoss.rupture` dans
  `capacitor.config.json` est un PLACEHOLDER - voir §4, à confirmer avant
  toute publication car permanent une fois soumis).

## 3. Configuration et secrets — ce qui ne se committe jamais

`.env.example` (committé, sans valeur réelle) documente la forme des
variables de build. Copiez-le en `.env.local` (déjà ignoré par
`.gitignore`) pour vos vraies valeurs.

**Ne JAMAIS committer, quel que soit l'emplacement :**

| Secret | Où il apparaît plus tard | Comment le protéger |
|---|---|---|
| Mot de passe du keystore Android | Génération locale (`keytool`), Play App Signing | Gestionnaire de mots de passe personnel. Une perte = impossibilité de publier une mise à jour sous le même appId. |
| Fichier keystore (`.jks`/`.keystore`) | Généré localement | Sauvegarde chiffrée hors du dépôt (voir `.gitignore`, déjà exclu). Play App Signing (recommandé) réduit ce risque : Google conserve la clé d'upload. |
| Clé de compte de service Google Play (si publication automatisée via CI) | Play Console > API Access | Jamais dans le dépôt ; en secret CI (GitHub Actions "Secrets") si un jour un pipeline de publication est ajouté - aucun n'existe aujourd'hui. |
| `google-services.json` (si Firebase Analytics/Crashlytics ajoutés) | Firebase Console | Déjà dans `.gitignore`. Ce fichier identifie votre projet Firebase - pas un mot de passe en soi, mais à ne pas exposer publiquement par prudence. |
| Toute clé d'API serveur à privilège élevé | Seulement si un backend est un jour ajouté (non prévu, voir §7) | N'existe pas aujourd'hui. |

**Ce qui n'est PAS un secret sensible** (peut apparaître dans le code/l'APK
public sans risque particulier, mais reste spécifique à votre compte donc
non inventé ici) : l'App ID AdMob, la clé publique de licence Play Console
(sert à vérifier une signature, pas à en produire une).

## 4. Packaging Android (Capacitor) — état réel et prochaines étapes

**Fait dans cette passe** (vérifié, pas simulé) :
- `@capacitor/core`, `@capacitor/android` (dépendances), `@capacitor/cli`
  (dépendance de dev) installés et fonctionnels (`npm install` propre,
  aucun conflit avec Vite/le build existant - vérifié).
- `capacitor.config.json` créé (`webDir: "dist"` - le build Vite existant
  est embarqué tel quel, aucune réécriture du moteur ni de l'UI).
- Séparation dev/bêta/commercial réellement fonctionnelle et testée
  localement (`npm run build:commercial` - voir `src/config/runtime.js`).

**PAS fait, et pourquoi** : `npx cap add android` (génère le projet Gradle
natif complet) n'a volontairement pas été exécuté. Cette commande nécessite
un SDK Android installé pour être ensuite compilée/testée, ce qui n'existe
pas dans cet environnement d'exécution distant - l'exécuter à l'aveugle
aurait produit un projet natif jamais réellement vérifié, contraire à la
consigne explicite de ne jamais simuler une intégration qui ne fonctionne
pas réellement.

**Ce que vous devrez faire, dans cet ordre, sur votre machine (avec Android
Studio installé) :**

1. `npm install` (récupère les dépendances déjà déclarées dans `package.json`).
2. `npm run build` (génère `dist/`).
3. `npx cap add android` (génère le projet natif `android/` à partir de
   `capacitor.config.json` - ce dossier est volontairement exclu du dépôt,
   voir `.gitignore`).
4. `npx cap sync android` après chaque modification de `dist/` ou du
   `capacitor.config.json`.
5. Ouvrir `android/` dans Android Studio pour compiler, tester sur
   émulateur/appareil, puis générer un App Bundle (`.aab`) signé.
6. Confirmer/modifier l'`appId` dans `capacitor.config.json` AVANT la
   première soumission (voir §2 - permanent une fois publié).

**Icônes** : `public/icons/icon-512.png` et `icon-512-maskable.png`
existent déjà (utilisés par la PWA) et constituent une base réutilisable
pour générer les icônes Android (l'outil `@capacitor/assets`, à installer
séparément le moment venu, génère automatiquement toutes les résolutions
depuis une image source unique). Non fait ici : la séparation
premier-plan/arrière-plan recommandée pour une "icône adaptative" Android
optimale nécessite une retouche graphique que cette passe n'a pas les
moyens de produire sans deviner un résultat visuel - l'icône maskable
existante fonctionnera, mais un remplacement plus abouti reste possible
plus tard sans aucun impact technique.

**Permissions** : aucune permission Android sensible n'est nécessaire
aujourd'hui (confirmé par l'audit économique et par cette passe : aucune
caméra, localisation, contacts). Seul l'accès réseau serait requis une
fois un SDK publicitaire/analytics réel connecté - Capacitor l'ajoute
automatiquement au manifeste le moment venu, aucune action manuelle
anticipée n'est nécessaire ici.

**Versioning** : `package.json` reste la source de vérité pour la version
du code web (actuellement `0.1.0`). Une fois `android/` généré, Android
utilise en plus `versionCode` (entier, incrémenté à chaque soumission) et
`versionName` (chaîne affichée, ex. "1.0.0") dans
`android/app/build.gradle` - à synchroniser manuellement avec
`package.json` à chaque publication, Capacitor ne le fait pas
automatiquement.

## 5. Brancher les SDK réels (AdMob, Play Billing) le moment venu

Un seul fichier à réécrire à chaque fois, sans toucher au reste du jeu
(architecture déjà en place, voir `docs/ARCHITECTURE.md`) :

- **AdMob** : `src/services/ads.js` - remplacer le corps de
  `showInterstitialAd()` par l'appel au plugin Capacitor AdMob communautaire
  identifié dans `docs/TRAJECTOIRE_COMMERCIALE.md`. `shouldShowInterstitial()`
  (la logique de fréquence) n'a besoin d'AUCUNE modification.
- **Play Billing** : `src/services/premium.js` - remplacer le corps de
  `purchasePremium()`/`restorePurchases()` par l'appel au plugin Play
  Billing Capacitor, et écrire `'store-verified'` (pas `'simulated-test'`)
  comme source d'entitlement une fois le reçu vérifié par la plateforme.
- **Consentement publicitaire (RGPD/EEE)** : intégrer le SDK gratuit "User
  Messaging Platform" (UMP) de Google avant le premier appel publicitaire
  réel si l'audience européenne est ciblée (voir l'audit économique §1).

## 6. Conformité de publication (rappel, non traité ici)

Voir `docs/TRAJECTOIRE_COMMERCIALE.md` section 5 pour la liste complète.
Rien de ce qui suit n'a été rédigé par cette passe (décisions produit,
pas des sujets techniques) : politique de confidentialité (hébergement
statique gratuit suffisant, ex. GitHub Pages), formulaire "Sécurité des
données", questionnaire de classification par âge, fiche store
(description, captures d'écran).

## 7. Rappel — la règle financière durable reste inchangée

Conformément à l'audit économique (§6, garde-fous) : n'ajoutez jamais un
service à facturation variable non plafonnée (backend, base de données
cloud en plan payant, fonctions serverless facturées à l'usage) sans
configurer des alertes de budget et des plafonds de dépense stricts AVANT
toute intégration. Aucun backend n'est nécessaire pour publier RUPTURE tel
que préparé par cette passe.
