// Robust losses inside the drift-level model's Kalman cost (drift-level.mjs, loss option; README
// "Heavy tails on a drifting level", a negative result on TCPD: eval/tcpd-drift-robust.out.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driftLevelChanges, driftSegmentCost } from './drift-level.mjs';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const noisy = (n, s) => { seed = s; return Array.from({ length: n }, gauss); };

test('a cut-off above every innovation gives the Gaussian answer exactly', () => {
  const x = noisy(150, 3).map((v, t) => v + (t >= 70 ? 4 : 0));
  const g = driftLevelChanges(x, { sigma: 1, omega: 0.1 });
  for (const loss of ['biweight', 'huber']) {
    const r = driftLevelChanges(x, { sigma: 1, omega: 0.1, loss, lossK: 1e6 });
    assert.deepEqual(r.changepoints, g.changepoints);
    assert.ok(Math.abs(r.cost - g.cost) < 1e-9, `${loss} ${r.cost} vs ${g.cost}`);
  }
});

test('isolated spikes: the Gaussian cost cuts around them, biweight and Huber do not', () => {
  const x = noisy(200, 5);
  for (const at of [30, 60, 90, 130, 170]) x[at] += 10;
  const g = driftLevelChanges(x, { sigma: 1, omega: 0 });
  assert.ok(g.changepoints.length >= 4, `gauss ${g.changepoints}`);
  for (const loss of ['biweight', 'huber']) assert.deepEqual(driftLevelChanges(x, { sigma: 1, omega: 0, loss, lossK: loss === 'huber' ? 2 : 3 }).changepoints, [], loss);
});

test('a real step among the spikes is still found by both robust losses', () => {
  const x = noisy(200, 9).map((v, t) => v + (t >= 100 ? 4 : 0));
  for (const at of [30, 60, 150]) x[at] -= 10;
  for (const loss of ['biweight', 'huber']) {
    const r = driftLevelChanges(x, { noise: 'ml', loss, lossK: loss === 'huber' ? 2 : 3 });
    assert.deepEqual(r.changepoints, [100], `${loss} ${r.changepoints}`);
  }
});

test('the partition cost equals the sum of driftSegmentCost under each loss', () => {
  const x = noisy(120, 13).map((v, t) => v + (t >= 60 ? 5 : 0) + (t === 20 ? 9 : 0));
  for (const loss of ['gauss', 'biweight', 'huber']) {
    const r = driftLevelChanges(x, { sigma: 1, omega: 0.2, loss, lossK: 2.5 });
    const b = [0, ...r.changepoints, x.length];
    let sum = 0;
    for (let i = 0; i + 1 < b.length; i++) sum += driftSegmentCost(x.slice(b[i], b[i + 1]), { sigma: 1, omega: 0.2, loss, lossK: 2.5 });
    assert.ok(Math.abs(r.cost - (sum + r.penalty * (b.length - 2))) < 1e-8, `${loss}: ${r.cost} vs ${sum}`);
  }
});

test('an unknown loss is refused', () => {
  assert.throws(() => driftLevelChanges([1, 2, 3, 4, 5, 6], { loss: 'cauchy' }), /loss must be/);
});

test('the README quotes the pre-registered TCPD run as it stands', () => {
  const out = readFileSync(new URL('./eval/tcpd-drift-robust.out.txt', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  const sec = readme.slice(readme.indexOf('## Heavy tails on a drifting level'));
  for (const [row, shipped, held] of [['biweight K 3 (primary)', '0.681', '0.448'], ['Huber K 2', '0.709', '0.533'], ['Gaussian (shipped)', '0.694', '0.527']]) {
    const lines = out.split('\n').filter((l) => l.includes(`* drift ML, ${row}`));
    assert.equal(lines.length, 2, row);
    assert.ok(lines[0].includes(shipped) && lines[1].includes(held), `${row}: ${lines.join(' | ')}`);
    assert.ok(sec.includes(shipped) && sec.includes(held), `README missing ${row} ${shipped}/${held}`);
  }
});
