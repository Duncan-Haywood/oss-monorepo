// A home battery run hour by hour through a year of the household's own net meter data, billed on a
// rate plan. Pure functions, no I/O.
//
// Net use n (kWh in an hour) is what the meter recorded: use minus solar. A battery behind the meter
// changes only the grid flow g = n + charge drawn - discharge delivered. Each hour is billed
// g x import price when g > 0 and credited -g x export credit when g < 0. Losses: one-way efficiency
// is the square root of the round trip, taken on the way in and on the way out. Stored energy stays
// between the backup reserve and the usable capacity; charge and discharge are each limited to the
// inverter's kW. Every mode starts the data at the reserve.
//
// Modes, the ways real home batteries are set to run:
//  self     "self-powered": charge only from solar the house is not using, discharge whenever the house
//           draws from the grid. Never charges from or exports to the grid.
//  peak     "time-based": charge from spare solar at any hour, discharge only in each day's highest-priced
//           hours. With grid charging allowed, also fills up in the day's cheapest hours when the
//           price gap pays for the losses.
//  optimal  the cheapest possible schedule with perfect knowledge of the year's use and prices: a
//           dynamic programme over stored energy (backward induction on a grid of charge levels). No real
//           controller knows the future, so it is a ceiling on what the battery could save, not a forecast.

/** Validated battery: { kwh usable, kw, roundTrip, reserve (share of kwh), gridCharge, gridExport }. */
export function battery(b) {
  const kwh = Math.max(0, +b.kwh || 0);
  const kw = Math.max(0, +b.kw || 0);
  const roundTrip = Math.min(1, Math.max(0.5, +b.roundTrip || 0.9));
  const reserve = Math.min(0.95, Math.max(0, +b.reserve || 0));
  return { kwh, kw, roundTrip, reserve, gridCharge: !!b.gridCharge, gridExport: !!b.gridExport };
}

const hourCost = (g, pi, pe) => (g > 0 ? g * pi : g * pe);

/** Bill of a grid-flow series: { total, energy, fixed, byMonth: [{month, imported, exported, cost}] } */
export function bill(grid, prices, fixed = 0) {
  const byMonth = prices.months.map((month) => ({ month, imported: 0, exported: 0, cost: 0 }));
  let energy = 0;
  for (let i = 0; i < grid.length; i++) {
    const g = grid[i], m = byMonth[prices.month[i]];
    const c = hourCost(g, prices.imp[i], prices.exp[i]);
    if (g > 0) m.imported += g; else m.exported -= g;
    m.cost += c;
    energy += c;
  }
  for (const m of byMonth) m.cost += fixed;
  return { total: energy + fixed * byMonth.length, energy, fixed: fixed * byMonth.length, byMonth };
}

/** Self-powered mode. Returns { grid, charged (grid-side kWh in), delivered (kWh out) }. */
export function runSelf(net, bat) {
  return runRule(net, bat, () => true, () => false);
}

/**
 * Time-based mode: discharge only in hours whose import price is the day's highest (on days with any price
 * difference; on a flat day it behaves as self-powered), and with grid charging allowed fill from the grid
 * in the day's cheapest hours if top price x round trip > cheapest price.
 */
export function runPeak(net, bat, prices) {
  const n = net.length;
  const peak = new Uint8Array(n), cheap = new Uint8Array(n);
  for (let d = 0; d < n; d += 24) {
    let hi = -Infinity, lo = Infinity;
    const e = Math.min(n, d + 24);
    for (let i = d; i < e; i++) { hi = Math.max(hi, prices.imp[i]); lo = Math.min(lo, prices.imp[i]); }
    const flat = hi - lo < 1e-9;
    for (let i = d; i < e; i++) {
      peak[i] = flat || prices.imp[i] >= hi - 1e-9 ? 1 : 0;
      cheap[i] = !flat && prices.imp[i] <= lo + 1e-9 && hi * bat.roundTrip > lo ? 1 : 0;
    }
  }
  return runRule(net, bat, (i) => peak[i] === 1, (i) => bat.gridCharge && cheap[i] === 1);
}

function runRule(net, bat, mayDischarge, gridFill) {
  const eta = Math.sqrt(bat.roundTrip);
  const lo = bat.kwh * bat.reserve, hi = bat.kwh;
  const grid = new Float64Array(net.length);
  let e = lo, charged = 0, delivered = 0;
  for (let i = 0; i < net.length; i++) {
    const x = net[i];
    let g = x, used = 0;
    if (x < 0) {
      const c = Math.min(-x, bat.kw, (hi - e) / eta);
      e += c * eta; g += c; charged += c; used = c;
    } else if (x > 0 && mayDischarge(i)) {
      const d = Math.min(x, bat.kw, (e - lo) * eta);
      e -= d / eta; g -= d; delivered += d; used = d;
    }
    if (used === 0 || x < 0) {
      if (gridFill(i) && e < hi - 1e-12) {
        const c = Math.min(bat.kw - used, (hi - e) / eta);
        if (c > 0) { e += c * eta; g += c; charged += c; }
      }
    }
    grid[i] = g;
  }
  return { grid, charged, delivered };
}

