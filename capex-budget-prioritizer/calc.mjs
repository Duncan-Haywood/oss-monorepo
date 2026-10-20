// Capex budget prioritizer. Pure functions, no DOM, no network.
// A small business has more equipment, vehicle, software or building projects on its wish list than cash. This picks the set
// with the highest total net present value that fits the budget, by checking every combination exactly (at most 12 projects,
// so 4,096 sets). A project can be one of several mutually exclusive options (two quotes for the same oven) or a must-do.
// It also compares the exact answer with the usual shortcuts (cheapest payback first, best return per dollar first), draws
// the frontier of best value at every budget level, and re-solves at a higher and lower discount rate to see whether the
// answer is fragile.

export const MAX_PROJECTS = 12;
export const SHARED_DEFAULTS = { budget: 0, discountPct: 12 };
export const ITEM_DEFAULTS = { name: "", cost: 0, annualBenefit: 0, years: 5, salvage: 0, group: "", mustDo: 0 };

// Placeholder example figures, not any business's costs or savings.
export const EXAMPLE_SHARED = { budget: 35000, discountPct: 12 };
export const EXAMPLE_ITEMS = [
  { name: "New delivery van", cost: 38000, annualBenefit: 9500, years: 7, salvage: 8000, group: "van", mustDo: 0 },
  { name: "Used delivery van", cost: 21000, annualBenefit: 7000, years: 5, salvage: 4000, group: "van", mustDo: 0 },
  { name: "Convection oven", cost: 14500, annualBenefit: 4800, years: 8, salvage: 1000, group: "", mustDo: 0 },
  { name: "Online ordering system", cost: 6000, annualBenefit: 3600, years: 4, salvage: 0, group: "", mustDo: 0 },
  { name: "LED lighting retrofit", cost: 9000, annualBenefit: 2700, years: 10, salvage: 0, group: "", mustDo: 0 },
  { name: "Walk-in cooler repair", cost: 7500, annualBenefit: 2000, years: 6, salvage: 0, group: "", mustDo: 1 },
  { name: "Packaging machine", cost: 26000, annualBenefit: 6200, years: 8, salvage: 3000, group: "", mustDo: 0 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

export function cleanShared(s = {}) {
  return {
    budget: Math.max(0, num(s.budget, SHARED_DEFAULTS.budget)),
    discountPct: Math.min(100, Math.max(0, num(s.discountPct, SHARED_DEFAULTS.discountPct))),
  };
}

export function cleanItems(items = []) {
  const out = [];
  const warnings = [];
  items.slice(0, MAX_PROJECTS).forEach((raw, i) => {
    const t = raw || {};
    const cost = num(t.cost);
    const benefit = num(t.annualBenefit);
    const name = String(t.name ?? "").trim() || `Project ${i + 1}`;
    if (cost <= 0 && benefit === 0) return; // untouched row
    if (cost <= 0) { warnings.push(`${name}: enter what it costs up front; the project was left out.`); return; }
    out.push({
      name, cost, benefit,
      years: Math.min(40, Math.max(1, Math.round(num(t.years, 5)))),
      salvage: Math.max(0, num(t.salvage)),
      group: String(t.group ?? "").trim().toLowerCase(),
      must: num(t.mustDo) > 0 || t.mustDo === true || /^(y|yes|true|x)$/i.test(String(t.mustDo ?? "").trim()),
    });
  });
  return { items: out, warnings };
}

export function npv(p, rate) {
  const r = rate / 100;
  let v = -p.cost;
  for (let t = 1; t <= p.years; t++) v += p.benefit / (1 + r) ** t;
  return v + p.salvage / (1 + r) ** p.years;
}

// Rate at which the project's NPV is zero. null when it never pays back (NPV < 0 even at 0%) or has no sign change.
export function irr(p) {
  if (npv(p, 0) <= 0) return null;
  let lo = 0, hi = 1000;
  if (npv(p, hi) > 0) return hi;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (npv(p, mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function paybackYears(p) {
  if (p.benefit <= 0) return null;
  const y = p.cost / p.benefit;
  return y <= p.years ? y : null; // not earned back within its own life, ignoring salvage
}

// Exhaustive search. Returns every feasible set as {mask, cost, value}.
function feasibleSets(projects, values, budget) {
  const n = projects.length;
  const mustMask = projects.reduce((m, p, i) => (p.must ? m | (1 << i) : m), 0);
  const groups = new Map();
  projects.forEach((p, i) => { if (p.group) groups.set(p.group, (groups.get(p.group) || 0) | (1 << i)); });
  const groupMasks = [...groups.values()];
  const sets = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    if ((mask & mustMask) !== mustMask) continue;
    if (groupMasks.some((g) => { const x = mask & g; return x & (x - 1); })) continue;
    let cost = 0, value = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { cost += projects[i].cost; value += values[i]; }
    if (cost > budget + 1e-9) continue;
    sets.push({ mask, cost, value });
  }
  return sets;
}

const better = (a, b) => !b || a.value > b.value + 1e-9 || (Math.abs(a.value - b.value) <= 1e-9 && a.cost < b.cost);

export function solve(projects, rate, budget) {
  const values = projects.map((p) => npv(p, rate));
  const sets = feasibleSets(projects, values, budget);
  if (!sets.length) return { feasible: false, values, best: null, sets };
  // Must-do projects stay in whatever their NPV; any other project joins only if it adds value.
  let best = null;
  for (const s of sets) if (better(s, best)) best = s;
  return { feasible: true, values, best, sets };
}

// Shortcut a business often uses: take projects in some order while each still fits (one per group, must-dos first).
function greedy(projects, values, budget, key) {
  const order = projects.map((_, i) => i).filter((i) => !projects[i].must && values[i] > 0).sort((a, b) => key(b) - key(a));
  const chosen = new Set(projects.map((p, i) => (p.must ? i : -1)).filter((i) => i >= 0));
  let spent = [...chosen].reduce((s, i) => s + projects[i].cost, 0);
  const usedGroups = new Set([...chosen].map((i) => projects[i].group).filter(Boolean));
  for (const i of order) {
    const g = projects[i].group;
    if ((g && usedGroups.has(g)) || spent + projects[i].cost > budget + 1e-9) continue;
    chosen.add(i); spent += projects[i].cost; if (g) usedGroups.add(g);
  }
  return { chosen: [...chosen].sort((a, b) => a - b), cost: spent, value: [...chosen].reduce((s, i) => s + values[i], 0) };
}

export function frontier(sets) {
  const sorted = [...sets].sort((a, b) => a.cost - b.cost || b.value - a.value);
  const out = [];
  let top = -Infinity;
  for (const s of sorted) if (s.value > top + 1e-9) { out.push({ cost: s.cost, value: s.value, mask: s.mask }); top = s.value; }
  return out;
}

const members = (mask, n) => Array.from({ length: n }, (_, i) => i).filter((i) => mask & (1 << i));

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items: projects, warnings } = cleanItems(rawItems);
  const res = { ok: false, warnings: [...warnings], shared, projects };
  if (!projects.length) { res.warnings.push("Enter at least one project with a cost."); return res; }
  if (shared.budget <= 0) { res.warnings.push("Enter the budget you have to spend."); return res; }

  const n = projects.length;
  const sol = solve(projects, shared.discountPct, shared.budget);
  const mustCost = projects.filter((p) => p.must).reduce((s, p) => s + p.cost, 0);
  if (!sol.feasible) {
    res.warnings.push(`The must-do projects cost ${money(mustCost)} (or two of them are mutually exclusive), which is more than the ${money(shared.budget)} budget.`);
    return res;
  }
  const values = sol.values;
  const rows = projects.map((p, i) => ({
    name: p.name, cost: p.cost, benefit: p.benefit, years: p.years, must: p.must, group: p.group,
    npv: values[i], pi: values[i] / p.cost, irr: irr(p), payback: paybackYears(p),
    chosen: !!(sol.best.mask & (1 << i)),
  }));

  const byPayback = greedy(projects, values, shared.budget, (i) => (paybackYears(projects[i]) ? 1 / paybackYears(projects[i]) : 0));
  const byIndex = greedy(projects, values, shared.budget, (i) => values[i] / projects[i].cost);
  const front = frontier(feasibleSets(projects, values, Infinity));
  const next = front.find((f) => f.cost > sol.best.cost + 1e-9 && f.value > sol.best.value + 1e-9) || null;

  const sens = [-5, 5].map((d) => {
    const rate = Math.max(0, shared.discountPct + d);
    const s = solve(projects, rate, shared.budget);
    return { rate, mask: s.best.mask, value: s.best.value, same: s.best.mask === sol.best.mask };
  });

  res.ok = true;
  res.rows = rows;
  res.best = { mask: sol.best.mask, cost: sol.best.cost, value: sol.best.value, names: members(sol.best.mask, n).map((i) => projects[i].name) };
  res.unspent = shared.budget - sol.best.cost;
  res.byPayback = { ...byPayback, names: byPayback.chosen.map((i) => projects[i].name) };
  res.byIndex = { ...byIndex, names: byIndex.chosen.map((i) => projects[i].name) };
  res.shortcutLoss = Math.max(0, sol.best.value - Math.max(byPayback.value, byIndex.value));
  res.frontier = front.map((f) => ({ ...f, names: members(f.mask, n).map((i) => projects[i].name) }));
  res.next = next && { extraBudget: next.cost - sol.best.cost, extraValue: next.value - sol.best.value, names: members(next.mask, n).map((i) => projects[i].name) };
  res.sensitivity = sens;
  res.fragile = sens.some((s) => !s.same);
  res.negative = rows.filter((r) => r.npv <= 0 && !r.must).map((r) => r.name);
  return res;
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["project", "cost", "annual benefit", "years", "npv", "profitability index", "irr %", "payback years", "in the plan"].join(",")];
  for (const r of a.rows) {
    lines.push([q(r.name), r.cost, r.benefit, r.years, r.npv.toFixed(2), r.pi.toFixed(3), r.irr == null ? "" : r.irr.toFixed(1), r.payback == null ? "" : r.payback.toFixed(2), r.chosen ? "yes" : "no"].join(","));
  }
  return lines.join("\n") + "\n";
}
