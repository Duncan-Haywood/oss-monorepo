// Fertilizer blend optimizer: the least-cost fertilizer program problem. Given
// products with a price per ton and a grade (N, P2O5, K2O, S as % by weight)
// and the nutrient rates a crop needs (lb per acre), find the pounds of each
// product per acre that meet every target at the lowest cost. A linear program
// solved with a two-phase simplex (Bland's rule), the same solver pattern as
// the cattle ration and meal plan optimizers. Shadow prices (the cost of one
// more pound of a nutrient) come from re-solving; the price at which an unused
// product would enter the blend comes from bisection. Pure functions, no I/O.
//
// Arithmetic on figures the user types or edits. The product grades are
// standard guaranteed analyses, the prices are EXAMPLES, and the crop presets
// are rounded rules of thumb. Not agronomic advice: use your soil test and your
// extension service's recommendation for the rates.

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


// ------------------------------------------------------------ targets

export const NUTRIENTS = ["n", "p", "k", "s"];
export const LABEL = { n: "Nitrogen (N)", p: "Phosphate (P2O5)", k: "Potash (K2O)", s: "Sulfur (S)" };

// Rounded rules of thumb in lb of nutrient per acre. Real recommendations
// depend on soil test, yield goal, previous crop, manure and local rules: use
// your soil test and your extension service, and replace these.
export const PRESETS = {
  "corn": { label: "Corn after soybeans (about 180 bu/ac)", n: 150, p: 55, k: 60, s: 10 },
  "corn-corn": { label: "Corn after corn", n: 190, p: 60, k: 60, s: 10 },
  "soy": { label: "Soybeans", n: 0, p: 45, k: 80, s: 0 },
  "wheat": { label: "Winter wheat", n: 100, p: 40, k: 40, s: 10 },
  "grass-hay": { label: "Grass hay (3 tons/ac)", n: 120, p: 40, k: 90, s: 15 },
  "alfalfa": { label: "Alfalfa (established, 5 tons/ac)", n: 0, p: 50, k: 240, s: 20 },
  "garden": { label: "Vegetable garden, per acre equivalent", n: 120, p: 80, k: 100, s: 0 },
};

export const DEFAULTS = { preset: "corn", acres: 160, n: 150, p: 55, k: 60, s: 10, over: null };

export function applyPreset(key, acres) {
  const p = PRESETS[key];
  if (!p) return null;
  return { ...DEFAULTS, ...p, preset: key, acres: acres ?? DEFAULTS.acres };
}

// ------------------------------------------------------------ parsing

/** Products, one per line: Name | $ per ton | N % | P2O5 % | K2O % | S % | max lb product per acre (optional). */
export function parseProducts(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = line.split("|").map((s) => s.trim());
    const name = c[0].replace(/\s+/g, " ");
    const nums = c.slice(1, 6).map((s) => (s === undefined || s === "" ? NaN : Number(s.replace(/^\$/, "").replace(/,/g, ""))));
    if (!name || c.length < 6 || nums.some((v) => !Number.isFinite(v) || v < 0)) {
      errors.push(`Product line ${i + 1} ("${line.slice(0, 40)}") needs: name | $ per ton | N % | P2O5 % | K2O % | S %, no negatives.`);
      return;
    }
    if (nums[1] + nums[2] + nums[3] + nums[4] > 100 + 1e-9) { errors.push(`"${name}" (line ${i + 1}): the grade adds up to more than 100%.`); return; }
    if (nums[1] + nums[2] + nums[3] + nums[4] <= 0) { errors.push(`"${name}" (line ${i + 1}) carries no nutrient.`); return; }
    if (!(nums[0] > 0)) { errors.push(`"${name}" (line ${i + 1}) needs a price above $0 per ton.`); return; }
    if (seen.has(name.toLowerCase())) { errors.push(`"${name}" is listed twice (line ${i + 1}).`); return; }
    seen.add(name.toLowerCase());
    const max = c.length >= 7 && c[6] !== "" ? Number(c[6]) : NaN;
    rows.push({ name, ton: nums[0], n: nums[1], p: nums[2], k: nums[3], s: nums[4], max: Number.isFinite(max) && max >= 0 ? max : null });
  });
  return { products: rows, errors };
}

const lbPrice = (f) => f.ton / 2000;
/** Fraction of a product that is each nutrient. */
const frac = (f) => ({ n: f.n / 100, p: f.p / 100, k: f.k / 100, s: f.s / 100 });
export const gradeLabel = (f) => [f.n, f.p, f.k].map((v) => +v.toFixed(1)).join("-") + (f.s > 0 ? `-${+f.s.toFixed(1)}S` : "");

const hasOver = (spec) => spec.over !== null && spec.over !== undefined && spec.over !== "" && Number.isFinite(Number(spec.over));

