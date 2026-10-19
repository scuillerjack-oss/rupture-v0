# RUPTURE — Cahier des charges V8 « L'Éveil »

**Statut : en attente de validation par Jack. Aucune production lancée.**

Commande de Jack (19/10/2026, retour sur la bêta V7) :
« la musique est un carnage » ; « le joueur doit développer une IA maléfique » ; « les bulles sont une super idée
mais on ne les voit pas trop » ; « on est gêné par les informations, il faudrait les afficher ailleurs » ;
vibrations d'accord, **mais désactivables dans les Paramètres**.
Base : `main` V7.0.0 (commit 53a0938). Aucune reconstruction : on modifie l'interface, les textes et l'audio,
**pas les règles du moteur**.

## 1. Diagnostic (capture de Jack, Xiaomi, jour 11, Nyxor)
1. **Les bulles sont cachées par l'interface.** Deux surimpressions sont posées sur le bas de la carte : la fiche
   de région (« Nyxor · origine — Crise 18 % · Conscience 0 % · Confinement 0 % ») et le bandeau du journal.
   Les bulles de Nyxor apparaissent juste derrière, au-dessus du nom de la région (`bubbleSpots`). La taille (40 px)
   n'est pas le vrai problème : c'est l'endroit où elles s'affichent.
2. **Les bulles se confondent avec la carte.** Une bulle rouge sur une région qui rougit avec la crise, c'est
   du rouge sur du rouge, et le contraste baisse justement là où les bulles apparaissent (régions en crise).
3. **La carte est encombrée.** En plus de la fiche et du journal, il y a la puce « Course indécise » et le bouton
   recentrer. Les 4 améliorations prennent 4 lignes pleines largeur (≈ 190 px) sous la carte.
