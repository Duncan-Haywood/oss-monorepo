// Zero-dependency, deterministic estimate of a monthly Supabase Pro bill from the
// usage numbers the user types or pastes (it is on the Usage page of the Supabase
// dashboard), plus a ranked list of the changes that would cut it most, each
// with a dollar figure. Pure data in, report out -- no filesystem or network
// here (cli.mjs and index.html supply the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Supabase's real invoice depends on the
// plan, regions, spend management, enterprise contracts and metering rules this
// file does not reproduce.

export const PRICES_AS_OF = "approximate public Pro-plan list prices, 2025; verify at https://supabase.com/pricing";
export const PRICING_URL = "https://supabase.com/pricing";

// Editable. `included` is what the Pro plan bundles per month; `rate` is the
// overage price per `per` units. The Pro organization fee is fixed. Compute is
// entered as the USD list price of the instances you run, and the $10 of
// bundled compute credit is modeled as that line's allowance.
export const DEFAULT_PRICES = {
  pro_orgs: { label: "Pro organizations (per org)", unit: "organizations", rate: 25, per: 1, included: 0 },
  compute_usd: { label: "Compute instances (USD list price of your add-ons)", unit: "USD of compute", rate: 1, per: 1, included: 10 },
  db_disk_gb: { label: "Database disk (per GB)", unit: "GB", rate: 0.125, per: 1, included: 8 },
  egress_gb: { label: "Egress (per GB)", unit: "GB", rate: 0.09, per: 1, included: 250 },
  storage_gb: { label: "File storage (per GB)", unit: "GB", rate: 0.021, per: 1, included: 100 },
  mau_thousand: { label: "Monthly active users (per thousand)", unit: "thousand users", rate: 3.25, per: 1, included: 100 },
  edge_invocations_million: { label: "Edge Function invocations (per million)", unit: "million invocations", rate: 2, per: 1, included: 2 },
  realtime_messages_million: { label: "Realtime messages (per million)", unit: "million messages", rate: 2.5, per: 1, included: 5 },
};

// Compute is already net of the bundled credit through its allowance, so no
// separate usage credit is applied by default (the field stays editable).
export const DEFAULT_CREDIT_USD = 0;

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  egressPct: 30, // share of egress removed by CDN caching, narrower selects, compression and image transforms
  storagePct: 25, // share of file storage removed by deleting orphaned and duplicate objects
  computePct: 30, // share of compute spend removed by rightsizing the instance after checking CPU and memory
  diskPct: 25, // share of database disk removed by archiving old rows, dropping unused indexes and vacuuming bloat
  edgePct: 40, // share of Edge Function invocations removed by caching responses and batching calls
  realtimePct: 30, // share of Realtime messages removed by batching and by broadcasting less often
  authPct: 15, // share of monthly active users that are bot or throwaway sign-ups you can block
  orgPct: 20, // share of Pro organizations that could be merged into another
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

/** Line items and total for a usage record. Any extra usage credit offsets usage lines, never the organization fee. */
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
  const pro_orgs = items.find((i) => i.key === "pro_orgs").monthly;
  const usageCharges = round2(items.filter((i) => i.key !== "pro_orgs").reduce((n, i) => n + i.monthly, 0));
  const credit = round2(Math.min(creditUsd, usageCharges));
  const total = round2(pro_orgs + usageCharges - credit);
  return { usage: u, items, pro_orgs, usageCharges, credit, total, annual: round2(total * 12) };
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

  push("trim-egress", "Trim egress: CDN caching for storage files, narrower selects, compression, resized images",
    `${A.egressPct}% less egress`, scale(["egress_gb"], keep(A.egressPct)));
  push("rightsize-compute", "Rightsize compute: check CPU and memory, then drop to a smaller instance size",
    `${A.computePct}% less compute spend`, scale(["compute_usd"], keep(A.computePct)));
  push("shrink-database", "Shrink the database: archive old rows, drop unused indexes, vacuum bloat",
    `${A.diskPct}% less database disk`, scale(["db_disk_gb"], keep(A.diskPct)));
  push("clean-storage", "Clean up storage: delete orphaned and duplicate objects, set expiry on temp files",
    `${A.storagePct}% less file storage`, scale(["storage_gb"], keep(A.storagePct)));
  push("cache-edge", "Cache Edge Function responses and batch calls so fewer invocations run",
    `${A.edgePct}% fewer invocations`, scale(["edge_invocations_million"], keep(A.edgePct)));
  push("batch-realtime", "Batch Realtime messages and broadcast less often",
    `${A.realtimePct}% fewer messages`, scale(["realtime_messages_million"], keep(A.realtimePct)));
  push("block-fake-signups", "Block bot and throwaway sign-ups with CAPTCHA and email verification",
    `${A.authPct}% of monthly active users are fake`, scale(["mau_thousand"], keep(A.authPct)));
  push("merge-orgs", "Consolidate small projects into fewer Pro organizations",
    `${A.orgPct}% fewer organizations`, scale(["pro_orgs"], keep(A.orgPct)));

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
