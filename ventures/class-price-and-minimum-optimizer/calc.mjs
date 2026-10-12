// Class price and minimum-enrollment optimizer. Pure functions, no DOM, no network.
// A small school, studio or tutoring centre sells seats in a class that runs only if enough people sign up. Sign-ups at a
// price are modelled as Poisson with mean a * price^(-e) (constant price elasticity e, fitted by least squares on the
// log-log scatter of price versus average sign-ups from past terms). A class with fewer than the minimum is cancelled;
// above capacity the extra sign-ups wait-list. Expected profit per class offered is summed exactly over the Poisson
// distribution and the price grid is scanned for the maximum.

export const SHARED_DEFAULTS = { capacity: 12, minToRun: 5, fixedCost: 520, varCost: 8, currentPrice: 0, elasticity: 0, classesPerMonth: 6 };
// Placeholder example figures, not any school's prices, costs or sign-ups. A trailing + marks a term that filled and wait-listed.
export const EXAMPLE_PRICES = "110:13+ 140:10 170:7.5 200:5";
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS, currentPrice: 140 };

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  return {
    capacity: Math.min(500, Math.max(1, Math.round(num(s.capacity, d.capacity)))),
    minToRun: Math.max(0, Math.round(num(s.minToRun, d.minToRun))),
    fixedCost: Math.max(0, num(s.fixedCost, d.fixedCost)),
    varCost: Math.max(0, num(s.varCost, d.varCost)),
    currentPrice: Math.max(0, num(s.currentPrice, d.currentPrice)),
    elasticity: Math.max(0, num(s.elasticity, d.elasticity)), // 0 = fit from the data
    classesPerMonth: Math.max(0, num(s.classesPerMonth, d.classesPerMonth)),
  };
}

// "110:13+ 140:10 170:7.5" -> [{ price: 110, enrolled: 13, full: true }, ...]. Junk tokens are skipped.
export function parsePoints(text) {
  const out = [];
  String(text ?? "").split(/[\s;,]+/).forEach((tok) => {
    const m = /^\$?(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)(\+?)$/.exec(tok.trim());
    if (m && Number(m[1]) > 0) out.push({ price: Number(m[1]), enrolled: Number(m[2]), full: m[3] === "+" });
  });
  return out.slice(0, 40);
}

// Least squares of ln(enrolled) on ln(price) over points that did not fill the room. Returns null if it cannot be fitted.
export function fitDemand(points) {
  const pts = points.filter((p) => !p.full && p.enrolled > 0);
  const xs = pts.map((p) => Math.log(p.price)), ys = pts.map((p) => Math.log(p.enrolled));
  const n = pts.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  const r2 = syy < 1e-12 ? 1 : (sxy * sxy) / (sxx * syy);
  return { elasticity: -slope, a: Math.exp(my - slope * mx), n, r2 };
}

// Expected profit per class offered at a price, given demand mean lambda. Exact Poisson sum.
export function classProfit(price, lambda, { capacity, minToRun, fixedCost, varCost }) {
  let pmf = Math.exp(-lambda), cdf = 0, profit = 0, runs = 0, seats = 0, full = 0;
  for (let n = 0; n < capacity; n++) {
    if (n >= minToRun) {
      profit += pmf * ((price - varCost) * n - fixedCost);
      runs += pmf; seats += pmf * n;
    }
    cdf += pmf;
    pmf *= lambda / (n + 1);
  }
  const tail = Math.max(0, 1 - cdf); // P(N >= capacity)
  if (capacity >= minToRun) {
    profit += tail * ((price - varCost) * capacity - fixedCost);
    runs += tail; seats += tail * capacity;
  }
  full = tail;
  return { profit, pRun: runs, seats: runs > 0 ? seats / runs : 0, pFull: full, expectedSeats: seats };
}

export function priceScan(model, shared, lo, hi, steps = 600) {
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const price = lo * Math.pow(hi / lo, i / steps);
    const lambda = model.a * Math.pow(price, -model.elasticity);
    rows.push({ price, lambda, ...classProfit(price, lambda, shared) });
  }
  return rows;
}

