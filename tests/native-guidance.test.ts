import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidanceCommands } from '../src/native-guidance';

test('un arrêt attend le démarrage natif et les erreurs ne bloquent pas le prochain guidage', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const command = guidanceCommands();
  const start = command(async () => { calls.push('start'); await gate; });
  const stop = command(async () => { calls.push('stop'); throw new Error('native'); });
  const again = command(async () => { calls.push('again'); });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, ['start']);
  release(); await start; await assert.rejects(stop); await again;
  assert.deepEqual(calls, ['start', 'stop', 'again']);
});
