// Minimal D1 stand-in backed by node:sqlite (same SQL dialect), for Worker tests.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function fakeD1(migrationsDir) {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(migrationsDir).sort())
    if (f.endsWith(".sql")) db.exec(readFileSync(join(migrationsDir, f), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (sql) => statement(sql), raw: db };
}

/** Records sent messages; `fail` makes the next sends throw. */
export function fakeEmail() {
  const sent = [];
  return {
    sent,
    fail: false,
    async send(msg) {
      if (this.fail) throw new Error("E_TEST send failed");
      sent.push(msg);
      return { messageId: `m${sent.length}` };
    },
  };
}
