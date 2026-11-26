// Test helpers: a D1-shaped wrapper over node:sqlite and an in-memory R2
// bucket, so the real SQL in store.mjs runs in tests. Not used in production.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function d1Shim() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(path.join(HERE, 'schema.sql'), 'utf8'));
  // D1 numbers its placeholders ?1, ?2...; node:sqlite takes them positionally too.
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async run() {
          const r = stmt.run(...args);
          return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
        async all() { return { results: stmt.all(...args).map((row) => ({ ...row })) }; },
      };
      return api;
    },
  };
}

export function memBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key) {
      const b = objects.get(key);
      return b ? { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null;
    },
    async delete(keys) { for (const k of [].concat(keys)) objects.delete(k); },
  };
}

/** A sender that records what it was asked to send. */
export function recordingSender(name = 'test') {
  const sent = [];
  return { name, addsCompliance: false, sent, async send(m) { sent.push(m); return { id: m.messageId }; } };
}

export const enc = (s) => new TextEncoder().encode(s);

export function rawMail({ from = 'Ann Customer <ann@example.com>', to = 'support@marisstella.app', subject = 'Help with export', body = 'Hi, the export button does nothing.', messageId = '<m1@example.com>', inReplyTo = '', extra = '' } = {}) {
  return enc([
    `From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Message-ID: ${messageId}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    ...(extra ? [extra] : []),
    'Content-Type: text/plain; charset=utf-8', '', body, '',
  ].join('\r\n'));
}
