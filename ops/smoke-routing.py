#!/usr/bin/env python3
"""Vérifie des trajets publics, sans accès au GPS ni à des adresses personnelles."""
import argparse
import json
import math
import uuid
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:8788')
options = parser.parse_args()
cases = [
    ('Paris–Lyon', 'time', [48.8566, 2.3522], [45.7578, 4.832], 15527.6157),
    ('Paris–Lyon', 'distance', [48.8566, 2.3522], [45.7578, 4.832], 441131.6946344737),
    ('Brest–Marseille', 'time', [48.3904, -4.4861], [43.2965, 5.3698], 43053.181702512025),
    ('Brest–Marseille', 'distance', [48.3904, -4.4861], [43.2965, 5.3698], 1096550.6994009037),
    ('Téloché–Le Barcarès', 'time', [47.885649, 0.277005], [42.787086, 3.034846], 27313.397255289758),
    ('Téloché–Le Barcarès', 'distance', [47.885649, 0.277005], [42.787086, 3.034846], 707877.3176598481),
    ('Dunkerque–Perpignan', 'time', [51.0344, 2.3768], [42.6887, 2.8948], 37532.205426813314),
    ('Dunkerque–Perpignan', 'distance', [51.0344, 2.3768], [42.6887, 2.8948], 1058563.6425426053),
    ('Ajaccio–Bastia', 'time', [41.9192, 8.7386], [42.6973, 9.4509], None),
]
for name, criterion, start, end, expected in cases:
    body = {'requestId': str(uuid.uuid4()), 'criterion': criterion,
            'start': dict(zip(('lat', 'lon'), start)), 'end': dict(zip(('lat', 'lon'), end))}
    request = Request(options.base.rstrip('/') + '/api/route', json.dumps(body).encode(), {'Content-Type': 'application/json'})
    result = None
    transferred = 0
    with urlopen(request, timeout=150) as response:
        for line in response:
            transferred += len(line)
            item = json.loads(line)
            if item['type'] == 'result':
                result = item['result']
    assert result and result['found'] and result['path'], (name, result)
    assert math.isfinite(result['cost']), name
    if expected is not None:
        assert abs(result['cost'] - expected) < 0.01, (name, 'coût optimal de référence différent', result['cost'], expected)
    assert result['instructions'][0]['at'] == 0
    assert result['instructions'][-1]['sign'] == 4
    assert abs(result['instructions'][-1]['at'] - result['length']) < 0.01
    print(json.dumps({'case': name, 'criterion': criterion, 'metres': result['length'], 'seconds': result['seconds'],
                      'visited': result['visited'], 'computeMs': result['computeMs'], 'bytes': transferred}, ensure_ascii=False), flush=True)
