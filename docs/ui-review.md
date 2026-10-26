# Revue UI Éclaire — 26 octobre 2026

Périmètre : application cartographique existante, web et Android, sans changement de calcul.
Skill demandé : design-taste-frontend v2. Direction « The product performs », seed 1445287193, palette et typographie conservées. Son principe de démonstration réelle convient à Éclaire ; ses sections marketing, sa galerie et son défilement narratif ne conviennent pas à une carte manipulable. Aucun faux écran, photographie de remplacement ou vidéo décorative ajouté.

## Intention avant réalisation

Inventaire propre au sujet : nom Éclaire ; deux fronts cyan et ambre ; départ A et arrivée B ; vrai graphe automobile OSM ; preuve après la première rencontre ; choix temps/distance ; métropole et Corse ; trace échantillonnée annoncée ; GPS uniquement sur téléphone ; service personnel sur Raspberry ; durées sans trafic.

Idée : les deux recherches réelles deviennent le spectacle central ; les commandes ne prennent que l’espace nécessaire pour le lancer et lire son résultat.
Interaction principale : choisir deux points et observer leur véritable exploration bidirectionnelle.

Argument et preuve par état :
- Choisir : deux champs lisibles, carte accessible, position et permutation explicites.
- Explorer : deux fronts sur les routes, progression et interruption disponibles.
- Lire : durée et distance prioritaires, adresses conservées, modification des points accessible.
- Comprendre : aide à la demande, limites et provenance complètes.

Texte prévu : « Votre itinéraire » ; « Deux fronts explorent les routes. » ; « Départ » / « Arrivée » ; « Ma position » / « Permuter » ; « Le plus rapide » / « Le plus court » ; « Explorer le trajet » ; « Modifier le trajet » ; « Trajet trouvé » ; « Estimation sans trafic en direct. » ; « Comment ça marche ».

## ROUND 1 — avant

Seen in one second: panneau sombre et carte chargée de noms en double.
Idea (one sentence): deux fronts routiers font converger deux points.
Live thing: calcul réel sur la carte.
Layout words by section: sélection=panneau / carte=plein écran / résultat=ajout au panneau / aide=surcouche.
Scores: design 6 · usability 6 · creativity 8 · content 7 → overall 6.0.
Caps applied: échecs de l’inspecteur ; libellés minuscules et ombres décoratives.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. desktop-fold.jpg : toponymes OSM et annotations locales se superposent ; utiliser un seul jeu de noms et garder le réseau vectoriel en secours de chargement.
2. mobile-fold.jpg : textes de 6–12 px, permutation et choix de carte étroits ; plancher de 13 px et cibles de 44 px.
3. résultat mobile précédent : les deux adresses comprimées côte à côte nuisent à la lecture ; résultat compact avec noms complets et formulaire modifiable replié.

Audit initial : lint 38 FAIL / 16 WARN ; inspecteur à 1440, 768, 390 : 6 FAIL / 3 WARN. Captures dans .taste-skill/before/ (cache local).

## ROUND 2 — après la refonte

Seen in one second: les deux champs et l’action, devant la carte.
Idea (one sentence): la carte est la démonstration réelle, les commandes la déclenchent.
Live thing: sélection, calcul exact, résultat et retour à l’édition.
Layout words by section: sélection=instrument / carte=surface / résultat=lecture compacte / aide=dialogue.
Scores: design 7.2 · usability 7.4 · creativity 8 · content 8 → overall 7.5.
Caps applied: aucun échec de mesure ; l’absence de vidéo est justifiée par la carte animée réelle.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. tablet-fold.jpg : la légende concurrence l’attribution ; la relever et réserver leur place respective.
2. recette 320 px : la barre de zoom masque A ; réserver l’espace des commandes au cadrage et alléger les commandes en lecture compacte.
3. recette clavier/recherche : focus perdu lors du repli, puis suggestions coupées par le panneau ; retourner le focus au bouton d’édition et placer les options dans le flux du formulaire.

## ROUND 3 — vérification finale

Seen in one second: trajet à préparer ou durée/distance du trajet trouvé.
Idea (one sentence): les deux fronts font vivre la carte, la lecture reste calme.
Live thing: moteur routier réel et sélection des points ; aucun calcul simulé dans le produit livré.
Layout words by section: sélection=instrument / carte=surface / résultat=lecture compacte / aide=dialogue.
Scores: design 7.5 · usability 8 · creativity 8 · content 8 → overall 7.8.
Caps applied: aucun ; note éditoriale interne, pas une évaluation indépendante.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. Collisions précédentes corrigées : légende tablette distincte de l’attribution ; A/B visibles au-dessus du résultat à 320 × 640.
2. Suggestions corrigées : recherche « Louvre » à 320 px, liste lisible et défilable, choix réel « Musée du Louvre », retour aux commandes.
3. Focus corrigé : résultat → « Modifier le trajet » ; aide native → focus de fermeture, Échap → retour à Aide. La carte derrière le dialogue est inactive.

