// Parse a PostgreSQL EXPLAIN plan (text, or FORMAT JSON) into one node tree,
// attribute time to each node, and flag the plan shapes that usually mean a
// slow query. Pure functions, no I/O, no dependencies: shared by cli.mjs and
// the browser page. Reads pasted text only; never connects to a database.

export const MISESTIMATE_FACTOR = 10;
export const MISESTIMATE_MIN_ROWS = 100;
export const DISCARD_MIN_ROWS = 1000;
export const DISCARD_RATIO = 0.9;
export const NESTED_INNER_LOOPS = 100;
export const DOMINANT_SHARE = 0.5;
export const READ_BLOCKS_NOTE = 10000;

export const PLAN_NOTES = [
  { what: "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)", detail: "Best input: every rule below can fire. Paste the whole JSON array." },
  { what: "EXPLAIN (ANALYZE) text", detail: "Parsed by indentation: node lines, Filter / Rows Removed / Sort Method / Batches / Buffers / Workers lines." },
  { what: "EXPLAIN without ANALYZE", detail: "Only estimates exist: you get the tree and a reminder to re-run with ANALYZE, not timings or misestimate checks." },
  { what: "Parallel plans", detail: "Per-node time is approximate under Gather: workers' time overlaps, so exclusive times can be understated." },
];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function blank(type) {
  return {
    id: 0, type, relation: null, alias: null, index: null,
    startupCost: null, totalCost: null, planRows: null,
    actualStartup: null, actualTotal: null, actualRows: null, loops: null, executed: true,
    filter: null, removedByFilter: null, indexCond: null, joinFilter: null, hashCond: null,
    sortKey: null, sortMethod: null, sortSpaceType: null, sortSpaceKb: null,
    hashBatches: null, workersPlanned: null, workersLaunched: null, heapFetches: null,
    sharedHit: null, sharedRead: null, tempRead: null, tempWritten: null,
    parentRelationship: null, children: [],
  };
}

// ---------------------------------------------------------------- JSON
function fromJsonNode(j) {
  const n = blank(j["Node Type"] || "Unknown");
  n.relation = j["Relation Name"] || j["CTE Name"] || null;
  n.alias = j["Alias"] || null;
  n.index = j["Index Name"] || null;
  n.startupCost = num(j["Startup Cost"]);
  n.totalCost = num(j["Total Cost"]);
  n.planRows = num(j["Plan Rows"]);
  n.actualStartup = num(j["Actual Startup Time"]);
  n.actualTotal = num(j["Actual Total Time"]);
  n.actualRows = num(j["Actual Rows"]);
  n.loops = num(j["Actual Loops"]);
  n.executed = !(n.loops === 0);
  n.filter = j["Filter"] ?? null;
  n.removedByFilter = num(j["Rows Removed by Filter"]);
  n.indexCond = j["Index Cond"] ?? null;
  n.joinFilter = j["Join Filter"] ?? null;
  n.hashCond = j["Hash Cond"] ?? null;
  n.sortKey = Array.isArray(j["Sort Key"]) ? j["Sort Key"].join(", ") : j["Sort Key"] ?? null;
  n.sortMethod = j["Sort Method"] ?? null;
  n.sortSpaceType = j["Sort Space Type"] ?? null;
  n.sortSpaceKb = num(j["Sort Space Used"]);
  n.hashBatches = num(j["Hash Batches"]);
  n.workersPlanned = num(j["Workers Planned"]);
  n.workersLaunched = num(j["Workers Launched"]);
  n.heapFetches = num(j["Heap Fetches"]);
  n.sharedHit = num(j["Shared Hit Blocks"]);
  n.sharedRead = num(j["Shared Read Blocks"]);
  n.tempRead = num(j["Temp Read Blocks"]);
  n.tempWritten = num(j["Temp Written Blocks"]);
  n.parentRelationship = j["Parent Relationship"] ?? null;
  n.children = (j["Plans"] || []).map(fromJsonNode);
  return n;
}

function parseJsonPlan(text) {
  let data;
  try { data = JSON.parse(text); } catch (err) { return { error: `Plan looks like JSON but does not parse: ${err.message}` }; }
  const top = Array.isArray(data) ? data[0] : data;
  if (!top || typeof top !== "object" || !top.Plan) return { error: 'JSON has no "Plan" key. Use EXPLAIN (FORMAT JSON) output.' };
  return {
    format: "json", root: fromJsonNode(top.Plan),
    planningMs: num(top["Planning Time"]), executionMs: num(top["Execution Time"]),
  };
}