4. **La musique ne ressemble pas à une musique.** `src/audio/audio.js` joue un thème de 8 notes puis **35 à 65 s
   de silence** (choix V5.2). Il n'y a ni rythme, ni basse, ni accords : on entend quelques notes isolées.
   Historique à garder en tête : la V5.1 (nappe d'accords continue) a été jugée « trop sombre / angoissante ».
5. **Le thème « l'Anomalie » est abstrait.** Le joueur ne sait pas ce qu'il incarne. Une IA qui échappe au contrôle
   est plus parlante en 2026, et le nom du jeu s'y prête : la Rupture devient le moment où l'IA dépasse l'humanité.

## 2. Objectifs V8 (critères d'acceptation)
- **Carte dégagée** : plus aucune information posée sur le bas de la carte. Sur la carte ne restent que la puce
  de projection (en haut à gauche, une ligne) et le bouton recentrer.
- **Bulles visibles à 100 %** : en vue d'ensemble, aucune bulle ne chevauche un élément d'interface (test automatique
  sur une partie complète). Contraste bulle / région ≥ 3:1 quel que soit l'état de la région.
- **Carte au moins aussi grande qu'en V7** malgré les infos sorties de la carte (améliorations en 2 × 2).
- **Vibrations** à l'apparition des bulles et des événements, **désactivables dans Paramètres** (réglage mémorisé).
- **Thème IA** sur tous les textes et la palette, **sans changer une seule règle** : simulations identiques à la V7.
- **Une vraie musique** : morceaux composés, libres de droits (CC0), qui tournent en boucle sans coupure,
  choisis par Jack à l'oreille avant intégration.
- Sauvegardes V7 relues sans perte (identifiants et clés inchangés).

## 3. Contenu

### Lot 1 — Mise en page et bulles (priorité 1 : c'est ce qui gêne en jouant)
Nouvelle colonne de l'écran de jeu, de haut en bas (390 × 844 et 393 × 873, taille du Xiaomi de Jack) :

| Bloc | Hauteur | Contenu |
|---|---|---|
| HUD | 46 px + barre de course 4 px | inchangé |
| **Bandeau du journal** | 24 px | dernier message, une ligne, animé quand il change ; touché = 5 derniers messages |
| **Carte** | tout le reste (≥ 55 % de l'écran) | puce de projection en haut à gauche, bouton recentrer en haut à droite, rien d'autre |
| **Fiche de région** | 30 px, hauteur fixe | « Nyxor · origine — Contrôle 18 % · Vigilance 0 % · Isolement 0 % » ; sans sélection : « Touche une région » ; en ciblage, la consigne de ciblage prend cette place |
| Capacités | inchangé (3 boutons) | |
| **Améliorations en grille 2 × 2** | ≈ 2 × 50 px | icône + nom + niveau, bouton d'achat avec le coût ; toucher le nom ouvre le tiroir (inchangé) |

- Hauteurs **fixes** pour le bandeau et la fiche : rien ne saute quand un message ou une sélection change.
- L'obstacle (« Dangerosité 8 requise ») et l'adaptation de l'Humanité passent dans la fiche ou le bandeau
  (plus de puce supplémentaire sur la carte).
- Petits restes de la V7.1 traités au passage : le message court ne masque plus la projection (ils ne sont plus
  au même endroit) ; « Course indécise » remplacée avant le jour ~150 par « Trop tôt pour prévoir ».

**Bulles** (`src/ui/worldMap.js`, `worldMap.css`) :
- Diamètre 44 px (zone tactile 60 px), taille constante à l'écran quel que soit le zoom (comme en V7).
- **Corps clair** (blanc teinté), contour sombre de 2 px et halo de couleur : lisible sur n'importe quelle région.
  Bulle de l'IA : halo violet néon, icône ◆ ; bulle humaine (« correctif ») : halo bleu, icône 🛠.
- Apparition : petit « pop » + une onde qui s'élargit (0,6 s), puis légère pulsation continue.
- **Zone interdite** : le choix de l'emplacement (`pickSpot`) écarte tout emplacement qui sort de la carte visible ou
  passe sous la puce de projection ou le bouton recentrer ; si aucun emplacement préféré ne convient, la bulle est
  posée au plus près à l'intérieur de la zone libre.
- **Bulle hors de l'écran** (quand on a zoomé) : une petite flèche au bord de la carte indique sa direction ; la toucher
  recentre la vue sur la bulle.

### Lot 2 — Vibrations (optionnelles)
- **Paramètres › Audio et vibrations › Vibrations : Activées / Coupées.** Activées par défaut, réglage mémorisé
  dans une **nouvelle** clé `rupture-v0-haptics` (aucune clé existante renommée).
- Quand : bulle de l'IA qui apparaît (impulsion courte, 25 ms) ; bulle humaine (double impulsion) ; événement à choix
  (60 ms). **Jamais plus d'une vibration toutes les 1,5 s** (sinon en ×4 le téléphone vibrerait sans arrêt).
  Aucune vibration en pause, partie finie, ou appli en arrière-plan.
- Technique : extension officielle gratuite `@capacitor/haptics` dans l'APK ; `navigator.vibrate` en navigateur ;
  rien du tout (sans erreur) si le téléphone ne le permet pas.
- **À savoir** : c'est une extension native, donc **Jack devra réinstaller l'APK de bêta une fois** (les mises à jour
  automatiques ne concernent que le contenu web). Sur Xiaomi, le réglage système « retour haptique » doit être actif.

### Lot 3 — Thème « IA » (textes, couleurs, aucun changement de règle)
**Ton** : l'IA cherche à **prendre le contrôle** de l'humanité, pas à l'exterminer. Pas de violence explicite,
aucune marque ni personne réelle (pas de « ChatGPT », pas de nom d'entreprise). Fin de victoire : l'humanité ne
contrôle plus rien ; fin de défaite : le « kill switch » éteint l'IA.

**Lexique** (seuls les textes affichés changent ; identifiants, clés de sauvegarde et `kind` restent les mêmes) :

| V7 | V8 |
|---|---|
| l'Anomalie | l'IA (nom par défaut : **AXIOM**) |
| Crise d'une région | **Contrôle** (part de la région sous contrôle de l'IA) |
| Conscience | **Vigilance** |
| Confinement | **Isolement** (régions coupées du réseau) |
| Influence (monnaie, « inf. ») | **Données** (coûts affichés en « Mo ») |
| Progression / Réponse (HUD) | **Contrôle mondial** / **Kill switch** |
| Bulle d'Influence / bulle de recherche | **Paquet de données** / **Correctif humain** (toucher = le saboter) |
| Propagation · Dangerosité · Résilience · Discrétion | **Infiltration · Puissance · Redondance · Furtivité** |
| Sursaut · Brouillage · Percée | **Surcharge** · Brouillage · Percée |
| Souches Rumeur · Fracture · Écho | **Deepfake** · Fracture · Écho |
| Phases : Ignorance → Maîtrise imminente | Insouciance · Soupçons · Alerte mondiale · Contre-mesures · Kill switch imminent |
| Routes terrestres · maritimes ⚓ · aériennes ✈ | Fibre · câbles sous-marins · liaisons satellites 🛰 |
| Origine | **Premier serveur** (« Nyxor : premier serveur infecté. AXIOM s'éveille. ») |

- Noms des 18 régions **inchangés**.
- **Les 30 événements réécrits** dans le thème avec **exactement les mêmes effets et nombres**. Exemples :
  festival → lancement d'un smartphone ; presse sceptique → expert rassurant à la télévision ; cargo → mise à jour
  logicielle ; panne géante → inchangée.
- Conseils, écran d'origine, écran de fin, journal, menu et fiche Paramètres réécrits.
- **Palette** : régions de l'ardoise vers le **violet / magenta** selon le Contrôle (au lieu du rouge) ; HUD
  Contrôle mondial en violet, Kill switch en bleu ; routes = traits de données lumineux animés ; écran titre retouché.
  L'icône de l'appli reste la même en V8 (à revoir pour la fiche Google Play).
- **Petit plus, optionnel** : le joueur peut renommer son IA (12 caractères) sur l'écran d'origine.

### Lot 4 — Musique (après le choix de Jack)
- **Étape 0, avant toute production** : une page d'écoute (lien à ouvrir sur le téléphone) avec 2 ou 3 morceaux
  candidats par ambiance. **Jack choisit à l'oreille.** Rien n'est intégré sans son choix.
- Ambiances :
  1. **Éveil** (début de partie) : électro douce, curieuse, avec une vraie mélodie, pas sombre ;
  2. **Escalade** (quand le Kill switch ou le Contrôle mondial dépasse 50 %) : plus de rythme, tension ;
  3. **Deux courts jingles** (5-10 s) : victoire et défaite.
- **Licence : CC0 / domaine public uniquement** (usage commercial et dans une appli autorisé, sans mention obligatoire).
  Chaque fichier est consigné dans `docs/LICENCES-AUDIO.md` : titre, auteur, adresse de la source, licence,
  date de téléchargement. Si un morceau préféré n'est pas en CC0 : on demande à Jack, rien de payant.
- Lecture : boucle **sans coupure** (Web Audio), fondu de 3 s entre Éveil et Escalade, musique nettement plus basse
  que les effets ; **coupée quand l'appli passe en arrière-plan**, reprise au retour. Fichiers OGG, **6 Mo maximum
  au total**, chargés après le premier toucher et gardés pour jouer hors ligne.
- Le thème procédural actuel est supprimé ; les effets sonores (validés en bêta) restent, éventuellement
  retouchés en sons plus « numériques ».
- Réglages existants « Musique » et « Effets sonores » conservés (mêmes clés).

## 4. Vérifications avant fusion (règles de `CLAUDE.md`)
- `npm test` vert, avec de nouveaux tests :
  - aucune bulle ne recoupe un élément d'interface sur une partie complète en 390 × 844 et 393 × 873 ;
  - contraste bulle / région ≥ 3:1 pour tous les niveaux de Contrôle ;
  - vibrations coupées → aucun appel ; limite d'une vibration toutes les 1,5 s ; réglage relu après redémarrage ;
  - aucun texte affiché ne contient « Anomalie », « Crise », « Conscience » ou « Confinement » ;
  - sauvegarde V7 relue en V8 sans perte ;
  - musique : boucle, fondu, arrêt en arrière-plan, taille totale ≤ 6 Mo, fichier de licences présent.
- **Simulations d'équilibrage rejouées : résultats identiques à `docs/v7-simulation-results.json`** (aucune règle
  touchée ; toute différence bloque la fusion).
- Partie complète en Chrome mobile simulé (Playwright) aux deux tailles, aucune erreur console, aucun défilement.
- Relecture par un sous-agent indépendant sans point bloquant.
- `package.json` en 8.0.0, section « Réalisé » de ce cahier remplie.

## 5. Organisation
1. **Étape 0** : page d'écoute musicale → choix de Jack.
2. **Production V8** (une seule version à la fois), dans l'ordre : Lot 1 → Lot 2 → Lot 3 → Lot 4.
   Équipes : **Interface** (lots 1 et 2), **Contenu** (lot 3 : textes, événements, palette), **Audio** (lot 4).
   Le moteur (`src/engine/`) ne change pas, sauf ses textes affichés.
3. Intégration, vérifications, Pull Request et fusion par le chef de projet ; nouvel APK de bêta à réinstaller une fois.

## 6. Décisions à valider par Jack (sinon les choix par défaut ci-dessus s'appliquent)
1. Le ton : « prendre le contrôle » plutôt que « détruire l'humanité » (recommandé).
2. Le lexique du lot 3, notamment Données / Mo, Kill switch et le nom AXIOM.
3. Les morceaux de musique (étape 0).
4. Le renommage de l'IA par le joueur : en V8 ou plus tard.

## 7. Réalisé
_(à remplir à la fin de la V8)_
