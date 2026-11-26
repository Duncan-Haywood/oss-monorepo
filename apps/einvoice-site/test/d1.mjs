// Minimal D1 stand-in over node:sqlite, enough for worker.mjs: prepare().bind().first/run/all.
// Runs the real migration, so the SQL under test is the SQL that ships.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_early_access.sql", import.meta.url), "utf8"));
  // D1 numbers ?1..?N; node:sqlite binds those positionally from an array as well.
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}
