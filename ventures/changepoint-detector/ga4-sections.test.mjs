// ga4-metrics.mjs --sections against a stand-in for the Data API's runReport answering the two section requests (a
// top-sections report by pagePathLevel1, ordered by screenPageViews descending, and a daily report by date and
// pagePathLevel1), then a template-shaped loss from eval/template-loss.mjs through the watch. Nothing here talks to
// Google. README "A template-shaped tracking loss".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, sectionColumn, existingSections, readExisting, toCsv, DEFAULT_METRICS } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';
import { site, topSections, OFF, MIDDLE, BASE, SECTIONS } from './eval/template-loss.mjs';
import { darkRuns, darkSections, main as darkMain } from './dark-sections.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const compact = (d) => d.replace(/-/g, '');
const quiet = () => {};
const NOW = Date.parse('2026-06-20T18:00:00Z');
const TODAY = '2026-06-20';

// Per-path daily views: "/" 300, "/blog/" 200 and "/Blog/" 40 (one column), "/help/" 60 until `helpDarkOn`, then 0
// (GA4 leaves the row out), "/p/" 120, "(other)" 500 (GA4's bucket for rows past its cardinality limit).
const PATHS = { '/': 300, '/blog/': 200, '/Blog/': 40, '/help/': 60, '/p/': 120, '(other)': 500 };
function standIn({ helpDarkOn = '9999-12-31', pageCap = 10000, today = TODAY } = {}) {
  const calls = [];
  const views = (path, d) => (path === '/help/' && d >= helpDarkOn ? 0 : PATHS[path] + (Number(compact(d)) % 7));
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const body = JSON.parse(raw);
      calls.push(body);
      if (req.headers.authorization !== 'Bearer ya29.ok') return send(401, { error: { code: 401, message: 'bad token' } });
      const resolve = (s) => (s === 'today' ? today : /^\d+daysAgo$/.test(s) ? addDays(today, -parseInt(s, 10)) : s);
      const a = resolve(body.dateRanges[0].startDate), b = resolve(body.dateRanges[0].endDate);
      const days = []; for (let d = a; d <= b; d = addDays(d, 1)) days.push(d);
      const dims = body.dimensions.map((x) => x.name);
      let rows;
      if (dims.join() === 'date') {
        rows = days.map((d) => ({ dimensionValues: [{ value: compact(d) }], metricValues: body.metrics.map(() => ({ value: '100' })) }));
      } else if (dims.join() === 'pagePathLevel1') {
        assert.deepEqual(body.orderBys, [{ metric: { metricName: 'screenPageViews' }, desc: true }]);
        rows = Object.keys(PATHS).map((p) => [p, days.reduce((t, d) => t + views(p, d), 0)]).sort((x, y) => y[1] - x[1])
          .slice(0, Number(body.limit)).map(([p, v]) => ({ dimensionValues: [{ value: p }], metricValues: [{ value: String(v) }] }));
      } else if (dims.join() === 'date,pagePathLevel1') {
        rows = days.flatMap((d) => Object.keys(PATHS).filter((p) => views(p, d) > 0).map((p) => ({ dimensionValues: [{ value: compact(d) }, { value: p }], metricValues: [{ value: String(views(p, d)) }] })));
      } else return send(400, { error: { code: 400, message: `unexpected dimensions ${dims}` } });
      const off = Number(body.offset ?? 0), lim = Math.min(Number(body.limit), pageCap);
      send(200, { rows: rows.slice(off, off + lim), rowCount: rows.length, metricHeaders: body.metrics.map((m) => ({ name: m.name })) });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, env: { GA4_API_BASE: base, GA4_ACCESS_TOKEN: 'ya29.ok' }, close: () => new Promise((r) => server.close(r)) });
  }));
}

test('section columns: "/" is home, case and punctuation fold, GA4 buckets have none; an earlier header is read back', () => {
  assert.equal(sectionColumn('/'), 'views_home');
  assert.equal(sectionColumn('/Blog/'), 'views_blog');
  assert.equal(sectionColumn('/help-centre/'), 'views_help_centre');
  assert.equal(sectionColumn('(other)'), null);
  assert.equal(sectionColumn('(not set)'), null);
  const m = ['sessions', 'keyEvents'];
  assert.deepEqual(existingSections('date,sessions,keyEvents\n', m), []);
  assert.deepEqual(existingSections('date,sessions,keyEvents,views_home,views_blog\n', m), ['views_home', 'views_blog']);
  assert.equal(existingSections('date,sessions,keyEvents,revenue\n', m), null);
  assert.equal(existingSections('date,sessions\n', m), null);
});

