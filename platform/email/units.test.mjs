import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { parseMessage, parseAddressList, baseSubject, buildMime, isAutomated, decodeWords } from './mime.mjs';
import { classify, authFailed } from './classify.mjs';
import { checkSend } from './guardrails.mjs';

const cfg = JSON.parse(readFileSync(new URL('./inboxes.json', import.meta.url), 'utf8'));
const box = (l) => cfg.inboxes.find((b) => b.local === l);

test('inboxes.json is in step with inboxes.yaml and safe to publish', () => {
  const py = spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' });
  if (py.status === 0) {
    const r = spawnSync('python3', [new URL('./gen_config.py', import.meta.url).pathname, '--check'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
  // The only addresses in the generated config are our own.
  const text = JSON.stringify(cfg);
  for (const a of text.match(/[\w.+-]+@[\w.-]+/g) || []) assert.ok(a.endsWith(`@${cfg.domain}`), a);
  for (const r of ['legal', 'refund', 'security', 'human_request']) assert.ok(cfg.flag_to_owner.includes(r));
  assert.equal(cfg.outreach.cold, false);
  for (const l of ['hello', 'support', 'privacy', 'billing', 'security']) assert.ok(box(l), `${l}@ exists`);
  const routing = JSON.parse(readFileSync(new URL('../pages/cloudflare/email-routing.json', import.meta.url), 'utf8'));
  assert.equal(routing.deliver_to_worker, cfg.worker);
  assert.deepEqual(routing.addresses.map((a) => a.local), cfg.inboxes.map((b) => b.local));
});

test('MIME: multipart with base64 text, QP, RFC 2047 and an attachment', () => {
  const raw = [
    'From: =?UTF-8?B?SsO8cmdlbg==?= <Jurgen@Example.DE>',
    'Reply-To: "Desk, Help" <desk@example.de>',
    'To: support@marisstella.app, other@x.test',
    'Subject: =?UTF-8?Q?Rechnung_f=C3=BCr?= November',
    'Message-ID: <abc@example.de>',
    'References: <a@x> <b@x>',
    'Content-Type: multipart/mixed; boundary="BB"',
    '',
    '--BB',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa('Hallo, siehe Anhang.'),
    '--BB',
    'Content-Type: application/pdf; name="inv.pdf"',
    'Content-Disposition: attachment; filename="inv.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    'AAAAAAAAAAAA',
    '--BB--',
  ].join('\r\n');
  const m = parseMessage(raw);
  assert.equal(m.from, 'jurgen@example.de');
  assert.equal(m.fromName, 'Jürgen');
  assert.equal(m.replyTo, 'desk@example.de');
  assert.deepEqual(m.to, ['support@marisstella.app', 'other@x.test']);
  assert.equal(m.subject, 'Rechnung für November');
  assert.equal(m.text, 'Hallo, siehe Anhang.');
  assert.deepEqual(m.attachments, [{ filename: 'inv.pdf', type: 'application/pdf', size: 9 }]);
  assert.deepEqual(m.references, ['<a@x>', '<b@x>']);
  assert.equal(m.automated, false);
});

test('MIME: HTML-only mail becomes text without scripts', () => {
  const m = parseMessage('From: a@b.test\r\nContent-Type: text/html\r\n\r\n<p>Hi<script>evil()</script></p><p>there &amp; you</p>');
  assert.equal(m.text, 'Hi\nthere & you');
  assert.equal(m.htmlPresent, true);
});

test('HTML-only multipart keeps its text: the epilogue is not a part (RFC 2046 5.1.1, round 111 audit)', () => {
  const alt = parseMessage('From: p@example.org\r\nSubject: My order\r\nContent-Type: multipart/alternative; boundary=b1\r\n\r\n--b1\r\nContent-Type: text/html\r\n\r\n<p>I want a refund or my lawyer will be in touch.</p>\r\n--b1--\r\n');
  assert.equal(alt.text, 'I want a refund or my lawyer will be in touch.');
  assert.deepEqual(classify({ subject: alt.subject, text: alt.text, from: 'p@example.org' }, {}, ['legal', 'refund']).flags.sort(), ['legal', 'refund']);
  const mixed = parseMessage('From: p@example.org\r\nContent-Type: multipart/mixed; boundary=m\r\n\r\npreamble\r\n--m\r\nContent-Type: text/html\r\n\r\n<p>See attached</p>\r\n--m\r\nContent-Type: application/pdf; name=a.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\nAAAA\r\n--m--\r\nepilogue text\r\n');
  assert.equal(mixed.text, 'See attached');
  assert.equal(mixed.attachments.length, 1);
});

test('automated senders are recognised', () => {
  assert.ok(isAutomated({ 'auto-submitted': ['auto-replied'] }, 'a@b'));
  assert.ok(isAutomated({ 'list-id': ['x'] }, 'a@b'));
  assert.ok(isAutomated({}, 'MAILER-DAEMON@x.test'));
  assert.ok(isAutomated({}, 'no-reply@x.test'));
  assert.ok(!isAutomated({ 'auto-submitted': ['no'] }, 'ann@x.test'));
});

test('buildMime cannot be header-injected through a subject or address', () => {
  const raw = buildMime({ from: 'support@marisstella.app', to: 'a@b.test\r\nBcc: victim@x.test', subject: 'Hi\r\nBcc: victim@x.test', text: 'x', messageId: '<1@m>' });
  const head = raw.split('\r\n\r\n')[0];
  assert.ok(!/^Bcc:/m.test(head));
  assert.equal(head.split('\r\n').filter((l) => l.startsWith('To:')).length, 1);
  assert.match(buildMime({ from: 'a@b', to: 'c@d', subject: 'Grüße', text: 'x', messageId: '<1@m>' }), /Subject: =\?UTF-8\?B\?/);
  assert.equal(decodeWords('=?UTF-8?B?R3LDvMOfZQ==?='), 'Grüße');
});

test('addresses and subjects', () => {
  assert.deepEqual(parseAddressList('"Doe, Jane" <JANE@x.test>, bob@y.test'), [{ name: 'Doe, Jane', address: 'jane@x.test' }, { name: '', address: 'bob@y.test' }]);
  assert.equal(baseSubject('Re: Fwd: RE: [Ticket] Hello'), 'hello');
});

test('classifier: categories and owner flags', () => {
  const c = (subject, text, inbox = box('support'), extra = {}) => classify({ subject, text, from: 'ann@example.com', ...extra }, inbox, cfg.flag_to_owner);
  assert.equal(c('Export broken', 'The export does not work').category, 'support');
  assert.equal(c('Pricing', 'How much per seat for 10 users?').category, 'lead');
  assert.equal(c('Payout', 'Your payout is on its way', box('billing'), { from: 'help@paddle.com' }).category, 'vendor_notice');
  assert.equal(c('Grow traffic', 'We offer SEO services and backlinks').category, 'spam');
  assert.equal(c('hi', 'hello', box('support'), { authResults: 'mx; spf=fail; dmarc=fail' }).category, 'spam');
  assert.deepEqual(c('Charge', 'I will file a chargeback').flags, ['chargeback']);
  assert.deepEqual(c('GDPR', 'Please delete my data').flags, ['data_request']);
  assert.ok(c('x', 'plain', box('security')).flags.includes('inbox'));
  assert.ok(authFailed('spf=softfail dkim=none'));
  assert.ok(!authFailed('spf=softfail dkim=pass'));
});

test('guardrails: every refusal has a reason', () => {
  const thread = { id: 1, inbox: 'support' };
  const inbound = [{ mail_from: 'ann@example.com', reply_to: '', automated: false }];
  const base = { kind: 'reply', to: 'ann@example.com', subject: 'Re: x', text: 'ok', cfg, inbox: box('support'), thread, inbound, openFlags: [], sentToday: 0, sentToRecipientToday: 0 };
  assert.deepEqual(checkSend(base), { ok: true, stream: 'transactional' });
  const no = (patch) => checkSend({ ...base, ...patch }).reason;
  assert.equal(no({ to: 'evil@x.test' }), 'not-a-thread-participant');
  assert.equal(no({ to: 'ann@example.com, evil@x.test' }), 'bad-address');
  assert.equal(no({ to: 'hello@marisstella.app' }), 'own-domain');
  assert.equal(no({ thread: null }), 'no-thread');
  assert.equal(no({ openFlags: [{ reason: 'legal' }] }), 'flagged-for-owner');
  assert.equal(no({ inbox: box('accounts'), thread: { id: 1, inbox: 'accounts' } }), 'inbox-drafts-only');
  assert.equal(no({ thread: { id: 1, inbox: 'billing' } }), 'wrong-inbox');
  assert.equal(no({ suppression: { all: 'hard-bounce' } }), 'suppressed:hard-bounce');
  assert.equal(no({ sentToday: cfg.sending.daily_cap }), 'daily-cap');
  assert.equal(no({ sentToRecipientToday: cfg.sending.per_recipient_daily_cap }), 'recipient-cap');
  assert.equal(no({ text: 'x'.repeat(cfg.sending.max_body_chars + 1) }), 'body-size');
  assert.equal(no({ text: '  ' }), 'body-size');
  assert.equal(no({ kind: 'cold' }), 'cold-not-here');
  assert.equal(no({ kind: 'bulk' }), 'unknown-kind');
  assert.equal(no({ cfg: { ...cfg, sending: { ...cfg.sending, provider: 'none' } } }), 'sending-off');
  assert.equal(no({ inbound: [{ ...inbound[0], automated: true }] }), 'automated-sender');
});

test('the Worker entry wires the service the tests cover', () => {
  const src = readFileSync(new URL('./worker.mjs', import.meta.url), 'utf8');
  assert.match(src, /createService\(/);
  assert.match(src, /svc\.ingest\(/);
  assert.ok(existsSync(new URL('./schema.sql', import.meta.url)));
  const toml = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /^name = "marisstella-mail"$/m);
  assert.ok(!/@/.test(toml.replace(/^#.*$/gm, '')), 'no address in wrangler.toml');
});
