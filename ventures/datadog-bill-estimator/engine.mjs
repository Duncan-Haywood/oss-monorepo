// Zero-dependency, deterministic estimate of a monthly Datadog bill from the
// usage numbers the user types or pastes, plus a ranked list of the changes
// that would cut it most, each with a dollar figure. Pure data in, report out --
// no filesystem or network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Datadog's real invoice depends on
// the contract, committed-use discounts, how it measures hosts (hourly
// percentiles), and billing rules this file does not reproduce.

export const PRICES_AS_OF = "approximate public list prices, early 2025, annual billing; verify at https://www.datadoghq.com/pricing/";
export const PRICING_URL = "https://www.datadoghq.com/pricing/";

// Editable. Host-based products have an annual-billing price and a
// month-to-month price; usage-based products are one price.
export const DEFAULT_PRICES = {
  infraProHost: { label: "Infrastructure Pro (per host)", annual: 15, monthly: 18 },
  infraEnterpriseHost: { label: "Infrastructure Enterprise (per host)", annual: 23, monthly: 27 },
  apmHost: { label: "APM (per host)", annual: 31, monthly: 36 },
  container: { label: "Containers (per container beyond the free ones)", annual: 1, monthly: 1.2 },
  customMetric: { label: "Custom metrics (per metric beyond the included ones)", annual: 0.05, monthly: 0.05 },
  logIngestGb: { label: "Log ingestion (per GB)", annual: 0.1, monthly: 0.1 },
  logIndexPerMillion: {
    label: "Log indexing (per million events, by retention days)",
    byRetention: { 3: 1.06, 7: 1.27, 15: 1.7, 30: 2.5 },
  },
  syntheticsApiPer10k: { label: "Synthetics API tests (per 10,000 runs)", annual: 5, monthly: 7.2 },
  syntheticsBrowserPer1k: { label: "Synthetics browser tests (per 1,000 runs)", annual: 12, monthly: 18 },
};

// Allowances that come with the host plans (also editable).
export const DEFAULT_ALLOWANCES = {
  containersPerHost: 10,
  customMetricsPerProHost: 100,
  customMetricsPerEnterpriseHost: 200,
};

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  logExcludePct: 30, // share of indexed log events an exclusion filter drops
  retentionTargetDays: 7, // shorter index retention to move to
  flexMovePct: 50, // share of indexed events moved to archive / flex storage
  flexPerMillion: 0.3, // blended USD per million events kept in flex/archive instead of indexed
  tagCutPct: 30, // share of billable custom metrics removed by trimming tags
  rightsizePct: 15, // share of hosts that can be removed by rightsizing
  syntheticsCutPct: 30, // share of synthetic runs removed by lowering frequency
};

export const RETENTION_DAYS = [3, 7, 15, 30];

export const USAGE_FIELDS = [
  { key: "infra_pro_hosts", label: "Infrastructure Pro hosts", unit: "hosts", def: 0 },
  { key: "infra_enterprise_hosts", label: "Infrastructure Enterprise hosts", unit: "hosts", def: 0 },
  { key: "containers", label: "Containers (average)", unit: "containers", def: 0 },
  { key: "custom_metrics", label: "Custom metrics (average)", unit: "metrics", def: 0 },
  { key: "logs_ingested_gb", label: "Logs ingested per month", unit: "GB", def: 0 },
  { key: "logs_indexed_million", label: "Log events indexed per month", unit: "million events", def: 0 },
  { key: "logs_retention_days", label: "Log index retention", unit: "days (3, 7, 15 or 30)", def: 15 },
  { key: "apm_hosts", label: "APM hosts", unit: "hosts", def: 0 },
  { key: "synthetics_api_runs", label: "Synthetic API test runs per month", unit: "runs", def: 0 },
  { key: "synthetics_browser_runs", label: "Synthetic browser test runs per month", unit: "runs", def: 0 },
  { key: "billing", label: "Billing", unit: "annual or monthly", def: "annual" },
];

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
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^([^,=]+?)\s*[,=]\s*(.*)$/.exec(line);
    if (!m) { errors.push(`line ${idx + 1}: expected "product,usage"`); return; }
    const key = m[1].trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^["']|["']$/g, "");
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "product" && /^usage$/i.test(val)) return; // header
    const field = KEYS.get(key);
    if (!field) { unknown.push(key); return; }
    if (key === "billing") {
      const b = val.toLowerCase();
      if (b !== "annual" && b !== "monthly") errors.push(`line ${idx + 1}: billing must be annual or monthly`);
      else usage.billing = b;
      return;
    }
    const n = Number(val.replace(/[_\s]/g, ""));
    if (!val || !Number.isFinite(n) || n < 0) { errors.push(`line ${idx + 1}: ${key} needs a non-negative number, got "${val}"`); return; }
    if (key === "logs_retention_days" && !RETENTION_DAYS.includes(n)) { errors.push(`line ${idx + 1}: logs_retention_days must be one of ${RETENTION_DAYS.join(", ")}`); return; }
    usage[key] = n;
  });
  return { usage, errors, unknown };
}

