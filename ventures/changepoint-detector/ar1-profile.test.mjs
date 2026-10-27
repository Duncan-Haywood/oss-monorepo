import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ar1ProfileFit } from './engine.mjs';

const x = readFileSync(new URL('./data/lake-huron.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);

test('ar1ProfileFit on real Lake Huron picks rho 0.8 and no change (same as the hand-rolled profile)', () => {
  const f = ar1ProfileFit(x);
  assert.equal(f.rho, 0.8);
  assert.deepEqual(f.changepoints, []);
  assert.equal(f.grid.length, 10);
});

test('ar1ProfileFit finds a clear step in white noise', () => {
  let s = 7;
  const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const y = Array.from({ length: 80 }, (_, i) => (r() + r() + r() - 1.5) + (i >= 40 ? 4 : 0));
  const f = ar1ProfileFit(y);
  assert.equal(f.changepoints.length, 1);
  assert.ok(Math.abs(f.changepoints[0] - 40) <= 2);
});
