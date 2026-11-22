// plausible-metrics.mjs against a stand-in for Plausible's Stats API v2 (the documented shape: POST /api/v2/query with
// a Bearer key and { site_id, metrics, date_range, dimensions: ["time:day"], filters, pagination }, answering
// { results: [{ dimensions: ["YYYY-MM-DD"], metrics: [...] }], meta, query }; days with no visit are left out), then
// through the watch and the self-deploy workflow. Nothing here talks to Plausible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, baseUrl, siteId, parseMetrics, goalColumn, DEFAULT_METRICS } from './plausible-metrics.mjs';
import { readExisting, toCsv, fillDays } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const quiet = () => {};
const KEY = 'plausible-test-key-0123456789';

// A site: ~400 visitors a day (weekends 50%), visits 1.2 per visitor, 2.2 page views per visit; goal Signup on 2% of
// visitors, Purchase on 0.5%. From `tagOff` visitors fall to `tagShare` (the script left out of a new page template);
// from `formOff` sign-ups fall to `formShare` (a form that stopped sending its goal). Days in `empty` have no row.
function site({ from, to, tagOff = null, tagShare = 1, formOff = null, formShare = 1, empty = [], seed = 7 }) {
  const u = lcg(seed), days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const visitors = poisson(u, 400 * (dow === 0 || dow === 6 ? 0.5 : 1) * (tagOff && d >= tagOff ? tagShare : 1));
    const visits = poisson(u, visitors * 1.2), pageviews = poisson(u, visits * 2.2);
    const Signup = poisson(u, visitors * 0.02 * (formOff && d >= formOff ? formShare : 1)), Purchase = poisson(u, visitors * 0.005);
    days.push({ date: d, visitors, visits, pageviews, events: pageviews + Signup + Purchase, bounce_rate: 41.5, Signup, Purchase });
  }
  return days;
}

function standIn(days, { pageCap = 10000, status = 200, error = null } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const body = JSON.parse(raw);
      calls.push({ url: req.url, auth: req.headers.authorization, body });
      if (req.url !== '/api/v2/query') return send(404, { error: 'Not found' });
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'Invalid API key or site ID. Please make sure you\'re using a valid API key with access to the site you\'ve requested.' });
      if (status !== 200) return send(status, { error });
      if (body.site_id !== 'example.com') return send(400, { error: `Site '${body.site_id}' not found.` });
      const goal = body.filters?.find((f) => f[1] === 'event:goal')?.[2]?.[0];
      if (goal && !['Signup', 'Purchase'].includes(goal)) return send(400, { error: `Invalid filters. The goal \`${goal}\` is not configured for this site.` });
      const [a, b] = body.date_range;
      const all = days.filter((r) => r.date >= a && r.date <= b)
        .map((r) => ({ dimensions: [r.date], metrics: body.metrics.map((m) => (goal ? r[goal] : r[m])) }))
        .filter((x) => x.metrics.some((v) => v > 0)); // Plausible leaves out a day with nothing to count
      const { limit, offset } = body.pagination;
      send(200, { results: all.slice(offset, offset + Math.min(limit, pageCap)), meta: {}, query: { ...body, site_id: body.site_id } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, env: { PLAUSIBLE_URL: base, PLAUSIBLE_API_KEY: KEY }, close: () => new Promise((r) => server.close(r)) });
  }));
}

const NOW = Date.parse('2026-06-20T18:00:00Z');
const TODAY = '2026-06-20';

