// Zero-dependency, deterministic Snowflake warehouse cost advisor. One row per
// virtual warehouse (size, credits used in a month, AUTO_SUSPEND, queries,
// average query seconds, resumes) in; dollars per warehouse, the AUTO_SUSPEND
// and idle-warehouse savings with the ALTER WAREHOUSE command, and a bounded
// right-sizing note out.
//
// What is arithmetic and what is a model: dollars are credits times a credit
// price you can edit. The AUTO_SUSPEND saving assumes each resume is followed
// by one idle tail of AUTO_SUSPEND seconds that a 60-second setting would
// shorten (a resume bills a 60-second minimum either way), capped at 80% of
// the warehouse's credits. The right-sizing note is an upper bound, never
// counted in the totals.

// ILLUSTRATIVE and dated; contracts differ. Overridable.
export const PRICES_AS_OF = "illustrative $3.00 per credit (Enterprise-edition on-demand list is roughly $3, Standard about $2, capacity contracts less); credits per hour double with each size from X-Small = 1; a resume bills a 60-second minimum; verify against your contract and the Snowflake service consumption table";
export const DEFAULT_PRICES = { credit: 3 };
export const CREDITS_PER_HOUR = { XS: 1, S: 2, M: 4, L: 8, XL: 16, "2XL": 32, "3XL": 64, "4XL": 128, "5XL": 256, "6XL": 512 };
export const SIZE_ORDER = Object.keys(CREDITS_PER_HOUR);
export const DEFAULTS = { suspendTarget: 60, minMonthlySaving: 10, shortQuerySeconds: 10, hoursPerMonth: 730 };

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

const SIZE_WORDS = { XSMALL: "XS", SMALL: "S", MEDIUM: "M", LARGE: "L", XLARGE: "XL", "2XLARGE": "2XL", "3XLARGE": "3XL", "4XLARGE": "4XL", "5XLARGE": "5XL", "6XLARGE": "6XL" };
/** Normalises X-Small / XSMALL / XS / 2X-Large / 2XL to a key of CREDITS_PER_HOUR, or null. */
export function normalizeSize(raw) {
  const k = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (CREDITS_PER_HOUR[k]) return k;
  return SIZE_WORDS[k] ?? null;
}

