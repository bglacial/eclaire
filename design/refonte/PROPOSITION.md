# Éclaire, le chemin prend vie

[Présentation interactive locale](http://localhost:5173/design/refonte/) · [Prototype seul](http://localhost:5173/design/refonte/app.html) · [Alpha.12 publiée](https://github.com/bglacial/eclaire/releases/tag/v1.1.0-alpha.12)

Cette proposition repart de l’identité et de l’organisation de l’interface. Elle conserve les besoins réels du produit : préparer en France, comprendre le calcul, guider, modifier et faire une pause. Le nouveau style n’est pas intégré à l’APK alpha.12.

## Une identité plus directe

La menthe signe les actions et les confirmations. L’orange distingue le trajet des routes de fond. L’encre structure la lecture. Le cyan et l’ambre gardent leur sens précis : les deux recherches qui progressent depuis chaque extrémité.

| Rôle | Valeur de la proposition | Usage |
| --- | --- | --- |
| Fond jour | `oklch(97% .008 145)` | Carte et surfaces de repos |
| Surface jour | `oklch(99% .005 145)` | Commandes lisibles |
| Encre produit | `oklch(22% .014 155)` | Texte principal |
| Menthe | `oklch(91% .15 139)` | Action principale et position suivie |
| Trajet jour | `oklch(62% .22 40)` | Ligne de route et direction |
| Fond nuit | `oklch(19% .014 155)` | Carte en habitacle sombre |
| Surface nuit | `oklch(25% .014 155)` | Commandes de nuit |
| Texte nuit | `oklch(95% .012 145)` | Lecture des instructions |
| Trajet nuit | `oklch(76% .17 52)` | Ligne visible sur la carte sombre |

Public Sans sert les noms, commandes et chiffres ; Big Shoulders porte le nom Éclaire et la présentation. Les titres de conduite utilisent Public Sans, avec une hiérarchie nette et des unités qui restent attachées aux chiffres. Les commandes ont des cibles de 48 px ; le produit garde des arrondis de 10 à 20 px. La présentation emploie des champs de couleur et des boutons carrés, sans imposer ce langage publicitaire à l’écran de conduite.

## Une organisation par moment du trajet

| Moment | Information dominante | Action principale | Secondaire |
| --- | --- | --- | --- |
| Préparer | Destination et départ | Éclairer la route | Critère et préférences |
| Comprendre | Temps, distance et carte | Démarrer le guidage | Rejouer le calcul, étapes et lieux |
| Ajuster | Étapes dans leur ordre | Appliquer au trajet | Ajouter, monter, descendre, supprimer, annuler |
| Faire une pause | Temps de détour estimé | Ajouter le lieu | Distance ajoutée et limites des données |
| Rouler | Prochaine instruction et distance | Continuer à suivre la route | Étapes et lieux, son, terminer |
| Signal incertain | État de la position | Garder le guidage lisible | Préciser « position estimée » puis perte prolongée |
| Arriver | Destination atteinte | Terminer le guidage | Reprendre la préparation |

Sur téléphone, un espace unique ancré en bas remplace les fenêtres empilées. Sur ordinateur, les mêmes décisions se regroupent dans un ruban horizontal au pied de la carte. La recherche et l’édition remplacent le contenu de cet espace. Le retour au trajet est explicite. Les boutons Monter et Descendre rendent le réordonnancement possible sans geste de glissement obligatoire.

La simulation est entièrement étiquetée comme telle. Dans le produit final, le guidage réel ne comporterait pas le bouton d’avancée du prototype. Le bouton de retour au suivi apparaît uniquement après une manipulation de la carte.

## Recherche, réglages et états à décliner

La refonte ne se limite pas aux quatre captures. Voici les règles proposées pour les autres surfaces, avant leur intégration au produit.

| Surface ou état | Proposition |
| --- | --- |
| Recherche d’adresse ou d’entreprise | Champ unique, noms complets et commune en seconde ligne. Résultats intermédiaires visibles, indicateur discret tant que d’autres sources répondent. Aucune fausse promesse d’exhaustivité. |
| Résultat ambigu | Afficher commune et adresse avant de sélectionner ; ne pas lancer immédiatement le guidage sur un simple nom. |
| Aucun résultat | Garder la saisie, permettre de préciser la ville ou de choisir un point sur la carte. |
| Préférences routières | Une seule source de réglage pour péages et types de routes. Résumé lisible dans la préparation ; changement invalidant le résultat devenu périmé. |
| Chargement de route | Annulation visible ; état textuel du calcul. Les fronts servent l’explication, sans faux pourcentage d’avancement. |
| Échec de calcul | Conserver départ, destination, étapes et route active. Proposer Réessayer. Dire si le réseau ou le service est indisponible. |
| Modification en cours | Brouillon distinct du trajet actif ; annulation sans perte. Le nouvel itinéraire ne remplace l’ancien qu’après calcul réussi. |
| Permission GPS refusée | Explication courte et accès aux réglages. La préparation reste utilisable. |
| Tunnel | Petite mention « position estimée » lorsqu’elle est justifiée. Ne pas faire clignoter une alerte à chaque microcoupure. Une perte durable devient plus visible. |
| Hors trajet | Recalcul automatique depuis la position reçue ; message discret. Aucun bouton obligatoire pour autoriser le recalcul. |
| PiP Android | Instruction, distance et arrivée dans cet ordre. Contraste de nuit cohérent, texte lisible à la taille minimale ; aucune recherche ni édition à l’intérieur du PiP. |
| Android Auto | Conserver les composants de navigation de la plateforme et la session partagée du téléphone. Adapter les couleurs dans les limites du système, sans reproduire les panneaux du téléphone. |
| Réglages et mise à jour | Liste simple : navigation, affichage, voix, version. Version installée, disponibilité de l’alpha et action de mise à jour avec état réel. |
| Mouvement réduit | Résultat direct du calcul ; panneaux sans déplacement. Garder une courte transition d’opacité lorsque cela aide à comprendre. |
| Mode nuit | Même structure, autre lumière. Le changement automatique jour/nuit serait une étape ultérieure à tester sur appareil. |

## Animations au service de la lecture

Le calcul peut être rejoué pour comprendre les deux fronts. Le tracé provient des événements du moteur existant. Le résultat n’est pas présenté comme établi au premier contact des fronts.

Les panneaux changent avec 200 ms d’opacité et un déplacement de 8 px, courbe existante `cubic-bezier(.23,1,.32,1)`. Une nouvelle action annule l’animation précédente. Pression tactile : 160 ms, échelle .97. Activation au clavier : changement immédiat. Les chiffres et instructions ne font pas de transition décorative.

La page de présentation dispose d’une seule signature : ouverture du visuel par volet en 1,1 s, puis entrées espacées de 70 ms. Elle sert la découverte, pas la conduite. Aucune bibliothèque de mouvement supplémentaire.

## Ce qui fonctionne dans la proposition

Le calcul local, les fronts, temps et distances reposent sur le moteur et l’extrait Paris du dépôt. On peut chercher un lieu proposé, comparer temps ou distance, modifier des étapes avec annulation, ajouter un restaurant selon son détour calculé, passer en nuit et avancer un guidage simulé. Les lieux à proximité d’une voie inaccessible dans cet extrait peuvent ne pas avoir de route ; ce n’est pas une recherche nationale.

Les cartes, étapes et restaurants sont des données OpenStreetMap de démonstration. Aucun GPS n’est demandé ; les durées n’intègrent pas le trafic et les horaires ne sont pas vérifiés. Les détours de ce prototype sont calculés depuis le Louvre, avec insertion avant la destination. L’alpha.12 utilise les services et la position native pour ses fonctions réelles.

Pour relancer : `rtk npm run dev -- --host 127.0.0.1`, puis ouvrir la présentation locale. Le prototype est séparé des points d’entrée de la compilation de l’application. Pour reproduire les contrôles, exécuter `verify.mjs` avec Playwright disponible dans `NODE_PATH`, comme les autres essais UI du projet.

## Axes suivants proposés

- **Trajets enregistrés et reprise** : retrouver un parcours interrompu avec ses étapes et préférences, y compris après fermeture de l’app.
- **Réseau faible et hors connexion** : distinguer carte indisponible et guidage restant disponible ; étudier des cartes et routes téléchargées avant le départ, sans promettre un hors ligne complet aujourd’hui.
- **Confiance et autonomie** : rendre compréhensibles précision et estimation GPS, mesurer batterie et chauffe lors de longs trajets, puis ajuster la fréquence de rendu et de localisation avec des essais réels.

Le trafic en temps réel reste hors périmètre : aucun abonnement ni clé fournisseur n’est introduit.