// ---------------------------------------------------------------- text
const NODE_RE = /^(\s*)(->\s*)?(.+?)\s+\(cost=([\d.]+)\.\.([\d.]+) rows=(\d+) width=\d+\)(.*)$/;
const ACTUAL_RE = /\(actual (?:time=([\d.]+)\.\.([\d.]+) )?rows=([\d.]+) loops=(\d+)\)/;

function applyHead(n, head) {
  const m = /^(.*?)(?: using (\S+))?(?: on (\S+)(?: (\S+))?)?$/.exec(head.trim());
  n.type = (m[1] || head).trim();
  if (m[2]) { n.index = m[2]; }
  if (m[3]) { if (/Bitmap Index Scan/.test(n.type)) n.index = m[3]; else n.relation = m[3].replace(/^[^.]+\./, ""); }
  if (m[4]) n.alias = m[4];
}

function applyDetail(n, line) {
  let m;
  if ((m = /^Rows Removed by Filter: (\d+)/.exec(line))) n.removedByFilter = Number(m[1]);
  else if ((m = /^Filter: (.*)$/.exec(line))) n.filter = m[1];
  else if ((m = /^Index Cond: (.*)$/.exec(line))) n.indexCond = m[1];
  else if ((m = /^Join Filter: (.*)$/.exec(line))) n.joinFilter = m[1];
  else if ((m = /^Hash Cond: (.*)$/.exec(line))) n.hashCond = m[1];
  else if ((m = /^Sort Key: (.*)$/.exec(line))) n.sortKey = m[1];
  else if ((m = /^Sort Method: (.+?)\s+(Memory|Disk): (\d+)kB/.exec(line))) { n.sortMethod = m[1]; n.sortSpaceType = m[2]; n.sortSpaceKb = Number(m[3]); }
  else if ((m = /Batches: (\d+)/.exec(line)) && /^Buckets:/.test(line)) n.hashBatches = Number(m[1]);
  else if ((m = /^Workers Planned: (\d+)/.exec(line))) n.workersPlanned = Number(m[1]);
  else if ((m = /^Workers Launched: (\d+)/.exec(line))) n.workersLaunched = Number(m[1]);
  else if ((m = /^Heap Fetches: (\d+)/.exec(line))) n.heapFetches = Number(m[1]);
  else if (/^Buffers:/.test(line)) {
    const shared = /shared ([^,]*)/.exec(line);
    if (shared) {
      n.sharedHit = Number((/hit=(\d+)/.exec(shared[1]) || [0, 0])[1]);
      n.sharedRead = Number((/read=(\d+)/.exec(shared[1]) || [0, 0])[1]);
    }
    const temp = /temp read=(\d+) written=(\d+)/.exec(line);
    if (temp) { n.tempRead = Number(temp[1]); n.tempWritten = Number(temp[2]); }
  }
}

function parseTextPlan(text) {
  let root = null;
  const stack = []; // { indent, node }
  let current = null;
  let planningMs = null; let executionMs = null; let inFooter = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = /^\s*Planning Time: ([\d.]+) ms/.exec(line))) { planningMs = Number(m[1]); inFooter = true; continue; }
    if ((m = /^\s*Execution Time: ([\d.]+) ms/.exec(line))) { executionMs = Number(m[1]); inFooter = true; continue; }
    if (/^\s*(Planning|JIT|Trigger .*):?\s*$/.test(line) || /^\s*Trigger /.test(line)) { inFooter = true; continue; }
    if (/^\s*QUERY PLAN\s*$/.test(line) || /^[-+]+$/.test(line.trim()) || /^\(\d+ rows?\)$/.test(line.trim())) continue;
    const nm = NODE_RE.exec(line);
    if (nm) {
      inFooter = false;
      const arrowAt = nm[1].length;
      const n = blank("Unknown");
      applyHead(n, nm[3]);
      n.startupCost = Number(nm[4]); n.totalCost = Number(nm[5]); n.planRows = Number(nm[6]);
      const tail = nm[7] || "";
      const am = ACTUAL_RE.exec(tail);
      if (am) {
        n.actualStartup = am[1] !== undefined ? Number(am[1]) : null;
        n.actualTotal = am[2] !== undefined ? Number(am[2]) : null;
        n.actualRows = Number(am[3]); n.loops = Number(am[4]);
      } else if (/never executed/.test(tail)) { n.executed = false; n.loops = 0; }
      while (stack.length && stack[stack.length - 1].indent >= arrowAt) stack.pop();
      if (stack.length) stack[stack.length - 1].node.children.push(n); else if (!root) root = n; else return { error: "Found more than one top-level plan node; paste a single plan." };
      stack.push({ indent: arrowAt, node: n });
      current = n;
      continue;
    }
    if (inFooter || !current) continue;
    applyDetail(current, line.trim());
  }
  if (!root) return { error: "No plan nodes found. Paste EXPLAIN output (lines like 'Seq Scan on t  (cost=0.00..10.00 rows=5 width=4)')." };
  return { format: "text", root, planningMs, executionMs };
}

