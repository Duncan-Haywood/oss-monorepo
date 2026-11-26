import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createService, scopeOf, inboxFor, ownText, unsubscribeToken, readUnsubscribeToken, AI_FOOTER } from './service.mjs';
import { d1r2Store } from './store.mjs';
import { d1Shim, memBucket, recordingSender, rawMail } from './testkit.mjs';

const cfg = JSON.parse(readFileSync(new URL('./inboxes.json', import.meta.url), 'utf8'));
const TOK = { owner: 'o'.repeat(32), agent: 'a'.repeat(32), read: 'r'.repeat(32) };

function setup({ owner = 'owner@personal.test', clock = new Date('2026-11-26T10:00:00Z'), config = cfg, compliance = null } = {}) {
  const bucket = memBucket();
  const store = d1r2Store(d1Shim(), bucket);
  const sender = recordingSender('cf');
  const alerter = recordingSender('alert');
  let n = 0;
  const t = { now: clock };
  const svc = createService({ store, sender, alerter, cfg: config, ownerAddress: owner, tokens: TOK, unsubscribeSecret: 'u'.repeat(32),
    compliance, now: () => t.now, uuid: () => `id${++n}` });
  const call = async (method, path, body, token = TOK.agent) => {
    const res = await svc.api(new Request(`https://mail.test${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    }));
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return { svc, store, bucket, sender, alerter, call, t };
}

test('ingest stores raw in R2 and a parsed copy, threading replies', async () => {
  const { svc, bucket, call } = setup();
  const a = await svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  assert.equal(a.inbox, 'support');
  assert.equal(a.category, 'support');
  assert.deepEqual(a.flags, []);
  assert.equal(bucket.objects.size, 1);
  const b = await svc.ingest({ raw: rawMail({ subject: 'Re: Help with export', messageId: '<m2@example.com>', inReplyTo: '<m1@example.com>', body: 'Still broken.' }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  assert.equal(b.threadId, a.threadId);
  const { data } = await call('GET', `/api/threads/${a.threadId}`);
  assert.equal(data.messages.length, 2);
  assert.equal(data.messages[0].mail_from, 'ann@example.com');
  assert.equal(data.thread.unread, 2);
  assert.ok(!('raw_key' in data.messages[0]));
  const raw = await svc.api(new Request(`https://mail.test/api/messages/${a.id}/raw`, { headers: { authorization: `Bearer ${TOK.read}` } }));
  assert.match(await raw.text(), /export button does nothing/);
});

test('unknown recipients are rejected; plus-tags reach the base inbox', async () => {
  const { svc } = setup();
  assert.ok((await svc.ingest({ raw: rawMail(), envTo: 'nobody@marisstella.app' })).reject);
  assert.ok((await svc.ingest({ raw: rawMail(), envTo: 'support@other.test' })).reject);
  assert.equal(inboxFor(cfg, 'Support+paddle@marisstella.app').local, 'support');
});

test('the API is invisible without a token and read tokens cannot write', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/threads', null, 'wrong-token-wrong-token-wrong')).status, 404);
  assert.equal((await call('GET', '/api/threads', null, '')).status, 404);
  assert.equal((await call('GET', '/api/threads', null, TOK.read)).status, 200);
  assert.equal((await call('POST', '/api/drafts', { thread_id: 1, text: 'x' }, TOK.read)).status, 403);
  assert.equal(scopeOf(new Request('https://x', { headers: { authorization: 'Bearer short' } }), { owner: 'short' }), null, 'tokens under 24 chars never match');
});

test('a reply to the thread participant is sent, logged and threaded', async () => {
  const { svc, call, sender } = setup();
  const a = await svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const d = await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'Fixed in today\'s release.' });
  assert.equal(d.status, 201);
  assert.equal(d.data.draft.to_addr, 'ann@example.com');
  assert.equal(d.data.draft.subject, 'Re: Help with export');
  assert.deepEqual(d.data.would_send, { ok: true, stream: 'transactional' });
  const s = await call('POST', `/api/drafts/${d.data.draft.id}/send`);
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(sender.sent.length, 1);
  const m = sender.sent[0];
  assert.equal(m.from, 'support@marisstella.app');
  assert.equal(m.inReplyTo, '<m1@example.com>');
  assert.ok(m.text.endsWith(AI_FOOTER), 'replies say they were written by an AI');
  const log = (await call('GET', '/api/sends?day=2026-11-26')).data.sends;
  assert.equal(log[0].result, 'sent');
  const view = (await call('GET', `/api/threads/${a.threadId}`)).data;
  assert.equal(view.thread.status, 'answered');
  assert.equal(view.messages.at(-1).direction, 'out');
  // A draft sends once.
  assert.equal((await call('POST', `/api/drafts/${d.data.draft.id}/send`)).status, 409);
});

