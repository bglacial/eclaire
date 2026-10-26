# Recette Éclaire France

Vérifications réalisées le 25 octobre 2026. La recette du navigateur ne constitue pas une validation sur téléphone Android réel.

## Automatisé

- **25 tests TypeScript** : routage local, 400 graphes comparés à Bellman-Ford pour deux critères, sens uniques, absence de chemin, restrictions, optimalité, polylignes d’animation, séquence de confirmation, extinction finie, protocole national, manœuvres invalides, UTF-8, réponse tronquée et six tests de progression GPS.
- **7 tests Java** : critères différents, direction légale des arêtes de la trace inverse, invariance avec l’algorithme non instrumenté, sens uniques, absence de trajet, même point, restrictions de virage, première rencontre, interruption, budget dépassé, consignes françaises et 200 comparaisons du mode landmarks à Dijkstra.
- Vérification TypeScript et build Vite réussis.
- Synchronisation Capacitor Android réussie, avec permission de géolocalisation et identification de l’application.
- Lanceur Maven embarqué vérifié : Maven 3.9.11, Java 21.
- `docker compose config --quiet` réussi. L’image Docker n’a pas été construite.

## Import réel France et essais HTTP

Source Geofabrik France, base OSM du **24 octobre 2026 à 20:20:51 UTC**. Import achevé, index spatial et composantes connectées préparés. Le service `/api/health` répond `ready` avec **19 561 144 nœuds** et **24 760 300 arêtes** dans le graphe. Le service n’annonce pas que toutes ces arêtes sont accessibles en voiture.

| Cas public | Résultat |
|---|---|
| Paris–Lyon, temps | 463 722 m, 15 527,616 s, 8 453 604 états, 6 232,6 ms de calcul |
| Paris–Lyon, distance | 441 132 m, 33 967,195 s, 10 919 480 états, 7 633,8 ms de calcul |
| Ajaccio–Bastia, temps | 147 634 m, 8 096,547 s, 86 424 états, 26,2 ms de calcul |
| Brest–Marseille, temps | 1 282 556 m, 43 053,182 s, 20 083 856 états, 16 609,7 ms de calcul |

La réponse rapide Paris–Lyon contenait environ 12,6 Mo de NDJSON. Son décodage TypeScript a été exercé sur les données réellement renvoyées : **29 978 événements par front**, 847 arêtes finales, toutes continues géométriquement. La trace visuelle est un sous-ensemble annoncé (1/141 par front), le résultat et la preuve restent complets.

Le premier essai avec les points de centre-ville a révélé un raccordement à un petit réseau isolé. Le service prépare maintenant les sous-réseaux et les exclut du raccordement. Le budget initial de 8 millions d’états a également été insuffisant ; son dépassement a produit une erreur explicite, pas un itinéraire prétendument optimal. Le défaut est maintenant de 40 millions, avec une limite temporelle de 120 secondes.

## Interface exercée

- Carte nationale et bouton **FR**, choix d’adresses et de centres-villes, cadrage des points.
- Proxy Vite vers le service national vérifié : `/api/health` renvoie bien du JSON `ready`, pas la page HTML de l’application. Un Vite démarré avant l’ajout du proxy doit être redémarré.
- Louvre–Panthéon calculé depuis le service national : deux fronts et résultat affichés (environ 2,47 km / 6 min avec ce profil et ces raccordements).
- Paris–Lyon lancé depuis les champs de l’interface : phase de calcul, lecture de la trace et indication explicite de l’échantillonnage vérifiées.
- Le nouveau rendu garde les repères au-dessus du halo, adapte les têtes au zoom et met en cache les routes visitées. La reprojection complète est différée à la fin des déplacements de carte.
- Les essais sont effectués dans un onglet de recette séparé, avec des lieux publics. Les captures livrées ne contiennent pas les adresses saisies dans l’onglet de l’utilisateur.

## Limites

- Aucun APK compilé, aucun test sur appareil Android physique, aucune mesure de batterie ou de GPU modeste.
- Le paramétrage d’un service HTTPS pour Android n’a pas été déployé publiquement.
- Les restrictions OSM ambiguës ou non prises en charge signalées par GraphHopper ne sont pas toutes appliquées. Aucune validation de navigation légale n’est revendiquée.
- Les essais nationaux sont des points de contrôle, pas une recette exhaustive des routes françaises, des ferries ou des données d’outre-mer.
- Aucune intégration authentifiée de trafic réel. L’étude fournisseur et les limites sont dans `docs/trafic-en-direct.md`.

## Recette mobile finale

- **390 × 844**, calcul national rapide Paris–Lyon : résultat obtenu dans l’interface, 4 h 19, sans débordement de page ; repères A et B au-dessus du panneau. Le format de grande distance a ensuite été compacté pour garder « km » sur la même ligne.
- Interruption du calcul national depuis le bouton : message d’arrêt et relance disponibles.
- Relance avec **Le plus court**, **mode léger** et **préférence système de réduction des animations** : résultat réel 441,1 km / 9 h 27. Aucun débordement ; la métrique de distance tient sur une ligne (27,5 px de hauteur).
- **320 × 640**, même résultat national : aucun débordement, bouton principal visible, les deux repères restent au-dessus du panneau (repères jusqu’à 189 px, panneau à 215 px).
- Le test de coordonnées invalides renvoie HTTP 400 ; une origine CORS non autorisée renvoie HTTP 403.
- Les dimensions et préférences émulées ne concernent que l’onglet de recette et sont rétablies après les tests. La recette ne prouve pas la fluidité sur matériel modeste.
- Après rétablissement du grand écran et du mode complet, Paris–Lyon rapide a été recalculé jusqu’à la convergence et au résultat 463,7 km / 4 h 19. Un déplacement de carte suivi d’un recentrage conserve l’alignement du parcours. Capture publique : `docs/eclaire-france.png`.

