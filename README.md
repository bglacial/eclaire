# Éclaire

Une interface web et Android pour voir deux fronts cyan et ambre explorer de vraies routes, puis converger vers le meilleur trajet. La version France utilise un **service routier dédié**, avec recherche bidirectionnelle instrumentée, et conserve la démo Paris embarquée en secours.

## Lancer la version France

Prérequis : Node.js 22.12+, **Java 21**, et de la place pour les données. Maven est fourni par `server/mvnw` et téléchargé à sa première utilisation. L’extrait OSM pèse environ **5,1 Go** et le graphe préparé environ **2 Go**. Prévoir une machine avec **16 Go de RAM minimum**, davantage pour partager le service avec d’autres usages. Le lancement proposé plafonne le tas Java à 12 Go.

Les données France et le graphe ont déjà été téléchargés et préparés dans ce workspace, dans `server/data/`. Ils sont volontairement exclus de Git.

```sh
npm ci
npm run build
npm run server:build
npm run server:start
```

Ouvrir **http://localhost:8787** : le même service sert le build web et `/api`. Attendre le message `Éclaire France ready`. Au premier lancement sur un nouvel extrait, l’import prend plusieurs minutes ; les lancements suivants réutilisent le graphe.

Pour développer avec rechargement automatique, garder le service Java démarré dans un terminal, puis lancer dans un autre :

```sh
npm run dev
```

Vite utilise habituellement **http://localhost:5173** et transmet `/api` au service sur le port 8787. Si Vite était déjà lancé avant l’ajout de `vite.config.ts`, le redémarrer pour activer le proxy. Ne pas ouvrir `index.html` directement en `file://`.

Le bouton **FR** montre toute la France métropolitaine et la Corse. Le départ et l’arrivée se choisissent par recherche ou en touchant la carte. Les repères A et B se déplacent au doigt. **Utiliser ma position** demande un point récent et précis, montre son incertitude et recentre sur les rues du départ ; une seconde pression annule l’attente. Sur mobile, choisir un point masque temporairement le panneau pour libérer la carte. Le parcours initial reste Louvre–Panthéon pour essayer immédiatement l’animation.

### Télécharger les données dans un nouveau checkout

Depuis la racine du projet :

```sh
mkdir -p server/data
curl --fail --location https://download.geofabrik.de/europe/france-latest.osm.pbf -o server/data/france-latest.osm.pbf.part && mv server/data/france-latest.osm.pbf.part server/data/france-latest.osm.pbf
```

