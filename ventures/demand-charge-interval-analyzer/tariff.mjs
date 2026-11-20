// A real utility tariff, as OpenEI's Utility Rate Database (URDB) publishes
// it, applied to interval data, with and without a battery. Pure functions.
//
// URDB fields read (https://openei.org/services/doc/rest/util_rates, version 7/8):
//   energyratestructure[period][tier] = {rate, adj?, max?, unit}  ($/kWh)
//   energyweekdayschedule / energyweekendschedule: 12 months x 24 hours of
//     energy period indexes (0-based)
//   demandratestructure, demandweekdayschedule, demandweekendschedule: the
//     same for time-of-use demand ($/kW on the month's highest interval in
//     each period)
//   flatdemandstructure[period][tier] and flatdemandmonths[12]: the facility
//     (all-hours) demand charge, which may change by season
//   demandwindow (minutes the demand is averaged over), fixedmonthlycharge,
//   demandrateunit / flatdemandunit, name, utility, startdate, enddate.
// rate + adj is the price (adj carries riders). Tiers beyond the first, kVA
// units, coincident demand and demandattrs discounts are not modelled; each
// is reported in warnings rather than silently dropped.
//
// Holidays: URDB schedules have no holiday table, so by default every day is a
// weekday or weekend by the calendar. Most utilities bill their holidays on
// the weekend schedule; holidays: "nerc" (the six NERC off-peak holidays) or
// "federal" (the eleven US federal holidays) applies that.

import { greedyCaps, energyDP, jointLPPeriods, yearLP } from "./tou.mjs";

const isGrid = (g, maxIdx) => Array.isArray(g) && g.length === 12 && g.every((r) => Array.isArray(r) && r.length === 24 && r.every((v) => Number.isInteger(v) && v >= 0 && v <= maxIdx));

/** Find the rate object in a URDB API response, a REopt input, or the bare rate. */
export function findRate(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.energyratestructure || obj.demandratestructure || obj.flatdemandstructure) return obj;
  if (Array.isArray(obj.items) && obj.items.length) return findRate(obj.items[0]);
  if (obj.urdb_response) return findRate(obj.urdb_response);
  if (obj.ElectricTariff) return findRate(obj.ElectricTariff);
  return null;
}

function rates(structure, label, warnings) {
  return structure.map((tiers, k) => {
    if (!Array.isArray(tiers) || !tiers.length) throw new Error(`${label} period ${k} has no rate.`);
    if (tiers.length > 1) warnings.push(`${label} period ${k} has ${tiers.length} tiers; the first tier's price is used for all usage.`);
    const t = tiers[0];
    const v = Number(t.rate ?? 0) + Number(t.adj ?? 0);
    if (!Number.isFinite(v)) throw new Error(`${label} period ${k} has a rate that is not a number.`);
    if (t.unit && label === "Energy" && !/^kwh$/i.test(t.unit)) warnings.push(`Energy period ${k} is priced per "${t.unit}", not per kWh; it is read as $/kWh.`);
    return v;
  });
}

/**
 * Parse a URDB rate (object or JSON text). Returns {ok, schedule, warnings} or
 * {ok: false, error}. schedule: {name, utility, energy: {weekday, weekend,
 * prices}, demand: {weekday, weekend, rates} | null, flat: {months, rates} |
 * null, fixedMonthly, demandWindow}.
 */
