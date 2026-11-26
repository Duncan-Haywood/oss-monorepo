// The store contract. Any implementation of the port in store.mjs (the AWS
// DynamoDB + S3 one included) must pass `storeContract` before it is wired in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1r2Store, d1Bucket, RAW_INLINE_MAX } from './store.mjs';
import { d1Shim, memBucket, enc } from './testkit.mjs';

export function storeContract(name, make) {
  test(`${name}: raw objects round-trip and delete`, async () => {
    const s = make();
    await s.putRaw('support/2026-11-26/a.eml', enc('hello'));
    assert.equal(new TextDecoder().decode(await s.getRaw('support/2026-11-26/a.eml')), 'hello');
    await s.deleteRaw(['support/2026-11-26/a.eml']);
    assert.equal(await s.getRaw('support/2026-11-26/a.eml'), null);
  });

  test(`${name}: threads, messages, lookups, patches`, async () => {
    const s = make();
    const t = await s.createThread({ inbox: 'support', subject: 'Hi', base_subject: 'hi', contact: 'a@x.test', category: 'support', labels: [], status: 'open', first_at: '2026-11-26T00:00:00Z', last_at: '2026-11-26T00:00:00Z', unread: 0 });
    const id = await s.insertMessage({ thread_id: t, inbox: 'support', direction: 'in', at: '2026-11-26T00:00:00Z', message_id: '<1@x>', refs: [], cc: [], attachments: [{ filename: 'a', type: 't', size: 1 }], labels: [], why: [], read: false, automated: false, html_present: false });
    assert.equal(await s.findThreadByMessageIds('support', ['<nope@x>', '<1@x>']), t);
    assert.equal(await s.findThreadByMessageIds('billing', ['<1@x>']), null);
    assert.equal(await s.findThreadBySubject('support', 'hi', 'a@x.test', '2026-11-01T00:00:00Z'), t);
    assert.equal(await s.findThreadBySubject('support', 'hi', 'a@x.test', '2026-11-27T00:00:00Z'), null);
    await s.updateMessage(id, { read: true, labels: ['x'], raw_key: 'must-not-patch' });
    const m = await s.getMessage(id);
    assert.equal(m.read, true);
    assert.deepEqual(m.labels, ['x']);
    assert.deepEqual(m.attachments, [{ filename: 'a', type: 't', size: 1 }]);
    assert.equal(m.raw_key, '', 'only whitelisted fields are patchable');
    await s.updateThread(t, { unread: 3, labels: ['vip'] });
    const list = await s.listThreads({ inbox: 'support', unread: true });
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].labels, ['vip']);
    assert.equal((await s.listThreads({ inbox: 'billing' })).length, 0);
  });

  test(`${name}: flags open and resolve once`, async () => {
    const s = make();
    const f = await s.addFlag({ thread_id: 7, message_id: 1, reason: 'legal', source: 'rule', note: '', at: '2026-11-26T00:00:00Z' });
    assert.equal((await s.openFlags({ threadId: 7 })).length, 1);
    assert.equal(await s.resolveFlag(f, 'done', '2026-11-26T01:00:00Z'), true);
    assert.equal(await s.resolveFlag(f, 'again', '2026-11-26T02:00:00Z'), false);
    assert.equal((await s.openFlags()).length, 0);
  });

  test(`${name}: send counts, daily counters, suppression and consent`, async () => {
    const s = make();
    const row = { at: '2026-11-26T00:00:00Z', day: '2026-11-26', kind: 'reply', from_addr: 'support@m', to_addr: 'a@x.test', result: 'sent' };
    await s.logSend(row);
    await s.logSend({ ...row, result: 'blocked' });
    await s.logSend({ ...row, kind: 'owner_alert' });
    assert.equal(await s.countSends('2026-11-26'), 1);
    assert.equal(await s.countSends('2026-11-26', { to: 'b@x.test' }), 0);
    assert.equal(await s.takeDaily('k', '2026-11-26', 1), true);
    assert.equal(await s.takeDaily('k', '2026-11-26', 1), false);
    await s.suppress('a@x.test', 'all', 'complaint', row.at);
    await s.suppress('a@x.test', 'all', 'again', row.at);
    assert.deepEqual(await s.suppression('a@x.test'), { all: 'complaint' });
    await s.putConsent({ address: 'b@x.test', source: 'form', wording: 'v1', at: row.at });
    assert.equal((await s.consent('b@x.test')).marketing.source, 'form');
    await s.revokeConsent('b@x.test', row.at);
    assert.deepEqual(await s.consent('b@x.test'), {});
  });

  test(`${name}: purge removes old mail per inbox and reports raw keys`, async () => {
    const s = make();
    const t = await s.createThread({ inbox: 'dmarc', first_at: '2026-01-01T00:00:00Z', last_at: '2026-01-01T00:00:00Z' });
    await s.insertMessage({ thread_id: t, inbox: 'dmarc', direction: 'in', at: '2026-01-01T00:00:00Z', raw_key: 'dmarc/old.eml' });
    const t2 = await s.createThread({ inbox: 'support', first_at: '2026-01-01T00:00:00Z', last_at: '2026-01-01T00:00:00Z' });
    await s.insertMessage({ thread_id: t2, inbox: 'support', direction: 'in', at: '2026-01-01T00:00:00Z', raw_key: 'support/old.eml' });
    const r = await s.purgeInbox('dmarc', '2026-06-01T00:00:00Z');
    assert.deepEqual(r, { messages: 1, rawKeys: ['dmarc/old.eml'] });
    assert.equal(await s.getThread(t), null);
    assert.ok(await s.getThread(t2), 'other inboxes keep their mail');
  });
}

storeContract('d1r2Store', () => d1r2Store(d1Shim(), memBucket()));

const shared = () => { const db = d1Shim(); return d1r2Store(db, d1Bucket(db)); };
storeContract('d1r2Store with raw in D1 (no R2)', shared);

test('raw kept in D1 is cut at RAW_INLINE_MAX', async () => {
  const db = d1Shim();
  const b = d1Bucket(db);
  await b.put('k', new Uint8Array(RAW_INLINE_MAX + 10));
  assert.equal((await (await b.get('k')).arrayBuffer()).byteLength, RAW_INLINE_MAX);
});
