// ga4-metrics.mjs against a stand-in for Google's OAuth token endpoint and the Analytics Data API's runReport (the
// documented shapes: a form POST with grant_type jwt-bearer and an RS256 assertion; a JSON POST to
// /properties/{id}:runReport with dateRanges, dimensions [{name:'date'}] and metrics, answering { dimensionHeaders,
// metricHeaders, rows: [{ dimensionValues: [{value:'YYYYMMDD'}], metricValues: [{value}] }], rowCount, metadata }),
// then through the watch and the self-deploy workflow. Nothing here talks to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, fromExport, fillDays, endpoints, propertyId, parseMetrics, readExisting, toCsv, DEFAULT_METRICS } from './ga4-metrics.mjs';
import { main as watchMain } from './watch.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const KEY = { type: 'service_account', client_email: 'watch@demo-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' };
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const compact = (d) => d.replace(/-/g, '');
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const quiet = () => {};

// A property: ~600 sessions a day with a weekly cycle (weekends 60%), users ~0.8 of sessions, 2.5 views a session, 3%
// of sessions with a key event. From `dropOn` sessions fall to `drop` of that (a broken tag on some pages); from
// `eventsOn` key events fall to `eventsDrop` of theirs (a broken sign-up form). Days in `empty` have no row.
function property({ from, to, dropOn = null, drop = 1, eventsOn = null, eventsDrop = 1, empty = [], seed = 5 }) {
  const u = lcg(seed), rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const lam = 600 * (dow === 0 || dow === 6 ? 0.6 : 1) * (dropOn && d >= dropOn ? drop : 1);
    const sessions = poisson(u, lam);
    const activeUsers = poisson(u, sessions * 0.8), screenPageViews = poisson(u, sessions * 2.5);
    const keyEvents = poisson(u, sessions * 0.03 * (eventsOn && d >= eventsOn ? eventsDrop : 1));
    rows.push({ date: d, sessions, activeUsers, screenPageViews, keyEvents, totalRevenue: keyEvents * 19.5 });
  }
  return rows;
}

// `today` is the property's own date; "NdaysAgo" is read against it, as the Data API reads it in the property's zone.
function standIn(rows, { today, deny = false, thresholded = false, pageCap = 10000 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.url === '/token') {
        const f = new URLSearchParams(raw);
        const [h, c, sig] = f.get('assertion').split('.');
        const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
        const ok = f.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && v.verify(publicKey, Buffer.from(sig, 'base64url'));
        calls.push({ kind: 'token', claims: JSON.parse(Buffer.from(c, 'base64url')) });
        return ok ? send(200, { access_token: 'ya29.ok', expires_in: 3599, token_type: 'Bearer' }) : send(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
      }
      const body = JSON.parse(raw);
      calls.push({ kind: 'report', url: req.url, auth: req.headers.authorization, body });
      if (req.headers.authorization !== 'Bearer ya29.ok') return send(401, { error: { code: 401, message: 'Request had invalid authentication credentials.' } });
      if (deny) return send(403, { error: { code: 403, message: 'User does not have sufficient permissions for this property.', status: 'PERMISSION_DENIED' } });
      const known = new Set(['sessions', 'activeUsers', 'screenPageViews', 'keyEvents', 'totalRevenue']);
      const bad = body.metrics.find((m) => !known.has(m.name));
      if (bad) return send(400, { error: { code: 400, message: `Field ${bad.name} is not a valid metric.`, status: 'INVALID_ARGUMENT' } });
      const resolve = (s) => (s === 'today' ? today : /^\d+daysAgo$/.test(s) ? addDays(today, -parseInt(s, 10)) : s);
      const a = resolve(body.dateRanges[0].startDate), b = resolve(body.dateRanges[0].endDate);
      const inRange = rows.filter((r) => r.date >= a && r.date <= b);
      const off = Number(body.offset), lim = Math.min(Number(body.limit), pageCap);
      // Metrics answered in reverse order, to check columns are matched by header name, not position.
      const names = body.metrics.map((m) => m.name).reverse();
      send(200, {
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: names.map((name) => ({ name, type: name === 'totalRevenue' ? 'TYPE_CURRENCY' : 'TYPE_INTEGER' })),
        rows: inRange.slice(off, off + lim).map((r) => ({ dimensionValues: [{ value: compact(r.date) }], metricValues: names.map((n) => ({ value: String(r[n]) })) })),
        rowCount: inRange.length,
        metadata: { currencyCode: 'USD', timeZone: 'America/New_York', ...(thresholded ? { subjectToThresholding: true } : {}) },
        kind: 'analyticsData#runReport',
      });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, env: { GA4_API_BASE: base, GA4_TOKEN_URL: `${base}/token`, GA4_SERVICE_ACCOUNT_JSON: JSON.stringify(KEY) }, close: () => new Promise((r) => server.close(r)) });
  }));
}

