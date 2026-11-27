// Runs before every worker test file: applies the migrations to a fresh local D1.
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
  const sql = (env as unknown as { TEST_SCHEMA_SQL: string }).TEST_SCHEMA_SQL;
  const exists = await env.DB.prepare(
    "select name from sqlite_master where type='table' and name='early_access_signups'",
  ).first();
  if (exists) return;
  const statements = sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
});
