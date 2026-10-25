# Trafic en direct : étude, sans implémentation

État vérifié le 25 octobre 2026. Aucun appel de trafic, SDK, compte fournisseur, clé ou option de trafic n’a été ajouté à l’application. Les durées actuelles restent **sans trafic en direct**.

## Conclusion technique

Le trafic peut être ajouté au service France en conservant notre propre calcul et ses vrais événements. Il faut obtenir des **vitesses ou temps par tronçon**, les raccorder au graphe OSM et figer ces poids pendant une exploration. Une simple couche de tuiles colorées ne fournit pas automatiquement des poids routables. Une API renvoyant uniquement un trajet final ne donne pas non plus la trace de notre Dijkstra.

La piste à évaluer en premier est **HERE Traffic v7**, pour les réponses par zone/corridor avec géométries ou références OpenLR. Il reste à vérifier par un essai la qualité du raccordement au graphe OSM et par le contrat le droit d’utiliser ces données dans ce moteur. Ce choix est une proposition d’architecture, pas une intégration validée.

## Sources possibles

| Source | Ce qu’elle fournit | Intérêt pour Éclaire | Point restant à vérifier |
|---|---|---|---|
| HERE Traffic v7 | Vitesses, congestion, fermetures, confiance ; géométries/OpenLR ; requêtes par cercle, rectangle ou corridor | Importer un ensemble de tronçons avant le calcul | Couverture effective des routes françaises, raccordement, tarif du plan et droits d’usage |
| TomTom Traffic | Flux et incidents ; Segment Data pour le tronçon proche d’un point ; tuiles vectorielles avec vitesses | Petit essai local ou flux par zone pour un service | Éviter une requête par arête ; choisir la génération d’API et confirmer l’usage avec un fond/graphe tiers |
| Bison Futé / données du réseau routier national | Événements et mesures des stations, format DATEX II | Complément public pour autoroutes et routes nationales | Couverture urbaine incomplète, sources multiples et rapprochement au graphe |

