ROUND 1
Seen in one second: Le grand titre et la carte Paris.
Idea (one sentence): Les recherches réelles d’Éclaire deviennent une affiche routière interactive.
Live thing: Le calcul Paris et la modification des étapes dans le prototype.
Layout words by section: hero=affiche / essayer=saisie / parcours=fragment fixé / choix=liste / fin=invitation
Scores: design 7 · usability 5 · creativity 7.5 · content 8 → overall 6.0
Caps applied: FAILs de titres et de comptage de mouvement ; le chevauchement du visuel mobile nuit à l’usage.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. mobile-fold.jpg : le titre prend trois lignes et l’image couvre la phrase. Réduire l’image, garder le titre en deux lignes, arrêter l’image avant la bande d’action.
2. desktop-fold.jpg : le téléphone masque une partie du bouton. Réduire sa taille pour que sa traversée de la couture reste dans le champ vert, pas dans l’action.
3. mobile-page-01.jpg : plusieurs intertitres passent sur trois lignes. Raccourcir les mots avant de modifier la taille. Les captures de guidage ont été prises pendant la transition : les reprendre une fois l’état stabilisé.

Corrections supplémentaires : les entrées de présentation utilisent une animation CSS observable pendant le défilement ; les commandes du produit restent en WAAPI annulable. La palette de la page augmente le contraste encre/orange. Les lieux de démonstration sont dédupliqués par nom.

ROUND 2
Seen in one second: Le titre en deux lignes, puis la carte.
Idea (one sentence): Le calcul réel d’Éclaire invite à manipuler le parcours au lieu de promettre une navigation abstraite.
Live thing: Calcul, brouillon d’étapes annulable, détour d’une pause et progression simulée.
Layout words by section: hero=affiche / essayer=saisie / parcours=fragment fixé / choix=liste / fin=invitation
Scores: design 7.5 · usability 6 · creativity 7 · content 8 → overall 6.9
Caps applied: Aucun FAIL technique restant ; le chevauchement tablette plafonne l’usage à 6.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. tablet-fold.jpg : la grande capture couvre encore l’action. Réduire la capture à 170 px maximum et l’arrêter avant la bande grise.
2. desktop-fold.jpg : une simple route orange pourrait appartenir à tout GPS. Utiliser une capture des vrais fronts cyan et ambre et une phrase qui explique leur rencontre.
3. mobile-page-01.jpg : le temps de guidage se repliait en deux lignes et un seul restaurant permettait mal de comparer. Garder chiffres et unités ensemble, présenter trois lieux réels disposant d’un détour calculable dans cet extrait.

ROUND 3
Seen in one second: Le chemin prend vie, en grand, et une carte qui explore.
Idea (one sentence): Les deux recherches réelles d’Éclaire deviennent la matière d’une affiche et d’une démonstration manipulable.
Live thing: Le visiteur choisit une destination réelle de l’extrait puis peut modifier le parcours et simuler son suivi.
Layout words by section: hero=affiche / essayer=saisie / parcours=fragment fixé / choix=liste / fin=invitation
Scores: design 7.5 · usability 7.8 · creativity 7.5 · content 8 → overall 7.6
Caps applied: Aucun : dernier contrôle, 0 FAIL et 2 WARN justifiés ci-dessous. Évaluation interne, pas un jury indépendant.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. mobile-fold.jpg : la capture d’accueil reste petite. Choix assumé pour garder titre, explication et action visibles au premier écran ; le prototype et les captures suivantes s’ouvrent à taille utile.
2. desktop-page-01.jpg : la carte locale laisse apparaître les limites de l’extrait sur grand écran. Limite de démonstration explicitée, pas une promesse de fond cartographique national hors connexion.
3. mobile-page-01.jpg : les quatre étapes allongent la présentation. Chaque écran apporte un état différent ; le lien Essayer permet d’aller directement au prototype.

## Mesures et avertissements conservés

Trois largeurs : 1440, 768 et 390 px. Titres de deux lignes au maximum, pas de débordement. Les deux polices locales sont effectivement chargées. Les entrées de présentation sont observées sur 29 éléments, une seule fois ; la simulation de conduite ne comporte pas cette chorégraphie. Le prototype passe 19 contrôles de parcours, dont annulation, ajout de lieu, retour au suivi et mouvement réduit.

- `size-count` : les tailles supplémentaires correspondent à la marque monumentale, à la saisie réellement interactive et au symbole de commande ; le texte de lecture reste organisé en petite note, corps et introduction. Cet écart est conservé pour la présentation, pas proposé comme échelle de l’interface de conduite.
- `no-footage` : aucun film de route pertinent et licencié n’est disponible. Les captures et le calcul manipulable montrent le logiciel lui-même ; la signature anime une capture du vrai calcul plutôt qu’un film de route sans rapport. Aucun faux trajet filmé n’est inventé.

Les essais sur téléphone physique, en plein soleil et en habitacle de nuit restent nécessaires avant intégration de ce style. Aucune validation de conduite réelle n’est revendiquée pour ce prototype.
