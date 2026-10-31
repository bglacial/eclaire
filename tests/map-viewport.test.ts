import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPadding } from '../src/map-viewport';

test('le cadrage réserve le panneau du bas, le chargement et les deux panneaux en paysage', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
  let bounds = box(0, 0, 390, 844), landscape = false;
  const panels: Record<string, ReturnType<typeof box>> = { '.topbar': box(16, 16, 374, 70), '.planner': box(12, 450, 378, 814) };
  const element = (rect: ReturnType<typeof box>) => ({ getBoundingClientRect: () => rect });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: () => element(bounds), querySelector: (selector: string) => panels[selector] ? element(panels[selector]) : null } });
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: landscape }) });
  try {
    assert.deepEqual(mapPadding(), { topLeft: [32, 86], bottomRight: [72, 414] });
    panels['#playback'] = box(12, 140, 318, 210);
    assert.equal(mapPadding().topLeft[1], 226);
    delete panels['#playback'];
    panels['#trip-workspace'] = box(12, 350, 378, 814);
    assert.equal(mapPadding().bottomRight[1], 514);
    delete panels['#trip-workspace'];
    bounds = box(0, 0, 1440, 900); panels['.planner'] = box(24, 620, 1416, 868);
    assert.deepEqual(mapPadding(), { topLeft: [32, 86], bottomRight: [72, 300] });
    bounds = box(0, 0, 844, 390); landscape = true;
    panels['#navigation'] = bounds;
    panels['#navigation-next'] = box(12, 12, 280, 140);
    panels['.navigation-bottom'] = box(550, 140, 832, 378);
    assert.deepEqual(mapPadding(), { topLeft: [296, 24], bottomRight: [310, 24] });
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (previousMedia) Object.defineProperty(globalThis, 'matchMedia', previousMedia); else Reflect.deleteProperty(globalThis, 'matchMedia');
  }
});
