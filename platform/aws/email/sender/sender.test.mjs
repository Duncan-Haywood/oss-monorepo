import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maySend, suppressionFor, complianceParts, normalizeAddress } from './policy.mjs';
import { consentStore, addressKey } from './consent-store.mjs';
import { sesSender, senderFromEnv, sendEmailInput, SuppressedError } from './ses-sender.mjs';
import { unsubscribeToken, readUnsubscribeToken } from './unsubscribe-token.mjs';
import { createHandler, sesEvents } from './events.mjs';
import { fakeDynamo } from '../../../edge/aws/fake-dynamo.mjs';

const PEPPER = 'pepper-of-at-least-16-chars';
const SECRET = 'unsubscribe-signing-secret';
const newStore = () => { const f = fakeDynamo(); return { f, store: consentStore({ call: f.call, table: 'consent', pepper: PEPPER }) }; };

test('policy: transactional goes unless bounced or complained; marketing needs opt-in; cold needs a business and rules by country', () => {
  const to = 'Person@Example.com';
  assert.deepEqual(maySend({ stream: 'transactional', to }), { ok: true });
  assert.equal(maySend({ stream: 'transactional', to, state: { suppressed: { all: 'complaint' } } }).ok, false);
  assert.deepEqual(maySend({ stream: 'transactional', to, state: { suppressed: { unsubscribed: 'unsubscribed' } } }), { ok: true }, 'receipts still go after an unsubscribe');
  assert.equal(maySend({ stream: 'marketing', to }).reason, 'no-opt-in');
  assert.deepEqual(maySend({ stream: 'marketing', to, state: { consent: { marketing: {} } } }), { ok: true });
  assert.equal(maySend({ stream: 'marketing', to, state: { consent: { marketing: {} }, suppressed: { unsubscribed: 'unsubscribed' } } }).ok, false);
  assert.equal(maySend({ stream: 'cold', to, recipient: { kind: 'consumer', country: 'US' } }).reason, 'cold-needs-business-recipient');
  assert.equal(maySend({ stream: 'cold', to, recipient: { kind: 'unknown', country: 'US' } }).reason, 'cold-needs-business-recipient');
  assert.equal(maySend({ stream: 'cold', to, recipient: { kind: 'business' } }).reason, 'cold-needs-recipient-country');
  assert.deepEqual(maySend({ stream: 'cold', to, recipient: { kind: 'business', country: 'US' } }), { ok: true });
  assert.equal(maySend({ stream: 'cold', to, recipient: { kind: 'business', country: 'de' } }).reason, 'cold-eu-uk-needs-legitimate-interest-assessment');
  assert.equal(maySend({ stream: 'cold', to, recipient: { kind: 'business', country: 'GB', liaId: 'lia-2026-01' } }).ok, true);
  assert.equal(maySend({ stream: 'cold', to, recipient: { kind: 'business', country: 'US' }, state: { suppressed: { cold: 'unsubscribed' } } }).ok, false);
  assert.equal(maySend({ stream: 'spam', to }).reason, 'unknown-stream');
  assert.equal(maySend({ stream: 'transactional', to: 'not an address' }).reason, 'bad-address');
  assert.equal(normalizeAddress(' A@B.CO '), 'a@b.co');
});