### Preuves et limites

- Inspecteur réel à 1440, 768, 390 px : **0 FAIL**, un WARN `no-footage`. Une vidéo décorative gênerait l’usage de la carte ; le mouvement pertinent est l’exploration Canvas réelle après action. Les images sont les tuiles cartographiques OSM, avec attribution conservée. Aucun nouvel asset externe ni contenu d’exemple inventé.
- Lint : **0 FAIL**. Trois avertissements justifiés : deux `padStart` pour les minutes, et les tirets de métriques indisponibles du GPS. `text-shadow: none` est une remise à zéro du style Leaflet, pas une ombre.
- **31 tests TypeScript réussis**, build TypeScript/Vite réussi. Pas de changement du moteur ni des coûts d’itinéraire.
- Interface navigateur : vrai Louvre–Panthéon, environ 2,47 km / 6 min ; champs repliés puis réouverts, interruption puis relance disponibles.
- Harnais de recette explicitement signalé : erreurs injectées 429, réseau et aucun itinéraire ; message visible, aucune fausse route et bouton de relance présent.
- Téléphone simulé 320 × 640 : résultat avec A/B visibles ; vrai itinéraire et manœuvre « Dans 180 m, tournez à droite sur Pont Notre-Dame », un suivi GPS simulé, puis zéro après fermeture.
- GPS public simulé à Lyon : repère de 34 px entre les limites visibles de la légende et du panneau ; les commandes ne le couvrent pas. Aucun GPS réel de l’utilisateur utilisé.
- Une carte réduite à zéro puis restaurée reprend le rendu sans erreur Canvas. La garde évite `drawImage` sur un canvas de taille nulle.
- Les captures dans `docs/eclaire-ui-*.png` et `docs/eclaire-ui-*.jpg` montrent les états réellement vérifiés. Le bandeau jaune identifie les captures du harnais.
- Pas de mesure sur téléphone physique, de conduite réelle ni d’autonomie ; la recette en navigateur et le build APK ne remplacent pas ces vérifications.

Livraison Android : APK **1.0.2 / code 3**, compilation Gradle réussie, signature v2 et alignement vérifiés ; URL API publique HTTPS embarquée et harnais de recette absent. Le web utilise `/api` et l’APK la même API derrière le domaine public. Le moteur serveur reste inchangé.


## Refonte claire du 26 octobre 2026

Direction confirmée par l’utilisateur : carte claire, interface épurée, inspiration du site personnel nriault.fr sans copier son portfolio. Les surfaces claires reprennent son assurance typographique ; cobalt pour l’action et le trajet final, citron pour le symbole. Les fronts réels restent cyan et ambre. Aucune nouvelle dépendance.

Skills appliqués : impeccable pour le contexte et la composition produit ; improve-animations pour l’audit en lecture seule ; animate pour la réalisation ; [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) pour les contrôles d’interface. Le plan de mouvement est dans `plans/001-motion.md`.

Recette navigateur actuelle :
- Préparation et résultat Louvre–Panthéon, puis vrai Téloché–Le Barcarès via la recherche IGN : résultat national trouvé, 824,7 km et 7 h 34 sans trafic pour les centres IGN de cette recherche.
- Clavier : sélection des deux suggestions avec Entrée, action de calcul, restitution du focus à « Modifier le trajet » ; l’aide native prend le focus et se ferme avec Échap.
- Carte en mode réduit : déplacement aux flèches sans classe d’animation de pan ni de zoom ; zooms immédiats, inertie désactivée. Les boutons de zoom et les suggestions n’ont pas de pression animée.
- À 320 × 640 : aucun débordement horizontal, repères A/B visibles, panneau défilable, suggestions accessibles dans le flux. Les options actives sont amenées dans la zone visible au clavier. À 390 × 844, le résultat garde les adresses, durée et distance lisibles.
- Pendant l’exploration, les champs se replient et l’interruption reste disponible. Le cadrage réserve une marge supplémentaire au repère B au-dessus de la barre de lecture.
- Contrôles sémantiques : labels des champs, name et spellcheck explicites, noms des boutons à icône, lien d’évitement, status des mises à jour, attribution OSM conservée, cibles d’au moins 44 px pour les commandes.

Capture d’un vrai résultat local : `docs/eclaire-clear-long-route.png`. Ce document n’est pas une certification WCAG. Le harnais GPS simulé a aussi été rejoué : manœuvre « Dans 180 m, tournez à droite sur Pont Notre-Dame », panneau lisible, ligne de guidage cobalt, puis zéro suivi GPS après fermeture. Capture : `docs/eclaire-clear-gps-simulated.png`. Pas de conduite réelle, d’essai sur téléphone physique, de reconstruction APK ou de publication dans cette refonte.
