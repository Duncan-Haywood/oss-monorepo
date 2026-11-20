// stripe-metrics.mjs against a stand-in for Stripe's list API (the documented shape: {object:'list', data,
// has_more}, newest first, created[gte]/created[lt]/starting_after/limit), then through the watch and through the
// self-deploy workflow. Nothing here talks to Stripe; no real account was used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { csvCell, main, dailyRows, dayOf, dayStart, checkZone, minorUnits, mainCurrency, listAll, readExisting, apiBase } from './stripe-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };

// A shop: `days` days ending the day before `today` (UTC), ~40 card payments a day around $30, 2% declined;
// from `shiftAt` days before today the decline rate is `failRate2` (a broken checkout, a card-network issue).
function shop({ today, days = 120, shiftAt = null, failRate2 = 0.25, seed = 3, extra = [] } = {}) {
  const u = lcg(seed), out = [];
  let id = 0;
  for (let d = days; d >= 1; d--) {
    const start = dayStart(today, 0) - d * 86400;
    const n = poisson(u, 40);
    const fail = shiftAt != null && d <= shiftAt ? failRate2 : 0.02;
    for (let k = 0; k < n; k++) {
      out.push({ id: `ch_${++id}`, object: 'charge', created: start + Math.floor(u() * 86400), amount: 1000 + Math.floor(u() * 4000), currency: 'usd', status: u() < fail ? 'failed' : 'succeeded' });
    }
  }
  return [...out, ...extra].sort((a, b) => b.created - a.created || (a.id < b.id ? 1 : -1));
}

// Stripe's list semantics over an array, as a fetch implementation; records every request.
function standIn(objects, { pageSize = 100, fail = null } = {}) {
  const calls = [];
  const answer = (url, headers = {}) => {
    calls.push({ url, auth: headers.authorization });
    if (fail) { const f = fail(calls.length); if (f) return f; }
    if (headers.authorization !== 'Bearer rk_test_ok') return { status: 401, body: { error: { message: 'Invalid API Key provided: rk_***' } } };
    const u = new URL(url);
    const gte = Number(u.searchParams.get('created[gte]')), lt = Number(u.searchParams.get('created[lt]'));
    const limit = Math.min(Number(u.searchParams.get('limit') || 10), pageSize);
    const after = u.searchParams.get('starting_after');
    const kind = u.pathname.endsWith('/customers') ? 'customer' : 'charge';
    let list = objects.filter((o) => (o.object ?? 'charge') === kind && o.created >= gte && o.created < lt);
    if (after) list = list.slice(list.findIndex((o) => o.id === after) + 1);
    return { status: 200, body: { object: 'list', url: u.pathname, has_more: list.length > limit, data: list.slice(0, limit) } };
  };
  const fetchImpl = async (url, init = {}) => { const r = answer(url, init.headers); return { ok: r.status < 300, status: r.status, json: async () => r.body }; };
  return { fetchImpl, answer, calls };
}

const tmp = () => mkdtempSync(join(tmpdir(), 'stripe-metrics-'));
const nowAt = (day, hour = 15) => () => Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);
const quiet = { out: () => {}, err: () => {}, sleep: async () => {} };
const parse = (text) => text.trim().split('\n').slice(1).map((l) => l.split(','));

test('days and offsets: a payment at 02:00 UTC is the previous day in New York', () => {
  const t = Date.parse('2026-03-10T02:00:00Z') / 1000;
  assert.equal(dayOf(t, 0), '2026-03-10');
  assert.equal(dayOf(t, -5), '2026-03-09');
  assert.equal(dayStart('2026-03-10', -5), Date.parse('2026-03-10T05:00:00Z') / 1000);
  assert.equal(dayOf(dayStart('2026-03-10', 5.5), 5.5), '2026-03-10');
});

