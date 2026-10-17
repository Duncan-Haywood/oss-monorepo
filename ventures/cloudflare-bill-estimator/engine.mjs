// Zero-dependency, deterministic estimate of a monthly Cloudflare developer-
// platform bill (Workers, KV, R2) from the usage numbers the user types or
// pastes (they are on the Billing and Workers/R2 analytics pages of the
// Cloudflare dashboard), plus a ranked list of the changes that would cut it
// most, each with a dollar figure. Pure data in, report out -- no filesystem or
// network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Cloudflare's real invoice depends on
// the plan, add-ons, contracts and metering rules this file does not reproduce.
// Request and operation counts are in MILLIONS; CPU time is in MILLIONS of ms.

export const PRICES_AS_OF = "approximate public Workers Paid, KV and R2 list prices, 2025; verify at https://developers.cloudflare.com/workers/platform/pricing/";
export const PRICING_URL = "https://developers.cloudflare.com/workers/platform/pricing/";

// Editable. `included` is what the plan bundles per month; `rate` is the
// price per `per` units above it.
export const DEFAULT_PRICES = {
  workers_requests_m: { label: "Workers requests (per million)", unit: "M requests", rate: 0.3, per: 1, included: 10 },
  workers_cpu_m_ms: { label: "Workers CPU time (per million ms)", unit: "M CPU-ms", rate: 0.02, per: 1, included: 30 },
  kv_reads_m: { label: "KV reads (per million)", unit: "M reads", rate: 0.5, per: 1, included: 10 },
  kv_writes_m: { label: "KV writes (per million)", unit: "M writes", rate: 5, per: 1, included: 1 },
  r2_storage_gb: { label: "R2 storage (per GB-month)", unit: "GB-months", rate: 0.015, per: 1, included: 10 },
  r2_class_a_m: { label: "R2 Class A operations: writes, lists (per million)", unit: "M operations", rate: 4.5, per: 1, included: 1 },
  r2_class_b_m: { label: "R2 Class B operations: reads (per million)", unit: "M operations", rate: 0.36, per: 1, included: 10 },
};

// Workers Paid carries a monthly minimum; the bill is never below it.
export const DEFAULT_MINIMUM_USD = 5;

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  cachePct: 40, // share of Worker requests (and their CPU time) served from the edge cache instead of running the Worker
  cpuPct: 25, // share of CPU time removed by trimming per-request work (lazy parsing, smaller bundles, fewer awaits on CPU-bound code)
  kvReadPct: 50, // share of KV reads removed by caching hot keys in the Worker or the Cache API
  kvWritePct: 40, // share of KV writes removed by skipping unchanged values and batching updates
  r2StoragePct: 30, // share of R2 storage removed by lifecycle rules that expire old objects and abort stale multipart uploads
  r2OpsPct: 40, // share of R2 Class A operations removed by bigger multipart parts and fewer list calls
  r2ReadPct: 60, // share of R2 Class B reads removed by serving hot objects through the CDN cache
};

export const USAGE_FIELDS = Object.entries(DEFAULT_PRICES).map(([key, p]) => ({ key, label: p.label.replace(/ \(per .*\)$/, ""), unit: p.unit, def: 0 }));

const KEYS = new Map(USAGE_FIELDS.map((f) => [f.key, f]));
export const CSV_TEMPLATE = ["product,usage", ...USAGE_FIELDS.map((f) => `${f.key},${f.def}`)].join("\n");

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Parses the documented `product,usage` CSV (header optional, `#` comments and
 * blank lines ignored, `=` accepted for `,`). Unknown products are returned in
 * `unknown` and ignored; unparseable values are returned in `errors`.
 */
export function parseUsageCsv(text) {
  const usage = {};
  const errors = [];
  const unknown = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^([^,=]+?)\s*[,=]\s*(.*)$/.exec(line);
    if (!m) { errors.push(`line ${idx + 1}: expected "product,usage"`); return; }
    const key = m[1].trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^["']|["']$/g, "");
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "product" && /^usage$/i.test(val)) return; // header
    if (!KEYS.has(key)) { unknown.push(key); return; }
    const n = Number(val.replace(/[_\s,]/g, ""));
    if (!val || !Number.isFinite(n) || n < 0) { errors.push(`line ${idx + 1}: ${key} needs a non-negative number, got "${val}"`); return; }
    usage[key] = n;
  });
  return { usage, errors, unknown };
}

/** Fills defaults so every key is present. */
export function normalizeUsage(partial = {}) {
  const u = {};
  for (const f of USAGE_FIELDS) u[f.key] = Number.isFinite(partial[f.key]) && partial[f.key] >= 0 ? partial[f.key] : f.def;
  return u;
}

