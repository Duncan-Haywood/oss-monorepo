// Food-truck prep-mix optimizer. Pure functions, no DOM, no network.
// Chooses portions of each menu item to prep for one service to maximise contribution (price after card fees, minus food cost),
// subject to prep-labor minutes, grill/fryer minutes, ingredient cash, and a floor and a ceiling (expected demand) per item.
// A linear program solved exactly by the simplex method; the shadow prices say what one more labor minute, equipment minute
// or ingredient dollar is worth.

export const SHARED_DEFAULTS = { laborMinutes: 0, equipMinutes: 0, cash: 0, cardFeePct: 0, fixedCost: 0 };

export const ITEM_DEFAULTS = {
  name: "", price: 0, foodCost: 0, prepMinutes: 0, equipMinutes: 0, minPortions: 0, maxPortions: 0, current: 0,
};

// Placeholder example rows, not any truck's prices or costs.
export const EXAMPLE_SHARED = { laborMinutes: 330, equipMinutes: 260, cash: 600, cardFeePct: 3, fixedCost: 250 };
export const EXAMPLE_ITEMS = [
  { name: "Brisket sandwich", price: 15, foodCost: 5.6, prepMinutes: 2.5, equipMinutes: 1.2, minPortions: 0, maxPortions: 90, current: 50 },
  { name: "Loaded fries", price: 9, foodCost: 2.1, prepMinutes: 1.5, equipMinutes: 1.8, minPortions: 0, maxPortions: 120, current: 50 },
  { name: "Street tacos (3)", price: 12, foodCost: 3.4, prepMinutes: 2.2, equipMinutes: 1.0, minPortions: 0, maxPortions: 100, current: 40 },
  { name: "Lemonade", price: 4, foodCost: 0.6, prepMinutes: 0.4, equipMinutes: 0, minPortions: 0, maxPortions: 150, current: 60 },
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
    laborMinutes: Math.max(0, num(s.laborMinutes, d.laborMinutes)), // 0 = no limit
    equipMinutes: Math.max(0, num(s.equipMinutes, d.equipMinutes)), // 0 = no limit
    cash: Math.max(0, num(s.cash, d.cash)), // 0 = no limit
    cardFeePct: Math.min(100, Math.max(0, num(s.cardFeePct, d.cardFeePct))),
    fixedCost: Math.max(0, num(s.fixedCost, d.fixedCost)),
  };
}

