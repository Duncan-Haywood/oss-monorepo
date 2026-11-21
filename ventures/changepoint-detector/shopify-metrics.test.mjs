// shopify-metrics.mjs against a stand-in for Shopify's Admin GraphQL API (the documented shape: POST
// /admin/api/<version>/graphql.json with X-Shopify-Access-Token, `orders`/`customers` connections with
// pageInfo { hasNextPage endCursor } and nodes, `query: "created_at:>='..' AND created_at:<'..'"`, THROTTLED errors
// with HTTP 200), then through the watch and through the self-deploy workflow. Nothing here talks to Shopify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, dailyRows, listAll, endpoint, thousandths, readExisting } from './shopify-metrics.mjs';
import { dayStart } from './stripe-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const isoOf = (unix) => new Date(unix * 1000).toISOString().replace(/\.000Z$/, 'Z');

// A store: `days` days ending the day before `today` (UTC), ~30 orders a day around $45, 3% cancelled, a few test
// orders; from `shiftAt` days before today orders run at `rate2` (a broken theme, a lost ad account).
function store({ today, days = 120, shiftAt = null, rate2 = 15, seed = 5, currency = 'USD' } = {}) {
  const u = lcg(seed), out = [];
  let id = 0;
  for (let d = days; d >= 1; d--) {
    const start = dayStart(today, 0) - d * 86400;
    const n = poisson(u, shiftAt != null && d <= shiftAt ? rate2 : 30);
    for (let k = 0; k < n; k++) {
      const created = start + Math.floor(u() * 86400);
      const cents = 2000 + Math.floor(u() * 5000);
      out.push({ id: `gid://shopify/Order/${++id}`, kind: 'orders', createdAt: isoOf(created), cancelledAt: u() < 0.03 ? isoOf(created + 3600) : null, test: u() < 0.01, totalPriceSet: { shopMoney: { amount: (cents / 100).toFixed(2), currencyCode: currency } } });
    }
  }
  return out;
}

// Shopify's GraphQL connection semantics over an array; records every request.
// `zone` is the store's Shop.ianaTimezone (UTC unless a test names one; null answers without it); the zone query is
// recorded in zoneCalls, not calls, so calls stays the list of order and customer pages.
function standIn(objects, { pageSize = 250, fail = null, zone = 'UTC' } = {}) {
  const calls = [], zoneCalls = [];
  const answer = (headers, raw) => {
    const body = JSON.parse(raw);
    if (/^\s*query Zone/.test(body.query)) {
      zoneCalls.push({ token: headers['x-shopify-access-token'] });
      if (headers['x-shopify-access-token'] !== 'shpat_ok') return { status: 401, body: { errors: '[API] Invalid API key or access token' } };
      return { status: 200, body: { data: { shop: zone === null ? null : { ianaTimezone: zone } } } };
    }
    calls.push({ token: headers['x-shopify-access-token'], body });
    if (fail) { const f = fail(calls.length); if (f) return f; }
    if (headers['x-shopify-access-token'] !== 'shpat_ok') return { status: 401, body: { errors: '[API] Invalid API key or access token (unrecognized login or wrong password)' } };
    const kind = /^\s*query Customers/.test(body.query) ? 'customers' : 'orders';
    const m = /created_at:>='([^']+)' AND created_at:<'([^']+)'/.exec(body.variables.q);
    const gte = Date.parse(m[1]), lt = Date.parse(m[2]);
    let list = objects.filter((o) => (o.kind ?? 'orders') === kind && Date.parse(o.createdAt) >= gte && Date.parse(o.createdAt) < lt)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
    const start = body.variables.after ? Number(body.variables.after.slice(4)) : 0;
    const first = Math.min(body.variables.first, pageSize);
    const nodes = list.slice(start, start + first);
    return { status: 200, body: { data: { [kind]: { pageInfo: { hasNextPage: start + first < list.length, endCursor: `cur:${start + first}` }, nodes } } } };
  };
  const fetchImpl = async (url, init = {}) => { calls.url = url; const r = answer(init.headers, init.body); return { ok: r.status < 300, status: r.status, json: async () => r.body }; };
  return { fetchImpl, answer, calls, zoneCalls };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'shopify-metrics-'));
