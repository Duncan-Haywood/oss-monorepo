// Cheapest meal plan optimizer: the classic minimum-cost diet problem. Given
// foods with a price per serving and nutrition per serving, find the servings
// per day that meet calorie, protein, carb, fat and fibre bounds at the lowest
// cost, with per-food caps so the plan stays eatable. Solved with a two-phase
// simplex (Bland's rule) and, when servings come in whole or half steps,
// branch and bound. Marginal costs of each target come from re-solving.
// Pure functions, no I/O.
//
// Arithmetic on figures the user types or edits. The starter foods carry
// approximate generic nutrition and EXAMPLE prices only. Not medical,
// dietary or nutrition advice.

export const NUTRIENTS = ["kcal", "protein", "carbs", "fat", "fiber"];
export const UNITS = { kcal: "kcal", protein: "g", carbs: "g", fat: "g", fiber: "g" };
export const MIN_SAFE_KCAL = 1200;
const EPS = 1e-9;

// maximise c.x subject to rows [{a, rel: "<="|">=", b}], x >= 0.
// Returns {status: "optimal"|"infeasible"|"unbounded", value, x}.
export function simplex(c, rows) {
  const n = c.length, m = rows.length;
  const A = [], b = [], neg = [];
  for (const r of rows) {
    let a = r.a.slice(), rhs = r.b;
    if (r.rel === ">=") { a = a.map((v) => -v); rhs = -rhs; }
    A.push(a); b.push(rhs); neg.push(rhs < -EPS);
  }
  const nArt = neg.filter(Boolean).length;
  const cols = n + m + nArt; // originals, one slack/surplus per row, artificials
  const T = [];
  const basis = [];
  let ai = 0;
  for (let i = 0; i < m; i++) {
    const row = new Array(cols + 1).fill(0);
    if (!neg[i]) {
      for (let j = 0; j < n; j++) row[j] = A[i][j];
      row[n + i] = 1; row[cols] = b[i]; basis.push(n + i);
    } else {
      for (let j = 0; j < n; j++) row[j] = -A[i][j];
      row[n + i] = -1; row[n + m + ai] = 1; row[cols] = -b[i]; basis.push(n + m + ai); ai++;
    }
    T.push(row);
  }
  const pivot = (pr, pc) => {
    const p = T[pr][pc];
    for (let j = 0; j <= cols; j++) T[pr][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === pr) continue;
      const f = T[i][pc];
      if (Math.abs(f) > 0) for (let j = 0; j <= cols; j++) T[i][j] -= f * T[pr][j];
    }
    basis[pr] = pc;
  };
  // objective as reduced costs: z_j - c_j style kept in `obj` (maximise)
  const run = (cost, allowed) => {
    for (let iter = 0; iter < 20000; iter++) {
      // reduced cost of column j: cost_j - sum cost_B * T[i][j]
      let enter = -1;
      for (let j = 0; j < cols; j++) {
        if (!allowed(j) || basis.includes(j)) continue;
        let rc = cost[j];
        for (let i = 0; i < m; i++) rc -= cost[basis[i]] * T[i][j];
        if (rc > 1e-9) { enter = j; break; } // Bland: lowest index
      }
      if (enter < 0) return "optimal";
      let leave = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        if (T[i][enter] > 1e-9) {
          const ratio = T[i][cols] / T[i][enter];
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i; }
        }
      }
      if (leave < 0) return "unbounded";
      pivot(leave, enter);
    }
    return "iterations";
  };
  if (nArt) {
    const cost1 = new Array(cols).fill(0);
    for (let j = n + m; j < cols; j++) cost1[j] = -1;
    run(cost1, () => true);
    const infeas = basis.reduce((s, bj, i) => s + (bj >= n + m ? T[i][cols] : 0), 0);
    if (infeas > 1e-7) return { status: "infeasible" };
    for (let i = 0; i < m; i++) {
      if (basis[i] >= n + m) {
        let pc = -1;
        for (let j = 0; j < n + m; j++) if (Math.abs(T[i][j]) > 1e-9) { pc = j; break; }
        if (pc >= 0) pivot(i, pc);
      }
    }
  }
  const cost2 = new Array(cols).fill(0);
  for (let j = 0; j < n; j++) cost2[j] = c[j];
  const st = run(cost2, (j) => j < n + m);
  if (st !== "optimal") return { status: st === "unbounded" ? "unbounded" : "infeasible" };
  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][cols];
  let value = 0;
  for (let j = 0; j < n; j++) value += c[j] * x[j];
  return { status: "optimal", value, x };
}

