// The Worker's route scenarios (worker.test.mjs, inbox.test.mjs), run through
// the Lambda adapter with the DynamoDB store, plus what only the AWS path has:
// the CloudFront origin check, header spoofing, and SES inbound mail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, toRequest, viewerIp, sesVerdictDrop, s3Reader } from './aws/lambda.mjs';
import { dynamoStore } from './aws/dynamo-store.mjs';
import { fakeDynamo } from './aws/fake-dynamo.mjs';
import { MAX_RAW } from './inbox.mjs';

const ORIGIN = 'https://marisstella.app';
const VERIFY = 'cloudfront-shared-secret';
const TOKEN = 'inbox-token';

function setup({ config = {}, objects = {}, now } = {}) {
  const db = fakeDynamo();
  const store = dynamoStore({ call: db.call, table: 'edge' });
  const logs = [];
  const handler = createHandler({
    store,
    secrets: async () => ({ originVerify: VERIFY, inboxToken: TOKEN }),
    getObject: async (bucket, key, limit) => {
      const text = objects[`${bucket}/${key}`];
      if (text === undefined) throw new Error('missing');
      return new Blob([text.slice(0, limit + 1)]).stream();
    },
    config: { ALLOWED_ORIGIN: ORIGIN, FEEDBACK_DAILY_CAP: '2', INBOX_BUCKET: 'inbound', INBOX_PREFIX: 'inbox/', ...config },
    log: (o) => logs.push(o),
    ...(now ? { now } : {}),
  });
  return { handler, db, logs };
}

const ev = (path, { method = 'POST', body, headers = {}, query = '', verify = VERIFY, b64 = false } = {}) => ({
  version: '2.0',
  rawPath: path,
  rawQueryString: query,
  headers: { 'user-agent': 'Mozilla/5.0', ...(verify ? { 'x-origin-verify': verify } : {}), ...headers },
  requestContext: { http: { method, sourceIp: '130.176.0.1' } },
  ...(body !== undefined ? { body: b64 ? Buffer.from(body).toString('base64') : body, isBase64Encoded: b64 } : {}),
});
const hit = (h, p, headers = {}) => h(ev('/hit', { body: JSON.stringify(p), headers }));
const counts = async (h, query = '') => JSON.parse((await h(ev('/counts', { method: 'GET', query }))).body).days;
const post = (h, body, headers = {}) => h(ev('/feedback', { body: JSON.stringify(body), headers: { origin: ORIGIN, 'cloudfront-viewer-address': '203.0.113.9:443', ...headers } }));

test('without the CloudFront secret header every route is a 403 that touches nothing', async () => {
  const { handler, db } = setup();
  for (const verify of [null, 'wrong']) {
    const r = await handler(ev('/hit', { body: JSON.stringify({ p: 'roof-bid' }), verify }));
    assert.equal(r.statusCode, 403);
  }
  assert.equal((await handler(ev('/healthz', { method: 'GET', verify: null }))).statusCode, 403);
  assert.equal(db.calls.length, 0);
});

test('/healthz, 404, preflight', async () => {
  const { handler } = setup();
  const ok = await handler(ev('/healthz', { method: 'GET' }));
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, 'ok\n');
  assert.equal((await handler(ev('/nope', { body: '' }))).statusCode, 404);
  const pre = await handler(ev('/feedback', { method: 'OPTIONS', headers: { origin: ORIGIN } }));
  assert.equal(pre.statusCode, 204);
  assert.equal(pre.headers['access-control-allow-methods'], 'POST');
  assert.equal(pre.headers['access-control-allow-origin'], ORIGIN);
});