export function validateSpec(spec) {
  const errs = [];
  if (!spec.products || spec.products.length < 1) errs.push("Add at least one product.");
  if (spec.products && spec.products.length > 30) errs.push("This tool handles up to 30 products.");
  if (!(Number(spec.acres) > 0)) errs.push("Field acres must be above zero.");
  if (Number(spec.acres) > 1e6) errs.push("Field acres above 1,000,000 is outside what this tool is built for.");
  for (const k of NUTRIENTS) if (!(Number(spec[k]) >= 0) || Number(spec[k]) > 1000) errs.push(`The ${LABEL[k]} target must be between 0 and 1,000 lb per acre.`);
  if (NUTRIENTS.every((k) => !(Number(spec[k]) > 0))) errs.push("Enter a target above zero for at least one nutrient.");
  if (hasOver(spec) && (Number(spec.over) < 0 || Number(spec.over) > 500)) errs.push("Maximum overshoot must be between 0 and 500% (or left blank for no limit).");
  return errs;
}

// ------------------------------------------------------------ model

/** Constraint rows over x = pounds of each product per acre. */
function buildRows(spec, extra) {
  extra = extra || {};
  const prods = spec.products, n = prods.length, fr = prods.map(frac);
  const rows = [];
  for (const k of NUTRIENTS) {
    const t = Number(spec[k]) + (extra[k] || 0);
    if (!(t > 0)) continue;
    const a = fr.map((v) => v[k]);
    rows.push({ a, rel: ">=", b: t });
    if (hasOver(spec)) rows.push({ a: a.slice(), rel: "<=", b: t * (1 + Number(spec.over) / 100) });
  }
  prods.forEach((f, i) => {
    if (f.max !== null) { const a = new Array(n).fill(0); a[i] = 1; rows.push({ a, rel: "<=", b: f.max }); }
  });
  return rows;
}

function relaxed(spec, extra, priceOverride) {
  const c = spec.products.map((f, i) => -(priceOverride && priceOverride.i === i ? priceOverride.ton : f.ton) / 2000);
  const res = simplex(c, buildRows(spec, extra));
  if (res.status !== "optimal") return res;
  return { status: "optimal", x: res.x, cost: -res.value };
}

export function delivered(spec, x) {
  const t = { n: 0, p: 0, k: 0, s: 0 };
  spec.products.forEach((f, i) => { const v = frac(f); for (const k of NUTRIENTS) t[k] += v[k] * x[i]; });
  return t;
}

export const planCost = (spec, x) => spec.products.reduce((s, f, i) => s + lbPrice(f) * x[i], 0);

/** Independent re-check of every target, without the solver. */
export function planFeasible(spec, x, slack = 1e-6) {
  const t = delivered(spec, x);
  if (x.some((v, i) => v < -slack || (spec.products[i].max !== null && v > spec.products[i].max + slack))) return false;
  for (const k of NUTRIENTS) {
    const target = Number(spec[k]);
    if (target > 0) {
      if (t[k] < target - slack) return false;
      if (hasOver(spec) && t[k] > target * (1 + Number(spec.over) / 100) + slack) return false;
    }
  }
  return true;
}

/** Why the problem might be infeasible. */
export function diagnose(spec) {
  const out = [];
  for (const k of NUTRIENTS) {
    if (!(Number(spec[k]) > 0)) continue;
    const reach = spec.products.reduce((s, f) => s + (f.max !== null ? f.max * frac(f)[k] : Infinity), 0);
    if (!spec.products.some((f) => f[k] > 0)) out.push(`No product on the list carries ${LABEL[k]}.`);
    else if (reach < Number(spec[k])) out.push(`The per-product maximums cap ${LABEL[k]} at ${reach.toFixed(0)} lb per acre, below your target.`);
  }
  if (hasOver(spec)) out.push("A maximum overshoot can make a target unreachable when the only source carries other nutrients too. Try raising it or leaving it blank.");
  return out;
}

const BUMP = 10; // lb per acre used to price one more pound of a nutrient

/** The price (per ton) below which an unused product would enter the blend, by bisection. */
function entryPrice(spec, i) {
  const f = spec.products[i];
  const used = (ton) => { const r = relaxed(spec, null, { i, ton }); return r.status === "optimal" && r.x[i] > 0.01; };
  if (!used(0.01)) return null; // even nearly free it does not help
  let lo = 0.01, hi = f.ton;
  for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (used(mid)) lo = mid; else hi = mid; }
  return lo;
}

/**
 * The "obvious" program: for each nutrient, buy the single cheapest source per
 * pound of that nutrient. With credit=true the nutrients a product carries
 * along (the N in DAP) are counted before the next nutrient is bought, in the
 * order P, K, S, N; with credit=false every nutrient is bought on its own.
 * Ignores per-product maximums and overshoot limits, as a back-of-envelope
 * plan would.
 */
