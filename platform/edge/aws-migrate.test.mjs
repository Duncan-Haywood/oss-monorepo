import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import { d1Store } from './store.mjs';
import { readWorker, writeAll } from './aws/migrate-d1.mjs';
import { dynamoStore } from './aws/dynamo-store.mjs';
import { fakeDynamo } from './aws/fake-dynamo.mjs';

// A Worker over an in-memory D1-like store, reached through fetchImpl.
function memoryStore() {
  const s = { counts: new Map(), feedback: [], inbox: [] };
  return {
    s,
    async addCount(day, slug) { const k = `${day}|${slug}`; s.counts.set(k, (s.counts.get(k) || 0) + 1); return true; },
    async readCounts(since) { return [...s.counts].map(([k, n]) => { const [day, slug] = k.split('|'); return { day, slug, n }; }).filter((r) => r.day >= since); },
    async readFeedback(after) { return s.feedback.filter((r) => r.id > after).slice(0, 2); },
    async purgeInbox() {},
    async readInbox(after) { return s.inbox.filter((r) => r.id > after).slice(0, 2); },
  };
}

test('reads every page from the Worker and writes ids, values and sequences to DynamoDB', async () => {
  const mem = memoryStore();
  for (const [k, n] of [['2026-11-01|roof-bid', 7], ['2026-11-01|geo:GB', 2], ['2026-11-02|hub', 1]]) mem.s.counts.set(k, n);
  for (const id of [1, 2, 5]) mem.s.feedback.push({ id, day: '2026-11-01', type: 'idea', tool: '', page: '', message: `m${id}` });
  for (const id of [3, 4, 9]) mem.s.inbox.push({ id, received: '2026-11-01T00:00:00.000Z', mail_from: 'a@x', rcpt_to: 'support@marisstella.app', subject: 's', message_id: '<m>', raw: 'r' });
  const env = { STORE: mem, INBOX_TOKEN: 't' };
  const fetchImpl = (url, init) => worker.fetch(new Request(url, init), env);
  const data = await readWorker('https://w.example', { inboxToken: 't', fetchImpl });
  assert.equal(data.counts.length, 3);
  assert.deepEqual(data.feedback.map((r) => r.id), [1, 2, 5]);
  assert.deepEqual(data.inbox.map((r) => r.id), [3, 4, 9]);

  const f = fakeDynamo();
  const ddb = dynamoStore({ call: f.call, table: 'edge' });
  assert.deepEqual(await writeAll(ddb, data), { counts: 3, feedback: 3, inbox: 3 });
  assert.deepEqual(await writeAll(ddb, data), { counts: 3, feedback: 3, inbox: 3 }, 'idempotent');
  assert.deepEqual((await ddb.readCounts('0000')).map((r) => r.n), [2, 7, 1]);
  assert.deepEqual((await ddb.readFeedback(0)).map((r) => r.id), [1, 2, 5]);
  await ddb.insertFeedback({ day: '2026-11-03', type: 'idea', tool: '', page: '', message: 'after cutover' });
  assert.deepEqual((await ddb.readFeedback(5)).map((r) => r.id), [6], 'new ids continue after the migrated ones');
  await ddb.insertInbox({ received: '2026-11-03T00:00:00.000Z', mail_from: 'b', rcpt_to: 'c', subject: '', message_id: '', raw: 'x' });
  assert.deepEqual((await ddb.readInbox(9)).map((r) => r.id), [10]);
});

test('without INBOX_TOKEN the inbox is skipped, and the D1 store is untouched by reading', async () => {
  const db = { prepare: (sql) => ({ bind: () => ({ async all() { return { results: [] }; }, async run() { throw new Error(`write: ${sql}`); } }) }) };
  const fetchImpl = (url, init) => worker.fetch(new Request(url, init), { STORE: d1Store(db) });
  const data = await readWorker('https://w.example', { fetchImpl });
  assert.deepEqual(data, { counts: [], feedback: [], inbox: [] });
});
