// The early-access list end to end through the Worker, on the DynamoDB store's
// strict fake (env.STORE), plus the pure rules. Storage semantics for both
// stores are in aws-store-contract.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import { dynamoStore } from './aws/dynamo-store.mjs';
import { fakeDynamo } from './aws/fake-dynamo.mjs';
import { earlyAccessRecord, normaliseEmail, CONSENT_VERSION, EARLY_ACCESS_PRODUCTS, NOTE_MAX } from './early-access.mjs';

const ORIGIN = 'https://marisstella.app';
const TOKEN = 'a-long-random-token-for-the-tests-only';
const env = (over = {}) => ({
  STORE: dynamoStore({ call: fakeDynamo().call, table: 'edge' }), ALLOWED_ORIGIN: ORIGIN, INBOX_TOKEN: TOKEN, ...over,
});
const post = (body, headers = { origin: ORIGIN }) => new Request('https://edge.example/early-access', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers },
});
const get = (path, token) => new Request(`https://edge.example${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const del = (path, token) => new Request(`https://edge.example${path}`, { method: 'DELETE', headers: token ? { authorization: `Bearer ${token}` } : {} });
const ok = { product: 'payapps', email: ' Pat@Example.COM ', role: 'Drywall sub, 12 people', note: 'We bill 6 GCs a month.', consent: true, page: '/industries/construction/' };

test('rules: product from the list, a plain address, consent ticked; the honeypot drops silently', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  assert.deepEqual(earlyAccessRecord(ok, now).record, {
    received: '2026-11-26T12:00:00.000Z', product: 'payapps', email: 'pat@example.com',
    role: 'Drywall sub, 12 people', note: 'We bill 6 GCs a month.', page: '/industries/construction/', consent: CONSENT_VERSION,
  });
  assert.equal(earlyAccessRecord({ ...ok, product: 'nope' }).error, 'product');
  assert.equal(earlyAccessRecord({ ...ok, product: '__proto__' }).error, 'product');
  assert.equal(earlyAccessRecord({ ...ok, product: 'constructor' }).error, 'product');
  assert.equal(earlyAccessRecord({ ...ok, consent: 'yes' }).error, 'consent', 'only a real true counts');
  assert.equal(earlyAccessRecord({ ...ok, consent: undefined }).error, 'consent');
  assert.equal(earlyAccessRecord({ ...ok, website: 'http://spam' }).drop, true);
  assert.equal(earlyAccessRecord([ok]).error, 'body');
  for (const bad of ['', 'pat', 'pat@', '@x.com', 'pat@x', 'a b@x.com', '<pat@x.com>', 'pat@x.com\nbcc:y@z.com', `${'a'.repeat(65)}@x.com`, 42]) {
    assert.equal(normaliseEmail(bad), '', `refused: ${JSON.stringify(bad)}`);
  }
  assert.equal(normaliseEmail("o'neil+pay@sub.example.co.uk"), "o'neil+pay@sub.example.co.uk");
  const long = earlyAccessRecord({ ...ok, note: `x\u0000\u0007y${'z'.repeat(NOTE_MAX + 50)}`, page: 'https://evil.example/' }).record;
  assert.equal(long.note.length, NOTE_MAX);
  assert.ok(long.note.startsWith('xyz'), 'control characters removed');
  assert.equal(long.page, '', 'only a site path is kept');
  assert.ok(Object.keys(EARLY_ACCESS_PRODUCTS).includes('payapps'));
});

