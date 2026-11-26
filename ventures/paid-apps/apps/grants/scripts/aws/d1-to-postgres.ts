// D1 → Postgres data load script (docs/AWS.md, cutover step 4).
//   pnpm exec wrangler d1 export grant-autopilot --remote --no-schema --output d1.sql
//   pnpm exec tsx scripts/aws/d1-to-postgres.ts d1.sql > load.sql
//   psql "$GRANTS_DB_URL" -f load.sql
// load.sql is one transaction: FK checks deferred to COMMIT, and every table's row count is
// checked against the export before COMMIT, so a partial or mismatched load changes nothing.
// The target must already have migrations-pg/ applied (the Lambda does it on deploy) and be empty.
// Exits non-zero, writing nothing, if the export has rows for tables the Postgres schema lacks.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toLoadScript, translateD1Dump } from "../../src/worker/aws/d1-dump";

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/aws/d1-to-postgres.ts <d1-export.sql> > load.sql");
  process.exit(2);
}
const pgDir = join(import.meta.dirname, "..", "..", "migrations-pg");
const schema = readdirSync(pgDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(pgDir, f), "utf8"))
  .join("\n");
const tables = [...schema.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([a-z_0-9]+)"?/g)].map(
  (m) => m[1] as string,
);
const t = translateD1Dump(readFileSync(file, "utf8"), tables);
if (t.unknownTables.length) {
  console.error(`tables in the export but not in migrations-pg/: ${t.unknownTables.join(", ")}`);
  process.exit(1);
}
process.stdout.write(toLoadScript(t));
const total = Object.values(t.counts).reduce((a, b) => a + b, 0);
console.error(`${total} rows in ${Object.keys(t.counts).length} tables`);