**HERE.** Les flux exposent les vitesses actuelle et libre, la traversabilité et la confiance. La documentation distingue les mesures temps réel (`confidence > 0,7`) des données historiques ou de la seule vitesse limite. Le flux est annoncé comme actualisé chaque minute, les incidents toutes les deux minutes. Une réponse peut ne contenir aucun tronçon couvert. Sources : [modèle Flow](https://docs.here.com/traffic-api/docs/flow), [références de localisation et requêtes](https://docs.here.com/traffic-api/docs/how-to-request-flow-data), [fréquences](https://docs.here.com/traffic-api/docs/real-time-traffic-here-traffic-api-v7-concepts).

**TomTom.** Segment Data renvoie notamment `currentSpeed`, `currentTravelTime`, `confidence`, `roadClosure` et éventuellement OpenLR. Sa géométrie dépend du zoom et vise aussi l’affichage : il faut éviter de la traiter comme l’identifiant exact d’une arête OSM. La documentation recommande les API Orbis pour les nouvelles intégrations ; l’API ponctuelle Segment Data est encore présentée dans la génération TomTom Maps. Sources : [Segment Data](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data), [Orbis v2](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/product-information/introduction).

**Bison Futé.** Les stations du réseau routier national fournissent notamment des vitesses et débits mis à jour toutes les six minutes. Cela ne constitue pas un flux complet pour toutes les rues françaises. Les données de l’État sur le réseau non concédé ont une ouverture annoncée sur cette page ; les autres jeux restent à examiner individuellement. Source : [données sur le RRN](https://www1.bison-fute.gouv.fr/donnees-sur-le-rrn.html).

## Coût et dimensionnement

La page publique TomTom consultée indique des franchises mensuelles de **20 000 requêtes Segment Data**, **200 000 tuiles de trafic** et **2 500 requêtes Incident Details**. Ces produits sont comptés séparément ; cela ne signifie pas que 20 000 itinéraires complets sont gratuits. Les tarifs payants dépendent du produit et du volume. Les montants unitaires de dépassement et les conditions applicables à ce cas d’usage restent à confirmer dans le calculateur ou auprès du fournisseur. Source : [tarification TomTom](https://docs.tomtom.com/pricing).

Exemple de dimensionnement, hypothèse et non devis : 100 explorations par jour × 30 jours × 200 recherches ponctuelles de tronçons = **600 000 appels par mois** avant cache. Faire un appel pour chacun des millions d’états de Dijkstra est donc exclu. Une collecte par zone, mutualisée dans un cache court, doit précéder la recherche.

La page de tarification HERE n’a pas pu être récupérée pendant l’étude (HTTP 403). Aucun prix Traffic HERE n’est donc présenté comme vérifié. Les options avancées sont signalées comme relevant d’une facturation distincte dans la [référence Flow](https://docs.here.com/traffic-api/reference/traffic-api-v7-getflow). Vérifier également les droits de cache, de stockage, d’affichage, de redistribution et d’emploi avec OSM/GraphHopper dans le contrat choisi. Les [conditions TomTom](https://docs.tomtom.com/legal/terms-and-conditions) ne remplacent pas cette confirmation d’usage.

## Intégration envisageable, non réalisée

1. Le serveur collecte un périmètre de trafic et normalise ses unités, son horodatage, sa confiance et sa direction. La clé reste côté serveur.
2. Il rapproche les tronçons du fournisseur et les arêtes OSM : géométrie, orientation, chaussée et intersections. Un pont, une contre-allée et une voie opposée ne doivent pas être confondus. OpenLR aide à la localisation, mais ne donne pas automatiquement un ID OSM.
3. Il produit un **instantané immuable** pour la requête. Le poids du critère rapide devient un temps estimé par tronçon ; les fermetures rendent le tronçon inaccessible pour les deux critères. Le critère court conserve la longueur sur les routes ouvertes.
4. Dijkstra et sa recherche inverse utilisent exactement ce même instantané jusqu’à leur condition d’arrêt. Les événements de l’animation viennent de cette exécution. Les points d’entrée à étudier sont `FranceServer.timeWeighting()` et `DistanceWeighting`, sans réécrire le rendu.
5. La réponse distingue le fournisseur, l’heure de mesure, les portions sans observation et le repli vers les vitesses habituelles. Une donnée historique ou périmée n’est pas étiquetée « en direct ».

Cette proposition conserve un problème de plus court chemin à poids fixes. Faire évoluer les vitesses pendant la recherche, ou prévoir leur valeur à l’heure d’arrivée sur chaque tronçon, demande un algorithme dépendant du temps ; le Dijkstra bidirectionnel actuel ne doit pas être conservé tel quel dans ce cas.

## Articulation avec le guidage GPS

Le suivi GPS et le trafic sont deux fonctions indépendantes. Le guidage ajouté à Éclaire suit la position sur le trajet calculé, affiche les prochaines manœuvres et estime le temps restant avec les vitesses du moteur. **Un GPS actif ne rend pas ces durées sensibles aux bouchons.** Le recalcul depuis la position reste lui aussi sans trafic.

Une future intégration devrait récupérer les flux par zone ou corridor côté serveur, avant un recalcul, puis associer la réponse à un instantané daté. Le suivi de position ne doit pas lancer un appel fournisseur à chaque mise à jour GPS, ni modifier les poids d’une recherche déjà en cours. Un nouveau trajet pourrait employer un nouvel instantané, avec son âge et ses portions non couvertes affichés. Les demandes de recalcul devraient être temporisées et partager le cache de trafic.

Les données GPS actuelles sont traitées sur l’appareil ; seul un recalcul transmet le point au service routier configuré. Demander un corridor de trafic à un tiers pourrait révéler une zone de déplacement : il faudrait documenter cette transmission, limiter sa précision et sa conservation, et garder les clés côté serveur. Cela n’a pas été ajouté.

La documentation primaire a été revue pour cette évolution : [HERE Flow par zone/corridor](https://docs.here.com/traffic-api/docs/how-to-request-flow-data), [modèle des vitesses et de la confiance](https://docs.here.com/traffic-api/docs/flow), [données de flux TomTom](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/flow-segment-data). Aucun essai authentifié ne prouve encore la couverture, le coût ou le droit d’emploi avec notre graphe OSM.

## Preuves nécessaires avant de décider

Un essai borné devrait mesurer la couverture et l’erreur de rapprochement à Paris, sur une autoroute et sur un réseau rural ; vérifier une fermeture et une chaussée à sens unique ; comparer le résultat à la référence sans trafic ; mesurer appels, coût, latence et taux de données périmées. Le feu vert dépendrait ensuite de ces mesures et des droits contractuels. Aucun de ces essais authentifiés n’a été exécuté dans cette étude.
