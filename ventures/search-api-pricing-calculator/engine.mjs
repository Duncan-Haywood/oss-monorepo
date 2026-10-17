// Zero-dependency, deterministic comparison of what hosted search providers charge for an
// index size (thousands of records) and a monthly query volume (thousands of searches), so a
// founder can see the bill at today's size, the 12-month spend under a growth rate, and the
// query volume at which the cheapest option changes. Pure data in, report out -- no filesystem
// or network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on two typed volumes and editable rate cards. It is not a quote and not a
// guarantee: real invoices also depend on record size, indexing operations, replicas, regions,
// support plans, contracts and each provider's fair-use terms, none of which this file
// reproduces. Cluster-priced engines (Typesense Cloud, Elastic Cloud) are modelled as a flat
// monthly fee with a record allowance, because their price steps with RAM, not with searches.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025 -- providers change packaging often, and the overage rates in particular are rough; verify each at its own pricing page";

// Editable. Monthly cost of a provider =
//   baseUsd
// + max(0, records - includedRecordsK) * perKRecords
// + max(0, searches - includedSearchesK - freeSearchesPerKRecords * records) * perKSearches
// (records and searches are in thousands).
export const DEFAULT_PROVIDERS = {
  algolia: { label: "Algolia (pay-as-you-go, after free tier)", url: "https://www.algolia.com/pricing/", baseUsd: 0, includedRecordsK: 100, includedSearchesK: 10, freeSearchesPerKRecords: 0, perKRecords: 0.4, perKSearches: 0.5 },
  meilisearch: { label: "Meilisearch Cloud (Build plan, approx. overage)", url: "https://www.meilisearch.com/pricing", baseUsd: 30, includedRecordsK: 100, includedSearchesK: 50, freeSearchesPerKRecords: 0, perKRecords: 0.3, perKSearches: 0.4 },
  typesense: { label: "Typesense Cloud (smallest dedicated cluster, flat)", url: "https://cloud.typesense.org/pricing", baseUsd: 15, includedRecordsK: 250, includedSearchesK: 1000000, freeSearchesPerKRecords: 0, perKRecords: 0.06, perKSearches: 0 },
  elastic: { label: "Elastic Cloud (Standard entry deployment, flat)", url: "https://www.elastic.co/pricing", baseUsd: 95, includedRecordsK: 5000, includedSearchesK: 1000000, freeSearchesPerKRecords: 0, perKRecords: 0.02, perKSearches: 0 },
  selfhosted: { label: "Self-hosted Typesense/Meilisearch (VPS ~$6 + ~2 h of your time at $75)", url: "https://typesense.org/docs/guide/install-typesense.html", baseUsd: 156, includedRecordsK: 1000, includedSearchesK: 1000000, freeSearchesPerKRecords: 0, perKRecords: 0.006, perKSearches: 0 },
};

const round2 = (n) => Math.round(n * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0);

/** Monthly cost of one provider at `recordsIn` thousand records and `searchesIn` thousand searches a month. */
export function providerCost(p, recordsIn, searchesIn) {
  const records = nn(recordsIn), searches = nn(searchesIn);
  if (records === 0 && searches === 0) return 0;
  const recs = Math.max(0, records - nn(p.includedRecordsK)) * nn(p.perKRecords);
  const freeSearches = nn(p.includedSearchesK) + nn(p.freeSearchesPerKRecords) * records;
  const qs = Math.max(0, searches - freeSearches) * nn(p.perKSearches);
  return round2(nn(p.baseUsd) + recs + qs);
}

/** Every provider priced at the volumes, cheapest first (ties by label). */
export function compare(records, searches, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => {
    const monthly = providerCost(p, records, searches);
    return { key, label: p.label, url: p.url, monthly, annual: round2(monthly * 12) };
  });
  rows.sort((a, b) => a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: round2(r.monthly - cheapest) }));
}

/** Month-by-month volumes under compound growth (both records and searches) and each provider's total over `months`. */
export function project(records, searches, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push({ records: Math.round(nn(records) * g ** m), searches: Math.round(nn(searches) * g ** m) });
  const end = path[path.length - 1];
  const totals = Object.entries(providers).map(([key, p]) => ({
    key, label: p.label, total: round2(path.reduce((n, x) => n + providerCost(p, x.records, x.searches), 0)), endMonthly: providerCost(p, end.records, end.searches),
  }));
  totals.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endRecords: end.records, endSearches: end.searches, totals };
}

/** Which provider is cheapest as monthly searches grow (at a fixed record count), as segments `{from, to, key, label}`. */
export function cheapestSegments(records, providers = DEFAULT_PROVIDERS, maxSearches = 500000) {
  const winner = (v) => {
    const rows = compare(records, v, providers);
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : rows[0].label };
  };
  const grid = [0];
  for (let v = 1; v < maxSearches; v = Math.ceil(v * 1.03)) grid.push(v);
  grid.push(maxSearches);
  const segs = [];
  let prev = winner(grid[0]);
  let start = 0;
  for (let i = 1; i < grid.length; i++) {
    const w = winner(grid[i]);
    if (w.key === prev.key) continue;
    let lo = grid[i - 1], hi = grid[i];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (winner(mid).key === prev.key) lo = mid; else hi = mid; }
    segs.push({ from: start, to: lo, key: prev.key, label: prev.label });
    start = hi;
    prev = w;
  }
  segs.push({ from: start, to: maxSearches, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}".` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) at these volumes.`
    : `Cheapest at these volumes: ${pick.label}, about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const worst = rows[rows.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive here, ${worst.label}, is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
