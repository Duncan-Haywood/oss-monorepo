// Weekly production mix optimizer. Pure functions, no DOM.
//
// The question: you make several things from the same limited hours, ovens,
// machines or staff. Which ones, and how many of each, give the most profit
// this week once you respect those limits, your orders already promised, the
// demand you can actually sell and the batch sizes you can bake or run?
//
// That is a product-mix linear program with integer batches. It is solved here
// with a two-phase simplex (Bland's rule, so it cannot cycle) and, because you
// cannot make 3.4 trays, branch and bound on the batch counts. Optional
// overtime is extra capacity bought at a stated cost. From the continuous
// optimum the tool reads off what one more unit of each resource is worth (the
// shadow price) and how far that holds, and what each product's resource use
// really costs, which is why a high-margin product can be a poor use of an
// oven. Two rule-of-thumb plans (best margin per unit first; best margin per
// unit of the tightest resource first) show what the solver adds.
//
// Arithmetic on figures the user types. No prices, costs or capacities are
// asserted here. Not accounting or tax advice.

export const DEFAULTS = Object.freeze({
  fixedCost: 0, // weekly overhead subtracted from profit, for the headline only
  nodeLimit: 4000,
});

const EPS = 1e-9;
const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const cellsOf = (line) =>
  (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));
const looksHeader = (c, from) => c.length > from && c.slice(from, from + 1).every((x) => x !== "" && Number.isNaN(Number(x.replace(/[$,]/g, ""))));

// Resources: "name, available per week, max overtime (optional), overtime cost per unit (optional)".
export function parseResources(text) {
  const rows = [], warnings = [];
  let skipped = 0, first = true;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const c = cellsOf(line);
    if (c.length < 2) { skipped++; continue; }
    if (first && looksHeader(c, 1)) { first = false; continue; }
    first = false;
    const cap = num(c[1], NaN), otMax = num(c[2], 0), otCost = num(c[3], 0);
    if (!(cap >= 0) || !(otMax >= 0) || !(otCost >= 0) || Number.isNaN(otMax) || Number.isNaN(otCost)) { skipped++; continue; }
    if (otMax > 0 && c[3] === undefined) warnings.push(`"${c[0]}": overtime has no cost entered, so it is treated as free.`);
    rows.push({ name: c[0] || `Resource ${rows.length + 1}`, cap, otMax, otCost });
  }
  if (skipped) warnings.push(`${skipped} resource line${skipped === 1 ? "" : "s"} skipped (need a name and a capacity of 0 or more).`);
  return { rows, warnings };
}

// Products: "name, price, unit cost, min, max, batch size, use of resource 1, use of resource 2, ..."
// Usage columns follow the order of the resource list. Blank max = no demand limit.
export function parseProducts(text, nResources) {
  const rows = [], warnings = [];
  let skipped = 0, first = true;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const c = cellsOf(line);
    if (c.length < 3) { skipped++; continue; }
    if (first && looksHeader(c, 1)) { first = false; continue; }
    first = false;
    const price = num(c[1], NaN), cost = num(c[2], NaN);
    const min = num(c[3], 0), max = c[4] === undefined || c[4] === "" ? Infinity : num(c[4], NaN);
    const batch = num(c[5], 1) || 1;
    const use = [];
    for (let r = 0; r < nResources; r++) use.push(num(c[6 + r], 0));
    if (![price, cost, min, max, batch, ...use].every((x) => !Number.isNaN(x)) || price < 0 || cost < 0 || min < 0 || max < min || batch <= 0 || use.some((u) => u < 0)) { skipped++; continue; }
    if (c.length > 6 + nResources) warnings.push(`"${c[0]}": ${c.length - 6 - nResources} extra column(s) ignored (more usage columns than resources).`);
    rows.push({ name: c[0] || `Product ${rows.length + 1}`, price, cost, margin: price - cost, min, max, batch, use });
  }
  if (skipped) warnings.push(`${skipped} product line${skipped === 1 ? "" : "s"} skipped (need name, price, unit cost; max at least min; no negatives).`);
  return { rows, warnings };
}

// ------------------------------------------------------------ simplex

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

// ------------------------------------------------------------ the model