const NOW = Date.parse('2026-06-20T18:00:00Z');
const TODAY = '2026-06-20';

test('property IDs and metric lists are read strictly; a G- measurement ID is named as the wrong thing', () => {
  assert.equal(propertyId('123456789'), '123456789');
  assert.equal(propertyId('properties/123456789'), '123456789');
  assert.equal(propertyId('p123456789'), '123456789');
  assert.throws(() => propertyId('G-ABC123XYZ'), /measurement ID, not the property/);
  assert.deepEqual(parseMetrics('sessions, keyEvents ,customEvent:signup'), ['sessions', 'keyEvents', 'customEvent:signup']);
  assert.throws(() => parseMetrics('sessions,sessions'), /twice/);
  assert.throws(() => parseMetrics('a,b,c,d,e,f,g,h,i,j,k'), /1 to 10/);
  assert.throws(() => parseMetrics('ses sions'), /not a Data API metric/);
});

test('only loopback stand-ins are taken for the endpoints', () => {
  assert.deepEqual(endpoints({}), { api: 'https://analyticsdata.googleapis.com/v1beta', tokenUrl: 'https://oauth2.googleapis.com/token' });
  assert.throws(() => endpoints({ GA4_TOKEN_URL: 'https://evil.example/token' }), /loopback/);
  assert.throws(() => endpoints({ GA4_API_BASE: 'http://10.0.0.1:80' }), /loopback/);
});

