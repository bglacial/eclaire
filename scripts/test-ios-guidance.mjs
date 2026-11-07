import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temporary = mkdtempSync(join(tmpdir(), 'eclaire-ios-test-'));
const sources = 'node_modules/@capacitor/ios/Capacitor/Capacitor';
try {
  for (const [name, files, args = []] of [
    ['tracker', ['ios/App/App/GuidanceTracker.swift', 'tests/native-guidance.swift']],
    ['fixtures', ['ios/App/App/GuidanceTracker.swift', 'tests/native-guidance-fixtures.swift'], ['tests/fixtures/guidance/scenarios.json']],
    ['bridge', [`${sources}/JSTypes.swift`, `${sources}/Codable/JSValueEncoder.swift`, `${sources}/Codable/JSValueDecoder.swift`, 'ios/App/App/GuidanceTracker.swift', 'tests/native-guidance-bridge.swift']],
  ]) {
    const binary = join(temporary, name);
    execFileSync('xcrun', ['swiftc', '-module-cache-path', join(temporary, 'modules'), ...files, '-o', binary], { stdio: 'inherit' });
    execFileSync(binary, args, { stdio: 'inherit' });
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
