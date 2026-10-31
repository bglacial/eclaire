# Éclaire, le chemin prend vie

Proposition distincte de l’alpha.12, préparée le 31 octobre 2026 avec Impeccable, Design Taste Frontend et Animate.

## Scènes et choix

Une conductrice prépare son trajet à la lumière du jour, téléphone posé près du pare-brise : le fond clair doit rester lisible sans reflets décoratifs. Le soir, le même téléphone guide dans un habitacle sombre : le fond encre évite un panneau lumineux, tandis que la prochaine manœuvre garde le plus fort contraste.

Stratégie : palette complète sur la présentation, puis couleurs retenues dans le produit. Menthe pour la décision principale et la confirmation, orange pour le trajet, cyan et ambre pour les deux fronts de recherche. Neutres légèrement teintés, couleurs définies en OKLCH. Public Sans pour les commandes ; Big Shoulders pour la présentation et la marque uniquement.

## Inventaire du sujet

- Le nom Éclaire, qui décrit aussi la révélation progressive des routes.
- Deux recherches réelles, depuis le départ et l’arrivée.
- Une rencontre qui précède la preuve de l’optimalité.
- Le choix entre temps et distance.
- Un réseau routier OpenStreetMap, sens uniques et restrictions inclus.
- Le guidage français partagé avec Android Auto et le PiP.
- Des étapes qui restent modifiables pendant le trajet.
- Des lieux choisis selon le détour, pas seulement la distance à vol d’oiseau.
- Des tunnels et signaux GPS incertains qui exigent des états explicites.
- Un projet distribué en alpha, sans prétendre disposer de trafic en temps réel.

Idée : sur cette page, les deux fronts réels d’Éclaire deviennent la matière d’une affiche routière que l’on peut rejouer. Un autre GPS peut afficher un itinéraire ; cette démonstration montre précisément la recherche bidirectionnelle de ce projet.

## Argument et texte avant maquette

- « Le chemin prend vie. » Une navigation qui montre comment elle trouve la route. Preuve : capture du calcul et démonstration du vrai solveur local. Action : Essayer la proposition.
- « Où va-t-on ? » Saisir un lieu de l’extrait Paris et voir la route, le temps et la distance recalculés. Exemples : Panthéon, Hôtel de Ville, Arts et Métiers. Preuve : moteur existant, aucune durée commerciale inventée.
- « Le bon geste, au bon moment. » Préparer : la carte et une destination. Ajuster : les étapes sans perdre le trajet. Faire une pause : le détour avant l’ajout. Rouler : la prochaine instruction, puis l’arrivée. Preuve : quatre états du prototype, jour et nuit.
- « Moins chercher. Plus voir. » Une liste de capacités ouvre les choix de conception : carte, étapes, détours, guidage, signal GPS, mouvements. Preuve : les écrans et les limites de la simulation.
- « À toi de prendre la route. » Télécharger l’alpha fonctionnelle, ou revoir la proposition. Préciser que le nouveau style est une proposition.

## Direction tirée

Loud and flat, seed **1176116521**. Choisie parmi Loud and flat, Page is the object, Name as monument : la composition d’affiche permet de rendre les traces du calcul visibles en grand sans transformer l’interface de conduite en page marketing.

Deux remplacements justifiés : « Stages as one bar » exigeait des durées de tâches mesurées inexistantes, remplacé par « Pinned fragment, changing state ». « Contact as the headline » exigeait un contact à promouvoir, remplacé par « Invitation over a cropped name ». Palette, typographies, hero et signature Shutter conservés ; neutres adaptés en OKLCH.

## Périmètre du prototype

Vrai calcul sur l’extrait Paris du dépôt, vrai réseau et vraies traces du solveur existant. Édition d’étapes, choix de lieux de démonstration et recalcul locaux. Aucun accès GPS, aucune connexion aux services natifs, aucune estimation de trafic. Les points de pause sont des exemples issus de cet extrait, pas une recherche mondiale. Le bouton d’avancée pilote une simulation, sans déplacement automatique du véhicule.

## Mouvements

- Présentation, une visite : explication. Ouverture de l’image par volet, puis entrées des textes et captures, une fois seulement. Transform/opacity et clip-path pour la signature, sans bibliothèque.
- Produit, actions occasionnelles : continuité spatiale. Changement de panneau en 200 ms avec la courbe ease-out existante ; interruption annulant l’animation précédente.
- Commandes fréquentes : retour de pression 160 ms ; aucun mouvement après activation au clavier. Les chiffres et instructions restent stables.
- Calcul : les traces rejouent des événements réels. Mouvement réduit : résultat direct, sans attente animée. Mode nuit manuel pour comparer les contrastes ; automatisation future à valider sur matériel.

## Décisions UX

Carte occupant le fond, actions regroupées en bas sur téléphone et dans un ruban sur ordinateur. Une action principale par état. Étapes et lieux dans le même espace, en remplacement du panneau plutôt qu’en modales empilées. Boutons Monter/Descendre disponibles au clavier. Le retour au suivi n’apparaît qu’après un mouvement manuel de carte en simulation de guidage. Les mentions d’estimation et de signal incertain restent explicites.

## Crédits

Données et géométrie : contributeurs OpenStreetMap, extrait Paris du 25 octobre 2026 déjà présent dans le dépôt, ODbL 1.0 ; voir public/data/LICENSE.txt. Captures : ce prototype, sans données personnelles. Polices : Big Shoulders et Public Sans, Google Fonts, SIL Open Font License (licences dans assets/). Aucun visuel de banque d’images ni témoignage inventé.
