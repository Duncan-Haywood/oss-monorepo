// Small-batch run-size optimizer. Pure functions, no DOM, no network.
// For each product a small maker produces in batches (candles, soap, sauces, prints, baked goods, apparel) it finds the run
// size that minimises annual setup + holding cost: the economic production quantity (EPQ), then clipped to a shelf-life cap,
// a minimum and maximum batch, and rounded to a pack/pan/mould multiple by checking the neighbouring multiples exactly.
// If machine or bench hours are limited, setup hours are charged a shadow price (found by bisection) so the products that
// waste the scarce hours least on changeovers get the bigger batches.

export const MAX_ITEMS = 6;
export const SHARED_DEFAULTS = { sellingDays: 300, hoursPerDay: 8, hoursAvailable: 0 };
export const ITEM_DEFAULTS = {
  name: "", annualDemand: 0, unitCost: 0, setupCost: 0, setupHours: 0, unitsPerHour: 0,
  holdingPct: 20, storagePerUnitYear: 0, shelfLifeDays: 0, multiple: 1, minBatch: 0, maxBatch: 0, currentBatch: 0,
};

// Placeholder example figures, not any business's costs or volumes.
export const EXAMPLE_ITEMS = [
  { name: "Soy candle 8oz", annualDemand: 6000, unitCost: 4.2, setupCost: 45, setupHours: 1.5, unitsPerHour: 30, holdingPct: 20, storagePerUnitYear: 0.25, shelfLifeDays: 0, multiple: 12, minBatch: 24, maxBatch: 1200, currentBatch: 120 },
  { name: "Hot sauce 5oz", annualDemand: 9000, unitCost: 1.8, setupCost: 120, setupHours: 3, unitsPerHour: 90, holdingPct: 20, storagePerUnitYear: 0.1, shelfLifeDays: 270, multiple: 24, minBatch: 96, maxBatch: 2400, currentBatch: 480 },
  { name: "Bar soap", annualDemand: 4800, unitCost: 1.1, setupCost: 30, setupHours: 1, unitsPerHour: 60, holdingPct: 20, storagePerUnitYear: 0.05, shelfLifeDays: 60, multiple: 20, minBatch: 40, maxBatch: 2000, currentBatch: 100 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  return {
    sellingDays: Math.min(366, Math.max(1, Math.round(num(s.sellingDays, d.sellingDays)))),
    hoursPerDay: Math.min(24, Math.max(0.5, num(s.hoursPerDay, d.hoursPerDay))),
    hoursAvailable: Math.max(0, num(s.hoursAvailable, d.hoursAvailable)), // machine/bench hours per year, 0 = no limit
  };
}

export function cleanItems(items = []) {
  const out = [];
  const warnings = [];
  items.slice(0, MAX_ITEMS).forEach((raw, i) => {
    const t = raw || {};
    const D = Math.max(0, num(t.annualDemand));
    const name = String(t.name ?? "").trim() || `Product ${i + 1}`;
    const touched = D > 0 || num(t.setupCost) > 0 || num(t.unitCost) > 0;
    if (!touched) return;
    if (D <= 0) { warnings.push(`${name}: enter the units you sell in a year; the product was left out.`); return; }
    if (num(t.setupCost) <= 0 && num(t.setupHours) <= 0) { warnings.push(`${name}: with no setup cost the best batch is one unit; enter what a changeover costs. The product was left out.`); return; }
    out.push({
      name, D,
      c: Math.max(0, num(t.unitCost)),
      S: Math.max(0, num(t.setupCost)),
      sh: Math.max(0, num(t.setupHours)),
      uph: Math.max(0, num(t.unitsPerHour)),
      h: Math.max(0, num(t.holdingPct, 20)) / 100,
      store: Math.max(0, num(t.storagePerUnitYear)),
      life: Math.max(0, num(t.shelfLifeDays)),
      m: Math.max(1, Math.round(num(t.multiple, 1))),
      minB: Math.max(0, Math.round(num(t.minBatch))),
      maxB: Math.max(0, Math.round(num(t.maxBatch))),
      cur: Math.max(0, Math.round(num(t.currentBatch))),
    });
  });
  return { items: out, warnings };
}

// Per-product constants derived from the inputs and the shared calendar.
export function derive(t, shared) {
  const dDay = t.D / shared.sellingDays; // average units sold per selling day
  const pDay = t.uph > 0 ? t.uph * shared.hoursPerDay : Infinity; // units the line can make per day
  const factor = 1 - dDay / pDay; // 1 for instant batches, <1 when stock builds while the batch is still running
  const H = t.c * t.h + t.store; // holding $ per unit per year
  const cap = t.life > 0 ? Math.max(1, Math.floor(dDay * t.life)) : Infinity; // oldest unit sells within shelf life
  return { dDay, pDay, factor, H, cap };
}

// Annual cost of running batches of size Q: setup $ (plus the shadow price of setup hours) + holding $.
export function annualCost(t, shared, Q, lambda = 0) {
  const { factor, H } = derive(t, shared);
  return ((t.S + lambda * t.sh) * t.D) / Q + (H * Q * factor) / 2;
}

function bounds(t, d) {
  const lo = Math.max(t.minB, 1);
  let hi = Math.min(t.maxB > 0 ? t.maxB : Infinity, d.cap);
  let conflict = false;
  if (hi < lo) { hi = lo; conflict = true; } // a minimum batch above the shelf-life cap: honour the minimum, flag it
  return { lo, hi, conflict };
}

// Best feasible batch size at a given setup-hour price: continuous optimum, then exact check of the nearest multiples.
export function bestBatch(t, shared, lambda = 0) {
  const d = derive(t, shared);
  const { lo, hi, conflict } = bounds(t, d);
  const setup = t.S + lambda * t.sh;
  const unconstrained = d.H * d.factor > 0 ? Math.sqrt((2 * t.D * setup) / (d.H * d.factor)) : Infinity;
  const clip = (q) => Math.min(Math.max(q, lo), hi);
  const target = Number.isFinite(unconstrained) ? clip(unconstrained) : hi;
  const cands = new Set();
  const lowMult = Math.floor(target / t.m) * t.m;
  for (const q of [lowMult, lowMult + t.m, Math.ceil(lo / t.m) * t.m, Math.floor(hi / t.m) * t.m]) {
    if (q >= lo && q <= hi && q >= 1) cands.add(q);
  }
  if (!cands.size) cands.add(Math.round(clip(target))); // no multiple fits inside the bounds: take the bound itself
  let best = null;
  for (const q of cands) {
    const cost = annualCost(t, shared, q, lambda);
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) <= 1e-9 && q < best.q)) best = { q, cost };
  }
  const capHit = Number.isFinite(d.cap) && d.cap <= (t.maxB > 0 ? t.maxB : Infinity);
  let binding = "";
  if (Number.isFinite(unconstrained) && unconstrained > hi && best.q + t.m > hi) binding = capHit ? "shelf life" : "max batch";
  else if (unconstrained < lo && best.q <= lo + t.m - 1) binding = "min batch";
  return { q: best.q, unconstrained, binding, conflict, lo, hi };
}

