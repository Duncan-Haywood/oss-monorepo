import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { parseSeries } from './engine.mjs';
import { weeklyTotals, replayWatch, main } from './watch.mjs';

// README "Round 7: the weekly drift watch beside the daily watch": --weekly sums daily rows into whole weeks.
const days = (start, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(start + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));

test('weeks run Monday to Sunday, labelled by the Monday; a partial first and last week are left out', () => {
  const l = days('2024-01-03', 26); // a Wednesday to a Sunday: 2024-01-03 .. 2024-01-28
  const r = weeklyTotals(l.map(() => 1), l);
  assert.deepEqual(r.labels, ['2024-01-08', '2024-01-15', '2024-01-22']);
  assert.deepEqual(r.values, [7, 7, 7]);
  assert.equal(r.to, '2024-01-28');
  const cut = weeklyTotals(l.slice(0, -1).map(() => 1), l.slice(0, -1)); // ends on a Saturday: the last week waits
  assert.deepEqual(cut.labels, ['2024-01-08', '2024-01-15']);
});

test('days missing from the export count as zero; a week ends once a row on or after its Sunday exists', () => {
  const l = days('2024-01-01', 21).filter((d) => new Date(d + 'T00:00:00Z').getUTCDay() !== 6); // Saturdays left out
  const r = weeklyTotals(l.map(() => 2), l);
  assert.deepEqual(r.values, [12, 12, 12]);
  assert.equal(r.weeks, 3);
});

test('the totals of weeks already whole do not change as days are added', () => {
  const l = days('2024-01-01', 60), v = l.map((_, i) => (i * 7919) % 101);
  const a = weeklyTotals(v.slice(0, 45), l.slice(0, 45)), b = weeklyTotals(v, l);
  assert.deepEqual(b.values.slice(0, a.weeks), a.values);
});

test('undated or out-of-order rows are refused', () => {
  assert.throws(() => weeklyTotals([1, 2], ['a', 'b']), /dated rows/);
  assert.throws(() => weeklyTotals([1, 2], ['2024-01-02', '2024-01-01']), /date order/);
});

test('the CLI watches the weekly totals and says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weekly-'));
  const l = days('2024-01-01', 7 * 30);
  const csv = 'date,revenue\n' + l.map((d, i) => `${d},${100 + (i >= 7 * 22 ? 60 : 0) + ((i * 37) % 11)}`).join('\n');
  writeFileSync(join(dir, 'd.csv'), csv);
  let text = '';
  const code = await main([join(dir, 'd.csv'), '--weekly', '--detector', 'drift', '--dry-run'], { out: (s) => { text += s; } });
  assert.equal(code, 0);
  assert.match(text, /^Weekly: 30 whole Monday-to-Sunday weeks \(2024-01-01 to 2024-07-28\)/);
  let js = '';
  await main([join(dir, 'd.csv'), '--weekly', '--dry-run', '--json'], { out: (s) => { js += s; } });
  const o = JSON.parse(js);
  assert.equal(o.n, 30);
  assert.deepEqual(o.weekly, { weeks: 30, from: '2024-01-01', to: '2024-07-28' });
  let cols = '';
  await main([join(dir, 'd.csv'), '--weekly', '--columns', 'revenue', '--dry-run'], { out: (s) => { cols += s; } });
  assert.match(cols, /Weekly: 30 whole/);
});

test('the committed round-7 verdict: K1-K3 pass and --weekly ships', () => {
  const out = readFileSync(new URL('./eval/weekly-beside-sim.out.txt', import.meta.url), 'utf8');
  assert.match(out, /K1 R90 by 8 weeks: Q\+DW 131 vs Q 92 \+ 15 -> PASS/);
  assert.match(out, /K2 N false: Q\+DW 1\.071 vs Q 0\.936 \+ 0\.15 -> PASS/);
  assert.match(out, /K3 gain in each half: s < 0\.30 \+26, s >= 0\.30 \+13 \(each >= 5\) -> PASS/);
  assert.match(out, /Ships --weekly: yes/);
});

test('the real UCI shop: the weekly drift watch hears both autumn build-ups in revenue', () => {
  const read = (f) => parseSeries(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'), 'revenue', null);
  const dw = (s) => { const w = weeklyTotals(s.values, s.labels); return replayWatch(w.values, w.labels, { model: 'mean', detector: 'drift', from: 11 }).alerts.map((a) => a.label); };
  assert.deepEqual(dw(read('online-retail-daily.csv')), ['2011-09-12']);
  assert.deepEqual(dw(read('online-retail-2009-daily.csv')), ['2010-02-01', '2010-09-20']);
});