/** Fills defaults so every key is present. */
export function normalizeUsage(partial = {}) {
  const u = {};
  for (const f of USAGE_FIELDS) u[f.key] = partial[f.key] !== undefined ? partial[f.key] : f.def;
  if (!RETENTION_DAYS.includes(u.logs_retention_days)) u.logs_retention_days = 15;
  if (u.billing !== "monthly") u.billing = "annual";
  return u;
}

function hostPrice(p, billing) { return billing === "monthly" ? p.monthly : p.annual; }
function indexPrice(prices, days) {
  const t = prices.logIndexPerMillion.byRetention;
  return t[days] ?? t[15];
}

/** Line items and total for a usage record. */
export function estimateBill(usageIn, prices = DEFAULT_PRICES, allowances = DEFAULT_ALLOWANCES) {
  const u = normalizeUsage(usageIn);
  const b = u.billing;
  const items = [];
  const add = (key, label, quantity, unit, billable, rate, cost, note = "") =>
    items.push({ key, label, quantity, unit, billable, rate, monthly: round2(cost), note });

  add("infra_pro", prices.infraProHost.label, u.infra_pro_hosts, "hosts", u.infra_pro_hosts, hostPrice(prices.infraProHost, b), u.infra_pro_hosts * hostPrice(prices.infraProHost, b));
  add("infra_enterprise", prices.infraEnterpriseHost.label, u.infra_enterprise_hosts, "hosts", u.infra_enterprise_hosts, hostPrice(prices.infraEnterpriseHost, b), u.infra_enterprise_hosts * hostPrice(prices.infraEnterpriseHost, b));

  const hosts = u.infra_pro_hosts + u.infra_enterprise_hosts;
  const freeContainers = hosts * allowances.containersPerHost;
  const billableContainers = Math.max(0, u.containers - freeContainers);
  add("containers", prices.container.label, u.containers, "containers", billableContainers, hostPrice(prices.container, b), billableContainers * hostPrice(prices.container, b), `${freeContainers} included with ${hosts} host(s)`);

  const freeMetrics = u.infra_pro_hosts * allowances.customMetricsPerProHost + u.infra_enterprise_hosts * allowances.customMetricsPerEnterpriseHost;
  const billableMetrics = Math.max(0, u.custom_metrics - freeMetrics);
  add("custom_metrics", prices.customMetric.label, u.custom_metrics, "metrics", billableMetrics, hostPrice(prices.customMetric, b), billableMetrics * hostPrice(prices.customMetric, b), `${freeMetrics} included with your hosts`);

  add("log_ingest", prices.logIngestGb.label, u.logs_ingested_gb, "GB", u.logs_ingested_gb, prices.logIngestGb.annual, u.logs_ingested_gb * prices.logIngestGb.annual);
  const ip = indexPrice(prices, u.logs_retention_days);
  add("log_index", `Log indexing, ${u.logs_retention_days}-day retention`, u.logs_indexed_million, "million events", u.logs_indexed_million, ip, u.logs_indexed_million * ip);
  add("apm", prices.apmHost.label, u.apm_hosts, "hosts", u.apm_hosts, hostPrice(prices.apmHost, b), u.apm_hosts * hostPrice(prices.apmHost, b));
  add("synthetics_api", prices.syntheticsApiPer10k.label, u.synthetics_api_runs, "runs", u.synthetics_api_runs, hostPrice(prices.syntheticsApiPer10k, b) / 10000, (u.synthetics_api_runs / 10000) * hostPrice(prices.syntheticsApiPer10k, b));
  add("synthetics_browser", prices.syntheticsBrowserPer1k.label, u.synthetics_browser_runs, "runs", u.synthetics_browser_runs, hostPrice(prices.syntheticsBrowserPer1k, b) / 1000, (u.synthetics_browser_runs / 1000) * hostPrice(prices.syntheticsBrowserPer1k, b));

  const total = round2(items.reduce((n, i) => n + i.monthly, 0));
  return { usage: u, items, total, annual: round2(total * 12) };
}

