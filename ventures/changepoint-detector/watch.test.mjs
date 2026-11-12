import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advance, emptyState, detectChanges, main, webhookBody, WATCH_DEFAULTS } from './watch.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
function stepSeries(n, at, size, seed = 3) { const g = gauss(lcg(seed)); return Array.from({ length: n }, (_, i) => (i >= at ? size : 0) + g()); }
const csvOf = (values, start = new Date(Date.UTC(2026, 0, 1))) => 'date,orders\n' + values.map((v, i) => `${new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10)},${v.toFixed(3)}`).join('\n') + '\n';

for (const detector of ['pelt', 'bocpd-window']) {
  test(`${detector}: a step is reported once, after --confirm points, and not again as it is re-dated`, () => {
    const values = stepSeries(260, 200, 3);
    const labels = values.map((_, i) => String(i + 1));
    let state = emptyState(), reports = [];
    for (let n = 150; n <= values.length; n++) {
      const r = advance(state, detectChanges(values.slice(0, n), labels.slice(0, n), { detector }), n, labels.slice(0, n));
      for (const a of r.alerts) reports.push({ at: n, index: a.index, pointsAfter: a.pointsAfter });
      state = r.state;
    }
    assert.equal(reports.length, 1, JSON.stringify(reports));
    // dated from 5 points of data, the first report can be a few points off (pelt: 198 for 201); within --tolerance
    assert.ok(Math.abs(reports[0].index - 200) <= WATCH_DEFAULTS.tolerance);
    // persist 2 (round 5): a change re-dated past the tolerance between two checks waits one more check
    assert.ok(reports[0].pointsAfter >= WATCH_DEFAULTS.confirm && reports[0].pointsAfter <= WATCH_DEFAULTS.confirm + 1, JSON.stringify(reports));
  });
}

test('the old default (bocpd) misses this clear step: its probability is split between neighbours (why the window exists)', () => {
  const values = stepSeries(260, 200, 3);
  const labels = values.map((_, i) => String(i + 1));
  assert.deepEqual(detectChanges(values, labels, { detector: 'bocpd' }), []);
  const d = detectChanges(values, labels);
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0].index - 200) <= 2 && d[0].shift > 2.5);
  const w = detectChanges(values, labels, { detector: 'bocpd-window' });
  assert.equal(w.length, 1);
  assert.ok(w[0].probability >= 0.5 && w[0].shift > 2.5);
});

test('a change with fewer than --confirm points after it is pending, not alerted', () => {
  const r = advance({ ...emptyState(), n: 100 }, [{ index: 98, label: '99' }], 101, Array.from({ length: 101 }, (_, i) => String(i + 1)));
  assert.equal(r.alerts.length, 0);
  assert.equal(r.pending.length, 1);
  assert.equal(r.pending[0].pointsAfter, 3);
});

test('the first check records the history as the baseline; --alert-history reports it', () => {
  const labels = Array.from({ length: 100 }, (_, i) => String(i + 1));
  const ch = [{ index: 40, label: '41' }];
  const base = advance(emptyState(), ch, 100, labels);
  assert.equal(base.alerts.length, 0);
  assert.equal(base.baseline.length, 1);
  assert.equal(base.state.alerted[0].baseline, true);
  assert.equal(advance(emptyState(), ch, 100, labels, { alertHistory: true }).alerts.length, 1);
});

test('a rolling file that drops its oldest rows keeps the alerted change by its label', () => {
  const labels = Array.from({ length: 100 }, (_, i) => `d${i}`);
  const st = advance({ ...emptyState(), n: 99 }, [{ index: 60, label: 'd60' }], 100, labels).state;
  // 30 rows dropped from the front: the same change is now at index 30
  const later = advance(st, [{ index: 31, label: 'd61' }], 70, labels.slice(30));
  assert.equal(later.alerts.length, 0);
  assert.match(later.notes[0], /shorter/);
});