// ------------------------------------------------------------ parsing

/** Foods, one per line: Name | price per serving | kcal | protein g | carbs g | fat g | fibre g | max servings per day (optional). */
export function parseFoods(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = line.split("|").map((s) => s.trim());
    const name = c[0].replace(/\s+/g, " ");
    const nums = c.slice(1).map((s) => (s === "" ? NaN : Number(s.replace(/^\$/, ""))));
    if (!name || c.length < 7 || nums.slice(0, 6).some((v) => !Number.isFinite(v) || v < 0)) {
      errors.push(`Food line ${i + 1} ("${line.slice(0, 40)}") needs: name | price | kcal | protein | carbs | fat | fibre [| max servings], no negatives.`);
      return;
    }
    if (seen.has(name.toLowerCase())) { errors.push(`"${name}" is listed twice (line ${i + 1}).`); return; }
    seen.add(name.toLowerCase());
    const max = c.length >= 8 && c[7] !== "" ? Number(c[7]) : NaN;
    rows.push({ name, price: nums[0], n: nums.slice(1, 6), max: Number.isFinite(max) && max >= 0 ? max : null });
  });
  return { foods: rows, errors };
}

export const DEFAULTS = { kcalMin: 2000, kcalMax: 2300, proteinMin: 100, carbsMin: "", carbsMax: "", fatMin: 45, fatMax: 80, fiberMin: 28, defaultMax: 4, step: 0.5, daysPerWeek: 7, maxShare: "" };

const bound = (v) => (v === "" || v == null ? null : Number(v));

export function bounds(spec) {
  return {
    kcal: [bound(spec.kcalMin), bound(spec.kcalMax)],
    protein: [bound(spec.proteinMin), null],
    carbs: [bound(spec.carbsMin), bound(spec.carbsMax)],
    fat: [bound(spec.fatMin), bound(spec.fatMax)],
    fiber: [bound(spec.fiberMin), null],
  };
}

export function validateSpec(spec) {
  const errs = [];
  if (!spec.foods || spec.foods.length < 2) errs.push("Add at least two foods.");
  if (spec.foods && spec.foods.length > 60) errs.push("This tool handles up to 60 foods.");
  const b = bounds(spec);
  for (const k of NUTRIENTS) for (const v of b[k]) if (v !== null && (!Number.isFinite(v) || v < 0)) errs.push(`The ${k} target must be a number, zero or more, or blank.`);
  if (errs.length) return errs;
  if (b.kcal[0] === null) errs.push("Enter a minimum for calories.");
  else if (b.kcal[0] < MIN_SAFE_KCAL) errs.push(`This tool will not build a plan under ${MIN_SAFE_KCAL} calories a day. A very low intake needs a clinician or registered dietitian, not an optimizer.`);
  for (const k of NUTRIENTS) if (b[k][0] !== null && b[k][1] !== null && b[k][0] > b[k][1]) errs.push(`The ${k} minimum is above its maximum.`);
  if (![0, 0.25, 0.5, 1].includes(Number(spec.step))) errs.push("Serving step must be whole, half, quarter or any.");
  const share = shareLimit(spec);
  if (spec.maxShare !== "" && spec.maxShare != null && !(share > 0 && share <= 1)) errs.push("Most calories from one food must be a percentage above 0 and up to 100, or blank.");
  if (share !== null && share < 1 && spec.foods.length * share < 1 - 1e-9) errs.push(`With ${spec.foods.length} foods no food can stay under ${Math.round(share * 100)}% of calories; raise the limit or add foods.`);
  if (!(Number(spec.defaultMax) > 0)) errs.push("Default maximum servings per food must be above zero.");
  return errs;
}

// ------------------------------------------------------------ model

/** Largest share of the day's calories any one food may supply, as a fraction (the form takes a percentage), or null when unset. */
function shareLimit(spec) {
  if (spec.maxShare === "" || spec.maxShare == null) return null;
  const v = Number(spec.maxShare) / 100;
  return Number.isFinite(v) ? v : NaN;
}

function cap(spec, f) { return f.max == null ? Number(spec.defaultMax) : f.max; }