const nowAt = (day, hour = 15) => () => Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
const quiet = { out: () => {}, err: () => {}, sleep: async () => {} };
const parse = (text) => text.trim().split('\n').slice(1).map((l) => l.split(','));
const env = { SHOPIFY_SHOP: 'my-store', SHOPIFY_ACCESS_TOKEN: 'shpat_ok' };

test('amounts sum exactly: thousandths of decimal strings', () => {
  assert.equal(thousandths('12.5'), 12500);
  assert.equal(thousandths('0.10'), 100);
  assert.equal(thousandths('1999'), 1999000);
  assert.equal(thousandths('2.0005'), 2001);
  assert.equal(thousandths('-3.25'), -3250);
  assert.throws(() => thousandths('1e3'), /Not an amount/);
  // 0.1 + 0.2 in floats is 0.30000000000000004; here it is 0.30
  const { rows } = dailyRows({ orders: [0.1, 0.2].map((a, i) => ({ id: String(i), createdAt: '2026-01-01T10:00:00Z', totalPriceSet: { shopMoney: { amount: String(a), currencyCode: 'USD' } } })), from: '2026-01-01', to: '2026-01-01' });
  assert.equal(rows[0].revenue, '0.30');
});

test('the token only ever goes to a myshopify.com host or loopback', () => {
  assert.equal(endpoint({ SHOPIFY_SHOP: 'my-store' }), 'https://my-store.myshopify.com/admin/api/2025-01/graphql.json');
  assert.equal(endpoint({ SHOPIFY_SHOP: 'https://My-Store.myshopify.com/admin' }), 'https://my-store.myshopify.com/admin/api/2025-01/graphql.json');
  assert.throws(() => endpoint({ SHOPIFY_SHOP: 'shop.example.com' }), /myshopify\.com name/);
  assert.throws(() => endpoint({ SHOPIFY_SHOP: 'evil.com/x.myshopify.com' }), /myshopify\.com name/);
  assert.throws(() => endpoint({ SHOPIFY_SHOP: 'a.b.myshopify.com' }), /myshopify\.com name/);
  assert.throws(() => endpoint({}), /Set SHOPIFY_SHOP/);
  assert.throws(() => endpoint({ SHOPIFY_SHOP: 'x', SHOPIFY_API_BASE: 'https://evil.example' }), /loopback/);
  assert.equal(endpoint({ SHOPIFY_API_BASE: 'http://127.0.0.1:9/' }), 'http://127.0.0.1:9/admin/api/2025-01/graphql.json');
});

test('every order read once across pages; THROTTLED and 5xx retried; scope errors named', async () => {
  const today = '2026-05-01';
  const orders = store({ today, days: 30 });
  let s = standIn(orders, { pageSize: 50, fail: (n) => (n === 2 ? { status: 200, body: { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] } } : n === 4 ? { status: 502, body: null } : null) });
  const waits = [];
  const got = await listAll('orders', { token: 'shpat_ok', url: 'x', gte: dayStart('2026-04-01'), lt: dayStart(today), fetchImpl: s.fetchImpl, sleep: async (ms) => waits.push(ms) });
  assert.equal(got.length, orders.length);
  assert.equal(new Set(got.map((o) => o.id)).size, orders.length);
  assert.deepEqual(waits, [1000, 1000]);
  assert.ok(Math.ceil(orders.length / 50) >= 10, 'enough pages to matter');
  s = standIn(orders, { fail: () => ({ status: 200, body: { errors: [{ message: 'Access denied for customers field.', extensions: { code: 'ACCESS_DENIED' } }] } }) });
  await assert.rejects(listAll('customers', { token: 'shpat_ok', url: 'x', gte: 0, lt: 1, fetchImpl: s.fetchImpl }), /read_customers scope/);
  s = standIn(orders);
  await assert.rejects(listAll('orders', { token: 'shpat_bad', url: 'x', gte: 0, lt: 1, fetchImpl: s.fetchImpl }), /refused the access token \(401\)/);
});

