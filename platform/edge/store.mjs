// The edge API's storage port: every read and write `worker.mjs` and
// `inbox.mjs` make, as named operations instead of SQL.
//
// Two implementations sit behind it:
//
//   d1Store(db)          Cloudflare D1, the statements this code has always
//                        run (schema.sql). Used by the Worker until cutover.
//   dynamoStore(...)     DynamoDB on AWS (`aws/dynamo-store.mjs`), used by the
//                        Lambda handler (`aws/lambda.mjs`).
//
// Handlers call `storeOf(env)`: an `env.STORE` wins (the Lambda sets one),
// otherwise the D1 binding `env.DB` is wrapped. Both implementations keep the
// same semantics, and `aws/store-contract.test.mjs` runs one set of checks
// against both:
//
//   addCount(day, key, cap)       +1 unless the key already holds `cap` that day; true if it changed
//   readCounts(since)             [{day, slug, n}] for days >= since, ordered by day then slug
//   takeDaily(kind, day, cap)     +1 on a per-day counter ('feedback' | 'inbox' | 'early_access') unless at cap; true if taken
//   insertFeedback(row)           store {day, type, tool, page, message} under the next id
//   readFeedback(after)           up to 1000 rows with id > after, by id
//   insertInbox(row)              store {received, mail_from, rcpt_to, subject, message_id, raw} under the next id
//   purgeInbox(cutoffIso)         delete inbox rows received before the cutoff
//   readInbox(after)              up to 100 inbox rows with id > after, by id
//   deleteInbox(id)               delete one inbox row; the number deleted (0 or 1)
//   insertEarlyAccess(row)        store {received, product, email, role, note, page, consent} once per (product, email);
//                                 true if new, false if that address was already on that product's list
//   countEarlyAccess()            [{product, n}] ordered by product
//   readEarlyAccess(after)        up to 500 early-access rows with id > after, by id
//   purgeEarlyAccess(cutoffIso)   delete early-access rows received before the cutoff
//   deleteEarlyAccess(email)      delete that address from every product; the number deleted

const DAILY_TABLE = { feedback: 'feedback_daily', inbox: 'inbox_daily', early_access: 'early_access_daily' };

/** The store a handler should use for this environment. */
export function storeOf(env) {
  if (env.STORE) return env.STORE;
  return d1Store(env.DB);
}

/** The D1 implementation: the same SQL the Worker ran before the port existed. */
export function d1Store(db) {
  const changed = (r) => Boolean(r?.meta?.changes);
  return {
    async addCount(day, slug, cap) {
      return changed(await db.prepare(
        'INSERT INTO counts (day, slug, n) VALUES (?1, ?2, 1) ON CONFLICT (day, slug) DO UPDATE SET n = n + 1 WHERE n < ?3',
      ).bind(day, slug, cap).run());
    },
    async readCounts(since) {
      const { results = [] } = await db.prepare('SELECT day, slug, n FROM counts WHERE day >= ?1 ORDER BY day, slug')
        .bind(since).all();
      return results;
    },
    async takeDaily(kind, day, cap) {
      const table = DAILY_TABLE[kind];
      if (!table) throw new Error(`unknown daily counter: ${kind}`);
      return changed(await db.prepare(
        `INSERT INTO ${table} (day, n) VALUES (?1, 1) ON CONFLICT (day) DO UPDATE SET n = n + 1 WHERE n < ?2`,
      ).bind(day, cap).run());
    },
    async insertFeedback({ day, type, tool, page, message }) {
      await db.prepare('INSERT INTO feedback (day, type, tool, page, message) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(day, type, tool, page, message).run();
    },
    async readFeedback(after) {
      const { results = [] } = await db.prepare(
        'SELECT id, day, type, tool, page, message FROM feedback WHERE id > ?1 ORDER BY id LIMIT 1000',
      ).bind(after).all();
      return results;
    },
    async insertInbox(r) {
      await db.prepare(
        'INSERT INTO inbox (received, mail_from, rcpt_to, subject, message_id, raw) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
      ).bind(r.received, r.mail_from, r.rcpt_to, r.subject, r.message_id, r.raw).run();
    },
    async purgeInbox(cutoff) {
      await db.prepare('DELETE FROM inbox WHERE received < ?1').bind(cutoff).run();
    },
    async readInbox(after) {
      const { results = [] } = await db.prepare(
        'SELECT id, received, mail_from, rcpt_to, subject, message_id, raw FROM inbox WHERE id > ?1 ORDER BY id LIMIT 100',
      ).bind(after).all();
      return results;
    },
    async deleteInbox(id) {
      const { meta } = await db.prepare('DELETE FROM inbox WHERE id = ?1').bind(id).run();
      return meta?.changes || 0;
    },
    async insertEarlyAccess(r) {
      return changed(await db.prepare(
        'INSERT INTO early_access (received, product, email, role, note, page, consent) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (product, email) DO NOTHING',
      ).bind(r.received, r.product, r.email, r.role, r.note, r.page, r.consent).run());
    },
    async countEarlyAccess() {
      const { results = [] } = await db.prepare('SELECT product, COUNT(*) AS n FROM early_access GROUP BY product ORDER BY product')
        .bind().all();
      return results.map(({ product, n }) => ({ product, n: Number(n) }));
    },
    async readEarlyAccess(after) {
      const { results = [] } = await db.prepare(
        'SELECT id, received, product, email, role, note, page, consent FROM early_access WHERE id > ?1 ORDER BY id LIMIT 500',
      ).bind(after).all();
      return results;
    },
    async purgeEarlyAccess(cutoff) {
      await db.prepare('DELETE FROM early_access WHERE received < ?1').bind(cutoff).run();
    },
    async deleteEarlyAccess(email) {
      const { meta } = await db.prepare('DELETE FROM early_access WHERE email = ?1').bind(email).run();
      return meta?.changes || 0;
    },
  };
}
