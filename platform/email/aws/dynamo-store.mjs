// The mail store on AWS: the same port as `d1r2Store` in ../store.mjs, on
// one on-demand DynamoDB table (key `pk` + `sk`, TTL on `expires_at`) for
// rows and an S3 bucket for raw MIME. It is the "Store" step of the move to
// SES (../README.md, "Portability"), and passes the same contract
// (../store.test.mjs, run again in dynamo-store.test.mjs).
//
// Why DynamoDB: the inboxes are a few hundred messages a month read by key,
// and on demand it costs nothing at rest and needs no VPC (the reasoning in
// platform/edge/aws/dynamo-store.mjs, which this follows). No SDK: `call` is
// the zero-dependency SigV4 JSON client in platform/edge/aws/sigv4.mjs.
//
// Items (no secondary index, so the table definition stays pk + sk):
//
//   pk                         sk                 what
//   SEQ                        <kind>             n, the last id handed out
//   MSG                        <id, 12 digits>    a message row
//   TMSG#<thread id>           <message id>       pointer: messages in a thread
//   MID#<inbox>#<sha256(Message-ID)>  <message id> thread_id: In-Reply-To lookup
//   IMSG#<inbox>               <at>#<message id>  pointer: retention purge
//   THR                        <id>               a thread row
//   TSUBJ#<inbox>#<sha256(base subject, contact)>  <thread id>   pointer
//   FLAG                       <id>               a flag row
//   DRAFT                      <id>               a draft row
//   SEND#<day>                 <id>               a send-log row (counts per day)
//   SENDS                      <id>               the same row (newest-first lists, purge)
//   DAILY#<kind>               <day>              n (takeDaily)
//   SUP#<address>              <scope>            reason, at
//   CONTACT#<address>          c                  a recorded opt-in
//
// Header values (Message-ID, subject, address) are strangers' text, so keys
// built from them are hashed: a 2 KB partition-key limit can't be hit and no
// value is parsed back out of a key. A message's text is cut at
// TEXT_BODY_MAX so a row stays under DynamoDB's 400 KB item limit; the whole
// message is in S3. Mail is personal data: the table and bucket belong to the
// email stack, encrypted at rest, and nothing from them is ever committed.

import { createHash } from 'node:crypto';
import { MSG_COLS, THREAD_COLS, DRAFT_COLS, SEND_COLS, PATCHABLE, ENCODE, encodeRow, decode } from '../store.mjs';

/** A message's text kept in the row; the full MIME is in S3. */
export const TEXT_BODY_MAX = 300 * 1024;
const FLAG_COLS = ['thread_id', 'message_id', 'reason', 'source', 'note', 'at'];

const pad = (id) => String(id).padStart(12, '0');
const h = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex');

function marshal(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'number' ? { N: String(v) } : { S: String(v) };
  }
  return out;
}
function unmarshal(item = {}) {
  const out = {};
  for (const [k, v] of Object.entries(item)) out[k] = 'N' in v ? Number(v.N) : v.S;
  return out;
}
const conditionFailed = (e) => e?.code === 'ConditionalCheckFailedException';
const rowOf = (cols, row) => {
  const vals = encodeRow(cols, row);
  return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
};
// Drop the key attributes and keep what the D1 rows hold.
const plain = (item) => {
  if (!item) return null;
  const { pk, sk, expires_at, ...rest } = item;
  return rest;
};

/**
 * @param call    DynamoDB JSON-protocol client: jsonProtocol({ target: 'DynamoDB_20120810', service: 'dynamodb', region })
 *                from platform/edge/aws/sigv4.mjs, or fakeDynamo().call in tests
 * @param table   the table name
 * @param bucket  an R2-shaped bucket ({put, get, delete}): s3Bucket(...) below, or memBucket() in tests
 * @param sendLogDays  TTL on send-log rows, a backstop behind purgeSends
 */
