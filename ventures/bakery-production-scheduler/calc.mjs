// Bakery production scheduler: pure functions, no dependencies, nothing leaves the browser.
//
// Model, stated so the page can say it: every order is split into batches (one oven load each). A batch needs a prep
// step done by a baker, then a proof/rest step that needs no one, then a bake step that holds one oven slot, then a
// cooling gap before the due time. The schedule is built BACKWARDS from the due times: bakes are placed as late as the
// oven slots allow, then prep as late as the bakers allow. If the earliest prep start lands before the shop opens the
// plan is infeasible and the tool says by how much, what extra oven or baker fixes it, and which orders to turn down.

export function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

// "6:30", "06:30", "6:30pm", "18:30", "6pm" -> minutes after midnight; NaN if it is not a time.
export function parseTime(s) {
  const m = String(s ?? "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return NaN;
  if (m[3]) {
    if (h < 1 || h > 12) return NaN;
    h = h % 12 + (m[3][0] === "p" ? 12 : 0);
  } else if (h > 23) return NaN;
  return h * 60 + min;
}
export function formatTime(mins) {
  const t = Math.round(mins);
  const day = Math.floor(t / 1440);
  const r = ((t % 1440) + 1440) % 1440;
  const h = Math.floor(r / 60), m = r % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const base = `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return day === 0 ? base : day < 0 ? `${base} (day before)` : `${base} (+${day}d)`;
}

const splitLine = (line) => line.split(/[,\t|]/).map((s) => s.trim());
const dataLines = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// product line: name, units per batch, prep min, proof min, bake min, unit price, unit cost
export function parseProducts(text) {
  const products = [], errors = [];
  dataLines(text).forEach((line, i) => {
    const p = splitLine(line);
    const [name, perBatch, prep, proof, bake, price, cost] = [p[0], num(p[1]), num(p[2]), num(p[3]), num(p[4]), num(p[5]), num(p[6])];
    if (!name || !(perBatch >= 1) || !(prep >= 0) || !(proof >= 0) || !(bake > 0)) {
      errors.push(`Product line ${i + 1} ("${line}"): need name, units per batch (1 or more), prep, proof and bake minutes (bake above 0).`);
      return;
    }
    if (products.some((x) => x.name.toLowerCase() === name.toLowerCase())) { errors.push(`Product "${name}" is listed twice.`); return; }
    products.push({ name, perBatch: Math.floor(perBatch), prep, proof, bake, price: Number.isFinite(price) ? price : 0, cost: Number.isFinite(cost) ? cost : 0 });
  });
  return { products, errors };
}

// order line: customer or label, product, quantity, due time
export function parseOrders(text, products) {
  const orders = [], errors = [];
  const byName = new Map(products.map((p) => [p.name.toLowerCase(), p]));
  dataLines(text).forEach((line, i) => {
    const p = splitLine(line);
    const [label, prodName, qty, due] = [p[0], p[1], num(p[2]), parseTime(p[3])];
    const product = byName.get(String(prodName ?? "").toLowerCase());
    if (!label || !product || !(qty >= 1) || !Number.isFinite(due)) {
      errors.push(`Order line ${i + 1} ("${line}"): need label, a product from your list, quantity and a due time like 7:30am.`);
      return;
    }
    orders.push({ id: orders.length, label, product, qty: Math.ceil(qty), due });
  });
  return { orders, errors };
}

// Latest start s (with s + dur <= latest) so that fewer than `cap` jobs overlap [s, s+dur). Null if none >= floor.
function placeLatest(busy, cap, dur, latest, floor = -Infinity) {
  const candidates = [latest, ...busy.map((b) => b.start).filter((t) => t <= latest)].sort((a, b) => b - a);
  for (const finish of candidates) {
    const s = finish - dur;
    if (s < floor) break;
    if (concurrencyOk(busy, cap, s, s + dur)) return s;
  }
  // Nothing at or after the floor: place with no floor so the caller can report how far short the plan falls.
  if (floor > -Infinity) return placeLatest(busy, cap, dur, latest);
  return latest - dur;
}
function concurrencyOk(busy, cap, s, e) {
  const points = [s, ...busy.map((b) => b.start).filter((t) => t > s && t < e)];
  return points.every((t) => busy.filter((b) => b.start <= t && t < b.end).length < cap);
}

export function schedule(products, orders, opts = {}) {
  const o = { ovens: 1, bakers: 1, open: 4 * 60, cool: 20, ...opts };
  const ovens = Math.max(1, Math.floor(o.ovens)), bakers = Math.max(1, Math.floor(o.bakers));
  const batches = [];
  for (const ord of orders) {
    const n = Math.ceil(ord.qty / ord.product.perBatch);
    for (let k = 0; k < n; k++) batches.push({ order: ord, index: k + 1, of: n, due: ord.due, product: ord.product });
  }
  // Latest due first; within a due time the longest bake first, so the big jobs claim the late slots.
  batches.sort((a, b) => b.due - a.due || b.product.bake - a.product.bake);
  const ovenBusy = [], bakerBusy = [];
  for (const b of batches) {
    const pr = b.product;
    const bakeEnd = b.due - o.cool;
    b.bakeStart = placeLatest(ovenBusy, ovens, pr.bake, bakeEnd);
    ovenBusy.push({ start: b.bakeStart, end: b.bakeStart + pr.bake });
    b.bakeEnd = b.bakeStart + pr.bake;
    b.proofStart = b.bakeStart - pr.proof;
    b.prepStart = placeLatest(bakerBusy, bakers, pr.prep, b.proofStart);
    bakerBusy.push({ start: b.prepStart, end: b.prepStart + pr.prep });
    b.prepEnd = b.prepStart + pr.prep;
    b.ready = b.due - o.cool;
  }
  batches.sort((a, b) => a.prepStart - b.prepStart || a.bakeStart - b.bakeStart);
  const earliest = batches.length ? Math.min(...batches.map((b) => b.prepStart)) : null;
  const shortBy = earliest === null ? 0 : Math.max(0, o.open - earliest);
  const ovenMinutes = batches.reduce((a, b) => a + b.product.bake, 0);
  const lastBake = batches.length ? Math.max(...batches.map((b) => b.bakeEnd)) : null;
  const span = lastBake === null ? 0 : lastBake - Math.min(...batches.map((b) => b.bakeStart));
  return { batches, earliest, shortBy, feasible: shortBy === 0, ovenMinutes, ovens, bakers, open: o.open, cool: o.cool, ovenUtilization: span > 0 ? ovenMinutes / (span * ovens) : 0 };
}

// Per-order economics. Whole batches are baked, so unsold leftovers carry cost but no revenue.
export function orderEconomics(order) {
  const p = order.product;
  const batches = Math.ceil(order.qty / p.perBatch);
  const made = batches * p.perBatch;
  const revenue = order.qty * p.price;
  const cost = made * p.cost;
  const profit = revenue - cost;
  const ovenMinutes = batches * p.bake;
  return { batches, made, leftover: made - order.qty, revenue, cost, profit, ovenMinutes, profitPerOvenHour: ovenMinutes > 0 ? profit / ovenMinutes * 60 : 0 };
}

// Cheapest addition that makes the plan fit before opening: tries every (ovens, bakers) pair up to `max` each and
// returns the fitting pair with the fewest extra ovens, then fewest extra bakers, relative to what you have now.
export function whatFixesIt(products, orders, opts = {}, max = 8) {
  const o = { ovens: 1, bakers: 1, ...opts };
  let best = null;
  for (let ov = o.ovens; ov <= max; ov++) {
    for (let bk = o.bakers; bk <= max; bk++) {
      if (!schedule(products, orders, { ...opts, ovens: ov, bakers: bk }).feasible) continue;
      const extra = (ov - o.ovens) * 3 + (bk - o.bakers);
      if (!best || extra < best.extra) best = { ovens: ov, bakers: bk, extraOvens: ov - o.ovens, extraBakers: bk - o.bakers, extra };
    }
  }
  return best;
}

// When the plan does not fit and nothing can be added: turn down orders, lowest profit per oven hour first,
// until the rest fits. Returns the orders to drop and the schedule that remains.
export function dropToFit(products, orders, opts = {}) {
  const ranked = [...orders].sort((a, b) => orderEconomics(b).profitPerOvenHour - orderEconomics(a).profitPerOvenHour);
  // Take orders best-first and keep each one only if the plan still fits with it in. That drops fewer orders than
  // removing the worst until the rest fits, because a small low-value order can still squeeze in after a big one is out.
  let kept = [];
  const dropped = [];
  for (const ord of ranked) {
    if (schedule(products, [...kept, ord], opts).feasible) kept.push(ord);
    else dropped.push(ord);
  }
  return { dropped, kept, plan: schedule(products, kept, opts) };
}

// Pull list: everything a given order needs, by product, for the day (whole batches).
export function dayTotals(orders) {
  const byProduct = new Map();
  for (const ord of orders) {
    const e = orderEconomics(ord);
    const t = byProduct.get(ord.product.name) || { name: ord.product.name, ordered: 0, batches: 0, made: 0, revenue: 0, cost: 0 };
    t.ordered += ord.qty; t.batches += e.batches; t.made += e.made; t.revenue += e.revenue; t.cost += e.cost;
    byProduct.set(ord.product.name, t);
  }
  return [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
}

export const EXAMPLE_PRODUCTS = `# name, units per batch, prep min, proof min, bake min, unit price, unit cost
Sourdough loaf, 12, 40, 150, 45, 8.00, 1.90
Baguette, 20, 35, 90, 25, 3.50, 0.70
Croissant, 24, 60, 120, 20, 4.25, 1.05
Cinnamon roll, 16, 30, 60, 28, 4.50, 1.10`;
export const EXAMPLE_ORDERS = `# label, product, quantity, due time
Corner Cafe, Sourdough loaf, 24, 7:00am
Corner Cafe, Croissant, 24, 7:00am
Bistro Marche, Baguette, 40, 8:30am
Farmers market stall, Cinnamon roll, 32, 8:00am
Farmers market stall, Sourdough loaf, 24, 8:00am
Hotel breakfast, Croissant, 48, 6:30am`;