test('sites, metrics, goal columns and the base address are read strictly', () => {
  assert.equal(siteId('Example.com'), 'example.com');
  assert.equal(siteId('https://example.com/'), 'example.com');
  assert.equal(siteId('shop.example.co.uk'), 'shop.example.co.uk');
  assert.throws(() => siteId('example'), /not a Plausible site/);
  assert.throws(() => siteId('exa mple.com'), /not a Plausible site/);
  assert.deepEqual(parseMetrics('visitors, events'), ['visitors', 'events']);
  assert.throws(() => parseMetrics('conversion_rate'), /needs a goal.*--goal/);
  assert.throws(() => parseMetrics('sessions'), /not one of/);
  assert.throws(() => parseMetrics('visitors,visitors'), /twice/);
  assert.equal(goalColumn('Signup'), 'goal_signup');
  assert.equal(goalColumn('Visit /thanks'), 'goal_visit_thanks');
  assert.equal(goalColumn('Outbound Link: Click'), 'goal_outbound_link_click');
  assert.throws(() => goalColumn('///'), /no Latin letters or digits/);
  // Red team 2026-11-22: accents were split into an underscore (goal_re_servation).
  assert.equal(goalColumn('Réservation'), 'goal_reservation');
  assert.equal(goalColumn('Anmeldung bestätigt'), 'goal_anmeldung_bestatigt');
  assert.throws(() => goalColumn('注册'), /no Latin letters or digits/);
  assert.equal(baseUrl({}), 'https://plausible.io');
  assert.equal(baseUrl({ PLAUSIBLE_URL: 'https://stats.example.com/' }), 'https://stats.example.com');
  assert.equal(baseUrl({ PLAUSIBLE_URL: 'https://example.com/plausible' }), 'https://example.com/plausible');
  assert.throws(() => baseUrl({ PLAUSIBLE_URL: 'http://stats.example.com' }), /https/);
  assert.throws(() => baseUrl({ PLAUSIBLE_URL: 'https://u:p@stats.example.com' }), /address only/);
  assert.equal(baseUrl({ PLAUSIBLE_URL: 'http://127.0.0.1:8000' }), 'http://127.0.0.1:8000');
});

test('fetches days with the key, pages, fills empty days with zeros, adds goal columns, then extends', async () => {
  const days = site({ from: '2025-01-01', to: TODAY, empty: ['2026-03-03'] });
  const s = await standIn(days, { pageCap: 50 });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'plausible-'));
    const outPath = join(dir, 'data', 'plausible.csv');
    const said = [];
    assert.equal(await main(['--site', 'example.com', '--out', outPath, '--days', '120', '--goal', 'Signup', '--goal', 'Purchase'], { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    const main1 = s.calls.filter((c) => !c.body.filters);
    assert.equal(main1.length, 3, 'paged at the stand-in\'s 50-row cap: 119 days with visits in 3 pages');
    assert.equal(main1[0].auth, `Bearer ${KEY}`);
    assert.deepEqual(main1[0].body.date_range, ['2026-02-20', '2026-06-19']);
    assert.deepEqual(main1[0].body.dimensions, ['time:day']);
    assert.deepEqual(main1[0].body.metrics, DEFAULT_METRICS);
    assert.deepEqual(main1.map((c) => c.body.pagination.offset), [0, 50, 100]);
    const goals = s.calls.filter((c) => c.body.filters);
    assert.deepEqual(goals[0].body.filters, [['is', 'event:goal', ['Signup']]]);
    assert.deepEqual(goals[0].body.metrics, ['events']);
    const cols = [...DEFAULT_METRICS, 'goal_signup', 'goal_purchase'];
    const text = readFileSync(outPath, 'utf8');
    assert.match(text, /^date,visitors,visits,pageviews,goal_signup,goal_purchase\n/);
    const got = readExisting(text, cols);
    assert.equal(got.length, 120);
    assert.equal(got[0].date, '2026-02-20');
    assert.equal(got.at(-1).date, '2026-06-19');
    assert.deepEqual(got.find((r) => r.date === '2026-03-03').values, { visitors: 0, visits: 0, pageviews: 0, goal_signup: 0, goal_purchase: 0 });
    const one = got.find((r) => r.date === '2026-03-04'), src = days.find((r) => r.date === '2026-03-04');
    assert.deepEqual(one.values, { visitors: src.visitors, visits: src.visits, pageviews: src.pageviews, goal_signup: src.Signup, goal_purchase: src.Purchase });
    assert.match(said.join(''), /120 days to 2026-06-19/);

    // Three days later: the last 2 days are asked for again, the rest kept byte for byte.
    s.calls.length = 0;
    const before = text.split('\n');
    assert.equal(await main(['--site', 'example.com', '--out', outPath, '--goal', 'Signup', '--goal', 'Purchase'], { env: s.env, now: () => NOW + 3 * 86400000, out: quiet, err: quiet }), 0);
    assert.deepEqual(s.calls[0].body.date_range, ['2026-06-18', '2026-06-22']);
    const after = readFileSync(outPath, 'utf8').split('\n');
    assert.deepEqual(after.slice(0, 119), before.slice(0, 119));
    const got2 = readExisting(after.join('\n'), cols);
    assert.equal(got2.at(-1).date, '2026-06-22');
    // The stand-in has no data after 2026-06-20: Plausible counts live, so those days are written as zeros.
    assert.deepEqual(got2.at(-1).values, { visitors: 0, visits: 0, pageviews: 0, goal_signup: 0, goal_purchase: 0 });
  } finally { await s.close(); }
});

