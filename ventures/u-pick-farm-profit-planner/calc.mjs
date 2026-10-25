// U-pick farm profit planner: pure functions, no dependencies, nothing leaves the browser.
//
// Model, stated so the page can say it: the farm opens `openDays` days in the season. `rainoutPct` of those days
// are lost to weather. Each open day brings `visitors` paying people. Every visitor pays `admission`, picks
// `pickLbs` pounds at `pickPrice` per pound (the crop costs `cropCostPerLb` to grow, with shrink already included),
// and spends `addonSpend` on food, rides and the shop, which keeps `addonMarginPct` of it. A day costs `laborPerDay`
// to staff. Season costs (rent, insurance, marketing, setup) do not move with attendance. Card fees come off all
// billed revenue.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const percent = (x) => `${Math.round(x * 100)}%`;

export const DEFAULTS = {
  openDays: 24, rainoutPct: 0.2, visitors: 90,
  admission: 5, pickLbs: 5, pickPrice: 2.2, cropCostPerLb: 0.9,
  addonSpend: 7, addonMarginPct: 0.55,
  laborPerDay: 650, rent: 3000, insurance: 2200, marketing: 1500, setup: 2500,
  feePct: 0.03, targetProfit: 8000,
  wetChance: 0.2, wetLossPct: 0.45, // chance the whole season runs wet, and the share of open days lost when it does
};

// A negative or non-numeric input has no meaning here (the page already clamps it); treat it as 0 so callers that skip the page, such as agents, get the same answer.
export const nonNegative = (o) => { const r = { ...o }; for (const k of Object.keys(DEFAULTS)) if (!(r[k] >= 0)) r[k] = 0; return r; };

export const seasonFixed = (o) => ["rent", "insurance", "marketing", "setup"].reduce((a, k) => a + (o[k] || 0), 0);
export const effectiveDays = (o) => o.openDays * (1 - Math.min(1, Math.max(0, o.rainoutPct)));

// Money kept per visitor before labor and season costs, after card fees.
export function perVisitor(o) {
  const gross = o.admission + o.pickLbs * o.pickPrice + o.addonSpend;
  const cost = o.pickLbs * o.cropCostPerLb + o.addonSpend * (1 - o.addonMarginPct);
  return { gross, cost, net: gross * (1 - o.feePct) - cost };
}

export function project(input, over = {}) {
  const o = nonNegative({ ...DEFAULTS, ...input, ...over });
  const days = effectiveDays(o);
  const pv = perVisitor(o);
  const visits = days * o.visitors;
  const gross = visits * pv.gross;
  const fees = gross * o.feePct;
  const variable = visits * pv.cost;
  const labor = days * o.laborPerDay;
  const fixed = seasonFixed(o);
  const profit = gross - fees - variable - labor - fixed;
  return { o, days, visits, gross, fees, variable, labor, fixed, profit, pv, perVisit: visits > 0 ? profit / visits : 0 };
}

// Visitors per open day needed to reach `target` season profit (null if each visitor loses money).
export function visitorsForProfit(input, target = 0) {
  const o = { ...DEFAULTS, ...input };
  const pv = perVisitor(o);
  const days = effectiveDays(o);
  if (days <= 0 || pv.net <= 0) return null;
  return (target + days * o.laborPerDay + seasonFixed(o)) / (days * pv.net);
}

// Admission price per person that reaches `target` profit at the current attendance (never below 0).
export function admissionForProfit(input, target = 0) {
  const o = { ...DEFAULTS, ...input };
  const at0 = project(o, { admission: 0 }).profit;
  const visits = effectiveDays(o) * o.visitors;
  if (visits <= 0) return null;
  const need = target - at0;
  if (need <= 0) return 0;
  return need / (visits * (1 - o.feePct));
}

