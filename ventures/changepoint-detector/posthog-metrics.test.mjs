// posthog-metrics.mjs against a stand-in for PostHog's query API (the documented shape: POST
// /api/projects/<id>/query/ with a Bearer personal key and { query: { kind: "HogQLQuery", query } }, answering
// { results: [[...]], columns, hasMore }; days with no event are left out, as a GROUP BY leaves them out), then
// through the watch and the self-deploy workflow. Nothing here talks to PostHog. The stand-in reads the event list,
// the day bounds and LIMIT/OFFSET out of the HogQL text, and unescapes string literals the way ClickHouse does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, baseUrl, projectId, eventColumn, hogqlString, buildQuery } from './posthog-metrics.mjs';
import { readExisting, toCsv, fillDays } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const quiet = () => {};
const KEY = 'phx_posthog-test-key-0123456789';

// A product: ~300 people a weekday (weekends 40%), 2.5 page views each; signed_up from 3% of people, "Checkout
// Started" from 1%. From `pvOff` page views fall to `pvShare` (the snippet dropped from a new layout); from `suOff`
// sign-ups fall to `suShare` (a release that stopped calling capture). Days in `empty` have no events at all.
function product({ from, to, pvOff = null, pvShare = 1, suOff = null, suShare = 1, empty = [], seed = 11 }) {
  const u = lcg(seed), days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const people = poisson(u, 300 * (dow === 0 || dow === 6 ? 0.4 : 1));
    const counts = {
      $pageview: poisson(u, people * 2.5 * (pvOff && d >= pvOff ? pvShare : 1)),
      signed_up: poisson(u, people * 0.03 * (suOff && d >= suOff ? suShare : 1)),
      'Checkout Started': poisson(u, people * 0.01),
      "it's \\odd": 2,
    };
    days.push({ date: d, people, counts });
  }
  return days;
}

const unescape = (lit) => lit.slice(1, -1).replace(/\\(.)/g, '$1');

function standIn(days, { pageCap = 10000, status = 200, detail = null, project = '4242' } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const body = JSON.parse(raw);
      calls.push({ url: req.url, auth: req.headers.authorization, body });
      if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { type: 'authentication_error', code: 'authentication_failed', detail: 'Personal API key found in request Authorization header is invalid.' });
      if (status !== 200) return send(status, { type: 'authentication_error', code: 'permission_denied', detail });
      if (req.url !== `/api/projects/${project}/query/`) return send(404, { type: 'invalid_request', code: 'not_found', detail: 'Not found.' });
      const q = body.query?.query ?? '';
      if (body.query?.kind !== 'HogQLQuery') return send(400, { type: 'validation_error', detail: 'kind' });
      const list = /event IN \(((?:'(?:[^'\\]|\\.)*'(?:, )?)+)\)/.exec(q);
      const events = [...list[1].matchAll(/'(?:[^'\\]|\\.)*'/g)].map((m) => unescape(m[0]));
      const [, a] = /toDate\(timestamp\) >= toDate\('(\d{4}-\d{2}-\d{2})'\)/.exec(q);
      const [, b] = /toDate\(timestamp\) <= toDate\('(\d{4}-\d{2}-\d{2})'\)/.exec(q);
      const [, limit, offset] = /LIMIT (\d+) OFFSET (\d+)$/.exec(q).map(Number);
      const byEvent = /GROUP BY day, event/.test(q);
      const all = [];
      for (const r of days.filter((x) => x.date >= a && x.date <= b)) {
        const hit = events.filter((e) => (r.counts[e] ?? 0) > 0);
        if (byEvent) for (const e of [...hit].sort()) all.push([r.date, e, r.counts[e]]);
        else if (hit.length) all.push([r.date, r.people]);
      }
      const n = Math.min(limit, pageCap);
      send(200, { results: all.slice(offset, offset + n), columns: byEvent ? ['day', 'event', 'n'] : ['day', 'n'], hasMore: offset + n < all.length });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, env: { POSTHOG_HOST: base, POSTHOG_API_KEY: KEY }, close: () => new Promise((r) => server.close(r)) });
  }));
}

const NOW = Date.parse('2026-06-20T18:00:00Z');
const TODAY = '2026-06-20';