function describe(t, shared, q, lambda) {
  const d = derive(t, shared);
  const batches = t.D / q;
  const setupCost = t.S * batches;
  const holdCost = (d.H * q * d.factor) / 2;
  const hours = t.sh * batches + (t.uph > 0 ? t.D / t.uph : 0);
  return {
    q, batches, cycleDays: q / d.dDay, setupCost, holdCost, total: setupCost + holdCost,
    setupHours: t.sh * batches, hours, avgStock: (q * d.factor) / 2, cashTied: ((q * d.factor) / 2) * t.c,
    shelfOk: !Number.isFinite(d.cap) || q <= d.cap,
  };
}

// Within what range does the batch size stay within `tol` of the best cost? Found by scanning multiples.
export function flatRange(t, shared, bestQ, bestCost, tol = 0.05) {
  const d = derive(t, shared);
  const { lo, hi } = bounds(t, d);
  let a = bestQ, b = bestQ;
  for (let q = bestQ - t.m; q >= Math.max(lo, 1); q -= t.m) { if (annualCost(t, shared, q) <= bestCost * (1 + tol)) a = q; else break; }
  for (let q = bestQ + t.m; q <= hi && q <= bestQ * 20 + 1000; q += t.m) { if (annualCost(t, shared, q) <= bestCost * (1 + tol)) b = q; else break; }
  return { from: a, to: b };
}

