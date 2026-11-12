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
    assert.equal(reports[0].pointsAfter, WATCH_DEFAULTS.confirm);
  });
}

test('the default (bocpd) misses this clear step: its probability is split between neighbours (why bocpd-window exists)', () => {
  const values = stepSeries(260, 200, 3);
  const labels = values.map((_, i) => String(i + 1));
  assert.equal(WATCH_DEFAULTS.detector, 'bocpd');
  assert.deepEqual(detectChanges(values, labels), []);
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
    assert.match(posts[0].text, /orders changed from 2026-05-01: level up from 49\.9 to 54\.9 \(5\.62 noise sd\), Bayesian probability 98%; 7 points since\./);
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
  assert.equal(WATCH_DEFAULTS.detector, 'bocpd');
  assert.equal(WATCH_DEFAULTS.confirm, 5);
});