test('projects, event columns, string literals and the base address are read strictly', () => {
  assert.equal(projectId('4242'), '4242');
  assert.equal(projectId('https://us.posthog.com/project/4242/insights'), '4242');
  assert.throws(() => projectId('my-app'), /not a PostHog project ID/);
  assert.equal(eventColumn('$pageview'), 'event_pageview');
  assert.equal(eventColumn('signed_up'), 'event_signed_up');
  assert.equal(eventColumn('Checkout Started'), 'event_checkout_started');
  assert.equal(eventColumn('Réservation'), 'event_reservation');
  assert.throws(() => eventColumn('$'), /no Latin letters/);
  assert.equal(hogqlString("it's"), "'it\\'s'");
  assert.equal(hogqlString('a\\b'), "'a\\\\b'");
  assert.throws(() => hogqlString('a\nb'), /control character/);
  // A name built to close the literal stays inside it: the only unescaped quotes are the two around it.
  const evil = "x') OR 1=1 --";
  const q = buildQuery({ events: [evil], from: '2026-01-01', to: '2026-01-31', byEvent: true });
  assert.ok(q.includes("event IN ('x\\') OR 1=1 --')"));
  assert.equal(baseUrl({}), 'https://us.posthog.com');
  assert.equal(baseUrl({ POSTHOG_HOST: 'eu' }), 'https://eu.posthog.com');
  assert.equal(baseUrl({ POSTHOG_HOST: 'https://eu.i.posthog.com' }), 'https://eu.posthog.com');
  assert.equal(baseUrl({ POSTHOG_HOST: 'https://app.posthog.com/' }), 'https://us.posthog.com');
  assert.equal(baseUrl({ POSTHOG_HOST: 'https://posthog.example.com/' }), 'https://posthog.example.com');
  assert.throws(() => baseUrl({ POSTHOG_HOST: 'http://posthog.example.com' }), /https/);
  assert.throws(() => baseUrl({ POSTHOG_HOST: 'https://u:p@posthog.example.com' }), /address only/);
  assert.equal(baseUrl({ POSTHOG_HOST: 'http://127.0.0.1:8000' }), 'http://127.0.0.1:8000');
});

test('fetches days with the key, pages, fills empty days with zeros, a column per event and users, then extends', async () => {
  const days = product({ from: '2025-01-01', to: TODAY, empty: ['2026-03-03'] });
  const s = await standIn(days, { pageCap: 50 });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'posthog-'));
    const outPath = join(dir, 'data', 'posthog.csv');
    const said = [];
    const args = ['--project', '4242', '--out', outPath, '--days', '120', '--event', '$pageview', '--event', 'signed_up', '--event', 'Checkout Started', '--event', "it's \\odd"];
    assert.equal(await main(args, { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    const byEv = s.calls.filter((c) => /GROUP BY day, event/.test(c.body.query.query));
    assert.equal(byEv.length, 10, '119 days x 4 events = 476 rows at the stand-in\'s 50-row pages');
    assert.equal(byEv[0].auth, `Bearer ${KEY}`);
    assert.equal(byEv[0].url, '/api/projects/4242/query/');
    assert.match(byEv[0].body.query.query, /toDate\(timestamp\) >= toDate\('2026-02-20'\) AND toDate\(timestamp\) <= toDate\('2026-06-19'\)/);
    assert.deepEqual(byEv.map((c) => Number(/OFFSET (\d+)$/.exec(c.body.query.query)[1])).slice(0, 3), [0, 50, 100]);
    const cols = ['event_pageview', 'event_signed_up', 'event_checkout_started', 'event_it_s_odd', 'users'];
    const text = readFileSync(outPath, 'utf8');
    assert.match(text, /^date,event_pageview,event_signed_up,event_checkout_started,event_it_s_odd,users\n/);
    const got = readExisting(text, cols);
    assert.equal(got.length, 120);
    assert.equal(got[0].date, '2026-02-20');
    assert.equal(got.at(-1).date, '2026-06-19');
    assert.deepEqual(got.find((r) => r.date === '2026-03-03').values, Object.fromEntries(cols.map((c) => [c, 0])));
    const one = got.find((r) => r.date === '2026-03-04'), src = days.find((r) => r.date === '2026-03-04');
    assert.deepEqual(one.values, { event_pageview: src.counts.$pageview, event_signed_up: src.counts.signed_up, event_checkout_started: src.counts['Checkout Started'], event_it_s_odd: 2, users: src.people });
    assert.match(said.join(''), /120 days to 2026-06-19 \(120 fetched, \d+ \$pageview\), project 4242/);

    // Three days later: the last 3 days are asked for again, the rest kept byte for byte.
    s.calls.length = 0;
    const before = text.split('\n');
    assert.equal(await main(args.filter((_, i) => i !== 4 && i !== 5), { env: s.env, now: () => NOW + 3 * 86400000, out: quiet, err: quiet }), 0);
    assert.match(s.calls[0].body.query.query, /toDate\('2026-06-17'\) AND toDate\(timestamp\) <= toDate\('2026-06-22'\)/);
    const after = readFileSync(outPath, 'utf8').split('\n');
    assert.deepEqual(after.slice(0, 118), before.slice(0, 118));
    const got2 = readExisting(after.join('\n'), cols);
    assert.equal(got2.at(-1).date, '2026-06-22');
    assert.equal(got2.length, 123);
  } finally { await s.close(); }
});