test('policy: suppression scopes and compliance parts', () => {
  assert.deepEqual(suppressionFor({ type: 'hard-bounce' }), [['all', 'hard-bounce']]);
  assert.deepEqual(suppressionFor({ type: 'unsubscribe', stream: 'cold' }), [['cold', 'unsubscribed']]);
  assert.deepEqual(suppressionFor({ type: 'unsubscribe' }), [['unsubscribed', 'unsubscribed']]);
  assert.deepEqual(suppressionFor({ type: 'soft-bounce' }), []);
  assert.deepEqual(complianceParts({ stream: 'transactional' }), { text: '', html: '', headers: [] });
  assert.throws(() => complianceParts({ stream: 'marketing', sender: 'X' }), /postalAddress/);
  const c = complianceParts({ stream: 'cold', sender: 'Acme <tools>', postalAddress: '1 Main St, Town', unsubscribeUrl: 'https://u.example/unsubscribe?t=x', mailto: 'unsubscribe@example.com' });
  assert.match(c.text, /Acme <tools>, 1 Main St, Town/);
  assert.match(c.html, /Acme &lt;tools&gt;/);
  assert.deepEqual(c.headers, [
    { Name: 'List-Unsubscribe', Value: '<https://u.example/unsubscribe?t=x>, <mailto:unsubscribe@example.com?subject=unsubscribe>' },
    { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
  ]);
});

test('consent store: hashed keys, opt-in recorded with proof, suppression wins and is idempotent', async () => {
  const { f, store } = newStore();
  assert.throws(() => addressKey('short', 'a@b.co'), /pepper/);
  assert.equal(addressKey(PEPPER, 'A@B.co'), addressKey(PEPPER, 'a@b.co'));
  await assert.rejects(store.recordConsent('a@b.co', { source: 'form' }), /wording/);
  assert.deepEqual(await store.recordConsent('a@b.co', { source: 'newsletter-form', wording: 'v1' }), { recorded: true });
  const s = await store.state('A@b.co');
  assert.equal(s.consent.marketing.wording, 'v1');
  assert.ok(!JSON.stringify([...f.tables.get('consent').values()]).includes('a@b.co'), 'no address in clear');
  await store.suppress('a@b.co', { type: 'unsubscribe', stream: 'all' });
  await store.suppress('a@b.co', { type: 'unsubscribe', stream: 'all' });
  const after = await store.state('a@b.co');
  assert.deepEqual(after.suppressed, { unsubscribed: 'unsubscribed' });
  assert.deepEqual(after.consent, {}, 'consent withdrawn');
  assert.deepEqual(await store.recordConsent('a@b.co', { source: 'form', wording: 'v1' }), { recorded: false, reason: 'previously-suppressed' });
});

function fakeSes() {
  const sent = [];
  return { sent, request: async (req) => { sent.push(JSON.parse(req.body)); return new Response(JSON.stringify({ MessageId: `m${sent.length}` }), { status: 200 }); } };
}

test('sesSender: checks the store first, then adds footer and one-click headers to marketing mail', async () => {
  const { store } = newStore();
  const ses = fakeSes();
  const send = sesSender({ from: 'News <news@m.example>', stream: 'marketing', configurationSet: 'marketing', consent: store, sender: 'Example Tools', postalAddress: '1 Main St', unsubscribeBase: 'https://u.example/unsubscribe', unsubscribeSecret: SECRET, request: ses.request });
  await assert.rejects(send({ to: 'a@b.co', subject: 'Hi', text: 'Body' }), (e) => e instanceof SuppressedError && e.reason === 'no-opt-in');
  assert.equal(ses.sent.length, 0, 'nothing reached SES');
  await store.recordConsent('a@b.co', { source: 'form', wording: 'v1' });
  assert.deepEqual(await send({ to: 'a@b.co', subject: 'Hi', text: 'Body', html: '<p>Body</p>', headers: { 'List-Unsubscribe': '<spoof>', 'X-Campaign': 'c1' } }), { messageId: 'm1' });
  const msg = ses.sent[0];
  assert.equal(msg.ConfigurationSetName, 'marketing');
  assert.deepEqual(msg.EmailTags, [{ Name: 'stream', Value: 'marketing' }]);
  assert.match(msg.Content.Simple.Body.Text.Data, /^Body\n\n--\nExample Tools, 1 Main St\n/);
  assert.match(msg.Content.Simple.Body.Html.Data, /<a href="https:\/\/u.example\/unsubscribe\?t=/);
  const headers = msg.Content.Simple.Headers;
  assert.deepEqual(headers.map((h) => h.Name), ['X-Campaign', 'List-Unsubscribe', 'List-Unsubscribe-Post'], 'a caller cannot replace the unsubscribe header');
  const token = /t=([^>]+)>/.exec(headers[1].Value)[1];
  assert.deepEqual(readUnsubscribeToken(SECRET, token), { address: 'a@b.co', stream: 'marketing' });
});

test('sesSender: transactional mail carries no marketing footer; cold needs a business recipient', async () => {
  const { store } = newStore();
  const ses = fakeSes();
  const tx = sesSender({ from: 'a@t.example', stream: 'transactional', configurationSet: 'transactional', consent: store, request: ses.request });
  await tx({ to: 'x@y.co', subject: 'Receipt', text: 'Paid.' });
  assert.equal(ses.sent[0].Content.Simple.Body.Text.Data, 'Paid.');
  assert.deepEqual(ses.sent[0].Content.Simple.Headers, []);
  const cold = sesSender({ from: 'a@o.example', stream: 'cold', configurationSet: 'cold', consent: store, sender: 'S', postalAddress: 'P', unsubscribeBase: 'https://u', unsubscribeSecret: SECRET, request: ses.request });
  await assert.rejects(cold({ to: 'x@y.co', subject: 's', text: 't' }), (e) => e.reason === 'cold-needs-business-recipient');
  await cold({ to: 'x@y.co', subject: 's', text: 't', recipient: { kind: 'business', country: 'US' } });
  assert.equal(ses.sent.length, 2);
  await store.suppress('x@y.co', { type: 'complaint' });
  await assert.rejects(tx({ to: 'x@y.co', subject: 'Receipt', text: 'Paid.' }), (e) => e.reason === 'suppressed:complaint');
});

test('senderFromEnv switches only on MAIL_PROVIDER=ses; SES errors throw', async () => {
  const { store } = newStore();
  assert.equal(senderFromEnv({ MAIL_PROVIDER: 'resend' }, { consent: store }), null);
  const send = senderFromEnv({ MAIL_PROVIDER: 'ses', MAIL_FROM: 'a@t.example', SES_CONFIGURATION_SET: 'transactional' }, { consent: store, request: async () => new Response('{}', { status: 400 }) });
  await assert.rejects(send({ to: 'x@y.co', subject: 's', text: 't' }), /ses 400/);
  assert.equal(sendEmailInput({ from: 'f', to: 't', subject: 's', text: 'x', configurationSet: 'c', stream: 'transactional', compliance: { text: '', html: '', headers: [] } }).Content.Simple.Body.Html, undefined);
});

test('unsubscribe tokens: tamper-proof', () => {
  const t = unsubscribeToken(SECRET, 'a@b.co', 'cold');
  assert.deepEqual(readUnsubscribeToken(SECRET, t), { address: 'a@b.co', stream: 'cold' });
  assert.equal(readUnsubscribeToken('other-secret', t), null);
  const [p] = t.split('.');
  assert.equal(readUnsubscribeToken(SECRET, `${p}.AAAAAAAAAAAAAAAAAAAAAA`), null);
  assert.equal(readUnsubscribeToken(SECRET, 'garbage'), null);
  assert.throws(() => unsubscribeToken('', 'a@b.co', 'cold'));
});

test('events: hard bounces and complaints suppress; GET shows a button, POST unsubscribes', async () => {
  const { store } = newStore();
  const logs = [];
  const h = createHandler({ store, unsubscribeSecret: SECRET, log: (o) => logs.push(o) });
  assert.deepEqual(sesEvents({ eventType: 'Bounce', bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'a@b.co' }] } }), []);
  assert.deepEqual(await h({ source: 'aws.ses', detail: { eventType: 'Bounce', mail: { tags: { stream: ['marketing'] } }, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'a@b.co' }] } } }), { suppressed: 1 });
  assert.equal((await store.state('a@b.co')).suppressed.all, 'hard-bounce');
  await h({ source: 'aws.ses', detail: { eventType: 'Complaint', complaint: { complainedRecipients: [{ emailAddress: 'c@d.co' }] } } });
  assert.equal((await store.state('c@d.co')).suppressed.all, 'complaint');

  const t = unsubscribeToken(SECRET, 'e@f.co', 'marketing');
  const ev = (method, token = t, path = '/unsubscribe') => ({ rawPath: path, rawQueryString: `t=${token}`, requestContext: { http: { method } } });
  const get = await h(ev('GET'));
  assert.equal(get.statusCode, 200);
  assert.match(get.body, /<form method="post"/);
  assert.deepEqual((await store.state('e@f.co')).suppressed, {}, 'a GET (a link scanner) unsubscribes no one');
  const post = await h(ev('POST'));
  assert.equal(post.statusCode, 200);
  assert.equal((await store.state('e@f.co')).suppressed.unsubscribed, 'unsubscribed');
  assert.equal((await h(ev('POST', 'bad.token'))).statusCode, 400);
  assert.equal((await h(ev('GET', t, '/other'))).statusCode, 404);
  assert.ok(!JSON.stringify(logs).includes('@'), 'no address logged');
});