test('webhook body carries text (Slack, Teams, Mattermost) and content under 2000 characters (Discord)', () => {
  const b = webhookBody('x'.repeat(3000));
  assert.equal(b.text.length, 3000);
  assert.ok(b.content.length <= 1990);
});

test('CLI: baseline, then a new step posts to the webhook once and writes the state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-'));
  const csv = join(dir, 'daily.csv'), state = join(dir, 'state.json');
  const g = gauss(lcg(11));
  const quiet = Array.from({ length: 120 }, () => 50 + g());
  const posts = [];
  const server = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { posts.push(JSON.parse(b)); res.end('ok'); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { HOOK: `http://127.0.0.1:${server.address().port}/hook` };
  const run = async (args) => { let o = ''; const code = await main(args, { out: (s) => (o += s), env }); return { code, o }; };
  try {
    writeFileSync(csv, csvOf(quiet));
    let r = await run([csv, '--state', state, '--webhook-env', 'HOOK', '--fail-on-alert']);
    assert.equal(r.code, 0);
    assert.ok(existsSync(state));
    const stepped = [...quiet, ...Array.from({ length: 4 }, () => 55 + g())];
    writeFileSync(csv, csvOf(stepped));
    r = await run([csv, '--state', state, '--webhook-env', 'HOOK', '--fail-on-alert']);
    assert.equal(r.code, 0, r.o);
    assert.match(r.o, /Watching: a possible change from 2026-05-01/);
    assert.equal(posts.length, 0);
    const more = [...stepped, ...Array.from({ length: 3 }, () => 55 + g())];
    writeFileSync(csv, csvOf(more));
    r = await run([csv, '--state', state, '--webhook-env', 'HOOK', '--fail-on-alert']);
    assert.equal(r.code, 1, r.o);
    assert.equal(posts.length, 1);
    assert.match(posts[0].text, /orders changed from 2026-05-01: level up from 49\.9 to 54\.9 \(4\.29 noise sd\), Bayesian probability 99%; 7 points since\./);
    r = await run([csv, '--state', state, '--webhook-env', 'HOOK', '--fail-on-alert']);
    assert.equal(r.code, 0);
    assert.equal(posts.length, 1);
    assert.equal(JSON.parse(readFileSync(state, 'utf8')).alerted.length, 1);
  } finally { server.close(); }
});

test('CLI: a failing webhook leaves the state unsaved so the next run retries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-'));
  const csv = join(dir, 'd.csv'), state = join(dir, 's.json');
  writeFileSync(csv, csvOf(stepSeries(140, 120, 4)));
  const fetchImpl = async () => ({ ok: false, status: 500 });
  await assert.rejects(main([csv, '--state', state, '--alert-history', '--webhook-env', 'H'], { out: () => {}, env: { H: 'http://x' }, fetchImpl }), /answered 500/);
  assert.ok(!existsSync(state));
});

test('CLI: refuses to run without --state or --dry-run', async () => {
  await assert.rejects(main(['x.csv'], { out: () => {} }), /--state/);
});

test('deploy/make-watch-repo.sh makes a folder that runs on its own', async () => {
  const { execFileSync } = await import('node:child_process');
  const dest = join(mkdtempSync(join(tmpdir(), 'watch-repo-')), 'w');
  execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dest]);
  for (const f of ['watch.mjs', 'engine.mjs', 'LICENSE', 'README.md', '.github/workflows/watch-metric.yml']) assert.ok(existsSync(join(dest, f)), f);
  writeFileSync(join(dest, 'data/metric.csv'), csvOf(stepSeries(80, 60, 4)));
  const out = execFileSync('node', ['watch.mjs', 'data/metric.csv', '--state', 'watch-state.json'], { cwd: dest, encoding: 'utf8' });
  assert.match(out, /First check: 1 change already in the history/);
  assert.match(readFileSync(join(dest, '.github/workflows/watch-metric.yml'), 'utf8'), /--state watch-state\.json/);
  assert.match(readFileSync(join(dest, 'README.md'), 'utf8'), /github\.com\/sponsors/);
});