test('guardrails block a reply to someone outside the thread, and the block is logged', async () => {
  const { svc, call, sender } = setup();
  const a = await svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const d = await call('POST', '/api/drafts', { thread_id: a.threadId, to: 'stranger@elsewhere.test', text: 'Hello!' });
  assert.equal(d.data.would_send.reason, 'not-a-thread-participant');
  const s = await call('POST', `/api/drafts/${d.data.draft.id}/send`);
  assert.equal(s.status, 422);
  assert.equal(s.data.reason, 'not-a-thread-participant');
  assert.equal(sender.sent.length, 0);
  const log = (await call('GET', '/api/sends')).data.sends;
  assert.deepEqual([log[0].result, log[0].reason], ['blocked', 'not-a-thread-participant']);
});

test('legal, refund, security and human requests are flagged, alerted and never auto-answered', async () => {
  const cases = [
    ['Refund please', 'I want a refund for last month.', 'refund'],
    ['Notice', 'Our attorney will be in touch about legal action.', 'legal'],
    ['Bug', 'I found an XSS vulnerability in your login page.', 'security'],
    ['Help', 'Can I talk to a human please?', 'human_request'],
  ];
  for (const [subject, body, reason] of cases) {
    const { svc, call, sender, alerter } = setup();
    const a = await svc.ingest({ raw: rawMail({ subject, body }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
    assert.ok(a.flags.includes(reason), `${reason}: ${a.flags}`);
    assert.equal(alerter.sent.length, 1, `${reason}: owner alerted at once`);
    assert.equal(alerter.sent[0].to, 'owner@personal.test');
    assert.match(alerter.sent[0].subject, new RegExp(reason));
    const d = await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'Sure!' });
    const s = await call('POST', `/api/drafts/${d.data.draft.id}/send`);
    assert.equal(s.data.reason, 'flagged-for-owner', reason);
    assert.equal(sender.sent.length, 0);
    // Re-classifying does not clear the flag; the agent cannot resolve it.
    await call('POST', `/api/messages/${a.id}/classify`, { category: 'support' });
    const flag = (await call('GET', '/api/flags')).data.flags[0];
    assert.equal((await call('POST', `/api/flags/${flag.id}/resolve`, { note: 'agent tries' })).status, 403);
    // The owner resolves it; then a reply may go.
    assert.equal((await call('POST', `/api/flags/${flag.id}/resolve`, { note: 'refunded' }, TOK.owner)).status, 200);
    const d2 = await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'Done.' });
    assert.equal((await call('POST', `/api/drafts/${d2.data.draft.id}/send`)).status, 200);
  }
});

