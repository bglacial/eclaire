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

La version nationale exige le service, une page HTTPS ou localhost, et un accès réseau pour les tuiles et le géocodage. Si le service est indisponible au démarrage, le calcul embarqué fonctionne uniquement pour des points raccordables dans l’extrait Paris. Il ne simule pas un trajet national. Pour créer l’APK destiné à ce déploiement, synchroniser avec `VITE_ROUTING_API_URL=https://eclaire.nriault.fr/api npm run android:sync`, puis reconstruire l’APK : la publication web ne modifie pas un APK déjà installé.

À partir de l’alpha 1.1.0-alpha.2, Android recherche automatiquement les releases GitHub publiées, y compris les préversions, à l’ouverture ou à la reprise de l’application, au plus une fois toutes les six heures après une vérification réussie. Un tag seul ne suffit pas : la release doit contenir un APK nommé `eclaire-<version>-debug.apk`. En cas de nouvelle version, l’utilisateur choisit de la télécharger. L’application vérifie le nom du paquet, le numéro de version Android et la signature avant d’ouvrir l’installateur ; Android demande la confirmation finale et, si nécessaire, l’autorisation d’installer des applications depuis Éclaire. L’alpha.1 ne possède pas encore ce mécanisme : installer l’alpha.2 une première fois manuellement. La clé de signature doit rester la même entre les releases pour permettre les mises à jour.

## Guidage GPS

Le guidage est réservé à l’**application mobile sur téléphone** : il n’est pas disponible sur le site web, même depuis un téléphone, ni sur tablette. Dans l’application, calculer un trajet national, puis toucher **Démarrer le guidage GPS** et autoriser la localisation précise. Le service fournit les manœuvres GraphHopper en français sur le parcours effectivement calculé : virages, bifurcations et ronds-points selon les données importées. Le guidage affiche la prochaine manœuvre, sa distance, la distance restante et une durée estimée **sans trafic**. Il ne donne pas d’assistance de choix de voie de circulation.

La voiture est rapprochée du segment le plus proche du trajet ; le cercle reste centré sur la mesure GPS réelle. En suivi, la carte s’oriente selon le cap GPS lorsqu’il est disponible, sinon selon le tracé. Entre deux mesures, la voiture avance sur ce tracé selon la moyenne des vitesses GPS des 20 dernières secondes, avec une prédiction limitée à 3 secondes et 30 mètres. La préférence système de réduction des mouvements désactive cette prédiction. Le déplacement manuel suspend le recentrage et l’orientation ; **Suivre ma position** les réactive. **Activer la voix** utilise la synthèse vocale native Android ou iOS, y compris lorsque l’écran est verrouillé. Une voix française doit être disponible sur le téléphone. Bluetooth, les appels et le comportement des différents constructeurs restent à vérifier sur appareil physique. **Quitter le guidage** libère le suivi GPS. L’arrivée au **point routier raccordé** est confirmée par au moins deux positions précises espacées de trois secondes, puis le GPS s’arrête.

La vitesse GPS est affichée en km/h si le téléphone la fournit. Lorsque le service fournit une limite OSM pour le segment suivi, elle apparaît à côté et la vitesse devient rouge en cas de dépassement. La limite peut être absente ou incorrecte, notamment pour les conditions temporaires : seule la signalisation fait foi. Un ancien service sans cette donnée affiche une limite inconnue.

Les positions de plus de 15 secondes ou de précision supérieure à 50 m suspendent les indications. Au démarrage, si le trajet est à plus de 75 m mais à moins de 2 km, la carte affiche le point routier le plus proche et sa distance ; rejoignez-le par une voie accessible, sans suivre une ligne directe à travers les obstacles. Les manœuvres reprennent à proximité du trajet. Un écart de plus de 35 m du tracé est signalé ; une sortie de plus de 75 m pendant le guidage suspend les indications et affiche **Recalculer depuis ma position**. Le recalcul est manuel, respecte le critère choisi et reprend le GPS après le nouveau résultat. Vérifier l’accès final à la destination.

