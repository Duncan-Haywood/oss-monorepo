// Dynamic lot sizing: when to order and how much, given a demand forecast per period,
// a fixed cost per order and a holding cost per unit per period.
//
// Wagner-Whitin is the exact optimum (Wagner, H. M. and Whitin, T. M., 1958, "Dynamic version of
// the economic lot size model", Management Science 5(1), 89-96). Silver-Meal (Silver, E. A. and
// Meal, H. C., 1973, Production and Inventory Management 14(2), 64-74), the period order quantity
// (EOQ turned into a fixed number of periods) and lot-for-lot are the common rules of thumb it is
// compared with. All four share the model below so their costs are comparable:
//
//   - demand d[t] >= 0 for periods t = 0..n-1, known (here: the forecast);
//   - an order arriving at the start of period t costs `setup` however large it is;
//   - every unit still on hand at the end of a period costs `hold`;
//   - no shortages, no capacity, no quantity discounts, no pack sizes.
//
// Original code (MIT). Plans are lists of { period, qty } where an order in `period` covers that
// period's demand and every later one up to the next order.

const EPS = 1e-9;

/** Holding cost of ordering, at period i, the demand of periods i..j. */
function holdCost(d, i, j, hold) {
  let c = 0;
  for (let t = i + 1; t <= j; t++) c += (t - i) * d[t];
  return c * hold;
}

function check(d, setup, hold) {
  if (!Array.isArray(d) || d.some((x) => !(Number.isFinite(x) && x >= 0))) throw new Error("demand must be an array of non-negative numbers");
  if (!(Number.isFinite(setup) && setup >= 0)) throw new Error("order cost must be a non-negative number");
  if (!(Number.isFinite(hold) && hold >= 0)) throw new Error("holding cost must be a non-negative number");
}

/** Orders from a set of order periods: each covers demand until the next order period. */
export function ordersFrom(d, periods) {
  const ps = [...periods].sort((a, b) => a - b);
  return ps.map((p, k) => {
    const end = k + 1 < ps.length ? ps[k + 1] : d.length;
    let qty = 0;
    for (let t = p; t < end; t++) qty += d[t];
    return { period: p, qty };
  }).filter((o) => o.qty > EPS);
}

/**
 * Cost of any plan under the shared model, and whether it is feasible (stock never negative).
 * Returns { cost, setups, holding, feasible, orders }.
 */
export function planCost(d, orders, setup, hold) {
  let inv = 0, holding = 0, feasible = true;
  const byPeriod = new Map();
  for (const o of orders) byPeriod.set(o.period, (byPeriod.get(o.period) || 0) + o.qty);
  for (let t = 0; t < d.length; t++) {
    inv += byPeriod.get(t) || 0;
    inv -= d[t];
    if (inv < -1e-6) feasible = false;
    holding += Math.max(0, inv) * hold;
  }
  const n = [...byPeriod.values()].filter((q) => q > EPS).length;
  return { cost: n * setup + holding, setups: n * setup, holding, feasible, orders };
}

/** Exact minimum-cost plan by dynamic programming, O(n^2). */
export function wagnerWhitin(d, setup, hold) {
  check(d, setup, hold);
  const n = d.length;
  const F = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(-1); // order period that covers ..j-1, or -1 = no order (zero demand)
  F[0] = 0;
  for (let j = 1; j <= n; j++) {
    // Period j-1 has no demand: it can ride on whatever covered the periods before it at no cost.
    if (d[j - 1] <= EPS) { F[j] = F[j - 1]; from[j] = -1; }
    for (let i = 0; i < j; i++) {
      if (d[i] <= EPS) continue; // an optimal plan only orders in periods with demand
      const c = F[i] + setup + holdCost(d, i, j - 1, hold);
      if (c < F[j] - EPS) { F[j] = c; from[j] = i; }
    }
  }
  const periods = [];
  for (let j = n; j > 0;) {
    if (from[j] < 0) { j -= 1; continue; }
    periods.push(from[j]);
    j = from[j];
  }
  const orders = ordersFrom(d, periods);
  return { method: "ww", ...planCost(d, orders, setup, hold) };
}

