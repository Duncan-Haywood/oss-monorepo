// The mail Lambda: event routing, secrets parsing, the per-address sender,
// and an SES receipt -> stored thread -> agent API read, end to end on the
// DynamoDB store (fake) with no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createMailHandler, parseSecrets, eventKind, perAddressSender } from './lambda.mjs';
import { dynamoS3Store } from './dynamo-store.mjs';
import { fakeDynamo } from '../../edge/aws/fake-dynamo.mjs';
import { createService } from '../service.mjs';
import { memBucket, recordingSender, rawMail } from '../testkit.mjs';

const cfg = JSON.parse(readFileSync(new URL('../inboxes.json', import.meta.url), 'utf8'));
const SECRET = JSON.stringify({ agent_token: 'a'.repeat(32), read_token: 'r'.repeat(32), owner_token: 'o'.repeat(32), unsubscribe_secret: 'u'.repeat(32) });

test('parseSecrets keeps only values long enough to be tokens', () => {
  assert.deepEqual(parseSecrets(SECRET).tokens, { agent: 'a'.repeat(32), read: 'r'.repeat(32), owner: 'o'.repeat(32) });
  assert.deepEqual(parseSecrets('{"agent_token":"short"}').tokens, { agent: '', read: '', owner: '' });
  assert.deepEqual(parseSecrets('not json').tokens, { agent: '', read: '', owner: '' });
  assert.equal(parseSecrets('').unsubscribeSecret, '');
});

test('eventKind tells SES, the daily schedule and HTTP apart', () => {
  assert.equal(eventKind({ Records: [{ eventSource: 'aws:ses' }] }), 'ses');
  assert.equal(eventKind({ source: 'aws.events', 'detail-type': 'Scheduled Event' }), 'schedule');
  assert.equal(eventKind({ rawPath: '/api/threads', requestContext: { http: { method: 'GET' } } }), 'http');
});

function harness({ secrets = async () => SECRET } = {}) {
  const store = dynamoS3Store({ call: fakeDynamo().call, table: 'mail', bucket: memBucket() });
  const alerter = recordingSender('alert');
  const inbound = new Map();
  const logs = [];
  let built = 0;
  const handler = createMailHandler({
    secrets,
    getObject: async (bucket, key) => inbound.get(`${bucket}/${key}`),
    service: ({ tokens, unsubscribeSecret }) => {
      built++;
      return createService({ store, sender: recordingSender('ses'), alerter, cfg, ownerAddress: 'owner@personal.test', tokens, unsubscribeSecret,
        now: () => new Date('2026-11-27T10:00:00Z') });
    },
    config: { RAW_BUCKET: 'inbound', INBOUND_PREFIX: '' },
    log: (o) => logs.push(o),
  });
  return { handler, inbound, logs, alerter, built: () => built };
}
const receipt = (key, to, verdicts = {}) => ({
  Records: [{ eventSource: 'aws:ses', ses: { mail: { source: 'ann@example.com', destination: [to], messageId: key },
    receipt: { recipients: [to], action: { type: 'Lambda', invocationType: 'Event', functionArn: 'arn:aws:lambda:us-east-2:123456789012:function:mail-inboxes' }, ...verdicts } } }],
});
const http = (path, token) => ({ rawPath: path, rawQueryString: '', headers: token ? { authorization: `Bearer ${token}` } : {}, requestContext: { http: { method: 'GET' } } });

test('an SES receipt is stored, threaded, and readable through the agent API', async () => {
  const h = harness();
  h.inbound.set('inbound/m1', rawMail());
  await h.handler(receipt('m1', 'support@marisstella.app'));
  const res = await h.handler(http('/api/threads', 'a'.repeat(32)));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const threads = body.threads || body;
  assert.equal(threads.length, 1);
  assert.equal(threads[0].inbox, 'support');
  assert.equal((await h.handler(http('/api/threads'))).statusCode, 404, 'no token, nothing admitted');
  assert.equal(h.built(), 1, 'the service is built once per container');
  assert.ok(!JSON.stringify(h.logs).includes('export button'), 'message text never reaches the logs');
});

test('spam and virus verdicts are dropped before ingest', async () => {
  const h = harness();
  h.inbound.set('inbound/s1', rawMail({ messageId: '<s1@x>' }));
  await h.handler(receipt('s1', 'support@marisstella.app', { spamVerdict: { status: 'FAIL' } }));
  const res = JSON.parse((await h.handler(http('/api/threads', 'a'.repeat(32)))).body);
  assert.equal((res.threads || res).length, 0);
  assert.deepEqual(h.logs[0], { mail: 'dropped', why: 'spam' });
});

test('a privacy@ message alerts the owner at once (it stands in for the Worker forward)', async () => {
  const h = harness();
  h.inbound.set('inbound/p1', rawMail({ to: 'privacy@marisstella.app', subject: 'Delete my data', messageId: '<p1@x>' }));
  await h.handler(receipt('p1', 'privacy@marisstella.app'));
  assert.equal(h.alerter.sent.length, 1);
  assert.equal(h.alerter.sent[0].to, 'owner@personal.test');
});

test('the daily schedule runs the purge and digest', async () => {
  const h = harness();
  const r = await h.handler({ source: 'aws.events', 'detail-type': 'Scheduled Event' });
  assert.equal(typeof r, 'object');
});

test('a failed secrets read is retried on the next event, not cached', async () => {
  let n = 0;
  const h = harness({ secrets: async () => { if (n++ === 0) throw new Error('secrets manager down'); return SECRET; } });
  await assert.rejects(h.handler(http('/api/threads', 'a'.repeat(32))), /secrets manager down/);
  assert.equal((await h.handler(http('/api/threads', 'a'.repeat(32)))).statusCode, 200);
});

test('perAddressSender sends from the inbox address and refuses marketing', async () => {
  const made = [];
  const s = perAddressSender({ make: (from) => { const sent = []; made.push({ from, sent }); return async (m) => { sent.push(m); return { messageId: 'ses-1' }; }; } });
  assert.equal(s.addsCompliance, false, 'the service adds its own footer');
  const r = await s.send({ from: 'Support@marisstella.app', to: 'ann@example.com', subject: 'Re: x', text: 'hi', messageId: '<a@m>', inReplyTo: '<m1@x>', references: ['<m1@x>'], stream: 'transactional' });
  assert.equal(r.id, 'ses-1');
  await s.send({ from: 'support@marisstella.app', to: 'bob@example.com', subject: 'Re: y', text: 'hi', messageId: '<b@m>' });
  await s.send({ from: 'billing@marisstella.app', to: 'bob@example.com', subject: 'Re: z', text: 'hi', messageId: '<c@m>' });
  assert.deepEqual(made.map((x) => x.from), ['support@marisstella.app', 'billing@marisstella.app']);
  assert.equal(made[0].sent[0].headers['In-Reply-To'], '<m1@x>');
  await assert.rejects(s.send({ from: 'hello@marisstella.app', to: 'c@example.com', subject: 'News', text: 'x', messageId: '<d@m>', stream: 'marketing' }), /marketing stream/);
  await assert.rejects(s.send({ to: 'c@example.com', subject: 's', text: 'x', messageId: '<e@m>' }), /no From/);
});
