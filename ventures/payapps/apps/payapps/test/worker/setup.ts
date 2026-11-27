// Runs before every worker test file: applies the current schema DDL to the local D1 once. The
// pool reuses one isolate (and its database) across a worker's files (isolate: false in
// vitest.worker.config.ts), so later files find the schema in place and skip.
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
  const sql = (env as unknown as { TEST_SCHEMA_SQL: string }).TEST_SCHEMA_SQL;
  const exists = await env.DB.prepare(
    "select name from sqlite_master where type='table' and name='organization'",
  ).first();
  if (exists) return;
  const statements = sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/--> statement-breakpoint/g, "").trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
});
