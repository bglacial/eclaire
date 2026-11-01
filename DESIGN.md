# Design

## Direction

Direction approuvée « Le chemin prend vie », appliquée depuis l’alpha.13. En préparation de jour, une carte claire et des commandes opaques restent lisibles sur téléphone ou ordinateur. Dans un habitacle sombre, les mêmes commandes passent sur des fonds encre ; la route garde un fort contraste.

## Palette et typographie

Neutres teintés en OKLCH. Menthe `oklch(.91 .15 139)` pour l’action principale, orange `oklch(.62 .22 40)` pour le trajet et la direction, encre `oklch(.22 .014 155)` pour la lecture. La nuit : fond `.19 .014 155`, surface `.25 .014 155`, texte `.95 .012 145`, route `.76 .17 52`. Cyan et ambre gardent leur rôle dans les recherches bidirectionnelles. Le tracé final et le guidage emploient le même jeton de couleur, mis à jour avec le thème.

Public Sans, hébergée dans l’application, sert les libellés et les données à une échelle fixe. Big Shoulders 800 est réservée à la marque. Les licences SIL OFL sont livrées avec les polices. Chiffres tabulaires pour les métriques, cibles de commande de 48 px et arrondis de 10 à 20 px.

## Identité et icônes

Le symbole source `public/logo.svg` dessine un trajet encre qui rejoint une flèche vers le nord-est, avec un point de départ orange sur une tuile menthe. Il accompagne le mot-symbole Big Shoulders et le chargement de la carte. Le favicon, les icônes web et Apple, les icônes Android (classiques, adaptatives et monochromes) et iOS ainsi que les écrans de lancement reprennent ce dessin. Les icônes masquables et iOS ont un fond menthe opaque ; les écrans de lancement utilisent le fond clair de l’application. Conserver la zone centrale de sécurité des icônes adaptatives Android.

## Composition

Carte sur toute la surface, marque et paramètres flottants en haut. Préparation dans un panneau bas sur téléphone et un ruban horizontal sur ordinateur. Départ et arrivée restent visibles ; étape facultative, critère et favoris sont regroupés sous Options du trajet. Le résultat met l’arrivée, la durée et la distance au premier plan.

L’espace Étapes et lieux remplace visuellement le panneau courant sans arrêter la session de guidage. Deux vues permettent de modifier les étapes ou de comparer les lieux et leurs détours. Les changements de trajet restent soumis au calcul et à une confirmation ; l’annulation conserve le trajet actif.

Les paramètres utilisent une roue dentée et un libellé visible dès 360 px. La page plein écran regroupe affichage, préférences de trajet et mises à jour. Le retour Carte reste visible au défilement ; le dialogue natif isole le focus et le restitue à la commande d’ouverture.

En guidage portrait, instruction et résumé sont regroupés en bas. Le paysage répartit instruction et commandes sur les côtés pour dégager le centre. Le cadrage mesure les panneaux effectivement affichés et respecte les zones système. Attribution OSM toujours accessible. Carte PiP et Android Auto : route orange, véhicule menthe ; le PiP conserve ses composants natifs.

## Mouvement

Conserver le moteur Canvas avec une lecture de trace d’environ deux secondes et une confirmation finale de 650 ms. Le calcul conserve sa durée propre ; recalculs GPS en 200 ms au plus. Transitions d’interface : 200 ms, `cubic-bezier(.23,1,.32,1)`, opacité et déplacement de 8 px. Pression de l’action principale seulement : 160 ms, échelle .97. Les commandes répétées restent stables. Aucun déplacement au clavier ; en mouvement réduit, conserver seulement les retours d’opacité. Pas de bibliothèque ajoutée ni de chorégraphie publicitaire au chargement du produit.

## Affinage de la préparation

Le titre précède une seule phrase d’aide. Les champs de trajet se distinguent par leur fond, avec des commandes de sélection de 48 px. Options du trajet utilise une surface discrète et un indicateur d’ouverture. Sur mobile, l’action de calcul occupe la largeur disponible. Les groupes de paramètres se séparent par des surfaces opaques et de l’espace.