// Profit by rainout share: the season a single bad month does to you.
export function rainoutRisk(input, shares = [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
  return shares.map((s) => ({ share: s, profit: project(input, { rainoutPct: s }).profit }));
}

// Chance of a losing season. Weather arrives in streaks, so days are not independent: with chance `wetChance` the
// whole season is a wet one and each open day is lost with probability `wetLossPct`; otherwise each is lost with
// probability `rainoutPct`. Exact binomial mixture over the number of days lost, no random sampling. With
// `wetChance` 0 the expected profit equals `project`'s, because profit is linear in open days.
export function seasonOdds(input) {
  const o = { ...DEFAULTS, ...input };
  const n = Math.max(0, Math.round(o.openDays));
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const regimes = [{ w: 1 - clamp(o.wetChance), p: clamp(o.rainoutPct) }, { w: clamp(o.wetChance), p: clamp(o.wetLossPct) }].filter((r) => r.w > 0);
  const probLost = new Array(n + 1).fill(0);
  for (const { w, p } of regimes) {
    for (let k = 0; k <= n; k++) {
      let lc = 0;
      for (let j = 1; j <= k; j++) lc += Math.log(n - k + j) - Math.log(j);
      const lp = lc + (k ? k * Math.log(p) : 0) + (n - k ? (n - k) * Math.log(1 - p) : 0);
      probLost[k] += p === 0 ? (k === 0 ? w : 0) : p === 1 ? (k === n ? w : 0) : w * Math.exp(lp);
    }
  }
  const outcomes = probLost.map((prob, lost) => ({ lost, prob, profit: project(o, { openDays: n - lost, rainoutPct: 0 }).profit })).sort((a, b) => a.profit - b.profit);
  const total = outcomes.reduce((a, x) => a + x.prob, 0);
  let cum = 0;
  const q = {};
  for (const x of outcomes) {
    cum += x.prob / total;
    for (const [k, t] of [["p10", 0.1], ["p50", 0.5], ["p90", 0.9]]) if (q[k] === undefined && cum >= t - 1e-12) q[k] = x.profit;
  }
  return { expected: outcomes.reduce((a, x) => a + x.profit * x.prob, 0) / total, pLoss: outcomes.reduce((a, x) => a + (x.profit < 0 ? x.prob : 0), 0) / total, ...q, outcomes };
}

// Profit grid: visitors per day down, admission across.
export function sensitivity(input, visitors, admissions) {
  const o = { ...DEFAULTS, ...input };
  const v = visitors || [-0.4, -0.2, 0, 0.2, 0.4].map((d) => Math.max(1, Math.round(o.visitors * (1 + d))));
  const a = admissions || [-0.5, 0, 0.5, 1, 1.5].map((d) => Math.max(0, Math.round(o.admission * (1 + d) * 100) / 100));
  return { admissions: a, rows: v.map((n) => ({ visitors: n, cells: a.map((ad) => project(o, { visitors: n, admission: ad }).profit) })) };
}

export function analyze(input) {
  const o = nonNegative({ ...DEFAULTS, ...input });
  const now = project(o);
  const pv = now.pv;
  const be = visitorsForProfit(o, 0);
  const goal = visitorsForProfit(o, o.targetProfit);
  const beAdmission = admissionForProfit(o, 0);
  const goalAdmission = admissionForProfit(o, o.targetProfit);
  const risk = rainoutRisk(o);
  const odds = seasonOdds(o);
  const findings = [];
  if (pv.net <= 0) findings.push({ level: "high", title: "Every visitor loses you money", text: `After card fees, crop cost and food cost each visitor leaves ${money2(pv.net)} before a single worker is paid. More visitors makes it worse. Raise the per-pound price or the admission, or cut what a pound costs you to grow and lose.` });
  else if (now.profit < 0) findings.push({ level: "high", title: `The season loses ${money(-now.profit)} at ${Math.round(o.visitors)} visitors a day`, text: `Each visitor leaves ${money2(pv.net)}. You need about ${be === null ? "more than is possible" : Math.ceil(be)} visitors on every open day to break even, or about ${beAdmission === null ? "a higher" : money2(beAdmission)} admission at today's attendance.` });
  const bad = risk.find((r) => r.share > o.rainoutPct && r.profit < 0);
  if (now.profit >= 0 && bad) findings.push({ level: "medium", title: `A ${percent(bad.share)} washed-out season puts you at ${money(bad.profit)}`, text: `You plan for ${percent(o.rainoutPct)} lost days and make ${money(now.profit)}. Labor and season costs are paid whether or not the gate opens, so the weather decides whether you profit. Consider a weather pass, a rain-date rule or timed tickets that lock in revenue earlier.` });
  const addonKept = o.addonSpend * o.addonMarginPct;
  const pickKept = o.pickLbs * (o.pickPrice - o.cropCostPerLb);
  if (addonKept > pickKept && o.visitors > 0) findings.push({ level: "info", title: "Food and attractions earn more than the crop", text: `Per visitor you keep about ${money2(addonKept)} from food, rides and the shop against ${money2(pickKept)} from picking. That means the crop is the reason people come, and the extras are the business. Protect the picking experience and spend marketing on getting the next visitor in the gate.` });
  else if (o.visitors > 0) findings.push({ level: "info", title: "The crop carries the season", text: `Per visitor you keep about ${money2(pickKept)} from picking against ${money2(addonKept)} from extras. A bad crop year hurts twice, once on pounds and once on the visitors who do not come back. Check what a pound really costs you after drops, birds and unpicked rows.` });
  const laborPerVisitor = o.visitors > 0 ? o.laborPerDay / o.visitors : 0;
  if (o.visitors > 0 && laborPerVisitor > pv.net * 0.6) findings.push({ level: "medium", title: "Labor eats most of each visitor's margin", text: `Staffing a day costs ${money2(laborPerVisitor)} a visitor at this attendance against ${money2(pv.net)} kept per visitor. Slow days at full staffing are where u-pick farms lose money. Plan a lighter crew for weekdays.` });
  if (goal !== null && now.profit < o.targetProfit) findings.push({ level: "info", title: `To make ${money(o.targetProfit)}`, text: `You need about ${Math.ceil(goal)} visitors a day, or ${goalAdmission === null ? "a higher" : money2(goalAdmission)} admission at today's attendance.` });
  return { now, be, goal, beAdmission, goalAdmission, risk, odds, findings };
}
