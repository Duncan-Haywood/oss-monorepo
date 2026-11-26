// Writes migrations-pg/ (Postgres, AWS runtime) from migrations/ (D1, source of truth).
// Run after `pnpm db:generate`: pnpm exec tsx scripts/aws/gen-pg-migrations.ts
// test/unit/aws-ddl.test.ts fails while migrations-pg/ is stale. docs/AWS.md has the details.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePgMigrations } from "../../src/worker/aws/ddl";

const root = join(import.meta.dirname, "..", "..");
const src = join(root, "migrations");
const out = join(root, "migrations-pg");
const files = readdirSync(src)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(src, name), "utf8") }));
for (const f of generatePgMigrations(files)) {
  writeFileSync(join(out, f.name), f.sql);
  console.log(`wrote migrations-pg/${f.name}`);
}