test('a sign-up is stored privately: counts are public, rows need the token, erasure works', async () => {
  const e = env();
  let res = await worker.fetch(post(ok), e);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  res = await worker.fetch(post({ ...ok, email: 'pat@example.com' }), e);
  assert.equal(res.status, 201, 'a repeat answers the same, so the form tells nobody who is on the list');
  await worker.fetch(post({ ...ok, product: 'cmmc', email: 'lee@shop.example' }), e);

  res = await worker.fetch(get('/early-access/counts'), e);
  assert.equal(res.status, 200);
  const { counts } = await res.json();
  assert.equal(counts.payapps, 1);
  assert.equal(counts.cmmc, 1);
  assert.equal(counts['jobshop-quote'], 0, 'every product listed, zero included');
  assert.ok(!JSON.stringify(counts).includes('@'), 'no address in the public answer');

  for (const token of [undefined, 'wrong-token-of-a-decent-length-here']) {
    res = await worker.fetch(get('/early-access', token), e);
    assert.equal(res.status, 404, 'closed without the token');
    assert.ok(!(await res.text()).includes('@'));
  }
  res = await worker.fetch(get('/early-access', TOKEN), e);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const { signups } = await res.json();
  assert.deepEqual(signups.map((r) => [r.product, r.email]), [['payapps', 'pat@example.com'], ['cmmc', 'lee@shop.example']]);

  assert.equal((await worker.fetch(del('/early-access?email=pat@example.com'), e)).status, 404);
  res = await worker.fetch(del('/early-access?email=PAT@example.com', TOKEN), e);
  assert.deepEqual(await res.json(), { deleted: 1 });
  assert.equal((await (await worker.fetch(get('/early-access/counts'), e)).json()).counts.payapps, 0);
});

test('closed when INBOX_TOKEN is unset, even to an empty bearer', async () => {
  const e = env({ INBOX_TOKEN: '' });
  await worker.fetch(post(ok), e);
  assert.equal((await worker.fetch(get('/early-access', ''), e)).status, 404);
  assert.equal((await worker.fetch(new Request('https://edge.example/early-access', { headers: { authorization: 'Bearer ' } }), e)).status, 404);
});

test('refusals: other origins, bad bodies, oversized posts, the limiter and the daily cap', async () => {
  const e = env({ EARLY_ACCESS_DAILY_CAP: '2' });
  assert.equal((await worker.fetch(post(ok, { origin: 'https://evil.example' }), e)).status, 403);
  assert.equal((await worker.fetch(post(ok, {}), e)).status, 403, 'no Origin: a script, not the form');
  assert.equal((await worker.fetch(post('{not json', { origin: ORIGIN }), e)).status, 400);
  assert.equal((await worker.fetch(post('x'.repeat(5000), { origin: ORIGIN }), e)).status, 413);
  const bad = await worker.fetch(post({ ...ok, email: 'nope' }), e);
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'email' });
  const spam = await worker.fetch(post({ ...ok, website: 'x' }), e);
  assert.equal(spam.status, 201, 'the honeypot gets the success answer');
  assert.equal((await worker.fetch(post({ ...ok, email: 'one@x.test' }), e)).status, 201);
  assert.equal((await worker.fetch(post({ ...ok, email: 'two@x.test' }), e)).status, 201);
  assert.equal((await worker.fetch(post({ ...ok, email: 'three@x.test' }), e)).status, 429, 'over the daily cap of 2');
  const counts = (await (await worker.fetch(get('/early-access/counts'), e)).json()).counts;
  assert.equal(counts.payapps, 2, 'the honeypot stored nothing');

  const limited = env({ FEEDBACK_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal((await worker.fetch(post(ok), limited)).status, 429);
});

test('rows older than a year are purged when the list is read', async () => {
  const e = env();
  await e.STORE.insertEarlyAccess({ received: '2025-01-01T00:00:00.000Z', product: 'payapps', email: 'old@x.test', role: '', note: '', page: '', consent: CONSENT_VERSION });
  await worker.fetch(post(ok), e);
  const { counts } = await (await worker.fetch(get('/early-access/counts'), e)).json();
  assert.equal(counts.payapps, 1);
  const { signups } = await (await worker.fetch(get('/early-access', TOKEN), e)).json();
  assert.deepEqual(signups.map((r) => r.email), ['pat@example.com']);
});