export function parsePlan(input) {
  const text = String(input ?? "").trim();
  if (!text) return { error: "Empty input." };
  const out = text[0] === "[" || text[0] === "{" ? parseJsonPlan(text) : parseTextPlan(text);
  if (out.error) return out;
  let id = 0;
  const flat = [];
  (function walk(n, depth) { n.id = ++id; n.depth = depth; flat.push(n); for (const c of n.children) walk(c, depth + 1); })(out.root, 0);
  out.nodes = flat;
  out.hasActual = flat.some((n) => n.actualRows !== null);
  if (out.executionMs === null && out.hasActual) {
    const t = out.root.actualTotal; if (t !== null) out.executionMs = t * (out.root.loops || 1);
  }
  return out;
}

// ---------------------------------------------------------------- analysis
export function label(n) {
  const what = n.index && !/Bitmap Index/.test(n.type) ? `${n.type} using ${n.index}` : n.type;
  const target = n.relation ? ` on ${n.relation}` : (n.index && /Bitmap Index/.test(n.type) ? ` on ${n.index}` : "");
  return `#${n.id} ${what}${target}`;
}

const inclusive = (n) => (n.actualTotal === null ? null : n.actualTotal * (n.loops ?? 1));

function attributeTime(plan) {
  for (const n of plan.nodes) {
    const inc = inclusive(n);
    if (inc === null) { n.inclusiveMs = null; n.exclusiveMs = null; continue; }
    const kids = n.children.map(inclusive).filter((v) => v !== null);
    n.inclusiveMs = inc;
    n.exclusiveMs = Math.max(0, inc - kids.reduce((a, b) => a + b, 0));
  }
}

const KEYWORDS = new Set(["and", "or", "not", "is", "null", "true", "false", "any", "all", "in", "like", "ilike", "between", "case", "when", "then", "else", "end", "text", "date", "timestamp", "integer", "bigint", "numeric", "varchar", "boolean", "interval", "now"]);

