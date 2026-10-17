// Inventory reorder planner from a store's own exports: an order-lines CSV
// (Shopify "Orders" export, or any sheet with a date, a SKU and a quantity) and
// an optional stock CSV (Shopify inventory export or a sheet with SKU and units
// on hand). Per SKU it works out daily sales velocity, days of cover, a reorder
// point with safety stock from the SKU's own week-to-week variation, how much
// to order, the revenue at risk if it stocks out before a reorder lands, and
// cash sitting in overstock and dead stock. Column names are matched by alias;
// no real Shopify export was available when this was written. Pure functions,
// no DOM, no network.

export const DEFAULTS = { leadDays: 21, cycleDays: 30, serviceLevel: 0.95, overstockDays: 120, deadDays: 90 };
const Z = { 0.9: 1.2816, 0.95: 1.6449, 0.98: 2.0537, 0.99: 2.3263 };
const DAY = 86400000;

const ALIASES = {
  date: ["created at", "created_at", "order date", "date", "paid at", "processed at"],
  sku: ["lineitem sku", "line item sku", "sku", "variant sku"],
  name: ["lineitem name", "line item name", "product title", "title", "item", "product", "name"],
  qty: ["lineitem quantity", "line item quantity", "quantity", "qty", "units", "net quantity", "quantity ordered"],
  price: ["lineitem price", "line item price", "price", "unit price", "item price"],
  cancelled: ["cancelled at", "canceled at"],
  status: ["financial status", "payment status", "status"],
};
const STOCK_ALIASES = {
  sku: ["sku", "variant sku", "lineitem sku"],
  name: ["title", "product title", "name", "item", "product"],
  onHand: ["on hand", "on hand (current)", "available", "available (not editable)", "quantity", "qty", "stock", "units on hand", "inventory"],
  incoming: ["incoming", "incoming (not editable)", "on order", "inbound"],
  cost: ["cost per item", "unit cost", "cost", "cogs", "landed cost"],
  price: ["price", "unit price", "variant price"],
};

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d, rest = "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, hasTime = false;
  const tm = rest.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (tm) {
    hh = +tm[1]; mm = +tm[2]; hasTime = true;
    const ap = tm[3] ? tm[3][0].toLowerCase() : "";
    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  const t = Date.UTC(y, mo - 1, d, hh, mm);
  return new Date(t).getUTCDate() === d ? { t, hasTime } : null;
}

export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}


function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

const r2 = (n) => Math.round(n * 100) / 100;
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
export const money = (n) => Math.round(n).toLocaleString("en-US");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const CANCELLED = /^(voided|refunded|cancel)/i;

// Order lines -> {items:[{t, sku, name, qty, price}], skipped, dmy, error}.
// Shopify repeats order-level fields on the first line only, so a row with a
// SKU but no date inherits the last date seen. Cancelled or fully refunded
// orders are dropped, and negative quantities (returns) net against the SKU.
export function normalizeSales(table, { decimalComma = false } = {}) {
  if (!table.length) return { error: "The sales file is empty.", items: [], skipped: [] };
  const cols = findColumns(table[0], ALIASES);
  if (cols.sku === undefined && cols.name === undefined) return { error: "No SKU or product-name column found in the sales file. Expected something like “Lineitem sku” and “Lineitem quantity”.", items: [], skipped: [] };
  if (cols.qty === undefined) return { error: "No quantity column found in the sales file. Expected something like “Lineitem quantity”.", items: [], skipped: [] };
  if (cols.date === undefined) return { error: "No date column found in the sales file. Expected something like “Created at”.", items: [], skipped: [] };
  const body = table.slice(1);
  const dmy = detectDmy(body.map((r) => r[cols.date]));
  const items = [], skipped = [];
  let lastT = null, lastVoid = false;
  body.forEach((r, i) => {
    const line = i + 2;
    const rawDate = (r[cols.date] ?? "").trim();
    if (rawDate) {
      const w = parseWhen(rawDate, dmy);
      lastT = w ? w.t : null;
      lastVoid = (cols.cancelled !== undefined && (r[cols.cancelled] ?? "").trim() !== "") || (cols.status !== undefined && CANCELLED.test((r[cols.status] ?? "").trim()));
    }
    const sku = cols.sku !== undefined ? (r[cols.sku] ?? "").trim() : "";
    const name = cols.name !== undefined ? (r[cols.name] ?? "").trim() : "";
    if (!sku && !name) return; // order-level row with no line item (shipping, tax)
    if (lastT === null) { skipped.push({ line, reason: "no readable date" }); return; }
    if (lastVoid) return;
    const qty = parseNumber(r[cols.qty], decimalComma);
    if (!Number.isFinite(qty) || qty === 0) { skipped.push({ line, reason: "quantity is not a number" }); return; }
    const price = cols.price !== undefined ? parseNumber(r[cols.price], decimalComma) : NaN;
    items.push({ t: lastT, sku: sku || name, name: name || sku, qty, price: Number.isFinite(price) ? price : null });
  });
  if (!items.length) return { error: "No usable order lines were found.", items, skipped };
  return { items, skipped, dmy };
}

