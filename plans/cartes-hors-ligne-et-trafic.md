# Cartes hors ligne et trafic : étude préalable

État au 30 octobre 2026. Aucun fournisseur supplémentaire n’est intégré ni testé avec une clé. Le calcul Éclaire actuel utilise les vitesses OSM et ne tient pas compte du trafic en direct.

## Continuité sans réseau

Un itinéraire déjà reçu reste dans la session native ; le GPS et ses manœuvres peuvent continuer sans réseau tant que le véhicule reste sur le trajet. Un recalcul, une recherche de lieu et les tuiles non déjà disponibles nécessitent une connexion. Ce n’est pas un téléchargement de carte ou un calcul routier hors ligne. Une fermeture forcée ne restaure pas la session.

Le service public [tile.openstreetmap.org interdit le préchargement et les téléchargements de zones hors ligne](https://operations.osmfoundation.org/policies/tiles/). Pour ajouter de vraies cartes hors ligne, deux pistes sont à chiffrer : héberger ses propres tuiles vectorielles OSM avec attribution et mises à jour, ou utiliser un fournisseur autorisant explicitement leur téléchargement. [Mapbox permet les zones hors ligne dans ses SDK mobiles](https://docs.mapbox.com/help/dive-deeper/mobile-offline/) avec une limite de 750 packs de tuiles et une facturation liée aux utilisateurs actifs ; cela exigerait une intégration native et un compte. Tester l’espace occupé, l’expiration, la suppression et les licences avant de choisir. Le calcul hors ligne exige en plus un graphe routier embarqué, distinct des tuiles.

## Trafic

Le profil [Mapbox Directions driving-traffic](https://docs.mapbox.com/api/navigation/directions/) combine trafic actuel et historique, donne des manœuvres et accepte des étapes. La documentation indique un retour au calcul sans trafic hors zones couvertes ; la couverture effective des routes visées en France et en Corse doit être vérifiée avec un compte et des essais. [Tarification publiée](https://www.mapbox.com/pricing) : 100 000 requêtes Directions mensuelles gratuites, puis 2 $ par millier jusqu’à 500 000 ; vérifier les tarifs et conditions au moment du choix, ainsi que les coûts et restrictions de carte associés.

Intégrer une telle API remplacerait ou complèterait le calcul GraphHopper d’Éclaire : adapter les manœuvres, les évitements et les étapes au format interne, protéger la clé et limiter les recalculs, mesurer le coût par trajet, et indiquer explicitement les absences de couverture ou de trafic. Les traces d’exploration bidirectionnelle d’Éclaire ne seraient pas fournies par cette API. Conserver le moteur actuel en secours ne doit pas donner l’impression que son estimation utilise le trafic. Le choix dépend de la couverture, du budget, du contrat et de la politique de confidentialité ; aucune qualité de trafic n’a été vérifiée ici.