// Variables: batch counts k_i (product i makes batch_i * k_i units), then overtime y_r.
function solveRelaxed(model, lo, hi, capScale) {
  const { P, R } = model;
  const nP = P.length, nR = R.length;
  const n = nP + nR;
  const c = new Array(n).fill(0);
  let constant = 0;
  for (let i = 0; i < nP; i++) {
    const unitProfit = P[i].margin * P[i].batch;
    c[i] = unitProfit;
    constant += unitProfit * lo[i];
  }
  for (let r = 0; r < nR; r++) c[nP + r] = -R[r].otCost;
  const rows = [];
  for (let r = 0; r < nR; r++) {
    const a = new Array(n).fill(0);
    let base = 0;
    for (let i = 0; i < nP; i++) { a[i] = P[i].use[r] * P[i].batch; base += a[i] * lo[i]; }
    a[nP + r] = -1;
    rows.push({ a, rel: "<=", b: R[r].cap * (capScale && capScale[r] !== undefined ? capScale[r] : 1) - base });
    if (R[r].otMax >= 0) {
      const o = new Array(n).fill(0); o[nP + r] = 1;
      rows.push({ a: o, rel: "<=", b: R[r].otMax });
    }
  }
  for (let i = 0; i < nP; i++) {
    if (Number.isFinite(hi[i])) {
      const a = new Array(n).fill(0); a[i] = 1;
      rows.push({ a, rel: "<=", b: hi[i] - lo[i] });
    }
  }
  const res = simplex(c, rows);
  if (res.status !== "optimal") return res;
  const k = res.x.slice(0, nP).map((v, i) => v + lo[i]);
  return { status: "optimal", value: res.value + constant, k, y: res.x.slice(nP) };
}

function bounds(P) {
  const lo = P.map((p) => Math.ceil(p.min / p.batch - 1e-9));
  const hi = P.map((p) => (Number.isFinite(p.max) ? Math.floor(p.max / p.batch + 1e-9) : Infinity));
  return { lo, hi };
}

// Profit of an integer batch plan, with overtime bought only where the plan needs it.
export function evaluatePlan(model, k) {
  const { P, R } = model;
  const units = P.map((p, i) => k[i] * p.batch);
  const use = R.map((r, j) => P.reduce((s, p, i) => s + p.use[j] * units[i], 0));
  const overtime = R.map((r, j) => Math.max(0, use[j] - r.cap));
  const feasible = overtime.every((o, j) => o <= R[j].otMax + 1e-7);
  const revenue = P.reduce((s, p, i) => s + p.price * units[i], 0);
  const variable = P.reduce((s, p, i) => s + p.cost * units[i], 0);
  const otCost = R.reduce((s, r, j) => s + r.otCost * overtime[j], 0);
  return { units, use, overtime, feasible, revenue, variable, otCost, profit: revenue - variable - otCost };
}

function branchAndBound(model, nodeLimit) {
  const { lo: lo0, hi: hi0 } = bounds(model.P);
  const nP = model.P.length;
  const root = solveRelaxed(model, lo0, hi0);
  if (root.status !== "optimal") return { status: root.status };
  let best = null, nodes = 0, exhausted = true;
  const consider = (k) => {
    const ev = evaluatePlan(model, k);
    if (ev.feasible && (!best || ev.profit > best.ev.profit + 1e-9)) best = { k: k.slice(), ev };
  };
  consider(root.k.map((v, i) => Math.max(lo0[i], Math.floor(v + 1e-7))));
  const stack = [{ lo: lo0, hi: hi0, bound: root.value, sol: root }];
  while (stack.length) {
    const node = stack.pop();
    if (best && node.bound <= best.ev.profit + 1e-7) continue;
    if (++nodes > nodeLimit) { exhausted = false; break; }
    const sol = node.sol || solveRelaxed(model, node.lo, node.hi);
    if (sol.status !== "optimal") continue;
    if (best && sol.value <= best.ev.profit + 1e-7) continue;
    let branch = -1, worst = 1e-6;
    for (let i = 0; i < nP; i++) {
      const f = Math.abs(sol.k[i] - Math.round(sol.k[i]));
      if (f > worst) { worst = f; branch = i; }
    }
    if (branch < 0) { consider(sol.k.map((v) => Math.round(v))); continue; }
    consider(sol.k.map((v, i) => Math.max(node.lo[i], Math.floor(v + 1e-7))));
    const v = sol.k[branch];
    const down = { lo: node.lo, hi: node.hi.slice(), bound: sol.value };
    down.hi[branch] = Math.floor(v);
    const up = { lo: node.lo.slice(), hi: node.hi, bound: sol.value };
    up.lo[branch] = Math.ceil(v);
    // explore the branch nearer the fraction first (pushed last)
    if (v - Math.floor(v) >= 0.5) { stack.push(down, up); } else { stack.push(up, down); }
  }
  return { status: best ? "optimal" : "infeasible", best, nodes, exact: exhausted, bound: root.value, root };
}

// ------------------------------------------------------------ sensitivity

function profitWithCap(model, scale) {
  const { lo, hi } = bounds(model.P);
  const r = solveRelaxed(model, lo, hi, scale);
  return r.status === "optimal" ? r.value : -Infinity;
}

