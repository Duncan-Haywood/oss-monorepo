import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from './engine.mjs';
import { main } from './watch.mjs';

// README "A Middle that allows for growth" (eval/middle-trend.prereg.md): --trend robust for counts reads one growth
// rate from a robust slope of the log counts and holds it as the exposure under the steps.
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, l) => { let k = 0, p = Math.exp(-l), c = p; const x = u(); while (x > c) { k++; p *= l / k; c += p; } return k; };
const grow = (seed, n = 200, g = 0.004) => { const u = lcg(seed); return Array.from({ length: n }, (_, i) => poisson(u, 50 * Math.exp(g * i))); };

test('trend robust reads the growth of a steadily growing count series and cuts no steps', () => {
  const v = grow(7);
  const flat = analyze({ values: v, model: 'poisson', overdispersion: 'nb' });
  const r = analyze({ values: v, model: 'poisson', overdispersion: 'nb', trend: 'robust' });
  assert.ok(flat.pelt.changepoints.length >= 2, `no trend: ${flat.pelt.changepoints.length} steps`);
  assert.equal(r.pelt.changepoints.length, 0);
  assert.ok(Math.abs(r.trend.logGrowthAcrossSeries - 0.004 * 199) < 0.1, `growth ${r.trend.logGrowthAcrossSeries}`);
});

test('trend robust leaves out a growth rate that a late fall has biased, and finds the fall', () => {
  const v = grow(8).map((x, i) => (i >= 150 ? Math.round(x * 0.6) : x));
  const r = analyze({ values: v, model: 'poisson', overdispersion: 'nb', trend: 'robust' });
  assert.match(r.trendNote ?? '', /did not beat a flat level/);  // the fall biases the slope, so the gate falls back to flat
  assert.ok(r.pelt.changepoints.some((c) => Math.abs(c.index - 150) <= 3), `steps at ${r.pelt.changepoints.map((c) => c.index)}`);
});

test('the watch takes --trend robust for counts only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cpd-trend-'));
  const csv = join(dir, 's.csv');
  writeFileSync(csv, 'day,clicks\n' + grow(9, 150).map((x, i) => `${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)},${x}`).join('\n') + '\n');
  let text = '';
  const code = await main([csv, '--model', 'poisson', '--detector', 'pelt', '--overdispersion', 'nb', '--trend', 'robust', '--dry-run', '--json'], { out: (s) => { text += s; } });
  assert.equal(code, 0);
  assert.equal(JSON.parse(text).alerts.length, 0);
  await assert.rejects(main([csv, '--trend', 'robust', '--dry-run'], { out: () => {} }), /for counts/);
  await assert.rejects(main([csv, '--model', 'poisson', '--trend', 'bend', '--dry-run'], { out: () => {} }), /takes robust/);
});