export function naivePlan(spec, credit) {
  const prods = spec.products, fr = prods.map(frac);
  const x = new Array(prods.length).fill(0);
  const got = { n: 0, p: 0, k: 0, s: 0 };
  const pick = {};
  for (const k of ["p", "k", "s", "n"]) {
    const target = Number(spec[k]);
    if (!(target > 0)) continue;
    let best = -1, bestPer = Infinity;
    prods.forEach((f, i) => { if (fr[i][k] > 0) { const per = lbPrice(f) / fr[i][k]; if (per < bestPer - 1e-12) { bestPer = per; best = i; } } });
    if (best < 0) return null;
    const need = target - (credit ? got[k] : 0);
    pick[k] = best;
    if (need <= 1e-9) continue;
    const lb = need / fr[best][k];
    x[best] += lb;
    for (const m of NUTRIENTS) got[m] += lb * fr[best][m];
  }
  return { x, cost: planCost(spec, x), pick, feasible: planFeasible(spec, x), delivered: delivered(spec, x) };
}

export function solve(spec) {
  const root = relaxed(spec, null);
  if (root.status !== "optimal") return { status: root.status, hints: diagnose(spec) };
  const x = root.x, acres = Number(spec.acres);
  const items = spec.products
    .map((f, i) => ({ index: i, name: f.name, grade: gradeLabel(f), lb: x[i], cost: lbPrice(f) * x[i], ton: f.ton, tons: (x[i] * acres) / 2000, total: lbPrice(f) * x[i] * acres }))
    .filter((it) => it.lb > 1e-4)
    .sort((a, b) => b.cost - a.cost);
  const nutrientPrice = {};
  for (const k of NUTRIENTS) {
    if (!(Number(spec[k]) > 0)) continue;
    const r = relaxed(spec, { [k]: BUMP });
    nutrientPrice[k] = r.status === "optimal" ? Math.max(0, (r.cost - root.cost) / BUMP) : null;
  }
  const used = new Set(items.map((it) => it.index));
  const entry = [];
  spec.products.forEach((f, i) => { if (!used.has(i)) entry.push({ name: f.name, ton: f.ton, enters: entryPrice(spec, i) }); });
  const naive = naivePlan(spec, true), naiveSep = naivePlan(spec, false);
  const sav = (nv) => (nv ? { cost: nv.cost, perAcre: nv.cost - root.cost, field: (nv.cost - root.cost) * acres, pct: nv.cost > 0 ? ((nv.cost - root.cost) / nv.cost) * 100 : 0, feasible: nv.feasible, pick: nv.pick } : null);
  return {
    status: "optimal", x, items, cost: root.cost, field: root.cost * acres, tonsTotal: (x.reduce((s, v) => s + v, 0) * acres) / 2000,
    delivered: delivered(spec, x), nutrientPrice, entry, naive: sav(naive), naiveSeparate: sav(naiveSep),
    feasible: planFeasible(spec, x),
  };
}

/** Independent check of a result. */
export function verifyPlan(spec, res) {
  const problems = [];
  if (res.status !== "optimal") return problems;
  if (!planFeasible(spec, res.x)) problems.push("The blend misses a target or breaks a product maximum.");
  if (Math.abs(planCost(spec, res.x) - res.cost) > 1e-6) problems.push("Reported cost does not match the pounds.");
  return problems;
}

export const money2 = (x) => (Number.isFinite(x) ? (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2) : "—");
export const money0 = (x) => (Number.isFinite(x) ? (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
export const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");

export function planCsv(spec, res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Product", "Grade", "Lb product per acre", "Cost per acre", "Tons for the field", "Cost for the field"].join(",")];
  for (const it of res.items) rows.push([q(it.name), q(it.grade), it.lb.toFixed(1), it.cost.toFixed(2), it.tons.toFixed(2), it.total.toFixed(2)].join(","));
  rows.push([q("Total"), "", res.x.reduce((s, v) => s + v, 0).toFixed(1), res.cost.toFixed(2), res.tonsTotal.toFixed(2), res.field.toFixed(2)].join(","));
  return rows.join("\n") + "\n";
}

// Standard guaranteed analyses; EXAMPLE prices per ton, edit to your dealer's quote.
export const SAMPLE_PRODUCTS = [
  "# name | $ per ton | N % | P2O5 % | K2O % | S % | max lb product per acre (optional)",
  "Urea 46-0-0 | 520 | 46 | 0 | 0 | 0",
  "UAN 28-0-0 | 400 | 28 | 0 | 0 | 0",
  "Anhydrous ammonia 82-0-0 | 700 | 82 | 0 | 0 | 0",
  "DAP 18-46-0 | 780 | 18 | 46 | 0 | 0",
  "MAP 11-52-0 | 820 | 11 | 52 | 0 | 0",
  "Potash (MOP) 0-0-60 | 600 | 0 | 0 | 60 | 0",
  "Ammonium sulfate 21-0-0-24S | 450 | 21 | 0 | 0 | 24",
  "Custom blend 10-10-10 | 640 | 10 | 10 | 10 | 0",
].join("\n");

export function sampleSpec(key = "corn") {
  return { ...applyPreset(key), products: parseProducts(SAMPLE_PRODUCTS).products };
}
