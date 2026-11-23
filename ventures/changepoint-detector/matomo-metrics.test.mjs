// matomo-metrics.mjs against a stand-in for Matomo's Reporting API (POST index.php, module=API, format=JSON, the
// token in the form body; period=day with date=A,B answers { "YYYY-MM-DD": row | [] }; errors are HTTP 200 with
// { result: "error", message }), then through the watch and the self-deploy workflow. Nothing here talks to Matomo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, endpoint, siteId, goalId, eventColumn, todayIn, fetchDays } from './matomo-metrics.mjs';
import { toCsv, fillDays } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const quiet = () => {};
const TOKEN = '0123456789abcdef0123456789abcdef';

// A site: ~400 visits a weekday (weekends half), 2.2 page views each; goal 2 converts 2% of visits; event actions
// "Sign up" (1%) and "Download" (3 a day). From `pvOff` page views fall to `pvShare` (tracking code dropped from part
// of the site); from `gOff` goal 2 falls to `gShare`. Days in `empty` have nothing.
function site({ from, to, pvOff = null, pvShare = 1, gOff = null, gShare = 1, empty = [], seed = 13 }) {
  const u = lcg(seed), days = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const all = poisson(u, 400 * (dow === 0 || dow === 6 ? 0.5 : 1));
    const share = pvOff && d >= pvOff ? pvShare : 1;
    const visits = poisson(u, all * (1 - Math.exp(-2.2 * share)));
    days.set(d, { visits, uniq: Math.round(visits * 0.9), pageviews: poisson(u, all * 2.2 * share), goal2: poisson(u, all * 0.02 * (gOff && d >= gOff ? gShare : 1)), events: { 'Sign up': poisson(u, all * 0.01), Download: 3 } });
  }
  return days;
}

function standIn(days, { idSite = '1', timezone = 'UTC', error = null, status = 200, noUniq = false } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const u = new URL(req.url, 'http://x');
      const f = Object.fromEntries(new URLSearchParams(raw));
      calls.push({ path: u.pathname, query: u.search, method: req.method, form: f });
      if (u.pathname !== '/analytics/index.php') return send(404, {});
      if (status !== 200) return send(status, {});
      if (f.token_auth !== TOKEN) return send(200, { result: 'error', message: "You can't access this resource as it requires 'view' access for the website id = 1." });
      if (error) return send(200, { result: 'error', message: error });
      if (f.idSite !== idSite) return send(200, { result: 'error', message: `An unexpected website was found in the request: website id was set to '${f.idSite}' .` });
      if (f.method === 'SitesManager.getSiteFromId') return send(200, { idsite: idSite, name: 'Example shop', timezone });
      const [a, b] = String(f.date).split(',');
      if (f.period !== 'day' || !a || !b) return send(200, { result: 'error', message: 'bad period' });
      const out = {};
      for (let d = a; d <= b; d = addDays(d, 1)) {
        const r = days.get(d);
        if (f.method === 'VisitsSummary.get') out[d] = r ? (noUniq ? { nb_visits: r.visits, nb_actions: r.pageviews } : { nb_visits: r.visits, nb_uniq_visitors: r.uniq, nb_actions: r.pageviews }) : [];
        else if (f.method === 'Actions.get') out[d] = r ? { nb_pageviews: r.pageviews, nb_uniq_pageviews: r.visits } : [];
        else if (f.method === 'Goals.get') out[d] = r && f.idGoal === '2' ? { nb_conversions: r.goal2, revenue: 0 } : [];
        else if (f.method === 'Events.getAction') out[d] = r ? Object.entries(r.events).map(([label, n]) => ({ label, nb_events: n, nb_visits: n })) : [];
        else return send(200, { result: 'error', message: `The method '${f.method}' does not exist or is not available in the module 'API'.` });
      }
      send(200, out);
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => {
    const MATOMO_URL = `http://127.0.0.1:${server.address().port}/analytics`;
    ok({ calls, env: { MATOMO_URL, MATOMO_TOKEN: TOKEN }, close: () => new Promise((r) => server.close(r)) });
  }));
}

