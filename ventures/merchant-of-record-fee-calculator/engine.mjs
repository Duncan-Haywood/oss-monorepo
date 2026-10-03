// Zero-dependency, deterministic comparison of what payment providers and
// "merchant of record" (MoR) platforms take from a software seller's monthly
// revenue, so an indie founder can see net payout per provider, the effective
// fee rate, and the monthly revenue at which running Stripe yourself (and paying
// for tax filing) beats a MoR that files sales tax and VAT for you. Pure data in,
// report out -- no filesystem or network here.
//
// Arithmetic on revenue, average order value and editable rate cards. Not a quote
// and not tax advice: real fees depend on country, payment method, currency
// conversion, payout fees, disputes, subscription add-ons and negotiated rates,
// and whether a MoR actually removes a given tax obligation is for the seller's
// accountant, not this file.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025 -- processors and MoR platforms change fees, add payout, currency-conversion, dispute and subscription charges, and negotiate at volume; verify each at its own pricing page";

// Editable. `pct` percent of each sale, `fixed` USD per transaction, `intlPct`
// extra percent on the international share of sales, `extraPct` other percent
// add-ons (e.g. a tax-calculation service). `mor` true means the provider is the
// seller of record and files sales tax / VAT itself, so the seller carries no
// separate filing cost; false means the seller pays `selfTaxMonthly` (an input)
// for registrations and filings.
export const DEFAULT_PROVIDERS = {
  stripe: { label: "Stripe (you handle sales tax and VAT)", url: "https://stripe.com/pricing", pct: 2.9, fixed: 0.3, intlPct: 1.5, extraPct: 0, mor: false },
  stripetax: { label: "Stripe + Stripe Tax (you still register and file)", url: "https://stripe.com/tax", pct: 2.9, fixed: 0.3, intlPct: 1.5, extraPct: 0.5, mor: false },
  paddle: { label: "Paddle (merchant of record)", url: "https://www.paddle.com/pricing", pct: 5, fixed: 0.5, intlPct: 0, extraPct: 0, mor: true },
  lemonsqueezy: { label: "Lemon Squeezy (merchant of record)", url: "https://www.lemonsqueezy.com/pricing", pct: 5, fixed: 0.5, intlPct: 1.5, extraPct: 0, mor: true },
  polar: { label: "Polar (merchant of record)", url: "https://polar.sh/resources/pricing", pct: 4, fixed: 0.4, intlPct: 1.5, extraPct: 0, mor: true },
};

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

/** Fees and net for one provider. Inputs: revenue (USD/mo), avgPrice (USD/sale), intlShare (0-100), selfTaxMonthly (USD/mo). */
export function providerCost(p, { revenue, avgPrice, intlShare = 0, selfTaxMonthly = 0 }) {
  const rev = Math.max(0, Number(revenue) || 0);
  const price = Math.max(0.01, Number(avgPrice) || 0.01);
  const txns = rev / price;
  const pctFees = rev * ((p.pct || 0) + (p.intlPct || 0) * clamp(intlShare, 0, 100) / 100 + (p.extraPct || 0)) / 100;
  const fixedFees = rev > 0 ? txns * (p.fixed || 0) : 0;
  const tax = p.mor || rev === 0 ? 0 : Math.max(0, Number(selfTaxMonthly) || 0);
  const fees = round2(pctFees + fixedFees);
  const total = round2(fees + tax);
  return { fees, taxCost: round2(tax), total, net: round2(rev - total), effectivePct: rev > 0 ? round2((total / rev) * 100) : 0 };
}

/** Every provider at the given inputs, lowest total cost first (ties by label). */
export function compare(input, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => ({ key, label: p.label, url: p.url, mor: !!p.mor, ...providerCost(p, input) }));
  rows.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  const best = rows[0].total;
  return rows.map((r) => ({ ...r, annual: round2(r.total * 12), extraVsBest: round2(r.total - best) }));
}

/** Month-by-month revenue under compound growth; each provider's total cost and net over `months`. */
export function project(input, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push(round2(input.revenue * g ** m));
  const totals = Object.entries(providers).map(([key, p]) => {
    let cost = 0;
    let net = 0;
    for (const revenue of path) { const c = providerCost(p, { ...input, revenue }); cost += c.total; net += c.net; }
    return { key, label: p.label, totalCost: round2(cost), totalNet: round2(net) };
  });
  totals.sort((a, b) => a.totalCost - b.totalCost || (a.label < b.label ? -1 : 1));
  return { path, endRevenue: path[path.length - 1], totals };
}

/** Which provider is cheapest across monthly revenue, as segments `{from, to, key, label}` (whole USD). */
export function cheapestSegments(input, providers = DEFAULT_PROVIDERS, maxRevenue = 1000000) {
  const winner = (revenue) => { const r = compare({ ...input, revenue }, providers)[0]; return { key: r.key, label: r.label }; };
  const grid = [];
  for (let v = 10; v < maxRevenue; v = Math.ceil(v * 1.03)) grid.push(v);
  grid.push(maxRevenue);
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
  segs.push({ from: start, to: maxRevenue, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and gate. `maxPct` is the highest acceptable effective fee percent or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { maxPct = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overLimit: false, text: `Unknown provider "${provider}".` };
  const overLimit = maxPct != null && pick.effectivePct > maxPct;
  let text = provider
    ? `${pick.label} takes about ${fmt(pick.total)} a month (${pick.effectivePct}% of revenue), leaving ${fmt(pick.net)}.`
    : `Lowest total cost: ${pick.label}, about ${fmt(pick.total)} a month (${pick.effectivePct}% of revenue), leaving ${fmt(pick.net)}.`;
  const worst = rows[rows.length - 1];
  if (worst.total > pick.total) text += ` The costliest here, ${worst.label}, takes ${fmt(worst.total)}: ${fmt(worst.total - pick.total)} a month more.`;
  if (overLimit) text += ` Over your ${maxPct}% fee ceiling.`;
  return { status: overLimit ? "error" : "ok", errors: overLimit ? 1 : 0, overLimit, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