// Value of one more unit of each resource (continuous), and how many extra units that value holds for.
function shadowPrices(model, base) {
  const { R } = model;
  return R.map((r, j) => {
    if (r.cap <= 0) return { value: 0, range: 0 };
    const step = Math.max(r.cap * 1e-4, 1e-6);
    const at = (extra) => {
      const scale = R.map(() => 1);
      scale[j] = (r.cap + extra) / r.cap;
      return profitWithCap(model, scale);
    };
    const v = (at(step) - base) / step;
    if (!(v > 1e-6)) return { value: Math.max(0, v), range: 0 };
    let lo = step, hi = r.cap * 4 + 1; // find where the slope stops being v
    const holds = (e) => Math.abs(at(e) - base - v * e) <= 1e-6 * Math.max(1, Math.abs(base));
    if (holds(hi)) return { value: v, range: hi, capped: true };
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (holds(mid)) lo = mid; else hi = mid; }
    return { value: v, range: lo };
  });
}

// ------------------------------------------------------------ rule-of-thumb plans

function greedyPlan(model, order) {
  const { P, R } = model;
  const { lo, hi } = bounds(P);
  const k = lo.slice();
  const used = (kk) => R.map((r, j) => P.reduce((s, p, i) => s + p.use[j] * p.batch * kk[i], 0));
  for (const i of order) {
    // add as many batches as capacity and demand allow, without overtime
    while (k[i] < hi[i]) {
      k[i]++;
      const u = used(k);
      if (u.some((x, j) => x > R[j].cap + 1e-9)) { k[i]--; break; }
      if (!P[i].use.some((x) => x > 0) && k[i] > 1e6) break;
    }
  }
  return { k, ev: evaluatePlan(model, k) };
}

// ------------------------------------------------------------ analyze

export function analyze(products, resources, opts = {}) {
  if (!products.length) return { error: "Add at least one product line." };
  if (!resources.length) return { error: "Add at least one limited resource (hours, machines, staff, ingredient)." };
  const fixedCost = num(opts.fixedCost, 0) || 0;
  const nodeLimit = Math.max(50, num(opts.nodeLimit, DEFAULTS.nodeLimit));
  const P = products, R = resources;
  const model = { P, R };
  const warnings = [];
  const unlimited = P.filter((p) => !Number.isFinite(p.max) && !p.use.some((u) => u > 0));
  if (unlimited.length) return { error: `"${unlimited[0].name}" uses none of your resources and has no maximum, so its profit is unlimited. Enter a demand maximum or its resource use.` };
  const bb = branchAndBound(model, nodeLimit);
  if (bb.status === "unbounded") return { error: "The problem is unbounded: some product can be made without limit. Add a demand maximum or its resource use." };
  if (bb.status !== "optimal") {
    return {
      error: null, infeasible: true, warnings,
      verdict: "No plan meets your minimum quantities within the capacity and overtime you entered. Lower a minimum, add overtime or raise a capacity.",
    };
  }
  const { best } = bb;
  const ev = best.ev;
  const profit = ev.profit;
  const lpValue = bb.bound;
  const baseLp = lpValue;
  const sp = shadowPrices(model, baseLp);
  const tightest = ev.use.map((u, j) => (R[j].cap > 0 ? u / R[j].cap : u > 0 ? Infinity : 0));
  const tightIdx = tightest.indexOf(Math.max(...tightest));
  const oppCost = P.map((p) => p.use.reduce((s, u, j) => s + u * sp[j].value, 0));
  const lines = P.map((p, i) => ({
    name: p.name, batches: best.k[i], units: ev.units[i], batch: p.batch,
    revenue: p.price * ev.units[i], cost: p.cost * ev.units[i], margin: p.margin * ev.units[i],
    unitMargin: p.margin, oppCost: oppCost[i], netUnit: p.margin - oppCost[i],
    atMax: Number.isFinite(p.max) && ev.units[i] >= Math.floor(p.max / p.batch + 1e-9) * p.batch - 1e-9,
    atMin: ev.units[i] <= Math.ceil(p.min / p.batch - 1e-9) * p.batch + 1e-9 && p.min > 0,
  }));
  const resourceRows = R.map((r, j) => ({
    name: r.name, cap: r.cap, used: ev.use[j], overtime: ev.overtime[j], otMax: r.otMax, otCost: r.otCost,
    utilisation: r.cap > 0 ? ev.use[j] / r.cap : NaN, shadow: sp[j].value, shadowRange: sp[j].range, shadowCapped: !!sp[j].capped,
    binding: sp[j].value > 1e-6,
  }));
  // Rule-of-thumb plans
  const byMargin = greedyPlan(model, P.map((_, i) => i).sort((a, b) => P[b].margin - P[a].margin || a - b));
  const tj = tightIdx;
  const perTight = (i) => (P[i].use[tj] > 0 ? P[i].margin / P[i].use[tj] : Infinity);
  const byTight = greedyPlan(model, P.map((_, i) => i).sort((a, b) => perTight(b) - perTight(a) || a - b));
  const result = {
    products: P, resources: R, warnings,
    plan: { lines, resources: resourceRows, revenue: ev.revenue, variable: ev.variable, overtimeCost: ev.otCost, profit, netProfit: profit - fixedCost, fixedCost },
    solver: { nodes: bb.nodes, exact: bb.exact, lpBound: lpValue, gap: Math.max(0, lpValue - profit), gapPct: lpValue > 0 ? Math.max(0, (lpValue - profit) / lpValue) : 0 },
    tightest: { index: tightIdx, name: R[tightIdx].name, utilisation: tightest[tightIdx] },
    rules: {
      byMargin: { profit: byMargin.ev.profit, units: byMargin.ev.units, feasible: byMargin.ev.feasible },
      byTight: { profit: byTight.ev.profit, units: byTight.ev.units, feasible: byTight.ev.feasible, resource: R[tightIdx].name },
    },
  };
  result.verdict = verdictText(result);
  return result;
}

