// mixpanel-metrics.mjs against a stand-in for Mixpanel's Query API aggregated event counts (GET /api/query/events with
// HTTP Basic "username:secret", project_id, event as a JSON array, type general|unique, unit day, from_date, to_date;
// answering { data: { series, values: { <event>: { <day>: n } } }, legend_size }, with days an event never happened left
// out of its values), then through the watch and the self-deploy workflow. Nothing here talks to Mixpanel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, baseUrl, projectId, eventColumn, authHeader, eventName, buildUrl } from './mixpanel-metrics.mjs';
import { readExisting, toCsv, fillDays } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const quiet = () => {};
const USER = 'watch.a1b2c3.mp-service-account', SECRET = 'mp-test-secret-0123456789';
const ACCOUNT = `${USER}:${SECRET}`;
const PV = '$mp_web_page_view';

// A product: ~300 people a weekday (weekends 40%), 2.5 page views each; 'Sign Up' from 3%, 'Checkout Started' from 1%.
// From `pvOff` page views fall to `pvShare`; from `suOff` sign-ups fall to `suShare`. Days in `empty` have nothing.
function product({ from, to, pvOff = null, pvShare = 1, suOff = null, suShare = 1, empty = [], seed = 11 }) {
  const u = lcg(seed), days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const people = poisson(u, 300 * (dow === 0 || dow === 6 ? 0.4 : 1));
    const counts = {
      [PV]: poisson(u, people * 2.5 * (pvOff && d >= pvOff ? pvShare : 1)),
      'Sign Up': poisson(u, people * 0.03 * (suOff && d >= suOff ? suShare : 1)),
      'Checkout Started': poisson(u, people * 0.01),
      'Odd "name" & co': 2,
    };
    const uniques = { [PV]: Math.round(people * 0.97), 'Sign Up': counts['Sign Up'], 'Checkout Started': counts['Checkout Started'], 'Odd "name" & co': 1 };
    days.push({ date: d, people, counts, uniques });
  }
  return days;
}

function standIn(days, { status = 200, error = null, project = '4242' } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const u = new URL(req.url, 'http://x');
    calls.push({ path: u.pathname, auth: req.headers.authorization, params: Object.fromEntries(u.searchParams) });
    if (req.headers.authorization !== `Basic ${Buffer.from(ACCOUNT).toString('base64')}`) return send(401, { request: u.pathname, error: 'Invalid username or secret' });
    if (status !== 200) return send(status, { request: u.pathname, error });
    if (u.pathname !== '/api/query/events') return send(404, { error: 'not found' });
    if (u.searchParams.get('project_id') !== project) return send(403, { request: u.pathname, error: `You do not have access to project ${u.searchParams.get('project_id')}` });
    const p = Object.fromEntries(u.searchParams);
    if (p.unit !== 'day' || !['general', 'unique'].includes(p.type)) return send(400, { error: 'bad unit or type' });
    const events = JSON.parse(p.event);
    const series = [], values = Object.fromEntries(events.map((e) => [e, {}]));
    for (let d = p.from_date; d <= p.to_date; d = addDays(d, 1)) series.push(d);
    for (const r of days.filter((x) => x.date >= p.from_date && x.date <= p.to_date)) {
      for (const e of events) { const n = (p.type === 'unique' ? r.uniques : r.counts)[e] ?? 0; if (n > 0) values[e][r.date] = n; }
    }
    send(200, { data: { series, values }, legend_size: events.length });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, env: { MIXPANEL_HOST: base, MIXPANEL_SERVICE_ACCOUNT: ACCOUNT }, close: () => new Promise((r) => server.close(r)) });
  }));
}

const NOW = Date.parse('2026-06-20T18:00:00Z');
const TODAY = '2026-06-20';