export function normalizeStock(table, { decimalComma = false } = {}) {
  if (!table.length) return { items: [], skipped: [] };
  const cols = findColumns(table[0], STOCK_ALIASES);
  if (cols.sku === undefined || cols.onHand === undefined) return { error: "The stock file needs a SKU column and an on-hand (or available) column.", items: [], skipped: [] };
  const items = [], skipped = [];
  table.slice(1).forEach((r, i) => {
    const sku = (r[cols.sku] ?? "").trim();
    if (!sku) return;
    const onHand = parseNumber(r[cols.onHand], decimalComma);
    if (!Number.isFinite(onHand)) { skipped.push({ line: i + 2, reason: "on-hand is not a number" }); return; }
    const num = (c) => { if (cols[c] === undefined) return null; const v = parseNumber(r[cols[c]], decimalComma); return Number.isFinite(v) && (r[cols[c]] ?? "").trim() !== "" ? v : null; };
    items.push({ sku, name: cols.name !== undefined ? (r[cols.name] ?? "").trim() : "", onHand, incoming: num("incoming") ?? 0, cost: num("cost"), price: num("price") });
  });
  return { items, skipped };
}

const key = (s) => norm(s);

export function analyze(sales, stock = [], opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const z = Object.hasOwn(Z, o.serviceLevel) ? Z[o.serviceLevel] : Z[0.95];
  if (!sales.length) return { invalid: "No sales to analyze." };
  if (!(o.leadDays > 0) || o.cycleDays < 0) return { invalid: "Lead time must be above zero days and the order cycle cannot be negative." };
  const first = Math.min(...sales.map((s) => s.t)), lastSale = Math.max(...sales.map((s) => s.t));
  const asOf = o.asOf ?? lastSale;
  const windowDays = Math.max(7, Math.floor((asOf - first) / DAY) + 1);
  const weeks = Math.max(1, Math.floor(windowDays / 7));
  const recentFrom = asOf - 28 * DAY;
  const useTrend = windowDays >= 56;

  const skus = new Map();
  const get = (sku, name) => { const k = key(sku); if (!skus.has(k)) skus.set(k, { sku, name: name || sku, units: 0, revenue: 0, priced: 0, recent: 0, lastSold: null, weekly: new Array(weeks).fill(0) }); return skus.get(k); };
  for (const s of sales) {
    const d = get(s.sku, s.name);
    d.units += s.qty;
    if (s.price !== null) { d.revenue += s.qty * s.price; d.priced += s.qty; }
    if (s.t > recentFrom && s.t <= asOf) d.recent += s.qty;
    if (s.qty > 0 && (d.lastSold === null || s.t > d.lastSold)) d.lastSold = s.t;
    const wk = Math.min(weeks - 1, Math.floor((asOf - s.t) / (7 * DAY)));
    if (wk >= 0) d.weekly[wk] += s.qty;
  }
  const stockBy = new Map(stock.map((s) => [key(s.sku), s]));
  for (const s of stock) if (!skus.has(key(s.sku))) get(s.sku, s.name);
  const hasStock = stock.length > 0;

  const rows = [];
  for (const d of skus.values()) {
    const st = stockBy.get(key(d.sku)) || null;
    const overall = Math.max(0, d.units) / windowDays;
    const recent = Math.max(0, d.recent) / 28;
    const velocity = useTrend ? 0.6 * recent + 0.4 * overall : overall;
    const trend = useTrend && overall > 0 ? recent / overall - 1 : null;
    const mean = sum(d.weekly) / weeks;
    const sd = weeks > 1 ? Math.sqrt(sum(d.weekly.map((w) => (w - mean) ** 2)) / (weeks - 1)) : 0;
    const sdDaily = sd / Math.sqrt(7);
    const safety = z * sdDaily * Math.sqrt(o.leadDays);
    const reorderPoint = velocity * o.leadDays + safety;
    const price = d.priced > 0 ? d.revenue / d.priced : st && st.price !== null ? st.price : null;
    const cost = st ? st.cost : null;
    const onHand = st ? st.onHand : null;
    const incoming = st ? st.incoming : 0;
    const position = onHand === null ? null : onHand + incoming;
    const cover = onHand === null ? null : velocity > 0 ? Math.max(0, onHand) / velocity : Infinity;
    const daysSinceSale = d.lastSold === null ? null : Math.floor((asOf - d.lastSold) / DAY);
    let status = "ok";
    if (position === null) status = velocity > 0 ? "no-stock-data" : "no-sales";
    else if (velocity === 0) status = onHand > 0 ? (daysSinceSale === null || daysSinceSale >= o.deadDays ? "dead" : "slow") : "no-sales";
    else if (onHand <= 0) status = "stocked-out";
    else if (position <= reorderPoint) status = "reorder";
    else if (cover > o.overstockDays) status = "overstock";
    const target = velocity * (o.leadDays + o.cycleDays) + safety;
    const orderQty = position === null || velocity === 0 ? 0 : Math.max(0, Math.ceil(target - position));
    const lostDays = cover === null || !Number.isFinite(cover) ? 0 : Math.max(0, o.leadDays - cover);
    const atRisk = price !== null && velocity > 0 && (status === "reorder" || status === "stocked-out") ? r2(velocity * price * (status === "stocked-out" ? o.leadDays : lostDays)) : 0;
    const needUnits = velocity * o.overstockDays;
    const excess = (status === "overstock" || status === "dead" || status === "slow") && onHand > 0 ? (status === "overstock" ? Math.max(0, onHand - needUnits) : onHand) : 0;
    rows.push({
      sku: d.sku, name: d.name, units: d.units, revenue: r2(d.revenue), velocity, recentVelocity: recent, trend, safety: Math.ceil(safety), reorderPoint: Math.ceil(reorderPoint),
      onHand, incoming, cover, daysSinceSale, status, orderQty, orderCost: cost !== null ? r2(orderQty * cost) : null, cost, price, atRisk, excessUnits: Math.round(excess), excessCash: cost !== null ? r2(excess * cost) : null,
      stockoutDate: cover !== null && Number.isFinite(cover) ? dateStr(asOf + cover * DAY) : null,
    });
  }
  // ABC by revenue (units when nothing carries a price)
  const byValue = (r) => (rows.some((x) => x.revenue > 0) ? r.revenue : r.units);
  const total = sum(rows.map((r) => Math.max(0, byValue(r))));
  let run = 0;
  for (const r of [...rows].sort((a, b) => byValue(b) - byValue(a))) {
    r.abc = total > 0 && byValue(r) > 0 ? (run / total < 0.8 ? "A" : run / total < 0.95 ? "B" : "C") : "C";
    run += Math.max(0, byValue(r));
  }
  const rank = { "stocked-out": 0, reorder: 1, overstock: 2, dead: 3, slow: 4, "no-stock-data": 5, ok: 6, "no-sales": 7 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.atRisk - a.atRisk || b.revenue - a.revenue || a.sku.localeCompare(b.sku));

  const count = (s) => rows.filter((r) => r.status === s).length;
  const summary = {
    skus: rows.length, windowDays, from: first, to: asOf, units: sum(rows.map((r) => r.units)), revenue: r2(sum(rows.map((r) => r.revenue))), hasStock, useTrend,
    stockedOut: count("stocked-out"), reorder: count("reorder"), overstock: count("overstock"), dead: count("dead"), slow: count("slow"),
    poUnits: sum(rows.map((r) => r.orderQty)), poCost: r2(sum(rows.map((r) => r.orderCost ?? 0))), poMissingCost: rows.filter((r) => r.orderQty > 0 && r.orderCost === null).length,
    atRisk: r2(sum(rows.map((r) => r.atRisk))), excessCash: r2(sum(rows.map((r) => r.excessCash ?? 0))), excessMissingCost: rows.filter((r) => r.excessUnits > 0 && r.excessCash === null).length,
    leadDays: o.leadDays, cycleDays: o.cycleDays, serviceLevel: o.serviceLevel, weeks,
  };
  const findings = [];
  if (!hasStock) findings.push({ severity: "info", title: "No stock file, so this is sales velocity only", detail: "Add a stock CSV (SKU and units on hand) to get reorder points, order quantities, cover and overstock." });
  if (summary.stockedOut) findings.push({ severity: "high", title: `${summary.stockedOut} selling SKU(s) show zero or negative stock`, detail: `About $${money(rows.filter((r) => r.status === "stocked-out").reduce((s, r) => s + r.atRisk, 0))} of sales over one lead time (${o.leadDays} days) is at risk if nothing is on the way. Top: ${rows.filter((r) => r.status === "stocked-out").slice(0, 3).map((r) => r.sku).join(", ")}.` });
  if (summary.reorder) findings.push({ severity: "high", title: `${summary.reorder} SKU(s) are at or below their reorder point`, detail: `Ordering ${summary.poUnits.toLocaleString("en-US")} units in total brings them up to ${o.leadDays + o.cycleDays} days of cover${summary.poCost ? ` (about $${money(summary.poCost)} at cost${summary.poMissingCost ? `; ${summary.poMissingCost} line(s) have no cost` : ""})` : ""}.` });
  if (summary.overstock || summary.dead || summary.slow) findings.push({ severity: "medium", title: `${summary.overstock} overstocked, ${summary.dead} dead and ${summary.slow} slow SKU(s)`, detail: `${summary.excessCash ? `About $${money(summary.excessCash)} of stock at cost is beyond ${o.overstockDays} days of cover or has not moved in ${o.deadDays}+ days.` : "Add a cost column to see the cash this ties up."} Consider a bundle, markdown or a smaller next order.` });
  const aRisk = rows.filter((r) => r.abc === "A" && (r.status === "reorder" || r.status === "stocked-out"));
  if (aRisk.length) findings.push({ severity: "high", title: `${aRisk.length} of your top-revenue (A) SKU(s) need action now`, detail: aRisk.slice(0, 5).map((r) => r.sku).join(", ") + "." });
  const surging = rows.filter((r) => r.trend !== null && r.trend >= 0.5 && r.units >= 10);
  if (surging.length) findings.push({ severity: "medium", title: `${surging.length} SKU(s) are selling 50%+ faster than their average`, detail: `Last 28 days vs. the whole window: ${surging.slice(0, 3).map((r) => `${r.sku} (+${Math.round(r.trend * 100)}%)`).join(", ")}. The plan weights recent sales at 60%.` });
  const thin = rows.filter((r) => r.units > 0 && r.units < 5).length;
  if (thin) findings.push({ severity: "info", title: `${thin} SKU(s) sold fewer than 5 units`, detail: "Velocity and safety stock on so few sales are guesses; treat their numbers as a starting point." });
  if (windowDays < 28) findings.push({ severity: "info", title: `Only ${windowDays} days of sales`, detail: "Two to three months of orders give steadier velocity and seasonality is not modelled at all." });
  return { rows, summary, findings, invalid: null };
}