// Rows over variables y_i = servings / step (or servings when step is 0).
function buildRows(spec, lo, hi, minScale = {}) {
  const foods = spec.foods, step = Number(spec.step) || 1, b = bounds(spec);
  const n = foods.length;
  const rows = [];
  NUTRIENTS.forEach((k, ki) => {
    const a = foods.map((f) => f.n[ki] * step);
    let base = 0;
    for (let i = 0; i < n; i++) base += a[i] * lo[i];
    const [mn, mx] = b[k];
    if (mn !== null) rows.push({ a, rel: ">=", b: mn + (minScale[k] || 0) - base });
    if (mx !== null) rows.push({ a, rel: "<=", b: mx - base });
  });
  const share = shareLimit(spec);
  if (share !== null && share < 1) {
    // variety: kcal_i * x_i <= share * (total kcal), one row per food
    for (let i = 0; i < n; i++) {
      const a = foods.map((f, j) => step * ((i === j ? f.n[0] : 0) - share * f.n[0]));
      let base = 0;
      for (let j = 0; j < n; j++) base += a[j] * lo[j];
      rows.push({ a, rel: "<=", b: -base });
    }
  }
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(hi[i])) { const a = new Array(n).fill(0); a[i] = 1; rows.push({ a, rel: "<=", b: hi[i] - lo[i] }); }
  }
  return rows;
}

function relaxed(spec, lo, hi, minScale) {
  const step = Number(spec.step) || 1;
  const c = spec.foods.map((f) => -f.price * step);
  const res = simplex(c, buildRows(spec, lo, hi, minScale));
  if (res.status !== "optimal") return res;
  const y = res.x.map((v, i) => v + lo[i]);
  const cost = spec.foods.reduce((s, f, i) => s + f.price * step * y[i], 0);
  return { status: "optimal", cost, y };
}

function stepBounds(spec) {
  const step = Number(spec.step) || 1;
  const exact = Number(spec.step) > 0;
  const hi = spec.foods.map((f) => (exact ? Math.floor(cap(spec, f) / step + 1e-9) : cap(spec, f)));
  return { lo: spec.foods.map(() => 0), hi };
}

export function nutrition(spec, servings) {
  return NUTRIENTS.map((k, ki) => spec.foods.reduce((s, f, i) => s + f.n[ki] * servings[i], 0));
}

export function planFeasible(spec, servings) {
  const t = nutrition(spec, servings), b = bounds(spec);
  const share = shareLimit(spec);
  if (share !== null && share < 1 && spec.foods.some((f, i) => f.n[0] * servings[i] > share * t[0] + 1e-6)) return false;
  return NUTRIENTS.every((k, ki) => (b[k][0] === null || t[ki] >= b[k][0] - 1e-6) && (b[k][1] === null || t[ki] <= b[k][1] + 1e-6)) &&
    servings.every((s, i) => s >= -1e-9 && s <= cap(spec, spec.foods[i]) + 1e-9);
}

export const planCost = (spec, servings) => spec.foods.reduce((s, f, i) => s + f.price * servings[i], 0);

function branchAndBound(spec, nodeLimit) {
  const { lo: lo0, hi: hi0 } = stepBounds(spec);
  const step = Number(spec.step);
  const root = relaxed(spec, lo0, hi0);
  if (root.status !== "optimal") return { status: root.status };
  const n = spec.foods.length;
  let best = null, nodes = 0, exhausted = true;
  const consider = (y) => {
    const s = y.map((v) => v * step);
    if (planFeasible(spec, s)) { const c = planCost(spec, s); if (!best || c < best.cost - 1e-9) best = { y: y.slice(), cost: c }; }
  };
  // Rounding the continuous optimum up keeps every minimum; it may break a maximum, which consider() checks.
  consider(root.y.map((v, i) => Math.min(hi0[i], Math.ceil(v - 1e-7))));
  const stack = [{ lo: lo0, hi: hi0, bound: root.cost, sol: root }];
  while (stack.length) {
    const node = stack.pop();
    if (best && node.bound >= best.cost - 1e-7) continue;
    if (++nodes > nodeLimit) { exhausted = false; break; }
    const sol = node.sol || relaxed(spec, node.lo, node.hi);
    if (sol.status !== "optimal") continue;
    if (best && sol.cost >= best.cost - 1e-7) continue;
    let branch = -1, worst = 1e-6;
    for (let i = 0; i < n; i++) {
      const f = Math.abs(sol.y[i] - Math.round(sol.y[i]));
      if (f > worst) { worst = f; branch = i; }
    }
    if (branch < 0) { consider(sol.y.map((v) => Math.round(v))); continue; }
    consider(sol.y.map((v, i) => Math.min(node.hi[i], Math.ceil(v - 1e-7))));
    const v = sol.y[branch];
    const down = { lo: node.lo, hi: node.hi.slice(), bound: sol.cost };
    down.hi[branch] = Math.floor(v);
    const up = { lo: node.lo.slice(), hi: node.hi, bound: sol.cost };
    up.lo[branch] = Math.ceil(v);
    if (v - Math.floor(v) >= 0.5) stack.push(down, up); else stack.push(up, down);
  }
  return { status: best ? "optimal" : "infeasible", best, nodes, exact: exhausted, bound: root.cost };
}

