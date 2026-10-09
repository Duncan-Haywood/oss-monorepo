// Farm crop-mix optimizer. Pure functions, no DOM, no network.
// Chooses acres of each crop to maximise gross margin over variable cost, subject to total acres,
// peak-season labor hours, operating capital, and a floor and ceiling per crop. A linear program
// solved exactly by the simplex method; the shadow prices say what one more acre, labor hour or
// dollar of operating capital is worth.

export const SHARED_DEFAULTS = { totalAcres: 800, laborHours: 800, capital: 400000, landCostPerAcre: 0 };

export const CROP_DEFAULTS = {
  name: "", yieldPerAcre: 0, price: 0, costPerAcre: 0, laborPerAcre: 0, minAcres: 0, maxAcres: 0, current: 0,
};

// Placeholder example rows, not any region's yields, prices or costs.
export const EXAMPLE_CROPS = [
  { name: "Corn", yieldPerAcre: 190, price: 4.5, costPerAcre: 520, laborPerAcre: 1.1, minAcres: 0, maxAcres: 0, current: 400 },
  { name: "Soybeans", yieldPerAcre: 55, price: 11.5, costPerAcre: 260, laborPerAcre: 0.8, minAcres: 0, maxAcres: 500, current: 300 },
  { name: "Wheat", yieldPerAcre: 70, price: 6.2, costPerAcre: 300, laborPerAcre: 0.7, minAcres: 0, maxAcres: 250, current: 100 },
  { name: "Hay", yieldPerAcre: 4, price: 190, costPerAcre: 230, laborPerAcre: 2.4, minAcres: 0, maxAcres: 120, current: 0 },
];

const EPS = 1e-9;

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  return {
    totalAcres: Math.max(0, num(s.totalAcres, d.totalAcres)),
    laborHours: Math.max(0, num(s.laborHours, d.laborHours)), // 0 = no limit
    capital: Math.max(0, num(s.capital, d.capital)), // 0 = no limit
    landCostPerAcre: Math.max(0, num(s.landCostPerAcre, d.landCostPerAcre)),
  };
}

// A crop with no yield, or no price, is left out. A blank or zero ceiling means "no crop limit".
export function cleanCrops(crops = []) {
  const out = [];
  crops.forEach((c, i) => {
    const y = num(c.yieldPerAcre), p = num(c.price);
    if (y <= 0 || p <= 0) return;
    const min = Math.max(0, num(c.minAcres));
    const rawMax = num(c.maxAcres);
    const cost = Math.max(0, num(c.costPerAcre));
    out.push({
      index: i,
      name: String(c.name || "").trim() || "Crop " + (i + 1),
      revenue: y * p,
      cost,
      margin: y * p - cost,
      labor: Math.max(0, num(c.laborPerAcre)),
      min,
      max: rawMax > 0 ? Math.max(min, rawMax) : Infinity,
      current: Math.max(0, num(c.current)),
    });
  });
  return out;
}

// maximise c.y subject to A y <= b, y >= 0, b >= 0 (so y = 0 is a feasible start).
// Dense tableau, Bland's rule (cannot cycle). Returns the primal y and the dual value of each row.
export function simplex(c, A, b) {
  const n = c.length, m = A.length, w = n + m + 1;
  const T = A.map((row, i) => {
    const r = new Array(w).fill(0);
    row.forEach((v, j) => { r[j] = v; });
    r[n + i] = 1;
    r[w - 1] = b[i];
    return r;
  });
  const z = new Array(w).fill(0);
  c.forEach((v, j) => { z[j] = -v; });
  const basis = Array.from({ length: m }, (_, i) => n + i);
  for (let iter = 0; iter < 5000; iter++) {
    let col = -1;
    for (let j = 0; j < n + m; j++) if (z[j] < -1e-9) { col = j; break; }
    if (col < 0) break;
    let row = -1, best = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][col] > 1e-9) {
        const ratio = T[i][w - 1] / T[i][col];
        if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[row])) { best = ratio; row = i; }
      }
    }
    if (row < 0) return { unbounded: true };
    const p = T[row][col];
    for (let j = 0; j < w; j++) T[row][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === row) continue;
      const f = T[i][col];
      if (f !== 0) for (let j = 0; j < w; j++) T[i][j] -= f * T[row][j];
    }
    const fz = z[col];
    for (let j = 0; j < w; j++) z[j] -= fz * T[row][j];
    basis[row] = col;
  }
  const y = new Array(n).fill(0);
  basis.forEach((bv, i) => { if (bv < n) y[bv] = T[i][w - 1]; });
  return { unbounded: false, y, value: z[w - 1], duals: z.slice(n, n + m), reduced: z.slice(0, n) };
}