test('addresses, site IDs, goal IDs, columns and site time zones are read strictly', () => {
  assert.equal(endpoint({ MATOMO_URL: 'https://matomo.example.com' }), 'https://matomo.example.com/index.php');
  assert.equal(endpoint({ MATOMO_URL: 'https://example.com/stats/' }), 'https://example.com/stats/index.php');
  assert.equal(endpoint({ MATOMO_URL: 'https://shop.matomo.cloud/index.php?module=CoreHome&action=index&idSite=1' }), 'https://shop.matomo.cloud/index.php');
  assert.equal(endpoint({ MATOMO_URL: 'http://localhost:8080' }), 'http://localhost:8080/index.php');
  assert.throws(() => endpoint({ MATOMO_URL: 'http://matomo.example.com' }), /https/);
  assert.throws(() => endpoint({ MATOMO_URL: 'https://u:p@matomo.example.com' }), /no user/);
  assert.throws(() => endpoint({}), /Set MATOMO_URL/);
  assert.throws(() => endpoint({ MATOMO_URL: 'matomo' }), /not a URL/);
  assert.equal(siteId('3'), '3');
  assert.equal(siteId('https://m.example.com/index.php?module=CoreHome&action=index&idSite=12&period=day&date=yesterday#?idSite=12'), '12');
  assert.throws(() => siteId('0'), /site ID/);
  assert.throws(() => siteId('example.com'), /site ID/);
  assert.equal(goalId('02'), '2');
  assert.throws(() => goalId('signup'), /goal ID/);
  assert.equal(eventColumn('Sign up'), 'event_sign_up');
  assert.equal(eventColumn('Téléchargement PDF'), 'event_telechargement_pdf');
  assert.throws(() => eventColumn('!!'), /no Latin letters/);
  const t = Date.parse('2026-06-01T22:30:00Z');
  assert.equal(todayIn(t, 'UTC'), '2026-06-01');
  assert.equal(todayIn(t, 'Europe/Berlin'), '2026-06-02');
  assert.equal(todayIn(t, 'UTC+5.5'), '2026-06-02');
  assert.equal(todayIn(t, 'UTC-3'), '2026-06-01');
  assert.equal(todayIn(t, 'Not/AZone'), '2026-06-01');
});

test('fetches by 180-day windows with the token in a POST body, fills empty days with zeros, goal and event columns, then extends', async () => {
  const days = site({ from: '2025-01-01', to: '2026-06-30', empty: ['2026-05-10', '2026-05-11'] });
  const m = await standIn(days, { timezone: 'Pacific/Auckland' });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'matomo-'));
    const csv = join(dir, 'data', 'matomo.csv');
    const said = [], errs = [];
    // 2026-06-20 13:00 UTC is already 2026-06-21 in Auckland, so yesterday there is 2026-06-20.
    const now = () => Date.parse('2026-06-20T13:00:00Z');
    await main(['--site', '1', '--goal', '2', '--event', 'Sign up', '--days', '400', '--out', csv], { env: m.env, out: (t) => said.push(t), err: (t) => errs.push(t), fetchImpl: fetch, now, sleep: async () => {} });
    for (const c of m.calls) {
      assert.equal(c.method, 'POST');
      assert.equal(c.query, '', 'nothing in the URL: the token stays out of server logs');
      assert.equal(c.form.module, 'API');
      assert.equal(c.form.format, 'JSON');
    }
    const ranges = [...new Set(m.calls.filter((c) => c.form.method === 'VisitsSummary.get').map((c) => c.form.date))];
    assert.deepEqual(ranges, ['2025-05-17,2025-11-12', '2025-11-13,2026-05-11', '2026-05-12,2026-06-20']);
    assert.ok(m.calls.every((c) => c.form.method !== 'Goals.get' || c.form.idGoal === '2'));
    assert.ok(m.calls.filter((c) => c.form.method === 'Events.getAction').every((c) => c.form.flat === '1' && c.form.filter_limit === '-1'));
    const text = readFileSync(csv, 'utf8').trim().split('\n');
    assert.equal(text[0], 'date,visits,visitors,pageviews,goal_2,event_sign_up');
    assert.equal(text.length, 401);
    assert.equal(text[400].slice(0, 10), '2026-06-20');
    const row = (d) => text.find((l) => l.startsWith(d)).split(',');
    assert.deepEqual(row('2026-05-10').slice(1), ['0', '0', '0', '0', '0']);
    const r = days.get('2026-04-01');
    assert.deepEqual(row('2026-04-01').slice(1).map(Number), [r.visits, r.uniq, r.pageviews, r.goal2, r.events['Sign up']]);
    assert.match(said.join(''), /400 days to 2026-06-20 \(400 fetched, \d+ visits\), site 1 \(Example shop\), days in Pacific\/Auckland/);
    assert.match(said.join(''), /Event actions in the days fetched: "Download" \d+, "Sign up" \d+|"Sign up" \d+, "Download" \d+/);
    assert.equal(errs.join(''), '');

    // A day later: the last two days (06-19, 06-20) are fetched again and one new day added; the rest kept.
    m.calls.length = 0;
    await main(['--site', '1', '--goal', '2', '--event', 'Sign up', '--out', csv], { env: m.env, out: quiet, err: quiet, fetchImpl: fetch, now: () => Date.parse('2026-06-21T13:00:00Z'), sleep: async () => {} });
    assert.deepEqual([...new Set(m.calls.filter((c) => c.form.method === 'VisitsSummary.get').map((c) => c.form.date))], ['2026-06-19,2026-06-21']);
    const after = readFileSync(csv, 'utf8').trim().split('\n');
    assert.equal(after.length, 402);
    assert.deepEqual(after.slice(0, 399), text.slice(0, 399));
  } finally { await m.close(); }
});

