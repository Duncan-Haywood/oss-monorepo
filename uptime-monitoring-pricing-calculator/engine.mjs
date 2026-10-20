// Zero-dependency, deterministic comparison of what uptime-monitoring services charge for a
// number of monitors checked at a given interval, optionally with a public status page. Each
// provider is a short list of plans; the cheapest plan that covers the monitors, the check
// interval and the status page wins, with per-monitor add-ons where the vendor sells them.
// Pure data in, report out -- no filesystem or network here (cli.mjs and index.html supply input).
//
// This is arithmetic on three typed needs and editable plan tables. It is not a quote and not a
// guarantee: the real invoice also depends on SMS/phone alert credits, seats, multi-location
// checks, transaction (browser) checks, annual-billing discounts, taxes and each vendor's
// fair-use terms, none of which this file reproduces.

export const PRICES_AS_OF = "approximate public list prices as best known in 2025, monthly billing, USD -- vendors change plans often; verify each at its own pricing page";

// Editable. A plan covers a need when minIntervalSec <= wanted interval, statusPage is true if one
// is wanted, and monitors <= plan.monitors (or extraMonitorUsd is set, which then buys the excess).
export const DEFAULT_PROVIDERS = {
  uptimerobot: { label: "UptimeRobot", url: "https://uptimerobot.com/pricing/", plans: [
    { name: "Free", usd: 0, monitors: 50, minIntervalSec: 300, statusPage: true },
    { name: "Solo", usd: 7, monitors: 10, minIntervalSec: 60, statusPage: true },
    { name: "Team", usd: 29, monitors: 100, minIntervalSec: 60, statusPage: true },
    { name: "Enterprise", usd: 54, monitors: 200, minIntervalSec: 30, statusPage: true },
  ] },
  betterstack: { label: "Better Stack", url: "https://betterstack.com/pricing", plans: [
    { name: "Free", usd: 0, monitors: 10, minIntervalSec: 180, statusPage: true },
    { name: "Responder (per user) + monitors", usd: 29, monitors: 50, minIntervalSec: 30, statusPage: true, extraMonitorUsd: 0.21 },
  ] },
  hyperping: { label: "Hyperping", url: "https://hyperping.com/pricing", plans: [
    { name: "Free", usd: 0, monitors: 10, minIntervalSec: 180, statusPage: false },
    { name: "Essentials", usd: 24, monitors: 50, minIntervalSec: 30, statusPage: true },
    { name: "Pro", usd: 74, monitors: 150, minIntervalSec: 30, statusPage: true },
  ] },
  pingdom: { label: "Pingdom (SolarWinds)", url: "https://www.pingdom.com/pricing/", plans: [
    { name: "Synthetic 10", usd: 15, monitors: 10, minIntervalSec: 60, statusPage: true },
    { name: "Synthetic 50", usd: 39, monitors: 50, minIntervalSec: 60, statusPage: true },
    { name: "Synthetic 100", usd: 68, monitors: 100, minIntervalSec: 60, statusPage: true },
    { name: "Synthetic 500", usd: 199, monitors: 500, minIntervalSec: 60, statusPage: true },
  ] },
  kuma: { label: "Self-host Uptime Kuma on a small VPS", url: "https://github.com/louislam/uptime-kuma", plans: [
    { name: "4 GB VPS", usd: 6, monitors: 300, minIntervalSec: 20, statusPage: true },
  ] },
};

const round2 = (n) => Math.round(n * 100) / 100;
const nn = (n) => Math.max(0, Number(n) || 0);

/** Cheapest plan of `p` covering the need, or null when none does. */
export function providerCost(p, monitorsIn, intervalSecIn = 300, statusPage = false) {
  const monitors = nn(monitorsIn), interval = nn(intervalSecIn);
  let best = null;
  for (const plan of p.plans) {
    if (nn(plan.minIntervalSec) > interval) continue;
    if (statusPage && !plan.statusPage) continue;
    const extra = Math.max(0, monitors - nn(plan.monitors));
    if (extra > 0 && plan.extraMonitorUsd == null) continue;
    const monthly = round2(nn(plan.usd) + extra * nn(plan.extraMonitorUsd));
    if (!best || monthly < best.monthly) best = { plan: plan.name, monthly };
  }
  return best;
}