test('the defaults are the ones the pre-registered replay chose (eval/watch-replay*.out.txt)', () => {
  const r1 = readFileSync(new URL('./eval/watch-replay.out.txt', import.meta.url), 'utf8');
  const r2 = readFileSync(new URL('./eval/watch-replay-round2.out.txt', import.meta.url), 'utf8');
  assert.match(r1, /Chosen: bocpd with --confirm 5 /);
  assert.match(r1, /  bocpd \*\s+5\s+193\s+63 \(33%\)\s+30\.3\s+38\/52/);
  assert.match(r1, /  pelt-mean\s+5\s+626\s+134 \(21%\)\s+98\.2\s+52\/52/);
  assert.match(r2, /Not adopted: bocpd stays the default\./);
  assert.match(r2, /  bocpd-window\s+5\s+307\s+85 \(28%\)\s+48\.2\s+46\/52/);
  const r3 = readFileSync(new URL('./eval/watch-replay-round3.out.txt', import.meta.url), 'utf8');
  assert.match(r3, /Adopted: bocpd-ar1-win becomes the default\./);
  assert.equal(WATCH_DEFAULTS.detector, 'bocpd-ar1-window');
  assert.equal(WATCH_DEFAULTS.confirm, 5);
});

// Sticky noise: AR(1) 0.8 with marginal sd 1 (innovation sd 0.6), as in eval/watch-replay.mjs --round3.
function ar1Series(n, seed, at = -1, size = 0) { const g = gauss(lcg(seed)); let e = 0; return Array.from({ length: n }, (_, i) => (at >= 0 && i >= at ? size : 0) + (e = 0.8 * e + 0.6 * g())); }

test('bocpd-ar1: quiet on sticky noise with no change, where plain bocpd finds several', () => {
  for (const seed of [1, 2, 4, 5]) {
    const values = ar1Series(300, seed);
    const labels = values.map((_, i) => String(i + 1));
    assert.ok(detectChanges(values, labels, { detector: 'bocpd' }).length >= 4, `seed ${seed}: bocpd`);
    assert.deepEqual(detectChanges(values, labels), [], `seed ${seed}: default`);
    assert.deepEqual(detectChanges(values, labels, { detector: 'bocpd-ar1' }), [], `seed ${seed}`);
  }
});

test('bocpd-ar1: a 6-sd step in sticky noise is reported once, with no false alerts before it', () => {
  const values = ar1Series(260, 101, 200, 6);
  const labels = values.map((_, i) => String(i + 1));
  let state = emptyState(), reports = [];
  for (let n = 100; n <= values.length; n++) {
    const r = advance(state, detectChanges(values.slice(0, n), labels.slice(0, n), { detector: 'bocpd-ar1' }), n, labels.slice(0, n));
    for (const a of r.alerts) reports.push(a.index);
    state = r.state;
  }
  assert.deepEqual(reports, [200]);
});

test('--detector bocpd-ar1 runs from the CLI and refuses the count and volatility models', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'watch-ar1-'));
  const f = join(dir, 'm.csv');
  writeFileSync(f, csvOf(ar1Series(260, 101, 200, 6)));
  let text = '';
  assert.equal(await main([f, '--dry-run', '--alert-history', '--detector', 'bocpd-ar1'], { out: (s) => { text += s; } }), 0);
  assert.match(text, /New change:\n {2}orders changed from 2026-07-20: level up/);
  await assert.rejects(main([f, '--dry-run', '--detector', 'bocpd-ar1', '--model', 'poisson']), /level model/);
  await assert.rejects(main([f, '--dry-run', '--detector', 'nope']), /bocpd-ar1/);
  // with a count model and no --detector, the default falls back to plain bocpd instead of refusing
  writeFileSync(f, csvOf(Array.from({ length: 120 }, (_, i) => (i >= 80 ? 30 : 10) + (i % 3))));
  text = '';
  assert.equal(await main([f, '--dry-run', '--alert-history', '--model', 'poisson'], { out: (s) => { text += s; } }), 0);
  assert.match(text, /rate up/);
});

