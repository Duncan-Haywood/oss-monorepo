import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGabc, fitToBars, halfTime } from './gabc.mjs';
import { barsFor } from './genre.mjs';

const src = '(c4) Ky(f)ri(g) (,) e(h) (::)';

test('halfTime doubles every duration and leaves pitches and the input alone', () => {
  const ev = fitToBars(parseGabc(src).events, 8);
  const copy = JSON.stringify(ev);
  const h = halfTime(ev);
  assert.equal(JSON.stringify(ev), copy);
  assert.equal(h.length, ev.length);
  h.forEach((e, i) => {
    assert.equal(e.pulses, ev[i].pulses * 2);
    assert.equal(e.midi, ev[i].midi);
  });
});

test('half time doubles the bars the backing must fill', () => {
  const ev = fitToBars(parseGabc(src).events, 8);
  assert.equal(barsFor(halfTime(ev)), barsFor(ev) * 2);
});

test('halfTime rejects a non-positive factor', () => {
  assert.throws(() => halfTime([], 0));
});
