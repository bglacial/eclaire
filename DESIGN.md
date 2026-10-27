# Design

## Direction

Une personne prépare son trajet sur son téléphone en journée ou sur son ordinateur à la lumière du bureau : carte claire, commandes opaques et lecture nette. Inspiration de nriault.fr : assurance du cobalt, accent citron ponctuel, typographie franche. La carte garde ses propres codes, sans copier le portfolio.

## Palette et typographie

Neutres clairs teintés, en OKLCH. Cobalt pour les actions et sélections, citron pour le symbole de marque uniquement. Cyan et ambre pour les fronts sur une carte peu saturée ; route finale cobalt avec contour clair. Police système pour les libellés et les données, échelle fixe. Chiffres tabulaires pour les métriques.

## Composition

Barre de marque compacte, panneau de préparation à gauche sur ordinateur, carte dominante. Sur téléphone, commandes en bas et outils de carte en haut. Résultat compact avec les deux adresses, durée et distance. Aucun panneau imbriqué décoratif. Attribution OSM toujours accessible.

En guidage sur téléphone, la carte occupe toute la hauteur disponible et la barre de marque disparaît. En portrait, l'instruction reste en haut et les données du trajet et les actions en bas ; en paysage, elles se répartissent sur les côtés. Les avertissements GPS restent visibles lorsqu'ils sont utiles. Le véhicule se place dans la carte dégagée pour laisser voir la route à venir. Les panneaux respectent les zones système et l'encoche.

## Mouvement

Conserver le moteur Canvas de l'éclair et ses timings explicatifs. Les transitions d'interface durent 200 ms avec --ease-out: cubic-bezier(0.23, 1, 0.32, 1). Seulement opacité et transformation. Aucun mouvement au clavier ni aux commandes de zoom répétées. En mode réduit, garder un retour d'opacité, supprimer les déplacements et le zoom animé. Pas de bibliothèque supplémentaire.
