// Applies *.sql files from a directory in name order, each once, tracked in `table`.
// The platform schema (sql/) is applied by db-admin as the master user; a product applies its
// own migrations as its app user, e.g. `node src/migrate.mjs ./migrations` with DATABASE_URL set,
// or by invoking its Lambda with {"__migrate": true} (src/app-entry.mjs).
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PLATFORM_SQL = process.env.PLATFORM_SQL_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "sql");

export async function migrate(client, dir, { table = "public.schema_migrations" } = {}) {
  if (!/^[a-z_]+\.[a-z_]+$/.test(table)) throw new Error("bad migrations table name");
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${table.split(".")[0]}`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${table} (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  let names;
  try { names = await readdir(dir); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
  const files = names.filter((f) => f.endsWith(".sql")).sort();
  const applied = [];
  for (const f of files) {
    const { rows } = await client.query(`SELECT 1 FROM ${table} WHERE name = $1`, [f]);
    if (rows.length) continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(join(dir, f), "utf8"));
      await client.query(`INSERT INTO ${table} (name) VALUES ($1)`, [f]);
      await client.query("COMMIT");
      applied.push(f);
    } catch (e) { await client.query("ROLLBACK"); throw new Error(`${f}: ${e.message}`); }
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { getPool, closePools } = await import("./pg.mjs");
  const client = await (await getPool()).connect();
  try { console.log(await migrate(client, process.argv[2] || PLATFORM_SQL)); }
  finally { client.release(); await closePools(); }
}