export function poCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const f = (v) => (v === null || v === undefined ? "" : Number(v).toFixed(2));
  return ["sku,name,status,on_hand,incoming,daily_velocity,reorder_point,order_qty,unit_cost,order_cost"].concat(
    r.rows.filter((x) => x.orderQty > 0).map((x) => [q(x.sku), q(x.name), x.status, x.onHand, x.incoming, x.velocity.toFixed(3), x.reorderPoint, x.orderQty, f(x.cost), f(x.orderCost)].join(","))).join("\n");
}

export function summaryText(r) {
  const s = r.summary;
  const L = [`Inventory plan: ${s.skus} SKUs, ${dateStr(s.from)} to ${dateStr(s.to)} (${s.windowDays} days), lead time ${s.leadDays}d, cover ${s.cycleDays}d, ${Math.round(s.serviceLevel * 100)}% service level.`];
  if (s.hasStock) L.push(`Stocked out: ${s.stockedOut}. At/below reorder point: ${s.reorder}. Order ${s.poUnits} units${s.poCost ? ` (~$${money(s.poCost)})` : ""}. Revenue at risk ~$${money(s.atRisk)}. Cash in overstock/dead: ~$${money(s.excessCash)}.`);
  for (const f of r.findings) L.push(`- ${f.title}: ${f.detail}`);
  L.push("Estimates from the files supplied; not a forecast.");
  return L.join("\n");
}

