// umami-metrics.mjs against a stand-in for Umami's API (the shape in Umami's own route and query code:
// GET /api/websites/<id>/pageviews -> { pageviews: [{x, y}], sessions: [{x, y}] } and
// GET /api/websites/<id>/events/series -> [{ x: name, t: day, y }], days with nothing left out, day buckets only for a
// range within seven calendar months), then through the watch and the self-deploy workflow. Nothing here talks to
// Umami. The stand-in answers page views with PostgreSQL's day format and events with ClickHouse's, to cover both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, endpoint, websiteId, eventColumn, timeZone, dayStart, todayIn, windows } from './umami-metrics.mjs';
import { readExisting, toCsv, fillDays } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => {
  if (lam > 300) return Math.max(0, Math.round(lam + Math.sqrt(lam) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())));
  let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k;
};
const quiet = () => {};
const KEY = 'umami_test-key-0123456789abcdefghijkl';
const SITE = '3f0e7c1a-9b2d-4c6e-8f10-a1b2c3d4e5f6';

// A site: ~400 visitors a weekday (weekends half), 2.2 page views each; "signup" from 2% of visitors, "Checkout
// started" from 1%. From `pvOff` page views and visitors fall to `pvShare` (the tracker dropped from part of the site);
// from `suOff` sign-ups fall to `suShare` (a form that stopped calling umami.track). Days in `empty` have nothing.
function site({ from, to, pvOff = null, pvShare = 1, suOff = null, suShare = 1, empty = [], seed = 13 }) {
  const u = lcg(seed), days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const all = poisson(u, 400 * (dow === 0 || dow === 6 ? 0.5 : 1));
    const share = pvOff && d >= pvOff ? pvShare : 1;
    const visitors = poisson(u, all * share);
    days.push({ date: d, visitors, pageviews: poisson(u, visitors * 2.2), events: { signup: poisson(u, all * 0.02 * (suOff && d >= suOff ? suShare : 1)), 'Checkout started': poisson(u, all * 0.01), outbound: 3 } });
  }
  return days;
}

const monthsApart = (a, b) => (new Date(b).getUTCFullYear() - new Date(a).getUTCFullYear()) * 12 + new Date(b).getUTCMonth() - new Date(a).getUTCMonth();

function standIn(days, { status = 200, website = SITE } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const u = new URL(req.url, 'http://x');
    calls.push({ path: u.pathname, q: Object.fromEntries(u.searchParams), auth: req.headers.authorization, apiKey: req.headers['x-umami-api-key'] });
    const cloud = u.pathname.startsWith('/v1/');
    const ok = cloud ? req.headers['x-umami-api-key'] === KEY : req.headers.authorization === `Bearer ${KEY}`;
    if (!ok) return send(401, { error: { message: 'Unauthorized', code: 'unauthorized', status: 401 } });
    if (status !== 200) return send(status, { error: { message: status === 403 ? 'Forbidden' : 'Oops', status } });
    const m = /^\/(?:v1|api)\/websites\/([^/]+)\/(pageviews|events\/series)$/.exec(u.pathname);
    if (!m || m[1] !== website) return send(404, { error: { message: 'Not found', code: 'not-found', status: 404 } });
    const tz = u.searchParams.get('timezone') || 'UTC';
    const startAt = Number(u.searchParams.get('startAt')), endAt = Number(u.searchParams.get('endAt'));
    // Umami: day buckets only when the range is within seven calendar months; otherwise it falls back to months.
    const byMonth = monthsApart(startAt, endAt) > 7;
    const a = todayIn(startAt, tz), b = todayIn(endAt, tz);
    const inRange = days.filter((r) => r.date >= a && r.date <= b);
    const key = (d, ch) => (byMonth ? d.slice(0, 7) : ch ? `${d}T00:00:00Z` : d);
    if (m[2] === 'pageviews') {
      const pv = [], se = [];
      for (const r of inRange) { if (r.pageviews) pv.push({ x: key(r.date, false), y: r.pageviews }); if (r.visitors) se.push({ x: key(r.date, false), y: r.visitors }); }
      return send(200, { pageviews: pv, sessions: se });
    }
    const out = [];
    for (const r of inRange) for (const [n, y] of Object.entries(r.events)) if (y > 0) out.push({ x: n, t: key(r.date, true), y });
    return send(200, out);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, base, env: { UMAMI_URL: base, UMAMI_API_KEY: KEY }, close: () => new Promise((r) => server.close(r)) });
  }));
}

