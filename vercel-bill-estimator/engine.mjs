// Zero-dependency, deterministic estimate of a monthly Vercel Pro bill from the
// usage numbers the user types or pastes (it is on the Usage page of the Vercel
// dashboard), plus a ranked list of the changes that would cut it most, each
// with a dollar figure. Pure data in, report out -- no filesystem or network
// here (cli.mjs and index.html supply the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Vercel's real invoice depends on the
// plan, regions, spend management, enterprise contracts and metering rules this
// file does not reproduce.

export const PRICES_AS_OF = "approximate public Pro-plan list prices, 2025; verify at https://vercel.com/docs/pricing";
export const PRICING_URL = "https://vercel.com/docs/pricing";

// Editable. `included` is what the Pro plan bundles per month; `rate` is the
// overage price per `per` units. Seats are billed per user with no allowance.
export const DEFAULT_PRICES = {
  seats: { label: "Pro seats (per paid member)", unit: "seats", rate: 20, per: 1, included: 0 },
  bandwidth_gb: { label: "Fast Data Transfer (per GB)", unit: "GB", rate: 0.15, per: 1, included: 1000 },
  edge_requests_million: { label: "Edge Requests (per million)", unit: "million requests", rate: 2, per: 1, included: 10 },
  function_invocations_million: { label: "Function invocations (per million)", unit: "million invocations", rate: 0.6, per: 1, included: 1 },
  function_cpu_hours: { label: "Function Active CPU (per hour)", unit: "hours", rate: 0.128, per: 1, included: 4 },
  function_memory_gb_hours: { label: "Function provisioned memory (per GB-hour)", unit: "GB-hours", rate: 0.0106, per: 1, included: 360 },
  fast_origin_gb: { label: "Fast Origin Transfer (per GB)", unit: "GB", rate: 0.06, per: 1, included: 100 },
  image_transformations_thousand: { label: "Image transformations (per thousand)", unit: "thousand transformations", rate: 0.05, per: 1, included: 10 },
  build_minutes: { label: "Build minutes, standard machine (per minute)", unit: "minutes", rate: 0.014, per: 1, included: 0 },
};

// Pro bundles a monthly usage credit that offsets usage charges (not seats).
export const DEFAULT_CREDIT_USD = 20;

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  cachePct: 40, // share of function invocations/CPU/memory/origin transfer removed by ISR, static generation or cache headers
  imagePct: 50, // share of image transformations removed by sizing, formats and longer cache TTL
  assetPct: 25, // share of bandwidth removed by compression, smaller assets, lazy loading
  botPct: 15, // share of edge requests, bandwidth and functions that are bot traffic you can block
  buildPct: 40, // share of build minutes removed by ignored-build-step and build cache
  seatPct: 20, // share of paid seats that could be free viewers or removed
  memoryPct: 30, // share of provisioned memory removed by rightsizing function memory
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

/** Line items and total for a usage record. Usage credit offsets usage lines, never seats. */
export function estimateBill(usageIn, prices = DEFAULT_PRICES, creditUsd = DEFAULT_CREDIT_USD) {
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
  const seats = items.find((i) => i.key === "seats").monthly;
  const usageCharges = round2(items.filter((i) => i.key !== "seats").reduce((n, i) => n + i.monthly, 0));
  const credit = round2(Math.min(creditUsd, usageCharges));
  const total = round2(seats + usageCharges - credit);
  return { usage: u, items, seats, usageCharges, credit, total, annual: round2(total * 12) };
}

/**
 * Ranked levers, largest saving first. Each saving is the difference between
 * the baseline estimate and the same estimate with that one change applied,
 * under the stated assumption. Levers overlap (caching and bot blocking both
 * remove the same invocations), so the savings are NOT additive.
 */
export function rankLevers(usageIn, prices = DEFAULT_PRICES, assumptions = DEFAULT_ASSUMPTIONS, creditUsd = DEFAULT_CREDIT_USD) {
  const u = normalizeUsage(usageIn);
  const base = estimateBill(u, prices, creditUsd).total;
  const A = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const keep = (n) => 1 - Math.min(100, Math.max(0, n)) / 100;
  const levers = [];
  const scale = (keys, k) => Object.fromEntries(keys.map((key) => [key, u[key] * k]));
  const push = (id, title, assumption, change) => {
    const next = estimateBill({ ...u, ...change }, prices, creditUsd).total;
    const saving = round2(base - next);
    if (saving > 0.005) levers.push({ id, title, assumption, saving, after: round2(next), pctOfBill: base ? round2((saving / base) * 100) : 0 });
  };

  push("cache-functions", "Cache more: ISR, static generation and Cache-Control so fewer requests run a function",
    `${A.cachePct}% fewer invocations, CPU time, memory time and origin transfer`,
    scale(["function_invocations_million", "function_cpu_hours", "function_memory_gb_hours", "fast_origin_gb"], keep(A.cachePct)));
  push("image-optimization", "Cut image transformations: right-size sources, fewer variants, longer minimumCacheTTL",
    `${A.imagePct}% fewer transformations`, scale(["image_transformations_thousand"], keep(A.imagePct)));
  push("shrink-assets", "Shrink what you send: compression, modern formats, lazy loading, no autoplay video",
    `${A.assetPct}% less Fast Data Transfer`, scale(["bandwidth_gb"], keep(A.assetPct)));
  push("block-bots", "Block or rate-limit bots and scrapers with firewall rules",
    `${A.botPct}% of edge requests, bandwidth, invocations and CPU time are bots`,
    scale(["edge_requests_million", "bandwidth_gb", "function_invocations_million", "function_cpu_hours", "function_memory_gb_hours"], keep(A.botPct)));
  push("skip-builds", "Skip unnecessary builds: ignored build step for docs-only commits, keep the build cache",
    `${A.buildPct}% fewer build minutes`, scale(["build_minutes"], keep(A.buildPct)));
  push("seat-audit", "Audit seats: move read-only people to free Viewer seats and remove leavers",
    `${A.seatPct}% fewer paid seats`, scale(["seats"], keep(A.seatPct)));
  push("rightsize-memory", "Rightsize function memory settings to what the code uses",
    `${A.memoryPct}% less provisioned memory time`, scale(["function_memory_gb_hours"], keep(A.memoryPct)));

  levers.sort((a, b) => b.saving - a.saving || (a.id < b.id ? -1 : 1));
  return levers;
}

/** Summary and budget gate. `budget` is monthly USD or null. */
export function summarize(estimate, levers, { budget = null } = {}) {
  const overBudget = budget != null && estimate.total > budget;
  const errors = overBudget ? 1 : 0;
  if (estimate.items.every((i) => i.quantity === 0)) return { status: "none", errors, overBudget, text: "No usage entered. Fill in at least one product (or paste a product,usage CSV)." };
  let text = `Estimated ${fmt(estimate.total)} per month (${fmt(estimate.annual)} per year) at the list prices shown.`;
  if (levers.length) text += ` Biggest lever: ${levers[0].title.split(":")[0]}, about ${fmt(levers[0].saving)} per month under its stated assumption.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(estimate.total - budget)}.`;
  return { status: errors ? "error" : "ok", errors, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
