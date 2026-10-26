import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestDeadline } from '../src/request-deadline';

test('l’arrêt utilisateur est propagé et les délais fonctionnent sans les méthodes récentes', async () => {
  const source = new AbortController();
  const deadline = requestDeadline(1000, source.signal);
  source.abort(); assert.equal(deadline.signal.aborted, true); assert.equal(deadline.timedOut, false); deadline.dispose();
  const alreadyStopped = requestDeadline(1000, source.signal); assert.equal(alreadyStopped.signal.aborted, true); alreadyStopped.dispose();
  const timeout = requestDeadline(5);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(timeout.signal.aborted, true); assert.equal(timeout.timedOut, true); timeout.dispose();
  const disposed = requestDeadline(5); disposed.dispose();
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(disposed.signal.aborted, false);
});
