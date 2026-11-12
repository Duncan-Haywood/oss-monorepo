// The update-rate check beside every model, and fast on long series (README "The update-rate check
// beside every model" and "The update-rate check on long series"; eval/update-rate-long.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';
import { changeReportHtml } from './report.mjs';
import { main } from './cli.mjs';
import { partitionRates, updateRateChanges, UPDATE_RATE, EXACT_UP_TO } from './update-rate.mjs';
import { makeRng, chain } from './eval/update-rate-sim.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const juiceCsv = read('./data/frozen-juice.csv');
const LINE = 'Update-rate check: the share of steps that repeat the previous value exactly changed once: from about 1981-08 (between 1980-09 and 1982-04) it began updating more often (repeats 60% of steps before, 12% after).';

test('every level model carries the same juice description as the drift model', () => {
  for (const model of ['mean', 'meanvar', 'trend']) {
    const r = analyze({ csv: juiceCsv, column: 'price', labelColumn: 'month', model });
    assert.ok(r.updateRateWarning && r.updateRateWarning.startsWith(LINE), model);
    assert.equal(r.updateRate.changes.length, 1);
  }
  // with logs it still reads the values as given (a repeat is a repeat either way)
  assert.ok(analyze({ csv: juiceCsv, column: 'price', labelColumn: 'month', log: true }).updateRateWarning.startsWith(LINE));
});

test('silent where there is nothing to say: the Nile has no repeats', () => {
  const r = analyze({ csv: read('./data/nile.csv') });
  assert.equal(r.updateRateWarning, undefined);
  assert.equal(r.updateRate, undefined);
});

test('the CLI text, the page and the branded report show it', async () => {
  let out = '';
  const code = await main([new URL('./data/frozen-juice.csv', import.meta.url).pathname, '--column', 'price', '--label-column', 'month', '--no-agreed'], { out: (s) => { out += s; } });
  assert.equal(code, 0);
  assert.ok(out.includes(LINE), 'CLI text');
  const r = analyze({ csv: juiceCsv, column: 'price', labelColumn: 'month' });
  assert.ok(changeReportHtml(r).includes('Update-rate check: the share of steps'), 'report');
  assert.match(read('./index.html'), /"overcutWarning", "updateRateWarning"\]\.filter\(\(k\) => r\[k\]\)/);
});

test('long series: grid search, then each cut moved to its best place between neighbours', () => {
  assert.equal(EXACT_UP_TO, 1500);
  const rnd = makeRng(20261299);
  const z = chain(rnd, 50000, [0.1, 0.1], [0.6, 0.6], 30000);
  const t = Date.now();
  const g = partitionRates(z, UPDATE_RATE);
  assert.ok(Date.now() - t < 5000, `took ${Date.now() - t} ms`);
  assert.ok(g.grid > 1);
  assert.equal(g.cuts.length, 1);
  assert.ok(Math.abs(g.cuts[0] + 1 - 30000) <= 30, `cut at ${g.cuts[0]}`);
  // just above the exact limit the grid agrees with the exact search on a planted change
  const z2 = chain(makeRng(7), 2400, [0.7, 0.2], [0.05, 0.05], 1200);
  assert.deepEqual(partitionRates(z2, UPDATE_RATE).cuts, partitionRates(z2, { ...UPDATE_RATE, exactUpTo: Infinity }).cuts);
  // at or below it the search is the exact one
  assert.equal(partitionRates(z2.slice(0, 1500), UPDATE_RATE).grid, undefined);
});

test('a 100,000-point series with repeats stays quick through updateRateChanges', () => {
  const rnd = makeRng(3), v = [];
  for (let i = 0; i < 100000; i++) v.push(i && rnd() < (i < 60000 ? 0.1 : 0.5) ? v[i - 1] : Math.round(rnd() * 1e6));
  const t = Date.now();
  const u = updateRateChanges(v);
  assert.ok(Date.now() - t < 8000, `took ${Date.now() - t} ms`);
  assert.equal(u.changes.length, 1);
  assert.ok(u.changes[0].from <= 60001 && 60001 <= u.changes[0].to, JSON.stringify(u.changes[0]));
});
