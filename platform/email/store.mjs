// The mail store's port: every read and write the service makes, as named
// operations. The service (service.mjs) never sees SQL, R2 or S3, so the
// AWS move (SES inbound -> S3, DynamoDB) replaces this file's
// implementation and nothing above it (README.md, "Portability").
//
//   d1r2Store(db, bucket)   Cloudflare: D1 for rows, R2 for raw MIME
//                           (or d1Bucket(db), raw in D1, until R2 is enabled).
//
// store.test.mjs runs one contract against this implementation over a real
// SQLite (node:sqlite behind a D1-shaped shim) and an in-memory bucket; an
// AWS implementation passes the same contract before it is wired in.
//
// Operations (all async):
//   putRaw(key, bytes) / getRaw(key) -> Uint8Array|null / deleteRaw(keys[])
//   insertMessage(row) -> id                 updateMessage(id, patch)
//   getMessage(id) -> row|null               messagesInThread(threadId) -> rows
//   findThreadByMessageIds(inbox, ids[]) -> threadId|null
//   findThreadBySubject(inbox, base, contact, sinceIso) -> threadId|null
//   createThread(row) -> id                  updateThread(id, patch)
//   getThread(id) -> row|null                listThreads({inbox, unread, status, category, flagged, after, limit})
//   addFlag(row) -> id                       openFlags({threadId?}) -> rows
//   resolveFlag(id, note, at) -> changed     markAlerted(ids[], at)
//   flagsSince(iso) -> rows
//   insertDraft(row) -> id                   getDraft(id)    updateDraft(id, patch)
//   logSend(row) -> id                       countSends(day, {to?}) -> n (result 'sent', kinds other than owner_alert/digest)
//   listSends({day?, limit}) -> rows
//   takeDaily(kind, day, cap) -> bool
//   suppression(address) -> {all?, marketing?, cold?, unsubscribed?}
//   suppress(address, scope, reason, at)
//   consent(address) -> {marketing: {...}}|{}    putConsent(row)   revokeConsent(address, at)
//   purgeInbox(inbox, cutoffIso) -> {messages, rawKeys}
//   purgeSends(cutoffIso)                    the send log is kept SEND_LOG_DAYS, then deleted

const J = (v) => JSON.stringify(v ?? []);

/** D1 caps a row near 2 MB; raw mail stored inline is cut at this size. */
export const RAW_INLINE_MAX = 1900 * 1024;

/** An R2-shaped bucket over the raw_blobs table, for an account without R2. */
export function d1Bucket(db) {
  return {
    inline: true,
    async put(key, bytes) {
      const b = bytes.byteLength > RAW_INLINE_MAX ? bytes.subarray(0, RAW_INLINE_MAX) : bytes;
      await db.prepare('INSERT INTO raw_blobs (key, body) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET body = ?2').bind(key, b).run();
    },
    async get(key) {
      const { results = [] } = await db.prepare('SELECT body FROM raw_blobs WHERE key = ?1').bind(key).all();
      if (!results.length) return null;
      const body = results[0].body;
      const u8 = body instanceof Uint8Array ? body : new Uint8Array(body);
      return { arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) };
    },
    async delete(keys) {
      for (const k of [].concat(keys)) await db.prepare('DELETE FROM raw_blobs WHERE key = ?1').bind(k).run();
    },
  };
}
const MSG_COLS = ['thread_id', 'inbox', 'direction', 'at', 'message_id', 'in_reply_to', 'refs', 'env_from', 'mail_from', 'from_name',
  'reply_to', 'rcpt_to', 'cc', 'subject', 'text_body', 'html_present', 'attachments', 'size', 'raw_key', 'automated',
  'auth_results', 'category', 'labels', 'why', 'read'];
const THREAD_COLS = ['inbox', 'subject', 'base_subject', 'contact', 'category', 'labels', 'status', 'first_at', 'last_at', 'unread'];
const DRAFT_COLS = ['thread_id', 'kind', 'inbox', 'to_addr', 'subject', 'text_body', 'author', 'status', 'reason', 'created_at', 'updated_at'];
const SEND_COLS = ['at', 'day', 'kind', 'thread_id', 'draft_id', 'from_addr', 'to_addr', 'subject', 'provider', 'provider_id', 'result', 'reason'];
const PATCHABLE = {
  messages: new Set(['category', 'labels', 'read', 'why']),
  threads: new Set(['category', 'labels', 'status', 'last_at', 'unread', 'subject']),
  drafts: new Set(['status', 'reason', 'updated_at', 'subject', 'text_body', 'to_addr']),
};
const ENCODE = { refs: J, cc: J, attachments: J, labels: J, why: J, html_present: Number, automated: Number, read: Number };
const DECODE_JSON = ['refs', 'cc', 'attachments', 'labels', 'why'];

