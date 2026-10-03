// Zero-dependency, deterministic estimate of a monthly Upstash Redis bill from
// the usage numbers the user types or pastes (they are on the database
// Usage/Details tab of the Upstash console), a comparison against the fixed
// plans, the pay-as-you-go-vs-fixed crossover, and a ranked list of the changes
// that would cut the bill most, each with a dollar figure. Pure data in,
// report out -- no filesystem or network here (cli.mjs and index.html supply
// the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Upstash's real invoice depends on the
// plan, region, database type, add-ons, contracts and metering rules this file
// does not reproduce.

// ---- Pricing constants: the only place prices live. Approximate and dated. ----
export const PRICES_AS_OF = "approximate public list prices as best known in 2025 from memory of upstash.com/pricing/redis, not re-fetched; verify on the vendor site before relying on any figure";
export const PRICING_URL = "https://upstash.com/pricing/redis";

// Pay-as-you-go. `included` is the monthly free allowance; `rate` is the price
// per `per` units above it. Commands are entered in millions per month.
export const DEFAULT_PRICES = {
  commands_m: { label: "Commands (per million)", unit: "million commands", rate: 2, per: 1, included: 0.5 },
  storage_gb: { label: "Storage (per GB-month)", unit: "GB", rate: 0.25, per: 1, included: 0.25 },
  bandwidth_gb: { label: "Bandwidth (per GB)", unit: "GB", rate: 0.03, per: 1, included: 200 },
};

// Fixed plans: a flat monthly price for a storage ceiling and unlimited
// commands. Each plan's own bandwidth ceiling and connection limits are not
// modelled, so check them before moving.
export const DEFAULT_FIXED_PLANS = [
  { name: "Fixed 250 MB", storage_gb: 0.25, price: 10 },
  { name: "Fixed 1 GB", storage_gb: 1, price: 20 },
  { name: "Fixed 5 GB", storage_gb: 5, price: 100 },
  { name: "Fixed 10 GB", storage_gb: 10, price: 200 },
  { name: "Fixed 50 GB", storage_gb: 50, price: 400 },
  { name: "Fixed 100 GB", storage_gb: 100, price: 800 },
  { name: "Fixed 500 GB", storage_gb: 500, price: 1500 },
];

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  pipelinePct: 30, // share of commands removed by pipelining / batching (MGET, MSET, multi-exec) and fewer round trips
  cachePct: 25, // share of commands removed by an in-process or edge cache in front of hot keys
  pollingPct: 15, // share of commands removed by replacing polling loops with pub/sub or longer intervals
  ttlPct: 30, // share of storage removed by setting TTLs and eviction on keys nobody reads again
  compressPct: 40, // share of bandwidth removed by smaller values (compression, trimmed payloads) and same-region clients
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

/** Pay-as-you-go line items and total for a usage record. */
export function estimateBill(usageIn, prices = DEFAULT_PRICES) {
  const u = normalizeUsage(usageIn);
  const items = [];
  for (const [key, p] of Object.entries(prices)) {
    const quantity = u[key] ?? 0;
    const billable = Math.max(0, quantity - p.included);
    items.push({
      key, label: p.label, quantity, unit: p.unit, billable, rate: p.rate,
      monthly: round2((billable / p.per) * p.rate),
      note: p.included ? `${p.included} ${p.unit} free` : "",
    });
  }
  const total = round2(items.reduce((n, i) => n + i.monthly, 0));
  return { usage: u, items, total, annual: round2(total * 12) };
}

/** The cheapest fixed plan whose storage ceiling holds the usage, or null. */
export function cheapestFixedPlan(usageIn, plans = DEFAULT_FIXED_PLANS) {
  const u = normalizeUsage(usageIn);
  const fits = plans.filter((p) => p.storage_gb >= u.storage_gb).sort((a, b) => a.price - b.price);
  return fits[0] ?? null;
}

/**
 * Pay-as-you-go vs the cheapest fixed plan that fits the storage, plus the
 * crossover: the monthly command volume (millions) at which pay-as-you-go
 * costs the same as that plan with storage and bandwidth held constant.
 * crossoverCommandsM is 0 when the fixed plan is cheaper even at zero
 * commands, and null when no fixed plan holds the storage.
 */
export function compareFixed(usageIn, prices = DEFAULT_PRICES, plans = DEFAULT_FIXED_PLANS) {
  const payg = estimateBill(usageIn, prices);
  const plan = cheapestFixedPlan(usageIn, plans);
  if (!plan) return { payg: payg.total, plan: null, fixed: null, cheaper: "payg", saving: 0, crossoverCommandsM: null };
  const cmd = prices.commands_m;
  const nonCommand = payg.total - payg.items.find((i) => i.key === "commands_m").monthly;
  const headroom = plan.price - nonCommand;
  const crossoverCommandsM = headroom <= 0 || !cmd.rate ? 0 : round2(cmd.included + (headroom / cmd.rate) * cmd.per);
  const cheaper = plan.price < payg.total ? "fixed" : "payg";
  return { payg: payg.total, plan, fixed: plan.price, cheaper, saving: round2(Math.abs(payg.total - plan.price)), crossoverCommandsM };
}

