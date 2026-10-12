// Self-storage unit-mix optimizer. Pure functions, no DOM, no network.
// Chooses how many units of each size fit in a fixed rentable area so annual NOI is highest,
// subject to a per-size demand ceiling and floor. Exact: a bounded knapsack solved by dynamic
// programming over square feet (in steps of the gcd of the unit sizes).

export const SHARED_DEFAULTS = { totalSqft: 40000, opexPct: 35, unitCostYear: 0 };

export const TYPE_DEFAULTS = {
  name: "", sqft: 0, rate: 0, occ: 92, minUnits: 0, maxUnits: 0, current: 0,
};

// Placeholder example rows, not any market's rates.
export const EXAMPLE_TYPES = [
  { name: "5x5", sqft: 25, rate: 55, occ: 92, minUnits: 0, maxUnits: 40, current: 20 },
  { name: "5x10", sqft: 50, rate: 85, occ: 92, minUnits: 0, maxUnits: 80, current: 60 },
  { name: "10x10", sqft: 100, rate: 135, occ: 92, minUnits: 0, maxUnits: 120, current: 100 },
  { name: "10x15", sqft: 150, rate: 185, occ: 90, minUnits: 0, maxUnits: 60, current: 80 },
  { name: "10x20", sqft: 200, rate: 225, occ: 88, minUnits: 0, maxUnits: 50, current: 50 },
  { name: "10x30", sqft: 300, rate: 320, occ: 85, minUnits: 0, maxUnits: 15, current: 10 },
];

export const MAX_STEPS = 400000;

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
export const pct = (n) => (n * 100).toFixed(1) + "%";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  return {
    totalSqft: Math.max(0, num(s.totalSqft, d.totalSqft)),
    opexPct: Math.min(100, Math.max(0, num(s.opexPct, d.opexPct))),
    unitCostYear: Math.max(0, num(s.unitCostYear, d.unitCostYear)),
  };
}

// Types with no size or no rate are left out. Sizes are whole square feet.
export function cleanTypes(types = []) {
  const out = [];
  types.forEach((t, i) => {
    const sqft = Math.round(num(t.sqft));
    const rate = num(t.rate);
    if (sqft <= 0 || rate <= 0) return;
    const min = Math.max(0, Math.floor(num(t.minUnits)));
    const rawMax = num(t.maxUnits);
    // A blank or zero ceiling means "no demand limit".
    const max = rawMax > 0 ? Math.max(min, Math.floor(rawMax)) : Infinity;
    out.push({
      index: i,
      name: String(t.name || "").trim() || sqft + " sq ft",
      sqft, rate,
      occ: Math.min(100, Math.max(0, num(t.occ, 92))) / 100,
      min, max,
      current: Math.max(0, Math.floor(num(t.current))),
    });
  });
  return out;
}

// Annual net operating income of one unit of this type, at its occupancy.
export function unitNoi(t, shared) {
  const revenue = t.rate * 12 * t.occ;
  return revenue * (1 - shared.opexPct / 100) - shared.unitCostYear;
}

export function evaluate(types, counts, shared) {
  let revenue = 0, noi = 0, sqft = 0, units = 0;
  types.forEach((t, i) => {
    const n = counts[i] || 0;
    revenue += n * t.rate * 12 * t.occ;
    noi += n * unitNoi(t, shared);
    sqft += n * t.sqft;
    units += n;
  });
  return { revenue, noi, sqft, units };
}

