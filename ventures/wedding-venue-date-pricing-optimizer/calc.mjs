// Wedding-venue date pricing optimizer. Pure functions, no DOM, no network.
// For each kind of date (peak Saturday, Friday/Sunday, weekday, off-season) the venue has a number of
// dates a year, a current price, how many it books at that price and how many enquiries it turned
// away. Demand is a constant-elasticity curve anchored on that point; the price that earns the most
// contribution (price minus the cost of hosting) is found exactly, with sold-out dates capped.

export const TYPE_DEFAULTS = {
  name: "", dates: 0, price: 0, booked: 0, turnedAway: 0, cost: 0, elasticity: 1.8, minPrice: 0, maxPrice: 0,
};

// Placeholder example rows, not any market's prices.
export const EXAMPLE_TYPES = [
  { name: "Peak Saturday (May-Oct)", dates: 26, price: 9500, booked: 26, turnedAway: 14, cost: 2600, elasticity: 1.6, minPrice: 0, maxPrice: 0 },
  { name: "Off-peak Saturday", dates: 26, price: 7200, booked: 15, turnedAway: 0, cost: 2600, elasticity: 2.2, minPrice: 0, maxPrice: 0 },
  { name: "Friday or Sunday", dates: 52, price: 5400, booked: 18, turnedAway: 0, cost: 2300, elasticity: 2.6, minPrice: 0, maxPrice: 0 },
  { name: "Weekday", dates: 150, price: 2800, booked: 12, turnedAway: 0, cost: 1800, elasticity: 3.0, minPrice: 0, maxPrice: 0 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const pct = (n) => (n * 100).toFixed(1) + "%";

// Rows with no dates or no price are left out. Bookings can never exceed dates.
export function cleanTypes(types = []) {
  const out = [];
  types.forEach((t, i) => {
    const dates = Math.floor(num(t.dates));
    const price = num(t.price);
    if (dates <= 0 || price <= 0) return;
    const cost = Math.max(0, num(t.cost));
    const booked = Math.min(dates, Math.max(0, num(t.booked)));
    const turnedAway = Math.max(0, num(t.turnedAway));
    const elasticity = Math.min(8, Math.max(0.1, num(t.elasticity, 1.8)));
    const lo = Math.max(num(t.minPrice) > 0 ? num(t.minPrice) : cost, 0.01);
    const hi = num(t.maxPrice) > 0 ? Math.max(num(t.maxPrice), lo) : Math.max(price * 2, lo);
    out.push({
      index: i, name: String(t.name || "").trim() || "Date type " + (i + 1),
      dates, price, booked, turnedAway, cost, elasticity, lo, hi,
      base: booked + turnedAway, // demand at the current price, unconstrained by the calendar
    });
  });
  return out;
}

// Bookings a year at price p: constant-elasticity demand, capped by the calendar.
export function demand(t, p) {
  if (t.base <= 0) return 0;
  return Math.min(t.dates, t.base * Math.pow(p / t.price, -t.elasticity));
}
export const contribution = (t, p) => demand(t, p) * (p - t.cost);

// Exact optimum on [lo, hi]. Below the price that just fills the calendar, profit rises with price,
// so the best price is the fill price, the unconstrained optimum c*e/(e-1), or an end of the range.
export function bestPrice(t) {
  const cands = [t.lo, t.hi];
  if (t.base > 0) {
    cands.push(t.price * Math.pow(t.dates / t.base, -1 / t.elasticity)); // fill price
    if (t.elasticity > 1) cands.push((t.cost * t.elasticity) / (t.elasticity - 1));
  }
  let best = null;
  for (const c of cands) {
    const p = Math.min(t.hi, Math.max(t.lo, c));
    const v = contribution(t, p);
    if (!best || v > best.value + 1e-9) best = { price: p, value: v };
  }
  return best;
}

export function analyze(rawTypes) {
  const types = cleanTypes(rawTypes);
  const warnings = [];
  if (!types.length) return { types, warnings: ["Enter the dates a year and a current price for at least one date type."], ok: false };
  const rows = types.map((t) => {
    const opt = bestPrice(t);
    const nowBookings = demand(t, t.price);
    const nowProfit = contribution(t, t.price);
    const newBookings = demand(t, opt.price);
    if (t.base === 0) warnings.push(t.name + " has no bookings or turned-away enquiries, so there is no demand to price against.");
    if (t.elasticity <= 1 && opt.price >= t.hi - 1e-9) warnings.push(t.name + ": with price sensitivity at or below 1 the best price is simply the highest you allow. Check the sensitivity you entered.");
    return {
      name: t.name, dates: t.dates, cost: t.cost, elasticity: t.elasticity,
      nowPrice: t.price, nowBookings, nowProfit,
      price: opt.price, bookings: newBookings, profit: opt.value,
      change: opt.price / t.price - 1,
      soldOut: newBookings >= t.dates - 1e-9,
      gain: opt.value - nowProfit,
    };
  });
  const now = rows.reduce((a, r) => a + r.nowProfit, 0);
  const best = rows.reduce((a, r) => a + r.profit, 0);
  // How wrong can the price sensitivity be? Re-price with e +/- 30% and score on the entered curve.
  const stress = [0.7, 1.3].map((f) => {
    let total = 0;
    types.forEach((t) => {
      const alt = bestPrice({ ...t, elasticity: Math.min(8, Math.max(0.1, t.elasticity * f)) });
      total += contribution(t, alt.price);
    });
    return { factor: f, profit: total };
  });
  return { ok: true, types, warnings, rows, now, best, gain: best - now, stress };
}

export function toCsv(a) {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [["date_type", "dates", "current_price", "current_bookings", "best_price", "expected_bookings", "annual_contribution_now", "annual_contribution_best"].join(",")];
  for (const r of a.rows) lines.push([q(r.name), r.dates, r.nowPrice, r.nowBookings.toFixed(1), Math.round(r.price), r.bookings.toFixed(1), Math.round(r.nowProfit), Math.round(r.profit)].join(","));
  lines.push(["total_now", Math.round(a.now)].join(","));
  lines.push(["total_best", Math.round(a.best)].join(","));
  return lines.join("\n") + "\n";
}
