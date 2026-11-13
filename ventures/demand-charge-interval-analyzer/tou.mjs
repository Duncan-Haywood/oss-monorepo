// Time-of-use bill and battery dispatch for a demand-charge meter. Pure functions.
//
// Tariff modelled: a facility demand charge on the month's highest interval
// (with the ratchet from analyze()), an on-peak demand charge on the highest
// interval inside an on-peak window, and on-peak / off-peak energy prices.
//
// Dispatch, per month, in two steps:
//  1. Demand. For caps (Cf on every interval, Cp on on-peak intervals) the
//     greedy controller (discharge above the interval's cap, recharge as fast
//     as the cap and inverter allow) is exact for feasibility, as in
//     battery.mjs: it keeps the battery as full as possible at every step and
//     the only constraints are "enough stored energy". So for each Cf on a grid
//     the lowest holdable Cp is found by bisection, and the pair with the
//     lowest demand cost (rateF*Cf + rateP*Cp) is kept, refined on a finer grid.
//  2. Energy. Within those caps, a dynamic programme over discretised state of
//     charge minimises the energy bill (charge cheap, discharge dear), with no
//     export, the inverter limit, one-way efficiency sqrt(round trip), a full
//     battery at the month's start and a terminal charge for refilling it at
//     the cheapest price (so the month cannot "spend" its starting charge).
//     Interval excess over a cap is penalised heavily, not forbidden, because
//     discretisation can make an exactly-tight cap unreachable; the bill is
//     then computed from the dispatch the programme actually chose.
// Each month keeps the cheapest of: no battery, greedy at the caps, the
// programme at the caps, and the programme with no caps (energy only). So the
// result is never worse than the peak-shaving-only answer. It is not a joint
// optimum of demand and energy (step 1 then step 2), and it knows the month's
// load in advance: an upper bound on what a real controller achieves.

import { solveBandedLP } from "./lp.mjs";

const PENALTY = 1000; // $ per kW-interval over a cap inside the programme

/** On-peak flag for each reading. tariff: {onStart, onEnd (hours, end exclusive), weekdaysOnly}. Wall-clock (UTC fields). */
export function onPeakFlags(times, tariff) {
  const { onStart, onEnd, weekdaysOnly } = tariff;
  return times.map((t) => {
    const d = new Date(t);
    const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
    const dow = d.getUTCDay();
    if (weekdaysOnly && (dow === 0 || dow === 6)) return false;
    return onStart <= onEnd ? hr >= onStart && hr < onEnd : hr >= onStart || hr < onEnd;
  });
}

/** Greedy dispatch under per-interval caps. Returns {ok, grid[], endKwh}. */
export function greedyCaps(load, on, h, capF, capP, bat) {
  const eta = Math.sqrt(bat.roundTrip);
  let soc = bat.kwh;
  const grid = new Array(load.length);
  for (let i = 0; i < load.length; i++) {
    const cap = on[i] ? Math.min(capF, capP) : capF;
    const l = load[i];
    if (l > cap) {
      const need = l - cap;
      if (need > bat.kw + 1e-9) return { ok: false };
      const fromBat = (need * h) / eta;
      if (fromBat > soc + 1e-9) return { ok: false };
      soc = Math.max(0, soc - fromBat);
      grid[i] = cap;
    } else {
      const p = soc < bat.kwh - 1e-9 ? Math.min(bat.kw, cap - l, (bat.kwh - soc) / h / eta) : 0;
      soc += p * h * eta;
      grid[i] = l + p;
    }
  }
  return { ok: true, grid, endKwh: soc };
}

const feasible = (load, on, h, cf, cp, bat) => greedyCaps(load, on, h, cf, cp, bat).ok;