test('a fixed rho (ar1Rho) replaces the estimate in the AR(1) pass, clipped to [0, 0.95]', async () => {
  const { analyze } = await import('./engine.mjs');
  const values = stepSeries(200, 120, 3);
  assert.equal(analyze({ values, ar1: true, ar1Rho: 0.3 }).ar1.rho, 0.3);
  assert.equal(analyze({ values, ar1: true, ar1Rho: 2 }).ar1.rho, 0.95);
  // with an AR(1) detector, the plain engine run is skipped: only the AR(1) lists come back
  const labels = values.map((_, i) => String(i + 1));
  const d = detectChanges(values, labels);
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0].index - 120) <= 2);
});

test('round 4: rho capped at 0.8 (the default) reports documented changes the uncapped AR(1) pass reads as persistence', async () => {
  const { parseSeries } = await import('./engine.mjs');
  const load = (f) => parseSeries(readFileSync(new URL(`./data/${f}`, import.meta.url), 'utf8'), null, null);
  // S&P 500 monthly closes: the October 2008 crash; Canada's fertility: the 1946 post-war rise. Both estimate rho at the 0.95 clip.
  for (const [f, label] of [['sp500-monthly.csv', 'Oct 1 2008'], ['canada-fertility.csv', '1946']]) {
    const { values, labels } = load(f);
    assert.ok(detectChanges(values, labels).some((c) => c.label === label), `${f}: capped`);
    assert.ok(!detectChanges(values, labels, { rhoCap: 0.95 }).some((c) => c.label === label), `${f}: uncapped`);
  }
  assert.equal(WATCH_DEFAULTS.rhoCap, 0.8);
});

test('replayWatch: a clear step is alerted once, 5 to 7 points late; checking every 7 points and bisecting gives the same date', async () => {
  const { replayWatch, replayText } = await import('./watch.mjs');
  const values = stepSeries(260, 200, 3);
  const every = replayWatch(values, null, { from: 150 });
  assert.equal(every.step, 1);
  assert.equal(every.alerts.length, 1, JSON.stringify(every.alerts));
  assert.ok(Math.abs(every.alerts[0].index - 200) <= WATCH_DEFAULTS.tolerance);
  assert.ok(every.alerts[0].pointsAfter >= WATCH_DEFAULTS.confirm && every.alerts[0].pointsAfter <= WATCH_DEFAULTS.confirm + 2);
  const coarse = replayWatch(values, null, { from: 150, step: 7 });
  assert.equal(coarse.step, 7);
  assert.ok(coarse.checks < every.checks);
  assert.deepEqual(coarse.alerts.map((a) => [a.index, a.reportedAt]), every.alerts.map((a) => [a.index, a.reportedAt]));
  assert.match(replayText(every, { column: 'orders' }), /orders changed from 201|orders changed from 20\d/);
});

test('replayWatch: changes before the first check are the baseline, quiet noise sends nothing, the budget raises the step', async () => {
  const { replayWatch } = await import('./watch.mjs');
  const values = stepSeries(300, 40, 4, 5);
  const r = replayWatch(values, null, { from: 100 });
  assert.equal(r.baseline.length, 1);
  assert.equal(r.alerts.length, 0);
  // Seed 22 is quiet both ways. (Seed 21 is not: a 5-point run at 1.7 sd sends one false alert at point 320,
  // checked every point or every 12 and bisected alike.)
  const g = gauss(lcg(22));
  const quiet = Array.from({ length: 400 }, () => 10 + g());
  const q = replayWatch(quiet, null, { budget: 2e6 });
  assert.ok(q.step > 1, `step ${q.step}`);
  assert.equal(q.alerts.length, 0);
  assert.throws(() => replayWatch([1, 2, 3]), /at least 10/);
});

