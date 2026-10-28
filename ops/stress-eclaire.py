#!/usr/bin/env python3
"""Mesure des parcours Éclaire sans utiliser de positions personnelles."""
import argparse
import concurrent.futures
import gzip
import http.client
import json
import math
import re
import statistics
import threading
import time
import uuid
import zlib
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROUTES = {
    'court': ([48.859, 2.337], [48.8462, 2.3464]),
    'moyen': ([48.8566, 2.3522], [45.7578, 4.832]),
    'long': ([47.885649, 0.277005], [42.787086, 3.034846]),
    'traversee': ([51.0344, 2.3768], [42.6887, 2.8948]),
}


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(len(ordered) * fraction) - 1)], 2)


def record_http_error(item, error):
    item['status'] = error.code
    item['error'] = 'HTTP ' + str(error.code)
    if error.headers and error.headers.get('Retry-After'):
        item['retry_after'] = error.headers.get('Retry-After')
    try:
        body = json.loads(error.read(16_384))
        if isinstance(body, dict):
            if isinstance(body.get('error'), str):
                item['service_error'] = body['error'][:500]
            for field in ('visited', 'computeMs'):
                if isinstance(body.get(field), (int, float)):
                    item[field] = body[field]
    except (ValueError, OSError):
        pass
    finally:
        error.close()


def request_once(base, scenario, criterion, timeout):
    started = time.perf_counter()
    if scenario == 'startup':
        return startup_once(base, timeout)
    path = '/api/route' if scenario in ROUTES else '/api/health' if scenario == 'health' else '/'
    payload = None
    headers = {'Accept-Encoding': 'identity'}
    if scenario in ROUTES:
        start, end = ROUTES[scenario]
        payload = json.dumps({'requestId': str(uuid.uuid4()), 'criterion': criterion,
                              'start': {'lat': start[0], 'lon': start[1]},
                              'end': {'lat': end[0], 'lon': end[1]}}).encode()
        headers['Content-Type'] = 'application/json'
    request = Request(base.rstrip('/') + path, payload, headers)
    item = {'status': None, 'ok': False, 'bytes': 0}
    try:
        with urlopen(request, timeout=timeout) as response:
            item['status'] = response.status
            item['ttfb_ms'] = round((time.perf_counter() - started) * 1000, 2)
            if scenario in ROUTES:
                result = None
                for line in response:
                    item['bytes'] += len(line)
                    message = json.loads(line)
                    if message.get('type') == 'result':
                        result = message.get('result')
                item['ok'] = bool(result and result.get('found') is True and result.get('path'))
                if result:
                    item['compute_ms'] = result.get('computeMs')
                    item['visited'] = result.get('visited')
            else:
                body = response.read()
                item['bytes'] = len(body)
                item['ok'] = bool(body) and (scenario != 'health' or json.loads(body).get('status') == 'ready')
            if not item['ok']:
                item['error'] = 'réponse incomplète ou invalide'
    except HTTPError as error:
        record_http_error(item, error)
    except (OSError, URLError, ValueError, EOFError, zlib.error, http.client.HTTPException) as error:
        item['error'] = type(error).__name__
    item['duration_ms'] = round((time.perf_counter() - started) * 1000, 2)
    return item


def startup_once(base, timeout):
    started = time.perf_counter()
    item = {'status': None, 'ok': False, 'bytes': 0, 'resources': 0}
    try:
        def fetch(path):
            request = Request(base.rstrip('/') + path, headers={'Accept-Encoding': 'gzip'})
            with urlopen(request, timeout=timeout) as response:
                if path == '/':
                    item['ttfb_ms'] = round((time.perf_counter() - started) * 1000, 2)
                body = response.read()
                if not body:
                    raise ValueError('ressource vide')
                item['status'] = response.status
                item['bytes'] += len(body)
                item['resources'] += 1
                return gzip.decompress(body) if response.headers.get('Content-Encoding') == 'gzip' else body
        html = fetch('/').decode('utf-8')
        assets = re.findall(r'(?:src|href)="(/assets/[^"?]+\.(?:js|css))"', html)
        if not any(path.endswith('.js') for path in assets) or not any(path.endswith('.css') for path in assets):
            raise ValueError('assets manquants')
        for path in assets + ['/data/paris.json']:
            fetch(path)
        item['ok'] = True
    except HTTPError as error:
        record_http_error(item, error)
    except (OSError, URLError, ValueError, EOFError, zlib.error, http.client.HTTPException) as error:
        item['error'] = type(error).__name__
    item['duration_ms'] = round((time.perf_counter() - started) * 1000, 2)
    return item


