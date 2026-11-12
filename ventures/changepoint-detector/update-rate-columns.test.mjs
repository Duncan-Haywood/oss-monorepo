// The update-rate check in the several-columns and --consensus outputs, and the rounding sentence
// (README "The update-rate check on every output, and repeats from rounding"; eval/update-rate-rounding.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { main } from './cli.mjs';
import { parseColumns, analyzeMulti, columnUpdateRates, multiText } from './multivariate.mjs';
import { multiReportHtml } from './multi-report.mjs';
import { consensusText } from './consensus.mjs';
import { updateRateChanges, updateRateLines, smallestStep, medianMoveTicks, ROUNDING_TICKS } from './update-rate.mjs';
import { run as roundingRun } from './eval/update-rate-rounding.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const juicePath = new URL('./data/frozen-juice.csv', import.meta.url).pathname;
const PRICE = 'price: Update-rate check: the share of steps that repeat the previous value exactly changed once: from about 1981-08 (between 1980-09 and 1982-04) it began updating more often (repeats 60% of steps before, 12% after). This describes how often the data was refreshed';
const PPI = 'ppi: Update-rate check: the share of steps that repeat the previous value exactly changed once: from about 1969-04 (between 1968-03 and 1974-01) it began updating more often (repeats 33% of steps before, 8% after). In the stretch with more repeats at least half the moves are one tick (0.1, the smallest move there)';

test('several columns: one line per column that changed, price stale and ppi rounding', () => {
  const p = parseColumns(read('./data/frozen-juice.csv'), ['price', 'ppi', 'fdd'], 'month');
  const r = analyzeMulti({ ...p, columnRuns: null });
  assert.equal(r.updateRateWarnings.length, 2);
  assert.ok(r.updateRateWarnings[0].startsWith(PRICE));
  assert.ok(r.updateRateWarnings[1].startsWith(PPI));
  assert.deepEqual(r.updateRate.map((u) => u.column), ['price', 'ppi']);
  assert.equal(r.updateRate[0].changes[0].rounding, false);
  assert.equal(r.updateRate[1].changes[0].rounding, true);
  const text = multiText(r);
  assert.ok(text.includes(`Read with care: ${PRICE}`));
  assert.ok(multiReportHtml(p, r).includes('ppi: Update-rate check'));
});

test('a carried-forward cell is never a repeat', () => {
  // 120 rows, every value new except every other cell blank from row 40: carried forward they would
  // be 40 scattered repeats, a change of update rate that is not in the data.
  const rows = ['t,a'];
  for (let i = 0; i < 120; i++) rows.push(`${i},${i >= 40 && i % 2 ? '' : (i * 1.37).toFixed(2)}`);
  const p = parseColumns(rows.join('\n'), ['a'], 't');
  assert.equal(p.filled, 40);
  assert.equal(p.missing[0].length, 40);
  const carried = updateRateChanges(p.cols[0]);
  assert.equal(carried.repeats, 40, 'carried forward, the gap reads as repeats');
  const r = analyzeMulti(p);
  assert.equal(r.updateRateWarnings, undefined, 'with the gap read as missing, nothing to say');
  assert.equal(columnUpdateRates(p.cols, p.names, p.labels, null).updateRateWarnings.length, 1, 'read as repeats, the gap would be reported');
});

test('the CLI --columns and --consensus text carry it', async () => {
  let out = '';
  assert.equal(await main([juicePath, '--columns', 'price,ppi', '--label-column', 'month'], { out: (s) => { out += s; } }), 0);
  assert.ok(out.includes(PRICE) && out.includes(PPI));
  out = '';
  assert.equal(await main([juicePath, '--column', 'price', '--label-column', 'month', '--consensus'], { out: (s) => { out += s; } }), 0);
  assert.ok(out.includes('Read with care: Update-rate check: the share of steps that repeat the previous value exactly changed once: from about 1981-08'));
  out = '';
  assert.equal(await main([juicePath, '--column', 'price', '--label-column', 'month', '--consensus', '--json'], { out: (s) => { out += s; } }), 0);
  const j = JSON.parse(out);
  assert.equal(j.updateRate.changes[0].direction, 'more often');
  // silent on the Nile
  out = '';
  await main(['--example', '--consensus'], { out: (s) => { out += s; } });
  assert.ok(!out.includes('Update-rate'));
  assert.equal(consensusText({ settings: [], skipped: [], changes: [], tolerance: 2, note: 'n' }).includes('Update-rate'), false);
});

test('the page shows the per-column lines', () => {
  assert.match(read('./index.html'), /\[r\.overcutWarning, \.\.\.\(r\.updateRateWarnings \|\| \[\]\)\]/);
});

test('tick and median move', () => {
  assert.equal(smallestStep([27.2, 27.2, 27.3, 27.6, 27.5]), 0.1);
  assert.equal(medianMoveTicks([1, 1, 1.1, 1.2, 1.5], 1, 4, 0.1), 1);
  assert.equal(smallestStep([5, 5, 5]), null);
  assert.equal(ROUNDING_TICKS, 1.5);
});

test('a mixed description names the rounded change', () => {
  const u = { changes: [
    { index: 2, from: 2, to: 2, shareBefore: 0.6, shareAfter: 0.1, direction: 'more often', rounding: false, tick: 0.1 },
    { index: 5, from: 5, to: 5, shareBefore: 0.1, shareAfter: 0.5, direction: 'less often', rounding: true, tick: 0.01 },
  ] };
  const line = updateRateLines(u, ['a', 'b', 'c', 'd', 'e', 'f'])[0];
  assert.ok(line.includes('This describes how often the data was refreshed'));
  assert.ok(line.includes('Around f (tick 0.01), though'));
});

test('the rounding rule passes as committed (eval/update-rate-rounding.out.txt)', () => {
  const r = roundingRun();
  assert.equal(r.ships, true);
  const out = read('./eval/update-rate-rounding.out.txt');
  for (const [k, v] of Object.entries(r.cells)) assert.match(out, new RegExp(`^${k}\\s+${v.found}\\s+${v.near}\\s+${v.flagged}\\s`, 'm'));
  assert.match(out, /Verdict: the rounding sentence ships/);
});