// Round 5 guards (eval/watch-flicker.mjs): the ausair pattern, a quiet baseline then old history read as new.
test('--hold-history: a change dated where the first check could already confirm it is recorded, not alerted', () => {
  const labels = Array.from({ length: 30 }, (_, i) => String(i + 1));
  let st = advance(emptyState(), [], 20, labels.slice(0, 20)).state; // quiet baseline at 20 points
  assert.equal(st.baselineN, 20);
  const plain = advance(st, [{ index: 9, label: '10' }, { index: 15, label: '16' }], 21, labels.slice(0, 21), { holdHistory: false, persist: 1 });
  assert.equal(plain.alerts.length, 2, 'without the guard both old changes are alerted');
  const held = advance(st, [{ index: 9, label: '10' }, { index: 15, label: '16' }], 21, labels.slice(0, 21), { holdHistory: true, persist: 1 });
  assert.equal(held.alerts.length, 0); // 9 and 15 are both <= 20 - 5, so both are history
  assert.equal(held.history.length, 2);
  assert.ok(held.state.alerted.every((a) => a.baseline && a.history));
  assert.match(held.notes.join(' '), /Re-read in the history/);
  // a change near the baseline's end had too few points to confirm then, so it is still alerted
  const late = advance(st, [{ index: 17, label: '18' }], 23, labels.slice(0, 23), { holdHistory: true, persist: 1 });
  assert.equal(late.alerts.length, 1);
});

test('--persist 2: a change seen at one check only is not alerted; seen twice, it is, once', () => {
  const labels = Array.from({ length: 60 }, (_, i) => String(i + 1));
  let st = advance(emptyState(), [], 40, labels.slice(0, 40), { holdHistory: false, persist: 2 }).state;
  const once = advance(st, [{ index: 30, label: '31' }], 41, labels.slice(0, 41), { holdHistory: false, persist: 2 });
  assert.equal(once.alerts.length, 0);
  assert.equal(once.pending[0].unconfirmed, true);
  const gone = advance(once.state, [], 42, labels.slice(0, 42), { holdHistory: false, persist: 2 });
  assert.equal(gone.alerts.length, 0, 'a flicker that vanishes never alerts');
  const a = advance(gone.state, [{ index: 31, label: '32' }], 43, labels.slice(0, 43), { holdHistory: false, persist: 2 });
  const b = advance(a.state, [{ index: 32, label: '33' }], 44, labels.slice(0, 44), { holdHistory: false, persist: 2 });
  assert.equal(a.alerts.length, 0);
  assert.equal(b.alerts.length, 1, 're-dated by a point within the tolerance still counts as the same change');
  assert.equal(advance(b.state, [{ index: 32, label: '33' }], 45, labels.slice(0, 45), { holdHistory: false, persist: 2 }).alerts.length, 0);
});

test('replayWatch on ausair: the round-5 guards drop the two alerts about history the baseline had called quiet', async () => {
  const { replayWatch } = await import('./watch.mjs');
  const { parseSeries } = await import('./engine.mjs');
  const p = parseSeries(readFileSync(new URL('./data/ausair.csv', import.meta.url), 'utf8'), null, null);
  const before = replayWatch(p.values, p.labels, { holdHistory: false, persist: 1 });
  assert.deepEqual(before.alerts.map((a) => `${a.label}@${a.reportedAtLabel}`), ['1979@1990', '1985@1990', '1991@2011']);
  const now = replayWatch(p.values, p.labels);
  assert.deepEqual(now.alerts.map((a) => `${a.label}@${a.reportedAtLabel}`), ['1991@2011']);
});