export function plan(items, shared) {
  const limited = shared.hoursAvailable > 0;
  const solve = (lambda) => items.map((t) => bestBatch(t, shared, lambda));
  const hoursOf = (picks) => items.reduce((s, t, i) => s + (t.sh * t.D) / picks[i].q + (t.uph > 0 ? t.D / t.uph : 0), 0);
  let lambda = 0;
  let picks = solve(0);
  let feasible = true;
  if (limited && hoursOf(picks) > shared.hoursAvailable + 1e-9) {
    let lo = 0, hi = 1;
    while (hoursOf(solve(hi)) > shared.hoursAvailable && hi < 1e9) hi *= 2;
    if (hoursOf(solve(hi)) > shared.hoursAvailable) {
      feasible = false; lambda = hi; picks = solve(hi);
    } else {
      for (let n = 0; n < 80; n++) { const mid = (lo + hi) / 2; if (hoursOf(solve(mid)) > shared.hoursAvailable) lo = mid; else hi = mid; }
      lambda = hi; picks = solve(hi);
    }
  }
  return { lambda, picks, feasible, limited };
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items, warnings } = cleanItems(rawItems);
  const out = { ok: false, warnings: [...warnings], shared };
  if (!items.length) { out.warnings.push("Enter at least one product with a yearly volume and a setup cost."); return out; }
  for (const t of items) {
    const d = derive(t, shared);
    if (d.factor <= 0) out.warnings.push(`${t.name}: its yearly volume is more than the line can make in the selling days you entered. Check units per hour, hours per day and selling days.`);
    if (d.H <= 0) out.warnings.push(`${t.name}: holding cost is zero, so the tool would say make everything in one batch. Enter a holding rate or a storage cost.`);
  }
  if (out.warnings.some((w) => /more than the line|holding cost is zero/.test(w))) return out;
  const p = plan(items, shared);
  const rows = items.map((t, i) => {
    const pick = p.picks[i];
    const best = describe(t, shared, pick.q, p.lambda);
    const unc = describe(t, shared, Math.max(1, Math.round(pick.unconstrained || pick.q)), 0);
    const flat = flatRange(t, shared, pick.q, annualCost(t, shared, pick.q));
    const current = t.cur > 0 ? describe(t, shared, t.cur, 0) : null;
    if (pick.conflict) out.warnings.push(`${t.name}: your minimum batch is above the largest batch its shelf life allows. The tool used the minimum; the shelf-life rule is not met.`);
    if (current && !current.shelfOk) out.warnings.push(`${t.name}: your current batch is bigger than the shelf life lets you sell.`);
    return { name: t.name, best, current, binding: pick.binding, unconstrainedQ: pick.unconstrained, flat, gain: current ? current.total - best.total : 0 };
  });
  const totalBest = rows.reduce((s, r) => s + r.best.total, 0);
  const hasCurrent = rows.every((r) => r.current);
  const totalCurrent = hasCurrent ? rows.reduce((s, r) => s + r.current.total, 0) : 0;
  Object.assign(out, {
    ok: true, rows, totalBest, hasCurrent, totalCurrent, gain: hasCurrent ? totalCurrent - totalBest : 0,
    limited: p.limited, feasible: p.feasible, shadow: p.lambda,
    hoursUsed: rows.reduce((s, r) => s + r.best.hours, 0),
  });
  if (p.limited && !p.feasible) out.warnings.push("Even the biggest allowed batches need more hours than you have. Raise a maximum batch or the hours available.");
  return out;
}

export function toCsv(a) {
  const q = (v) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  const head = ["Product", "Best batch", "Batches a year", "Days between batches", "Setup cost a year", "Holding cost a year", "Total a year", "Your batch", "Your total a year", "Saving a year", "Within 5% of best from", "Within 5% of best to"];
  const lines = [head.map(q).join(",")];
  for (const r of a.rows) {
    lines.push([r.name, r.best.q, r.best.batches.toFixed(2), r.best.cycleDays.toFixed(1), r.best.setupCost.toFixed(2), r.best.holdCost.toFixed(2), r.best.total.toFixed(2), r.current ? r.current.q : "", r.current ? r.current.total.toFixed(2) : "", r.current ? r.gain.toFixed(2) : "", r.flat.from, r.flat.to].map(q).join(","));
  }
  return lines.join("\n");
}