test('projects, event columns, credentials, event names and the base address are read strictly', () => {
  assert.equal(projectId('4242'), '4242');
  assert.equal(projectId('https://eu.mixpanel.com/project/4242/view/99/app/boards'), '4242');
  assert.throws(() => projectId('my-app'), /not a Mixpanel project ID/);
  assert.equal(eventColumn(PV), 'event_mp_web_page_view');
  assert.equal(eventColumn('Sign Up'), 'event_sign_up');
  assert.equal(authHeader(ACCOUNT), `Basic ${Buffer.from(ACCOUNT).toString('base64')}`);
  assert.equal(authHeader('legacysecret'), `Basic ${Buffer.from('legacysecret:').toString('base64')}`, 'a legacy project secret is the user with no password');
  assert.equal(authHeader('u:pa:ss'), `Basic ${Buffer.from('u:pa:ss').toString('base64')}`);
  assert.throws(() => authHeader(''), /Set MIXPANEL_SERVICE_ACCOUNT/);
  assert.throws(() => authHeader(':secret'), /one side is empty/);
  assert.throws(() => authHeader('user:'), /one side is empty/);
  assert.throws(() => authHeader('u:s\nx'), /control character/);
  assert.throws(() => eventName('a\tb'), /control character/);
  assert.throws(() => eventName('  '), /takes an event name/);
  // The event list travels as a URL-encoded JSON array, so a name with quotes and brackets stays one name.
  const url = new URL(buildUrl({ base: 'https://mixpanel.com', project: '1', events: ['x"]', 'b'], from: '2026-01-01', to: '2026-01-31', type: 'general' }));
  assert.deepEqual(JSON.parse(url.searchParams.get('event')), ['x"]', 'b']);
  assert.equal(url.pathname, '/api/query/events');
  assert.equal(baseUrl({}), 'https://mixpanel.com');
  assert.equal(baseUrl({ MIXPANEL_HOST: 'EU' }), 'https://eu.mixpanel.com');
  assert.equal(baseUrl({ MIXPANEL_HOST: 'in' }), 'https://in.mixpanel.com');
  assert.equal(baseUrl({ MIXPANEL_HOST: 'https://api-eu.mixpanel.com' }), 'https://eu.mixpanel.com');
  assert.equal(baseUrl({ MIXPANEL_HOST: 'https://data.mixpanel.com/' }), 'https://mixpanel.com');
  assert.equal(baseUrl({ MIXPANEL_HOST: 'https://mp-proxy.example.com/' }), 'https://mp-proxy.example.com');
  assert.throws(() => baseUrl({ MIXPANEL_HOST: 'http://mp-proxy.example.com' }), /https/);
  assert.throws(() => baseUrl({ MIXPANEL_HOST: 'https://u:p@mixpanel.com' }), /address only/);
  assert.equal(baseUrl({ MIXPANEL_HOST: 'http://127.0.0.1:8000' }), 'http://127.0.0.1:8000');
});