export function money(x) { return Number.isFinite(x) ? (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("en-US") : "—"; }
export function money2(x) { return Number.isFinite(x) ? (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2) : "—"; }
export function pct(x, d = 0) { return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—"; }
export function fmt(x, d = 1) { return Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—"; }

function verdictText(r) {
  const { plan, tightest, rules, solver } = r;
  const made = plan.lines.filter((l) => l.units > 0).length;
  let s = `The most profitable plan makes ${made} of ${plan.lines.length} products for ${money(plan.profit)} a week in contribution${plan.fixedCost ? ` (${money(plan.netProfit)} after ${money(plan.fixedCost)} fixed costs)` : ""}.`;
  const bind = plan.resources.filter((x) => x.binding).sort((p, q) => q.shadow - p.shadow);
  if (bind.length) s += ` Limiting: ${bind.map((x) => `${x.name} (one more unit is worth about ${money2(x.shadow)})`).join(", ")}.`;
  else s += " No resource is a bottleneck: demand, not capacity, limits you.";
  const ruleBest = Math.max(rules.byMargin.profit, rules.byTight.profit);
  if (plan.profit - ruleBest > 0.5) s += ` That beats the best rule-of-thumb plan by ${money(plan.profit - ruleBest)} a week.`;
  if (!solver.exact) s += ` The batch search stopped at its limit; the plan is within ${pct(solver.gapPct, 1)} of the continuous upper bound.`;
  return s;
}

export function reportCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const out = [["product", "units", "batches", "unit_margin", "weekly_margin", "resource_cost_per_unit", "net_per_unit"].join(",")];
  for (const l of r.plan.lines) out.push([q(l.name), l.units, l.batches, l.unitMargin.toFixed(2), l.margin.toFixed(2), l.oppCost.toFixed(2), l.netUnit.toFixed(2)].join(","));
  out.push("");
  out.push(["resource", "capacity", "used", "overtime", "utilisation", "value_of_one_more"].join(","));
  for (const x of r.plan.resources) out.push([q(x.name), x.cap, +x.used.toFixed(3), +x.overtime.toFixed(3), Number.isFinite(x.utilisation) ? +x.utilisation.toFixed(3) : "", +x.shadow.toFixed(2)].join(","));
  return out.join("\n");
}

export function sampleResources() {
  return [
    "Oven hours, 34, 4, 22",
    "Mixer hours, 20",
    "Labour hours, 40",
  ].join("\n");
}

export function sampleProducts() {
  return [
    "Sourdough loaf, 7.50, 2.10, 40, 220, 1, 0.10, 0.05, 0.12",
    "Croissant (trays of 12), 3.80, 1.05, 0, 600, 12, 0.05, 0.03, 0.10",
    "Cinnamon roll (trays of 6), 4.25, 1.30, 0, 300, 6, 0.06, 0.04, 0.11",
    "Custom cake, 48.00, 11.50, 0, 12, 1, 0.9, 0.5, 2.2",
    "Baguette, 3.50, 0.80, 0, 400, 1, 0.07, 0.03, 0.07",
    "Cookie box (10 per batch), 12.00, 3.20, 0, 100, 10, 0.15, 0.08, 0.25",
  ].join("\n");
}
