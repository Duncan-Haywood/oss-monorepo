import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from './engine.mjs';
import { main } from './watch.mjs';

// README "The joint growth fit, gated" (eval/middle-trend-joint.prereg.md): --trend gated for counts refits one growth
// rate under the steps and keeps it only when it beats a flat level by log n.
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, l) => { let k = 0, p = Math.exp(-l), c = p; const x = u(); while (x > c) { k++; p *= l / k; c += p; } return k; };
const grow = (seed, n = 200, g = 0.004) => { const u = lcg(seed); return Array.from({ length: n }, (_, i) => poisson(u, 50 * Math.exp(g * i))); };

test('trend gated reads the growth of a steadily growing count series and cuts no steps', () => {
  const v = grow(7);
  const r = analyze({ values: v, model: 'poisson', overdispersion: 'nb', trend: 'gated' });
  assert.equal(r.pelt.changepoints.length, 0);
  assert.equal(r.trendNote, undefined);
  assert.ok(Math.abs(r.trend.logGrowthAcrossSeries - 0.004 * 199) < 0.1, `growth ${r.trend.logGrowthAcrossSeries}`);
});

test('trend gated is the joint fit with the gate, and leaves a flat series as Middle sees it', () => {
  const v = grow(11, 200, 0).map((x, i) => (i >= 120 ? Math.round(x * 0.6) : x));
  const same = analyze({ values: v, model: 'poisson', overdispersion: 'nb', trend: true, trendGate: true });
  const r = analyze({ values: v, model: 'poisson', overdispersion: 'nb', trend: 'gated' });
  const flat = analyze({ values: v, model: 'poisson', overdispersion: 'nb' });
  assert.deepEqual(r.pelt.changepoints.map((c) => c.index), same.pelt.changepoints.map((c) => c.index));
  assert.match(r.trendNote ?? '', /did not beat a flat level/);
  assert.deepEqual(r.pelt.changepoints.map((c) => c.index), flat.pelt.changepoints.map((c) => c.index));
  assert.ok(r.pelt.changepoints.some((c) => Math.abs(c.index - 120) <= 3), `steps at ${r.pelt.changepoints.map((c) => c.index)}`);
});

test('robust and gated are refused for models other than counts', () => {
  assert.throws(() => analyze({ values: grow(3, 60).map(Number), model: 'mean', trend: 'gated' }), /for counts/);
  assert.throws(() => analyze({ values: grow(3, 60).map(Number), model: 'mean', trend: 'robust' }), /for counts/);
});

test('the watch takes --trend gated for counts only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cpd-trend-gated-'));
  const csv = join(dir, 's.csv');
  writeFileSync(csv, 'day,clicks\n' + grow(9, 150).map((x, i) => `${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)},${x}`).join('\n') + '\n');
  let text = '';
  const code = await main([csv, '--model', 'poisson', '--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'gated', '--dry-run', '--json'], { out: (s) => { text += s; } });
  assert.equal(code, 0);
  assert.equal(JSON.parse(text).alerts.length, 0);
  await assert.rejects(main([csv, '--trend', 'gated', '--dry-run'], { out: () => {} }), /gated is for counts/);
});

test('a stored --detector auto choice carries its growth term; one stored before keeps the flat Middle', async () => {
  const { choiceOptions, COUNT_MIDDLE } = await import('./watch-core.mjs');
  assert.deepEqual(choiceOptions({ key: 'middle', ...COUNT_MIDDLE }), { detector: 'pelt', overdispersion: 'nb', trend: 'gated' });
  assert.deepEqual(choiceOptions({ key: 'middle', detector: 'pelt', overdispersion: 'nb' }), { detector: 'pelt', overdispersion: 'nb' });
});
