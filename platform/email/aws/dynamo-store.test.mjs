// The DynamoDB + S3 mail store against the same contract the D1 store
// passes, plus the end-to-end service flow on it. The fake DynamoDB parses
// every expression strictly and pages every 3 items, so pagination runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeContract } from '../store-contract.mjs';
import { dynamoS3Store, s3Bucket, TEXT_BODY_MAX } from './dynamo-store.mjs';
import { fakeDynamo } from '../../edge/aws/fake-dynamo.mjs';
import { createService } from '../service.mjs';
import { memBucket, recordingSender, rawMail } from '../testkit.mjs';

const cfg = JSON.parse(readFileSync(new URL('../inboxes.json', import.meta.url), 'utf8'));
const make = () => {
  const db = fakeDynamo();
  return Object.assign(dynamoS3Store({ call: db.call, table: 'mail', bucket: memBucket() }), { db });
};

storeContract('dynamoS3Store', make);

test('dynamoS3Store: keys built from header text are hashed, never the raw value', async () => {
  const s = make();
  const longId = `<${'x'.repeat(5000)}@evil.test>`;
  const t = await s.createThread({ inbox: 'support', base_subject: 's'.repeat(3000), contact: 'a@x.test', first_at: '2026-11-26T00:00:00Z', last_at: '2026-11-26T00:00:00Z' });
  await s.insertMessage({ thread_id: t, inbox: 'support', direction: 'in', at: '2026-11-26T00:00:00Z', message_id: longId });
  for (const { input } of s.db.calls.filter((c) => c.op === 'PutItem')) {
    assert.ok(input.Item.pk.S.length < 200, `short partition key: ${input.Item.pk.S.slice(0, 40)}`);
  }
  assert.equal(await s.findThreadByMessageIds('support', [longId]), t);
  assert.equal(await s.findThreadBySubject('support', 's'.repeat(3000), 'a@x.test', '2026-11-01T00:00:00Z'), t);
});

test('dynamoS3Store: a huge text body is cut to stay under the item limit', async () => {
  const s = make();
  const id = await s.insertMessage({ thread_id: 1, inbox: 'support', direction: 'in', at: '2026-11-26T00:00:00Z', text_body: 'a'.repeat(TEXT_BODY_MAX + 99) });
  assert.equal((await s.getMessage(id)).text_body.length, TEXT_BODY_MAX);
});

test('dynamoS3Store: sends list newest first, across days, and purge stops at the window', async () => {
  const s = make();
  for (const [at, kind] of [['2025-01-01T00:00:00Z', 'reply'], ['2026-11-25T00:00:00Z', 'reply'], ['2026-11-26T00:00:00Z', 'reply'], ['2026-11-26T01:00:00Z', 'digest']]) {
    await s.logSend({ at, day: at.slice(0, 10), kind, from_addr: 'support@m', to_addr: 'a@x.test', result: 'sent' });
  }
  assert.deepEqual((await s.listSends({ limit: 3 })).map((r) => r.id), [4, 3, 2]);
  assert.deepEqual((await s.listSends({ day: '2026-11-26' })).map((r) => r.kind), ['digest', 'reply']);
  assert.equal(await s.countSends('2026-11-26'), 1, 'digests are not counted against the cap');
  await s.purgeSends('2026-01-01T00:00:00Z');
  assert.deepEqual((await s.listSends({})).map((r) => r.id), [4, 3, 2]);
  assert.equal((await s.listSends({ day: '2025-01-01' })).length, 0);
});

test('dynamoS3Store: purge drops the old thread, its pointers and its flags, and nothing newer', async () => {
  const s = make();
  const old = await s.createThread({ inbox: 'support', base_subject: 'hi', contact: 'a@x.test', first_at: '2026-01-01T00:00:00Z', last_at: '2026-01-01T00:00:00Z' });
  await s.insertMessage({ thread_id: old, inbox: 'support', direction: 'in', at: '2026-01-01T00:00:00Z', message_id: '<o@x>', raw_key: 'support/o.eml' });
  await s.addFlag({ thread_id: old, reason: 'legal', source: 'rule', at: '2026-01-01T00:00:00Z' });
  const mixed = await s.createThread({ inbox: 'support', first_at: '2026-01-01T00:00:00Z', last_at: '2026-11-01T00:00:00Z' });
  await s.insertMessage({ thread_id: mixed, inbox: 'support', direction: 'in', at: '2026-01-02T00:00:00Z', raw_key: 'support/m1.eml' });
  await s.insertMessage({ thread_id: mixed, inbox: 'support', direction: 'in', at: '2026-11-01T00:00:00Z', raw_key: 'support/m2.eml' });
  await s.addFlag({ thread_id: mixed, reason: 'refund', source: 'rule', at: '2026-11-01T00:00:00Z' });

  const r = await s.purgeInbox('support', '2026-06-01T00:00:00Z');
  assert.deepEqual(r, { messages: 2, rawKeys: ['support/o.eml', 'support/m1.eml'] });
  assert.equal(await s.getThread(old), null);
  assert.equal(await s.findThreadByMessageIds('support', ['<o@x>']), null);
  assert.equal(await s.findThreadBySubject('support', 'hi', 'a@x.test', '2025-01-01T00:00:00Z'), null);
  assert.deepEqual((await s.messagesInThread(mixed)).map((m) => m.raw_key), ['support/m2.eml']);
  assert.deepEqual((await s.openFlags()).map((f) => f.reason), ['refund']);
  const left = [...s.db.tables.get('mail').values()].map((i) => i.pk).filter((pk) => /^(MSG|TMSG|MID|IMSG|TSUBJ)/.test(pk));
  assert.equal(left.filter((pk) => pk === 'MSG').length, 1, `one message row left: ${left.join(', ')}`);
});

