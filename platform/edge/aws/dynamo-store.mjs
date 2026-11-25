// The edge API's store on DynamoDB: the same operations as `d1Store` in
// `../store.mjs`, on one on-demand table (`platform/aws/edge-api/`).
//
// Why DynamoDB and not Postgres: the API is a handful of counters and two
// append-only logs, read by key range. DynamoDB on demand costs nothing at
// rest, needs no VPC (so the Lambda needs no NAT gateway, about $32 a month),
// scales to zero and has conditional writes, which is what every cap here is.
// Postgres stays the default for product data (`goals.md`, portable where
// free); this API has no relational queries to port.
//
// One table, key `pk` (partition) + `sk` (sort), TTL on `expires_at`:
//
//   pk               sk                    attributes
//   COUNT            <day>#<slug>          day, slug, n
//   DAILY#feedback   <day>                 n
//   DAILY#inbox      <day>                 n
//   SEQ              feedback | inbox      n (last id handed out)
//   FEEDBACK         <id, 12 digits>       id, day, type, tool, page, message
//   INBOX            <id, 12 digits>       id, received, mail_from, rcpt_to, subject, message_id, raw, expires_at
//   RL               <hmac(sender)>#<win>  n, expires_at (rate-limit window)
//
// COUNT is one partition. A partition takes 1,000 writes a second; the site's
// per-key cap (20,000 a day) and the Lambda's reserved concurrency keep it far
// below that. `raw` is at most 256 KB (inbox.mjs MAX_RAW), under the 400 KB
// item limit.

const pad = (id) => String(id).padStart(12, '0');

/** DynamoDB attribute values <-> plain values (strings and numbers only). */
export function marshal(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'number' ? { N: String(v) } : { S: String(v) };
  }
  return out;
}
export function unmarshal(item = {}) {
  const out = {};
  for (const [k, v] of Object.entries(item)) out[k] = 'N' in v ? Number(v.N) : v.S;
  return out;
}

const conditionFailed = (e) => e?.code === 'ConditionalCheckFailedException';

/**
 * `call(op, input)` is a DynamoDB JSON-protocol client (`jsonProtocol` in
 * `sigv4.mjs`, or a fake in tests). `retentionDays` sets the inbox TTL, a
 * backstop behind the explicit purge in `inbox.mjs`.
 */
