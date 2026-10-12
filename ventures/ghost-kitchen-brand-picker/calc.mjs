// Ghost kitchen brand picker. Pure functions, no DOM, no network.
// A delivery-only kitchen can run several virtual brands out of one line (a wing brand, a burger brand, a bowl brand ...).
// Each brand adds orders, but also eats kitchen hours, pays its own platform fees and packaging, and carries its own monthly
// cost (listing management, photography, ads). With a fixed number of kitchen hours a week you cannot run them all well, so
// which brands do you keep? This finds the set of brands with the biggest monthly profit that fits the kitchen hours,
// checking every set exactly (up to 14 brands), compares it with the usual rules (best profit per kitchen hour, biggest
// profit, best margin, as listed), shows each brand's break-even orders, what more kitchen hours would add, and re-solves
// with orders 30% lower and 30% higher.
// Model: per order, profit = order value less food cost, less platform fee and promotions, less packaging, less the kitchen
// labour to make it (prep minutes at the hourly labour cost). Monthly profit = orders a week x 52/12 x that, less the
// brand's own monthly cost. Brands do not take sales from each other (see "Not decided" on the page).

export const MAX_BRANDS = 14;
export const WEEKS_PER_MONTH = 52 / 12;
export const SHARED_DEFAULTS = { kitchenHours: 0, labourRate: 18 };
export const ITEM_DEFAULTS = { name: "", orders: 0, aov: 0, foodPct: "", platformPct: "", packaging: "", prepMin: "", fixed: "" };

// Placeholder example figures, not any real brand's numbers.
export const EXAMPLE_SHARED = { kitchenHours: 30, labourRate: 18 };
export const EXAMPLE_ITEMS = [
  { name: "Wing brand", orders: 40, aov: 27, foodPct: 32, platformPct: 27, packaging: 1.1, prepMin: 6, fixed: 250 },
  { name: "Smash burger brand", orders: 185, aov: 24, foodPct: 34, platformPct: 27, packaging: 1.0, prepMin: 5, fixed: 250 },
  { name: "Rice bowl brand", orders: 85, aov: 22, foodPct: 30, platformPct: 27, packaging: 0.9, prepMin: 7, fixed: 200 },
  { name: "Late-night cookies", orders: 75, aov: 18, foodPct: 24, platformPct: 27, packaging: 0.8, prepMin: 4, fixed: 150 },
  { name: "Healthy salads", orders: 155, aov: 21, foodPct: 36, platformPct: 27, packaging: 1.2, prepMin: 8, fixed: 300 },
  { name: "Pasta brand", orders: 125, aov: 26, foodPct: 28, platformPct: 27, packaging: 1.1, prepMin: 9, fixed: 250 },
  { name: "Breakfast burritos", orders: 95, aov: 16, foodPct: 31, platformPct: 27, packaging: 0.7, prepMin: 5, fixed: 150 },
];

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const pct = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US") + "%";
const one = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US");

export function cleanShared(s = {}) {
  return {
    kitchenHours: Math.min(10000, Math.max(0, num(s.kitchenHours, SHARED_DEFAULTS.kitchenHours))),
    labourRate: Math.min(1000, Math.max(0, num(s.labourRate, SHARED_DEFAULTS.labourRate))),
  };
}

const blank = (v) => String(v ?? "").trim() === "";

export function cleanItems(items = [], labourRate = 0) {
  const out = [];
  const warnings = [];
  items.forEach((raw, idx) => {
    const r = raw || {};
    const name = String(r.name ?? "").trim();
    const label = name || `Brand ${idx + 1}`;
    const orders = num(r.orders, 0);
    const aov = num(r.aov, 0);
    if (orders <= 0 || aov <= 0) {
      if (name) warnings.push(`"${name}" needs orders a week and an average order value, so it is left out.`);
      return;
    }
    if (out.length >= MAX_BRANDS) {
      warnings.push(`Only the first ${MAX_BRANDS} brands are used; "${label}" is left out.`);
      return;
    }
    if (blank(r.foodPct) || blank(r.platformPct) || blank(r.prepMin)) {
      warnings.push(`"${label}" needs a food cost %, a platform fee % and prep minutes per order, so it is left out.`);
      return;
    }
    const foodPct = num(r.foodPct, NaN), platformPct = num(r.platformPct, NaN), prepMin = num(r.prepMin, NaN);
    if (![foodPct, platformPct, prepMin].every(Number.isFinite) || foodPct < 0 || platformPct < 0 || prepMin <= 0 || foodPct + platformPct >= 100) {
      warnings.push(`"${label}" has food cost and platform fee that leave nothing of the order, or no prep time, so it is left out.`);
      return;
    }
    const packaging = Math.max(0, num(r.packaging, 0));
    const fixed = Math.max(0, num(r.fixed, 0));
    const o = Math.min(1e6, orders);
    const a = Math.min(1e4, aov);
    const perOrderLabour = (prepMin / 60) * labourRate;
    const perOrder = a * (1 - (foodPct + platformPct) / 100) - packaging - perOrderLabour;
    out.push({
      name: label, orders: o, aov: a, foodPct, platformPct, packaging, prepMin, fixed,
      perOrder, perOrderLabour, hoursPerWeek: (o * prepMin) / 60,
      revenue: o * WEEKS_PER_MONTH * a,
      breakEvenOrders: perOrder > 0 ? fixed / (perOrder * WEEKS_PER_MONTH) : Infinity,
    });
  });
  return { items: out, warnings };
}