export function parseUrdb(input) {
  let obj = input;
  try { if (typeof input === "string") obj = JSON.parse(input); } catch (e) { return { ok: false, error: "That is not valid JSON. Paste the rate's JSON from the OpenEI Utility Rate Database." }; }
  const u = findRate(obj);
  if (!u) return { ok: false, error: "No URDB rate found: expected energyratestructure, demandratestructure or flatdemandstructure." };
  const warnings = [];
  try {
    let energy = null;
    if (u.energyratestructure) {
      const prices = rates(u.energyratestructure, "Energy", warnings);
      if (!isGrid(u.energyweekdayschedule, prices.length - 1) || !isGrid(u.energyweekendschedule, prices.length - 1)) throw new Error("The energy schedules must be 12 months x 24 hours of period numbers that exist in energyratestructure.");
      energy = { weekday: u.energyweekdayschedule, weekend: u.energyweekendschedule, prices };
    } else {
      warnings.push("The rate has no energy charge; energy is priced at 0, so a battery earns nothing from shifting energy.");
      const zero = Array.from({ length: 12 }, () => Array(24).fill(0));
      energy = { weekday: zero, weekend: zero, prices: [0] };
    }
    let demand = null;
    if (u.demandratestructure) {
      const r = rates(u.demandratestructure, "Demand", warnings);
      if (!isGrid(u.demandweekdayschedule, r.length - 1) || !isGrid(u.demandweekendschedule, r.length - 1)) throw new Error("The demand schedules must be 12 months x 24 hours of period numbers that exist in demandratestructure.");
      demand = { weekday: u.demandweekdayschedule, weekend: u.demandweekendschedule, rates: r };
      if (r.some((x) => x < 0)) throw new Error("A demand rate is negative.");
    }
    let flat = null;
    if (u.flatdemandstructure) {
      const r = rates(u.flatdemandstructure, "Flat demand", warnings);
      const months = u.flatdemandmonths ?? Array(12).fill(0);
      if (!(Array.isArray(months) && months.length === 12 && months.every((v) => Number.isInteger(v) && v >= 0 && v < r.length))) throw new Error("flatdemandmonths must be 12 period numbers that exist in flatdemandstructure.");
      if (r.some((x) => x < 0)) throw new Error("A flat demand rate is negative.");
      flat = { months, rates: r };
    }
    for (const k of ["demandrateunit", "flatdemandunit"]) if (u[k] && !/^kw$/i.test(u[k])) warnings.push(`${k} is "${u[k]}"; it is read as kW (a kVA charge also depends on power factor, which interval kW data does not carry).`);
    if (u.coincidentratestructure) warnings.push("The rate has a coincident (system-peak) demand charge; it is not modelled.");
    if (Array.isArray(u.demandattrs) && u.demandattrs.length) warnings.push(`The rate lists ${u.demandattrs.length} demand adjustments or discounts in demandattrs (often voltage discounts); they are not applied.`);
    const demandWindow = Number(u.demandwindow) > 0 ? Number(u.demandwindow) : null;
    const fixedMonthly = Number(u.fixedmonthlycharge ?? u.fixedchargefirstmeter ?? 0) || 0;
    const date = (s) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString().slice(0, 10) : null);
    return {
      ok: true, warnings,
      schedule: { name: u.name || "Unnamed rate", utility: u.utility || "", startdate: date(u.startdate), enddate: date(u.enddate), energy, demand, flat, fixedMonthly, demandWindow },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// --- Holidays (dates as "YYYY-MM-DD") ---------------------------------------
const iso = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const nthDow = (y, m, dow, n) => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return iso(y, m, 1 + ((dow - first + 7) % 7) + 7 * (n - 1)); };
const lastDow = (y, m, dow) => { const lastD = new Date(Date.UTC(y, m + 1, 0)); const back = (lastD.getUTCDay() - dow + 7) % 7; return iso(y, m, lastD.getUTCDate() - back); };
function observed(y, m, d, satToFri) {
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
  if (dow === 0) return iso(y, m, d + 1);
  if (dow === 6 && satToFri) return iso(y, m, d - 1);
  return iso(y, m, d);
}

/**
 * Holiday dates for a year. "nerc": New Year's Day, Memorial Day, Independence
 * Day, Labor Day, Thanksgiving, Christmas, a Sunday holiday moved to Monday
 * (NERC's off-peak days). "federal": the eleven US federal holidays (5 U.S.C.
 * 6103), Saturday moved to Friday and Sunday to Monday; Juneteenth from 2021.
 */
export function holidays(year, kind) {
  const y = year;
  if (kind === "nerc") return [observed(y, 0, 1, false), lastDow(y, 4, 1), observed(y, 6, 4, false), nthDow(y, 8, 1, 1), nthDow(y, 10, 4, 4), observed(y, 11, 25, false)];
  if (kind === "federal") {
    const out = [observed(y, 0, 1, true), nthDow(y, 0, 1, 3), nthDow(y, 1, 1, 3), lastDow(y, 4, 1), observed(y, 6, 4, true), nthDow(y, 8, 1, 1), nthDow(y, 9, 1, 2), observed(y, 10, 11, true), nthDow(y, 10, 4, 4), observed(y, 11, 25, true)];
    if (y >= 2021) out.push(observed(y, 5, 19, true));
    return out.sort();
  }
  return [];
}

/**
 * Per reading: energy price, demand period (-1 when the period's rate is 0 or
 * the rate has no TOU demand), and whether it fell on the weekend schedule.
 * times: wall-clock ms (UTC fields, as calc.mjs parses them).
 */
export function expand(times, s, holidayKind = "none") {
  const hol = new Set();
  const years = new Set(times.map((t) => new Date(t).getUTCFullYear()));
  for (const y of years) for (const d of holidays(y, holidayKind)) hol.add(d);
  const price = new Array(times.length), period = new Array(times.length), weekend = new Array(times.length);
  times.forEach((t, i) => {
    const d = new Date(t);
    const m = d.getUTCMonth(), hr = d.getUTCHours(), dow = d.getUTCDay();
    const we = dow === 0 || dow === 6 || hol.has(d.toISOString().slice(0, 10));
    weekend[i] = we;
    price[i] = s.energy.prices[(we ? s.energy.weekend : s.energy.weekday)[m][hr]];
    if (s.demand) {
      const k = (we ? s.demand.weekend : s.demand.weekday)[m][hr];
      period[i] = s.demand.rates[k] > 0 ? k : -1;
    } else period[i] = -1;
  });
  return { price, period, weekend };
}

/** Facility (flat) demand rate for a month index 0-11. */
export const flatRate = (s, m) => (s.flat ? s.flat.rates[s.flat.months[m]] : 0);

/**
 * Average readings into the tariff's demand window when it is longer than the
 * data interval (a 30-minute window on 15-minute data): demand is billed on
 * the average, and the battery is then planned at that resolution. Blocks are
 * aligned to the clock; a block missing readings averages the ones it has.
 * Returns {list, intervalMin}.
 */
export function toWindow(list, intervalMin, windowMin) {
  if (!(windowMin > intervalMin) || windowMin % intervalMin !== 0) return { list, intervalMin };
  const w = windowMin * 60000, out = [];
  let cur = null;
  for (const p of list) {
    const start = Math.floor(p.t / w) * w;
    if (!cur || cur.t !== start) { cur = { t: start, sum: 0, n: 0 }; out.push(cur); }
    cur.sum += p.kw; cur.n++;
  }
  return { list: out.map((b) => ({ t: b.t, kw: b.sum / b.n })), intervalMin: windowMin };
}

/** One month's bill under the tariff for a grid-draw series. */
export function billMonth(grid, period, price, h, s, monthIdx, refillKwh = 0, minPrice = 0) {
  let facKw = 0, energy = 0, kwh = 0;
  const periodKw = s.demand ? s.demand.rates.map(() => 0) : [];
  for (let i = 0; i < grid.length; i++) {
    const g = Math.max(0, grid[i]);
    if (g > facKw) facKw = g;
    if (period[i] >= 0 && g > periodKw[period[i]]) periodKw[period[i]] = g;
    energy += g * h * price[i];
    kwh += g * h;
  }
  energy += refillKwh * minPrice;
  const touDemand = periodKw.reduce((a, kw, k) => a + kw * s.demand.rates[k], 0);
  return { facKw, periodKw, touDemand, energy, kwh, rateF: flatRate(s, monthIdx) };
}

function lowestFacilityCap(load, h, bat) {
  const none = load.map(() => false);
  const peak = Math.max(...load);
  const ok = (c) => greedyCaps(load, none, h, c, Infinity, bat).ok;
  let lo = Math.max(0, peak - bat.kw), hi = peak;
  if (ok(lo)) return lo;
  for (let i = 0; i < 40 && hi - lo > 0.005; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi;
}

/**
 * One month under the tariff: the cheapest of no battery, facility peak
 * shaving (greedy), energy arbitrage only (DP) and the exact joint optimum of
 * facility demand, every TOU demand period and energy (jointLPPeriods).
 */
export function planTariffMonth(mo, h, bat, s) {
  const { load, period, price, monthIdx } = mo;
  const rateF = flatRate(s, monthIdx);
  const eta = Math.sqrt(bat.roundTrip), minPrice = Math.min(...price);
  const score = (b) => rateF * b.facKw + b.touDemand + b.energy;
  const before = billMonth(load, period, price, h, s, monthIdx);
  const cands = [{ method: "none", bill: before }];
  if (bat.kw > 0 && bat.kwh > 0) {
    const refill = (end) => (bat.kwh - end) / eta;
    const none = load.map(() => false);
    if (rateF > 0) {
      const gr = greedyCaps(load, none, h, lowestFacilityCap(load, h, bat), Infinity, bat);
      if (gr.ok) cands.push({ method: "peak shaving", bill: billMonth(gr.grid, period, price, h, s, monthIdx, refill(gr.endKwh), minPrice) });
    }
    if (Math.max(...price) !== minPrice) {
      const dp = energyDP(load, none, price, h, Infinity, Infinity, bat);
      cands.push({ method: "arbitrage only", bill: billMonth(dp.grid, period, price, h, s, monthIdx, refill(dp.endKwh), minPrice) });
    }
    const lp = jointLPPeriods({ load, period, price, rates: s.demand ? s.demand.rates : [] }, h, bat, rateF);
    cands.push({ method: "joint optimum", bill: billMonth(lp.grid, period, price, h, s, monthIdx, refill(lp.endKwh), minPrice) });
  }
  const pick = cands.reduce((x, y) => (score(y.bill) < score(x.bill) - 1e-6 ? y : x));
  return { before, after: pick.bill, method: pick.method };
}

/**
 * Yearly bill under a URDB tariff, with and without one battery.
 * a: analyze() result (its ratchet applies to the flat demand charge; its rate
 * is not used, the tariff's is). opts: {holidays: "none"|"nerc"|"federal",
 * yearPlan: true}. Returns the same shape as touBattery plus fixed charges and
 * per-month TOU demand detail.
 */
export function tariffBattery(a, s, bat, { holidays: holidayKind = "none", yearPlan = true } = {}) {
  const notes = [];
  let intervalMin = a.intervalMin;
  const months = a.months.map((m) => {
    const w = toWindow(m.list, a.intervalMin, s.demandWindow);
    intervalMin = w.intervalMin;
    const times = w.list.map((p) => p.t);
    const { price, period } = expand(times, s, holidayKind);
    return { month: m.month, complete: m.complete, monthIdx: Number(m.month.slice(5, 7)) - 1, load: w.list.map((p) => p.kw), price, period };
  });
  if (intervalMin !== a.intervalMin) notes.push(`Readings averaged into the tariff's ${s.demandWindow}-minute demand window; the battery is planned at that step.`);
  if (s.demandWindow && s.demandWindow < a.intervalMin) notes.push(`The tariff bills demand over ${s.demandWindow} minutes but the readings are ${a.intervalMin} minutes apart, so short peaks inside a reading are not seen: the demand charges here are a lower bound.`);
  const h = intervalMin / 60;
  const per = months.map((mo) => ({ month: mo.month, complete: mo.complete, monthIdx: mo.monthIdx, ...planTariffMonth(mo, h, bat, s) }));
  const ratchetBill = (bills) => bills.map((b, i) => {
    let prior = 0;
    for (let j = Math.max(0, i - 11); j < i; j++) prior = Math.max(prior, bills[j].facKw);
    return Math.max(b.facKw, (a.ratchet / 100) * prior);
  });
  const total = (bills) => {
    const f = ratchetBill(bills);
    let t = 0;
    bills.forEach((b, i) => { if (per[i].complete) t += f[i] * b.rateF + b.touDemand + b.energy; });
    return t;
  };
  let ratchetPlan = null;
  const anyFlat = months.some((mo) => flatRate(s, mo.monthIdx) > 0);
  if (yearPlan && a.ratchet > 0 && anyFlat && bat.kw > 0 && bat.kwh > 0 && per.length > 1) {
    const floorBinds = ratchetBill(per.map((p) => p.after)).some((f, i) => f > per[i].after.facKw + 1e-9);
    if (!floorBinds) ratchetPlan = { skipped: true, used: false, reason: "no ratchet floor binds in the month-by-month plan, so it is already optimal for the period" };
    else {
      const eta = Math.sqrt(bat.roundTrip);
      const yp = yearLP(months.map((mo) => ({ load: mo.load, price: mo.price, period: mo.period, rates: s.demand ? s.demand.rates : [], rateF: flatRate(s, mo.monthIdx) })), h, bat, 0, 0, a.ratchet);
      const bills = yp.plans.map((pl, i) => billMonth(pl.grid, months[i].period, months[i].price, h, s, months[i].monthIdx, (bat.kwh - pl.endKwh) / eta, Math.min(...months[i].price)));
      const monthByMonth = total(per.map((p) => p.after)), whole = total(bills);
      ratchetPlan = { ok: yp.ok, monthByMonth, wholePeriod: whole, used: whole < monthByMonth - 1e-6 };
      if (ratchetPlan.used) per.forEach((p, i) => { p.after = bills[i]; p.method = "whole-period optimum (ratchet)"; });
    }
  }
  const fb = ratchetBill(per.map((p) => p.before)), fa = ratchetBill(per.map((p) => p.after));
  const tot = { before: { facility: 0, touDemand: 0, energy: 0, fixed: 0 }, after: { facility: 0, touDemand: 0, energy: 0, fixed: 0 } };
  let used = 0;
  per.forEach((p, i) => {
    p.before.facBilled = fb[i]; p.after.facBilled = fa[i];
    for (const k of ["before", "after"]) p[k].total = p[k].facBilled * p[k].rateF + p[k].touDemand + p[k].energy + s.fixedMonthly;
    if (!p.complete) return;
    used++;
    for (const k of ["before", "after"]) {
      tot[k].facility += p[k].facBilled * p[k].rateF;
      tot[k].touDemand += p[k].touDemand;
      tot[k].energy += p[k].energy;
      tot[k].fixed += s.fixedMonthly;
    }
  });
  if (!used) return { ok: false, error: "No complete month in the data." };
  const scale = 12 / used;
  for (const k of ["before", "after"]) for (const f of Object.keys(tot[k])) tot[k][f] *= scale;
  const sum = (o) => o.facility + o.touDemand + o.energy + o.fixed;
  if (used < 12) notes.push(`Yearly figures scale ${used} complete month(s) to 12; a tariff with summer and winter seasons is only fairly priced on a full year.`);
  return {
    ok: true, months: per, yearly: tot, yearlyBefore: sum(tot.before), yearlyAfter: sum(tot.after),
    demandSaving: tot.before.facility + tot.before.touDemand - tot.after.facility - tot.after.touDemand,
    energySaving: tot.before.energy - tot.after.energy,
    saving: sum(tot.before) - sum(tot.after), ratchetPlan, intervalMin, notes,
  };
}
