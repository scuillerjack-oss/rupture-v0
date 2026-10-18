# RUPTURE — Cahier des charges V7 « Carte blanche »

Commande de Jack (18/10/2026) : « optimiser au maximum RUPTURE du point de vue du joueur humain, sans bug ;
carte blanche ; le plus important reste sans doute la modification de la map ».
Base : `main` V6 (commit 6512864) + branche `claude/rupture-contextual-onboarding-91vco5` (onboarding contextuel).
Sources : audit en 3 volets du 18/10/2026 (testeur mobile : 5 parties jouées en Chrome mobile simulé ;
game design ; mise en production). Aucune reconstruction : `src/engine/` est propre et sans DOM, on l'étend.

## 1. Diagnostic (ce que vit le joueur en V6)
1. **La carte ne sert à rien** : un graphe de 18 ronds. Toucher une région n'affiche qu'un panneau ; on n'y joue pas.
2. **Rien ne se passe pendant 300 jours sur 500** : Réponse à 0 %, Progression 2-12 %. Tout se joue dans les 40
   dernières secondes. Cause : la tension dépend du *calendrier* (`tensionAt(jour)`), pas de ce que fait le joueur.
3. **Une seule décision** : l'ordre d'achat de 4 boutons. « J'achète ce qui est disponible » gagne ; Facile ≈ Normal.
4. **Mur invisible à 93 %** : la gravité plafonne tant que la Dangerosité n'est pas au niveau 8, sans aucune explication.
5. **Écran trop haut** (1286 px pour 844) : 3 améliorations sur 4 sous la ligne de flottaison, on perd la carte en achetant.
   **Taps perdus** : tout l'écran est redessiné chaque seconde (`innerHTML`).
