// One set of storage checks, run against both implementations of the port in
// store.mjs: D1's SQL on a real SQLite (node:sqlite, the engine D1 runs) and
// the DynamoDB store on the strict in-memory fake. If they agree, the Worker
// and the Lambda behave the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { d1Store } from './store.mjs';
import { dynamoStore } from './aws/dynamo-store.mjs';
import { fakeDynamo } from './aws/fake-dynamo.mjs';

let sqlite = null;
try { sqlite = await import('node:sqlite'); } catch { /* Node without node:sqlite: the D1 half is skipped */ }

/** A D1-shaped binding over node:sqlite, with the repository's schema.sql applied. */
function sqliteD1() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    prepare(sql) {
      return {
        bind(...args) {
          const st = db.prepare(sql);
          return {
            async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; },
            async all() { return { results: st.all(...args).map((r) => ({ ...r })) }; },
          };
        },
      };
    },
  };
}

const impls = [
  ['dynamodb', () => dynamoStore({ call: fakeDynamo().call, table: 'edge' })],
  ...(sqlite ? [['d1 (sqlite)', () => d1Store(sqliteD1())]] : []),
];

for (const [name, make] of impls) {
  test(`${name}: counts respect the per-key cap and read back from a day on, ordered`, async () => {
    const s = make();
    assert.equal(await s.addCount('2026-11-01', 'b', 2), true);
    assert.equal(await s.addCount('2026-11-01', 'b', 2), true);
    assert.equal(await s.addCount('2026-11-01', 'b', 2), false, 'third hit is over the cap of 2');
    for (const [d, k] of [['2026-11-01', 'a'], ['2026-11-02', 'geo:GB'], ['2026-10-31', 'old'], ['2026-11-02', 'a']]) await s.addCount(d, k, 100);
    assert.deepEqual(await s.readCounts('2026-11-01'), [
      { day: '2026-11-01', slug: 'a', n: 1 }, { day: '2026-11-01', slug: 'b', n: 2 },
      { day: '2026-11-02', slug: 'a', n: 1 }, { day: '2026-11-02', slug: 'geo:GB', n: 1 },
    ]);
  });

  test(`${name}: daily counters are per kind and per day`, async () => {
    const s = make();
    assert.equal(await s.takeDaily('feedback', '2026-11-01', 1), true);
    assert.equal(await s.takeDaily('feedback', '2026-11-01', 1), false);
    assert.equal(await s.takeDaily('inbox', '2026-11-01', 1), true);
    assert.equal(await s.takeDaily('early_access', '2026-11-01', 1), true);
    assert.equal(await s.takeDaily('early_access', '2026-11-01', 1), false);
    assert.equal(await s.takeDaily('feedback', '2026-11-02', 1), true);
    await assert.rejects(s.takeDaily('nope', '2026-11-01', 1));
  });

  test(`${name}: feedback gets increasing ids and reads back after an id`, async () => {
    const s = make();
    for (let i = 1; i <= 5; i++) await s.insertFeedback({ day: '2026-11-01', type: 'idea', tool: '', page: '', message: `m${i}` });
    const all = await s.readFeedback(0);
    assert.deepEqual(all.map((r) => r.id), [1, 2, 3, 4, 5]);
    assert.deepEqual(all[0], { id: 1, day: '2026-11-01', type: 'idea', tool: '', page: '', message: 'm1' });
    assert.deepEqual((await s.readFeedback(3)).map((r) => r.message), ['m4', 'm5']);
  });

  test(`${name}: inbox insert, read after, purge by received, delete one`, async () => {
    const s = make();
    const row = (received, i) => ({ received, mail_from: `a${i}@x.test`, rcpt_to: 'support@marisstella.app', subject: `s${i}`, message_id: `<${i}@x>`, raw: `raw ${i}` });
    await s.insertInbox(row('2026-01-01T00:00:00.000Z', 1));
    await s.insertInbox(row('2026-06-01T00:00:00.000Z', 2));
    await s.insertInbox(row('2026-07-01T00:00:00.000Z', 3));
    await s.insertInbox(row('2026-08-01T00:00:00.000Z', 4));
    await s.purgeInbox('2026-05-01T00:00:00.000Z');
    const left = await s.readInbox(0);
    assert.deepEqual(left.map((r) => r.id), [2, 3, 4]);
    assert.deepEqual(Object.keys(left[0]).sort(), ['id', 'mail_from', 'message_id', 'raw', 'rcpt_to', 'received', 'subject']);
    assert.equal(await s.deleteInbox(3), 1);
    assert.equal(await s.deleteInbox(3), 0);
    assert.deepEqual((await s.readInbox(2)).map((r) => r.id), [4]);
  });

  test(`${name}: early access is one row per product and address, counted, purged and erased`, async () => {
    const s = make();
    const row = (received, product, email) => ({ received, product, email, role: 'electrical sub', note: '', page: '/industries/construction/', consent: '2026-11-26' });
    assert.equal(await s.insertEarlyAccess(row('2026-01-01T00:00:00.000Z', 'payapps', 'old@x.test')), true);
    assert.equal(await s.insertEarlyAccess(row('2026-11-01T00:00:00.000Z', 'payapps', 'a@x.test')), true);
    assert.equal(await s.insertEarlyAccess(row('2026-11-02T00:00:00.000Z', 'payapps', 'a@x.test')), false, 'same product and address again');
    assert.equal(await s.insertEarlyAccess(row('2026-11-02T00:00:00.000Z', 'cmmc', 'a@x.test')), true, 'another product');
    assert.equal(await s.insertEarlyAccess(row('2026-11-03T00:00:00.000Z', 'payapps', 'b@x.test')), true);
    assert.deepEqual(await s.countEarlyAccess(), [{ product: 'cmmc', n: 1 }, { product: 'payapps', n: 3 }]);
    await s.purgeEarlyAccess('2026-06-01T00:00:00.000Z');
    const left = await s.readEarlyAccess(0);
    assert.deepEqual(left.map((r) => r.email), ['a@x.test', 'a@x.test', 'b@x.test']);
    assert.deepEqual(Object.keys(left[0]).sort(), ['consent', 'email', 'id', 'note', 'page', 'product', 'received', 'role']);
    assert.equal(left[0].received, '2026-11-01T00:00:00.000Z', 'the first sign-up is kept, not the repeat');
    assert.deepEqual((await s.readEarlyAccess(left[0].id)).map((r) => r.product), ['cmmc', 'payapps']);
    assert.equal(await s.deleteEarlyAccess('a@x.test'), 2, 'erased from every product');
    assert.equal(await s.deleteEarlyAccess('a@x.test'), 0);
    assert.deepEqual(await s.countEarlyAccess(), [{ product: 'payapps', n: 1 }]);
  });
}

