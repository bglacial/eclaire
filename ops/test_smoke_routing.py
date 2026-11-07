"""Vérifie les seuils de la recette sans serveur ni graphe national."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('smoke-routing.py')
COSTS = {
    (48.8566, 'time'): 15527.6157, (48.8566, 'distance'): 441131.6946344737,
    (48.3904, 'time'): 43053.181702512025, (48.3904, 'distance'): 1096550.6994009037,
    (47.885649, 'time'): 27313.397255289758, (47.885649, 'distance'): 707877.3176598481,
    (51.0344, 'time'): 37532.205426813314, (51.0344, 'distance'): 1058563.6425426053,
}


class SmokePerformanceTest(unittest.TestCase):
    def run_smoke(self, overrides):
        def response(request, timeout):
            body = json.loads(request.data)
            key = (body['start']['lat'], body['criterion'])
            result = {'found': True, 'path': [1], 'cost': COSTS.get(key, 1),
                      'length': 100, 'seconds': 10, 'visited': overrides.get(key, 1), 'computeMs': 1,
                      'instructions': [{'at': 0}, {'at': 100, 'sign': 4}]}
            payload = json.dumps({'type': 'result', 'result': result}).encode() + b'\n'
            return io.BytesIO(payload)

        with patch('sys.argv', [str(SCRIPT)]), patch('urllib.request.urlopen', response), contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(SCRIPT), run_name='__main__')

    def test_each_limit_accepts_boundary_and_rejects_regression(self):
        for key, limit in [((47.885649, 'time'), 120_000), ((47.885649, 'distance'), 600_000),
                           ((51.0344, 'time'), 12_000), ((51.0344, 'distance'), 1_010_000)]:
            with self.subTest(case=key):
                self.run_smoke({key: limit})
                with self.assertRaisesRegex(AssertionError, 'états explorés'):
                    self.run_smoke({key: limit + 1})

    def test_invalid_counter_is_rejected(self):
        for value in (0, -1, True, 1.5):
            with self.subTest(value=value), self.assertRaises(AssertionError):
                self.run_smoke({(47.885649, 'time'): value})


if __name__ == '__main__':
    unittest.main()