export function analyze(rawPoints, rawShared) {
  const shared = cleanShared(rawShared);
  const points = typeof rawPoints === "string" ? parsePoints(rawPoints) : rawPoints || [];
  const warnings = [];
  const fail = (m) => ({ ok: false, warnings: [...warnings, m] });
  if (!points.length) return fail("Add at least one price and the average sign-ups it drew, like 140:10.");
  let model = fitDemand(points);
  if (shared.elasticity > 0) {
    const ref = points.filter((p) => !p.full && p.enrolled > 0)[0] || points[0];
    model = { elasticity: shared.elasticity, a: ref.enrolled * Math.pow(ref.price, shared.elasticity), n: points.length, r2: null, assumed: true };
    if (points.some((p) => p.full)) warnings.push("A term that filled the room is a lower bound on demand, so the elasticity you set is anchored on an unfilled term where one exists.");
  } else if (!model) {
    return fail("Need two or more different prices that did not fill the room, or enter a price elasticity yourself.");
  } else if (model.elasticity <= 0.05) {
    return fail("Sign-ups did not fall as price rose, so the data cannot say where price should stop. Enter an elasticity (1.5 is a common starting guess for classes) or add more price points.");
  }
  if (model.r2 !== null && model.n === 2) warnings.push("Two points fit any line exactly, so this elasticity has no error bar. Treat the answer as a direction, not a number.");
  if (model.r2 !== null && model.n > 2 && model.r2 < 0.6) warnings.push("The price points scatter widely (R-squared " + model.r2.toFixed(2) + "). Other things moved sign-ups too, so the fitted elasticity is shaky.");
  if (model.elasticity > 8) warnings.push("An elasticity above 8 is implausibly steep; check the figures.");

  const prices = points.map((p) => p.price).concat(shared.currentPrice > 0 ? [shared.currentPrice] : []);
  const pMin = Math.min(...prices), pMax = Math.max(...prices);
  const lo = Math.max(shared.varCost * 1.01, 0.01, pMin / 3), hi = pMax * 3;
  const scan = priceScan(model, shared, lo, Math.max(hi, lo * 1.5));
  let best = scan[0];
  for (const r of scan) if (r.profit > best.profit) best = r;
  if (!(best.profit > 0)) return fail("At no price does a class cover its fixed cost under this demand. Cut the cost per class, lower the minimum, or revisit the sign-up figures.");
  if (best.price < pMin * 0.8 || best.price > pMax * 1.25) warnings.push("The best price is outside the prices you have tried (" + money(pMin) + " to " + money(pMax) + "). That is extrapolation: test a step toward it before moving all the way.");
  if (best.price >= hi * 0.97) warnings.push("The best price sits at the top of the range scanned; demand may be too inelastic to trust.");

  let current = null;
  if (shared.currentPrice > 0) {
    const lambda = model.a * Math.pow(shared.currentPrice, -model.elasticity);
    current = { price: shared.currentPrice, lambda, ...classProfit(shared.currentPrice, lambda, shared) };
  }
  const near = [0.8, 0.9, 1, 1.1, 1.2].map((f) => {
    const price = best.price * f, lambda = model.a * Math.pow(price, -model.elasticity);
    return { price, lambda, ...classProfit(price, lambda, shared) };
  });
  const breakEvenSeats = best.price > shared.varCost ? shared.fixedCost / (best.price - shared.varCost) : Infinity;
  return {
    ok: true, warnings, shared, model, best: { ...best, breakEvenSeats }, current, table: near,
    gain: current ? best.profit - current.profit : 0,
    monthGain: current ? (best.profit - current.profit) * shared.classesPerMonth : 0,
    monthProfit: best.profit * shared.classesPerMonth,
  };
}

export function toCsv(a) {
  const rows = [["price", "mean_signups", "chance_class_runs", "chance_full", "expected_profit_per_class_offered"]];
  a.table.forEach((r) => rows.push([r.price.toFixed(2), r.lambda.toFixed(2), r.pRun.toFixed(3), r.pFull.toFixed(3), r.profit.toFixed(2)]));
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}
