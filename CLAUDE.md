# Règles du projet RUPTURE — à lire par toute session Claude

Jack est le propriétaire et le décideur. Il pilote depuis son téléphone Android, souvent depuis un chantier :
messages courts, en français, livrables prêts à l'emploi.

## Documents de référence (`docs/`)
- `V7-cahier-des-charges.md` (et suivants) : feuille de route validée avec Jack (section « Réalisé » à la fin).
- Rapports PDF V0 → V6, `ARCHITECTURE.md`, `TRAJECTOIRE_COMMERCIALE.md`, `SECRETS_ET_PRODUCTION.md`.
  Attention : les PDF disent qu'AdMob et Play Billing « sandbox » sont branchés ; avant la V7, les builds produits
  ne les utilisaient jamais — vérifier le code, pas les documents.
- Un cahier en préparation peut n'exister que sur une branche `mission/…` : toujours regarder les branches non fusionnées.

## Fusion dans `main`
Jack laisse à Claude le contrôle de GitHub et l'autorise à fusionner ses Pull Requests une fois les vérifications passées :
1. tests automatiques au vert ;
2. jeu vérifié dans un Chrome mobile simulé (Playwright, 390×844) sur le parcours réel ;
3. relecture par un sous-agent indépendant sans point bloquant.

## Interdits sans accord explicite de Jack, écrit dans la conversation
- `git push --force`, `git reset --hard` sur une branche partagée, pousser directement sur `main`.
- Supprimer une branche, un fichier de jeu ou un dépôt. Reconstruire le jeu « de zéro ».
- Renommer les identifiants de territoires (`arca` … `tenlow`) ou les clés de sauvegarde.
- Créer ou activer quoi que ce soit de payant (AdMob réel, produit Play, profil marchand).
  Mettre une clé, un mot de passe ou un keystore réel dans le dépôt (seule exception : une clé de DÉBOGAGE publique
  réservée aux APK de bêta).
- Travailler sur plusieurs versions en même temps.

## Obligatoire à chaque version
- `npm test` vert avant tout push ; un test pour chaque bug corrigé ; simulations d'équilibrage rejouées si une règle change.
- Monter `version` dans `package.json` ; mettre à jour la section « Réalisé » du cahier.
- Modèle économique du studio : jeu gratuit financé par la pub, aucun coût de fonctionnement (pas de serveur, d'API, de LLM),
  achats de confort seulement (ex. « sans pub »), jamais d'avantage payant.

## Technique
- Vite + JS vanilla ; `src/engine/` sans DOM, testable sous Node (`node --test`) ; Capacitor pour Android.
- npm dans les sessions Claude : passer par le proxy (`npm ci --https-proxy=$HTTPS_PROXY --proxy=$HTTPS_PROXY --noproxy=localhost --cafile=/root/.ccr/ca-bundle.crt`).