6. **Parties mortes** : une partie mal engagée peut rester figée 7 minutes (en ×4) jusqu'au jour 2200.
7. **Aucune variété ni raison de rejouer** : 18 origines équivalentes, pas d'événement, pas de record ni d'objectif.
8. **Équilibrage en « falaises »** : chaque constante touchée fait passer une stratégie de 0 à 100 % (modèle déterministe,
   deux arrivées à ~20 jours d'écart). Ne plus régler des constantes isolées : ajouter du hasard lisible et de la décision.
9. **Production** : l'APK/AAB construit par la CI est la version « bêta » (fausse pub, bouton « Simuler l'achat »),
   `vite.config.js` en `base: '/rupture-v0/'` (écran vide probable dans l'appli Android), pas de bêta qui se met à jour seule,
   pas de `CLAUDE.md`, versionName figé à 5.2.0.

## 2. Objectifs V7 (critères d'acceptation)
- **Une vraie carte du monde** où l'on joue : continents, mers, régions qui rougissent, bulles à toucher, capacités ciblées.
- **Une décision toutes les 10 secondes** environ, et un imprévu toutes les 30-45 « journées ».
- **Le joueur sait toujours où il en est** : projection de la course, obstacle affiché (« il te manque Dangerosité 8 »).
- **Partie de 6 à 8 minutes en ×1**, plus jamais de partie figée (défaite anticipée expliquée).
- **Tout tient dans l'écran** (390×844) : carte en haut, barre d'améliorations compacte en bas, aucun défilement en partie.
- **Aucun tap perdu**, aucune erreur console, aucun débordement horizontal.
- **Rejouer** : étoiles, records, souches débloquables, défi du jour (tout sur le téléphone, sans serveur).
- **Équilibrage mesuré** : simulations à graine ; à ±10 % sur une constante, la meilleure stratégie bouge de ≤ 15 points ;
  robot « achète ce qui est disponible » ≤ 40 % en Normal ; robot cohérent qui touche les bulles 60-85 % en Normal.
- **Bêta sur le téléphone de Jack qui se met à jour seule** (APK comme ARKEN) ; ×4 gratuit pour tous (le Premium = sans pub).

## 3. Contenu

### A. La carte (priorité de Jack)
- Monde fictif dessiné en SVG : 3 à 4 continents + archipels, mer, côtes, relief léger ; les **18 régions deviennent des
  territoires** (polygones) avec leur nom ; identifiants inchangés (`arca`…`tenlow`, ils sont dans les sauvegardes).
- Les **routes du moteur restent les mêmes** (`EDGES`) mais deviennent visibles selon leur nature : frontière terrestre
  (régions qui se touchent) ou **route maritime / aérienne** (ligne pointillée animée entre ports/aéroports).
  Route fermée = barrée, bien visible.
- Remplissage des régions selon la crise (calme → rouge sombre → pulsation critique) ; liseré selon la conscience locale ;
  icônes : 🛡 confinement fort, ✈/⚓ routes, origine marquée.
- **Pan / zoom** au doigt (pincer, glisser), bouton recentrer ; noms lisibles à tous les zooms, rien qui chevauche.
- Écran de choix d'origine sur cette carte, plein écran, avec une fiche courte par région (population, routes, conseil).
- Couche **bulles** et mode **ciblage de capacité** (voir B).

### B. Moteur (règles nouvelles)
- **Hasard à graine** dans `state` (fin de `Math.random`) : parties rejouables, défi du jour, simulations reproductibles.
- **Bulles d'Influence** : une bulle rouge apparaît régulièrement sur une région en crise (toucher = Influence) ;
  une bulle bleue « recherche humaine » sur une région très consciente (toucher = −1 point de Réponse). Durée de vie
  ~8 s de jeu. Une partie du revenu passif passe dans les bulles (revenu V6 retrouvé à ~70 % de bulles touchées).
- **Capacités actives ciblées** (3, avec coût et recharge) : « Sursaut » (+crise dans une région), « Brouillage »
  (conscience figée quelques jours dans une région), « Percée » (rouvre une route fermée).
- **Événements à choix** : une carte à 2 options tous les 30-45 jours (≈ 30 événements écrits, tirés à la graine, selon
  la phase et les régions). La partie est en pause pendant le choix.
- **L'Humanité s'adapte** : à chaque nouvelle phase, la branche la plus développée perd 25 % d'effet pendant 60 jours
  (affiché) : diversifier devient payant.
- **Mur des 93 %** : remplacé par une montée progressive et toujours expliquée (« Gravité plafonnée : Dangerosité 8 requise »,
  dans le HUD et en conseil).
- **Fin de partie** : défaite anticipée si la course est jouée (plus de progression depuis longtemps et Réponse dominante),
  avec explication ; égalité au même tick tranchée clairement.
- **Projection de la course** : « Rupture prévue jour ~X / Maîtrise prévue jour ~Y » (simulation sans hasard, affichage seul).
- **Rythme** : tension liée à l'escalade (conscience) et pas seulement au calendrier — à n'appliquer que si les simulations
  le valident (sinon documenter et garder V6).
- Souches (3, débloquées par les étoiles) : Rumeur, Fracture, Écho — multiplicateurs sur BALANCE, sans nouveau système.

### C. Interface et rejouabilité
- Mise en page sans défilement : carte (≈ 60 % de l'écran) + barre compacte des 4 améliorations (niveau, coût, une ligne)
  + fiche détaillée en tiroir ; HUD en une ligne lisible (Progression / Réponse / Influence / jour / vitesse).
- Rendu incrémental (plus de `innerHTML` complet chaque seconde) : plus aucun tap perdu.
- Retour visuel : chiffres qui s'envolent, pulsation à l'achat, journal vivant (dernier événement en bandeau).
- Écran de fin : étoiles (1-3), record, chronologie, boutons « Rejouer » / « Menu » ; égalité expliquée.
- Méta-progression locale : étoiles → souches puis origines « difficiles » ; **défi du jour** (graine = date, record perso).
- Onboarding contextuel (branche existante) fusionné, testé, + conseils « bulles », « capacités », « mur de gravité ».
- Bugs : noms au lieu des identifiants (« Commencer à Fenwick »), ligne de journal périmée, menu « V5 » → version réelle.

### D. Production
- `vite.config.js` : base relative ; build Android = build commercial embarqué pour l'AAB.
- **Bêta APK qui se met à jour seule** (comme ARKEN) : workflow `android-apk.yml`, Release `beta` à adresse fixe, clé de
  débogage stable, `server.url` vers GitHub Pages. versionCode/versionName automatiques depuis `package.json`.
- Interface commerciale propre (plus de libellés « simulation » ni d'achat gratuit en build commercial).
- **×4 gratuit pour tous** ; Premium = « sans pub » (décision du studio : achats de confort seulement).
- `CLAUDE.md` du dépôt + ce cahier ; `package.json` en 7.0.0.
- Hors V7 (à décider par Jack, rien de payant activé) : AdMob réel + consentement UE, politique de confidentialité,
  fiche Play, clé d'importation, appId définitif.

## 4. Organisation (équipes)
- Équipe **Moteur** (`src/engine/`, `scripts/`, tests moteur) ; équipe **Carte** (`src/ui/map*`, données de géométrie,
  outils de génération) ; équipe **Interface & production** (`hud`, `screens`, `main`, `style`, `save`, services,
  workflows, `vite.config.js`). Contrat d'API moteur ↔ interface défini par le chef de projet ; intégration, vérification
  (tests, Chrome mobile simulé, relecture indépendante), Pull Request et fusion par le chef de projet.

## 5. Réalisé
(à compléter à la fin de la version)