// Monthly profit of one brand at `scale` times its entered orders (fixed cost does not scale).
export function profitOf(b, scale = 1) {
  return b.orders * scale * WEEKS_PER_MONTH * b.perOrder - b.fixed;
}
const hoursOf = (b, scale = 1) => b.hoursPerWeek * scale;

const EPS = 1e-6;

// Exact: try every set (2^14 = 16,384), keep the most profitable that fits the kitchen hours.
export function solve(brands, hours, scale = 1) {
  const n = brands.length;
  const pr = brands.map((b) => profitOf(b, scale));
  const hr = brands.map((b) => hoursOf(b, scale));
  let best = { mask: 0, profit: 0, used: 0 };
  for (let mask = 1; mask < 1 << n; mask++) {
    let used = 0, total = 0, ok = true;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      if (pr[i] <= 0) { ok = false; break; } // never run a brand at a loss
      used += hr[i];
      total += pr[i];
      if (used > hours + EPS) { ok = false; break; }
    }
    if (ok && (total > best.profit + EPS || (Math.abs(total - best.profit) <= EPS && used < best.used - EPS))) best = { mask, profit: total, used };
  }
  const chosen = [];
  for (let i = 0; i < n; i++) if (best.mask & (1 << i)) chosen.push(i);
  return { chosen, profit: best.profit, used: best.used, pr, hr };
}

function greedy(brands, hours, order) {
  let left = hours, profit = 0;
  const chosen = [];
  for (const i of order) {
    const p = profitOf(brands[i]);
    if (p > 0 && brands[i].hoursPerWeek <= left + EPS) { chosen.push(i); left -= brands[i].hoursPerWeek; profit += p; }
  }
  return { chosen, profit, used: hours - left };
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items, warnings } = cleanItems(rawItems, shared.labourRate);
  if (!items.length) {
    return { ok: false, warnings: [...warnings, "Add at least one brand with orders a week, an average order value, a food cost %, a platform fee % and prep minutes."] };
  }
  if (shared.kitchenHours <= 0) return { ok: false, warnings: [...warnings, "Enter the kitchen hours a week you have for delivery orders."] };
  const hours = shared.kitchenHours;
  const idx = items.map((_, i) => i);
  const exact = solve(items, hours);
  const perHour = (i) => profitOf(items[i]) / items[i].hoursPerWeek;
  const rules = [
    { label: "Best profit per kitchen hour first", order: [...idx].sort((a, b) => perHour(b) - perHour(a)) },
    { label: "Biggest monthly profit first", order: [...idx].sort((a, b) => profitOf(items[b]) - profitOf(items[a])) },
    { label: "Best margin on each order first", order: [...idx].sort((a, b) => items[b].perOrder / items[b].aov - items[a].perOrder / items[a].aov) },
    { label: "In the order listed", order: idx },
  ].map((rule) => {
    const g = greedy(items, hours, rule.order);
    return { label: rule.label, profit: g.profit, used: g.used, count: g.chosen.length, extra: exact.profit - g.profit };
  });
  const bestRule = rules.reduce((a, b) => (b.profit > a.profit ? b : a));
  const ruleLoss = exact.profit - bestRule.profit;
  const chosenSet = new Set(exact.chosen);
  const plan = exact.chosen
    .map((i) => ({ ...items[i], profit: exact.pr[i], perHour: perHour(i) }))
    .sort((a, b) => b.profit - a.profit);
  const skipped = items.map((b, i) => ({ ...b, profit: exact.pr[i], perHour: perHour(i), i })).filter((b) => !chosenSet.has(b.i)).map((b) => ({
    ...b,
    reason: b.profit <= 0 ? "it loses money at these orders, because its monthly cost and kitchen labour outweigh what each order leaves" : "it does not fit in the kitchen hours alongside better uses of them",
  }));
  const extraLevels = [0.25, 0.5, 1].map((f) => {
    const add = hours * f;
    const s = solve(items, hours + add);
    return { add, gain: s.profit - exact.profit, count: s.chosen.length };
  });
  const volumeChecks = [0.7, 1.3].map((f) => {
    const s = solve(items, hours, f);
    return { scale: f, profit: s.profit, count: s.chosen.length, same: s.chosen.join() === exact.chosen.join() };
  });
  const allProfit = items.reduce((s, b) => s + Math.max(0, profitOf(b)), 0);
  return {
    ok: true, warnings, shared, items, plan, skipped, rules, ruleLoss, bestRule,
    profit: exact.profit, hoursUsed: exact.used, hoursLeft: hours - exact.used,
    revenue: plan.reduce((s, p) => s + p.revenue, 0), allProfit, extraLevels, volumeChecks,
  };
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCsv(a) {
  const rows = [["Brand", "Orders a week", "Profit per order", "Kitchen hours a week", "Monthly profit", "Profit per kitchen hour", "Break-even orders a week"]];
  for (const p of a.plan) rows.push([p.name, p.orders, p.perOrder.toFixed(2), one(p.hoursPerWeek), p.profit.toFixed(2), p.perHour.toFixed(2), Number.isFinite(p.breakEvenOrders) ? one(p.breakEvenOrders) : "never"]);
  rows.push([]);
  rows.push(["Dropped", "Reason"]);
  for (const s of a.skipped) rows.push([s.name, s.reason]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