function encodeRow(cols, row) {
  return cols.map((c) => {
    const v = row[c];
    if (ENCODE[c]) return ENCODE[c](v ?? (DECODE_JSON.includes(c) ? [] : 0));
    return v ?? (c.endsWith('_id') || c === 'size' || c === 'unread' ? 0 : '');
  });
}

function decode(row) {
  if (!row) return null;
  const out = { ...row };
  for (const c of DECODE_JSON) if (typeof out[c] === 'string') {
    try { out[c] = JSON.parse(out[c]); } catch { out[c] = []; }
  }
  for (const c of ['html_present', 'automated', 'read']) if (c in out) out[c] = Boolean(out[c]);
  return out;
}

export function d1r2Store(db, bucket) {
  const run = (sql, ...args) => db.prepare(sql).bind(...args).run();
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
  const one = async (sql, ...args) => (await all(sql, ...args))[0] || null;
  const insert = async (table, cols, row) => {
    const r = await run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})`, ...encodeRow(cols, row));
    return Number(r.meta?.last_row_id);
  };
  const patch = async (table, id, p) => {
    const keys = Object.keys(p).filter((k) => PATCHABLE[table].has(k));
    if (!keys.length) return;
    const vals = keys.map((k) => (ENCODE[k] ? ENCODE[k](p[k]) : p[k]));
    await run(`UPDATE ${table} SET ${keys.map((k, i) => `${k} = ?${i + 1}`).join(', ')} WHERE id = ?${keys.length + 1}`, ...vals, id);
  };

  return {
    async putRaw(key, bytes) { await bucket.put(key, bytes, { httpMetadata: { contentType: 'message/rfc822' } }); },
    async getRaw(key) {
      const obj = await bucket.get(key);
      return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
    },
    async deleteRaw(keys) { if (keys.length) await bucket.delete(keys); },

    insertMessage: (row) => insert('messages', MSG_COLS, row),
    updateMessage: (id, p) => patch('messages', id, p),
    getMessage: async (id) => decode(await one('SELECT * FROM messages WHERE id = ?1', id)),
    messagesInThread: async (tid) => (await all('SELECT * FROM messages WHERE thread_id = ?1 ORDER BY id', tid)).map(decode),

    async findThreadByMessageIds(inbox, ids) {
      const list = ids.filter(Boolean).slice(-20);
      if (!list.length) return null;
      const r = await one(`SELECT thread_id FROM messages WHERE inbox = ?1 AND message_id IN (${list.map((_, i) => `?${i + 2}`).join(', ')}) ORDER BY id DESC LIMIT 1`, inbox, ...list);
      return r ? r.thread_id : null;
    },
    async findThreadBySubject(inbox, base, contact, since) {
      if (!base || !contact) return null;
      const r = await one('SELECT id FROM threads WHERE inbox = ?1 AND base_subject = ?2 AND contact = ?3 AND last_at >= ?4 ORDER BY id DESC LIMIT 1', inbox, base, contact, since);
      return r ? r.id : null;
    },
    createThread: (row) => insert('threads', THREAD_COLS, row),
    updateThread: (id, p) => patch('threads', id, p),
    getThread: async (id) => decode(await one('SELECT * FROM threads WHERE id = ?1', id)),
    async listThreads({ inbox, unread, status, category, flagged, after = 0, limit = 50 } = {}) {
      const where = ['t.id > ?1'];
      const args = [after];
      const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `?${args.length}`)); };
      if (inbox) add('t.inbox = ?', inbox);
      if (unread) where.push('t.unread > 0');
      if (status) add('t.status = ?', status);
      if (category) add('t.category = ?', category);
      if (flagged) where.push("EXISTS (SELECT 1 FROM flags f WHERE f.thread_id = t.id AND f.resolved_at = '')");
      args.push(Math.min(Math.max(1, limit), 200));
      const rows = await all(`SELECT t.*, (SELECT COUNT(*) FROM flags f WHERE f.thread_id = t.id AND f.resolved_at = '') AS open_flags
        FROM threads t WHERE ${where.join(' AND ')} ORDER BY t.id LIMIT ?${args.length}`, ...args);
      return rows.map(decode);
    },

    addFlag: (row) => insert('flags', ['thread_id', 'message_id', 'reason', 'source', 'note', 'at'], row).then((id) => id),
    async openFlags({ threadId } = {}) {
      return threadId
        ? all("SELECT * FROM flags WHERE thread_id = ?1 AND resolved_at = '' ORDER BY id", threadId)
        : all("SELECT * FROM flags WHERE resolved_at = '' ORDER BY id LIMIT 500");
    },
    async resolveFlag(id, note, at) {
      const r = await run("UPDATE flags SET resolved_at = ?1, resolved_note = ?2 WHERE id = ?3 AND resolved_at = ''", at, note, id);
      return Boolean(r.meta?.changes);
    },
    async markAlerted(ids, at) {
      for (const id of ids) await run('UPDATE flags SET alerted_at = ?1 WHERE id = ?2', at, id);
    },
    flagsSince: (since) => all('SELECT * FROM flags WHERE at >= ?1 ORDER BY id', since),

    insertDraft: (row) => insert('drafts', DRAFT_COLS, row),
    getDraft: async (id) => one('SELECT * FROM drafts WHERE id = ?1', id),
    updateDraft: (id, p) => patch('drafts', id, p),

    logSend: (row) => insert('sends', SEND_COLS, row),
    async countSends(day, { to } = {}) {
      const r = to
        ? await one("SELECT COUNT(*) AS n FROM sends WHERE day = ?1 AND to_addr = ?2 AND result = 'sent' AND kind NOT IN ('owner_alert', 'digest')", day, to)
        : await one("SELECT COUNT(*) AS n FROM sends WHERE day = ?1 AND result = 'sent' AND kind NOT IN ('owner_alert', 'digest')", day);
      return Number(r?.n || 0);
    },
    listSends: ({ day, limit = 100 } = {}) => (day
      ? all('SELECT * FROM sends WHERE day = ?1 ORDER BY id DESC LIMIT ?2', day, limit)
      : all('SELECT * FROM sends ORDER BY id DESC LIMIT ?1', limit)),

    async takeDaily(kind, day, cap) {
      const r = await run('INSERT INTO daily (kind, day, n) VALUES (?1, ?2, 1) ON CONFLICT (kind, day) DO UPDATE SET n = n + 1 WHERE n < ?3', kind, day, cap);
      return Boolean(r.meta?.changes);
    },

    async suppression(address) {
      const rows = await all('SELECT scope, reason FROM suppressions WHERE address = ?1', address);
      return Object.fromEntries(rows.map((r) => [r.scope, r.reason]));
    },
    async suppress(address, scope, reason, at) {
      await run('INSERT INTO suppressions (address, scope, reason, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (address, scope) DO NOTHING', address, scope, reason, at);
    },
    async consent(address) {
      const r = await one("SELECT * FROM contacts WHERE address = ?1 AND revoked_at = ''", address);
      return r ? { marketing: { source: r.source, wording: r.wording, at: r.opted_in_at } } : {};
    },
    async putConsent({ address, source, wording, at }) {
      await run("INSERT INTO contacts (address, source, wording, opted_in_at, revoked_at) VALUES (?1, ?2, ?3, ?4, '') ON CONFLICT (address) DO UPDATE SET source = ?2, wording = ?3, opted_in_at = ?4, revoked_at = ''", address, source, wording, at);
    },
    async revokeConsent(address, at) {
      await run("UPDATE contacts SET revoked_at = ?1 WHERE address = ?2 AND revoked_at = ''", at, address);
    },

    async purgeSends(cutoff) { await run('DELETE FROM sends WHERE at < ?1', cutoff); },
    async purgeInbox(inbox, cutoff) {
      const old = await all('SELECT id, raw_key FROM messages WHERE inbox = ?1 AND at < ?2', inbox, cutoff);
      if (!old.length) return { messages: 0, rawKeys: [] };
      await run('DELETE FROM messages WHERE inbox = ?1 AND at < ?2', inbox, cutoff);
      await run('DELETE FROM drafts WHERE inbox = ?1 AND updated_at < ?2', inbox, cutoff);
      await run('DELETE FROM threads WHERE inbox = ?1 AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id)', inbox);
      await run('DELETE FROM flags WHERE NOT EXISTS (SELECT 1 FROM threads t WHERE t.id = flags.thread_id)');
      return { messages: old.length, rawKeys: old.map((r) => r.raw_key).filter(Boolean) };
    },
  };
}
