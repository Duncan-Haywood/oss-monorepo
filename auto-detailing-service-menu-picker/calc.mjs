// Auto detailing service menu picker. Pure functions, no DOM, no network.
// A detailing shop or mobile detailer can sell many services (wash and wax, interior deep clean, paint correction, ceramic
// coating ...) but has a fixed number of bay hours a week. Each service brings jobs, but also uses product, booking and card
// fees, consumables, labour and its own monthly cost (special tools, certification, ads). Which services should the shop
// keep selling? This finds the set with the biggest monthly profit that fits the bay hours, checking every set exactly (up to
// 14 services), compares it with the usual rules (best profit per bay hour, biggest profit, best margin, as listed), shows
// each service's break-even jobs, what more bay hours would add, and re-solves with jobs 30% lower and 30% higher.
// Model: per job, profit = price less product cost, less booking and card fees, less consumables, less the labour for the bay
// minutes (at the hourly labour cost). Monthly profit = jobs a week x 52/12 x that, less the service's own monthly cost.
// Services do not take bookings from each other (see "Not decided" on the page).

export const MAX_BRANDS = 14;
export const WEEKS_PER_MONTH = 52 / 12;
export const SHARED_DEFAULTS = { kitchenHours: 0, labourRate: 18 };
export const ITEM_DEFAULTS = { name: "", orders: 0, aov: 0, foodPct: "", platformPct: "", consumables: "", prepMin: "", fixed: "" };

// Placeholder example figures, not any real service's numbers.
export const EXAMPLE_SHARED = { kitchenHours: 32, labourRate: 28 };
export const EXAMPLE_ITEMS = [
  { name: "Express wash and wax", orders: 14, aov: 120, foodPct: 12, platformPct: 3.5, consumables: 4, prepMin: 75, fixed: 0 },
  { name: "Interior deep clean", orders: 9, aov: 260, foodPct: 9, platformPct: 3.5, consumables: 8, prepMin: 180, fixed: 40 },
  { name: "Full detail", orders: 6, aov: 420, foodPct: 11, platformPct: 3.5, consumables: 12, prepMin: 300, fixed: 40 },
  { name: "One-step paint correction", orders: 4, aov: 650, foodPct: 14, platformPct: 3.5, consumables: 25, prepMin: 480, fixed: 120 },
  { name: "Ceramic coating (2 year)", orders: 2, aov: 1150, foodPct: 22, platformPct: 3.5, consumables: 30, prepMin: 840, fixed: 350 },
  { name: "Headlight restoration", orders: 5, aov: 95, foodPct: 15, platformPct: 3.5, consumables: 3, prepMin: 50, fixed: 25 },
  { name: "Engine bay detail", orders: 3, aov: 110, foodPct: 8, platformPct: 3.5, consumables: 3, prepMin: 60, fixed: 0 },
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
    const label = name || `Service ${idx + 1}`;
    const orders = num(r.orders, 0);
    const aov = num(r.aov, 0);
    if (orders <= 0 || aov <= 0) {
      if (name) warnings.push(`"${name}" needs jobs a week and an average price, so it is left out.`);
      return;
    }
    if (out.length >= MAX_BRANDS) {
      warnings.push(`Only the first ${MAX_BRANDS} services are used; "${label}" is left out.`);
      return;
    }
    if (blank(r.foodPct) || blank(r.platformPct) || blank(r.prepMin)) {
      warnings.push(`"${label}" needs a product cost %, a booking and card fee % and bay minutes per job, so it is left out.`);
      return;
    }
    const foodPct = num(r.foodPct, NaN), platformPct = num(r.platformPct, NaN), prepMin = num(r.prepMin, NaN);
    if (![foodPct, platformPct, prepMin].every(Number.isFinite) || foodPct < 0 || platformPct < 0 || prepMin <= 0 || foodPct + platformPct >= 100) {
      warnings.push(`"${label}" has product cost and booking and card fee that leave nothing of the price, or no bay time, so it is left out.`);
      return;
    }
    const consumables = Math.max(0, num(r.consumables, 0));
    const fixed = Math.max(0, num(r.fixed, 0));
    const o = Math.min(1e6, orders);
    const a = Math.min(1e4, aov);
    const perOrderLabour = (prepMin / 60) * labourRate;
    const perOrder = a * (1 - (foodPct + platformPct) / 100) - consumables - perOrderLabour;
    out.push({
      name: label, orders: o, aov: a, foodPct, platformPct, consumables, prepMin, fixed,
      perOrder, perOrderLabour, hoursPerWeek: (o * prepMin) / 60,
      revenue: o * WEEKS_PER_MONTH * a,
      breakEvenOrders: perOrder > 0 ? fixed / (perOrder * WEEKS_PER_MONTH) : Infinity,
    });
  });
  return { items: out, warnings };
}

