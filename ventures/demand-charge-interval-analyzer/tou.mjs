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
 * Yearly TOU bill with and without one battery.
 * a: analyze() result (its rate is the facility $/kW and its ratchet applies to facility demand).
 * tariff: {onStart, onEnd, weekdaysOnly, onDemandRate, onPrice, offPrice, facilityRate (optional, overrides a.rate)}; bat: {kw, kwh usable, roundTrip}.
 */
export function touBattery(a, tariff, bat) {
  const h = a.intervalMin / 60;
  const eta = Math.sqrt(bat.roundTrip);
  const rateF = tariff.facilityRate ?? a.rate, rateP = tariff.onDemandRate || 0;
  const per = a.months.map((m) => {
    const load = m.list.map((p) => p.kw);
    const on = onPeakFlags(m.list.map((p) => p.t), tariff);
    const price = on.map((x) => (x ? tariff.onPrice : tariff.offPrice));
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
      if (tariff.onPrice !== tariff.offPrice) {
        const free = energyDP(load, on, price, h, Infinity, Infinity, bat);
        cands.push({ method: "arbitrage only", bill: monthBill(free.grid, on, price, h, rateP, (bat.kwh - free.endKwh) / eta, minPrice) });
      }
    }
    const pick = cands.reduce((x, y) => (score(y.bill) < score(x.bill) - 1e-6 ? y : x));
    return { month: m.month, complete: m.complete, before, after: pick.bill, method: pick.method, caps: pick.caps || null };
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
