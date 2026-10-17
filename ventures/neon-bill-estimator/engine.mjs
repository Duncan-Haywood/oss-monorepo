// Zero-dependency, deterministic estimate of a monthly Neon (serverless
// Postgres) bill from the usage numbers the user types or pastes (they are on
// the Billing and Usage pages of the Neon console), plus a ranked list of the
// changes that would cut it most, each with a dollar figure. Pure data in,
// report out -- no filesystem or network here (cli.mjs and index.html supply
// the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Neon's real invoice depends on the
// plan, region, projects, contracts and metering rules this file does not
// reproduce.

export const PRICES_AS_OF = "approximate public usage-based list prices, 2025; verify at https://neon.com/pricing";
export const PRICING_URL = "https://neon.com/pricing";

// Editable. `included` is what the plan bundles per month; `rate` is the
// price per `per` units above it.
export const DEFAULT_PRICES = {
  compute_cu_hours: { label: "Compute (per CU-hour)", unit: "CU-hours", rate: 0.106, per: 1, included: 0 },
  storage_gb: { label: "Storage (per GB-month)", unit: "GB-months", rate: 0.35, per: 1, included: 0 },
  history_gb: { label: "Restore history / PITR (per GB-month)", unit: "GB-months", rate: 0.2, per: 1, included: 0 },
  extra_branches: { label: "Extra branches (per branch-month)", unit: "branch-months", rate: 1.5, per: 1, included: 0 },
  egress_gb: { label: "Data transfer out (per GB)", unit: "GB", rate: 0.1, per: 1, included: 100 },
};

// Paid plans carry a monthly minimum; the bill is never below it.
export const DEFAULT_MINIMUM_USD = 5;

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  suspendPct: 35, // share of compute hours removed by scale-to-zero on dev, preview and idle branches
  rightsizePct: 20, // share of compute hours removed by lowering autoscaling min/max CU to what the load needs
  branchPct: 50, // share of extra branches removed by deleting stale preview and PR branches
  historyPct: 50, // share of restore-history storage removed by shortening the restore window
  prunePct: 20, // share of storage removed by dropping bloat, unused indexes and archiving cold tables
  egressPct: 40, // share of data transfer removed by caching, smaller payloads and co-locating compute with the database region
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
 * under the stated assumption. Levers overlap (caching and bot blocking both
 * remove the same invocations), so the savings are NOT additive.
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

  push("scale-to-zero", "Scale to zero: autosuspend dev, preview and staging branches when idle",
    `${A.suspendPct}% fewer compute hours`, scale(["compute_cu_hours"], keep(A.suspendPct)));
  push("rightsize-autoscaling", "Rightsize autoscaling: lower min and max CU to what the load needs",
    `${A.rightsizePct}% fewer compute hours`, scale(["compute_cu_hours"], keep(A.rightsizePct)));
  push("delete-stale-branches", "Delete stale branches: expire per-PR and preview branches on merge",
    `${A.branchPct}% fewer extra branches`, scale(["extra_branches"], keep(A.branchPct)));
  push("shorten-restore-window", "Shorten the restore window to what recovery actually needs",
    `${A.historyPct}% less restore-history storage`, scale(["history_gb"], keep(A.historyPct)));
  push("prune-storage", "Prune storage: drop bloat and unused indexes, archive cold tables",
    `${A.prunePct}% less storage`, scale(["storage_gb"], keep(A.prunePct)));
  push("cut-egress", "Cut data transfer: cache reads, trim payloads, run compute in the database's region",
    `${A.egressPct}% less data transfer`, scale(["egress_gb"], keep(A.egressPct)));

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
