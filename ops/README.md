# Déploiement Raspberry Pi

Destination : `https://eclaire.nriault.fr/`, Raspberry Debian 13 ARM64 de 2 Go.
Le code et les builds sont dans `/home/nriault/apps/eclaire` ; Java 21 Temurin
ARM64 dans `/home/nriault/.local/share/eclaire/java`. Éclaire utilise un service
**systemd utilisateur**, avec persistance du gestionnaire utilisateur (`Linger=yes`).
Le port **127.0.0.1:8788** évite celui de Hermes (8787).

## Index et mémoire

Le Dijkstra France complet dépasse la mémoire disponible sur ce Pi. Le profil
déployé utilise A* bidirectionnel avec huit landmarks par critère, sans CH. Les
index sont calculés sur une machine plus puissante puis transférés avec le graphe.
L’animation montre la véritable exploration A*, qui est différente de Dijkstra.
Un test Java compare 200 requêtes indexées à Dijkstra avec restrictions de virage.

Les index sont propres au graphe **et aux poids**. Garder ensemble le graphe et
ses sous-dossiers `landmarks-v1-time` / `landmarks-v1-distance`. Pour une mise à jour
OSM ou du modèle de poids, créer un nouveau dossier de graphe et reconstruire les
index. Ne pas mélanger un index ancien avec de nouvelles routes ou vitesses.

Sur la machine de préparation, après l’import France :

```sh
npm run server:build
ECLAIRE_LANDMARKS=prepare java -Xmx8g -jar server/target/eclaire-routing.jar
```

Attendre `Éclaire France ready`, puis arrêter ce processus. La préparation des
deux index a pris environ six minutes sur le Mac utilisé ; leur taille totale est
d’environ 1,2 Go. Le Pi charge le graphe préparé (environ 3,2 Go avec les index),
sans fichier OSM brut et sans recalculer ces index.

`ops/eclaire.service` limite le tas Java à **512 Mo**, la recherche à deux millions
d’états et 120 secondes, avec un seul calcul simultané. Le service prévoit aussi
des limites systemd ; leur contrôle mémoire dépend des contrôleurs cgroup du
système. Sur le Pi contrôlé, `MemoryCurrent` n’est pas exposé : seule la limite
de tas Java et la mémoire observée sont confirmées. Une limite atteinte renvoie
une erreur, jamais un trajet annoncé optimal sans preuve.

## Mise à jour du code et des builds

Le compte SSH du Pi n’a pas accès directement au nouveau dépôt GitHub Éclaire.
Le premier checkout a donc été transféré par **Git bundle**, sans ajouter de clé
ni élargir les permissions des clés existantes. Les mises à jour se font depuis
une machine disposant de l’accès GitHub :

```sh
npm ci
npm test
npm run server:build
npm run build
git bundle create /tmp/eclaire.bundle main
scp /tmp/eclaire.bundle nriault@192.168.1.122:/tmp/eclaire.bundle
ssh nriault@192.168.1.122 'git -C ~/apps/eclaire pull --ff-only /tmp/eclaire.bundle main'
ssh nriault@192.168.1.122 'systemctl --user stop eclaire'
scp server/target/eclaire-routing.jar nriault@192.168.1.122:~/apps/eclaire/server/target/
rsync -a dist/ nriault@192.168.1.122:~/apps/eclaire/dist/
ssh nriault@192.168.1.122 'systemctl --user start eclaire'
```

Ne pas remplacer le JAR pendant son exécution. Garder les versions précédentes
du JAR, du build et du graphe pour un retour arrière. Le fichier OSM brut, les
index, le runtime, les builds et les secrets ne sont pas publiés dans Git.

Si les index changent, les transférer **après leur préparation achevée** :

```sh
rsync -a --partial server/data/france-graph/ nriault@192.168.1.122:~/apps/eclaire/server/data/france-graph/
```

Pour une nouvelle version OSM, utiliser de nouveaux dossiers locaux et distants,
arrêter le service, changer `ECLAIRE_GRAPH_DIR`, puis redémarrer ; ne pas écraser
le graphe utilisé par un processus en cours.

## Service et HTTPS

```sh
install -m 644 ops/eclaire.service ~/.config/systemd/user/eclaire.service
systemctl --user daemon-reload
systemctl --user enable --now eclaire
curl -f http://127.0.0.1:8788/api/health
```

L’installation HTTPS exige le mot de passe sudo du propriétaire :

```sh
ssh -t nriault@192.168.1.122 'sudo bash /home/nriault/apps/eclaire/ops/install-raspberry-https.sh'
```

Ce script vérifie le backend, installe un vhost Nginx séparé, obtient le certificat
Let’s Encrypt puis active la redirection HTTPS. Il teste Nginx avant rechargement
et restaure le vhost précédent en cas d’échec. Les autres vhosts, dont la
restriction domicile de Hermes, sont conservés.

Le proxy limite les créations de trajet à **deux par minute et par IP**, avec une
petite marge de rafale, et renvoie 429 en cas de dépassement. Les requêtes API
ne sont pas consignées dans l’access log de ce vhost. Les tuiles restent servies
par OSM selon sa politique ; ce n’est pas une infrastructure de trafic massif.

## Vérification

```sh
systemctl --user is-active eclaire
python3 ops/smoke-routing.py
curl -f https://eclaire.nriault.fr/api/health
```

La recette compare des coûts de référence Dijkstra pour Paris–Lyon et
Brest–Marseille, vérifie les deux critères et couvre Ajaccio–Bastia. Lancer ce
script côté loopback du serveur ; il dépasse volontairement la fréquence
publique autorisée par Nginx. Le GPS nécessite HTTPS et une permission du
navigateur. Le guidage expérimental reste limité à l’application visible.
