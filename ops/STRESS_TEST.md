# Mesurer la capacité d’Éclaire

`stress-eclaire.py` utilise uniquement la bibliothèque standard Python 3. Il crée des clients simultanés par paliers, lit les réponses en entier et vérifie qu’un trajet NDJSON contient un résultat trouvé. Les coordonnées des trajets sont des points publics prédéfinis ; le GPS et les adresses personnelles ne sont pas utilisés.

```sh
python3 tests/test_stress_eclaire.py
python3 ops/stress-eclaire.py --base https://eclaire.nriault.fr \
  --scenario startup --users 1,2,4,8,12 --requests-per-user 2 \
  --think 2 --pause 4 --stop-p95-ms 5000 --timeout 60 \
  --output /tmp/eclaire-startup.json
```

Les scénarios sont : `startup` (HTML, JavaScript, CSS et données Paris, avec gzip si disponible), `static` (HTML seul), `health`, `court` (Paris), `moyen` (Paris–Lyon) et `long` (Téloché–Le Barcarès). Les chargements `startup` sont sans cache navigateur, les ressources sont téléchargées successivement et le rendu, le parsing JavaScript ainsi que les tuiles OSM externes ne sont pas simulés. Les scénarios routiers acceptent `--criterion time` ou `distance`.

Chaque client démarre en même temps au début d’un palier, émet le nombre de requêtes indiqué puis attend `--think` secondes entre deux requêtes. Les paliers sont séparés par `--pause` secondes. Le programme affiche les statuts, les refus 429, le nombre de succès, la latence totale et le temps jusqu’au premier octet ; pour les trajets il conserve aussi le temps de calcul du moteur. `success_per_second` inclut les périodes d’attente : ce n’est pas un débit maximal soutenu. Le p95 utilise la méthode du rang le plus proche et reste indicatif quand l’échantillon est petit.

L’outil vérifie `/api/health` avant et après chaque palier, puis s’arrête si le service ne répond plus, si une réponse est invalide ou si une erreur autre que 429 apparaît. `--stop-p95-ms` arrête la montée après un palier dont le p95 des réponses réussies dépasse le seuil. Le plus grand palier annoncé est seulement le plus grand **effectivement testé** sans échec et, si fourni, sous ce seuil. Le programme renvoie un code non nul lorsqu’il s’arrête sur un seuil ou une erreur ; le rapport JSON indique la raison et conserve les réponses individuelles.

Le proxy public limite les calculs par adresse IP : plusieurs clients lancés depuis la même machine partagent donc le même quota. Pour mesurer séparément le moteur, un tunnel local temporaire utilise le backend de la machine, sans changer Nginx. Cette mesure interne ne simule pas plusieurs IP publiques ni le comportement du proxy :

```sh
ssh -N -L 127.0.0.1:18788:127.0.0.1:8788 nriault@192.168.1.122
# Dans un autre terminal :
python3 ops/stress-eclaire.py --base http://127.0.0.1:18788 \
  --scenario moyen --users 1,2 --requests-per-user 1 --pause 5 \
  --output /tmp/eclaire-moteur.json
```

Pendant une mesure sur le Raspberry, surveiller séparément les ressources et les autres services ; interrompre le tunnel après le test :

```sh
ssh nriault@192.168.1.122 'vmstat -t 1' > /tmp/eclaire-vmstat.txt
ssh nriault@192.168.1.122 'free -m; uptime; systemctl --user show eclaire.service -p ActiveState -p NRestarts'
```

Adapter les paliers et les seuils à la période et à l’usage réel. Un test court avec un seul client générateur ne démontre ni la capacité Internet globale, ni une capacité soutenue, ni un nombre maximal de sessions GPS ouvertes. Les résultats du 27 octobre 2026 sont documentés dans [`reports/stress-2026-10-27`](../reports/stress-2026-10-27/README.md).