test('notes: no unique-visitor count, an empty site, a goal that never converts, an event action never seen', async () => {
  const m = await standIn(site({ from: '2026-01-01', to: '2026-03-31' }), { noUniq: true });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'matomo-'));
    const errs = [];
    await main(['--site', '1', '--goal', '5', '--event', 'signup', '--days', '60', '--out', join(dir, 'a.csv')], { env: m.env, out: quiet, err: (t) => errs.push(t), fetchImpl: fetch, now: () => Date.parse('2026-03-20T12:00:00Z'), sleep: async () => {} });
    const e = errs.join('');
    assert.match(e, /60 day\(s\) had visits but no unique-visitor count/);
    assert.match(e, /goal 5 has no conversions in 60 days/);
    assert.match(e, /event action "signup" has no rows in 60 days; actions are case-sensitive/);
  } finally { await m.close(); }
  const empty = await standIn(new Map());
  try {
    const errs = [];
    await main(['--site', '1', '--days', '30', '--out', join(mkdtempSync(join(tmpdir(), 'matomo-')), 'b.csv')], { env: empty.env, out: quiet, err: (t) => errs.push(t), fetchImpl: fetch, now: () => Date.parse('2026-03-20T12:00:00Z'), sleep: async () => {} });
    assert.match(errs.join(''), /every day fetched is empty/);
  } finally { await empty.close(); }
});