test('a customer quoting our footer is not flagged by our own words', async () => {
  const body = `Thanks, that worked.\n\nOn Tue, 25 Nov 2026 at 10:00, support wrote:\n> Fixed.${AI_FOOTER.replace(/\n/g, '\n> ')}`;
  assert.ok(!/talk to a human/.test(ownText(body)));
  const { svc } = setup();
  const a = await svc.ingest({ raw: rawMail({ body }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  assert.deepEqual(a.flags, []);
});

test('flag_all inboxes (privacy@) flag everything and only draft', async () => {
  const { svc, call } = setup();
  const a = await svc.ingest({ raw: rawMail({ to: 'privacy@marisstella.app', subject: 'Question', body: 'What cookies do you use?' }), envFrom: 'ann@example.com', envTo: 'privacy@marisstella.app' });
  assert.ok(a.flags.includes('inbox'));
  assert.equal(a.forward, true, 'privacy@ is forwarded to the owner');
  const d = await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'x' });
  assert.ok(['flagged-for-owner', 'inbox-drafts-only'].includes(d.data.would_send.reason));
});

test('machines are never answered (mail loops)', async () => {
  const { svc, call } = setup();
  const a = await svc.ingest({ raw: rawMail({ from: 'Out of office <ann@example.com>', extra: 'Auto-Submitted: auto-replied', body: 'I am away.' }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const d = await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'ok' });
  assert.equal(d.data.would_send.reason, 'automated-sender');
});

test('per-recipient and daily caps hold', async () => {
  const small = { ...cfg, sending: { ...cfg.sending, daily_cap: 100, per_recipient_daily_cap: 2 } };
  const { svc, call } = setup({ config: small });
  const a = await svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const results = [];
  for (let i = 0; i < 3; i++) {
    await svc.ingest({ raw: rawMail({ subject: 'Re: Help with export', messageId: `<x${i}@example.com>`, inReplyTo: '<m1@example.com>', body: 'and?' }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
    const d = await call('POST', '/api/drafts', { thread_id: a.threadId, text: `answer ${i}` });
    results.push((await call('POST', `/api/drafts/${d.data.draft.id}/send`)).data.reason || 'sent');
  }
  assert.deepEqual(results, ['sent', 'sent', 'recipient-cap']);
  const none = { ...cfg, sending: { ...cfg.sending, daily_cap: 0 } };
  const z = setup({ config: none });
  const b = await z.svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const d = await z.call('POST', '/api/drafts', { thread_id: b.threadId, text: 'x' });
  assert.equal(d.data.would_send.reason, 'daily-cap');
});

test('marketing needs a recorded opt-in, compliance details and no unsubscribe; cold is refused', async () => {
  const compliance = { sender: 'Example Co', postalAddress: 'PO Box 1, Town', unsubscribeUrl: 'https://mail.test/u' };
  const { call, sender, svc } = setup({ compliance });
  const draft = async (to, kind = 'marketing') => (await call('POST', '/api/drafts', { kind, inbox: 'sales', to, subject: 'News', text: 'Our new feature.' })).data;
  assert.equal((await draft('lead@biz.test')).would_send.reason, 'no-opt-in');
  // Only the owner token records consent.
  assert.equal((await call('POST', '/api/contacts', { address: 'lead@biz.test', source: 'form', wording: 'v1' })).status, 403);
  assert.equal((await call('POST', '/api/contacts', { address: 'lead@biz.test', source: 'payapps signup form', wording: 'Send me product news (v1)' }, TOK.owner)).status, 201);
  const d = await draft('lead@biz.test');
  assert.deepEqual(d.would_send, { ok: true, stream: 'marketing' });
  assert.equal((await call('POST', `/api/drafts/${d.draft.id}/send`)).status, 200);
  const m = sender.sent[0];
  assert.match(m.text, /PO Box 1, Town/);
  assert.match(m.headers['List-Unsubscribe'], /^<https:\/\/mail\.test\/u\?t=/);
  assert.equal(m.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  // One-click unsubscribe: GET only shows a button, POST records it.
  const link = m.headers['List-Unsubscribe'].slice(1).split('>')[0];
  assert.equal((await svc.api(new Request(link))).status, 200);
  assert.equal((await draft('lead@biz.test')).would_send.ok, true, 'a GET unsubscribes no one');
  assert.equal((await svc.api(new Request(link, { method: 'POST' }))).status, 200);
  assert.equal((await draft('lead@biz.test')).would_send.reason, 'suppressed:unsubscribed');
  assert.equal((await draft('cold@biz.test', 'cold')).would_send.reason, 'cold-not-here');
  // Without compliance details marketing is refused.
  const bare = setup();
  await bare.call('POST', '/api/contacts', { address: 'x@biz.test', source: 's', wording: 'w' }, TOK.owner);
  const b = (await bare.call('POST', '/api/drafts', { kind: 'marketing', inbox: 'sales', to: 'x@biz.test', subject: 'N', text: 'T' })).data;
  assert.equal(b.would_send.reason, 'outreach-not-configured');
});

test('replying "unsubscribe" suppresses marketing but not answers to their own thread', async () => {
  const compliance = { sender: 'Example Co', postalAddress: 'PO Box 1', unsubscribeUrl: 'https://mail.test/u' };
  const { svc, call } = setup({ compliance });
  await call('POST', '/api/contacts', { address: 'ann@example.com', source: 'form', wording: 'v1' }, TOK.owner);
  const a = await svc.ingest({ raw: rawMail({ to: 'sales@marisstella.app', subject: 'unsubscribe', body: 'unsubscribe' }), envFrom: 'ann@example.com', envTo: 'sales@marisstella.app' });
  const mk = (await call('POST', '/api/drafts', { kind: 'marketing', inbox: 'sales', to: 'ann@example.com', subject: 'N', text: 'T' })).data;
  assert.equal(mk.would_send.reason, 'suppressed:unsubscribed');
  const re = (await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'Done, you are off the list.' })).data;
  assert.equal(re.would_send.ok, true);
});

test('unsubscribe tokens are signed', async () => {
  const t = await unsubscribeToken('s'.repeat(32), 'a@b.test');
  assert.deepEqual(await readUnsubscribeToken('s'.repeat(32), t), { address: 'a@b.test', stream: 'marketing' });
  assert.equal(await readUnsubscribeToken('x'.repeat(32), t), null);
  assert.equal(await readUnsubscribeToken('s'.repeat(32), `${t.split('.')[0]}.AAAA`), null);
});

test('no owner address: alerts are logged as blocked, flags still hold', async () => {
  const { svc, call } = setup({ owner: '' });
  const a = await svc.ingest({ raw: rawMail({ body: 'refund now' }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const log = (await call('GET', '/api/sends')).data.sends;
  assert.equal(log[0].reason, 'owner-address-unset');
  const d = await call('POST', '/api/drafts', { thread_id: a.threadId, text: 'x' });
  assert.equal(d.data.would_send.reason, 'flagged-for-owner');
});

test('the daily job purges by each inbox\'s retention, raw included, and mails the digest', async () => {
  const { svc, bucket, alerter, t, call } = setup();
  await svc.ingest({ raw: rawMail({ to: 'dmarc@marisstella.app', subject: 'Report' }), envFrom: 'noreply-dmarc@google.com', envTo: 'dmarc@marisstella.app' });
  await svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  assert.equal(bucket.objects.size, 2);
  t.now = new Date('2027-01-05T10:00:00Z'); // 40 days on: past dmarc@ (30), inside support@ (90)
  const r = await svc.scheduled();
  assert.equal(r.purged, 1);
  assert.equal(bucket.objects.size, 1);
  assert.equal(r.digest, true);
  assert.match(alerter.sent.at(-1).text, /Threads with unread mail: 1/);
  assert.equal((await call('GET', '/api/threads?inbox=dmarc')).data.threads.length, 0);
});

test('owner alerts are capped per day; the rest wait for the digest', async () => {
  const { svc, alerter } = setup();
  for (let i = 0; i < 25; i++) {
    await svc.ingest({ raw: rawMail({ subject: `Refund ${i}`, messageId: `<r${i}@example.com>`, body: 'refund please' }), envFrom: `c${i}@example.com`, envTo: 'billing@marisstella.app' });
  }
  assert.equal(alerter.sent.length, 20);
  assert.match(await svc.digestText(), /Open flags waiting for you: 25/);
});