test('fetches counts and uniques with Basic auth, fills empty days with zeros, a column per event and users, then extends', async () => {
  const days = product({ from: '2025-01-01', to: TODAY, empty: ['2026-03-03'] });
  const s = await standIn(days);
  try {
    const dir = mkdtempSync(join(tmpdir(), 'mixpanel-'));
    const outPath = join(dir, 'data', 'mixpanel.csv');
    const said = [];
    const args = ['--project', '4242', '--out', outPath, '--days', '120', '--event', PV, '--event', 'Sign Up', '--event', 'Checkout Started', '--event', 'Odd "name" & co'];
    assert.equal(await main(args, { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    assert.equal(s.calls.length, 2, 'one counts query and one uniques query');
    const [c0, c1] = s.calls;
    assert.equal(c0.path, '/api/query/events');
    assert.deepEqual(c0.params, { project_id: '4242', event: JSON.stringify([PV, 'Sign Up', 'Checkout Started', 'Odd "name" & co']), type: 'general', unit: 'day', from_date: '2026-02-20', to_date: '2026-06-19' });
    assert.deepEqual({ ...c1.params }, { ...c0.params, event: JSON.stringify([PV]), type: 'unique' });
    const cols = ['event_mp_web_page_view', 'event_sign_up', 'event_checkout_started', 'event_odd_name_co', 'users'];
    const text = readFileSync(outPath, 'utf8');
    assert.match(text, /^date,event_mp_web_page_view,event_sign_up,event_checkout_started,event_odd_name_co,users\n/);
    const got = readExisting(text, cols);
    assert.equal(got.length, 120);
    assert.equal(got[0].date, '2026-02-20');
    assert.equal(got.at(-1).date, '2026-06-19');
    assert.deepEqual(got.find((r) => r.date === '2026-03-03').values, Object.fromEntries(cols.map((c) => [c, 0])));
    const one = got.find((r) => r.date === '2026-03-04'), src = days.find((r) => r.date === '2026-03-04');
    assert.deepEqual(one.values, { event_mp_web_page_view: src.counts[PV], event_sign_up: src.counts['Sign Up'], event_checkout_started: src.counts['Checkout Started'], event_odd_name_co: 2, users: src.uniques[PV] });
    assert.match(said.join(''), /120 days to 2026-06-19 \(120 fetched, \d+ \$mp_web_page_view\), project 4242/);

    // Three days later: the last 3 days are asked for again, the rest kept byte for byte.
    s.calls.length = 0;
    const before = text.split('\n');
    assert.equal(await main(args.filter((_, i) => i !== 4 && i !== 5), { env: s.env, now: () => NOW + 3 * 86400000, out: quiet, err: quiet }), 0);
    assert.equal(s.calls[0].params.from_date, '2026-06-17');
    assert.equal(s.calls[0].params.to_date, '2026-06-22');
    const after = readFileSync(outPath, 'utf8').split('\n');
    assert.deepEqual(after.slice(0, 118), before.slice(0, 118));
    const got2 = readExisting(after.join('\n'), cols);
    assert.equal(got2.at(-1).date, '2026-06-22');
    assert.equal(got2.length, 123);
  } finally { await s.close(); }
});

test('the default event is autocapture page views; other columns refetch afresh; --lag reaches the query; empty fetches are flagged', async () => {
  const s = await standIn(product({ from: '2026-04-01', to: TODAY }));
  try {
    const outPath = join(mkdtempSync(join(tmpdir(), 'mixpanel-')), 'p.csv');
    writeFileSync(outPath, 'date,visitors\n2026-05-01,3\n');
    const warn = [];
    await main(['--project', '4242', '--out', outPath, '--days', '30', '--lag', '2'], { env: s.env, now: () => NOW, out: quiet, err: (t) => warn.push(t) });
    assert.match(warn.join(''), /other columns than this run writes/);
    assert.equal(s.calls[0].params.event, JSON.stringify([PV]));
    assert.equal(s.calls[0].params.from_date, '2026-05-20');
    assert.equal(s.calls[0].params.to_date, '2026-06-18');
    assert.match(readFileSync(outPath, 'utf8'), /^date,event_mp_web_page_view,users\n2026-05-20,\d+,\d+\n/);

    const later = [];
    await main(['--project', '4242', '--out', join(mkdtempSync(join(tmpdir(), 'mixpanel-')), 'q.csv'), '--days', '30'], { env: s.env, now: () => NOW + 60 * 86400000, out: quiet, err: (t) => later.push(t) });
    assert.match(later.join(''), /every day fetched is empty/);

    const typo = [];
    await main(['--project', '4242', '--out', join(mkdtempSync(join(tmpdir(), 'mixpanel-')), 'r.csv'), '--days', '40', '--event', PV, '--event', 'Sign up'], { env: s.env, now: () => NOW, out: quiet, err: (t) => typo.push(t) });
    assert.match(typo.join(''), /event "Sign up" has no count in 40 days/);
  } finally { await s.close(); }
});

test('clear errors: refused credentials, no access to the project, rate limit, no credentials, no project, too many events', async () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'mixpanel-')), 'p.csv');
  const s = await standIn(product({ from: '2026-04-01', to: TODAY }));
  try {
    const run = (args, env = s.env) => main(args, { env, now: () => NOW, out: quiet, err: quiet });
    await assert.rejects(run(['--project', '4242', '--out', outPath], { ...s.env, MIXPANEL_SERVICE_ACCOUNT: `${USER}:wrong` }), /refused the credentials \(401\): Invalid username or secret/);
    await assert.rejects(run(['--project', '99', '--out', outPath]), /403: You do not have access to project 99.*Consumer/);
    await assert.rejects(run(['--project', '4242', '--out', outPath], { MIXPANEL_HOST: s.env.MIXPANEL_HOST }), /Set MIXPANEL_SERVICE_ACCOUNT/);
    await assert.rejects(run(['--out', outPath]), /Give --project/);
    await assert.rejects(run(['--project', '4242', '--out', outPath, '--event', 'a b', '--event', 'a_b']), /same event twice/);
    await assert.rejects(run(['--project', '4242', '--out', outPath, ...Array.from({ length: 9 }, (_, i) => ['--event', `e${i}`]).flat()]), /at most 8 events/);
  } finally { await s.close(); }
  const p = await standIn([], { status: 429, error: 'Query rate limit exceeded' });
  try {
    await assert.rejects(main(['--project', '4242', '--out', outPath], { env: p.env, now: () => NOW, out: quiet, err: quiet, sleep: async () => {} }), /429 after retrying.*60 queries an hour/);
    assert.equal(p.calls.length, 6, 'five retries, then the error');
  } finally { await p.close(); }
});

test('a snippet dropped from a new layout and a release that stopped sending Sign Up: the watch hears both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mixpanel-'));
  const days = product({ from: '2025-09-01', to: '2026-04-30', pvOff: '2026-03-16', pvShare: 0.5, suOff: '2026-01-12', suShare: 0.35, seed: 5 });
  const cols = ['event_mp_web_page_view', 'event_sign_up', 'users'];
  const rows = fillDays(days.map((r) => ({ date: r.date, values: { event_mp_web_page_view: r.counts[PV], event_sign_up: r.counts['Sign Up'], users: r.uniques[PV] } })), cols, '2025-09-01', '2026-04-30');
  const csvPath = join(dir, 'mixpanel.csv');
  writeFileSync(csvPath, toCsv(rows, cols));
  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', cols.map((c) => `${c}:poisson`).join(',')], { out: (t) => said.push(t), err: quiet });
  const text = said.join('');
  assert.match(text, /event_mp_web_page_view[\s\S]*2026-03-1[4-8]/);
  assert.match(text, /event_sign_up[\s\S]*2026-01-(0[89]|1[0-6])/);
});