/** Cost of the continuous plan with one minimum raised by `delta`. */
function costWithRaised(spec, key, delta) {
  const { lo, hi } = stepBounds(spec);
  const r = relaxed(spec, lo, hi, { [key]: delta });
  return r.status === "optimal" ? r.cost : null;
}

/** A shopper's rule of thumb: keep adding the food that closes the most of the remaining shortfall per dollar. */
export function greedyPlan(spec) {
  const b = bounds(spec), foods = spec.foods, step = Number(spec.step) || 0.5;
  const s = foods.map(() => 0);
  for (let it = 0; it < 4000; it++) {
    const t = nutrition(spec, s);
    const short = NUTRIENTS.map((k, ki) => (b[k][0] === null ? 0 : Math.max(0, b[k][0] - t[ki]) / Math.max(b[k][0], 1)));
    if (short.every((v) => v <= 1e-9)) break;
    let pick = -1, bestV = 0;
    foods.forEach((f, i) => {
      if (s[i] + step > cap(spec, f) + 1e-9) return;
      let gain = 0;
      NUTRIENTS.forEach((k, ki) => { if (b[k][0] !== null) gain += Math.min(short[ki], (f.n[ki] * step) / Math.max(b[k][0], 1)); });
      const v = gain / Math.max(f.price * step, 1e-6);
      if (v > bestV + 1e-12) { bestV = v; pick = i; }
    });
    if (pick < 0) break;
    s[pick] += step;
  }
  return { servings: s, feasible: planFeasible(spec, s), cost: planCost(spec, s) };
}

export function solve(spec, nodeLimit = 3000) {
  const exact = Number(spec.step) > 0;
  const { lo, hi } = stepBounds(spec);
  const root = relaxed(spec, lo, hi);
  if (root.status !== "optimal") return { status: root.status };
  let servings, nodes = 0, isExact = true, bound = root.cost;
  if (exact) {
    const bb = branchAndBound(spec, nodeLimit);
    if (bb.status !== "optimal") return { status: "infeasible-at-step", bound: root.cost };
    servings = bb.best.y.map((v) => v * Number(spec.step));
    nodes = bb.nodes; isExact = bb.exact; bound = bb.bound;
  } else servings = root.y;
  const cost = planCost(spec, servings);
  const totals = nutrition(spec, servings);
  const marginal = {};
  const b = bounds(spec);
  const unit = { kcal: 100, protein: 10, carbs: 10, fat: 10, fiber: 5 };
  for (const k of NUTRIENTS) {
    if (b[k][0] === null) continue;
    const c2 = costWithRaised(spec, k, unit[k]);
    marginal[k] = c2 === null ? null : { per: unit[k], extra: Math.max(0, c2 - root.cost) };
  }
  const greedy = greedyPlan(spec);
  const items = spec.foods.map((f, i) => ({ index: i, name: f.name, servings: servings[i], cost: f.price * servings[i], nutrients: f.n.map((v) => v * servings[i]) })).filter((x) => x.servings > 1e-6).sort((a, b2) => b2.cost - a.cost);
  return { status: "optimal", servings, items, totals, cost, weekly: cost * spec.daysPerWeek, bound, gap: cost - root.cost, exact: isExact, nodes, marginal, greedy, feasible: planFeasible(spec, servings) };
}

/** Cost of the optimal continuous plan as the protein minimum rises, for the "what does protein cost" table. */
export function proteinFrontier(spec, targets) {
  const { lo, hi } = stepBounds(spec);
  return targets.map((p) => {
    const r = relaxed({ ...spec, proteinMin: p }, lo, hi);
    return { protein: p, cost: r.status === "optimal" ? r.cost : null };
  });
}

/** Independent check of a result. */
export function verifyPlan(spec, res) {
  const problems = [];
  if (res.status !== "optimal") return problems;
  if (!planFeasible(spec, res.servings)) problems.push("The plan breaks a nutrient bound or a serving cap.");
  if (Math.abs(planCost(spec, res.servings) - res.cost) > 1e-6) problems.push("Reported cost does not match the servings.");
  const step = Number(spec.step);
  if (step > 0) for (const s of res.servings) if (Math.abs(s / step - Math.round(s / step)) > 1e-6) problems.push("A serving count is not a multiple of the step.");
  if (res.cost < res.bound - 1e-6) problems.push("Cost is below the continuous lower bound, which cannot be.");
  return problems;
}

