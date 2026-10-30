import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// All 30 Ansett route/class weekly series (data/ansett-all.csv), same sweep as eval/ansett-sweep.mjs and
// eval/ansett-sweep.out.txt. Pinned: no series is quiet outside the closure, and the count model's range95
// holds the first closed week in 29 of 30 series, the mean model's in 19 of 30.
const rows = readFileSync(new URL('./data/ansett-all.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const groups = new Map();
for (const [, week, route, cls, pax] of rows) {
  const k = `${route} ${cls}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push([week, +pax]);
}
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

test('Ansett sweep: 30 series, none quiet outside the closure; range95 holds the stop in 29 (nb) and 19 (mean)', () => {
  assert.equal(groups.size, 30);
  const hits = { mean: 0, nb: 0 };
  let fewest = Infinity;
  for (const pts of groups.values()) {
    const labels = pts.map((p) => p[0]), v = pts.map((p) => p[1]);
    const i0 = labels.indexOf('1989 W30');
    const base = median(v.slice(Math.max(0, i0 - 26), i0 + 3));
    const closed = [];
    v.forEach((x, i) => { if (labels[i] >= '1989 W33' && labels[i] <= '1989 W45' && x < 0.25 * base) closed.push(i); });
    const stop = closed[0];
    for (const [name, opt] of [['mean', { model: 'mean' }], ['nb', { model: 'poisson', overdispersion: 'nb' }]]) {
      const cps = analyze({ values: v, labels, ...opt }).pelt.changepoints;
      if (cps.some((c) => c.range95 && c.range95.fromIndex <= stop && stop <= c.range95.toIndex)) hits[name]++;
      const outside = cps.map((c) => labels.indexOf(c.label)).filter((i) => i < closed[0] - 3 || i > closed[closed.length - 1] + 3).length;
      fewest = Math.min(fewest, outside);
    }
  }
  assert.deepEqual(hits, { mean: 19, nb: 29 });
  assert.equal(fewest, 8);
});
