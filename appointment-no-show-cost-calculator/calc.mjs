// What no-shows and late cancellations cost a small appointment practice, and which lever pays.
// Pure functions, no dependencies, nothing leaves the browser. Every default is a placeholder,
// not a benchmark: replace each with your own schedule export or bookkeeping.

export const DEFAULTS = {
  slotsPerDay: 14,
  daysPerWeek: 5,
  weeksPerYear: 48,
  revenuePerVisit: 140,
  noShowPct: 7,
  lateCancelPct: 8,
  refillNoShowPct: 10,
  refillLateCancelPct: 50,
  feeAmount: 40,
  feeCollectPct: 40,
  reminderCostPerVisit: 0.2,
  reminderCutPct: 25,
  overbookSlots: 0,
  overflowCost: 60,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const pc = (x) => Math.min(100, nz(x)) / 100;

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
}

// Scheduled appointment slots per year.
export function slotsPerYear(raw) {
  const o = { ...DEFAULTS, ...raw };
  return nz(o.slotsPerDay) * nz(o.daysPerWeek) * nz(o.weeksPerYear);
}

// Annual money picture at the typed rates (no reminders, no overbooking). The fee is charged
// on every no-show and late cancel and collected at the stated rate; a refilled slot earns the
// visit fee again and can also have collected a fee.
export function annual(raw) {
  const o = { ...DEFAULTS, ...raw };
  const N = slotsPerYear(o);
  const rev = nz(o.revenuePerVisit);
  const ns = pc(o.noShowPct);
  const lc = pc(o.lateCancelPct);
  const rNS = pc(o.refillNoShowPct);
  const rLC = pc(o.refillLateCancelPct);
  const feeEach = nz(o.feeAmount) * pc(o.feeCollectPct);
  const noShows = N * ns;
  const lateCancels = N * lc;
  const grossNoShow = noShows * rev;
  const grossLateCancel = lateCancels * rev;
  const refilledRevenue = (noShows * rNS + lateCancels * rLC) * rev;
  const costAfterRefills = grossNoShow + grossLateCancel - refilledRevenue;
  const feesCollected = (noShows + lateCancels) * feeEach;
  return {
    slots: N, noShows, lateCancels,
    grossNoShow, grossLateCancel, grossLost: grossNoShow + grossLateCancel,
    refilledRevenue, costAfterRefills,
    feeEach, feesCollected,
    netCost: costAfterRefills - feesCollected,
    emptySlotPct: (ns + lc) * 100,
  };
}

// Fee (or forfeited deposit) per no-show or late cancel at which collected fees exactly cover
// the cost after refills, at the typed collection rate. Null if nothing is lost or collected.
export function breakevenFee(raw) {
  const o = { ...DEFAULTS, ...raw };
  const a = annual({ ...o, feeAmount: 0 });
  const events = a.noShows + a.lateCancels;
  const collect = pc(o.feeCollectPct);
  if (!(events > 0) || !(collect > 0)) return null;
  return a.costAfterRefills / (events * collect);
}

// What a reminder programme does to the year, with the typed no-show rate read as the rate
// WITHOUT reminders. Reminders are assumed to cut the no-show rate only, by a relative share.
export function reminderEffect(raw) {
  const o = { ...DEFAULTS, ...raw };
  const base = annual(o);
  const after = annual({ ...o, noShowPct: nz(o.noShowPct) * (1 - pc(o.reminderCutPct)) });
  const programCost = base.slots * nz(o.reminderCostPerVisit);
  const benefit = base.netCost - after.netCost;
  return {
    avoidedNoShows: base.noShows - after.noShows,
    benefit,
    programCost,
    net: benefit - programCost,
    breakevenPrice: base.slots > 0 ? benefit / base.slots : null,
  };
}
// Highest price per scheduled visit at which reminders still pay for themselves.
export function breakevenReminderPrice(raw) {
  const r = reminderEffect(raw);
  return r.breakevenPrice === null ? null : Math.max(0, r.breakevenPrice);
}

// Exact binomial pmf of arrivals out of n bookings, each showing with probability p.
export function binomialPmf(n, p) {
  n = Math.max(0, Math.floor(n));
  p = Math.min(1, Math.max(0, p));
  const out = new Array(n + 1).fill(0);
  if (p === 0) { out[0] = 1; return out; }
  if (p === 1) { out[n] = 1; return out; }
  const lf = [0];
  for (let i = 1; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i);
  for (let k = 0; k <= n; k++) {
    out[k] = Math.exp(lf[n] - lf[k] - lf[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }
  return out;
}

// One day with `extra` bookings beyond capacity. Anyone who does not arrive (no-show or late
// cancel) leaves their slot empty; no refills are assumed here, which is conservative.
export function overbookingDay(raw, extra) {
  const o = { ...DEFAULTS, ...raw };
  const cap = Math.floor(nz(o.slotsPerDay));
  const booked = cap + Math.max(0, Math.floor(extra));
  const p = 1 - Math.min(1, pc(o.noShowPct) + pc(o.lateCancelPct));
  const pmf = binomialPmf(booked, p);
  let seen = 0, over = 0, lost = 0, pOver = 0;
  pmf.forEach((q, s) => {
    seen += q * Math.min(s, cap);
    over += q * Math.max(s - cap, 0);
    lost += q * Math.max(cap - s, 0);
    if (s > cap) pOver += q;
  });
  const daily = nz(o.revenuePerVisit) * seen - nz(o.overflowCost) * over;
  return { extra: booked - cap, booked, showProb: p, expectedSeen: seen, expectedOverflow: over, expectedLostSlots: lost, probOverflow: pOver, dailyValue: daily };
}

// Level of overbooking with the highest expected daily value; ties go to the smaller level.
export function bestOverbooking(raw, maxExtra) {
  const o = { ...DEFAULTS, ...raw };
  const cap = Math.floor(nz(o.slotsPerDay));
  const top = Number.isFinite(maxExtra) ? maxExtra : Math.min(20, Math.max(2, cap));
  const days = nz(o.daysPerWeek) * nz(o.weeksPerYear);
  const rows = [];
  for (let k = 0; k <= top; k++) rows.push(overbookingDay(o, k));
  let best = rows[0];
  for (const r of rows) if (r.dailyValue > best.dailyValue + 1e-9) best = r;
  const current = overbookingDay(o, nz(o.overbookSlots));
  return {
    rows, best, current, days,
    annualGainVsNone: (best.dailyValue - rows[0].dailyValue) * days,
    annualGainVsCurrent: (best.dailyValue - current.dailyValue) * days,
  };
}

// Annual cost after refills and fees over a grid of no-show rates and fee amounts.
export function sensitivity(raw, rateMults = [0.5, 0.75, 1, 1.25, 1.5], feeLevels) {
  const o = { ...DEFAULTS, ...raw };
  const fees = feeLevels || (nz(o.feeAmount) > 0
    ? [0, 0.5, 1, 1.5, 2].map((m) => nz(o.feeAmount) * m)
    : [0, 0.1, 0.2, 0.3, 0.5].map((m) => nz(o.revenuePerVisit) * m));
  return rateMults.map((m) => ({
    noShowPct: nz(o.noShowPct) * m,
    cells: fees.map((f) => ({ fee: f, netCost: annual({ ...o, noShowPct: nz(o.noShowPct) * m, feeAmount: f }).netCost })),
  }));
}
