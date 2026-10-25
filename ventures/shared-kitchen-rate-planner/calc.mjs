// Shared kitchen rate planner: pure functions, no dependencies, nothing leaves the browser.
//
// Model, stated so the page can say it: the kitchen sells `stations` stations for `hoursPerDay` hours on `daysPerWeek`
// days. Members pay a flat monthly fee for included hours; every other booked hour is sold at the hourly rate.
// Utilization is the share of all station-hours that get used (member hours + hourly hours). Card/platform fees come
// off hourly and membership revenue alike. Costs are monthly and do not move with utilization.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const percent = (x) => `${Math.round(x * 100)}%`;

export const DEFAULTS = {
  rent: 3200, utilities: 650, insurance: 280, cleaning: 400, equipment: 250, staff: 0, other: 150,
  stations: 3, hoursPerDay: 16, daysPerWeek: 7,
  hourlyRate: 28, utilization: 0.45,
  members: 6, memberFee: 450, memberHours: 20,
  feePct: 0.03, targetProfit: 1500,
};

// A negative or non-numeric input has no meaning here (the page already clamps it); treat it as 0 so callers that skip the page, such as agents, get the same answer.
export const nonNegative = (o) => { const r = { ...o }; for (const k of Object.keys(DEFAULTS)) if (!(r[k] >= 0)) r[k] = 0; return r; };

export const monthlyCost = (o) => ["rent", "utilities", "insurance", "cleaning", "equipment", "staff", "other"].reduce((a, k) => a + (o[k] || 0), 0);
export const stationHours = (o) => o.stations * o.hoursPerDay * o.daysPerWeek * 52 / 12;

// Revenue and profit at a given hourly rate and utilization.
export function project(input, over = {}) {
  const o = nonNegative({ ...DEFAULTS, ...input, ...over });
  const capacity = stationHours(o);
  const used = capacity * Math.min(1, Math.max(0, o.utilization));
  const memberHoursUsed = Math.min(used, o.members * o.memberHours);
  const hourlyHours = Math.max(0, used - memberHoursUsed);
  const memberRevenue = o.members * o.memberFee;
  const hourlyRevenue = hourlyHours * o.hourlyRate;
  const gross = memberRevenue + hourlyRevenue;
  const fees = gross * o.feePct;
  const cost = monthlyCost(o);
  const profit = gross - fees - cost;
  return { o, capacity, used, memberHoursUsed, hourlyHours, memberRevenue, hourlyRevenue, gross, fees, cost, profit, perUsedHour: used > 0 ? (gross - fees) / used : 0, costPerUsedHour: used > 0 ? cost / used : Infinity };
}

// Lowest hourly rate that reaches `target` profit at the given utilization (null if members alone already do).
export function rateForProfit(input, target = 0, utilization) {
  const o = { ...DEFAULTS, ...input };
  if (utilization !== undefined) o.utilization = utilization;
  const base = project(o, { hourlyRate: 0, utilization: o.utilization });
  const hrs = base.hourlyHours;
  const net = 1 - o.feePct;
  const need = target - base.profit;
  if (need <= 0) return 0;
  if (hrs <= 0) return null;
  return need / (hrs * net);
}

// Lowest utilization that reaches `target` profit at the current rate (null if even 100% cannot).
export function utilizationForProfit(input, target = 0) {
  const o = { ...DEFAULTS, ...input };
  if (project(o, { utilization: 1 }).profit < target - 1e-9) return null;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (project(o, { utilization: mid }).profit >= target) hi = mid; else lo = mid;
  }
  return hi;
}

// Profit grid: utilizations down, hourly rates across.
export function sensitivity(input, utils = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], rates) {
  const o = { ...DEFAULTS, ...input };
  const r = rates || [-0.2, -0.1, 0, 0.1, 0.2].map((d) => Math.round(o.hourlyRate * (1 + d) * 100) / 100);
  return { rates: r, rows: utils.map((u) => ({ utilization: u, cells: r.map((rate) => project(o, { utilization: u, hourlyRate: rate }).profit) })) };
}

export function analyze(input) {
  const o = nonNegative({ ...DEFAULTS, ...input });
  const now = project(o);
  const be = utilizationForProfit(o, 0);
  const goal = utilizationForProfit(o, o.targetProfit);
  const beRate = rateForProfit(o, 0);
  const goalRate = rateForProfit(o, o.targetProfit);
  const memberEffective = o.memberHours > 0 ? o.memberFee / o.memberHours : 0;
  const findings = [];
  if (now.profit < 0) findings.push({ level: "high", title: `Losing ${money(-now.profit)} a month at ${percent(o.utilization)} utilization`, text: be === null ? "Even a fully booked kitchen at this rate and membership price does not cover costs. Raise rates or cut costs." : `Break-even is ${percent(be)} utilization at ${money2(o.hourlyRate)} an hour${beRate !== null ? `, or ${money2(beRate)} an hour at your current utilization` : ""}.` });
  else if (now.profit < o.targetProfit) findings.push({ level: "medium", title: `Profitable, but ${money(o.targetProfit - now.profit)} short of your ${money(o.targetProfit)} goal`, text: goal === null ? "No utilization reaches the goal at this rate." : `You need ${percent(goal)} utilization at ${money2(o.hourlyRate)}${goalRate !== null ? `, or ${money2(goalRate)} an hour at ${percent(o.utilization)}` : ""}.` });
  else findings.push({ level: "info", title: "Clears your goal", text: `${money(now.profit)} a month at ${percent(o.utilization)} utilization against a ${money(o.targetProfit)} goal.` });
  if (o.members > 0 && o.memberHours > 0) {
    const breakEvenRate = now.costPerUsedHour;
    if (memberEffective < o.hourlyRate * 0.6) findings.push({ level: "medium", title: `Memberships sell hours at ${money2(memberEffective)}, well under your ${money2(o.hourlyRate)} rate`, text: `${o.members} members at ${money(o.memberFee)} for ${o.memberHours} hours is a ${percent(1 - memberEffective / o.hourlyRate)} discount if they use every hour. That is fine for steady, off-peak users; it hurts if they take peak slots you could sell hourly.` });
    if (memberEffective < breakEvenRate && Number.isFinite(breakEvenRate)) findings.push({ level: "high", title: "Member hours are priced below your cost per used hour", text: `Your cost works out to ${money2(breakEvenRate)} per used station-hour at this utilization; a member hour brings ${money2(memberEffective)}. Raise the fee or cut included hours.` });
    if (o.members * o.memberHours > now.capacity * o.utilization) findings.push({ level: "info", title: "Members could use more hours than your utilization assumes", text: `Included hours total ${Math.round(o.members * o.memberHours)} against ${Math.round(now.used)} used station-hours. The plan caps member use at what is used, so hourly revenue is zero.` });
  }
  if (o.feePct > 0.04) findings.push({ level: "info", title: `Fees take ${percent(o.feePct)} of revenue`, text: `That is ${money(now.fees)} a month. Card-fee surcharges or ACH for memberships cut it.` });
  return { now, be, goal, beRate, goalRate, memberEffective, findings };
}