// Heuristic column extraction from a Filter / Index Cond string, split into
// equality columns (index first) and range columns (index last).
export function filterColumns(cond) {
  if (!cond) return { eq: [], range: [] };
  const eq = []; const range = [];
  const re = /\(?\s*("?[A-Za-z_][\w$]*"?(?:\."?[A-Za-z_][\w$]*"?)?)(?:::\w+(?: \w+)?)?\s*(=|<>|!=|<=|>=|<|>|~~\*?|!~~|~)\s*/g;
  let m;
  while ((m = re.exec(cond))) {
    let col = m[1].replace(/"/g, "");
    if (col.includes(".")) col = col.split(".").pop();
    if (KEYWORDS.has(col.toLowerCase())) continue;
    const bucket = m[2] === "=" ? eq : range;
    if (!eq.includes(col) && !range.includes(col)) bucket.push(col);
  }
  return { eq, range };
}

function indexSuggestion(n) {
  const cols = filterColumns(n.filter);
  const all = [...cols.eq, ...cols.range];
  if (!n.relation || !all.length) return null;
  return `CREATE INDEX CONCURRENTLY ON ${n.relation} (${all.join(", ")});`;
}

const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(ms < 10 ? 2 : 1)} ms`);
const fmtInt = (v) => Math.round(v).toLocaleString("en-US");
const nextPow2Mb = (kb) => { let mb = 1; while (mb * 1024 < kb * 1.5) mb *= 2; return mb; };

export function analyze(plan) {
  attributeTime(plan);
  const findings = [];
  const add = (node, rule, severity, message, fix = null) => findings.push({ rule, severity, node: node.id, nodeLabel: label(node), message, fix });
  const total = plan.executionMs;

  if (!plan.hasActual) {
    findings.push({ rule: "no-analyze", severity: "info", node: 1, nodeLabel: label(plan.root), message: "This plan has no actual rows or timings, only the planner's estimates. Row-estimate, filter-discard and spill checks need real execution.", fix: "Re-run as EXPLAIN (ANALYZE, BUFFERS) -- on a copy or inside BEGIN ... ROLLBACK for INSERT/UPDATE/DELETE, because ANALYZE really executes the statement." });
  }

  for (const n of plan.nodes) {
    if (!n.executed) continue;
    const loops = n.loops ?? 1;
    const isSeq = /Seq Scan/.test(n.type);
    const isIdx = /Index (Only )?Scan|Bitmap Heap Scan/.test(n.type);

    if ((isSeq || isIdx) && n.removedByFilter !== null && n.actualRows !== null) {
      const removed = n.removedByFilter * loops; const kept = n.actualRows * loops;
      const scanned = removed + kept;
      if (removed >= DISCARD_MIN_ROWS && scanned > 0 && removed / scanned >= DISCARD_RATIO) {
        const pct = ((removed / scanned) * 100).toFixed(removed / scanned >= 0.999 ? 2 : 0);
        const sev = isSeq && scanned >= 1000000 ? "error" : "warn";
        const sugg = indexSuggestion(n);
        add(n, isSeq ? "seq-scan-discards-rows" : "index-scan-discards-rows", sev,
          `Read ${fmtInt(scanned)} rows to keep ${fmtInt(kept)}; the filter threw away ${pct}%${n.filter ? ` (Filter: ${n.filter})` : ""}.`,
          isSeq
            ? (sugg ? `Candidate index (heuristic, check column order against your queries): ${sugg}` : "An index on the filtered columns would let Postgres skip the discarded rows.")
            : "The index condition only narrows part of the predicate. Add the Filter columns to the index (or make it a partial index) so they are applied inside the index.");
      }
    }

    if (n.actualRows !== null && n.planRows !== null) {
      const est = Math.max(n.planRows, 1); const act = Math.max(n.actualRows, 1);
      const factor = Math.max(act / est, est / act);
      if (factor >= MISESTIMATE_FACTOR && Math.max(act, est) >= MISESTIMATE_MIN_ROWS) {
        const dir = act > est ? "under" : "over";
        add(n, "row-misestimate", factor >= 1000 ? "error" : "warn",
          `Planner expected ${fmtInt(n.planRows)} rows per loop, got ${fmtInt(n.actualRows)} (${dir}estimated ${fmtInt(factor)}x). Bad row estimates make Postgres pick the wrong join order and join method.`,
          `Run ANALYZE ${n.relation || "on the tables involved"}; if the predicate combines correlated columns, CREATE STATISTICS (dependencies) on them; consider raising default_statistics_target for the filtered column.`);
      }
    }

    if (n.sortSpaceType === "Disk" || (n.sortMethod && /external/i.test(n.sortMethod))) {
      const mb = n.sortSpaceKb ? nextPow2Mb(n.sortSpaceKb) : null;
      add(n, "sort-spills-to-disk", "error",
        `Sort spilled to disk (${n.sortMethod}${n.sortSpaceKb ? `, ${fmtInt(n.sortSpaceKb)} kB` : ""}). On-disk sorts are many times slower than in-memory ones.`,
        mb ? `Try SET LOCAL work_mem = '${mb}MB' for this query (in-memory sorts need roughly the on-disk size or more), or add an index that already returns rows in sort order${n.sortKey ? ` (${n.sortKey})` : ""}.` : "Raise work_mem for this query, or add an index that returns rows in sort order.");
    }

    if (n.hashBatches !== null && n.hashBatches > 1) {
      add(n, "hash-spills-to-disk", "warn",
        `Hash used ${n.hashBatches} batches, so it did not fit in work_mem and wrote batches to temp files.`,
        "Raise work_mem for this query, or reduce the hashed side (filter earlier, select fewer columns).");
    }

    if ((n.tempWritten ?? 0) > 0 && !/Sort|Hash/.test(n.type)) {
      add(n, "temp-file-writes", "warn", `Wrote ${fmtInt(n.tempWritten)} temp blocks (about ${fmtInt((n.tempWritten * 8) / 1024)} MB) to disk.`, "Look at work_mem and at what this node materialises.");
    }

    if (n.type === "Nested Loop" && n.children.length >= 2) {
      const inner = n.children[1];
      if (inner.executed && (inner.loops ?? 1) >= NESTED_INNER_LOOPS && /Seq Scan/.test(inner.type)) {
        const joinCols = filterColumns(inner.filter || n.joinFilter || "");
        const cols = [...joinCols.eq, ...joinCols.range];
        add(inner, "nested-loop-seq-scan", "error",
          `Inner side of a Nested Loop is a sequential scan run ${fmtInt(inner.loops)} times${inner.relation ? ` over ${inner.relation}` : ""}.`,
          `${cols.length && inner.relation ? `Index the join column: CREATE INDEX CONCURRENTLY ON ${inner.relation} (${cols.join(", ")}); ` : ""}Or let the planner use a hash join (check row estimates and enable_hashjoin).`.trim());
      }
    }

    if (/Index Only Scan/.test(n.type) && n.heapFetches !== null && n.actualRows !== null && n.heapFetches >= 1000 && n.heapFetches >= (n.actualRows * loops) * 0.5) {
      add(n, "heap-fetches", "info", `Index Only Scan still fetched ${fmtInt(n.heapFetches)} heap pages, so the visibility map is out of date.`, `VACUUM${n.relation ? ` ${n.relation}` : ""} so index-only scans can skip the table.`);
    }

    if (n.workersPlanned !== null && n.workersLaunched !== null && n.workersLaunched < n.workersPlanned) {
      add(n, "parallel-workers-short", "info", `Planned ${n.workersPlanned} parallel workers, launched ${n.workersLaunched}.`, "The server ran out of max_parallel_workers; the query was slower than planned under load.");
    }

    if ((n.sharedRead ?? 0) >= READ_BLOCKS_NOTE) {
      add(n, "cold-reads", "info", `Read ${fmtInt(n.sharedRead)} blocks from outside shared_buffers (about ${fmtInt((n.sharedRead * 8) / 1024)} MB). A first run on a cold cache is slower than a repeat.`, "Run the query twice and compare; consistently high reads mean the working set exceeds memory or the scan is too wide.");
    }

    if (total && total >= 1 && n.exclusiveMs !== null && n.exclusiveMs / total >= DOMINANT_SHARE) {
      add(n, "dominant-node", "info", `${fmtMs(n.exclusiveMs)} (${Math.round((n.exclusiveMs / total) * 100)}%) of the ${fmtMs(total)} runtime is spent in this node alone. Fix this one first.`);
    }
  }

  if (plan.planningMs !== null && plan.executionMs !== null && plan.planningMs >= 100 && plan.planningMs > plan.executionMs) {
    findings.push({ rule: "slow-planning", severity: "info", node: 1, nodeLabel: label(plan.root), message: `Planning took ${fmtMs(plan.planningMs)}, more than the ${fmtMs(plan.executionMs)} execution. Many partitions, joins or indexes inflate planning.`, fix: "Use prepared statements (plan reuse), cut the number of joined tables or partitions touched." });
  }

  const nlNodes = new Set(findings.filter((f) => f.rule === "nested-loop-seq-scan").map((f) => f.node));
  for (let i = findings.length - 1; i >= 0; i -= 1) if (findings[i].rule === "seq-scan-discards-rows" && nlNodes.has(findings[i].node)) findings.splice(i, 1);
  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.node - b.node);
  const top = plan.nodes.filter((n) => n.exclusiveMs !== null).sort((a, b) => b.exclusiveMs - a.exclusiveMs).slice(0, 5)
    .map((n) => ({ node: n.id, label: label(n), exclusiveMs: n.exclusiveMs, share: total ? n.exclusiveMs / total : null }));
  return { findings, topNodes: top, executionMs: plan.executionMs, planningMs: plan.planningMs, nodeCount: plan.nodes.length, hasActual: plan.hasActual };
}

export function summarize(report, { maxMs = null } = {}) {
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const overBudget = maxMs !== null && report.executionMs !== null && report.executionMs > maxMs;
  const parts = [];
  if (report.executionMs !== null) parts.push(`Execution ${fmtMs(report.executionMs)}`);
  if (report.planningMs !== null) parts.push(`planning ${fmtMs(report.planningMs)}`);
  parts.push(`${report.nodeCount} plan node(s)`);
  let text = `${parts.join(", ")}: ${errors} error(s), ${warns} warning(s).`;
  if (overBudget) text += ` Over the ${fmtMs(maxMs)} budget.`;
  const status = errors || overBudget ? "error" : warns ? "warn" : report.findings.length ? "info" : "ok";
  return { status, errors, warns, overBudget, text };
}

export function renderTree(plan) {
  return plan.nodes.map((n) => {
    const t = n.exclusiveMs !== null ? `  ${fmtMs(n.exclusiveMs)} self` : "";
    const r = n.actualRows !== null ? `  rows ${fmtInt(n.actualRows)}${n.planRows !== null ? ` (est ${fmtInt(n.planRows)})` : ""}${(n.loops ?? 1) > 1 ? ` x${fmtInt(n.loops)}` : ""}` : (n.planRows !== null ? `  est rows ${fmtInt(n.planRows)}` : "");
    return `${"  ".repeat(n.depth)}${label(n)}${r}${t}`;
  }).join("\n");
}
export { fmtMs };