// An item with no price is left out. A blank or zero ceiling means "no demand limit" -- but with no limit and no
// binding resource the plan is unbounded, which analyze() reports instead of inventing a number.
export function cleanItems(items = [], shared = cleanShared()) {
  const out = [];
  const keep = 1 - shared.cardFeePct / 100;
  items.forEach((c, i) => {
    const p = num(c.price);
    if (p <= 0) return;
    const min = Math.max(0, num(c.minPortions));
    const rawMax = num(c.maxPortions);
    const cost = Math.max(0, num(c.foodCost));
    out.push({
      index: i,
      name: String(c.name || "").trim() || "Item " + (i + 1),
      price: p,
      cost,
      margin: p * keep - cost,
      prep: Math.max(0, num(c.prepMinutes)),
      equip: Math.max(0, num(c.equipMinutes)),
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

// Solve the prep mix. Substitutes portions = min + y so floors become part of the right-hand side.
export function optimize(items, shared) {
  const n = items.length;
  const rows = [], rhs = [], tag = [];
  const sum = (f) => items.reduce((s, k) => s + k.min * f(k), 0);
  if (shared.laborMinutes > 0) { rows.push(items.map((k) => k.prep)); rhs.push(shared.laborMinutes - sum((k) => k.prep)); tag.push("labor"); }
  if (shared.equipMinutes > 0) { rows.push(items.map((k) => k.equip)); rhs.push(shared.equipMinutes - sum((k) => k.equip)); tag.push("equip"); }
  if (shared.cash > 0) { rows.push(items.map((k) => k.cost)); rhs.push(shared.cash - sum((k) => k.cost)); tag.push("cash"); }
  items.forEach((k, j) => {
    if (Number.isFinite(k.max)) {
      rows.push(items.map((_, q) => (q === j ? 1 : 0))); rhs.push(k.max - k.min); tag.push("cap:" + j);
    }
  });
  const short = [];
  tag.forEach((t, i) => { if (!t.startsWith("cap:") && rhs[i] < -EPS) short.push(t); });
  if (short.length) return { feasible: false, short };
  // Only items with a positive margin can raise the objective; an item with a negative margin and a floor still gets its floor.
  const r = simplex(items.map((k) => k.margin), rows, rhs);
  if (r.unbounded) return { feasible: false, short: ["unbounded"] };
  const portions = r.y.map((v, j) => items[j].min + (v < 1e-9 ? 0 : v));
  const dual = (t) => { const i = tag.indexOf(t); return i < 0 ? 0 : Math.max(0, r.duals[i]); };
  return {
    feasible: true,
    portions,
    shadow: { labor: dual("labor"), equip: dual("equip"), cash: dual("cash") },
    reduced: r.reduced.slice(0, n).map((v) => Math.max(0, v)),
  };
}

export function evaluate(items, portions, shared) {
  let margin = 0, labor = 0, equip = 0, cash = 0, units = 0, revenue = 0;
  items.forEach((k, j) => {
    const q = portions[j];
    units += q; margin += q * k.margin; labor += q * k.prep; equip += q * k.equip; cash += q * k.cost; revenue += q * k.price;
  });
  return { units, margin, labor, equip, cash, revenue, net: margin - shared.fixedCost };
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const items = cleanItems(rawItems, shared);
  const warnings = [];
  if (!items.length) warnings.push("Enter at least one menu item with a price.");
  if (warnings.length) return { ok: false, warnings };
  const sol = optimize(items, shared);
  if (!sol.feasible) {
    if (sol.short.includes("unbounded")) {
      return { ok: false, warnings: ["No best plan: an item with no demand ceiling and a positive margin is not held back by any limit. Enter a most-portions figure or a labor, equipment or cash limit."] };
    }
    const what = { labor: "the minimum portions need more prep minutes than you have", equip: "the minimum portions need more grill or fryer minutes than you have", cash: "the minimum portions cost more than your ingredient cash" };
    return { ok: false, warnings: sol.short.map((s) => "No plan fits: " + (what[s] || "the limits cannot be met") + ".") };
  }
  const best = evaluate(items, sol.portions, shared);
  const cur = items.map((k) => k.current);
  const hasCurrent = cur.some((v) => v > 0);
  const current = evaluate(items, cur, shared);
  if (hasCurrent) {
    if (shared.laborMinutes > 0 && current.labor > shared.laborMinutes + 1e-6) warnings.push("Your current plan needs " + current.labor.toFixed(0) + " prep minutes, more than the " + shared.laborMinutes.toFixed(0) + " you entered.");
    if (shared.equipMinutes > 0 && current.equip > shared.equipMinutes + 1e-6) warnings.push("Your current plan needs " + current.equip.toFixed(0) + " grill or fryer minutes, more than the " + shared.equipMinutes.toFixed(0) + " you entered.");
    if (shared.cash > 0 && current.cash > shared.cash + 1e-6) warnings.push("Your current plan costs " + money(current.cash) + " in ingredients, more than the cash you entered.");
  }
  const rows = items.map((k, j) => ({
    name: k.name, margin: k.margin, current: k.current, optimal: sol.portions[j],
    change: sol.portions[j] - k.current,
    atCeiling: Number.isFinite(k.max) && sol.portions[j] >= k.max - 1e-6,
    // Contribution per portion this item would need, everything else unchanged, to earn a place.
    needs: sol.portions[j] > k.min + 1e-6 || sol.reduced[j] <= 1e-9 ? null : k.margin + sol.reduced[j],
  }));
  const binding = [];
  if (sol.shadow.labor > 1e-6) binding.push("labor");
  if (sol.shadow.equip > 1e-6) binding.push("equipment");
  if (sol.shadow.cash > 1e-6) binding.push("cash");
  return { ok: true, warnings, shared, items, rows, best, current, hasCurrent, shadow: sol.shadow, binding, gain: best.net - current.net };
}

export function toCsv(a) {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [["Item", "Contribution per portion", "Current portions", "Best portions", "Change"].map(q).join(",")];
  a.rows.forEach((r) => lines.push([q(r.name), r.margin.toFixed(2), r.current.toFixed(0), r.optimal.toFixed(1), r.change.toFixed(1)].join(",")));
  lines.push(["Total after fixed cost", "", a.current.net.toFixed(0), a.best.net.toFixed(0), a.gain.toFixed(0)].map(q).join(","));
  return lines.join("\n");
}