test('daily rows: complete days only, zeros on quiet days, cancelled and test orders kept out of orders', async () => {
  const dir = tmp(), out = join(dir, 'shopify.csv');
  const day = (d, h) => `2026-04-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:30:00Z`;
  const o = (id, createdAt, amount, extra = {}) => ({ id, createdAt, cancelledAt: null, test: false, totalPriceSet: { shopMoney: { amount, currencyCode: 'EUR' } }, ...extra });
  const orders = [
    o('1', day(27, 10), '10.00'), o('2', day(27, 23), '5.50'),
    o('3', day(28, 3), '7.00', { cancelledAt: day(28, 5) }),
    o('4', day(30, 9), '100.00', { test: true }),
    o('5', day(30, 12), '20.00'),
    o('6', '2026-05-01T09:00:00Z', '999.00'), // today: left out
  ];
  const s = standIn(orders);
  const lines = [];
  await main(['--out', out, '--days', '4'], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-01'), ...quiet, out: (t) => lines.push(t) });
  assert.deepEqual(parse(readFileSync(out, 'utf8')), [
    ['2026-04-27', '2', '15.50', '0'], ['2026-04-28', '0', '0.00', '1'], ['2026-04-29', '0', '0.00', '0'], ['2026-04-30', '1', '20.00', '0'],
  ]);
  assert.match(lines.join(''), /revenue in EUR/);
  assert.match(lines.join(''), /1 test order left out/);
  // at UTC+2 the 23:30 UTC order on the 27th is the 28th's
  const r = dailyRows({ orders, from: '2026-04-27', to: '2026-04-28', offsetHours: 2 });
  assert.deepEqual(r.rows.map((x) => [x.orders, x.revenue]), [[1, '10.00'], [1, '5.50']]);
  // a yen store writes whole yen
  const yen = dailyRows({ orders: [o('y', day(27, 1), '1500.00', { totalPriceSet: { shopMoney: { amount: '1500.0', currencyCode: 'JPY' } } })], from: '2026-04-27', to: '2026-04-27' });
  assert.equal(yen.rows[0].revenue, '1500');
});

test('an existing CSV is extended: only its last --refetch days are fetched again', async () => {
  const dir = tmp(), out = join(dir, 'shopify.csv');
  const orders = store({ today: '2026-05-03', days: 60 });
  const s = standIn(orders);
  await main(['--out', out, '--days', '30'], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-01'), ...quiet });
  assert.equal(parse(readFileSync(out, 'utf8')).length, 30);
  s.calls.length = 0;
  await main(['--out', out, '--days', '30'], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-03'), ...quiet });
  const rows = parse(readFileSync(out, 'utf8'));
  assert.equal(rows.length, 32);
  assert.equal(new Set(rows.map((r) => r[0])).size, 32);
  assert.equal(rows.at(-1)[0], '2026-05-02');
  assert.match(s.calls[0].body.variables.q, /created_at:>='2026-04-28T00:00:00Z' AND created_at:<'2026-05-03T00:00:00Z'/);
  assert.equal(readExisting('date,orders,revenue,cancelled,new_customers\n', false), null);
});

// The audit's fault (2026-11-19): a New York store under --utc-offset -5 put every summer order placed 23:00-24:00
// local on the next day. The default now asks the store for its zone, as Shopify's own reports do.
test("days follow the store's own time zone, daylight saving included", async () => {
  const dir = tmp();
  const o = (id, at) => ({ id: `gid://shopify/Order/${id}`, createdAt: at, cancelledAt: null, test: false, totalPriceSet: { shopMoney: { amount: '10.00', currencyCode: 'USD' } } });
  const orders = [
    o('1', '2026-07-01T03:30:00Z'), // 23:30 on 30 June in New York (EDT)
    o('2', '2026-07-01T04:30:00Z'), // 00:30 on 1 July
    o('3', '2026-07-02T12:00:00Z'),
  ];
  const run = async (argv, zone) => {
    const s = standIn(orders, { zone });
    const out = join(dir, `${argv.join('_').replace(/\W/g, '') || 'default'}-${zone}.csv`);
    let said = '', warned = '';
    await main(['--out', out, '--days', '4', ...argv], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-07-03'), ...quiet, out: (t) => { said += t; }, err: (t) => { warned += t; } });
    return { rows: parse(readFileSync(out, 'utf8')).map((r) => [r[0], r[1]]), said, warned, s };
  };
  const ny = await run([], 'America/New_York');
  assert.deepEqual(ny.rows, [['2026-06-29', '0'], ['2026-06-30', '1'], ['2026-07-01', '1'], ['2026-07-02', '1']]);
  assert.match(ny.said, /days in America\/New_York/);
  assert.equal(ny.s.zoneCalls.length, 1);
  assert.match(ny.s.calls[0].body.variables.q, /created_at:>='2026-06-29T04:00:00Z' AND created_at:<'2026-07-03T04:00:00Z'/);
  // the old advice, a fixed -5, puts the 00:30 order on the 30th
  const fixed = await run(['--utc-offset', '-5'], 'America/New_York');
  assert.deepEqual(fixed.rows.slice(1, 3), [['2026-06-30', '2'], ['2026-07-01', '0']]);
  assert.equal(fixed.s.zoneCalls.length, 0, 'a given offset or zone is not second-guessed');
  // --time-zone wins over the store's
  const utc = await run(['--time-zone', 'UTC'], 'America/New_York');
  assert.deepEqual(utc.rows.slice(1), [['2026-06-30', '0'], ['2026-07-01', '2'], ['2026-07-02', '1']]);
  // an answer with no zone: UTC, and the run says so
  const none = await run([], null);
  assert.deepEqual(none.rows, utc.rows);
  assert.match(none.warned, /Could not read the store's time zone .*days run in UTC/);
});

test('a long first fetch with nothing past 60 days names the read_all_orders scope', async () => {
  const dir = tmp();
  const orders = store({ today: '2026-05-01', days: 60 });
  const s = standIn(orders);
  let said = '';
  await main(['--out', join(dir, 'a.csv'), '--days', '400'], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-01'), ...quiet, out: (t) => { said += t; } });
  assert.match(said, /read_all_orders/);
  said = '';
  await main(['--out', join(dir, 'b.csv'), '--days', '400'], { env, fetchImpl: standIn(store({ today: '2026-05-01', days: 90 })).fetchImpl, now: nowAt('2026-05-01'), ...quiet, out: (t) => { said += t; } });
  assert.doesNotMatch(said, /read_all_orders/);
});

test('main refuses unsafe or wrong input before calling Shopify', async () => {
  const dir = tmp(), out = join(dir, 'm.csv');
  const s = standIn([]);
  const run = (argv, e) => main(argv, { env: e, fetchImpl: s.fetchImpl, now: nowAt('2026-05-01'), ...quiet });
  await assert.rejects(run(['--out', out], { SHOPIFY_SHOP: 'x' }), /Set SHOPIFY_ACCESS_TOKEN/);
  await assert.rejects(run(['--out', out], { SHOPIFY_SHOP: 'x', SHOPIFY_ACCESS_TOKEN: 'shpss_abc' }), /shared secret/);
  await assert.rejects(run(['--out', out], { SHOPIFY_SHOP: 'evil.example', SHOPIFY_ACCESS_TOKEN: 'shpat_ok' }), /myshopify\.com name/);
  await assert.rejects(run(['--out', out, '--utc-offset', '5.3'], env), /quarter hours/);
  await assert.rejects(run(['--out', out, '--time-zone', 'Mars/Olympus'], env), /time zone name/);
  assert.equal(s.calls.length, 0);
  assert.equal(s.zoneCalls.length, 0);
  writeFileSync(out, 'not,our,file\n');
});

// The orders column alone misses this halving in some shops under the default count detector (bocpd; 2 of 8 in a
// scratch replay, this seed among them; eval/poisson-window.out.txt measures it), so the bar is the store's message:
// revenue or orders, dated at the drop, never before it.
test('end to end: a daily fetch and watch hears when orders halve, and not before', async () => {
  const dir = tmp(), out = join(dir, 'shopify.csv'), state = join(dir, 'state.json');
  const last = '2026-05-01';
  const s = standIn(store({ today: last, days: 120, shiftAt: 12 }));
  const alerts = [];
  for (let back = 30; back >= 0; back--) {
    const today = new Date(Date.parse(`${last}T00:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
    await main(['--out', out, '--days', '90'], { env, fetchImpl: s.fetchImpl, now: nowAt(today), ...quiet });
    let text = '';
    await watchMain([out, '--state', state, '--columns', 'orders:poisson,revenue,cancelled:poisson', '--json'], { out: (t) => { text += t; } });
    for (const c of JSON.parse(text).columns ?? []) for (const a of c.alerts ?? []) alerts.push({ today, column: c.column, label: a.label });
  }
  const shiftDay = new Date(Date.parse(`${last}T00:00:00Z`) - 12 * 864e5).toISOString().slice(0, 10);
  const ord = alerts.filter((a) => a.column === 'orders' || a.column === 'revenue');
  assert.ok(ord.length >= 1, `orders or revenue alert: ${JSON.stringify(alerts)}`);
  // with --detector bocpd-window on the counts, the orders column itself hears it
  const dir2 = tmp(), out2 = join(dir2, 'shopify.csv'), state2 = join(dir2, 'state.json');
  const heard = [];
  for (let back = 30; back >= 0; back--) {
    const today = new Date(Date.parse(`${last}T00:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
    await main(['--out', out2, '--days', '90'], { env, fetchImpl: s.fetchImpl, now: nowAt(today), ...quiet });
    let text = '';
    await watchMain([out2, '--state', state2, '--column', 'orders', '--model', 'poisson', '--detector', 'bocpd-window', '--json'], { out: (t) => { text += t; } });
    for (const a of JSON.parse(text).alerts ?? []) heard.push({ today, label: a.label });
  }
  assert.ok(heard.length >= 1 && heard.every((a) => a.today > shiftDay), `windowed orders alert: ${JSON.stringify(heard)}`);
  assert.ok(alerts.every((a) => a.today > shiftDay), `no alert before the drop: ${JSON.stringify(alerts)}`);
  assert.ok(Math.abs(Date.parse(ord[0].label) - Date.parse(shiftDay)) <= 2 * 864e5, `dated near ${shiftDay}: ${ord[0].label}`);
  assert.ok(ord[0].today <= new Date(Date.parse(shiftDay) + 8 * 864e5).toISOString().slice(0, 10), `heard within 8 days: ${ord[0].today}`);
});

test('the self-deploy workflow fetches Shopify metrics, watches all three columns and never commits the CSV', async (t) => {
  const today = new Date().toISOString().slice(0, 10);
  const s = standIn(store({ today, days: 120 }));
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const r = s.answer(req.headers, raw);
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const root = tmp(), dev = join(root, 'dev'), remote = join(root, 'remote.git');
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
  assert.ok(existsSync(join(dev, 'shopify-metrics.mjs')));
  assert.match(readFileSync(join(dev, '.gitignore'), 'utf8'), /^data\/shopify\.csv$/m);
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dev, 'init', '-q', '-b', 'main');
  git(dev, 'add', '.');
  git(dev, 'commit', '-qm', 'watch shopify');
  git(dev, 'remote', 'add', 'origin', `file://${remote}`);
  git(dev, 'push', '-q', '-u', 'origin', 'main');

  const result = await runInChild({ workflow: join(dev, '.github/workflows/watch-metric.yml'), remote, vars: { SHOPIFY_SHOP: 'my-store' }, secrets: { SHOPIFY_ACCESS_TOKEN: 'shpat_ok' }, env: { SHOPIFY_API_BASE: base } });
  assert.ok(result.ok, JSON.stringify(result.steps.map((x) => [x.name, x.code, x.stderr]), null, 1));
  const fetchStep = result.steps.find((x) => x.name === 'Fetch Shopify metrics');
  assert.match(fetchStep.stdout, /data\/shopify\.csv: 400 days/);
  assert.ok(!JSON.stringify(result.steps).includes('shpat_ok'), 'the token is never printed');
  git(dev, 'pull', '-q', '--rebase');
  const st = JSON.parse(readFileSync(join(dev, 'watch-state.json'), 'utf8'));
  assert.deepEqual(Object.keys(st.columns ?? st).filter((k) => ['orders', 'revenue', 'cancelled'].includes(k)).sort(), ['cancelled', 'orders', 'revenue']);
  assert.equal(git(dev, 'ls-files', 'data/shopify.csv').trim(), '', 'the CSV with revenue is not committed');
});

function runInChild(args) {
  return new Promise((ok, bad) => {
    const code = `import { runWorkflow } from ${JSON.stringify(new URL('./deploy/run-workflow.mjs', import.meta.url).href)};
      const r = runWorkflow(${JSON.stringify(args)}); process.stdout.write(JSON.stringify({ ok: r.ok, steps: r.steps }));`;
    import('node:child_process').then(({ execFile }) => {
      execFile(process.execPath, ['--input-type=module', '-e', code], { maxBuffer: 64 << 20 }, (e, stdout, stderr) => {
        if (e) return bad(new Error(`${e.message}\n${stderr}`));
        ok(JSON.parse(stdout));
      });
    });
  });
}
