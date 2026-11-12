// Round 6: the "How eager" comparison on a person's own history (watch-core.mjs eagernessReplay; README "Round 6").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eagernessReplay, eagernessText, eagerSettings, replayWatch, suggestFor, budgetFromPlain, HINT_BUDGET } from './watch-core.mjs';
import { analyzeJob } from './analyze-job.mjs';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
const series = (n, f, seed) => { const g = rng(seed); return Array.from({ length: n }, (_, i) => f(i) + g()); };

test('the shipped budget is the one round 6 pre-registered, and the round passed', () => {
  const out = readFileSync(new URL('./eval/watch-eagerness.out.txt', import.meta.url), 'utf8');
  assert.equal(HINT_BUDGET, 2);
  assert.match(out, /hint, B = 2 \(pre-registered\)\s+68\s+28 \(41%\)\s+17\.5\s+17\/31/);
  assert.match(out, /The hint SHIPS\. Forecast claim \(quiet Spearman >= 0\.5\): 0\.616 SHIPS/);
});

test('each setting is the replay with that detector; the rate is per daily check after the baseline', () => {
  const v = series(160, (i) => (i >= 100 ? 3 : 0), 7);
  const r = eagernessReplay(v);
  assert.deepEqual(r.settings.map((s) => s.key), ['quiet', 'middle', 'eager']);
  for (const s of r.settings) {
    const one = replayWatch(v, null, { detector: s.detector });
    assert.equal(s.alerts, one.alerts.length);
    assert.equal(s.checks, one.n - one.from);
    assert.equal(s.per100, (100 * s.alerts) / s.checks);
  }
  assert.ok(r.settings.every((s) => s.alerts >= 1), 'a 3-sd step is alerted by every setting');
});

test('suggest: the most eager setting at or under the budget, else quiet', () => {
  const v = series(160, (i) => (i >= 100 ? 3 : 0), 7);
  const r = eagernessReplay(v);
  const within = r.settings.filter((s) => s.per100 <= HINT_BUDGET).map((s) => s.key);
  assert.equal(r.suggest, within.length ? within[within.length - 1] : 'quiet');
  const none = eagernessReplay(v, null, { budget: -1 });
  assert.equal(none.suggest, 'quiet');
  assert.match(eagernessText(none, { column: 'orders' }), /Suggested: Quiet, the least eager setting\. Even Quiet would have sent/);
  assert.doesNotMatch(eagernessText(none), /wanders/, 'a budget under the default is the person asking for few alerts, not a wandering level');
  const all = eagernessReplay(v, null, { budget: 100 });
  assert.equal(all.suggest, 'eager');
  assert.match(eagernessText(all), /Suggested: Eager/);
  assert.match(eagernessText(all), /not a promise/);
});

test('a wandering level: even quiet is over the budget, and the text says to watch the daily change', () => {
  let x = 0;
  const g = rng(3);
  const v = Array.from({ length: 300 }, () => (x += g()));
  const r = eagernessReplay(v);
  if (r.settings[0].per100 > HINT_BUDGET) assert.match(eagernessText(r), /daily change/);
  assert.ok(r.settings[2].alerts >= r.settings[0].alerts, 'eager sends at least as many alerts as quiet on a random walk');
});

test('volatility and counts models have two settings (their quiet default is already bocpd)', () => {
  assert.deepEqual(eagerSettings('meanvar').map((s) => s.detector), ['bocpd', 'pelt']);
  assert.deepEqual(eagerSettings('mean').map((s) => s.detector), ['bocpd-ar1-window', 'bocpd', 'pelt']);
  const counts = series(120, (i) => (i >= 70 ? 20 : 8), 5).map((y) => Math.max(0, Math.round(y)));
  const r = eagernessReplay(counts, null, { model: 'poisson' });
  assert.deepEqual(r.settings.map((s) => s.key), ['quiet', 'eager']);
});

test('the page runs it in the worker job and offers to set the watch card', () => {
  const v = series(80, (i) => (i >= 50 ? 4 : 0), 9);
  const csv = ['t,y', ...v.map((y, i) => `${i},${y.toFixed(3)}`)].join('\n');
  const out = analyzeJob({ kind: 'eagerness', csv, column: 'y', opts: {} });
  assert.equal(out.result.column, 'y');
  assert.equal(out.result.settings.length, 3);
  assert.match(analyzeJob({ kind: 'eagerness', csv: 't,y\n1,2', opts: {} }).error, /.+/);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /id="eager-run"/);
  assert.match(html, /kind: "eagerness"/);
  assert.match(html, /\$\("#watch-detector"\)\.value = \$\("#eager-use"\)\.dataset\.value/);
  assert.match(html, /record\("watch_eagerness"\)/);
  assert.match(html, /<code>watch_eagerness<\/code>/);
});

test('the page\'s budget box: re-picking from one replay matches a fresh replay at that budget', () => {
  const v = series(160, (i) => (i >= 100 ? 3 : 0), 7);
  const r = eagernessReplay(v);
  for (const plain of [{ alerts: 6, per: 'year' }, { alerts: 1, per: 'month' }, { alerts: 1, per: 'week' }, { alerts: 7, per: 'week' }, { alerts: 0, per: 'year' }]) {
    const b = budgetFromPlain(plain);
    assert.equal(suggestFor(r.settings, b), eagernessReplay(v, null, { budget: b }).suggest, JSON.stringify(plain));
  }
  assert.equal(suggestFor(r.settings), r.suggest, 'no budget is the shipped default');
  // A budget other than the tested one says the evidence is for the tested one, and gives the plain-budget menu.
  assert.doesNotMatch(eagernessText(r), /Those numbers are for the tested budget/);
  const month = eagernessText({ ...r, budget: budgetFromPlain({ alerts: 1, per: 'month' }) }, { every: 'day' });
  assert.match(month, /Budget: 3\.29 alerts per 100 checks, about 1 alert a month at a daily check\./);
  assert.match(month, /Those numbers are for the tested budget of 2 per 100 \(about 7\.3 alerts a year at a daily check\); at about 1 a month the same series reached 19 of 31/);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  for (const id of ['eager-alerts', 'eager-per', 'eager-every']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /suggestFor\(r\.settings, b\.budget, r\.n\)/);
  // Under 30 points the hint keeps Quiet whatever the budget, as --detector auto does, and says why.
  const short = eagernessReplay(series(25, (i) => (i >= 15 ? 4 : 0), 4), null, { budget: 100 });
  assert.equal(short.suggest, 'quiet');
  assert.equal(suggestFor(short.settings, 100, short.n), 'quiet');
  assert.match(eagernessText(short), /Suggested: Quiet\. 25 points is under the 30/);
});
