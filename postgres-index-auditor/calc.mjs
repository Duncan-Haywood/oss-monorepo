// Postgres index audit from one query's output (CSV). Finds invalid, duplicate,
// redundant (prefix-covered) and never-scanned indexes, sizes what dropping them
// frees, and writes DROP INDEX CONCURRENTLY statements for a human to review.
// Pure functions, no DOM, no network, no database connection.

export const QUERY = `SELECT s.schemaname, s.relname AS tablename, s.indexrelname AS indexname,
       pg_get_indexdef(s.indexrelid) AS indexdef,
       s.idx_scan,
       pg_relation_size(s.indexrelid) AS size_bytes,
       i.indisunique, i.indisprimary, i.indisvalid,
       (t.n_tup_ins + t.n_tup_upd + t.n_tup_del) AS table_writes,
       (SELECT count(*) FROM pg_constraint c WHERE c.conindid = s.indexrelid) AS constraints
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
JOIN pg_stat_user_tables t ON t.relid = s.relid
ORDER BY 1, 2, 3;`;

const ALIASES = {
  schema: ["schemaname", "schema"],
  table: ["tablename", "table", "relname"],
  name: ["indexname", "index", "indexrelname", "index_name"],
  def: ["indexdef", "definition", "index_def"],
  scans: ["idx_scan", "scans", "index_scans"],
  size: ["size_bytes", "index_size_bytes", "size"],
  unique: ["indisunique", "is_unique", "unique"],
  primary: ["indisprimary", "is_primary", "primary"],
  valid: ["indisvalid", "is_valid", "valid"],
  writes: ["table_writes", "writes"],
  constraints: ["constraints", "constraint_count", "conindid_count"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const bool = (v, dflt) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (["t", "true", "1", "yes", "y"].includes(s)) return true;
  if (["f", "false", "0", "no", "n"].includes(s)) return false;
  return dflt;
};
const int = (v) => {
  const s = String(v ?? "").trim().replace(/[, _]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

// Take the text of the first balanced (...) group at or after `from`.
function group(s, from) {
  const open = s.indexOf("(", from);
  if (open < 0) return null;
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { text: s.slice(open + 1, i), end: i + 1 };
  }
  return null;
}

function splitTop(s) {
  const parts = []; let depth = 0, q = null, cur = "";
  for (const c of s) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

// Parse pg_get_indexdef output. Returns null when it is not a CREATE INDEX.
export function parseIndexDef(def) {
  const s = String(def ?? "").trim();
  const m = /^create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?("(?:[^"]|"")+"|\S+)\s+on\s+(?:only\s+)?(\S+)\s+using\s+(\w+)\s*/i.exec(s);
  if (!m) return null;
  const keys = group(s, m[0].length - 1);
  if (!keys) return null;
  let rest = s.slice(keys.end);
  let include = [];
  const inc = /^\s*include\s*/i.exec(rest);
  if (inc) { const g = group(rest, inc[0].length - 1); if (g) { include = splitTop(g.text).map(norm); rest = rest.slice(g.end); } }
  const where = /\bwhere\s+([\s\S]*)$/i.exec(rest);
  return {
    unique: Boolean(m[1]),
    method: m[4].toLowerCase(),
    columns: splitTop(keys.text).map(norm),
    include,
    predicate: where ? norm(where[1].replace(/;$/, "")) : "",
  };
}

const quoteIdent = (n) => (/^[a-z_][a-z0-9_$]*$/.test(n) ? n : `"${n.replace(/"/g, '""')}"`);

export function normalizeRows(rows) {
  if (!rows.length) return { error: "The file is empty." };
  const head = rows[0].map((h) => norm(h));
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => names.includes(h));
  const missing = ["table", "name", "def", "scans"].filter((k) => col[k] < 0);
  if (missing.length) return { error: `Missing column(s): ${missing.map((k) => ALIASES[k][0]).join(", ")}. Run the query on this page and paste its output (psql: \\copy (…) TO STDOUT WITH CSV HEADER).` };
  const indexes = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, get = (k) => (col[k] >= 0 ? r[col[k]] : undefined);
    const def = parseIndexDef(get("def"));
    if (!def) { skipped.push({ line, reason: "indexdef is not a CREATE INDEX statement" }); return; }
    const scans = int(get("scans"));
    if (scans === null) { skipped.push({ line, reason: "idx_scan is not a number" }); return; }
    const schema = String(get("schema") ?? "public").trim() || "public";
    const table = String(get("table")).trim(), name = String(get("name")).trim();
    if (!table || !name) { skipped.push({ line, reason: "table or index name is blank" }); return; }
    indexes.push({
      schema, table, name, def, scans,
      size: int(get("size")) ?? 0,
      primary: bool(get("primary"), false),
      unique: bool(get("unique"), def.unique) || def.unique,
      valid: bool(get("valid"), true),
      writes: int(get("writes")) ?? 0,
      constraints: int(get("constraints")) ?? 0,
    });
  });
  if (!indexes.length) return { error: "No usable index rows found.", skipped };
  return { indexes, skipped };
}

