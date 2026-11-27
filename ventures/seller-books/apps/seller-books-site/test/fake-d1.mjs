// Minimal D1Database stand-in over node:sqlite, running the real migrations, so the tests exercise
// the same SQL the Worker sends to D1. Supports prepare().bind().first()/all()/run().
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

export function createFakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).sort()) {
    sqlite.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  const statement = (sql, params = []) => ({
    bind: (...args) => statement(sql, args),
    async first() {
      const row = sqlite.prepare(sql).get(...params);
      return row ? { ...row } : null;
    },
    async all() {
      return {
        results: sqlite
          .prepare(sql)
          .all(...params)
          .map((r) => ({ ...r })),
      };
    },
    async run() {
      const res = sqlite.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(res.changes) } };
    },
  });
  return {
    prepare: (sql) => statement(sql),
    /** Test helper: direct synchronous query. */
    rows: (sql, ...params) =>
      sqlite
        .prepare(sql)
        .all(...params)
        .map((r) => ({ ...r })),
  };
}