export const money2 = (x) => (Number.isFinite(x) ? (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2) : "—");
export const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");

export function planCsv(spec, res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Food", "Servings per day", "Cost per day", "kcal", "Protein g", "Carbs g", "Fat g", "Fibre g"].join(",")];
  for (const it of res.items) rows.push([q(it.name), it.servings, it.cost.toFixed(2), ...it.nutrients.map((v) => v.toFixed(1))].join(","));
  rows.push([q("Total"), "", res.cost.toFixed(2), ...res.totals.map((v) => v.toFixed(1))].join(","));
  return rows.join("\n") + "\n";
}

// Approximate generic nutrition per the serving named; EXAMPLE prices, edit to your store.
export const SAMPLE_FOODS = [
  "Rice, white, dry (50 g) | 0.15 | 180 | 3.5 | 40 | 0.3 | 0.7",
  "Lentils, dry (50 g) | 0.20 | 170 | 12.5 | 30 | 0.5 | 8",
  "Black beans, dry (50 g) | 0.20 | 170 | 10.8 | 31 | 0.7 | 7.8",
  "Rolled oats (40 g) | 0.12 | 156 | 6.8 | 26.4 | 2.8 | 4.2",
  "Egg, large (1) | 0.30 | 72 | 6.3 | 0.4 | 4.8 | 0 | 6",
  "Chicken thigh, raw (100 g) | 0.80 | 121 | 19.7 | 0 | 4.1 | 0 | 4",
  "Peanut butter (2 tbsp) | 0.18 | 190 | 7 | 7 | 16 | 2 | 2",
  "Whole milk (1 cup) | 0.35 | 149 | 7.7 | 11.7 | 7.9 | 0 | 3",
  "Banana (1) | 0.25 | 105 | 1.3 | 27 | 0.4 | 3.1 | 3",
  "Carrots (100 g) | 0.15 | 41 | 0.9 | 9.6 | 0.2 | 2.8",
  "Broccoli, frozen (100 g) | 0.30 | 34 | 2.8 | 6.6 | 0.4 | 2.6",
  "Whole wheat bread (1 slice) | 0.15 | 70 | 3 | 12 | 1 | 2 | 6",
  "Cooking oil (1 tbsp) | 0.08 | 120 | 0 | 0 | 14 | 0 | 3",
  "Tuna in water, canned (85 g) | 1.00 | 100 | 22 | 0 | 1 | 0 | 2",
  "Greek yogurt, nonfat (170 g) | 0.80 | 100 | 17 | 6 | 0.7 | 0 | 2",
  "Cabbage (100 g) | 0.10 | 25 | 1.3 | 5.8 | 0.1 | 2.5",
  "Potato (150 g) | 0.25 | 116 | 3 | 26 | 0.2 | 3.3",
  "Whey protein (1 scoop, 30 g) | 0.75 | 120 | 24 | 3 | 1.5 | 0 | 2",
  "Cheddar cheese (28 g) | 0.45 | 113 | 7 | 0.4 | 9.3 | 0 | 2",
  "Apple (1) | 0.50 | 95 | 0.5 | 25 | 0.3 | 4.4 | 2",
].join("\n");

export function sampleSpec() {
  return { ...DEFAULTS, foods: parseFoods(SAMPLE_FOODS).foods };
}

// Share link: the food list and targets as a URL fragment (never sent to a server).
export const SHARE_FIELDS = ["kmin", "kmax", "pmin", "fmin", "fmax", "cmin", "cmax", "fibmin", "dmax", "share", "step"];
const SHARE_VALUE = /^[0-9.]*$/;

export function encodeShare(foodsText, fields) {
  const p = new URLSearchParams();
  p.set("foods", String(foodsText));
  for (const k of SHARE_FIELDS) if (fields[k] !== undefined && fields[k] !== "") p.set(k, String(fields[k]));
  return p.toString();
}

// Returns { foods, fields } with only known, numeric-looking fields; anything else is dropped.
export function decodeShare(fragment) {
  const p = new URLSearchParams(String(fragment).replace(/^#/, ""));
  const foods = (p.get("foods") || "").slice(0, 20000);
  const fields = {};
  for (const k of SHARE_FIELDS) {
    const v = p.get(k);
    if (v !== null && SHARE_VALUE.test(v) && v.length <= 12) fields[k] = v;
  }
  return { foods, fields };
}