test('dynamodb: inbox rows carry a TTL backstop and rate-limit windows expire', async () => {
  const f = fakeDynamo();
  const s = dynamoStore({ call: f.call, table: 'edge', retentionDays: 90 });
  await s.insertInbox({ received: '2026-01-01T00:00:00.000Z', mail_from: 'a', rcpt_to: 'b', subject: '', message_id: '', raw: 'x' });
  const item = [...f.tables.get('edge').values()].find((r) => r.pk === 'INBOX');
  assert.equal(item.expires_at, Date.parse('2026-01-01T00:00:00Z') / 1000 + 90 * 86400);
  const t0 = Date.parse('2026-01-01T00:00:10Z');
  for (let i = 0; i < 3; i++) assert.equal(await s.rateLimit('k', 3, 60, t0), true);
  assert.equal(await s.rateLimit('k', 3, 60, t0), false, 'fourth in the same minute');
  assert.equal(await s.rateLimit('k', 3, 60, t0 + 60000), true, 'next minute');
  assert.equal(await s.rateLimit('other', 3, 60, t0), true, 'per sender');
  const rl = [...f.tables.get('edge').values()].find((r) => r.pk === 'RL');
  assert.ok(rl.expires_at > t0 / 1000 && rl.expires_at <= t0 / 1000 + 180);
});