export function dynamoS3Store({ call, table, bucket, sendLogDays = 400 }) {
  const put = (item, cond) => call('PutItem', { TableName: table, Item: marshal(item), ...(cond || {}) });
  const del = (pk, sk) => call('DeleteItem', { TableName: table, Key: marshal({ pk, sk }) });
  const get = async (pk, sk) => {
    const out = await call('GetItem', { TableName: table, Key: marshal({ pk, sk }), ConsistentRead: true });
    return out.Item ? unmarshal(out.Item) : null;
  };

  async function nextId(kind) {
    const out = await call('UpdateItem', {
      TableName: table, Key: marshal({ pk: 'SEQ', sk: kind }),
      UpdateExpression: 'ADD #n :one', ExpressionAttributeNames: { '#n': 'n' },
      ExpressionAttributeValues: { ':one': { N: '1' } }, ReturnValues: 'UPDATED_NEW',
    });
    return Number(out.Attributes.n.N);
  }

  // Items of one partition in sk order (or reversed), optionally sk `op` value, up to `limit`.
  async function query(pk, { op, sk, limit = Infinity, newestFirst = false } = {}) {
    const items = [];
    let start;
    do {
      const out = await call('Query', {
        TableName: table,
        KeyConditionExpression: op ? `pk = :pk AND sk ${op} :sk` : 'pk = :pk',
        ExpressionAttributeValues: { ':pk': { S: pk }, ...(op ? { ':sk': { S: sk } } : {}) },
        ConsistentRead: true,
        ...(newestFirst ? { ScanIndexForward: false } : {}),
        ...(Number.isFinite(limit) ? { Limit: limit - items.length } : {}),
        ...(start ? { ExclusiveStartKey: start } : {}),
      });
      for (const it of out.Items || []) items.push(unmarshal(it));
      start = out.LastEvaluatedKey;
    } while (start && items.length < limit);
    return items.slice(0, limit);
  }

  // SET the whitelisted fields of one row; a row that doesn't exist stays absent.
  async function patch(pk, kind, id, p) {
    const keys = Object.keys(p).filter((k) => PATCHABLE[kind].has(k));
    if (!keys.length) return;
    const names = {};
    const values = {};
    keys.forEach((k, i) => {
      names[`#a${i}`] = k;
      const v = ENCODE[k] ? ENCODE[k](p[k]) : p[k];
      values[`:v${i}`] = typeof v === 'number' ? { N: String(v) } : { S: String(v ?? '') };
    });
    try {
      await call('UpdateItem', {
        TableName: table, Key: marshal({ pk, sk: pad(id) }),
        UpdateExpression: `SET ${keys.map((_, i) => `#a${i} = :v${i}`).join(', ')}`,
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeNames: names, ExpressionAttributeValues: values,
      });
    } catch (e) {
      if (!conditionFailed(e)) throw e;
    }
  }

  const getRow = async (pk, id) => plain(await get(pk, pad(id)));
  const allFlags = async () => (await query('FLAG')).map(plain);
  const openOnly = (flags) => flags.filter((f) => f.resolved_at === '');

  return {
    async putRaw(key, bytes) { await bucket.put(key, bytes, { httpMetadata: { contentType: 'message/rfc822' } }); },
    async getRaw(key) {
      const obj = await bucket.get(key);
      return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
    },
    async deleteRaw(keys) { if (keys.length) await bucket.delete(keys); },

    async insertMessage(row) {
      const id = await nextId('message');
      const r = rowOf(MSG_COLS, row);
      if (r.text_body.length > TEXT_BODY_MAX) r.text_body = r.text_body.slice(0, TEXT_BODY_MAX);
      await put({ pk: 'MSG', sk: pad(id), id, ...r });
      await put({ pk: `TMSG#${r.thread_id}`, sk: pad(id), id });
      if (r.message_id) await put({ pk: `MID#${r.inbox}#${h(r.message_id)}`, sk: pad(id), id, thread_id: r.thread_id });
      await put({ pk: `IMSG#${r.inbox}`, sk: `${r.at}#${pad(id)}`, id });
      return id;
    },
    updateMessage: (id, p) => patch('MSG', 'messages', id, p),
    getMessage: async (id) => decode(await getRow('MSG', id)),
    async messagesInThread(tid) {
      const out = [];
      for (const ptr of await query(`TMSG#${tid}`)) {
        const m = await getRow('MSG', ptr.id);
        if (m) out.push(decode(m));
      }
      return out;
    },

    async findThreadByMessageIds(inbox, ids) {
      let best = null;
      for (const mid of ids.filter(Boolean).slice(-20)) {
        const [hit] = await query(`MID#${inbox}#${h(mid)}`, { limit: 1, newestFirst: true });
        if (hit && (!best || hit.id > best.id)) best = hit;
      }
      return best ? best.thread_id : null;
    },
    async findThreadBySubject(inbox, base, contact, since) {
      if (!base || !contact) return null;
      for (const ptr of await query(`TSUBJ#${inbox}#${h(base, contact)}`, { newestFirst: true })) {
        const t = await getRow('THR', ptr.id);
        if (t && t.last_at >= since) return t.id;
      }
      return null;
    },
    async createThread(row) {
      const id = await nextId('thread');
      const r = rowOf(THREAD_COLS, row);
      await put({ pk: 'THR', sk: pad(id), id, ...r });
      if (r.base_subject && r.contact) await put({ pk: `TSUBJ#${r.inbox}#${h(r.base_subject, r.contact)}`, sk: pad(id), id });
      return id;
    },
    updateThread: (id, p) => patch('THR', 'threads', id, p),
    getThread: async (id) => decode(await getRow('THR', id)),
    async listThreads({ inbox, unread, status, category, flagged, after = 0, limit = 50 } = {}) {
      const max = Math.min(Math.max(1, limit), 200);
      const open = new Map();
      for (const f of openOnly(await allFlags())) open.set(f.thread_id, (open.get(f.thread_id) || 0) + 1);
      const out = [];
      let from = pad(after);
      // Filters run here, so read pages until `max` rows pass them.
      for (;;) {
        const page = await query('THR', { op: '>', sk: from, limit: 100 });
        for (const it of page) {
          const t = plain(it);
          if (inbox && t.inbox !== inbox) continue;
          if (unread && !(t.unread > 0)) continue;
          if (status && t.status !== status) continue;
          if (category && t.category !== category) continue;
          if (flagged && !open.get(t.id)) continue;
          out.push(decode({ ...t, open_flags: open.get(t.id) || 0 }));
          if (out.length >= max) return out;
        }
        if (page.length < 100) return out;
        from = page[page.length - 1].sk;
      }
    },

    async addFlag(row) {
      const id = await nextId('flag');
      await put({ pk: 'FLAG', sk: pad(id), id, ...rowOf(FLAG_COLS, row), alerted_at: '', resolved_at: '', resolved_note: '' });
      return id;
    },
    async openFlags({ threadId } = {}) {
      const open = openOnly(await allFlags());
      return threadId ? open.filter((f) => f.thread_id === threadId) : open.slice(0, 500);
    },
    async resolveFlag(id, note, at) {
      try {
        await call('UpdateItem', {
          TableName: table, Key: marshal({ pk: 'FLAG', sk: pad(id) }),
          UpdateExpression: 'SET #r = :at, #n = :note',
          ConditionExpression: '#r = :empty',
          ExpressionAttributeNames: { '#r': 'resolved_at', '#n': 'resolved_note' },
          ExpressionAttributeValues: { ':at': { S: at }, ':note': { S: String(note ?? '') }, ':empty': { S: '' } },
        });
        return true;
      } catch (e) {
        if (conditionFailed(e)) return false;
        throw e;
      }
    },
    async markAlerted(ids, at) {
      for (const id of ids) {
        await call('UpdateItem', {
          TableName: table, Key: marshal({ pk: 'FLAG', sk: pad(id) }),
          UpdateExpression: 'SET #a = :at', ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeNames: { '#a': 'alerted_at' }, ExpressionAttributeValues: { ':at': { S: at } },
        }).catch((e) => { if (!conditionFailed(e)) throw e; });
      }
    },
    flagsSince: async (since) => (await allFlags()).filter((f) => f.at >= since),

    async insertDraft(row) {
      const id = await nextId('draft');
      await put({ pk: 'DRAFT', sk: pad(id), id, ...rowOf(DRAFT_COLS, row) });
      return id;
    },
    getDraft: (id) => getRow('DRAFT', id),
    updateDraft: (id, p) => patch('DRAFT', 'drafts', id, p),

    async logSend(row) {
      const id = await nextId('send');
      const r = rowOf(SEND_COLS, row);
      const expires = Math.floor(Date.parse(r.at) / 1000) + sendLogDays * 86400;
      const item = { id, ...r, ...(Number.isFinite(expires) ? { expires_at: expires } : {}) };
      await put({ pk: `SEND#${r.day}`, sk: pad(id), ...item });
      await put({ pk: 'SENDS', sk: pad(id), ...item });
      return id;
    },
    async countSends(day, { to } = {}) {
      return (await query(`SEND#${day}`)).filter((s) => s.result === 'sent'
        && s.kind !== 'owner_alert' && s.kind !== 'digest' && (!to || s.to_addr === to)).length;
    },
    async listSends({ day, limit = 100 } = {}) {
      return (await query(day ? `SEND#${day}` : 'SENDS', { limit, newestFirst: true })).map(plain);
    },

    async takeDaily(kind, day, cap) {
      try {
        await call('UpdateItem', {
          TableName: table, Key: marshal({ pk: `DAILY#${kind}`, sk: day }),
          UpdateExpression: 'ADD #n :one', ConditionExpression: 'attribute_not_exists(#n) OR #n < :cap',
          ExpressionAttributeNames: { '#n': 'n' }, ExpressionAttributeValues: { ':one': { N: '1' }, ':cap': { N: String(cap) } },
        });
        return true;
      } catch (e) {
        if (conditionFailed(e)) return false;
        throw e;
      }
    },

    async suppression(address) {
      return Object.fromEntries((await query(`SUP#${address}`)).map((r) => [r.sk, r.reason]));
    },
    async suppress(address, scope, reason, at) {
      try {
        await put({ pk: `SUP#${address}`, sk: scope, reason, at }, { ConditionExpression: 'attribute_not_exists(pk)' });
      } catch (e) {
        if (!conditionFailed(e)) throw e;
      }
    },
    async consent(address) {
      const r = await get(`CONTACT#${address}`, 'c');
      return r && r.revoked_at === '' ? { marketing: { source: r.source, wording: r.wording, at: r.opted_in_at } } : {};
    },
    async putConsent({ address, source, wording, at }) {
      await put({ pk: `CONTACT#${address}`, sk: 'c', address, source, wording, opted_in_at: at, revoked_at: '' });
    },
    async revokeConsent(address, at) {
      await call('UpdateItem', {
        TableName: table, Key: marshal({ pk: `CONTACT#${address}`, sk: 'c' }),
        UpdateExpression: 'SET #r = :at', ConditionExpression: '#r = :empty',
        ExpressionAttributeNames: { '#r': 'revoked_at' }, ExpressionAttributeValues: { ':at': { S: at }, ':empty': { S: '' } },
      }).catch((e) => { if (!conditionFailed(e)) throw e; });
    },

    // Ids rise with time, so the oldest rows come first: stop at the first one inside the window.
    async purgeSends(cutoff) {
      for (;;) {
        const page = await query('SENDS', { limit: 100 });
        const old = page.filter((s) => s.at < cutoff);
        for (const s of old) {
          await del(`SEND#${s.day}`, s.sk);
          await del('SENDS', s.sk);
        }
        if (old.length < page.length || page.length < 100) return;
      }
    },
    async purgeInbox(inbox, cutoff) {
      const ptrs = await query(`IMSG#${inbox}`, { op: '<', sk: cutoff });
      if (!ptrs.length) return { messages: 0, rawKeys: [] };
      const rawKeys = [];
      const threads = new Set();
      for (const ptr of ptrs) {
        const m = await getRow('MSG', ptr.id);
        if (m) {
          if (m.raw_key) rawKeys.push(m.raw_key);
          threads.add(m.thread_id);
          await del(`TMSG#${m.thread_id}`, pad(m.id));
          if (m.message_id) await del(`MID#${m.inbox}#${h(m.message_id)}`, pad(m.id));
          await del('MSG', pad(m.id));
        }
        await del(`IMSG#${inbox}`, ptr.sk);
      }
      for (const d of await query('DRAFT')) {
        if (d.inbox === inbox && d.updated_at < cutoff) await del('DRAFT', d.sk);
      }
      const gone = new Set();
      for (const tid of threads) {
        if ((await query(`TMSG#${tid}`, { limit: 1 })).length) continue;
        const t = await getRow('THR', tid);
        if (t && t.base_subject && t.contact) await del(`TSUBJ#${t.inbox}#${h(t.base_subject, t.contact)}`, pad(tid));
        await del('THR', pad(tid));
        gone.add(tid);
      }
      // D1 drops every flag whose thread is gone; threads only go here, so these are the ones.
      for (const f of await query('FLAG')) if (gone.has(f.thread_id)) await del('FLAG', f.sk);
      return { messages: ptrs.length, rawKeys };
    },
  };
}

const keyPath = (key) => `/${String(key).split('/').map(encodeURIComponent).join('/')}`;

/**
 * An R2-shaped bucket over S3, for dynamoS3Store. `request` is
 * awsClient({ region, service: 's3', endpoint: `https://<bucket>.s3.<region>.amazonaws.com` })
 * from platform/edge/aws/sigv4.mjs (virtual-hosted style, so paths are keys).
 */
export function s3Bucket({ request }) {
  return {
    async put(key, bytes) {
      const res = await request({ method: 'PUT', path: keyPath(key), headers: { 'content-type': 'message/rfc822' }, body: bytes });
      if (!res.ok) throw new Error(`s3 PutObject ${res.status}`);
    },
    async get(key) {
      const res = await request({ method: 'GET', path: keyPath(key) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`s3 GetObject ${res.status}`);
      return { arrayBuffer: () => res.arrayBuffer() };
    },
    async delete(keys) {
      for (const k of [].concat(keys)) {
        const res = await request({ method: 'DELETE', path: keyPath(k) });
        if (!res.ok && res.status !== 404) throw new Error(`s3 DeleteObject ${res.status}`);
      }
    },
  };
}
