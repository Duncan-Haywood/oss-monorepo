import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeries } from './engine.mjs';
import { shutWeekdays, dropShutWeekdays, replayWatch } from './watch-core.mjs';
import { main, shutDrop } from './watch.mjs';
import { analyzeJob, shutPrep } from './analyze-job.mjs';

// README "A shop shut one weekday": eval/shut-weekday.prereg.md, round 2 ships.
const days = (n, y = 2024, m = 0, d = 1) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m, d + i)).toISOString().slice(0, 10));
const L = days(70); // from Monday 2024-01-01
const shop = (fn) => L.map((l, i) => ((i + 1) % 7 === 6 ? 0 : fn(i))); // Saturdays 0

test('shutWeekdays: an every-week zero is listed; a weekday with one recent sale, short or non-daily series are not', () => {
  assert.deepEqual(shutWeekdays(shop(() => 5), L), ['Saturday']);
  const v = shop(() => 5);
  v[67] = 0; // one zero Friday is a closure, not a shut weekday
  assert.deepEqual(shutWeekdays(v, L), ['Saturday']);
  const sold = shop(() => 5);
  sold[68] = 9; // the last Saturday traded
  assert.deepEqual(shutWeekdays(sold, L), []);
  assert.deepEqual(shutWeekdays(shop(() => 5).slice(0, 21), L.slice(0, 21)), []); // under 4 weeks
  assert.deepEqual(shutWeekdays(shop(() => 5), L.map((_, i) => String(i + 1))), []);
  assert.deepEqual(shutWeekdays(L.map(() => 0), L), []); // all zero: nothing is "shut"
});

test('round 2: a trading Saturday more than 8 weeks back does not stop the drop; round 1 (recent 0) refuses', () => {
  const v = shop(() => 5);
  v[5] = 30; // the first Saturday traded, as 2009-12-05 did
  assert.deepEqual(shutWeekdays(v, L), ['Saturday']);
  assert.deepEqual(shutWeekdays(v, L, { recent: 0 }), []);
  const d = dropShutWeekdays(v, L);
  assert.equal(d.values.length, 60);
  assert.ok(d.labels.every((l) => new Date(`${l}T00:00:00Z`).getUTCDay() !== 6));
});

const year = (f) => parseSeries(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'), 'revenue', null);

test('the fresh year (Online Retail II): Quiet hears the autumn climb 6 days after it starts, not 59', () => {
  const { values, labels } = year('online-retail-2009-daily.csv');
  const d = dropShutWeekdays(values, labels);
  assert.deepEqual(d.dropped, ['Saturday']);
  const r = replayWatch(d.values, d.labels, { model: 'mean', period: 6 });
  assert.deepEqual(r.alerts.map((a) => [a.label, a.reportedAtLabel]), [['2010-09-28', '2010-10-04']]);
  const before = replayWatch(values, labels, { model: 'mean', period: 7 });
  assert.deepEqual(before.alerts.map((a) => [a.label, a.reportedAtLabel]), [['2010-09-28', '2010-11-26']]);
});

test('the design year: the climb from 2011-09-15 is sent on 2011-09-21; before, Quiet never heard it', () => {
  const { values, labels } = year('online-retail-daily.csv');
  const d = dropShutWeekdays(values, labels);
  const r = replayWatch(d.values, d.labels, { model: 'mean', period: 6 });
  assert.ok(r.alerts.some((a) => a.label === '2011-09-15' && a.reportedAtLabel === '2011-09-21'));
  const before = replayWatch(values, labels, { model: 'mean', period: 7 });
  assert.ok(!before.alerts.some((a) => a.label >= '2011-08-15'));
});

test('watch CLI: the drop is on by default for level models, says so, and --shut-days keep or poisson leave the rows', async () => {
  const csv = 'date,revenue,orders\n' + L.map((l, i) => { const v = (i + 1) % 7 === 6 ? 0 : 100 + (i % 3); return `${l},${v},${v ? 10 : 0}`; }).join('\n') + '\n';
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const dir = mkdtempSync('/tmp/shut-'), f = `${dir}/m.csv`;
  writeFileSync(f, csv);
  let s = '';
  await main([f, '--column', 'revenue', '--period', '7', '--dry-run', '--json'], { out: (t) => { s += t; } });
  const j = JSON.parse(s);
  assert.deepEqual(j.shutDays, { left: ['Saturday'], rows: 10, period: 6 });
  assert.equal(j.n, 60);
  s = '';
  await main([f, '--column', 'revenue', '--dry-run'], { out: (t) => { s += t; } });
  assert.match(s, /^Shut days: Saturday is 0 in each of the last 8 weeks, so that day is left out \(10 rows\); --shut-days keep/);
  s = '';
  await main([f, '--column', 'revenue', '--shut-days', 'keep', '--dry-run', '--json'], { out: (t) => { s += t; } });
  assert.equal(JSON.parse(s).n, 70);
  s = '';
  await main([f, '--columns', 'revenue,orders:poisson', '--dry-run', '--json'], { out: (t) => { s += t; } });
  const cols = JSON.parse(s).columns;
  assert.equal(cols[0].n, 60);
  assert.equal(cols[1].n, 70);
  await assert.rejects(main([f, '--shut-days', 'maybe']), /--shut-days takes auto or keep/);
});

test('shutDrop and shutPrep: the period is only changed from 7; the page replay carries shutDays', () => {
  const v = shop((i) => 100 + (i % 5));
  assert.equal(shutDrop({ values: v, line: '', json: {} }, L, { period: 12 }).period, undefined);
  assert.equal(shutPrep(v, L, { model: 'mean', period: 7 }).opts.period, 6);
  assert.equal(shutPrep(v, L, { model: 'poisson', period: 7 }).shutDays, null);
  const csv = 'date,revenue\n' + L.map((l, i) => `${l},${v[i]}`).join('\n') + '\n';
  const out = analyzeJob({ kind: 'replay', csv, column: 'revenue', opts: { model: 'mean', period: 7 } });
  assert.deepEqual(out.result.shutDays, { left: ['Saturday'], rows: 10, period: 6 });
  assert.equal(out.result.n, 60);
  assert.equal(analyzeJob({ kind: 'replay', csv, column: 'revenue', opts: { model: 'mean', shutDays: 'keep' } }).result.n, 70);
});
