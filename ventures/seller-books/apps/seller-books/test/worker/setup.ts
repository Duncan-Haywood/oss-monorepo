// Runs before every worker test file. With isolate: false (vitest.worker.config.ts) the local D1 is
// shared by every file in a Vitest worker, so the schema is applied once and later files skip it.
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