const isProtected = (ix) => ix.primary || ix.unique || ix.constraints > 0;
const sameShape = (a, b) => a.def.method === b.def.method && a.def.predicate === b.def.predicate && a.def.include.join("|") === b.def.include.join("|");
const key = (ix) => `${ix.schema}.${ix.name}`;

export function humanBytes(n) {
  if (!Number.isFinite(n)) return "–";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

export function analyze(indexes, options = {}) {
  const minSize = options.minSize ?? 0;
  const byTable = new Map();
  for (const ix of indexes) {
    const k = `${ix.schema}.${ix.table}`;
    if (!byTable.has(k)) byTable.set(k, []);
    byTable.get(k).push(ix);
  }
  const verdict = new Map(); // key -> { kind, reason, keep }
  const mark = (ix, kind, reason, keep) => { if (!verdict.has(key(ix))) verdict.set(key(ix), { kind, reason, keep }); };

  for (const list of byTable.values()) {
    for (const ix of list) if (!ix.valid) mark(ix, "invalid", "Marked invalid by Postgres (a failed CREATE INDEX CONCURRENTLY). It is maintained on every write but never used by queries.", null);

    // duplicates: identical definition apart from the name
    const groups = new Map();
    for (const ix of list.filter((x) => x.valid)) {
      const sig = [ix.def.method, ix.def.columns.join(","), ix.def.include.join(","), ix.def.predicate, ix.unique ? "u" : "n"].join("|");
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(ix);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const keeper = [...g].sort((a, b) => (isProtected(b) - isProtected(a)) || (b.scans - a.scans) || (a.name < b.name ? -1 : 1))[0];
      for (const ix of g) if (ix !== keeper) mark(ix, "duplicate", `Same method, columns, INCLUDE list and WHERE clause as ${keeper.name}.`, keeper.name);
    }

    // redundant: a plain btree whose columns are a leading prefix of another btree's
    for (const a of list) {
      if (!a.valid || a.def.method !== "btree" || isProtected(a)) continue;
      for (const b of list) {
        if (a === b || !b.valid || b.def.method !== "btree" || !sameShape({ def: { ...a.def, include: [] } }, { def: { ...b.def, include: [] } })) continue;
        if (a.def.include.length) continue;
        const ac = a.def.columns, bc = b.def.columns;
        if (ac.length < bc.length && ac.every((c, i) => c === bc[i])) {
          mark(a, "redundant", `Its columns (${ac.join(", ")}) are the leading columns of ${b.name} (${bc.join(", ")}), so queries on them can use ${b.name}.`, b.name);
          break;
        }
      }
    }

    for (const ix of list) {
      if (ix.valid && ix.scans === 0 && !isProtected(ix)) mark(ix, "unused", "Never scanned since the statistics were last reset. It still costs disk and a write on every insert and delete.", null);
    }
  }

  // A duplicate/redundant verdict relies on its covering index surviving. If that index is
  // itself being dropped as unused or invalid, nothing covers this one: it stands on its own.
  const byKey = new Map(indexes.map((ix) => [ix.name + "\0" + ix.schema + "." + ix.table, ix]));
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const ix of indexes) {
      const v = verdict.get(key(ix));
      if (!v || (v.kind !== "duplicate" && v.kind !== "redundant")) continue;
      const keeper = byKey.get(v.keep + "\0" + ix.schema + "." + ix.table);
      const kv = keeper && verdict.get(key(keeper));
      if (kv && (kv.kind === "unused" || kv.kind === "invalid")) {
        verdict.delete(key(ix)); changed = true;
        if (ix.valid && ix.scans === 0 && !isProtected(ix)) mark(ix, "unused", "Never scanned since the statistics were last reset. It still costs disk and a write on every insert and delete.", null);
      }
    }
    if (!changed) break;
  }

  const findings = [];
  for (const ix of indexes) {
    const v = verdict.get(key(ix));
    if (!v || ix.size < minSize) continue;
    findings.push({ schema: ix.schema, table: ix.table, name: ix.name, kind: v.kind, reason: v.reason, keep: v.keep, size: ix.size, scans: ix.scans, writes: ix.writes, definition: null });
  }
  const order = { invalid: 0, duplicate: 1, redundant: 2, unused: 3 };
  findings.sort((a, b) => (order[a.kind] - order[b.kind]) || (b.size - a.size) || (a.name < b.name ? -1 : 1));

  const totalSize = indexes.reduce((s, x) => s + x.size, 0);
  const reclaim = findings.reduce((s, f) => s + f.size, 0);
  const kinds = {};
  for (const f of findings) { kinds[f.kind] ??= { count: 0, size: 0 }; kinds[f.kind].count++; kinds[f.kind].size += f.size; }
  // Each insert and delete touches every index on the table; updates may avoid it (HOT).
  // Report the upper bound per table and say so.
  const writeAvoided = findings.reduce((s, f) => s + f.writes, 0);

  const tables = new Map();
  for (const ix of indexes) {
    const k = `${ix.schema}.${ix.table}`;
    const t = tables.get(k) ?? { table: k, indexes: 0, size: 0, flagged: 0, flaggedSize: 0 };
    t.indexes++; t.size += ix.size;
    if (verdict.has(key(ix))) { t.flagged++; t.flaggedSize += ix.size; }
    tables.set(k, t);
  }

  return {
    summary: { indexes: indexes.length, tables: tables.size, totalSize, flagged: findings.length, reclaim, share: totalSize ? reclaim / totalSize : 0, writeAvoided },
    kinds, findings,
    tables: [...tables.values()].sort((a, b) => b.flaggedSize - a.flaggedSize || b.size - a.size).slice(0, 15),
    script: dropScript(findings),
  };
}