/** Line items and total for a usage record. The plan minimum is a floor on the total. */
export function estimateBill(usageIn, prices = DEFAULT_PRICES, minimumUsd = DEFAULT_MINIMUM_USD) {
  const u = normalizeUsage(usageIn);
  const items = [];
  for (const [key, p] of Object.entries(prices)) {
    const quantity = u[key] ?? 0;
    const billable = Math.max(0, quantity - p.included);
    items.push({
      key, label: p.label, quantity, unit: p.unit, billable, rate: p.rate,
      monthly: round2((billable / p.per) * p.rate),
      note: p.included ? `${p.included} ${p.unit} included` : "",
    });
  }
  const usageCharges = round2(items.reduce((n, i) => n + i.monthly, 0));
  const total = round2(Math.max(minimumUsd, usageCharges));
  const minimumTopUp = round2(Math.max(0, minimumUsd - usageCharges));
  return { usage: u, items, usageCharges, minimumTopUp, total, annual: round2(total * 12) };
}

/**
 * Ranked levers, largest saving first. Each saving is the difference between
 * the baseline estimate and the same estimate with that one change applied,
 * under the stated assumption. Levers overlap (edge caching and CPU trimming
 * act on the same Worker CPU time), so the savings are NOT additive.
 */
export function rankLevers(usageIn, prices = DEFAULT_PRICES, assumptions = DEFAULT_ASSUMPTIONS, minimumUsd = DEFAULT_MINIMUM_USD) {
  const u = normalizeUsage(usageIn);
  const base = estimateBill(u, prices, minimumUsd).total;
  const A = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const keep = (n) => 1 - Math.min(100, Math.max(0, n)) / 100;
  const levers = [];
  const scale = (keys, k) => Object.fromEntries(keys.map((key) => [key, u[key] * k]));
  const push = (id, title, assumption, change) => {
    const next = estimateBill({ ...u, ...change }, prices, minimumUsd).total;
    const saving = round2(base - next);
    if (saving > 0.005) levers.push({ id, title, assumption, saving, after: round2(next), pctOfBill: base ? round2((saving / base) * 100) : 0 });
  };

  push("cache-at-the-edge", "Cache at the edge: serve repeat requests from the Cache API or CDN so the Worker never runs",
    `${A.cachePct}% fewer Worker requests and CPU time`, { workers_requests_m: u.workers_requests_m * keep(A.cachePct), workers_cpu_m_ms: u.workers_cpu_m_ms * keep(A.cachePct) });
  push("trim-cpu-time", "Trim CPU time per request: lazy-parse, shrink the bundle, move heavy work off the hot path",
    `${A.cpuPct}% less CPU time`, scale(["workers_cpu_m_ms"], keep(A.cpuPct)));
  push("cache-kv-reads", "Cache hot KV keys in the Worker or Cache API instead of reading them every request",
    `${A.kvReadPct}% fewer KV reads`, scale(["kv_reads_m"], keep(A.kvReadPct)));
  push("skip-redundant-kv-writes", "Skip KV writes whose value has not changed and batch the rest",
    `${A.kvWritePct}% fewer KV writes`, scale(["kv_writes_m"], keep(A.kvWritePct)));
  push("expire-r2-objects", "Expire old R2 objects and abort stale multipart uploads with lifecycle rules",
    `${A.r2StoragePct}% less R2 storage`, scale(["r2_storage_gb"], keep(A.r2StoragePct)));
  push("batch-r2-writes", "Batch R2 writes: larger multipart parts, fewer list calls",
    `${A.r2OpsPct}% fewer Class A operations`, scale(["r2_class_a_m"], keep(A.r2OpsPct)));
  push("cache-r2-reads", "Put the CDN cache in front of hot R2 objects",
    `${A.r2ReadPct}% fewer Class B reads`, scale(["r2_class_b_m"], keep(A.r2ReadPct)));

  levers.sort((a, b) => b.saving - a.saving || (a.id < b.id ? -1 : 1));
  return levers;
}

/** Summary and budget gate. `budget` is monthly USD or null. */
export function summarize(estimate, levers, { budget = null } = {}) {
  const overBudget = budget != null && estimate.total > budget;
  const errors = overBudget ? 1 : 0;
  if (estimate.items.every((i) => i.quantity === 0)) return { status: "none", errors, overBudget, text: "No usage entered. Fill in at least one usage line (or paste a product,usage CSV)." };
  let text = `Estimated ${fmt(estimate.total)} per month (${fmt(estimate.annual)} per year) at the list prices shown.`;
  if (levers.length) text += ` Biggest lever: ${levers[0].title.split(":")[0]}, about ${fmt(levers[0].saving)} per month under its stated assumption.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(estimate.total - budget)}.`;
  return { status: errors ? "error" : "ok", errors, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