test('the mail service runs on dynamoS3Store: ingest, thread a reply, flag blocks send', async () => {
  const bucket = memBucket();
  const db = fakeDynamo();
  const store = dynamoS3Store({ call: db.call, table: 'mail', bucket });
  const sender = recordingSender('ses');
  const TOK = { owner: 'o'.repeat(32), agent: 'a'.repeat(32), read: 'r'.repeat(32) };
  const svc = createService({ store, sender, alerter: recordingSender('alert'), cfg, ownerAddress: 'owner@personal.test', tokens: TOK,
    unsubscribeSecret: 'u'.repeat(32), now: () => new Date('2026-11-26T10:00:00Z'), uuid: (() => { let n = 0; return () => `u${++n}`; })() });
  const api = async (method, path, body) => {
    const res = await svc.api(new Request(`https://mail.test${path}`, { method, headers: { authorization: `Bearer ${TOK.agent}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, data: await res.json() };
  };

  const first = await svc.ingest({ raw: rawMail(), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  const second = await svc.ingest({ raw: rawMail({ subject: 'Re: Help with export', messageId: '<m2@example.com>', inReplyTo: '<m1@example.com>', body: 'Still broken.' }), envFrom: 'ann@example.com', envTo: 'support@marisstella.app' });
  assert.equal(second.threadId, first.threadId, 'threaded by In-Reply-To');
  assert.equal(bucket.objects.size, 2, 'raw MIME kept in the bucket');

  const list = await api('GET', '/api/threads?unread=1');
  assert.equal(list.status, 200);
  assert.equal(list.data.threads.length, 1);

  const draft = await api('POST', '/api/drafts', { thread_id: first.threadId, text: 'Thanks, we are looking at it.' });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const sent = await api('POST', `/api/drafts/${draft.data.draft.id}/send`);
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(sender.sent.length, 1);

  await api('POST', `/api/threads/${first.threadId}/flag`, { reason: 'legal', note: 'test' });
  const d2 = await api('POST', '/api/drafts', { thread_id: first.threadId, text: 'More.' });
  const blocked = await api('POST', `/api/drafts/${d2.data.draft.id}/send`);
  assert.notEqual(blocked.status, 200, 'an open flag blocks the send');
  assert.equal(sender.sent.length, 1);
});

test('s3Bucket: PUT, GET (404 is null) and DELETE on encoded key paths', async () => {
  const seen = [];
  const objects = new Map();
  const request = async ({ method, path, body }) => {
    seen.push(`${method} ${path}`);
    if (method === 'PUT') { objects.set(path, body); return new Response(null, { status: 200 }); }
    if (method === 'GET') return objects.has(path) ? new Response(objects.get(path)) : new Response('', { status: 404 });
    objects.delete(path);
    return new Response(null, { status: 204 });
  };
  const b = s3Bucket({ request });
  await b.put('support/2026-11-26/a b.eml', new TextEncoder().encode('hi'));
  assert.equal(new TextDecoder().decode(await (await b.get('support/2026-11-26/a b.eml')).arrayBuffer()), 'hi');
  await b.delete(['support/2026-11-26/a b.eml']);
  assert.equal(await b.get('support/2026-11-26/a b.eml'), null);
  assert.deepEqual(seen, ['PUT /support/2026-11-26/a%20b.eml', 'GET /support/2026-11-26/a%20b.eml', 'DELETE /support/2026-11-26/a%20b.eml', 'GET /support/2026-11-26/a%20b.eml']);
  await assert.rejects(s3Bucket({ request: async () => new Response('', { status: 403 }) }).put('k', new Uint8Array()), /PutObject 403/);
});

test('the whole service and CLI suites pass on dynamoS3Store', async () => {
  const { spawnSync } = await import('node:child_process');
  // A child of `node --test` inherits NODE_TEST_CONTEXT and would report to
  // the parent instead of printing; drop it so the child prints its summary.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'service.test.mjs', 'cli.test.mjs'], {
    cwd: new URL('..', import.meta.url), env: { ...env, MAIL_TEST_STORE: 'dynamo' }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, `service suite on dynamo failed:\n${r.stdout.slice(-4000)}\n${r.stderr.slice(-2000)}`);
  assert.match(r.stdout, /# fail 0/);
});