test('clear errors: a refused token, an unknown site, a wrong address, a non-JSON answer, missing settings, too many goals', async () => {
  const m = await standIn(site({ from: '2026-01-01', to: '2026-02-01' }));
  const run = (argv, env = m.env) => main(argv, { env, out: quiet, err: quiet, fetchImpl: fetch, now: () => Date.parse('2026-02-01T12:00:00Z'), sleep: async () => {} });
  const out = join(mkdtempSync(join(tmpdir(), 'matomo-')), 'c.csv');
  try {
    await assert.rejects(run(['--site', '1', '--out', out], { ...m.env, MATOMO_TOKEN: 'wrong' }), /Matomo refused SitesManager\.getSiteFromId: You can't access this resource[\s\S]*Auth tokens/);
    await assert.rejects(run(['--site', '7', '--out', out]), /Matomo answered 200 to SitesManager\.getSiteFromId: An unexpected website/);
    await assert.rejects(run(['--site', '1', '--out', out], { ...m.env, MATOMO_URL: m.env.MATOMO_URL.replace('/analytics', '/elsewhere') }), /404[\s\S]*Check MATOMO_URL/);
    await assert.rejects(run(['--site', '1', '--out', out], { MATOMO_URL: m.env.MATOMO_URL }), /Set MATOMO_TOKEN/);
    await assert.rejects(run(['--out', out]), /Give --site/);
    await assert.rejects(run(['--site', '1']), /Give --out/);
    await assert.rejects(run(['--site', '1', '--goal', '2', '--goal', '2', '--out', out]), /same goal twice/);
    await assert.rejects(run(['--site', '1', ...Array.from({ length: 9 }, (_, i) => ['--goal', String(i + 1)]).flat(), '--out', out]), /at most 8 goals/);
    await assert.rejects(run(['--site', '1', '--event', 'Sign up', '--event', 'sign-up', '--out', out]), /same action twice/);
    await assert.rejects(run(['--site', '1', '--bogus', '--out', out]), /Unknown option --bogus/);
  } finally { await m.close(); }
  const notJson = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>login</html>'); });
  await new Promise((r) => notJson.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(run(['--site', '1', '--out', out], { MATOMO_URL: `http://127.0.0.1:${notJson.address().port}`, MATOMO_TOKEN: TOKEN }), /was not JSON/);
  } finally { await new Promise((r) => notJson.close(r)); }
  const odd = await standIn(site({ from: '2026-01-01', to: '2026-02-01' }));
  try {
    const monthly = async (url, init) => (new URLSearchParams(init.body).get('method') === 'VisitsSummary.get' ? new Response(JSON.stringify({ '2026-01': { nb_visits: 3 } }), { status: 200 }) : fetch(url, init));
    await assert.rejects(fetchDays({ url: `${odd.env.MATOMO_URL}/index.php`, token: TOKEN, site: '1', from: '2026-01-01', to: '2026-01-31', fetchImpl: monthly, sleep: async () => {} }), /answered VisitsSummary\.get by "2026-01", not by the day/);
  } finally { await odd.close(); }
});

test('tracking code dropped from part of the site and a goal that stopped converting: the watch hears both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'matomo-'));
  const days = site({ from: '2025-09-01', to: '2026-04-30', pvOff: '2026-03-16', pvShare: 0.6, gOff: '2026-01-12', gShare: 0.35, seed: 5 });
  const cols = ['visits', 'pageviews', 'goal_2'];
  const rows = fillDays([...days].map(([date, r]) => ({ date, values: { visits: r.visits, pageviews: r.pageviews, goal_2: r.goal2 } })), cols, '2025-09-01', '2026-04-30');
  const csvPath = join(dir, 'matomo.csv');
  writeFileSync(csvPath, toCsv(rows, cols));
  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', 'visits:poisson,pageviews:poisson,goal_2:poisson'], { out: (t) => said.push(t), err: quiet });
  const text = said.join('');
  assert.match(text, /pageviews[\s\S]*2026-03-1[4-9]/);
  assert.match(text, /goal_2[\s\S]*2026-01-(0[89]|1[0-9])/);
});

test('the self-deploy workflow fetches Matomo, watches visits, page views, each goal and event, never commits the CSV', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const s = await standIn(site({ from: addDays(today, -500), to: today }));
  try {
    const root = mkdtempSync(join(tmpdir(), 'matomo-wf-')), dev = join(root, 'dev'), remote = join(root, 'remote.git');
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
    assert.ok(existsSync(join(dev, 'matomo-metrics.mjs')));
    assert.match(readFileSync(join(dev, '.gitignore'), 'utf8'), /^data\/matomo\.csv$/m);
    assert.match(readFileSync(join(dev, 'README.md'), 'utf8'), /MATOMO_TOKEN/);
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(dev, 'init', '-q', '-b', 'main');
    git(dev, 'add', '.');
    git(dev, 'commit', '-qm', 'watch matomo');
    git(dev, 'remote', 'add', 'origin', `file://${remote}`);
    git(dev, 'push', '-q', '-u', 'origin', 'main');
    const { MATOMO_TOKEN, MATOMO_URL } = s.env;
    const result = await runInChild({ workflow: join(dev, '.github/workflows/watch-metric.yml'), remote, vars: { MATOMO_URL, MATOMO_SITE: '1', MATOMO_OPTIONS: '--goal 2 --event "Sign up"' }, secrets: { MATOMO_TOKEN }, env: {} });
    assert.ok(result.ok, JSON.stringify(result.steps.map((x) => [x.name, x.code, x.stderr]), null, 1));
    const fetchStep = result.steps.find((x) => x.name === 'Fetch Matomo metrics');
    assert.match(fetchStep.stdout, /data\/matomo\.csv: 480 days to /);
    assert.ok(!JSON.stringify(result.steps).includes(TOKEN), 'the token is never printed');
    git(dev, 'pull', '-q', '--rebase');
    const st = JSON.parse(readFileSync(join(dev, 'watch-state.json'), 'utf8'));
    assert.deepEqual(Object.keys(st.columns ?? st).filter((k) => ['visits', 'visitors', 'pageviews'].includes(k) || /^(goal|event)_/.test(k)).sort(), ['event_sign_up', 'goal_2', 'pageviews', 'visits']);
    assert.equal(git(dev, 'ls-files', 'data/matomo.csv').trim(), '', 'the CSV is not committed');
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