## Guidage GPS — recette avec position simulée

Le navigateur de recette ne permet pas d’accorder la permission de géolocalisation par la commande CDP testée. Un harnais séparé, `tests/gps-ui.html`, injecte donc **uniquement des positions GPS simulées**, clairement signalées en jaune. Le moteur France et ses manœuvres restent réels. Le harnais est exclu des builds web et Android. Aucune position de l’utilisateur n’est utilisée.

- HTTP réel Louvre–Panthéon : **2 466,05 m / 338,81 s**, 83 points géométriques. Les manœuvres françaises commencent à 0 m, puis virage à droite sur Pont Notre-Dame à 903,98 m, virage à gauche sur Rue Soufflot à 2 081,49 m, rond-point et arrivée à la longueur exacte du chemin. La géométrie et les consignes ont été décodées par les modules TypeScript livrés.
- **390 × 844** : guidage actif, « Dans 180 m, tournez à droite sur Pont Notre-Dame », 1,7 km / 5 min restants, précision ± 5 m ; aucune largeur de page excédentaire, position dégagée au-dessus du panneau. Capture : `docs/eclaire-gps-mobile.png`, bandeau GPS simulé visible.
- Mise à jour avant le virage : « Maintenant », puis après le virage : consigne Rue Soufflot à 1,1 km. L’application utilise bien la progression sur les polylignes.
- GPS imprécis (150 m) : consigne et métriques suspendues. Sortie de route : avertissement et bouton de recalcul. Le recalcul réel change le départ en « Ma position GPS », reprend un seul suivi ; un point encore éloigné d’une route raccordée reste explicitement hors trajet.
- Refus de localisation simulé : état en pause, **0 suivi GPS** ; reprise autorisée : un seul suivi. Arrivée confirmée sur deux mises à jour espacées de plus de trois secondes : « Vous êtes arrivé au point routier », **0 suivi GPS**.
- **320 × 640**, préférence de mouvement réduit : résultat et bouton GPS accessibles sans débordement (bouton entre 543 et 589 px). Le guidage affiche la consigne. La simulation de masquage met le guidage en pause et libère le suivi (0), avec action de reprise.
- Le son vocal, les permissions réelles du système, le déplacement sur route, le passage en arrière-plan Android et l’autonomie n’ont pas été validés sur matériel physique.

## Déploiement Raspberry — 26 octobre 2026

- Raspberry Debian 13 ARM64, **2 Go de RAM**, service utilisateur persistant sur `127.0.0.1:8788`, Java Temurin 21.0.13 ARM64 vérifié par SHA-256. Le port Hermes 8787 est conservé.
- Dijkstra complet ne tient pas dans le budget du Pi. A* avec simple borne géographique a également épuisé 900 Mo sur Brest–Marseille. Deux index de huit landmarks ont donc été préparés sur le Mac (environ 201 s + 177 s), puis transférés avec le graphe. La lecture utilise bien la trace du nouvel algorithme, sans raccourcis CH.
- Le réglage final emploie les **huit** repères actifs. Un essai à quatre repères dépassait le budget de deux millions d’états sur Brest–Marseille ; il n’a pas été présenté comme optimal. Le mode final passe les cinq cas de `ops/smoke-routing.py` directement sur le Raspberry, avec 512 Mo de tas Java.
- Optima retrouvés : Paris–Lyon rapide 463 722,17 m / 15 527,616 s ; Paris–Lyon court 441 131,69 m ; Brest–Marseille rapide 1 282 555,69 m / 43 053,182 s ; Brest–Marseille court 1 096 550,70 m ; Ajaccio–Bastia rapide 147 634,49 m / 8 096,547 s.
- La référence Dijkstra indépendante du trajet court Brest–Marseille a aussi été calculée sur le Mac : coût 1 096 550,6994009018, **20 632 714 états**, identique au résultat indexé à la précision numérique près.
- Après la recette Pi : environ **771 Mio de RSS** et **1 006 Mio au pic** pour Java, fichiers mappés compris. `MemoryCurrent` n’est pas exposé par le gestionnaire utilisateur de ce Pi : les limites cgroup configurées ne sont donc pas annoncées comme vérifiées. Les services Nginx, Hermes, Mailaya et See My Dish restent actifs.
- HTTPS public `/api/health` : HTTP 200, validation TLS réussie ; HTTP redirige vers HTTPS avec 301. Le moteur annonce `A* bidirectionnel · landmarks` et les 19 561 144 nœuds du graphe national.
- Le premier vhost envoyait `Referrer-Policy: same-origin`, incompatible avec les requêtes de tuiles OSM. Correction dans le build : métadonnée de référent et attribut explicite `referrerPolicy` des tuiles à `strict-origin-when-cross-origin`. Les images chargent et la carte publique affiche de vraies tuiles, sans texte de blocage. Le script d’installation utilise désormais aussi la politique compatible.
- Navigateur public : Louvre–Panthéon calculé par le Raspberry, résultat 2,47 km / 6 min, action GPS disponible. Capture `docs/eclaire-raspberry-live.png` ; seuls des lieux publics sont saisis.
- Lab public : six liens dans la scène solaire, catalogue à six entrées, carte Éclaire et lien externe `https://eclaire.nriault.fr/` confirmés après publication de `bglacial/lab`.
