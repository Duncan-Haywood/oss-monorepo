// pg_stat_statements triage from one query's output (CSV). Ranks query shapes by
// total database time, merges variants that differ only in IN-list or VALUES
// length, and flags the patterns that usually explain the time: one hot query,
// a chatty single-row lookup (N+1 suspect), cache misses, temp-file spills,
// slow calls, latency swings and huge row counts.
// Pure functions, no DOM, no network, no database connection.

export const QUERY = `SELECT queryid::text AS queryid,
       left(query, 600) AS query,
       calls,
       total_exec_time,
       mean_exec_time,
       stddev_exec_time,
       rows,
       shared_blks_hit,
       shared_blks_read,
       temp_blks_read,
       temp_blks_written,
       wal_bytes
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 300;`;

const ALIASES = {
  id: ["queryid", "query_id"],
  query: ["query", "statement", "query_text"],
  calls: ["calls"],
  total: ["total_exec_time", "total_time"],
  mean: ["mean_exec_time", "mean_time"],
  stddev: ["stddev_exec_time", "stddev_time"],
  rows: ["rows"],
  hit: ["shared_blks_hit"],
  read: ["shared_blks_read"],
  tempRead: ["temp_blks_read"],
  tempWritten: ["temp_blks_written"],
  wal: ["wal_bytes"],
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

const num = (v) => {
  const n = Number(String(v ?? "").trim().replace(/,/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

export function normalizeRows(rows) {
  if (!rows.length) return { error: "No rows found. Paste the CSV including its header line.", statements: [], skipped: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h));
  const missing = ["query", "calls"].filter((k) => col[k] < 0);
  if (col.total < 0 && col.mean < 0) missing.push("total_exec_time");
  if (missing.length) {
    return { error: `The header is missing: ${missing.join(", ")}. Run the query on this page and export its result as CSV with a header row.`, statements: [], skipped: [] };
  }
  const statements = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const query = String(r[col.query] ?? "").trim();
    const calls = num(r[col.calls]);
    if (!query) return skipped.push({ line, reason: "empty query text" });
    if (calls === null || calls < 0) return skipped.push({ line, reason: "calls is not a number" });
    let total = col.total >= 0 ? num(r[col.total]) : null;
    const mean0 = col.mean >= 0 ? num(r[col.mean]) : null;
    if (total === null && mean0 !== null) total = mean0 * calls;
    if (total === null || total < 0) return skipped.push({ line, reason: "no usable execution time" });
    const get = (k) => (col[k] >= 0 ? num(r[col[k]]) : null);
    statements.push({
      id: col.id >= 0 ? String(r[col.id] ?? "").trim() : "",
      query, calls, total,
      stddev: get("stddev"),
      rows: get("rows"),
      hit: get("hit"), read: get("read"),
      tempRead: get("tempRead"), tempWritten: get("tempWritten"),
      wal: get("wal"),
    });
  });
  if (!statements.length) return { error: "No usable rows. Check that the file is the output of the query on this page.", statements, skipped };
  return { error: null, statements, skipped };
}

// ---- query shape ----------------------------------------------------------

export function stripComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// Two statements with the same family differ only in how many values a list holds
// or in comments and spacing. pg_stat_statements keeps them as separate entries.
export function family(sql) {
  return stripComments(sql)
    .replace(/\s+/g, " ").trim().replace(/;$/, "").toLowerCase()
    .replace(/\bin\s*\(\s*(?:\$\d+\s*,\s*)*\$\d+\s*\)/g, "in ($…)")
    .replace(/\bvalues\s*\([^()]*\)(?:\s*,\s*\([^()]*\))*/g, "values (…)")
    .replace(/\$\d+/g, "$");
}

export function statementType(sql) {
  const s = stripComments(sql).trim().toLowerCase();
  const first = /^\(?\s*(\w+)/.exec(s)?.[1] ?? "";
  if (first === "with") {
    // The outer statement is what is left once every parenthesised CTE body is removed.
    let outer = s, prev;
    do { prev = outer; outer = outer.replace(/\([^()]*\)/g, " "); } while (outer !== prev);
    return /\b(select|insert|update|delete)\b/.exec(outer)?.[1] ?? "select";
  }
  return ["select", "insert", "update", "delete"].includes(first) ? first : first || "other";
}

export function tablesOf(sql) {
  const s = stripComments(sql).toLowerCase()
    .replace(/\b(?:extract|substring|trim|overlay|position)\s*\([^()]*\)/g, " ")
    .replace(/\bis\s+(?:not\s+)?distinct\s+from\b/g, " ");
  const out = new Set();
  for (const m of s.matchAll(/\b(?:from|join|update|into)\s+(?:only\s+)?("[^"]+"|[a-z_][\w$]*(?:\.[a-z_][\w$]*)?)(?![\w$.]|\s*\()/g)) {
    const t = m[1].replace(/"/g, "");
    if (!["select", "lateral", "unnest", "generate_series", "values", "set", "only"].includes(t)) out.add(t);
  }
  return [...out];
}

// ---- analysis ---------------------------------------------------------------

export const THRESHOLDS = {
  hotShare: 0.05, // share of all database time
  chattyCallShare: 0.1, // share of all calls
  chattyMinCalls: 1000,
  chattyMaxMeanMs: 2,
  chattyMaxRowsPerCall: 1.5,
  coldBlocks: 12800, // 100 MB of 8 kB blocks read
  coldHitRatio: 0.95,
  tempBlocks: 1280, // 10 MB
  slowMeanMs: 250,
  slowMinCalls: 10,
  swingMultiple: 3,
  swingMinMeanMs: 10,
  bigRowsPerCall: 10000,
};

export function analyze(statements, options = {}) {
  const T = { ...THRESHOLDS, ...(options.thresholds ?? {}) };
  const totalMs = statements.reduce((a, s) => a + s.total, 0);
  const totalCalls = statements.reduce((a, s) => a + s.calls, 0);
  const map = new Map();
  for (const s of statements) {
    const key = family(s.query);
    let f = map.get(key);
    if (!f) map.set(key, (f = { key, sample: stripComments(s.query).replace(/\s+/g, " ").trim(), sampleCalls: -1, variants: 0, calls: 0, total: 0, rows: 0, rowsKnown: true, hit: 0, read: 0, blocksKnown: true, temp: 0, wal: 0, swingNum: 0, swingDen: 0, type: statementType(s.query), tables: tablesOf(s.query) }));
    f.variants++;
    if (s.calls > f.sampleCalls) { f.sampleCalls = s.calls; f.sample = stripComments(s.query).replace(/\s+/g, " ").trim(); }
    f.calls += s.calls; f.total += s.total;
    if (s.rows === null) f.rowsKnown = false; else f.rows += s.rows;
    if (s.hit === null || s.read === null) f.blocksKnown = false; else { f.hit += s.hit; f.read += s.read; }
    f.temp += s.tempWritten ?? 0;
    f.wal += s.wal ?? 0;
    if (s.stddev !== null && s.calls > 0 && s.total > 0) { f.swingNum += s.stddev * s.calls; f.swingDen += s.calls; }
  }
  const fams = [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  let cum = 0;
  const findings = [];
  for (const f of fams) {
    f.mean = f.calls ? f.total / f.calls : 0;
    f.share = totalMs ? f.total / totalMs : 0;
    cum += f.share; f.cumShare = cum;
    f.callShare = totalCalls ? f.calls / totalCalls : 0;
    f.rowsPerCall = f.rowsKnown && f.calls ? f.rows / f.calls : null;
    const touched = f.hit + f.read;
    f.hitRatio = f.blocksKnown && touched > 0 ? f.hit / touched : null;
    f.stddev = f.swingDen ? f.swingNum / f.swingDen : null;
    f.flags = [];
    const flag = (code, title, detail, next) => f.flags.push({ code, title, detail, next });
    if (f.share >= T.hotShare) flag("hot", "Hot query", `${(f.share * 100).toFixed(1)}% of all database time across ${f.calls.toLocaleString("en-US")} calls.`, "Run EXPLAIN (ANALYZE, BUFFERS) on it with a typical parameter set; this is where a fix pays most.");
    if (f.type === "select" && f.calls >= T.chattyMinCalls && f.callShare >= T.chattyCallShare && f.mean <= T.chattyMaxMeanMs && f.rowsPerCall !== null && f.rowsPerCall <= T.chattyMaxRowsPerCall)
      flag("chatty", "Chatty single-row lookup (N+1 suspect)", `${f.calls.toLocaleString("en-US")} calls (${(f.callShare * 100).toFixed(0)}% of all calls), ${f.mean.toFixed(2)} ms each, about ${f.rowsPerCall.toFixed(2)} rows per call.`, "If one request runs this in a loop, fetch the ids in one query (= ANY($1) or a join) or cache the lookup.");
    if (f.hitRatio !== null && f.read >= T.coldBlocks && f.hitRatio < T.coldHitRatio)
      flag("cold", "Reads mostly from outside shared buffers", `Cache hit ratio ${(f.hitRatio * 100).toFixed(1)}% with ${blocksToBytes(f.read)} read in.`, "Check for a missing or unselective index and for scans that touch far more rows than they return. Reads may still come from the OS cache.");
    if (f.temp >= T.tempBlocks)
      flag("temp", "Spills to temporary files", `${blocksToBytes(f.temp)} written to temp files.`, "A sort, hash or aggregate exceeded work_mem. Raise work_mem for this role, add an index that supplies the order, or reduce the rows going in.");
    if (f.mean >= T.slowMeanMs && f.calls >= T.slowMinCalls)
      flag("slow", "Slow per call", `${f.mean.toFixed(0)} ms on average over ${f.calls.toLocaleString("en-US")} calls.`, "Look at the plan for sequential scans over large tables, nested loops with many iterations, and missing join indexes.");
    if (f.stddev !== null && f.mean >= T.swingMinMeanMs && f.stddev >= T.swingMultiple * f.mean)
      flag("swing", "Latency swings", `Standard deviation ${f.stddev.toFixed(0)} ms against a ${f.mean.toFixed(0)} ms mean.`, "Usually a parameter-dependent plan, lock waits, or cache state. Compare the plan for a fast and a slow parameter value.");
    if (f.rowsPerCall !== null && f.rowsPerCall >= T.bigRowsPerCall)
      flag("rows", "Touches many rows per call", `About ${Math.round(f.rowsPerCall).toLocaleString("en-US")} rows per call.`, "Confirm the caller needs them all. Paginate or filter earlier, or move the work out of the request path.");
    if (f.flags.length) findings.push(f);
  }
  const k = (p) => { let i = 0; for (const f of fams) { i++; if (f.cumShare >= p - 1e-9) return i; } return fams.length; };
  const saved = (n, factor) => fams.slice(0, n).reduce((a, f) => a + f.share, 0) * (1 - 1 / factor);
  const reads = fams.reduce((a, f) => a + (f.blocksKnown ? f.read : 0), 0);
  const hits = fams.reduce((a, f) => a + (f.blocksKnown ? f.hit : 0), 0);
  const tables = new Map();
  for (const f of fams) for (const t of f.tables) {
    const e = tables.get(t) ?? { table: t, total: 0, calls: 0, queries: 0 };
    e.total += f.total; e.calls += f.calls; e.queries++;
    tables.set(t, e);
  }
  const types = {};
  for (const f of fams) { const e = (types[f.type] ??= { count: 0, total: 0, calls: 0 }); e.count++; e.total += f.total; e.calls += f.calls; }
  return {
    summary: {
      statements: statements.length, families: fams.length, merged: statements.length - fams.length,
      totalMs, totalCalls,
      topShare: fams[0]?.share ?? 0, k50: k(0.5), k80: k(0.8), k90: k(0.9),
      hitRatio: hits + reads > 0 ? hits / (hits + reads) : null,
      tempBytes: fams.reduce((a, f) => a + f.temp, 0) * 8192,
      flagged: findings.length,
    },
    families: fams,
    findings,
    tables: [...tables.values()].sort((a, b) => b.total - a.total || a.table.localeCompare(b.table)),
    types,
    payoff: [1, 3, 5, 10].filter((n) => n <= fams.length).map((n) => ({ top: n, ifTwiceAsFast: saved(n, 2), ifTenTimesFaster: saved(n, 10) })),
  };
}

export function blocksToBytes(blocks) { return humanBytes(blocks * 8192); }

export function humanBytes(n) {
  if (!Number.isFinite(n)) return "–";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

export function humanMs(ms) {
  if (!Number.isFinite(ms)) return "–";
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)} h`;
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)} min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${ms.toFixed(ms >= 100 ? 0 : 1)} ms`;
}

export function toCsv(families) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = "rank,share_pct,total_ms,calls,mean_ms,rows_per_call,cache_hit_pct,flags,query";
  return [head].concat(families.map((f, i) => [
    i + 1, (f.share * 100).toFixed(2), f.total.toFixed(1), f.calls, f.mean.toFixed(3),
    f.rowsPerCall === null ? "" : f.rowsPerCall.toFixed(2),
    f.hitRatio === null ? "" : (f.hitRatio * 100).toFixed(1),
    f.flags.map((x) => x.code).join("|"), f.sample,
  ].map(esc).join(","))).join("\n");
}

export function sampleCsv() {
  const H = "queryid,query,calls,total_exec_time,mean_exec_time,stddev_exec_time,rows,shared_blks_hit,shared_blks_read,temp_blks_read,temp_blks_written,wal_bytes";
  const q = (s) => `"${s.replace(/"/g, '""')}"`;
  const r = (id, sql, calls, total, std, rows, hit, read, tr, tw, wal) =>
    [id, q(sql), calls, total, (total / calls).toFixed(4), std, rows, hit, read, tr, tw, wal].join(",");
  return [H,
    r(101, "SELECT o.*, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = $1 AND o.created_at > $2 ORDER BY o.created_at DESC", 41200, 5480000, 310, 4120000, 9200000, 3100000, 0, 0, 0),
    r(102, "SELECT * FROM users WHERE id = $1", 2850000, 1710000, 0.4, 2850000, 11400000, 1200, 0, 0, 0),
    r(103, "SELECT product_id, sum(qty) FROM order_items WHERE order_id IN ($1,$2,$3) GROUP BY product_id", 188000, 940000, 4, 640000, 5100000, 40000, 0, 0, 0),
    r(104, "SELECT product_id, sum(qty) FROM order_items WHERE order_id IN ($1,$2,$3,$4,$5) GROUP BY product_id", 96000, 610000, 5, 470000, 3300000, 22000, 0, 0, 0),
    r(105, "SELECT product_id, sum(qty) FROM order_items WHERE order_id IN ($1,$2,$3,$4,$5,$6,$7,$8) GROUP BY product_id", 52000, 480000, 7, 410000, 2900000, 18000, 0, 0, 0),
    r(106, "SELECT date_trunc('day', created_at) d, count(*), sum(total) FROM orders WHERE created_at >= $1 GROUP BY 1 ORDER BY 1", 1800, 3900000, 22000, 540000, 800000, 2400000, 64000, 64000, 0),
    r(107, "INSERT INTO events (user_id, kind, payload) VALUES ($1, $2, $3)", 3400000, 1360000, 0.9, 3400000, 20400000, 3000, 0, 0, 2380000000),
    r(108, "UPDATE carts SET updated_at = now() WHERE id = $1", 910000, 540000, 1.2, 910000, 3600000, 800, 0, 0, 410000000),
    r(109, "SELECT * FROM products WHERE sku = $1", 60000, 24000, 0.2, 60000, 240000, 300, 0, 0, 0),
    r(110, "SELECT id, email FROM users WHERE last_seen < $1", 24, 2760000, 40000, 48000000, 1200000, 6800000, 0, 0, 0),
    r(111, "DELETE FROM sessions WHERE expires_at < now()", 1440, 360000, 150, 2900000, 1200000, 40000, 0, 0, 150000000),
  ].join("\n");
}