// Synthetic: 12 weeks of orders for six invented SKUs of an invented shop.
export function sampleSales(asOf = Date.UTC(2026, 8, 28)) {
  const plan = [["TEA-CHAI-100", "Chai blend 100g", 14.0, 9, 1.0], ["MUG-STONE-BLU", "Stoneware mug, blue", 22.0, 5, 0.8], ["TEA-SAMPLER", "Tea sampler box", 32.0, 4, 1.8], ["KETTLE-1L", "Glass kettle 1L", 48.0, 2, 1.0], ["STRAINER-STEEL", "Steel strainer", 9.0, 6, 0.4], ["MUG-OLD-RED", "Stoneware mug, red (discontinued)", 22.0, 0, 0]];
  const rows = ["Name,Created at,Financial Status,Lineitem name,Lineitem sku,Lineitem quantity,Lineitem price"];
  let n = 1000;
  for (let day = 84; day >= 0; day--) {
    const t = asOf - day * DAY;
    const wk = Math.floor(day / 7);
    plan.forEach(([sku, name, price, perWeek, ramp], idx) => {
      const boost = day < 28 ? ramp : 1;
      const orders = Math.round(((perWeek * boost) / 7) * ((day * 7 + idx * 3) % 5 === 0 ? 2 : 1) * 10) / 10;
      const q = Math.floor(orders) + ((day + idx) % 7 < Math.round((orders % 1) * 7) ? 1 : 0);
      if (q > 0 && !(sku === "MUG-OLD-RED" && wk < 12)) rows.push(`#${n++},${dateStr(t)} 10:00:00 +0000,paid,"${name}",${sku},${q},${price.toFixed(2)}`);
    });
  }
  return rows.join("\n");
}
export const SAMPLE_STOCK = "SKU,Title,On hand,Incoming,Cost per item\nTEA-CHAI-100,Chai blend 100g,30,0,5.20\nMUG-STONE-BLU,\"Stoneware mug, blue\",300,0,8.50\nTEA-SAMPLER,Tea sampler box,0,0,11.00\nKETTLE-1L,Glass kettle 1L,55,0,19.00\nSTRAINER-STEEL,Steel strainer,80,0,2.75\nMUG-OLD-RED,\"Stoneware mug, red (discontinued)\",120,0,8.50\n";