test('fetches days with the analytics.readonly scope, pages, matches columns by name, fills a missing day, then extends', async () => {
  const rows = property({ from: '2025-01-01', to: TODAY, empty: ['2026-03-03'] });
  const s = await standIn(rows, { today: TODAY, pageCap: 50 });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ga4-'));
    const outPath = join(dir, 'data', 'ga4.csv');
    const said = [];
    assert.equal(await main(['--property', '123456789', '--out', outPath, '--days', '120'], { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    assert.equal(s.calls[0].claims.scope, 'https://www.googleapis.com/auth/analytics.readonly');
    assert.equal(s.calls[0].claims.aud, s.env.GA4_TOKEN_URL);
    const reports = s.calls.filter((c) => c.kind === 'report');
    assert.equal(reports.length, 3, 'paged at the stand-in\'s 50-row cap: 119 rows in 3 pages');
    assert.equal(reports[0].url, '/properties/123456789:runReport');
    assert.deepEqual(reports[0].body.dateRanges, [{ startDate: '2026-02-20', endDate: '1daysAgo' }]);
    assert.deepEqual(reports[0].body.dimensions, [{ name: 'date' }]);
    assert.deepEqual(reports[0].body.metrics.map((m) => m.name), DEFAULT_METRICS);
    assert.deepEqual(reports.map((r) => r.body.offset), ['0', '50', '100']);
    const got = readExisting(readFileSync(outPath, 'utf8'), DEFAULT_METRICS);
    assert.equal(got[0].date, '2026-02-20');
    assert.equal(got[got.length - 1].date, '2026-06-19'); // --lag 1: yesterday in the property's zone
    assert.equal(got.length, 120);
    assert.deepEqual(got.find((r) => r.date === '2026-03-03').values, { sessions: 0, activeUsers: 0, screenPageViews: 0, keyEvents: 0 });
    const one = got.find((r) => r.date === '2026-03-04'), src = rows.find((r) => r.date === '2026-03-04');
    assert.deepEqual(one.values, { sessions: src.sessions, activeUsers: src.activeUsers, screenPageViews: src.screenPageViews, keyEvents: src.keyEvents });
    assert.match(said.join(''), /120 days to 2026-06-19/);

    // Two days later: the last 4 days are asked for again, the rest kept byte for byte.
    s.calls.length = 0;
    const before = readFileSync(outPath, 'utf8').split('\n');
    assert.equal(await main(['--property', 'properties/123456789', '--out', outPath], { env: s.env, now: () => NOW + 2 * 86400000, out: quiet, err: quiet }), 0);
    const r2 = s.calls.find((c) => c.kind === 'report');
    assert.equal(r2.body.dateRanges[0].startDate, '2026-06-16');
    const after = readFileSync(outPath, 'utf8').split('\n');
    assert.deepEqual(after.slice(0, 117), before.slice(0, 117));
    assert.equal(readExisting(after.join('\n'), DEFAULT_METRICS).length, 120); // the stand-in's today did not move
  } finally { await s.close(); }
});

test('--metrics with revenue writes decimals; thresholding is warned about; other columns refetch afresh', async () => {
  const s = await standIn(property({ from: '2026-04-01', to: TODAY }), { today: TODAY, thresholded: true });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ga4-'));
    const outPath = join(dir, 'ga4.csv');
    writeFileSync(outPath, 'date,sessions\n2026-05-01,3\n');
    const warn = [];
    await main(['--property', '123456789', '--out', outPath, '--days', '30', '--lag', '2', '--metrics', 'sessions,totalRevenue'], { env: s.env, now: () => NOW, out: quiet, err: (t) => warn.push(t) });
    const text = readFileSync(outPath, 'utf8');
    assert.match(text, /^date,sessions,totalRevenue\n2026-05-21,/);
    assert.equal(s.calls.find((c) => c.kind === 'report').body.dateRanges[0].endDate, '2daysAgo');
    assert.equal(readExisting(text, ['sessions', 'totalRevenue']).at(-1).date, '2026-06-18');
    assert.match(warn.join(''), /other columns than this run writes/);
    assert.match(warn.join(''), /thresholding/);
  } finally { await s.close(); }
});

test('clear errors: no permission, a bad metric, a refused key, no property, no credentials', async () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'ga4-')), 'ga4.csv');
  const d = await standIn([], { today: TODAY, deny: true });
  try {
    await assert.rejects(main(['--property', '123456789', '--out', outPath], { env: d.env, now: () => NOW, out: quiet, err: quiet }), /403.*Viewer of property 123456789.*Property access management/);
  } finally { await d.close(); }
  const s = await standIn([], { today: TODAY });
  try {
    await assert.rejects(main(['--property', '123456789', '--out', outPath, '--metrics', 'sessions,bounces'], { env: s.env, now: () => NOW, out: quiet, err: quiet }), /400.*bounces is not a valid metric.*--metrics/);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    await assert.rejects(main(['--property', '123456789', '--out', outPath], { env: { ...s.env, GA4_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...KEY, private_key: other.privateKey }) }, now: () => NOW, out: quiet, err: quiet }), /refused the service account \(400: invalid_grant.*Data API/);
    await assert.rejects(main(['--out', outPath], { env: s.env, now: () => NOW }), /Give --property/);
    await assert.rejects(main(['--property', '123456789', '--out', outPath], { env: {}, now: () => NOW }), /Set GA4_SERVICE_ACCOUNT_JSON/);
    await assert.rejects(main(['--property', '123456789', '--out', outPath], { env: { GA4_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}' }, now: () => NOW }), /GA4_SERVICE_ACCOUNT_JSON is not a service account key/);
  } finally { await s.close(); }
});