test('--sections 3 picks the busiest sections, merges paths that share a column, pages, then keeps them when one goes dark', async () => {
  const s = await standIn({ pageCap: 100 });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ga4-sec-'));
    const outPath = join(dir, 'ga4.csv');
    const said = [];
    assert.equal(await main(['--property', '123456789', '--out', outPath, '--days', '60', '--sections', '3'], { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    const cols = [...DEFAULT_METRICS, 'views_home', 'views_blog', 'views_p'];
    const text = readFileSync(outPath, 'utf8');
    assert.equal(text.split('\n')[0], ['date', ...cols].join(','), '(other) is skipped; /blog/ + /Blog/ (240) outrank /p/ (120) and /help/ (60)');
    const got = readExisting(text, cols);
    assert.equal(got.length, 60);
    const d = got.find((r) => r.date === '2026-05-01');
    const k = Number(compact('2026-05-01')) % 7;
    assert.equal(d.values.views_blog, 200 + k + 40 + k, 'both blog paths summed into one column');
    assert.equal(d.values.views_home, 300 + k);
    assert.ok(s.calls.filter((c) => c.dimensions.length === 2).length > 1, 'the daily section report was paged at the 100-row cap');
    assert.match(said.join(''), /sections views_home, views_blog, views_p/);

    // An earlier CSV's columns are kept: no new top-sections request, and a section column survives at zero.
    s.calls.length = 0;
    const later = Date.parse('2026-06-25T18:00:00Z');
    assert.equal(await main(['--property', '123456789', '--out', outPath, '--sections', '3'], { env: s.env, now: () => later, out: quiet, err: quiet }), 0);
    assert.equal(s.calls.filter((c) => c.dimensions.map((x) => x.name).join() === 'pagePathLevel1').length, 0);
    assert.equal(readFileSync(outPath, 'utf8').split('\n')[0], ['date', ...cols].join(','));
  } finally { await s.close(); }
});

test('a section that goes dark keeps its column at zero on later runs; dropping --sections fetches afresh', async () => {
  const s = await standIn({ helpDarkOn: '2026-06-10' });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ga4-sec-'));
    const outPath = join(dir, 'ga4.csv');
    // Written before the loss with help among the top 4.
    assert.equal(await main(['--property', '123456789', '--out', outPath, '--days', '60', '--sections', '4'], { env: s.env, now: () => Date.parse('2026-06-05T18:00:00Z'), out: quiet, err: quiet }), 0);
    assert.match(readFileSync(outPath, 'utf8').split('\n')[0], /views_help$/);
    assert.equal(await main(['--property', '123456789', '--out', outPath, '--sections', '4'], { env: s.env, now: () => NOW, out: quiet, err: quiet }), 0);
    const cols = [...DEFAULT_METRICS, 'views_home', 'views_blog', 'views_p', 'views_help'];
    const got = readExisting(readFileSync(outPath, 'utf8'), cols);
    assert.equal(got.find((r) => r.date === '2026-06-15').values.views_help, 0);
    assert.ok(got.find((r) => r.date === '2026-06-01').values.views_help >= 60);
    const errs = [];
    assert.equal(await main(['--property', '123456789', '--out', outPath], { env: s.env, now: () => NOW, out: quiet, err: (t) => errs.push(t) }), 0);
    assert.match(errs.join(''), /other columns than this run writes; fetching 480 days afresh/);
  } finally { await s.close(); }
});

test('--sections is refused with --from-export and past 10', async () => {
  await assert.rejects(main(['--from-export', 'x.csv', '--out', 'y.csv', '--sections', '3'], { out: quiet, err: quiet }), /needs the Data API/);
  await assert.rejects(main(['--property', '123456789', '--out', 'y.csv', '--sections', '11'], { out: quiet, err: quiet }), /1 to 10/);
});

test('the dark rule: three days under a tenth of the 28 before; rises, small sections and weekends never trip it', () => {
  const flat = (n, v) => Array(n).fill(v);
  assert.deepEqual(darkRuns([...flat(40, 50), 0, 0, 0, 0, 0, 50, 50]), [{ start: 40, end: 44 }], 'dark, then back');
  assert.deepEqual(darkRuns([...flat(40, 50), 0, 0]), [], 'two days is not yet three');
  assert.deepEqual(darkRuns([...flat(40, 50), 4, 4, 4]), [{ start: 40, end: 42 }], 'under 5 (a tenth of 50) counts as dark');
  assert.deepEqual(darkRuns([...flat(40, 50), 6, 6, 6, 6]), []);
  assert.deepEqual(darkRuns([...flat(40, 10), 0, 0, 0, 0]), [], 'under 20 a day before is too small to call');
  assert.deepEqual(darkRuns([...flat(40, 50), 900, 400, 200, 100]), [], 'a post that takes off');
  const week = Array.from({ length: 120 }, (_, i) => (i % 7 >= 5 ? 12 : 60));
  assert.deepEqual(darkRuns(week), [], 'weekends at a fifth of weekdays');
});

test('on simulated sites: a help template gone dark is called within days, and a healthy site with viral days is not', () => {
  const rows = (days) => days.map((d) => ({ date: d.date, values: Object.fromEntries(SECTIONS.map((x) => [`views_${x}`, d.views[x]])) }));
  const hit = site({ wk: 0.4, dark: 'help', seed: 20001 });
  const cols = topSections(hit, 5, OFF).map((x) => `views_${x}`);
  assert.ok(cols.includes('views_help'));
  const found = darkSections(rows(hit), cols);
  assert.equal(found.length, 1);
  assert.equal(found[0].column, 'views_help');
  assert.equal(found[0].start, OFF);
  assert.ok(found[0].stillDark);
  for (const seed of [20002, 20003, 20004]) {
    const ok = site({ wk: 0.5, seed });
    assert.deepEqual(darkSections(rows(ok), topSections(ok, 5, OFF).map((x) => `views_${x}`)), []);
  }
});

test('the dark-section CLI reports a stretch once, keeps state, posts to a webhook and fails the run on request', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dark-'));
  const csv = join(dir, 'ga4.csv'), state = join(dir, 'dark-state.json');
  const days = site({ wk: 0.5, dark: 'help', seed: 20005 }).filter((d) => d.date <= '2026-03-25');
  const all = [...BASE, ...SECTIONS.map((x) => `views_${x}`)];
  writeFileSync(csv, toCsv(days.map((d) => ({ date: d.date, values: { ...Object.fromEntries(BASE.map((c) => [c, d[c]])), ...Object.fromEntries(SECTIONS.map((x) => [`views_${x}`, d.views[x]])) } })), all));
  const said = [], posts = [];
  const fetchImpl = async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  assert.equal(await darkMain([csv, '--state', state, '--webhook-env', 'HOOK', '--fail-on-alert'], { env: { HOOK: 'https://hooks.example/x' }, out: (t) => said.push(t), fetchImpl }), 1);
  assert.match(said.join(''), /views_help: page views near zero since 2026-03-16 \(about \d+ a day before\)/);
  assert.equal(posts.length, 1);
  assert.match(posts[0].body.text, /views_help/);
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')).reported, ['views_help@2026-03-16']);
  said.length = 0;
  assert.equal(await darkMain([csv, '--state', state, '--fail-on-alert'], { out: (t) => said.push(t) }), 0, 'reported once');
  assert.match(said.join(''), /no section dark \(6 checked/);
  await assert.rejects(darkMain([csv, '--columns', 'views_nope'], { out: quiet }), /no column views_nope/);
  await assert.rejects(darkMain([csv, '--frac', '2'], { out: quiet }), /under 1/);
});

test('the self-deploy workflow fetches --sections 5 by default and reports a section gone dark once', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const s = await standIn({ helpDarkOn: addDays(today, -6), today });
  try {
    const root = mkdtempSync(join(tmpdir(), 'ga4-dark-wf-')), dev = join(root, 'dev'), remote = join(root, 'remote.git');
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
    assert.ok(existsSync(join(dev, 'dark-sections.mjs')));
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(dev, 'init', '-q', '-b', 'main');
    git(dev, 'add', '.');
    git(dev, 'commit', '-qm', 'watch analytics');
    git(dev, 'remote', 'add', 'origin', `file://${remote}`);
    git(dev, 'push', '-q', '-u', 'origin', 'main');
    const run = () => runInChild({ workflow: join(dev, '.github/workflows/watch-metric.yml'), remote, vars: { GA4_PROPERTY: '123456789' }, secrets: { GA4_SERVICE_ACCOUNT_JSON: '{"unused":1}' }, env: s.env });
    const first = await run();
    const fetchStep = first.steps.find((x) => x.name === 'Fetch Google Analytics metrics');
    assert.match(fetchStep.stdout, /sections views_home, views_blog, views_p, views_help/);
    const watchStep = first.steps.find((x) => /node watch\.mjs/.test(x.run ?? '') || /views_help: page views near zero/.test(x.stdout ?? ''));
    assert.ok(watchStep, JSON.stringify(first.steps.map((x) => [x.name, x.code])));
    assert.match(watchStep.stdout, /views_help: page views near zero since /);
    assert.equal(first.ok, false, 'with no webhook a new report fails the run, so GitHub emails the owner');
    git(dev, 'pull', '-q', '--rebase');
    assert.equal(JSON.parse(readFileSync(join(dev, 'dark-state.json'), 'utf8')).reported.length, 1);
    const second = await run();
    const again = second.steps.find((x) => x.name === watchStep.name);
    assert.doesNotMatch(again.stdout, /views_help: page views near zero/);
    assert.match(again.stdout, /no section dark \(4 checked/);
  } finally { await s.close(); }
});

function runInChild(args) {
  return new Promise((ok, bad) => {
    const code = `import { runWorkflow } from ${JSON.stringify(new URL('./deploy/run-workflow.mjs', import.meta.url).href)};
      const r = runWorkflow(${JSON.stringify(args)}); process.stdout.write(JSON.stringify({ ok: r.ok, steps: r.steps }));`;
    execFile(process.execPath, ['--input-type=module', '-e', code], { maxBuffer: 64 << 20 }, (e, stdout, stderr) => {
      if (e) return bad(new Error(`${e.message}\n${stderr}`));
      ok(JSON.parse(stdout));
    });
  });
}