/**
 * Ranked levers, largest saving first. Each saving is the difference between
 * the baseline pay-as-you-go estimate and the same estimate with that one
 * change applied, under the stated assumption. Levers overlap (caching and
 * pipelining remove the same commands), so the savings are NOT additive. The
 * fixed-plan lever, when a fixed plan is cheaper, is the whole saving of
 * switching.
 */
export function rankLevers(usageIn, prices = DEFAULT_PRICES, assumptions = DEFAULT_ASSUMPTIONS, plans = DEFAULT_FIXED_PLANS) {
  const u = normalizeUsage(usageIn);
  const base = estimateBill(u, prices).total;
  const A = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const keep = (n) => 1 - Math.min(100, Math.max(0, n)) / 100;
  const levers = [];
  const scale = (keys, k) => Object.fromEntries(keys.map((key) => [key, u[key] * k]));
  const push = (id, title, assumption, change) => {
    const next = estimateBill({ ...u, ...change }, prices).total;
    const saving = round2(base - next);
    if (saving > 0.005) levers.push({ id, title, assumption, saving, after: round2(next), pctOfBill: base ? round2((saving / base) * 100) : 0 });
  };

  push("pipeline-and-batch", "Pipeline and batch: MGET/MSET and pipelines instead of one command per round trip",
    `${A.pipelinePct}% fewer commands`, scale(["commands_m"], keep(A.pipelinePct)));
  push("cache-hot-keys", "Cache hot keys in the app or at the edge so repeat reads never reach Redis",
    `${A.cachePct}% fewer commands`, scale(["commands_m"], keep(A.cachePct)));
  push("stop-polling", "Stop polling: replace tight loops with pub/sub, webhooks or longer intervals",
    `${A.pollingPct}% fewer commands`, scale(["commands_m"], keep(A.pollingPct)));
  push("set-ttls", "Set TTLs and eviction on keys nobody reads again",
    `${A.ttlPct}% less storage`, scale(["storage_gb"], keep(A.ttlPct)));
  push("shrink-payloads", "Shrink payloads: compress values, drop unused fields, keep clients in the database's region",
    `${A.compressPct}% less bandwidth`, scale(["bandwidth_gb"], keep(A.compressPct)));

  const cmp = compareFixed(u, prices, plans);
  if (cmp.plan && cmp.cheaper === "fixed" && cmp.saving > 0.005) {
    levers.push({
      id: "switch-to-fixed", title: `Switch to ${cmp.plan.name}: a flat price beats pay-as-you-go at this volume`,
      assumption: `${fmt(cmp.fixed)} flat, unlimited commands, storage up to ${cmp.plan.storage_gb} GB`,
      saving: cmp.saving, after: cmp.fixed, pctOfBill: base ? round2((cmp.saving / base) * 100) : 0,
    });
  }

  levers.sort((a, b) => b.saving - a.saving || (a.id < b.id ? -1 : 1));
  return levers;
}

/** One sentence on the pay-as-you-go-vs-fixed result. */
export function describeCrossover(cmp) {
  if (!cmp.plan) return "No fixed plan in the table holds this much storage, so pay-as-you-go (or an enterprise quote) is the only comparison here.";
  if (cmp.cheaper === "fixed") return `${cmp.plan.name} (${fmt(cmp.fixed)}) is cheaper than pay-as-you-go (${fmt(cmp.payg)}) by ${fmt(cmp.saving)} per month.`;
  const at = cmp.crossoverCommandsM;
  return `Pay-as-you-go (${fmt(cmp.payg)}) is cheaper than ${cmp.plan.name} (${fmt(cmp.fixed)}) by ${fmt(cmp.saving)} per month; the fixed plan wins above about ${at} million commands per month at this storage and bandwidth.`;
}

/** Summary and budget gate. `budget` is monthly USD or null. It gates the pay-as-you-go estimate. */
export function summarize(estimate, levers, { budget = null, comparison = null } = {}) {
  const overBudget = budget != null && estimate.total > budget;
  const errors = overBudget ? 1 : 0;
  if (estimate.items.every((i) => i.quantity === 0)) return { status: "none", errors, overBudget, text: "No usage entered. Fill in at least one usage line (or paste a product,usage CSV)." };
  let text = `Estimated ${fmt(estimate.total)} per month (${fmt(estimate.annual)} per year) pay-as-you-go at the list prices shown.`;
  if (comparison) text += ` ${describeCrossover(comparison)}`;
  const top = levers.find((l) => l.id !== "switch-to-fixed");
  if (top) text += ` Biggest lever: ${top.title.split(/:| so /)[0]}, about ${fmt(top.saving)} per month under its stated assumption.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(estimate.total - budget)}.`;
  return { status: errors ? "error" : "ok", errors, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