export function dynamoStore({ call, table, retentionDays = 90 }) {
  // +1 on a counter item unless it already holds `cap`. True if it changed.
  async function bump(key, cap, extra = {}) {
    const names = { '#n': 'n' };
    const values = { ':one': { N: '1' }, ':cap': { N: String(cap) } };
    const sets = [];
    for (const [k, v] of Object.entries(extra)) {
      names[`#${k}`] = k;
      values[`:${k}`] = marshal({ v }).v;
      sets.push(`#${k} = :${k}`);
    }
    try {
      await call('UpdateItem', {
        TableName: table,
        Key: marshal(key),
        UpdateExpression: `${sets.length ? `SET ${sets.join(', ')} ` : ''}ADD #n :one`,
        ConditionExpression: 'attribute_not_exists(#n) OR #n < :cap',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      });
      return true;
    } catch (e) {
      if (conditionFailed(e)) return false;
      throw e;
    }
  }

  async function nextId(kind) {
    const out = await call('UpdateItem', {
      TableName: table,
      Key: marshal({ pk: 'SEQ', sk: kind }),
      UpdateExpression: 'ADD #n :one',
      ExpressionAttributeNames: { '#n': 'n' },
      ExpressionAttributeValues: { ':one': { N: '1' } },
      ReturnValues: 'UPDATED_NEW',
    });
    return Number(out.Attributes.n.N);
  }

  // Every item of one partition with sk `op` value, in sk order, up to `limit`.
  async function query(pk, op, sk, limit = Infinity, extra = {}) {
    const items = [];
    let start;
    do {
      const out = await call('Query', {
        TableName: table,
        KeyConditionExpression: `pk = :pk AND sk ${op} :sk`,
        ExpressionAttributeValues: { ':pk': { S: pk }, ':sk': { S: sk }, ...(extra.values || {}) },
        ...(extra.filter ? { FilterExpression: extra.filter } : {}),
        ...(extra.names ? { ExpressionAttributeNames: extra.names } : {}),
        ...(Number.isFinite(limit) && !extra.filter ? { Limit: limit - items.length } : {}),
        ...(start ? { ExclusiveStartKey: start } : {}),
      });
      for (const it of out.Items || []) items.push(unmarshal(it));
      start = out.LastEvaluatedKey;
    } while (start && items.length < limit);
    return items.slice(0, limit);
  }

  const strip = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k] ?? (k === 'id' ? 0 : '')]));
  const FEEDBACK_COLS = ['id', 'day', 'type', 'tool', 'page', 'message'];
  const INBOX_COLS = ['id', 'received', 'mail_from', 'rcpt_to', 'subject', 'message_id', 'raw'];

  return {
    addCount(day, slug, cap) {
      return bump({ pk: 'COUNT', sk: `${day}#${slug}` }, cap, { day, slug });
    },
    async readCounts(since) {
      const rows = await query('COUNT', '>=', since);
      return rows.map(({ day, slug, n }) => ({ day, slug, n }));
    },
    async takeDaily(kind, day, cap) {
      if (kind !== 'feedback' && kind !== 'inbox') throw new Error(`unknown daily counter: ${kind}`);
      return bump({ pk: `DAILY#${kind}`, sk: day }, cap);
    },
    async insertFeedback(row) {
      const id = await nextId('feedback');
      await call('PutItem', { TableName: table, Item: marshal({ pk: 'FEEDBACK', sk: pad(id), id, ...row }) });
      return id;
    },
    async readFeedback(after) {
      return (await query('FEEDBACK', '>', pad(after), 1000)).map((r) => strip(r, FEEDBACK_COLS));
    },
    async insertInbox(row) {
      const id = await nextId('inbox');
      const expires = Math.floor(Date.parse(row.received) / 1000) + retentionDays * 86400;
      await call('PutItem', { TableName: table, Item: marshal({ pk: 'INBOX', sk: pad(id), id, ...row, expires_at: expires }) });
      return id;
    },
    async purgeInbox(cutoff) {
      const old = await query('INBOX', '>', pad(0), Infinity, {
        filter: '#r < :cut', names: { '#r': 'received' }, values: { ':cut': { S: cutoff } },
      });
      for (const r of old) await call('DeleteItem', { TableName: table, Key: marshal({ pk: 'INBOX', sk: pad(r.id) }) });
    },
    async readInbox(after) {
      return (await query('INBOX', '>', pad(after), 100)).map((r) => strip(r, INBOX_COLS));
    },
    async deleteInbox(id) {
      const out = await call('DeleteItem', { TableName: table, Key: marshal({ pk: 'INBOX', sk: pad(id) }), ReturnValues: 'ALL_OLD' });
      return out.Attributes ? 1 : 0;
    },
    // Migration only (`migrate-d1.mjs`): write rows with their D1 values and
    // ids, idempotently, then move the id sequence past them.
    async importCount({ day, slug, n }) {
      await call('PutItem', { TableName: table, Item: marshal({ pk: 'COUNT', sk: `${day}#${slug}`, day, slug, n }) });
    },
    async importFeedback(row) {
      await call('PutItem', { TableName: table, Item: marshal({ pk: 'FEEDBACK', sk: pad(row.id), ...row }) });
    },
    async importInbox(row) {
      const expires = Math.floor(Date.parse(row.received) / 1000) + retentionDays * 86400;
      await call('PutItem', { TableName: table, Item: marshal({ pk: 'INBOX', sk: pad(row.id), ...row, expires_at: expires }) });
    },
    async raiseSequence(kind, atLeast) {
      try {
        await call('UpdateItem', {
          TableName: table,
          Key: marshal({ pk: 'SEQ', sk: kind }),
          UpdateExpression: 'SET #n = :v',
          ConditionExpression: 'attribute_not_exists(#n) OR #n < :v',
          ExpressionAttributeNames: { '#n': 'n' },
          ExpressionAttributeValues: { ':v': { N: String(atLeast) } },
        });
      } catch (e) {
        if (!conditionFailed(e)) throw e;
      }
    },
    /** +1 in this sender's window; false once `limit` is reached. `key` is already a keyed hash. */
    rateLimit(key, limit, periodSec, now = Date.now()) {
      const win = Math.floor(now / 1000 / periodSec);
      return bump({ pk: 'RL', sk: `${key}#${win}` }, limit, { expires_at: (win + 2) * periodSec });
    },
  };
}