// Exact optimum. Returns null when the area is too large to solve exactly.
export function optimize(types, shared) {
  if (!types.length) return { counts: [], feasible: true, steps: 0 };
  const g = types.reduce((a, t) => gcd(a, t.sqft), 0);
  const floorSqft = types.reduce((a, t) => a + t.min * t.sqft, 0);
  const free = Math.floor(shared.totalSqft) - floorSqft;
  if (free < 0) return { counts: types.map((t) => t.min), feasible: false, steps: 0 };
  const cap = Math.floor(free / g);
  if (cap > MAX_STEPS) return null;
  // 0/1 items by binary splitting of each size's remaining ceiling.
  const items = [];
  types.forEach((t, i) => {
    const v = unitNoi(t, shared);
    if (v <= 0) return;
    const w = t.sqft / g;
    let left = Number.isFinite(t.max) ? t.max - t.min : Math.floor(cap / w);
    left = Math.min(left, Math.floor(cap / w));
    for (let k = 1; left > 0; k *= 2) {
      const take = Math.min(k, left);
      items.push({ i, mult: take, w: w * take, v: v * take });
      left -= take;
    }
  });
  const dp = new Float64Array(cap + 1);
  const took = items.map(() => new Uint8Array(cap + 1));
  items.forEach((it, k) => {
    for (let c = cap; c >= it.w; c--) {
      const cand = dp[c - it.w] + it.v;
      if (cand > dp[c] + 1e-9) { dp[c] = cand; took[k][c] = 1; }
    }
  });
  const counts = types.map((t) => t.min);
  let c = cap;
  for (let k = items.length - 1; k >= 0; k--) {
    if (took[k][c]) { counts[items[k].i] += items[k].mult; c -= items[k].w; }
  }
  return { counts, feasible: true, steps: cap };
}

export function analyze(rawTypes, rawShared) {
  const shared = cleanShared(rawShared);
  const types = cleanTypes(rawTypes);
  const warnings = [];
  if (!types.length) return { shared, types, warnings: ["Enter a size and a monthly rate for at least one unit type."], ok: false };
  if (shared.totalSqft <= 0) return { shared, types, warnings: ["Enter the rentable square feet."], ok: false };
  const opt = optimize(types, shared);
  if (opt === null) return { shared, types, warnings: ["That area is too large to solve exactly. Enter the area of one building or phase."], ok: false };
  if (!opt.feasible) warnings.push("The minimum units you entered need more square feet than the facility has.");
  const current = evaluate(types, types.map((t) => t.current), shared);
  const best = evaluate(types, opt.counts, shared);
  if (current.sqft > shared.totalSqft) warnings.push("Your current units add up to more square feet than the rentable total.");
  types.forEach((t) => { if (unitNoi(t, shared) <= 0) warnings.push(t.name + " earns nothing after operating costs, so it is only built to its minimum."); });
  const rows = types.map((t, i) => ({
    name: t.name, sqft: t.sqft, rate: t.rate, occ: t.occ,
    ratePerSqft: t.rate / t.sqft,
    noiPerSqft: unitNoi(t, shared) / t.sqft,
    current: t.current, optimal: opt.counts[i], change: opt.counts[i] - t.current,
    atCeiling: Number.isFinite(t.max) && opt.counts[i] >= t.max,
    ceiling: t.max,
  }));
  // Marginal value of area: re-solve with 1,000 sq ft more and less.
  const probe = (delta) => {
    const o = optimize(types, { ...shared, totalSqft: Math.max(0, shared.totalSqft + delta) });
    return o && o.feasible ? evaluate(types, o.counts, shared).noi : null;
  };
  const up = probe(1000), down = probe(-1000);
  const addSqft = up === null ? null : up - best.noi;
  const loseSqft = down === null ? null : best.noi - down;
  const unfilled = shared.totalSqft - best.sqft;
  if (unfilled >= Math.min(...types.map((t) => t.sqft)) && rows.every((r) => r.atCeiling || r.noiPerSqft <= 0)) {
    warnings.push("Demand ceilings leave " + Math.round(unfilled).toLocaleString("en-US") + " sq ft empty: more of any size than you entered would be needed to use it.");
  }
  return {
    ok: true, shared, types, warnings, rows, current, best, unfilled,
    gain: best.noi - current.noi,
    addSqft, loseSqft,
  };
}

export function toCsv(a) {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [["type", "sqft", "rate_per_month", "occupancy", "current_units", "optimal_units", "change"].join(",")];
  for (const r of a.rows) lines.push([q(r.name), r.sqft, r.rate, (r.occ * 100).toFixed(1), r.current, r.optimal, r.change].join(","));
  lines.push(["total_noi_current", Math.round(a.current.noi)].join(","));
  lines.push(["total_noi_optimal", Math.round(a.best.noi)].join(","));
  return lines.join("\n") + "\n";
}