export function dropScript(findings) {
  if (!findings.length) return "-- Nothing to drop.";
  const lines = [
    "-- Review every line before running. Statistics can mislead: idx_scan resets with pg_stat_reset(),",
    "-- is per-server (check replicas), and misses indexes used only by rare jobs. Take a backup of the",
    "-- definitions first. DROP INDEX CONCURRENTLY cannot run inside a transaction block.",
  ];
  for (const f of findings) {
    lines.push(`-- ${f.kind}: ${f.table} (${humanBytes(f.size)})${f.keep ? `, covered by ${f.keep}` : ""}`);
    lines.push(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdent(f.schema)}.${quoteIdent(f.name)};`);
  }
  return lines.join("\n");
}

export function toCsv(findings) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return ["schema,table,index,kind,size_bytes,scans,covered_by"].concat(findings.map((f) => [f.schema, f.table, f.name, f.kind, f.size, f.scans, f.keep ?? ""].map(esc).join(","))).join("\n");
}

export function sampleCsv() {
  const H = "schemaname,tablename,indexname,indexdef,idx_scan,size_bytes,indisunique,indisprimary,indisvalid,table_writes,constraints";
  const d = (n, t, rest) => `CREATE INDEX ${n} ON public.${t} USING btree ${rest}`;
  const q = (s) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ["public", "orders", "orders_pkey", q("CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)"), 920411, 214000000, "t", "t", "t", 5400000, 1],
    ["public", "orders", "idx_orders_customer", q(d("idx_orders_customer", "orders", "(customer_id)")), 18022, 187000000, "f", "f", "t", 5400000, 0],
    ["public", "orders", "idx_orders_customer_created", q(d("idx_orders_customer_created", "orders", "(customer_id, created_at DESC)")), 640210, 262000000, "f", "f", "t", 5400000, 0],
    ["public", "orders", "orders_customer_id_idx", q(d("orders_customer_id_idx", "orders", "(customer_id)")), 0, 187000000, "f", "f", "t", 5400000, 0],
    ["public", "orders", "idx_orders_status_legacy", q(d("idx_orders_status_legacy", "orders", "(status)")), 0, 96000000, "f", "f", "t", 5400000, 0],
    ["public", "orders", "idx_orders_open", q(d("idx_orders_open", "orders", "(created_at) WHERE (status = 'open'::text)")), 4120, 3000000, "f", "f", "t", 5400000, 0],
    ["public", "events", "events_pkey", q("CREATE UNIQUE INDEX events_pkey ON public.events USING btree (id)"), 2210, 902000000, "t", "t", "t", 41000000, 1],
    ["public", "events", "idx_events_user", q(d("idx_events_user", "events", "(user_id)")), 55120, 640000000, "f", "f", "t", 41000000, 0],
    ["public", "events", "idx_events_payload_gin", q("CREATE INDEX idx_events_payload_gin ON public.events USING gin (payload)"), 0, 1210000000, "f", "f", "t", 41000000, 0],
    ["public", "events", "idx_events_tmp_build", q(d("idx_events_tmp_build", "events", "(created_at)")), 0, 580000000, "f", "f", "f", 41000000, 0],
    ["public", "users", "users_pkey", q("CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)"), 80331, 9000000, "t", "t", "t", 120000, 1],
    ["public", "users", "users_email_key", q("CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)"), 0, 11000000, "t", "f", "t", 120000, 1],
    ["public", "users", "idx_users_lower_email", q(d("idx_users_lower_email", "users", "(lower(email))")), 40210, 12000000, "f", "f", "t", 120000, 0],
  ];
  return [H, ...rows.map((r) => r.join(","))].join("\n");
}