/** Parses `warehouse,size,credits_month,auto_suspend_seconds[,queries_month[,avg_query_seconds[,resumes_month]]]`; header names remap columns. auto_suspend blank/never/0/null = never suspends. */
export function parseWarehouses(text) {
  const rows = [];
  let skipped = 0;
  const col = { name: 0, size: 1, credits: 2, suspend: 3, queries: 4, avg: 5, resumes: 6 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /credit/i.test(line) && /size|suspend/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { name: find(/warehouse|name/i), size: find(/size/i), credits: find(/credit/i), suspend: find(/suspend/i), queries: find(/quer(?:y|ies)_?(?:month|count|n)|^queries/i), avg: find(/avg|average|seconds_per|runtime/i), resumes: find(/resume/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const name = String(cells[col.name] ?? "").trim();
    const size = normalizeSize(cells[col.size]);
    const credits = toNum(cells[col.credits]);
    const susRaw = String(cells[col.suspend] ?? "").trim().toLowerCase();
    const suspend = susRaw === "" || susRaw === "never" || susRaw === "null" ? 0 : toNum(susRaw);
    const opt = (i) => (String(cells[i] ?? "").trim() === "" ? null : toNum(cells[i]));
    const queries = opt(col.queries);
    const avg = opt(col.avg);
    const resumes = opt(col.resumes);
    if (!name || !size || Number.isNaN(credits) || Number.isNaN(suspend) || Number.isNaN(queries) || Number.isNaN(avg) || Number.isNaN(resumes)) { skipped += 1; continue; }
    rows.push({ name, size, credits, suspend, queries, avgQuerySeconds: avg, resumes });
  }
  return { rows, skipped };
}

export const smallerSize = (size) => { const i = SIZE_ORDER.indexOf(size); return i > 0 ? SIZE_ORDER[i - 1] : null; };

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, row, message) => findings.push({ rule, severity, row, message });
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const grand = rows.reduce((a, r) => a + r.credits * prices.credit, 0);

  const warehouses = rows.map((row) => {
    const cph = CREDITS_PER_HOUR[row.size];
    const cost = row.credits * prices.credit;
    const idle = row.queries === 0 && row.credits > 0;
    const alwaysOn = row.credits >= 0.9 * cph * o.hoursPerMonth;
    let suspendSaving = 0;
    if (!idle && row.resumes !== null && row.suspend > o.suspendTarget) {
      const hours = (row.resumes * (row.suspend - o.suspendTarget)) / 3600;
      suspendSaving = Math.min(hours * cph, row.credits * 0.8) * prices.credit;
    }
    const idleSaving = idle ? cost : 0;
    const smaller = smallerSize(row.size);
    const potential = !idle && smaller && CREDITS_PER_HOUR[row.size] >= 4 && row.avgQuerySeconds !== null && row.avgQuerySeconds <= o.shortQuerySeconds && row.queries > 0 ? cost * 0.5 : 0;
    return { row, cph, cost, idle, alwaysOn, suspendSaving: suspendSaving >= o.minMonthlySaving ? suspendSaving : 0, idleSaving, potential, smaller };
  });

  for (const w of warehouses) {
    const { row } = w;
    if (w.idle) add("idle-warehouse", "warn", row.name, `${row.name}: ${row.credits} credits (${usd(w.cost)}) billed this month with no queries run${row.suspend === 0 ? " and AUTO_SUSPEND off, so it stays running" : ""}. If nothing needs it: ALTER WAREHOUSE ${row.name} SUSPEND; then DROP WAREHOUSE ${row.name}; (or at least set AUTO_SUSPEND = ${o.suspendTarget}).`);
    else if (row.suspend === 0 && w.alwaysOn) add("never-suspends", "warn", row.name, `${row.name}: AUTO_SUSPEND is off and ${row.credits} credits is about ${Math.round((row.credits / (w.cph * o.hoursPerMonth)) * 100)}% of running ${row.size} around the clock (${usd(w.cost)}/month). ${row.queries ? `It served ${row.queries} queries. ` : ""}Set ALTER WAREHOUSE ${row.name} SET AUTO_SUSPEND = ${o.suspendTarget}; unless you rely on its warm cache.`);
    if (w.suspendSaving > 0) add("auto-suspend-too-long", "warn", row.name, `${row.name}: AUTO_SUSPEND is ${row.suspend}s with about ${row.resumes} resumes a month. Each resume bills a 60-second minimum and then idles ${row.suspend}s before suspending; at ${o.suspendTarget}s that tail shrinks, saving about ${usd(w.suspendSaving)}/month (${usd(w.suspendSaving * 12)}/year). The cost is a colder cache after a gap: ALTER WAREHOUSE ${row.name} SET AUTO_SUSPEND = ${o.suspendTarget};`);
    if (w.potential > 0) add("oversized-for-short-queries", "info", row.name, `${row.name}: ${row.size} warehouse averaging ${row.avgQuerySeconds}s per query. Short queries often do not speed up on a bigger size, so try ALTER WAREHOUSE ${row.name} SET WAREHOUSE_SIZE = '${w.smaller}'; and compare runtimes: credits per hour halve. This is an upper bound of about ${usd(w.potential)}/month if runtime does not grow, not counted in the saving, and long or spilling queries can get slower.`);
    if (w.cost / grand >= 0.5 && rows.length > 1) add("one-warehouse-dominates", "info", row.name, `${row.name} is ${Math.round((w.cost / grand) * 100)}% of the total (${usd(w.cost)} of ${usd(grand)}). Start there: query volume, size and AUTO_SUSPEND on this one warehouse move the bill more than the rest combined.`);
  }
  const tiny = warehouses.filter((w) => !w.idle && w.row.credits > 0 && w.row.credits < 20);
  if (tiny.length >= 3) add("many-tiny-warehouses", "info", "", `${tiny.length} warehouses (${tiny.map((w) => w.row.name).join(", ")}) each use under 20 credits a month. Every resume bills a 60-second minimum, so many lightly used warehouses pay it repeatedly; consolidating compatible workloads onto one warehouse can cut that, at the cost of less isolation.`);

  const totals = warehouses.reduce((a, w) => ({ current: a.current + w.cost, credits: a.credits + w.row.credits, saving: a.saving + w.suspendSaving + w.idleSaving, potential: a.potential + w.potential }), { current: 0, credits: 0, saving: 0, potential: 0 });
  if (!findings.some((f) => f.severity !== "info")) add("warehouses-fine", "info", "", `No warehouse is idle or never suspends, and no AUTO_SUSPEND tail is worth more than ${usd(o.minMonthlySaving)}/month at ${o.suspendTarget}s.`);
  return { count: rows.length, skipped: parsed.skipped ?? 0, warehouses: warehouses.map((w) => ({ name: w.row.name, size: w.row.size, credits: w.row.credits, current: w.cost, saving: w.suspendSaving + w.idleSaving, potential: w.potential })), totals: { ...totals, after: totals.current - totals.saving, annual: totals.saving * 12 }, prices, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: BI_DASHBOARDS,L,1400,600,52000,3,520 (warehouse, size, credits used this month, AUTO_SUSPEND seconds or never, optional queries, average query seconds, resumes)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: `${report.count} warehouse(s). Modelled $${t.current.toFixed(2)}/month (${t.credits.toLocaleString("en-US")} credits)${t.saving > 0.005 ? `; the fixes below save about $${t.saving.toFixed(2)}/month, $${t.annual.toFixed(0)}/year` : ""}${t.potential > 0.005 ? `; right-sizing could take up to $${t.potential.toFixed(2)}/month more` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "warehouse,size,credits_month,auto_suspend_seconds", detail: "One row per warehouse. Credits: SUM(CREDITS_USED) per WAREHOUSE_NAME over 30 days from SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY. Size and AUTO_SUSPEND come from SHOW WAREHOUSES. AUTO_SUSPEND blank, never, null or 0 means it never suspends." },
  { what: "queries_month (optional 5th)", detail: "Query count over the same 30 days from ACCOUNT_USAGE.QUERY_HISTORY grouped by WAREHOUSE_NAME. 0 marks the warehouse idle." },
  { what: "avg_query_seconds (optional 6th)", detail: "AVG(TOTAL_ELAPSED_TIME)/1000 from QUERY_HISTORY. Used only for the right-sizing note." },
  { what: "resumes_month (optional 7th)", detail: "Number of times the warehouse resumed: count of RESUME events in ACCOUNT_USAGE.WAREHOUSE_EVENTS_HISTORY. Needed to estimate the AUTO_SUSPEND saving." },
  { what: "size", detail: "XS, S, M, L, XL, 2XL..6XL or the long form (X-Small, 2X-Large). Credits per hour double with each size." },
  { what: "header row", detail: "One optional header; names (warehouse, size, credits, suspend, queries, avg, resumes) remap the columns in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
