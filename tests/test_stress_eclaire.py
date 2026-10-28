import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('stress_eclaire', Path(__file__).parents[1] / 'ops' / 'stress-eclaire.py')
stress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stress)


class Response(io.BytesIO):
    status = 200
    headers = {}


class StressTest(unittest.TestCase):
    def test_route_requires_complete_result(self):
        good = json.dumps({'type': 'result', 'result': {'found': True, 'path': [1], 'computeMs': 8}}).encode() + b'\n'
        with patch.object(stress, 'urlopen', return_value=Response(good)):
            result = stress.request_once('http://example.test', 'court', 'time', 1)
            self.assertTrue(result['ok'])
            self.assertEqual(result['compute_ms'], 8)
        with patch.object(stress, 'urlopen', return_value=Response(b'{"type":"metadata"}\n')):
            self.assertFalse(stress.request_once('http://example.test', 'court', 'time', 1)['ok'])

    def test_rate_limit_is_counted_as_a_rejection(self):
        def reject(request, timeout):
            raise HTTPError(request.full_url, 429, 'busy', {}, io.BytesIO(b'busy'))
        with patch.object(stress, 'urlopen', side_effect=reject):
            stage = stress.run_stage('http://example.test', 'court', 'time', 2, 2, 0, 1)
        self.assertEqual(stage['requests'], 4)
        self.assertEqual(stage['success'], 0)
        self.assertEqual(stage['statuses'], {'429': 4})
        self.assertIsNone(stage['latency_ms']['p95'])

    def test_route_error_keeps_the_server_reason(self):
        def reject(request, timeout):
            body = json.dumps({'error': 'Limite de calcul atteinte.', 'visited': 2000000}).encode()
            raise HTTPError(request.full_url, 422, 'limit', {}, io.BytesIO(body))
        with patch.object(stress, 'urlopen', side_effect=reject):
            result = stress.request_once('http://example.test', 'long', 'time', 1)
        self.assertEqual(result['status'], 422)
        self.assertEqual(result['service_error'], 'Limite de calcul atteinte.')
        self.assertEqual(result['visited'], 2000000)

    def test_percentiles_use_observed_requests(self):
        self.assertEqual(stress.percentile([1, 20, 3, 4], .95), 20)
        self.assertIsNone(stress.percentile([], .95))

    def test_startup_requires_html_assets_and_road_data(self):
        paths = []
        def fetch(request, timeout):
            paths.append(request.full_url)
            if request.full_url.endswith('/'):
                return Response(b'<script src="/assets/index-a.js"></script><link href="/assets/index-b.css">')
            return Response(b'valid')
        with patch.object(stress, 'urlopen', side_effect=fetch):
            result = stress.startup_once('http://example.test', 1)
        self.assertTrue(result['ok'])
        self.assertEqual(result['resources'], 4)
        self.assertTrue(paths[-1].endswith('/data/paris.json'))


if __name__ == '__main__':
    unittest.main()
