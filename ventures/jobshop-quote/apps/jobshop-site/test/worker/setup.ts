// Applies migrations/ to the fresh local D1 before each worker test file.
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
  const exists = await env.DB.prepare(
    "select name from sqlite_master where type='table' and name='early_access_requests'",
  ).first();
  if (exists) return;
  const sql = (env as unknown as { MIGRATION_SQL: string }).MIGRATION_SQL;
  const statements = sql
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
});
