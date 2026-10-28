#!/usr/bin/env python3
"""Exercise the real Git/deployment flow with fake builds and services."""
import os
import fcntl
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name('update-eclaire.sh')


@unittest.skipUnless(sys.platform.startswith('linux'), 'Deployment uses Linux flock')
class AutoUpdateTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.home = Path(self.directory.name)
        self.repo = self.home / 'apps/eclaire'
        self.repo.mkdir(parents=True)
        self.ops = self.home / 'ops'
        self.ops.mkdir()
        self.script = self.ops / SCRIPT.name
        shutil.copy2(SCRIPT, self.script)
        self.env = {**os.environ, 'HOME': str(self.home), 'GIT_CONFIG_NOSYSTEM': '1',
                    'GIT_CONFIG_GLOBAL': os.devnull}
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Deployment test')
        self.git('config', 'user.email', 'deploy@example.invalid')
        (self.repo / '.gitignore').write_text('dist/\nserver/target/\n')
        (self.repo / 'source.txt').write_text('old source')
        self.git('add', '.')
        self.git('commit', '-m', 'initial')
        self.old = self.git('rev-parse', 'HEAD').strip()
        self.origin = self.home / 'origin.git'
        self.git('clone', '--bare', str(self.repo), str(self.origin))
        self.git('remote', 'add', 'origin', str(self.origin))
        (self.repo / 'source.txt').write_text('new source')
        self.git('commit', '-am', 'update')
        self.target = self.git('rev-parse', 'HEAD').strip()
        self.git('push', 'origin', 'main')
        self.git('reset', '--hard', self.old)
        (self.repo / 'dist').mkdir()
        (self.repo / 'dist/index.html').write_text('old web')
        (self.repo / 'server/target').mkdir(parents=True)
        (self.repo / 'server/target/eclaire-routing.jar').write_text('old jar')
        runtime = self.home / '.local/share/eclaire'
        commands = runtime / 'node/bin'
        commands.mkdir(parents=True)
        jdk = runtime / 'jdk/bin'
        jdk.mkdir(parents=True)
        self.executable(jdk / 'javac', 'exit 0')
        self.executable(commands / 'node', 'exit 0')
        self.executable(commands / 'npm', '''
echo "$*" >> "$HOME/build.calls"
if [[ ${FAIL_BUILD:-0} == 1 ]]; then exit 7; fi
if [[ $* == 'run build' ]]; then
    mkdir -p dist
    printf 'new web' > dist/index.html
elif [[ $* == 'run server:build '* ]]; then
    mkdir -p server/target
    printf 'new jar' > server/target/eclaire-routing.jar
fi
''')
        self.executable(commands / 'systemctl', 'echo "$*" >> "$HOME/service.calls"')
        self.executable(commands / 'sleep', 'exit 0')
        self.executable(commands / 'curl', '''
if [[ ${FAIL_HEALTH:-0} == 1 && $(cat "$HOME/apps/eclaire/server/target/eclaire-routing.jar") == 'new jar' ]]; then
    exit 22
fi
printf '{"status":"ready"}'
''')

    def executable(self, path, source):
        path.write_text('#!/usr/bin/env bash\nset -euo pipefail\n' + source + '\n')
        path.chmod(0o755)

    def git(self, *arguments):
        return subprocess.run(['git', '-C', str(self.repo), *arguments], env=self.env,
                              text=True, capture_output=True, check=True).stdout

    def run_update(self, **variables):
        return subprocess.run(['bash', str(self.script)], env={**self.env, **variables},
                              text=True, capture_output=True, timeout=20)

    def assert_original(self):
        self.assertEqual(self.git('rev-parse', 'HEAD').strip(), self.old)
        self.assertEqual((self.repo / 'dist/index.html').read_text(), 'old web')
        self.assertEqual((self.repo / 'server/target/eclaire-routing.jar').read_text(), 'old jar')
        self.assertFalse((self.ops / 'deploy-state/eclaire.revision').exists())

    def test_deploy_and_skip_unchanged(self):
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip(), self.target)
        self.assertEqual((self.repo / 'dist/index.html').read_text(), 'new web')
        self.assertEqual((self.ops / 'deploy-state/eclaire.revision').read_text().strip(), self.target)
        self.assertEqual((self.home / '.local/share/eclaire/previous/dist/index.html').read_text(), 'old web')
        calls = (self.home / 'service.calls').read_text()
        self.assertEqual(calls, '--user stop eclaire.service\n--user start eclaire.service\n')
        builds = (self.home / 'build.calls').read_text()
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.home / 'service.calls').read_text(), calls)
        self.assertEqual((self.home / 'build.calls').read_text(), builds)

    def test_build_even_when_checkout_already_matches_origin(self):
        self.git('merge', '--ff-only', self.target)
        result = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.repo / 'dist/index.html').read_text(), 'new web')

    def test_dirty_checkout_is_preserved(self):
        (self.repo / 'source.txt').write_text('user changes')
        self.assertNotEqual(self.run_update().returncode, 0)
        self.assert_original()
        self.assertEqual((self.repo / 'source.txt').read_text(), 'user changes')
        self.assertFalse((self.home / 'service.calls').exists())

    def test_divergent_history_is_preserved(self):
        (self.repo / 'local.txt').write_text('local change')
        self.git('add', 'local.txt')
        self.git('commit', '-m', 'local divergence')
        divergent = self.git('rev-parse', 'HEAD')
        self.assertNotEqual(self.run_update().returncode, 0)
        self.assertEqual(self.git('rev-parse', 'HEAD'), divergent)
        self.assertFalse((self.home / 'service.calls').exists())

    def test_failed_build_keeps_running_version(self):
        self.assertNotEqual(self.run_update(FAIL_BUILD='1').returncode, 0)
        self.assert_original()
        self.assertFalse((self.home / 'service.calls').exists())

    def test_failed_health_restores_previous_build(self):
        result = self.run_update(FAIL_HEALTH='1')
        self.assertNotEqual(result.returncode, 0)
        self.assert_original()
        self.assertIn('previous build restored', result.stderr)
        self.assertEqual((self.home / 'service.calls').read_text().count('start'), 2)

    def test_failed_fetch_keeps_running_version(self):
        self.git('remote', 'set-url', 'origin', str(self.home / 'missing.git'))
        self.assertNotEqual(self.run_update().returncode, 0)
        self.assert_original()
        self.assertFalse((self.home / 'service.calls').exists())

    def test_concurrent_deployment_is_skipped(self):
        state = self.ops / 'deploy-state'
        state.mkdir()
        with (state / 'eclaire.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.run_update().returncode, 0)
        self.assert_original()
        self.assertFalse((self.home / 'service.calls').exists())


if __name__ == '__main__':
    unittest.main()