test('other columns refetch afresh; --imports and --lag reach the query; an all-empty fetch is flagged', async () => {
  const s = await standIn(site({ from: '2026-04-01', to: TODAY }));
  try {
    const outPath = join(mkdtempSync(join(tmpdir(), 'plausible-')), 'p.csv');
    writeFileSync(outPath, 'date,visitors\n2026-05-01,3\n');
    const warn = [];
    await main(['--site', 'example.com', '--out', outPath, '--days', '30', '--lag', '2', '--metrics', 'visitors,bounce_rate', '--imports'], { env: s.env, now: () => NOW, out: quiet, err: (t) => warn.push(t) });
    assert.match(warn.join(''), /other columns than this run writes/);
    assert.deepEqual(s.calls[0].body.include, { imports: true });
    assert.deepEqual(s.calls[0].body.date_range, ['2026-05-20', '2026-06-18']);
    assert.match(readFileSync(outPath, 'utf8'), /^date,visitors,bounce_rate\n2026-05-20,\d+,41\.5\n/);

    const later = [];
    await main(['--site', 'example.com', '--out', join(mkdtempSync(join(tmpdir(), 'plausible-')), 'q.csv'), '--days', '30'], { env: s.env, now: () => NOW + 60 * 86400000, out: quiet, err: (t) => later.push(t) });
    assert.match(later.join(''), /every day fetched is empty/);
  } finally { await s.close(); }
});

test('clear errors: a refused key, an unknown site, an unknown goal, no plan, no key, no site', async () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'plausible-')), 'p.csv');
  const s = await standIn(site({ from: '2026-04-01', to: TODAY }));
  try {
    const run = (args, env = s.env) => main(args, { env, now: () => NOW, out: quiet, err: quiet });
    await assert.rejects(run(['--site', 'example.com', '--out', outPath], { ...s.env, PLAUSIBLE_API_KEY: 'wrong' }), /refused the API key \(401\).*Stats API key/);
    await assert.rejects(run(['--site', 'other.com', '--out', outPath]), /refused the query \(400\): Site 'other.com' not found.*--site/);
    await assert.rejects(run(['--site', 'example.com', '--out', outPath, '--goal', 'Sign up']), /refused the goal \(400\).*Site settings > Goals/);
    await assert.rejects(run(['--site', 'example.com', '--out', outPath], { PLAUSIBLE_URL: s.env.PLAUSIBLE_URL }), /Set PLAUSIBLE_API_KEY/);
    await assert.rejects(run(['--out', outPath]), /Give --site/);
    await assert.rejects(run(['--site', 'example.com', '--out', outPath, '--goal', 'A', '--goal', 'a']), /same goal twice/);
    await assert.rejects(run(['--site', 'example.com', '--out', outPath, '--goal', '1', '--goal', '2', '--goal', '3', '--goal', '4', '--goal', '5', '--goal', '6']), /at most 5 goals/);
  } finally { await s.close(); }
  const p = await standIn([], { status: 402, error: 'The account that owns this API key does not have access to Stats API.' });
  try {
    await assert.rejects(main(['--site', 'example.com', '--out', outPath], { env: p.env, now: () => NOW, out: quiet, err: quiet }), /402.*not on this account's plan/);
  } finally { await p.close(); }
});