test('time zone names follow daylight saving; a fixed offset does not', () => {
  const at = (iso) => Date.parse(iso) / 1000;
  const start = (d, z) => new Date(dayStart(d, z) * 1000).toISOString();
  // New York: 05:00 UTC in winter, 04:00 UTC in summer; 2026-03-08 and 2026-11-01 are the switch days
  assert.equal(start('2026-03-08', 'America/New_York'), '2026-03-08T05:00:00.000Z');
  assert.equal(start('2026-03-09', 'America/New_York'), '2026-03-09T04:00:00.000Z');
  assert.equal(start('2026-11-01', 'America/New_York'), '2026-11-01T04:00:00.000Z');
  assert.equal(start('2026-11-02', 'America/New_York'), '2026-11-02T05:00:00.000Z');
  // a summer order at 23:30 New York time: the name says the 30th, the winter offset -5 says the 1st
  assert.equal(dayOf(at('2026-07-01T03:30:00Z'), 'America/New_York'), '2026-06-30');
  assert.equal(dayOf(at('2026-07-01T03:30:00Z'), -5), '2026-06-30');
  assert.equal(dayOf(at('2026-07-01T04:30:00Z'), 'America/New_York'), '2026-07-01');
  assert.equal(dayOf(at('2026-07-01T04:30:00Z'), -5), '2026-06-30');
  // Santiago skips midnight when its clocks go forward: the day starts at 01:00 local
  assert.equal(start('2026-09-06', 'America/Santiago'), '2026-09-06T04:00:00.000Z');
  assert.equal(dayOf(dayStart('2026-09-06', 'America/Santiago') - 1, 'America/Santiago'), '2026-09-05');
  // half-hour and +14 zones, and every day's start maps back to that day over a year
  assert.equal(start('2026-05-01', 'Asia/Kolkata'), '2026-04-30T18:30:00.000Z');
  assert.equal(start('2026-05-01', 'Pacific/Kiritimati'), '2026-04-30T10:00:00.000Z');
  for (let k = 0; k < 366; k++) {
    const d = new Date(Date.parse('2026-01-01T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
    for (const z of ['America/New_York', 'Europe/London', 'Australia/Sydney']) {
      const t = dayStart(d, z);
      assert.equal(dayOf(t, z), d);
      assert.notEqual(dayOf(t - 1, z), d);
    }
  }
  assert.equal(checkZone('Europe/Paris'), 'Europe/Paris');
  assert.throws(() => checkZone('Mars/Olympus'), /time zone name/);
  assert.throws(() => checkZone(''), /time zone name/);
});

test('minor units: cents, yen and dinars', () => {
  assert.equal(minorUnits('usd'), 100);
  assert.equal(minorUnits('jpy'), 1);
  assert.equal(minorUnits('kwd'), 1000);
  const c = (amount, currency, day = 1) => ({ created: dayStart(`2026-01-0${day}`), amount, currency, status: 'succeeded' });
  const y = dailyRows({ charges: [c(1500, 'jpy')], from: '2026-01-01', to: '2026-01-01', currency: 'jpy' }).rows[0];
  assert.equal(y.revenue, '1500');
  const k = dailyRows({ charges: [c(12340, 'kwd')], from: '2026-01-01', to: '2026-01-01', currency: 'kwd' }).rows[0];
  assert.equal(k.revenue, '12.340');
});

test('daily rows: zeros for empty days, failed and pending kept out of revenue, other currencies counted apart', () => {
  const at = (day, h) => dayStart(day) + h * 3600;
  const charges = [
    { created: at('2026-01-01', 1), amount: 1999, currency: 'usd', status: 'succeeded' },
    { created: at('2026-01-01', 2), amount: 1, currency: 'usd', status: 'succeeded' },
    { created: at('2026-01-01', 3), amount: 5000, currency: 'usd', status: 'failed' },
    { created: at('2026-01-03', 3), amount: 700, currency: 'eur', status: 'succeeded' },
    { created: at('2026-01-03', 4), amount: 900, currency: 'usd', status: 'pending' },
    { created: at('2026-01-09', 4), amount: 900, currency: 'usd', status: 'succeeded' }, // outside the range
  ];
  const customers = [{ created: at('2026-01-02', 5) }, { created: at('2026-01-02', 6) }];
  const { rows, otherCurrency } = dailyRows({ charges, customers, from: '2026-01-01', to: '2026-01-03', currency: 'usd' });
  assert.deepEqual(rows, [
    { date: '2026-01-01', payments: 2, revenue: '20.00', failed: 1, new_customers: 0 },
    { date: '2026-01-02', payments: 0, revenue: '0.00', failed: 0, new_customers: 2 },
    { date: '2026-01-03', payments: 1, revenue: '0.00', failed: 0, new_customers: 0 },
  ]);
  assert.equal(otherCurrency, 1);
  assert.equal(mainCurrency([{ currency: 'eur' }, { currency: 'usd' }, { currency: 'usd' }]), 'usd');
  assert.equal(mainCurrency([{ currency: 'usd' }, { currency: 'eur' }]), 'eur'); // tie: alphabetical
});

test('csv cells: numbers pass, a formula-looking cell is defused', () => {
  assert.equal(csvCell('-12.50'), '-12.50');
  assert.equal(csvCell('=HYPERLINK(1)'), "'=HYPERLINK(1)");
  assert.equal(csvCell('-1+cmd'), "'-1+cmd");
  assert.equal(csvCell(7), '7');
});

test('listAll follows starting_after across pages and gets every charge once', async () => {
  const today = '2026-05-01';
  const charges = shop({ today, days: 30 });
  const s = standIn(charges);
  const got = await listAll('/charges', { key: 'rk_test_ok', gte: dayStart('2026-04-01'), lt: dayStart(today), fetchImpl: s.fetchImpl });
  assert.equal(got.length, charges.length);
  assert.equal(new Set(got.map((c) => c.id)).size, charges.length);
  assert.equal(s.calls.length, Math.ceil(charges.length / 100) + (charges.length % 100 === 0 ? 1 : 0));
  assert.ok(s.calls.every((c) => c.auth === 'Bearer rk_test_ok'));
});

test('listAll retries 429 and 5xx with backoff, and names the problem on 401 and 403', async () => {
  const charges = shop({ today: '2026-05-01', days: 3 });
  const waits = [];
  const s = standIn(charges, { fail: (n) => (n === 1 ? { status: 429, body: {} } : n === 2 ? { status: 503, body: {} } : null) });
  const got = await listAll('/charges', { key: 'rk_test_ok', gte: 0, lt: 2e9, fetchImpl: s.fetchImpl, sleep: async (ms) => waits.push(ms) });
  assert.equal(got.length, charges.length);
  assert.deepEqual(waits, [1000, 2000]);
  await assert.rejects(listAll('/charges', { key: 'rk_bad', gte: 0, lt: 2e9, fetchImpl: s.fetchImpl }), /refused the key \(401\): Invalid API Key/);
  const forbid = standIn([], { fail: () => ({ status: 403, body: { error: { message: 'no permission' } } }) });
  await assert.rejects(listAll('/customers', { key: 'rk_test_ok', gte: 0, lt: 2e9, fetchImpl: forbid.fetchImpl }), /403: no permission\. A restricted key needs read access to customers/);
});

test('main writes only complete days, then extends the CSV, refetching its last 3 days', async () => {
  const dir = tmp(), out = join(dir, 'data', 'stripe.csv');
  const charges = shop({ today: '2026-05-01', days: 60 });
  // a charge made today must not appear: a half day reads as a fall
  charges.unshift({ id: 'ch_today', object: 'charge', created: dayStart('2026-05-01') + 3600, amount: 99999, currency: 'usd', status: 'succeeded' });
  const s = standIn(charges);
  const env = { STRIPE_API_KEY: 'rk_test_ok' };
  await main(['--out', out, '--days', '30'], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-01'), ...quiet });
  let rows = parse(readFileSync(out, 'utf8'));
  assert.equal(rows.length, 30);
  assert.equal(rows[0][0], '2026-04-01');
  assert.equal(rows.at(-1)[0], '2026-04-30');
  assert.equal(readFileSync(`${out}.currency`, 'utf8').trim(), 'usd');
  // the same totals as counting the stand-in's charges directly
  const want = charges.filter((c) => c.status === 'succeeded' && dayOf(c.created) === '2026-04-15');
  const r15 = rows.find((r) => r[0] === '2026-04-15');
  assert.equal(Number(r15[1]), want.length);
  assert.equal(r15[2], (want.reduce((a, c) => a + c.amount, 0) / 100).toFixed(2));

  // Two days later: only the last 3 days of the file and the 2 new ones are fetched again.
  s.calls.length = 0;
  await main(['--out', out, '--days', '30'], { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-03'), ...quiet });
  rows = parse(readFileSync(out, 'utf8'));
  assert.equal(rows.length, 32);
  assert.equal(rows.at(-1)[0], '2026-05-02');
  assert.equal(new Set(rows.map((r) => r[0])).size, 32, 'no day twice');
  const gte = Number(new URL(s.calls[0].url).searchParams.get('created[gte]'));
  assert.equal(gte, dayStart('2026-04-28'));
  assert.ok(rows.every((r) => Number(r[1]) < 200), 'today\'s charge was never counted as a day');
});

test('main refuses unsafe or wrong input before calling Stripe', async () => {
  const dir = tmp(), out = join(dir, 'm.csv');
  const s = standIn([]);
  const run = (argv, env) => main(argv, { env, fetchImpl: s.fetchImpl, now: nowAt('2026-05-01'), ...quiet });
  await assert.rejects(run(['--out', out], {}), /Set STRIPE_API_KEY/);
  await assert.rejects(run(['--out', out], { STRIPE_API_KEY: 'pk_live_x' }), /publishable key/);
  await assert.rejects(run(['--out', out], { STRIPE_API_KEY: 'rk_test_ok', STRIPE_API_BASE: 'https://evil.example' }), /loopback/);
  await assert.rejects(run(['--out', out, '--utc-offset', '5.3'], { STRIPE_API_KEY: 'rk_test_ok' }), /quarter hours/);
  await assert.rejects(run(['--out', out, '--time-zone', 'EST5'], { STRIPE_API_KEY: 'rk_test_ok' }), /time zone name/);
  assert.equal(s.calls.length, 0);
  assert.equal(apiBase({}), 'https://api.stripe.com/v1');
  assert.equal(apiBase({ STRIPE_API_BASE: 'http://127.0.0.1:8123/v1/' }), 'http://127.0.0.1:8123/v1');
  // an extended file never switches currency silently
  writeFileSync(out, 'date,payments,revenue,failed\n2026-04-01,1,1.00,0\n2026-04-02,1,1.00,0\n2026-04-03,1,1.00,0\n2026-04-04,1,1.00,0\n');
  writeFileSync(`${out}.currency`, 'usd\n');
  await assert.rejects(run(['--out', out, '--currency', 'eur'], { STRIPE_API_KEY: 'rk_test_ok' }), /sums USD/);
  assert.equal(readExisting('date,payments,revenue,failed,new_customers\n', false), null);
});

test('end to end: a daily fetch and watch hears when card declines jump, and not before', async () => {
  // 120 days of a shop; declines go from 2% to 25% of attempts 12 days before the last day. The watch runs once a
  // day from day 90 on, as the workflow would, with the default Stripe columns.
  const dir = tmp(), out = join(dir, 'stripe.csv'), state = join(dir, 'state.json');
  const last = '2026-05-01';
  const charges = shop({ today: last, days: 120, shiftAt: 12 });
  const s = standIn(charges);
  const env = { STRIPE_API_KEY: 'rk_test_ok' };
  const alerts = [];
  for (let back = 30; back >= 0; back--) {
    const today = new Date(Date.parse(`${last}T00:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
    await main(['--out', out, '--days', '90'], { env, fetchImpl: s.fetchImpl, now: nowAt(today), ...quiet });
    let text = '';
    await watchMain([out, '--state', state, '--columns', 'payments:poisson,revenue,failed:poisson', '--json'], { out: (t) => { text += t; } });
    const r = JSON.parse(text);
    for (const c of r.columns ?? []) for (const a of c.alerts ?? []) alerts.push({ today, column: c.column, label: a.label });
  }
  const failed = alerts.filter((a) => a.column === 'failed');
  assert.ok(failed.length >= 1, `declines alert: ${JSON.stringify(alerts)}`);
  const shiftDay = new Date(Date.parse(`${last}T00:00:00Z`) - 12 * 864e5).toISOString().slice(0, 10);
  assert.ok(failed.every((a) => a.today > shiftDay), 'no decline alert before the jump');
  assert.ok(Math.abs(Date.parse(failed[0].label) - Date.parse(shiftDay)) <= 2 * 864e5, `dated near ${shiftDay}: ${failed[0].label}`);
  assert.ok(failed[0].today <= new Date(Date.parse(shiftDay) + 8 * 864e5).toISOString().slice(0, 10), `heard within 8 days: ${failed[0].today}`);
});

test('the self-deploy workflow fetches Stripe metrics, watches all three columns and never commits the CSV', async (t) => {
  const today = new Date().toISOString().slice(0, 10);
  const charges = shop({ today, days: 120 });
  const s = standIn(charges);
  const server = createServer((req, res) => {
    const r = s.answer(`http://127.0.0.1${req.url}`, { authorization: req.headers.authorization });
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.body));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/v1`;

  const root = tmp(), dev = join(root, 'dev'), remote = join(root, 'remote.git');
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
  assert.ok(existsSync(join(dev, 'stripe-metrics.mjs')));
  assert.match(readFileSync(join(dev, '.gitignore'), 'utf8'), /^data\/stripe\.csv\*$/m);
  git(root, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dev, 'init', '-q', '-b', 'main');
  git(dev, 'add', '.');
  git(dev, 'commit', '-qm', 'watch stripe');
  git(dev, 'remote', 'add', 'origin', `file://${remote}`);
  git(dev, 'push', '-q', '-u', 'origin', 'main');

  // runWorkflow blocks (spawnSync), so it runs in a child process and this one stays free to answer as Stripe.
  const result = await runInChild({ workflow: join(dev, '.github/workflows/watch-metric.yml'), remote, secrets: { STRIPE_API_KEY: 'rk_test_ok' }, env: { STRIPE_API_BASE: base } });
  assert.ok(result.ok, JSON.stringify(result.steps.map((x) => [x.name, x.code, x.stderr]), null, 1));
  const fetchStep = result.steps.find((x) => x.name === 'Fetch Stripe metrics');
  assert.match(fetchStep.stdout, /data\/stripe\.csv: 400 days/);
  assert.ok(!JSON.stringify(result.steps).includes('rk_test_ok'), 'the key is never printed');
  git(dev, 'pull', '-q', '--rebase');
  const st = JSON.parse(readFileSync(join(dev, 'watch-state.json'), 'utf8'));
  assert.deepEqual(Object.keys(st.columns ?? st).filter((k) => ['payments', 'revenue', 'failed'].includes(k)).sort(), ['failed', 'payments', 'revenue']);
  assert.equal(git(dev, 'ls-files', 'data/stripe.csv').trim(), '', 'the CSV with revenue is not committed');
});

// Run runWorkflow in a child Node process so this process's event loop stays free to serve the stand-in API.
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
