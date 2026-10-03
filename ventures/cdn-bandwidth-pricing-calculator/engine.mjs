// Zero-dependency, deterministic comparison of what CDNs charge for a monthly
// delivered-bandwidth volume (GB out to visitors), so a founder can see the bill at today's
// volume, the 12-month spend under a growth rate, and the volume at which the
// cheapest provider changes. Pure data in, report out -- no filesystem or
// network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on a monthly delivered-GB volume and editable rate cards. It is not a quote
// and not a guarantee: the real invoice depends on the plan, seats,
// add-ons (regional price tiers, request fees, TLS and custom-domain fees, image optimisation, WAF, log delivery), contracts, fair-use limits and each vendor's own definition of billable traffic, none of which this file reproduces.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025 for the first North America / Europe traffic tier -- CDNs price by region and by committed volume, and change packaging often; verify each at its own pricing page";

// Editable. For a provider: no charge at or below `freeGb` GB a month. Above it
// the buyer picks the cheapest `plans` entry: `price` USD a month for `gb`
// GB included, then `overagePerGb` USD for each further GB. Pay-as-you-go
// providers use a single plan of 0 GB at $0 and only the overage rate.
export const DEFAULT_PROVIDERS = {
  cloudfront: { label: "Amazon CloudFront (first 10 TB, NA/EU)", url: "https://aws.amazon.com/cloudfront/pricing/", freeGb: 1000, plans: [{ gb: 1000, price: 0 }], overagePerGb: 0.085 },
  fastly: { label: "Fastly (NA/EU, pay as you go)", url: "https://www.fastly.com/pricing", freeGb: 0, plans: [{ gb: 0, price: 0 }], overagePerGb: 0.12 },
  bunny: { label: "Bunny CDN (Standard, NA/EU)", url: "https://bunny.net/pricing/", freeGb: 0, plans: [{ gb: 0, price: 1 }], overagePerGb: 0.01 },
  keycdn: { label: "KeyCDN (pay as you go, $4 minimum)", url: "https://www.keycdn.com/pricing", freeGb: 0, plans: [{ gb: 100, price: 4 }], overagePerGb: 0.04 },
  gcp: { label: "Google Cloud CDN (cache egress, NA)", url: "https://cloud.google.com/cdn/pricing", freeGb: 0, plans: [{ gb: 0, price: 0 }], overagePerGb: 0.08 },
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Monthly cost of one provider at `volume` GB a month. */
export function providerCost(p, volIn) {
  const vol = Math.max(0, Number(volIn) || 0);
  if (vol <= p.freeGb) return 0;
  let best = Infinity;
  for (const plan of p.plans) {
    const over = Math.max(0, vol - plan.gb);
    best = Math.min(best, plan.price + over * (p.overagePerGb || 0));
  }
  return round2(best);
}

/** Every provider priced at `volume`, cheapest first (ties by label). */
export function compare(volume, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => ({ key, label: p.label, url: p.url, monthly: providerCost(p, volume), annual: round2(providerCost(p, volume) * 12) }));
  rows.sort((a, b) => a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: round2(r.monthly - cheapest) }));
}

/** Month-by-month volume under compound growth and each provider's total spend over `months`. */
export function project(volume, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push(Math.round(volume * g ** m));
  const totals = Object.entries(providers).map(([key, p]) => ({
    key, label: p.label, total: round2(path.reduce((n, x) => n + providerCost(p, x), 0)), endMonthly: providerCost(p, path[path.length - 1]),
  }));
  totals.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endVolume: path[path.length - 1], totals };
}

/** Which provider is cheapest across the volume range, as segments `{from, to, key, label}`. */
export function cheapestSegments(providers = DEFAULT_PROVIDERS, maxVolume = 500000) {
  // At $0 several providers tie; name them all rather than let a label sort pick one.
  const winner = (v) => {
    const rows = compare(v, providers);
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : rows[0].label };
  };
  const grid = [];
  for (let v = 1; v < maxVolume; v = Math.ceil(v * 1.03)) grid.push(v);
  grid.push(maxVolume);
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
  segs.push({ from: start, to: maxVolume, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}".` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) at this monthly delivered volume.`
    : `Cheapest at this monthly delivered volume: ${pick.label}, about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const worst = rows[rows.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive here, ${worst.label}, is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
