// search-console-metrics.mjs against a stand-in for Google's OAuth token endpoint and searchanalytics.query (the
// documented shapes: a form POST with grant_type jwt-bearer and an RS256 assertion; a JSON POST with dimensions
// ['date'] answering { rows: [{ keys, clicks, impressions, ctr, position }], metadata: { first_incomplete_date } }),
// then through the watch and the CLI's --events. Nothing here talks to Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, fromExport, fillDays, serviceAccountAssertion, endpoints, pacificToday, readExisting } from './search-console-metrics.mjs';
import { main as watchMain } from './watch.mjs';
import { main as cliMain } from './cli.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const KEY = { type: 'service_account', client_email: 'watch@demo-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'k1' };
const addDays = (day, k) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const quiet = () => {};

// A site: ~400 clicks a day with a weekly cycle (weekends 70%), falling to `drop` of that from `dropOn`; days in `empty`
// have no rows at all (Search Console omits a day with no impressions).
function site({ from, to, dropOn = null, drop = 0.6, empty = [], seed = 3 }) {
  const u = lcg(seed), rows = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (empty.includes(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const lam = 400 * (dow === 0 || dow === 6 ? 0.7 : 1) * (dropOn && d >= dropOn ? drop : 1);
    const clicks = poisson(u, lam), impressions = clicks * 25 + poisson(u, 200);
    rows.push({ keys: [d], clicks, impressions, ctr: clicks / impressions, position: 8 + u() * 2 });
  }
  return rows;
}

function standIn(rows, { firstIncomplete = null, deny = false } = {}) {
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
        calls.push({ kind: 'token', claims: JSON.parse(Buffer.from(c, 'base64url')), header: JSON.parse(Buffer.from(h, 'base64url')) });
        return ok ? send(200, { access_token: 'ya29.ok', expires_in: 3599, token_type: 'Bearer' }) : send(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
      }
      const body = JSON.parse(raw);
      calls.push({ kind: 'query', url: req.url, auth: req.headers.authorization, body });
      if (req.headers.authorization !== 'Bearer ya29.ok') return send(401, { error: { message: 'Request had invalid authentication credentials.' } });
      if (deny) return send(403, { error: { message: "User does not have sufficient permission for site 'sc-domain:example.com'." } });
      const inRange = rows.filter((r) => r.keys[0] >= body.startDate && r.keys[0] <= body.endDate);
      const ans = { rows: inRange.slice(body.startRow, body.startRow + body.rowLimit), responseAggregationType: 'byProperty' };
      if (firstIncomplete && body.dataState === 'all' && firstIncomplete <= body.endDate) ans.metadata = { first_incomplete_date: firstIncomplete };
      send(200, ans);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ calls, env: { GSC_API_BASE: base, GSC_TOKEN_URL: `${base}/token`, GSC_SERVICE_ACCOUNT_JSON: JSON.stringify(KEY) }, close: () => new Promise((r) => server.close(r)) });
  }));
}

const NOW = Date.parse('2026-06-20T18:00:00Z'); // 11:00 in California: Search Console's today is 2026-06-20

test('the assertion is a verifiable RS256 JWT with the read-only scope', () => {
  const jwt = serviceAccountAssertion(KEY, { nowSec: 1_700_000_000, tokenUrl: 'https://oauth2.googleapis.com/token' });
  const [h, c, s] = jwt.split('.');
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
  assert.ok(v.verify(publicKey, Buffer.from(s, 'base64url')));
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.deepEqual(claims, { iss: KEY.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: 1_700_000_000, exp: 1_700_003_600 });
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).kid, 'k1');
  assert.throws(() => serviceAccountAssertion({ client_email: 'x' }, { nowSec: 1 }), /not a service account key/);
});

