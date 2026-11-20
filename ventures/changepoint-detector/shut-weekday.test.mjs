import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeries } from './engine.mjs';
import { shutWeekdays, dropShutWeekdays, replayWatch } from './watch-core.mjs';

// README "A shop shut one weekday": eval/shut-weekday.prereg.md. Round 2 passed on both real years and failed the
// simulation's power bar (F4), so it is not offered on the CLI or the page; these pin the helpers and the real results.
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

// Round 3 (eval/shut-weekday-ramp.prereg.md, README "A shop shut one weekday, round 3"): P1-P3 fail. A gradual climb
// does not deafen the default the way the real shop's climb did; this pins one simulated shop of that kind.
test('round 3: with the shut Saturdays in, Quiet hears a simulated x1.9 climb over five weeks', () => {
  let s = 7;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
  const lab = days(371), a = 250, len = 35, FACT = [0.6, 1.2, 1, 1, 1, 1, 0];
  const v = lab.map((_, i) => { const w = (i + 1) % 7; if (w === 6) return 0; return Math.round(30000 * Math.exp(Math.min(1, Math.max(0, (i - a) / len)) * Math.log(1.9)) * FACT[w] * Math.exp(0.35 * gauss())); });
  const day = (l) => Date.parse(l + 'T00:00:00Z') / 864e5, d0 = day(lab[a]);
  const r = replayWatch(v, lab, { model: 'mean', period: 7, from: 74 });
  assert.ok(r.alerts.some((x) => day(x.label) - d0 >= -7 && day(x.label) - d0 <= len && day(x.reportedAtLabel) >= d0 && day(x.reportedAtLabel) - day(x.label) <= 14), JSON.stringify(r.alerts.map((x) => [x.label, x.reportedAtLabel])));
});