test('/hit is an empty 204 either way, and counts page, ref, src, geo (from CloudFront) and device', async () => {
  const { handler } = setup();
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148';
  for (let i = 0; i < 2; i++) {
    const r = await hit(handler, { p: 'roof-bid', r: 'npm', s: 'google' }, { 'cloudfront-viewer-country': 'GB', 'user-agent': iphone });
    assert.equal(r.statusCode, 204);
    assert.equal(r.body, '');
  }
  await hit(handler, { p: 'roof-bid' }, { dnt: '1' });
  assert.equal((await hit(handler, { p: '../etc' })).statusCode, 204);
  await hit(handler, { p: 'roof-bid' }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  const days = await counts(handler);
  const [day] = Object.keys(days);
  assert.deepEqual(days[day], {
    'roof-bid': 3, 'ref:npm': 2, 'src:google': 2, 'geo:GB': 2, 'dev:mobile': 2, 'dev:desktop': 1,
    'bot:googlebot': 1, 'botpage:roof-bid': 1,
  });
});

test('a funnel event adds to its fn: key only', async () => {
  const { handler } = setup();
  await hit(handler, { p: 'c/restaurants', e: 'cta_click', i: 'restaurants', t: 'menu-suite' }, { 'cloudfront-viewer-country': 'US' });
  await hit(handler, { p: 'products', e: 'products_view' });
  await hit(handler, { p: 'products', e: 'signup' });
  await hit(handler, { p: 'products', e: 'products_view' }, { 'user-agent': 'Googlebot/2.1' });
  assert.deepEqual(Object.values(await counts(handler))[0], {
    'fn:cta_click:restaurants:menu-suite:c/restaurants': 1,
    'fn:products_view:_:_:products': 1,
  });
});

test('the per-key daily cap holds (MAX_PER_SLUG_PER_DAY)', async () => {
  const { handler } = setup({ config: { MAX_PER_SLUG_PER_DAY: '2' } });
  for (let i = 0; i < 4; i++) await hit(handler, { p: 'roof-bid' });
  const days = await counts(handler);
  assert.equal(Object.values(days)[0]['roof-bid'], 2);
  assert.equal(Object.values(days)[0]['dev:desktop'], 2, 'a refused load adds no breakdowns');
});

test('/counts?since= keeps days from that date and ignores a malformed value', async () => {
  const { handler, db } = setup();
  await db.call('UpdateItem', { TableName: 'edge', Key: { pk: { S: 'COUNT' }, sk: { S: '2026-01-01#a' } }, UpdateExpression: 'SET #d = :d, #s = :s ADD #n :one', ExpressionAttributeNames: { '#d': 'day', '#s': 'slug', '#n': 'n' }, ExpressionAttributeValues: { ':d': { S: '2026-01-01' }, ':s': { S: 'a' }, ':one': { N: '1' } } });
  await hit(handler, { p: 'roof-bid' });
  assert.equal(Object.keys(await counts(handler, 'since=2026-06-01')).length, 1);
  assert.equal(Object.keys(await counts(handler, 'since=garbage')).length, 2);
  const r = await handler(ev('/counts', { method: 'GET' }));
  assert.equal(r.headers['access-control-allow-origin'], '*');
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('/feedback stores, refuses other origins, honours the daily cap, and serves what it stored', async () => {
  const { handler } = setup();
  assert.equal((await post(handler, { type: 'idea', tool: 'roof-bid', message: 'Add a metric toggle please' })).statusCode, 201);
  assert.equal((await post(handler, { type: 'idea', message: 'hello there' }, { origin: 'https://evil.example' })).statusCode, 403);
  assert.equal((await post(handler, { type: 'problem', tool: 'roof-bid', message: 'Second message here, mail a@b.co' }, { 'cloudfront-viewer-address': '203.0.113.10:1' })).statusCode, 201);
  const capped = await post(handler, { type: 'idea', message: 'third one today' }, { 'cloudfront-viewer-address': '203.0.113.11:1' });
  assert.equal(capped.statusCode, 429);
  assert.equal(JSON.parse(capped.body).error, 'daily-cap');
  const all = JSON.parse((await handler(ev('/feedback', { method: 'GET' }))).body).feedback;
  assert.deepEqual(all.map((r) => [r.id, r.tool, r.message]), [[1, 'roof-bid', 'Add a metric toggle please'], [2, 'roof-bid', 'Second message here, mail [email removed]']]);
  const later = JSON.parse((await handler(ev('/feedback', { method: 'GET', query: 'after=1' }))).body).feedback;
  assert.deepEqual(later.map((r) => r.id), [2]);
});

test('/feedback: honeypot dropped, malformed body 400, size cap, base64 bodies', async () => {
  const { handler, db } = setup({ config: { FEEDBACK_DAILY_CAP: '50' } });
  assert.equal((await post(handler, { type: 'idea', message: 'hello there', website: 'spam' })).statusCode, 200);
  assert.equal((await handler(ev('/feedback', { body: '{nope', headers: { origin: ORIGIN } }))).statusCode, 400);
  const big = JSON.stringify({ type: 'idea', message: 'x'.repeat(6000) });
  assert.equal((await handler(ev('/feedback', { body: big, headers: { origin: ORIGIN } }))).statusCode, 413);
  const b64 = await handler(ev('/feedback', { body: JSON.stringify({ type: 'idea', message: 'sent as base64' }), b64: true, headers: { origin: ORIGIN } }));
  assert.equal(b64.statusCode, 201);
  const stored = [...db.tables.get('edge').values()].filter((r) => r.pk === 'FEEDBACK');
  assert.deepEqual(stored.map((r) => r.message), ['sent as base64']);
});

test('the per-sender limit is 3 a minute, keyed by CloudFront viewer address, and stores no address', async () => {
  let t = Date.parse('2026-11-24T10:00:05Z');
  const { handler, db } = setup({ config: { FEEDBACK_DAILY_CAP: '50' }, now: () => t });
  const send = (addr, extra = {}) => post(handler, { type: 'idea', message: 'hello there' }, { 'cloudfront-viewer-address': addr, ...extra });
  for (let i = 0; i < 3; i++) assert.equal((await send('198.51.100.7:5000')).statusCode, 201);
  const slow = await send('198.51.100.7:5001');
  assert.equal(slow.statusCode, 429);
  assert.equal(JSON.parse(slow.body).error, 'slow-down');
  assert.equal((await send('198.51.100.8:5000')).statusCode, 201, 'another sender is not limited');
  // A client cannot pick its own key by sending the headers the Worker trusts.
  assert.equal((await send('198.51.100.7:1', { 'cf-connecting-ip': '192.0.2.1', 'x-edge-client-ip': '192.0.2.2' })).statusCode, 429);
  t += 60000;
  assert.equal((await send('198.51.100.7:5000')).statusCode, 201, 'next minute');
  const dump = JSON.stringify([...db.tables.get('edge').values()]);
  assert.ok(!dump.includes('198.51.100'), 'no address in the table');
});

test('/inbox answers only the token holder; DELETE erases one', async () => {
  const objects = { 'inbound/inbox/m1': 'Subject: Help\r\n\r\nHi' };
  const { handler } = setup({ objects });
  await handler(sesEvent('m1'));
  assert.equal((await handler(ev('/inbox', { method: 'GET' }))).statusCode, 404);
  assert.equal((await handler(ev('/inbox', { method: 'GET', headers: { authorization: 'Bearer wrong' } }))).statusCode, 404);
  const ok = await handler(ev('/inbox', { method: 'GET', headers: { authorization: `Bearer ${TOKEN}` } }));
  const { messages } = JSON.parse(ok.body);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, 'Help');
  assert.equal(messages[0].rcpt_to, 'support@marisstella.app');
  const del = await handler(ev('/inbox', { method: 'DELETE', query: 'id=1', headers: { authorization: `Bearer ${TOKEN}` } }));
  assert.deepEqual(JSON.parse(del.body), { deleted: 1 });
});

function sesEvent(messageId, receipt = {}) {
  return {
    Records: [{
      eventSource: 'aws:ses',
      ses: {
        mail: { messageId, source: 'a@example.com', destination: ['support@marisstella.app'], headers: [{ name: 'Subject', value: 'Help' }, { name: 'Message-ID', value: '<1@example.com>' }] },
        receipt: { recipients: ['support@marisstella.app'], spamVerdict: { status: 'PASS' }, virusVerdict: { status: 'PASS' }, dmarcVerdict: { status: 'PASS' }, ...receipt },
      },
    }],
  };
}

test('SES inbound: stored like the Worker email() path; spam, viruses and oversize mail are not', async () => {
  const objects = { 'inbound/inbox/ok': 'Subject: Help\r\n\r\nHi', 'inbound/inbox/big': 'x'.repeat(MAX_RAW + 10) };
  const { handler, db, logs } = setup({ objects });
  assert.deepEqual(await handler(sesEvent('ok')), { disposition: 'CONTINUE' });
  await handler(sesEvent('ok', { spamVerdict: { status: 'FAIL' } }));
  await handler(sesEvent('ok', { virusVerdict: { status: 'FAIL' } }));
  await handler(sesEvent('big'));
  const rows = [...db.tables.get('edge').values()].filter((r) => r.pk === 'INBOX');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message_id, '<1@example.com>');
  assert.deepEqual(logs.map((l) => l.why || l.inbox), ['stored', 'spam', 'virus', 'Message too large; the limit is 256 KB.']);
  assert.ok(!JSON.stringify(logs).includes('a@example.com'), 'logs carry no sender');
});

test('SES inbound honours INBOX_DAILY_CAP', async () => {
  const { handler, db } = setup({ objects: { 'inbound/inbox/m': 'Subject: x\r\n\r\ny' }, config: { INBOX_DAILY_CAP: '2' } });
  for (let i = 0; i < 3; i++) await handler(sesEvent('m'));
  assert.equal([...db.tables.get('edge').values()].filter((r) => r.pk === 'INBOX').length, 2);
});

test('helpers: viewerIp, toRequest, verdicts, s3Reader range', async () => {
  assert.equal(viewerIp('203.0.113.9:443'), '203.0.113.9');
  assert.equal(viewerIp('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(viewerIp('2001:db8::1'), '2001:db8::1');
  assert.equal(viewerIp(''), '');
  const r = toRequest(ev('/counts', { method: 'GET', query: 'since=2026-01-01', headers: { 'cloudfront-viewer-country': 'DE', 'cf-connecting-ip': '1.2.3.4' } }));
  assert.equal(new URL(r.url).search, '?since=2026-01-01');
  assert.equal(r.cf.country, 'DE');
  assert.equal(r.headers.get('cf-connecting-ip'), null);
  assert.equal(r.headers.get('x-origin-verify'), null, 'the secret is not passed on to the handler');
  assert.equal(new URL(toRequest(ev('/_edge/hit'), { prefix: '/_edge' }).url).pathname, '/hit');
  assert.equal(new URL(toRequest(ev('/_edge'), { prefix: '/_edge' }).url).pathname, '/');
  assert.equal(new URL(toRequest(ev('/_edgex/hit'), { prefix: '/_edge' }).url).pathname, '/_edgex/hit');
  assert.equal(sesVerdictDrop({ dmarcVerdict: { status: 'FAIL' }, dmarcPolicy: 'REJECT' }), 'dmarc');
  assert.equal(sesVerdictDrop({ dmarcVerdict: { status: 'FAIL' }, dmarcPolicy: 'NONE' }), '');
  const seen = [];
  const read = s3Reader({ region: 'us-east-1', request: async (req) => { seen.push(req); return new Response('abc'); } });
  await read('b', 'inbox/a b', 10);
  assert.deepEqual(seen[0], { method: 'GET', path: '/inbox/a%20b', headers: { range: 'bytes=0-10' } });
});