// Solve the crop mix. Substitutes acres = min + y so floors become part of the right-hand side.
export function optimize(crops, shared) {
  const n = crops.length;
  const rows = [], rhs = [], tag = [];
  const minAcres = crops.reduce((s, k) => s + k.min, 0);
  const minLabor = crops.reduce((s, k) => s + k.min * k.labor, 0);
  const minCap = crops.reduce((s, k) => s + k.min * k.cost, 0);
  rows.push(crops.map(() => 1)); rhs.push(shared.totalAcres - minAcres); tag.push("acres");
  if (shared.laborHours > 0) { rows.push(crops.map((k) => k.labor)); rhs.push(shared.laborHours - minLabor); tag.push("labor"); }
  if (shared.capital > 0) { rows.push(crops.map((k) => k.cost)); rhs.push(shared.capital - minCap); tag.push("capital"); }
  crops.forEach((k, j) => {
    if (Number.isFinite(k.max)) {
      rows.push(crops.map((_, q) => (q === j ? 1 : 0))); rhs.push(k.max - k.min); tag.push("cap:" + j);
    }
  });
  const short = [];
  if (rhs[0] < -EPS) short.push("acres");
  tag.forEach((t, i) => { if (t === "labor" && rhs[i] < -EPS) short.push("labor"); if (t === "capital" && rhs[i] < -EPS) short.push("capital"); });
  if (short.length) return { feasible: false, short };
  const r = simplex(crops.map((k) => k.margin), rows, rhs);
  if (r.unbounded) return { feasible: false, short: ["unbounded"] };
  const acres = r.y.map((v, j) => crops[j].min + (v < 1e-9 ? 0 : v));
  const dual = (t) => { const i = tag.indexOf(t); return i < 0 ? 0 : Math.max(0, r.duals[i]); };
  return {
    feasible: true,
    acres,
    shadow: { acre: dual("acres"), labor: dual("labor"), capital: dual("capital") },
    reduced: r.reduced.slice(0, n).map((v) => Math.max(0, v)),
  };
}

export function evaluate(crops, acres, shared) {
  let used = 0, margin = 0, labor = 0, capital = 0;
  crops.forEach((k, j) => { used += acres[j]; margin += acres[j] * k.margin; labor += acres[j] * k.labor; capital += acres[j] * k.cost; });
  const net = margin - shared.landCostPerAcre * shared.totalAcres;
  return { acres: used, margin, labor, capital, net, idle: Math.max(0, shared.totalAcres - used) };
}

export function analyze(rawCrops, rawShared) {
  const shared = cleanShared(rawShared);
  const crops = cleanCrops(rawCrops);
  const warnings = [];
  if (shared.totalAcres <= 0) warnings.push("Enter the acres available.");
  if (!crops.length) warnings.push("Enter at least one crop with a yield and a price.");
  if (warnings.length) return { ok: false, warnings };
  const sol = optimize(crops, shared);
  if (!sol.feasible) {
    const what = { acres: "the minimum acres add up to more than the farm has", labor: "the minimum acres need more labor hours than you have", capital: "the minimum acres cost more than your operating capital" };
    return { ok: false, warnings: sol.short.map((s) => "No plan fits: " + (what[s] || "the limits cannot be met") + ".") };
  }
  const best = evaluate(crops, sol.acres, shared);
  const curAcres = crops.map((k) => k.current);
  const hasCurrent = curAcres.some((v) => v > 0);
  const current = evaluate(crops, curAcres, shared);
  if (hasCurrent) {
    if (current.acres > shared.totalAcres + 1e-6) warnings.push("Your current plan uses " + current.acres.toFixed(0) + " acres, more than the " + shared.totalAcres.toFixed(0) + " you entered.");
    if (shared.laborHours > 0 && current.labor > shared.laborHours + 1e-6) warnings.push("Your current plan needs " + current.labor.toFixed(0) + " labor hours, more than the " + shared.laborHours.toFixed(0) + " you entered.");
    if (shared.capital > 0 && current.capital > shared.capital + 1e-6) warnings.push("Your current plan costs " + money(current.capital) + ", more than the operating capital you entered.");
  }
  const rows = crops.map((k, j) => ({
    name: k.name, margin: k.margin, current: k.current, optimal: sol.acres[j],
    change: sol.acres[j] - k.current,
    marginPerLabor: k.labor > 0 ? k.margin / k.labor : null,
    returnPerDollar: k.cost > 0 ? k.margin / k.cost : null,
    atCeiling: Number.isFinite(k.max) && sol.acres[j] >= k.max - 1e-6,
    // Margin per acre this crop would need, with everything else unchanged, to be worth growing.
    needs: sol.acres[j] > k.min + 1e-6 || sol.reduced[j] <= 1e-9 ? null : k.margin + sol.reduced[j],
  }));
  const binding = [];
  if (sol.shadow.acre > 1e-6) binding.push("land");
  if (sol.shadow.labor > 1e-6) binding.push("labor");
  if (sol.shadow.capital > 1e-6) binding.push("capital");
  return { ok: true, warnings, shared, crops, rows, best, current, hasCurrent, shadow: sol.shadow, binding, gain: best.net - current.net };
}

export function toCsv(a) {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [["Crop", "Margin per acre", "Current acres", "Best acres", "Change"].map(q).join(",")];
  a.rows.forEach((r) => lines.push([q(r.name), r.margin.toFixed(2), r.current.toFixed(1), r.optimal.toFixed(1), r.change.toFixed(1)].join(",")));
  lines.push(["Total margin after land cost", "", a.current.net.toFixed(0), a.best.net.toFixed(0), a.gain.toFixed(0)].map(q).join(","));
  return lines.join("\n");
}
