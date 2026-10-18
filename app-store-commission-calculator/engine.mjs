// Zero-dependency, deterministic comparison of what the Apple App Store, Google
// Play and web-checkout options (Stripe, Paddle) take from a mobile app
// developer's monthly revenue, so an indie developer can see net payout per
// channel, the effective fee rate, and the monthly revenue at which web checkout
// (and paying for tax filing yourself) beats the store commission. Pure data in,
// report out -- no filesystem or network here.
//
// Arithmetic on revenue, average order value and editable rate cards. Not a quote
// and not tax advice: real fees depend on country, payment method, currency
// conversion, payout fees, disputes, subscription add-ons and negotiated rates,
// whether a store lets your app sell through web checkout at all depends on the
// country, the app category and the current store rules, and whether a channel
// removes a given tax obligation is for the seller's accountant, not this file.

export const PRICES_AS_OF = "approximate public list rates as best known in 2025 -- Apple and Google change commission tiers, program eligibility and link-out rules, and processors change fees; verify each at its own pricing page and, for web checkout, check the store rules for your country and app category";

// Editable. `pct` percent of each sale, `fixed` USD per transaction, `intlPct`
// extra percent on the international share of sales, `extraPct` other percent
// add-ons (e.g. a tax-calculation service). `mor` true means the channel is the
// seller of record and files sales tax / VAT itself (the app stores do), so the
// seller carries no separate filing cost; false means the seller pays
// `selfTaxMonthly` (an input) for registrations and filings.
export const DEFAULT_PROVIDERS = {
  apple30: { label: "Apple in-app purchase, standard 30%", url: "https://developer.apple.com/app-store/small-business-program/", pct: 30, fixed: 0, intlPct: 0, extraPct: 0, mor: true },
  apple15: { label: "Apple in-app purchase, Small Business Program 15%", url: "https://developer.apple.com/app-store/small-business-program/", pct: 15, fixed: 0, intlPct: 0, extraPct: 0, mor: true },
  google15: { label: "Google Play billing, 15% tier", url: "https://support.google.com/googleplay/android-developer/answer/112622", pct: 15, fixed: 0, intlPct: 0, extraPct: 0, mor: true },
  google30: { label: "Google Play billing, 30% tier", url: "https://support.google.com/googleplay/android-developer/answer/112622", pct: 30, fixed: 0, intlPct: 0, extraPct: 0, mor: true },
  stripe: { label: "Web checkout via Stripe (you handle sales tax and VAT)", url: "https://stripe.com/pricing", pct: 2.9, fixed: 0.3, intlPct: 1.5, extraPct: 0, mor: false },
  stripetax: { label: "Web checkout via Stripe + Stripe Tax (you still register and file)", url: "https://stripe.com/tax", pct: 2.9, fixed: 0.3, intlPct: 1.5, extraPct: 0.5, mor: false },
  paddle: { label: "Web checkout via Paddle (merchant of record)", url: "https://www.paddle.com/pricing", pct: 5, fixed: 0.5, intlPct: 0, extraPct: 0, mor: true },
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
