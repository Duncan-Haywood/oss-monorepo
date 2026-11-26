// SQLite (D1) -> Postgres SQL translation for the AWS runtime (docs/AWS.md).
//
// Grants keeps one Drizzle schema (drizzle-orm/sqlite-core) and one set of queries. On Lambda the
// `DB` binding is a D1-shaped object over RDS Postgres (./pg-d1.ts) that rewrites each statement
// with `toPostgresSql` before sending it. What changes:
//   - `?` / `?NNN` placeholders become `$n`;
//   - `like` becomes `ilike` (SQLite LIKE is case-insensitive for ASCII; Postgres LIKE is not);
//   - `json_extract(col, '$.key') = 1` (the only json_extract form grants uses) becomes a jsonb test;
//   - `on conflict ("t"."a", "t"."b")` loses the table qualifier (Postgres takes bare column names).
// Quoted strings, quoted identifiers and comments are never touched. Everything else Drizzle's
// SQLite dialect emits (double-quoted identifiers, `returning`, `on conflict ... do update`,
// `limit ?`) is valid Postgres. The schema side (types, defaults, `instr`, `sqlite_master`) is
// handled once in the generated DDL (./ddl.ts).

/** One lexical piece of a statement: code we may rewrite, or text we must copy verbatim. */
interface Segment {
  code: boolean;
  text: string;
}

/** Splits SQL into code and verbatim segments ('...' literals, "..." identifiers, comments). */
export function splitSql(sql: string): Segment[] {
  const out: Segment[] = [];
  let code = "";
  let i = 0;
  const flush = () => {
    if (code) out.push({ code: true, text: code });
    code = "";
  };
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      flush();
      out.push({ code: false, text: sql.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      const j = sql.indexOf("\n", i);
      const end = j < 0 ? sql.length : j;
      flush();
      out.push({ code: false, text: sql.slice(i, end) });
      i = end;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const j = sql.indexOf("*/", i + 2);
      const end = j < 0 ? sql.length : j + 2;
      flush();
      out.push({ code: false, text: sql.slice(i, end) });
      i = end;
      continue;
    }
    code += c;
    i++;
  }
  flush();
  return out;
}

// `json_extract("t"."col", '$.key') = 1` as Drizzle renders it from the services that use it.
const JSON_EXTRACT_TRUE = /json_extract\(((?:"[^"]+"\.)?"[^"]+"), '\$\.([A-Za-z0-9_]+)'\) = 1/g;

/** Rewrites one SQLite statement (as Drizzle or hand-written D1 code emits it) for Postgres. */
// Drizzle's SQLite dialect writes the conflict target as qualified columns.
const ON_CONFLICT_TARGET = /on conflict \(((?:\s*"[^"]+"\."[^"]+"\s*,?)+)\)/gi;

export function toPostgresSql(sql: string): string {
  const rewritten = sql
    .replace(
      ON_CONFLICT_TARGET,
      (_m, cols: string) => `on conflict (${cols.replace(/"[^"]+"\.("[^"]+")/g, "$1")})`,
    )
    .replace(
      JSON_EXTRACT_TRUE,
      (_m, col: string, key: string) => `((${col})::jsonb ->> '${key}') in ('true', '1')`,
    );
  let n = 0;
  return splitSql(rewritten)
    .map((s) => {
      if (!s.code) return s.text;
      return s.text
        .replace(/\?(\d+)?/g, (_m, num: string | undefined) => (num ? `$${num}` : `$${++n}`))
        .replace(/\blike\b/gi, "ilike");
    })
    .join("");
}