Source : [Geofabrik France](https://download.geofabrik.de/europe/france.html), données [OpenStreetMap sous ODbL](https://www.openstreetmap.org/copyright). Le snapshot réellement importé est daté du **24 octobre 2026 à 20:20:51 UTC**. `/api/health` donne la date et les dimensions du graphe chargé.

Pour changer d’extrait, arrêter le service et choisir un **nouveau** `ECLAIRE_GRAPH_DIR` au redémarrage. Le remplacer au même emplacement ne force pas une réimportation. Conserver le cache précédent permet un retour arrière.

### Docker, en alternative

Avec les données déjà présentes dans `server/data/` :

```sh
docker compose up --build
```

Ouvrir http://localhost:8787. Le volume conserve les données et le cache ; le port est exposé uniquement sur la machine locale. Donner suffisamment de mémoire à Docker Desktop. La configuration Compose a été validée ; l’image Docker n’a pas été construite pendant cette réalisation, le service ayant été validé directement avec Java.

Sous Windows sans Docker, utiliser `server\mvnw.cmd -f server\pom.xml package` pour la construction Java.

## Raspberry Pi

Le profil à faible mémoire et les opérations de déploiement sont décrits dans [ops/README.md](ops/README.md). Adresse publique : https://eclaire.nriault.fr/.

## Android

Le même code web est embarqué avec Capacitor. Android Studio, SDK Android 36 et JDK 21 sont nécessaires. Le projet déclare un minimum API 24 et nécessite une WebView à jour.

Pour utiliser le routage national sur un téléphone, héberger **votre service** derrière HTTPS, autoriser l’origine native dans `ECLAIRE_ORIGINS`, puis créer `.env.local` :

```dotenv
VITE_ROUTING_API_URL=https://votre-service.example/api
```

Cette URL désigne votre serveur, pas un fournisseur d’itinéraires externe. Aucune clé Google Maps ou de trafic n’est nécessaire. Les variables `VITE_*` sont publiques dans le bundle ; ne jamais y placer de secret.

```sh
npm run android:sync
npm run android:open
```

Dans Android Studio, choisir un appareil ou un émulateur et lancer **Run**. Après chaque modification web, refaire `npm run android:sync`. Pour un APK de développement :

```sh
cd android
./gradlew assembleDebug
```

Sortie : `android/app/build/outputs/apk/debug/app-debug.apk`. Les permissions de localisation sont déclarées et demandées à l’usage. Le consentement du navigateur ou du système reste nécessaire.

La version nationale exige le service, une page HTTPS ou localhost, et un accès réseau pour les tuiles et le géocodage. Si le service est indisponible au démarrage, le calcul embarqué fonctionne uniquement pour des points raccordables dans l’extrait Paris. Il ne simule pas un trajet national. L’APK de test **1.0.1 / code 2** a été compilé, signé et contrôlé ; aucun téléphone physique n’a été validé ici. Pour ce déploiement, synchroniser avec `VITE_ROUTING_API_URL=https://eclaire.nriault.fr/api npm run android:sync`, puis reconstruire et réinstaller l’APK : la publication web ne modifie pas un APK déjà installé.

## Guidage GPS

Le guidage est réservé aux **téléphones** : bouton masqué et démarrage bloqué sur ordinateur et tablette, même dans une fenêtre étroite. La détection utilise le type d’appareil annoncé par le navigateur, pas la largeur de l’écran. Sur téléphone, calculer un trajet national, puis toucher **Démarrer le guidage GPS** et autoriser la localisation précise. Le service fournit les manœuvres GraphHopper en français sur le parcours effectivement calculé : virages, bifurcations et ronds-points selon les données importées. Le guidage affiche la prochaine manœuvre, sa distance, la distance restante et une durée estimée **sans trafic**. Il ne donne pas d’assistance de choix de voie de circulation.

La position et son cercle de précision apparaissent sur la carte. Le déplacement manuel de la carte suspend le recentrage ; **Suivre ma position** le réactive. **Activer la voix** utilise la synthèse vocale du navigateur, si disponible ; sa disponibilité et le rendu audio restent à vérifier sur chaque WebView Android. **Quitter le guidage** libère le suivi GPS. L’arrivée au **point routier raccordé** est confirmée par au moins deux positions précises espacées de trois secondes, puis le GPS s’arrête.

Les positions de plus de 15 secondes ou de précision supérieure à 50 m suspendent les indications. Une sortie du trajet affiche un avertissement et le bouton **Recalculer depuis ma position** ; le recalcul est manuel, respecte le critère choisi et reprend le GPS après le nouveau résultat. Le raccordement à 2 km du moteur n’est pas une instruction pour rejoindre la route : si vous êtes loin d’une route accessible, le guidage reste hors trajet. Vérifier l’accès final à l’adresse choisie.

Le suivi fonctionne **avec l’application visible**. Masquer l’onglet ou l’application met le guidage en pause et libère le GPS ; le bouton **Reprendre le GPS** permet de reprendre. Aucun service Android d’arrière-plan, suivi écran verrouillé, navigation hors ligne ou maintien forcé de l’écran n’est ajouté. Le GPS reste sur l’appareil pendant le suivi ; un recalcul transmet la position au service routier configuré. Le fournisseur de fond de carte voit les zones consultées. Aucun historique GPS n’est enregistré par l’application.

Ce guidage est **expérimental** : rapprochement géométrique avec continuité bornée, sans map matching multi-hypothèse ni détection de sens de circulation. Des routes parallèles, superposées, des restrictions OSM ignorées ou un GPS peu précis peuvent rendre une instruction incorrecte. Respecter la signalisation. Le secours Paris sans manœuvres natives et les parcours de longueur nulle n’activent pas le guidage.

Pour rejouer la recette sans partager sa position réelle, lancer Vite et ouvrir `http://localhost:5173/tests/gps-ui.html`. Ce harnais affiche **GPS SIMULÉ** et permet d’injecter des positions publiques, un refus, une perte de signal et une sortie de route. Le calcul routier reste réel. Ce fichier de test n’est pas inclus dans le build Vite ni dans Android.

API utilisée : [Capacitor Geolocation v8](https://capacitorjs.com/docs/apis/geolocation), avec `watchPosition`/`clearWatch`, autorisation à l’usage et intervalle demandé de deux secondes sur Android. Sur le web, le GPS demande un [contexte sécurisé et une autorisation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition). Les manœuvres sont calculées avec [InstructionsFromEdges de GraphHopper 11](https://github.com/graphhopper/graphhopper/blob/11.0/core/src/main/java/com/graphhopper/routing/InstructionsFromEdges.java).

## Calcul et animation

- **France : GraphHopper 11.0**, sans raccourcis CH. Le mode par défaut utilise une heuristique nulle, équivalente à Dijkstra bidirectionnel. Le Raspberry utilise **A* bidirectionnel avec huit landmarks**, préparés séparément pour chaque critère. Les bornes ignorent les coûts de virage pour rester optimistes ; la recherche finale garde les restrictions et coûts complets. L’instrumentation de `TracedSearch` enregistre les arêtes réellement retirées des files et conserve la condition d’arrêt du moteur. Ce mode explore donc moins de routes ; il ne rejoue pas la trace d’un autre algorithme.
- **Le plus rapide** minimise le temps de parcours estimé. Le modèle a une influence de distance nulle ; il ne privilégie donc pas artificiellement les itinéraires courts.
- **Le plus court** utilise un poids exactement égal à la longueur, tout en conservant les accès et virages interdits. La durée du résultat est calculée selon les mêmes vitesses estimées.
- Les points sont raccordés aux routes carrossables à **2 km maximum**. Les petits réseaux isolés sont écartés du raccordement, les voies privées et de desserte exclues du profil. Le raccordement hors réseau n’est pas inclus dans la distance.
- **Trace indépendante du rendu** : le calcul enregistre des clés d’arêtes dans des tableaux compacts ; la géométrie est sérialisée après le calcul en NDJSON. Une lecture lente sur téléphone ne ralentit pas la recherche.
- Pour limiter la mémoire et le transfert, la trace France retient par défaut au plus environ **60 000 événements**, échantillonnés séparément sur les deux fronts. Le facteur est annoncé dans l’interface. Le calcul, son coût, la preuve et la géométrie finale ne sont pas échantillonnés.
- **Paris sans serveur** : le worker TypeScript précédent et son graphe orienté restent disponibles. Les anciennes limites d’extraction s’appliquent à ce secours local.

L’animation utilise Canvas 2D, sans bibliothèque de mouvement supplémentaire. Les routes visitées sont mises en cache dans un second Canvas, au lieu d’être retracées à chaque image. Les fronts suivent les polylignes, avec des têtes adaptées au zoom et des traînées décroissantes. Après confirmation : convergence des deux côtés pendant 500 ms, onde discrète, révélation par une impulsion de 900 ms. Il n’y a pas de scintillement aléatoire hors des routes ni de boucle décorative perpétuelle.

L’interruption éteint les fronts en 200 ms, annule la lecture et interrompt aussi le calcul serveur. Le mode léger réduit le pixel ratio, les halos et le nombre de fronts actifs. Avec `prefers-reduced-motion`, la route est présentée directement et les branches s’atténuent en 200 ms, sans déplacements ni onde.

## Carte, recherche et provenance

Le fond national utilise les tuiles standard OSM en HTTPS, à la demande, avec attribution visible. Pas de téléchargement massif ni de préchargement hors ligne. Le navigateur conserve sa gestion normale du cache. Le client Android s’identifie avec `Eclaire/0.2`. Pour une diffusion à fort trafic, configurer `VITE_TILE_URL` avec une infrastructure et une licence adaptées, et adapter l’attribution au fournisseur retenu. [Politique OSM](https://operations.osmfoundation.org/policies/tiles/).

La recherche nationale utilise le [géocodage IGN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/), avec temporisation de 300 ms et annulation des requêtes devenues inutiles. Le texte recherché est envoyé à l’IGN. L’index local et quelques centres-villes restent disponibles en secours. Les coordonnées d’itinéraire sont envoyées à votre propre service ; celui-ci n’enregistre pas les requêtes dans une base utilisateur.

Le graphe national actuellement chargé contient **19 561 144 nœuds et 24 760 300 arêtes**, dont des objets non accessibles au profil automobile. Il comprend **107 492 entrées de restriction de virage** importées. Ces nombres ne constituent pas un comptage des seules routes carrossables ni des seules relations OSM uniques.

Le fichier Geofabrik peut conserver des objets et des relations au-delà de la frontière. La sélection est cadrée sur la métropole et la Corse, mais l’optimalité s’entend dans le graphe chargé, pas dans un réseau mondial complet. Les données d’outre-mer ne sont pas chargées.

Le petit extrait Paris, sa requête et son horodatage restent dans `public/data/paris.json` et `public/data/provenance.json`. Les bases OSM et leurs adaptations restent soumises à l’ODbL ; les attributions sont affichées sur la carte.

## Vérifications

```sh
npm test
npm run server:test
npm run build
npm run android:sync
```

Résultats : **31 tests TypeScript réussis**, dont la détection téléphone, les permissions précises, les coordonnées GPS, les annulations et la compatibilité sans `AbortSignal.any/timeout`. Ils comprennent aussi l’oracle Bellman-Ford sur 400 graphes pour deux critères, les polylignes, le suivi GPS, les manœuvres et le protocole. Les **7 tests Java** ont été validés lors de l’évolution du moteur, inchangé dans le correctif Android : critères, recherche inverse, sens uniques, absence de chemin, restrictions, première rencontre, interruption et consignes françaises.

Mesures réelles du service local, sans trafic :

| Trajet | Critère | Distance | Durée estimée | États explorés | Calcul local |
|---|---|---:|---:|---:|---:|
| Paris–Lyon | Rapide | 463,72 km | 4 h 19 affichées | 8 453 604 | 6,23 s |
| Paris–Lyon | Court | 441,13 km | 9 h 27 affichées | 10 919 480 | 7,63 s |
| Ajaccio–Bastia | Rapide | 147,63 km | 2 h 15 affichées | 86 424 | 0,026 s |
| Brest–Marseille | Rapide | 1 282,56 km | 11 h 58 estimées | 20 083 856 | 16,61 s |

Ce sont des observations sur cette machine et ces points publics, pas un engagement de performance. La continuité des 847 arêtes du trajet rapide Paris–Lyon a aussi été vérifiée après décodage côté TypeScript. Le détail de la recette visuelle est dans `QA.md`.

## Configuration du service

| Variable | Défaut | Usage |
|---|---|---|
| `ECLAIRE_OSM_FILE` | `server/data/france-latest.osm.pbf` | Extrait à importer |
| `ECLAIRE_GRAPH_DIR` | `server/data/france-graph` | Cache persistant |
| `PORT` | `8787` | Port HTTP |
| `ECLAIRE_HOST` | `127.0.0.1` | Interface d’écoute |
| `ECLAIRE_WEB_DIR` | `dist` | Build web servi |
| `ECLAIRE_ORIGINS` | localhost web et origines Capacitor | Origines CORS, séparées par des virgules |
| `ECLAIRE_MAX_STATES` | `40000000` | Budget maximal de recherche |
| `ECLAIRE_TIMEOUT_MS` | `120000` | Délai maximal du calcul |
| `ECLAIRE_MAX_TRACE_EVENTS` | `60000` | Budget de trace visuelle |
| `ECLAIRE_LANDMARKS` | `off` | `off` : Dijkstra ; `prepare` : prépare puis charge les index ; `load` : charge les index sans les reconstruire |

Un seul calcul national est accepté à la fois pour maîtriser la mémoire ; le suivant reçoit un message explicite si le service est occupé. Une limite de calcul atteinte produit une erreur, jamais un trajet annoncé optimal. Le service écoute localement par défaut ; un hébergement public doit ajouter HTTPS et une protection adaptée contre les abus.

## Limites connues

- **Aucun trafic en direct.** Ni bouchons, ni événements en cours. L’étude des options, sans intégration, se trouve dans [docs/trafic-en-direct.md](docs/trafic-en-direct.md).
- Les vitesses sont des estimations issues du profil OSM et des règles du moteur, pas des mesures de déplacement. Les pénalités de virage et les demi-tours suivent le profil du moteur ; les demi-tours sont interdits par défaut dans le profil national.
- L’import a signalé des relations OSM ambiguës, mal formées ou non prises en charge, et en a ignoré certaines. Toutes les restrictions conditionnelles ne sont pas interprétées. Le calcul ne doit pas être présenté comme un guidage légal de navigation.
- Les réseaux d’accès privés, de desserte et les petits réseaux isolés peuvent empêcher un trajet pourtant possible pour un riverain autorisé. Les liaisons maritimes dépendent des données OSM et du profil automobile.
- Une limite de ressources reste possible pour les grandes recherches non accélérées. La trace affichée est allégée, explicitement ; elle ne représente pas tous les millions d’états.
- Le fond national et le géocodage demandent Internet. La recherche d’adresses n’est pas garantie exhaustive. La géolocalisation demande HTTPS ou localhost, une permission et un signal disponible.
- L’APK de développement est construit et sa signature vérifiée ; installation, permissions système et fluidité restent à confirmer sur un téléphone physique. L’image Docker n’a pas été construite ici.
- Le guidage GPS est validé avec des positions simulées clairement signalées, pas lors d’un trajet sur route réelle. La voix, l’autonomie, la reprise système et les permissions Android restent à vérifier sur téléphone.