Le suivi continue **en arrière-plan et écran verrouillé** après un démarrage avec l’application visible. Android utilise un service de premier plan de type `location`, avec notification persistante et action **Arrêter le guidage** ; l’autorisation de notification est requise à partir d’Android 13. iOS utilise Core Location avec l’autorisation à l’usage, l’indicateur système et les modes `location`/`audio`. Aucune permission de localisation permanente n’est demandée. La progression et les annonces tournent nativement, indépendamment de la WebView. Revenir dans l’application récupère l’état courant, sans recommencer le trajet.

Android et iOS maintiennent l’écran allumé uniquement pendant le suivi visible. **Quitter**, un refus de permission ou l’arrivée libèrent le GPS. L’arrêt dans la notification fonctionne aussi application masquée. Un arrêt forcé de l’application ou une terminaison par le système ne relance pas automatiquement le suivi : rouvrir l’application et démarrer le guidage. Les positions et le trajet restent en mémoire ; aucun historique GPS n’est enregistré. Le recalcul manuel transmet la position au service routier configuré et conserve les évitements. Le fournisseur de fond de carte voit les zones consultées.

Dans l’application, **Paramètres** permet de choisir l’apparence claire, sombre ou automatique et le critère par défaut du prochain trajet. Les choix sont enregistrés sur l’appareil ; la version installée apparaît sur la même page.

Ce guidage est **expérimental** : rapprochement géométrique avec continuité bornée, sans map matching multi-hypothèse ni détection de sens de circulation. Des routes parallèles, superposées, des restrictions OSM ignorées ou un GPS peu précis peuvent rendre une instruction incorrecte. Respecter la signalisation. Le secours Paris sans manœuvres natives et les parcours de longueur nulle n’activent pas le guidage.

Pour rejouer la recette sans partager sa position réelle, lancer Vite et ouvrir `http://localhost:5173/tests/gps-ui.html`. Ce harnais affiche **GPS SIMULÉ** et permet d’injecter des positions publiques, un refus, une perte de signal et une sortie de route. Le calcul routier reste réel. Ce fichier de test n’est pas inclus dans le build Vite ni dans Android.

