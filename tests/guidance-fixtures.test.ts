import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GuidanceProgress, isNavigationRoute, type GpsFix, type NavigationRoute } from '../src/navigation';

// Mêmes scénarios que GuidanceFixturesTest.java et native-guidance-fixtures.swift.
type Expect = { status: string; at?: number; nextIndex?: number; toTurn?: number };
const fixtures: {
  tolerance: number;
  routes: Record<string, NavigationRoute>;
  validation: { name: string; valid: boolean; route: unknown }[];
  tracking: { name: string; route: string; updates: { fix: GpsFix; now?: number; expect: Expect }[] }[];
} = JSON.parse(readFileSync(new URL('./fixtures/guidance/scenarios.json', import.meta.url), 'utf8'));

for (const { name, valid, route } of fixtures.validation) {
  test(`fixture de validation : ${name}`, () => assert.equal(isNavigationRoute(route), valid));
}

for (const scenario of fixtures.tracking) {
  test(`fixture de suivi : ${scenario.name}`, () => {
    const progress = new GuidanceProgress(fixtures.routes[scenario.route]);
    scenario.updates.forEach(({ fix, now, expect }, index) => {
      const state = progress.update(fix, now ?? fix.timestamp);
      const label = `${scenario.name} #${index}`;
      assert.equal(state.status, expect.status, label);
      const at = state.status === 'approach' ? state.match.at : progress.match?.at;
      if (expect.at !== undefined) assert.ok(Math.abs(at! - expect.at) <= fixtures.tolerance, `${label} : at ${at} ≠ ${expect.at}`);
      if (state.status !== 'on-route') return;
      if (expect.nextIndex !== undefined) assert.equal(state.nextIndex, expect.nextIndex, label);
      if (expect.toTurn !== undefined) assert.ok(Math.abs(state.toTurn - expect.toTurn) <= fixtures.tolerance, `${label} : toTurn ${state.toTurn} ≠ ${expect.toTurn}`);
    });
  });
}
