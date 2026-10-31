# Guidage, PiP et préparation des trajets

Suivi du chantier demandé : les cases ne sont cochées qu’après réalisation et vérification adaptée. Les essais sur route, en véhicule et sur iPhone exigent le matériel et la participation de l’utilisateur.

## PiP
- [x] Recalcul automatique en PiP et arrière-plan, avec préférences et erreurs réseau.
- [x] Interpolation et estimation GPS bornée en PiP, avec signalement explicite.
- [x] Carte orientée, position directionnelle et zoom adaptés.
- [x] Manœuvre et distance lisibles, états GPS et recalcul prioritaires.
- [x] Commandes PiP pour la voix et l’arrêt.
- [x] Réglage persistant du PiP automatique.

## Hors PiP
- [ ] Essais réels Android : ville, tunnel, route parallèle, écran verrouillé, Bluetooth, batterie et véhicule Android Auto.
- [ ] Recalcul natif écran verrouillé, en conservant trajet, options et récupération des erreurs.
- [x] Rapprochement routier amélioré par cap, vitesse et historique, y compris routes parallèles et superposées.
- [x] Continuité du trajet déjà calculé en cas de perte réseau et indication explicite des limites ; étudier les cartes hors ligne avec un fournisseur autorisé.
- [x] Favoris et destinations récentes locales.
- [x] Recherche multi-sources progressive, dédoublonnage et adresse lisible.
- [x] Étape intermédiaire avant le départ, transmise aux calculs et recalculs.
- [x] Comparaison des trajets les plus rapides et les plus courts lorsqu’ils diffèrent.
- [x] Vérifier et améliorer les annonces vocales ; étudier les indications de voies seulement avec des données fiables.
- [ ] Android Auto et installation iOS sur appareil réel : vérifier, corriger et documenter les blocages de signature et de matériel.
- [x] Relecture et explication du calcul et des critères de trajet.
- [x] Documentation cohérente avec le comportement effectivement livré.
- [x] Étudier le trafic temps réel : fournisseur, couverture, coûts, accès et adaptation du calcul.

Le rapprochement tient maintenant compte de la progression attendue d’après la dernière position confirmée et la vitesse, avec un biais borné et désactivé après 15 secondes ou si la vitesse est invalide. Les tests web, Android et Swift couvrent les sauts prématurés et les retours vers une autre portion parallèle ou superposée du trajet. Cela réalise l’amélioration demandée du rapprochement par cap, vitesse et historique. L’identification du niveau au démarrage sans historique, et les voies voisines absentes du trajet calculé, restent hors de portée du rapprochement géométrique actuel. La campagne sur route reste ouverte séparément.

## Validation restante — matériel indisponible

Au 31 octobre 2026, le Pixel n’est plus disponible et `adb devices` ne liste aucun appareil. Aucun iPhone physique ni véhicule Android Auto n’est accessible. Les trois cases encore ouvertes requièrent ces appareils et, pour la circulation, une personne à bord. Le recalcul natif est implémenté : il reste notamment à confirmer le correctif sur Pixel et le comportement écran verrouillé sur iPhone réel. La [recette terrain](recette-terrain.md) décrit les scénarios et les observations attendues. Les contrôles de l’alpha.11 passent : 57 tests web, 14 tests serveur, 32 tests Android dont les deux contrôles réseau optionnels activés, suivi Swift et encodage Capacitor ; le build web passe. Ces contrôles ne valident pas la réception GPS en conduite, Bluetooth, la batterie ni l’affichage en véhicule.

Les essais matériels restent à finir avant validation définitive. Sur Pixel 10a / Android 17 : PiP et commandes testés avec positions simulées, puis GPS réel reçu écran éteint à l’arrêt. Un essai de recalcul avec le service public a échoué ; le scénario utilisait un raccordement à 309 m, cas auparavant rejeté au lieu de proposer de rejoindre la route. Correction et tests ajoutés sur Android et iOS ; le recalcul avec ce point réussit sur émulateur contre le service public, en PiP et lorsque l’appareil est verrouillé, via un relais local compensant un DNS défaillant. La cause de l’échec initial sur le Pixel reste indéterminée et le correctif reste à confirmer sur cet appareil, actuellement indisponible. Sur simulateur iPhone, le guidage et le recalcul en arrière-plan ont été vérifiés avec le service public : une étape est conservée avant passage et supprimée du recalcul une fois atteinte. Les seuils des annonces vocales sont testés ; l’écoute et Bluetooth restent à vérifier sur matériel. Aucune indication de voie n’est inventée. Aucun essai sur iPhone physique. Étude : [cartes hors ligne et trafic](cartes-hors-ligne-et-trafic.md).