/**
 * Perfect-foresight schedule by dynamic programming over stored energy. The value-to-go is kept at K+1
 * evenly spaced charge levels between the reserve and full and read between them by linear interpolation
 * (the true value-to-go is convex in stored energy, since the problem is a linear programme, so
 * interpolation never flatters it). Each hour's choice is searched over every level within the inverter's
 * reach plus the points where the hour's cost bends: staying put, storing exactly the spare solar, and
 * covering exactly the house's draw. The forward pass carries the exact stored energy, re-chooses each hour
 * from it and bills the grid flow that results, so the schedule is feasible and its cost exact; the level
 * grid can only leave it a little short of the true optimum (the tests and eval/ measure how little).
 */
export function runOptimal(net, bat, prices, opts = {}) {
  const n = net.length;
  const eta = Math.sqrt(bat.roundTrip);
  const lo = bat.kwh * bat.reserve, span = bat.kwh - lo;
  if (span <= 1e-9 || bat.kw <= 0) return { grid: Float64Array.from(net), charged: 0, delivered: 0, levels: 0 };
  const K = Math.max(2, Math.min(opts.levels || 60, Math.ceil(span / 0.005)));
  const step = span / K;
  const S = K + 1;
  const V = new Float64Array((n + 1) * S); // V[t*S + k]: cheapest cost from hour t on, starting at level k
  const cand = new Float64Array(S + 8);
  // Candidate end states (kWh above the reserve) for hour t from stored energy e; returns how many.
  const candidates = (t, e) => {
    const x = net[t];
    const surplus = Math.max(0, -x), load = Math.max(0, x);
    const upMax = Math.min(span, e + (bat.gridCharge ? bat.kw : Math.min(bat.kw, surplus)) * eta);
    const downMax = Math.max(0, e - (bat.gridExport ? bat.kw : Math.min(bat.kw, load)) / eta);
    let m = 0;
    cand[m++] = e; cand[m++] = upMax; cand[m++] = downMax;
    const absorb = e + Math.min(bat.kw, surplus) * eta, cover = e - Math.min(bat.kw, load) / eta;
    if (absorb <= upMax) cand[m++] = absorb;
    if (cover >= downMax) cand[m++] = cover;
    for (let j = Math.ceil(downMax / step - 1e-9); j * step <= upMax + 1e-9 && j <= K; j++) cand[m++] = j * step;
    return m;
  };
  const hourGrid = (t, e, e2) => {
    const d = e2 - e;
    return d > 0 ? net[t] + d / eta : net[t] + d * eta;
  };
  const interp = (base, e) => {
    const f = Math.min(K, Math.max(0, e / step));
    const k = Math.min(K - 1, Math.floor(f));
    const w = f - k;
    return V[base + k] * (1 - w) + V[base + k + 1] * w;
  };
  const choose = (t, e) => {
    const m = candidates(t, e);
    const pi = prices.imp[t], pe = prices.exp[t], base = (t + 1) * S;
    let best = Infinity, arg = e;
    for (let i = 0; i < m; i++) {
      const e2 = Math.min(span, Math.max(0, cand[i]));
      const g = hourGrid(t, e, e2);
      const v = (g > 0 ? g * pi : g * pe) + interp(base, e2);
      if (v < best - 1e-12) { best = v; arg = e2; }
    }
    return [best, arg];
  };
  for (let t = n - 1; t >= 0; t--) for (let k = 0; k < S; k++) V[t * S + k] = choose(t, k * step)[0];
  const grid = new Float64Array(n);
  let e = 0, charged = 0, delivered = 0;
  for (let t = 0; t < n; t++) {
    const e2 = choose(t, e)[1];
    const d = e2 - e;
    grid[t] = hourGrid(t, e, e2);
    if (d > 0) charged += d / eta; else delivered -= d * eta;
    e = e2;
  }
  return { grid, charged, delivered, levels: K };
}

/** Every mode for one battery on one plan: { none, self, peak, optimal } bills plus throughput. */
export function compare(net, batIn, prices, fixed, opts = {}) {
  const bat = battery(batIn);
  const none = bill(net, prices, fixed);
  const out = { battery: bat, none: { bill: none } };
  for (const [name, run] of [["self", () => runSelf(net, bat)], ["peak", () => runPeak(net, bat, prices)], ["optimal", () => runOptimal(net, bat, prices, opts)]]) {
    const r = run();
    const b = bill(r.grid, prices, fixed);
    out[name] = { bill: b, saving: none.total - b.total, delivered: r.delivered, cycles: bat.kwh > 0 ? r.delivered / bat.kwh : 0 };
  }
  return out;
}

/** Simple payback in years and the saving per year, scaled from the data's length to 365 days. */
export function payback(saving, hours, cost) {
  const perYear = saving * (8760 / hours);
  return { perYear, years: cost > 0 && perYear > 0 ? cost / perYear : null };
}