test('a report download converts: Date or Nth day, comment lines, a grand total, quoted thousands, UI titles', () => {
  const dated = '# ----------------------------------------\n# Traffic acquisition\n# Start date: 20260601\n# End date: 20260604\n# ----------------------------------------\n\nDate,Sessions,Active users,Key events,Total revenue\n20260604,120,100,4,78.5\n20260601,"1,100",900,30,585\n20260603,90,80,2,39\nGrand total,"1,310","1,080",36,702.5\n\nSession source,Sessions\ngoogle,900\n';
  const a = fromExport(dated);
  assert.deepEqual(a.metrics, ['sessions', 'activeUsers', 'keyEvents', 'totalRevenue']);
  assert.deepEqual(a.rows.map((r) => r.date), ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
  assert.deepEqual(a.rows[0].values, { sessions: 1100, activeUsers: 900, keyEvents: 30, totalRevenue: 585 });
  assert.deepEqual(a.rows[1].values, { sessions: 0, activeUsers: 0, keyEvents: 0, totalRevenue: 0 });
  assert.match(toCsv(a.rows, a.metrics), /^date,sessions,activeUsers,keyEvents,totalRevenue\n2026-06-01,1100,900,30,585\n/);

  const nth = '# Start date: 20260530\n# End date: 20260601\nNth day,Users,Views\n0000,50,120\n0001,55,130\n0002,60,140\n';
  const b = fromExport(nth);
  assert.deepEqual(b.metrics, ['activeUsers', 'screenPageViews']);
  assert.deepEqual(b.rows.map((r) => [r.date, r.values.activeUsers]), [['2026-05-30', 50], ['2026-05-31', 55], ['2026-06-01', 60]]);

  assert.throws(() => fromExport('Nth day,Users\n0000,5\n'), /no "# Start date:"/);
  assert.throws(() => fromExport('Page path,Views\n/a,5\n'), /no table with a Date or Nth day/);
  assert.throws(() => fromExport('Date,Sessions\n20260601,5\n20260601,6\n'), /twice.*comparison/);
  assert.throws(() => fromExport('Date,Sessions\n2026-06-01,5\n'), /not YYYYMMDD/);
});

test('a tag broken on half the pages and a sign-up form that stops working: the watch hears both', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ga4-'));
  const rows = property({ from: '2025-09-01', to: '2026-04-30', dropOn: '2026-03-16', drop: 0.55, eventsOn: '2026-01-12', eventsDrop: 0.4, seed: 11 });
  const csvPath = join(dir, 'ga4.csv');
  const filled = fillDays(rows.map((r) => ({ date: r.date, values: r })), DEFAULT_METRICS, '2025-09-01', '2026-04-30');
  writeFileSync(csvPath, toCsv(filled, DEFAULT_METRICS));
  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', 'sessions:poisson,activeUsers:poisson,keyEvents:poisson'], { out: (t) => said.push(t), err: quiet });
  const text = said.join('');
  assert.match(text, /sessions[\s\S]*2026-03-1[4-8]/);
  assert.match(text, /keyEvents[\s\S]*2026-01-(0[89]|1[0-6])/);
});

test('the self-deploy workflow fetches Analytics metrics, watches three columns, never commits the CSV', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const s = await standIn(property({ from: addDays(today, -500), to: today }), { today });
  try {
    const root = mkdtempSync(join(tmpdir(), 'ga4-wf-')), dev = join(root, 'dev'), remote = join(root, 'remote.git');
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    execFileSync('sh', [new URL('./deploy/make-watch-repo.sh', import.meta.url).pathname, dev], { encoding: 'utf8' });
    assert.ok(existsSync(join(dev, 'ga4-metrics.mjs')));
    assert.match(readFileSync(join(dev, '.gitignore'), 'utf8'), /^data\/ga4\.csv$/m);
    git(root, 'init', '-q', '--bare', '-b', 'main', remote);
    git(dev, 'init', '-q', '-b', 'main');
    git(dev, 'add', '.');
    git(dev, 'commit', '-qm', 'watch analytics');
    git(dev, 'remote', 'add', 'origin', `file://${remote}`);
    git(dev, 'push', '-q', '-u', 'origin', 'main');
    const { GA4_SERVICE_ACCOUNT_JSON, ...env } = s.env;
    const result = await runInChild({ workflow: join(dev, '.github/workflows/watch-metric.yml'), remote, vars: { GA4_PROPERTY: '123456789' }, secrets: { GA4_SERVICE_ACCOUNT_JSON }, env });
    assert.ok(result.ok, JSON.stringify(result.steps.map((x) => [x.name, x.code, x.stderr]), null, 1));
    const fetchStep = result.steps.find((x) => x.name === 'Fetch Google Analytics metrics');
    assert.match(fetchStep.stdout, /data\/ga4\.csv: 480 days to /);
    assert.ok(!JSON.stringify(result.steps).includes('PRIVATE KEY'), 'the key is never printed');
    git(dev, 'pull', '-q', '--rebase');
    const st = JSON.parse(readFileSync(join(dev, 'watch-state.json'), 'utf8'));
    assert.deepEqual(Object.keys(st.columns ?? st).filter((k) => ['sessions', 'activeUsers', 'keyEvents'].includes(k)).sort(), ['activeUsers', 'keyEvents', 'sessions']);
    assert.equal(git(dev, 'ls-files', 'data/ga4.csv').trim(), '', 'the CSV is not committed');
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