/** Silver-Meal: extend each order while the average cost per period covered keeps falling. */
export function silverMeal(d, setup, hold) {
  check(d, setup, hold);
  const periods = [];
  let i = 0;
  while (i < d.length) {
    if (d[i] <= EPS) { i++; continue; }
    periods.push(i);
    let best = setup, j = i;
    while (j + 1 < d.length) {
      const next = (setup + holdCost(d, i, j + 1, hold)) / (j + 2 - i);
      if (next > best / (j + 1 - i) + EPS) break;
      best = setup + holdCost(d, i, j + 1, hold);
      j++;
    }
    i = j + 1;
  }
  const orders = ordersFrom(d, periods);
  return { method: "sm", ...planCost(d, orders, setup, hold) };
}

/** Lot-for-lot: order each period's demand in that period. */
export function lotForLot(d, setup, hold) {
  check(d, setup, hold);
  const orders = d.map((q, t) => ({ period: t, qty: q })).filter((o) => o.qty > EPS);
  return { method: "l4l", ...planCost(d, orders, setup, hold) };
}

/**
 * Period order quantity: the economic order quantity sqrt(2 x setup x mean demand / hold), turned
 * into a whole number of periods of mean demand (at least 1); each order covers that many periods.
 */
export function periodOrderQuantity(d, setup, hold) {
  check(d, setup, hold);
  const pos = d.filter((x) => x > EPS);
  const mean = d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0;
  let k = 1;
  if (pos.length && hold > 0 && mean > 0) k = Math.max(1, Math.round(Math.sqrt((2 * setup * mean) / hold) / mean));
  else if (pos.length && hold === 0) k = d.length;
  const periods = [];
  let i = 0;
  while (i < d.length) {
    if (d[i] <= EPS) { i++; continue; }
    periods.push(i);
    i += k;
  }
  const orders = ordersFrom(d, periods);
  return { method: "poq", periods: k, ...planCost(d, orders, setup, hold) };
}

export const LOT_METHODS = [
  { id: "ww", label: "Wagner-Whitin (exact)", fn: wagnerWhitin },
  { id: "sm", label: "Silver-Meal", fn: silverMeal },
  { id: "poq", label: "Period order quantity (EOQ)", fn: periodOrderQuantity },
  { id: "l4l", label: "Lot-for-lot", fn: lotForLot },
];

/**
 * Plan one SKU's orders over a forecast horizon.
 *
 *   forecast     demand per period, period 0 = the current one
 *   leadPeriods  an order placed now arrives at the start of period `leadPeriods`
 *   onHand, onOrder  units now; units on order are assumed to land within the lead time
 *   safetyStock  kept as a floor under projected stock and never planned away
 *   setup, hold  order cost, and holding cost per unit per period
 *
 * Periods 0..leadPeriods-1 are frozen: only stock on hand and on order can cover them, and any
 * shortfall is reported as `gap` (units to expedite, or sales at risk). From period `leadPeriods`
 * the net requirements (forecast less the stock left above the safety floor) are planned by every
 * method; each order is placed `leadPeriods` before it arrives.
 */
export function scheduleSku({ forecast, leadPeriods, onHand = 0, onOrder = 0, safetyStock = 0, setup, hold }) {
  const L = Math.max(0, Math.floor(leadPeriods));
  let avail = onHand + onOrder - (safetyStock || 0);
  let gap = 0;
  for (let t = 0; t < Math.min(L, forecast.length); t++) avail -= forecast[t];
  if (avail < 0) { gap = -avail; avail = 0; }
  const net = [];
  for (let t = L; t < forecast.length; t++) {
    const use = Math.min(avail, forecast[t]);
    avail -= use;
    net.push(Math.max(0, forecast[t] - use));
  }
  const plans = {};
  for (const m of LOT_METHODS) {
    const p = m.fn(net, setup, hold);
    plans[m.id] = { ...p, orders: p.orders.map((o) => ({ arrive: o.period + L, place: o.period, qty: o.qty })) };
  }
  return { leadPeriods: L, gap, net, plans };
}
