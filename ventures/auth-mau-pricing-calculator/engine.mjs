// Zero-dependency, deterministic comparison of what hosted authentication
// providers charge per monthly active user (MAU), so a founder can see the
// bill at today's user count, the 12-month spend under a growth rate, and the
// MAU at which the cheapest provider changes. Pure data in, report out -- no
// filesystem or network here (cli.mjs and index.html supply the input).
//
// This is arithmetic on a user count and editable rate cards. It is not a quote
// and not a guarantee: the real invoice depends on the plan, add-ons (SSO and
// SAML connections, SMS MFA, B2B organizations, custom domains), contracts and
// each vendor's own MAU definition, none of which this file reproduces.

export const PRICES_AS_OF = "public list prices read from each vendor's pricing page on 2026-11-08 (Clerk and Cognito corrected 2026-11-11) -- vendors change packaging often; verify each at its own pricing page";

// Editable. For a provider: no charge at or below `freeMau`; above it the paid
// plan applies: `base` USD a month, covering the first `includedMau` users,
// then each further user is priced by `tiers` (`upTo` is the cumulative MAU
// ceiling of the tier, Infinity for the last). `checked` is the date the
// numbers were last compared with the vendor's page, and `note` what the row
// does not model.
export const DEFAULT_PROVIDERS = {
  // Clerk bills monthly retained users (MRU: users who come back after their
  // first day), not every sign-in. Since 2026-02-05: 50,000 MRUs free per app,
  // Pro $25/mo covers those 50,000, then 50,001-100k $0.02, to 1M $0.018, to
  // 10M $0.015, above $0.012 (clerk.com/pricing, read 2026-11-08).
  clerk: { label: "Clerk", url: "https://clerk.com/pricing", checked: "2026-11-08", note: "counts monthly retained users (MRU), not MAU", freeMau: 50000, base: 25, includedMau: 50000, tiers: [{ upTo: 100000, rate: 0.02 }, { upTo: 1000000, rate: 0.018 }, { upTo: 10000000, rate: 0.015 }, { upTo: Infinity, rate: 0.012 }] },
  auth0: { label: "Auth0 (B2C)", url: "https://auth0.com/pricing", checked: "2026-11-08", note: "paid plans are sold in MAU bands; this ladder approximates them", freeMau: 25000, base: 35, includedMau: 500, tiers: [{ upTo: 10000, rate: 0.07 }, { upTo: 50000, rate: 0.05 }, { upTo: Infinity, rate: 0.035 }] },
  // Cognito user pools are priced per feature tier. Essentials, the default
  // for new pools, is a flat $0.015/MAU above 10,000 free a month; Lite
  // ($0.0055 from 10,000) and Plus ($0.02, no free tier) are not modelled
  // (aws.amazon.com/cognito/pricing, read 2026-11-08).
  cognito: { label: "AWS Cognito (Essentials)", url: "https://aws.amazon.com/cognito/pricing/", checked: "2026-11-08", note: "Essentials tier; Lite and Plus differ", freeMau: 10000, base: 0, includedMau: 10000, tiers: [{ upTo: Infinity, rate: 0.015 }] },
  firebase: { label: "Firebase / Identity Platform", url: "https://cloud.google.com/identity-platform/pricing", checked: "2026-11-08", freeMau: 50000, base: 0, includedMau: 50000, tiers: [{ upTo: 100000, rate: 0.0055 }, { upTo: 1000000, rate: 0.0046 }, { upTo: 10000000, rate: 0.0032 }, { upTo: Infinity, rate: 0.0025 }] },
  supabase: { label: "Supabase Auth", url: "https://supabase.com/pricing", checked: "2026-11-08", freeMau: 50000, base: 25, includedMau: 100000, tiers: [{ upTo: Infinity, rate: 0.00325 }] },
  workos: { label: "WorkOS AuthKit", url: "https://workos.com/pricing", checked: "2026-11-08", freeMau: 1000000, base: 0, includedMau: 1000000, tiers: [{ upTo: Infinity, rate: 0.0025 }] },
};

const round2 = (n) => Math.round(n * 100) / 100;

/** Monthly cost of one provider at `mau` monthly active users. */
export function providerCost(p, mauIn) {
  const mau = Math.max(0, Number(mauIn) || 0);
  if (mau <= p.freeMau) return 0;
  let cost = p.base;
  let from = p.includedMau;
  for (const t of p.tiers) {
    if (mau <= from) break;
    const upTo = Math.min(mau, t.upTo);
    if (upTo > from) cost += (upTo - from) * t.rate;
    from = Math.max(from, t.upTo);
  }
  return round2(cost);
}

/** Every provider priced at `mau`, cheapest first (ties by label). */
export function compare(mau, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => ({ key, label: p.label, url: p.url, monthly: providerCost(p, mau), annual: round2(providerCost(p, mau) * 12) }));
  rows.sort((a, b) => a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: round2(r.monthly - cheapest) }));
}

/**
 * Month-by-month MAU under compound growth, and each provider's total spend
 * over `months`. `growthPct` is the monthly growth in MAU.
 */
export function project(mau, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push(Math.round(mau * g ** m));
  const totals = Object.entries(providers).map(([key, p]) => ({
    key, label: p.label, total: round2(path.reduce((n, x) => n + providerCost(p, x), 0)), endMonthly: providerCost(p, path[path.length - 1]),
  }));
  totals.sort((a, b) => a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endMau: path[path.length - 1], totals };
}

/**
 * Which provider is cheapest across the MAU range, as segments
 * `{from, to, key, label}`. Scans a geometric grid then bisects each change.
 */
export function cheapestSegments(providers = DEFAULT_PROVIDERS, maxMau = 2000000) {
  // At $0 several providers tie; name them all rather than let a label sort pick one.
  const winner = (m) => {
    const rows = compare(m, providers);
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : rows[0].label };
  };
  const grid = [];
  for (let m = 100; m < maxMau; m = Math.ceil(m * 1.03)) grid.push(m);
  grid.push(maxMau);
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
  segs.push({ from: start, to: maxMau, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}".` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) at this user count.`
    : tiedText(rows) ?? `Cheapest at this user count: ${pick.label}, about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const worst = rows[rows.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive here, ${worst.label}, is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

// When several providers share the lowest price, name them all instead of
// letting the alphabetical tie-break crown one.
function tiedText(rows) {
  const tied = rows.filter((r) => r.monthly === rows[0].monthly);
  if (tied.length < 2) return null;
  return `Cheapest at this user count, tied at about ${fmt(rows[0].monthly)} per month: ${tied.map((r) => r.label).join(", ")}.`;
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