/**
 * Ranked levers, largest saving first. Each saving is the difference between
 * the baseline estimate and the same estimate with that one change applied,
 * under the stated assumption. Levers overlap (excluding logs and moving them
 * to archive hit the same events), so the savings are NOT additive.
 */
export function rankLevers(usageIn, prices = DEFAULT_PRICES, assumptions = DEFAULT_ASSUMPTIONS, allowances = DEFAULT_ALLOWANCES) {
  const u = normalizeUsage(usageIn);
  const base = estimateBill(u, prices, allowances).total;
  const A = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const pct = (n) => Math.min(100, Math.max(0, n)) / 100;
  const levers = [];
  const push = (id, title, assumption, change) => {
    const next = estimateBill({ ...u, ...change.usage }, prices, allowances).total + (change.extra || 0);
    const saving = round2(base - next);
    if (saving > 0.005) levers.push({ id, title, assumption, saving, after: round2(next), pctOfBill: base ? round2((saving / base) * 100) : 0 });
  };

  if (u.logs_indexed_million > 0) {
    push("log-exclusion", "Add exclusion filters so fewer log events are indexed (health checks, debug, 2xx access logs)",
      `drop ${A.logExcludePct}% of indexed events`,
      { usage: { logs_indexed_million: u.logs_indexed_million * (1 - pct(A.logExcludePct)) } });
    if (u.logs_retention_days > A.retentionTargetDays) {
      push("log-retention", `Shorten indexed log retention from ${u.logs_retention_days} to ${A.retentionTargetDays} days (keep the rest in archive)`,
        `retention ${A.retentionTargetDays} days`, { usage: { logs_retention_days: A.retentionTargetDays } });
    }
    const moved = u.logs_indexed_million * pct(A.flexMovePct);
    push("log-flex-archive", "Move rarely searched logs to Flex Logs or archive instead of indexing them",
      `move ${A.flexMovePct}% of indexed events, at $${A.flexPerMillion}/million kept instead`,
      { usage: { logs_indexed_million: u.logs_indexed_million - moved }, extra: moved * A.flexPerMillion });
  }
  const mBill = estimateBill(u, prices, allowances).items.find((i) => i.key === "custom_metrics");
  if (mBill.billable > 0) {
    const cut = mBill.billable * pct(A.tagCutPct);
    push("custom-metric-tags", "Trim high-cardinality tags (user, request, pod ids) on custom metrics",
      `remove ${A.tagCutPct}% of billable custom metrics`, { usage: { custom_metrics: u.custom_metrics - cut } });
  }
  const hosts = u.infra_pro_hosts + u.infra_enterprise_hosts + u.apm_hosts;
  if (hosts > 0) {
    const k = 1 - pct(A.rightsizePct);
    push("rightsize-hosts", "Rightsize: fewer, larger hosts and no idle or zombie hosts",
      `${A.rightsizePct}% fewer hosts`,
      { usage: { infra_pro_hosts: u.infra_pro_hosts * k, infra_enterprise_hosts: u.infra_enterprise_hosts * k, apm_hosts: u.apm_hosts * k } });
  }
  if (u.billing === "monthly") {
    push("annual-commitment", "Switch from month-to-month to annual billing on the host-based products",
      "annual list prices instead of month-to-month", { usage: { billing: "annual" } });
  }
  if (u.synthetics_api_runs + u.synthetics_browser_runs > 0) {
    const k = 1 - pct(A.syntheticsCutPct);
    push("synthetics-frequency", "Run synthetic tests less often (or from fewer locations)",
      `${A.syntheticsCutPct}% fewer runs`, { usage: { synthetics_api_runs: u.synthetics_api_runs * k, synthetics_browser_runs: u.synthetics_browser_runs * k } });
  }
  levers.sort((a, b) => b.saving - a.saving || (a.id < b.id ? -1 : 1));
  return levers;
}

/** Summary and budget gate. `budget` is monthly USD or null. */
export function summarize(estimate, levers, { budget = null } = {}) {
  const overBudget = budget != null && estimate.total > budget;
  const errors = overBudget ? 1 : 0;
  if (estimate.total === 0) return { status: "none", errors, overBudget, text: "No usage entered. Fill in at least one product (or paste a product,usage CSV)." };
  let text = `Estimated ${fmt(estimate.total)} per month (${fmt(estimate.annual)} per year) at the list prices shown.`;
  if (levers.length) text += ` Biggest lever: ${levers[0].title.split(" (")[0]}, about ${fmt(levers[0].saving)} per month under its stated assumption.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(estimate.total - budget)}.`;
  return { status: errors ? "error" : "ok", errors, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