const NOW = Date.parse('2026-06-20T18:00:00Z');

test('addresses, website IDs, columns, time zones, day starts and windows are read strictly', () => {
  assert.deepEqual(endpoint({}), { base: 'https://api.umami.is/v1', cloud: true });
  assert.deepEqual(endpoint({ UMAMI_URL: 'https://cloud.umami.is' }), { base: 'https://api.umami.is/v1', cloud: true });
  assert.deepEqual(endpoint({ UMAMI_URL: 'https://umami.example.com/' }), { base: 'https://umami.example.com/api', cloud: false });
  assert.deepEqual(endpoint({ UMAMI_URL: 'https://umami.example.com/api' }), { base: 'https://umami.example.com/api', cloud: false });
  assert.deepEqual(endpoint({ UMAMI_URL: `https://example.com/stats/websites/${SITE}` }), { base: 'https://example.com/stats/api', cloud: false });
  assert.throws(() => endpoint({ UMAMI_URL: 'http://umami.example.com' }), /https/);
  assert.throws(() => endpoint({ UMAMI_URL: 'https://u:p@umami.example.com' }), /address only/);
  assert.equal(endpoint({ UMAMI_URL: 'http://localhost:3000' }).base, 'http://localhost:3000/api');
  assert.equal(websiteId(SITE.toUpperCase()), SITE);
  assert.equal(websiteId(`https://cloud.umami.is/websites/${SITE}/events`), SITE);
  assert.throws(() => websiteId('example.com'), /not an Umami website ID/);
  assert.equal(eventColumn('signup'), 'event_signup');
  assert.equal(eventColumn('Checkout started'), 'event_checkout_started');
  assert.equal(eventColumn('Réservation'), 'event_reservation');
  assert.throws(() => eventColumn('!!'), /no Latin letters/);
  assert.equal(timeZone('Europe/Berlin'), 'Europe/Berlin');
  assert.throws(() => timeZone('Mars/Olympus'), /not a time zone/);
  // Midnight in Berlin: UTC+1 in winter, UTC+2 in summer, and the day DST starts (2026-03-29) begins at UTC+1.
  assert.equal(new Date(dayStart('2026-01-15', 'Europe/Berlin')).toISOString(), '2026-01-14T23:00:00.000Z');
  assert.equal(new Date(dayStart('2026-07-15', 'Europe/Berlin')).toISOString(), '2026-07-14T22:00:00.000Z');
  assert.equal(new Date(dayStart('2026-03-29', 'Europe/Berlin')).toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(new Date(dayStart('2026-03-30', 'Europe/Berlin')).toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal(new Date(dayStart('2026-11-01', 'America/New_York')).toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(dayStart('2026-05-05', 'UTC'), Date.parse('2026-05-05T00:00:00Z'));
  assert.equal(todayIn(Date.parse('2026-06-20T23:30:00Z'), 'Asia/Tokyo'), '2026-06-21');
  const w = windows('2025-01-01', '2026-04-25');
  assert.equal(w.length, 3);
  assert.deepEqual(w[0], ['2025-01-01', '2025-06-29']);
  assert.equal(w.at(-1)[1], '2026-04-25');
  for (const [a, b] of w) assert.ok(monthsApart(Date.parse(a), Date.parse(b)) <= 7);
});

test('self-hosted: fetches by 180-day windows with a Bearer key, fills empty days with zeros, a column per event, then extends', async () => {
  const days = site({ from: '2025-01-01', to: '2026-06-20', empty: ['2026-03-03'] });
  const s = await standIn(days);
  try {
    const dir = mkdtempSync(join(tmpdir(), 'umami-'));
    const outPath = join(dir, 'data', 'umami.csv');
    const said = [];
    const args = ['--website', SITE, '--out', outPath, '--days', '400', '--event', 'signup', '--event', 'Checkout started'];
    assert.equal(await main(args, { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    assert.equal(s.calls.length, 6, '400 days = 3 windows, two calls each');
    assert.equal(s.calls[0].path, `/api/websites/${SITE}/pageviews`);
    assert.equal(s.calls[1].path, `/api/websites/${SITE}/events/series`);
    assert.equal(s.calls[0].auth, `Bearer ${KEY}`);
    assert.equal(s.calls[0].apiKey, undefined);
    assert.deepEqual({ unit: s.calls[0].q.unit, timezone: s.calls[0].q.timezone }, { unit: 'day', timezone: 'UTC' });
    assert.equal(new Date(Number(s.calls[0].q.startAt)).toISOString(), '2025-05-16T00:00:00.000Z');
    assert.equal(new Date(Number(s.calls.at(-1).q.endAt)).toISOString(), '2026-06-19T23:59:59.999Z');
    const cols = ['pageviews', 'visitors', 'event_signup', 'event_checkout_started'];
    const text = readFileSync(outPath, 'utf8');
    assert.match(text, /^date,pageviews,visitors,event_signup,event_checkout_started\n/);
    const got = readExisting(text, cols);
    assert.equal(got.length, 400);
    assert.equal(got[0].date, '2025-05-16');
    assert.equal(got.at(-1).date, '2026-06-19');
    assert.deepEqual(got.find((r) => r.date === '2026-03-03').values, Object.fromEntries(cols.map((c) => [c, 0])));
    for (const d of ['2025-05-16', '2025-11-12', '2025-11-13', '2026-03-04', '2026-06-19']) {
      const src = days.find((r) => r.date === d);
      assert.deepEqual(got.find((r) => r.date === d).values, { pageviews: src.pageviews, visitors: src.visitors, event_signup: src.events.signup, event_checkout_started: src.events['Checkout started'] }, d);
    }
    const printed = said.join('');
    assert.match(printed, /400 days to 2026-06-19 \(400 fetched, \d+ page views\), website 3f0e7c1a/);
    assert.match(printed, /Custom events in the days fetched: "signup" \d+, "Checkout started" \d+, "outbound" 1197\./);

    // Three days later: the last 2 days are asked for again, the rest kept byte for byte.
    s.calls.length = 0;
    const before = text.split('\n');
    assert.equal(await main(args.filter((_, i) => i !== 4 && i !== 5), { env: s.env, now: () => NOW + 3 * 86400000, out: quiet, err: quiet }), 0);
    assert.equal(s.calls.length, 2);
    assert.equal(new Date(Number(s.calls[0].q.startAt)).toISOString(), '2026-06-18T00:00:00.000Z');
    const after = readFileSync(outPath, 'utf8').split('\n');
    assert.deepEqual(after.slice(0, 399), before.slice(0, 399));
    const got2 = readExisting(after.join('\n'), cols);
    assert.equal(got2.at(-1).date, '2026-06-22');
    assert.equal(got2.length, 403);
  } finally { await s.close(); }
});

test('Umami Cloud: the x-umami-api-key header and /v1 paths; a time zone sets the day bounds; notes for empty fetches and misnamed events', async () => {
  const s = await standIn(site({ from: '2026-01-01', to: '2026-06-20' }));
  try {
    // UMAMI_URL unset means the cloud; route its address to the stand-in to see what would be sent.
    const fetchImpl = (url, init) => fetch(String(url).replace('https://api.umami.is', s.base), init);
    const outPath = join(mkdtempSync(join(tmpdir(), 'umami-')), 'u.csv');
    const said = [], warn = [];
    await main(['--website', SITE, '--out', outPath, '--days', '60', '--timezone', 'America/New_York', '--event', 'Signup'], { env: { UMAMI_API_KEY: KEY }, fetchImpl, now: () => NOW, out: (t) => said.push(t), err: (t) => warn.push(t) });
    assert.equal(s.calls[0].path, `/v1/websites/${SITE}/pageviews`);
    assert.equal(s.calls[0].apiKey, KEY);
    assert.equal(s.calls[0].auth, undefined);
    assert.equal(s.calls[0].q.timezone, 'America/New_York');
    assert.equal(new Date(Number(s.calls[0].q.startAt)).toISOString(), '2026-04-21T04:00:00.000Z');
    assert.match(said.join(''), /on Umami Cloud/);
    assert.match(warn.join(''), /event "Signup" has no rows in 60 days; event names are case-sensitive/);

    const later = [];
    await main(['--website', SITE, '--out', join(mkdtempSync(join(tmpdir(), 'umami-')), 'v.csv'), '--days', '30'], { env: { UMAMI_API_KEY: KEY }, fetchImpl, now: () => NOW + 90 * 86400000, out: quiet, err: (t) => later.push(t) });
    assert.match(later.join(''), /every day fetched is empty.*6 months of history/);
  } finally { await s.close(); }
});

test('clear errors: a refused key, a forbidden website, an unknown website, month buckets, no key, no website, too many events', async () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'umami-')), 'u.csv');
  const s = await standIn(site({ from: '2026-01-01', to: '2026-06-20' }));
  try {
    const run = (args, env = s.env) => main(args, { env, now: () => NOW, out: quiet, err: quiet });
    await assert.rejects(run(['--website', SITE, '--out', outPath], { ...s.env, UMAMI_API_KEY: 'umami_wrong' }), /refused the API key \(401\): Unauthorized/);
    await assert.rejects(run(['--website', '00000000-0000-4000-8000-000000000000', '--out', outPath]), /404: Not found\. Check --website and UMAMI_URL/);
    await assert.rejects(run(['--website', SITE, '--out', outPath], { UMAMI_URL: s.env.UMAMI_URL }), /Set UMAMI_API_KEY/);
    await assert.rejects(run(['--out', outPath]), /Give --website/);
    await assert.rejects(run(['--website', SITE, '--out', outPath, '--event', 'a b', '--event', 'a_b']), /same event twice/);
    await assert.rejects(run(['--website', SITE, '--out', outPath, ...Array.from({ length: 9 }, (_, i) => ['--event', `e${i}`]).flat()]), /at most 8 events/);
  } finally { await s.close(); }
  const f = await standIn([], { status: 403 });
  try {
    await assert.rejects(main(['--website', SITE, '--out', outPath], { env: f.env, now: () => NOW, out: quiet, err: quiet }), /403: Forbidden: the key's user may not view/);
  } finally { await f.close(); }
  // A server that answers by the month (as Umami does for a range past seven months) is refused, not misread.
  const m = await standIn(site({ from: '2025-01-01', to: '2026-06-20' }));
  try {
    const { fetchDays } = await import('./umami-metrics.mjs');
    const wide = (url, init) => { const u = new URL(url); u.searchParams.set('startAt', String(Date.parse('2025-01-01T00:00:00Z'))); return fetch(u, init); };
    await assert.rejects(fetchDays({ base: `${m.base}/api`, cloud: false, key: KEY, website: SITE, from: '2026-05-01', to: '2026-05-31', fetchImpl: wide }), /answered pageviews by "2025-01", not by the day/);
  } finally { await m.close(); }
});

test('a tracker dropped from part of the site and a form that stopped sending its event: the watch hears both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'umami-'));
  const days = site({ from: '2025-09-01', to: '2026-04-30', pvOff: '2026-03-16', pvShare: 0.6, suOff: '2026-01-12', suShare: 0.35, seed: 5 });
  const cols = ['pageviews', 'visitors', 'event_signup'];
  const rows = fillDays(days.map((r) => ({ date: r.date, values: { pageviews: r.pageviews, visitors: r.visitors, event_signup: r.events.signup } })), cols, '2025-09-01', '2026-04-30');
  const csvPath = join(dir, 'umami.csv');
  writeFileSync(csvPath, toCsv(rows, cols));
  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', 'pageviews:poisson,visitors:poisson,event_signup:poisson'], { out: (t) => said.push(t), err: quiet });
  const text = said.join('');
  assert.match(text, /pageviews[\s\S]*2026-03-1[4-9]/);
  assert.match(text, /event_signup[\s\S]*2026-01-(0[89]|1[0-9])/);
});
