# Pistes pour rapprocher Éclaire d’un GPS

| Amélioration | Faisabilité avec l’existant | Travail principal |
| --- | --- | --- |
| Éviter les autoroutes et les péages | Implémenté pour les applications mobiles, alpha.4 | Préférences indépendantes et mémorisées ; filtres sur les deux critères et le raccordement ; import `road_class`/`toll` et nouveau graphe avec ses index. Tests de bretelles, absence de chemin, données manquantes et ancien serveur. Le secours Paris est refusé avec évitement. Vérifier `roadPreferences: true` dans `/api/health` après déploiement du nouveau graphe. |
| Recalcul automatique | Le calcul et le recalcul manuel existent | Déclencher après confirmation de sortie de route, limiter les requêtes, gérer les retours GPS et les échecs sans lancer plusieurs calculs concurrents. Le service actuel ne calcule qu’un trajet à la fois. |
| Position sur routes parallèles et sens de circulation | Le rapprochement géométrique actuel fournit une base | Ajouter un map matching multi-hypothèse utilisant cap, vitesse, topologie et historique, puis l’évaluer sur des trajets enregistrés et des échangeurs. |
| Guidage vocal fiable | Synthèse vocale web disponible selon la WebView | Tester les langues et interruptions ; gérer le volume, la priorité audio, Bluetooth et les interruptions avec les API natives si nécessaire. |
| Voies de circulation | Les manœuvres et la géométrie existent, pas les voies | Importer et valider les données de voies et de changements de voie, puis enrichir les réponses et l’interface. La couverture OSM peut être incomplète. |
| Trafic et ETA dynamique | Durées actuelles issues du réseau OSM, sans trafic | Intégrer un fournisseur et ses licences, actualiser les vitesses et étudier leur effet sur l’optimalité et les index. Les coûts et la couverture dépendront du fournisseur. |
| Guidage en arrière-plan | Implémenté Android et iOS, alpha.4 | Progression et voix natives ; service Android au premier plan avec notification et arrêt ; Core Location iOS en arrière-plan avec permission à l’usage et indicateur système. Reprise de l’état au retour. Builds et tests simulés validés ; GPS, batterie, Bluetooth et interruptions restent à tester sur téléphone physique. |
| Utilisation hors ligne | Un extrait Paris est embarqué ; le moteur national et les tuiles sont distants | Préparer des régions téléchargeables, un moteur et un stockage local adaptés, les mises à jour et une source de cartes autorisant explicitement l’usage hors ligne. |
| Fiabilité des limites de vitesse | Les limites OSM disponibles et la vitesse GPS sont déjà affichées | Traiter les limites conditionnelles, inconnues et temporaires ; vérifier la qualité des données et ne jamais remplacer la signalisation. |

# Fournir une application iOS

1. Installer la plateforme `@capacitor/ios` compatible avec Capacitor 8, créer le projet iOS et le synchroniser avec l’URL HTTPS du moteur. Un Mac avec Xcode compatible est nécessaire pour compiler et tester.
2. Configurer l’identifiant, la signature, les icônes, le lancement et les descriptions de localisation dans `Info.plist`. Tester les autorisations, la précision, le GPS et l’interface autour de la Dynamic Island sur un vrai iPhone.
3. Porter le pont natif Android `EclaireDevice` sur iOS : version installée et maintien de l’écran allumé pendant le guidage, avec libération à la pause et à l’arrêt. Vérifier le thème automatique, les barres système et le stockage des préférences.
4. Remplacer la mise à jour Android par le parcours iOS approprié : TestFlight pour les essais, puis App Store après signature et validation Apple. Un compte Apple gratuit suffit pour tester sur ses propres appareils avec Xcode ; la distribution nécessite l’adhésion au programme développeur.
5. Préparer les informations de confidentialité et la fiche App Store, puis tester les fonctions et dépendances réseau sur appareil. Le suivi en arrière-plan est implémenté dans l’alpha.4 ; sa validation sur iPhone physique et celle des informations de confidentialité restent nécessaires avant distribution Apple.

Références : [Capacitor iOS](https://capacitorjs.com/docs/ios), [configuration et permissions iOS](https://capacitorjs.com/docs/ios/configuration), [adhésion Apple Developer](https://developer.apple.com/help/account/membership/program-enrollment), [localisation Apple](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services).
