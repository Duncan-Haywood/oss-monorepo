// D1 -> Postgres data migration (docs/AWS.md, "Cutover"). Pure translation of the SQL that
// `wrangler d1 export <db> --remote --no-schema --output dump.sql` writes into SQL that psql loads
// into the schema from migrations-pg/. The CLI is scripts/aws/d1-to-postgres.ts.
//
// A D1 export is SQLite `.dump` output: one `INSERT INTO "t" VALUES(...)` (or `INSERT INTO t
// (...) VALUES(...)`) per row, with string literals in '...' ('' escapes), numbers, NULL,
// X'hex' blobs and replace('..','\n',char(10)) for strings with newlines. Postgres takes all of it
// except char() (-> chr()) and X'..' (-> '\x..'::bytea). Rows go in as-is: the Postgres schema keeps
// D1's storage model (ddl.ts), so epoch-ms integers and 0/1 booleans need no conversion.

/** Tables that exist only in D1 / SQLite and are never copied. */
export const SKIPPED_TABLES = new Set([
  "d1_migrations",
  "sqlite_sequence",
  "_cf_KV",
  "_cf_METADATA",
]);

export interface DumpTranslation {
  /** One INSERT per row, in dump order. */
  statements: string[];
  /** Rows per table, to compare with `select count(*)` after the load. */
  counts: Record<string, number>;
  /** Tables present in the dump but not in the Postgres schema (load would fail; listed instead). */
  unknownTables: string[];
}

/** Splits dump text into statements on `;` outside quotes. */
export function splitDumpStatements(dump: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < dump.length; i++) {
    const c = dump[i];
    if (quote) {
      if (c === quote) {
        if (dump[i + 1] === quote) i++;
        else quote = null;
      }
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === ";") {
      const s = dump.slice(start, i).trim();
      if (s) out.push(s);
      start = i + 1;
    }
  }
  const tail = dump.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

const INSERT =
  /^INSERT INTO\s+("(?:[^"]|"")+"|`[^`]+`|[A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?\s*VALUES\s*\(/i;

function unquoteIdent(raw: string): string {
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/""/g, '"');
  if (raw.startsWith("`")) return raw.slice(1, -1);
  return raw;
}

/** Rewrites the SQLite-only parts of a VALUES list (outside string literals). */
export function translateValues(values: string): string {
  let out = "";
  let i = 0;
  while (i < values.length) {
    const c = values[i] as string;
    // X'00ff' blob literal
    if (
      (c === "X" || c === "x") &&
      values[i + 1] === "'" &&
      !/[A-Za-z0-9_]/.test(values[i - 1] ?? "")
    ) {
      const end = values.indexOf("'", i + 2);
      out += `'\\x${values.slice(i + 2, end)}'::bytea`;
      i = end + 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < values.length) {
        if (values[j] === "'") {
          if (values[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      out += values.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/^char\(/i.test(values.slice(i, i + 5)) && !/[A-Za-z0-9_]/.test(values[i - 1] ?? "")) {
      out += "chr(";
      i += 5;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Translates a whole D1 export. `knownTables` = tables in the Postgres schema. */
export function translateD1Dump(dump: string, knownTables: Iterable<string>): DumpTranslation {
  const known = new Set(knownTables);
  const statements: string[] = [];
  const counts: Record<string, number> = {};
  const unknown = new Set<string>();
  for (const stmt of splitDumpStatements(dump)) {
    const m = INSERT.exec(stmt);
    if (!m) continue; // PRAGMA, BEGIN/COMMIT, CREATE ... (schema comes from migrations-pg)
    const table = unquoteIdent(m[1] as string);
    if (SKIPPED_TABLES.has(table) || table.startsWith("sqlite_")) continue;
    if (!known.has(table)) {
      unknown.add(table);
      continue;
    }
    const cols = m[2] ? ` ${m[2].replace(/`([^`]+)`/g, '"$1"')}` : "";
    const values = stmt.slice(m[0].length - 1); // from the "(" of VALUES(
    statements.push(`INSERT INTO "${table}"${cols} VALUES ${translateValues(values)};`);
    counts[table] = (counts[table] ?? 0) + 1;
  }
  return { statements, counts, unknownTables: [...unknown].sort() };
}

/** The psql script: one transaction, FK checks deferred to COMMIT (ddl.ts makes them DEFERRABLE). */
export function toLoadScript(t: DumpTranslation): string {
  const verify = Object.entries(t.counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([table, n]) =>
        `DO $$ BEGIN IF (SELECT count(*) FROM "${table}") <> ${n} THEN RAISE EXCEPTION 'row count mismatch in ${table}: expected ${n}'; END IF; END $$;`,
    );
  return [
    "\\set ON_ERROR_STOP on",
    "BEGIN;",
    "SET CONSTRAINTS ALL DEFERRED;",
    ...t.statements,
    "-- Every table must hold exactly the rows the D1 export had (fails the transaction otherwise).",
    ...verify,
    "COMMIT;",
    "",
  ].join("\n");
}