test('only loopback stand-ins are taken for the endpoints', () => {
  assert.deepEqual(endpoints({}), { api: 'https://searchconsole.googleapis.com/webmasters/v3', tokenUrl: 'https://oauth2.googleapis.com/token' });
  assert.throws(() => endpoints({ GSC_TOKEN_URL: 'https://evil.example/token' }), /loopback/);
  assert.throws(() => endpoints({ GSC_API_BASE: 'http://10.0.0.1:80' }), /loopback/);
});

test("Search Console's day is Pacific time", () => {
  assert.equal(pacificToday(Date.parse('2026-06-21T05:00:00Z')), '2026-06-20'); // 22:00 PDT
  assert.equal(pacificToday(Date.parse('2026-06-21T08:00:00Z')), '2026-06-21');
});

test('fetches days, drops the incomplete ones, fills an empty day with blanks, then extends with a refetch', async () => {
  const rows = site({ from: '2025-01-01', to: '2026-06-19', empty: ['2026-03-03'] });
  const s = await standIn(rows, { firstIncomplete: '2026-06-18' });
  try {
    const dir = mkdtempSync(join(tmpdir(), 'gsc-'));
    const outPath = join(dir, 'data', 'gsc.csv');
    const said = [];
    assert.equal(await main(['--site', 'sc-domain:example.com', '--out', outPath, '--days', '120'], { env: s.env, now: () => NOW, out: (t) => said.push(t), err: quiet }), 0);
    const q = s.calls.find((c) => c.kind === 'query');
    assert.equal(q.url, `/sites/${encodeURIComponent('sc-domain:example.com')}/searchAnalytics/query`);
    assert.deepEqual(q.body, { startDate: '2026-02-20', endDate: '2026-06-19', dimensions: ['date'], type: 'web', dataState: 'all', rowLimit: 25000, startRow: 0 });
    assert.equal(s.calls[0].claims.aud, s.env.GSC_TOKEN_URL);
    const got = readExisting(readFileSync(outPath, 'utf8'));
    assert.equal(got[0].date, '2026-02-20');
    assert.equal(got[got.length - 1].date, '2026-06-17'); // 06-18 and 06-19 still being collected
    assert.equal(got.length, 118);
    const gap = got.find((r) => r.date === '2026-03-03');
    assert.deepEqual(gap, { date: '2026-03-03', clicks: 0, impressions: 0, ctr: '', position: '' });
    const one = got.find((r) => r.date === '2026-03-04'), src = rows.find((r) => r.keys[0] === '2026-03-04');
    assert.equal(one.clicks, src.clicks);
    assert.equal(one.ctr, (src.ctr * 100).toFixed(2));
    assert.match(said.join(''), /118 days to 2026-06-17/);

    // Two days later: the last 4 days are asked for again, the rest kept.
    s.calls.length = 0;
    assert.equal(await main(['--site', 'sc-domain:example.com', '--out', outPath], { env: s.env, now: () => NOW + 2 * 86400000, out: quiet, err: quiet }), 0);
    const q2 = s.calls.find((c) => c.kind === 'query');
    assert.equal(q2.body.startDate, '2026-06-14');
    assert.equal(q2.body.endDate, '2026-06-21');
    const after = readExisting(readFileSync(outPath, 'utf8'));
    assert.equal(after[after.length - 1].date, '2026-06-17'); // the stand-in still says 06-18 is incomplete
    assert.deepEqual(after.slice(0, 114), got.slice(0, 114));
  } finally { await s.close(); }
});

test('with no incomplete day named, the latest returned day is the last one written', async () => {
  const s = await standIn(site({ from: '2026-05-01', to: '2026-06-16' }));
  try {
    const outPath = join(mkdtempSync(join(tmpdir(), 'gsc-')), 'gsc.csv');
    await main(['--site', 'https://www.example.com/', '--out', outPath, '--days', '30'], { env: s.env, now: () => NOW, out: quiet, err: quiet });
    const got = readExisting(readFileSync(outPath, 'utf8'));
    assert.equal(got[got.length - 1].date, '2026-06-16');
    assert.equal(got.length, 27); // 2026-05-21 to 06-16
  } finally { await s.close(); }
});

