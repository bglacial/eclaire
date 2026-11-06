# Parcours Éclaire — alpha.18

La piste A des propositions du 6 novembre 2026 est retenue : carte au premier plan, recherche dédiée et liste ordonnée pour préparer le trajet. Le résumé compact de l’alpha.17 est remplacé pour rendre les étapes et la comparaison accessibles.

## Parcours livrés

| Besoin | Parcours |
|---|---|
| Définir le domicile | Accueil → Domicile → adresse, position ou carte → aperçu → Enregistrer mon domicile. Aucune arrivée n’est nécessaire ni modifiée. |
| Gérer les lieux | Mes lieux depuis l’accueil ou les paramètres → domicile, travail, favoris et récents. Modification indépendante du trajet, retraits annulables et erreur de stockage explicite. |
| Choisir une destination | Recherche dédiée → suggestions avec commune/adresse → aperçu sur carte → confirmation → calcul. Un domicile déjà défini ouvre aussi cet aperçu. |
| Choisir sur carte | Recherche → Choisir sur la carte → repère → confirmation explicite. Un retour ne remplace pas le point précédent. |
| Préparer des étapes | Ajouter une étape → adresse, lieux enregistrés ou lieux sur le parcours → liste numérotée → déplacer/retirer → calculer ou mettre à jour. Même éditeur avant et après le calcul initial. |
| Chercher un POI | Sur mon trajet → station-service, parking ou restaurant → liste et repères numérotés → fiche du lieu → Ajouter aux étapes → Mettre à jour le trajet. |
| Modifier un trajet | Le dernier trajet confirmé continue pendant la préparation. Le nouveau trajet ne le remplace qu’après calcul réussi et vérification de la position lors du guidage. |
| Régler les options | Options du trajet : critère et évitements ponctuels. Paramètres : valeurs par défaut pour les nouveaux trajets. Les réglages par défaut ne modifient pas le trajet en cours. |
| Se guider | Résumé → Démarrer le guidage → instruction et carte → Voix, Recentrer, Trajet, Terminer. La sortie est confirmée avant l’arrivée. |
| Revenir | Bouton Retour/Carte, Retour Android, historique du navigateur et geste de retour iOS. Les pages imbriquées rendent le focus au contrôle d’origine. |

## Invariants conservés

- Départ GPS imposé sur l’application mobile ; choix manuel du départ et permutation sur le Web.
- Une permission GPS est expliquée avant la première demande native. Une arrivée et des étapes peuvent être préparées pendant l’attente ; une nouvelle tentative GPS reste disponible dans l’éditeur.
- Jusqu’à huit étapes et vingt favoris. Les étapes atteintes pendant une préparation ne sont pas réintroduites lors de la confirmation.
- Une préparation interrompue demande de conserver ou d’abandonner ses changements. Les étapes peuvent être déplacées au pointeur ou avec les boutons Monter/Descendre, et un retrait peut être annulé.
- Les lieux enregistrés restent sur cet appareil. Un échec de stockage ne valide pas un enregistrement fictif.
- Les POI ne sont pas exhaustifs : jusqu’à six lieux évalués par portion de 50 km et à moins de 1 km du tracé. La recherche porte sur la partie restante pendant le guidage.
- Le détour présenté sur la fiche est une estimation d’accès et de retour au parcours, sans trafic. Le total du trajet est confirmé après recalcul complet. Aucun horaire, prix, note ou état d’ouverture n’est inventé.
- Le guidage natif, le recalcul, l’arrière-plan, le verrouillage, Android Auto et le PiP Android conservent leurs mécanismes existants.
- Hors connexion : trajet chargé conservé, nouvelles cartes et nouveaux calculs indisponibles. Un GPS imprécis ne confirme pas une progression ou une arrivée.
- Les réglages de thème suivent le système par défaut. Texte agrandi, clavier, commandes nommées, cibles tactiles et réduction des mouvements restent pris en charge.

## Captures de recette

Les captures utilisent le harnais de recette avec GPS et service routier simulés. Elles illustrent l’interface avec des données de démonstration et ne prouvent pas la disponibilité d’un établissement ni la qualité d’un guidage réel.

| Accueil | Domicile | Trajet |
|---|---|---|
| [Accueil](parcours-alpha18/01-accueil.png) | [Recherche](parcours-alpha18/02-domicile-recherche.png) · [Confirmation](parcours-alpha18/03-domicile-confirmer.png) | [Résumé](parcours-alpha18/04-trajet.png) |

| Étapes | Points d’intérêt | Guidage |
|---|---|---|
| [Ajout](parcours-alpha18/06-ajouter-etape.png) · [Confirmation](parcours-alpha18/09-etapes-confirmer.png) | [Résultats](parcours-alpha18/07-points-interet.png) · [Fiche](parcours-alpha18/08-point-interet-fiche.png) | [Mode sombre](parcours-alpha18/10-guidage-sombre.png) |

[Mes lieux](parcours-alpha18/05-mes-lieux.png).

## Recette reproductible

Avec Vite lancé et Playwright disponible dans `NODE_PATH` :

```sh
npm test
node tests/user-feedback-ui.mjs
node tests/journeys-ui.mjs
node tests/map-interactions-ui.mjs
npm run test:ios
```

`journeys-ui.mjs` enregistre ses captures dans `/private/tmp/eclaire-alpha18-ui`, ou dans le dossier défini par `ECLAIRE_SCREENSHOTS`. Il couvre le domicile indépendant, le refus du stockage, la préparation pendant le GPS, la nouvelle tentative sans perdre les étapes, les deux modes de réordonnancement, l’annulation, les POI, le retour navigateur, les tailles 320/390/844/1024 px, le texte à 200 % et les contrastes des textes en clair et sombre.

Les tests et les captures ne sont pas inclus dans les ressources livrées de l’application. Les builds et les simulations ne remplacent pas une recette sur téléphone physique ou un essai routier.

## Validation de publication

- 66 tests TypeScript réussis, 25 scénarios d’interface existants et 7 groupes de nouveaux parcours réussis.
- Contrôle du cadrage, du pincement, du déplacement et de la rotation réussi. Le cache du canvas projette ses points avec son repère capturé pour éviter une double rotation après un pan.
- 19 contrôles du prototype partagé réussis ; tests Swift du tracker et du pont Capacitor réussis.
- Android : 32 tests debug et 33 tests release, sans échec ; deux tests réseau du serveur public sont ignorés dans chaque variante. Le paquet instrumenté de l’application est compilé, sans exécution faute d’appareil connecté.
- Builds Web, APK Android et application iOS simulateur ARM64/x86_64 réussis. Version Android 22 et build iOS 22.
- APK vérifié : signature identique à l’alpha.17, alignement 16 Ko, ressources identiques au build Web final et absence du harnais de recette. Ressources iOS identiques au même build.
- Pas d’essai sur téléphone physique, de recette routière, d’IPA signé ou de distribution TestFlight. La préversion GitHub ne déploie pas le site public.