// Monthly profit of one service at `scale` times its entered jobs (fixed cost does not scale).
export function profitOf(b, scale = 1) {
  return b.orders * scale * WEEKS_PER_MONTH * b.perOrder - b.fixed;
}
const hoursOf = (b, scale = 1) => b.hoursPerWeek * scale;

const EPS = 1e-6;

// Exact: try every set (2^14 = 16,384), keep the most profitable that fits the bay hours.
export function solve(services, hours, scale = 1) {
  const n = services.length;
  const pr = services.map((b) => profitOf(b, scale));
  const hr = services.map((b) => hoursOf(b, scale));
  let best = { mask: 0, profit: 0, used: 0 };
  for (let mask = 1; mask < 1 << n; mask++) {
    let used = 0, total = 0, ok = true;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      if (pr[i] <= 0) { ok = false; break; } // never run a service at a loss
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

function greedy(services, hours, order) {
  let left = hours, profit = 0;
  const chosen = [];
  for (const i of order) {
    const p = profitOf(services[i]);
    if (p > 0 && services[i].hoursPerWeek <= left + EPS) { chosen.push(i); left -= services[i].hoursPerWeek; profit += p; }
  }
  return { chosen, profit, used: hours - left };
}

export function analyze(rawItems, rawShared) {
  const shared = cleanShared(rawShared);
  const { items, warnings } = cleanItems(rawItems, shared.labourRate);
  if (!items.length) {
    return { ok: false, warnings: [...warnings, "Add at least one service with jobs a week, an average price, a product cost %, a booking and card fee % and prep minutes."] };
  }
  if (shared.kitchenHours <= 0) return { ok: false, warnings: [...warnings, "Enter the bay hours a week you have for paid work."] };
  const hours = shared.kitchenHours;
  const idx = items.map((_, i) => i);
  const exact = solve(items, hours);
  const perHour = (i) => profitOf(items[i]) / items[i].hoursPerWeek;
  const rules = [
    { label: "Best profit per bay hour first", order: [...idx].sort((a, b) => perHour(b) - perHour(a)) },
    { label: "Biggest monthly profit first", order: [...idx].sort((a, b) => profitOf(items[b]) - profitOf(items[a])) },
    { label: "Best margin on each job first", order: [...idx].sort((a, b) => items[b].perOrder / items[b].aov - items[a].perOrder / items[a].aov) },
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
    reason: b.profit <= 0 ? "it loses money at these jobs, because its monthly cost and labour outweigh what each job leaves" : "it does not fit in the bay hours alongside better uses of them",
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
  const rows = [["Service", "Jobs a week", "Profit per job", "Bay hours a week", "Monthly profit", "Profit per bay hour", "Break-even jobs a week"]];
  for (const p of a.plan) rows.push([p.name, p.orders, p.perOrder.toFixed(2), one(p.hoursPerWeek), p.profit.toFixed(2), p.perHour.toFixed(2), Number.isFinite(p.breakEvenOrders) ? one(p.breakEvenOrders) : "never"]);
  rows.push([]);
  rows.push(["Dropped", "Reason"]);
  for (const s of a.skipped) rows.push([s.name, s.reason]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