test('a tag left off a new page template and a sign-up form that stops sending its goal: the watch hears both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plausible-'));
  const days = site({ from: '2025-09-01', to: '2026-04-30', tagOff: '2026-03-16', tagShare: 0.6, formOff: '2026-01-12', formShare: 0.35, seed: 3 });
  const cols = ['visitors', 'pageviews', 'goal_signup'];
  const rows = fillDays(days.map((r) => ({ date: r.date, values: { visitors: r.visitors, pageviews: r.pageviews, goal_signup: r.Signup } })), cols, '2025-09-01', '2026-04-30');
  const csvPath = join(dir, 'plausible.csv');
  writeFileSync(csvPath, toCsv(rows, cols));
  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', 'visitors:poisson,pageviews:poisson,goal_signup:poisson'], { out: (t) => said.push(t), err: quiet });
  const text = said.join('');
  assert.match(text, /visitors[\s\S]*2026-03-1[4-8]/);
  assert.match(text, /goal_signup[\s\S]*2026-01-(0[89]|1[0-6])/);
  assert.equal((text.match(/Changes on record: 1\./g) ?? []).length, 3, 'one change per column, no false ones');
});

test('the self-deploy workflow fetches Plausible metrics with goals, watches visitors, page views and goals, never commits the CSV', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const s = await standIn(site({ from: addDays(today, -500), to: today }));
  try {
    const root = mkdtempSync(join(tmpdir(), 'plausible-wf-')), dev = join(root, 'dev'), remote = join(root, 'remote.git');
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
    assert.ok(existsSync(join(dev, 'plausible-metrics.mjs')));
    assert.match(readFileSync(join(dev, '.gitignore'), 'utf8'), /^data\/plausible\.csv$/m);
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(dev, 'init', '-q', '-b', 'main');
    git(dev, 'add', '.');
    git(dev, 'commit', '-qm', 'watch plausible');
    git(dev, 'remote', 'add', 'origin', `file://${remote}`);
    git(dev, 'push', '-q', '-u', 'origin', 'main');
    const { PLAUSIBLE_API_KEY, PLAUSIBLE_URL } = s.env;
    const result = await runInChild({ workflow: join(dev, '.github/workflows/watch-metric.yml'), remote, vars: { PLAUSIBLE_SITE: 'example.com', PLAUSIBLE_URL, PLAUSIBLE_OPTIONS: '--goal Signup --goal "Purchase"' }, secrets: { PLAUSIBLE_API_KEY }, env: {} });
    assert.ok(result.ok, JSON.stringify(result.steps.map((x) => [x.name, x.code, x.stderr]), null, 1));
    const fetchStep = result.steps.find((x) => x.name === 'Fetch Plausible metrics');
    assert.match(fetchStep.stdout, /data\/plausible\.csv: 480 days to /);
    assert.ok(!JSON.stringify(result.steps).includes(KEY), 'the key is never printed');
    git(dev, 'pull', '-q', '--rebase');
    const st = JSON.parse(readFileSync(join(dev, 'watch-state.json'), 'utf8'));
    assert.deepEqual(Object.keys(st.columns ?? st).filter((k) => ['visitors', 'pageviews', 'goal_signup', 'goal_purchase', 'visits'].includes(k)).sort(), ['goal_purchase', 'goal_signup', 'pageviews', 'visitors']);
    assert.equal(git(dev, 'ls-files', 'data/plausible.csv').trim(), '', 'the CSV is not committed');
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