La permission et le départ ponctuel utilisent [Capacitor Geolocation v8](https://capacitorjs.com/docs/apis/geolocation). Le suivi continu passe par `EclaireNavigation`, `LocationManager`/`NavigationService` sur Android et `CLLocationManager` sur iOS. Les manœuvres sont calculées avec [InstructionsFromEdges de GraphHopper 11](https://github.com/graphhopper/graphhopper/blob/11.0/core/src/main/java/com/graphhopper/routing/InstructionsFromEdges.java).

Recette native : `cd android && ./gradlew testDebugUnitTest connectedDebugAndroidTest`. Sur Mac, vérifier aussi le moteur iOS avec `xcrun swiftc ios/App/App/GuidanceTracker.swift tests/native-guidance.swift -o /tmp/eclaire-native-guidance-check && /tmp/eclaire-native-guidance-check`, puis compiler le projet dans Xcode. Le test instrumenté Android confirme la progression avec l’activité arrêtée et l’arrêt depuis la notification ; il injecte des positions et ne mesure pas la réception GPS réelle ni la batterie.

## Calcul et animation

- **France : GraphHopper 11.0**, sans raccourcis CH. Le mode par défaut charge automatiquement les index disponibles. Les index v2 utilisent **32 landmarks actifs par requête**, préparés séparément pour chaque critère. Les anciens index v1 à huit landmarks restent lisibles ; sans index, le secours est Dijkstra bidirectionnel. Les bornes ignorent les coûts de virage pour rester optimistes ; la recherche finale garde les restrictions et coûts complets. L’instrumentation de `TracedSearch` enregistre les arêtes réellement retirées des files et conserve la condition d’arrêt du moteur. Ce mode explore donc moins de routes ; il ne rejoue pas la trace d’un autre algorithme.
- **Le plus rapide** minimise le temps de parcours estimé. Le modèle a une influence de distance nulle ; il ne privilégie donc pas artificiellement les itinéraires courts.
- **Le plus court** utilise un poids exactement égal à la longueur, tout en conservant les accès et virages interdits. La durée du résultat est calculée selon les mêmes vitesses estimées.
- Les points sont raccordés aux routes carrossables à **2 km maximum**. Les petits réseaux isolés sont écartés du raccordement, les voies privées et de desserte exclues du profil. Le raccordement hors réseau n’est pas inclus dans la distance.
- **Trace indépendante du rendu** : le calcul enregistre une trace bornée de clés d’arêtes dans des tableaux compacts ; la géométrie est sérialisée après le calcul en NDJSON. Une lecture lente sur téléphone ne ralentit pas la recherche.
- Pour limiter la mémoire et le transfert, la trace France retient par défaut au plus **60 000 événements** dès le calcul, échantillonnés séparément sur les deux fronts. Quand le budget est atteint, chaque front conserve un événement sur deux ; la mémoire de trace ne croît plus avec les millions d’états explorés. Le facteur est annoncé dans l’interface. Le calcul, son coût, la preuve et la géométrie finale ne sont pas échantillonnés.
- **Paris sans serveur** : le worker TypeScript précédent et son graphe orienté restent disponibles. Les anciennes limites d’extraction s’appliquent à ce secours local.

L’animation utilise Canvas 2D, sans bibliothèque de mouvement supplémentaire. Les routes visitées sont mises en cache dans un second Canvas, au lieu d’être retracées à chaque image. Les fronts suivent les polylignes, avec des têtes adaptées au zoom et des traînées décroissantes. Après confirmation : convergence des deux côtés pendant 500 ms, onde discrète, révélation par une impulsion de 900 ms. Il n’y a pas de scintillement aléatoire hors des routes ni de boucle décorative perpétuelle.

L’interruption éteint les fronts en 200 ms, annule la lecture et interrompt aussi le calcul serveur. Le mode léger réduit le pixel ratio, les halos et le nombre de fronts actifs. Avec `prefers-reduced-motion`, la route est présentée directement et les branches s’atténuent en 200 ms, sans déplacements ni onde.

## Carte, recherche et provenance

Le fond national utilise les tuiles standard OSM en HTTPS, à la demande, avec attribution visible. Pas de téléchargement massif ni de préchargement hors ligne. Le navigateur conserve sa gestion normale du cache. Le client Android s’identifie avec `Eclaire/0.2`. Pour une diffusion à fort trafic, configurer `VITE_TILE_URL` avec une infrastructure et une licence adaptées, et adapter l’attribution au fournisseur retenu. [Politique OSM](https://operations.osmfoundation.org/policies/tiles/).

La recherche nationale utilise le [géocodage IGN](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/geocodage/), avec temporisation de 300 ms et annulation des requêtes devenues inutiles. Le texte recherché est envoyé à l’IGN. L’index local et quelques centres-villes restent disponibles en secours. Les coordonnées d’itinéraire sont envoyées à votre propre service ; celui-ci n’enregistre pas les requêtes dans une base utilisateur.

Le graphe national actuellement chargé contient **19 561 144 nœuds et 24 760 300 arêtes**, dont des objets non accessibles au profil automobile. Il comprend **107 492 entrées de restriction de virage** importées. Ces nombres ne constituent pas un comptage des seules routes carrossables ni des seules relations OSM uniques.

Le fichier Geofabrik peut conserver des objets et des relations au-delà de la frontière. La sélection est cadrée sur la métropole et la Corse, mais l’optimalité s’entend dans le graphe chargé, pas dans un réseau mondial complet. Les données d’outre-mer ne sont pas chargées.

Le petit extrait Paris, sa requête et son horodatage restent dans `public/data/paris.json` et `public/data/provenance.json`. Les bases OSM et leurs adaptations restent soumises à l’ODbL ; les attributions sont affichées sur la carte.

La revue de lisibilité et les choix de composition sont détaillés dans [docs/ui-review.md](docs/ui-review.md). Le résultat replie les champs dans **Modifier le trajet** et conserve les deux adresses lisibles. L’aide rassemble les explications, les limites, la confidentialité et le mode léger.

## Vérifications

```sh
npm test
npm run server:test
npm run build
npm run android:sync
```

Résultats du 26 octobre 2026 : **31 tests TypeScript et 8 tests Java réussis**. Les tests couvrent notamment l’oracle Bellman-Ford sur 400 graphes pour les deux critères, 200 comparaisons landmarks/Dijkstra avec restrictions de virage, le protocole national, la trace bornée (ordre des fronts et résultat exact conservés), l’interruption, les manœuvres françaises et le suivi GPS simulé. Le build TypeScript/Vite est vérifié séparément de la préparation du graphe national et du déploiement.

Mesures historiques du service local sans accélération, sans trafic :

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
| `ECLAIRE_LANDMARKS` | `auto` | `auto` : charge v2 prêt, sinon v1, sinon Dijkstra ; `off` : Dijkstra ; `prepare` : prépare les 32 landmarks v2 ; `load` : charge un index existant sans reconstruction |

Le serveur traite un calcul à la fois et accepte quatre demandes en attente
pendant 30 secondes au maximum. La file est annulable et bornée pour protéger
la mémoire. Sur Raspberry, vérifier que `/api/health` annonce 32 landmarks pour
les deux critères : un index v1 à huit repères peut épuiser le budget de calcul
sur une traversée de la France, même si le nouveau JAR est installé.

Une limite de calcul atteinte produit une erreur, jamais un trajet annoncé optimal.
Le service écoute localement par défaut ; un hébergement public doit ajouter
HTTPS et une protection adaptée contre les abus.

## Limites connues

- **Aucun trafic en direct.** Ni bouchons, ni événements en cours. L’étude des options, sans intégration, se trouve dans [docs/trafic-en-direct.md](docs/trafic-en-direct.md).
- Les vitesses sont des estimations issues du profil OSM et des règles du moteur, pas des mesures de déplacement. Les pénalités de virage et les demi-tours suivent le profil du moteur ; les demi-tours sont interdits par défaut dans le profil national.
- L’import a signalé des relations OSM ambiguës, mal formées ou non prises en charge, et en a ignoré certaines. Toutes les restrictions conditionnelles ne sont pas interprétées. Le calcul ne doit pas être présenté comme un guidage légal de navigation.
- Les réseaux d’accès privés, de desserte et les petits réseaux isolés peuvent empêcher un trajet pourtant possible pour un riverain autorisé. Les liaisons maritimes dépendent des données OSM et du profil automobile.
- Une limite de ressources reste possible pour les grandes recherches non accélérées. La trace affichée est allégée, explicitement ; elle ne représente pas tous les millions d’états.
- Le fond national et le géocodage demandent Internet. La recherche d’adresses n’est pas garantie exhaustive. La géolocalisation demande HTTPS ou localhost, une permission et un signal disponible.
- L’APK de développement est construit et sa signature vérifiée ; installation, permissions système et fluidité restent à confirmer sur un téléphone physique. L’image Docker n’a pas été construite ici.
- Le guidage GPS est validé avec des positions simulées clairement signalées, pas lors d’un trajet sur route réelle. La voix, l’autonomie, la reprise système et les permissions Android restent à vérifier sur téléphone.

## Évolution du 26 octobre : longs trajets et interface claire

Téloché–Le Barcarès dépassait le budget Raspberry de deux millions d’états avec les huit landmarks v1 : **2 181 218** états en mode rapide, **3 211 464** en mode court, sur les coordonnées publiques du script `ops/smoke-routing.py`. Les index v2 en préparent 32 pour renforcer les bornes pendant toute la recherche. Ils se préparent séparément, sans écraser v1. Voir [le déploiement](ops/README.md) ; copier seulement le JAR ne suffit pas.

L’interface claire s’inspire des accents cobalt et citron de nriault.fr. Carte dominante, panneau de préparation, commandes repliées pendant l’exploration et résultat compact. Les fronts cyan et ambre conservent leur effet éclair ; le trajet final est cobalt pour rester lisible. Le clavier est immédiat, le mode réduit supprime zoom, inertie et translations. L’aide native entre et sort en 200 ms, sans bibliothèque ajoutée. Le contexte est dans PRODUCT.md et DESIGN.md ; l’audit de mouvement dans [plans/001-motion.md](plans/001-motion.md).


Recette finale locale, avec 512 Mo de tas Java et le budget Raspberry inchangé de 2 millions d’états :

| Téloché–Le Barcarès, points du script | États avant (v1) | États après (v2) | Calcul local v2 |
|---|---:|---:|---:|
| Plus rapide | 2 181 218 | 56 942 | 45 ms |
| Plus court | 3 211 464 | 293 092 | 291 ms |

Les coûts optimaux restent identiques à la tolérance numérique du script. Les sept cas de `ops/smoke-routing.py` passent, dont Paris–Lyon et Brest–Marseille dans les deux critères. Pour les centres renvoyés par la recherche IGN, le trajet rapide explore 61 164 états et le trajet court 299 988, avec les mêmes coûts de référence vérifiés séparément. `/api/health` annonce 32 landmarks pour chaque critère après redémarrage en mode `load`.

Ces temps sont mesurés sur le Mac local et ne prédisent pas les temps du Raspberry. Les nouveaux index occupent 2,4 Go chacun ; leur préparation unique a pris environ 24 minutes sur cette machine. Les anciens dossiers v1 sont conservés. Le site public n’a pas été mis à jour par cette recette. L’APK alpha est publié séparément, comme décrit ci-dessous.


## Préversions alpha

La version **1.1.0-alpha.4** ajoute les évitements mobiles et le guidage natif en arrière-plan Android/iOS. Les deux sujets ont chacun leur commit ; la version est portée par un troisième commit de publication.

Sur téléphone dans l’application Android ou iOS, les options **Éviter les autoroutes** et **Éviter les péages** sont indépendantes, mémorisées sur l’appareil et conservées pour les recalculs. Elles s’appliquent au plus court comme au plus rapide, ainsi qu’au raccordement des points. Les autoroutes incluent leurs bretelles ; les péages réservés aux poids lourds ne sont pas exclus pour une voiture. Les attributs manquants suivent les règles OSM/GraphHopper du pays : ce n’est pas une garantie de gratuité. La signalisation reste prioritaire.

Ces options exigent `/api/health` avec `roadPreferences: true`. L’application refuse un ancien serveur ou graphe et ne bascule jamais sur la démo Paris avec un évitement activé. Aucun contrôle d’évitement n’est proposé sur le web.

La préversion GitHub contient l’APK de test Android, le JAR du serveur et leurs empreintes SHA-256. L’APK utilise `https://eclaire.nriault.fr/api`, garde l’identifiant `fr.eclaire.app` et doit conserver la signature debug des versions précédentes pour permettre leur mise à jour. Le harnais GPS simulé n’est pas inclus dans l’APK. Les builds ne remplacent pas une validation sur téléphone physique.

L’archive `eclaire-1.1.0-alpha.4-ios-simulator.zip` contient aussi un build pour simulateur iOS, ARM64 et Intel. Ce build ne s’installe pas sur iPhone ; la distribution iPhone/TestFlight demande une signature et un profil Apple. Le projet Xcode complet est inclus dans les sources du tag.

La publication d’une release ne déploie pas le serveur public. L’accélération des longs trajets demande le nouveau JAR **et les deux index v2 complets** du même graphe. Les données OSM et les index de plusieurs Go ne sont pas joints à la release. Suivre [les consignes Raspberry](ops/README.md), puis contrôler les deux compteurs `landmarks` de `/api/health`.

Pour reconstruire l’APK de cette préversion :

```sh
VITE_ROUTING_API_URL=https://eclaire.nriault.fr/api npm run android:sync
cd android
./gradlew assembleDebug
```

Le build web conserve `/api` comme URL relative. Après une synchronisation Android, refaire `VITE_ROUTING_API_URL= npm run build` pour restaurer ce build web sans écraser les assets déjà copiés dans Android.

## Build iOS

Sur un Mac équipé de Xcode complet, préparer le projet iOS avec l’adresse du service national, puis l’ouvrir dans Xcode :

```sh
npm ci
VITE_ROUTING_API_URL=https://eclaire.nriault.fr/api npm run ios:sync
npm run ios:open
```

Choisir un simulateur pour tester ou configurer une équipe de signature Apple dans Xcode pour compiler et installer sur un iPhone. Le projet utilise l’identifiant `fr.eclaire.app` et nécessite iOS 15 ou ultérieur. La géolocalisation demande une autorisation à l’utilisation et continue en arrière-plan pendant un guidage lancé par l’utilisateur, avec l’indicateur système. Une build signée et un test sur iPhone restent nécessaires avant distribution.
