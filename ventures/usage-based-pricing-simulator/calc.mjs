// Usage-based pricing simulator. Pure arithmetic, no I/O, no imports.
//
// A plan is: monthly platform fee, units included in the fee, a price per
// unit above the included amount, and optionally a second (usually lower)
// price per unit once a customer passes a volume breakpoint. Graduated, like
// tax brackets: the lower rate is not applied retroactively.
//
//   bill(u) = base
//           + rate1 * (units above `included`, up to the breakpoint)
//           + rate2 * (units above the breakpoint)
//
// Customer usage is either a lognormal distribution described by its median
// and its 90th-percentile-to-median ratio (evaluated on a fixed grid of
// quantiles, so there is no randomness and results are reproducible), or a
// pasted list of real per-customer monthly usage.

export const money = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US"));
export const money2 = (v) => (v == null || !Number.isFinite(v) ? "n/a" : (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (v) => (v == null || !Number.isFinite(v) ? "n/a" : Math.round(v * 100) + "%");
export const units = (v) => (v == null || !Number.isFinite(v) ? "n/a" : Math.round(v).toLocaleString("en-US"));

const num = (v, d = 0) => {
  if (v === "" || v == null) return d;
  const n = Number(String(v).replace(/[$,%\s]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function normalizePlan(raw, label = "Plan") {
  const p = {
    name: String(raw.name || label).trim() || label,
    base: num(raw.base),
    included: num(raw.included),
    rate1: num(raw.rate1),
    breakpoint: num(raw.breakpoint),
    rate2: raw.rate2 === "" || raw.rate2 == null ? null : num(raw.rate2),
  };
  const errs = [];
  if (!(p.base >= 0)) errs.push(`${p.name}: platform fee must be zero or more.`);
  if (!(p.included >= 0)) errs.push(`${p.name}: included units must be zero or more.`);
  if (!(p.rate1 >= 0)) errs.push(`${p.name}: price per unit must be zero or more.`);
  if (!(p.base > 0 || p.rate1 > 0)) errs.push(`${p.name}: enter a platform fee or a price per unit.`);
  if (!(p.breakpoint >= 0)) errs.push(`${p.name}: volume breakpoint must be zero (none) or more.`);
  if (p.breakpoint > 0) {
    if (p.rate2 == null) errs.push(`${p.name}: enter a price per unit above the breakpoint, or set the breakpoint to 0.`);
    else if (!(p.rate2 >= 0)) errs.push(`${p.name}: price above the breakpoint must be zero or more.`);
    if (p.breakpoint <= p.included) errs.push(`${p.name}: the volume breakpoint must be above the included units.`);
  } else {
    p.rate2 = null;
  }
  return { plan: p, errs };
}

export function bill(plan, u) {
  if (!(u > 0)) return plan.base;
  const over = Math.max(0, u - plan.included);
  if (plan.breakpoint > 0 && u > plan.breakpoint) {
    const tier1 = plan.breakpoint - plan.included;
    return plan.base + plan.rate1 * tier1 + plan.rate2 * (u - plan.breakpoint);
  }
  return plan.base + plan.rate1 * over;
}

// Inverse of the standard normal CDF (Acklam's rational approximation,
// relative error below 1.2e-9), so quantiles need no dependency.
export function normInv(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const GRID = 1000;

// Deterministic lognormal population. p90ratio is the 90th percentile usage
// divided by the median; 1.28155 is the standard-normal 90th percentile.
// Returns { usage: number[] (sorted), weight } where each grid point stands
// for `weight` real customers.
export function lognormalPopulation(customers, median, p90ratio) {
  const sigma = Math.log(p90ratio) / 1.2815515655446004;
  const usage = Array.from({ length: GRID }, (_, i) => median * Math.exp(sigma * normInv((i + 0.5) / GRID)));
  return { usage, weight: customers / GRID };
}

export function parseUsageList(text) {
  const vals = String(text || "").split(/[\s,;]+/).filter(Boolean).map((t) => Number(t.replace(/[$,]/g, "")));
  const bad = vals.filter((v) => !Number.isFinite(v) || v < 0).length;
  const usage = vals.filter((v) => Number.isFinite(v) && v >= 0).sort((x, y) => x - y);
  return { usage, weight: 1, bad };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};

// Weighted metrics of one plan against a population.
function measure(plan, pop, cogs, mult = 1) {
  const bills = pop.usage.map((u) => bill(plan, u * mult));
  const sorted = [...bills].sort((x, y) => x - y);
  const w = pop.weight;
  const revenue = bills.reduce((s, x) => s + x, 0) * w;
  const totalUnits = pop.usage.reduce((s, u) => s + u * mult, 0) * w;
  const cost = totalUnits * cogs;
  const top = Math.ceil(sorted.length * 0.1);
  const topRevenue = sorted.slice(sorted.length - top).reduce((s, x) => s + x, 0) * w;
  const underwater = pop.usage.filter((u, i) => bills[i] < u * mult * cogs).length / pop.usage.length;
  return {
    revenue, cost, margin: revenue - cost,
    marginPct: revenue > 0 ? (revenue - cost) / revenue : null,
    avgBill: revenue / (pop.usage.length * w),
    medianBill: quantile(sorted, 0.5),
    p90Bill: quantile(sorted, 0.9),
    p99Bill: quantile(sorted, 0.99),
    topShare: revenue > 0 ? topRevenue / revenue : 0,
    effectiveRate: totalUnits > 0 ? revenue / totalUnits : null,
    underwater,
  };
}

export function analyze(rawPlans, popInput, cogsRaw) {
  const parsed = rawPlans.map((r, i) => normalizePlan(r, "Plan " + "ABC"[i]));
  const errs = parsed.flatMap((x) => x.errs);
  const cogs = num(cogsRaw);
  if (!(cogs >= 0)) errs.push("Cost per unit must be zero or more.");
  if (parsed.length < 2) errs.push("Enter at least two plans to compare.");
  const pop = popInput;
  if (!pop || !pop.usage || pop.usage.length < 5) errs.push("Enter at least five customer usage values, or use the distribution inputs.");
  if (errs.length) return { error: errs.join(" ") };
  const plans = parsed.map((x) => x.plan);
  const results = plans.map((p) => measure(p, pop, cogs));
  const totalUnits = pop.usage.reduce((s, u) => s + u, 0) * pop.weight;
  const customers = pop.usage.length * pop.weight;

  // Customers who see every plan and take whichever is cheapest for them.
  const pick = pop.usage.map((u) => {
    let bi = 0, bv = Infinity;
    plans.forEach((p, i) => { const v = bill(p, u); if (v < bv) { bv = v; bi = i; } });
    return { bi, bv };
  });
  const sel = {
    revenue: pick.reduce((s, x) => s + x.bv, 0) * pop.weight,
    mix: plans.map((_, i) => pick.filter((x) => x.bi === i).length / pick.length),
  };
  sel.cost = totalUnits * cogs;
  sel.margin = sel.revenue - sel.cost;

  const mults = [0.5, 1, 2, 5];
  const growth = plans.map((p) => mults.map((m) => measure(p, pop, cogs, m).revenue));

  const bestRev = results.reduce((bi, r, i) => (r.revenue > results[bi].revenue ? i : bi), 0);
  const bestMargin = results.reduce((bi, r, i) => (r.margin > results[bi].margin ? i : bi), 0);
  const findings = [];
  const gap = (i, j) => (results[j].revenue > 0 ? results[i].revenue / results[j].revenue - 1 : 0);
  const worst = results.reduce((bi, r, i) => (r.revenue < results[bi].revenue ? i : bi), 0);
  findings.push({ severity: "info", title: `${plans[bestRev].name} earns the most revenue if every customer takes it`, detail: `${money(results[bestRev].revenue)} a month, ${pct(gap(bestRev, worst))} more than ${plans[worst].name} (${money(results[worst].revenue)}) for the same usage. Same customers, same units: only the price shape differs.` });
  if (bestMargin !== bestRev) findings.push({ severity: "medium", title: "The highest-revenue plan is not the highest-margin plan", detail: `${plans[bestRev].name} leads on revenue but ${plans[bestMargin].name} leads on margin (${money(results[bestMargin].margin)} vs ${money(results[bestRev].margin)}) at ${money2(cogs)} cost per unit.` });
  const adverse = results[bestRev].revenue > 0 ? 1 - sel.revenue / results[bestRev].revenue : 0;
  if (adverse > 0.02) findings.push({ severity: "medium", title: "Letting customers choose the cheapest plan costs revenue", detail: `If each customer takes whichever plan is cheapest for them, revenue falls to ${money(sel.revenue)} a month, ${pct(adverse)} below ${plans[bestRev].name} alone. Offering several plans hands the discount to whoever benefits most from it.` });
  else findings.push({ severity: "info", title: "Plan choice barely changes revenue", detail: `If each customer takes their cheapest plan, revenue is ${money(sel.revenue)} a month, within ${pct(Math.max(adverse, 0))} of ${plans[bestRev].name} alone.` });
  plans.forEach((p, i) => {
    const r = results[i];
    if (r.underwater > 0.02) findings.push({ severity: "medium", title: `${p.name} loses money on ${pct(r.underwater)} of customers`, detail: `Their bill is below the ${money2(cogs)} per unit it costs to serve them. That usually means the included units are too generous or the platform fee too low for heavy users.` });
    if (r.topShare > 0.5) findings.push({ severity: "medium", title: `${pct(r.topShare)} of ${p.name} revenue comes from the top 10% of customers`, detail: "Revenue this concentrated is exposed to a few accounts renegotiating, capping usage, or leaving." });
    if (r.medianBill > 0 && r.p99Bill / r.medianBill > 10) findings.push({ severity: "medium", title: `${p.name}: the 99th-percentile bill is ${Math.round(r.p99Bill / r.medianBill)}x the median bill`, detail: `Median ${money(r.medianBill)}, 99th percentile ${money(r.p99Bill)}. Customers who see a bill that far above a typical one tend to ask for a cap, a discount or a different vendor. Consider a volume breakpoint or a committed-use tier.` });
    if (p.base > 0 && r.revenue > 0) {
      const baseShare = (p.base * customers) / r.revenue;
      findings.push({ severity: "info", title: `${p.name}: ${pct(Math.min(baseShare, 1))} of revenue is the fixed platform fee`, detail: baseShare > 0.7 ? "Almost all revenue is predictable, but it barely grows with usage." : baseShare < 0.3 ? "Revenue tracks usage closely: good for upside, volatile if usage drops." : "A balance of predictable and usage-linked revenue." });
    }
  });
  const flat = growth.map((g) => g[3] / g[1]);
  const gi = flat.reduce((bi, v, i) => (v > flat[bi] ? i : bi), 0);
  findings.push({ severity: "info", title: `If usage doubles, ${plans[gi].name} grows revenue the most`, detail: `${pct(flat[gi] - 1)} more revenue at 2x usage, against ${plans.map((p, i) => `${p.name} ${pct(flat[i] - 1)}`).join(", ")}. Usage-heavy plans reward growth; fee-heavy plans do not.` });
  return { plans, results, sel, mults, growth, cogs, customers, totalUnits, bestRev, bestMargin, findings, usage: pop.usage, weight: pop.weight };
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const head = ["metric", ...r.plans.map((p) => q(p.name))].join(",");
  const rows = [
    ["monthly_revenue", ...r.results.map((x) => Math.round(x.revenue))],
    ["monthly_cost", ...r.results.map((x) => Math.round(x.cost))],
    ["monthly_margin", ...r.results.map((x) => Math.round(x.margin))],
    ["average_bill", ...r.results.map((x) => x.avgBill.toFixed(2))],
    ["median_bill", ...r.results.map((x) => x.medianBill.toFixed(2))],
    ["p90_bill", ...r.results.map((x) => x.p90Bill.toFixed(2))],
    ["customers_below_cost_share", ...r.results.map((x) => x.underwater.toFixed(4))],
    ["top10pct_revenue_share", ...r.results.map((x) => x.topShare.toFixed(4))],
    ...r.mults.map((m, i) => [`revenue_at_${m}x_usage`, ...r.growth.map((g) => Math.round(g[i]))]),
  ];
  return [head, ...rows.map((x) => x.join(","))].join("\n") + "\n";
}

export const samplePlans = () => ({
  plans: [
    { name: "Flat + overage", base: 99, included: 10000, rate1: 0.01, breakpoint: 0, rate2: "" },
    { name: "Pure pay-as-you-go", base: 0, included: 0, rate1: 0.006, breakpoint: 0, rate2: "" },
    { name: "Volume discount", base: 49, included: 2000, rate1: 0.012, breakpoint: 50000, rate2: 0.004 },
  ],
  customers: 400, median: 6000, p90ratio: 12, cogs: 0.002,
});
