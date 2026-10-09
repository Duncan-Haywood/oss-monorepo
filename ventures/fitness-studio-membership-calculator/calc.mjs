// Boutique fitness studio membership economics: what a member is worth over their lifetime, what it costs to win one,
// where the member count settles, and what a point less churn or a few dollars more on price is worth per month.
// Arithmetic on the numbers the user types. Prices, churn and costs are inputs, not benchmarks.

export const SHARED_DEFAULTS = {
  members: "180", price: "149", churn: "6", newPerMonth: "14", adSpend: "1800", cardPct: "2.9", cardFixed: "0.30",
  varCost: "4", fixedMonth: "17500", classesWeek: "42", spots: "16", visitsPerMember: "9", months: "12",
};
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS };

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const pct = (n) => (n * 100).toFixed(1) + "%";

const num = (t) => {
  const s = String(t ?? "").replace(/[$%\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

export function parseInputs(input, warnings) {
  const spec = {
    members: [0, 100000, "Current members"], price: [1, 5000, "Monthly price ($)"], churn: [0.1, 60, "Monthly churn (%)"],
    newPerMonth: [0, 100000, "New members per month"], adSpend: [0, 1e7, "Marketing spend ($/month)"],
    cardPct: [0, 10, "Card fee (%)"], cardFixed: [0, 2, "Card fee per charge ($)"], varCost: [0, 1000, "Variable cost per member ($/month)"],
    fixedMonth: [0, 1e7, "Fixed costs ($/month)"], classesWeek: [0, 1000, "Classes per week"], spots: [1, 500, "Spots per class"],
    visitsPerMember: [0, 60, "Visits per member per month"], months: [3, 36, "Months to project"],
  };
  const v = {};
  for (const [k, [lo, hi, label]] of Object.entries(spec)) {
    const n = num(input[k]);
    if (n === null || Number.isNaN(n) || n < lo || n > hi) { warnings.push(`${label} must be a number from ${lo} to ${hi}.`); v[k] = NaN; } else v[k] = n;
  }
  v.months = Math.round(v.months);
  return v;
}

// Contribution per member-month: price minus card fee and variable cost.
export const perMember = (v, over = {}) => {
  const g = { ...v, ...over };
  return g.price - (g.price * g.cardPct / 100 + g.cardFixed) - g.varCost;
};

// Month-by-month: members churn first, then the month's new members join; profit counts the members present at month end.
export function project(v, over = {}) {
  const g = { ...v, ...over };
  const cm = perMember(v, over);
  const out = [];
  let m = g.members;
  let cum = 0;
  for (let t = 1; t <= g.months; t++) {
    m = m * (1 - g.churn / 100) + g.newPerMonth;
    const revenue = m * g.price;
    const profit = m * cm - g.fixedMonth - g.adSpend;
    cum += profit;
    out.push({ month: t, members: m, revenue, profit, cumulative: cum });
  }
  return out;
}

export function analyze(input) {
  const warnings = [];
  const v = parseInputs(input, warnings);
  if (warnings.length) return { ok: false, warnings };
  const cm = perMember(v);
  const lifetimeMonths = 100 / v.churn;
  const ltv = cm * lifetimeMonths;
  const cac = v.newPerMonth > 0 ? v.adSpend / v.newPerMonth : null;
  const paybackMonths = cac === null ? null : cm > 0 ? cac / cm : null;
  const steady = v.newPerMonth / (v.churn / 100);
  const monthly = project(v);
  const last = monthly[monthly.length - 1];
  const breakEvenMembers = cm > 0 ? Math.ceil((v.fixedMonth + v.adSpend) / cm) : null;
  const capacity = v.classesWeek * (52 / 12) * v.spots;
  const visits = v.members * v.visitsPerMember;
  const utilization = capacity > 0 ? visits / capacity : 0;
  const memberCapacity = v.visitsPerMember > 0 ? Math.floor(capacity / v.visitsPerMember) : null;
  const profitNow = v.members * cm - v.fixedMonth - v.adSpend;
  const steadyProfit = steady * cm - v.fixedMonth - v.adSpend;
  const cmp = (label, over) => {
    const p = project(v, over)[v.months - 1];
    return { label, members: p.members, profit: p.profit, change: p.profit - last.profit };
  };
  const scenarios = [
    cmp("1 point less churn", { churn: Math.max(0.1, v.churn - 1) }),
    cmp("1 point more churn", { churn: v.churn + 1 }),
    cmp("Price up $10", { price: v.price + 10 }),
    cmp("5 more new members a month", { newPerMonth: v.newPerMonth + 5 }),
  ];
  if (cm <= 0) warnings.push("Price does not cover the card fee and variable cost per member, so every member loses money before fixed costs.");
  if (profitNow < 0) warnings.push("At today's member count the studio does not cover fixed costs and marketing.");
  if (utilization > 0.85) warnings.push("Typed visits fill more than 85% of class spots. Peak classes will be full, so adding members may add churn rather than revenue.");
  if (v.members > steady * 1.05) warnings.push("The member count is above where your joins and churn settle, so it will shrink toward the steady state shown unless joins rise.");
  if (cac !== null && ltv > 0 && ltv / cac < 3) warnings.push("Lifetime value is under 3x the cost of winning a member. Many studio owners treat that as a weak return; check the number against what you actually spend.");
  warnings.push("Churn, joins, prices and costs are your numbers, not benchmarks. Real churn varies by month, by how a member joined and by season. Marketing spend is counted as a monthly cost, not capitalised.");
  return { ok: true, warnings, v, cm, lifetimeMonths, ltv, cac, paybackMonths, steady, steadyProfit, profitNow, monthly, last, breakEvenMembers, capacity, utilization, memberCapacity, scenarios };
}

export function toCsv(a) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["Month", "Members", "Revenue", "Profit", "Cumulative profit"];
  const rows = a.monthly.map((r) => [r.month, r.members.toFixed(1), r.revenue.toFixed(2), r.profit.toFixed(2), r.cumulative.toFixed(2)]);
  return [head, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";
}