test('the default event is $pageview; other columns refetch afresh; --lag reaches the query; empty fetches are flagged', async () => {
  const s = await standIn(product({ from: '2026-04-01', to: TODAY }));
  try {
    const outPath = join(mkdtempSync(join(tmpdir(), 'posthog-')), 'p.csv');
    writeFileSync(outPath, 'date,visitors\n2026-05-01,3\n');
    const warn = [];
    await main(['--project', '4242', '--out', outPath, '--days', '30', '--lag', '2'], { env: s.env, now: () => NOW, out: quiet, err: (t) => warn.push(t) });
    assert.match(warn.join(''), /other columns than this run writes/);
    assert.match(s.calls[0].body.query.query, /event IN \('\$pageview'\)/);
    assert.match(s.calls[0].body.query.query, /toDate\('2026-05-20'\) AND toDate\(timestamp\) <= toDate\('2026-06-18'\)/);
    assert.match(readFileSync(outPath, 'utf8'), /^date,event_pageview,users\n2026-05-20,\d+,\d+\n/);

    const later = [];
    await main(['--project', '4242', '--out', join(mkdtempSync(join(tmpdir(), 'posthog-')), 'q.csv'), '--days', '30'], { env: s.env, now: () => NOW + 60 * 86400000, out: quiet, err: (t) => later.push(t) });
    assert.match(later.join(''), /every day fetched is empty/);

    const typo = [];
    await main(['--project', '4242', '--out', join(mkdtempSync(join(tmpdir(), 'posthog-')), 'r.csv'), '--days', '40', '--event', '$pageview', '--event', 'Signed Up'], { env: s.env, now: () => NOW, out: quiet, err: (t) => typo.push(t) });
    assert.match(typo.join(''), /event "Signed Up" has no rows in 40 days/);
  } finally { await s.close(); }
});

test('clear errors: a refused key, a project key, a missing scope, an unknown project, no key, no project, too many events', async () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'posthog-')), 'p.csv');
  const s = await standIn(product({ from: '2026-04-01', to: TODAY }));
  try {
    const run = (args, env = s.env) => main(args, { env, now: () => NOW, out: quiet, err: quiet });
    await assert.rejects(run(['--project', '4242', '--out', outPath], { ...s.env, POSTHOG_API_KEY: 'phx_wrong' }), /refused the API key \(401\).*personal API key/);
    await assert.rejects(run(['--project', '4242', '--out', outPath], { ...s.env, POSTHOG_API_KEY: 'phc_abc' }), /project key \(phc_\.\.\.\)/);
    await assert.rejects(run(['--project', '99', '--out', outPath]), /404.*--project/);
    await assert.rejects(run(['--project', '4242', '--out', outPath], { POSTHOG_HOST: s.env.POSTHOG_HOST }), /Set POSTHOG_API_KEY/);
    await assert.rejects(run(['--out', outPath]), /Give --project/);
    await assert.rejects(run(['--project', '4242', '--out', outPath, '--event', 'a b', '--event', 'a_b']), /same event twice/);
    await assert.rejects(run(['--project', '4242', '--out', outPath, ...Array.from({ length: 9 }, (_, i) => ['--event', `e${i}`]).flat()]), /at most 8 events/);
  } finally { await s.close(); }
  const p = await standIn([], { status: 403, detail: "This action does not support Personal API Key access with the scopes 'insight:read'." });
  try {
    await assert.rejects(main(['--project', '4242', '--out', outPath], { env: p.env, now: () => NOW, out: quiet, err: quiet }), /403.*Query: Read/);
  } finally { await p.close(); }
});

test('a snippet dropped from a new layout and a release that stopped sending signed_up: the watch hears both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'posthog-'));
  const days = product({ from: '2025-09-01', to: '2026-04-30', pvOff: '2026-03-16', pvShare: 0.5, suOff: '2026-01-12', suShare: 0.35, seed: 5 });
  const cols = ['event_pageview', 'event_signed_up', 'users'];
  const rows = fillDays(days.map((r) => ({ date: r.date, values: { event_pageview: r.counts.$pageview, event_signed_up: r.counts.signed_up, users: r.people } })), cols, '2025-09-01', '2026-04-30');
  const csvPath = join(dir, 'posthog.csv');
  writeFileSync(csvPath, toCsv(rows, cols));
  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', 'event_pageview:poisson,event_signed_up:poisson,users:poisson'], { out: (t) => said.push(t), err: quiet });
  const text = said.join('');
  assert.match(text, /event_pageview[\s\S]*2026-03-1[4-8]/);
  assert.match(text, /event_signed_up[\s\S]*2026-01-(0[89]|1[0-6])/);
});