function bisect(lo, hi, ok) {
  if (ok(lo)) return lo;
  if (!ok(hi)) return null;
  for (let i = 0; i < 40 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

/** Caps (Cf, Cp) with the lowest demand cost the battery can hold in this month. */
export function bestCaps(load, on, h, bat, rateF, rateP) {
  const peak = Math.max(...load);
  let onMax = 0;
  for (let i = 0; i < load.length; i++) if (on[i] && load[i] > onMax) onMax = load[i];
  const lowF = bisect(Math.max(0, peak - bat.kw), peak, (c) => feasible(load, on, h, c, Infinity, bat));
  const cpFor = (cf) => (rateP > 0 && onMax > 0
    ? bisect(Math.max(0, Math.min(cf, onMax) - bat.kw), Math.min(cf, onMax), (c) => feasible(load, on, h, cf, c, bat))
    : Math.min(cf, onMax));
  const cost = (cf, cp) => rateF * cf + rateP * cp;
  let best = { capF: peak, capP: onMax, cost: cost(peak, onMax) };
  const scan = (a, b, n) => {
    for (let k = 0; k <= n; k++) {
      const cf = a + ((b - a) * k) / n;
      const cp = cpFor(cf);
      if (cp == null) continue;
      const c = cost(cf, cp);
      if (c < best.cost - 1e-9) best = { capF: cf, capP: cp, cost: c };
    }
  };
  scan(lowF, peak, 32);
  const step = (peak - lowF) / 32;
  scan(Math.max(lowF, best.capF - step), Math.min(peak, best.capF + step), 16);
  return best;
}

/**
 * Energy-cost dynamic programme within caps. price[i] $/kWh; caps may be Infinity.
 * Returns {grid[], endKwh}. Steps of stored energy are sized so one step is
 * about a tenth of the inverter's rating per interval.
 */
export function energyDP(load, on, price, h, capF, capP, bat, stepsPerKw = 10) {
  const eta = Math.sqrt(bat.roundTrip);
  const n = load.length;
  const fullInterval = bat.kw * h * eta; // stored kWh one interval of charging adds
  const N = Math.max(8, Math.min(400, Math.round((bat.kwh / fullInterval) * stepsPerKw)));
  const dE = bat.kwh / N;
  const up = Math.floor((bat.kw * h * eta) / dE + 1e-9);
  const down = Math.floor((bat.kw * h) / eta / dE + 1e-9);
  const minPrice = Math.min(...price);
  let V = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) V[i] = ((N - i) * dE / eta) * minPrice; // refill to full at the cheapest price
  const choice = new Int16Array(n * (N + 1));
  let next = new Float64Array(N + 1);
  for (let t = n - 1; t >= 0; t--) {
    const cap = on[t] ? Math.min(capF, capP) : capF;
    const l = load[t], pr = price[t];
    for (let i = 0; i <= N; i++) {
      let bestV = Infinity, bestJ = i;
      const jlo = Math.max(0, i - down), jhi = Math.min(N, i + up);
      for (let j = jlo; j <= jhi; j++) {
        const d = (j - i) * dE;
        const g = l + (d > 0 ? d / eta / h : (d * eta) / h);
        if (g < -1e-9) continue; // no export
        const ex = g > cap ? g - cap : 0;
        const v = g * h * pr + ex * PENALTY + V[j];
        if (v < bestV) { bestV = v; bestJ = j; }
      }
      next[i] = bestV;
      choice[t * (N + 1) + i] = bestJ;
    }
    const tmp = V; V = next; next = tmp;
  }
  const grid = new Array(n);
  let i = N;
  for (let t = 0; t < n; t++) {
    const j = choice[t * (N + 1) + i];
    const d = (j - i) * dE;
    grid[t] = load[t] + (d > 0 ? d / eta / h : (d * eta) / h);
    i = j;
  }
  return { grid, endKwh: i * dE };
}

/**
 * Demand and energy cost minimised together, exactly, as one linear programme
 * (lp.mjs). Variables per interval t: grid-side charge c_t in [0, kW],
 * delivered discharge d_t in [0, kW], stored energy s_t in [0, kWh] after t,
 * grid draw g_t >= 0 with g_t = load_t + c_t - d_t (so no export), slacks to
 * the caps; plus the facility cap Cf (every interval) and the on-peak cap Cp
 * (on-peak intervals), priced at rateF and rateP. s_t = s_{t-1} + h(eta c_t -
 * d_t / eta), starting full; the month's end pays to refill at the cheapest
 * price, as energyDP does. Returns {ok, grid[], endKwh, iterations} with the
 * grid recomputed from a forward simulation of (c, d) clipped to the battery's
 * limits, so the dispatch billed is always physically valid.
 */
export function jointLP(load, on, price, h, bat, rateF, rateP) {
  const n = load.length, eta = Math.sqrt(bat.roundTrip), E = bat.kwh, P = bat.kw;
  const minPrice = Math.min(...price);
  const useF = rateF > 0, useP = rateP > 0 && on.some(Boolean);
  // rows per interval, in time order: storage, balance, [facility cap], [on-peak cap]
  const rowOf = [];
  let nRows = 0;
  for (let t = 0; t < n; t++) {
    const r = { st: nRows++, bl: nRows++ };
    if (useF) r.cf = nRows++;
    if (useP && on[t]) r.cp = nRows++;
    rowOf.push(r);
  }
  const b = new Float64Array(nRows);
  const cols = [];
  const idx = { c: [], d: [], s: [], g: [] };
  const fRows = [], fVals = [], pRows = [], pVals = [];
  for (let t = 0; t < n; t++) {
    const R = rowOf[t];
    b[R.st] = t === 0 ? E : 0;
    b[R.bl] = load[t];
    idx.c.push(cols.length); cols.push({ rows: [R.st, R.bl], vals: [-h * eta, -1], cost: 0, upper: P });
    idx.d.push(cols.length); cols.push({ rows: [R.st, R.bl], vals: [h / eta, 1], cost: 0, upper: P });
    const sRows = [R.st], sVals = [1];
    if (t + 1 < n) { sRows.push(rowOf[t + 1].st); sVals.push(-1); }
    idx.s.push(cols.length); cols.push({ rows: sRows, vals: sVals, cost: t === n - 1 ? -minPrice / eta : 0, upper: E });
    const gRows = [R.bl], gVals = [1];
    if (R.cf !== undefined) { gRows.push(R.cf); gVals.push(1); }
    if (R.cp !== undefined) { gRows.push(R.cp); gVals.push(1); }
    idx.g.push(cols.length); cols.push({ rows: gRows, vals: gVals, cost: h * price[t], upper: Infinity });
    if (R.cf !== undefined) { cols.push({ rows: [R.cf], vals: [1], cost: 0, upper: Infinity }); fRows.push(R.cf); fVals.push(-1); }
    if (R.cp !== undefined) { cols.push({ rows: [R.cp], vals: [1], cost: 0, upper: Infinity }); pRows.push(R.cp); pVals.push(-1); }
  }
  if (useF) cols.push({ rows: fRows, vals: fVals, cost: rateF, upper: Infinity, dense: true });
  if (useP) cols.push({ rows: pRows, vals: pVals, cost: rateP, upper: Infinity, dense: true });
  const sol = solveBandedLP({ nRows, b, cols });
  // Forward simulation: net the interval's charge and discharge, clip to the inverter and the stored energy.
  const grid = new Array(n);
  let soc = E;
  for (let t = 0; t < n; t++) {
    const net = sol.x[idx.c[t]] - sol.x[idx.d[t]]; // + charging (grid side), - discharging (delivered)
    let p;
    if (net >= 0) p = Math.min(net, P, (E - soc) / h / eta);
    else p = -Math.min(-net, P, load[t], (soc * eta) / h);
    soc += p >= 0 ? p * h * eta : (p * h) / eta;
    soc = Math.min(E, Math.max(0, soc));
    grid[t] = load[t] + p;
  }
  return { ok: sol.ok, grid, endKwh: soc, iterations: sol.iterations };
}

/** Bill pieces for one month's grid draw (facility peak before ratchet). */
export function monthBill(grid, on, price, h, rateP, refillKwh = 0, minPrice = 0) {
  let facKw = 0, onKw = 0, energy = 0, onKwh = 0, offKwh = 0;
  for (let i = 0; i < grid.length; i++) {
    const g = Math.max(0, grid[i]);
    if (g > facKw) facKw = g;
    if (on[i]) { if (g > onKw) onKw = g; onKwh += g * h; } else offKwh += g * h;
    energy += g * h * price[i];
  }
  energy += refillKwh * minPrice;
  return { facKw, onKw, onDemand: onKw * rateP, energy, onKwh, offKwh };
}

/**
 * One month's dispatch: the cheapest of no battery, greedy peak shaving at the
 * best caps, the programme at those caps, and the programme with no caps.
 * Score = rateF x facility kW (before ratchet) + on-peak demand + energy.
 * Since 2026-11-13 also the exact joint optimum (jointLP), which wins all but
 * ties; {joint: false} gives the older two-step answer (check/joint_gap.py).
 */
export function planMonth(load, on, price, h, bat, rateF, rateP, { joint = true } = {}) {
  const eta = Math.sqrt(bat.roundTrip);
  const minPrice = Math.min(...price);
  const before = monthBill(load, on, price, h, rateP);
  const score = (b) => rateF * b.facKw + b.onDemand + b.energy;
  const cands = [{ method: "none", bill: before }];
  if (bat.kw > 0 && bat.kwh > 0) {
    const caps = bestCaps(load, on, h, bat, rateF, rateP);
    const gr = greedyCaps(load, on, h, caps.capF, caps.capP, bat);
    if (gr.ok) cands.push({ method: "peak shaving", bill: monthBill(gr.grid, on, price, h, rateP, (bat.kwh - gr.endKwh) / eta, minPrice), caps });
    const dp = energyDP(load, on, price, h, caps.capF, caps.capP, bat);
    cands.push({ method: "peak shaving + arbitrage", bill: monthBill(dp.grid, on, price, h, rateP, (bat.kwh - dp.endKwh) / eta, minPrice), caps });
    // Billed from the simulated dispatch, so it is safe to offer even if the
    // solver stopped short of its tolerance; the cheapest candidate wins.
    const lp = joint ? jointLP(load, on, price, h, bat, rateF, rateP) : null;
    if (lp) cands.push({ method: "joint optimum", bill: monthBill(lp.grid, on, price, h, rateP, (bat.kwh - lp.endKwh) / eta, minPrice) });
    if (Math.max(...price) !== minPrice) {
      const free = energyDP(load, on, price, h, Infinity, Infinity, bat);
      cands.push({ method: "arbitrage only", bill: monthBill(free.grid, on, price, h, rateP, (bat.kwh - free.endKwh) / eta, minPrice) });
    }
  }
  const pick = cands.reduce((x, y) => (score(y.bill) < score(x.bill) - 1e-6 ? y : x));
  return { before, after: pick.bill, method: pick.method, caps: pick.caps || null, score: score(pick.bill), scoreBefore: score(before) };
}

/**
 * Yearly TOU bill with and without one battery.
 * a: analyze() result (its rate is the facility $/kW and its ratchet applies to facility demand).
 * tariff: {onStart, onEnd, weekdaysOnly, onDemandRate, onPrice, offPrice, facilityRate (optional, overrides a.rate)}; bat: {kw, kwh usable, roundTrip}.
 */
export function touBattery(a, tariff, bat) {
  const h = a.intervalMin / 60;
  const rateF = tariff.facilityRate ?? a.rate, rateP = tariff.onDemandRate || 0;
  const per = a.months.map((m) => {
    const load = m.list.map((p) => p.kw);
    const on = onPeakFlags(m.list.map((p) => p.t), tariff);
    const price = on.map((x) => (x ? tariff.onPrice : tariff.offPrice));
    const plan = planMonth(load, on, price, h, bat, rateF, rateP);
    return { month: m.month, complete: m.complete, ...plan };
  });
  const ratchetBill = (key) => per.map((p, i) => {
    let prior = 0;
    for (let j = Math.max(0, i - 11); j < i; j++) prior = Math.max(prior, per[j][key].facKw);
    return Math.max(per[i][key].facKw, (a.ratchet / 100) * prior);
  });
  const fb = ratchetBill("before"), fa = ratchetBill("after");
  const tot = { before: { facility: 0, onDemand: 0, energy: 0 }, after: { facility: 0, onDemand: 0, energy: 0 } };
  per.forEach((p, i) => {
    p.before.facBilled = fb[i]; p.after.facBilled = fa[i];
    p.before.total = fb[i] * rateF + p.before.onDemand + p.before.energy;
    p.after.total = fa[i] * rateF + p.after.onDemand + p.after.energy;
    if (!p.complete) return;
    for (const k of ["before", "after"]) {
      tot[k].facility += p[k].facBilled * rateF;
      tot[k].onDemand += p[k].onDemand;
      tot[k].energy += p[k].energy;
    }
  });
  const scale = 12 / a.monthsUsed;
  for (const k of ["before", "after"]) for (const f of Object.keys(tot[k])) tot[k][f] *= scale;
  const sum = (o) => o.facility + o.onDemand + o.energy;
  const demandSaving = tot.before.facility + tot.before.onDemand - tot.after.facility - tot.after.onDemand;
  const energySaving = tot.before.energy - tot.after.energy;
  return { months: per, yearly: tot, yearlyBefore: sum(tot.before), yearlyAfter: sum(tot.after), demandSaving, energySaving, saving: sum(tot.before) - sum(tot.after) };
}
