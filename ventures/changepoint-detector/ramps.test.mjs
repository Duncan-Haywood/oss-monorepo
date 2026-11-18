import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';
import { groupRamps } from './ramps.mjs';

const rows = readFileSync(new URL('./data/us-unemployment-duration.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);

test('groupRamps: three rising cuts with short segments between are one ramp; a fall is not joined', () => {
  const ch = [{ index: 10, label: 'a', shift: 3, meanBefore: 0, meanAfter: 3 }, { index: 14, label: 'b', shift: 4, meanBefore: 3, meanAfter: 7 }, { index: 19, label: 'c', shift: 5, meanBefore: 7, meanAfter: 12 }, { index: 50, label: 'd', shift: -6, meanBefore: 12, meanAfter: 6 }];
  const seg = [{ n: 10 }, { n: 4 }, { n: 5 }, { n: 31 }, { n: 20 }];
  const r = groupRamps(ch, seg, 300);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].labels, ['a', 'b', 'c']);
  assert.equal(r[0].shift, 12);
  assert.equal(r[0].direction, 'rise');
});

test('groupRamps: a long segment between two rises splits them; lone changes give no ramp', () => {
  const ch = [{ index: 10, label: 'a', shift: 3, meanBefore: 0, meanAfter: 3 }, { index: 60, label: 'b', shift: 4, meanBefore: 3, meanAfter: 7 }];
  assert.deepEqual(groupRamps(ch, [{ n: 10 }, { n: 50 }, { n: 20 }], 80), []);
  assert.deepEqual(groupRamps([ch[0]], [{ n: 10 }, { n: 70 }], 80), []);
});

test('us-unemployment-duration --ar1: the 2009 rise is reported as one ramp', () => {
  const r = analyze({ values, labels, ar1: true });
  const ramp = r.ramps.find((x) => x.labels.includes('2009-06'));
  assert.ok(ramp);
  assert.ok(['2009-02', '2009-06', '2009-11'].every((l) => ramp.labels.includes(l)));
  assert.equal(ramp.direction, 'rise');
  assert.ok(ramp.shift > 8);
  assert.equal(r.pelt.changepoints.length, 15, 'the changes themselves are unchanged');
});

// Synthetic, seeded (not real data): eval/ramp-gap.mjs, ramp-gap-fit.out.txt.
function mk(kind, H, L, seed, n = 300, t0 = 120) {
  let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const x = [];
  for (let i = 0; i < n; i++) {
    const m = kind === 'ramp' ? (i < t0 ? 0 : i >= t0 + L ? H : H * (i - t0) / L) : (i >= t0 ? H / 2 : 0) + (i >= t0 + L ? H / 2 : 0);
    x.push(m + Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()));
  }
  return x;
}
test('ramps by fit: a 48-point rise of 8 is one ramp in most series; two steps 48 points apart never are', () => {
  let ramp = 0, steps = 0;
  for (let s = 1; s <= 12; s++) {
    if ((analyze({ values: mk('ramp', 8, 48, s * 7919 + 48) }).ramps || []).length) ramp++;
    if ((analyze({ values: mk('steps', 8, 48, s * 7919 + 48) }).ramps || []).length) steps++;
  }
  assert.ok(ramp >= 10, `ramp found in ${ramp}/12`);
  assert.equal(steps, 0);
});
