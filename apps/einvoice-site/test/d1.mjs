// Minimal D1 stand-in over node:sqlite, enough for worker.mjs: prepare().bind().first/run/all.
// Runs the real migration, so the SQL under test is the SQL that ships.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort())
    if (f.endsWith(".sql")) db.exec(readFileSync(new URL(f, dir), "utf8"));
  // D1 numbers ?1..?N; node:sqlite binds those positionally from an array as well.
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => db.prepare(sql).run(...args),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}
