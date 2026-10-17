import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verify, sign, parseHeaders, detectProvider, snippet, PROVIDERS } from './webhook.mjs';

const body = '{"id":"evt_1","amount":1200,"note":"héllo"}';
const now = 1_700_000_000_000;
const ts = String(now / 1000);
const headerText = (h) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n');

// Independent reference implementations with node:crypto, so the engine is checked against something that is not itself.
test('Stripe matches an independent node:crypto computation', async () => {
  const secret = 'whsec_testsecret';
  const mac = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const r = await verify({ headers: `Stripe-Signature: t=${ts},v1=${mac},v0=deadbeef`, body, secret, now });
  assert.equal(r.provider, 'stripe');
  assert.equal(r.ok, true);
});

test('GitHub sha256 and the legacy sha1 header', async () => {
  const mac = crypto.createHmac('sha256', 's3cret').update(body).digest('hex');
  assert.equal((await verify({ headers: `X-Hub-Signature-256: sha256=${mac}`, body, secret: 's3cret' })).ok, true);
  const sha1 = crypto.createHmac('sha1', 's3cret').update(body).digest('hex');
  const r = await verify({ headers: `X-Hub-Signature: sha1=${sha1}`, body, secret: 's3cret' });
  assert.equal(r.ok, true);
  assert.ok(r.findings.some((f) => f.severity === 'warn' && /legacy/.test(f.message)));
});

test('Shopify base64', async () => {
  const mac = crypto.createHmac('sha256', 'shpss_x').update(body).digest('base64');
  assert.equal((await verify({ headers: `X-Shopify-Hmac-Sha256: ${mac}`, body, secret: 'shpss_x' })).ok, true);
});

test('Slack signs v0:ts:body', async () => {
  const mac = crypto.createHmac('sha256', 'sl').update(`v0:${ts}:${body}`).digest('hex');
  const r = await verify({ headers: `X-Slack-Request-Timestamp: ${ts}\nX-Slack-Signature: v0=${mac}`, body, secret: 'sl', now });
  assert.equal(r.ok, true);
});

test('Standard Webhooks base64-decodes the whsec_ secret', async () => {
  const raw = Buffer.from('super-secret-bytes!');
  const secret = 'whsec_' + raw.toString('base64');
  const mac = crypto.createHmac('sha256', raw).update(`msg_1.${ts}.${body}`).digest('base64');
  const r = await verify({ headers: `webhook-id: msg_1\nwebhook-timestamp: ${ts}\nwebhook-signature: v1,${mac}`, body, secret, now });
  assert.equal(r.provider, 'standard');
  assert.equal(r.ok, true);
});

test('a re-serialised body is diagnosed, not just rejected', async () => {
  const pretty = JSON.stringify(JSON.parse(body), null, 2);
  const h = await sign('github', { body: pretty, secret: 'k' });
  const r = await verify({ headers: headerText(h), body: JSON.stringify(JSON.parse(pretty)), secret: 'k' });
  assert.equal(r.ok, false);
  assert.match(r.matched.body, /2-space indent/);
  assert.ok(r.findings.some((f) => /raw request bytes/.test(f.message)));
});

test('trailing newline and CRLF drift are found', async () => {
  const h = await sign('shopify', { body: body + '\n', secret: 'k' });
  const r = await verify({ headers: headerText(h), body, secret: 'k' });
  assert.equal(r.ok, false);
  assert.match(r.matched.body, /trailing newline added/);
  const h2 = await sign('shopify', { body: 'a\r\nb', secret: 'k' });
  assert.match((await verify({ headers: headerText(h2), body: 'a\nb', secret: 'k' })).matched.body, /CRLF/);
});

test('secret with pasted whitespace is diagnosed', async () => {
  const h = await sign('github', { body, secret: 'k' });
  const r = await verify({ headers: headerText(h), body, secret: ' k\n' });
  assert.equal(r.ok, false);
  assert.match(r.matched.secret, /whitespace removed/);
});

test('wrong secret names the likely cause', async () => {
  const h = await sign('stripe', { body, secret: 'whsec_a', ts });
  const r = await verify({ headers: headerText(h), body, secret: 'whsec_b', now });
  assert.equal(r.ok, false);
  assert.equal(r.matched, null);
  assert.ok(r.findings.some((f) => /wrong secret/.test(f.message)));
  assert.ok(r.findings.some((f) => /stripe listen/.test(f.message)));
});

test('stale timestamp is an info note, not a failure of a valid signature', async () => {
  const h = await sign('stripe', { body, secret: 'whsec_a', ts: '1000000000' });
  const r = await verify({ headers: headerText(h), body, secret: 'whsec_a', now });
  assert.equal(r.ok, true);
  assert.ok(r.findings.some((f) => f.severity === 'info' && /tolerance/.test(f.message)));
});

test('missing pieces are reported', async () => {
  assert.match((await verify({ headers: '', body, secret: 'k' })).findings[0].message, /which provider/);
  assert.ok((await verify({ headers: 'X-Hub-Signature-256: sha256=00', body: '', secret: 'k' })).findings.some((f) => /No request body/.test(f.message)));
  assert.ok((await verify({ headers: 'Stripe-Signature: v1=00', body, secret: 'k' })).findings.some((f) => /t= timestamp/.test(f.message)));
});

test('sign then verify round-trips for every provider', async () => {
  for (const p of PROVIDERS) {
    const secret = p === 'standard' ? 'whsec_' + Buffer.from('k').toString('base64') : 'k';
    const h = await sign(p, { body, secret, ts });
    assert.equal(detectProvider(parseHeaders(headerText(h))), p);
    assert.equal((await verify({ headers: headerText(h), body, secret, now })).ok, true, p);
  }
});

test('parseHeaders is case-insensitive and ignores non-header lines', () => {
  assert.deepEqual(parseHeaders('POST /hook HTTP/1.1\nStripe-Signature: t=1,v1=a\n'), { 'stripe-signature': 't=1,v1=a' });
});

test('every provider has a snippet that stresses the raw body', () => {
  for (const p of PROVIDERS) assert.match(snippet(p), /timingSafeEqual/);
});

test('the published snippets actually verify what sign() produces', async () => {
  for (const [p, call] of [
    ['stripe', 'verifyStripe(body, h["Stripe-Signature"], secret, Number(ts))'],
    ['github', 'verifyGitHub(body, h["X-Hub-Signature-256"], secret)'],
    ['shopify', 'verifyShopify(body, h["X-Shopify-Hmac-Sha256"], secret)'],
    ['slack', 'verifySlack(body, h["X-Slack-Request-Timestamp"], h["X-Slack-Signature"], secret, Number(ts))'],
    ['standard', 'verifyStandard(body, h["webhook-id"], h["webhook-timestamp"], h["webhook-signature"], secret)'],
  ]) {
    const secret = p === 'standard' ? 'whsec_' + Buffer.from('k').toString('base64') : 'k';
    const h = await sign(p, { body, secret, ts });
    const mod = await import('data:text/javascript,' + encodeURIComponent(`${snippet(p)}\nexport default (body, h, secret, ts) => ${call};`));
    assert.equal(mod.default(body, h, secret, ts), true, p);
    assert.equal(mod.default(body + ' ', h, secret, ts), false, p);
  }
});