/** Every provider priced for the need, cheapest first; providers with no covering plan go last as unavailable. */
export function compare(monitors, intervalSec, statusPage = false, providers = DEFAULT_PROVIDERS) {
  const rows = Object.entries(providers).map(([key, p]) => {
    const c = providerCost(p, monitors, intervalSec, statusPage);
    return { key, label: p.label, url: p.url, plan: c ? c.plan : null, monthly: c ? c.monthly : null, annual: c ? round2(c.monthly * 12) : null };
  });
  rows.sort((a, b) => (a.monthly == null) - (b.monthly == null) || a.monthly - b.monthly || (a.label < b.label ? -1 : 1));
  const cheapest = rows[0].monthly;
  return rows.map((r) => ({ ...r, extraVsCheapest: r.monthly == null || cheapest == null ? null : round2(r.monthly - cheapest) }));
}

/** Month-by-month monitor counts under compound growth and each provider's total over `months` (null if any month is uncovered). */
export function project(monitors, intervalSec, statusPage = false, growthPct = 0, months = 12, providers = DEFAULT_PROVIDERS) {
  const g = 1 + Math.max(-50, Number(growthPct) || 0) / 100;
  const path = [];
  for (let m = 0; m < months; m++) path.push(Math.round(nn(monitors) * g ** m));
  const totals = Object.entries(providers).map(([key, p]) => {
    let total = 0;
    for (const n of path) {
      const c = providerCost(p, n, intervalSec, statusPage);
      if (!c) return { key, label: p.label, total: null };
      total += c.monthly;
    }
    return { key, label: p.label, total: round2(total) };
  });
  totals.sort((a, b) => (a.total == null) - (b.total == null) || a.total - b.total || (a.label < b.label ? -1 : 1));
  return { path, endMonitors: path[path.length - 1], totals };
}

/** Which provider is cheapest as the monitor count grows, as segments `{from, to, key, label}`. */
export function cheapestSegments(intervalSec, statusPage = false, providers = DEFAULT_PROVIDERS, maxMonitors = 1000) {
  const winner = (v) => {
    const rows = compare(v, intervalSec, statusPage, providers).filter((r) => r.monthly != null);
    if (!rows.length) return { key: "none", label: "no listed plan covers this" };
    const tied = rows.filter((r) => r.monthly === rows[0].monthly);
    return { key: tied.map((r) => r.key).join("+"), label: tied.length > 1 ? `${tied.map((r) => r.label).join(", ")} (all ${fmt(rows[0].monthly)})` : `${rows[0].label} (${rows[0].plan})` };
  };
  const segs = [];
  let start = 1, prev = winner(1);
  for (let v = 2; v <= maxMonitors; v++) {
    const w = winner(v);
    if (w.key === prev.key) continue;
    segs.push({ from: start, to: v - 1, key: prev.key, label: prev.label });
    start = v; prev = w;
  }
  segs.push({ from: start, to: maxMonitors, key: prev.key, label: prev.label });
  return segs;
}

/** Summary and budget gate. `budget` is monthly USD or null; applies to `provider` or else the cheapest. */
export function summarize(rows, { budget = null, provider = null } = {}) {
  const pick = provider ? rows.find((r) => r.key === provider) : rows[0];
  if (!pick) return { status: "error", errors: 1, overBudget: false, text: `Unknown provider "${provider}".` };
  if (pick.monthly == null) return { status: "error", errors: 1, overBudget: false, text: `${pick.label} has no listed plan covering these monitors, interval and status-page needs.` };
  const overBudget = budget != null && pick.monthly > budget;
  let text = provider
    ? `${pick.label} (${pick.plan}) is about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year) for this need.`
    : `Cheapest for this need: ${pick.label} (${pick.plan}), about ${fmt(pick.monthly)} per month (${fmt(pick.annual)} per year).`;
  const priced = rows.filter((r) => r.monthly != null);
  const worst = priced[priced.length - 1];
  if (worst.monthly > pick.monthly) text += ` The most expensive covering plan, ${worst.label} (${worst.plan}), is ${fmt(worst.monthly)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(pick.monthly - budget)}.`;
  return { status: overBudget ? "error" : "ok", errors: overBudget ? 1 : 0, overBudget, text };
}

export function fmt(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
