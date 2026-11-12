// The "How eager" hint in the CLI watch (watch.mjs --suggest, --detector auto, --alerts-per; README "The hint in the CLI watch").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './watch.mjs';
import { budgetFromPlain, plainBudgetText, chooseDetector, eagernessReplay, AUTO_MIN_POINTS, HINT_BUDGET, emptyState, advance } from './watch-core.mjs';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
const series = (n, f, seed) => { const g = rng(seed); return Array.from({ length: n }, (_, i) => f(i) + g()); };
const csvOf = (v) => 'day,value\n' + v.map((x, i) => `d${String(i + 1).padStart(4, '0')},${x.toFixed(4)}`).join('\n') + '\n';
const run = async (args) => { let s = ''; const code = await main(args, { out: (x) => { s += x; } }); return { code, s }; };
const dir = () => mkdtempSync(join(tmpdir(), 'watch-auto-'));

test('a plain budget: per 100 checks from alerts a period at a check interval, and back', () => {
  assert.equal(budgetFromPlain({ alerts: 1, per: 'month', every: 'day' }).toFixed(3), (100 / (365.25 / 12)).toFixed(3)); // 3.285
  assert.equal(budgetFromPlain({ alerts: 2, per: 'week', every: 'day' }), 200 / 7);
  assert.equal(budgetFromPlain({ alerts: 1, per: 'week', every: 'week' }), 100);
  assert.ok(Math.abs(budgetFromPlain({ alerts: 1, per: 'month', every: 'hour' }) - 100 / (24 * 365.25 / 12)) < 1e-12);
  assert.throws(() => budgetFromPlain({ alerts: 1, per: 'week', every: 'fortnight' }), /every takes/);
  assert.throws(() => budgetFromPlain({ alerts: 1, per: 'day' }), /per takes/);
  assert.throws(() => budgetFromPlain({ alerts: -1 }), /0 or more/);
  assert.throws(() => budgetFromPlain({ alerts: 8, per: 'week' }), /more than one alert per check \(7 daily checks a week\); give at most 7/);
  assert.equal(budgetFromPlain({ alerts: 7, per: 'week' }), 100);
  // Round trip: a budget made from "1 a month" reads back as about 1 a month.
  assert.equal(plainBudgetText(budgetFromPlain({ alerts: 1, per: 'month' })), 'about 1 alert a month at a daily check');
  assert.equal(plainBudgetText(HINT_BUDGET), 'about 7.3 alerts a year at a daily check');
  assert.equal(plainBudgetText(budgetFromPlain({ alerts: 6, per: 'year' })), 'about 6 alerts a year at a daily check');
  assert.equal(plainBudgetText(budgetFromPlain({ alerts: 3, per: 'week', every: 'hour' }), 'hour'), 'about 13 alerts a month at an hourly check');
});

test('--suggest prints the replay per setting and the budget in plain words, and writes no state', async () => {
  const d = dir(), f = join(d, 's.csv');
  writeFileSync(f, csvOf(series(160, (i) => (i >= 100 ? 3 : 0), 7)));
  const { code, s } = await run([f, '--suggest', '--alerts-per', '1/month']);
  assert.equal(code, 0);
  assert.match(s, /Quiet \(bocpd-ar1-window\): \d+ alerts?/);
  assert.match(s, /Middle \(bocpd\)/);
  assert.match(s, /Eager \(pelt\)/);
  assert.match(s, /Suggested: (Quiet|Middle|Eager)/);
  assert.match(s, /Budget: 3\.29 alerts per 100 checks, about 1 alert a month at a daily check\./);
  assert.ok(!existsSync(join(d, 'watch-state.json')));
  const j = JSON.parse((await run([f, '--suggest', '--json'])).s);
  assert.equal(j.budget, HINT_BUDGET);
  assert.deepEqual(j.settings.map((x) => x.key), ['quiet', 'middle', 'eager']);
  assert.equal(j.suggest, eagernessReplay(series(160, (i) => (i >= 100 ? 3 : 0), 7).map((x) => Number(x.toFixed(4)))).suggest);
});

test('--detector auto picks at the first run, stores the pick, and later runs keep it', async () => {
  const d = dir(), f = join(d, 's.csv'), st = join(d, 'state.json');
  const v = series(220, (i) => (i >= 200 ? 3 : 0), 11);
  writeFileSync(f, csvOf(v.slice(0, 150)));
  const first = await run([f, '--state', st, '--detector', 'auto', '--budget', '100']);
  assert.equal(first.code, 0);
  assert.match(first.s, /How eager: Eager \(pelt\), picked from 150 points of history/);
  const saved = JSON.parse(readFileSync(st, 'utf8'));
  assert.equal(saved.choice.detector, 'pelt');
  assert.equal(saved.choice.budget, 100);
  assert.equal(saved.choice.n, 150);
  // Later runs: the pick is reused (no new "How eager" line), even with a budget that would pick otherwise,
  // and the step at 200 is reported once.
  let alerts = 0;
  for (let n = 151; n <= 220; n++) {
    writeFileSync(f, csvOf(v.slice(0, n)));
    const r = JSON.parse((await run([f, '--state', st, '--detector', 'auto', '--budget', '0', '--json'])).s);
    assert.equal(r.picked, undefined);
    alerts += r.alerts.filter((a) => Math.abs(a.index - 200) <= 5).length;
  }
  assert.equal(JSON.parse(readFileSync(st, 'utf8')).choice.detector, 'pelt');
  assert.equal(alerts, 1, 'the step is alerted exactly once');
});

test('auto keeps quiet under 30 points, and when even quiet is over budget', () => {
  const short = series(AUTO_MIN_POINTS - 1, () => 0, 3);
  const c = chooseDetector(short);
  assert.equal(c.key, 'quiet');
  assert.equal(c.detector, 'bocpd-ar1-window');
  assert.match(c.reason, /under 30 points/);
  const none = chooseDetector(series(160, (i) => (i >= 100 ? 3 : 0), 7), null, { budget: -1 });
  assert.equal(none.key, 'quiet');
  assert.match(none.reason, /even Quiet/);
  // Counts: two settings, and the pick is one of them.
  const counts = series(120, (i) => (i >= 80 ? 12 : 5), 5).map((x) => Math.max(0, Math.round(x)));
  assert.ok(['bocpd', 'pelt'].includes(chooseDetector(counts, null, { model: 'poisson' }).detector));
});

test('advance carries the pick forward; bad flags are refused', async () => {
  const s0 = { ...emptyState(), choice: { detector: 'bocpd', key: 'middle' } };
  const r = advance(s0, [], 50, Array.from({ length: 50 }, (_, i) => i), {});
  assert.deepEqual(r.state.choice, s0.choice);
  assert.equal(advance(emptyState(), [], 50, Array.from({ length: 50 }, (_, i) => i), {}).state.choice, undefined);
  const d = dir(), f = join(d, 's.csv');
  writeFileSync(f, csvOf(series(60, () => 0, 2)));
  await assert.rejects(run([f, '--suggest', '--alerts-per', '1/day']), /--alerts-per takes/);
  await assert.rejects(run([f, '--suggest', '--alerts-per', '1/month', '--budget', '2']), /not both/);
  await assert.rejects(run([f, '--suggest', '--check-every', 'minute']), /--check-every takes/);
  await assert.rejects(run([f, '--state', join(d, 'x.json'), '--detector', 'auto', '--detector', 'pelt']), /not both/);
  await assert.rejects(run([f, '--suggest', '--alerts-per', '1/month', '--check-every', 'week', '--budget', 'x']), /--budget takes/);
});