def run_stage(base, scenario, criterion, users, requests_per_user, think, timeout):
    barrier = threading.Barrier(users)
    def user():
        barrier.wait()
        records = []
        for index in range(requests_per_user):
            records.append(request_once(base, scenario, criterion, timeout))
            if index + 1 < requests_per_user and think:
                time.sleep(think)
        return records
    start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=users) as pool:
        records = [record for batch in pool.map(lambda _: user(), range(users)) for record in batch]
    duration = time.perf_counter() - start
    successful = [item for item in records if item['ok']]
    durations = [item['duration_ms'] for item in successful]
    first_bytes = [item['ttfb_ms'] for item in successful if 'ttfb_ms' in item]
    return {'users': users, 'requests': len(records), 'success': len(successful),
            'statuses': dict(Counter(str(item['status']) if item['status'] is not None else 'network_error' for item in records)),
            'errors': dict(Counter(item['error'] for item in records if not item['ok'])),
            'elapsed_seconds': round(duration, 2), 'success_per_second': round(len(successful) / duration, 3),
            'latency_ms': {'p50': percentile(durations, .5), 'p95': percentile(durations, .95),
                           'p99': percentile(durations, .99), 'max': max(durations, default=None)},
            'ttfb_ms': {'p50': percentile(first_bytes, .5), 'p95': percentile(first_bytes, .95)},
            'compute_ms_median': round(statistics.median([r['compute_ms'] for r in successful if isinstance(r.get('compute_ms'), (int, float))]), 2)
                                 if any(isinstance(r.get('compute_ms'), (int, float)) for r in successful) else None,
            'responses': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, help='URL du service à tester, par exemple https://eclaire.nriault.fr')
    parser.add_argument('--scenario', choices=['startup', 'static', 'health', *ROUTES], required=True)
    parser.add_argument('--criterion', choices=['time', 'distance'], default='time')
    parser.add_argument('--users', default='1,2,4', help='Paliers de clients simultanés, séparés par des virgules')
    parser.add_argument('--requests-per-user', type=int, default=3)
    parser.add_argument('--think', type=float, default=1, help='Secondes entre les demandes de chaque client')
    parser.add_argument('--pause', type=float, default=2, help='Secondes entre les paliers')
    parser.add_argument('--timeout', type=float, default=150)
    parser.add_argument('--stop-p95-ms', type=float, default=0, help='Arrêter la montée si le p95 dépasse ce seuil ; 0 désactive le seuil')
    parser.add_argument('--output', type=Path, help='Enregistrer les résultats détaillés en JSON')
    args = parser.parse_args()
    target = urlsplit(args.base)
    try:
        levels = [int(level) for level in args.users.split(',')]
    except ValueError:
        parser.error('Les paliers doivent être des entiers.')
    if target.scheme not in ('http', 'https') or not target.hostname or target.username or target.password or target.path not in ('', '/') or target.query or target.fragment:
        parser.error('Fournir une URL de base HTTP(S), sans chemin ni identifiant.')
    if not levels or any(level < 1 or level > 100 for level in levels) or not 1 <= args.requests_per_user <= 100 or not 0 <= args.think <= 3600 or not 0 <= args.pause <= 3600 or not 0 < args.timeout <= 300 or not 0 <= args.stop_p95_ms <= 300_000:
        parser.error('Paramètres hors limites : 1 à 100 clients et requêtes par client, délai positif de 300 s maximum.')
    report = {'started_at': datetime.now(timezone.utc).isoformat(), 'base': args.base,
              'scenario': args.scenario, 'criterion': args.criterion, 'requested_levels': levels,
              'requests_per_user': args.requests_per_user, 'think_seconds': args.think,
              'pause_seconds': args.pause, 'timeout_seconds': args.timeout,
              'target_p95_ms': args.stop_p95_ms or None, 'stages': []}
    for index, users in enumerate(levels):
        if index and args.pause:
            time.sleep(args.pause)
        health = request_once(args.base, 'health', args.criterion, min(args.timeout, 10))
        if not health['ok']:
            report['stopped'] = 'health check indisponible avant le palier'
            break
        stage = run_stage(args.base, args.scenario, args.criterion, users, args.requests_per_user, args.think, args.timeout)
        report['stages'].append(stage)
        print(json.dumps({key: value for key, value in stage.items() if key != 'responses'}, ensure_ascii=False), flush=True)
        health = request_once(args.base, 'health', args.criterion, min(args.timeout, 10))
        if not health['ok'] or any(not item['ok'] and item['status'] != 429 for item in stage['responses']):
            report['stopped'] = 'réponse invalide, erreur HTTP hors 429 ou health check indisponible'
            break
        if args.stop_p95_ms and stage['latency_ms']['p95'] is not None and stage['latency_ms']['p95'] > args.stop_p95_ms:
            report['stopped'] = 'seuil de latence atteint'
            break
    report['finished_at'] = datetime.now(timezone.utc).isoformat()
    passing = [stage['users'] for stage in report['stages'] if stage['success'] == stage['requests']
               and stage['latency_ms']['p95'] is not None
               and (not args.stop_p95_ms or stage['latency_ms']['p95'] <= args.stop_p95_ms)]
    report['largest_passing_tested_stage'] = max(passing, default=None)
    print('Plus grand palier testé sans erreur' + (' et sous le seuil p95' if args.stop_p95_ms else '')
          + ' : ' + (str(report['largest_passing_tested_stage']) if passing else 'aucun'), flush=True)
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if report.get('stopped'):
        print('Arrêt : ' + report['stopped'], flush=True)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