test('clear errors: a refused key, a missing permission, a mistyped property, no credentials', async () => {
  const s = await standIn([], { deny: true });
  try {
    const outPath = join(mkdtempSync(join(tmpdir(), 'gsc-')), 'gsc.csv');
    await assert.rejects(main(['--site', 'sc-domain:example.com', '--out', outPath], { env: s.env, now: () => NOW, out: quiet, err: quiet }), /403.*Users and permissions/);
    const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    await assert.rejects(main(['--site', 'sc-domain:example.com', '--out', outPath], { env: { ...s.env, GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...KEY, private_key: other.privateKey }) }, now: () => NOW, out: quiet, err: quiet }), /refused the service account \(400: invalid_grant/);
    await assert.rejects(main(['--site', 'example.com', '--out', outPath], { env: s.env, now: () => NOW }), /not a Search Console property/);
    await assert.rejects(main(['--site', 'sc-domain:example.com', '--out', outPath], { env: {}, now: () => NOW }), /Set GSC_SERVICE_ACCOUNT_JSON/);
    await assert.rejects(main(['--site', 'sc-domain:example.com', '--out', outPath], { env: { GSC_SERVICE_ACCOUNT_JSON: '{nope' }, now: () => NOW }), /not JSON/);
  } finally { await s.close(); }
});

test('a UI export (newest first, CTR with %) converts to the same file, oldest first, gaps filled', () => {
  const text = '\uFEFFDate,Clicks,Impressions,CTR,Position\n2026-06-03,120,3000,4%,7.5\n2026-06-01,100,2500,4%,8.25\n2026-05-31,90,2000,4.5%,8\n';
  const rows = fromExport(text);
  assert.deepEqual(rows.map((r) => r.date), ['2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03']);
  assert.deepEqual(rows[1], { date: '2026-06-01', clicks: 100, impressions: 2500, ctr: '4.00', position: '8.25' });
  assert.deepEqual(rows[2], { date: '2026-06-02', clicks: 0, impressions: 0, ctr: '', position: '' });
  assert.throws(() => fromExport('Top queries,Clicks\nfoo,3\n'), /not YYYY-MM-DD.*Dates table/);
  assert.throws(() => fromExport('Date,Clicks,Impressions,CTR,Position\n2026-06-01,1,2,50%,3\n2026-06-01,1,2,50%,3\n'), /twice/);
});

test('a site that loses 40% of its clicks: the watch hears it, and --events puts it inside the update window', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsc-'));
  const rows = site({ from: '2025-09-01', to: '2026-04-30', dropOn: '2026-03-16', drop: 0.6, seed: 11 });
  const csvPath = join(dir, 'gsc.csv');
  writeFileSync(csvPath, 'date,clicks,impressions,ctr,position\n' + fillDays(rows.map((r) => ({ date: r.keys[0], ...r })), '2025-09-01', '2026-04-30').map((r) => [r.date, r.clicks, r.impressions, r.ctr, r.position].join(',')).join('\n') + '\n');

  const said = [];
  await watchMain([csvPath, '--state', join(dir, 's.json'), '--columns', 'clicks:poisson,impressions:poisson'], { out: (t) => said.push(t), err: quiet });
  assert.match(said.join(''), /clicks/);
  assert.match(said.join(''), /2026-03-1[4-8]/);

  const events = join(dir, 'events.csv');
  writeFileSync(events, 'start,end,label\n2026-03-13,2026-03-27,an update window\n2025-11-11,2025-11-25,an earlier window\n');
  let text = '';
  await cliMain([csvPath, '--column', 'clicks', '--model', 'poisson', '--period', '7', '--events', events, '--no-agreed'], { out: (t) => { text += t; } });
  assert.match(text, /inside an update window \(2026-03-13 to 2026-03-27\)/);
  assert.match(text, /by chance \d+% of the time/);
  assert.match(text, /Events with no change found in them: an earlier window/);
});
