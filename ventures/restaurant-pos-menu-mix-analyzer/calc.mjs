// Restaurant POS menu-mix analyzer: reads an item-sales export (Toast, Square,
// Clover style: item, category, quantity sold, net sales, optionally a food
// cost) and classifies every item on the Kasavana & Smith menu-engineering
// matrix -- Star, Plowhorse, Puzzle, Dog -- from popularity (menu mix against
// 70% of an even share) and contribution margin per plate (against the
// weighted average). Column names are matched by alias and no real export was
// available when this was written. Pure functions, no DOM, no network.

export const POPULARITY_FACTOR = 0.7;
export const DEFAULT_FOOD_COST_PCT = 32;
export const DEFAULT_PRICE_INCREASE_PCT = 5;
export const DEFAULT_VOLUME_LOSS_PCT = 3;
export const MIN_ITEMS = 4;
const EPS = 1e-9;

const ALIASES = {
  item: ["item name", "item", "menu item", "product name", "product", "name", "dish", "item description", "description"],
  category: ["category", "menu group", "menu category", "item category", "reporting category", "sales category", "department", "group"],
  qty: ["quantity sold", "item qty", "qty", "quantity", "number sold", "items sold", "units sold", "count", "units", "sold"],
  sales: ["net sales", "net amount", "net revenue", "net total", "net", "sales", "revenue", "total sales", "amount", "gross sales"],
  cost: ["food cost", "unit cost", "item cost", "plate cost", "cost per item", "cost per unit", "recipe cost", "cost"],
  costTotal: ["total food cost", "total cost", "extended cost", "cogs total", "cogs"],
  costPct: ["food cost %", "food cost percent", "food cost pct", "cost %", "cost percent", "cost pct"],
  voided: ["void", "voided", "is void", "void?", "void status"],
  kind: ["item type", "line type", "row type", "type", "modifier"],
};

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s) || /^\$?\s*[-−]/.test(s);
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

const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const normName = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const money = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

function findHeader(table) {
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cols = findColumns(table[i], ALIASES);
    if (cols.item !== undefined && cols.qty !== undefined && cols.sales !== undefined) return { h: i, cols };
  }
  return null;
}

const isTotal = (name) => /^(total|totals|subtotal|grand total|summary|all items)\b/i.test(name.trim());
const truthy = (s) => /^(true|yes|y|1|void|voided|x)$/i.test(String(s).trim());

// Export table -> { items, skipped, refundRows, columns, error }. An item row is
// { line, name, category, qty, sales, cost }: qty and sales keep their sign
// (refunds are negative), cost is a per-unit plate cost or null when the row
// carries none. Voided and modifier rows are skipped, not netted.
export function normalizeSales(table, { decimalComma = false } = {}) {
  const empty = { items: [], skipped: [], refundRows: 0, columns: {} };
  if (!table.length) return { ...empty, error: "The sales file is empty." };
  const found = findHeader(table);
  if (!found) return { ...empty, error: "No header row found. Expected columns for the item name, the quantity sold and net sales (for example “Item”, “Qty”, “Net Sales”), as in a Toast, Square or Clover item sales report." };
  const { h, cols } = found;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = table[h][at].trim();
  const items = [], skipped = [];
  let refundRows = 0;
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    const name = get(line, "item");
    if (!name) { skipped.push({ line: lineNo, reason: "no item name" }); continue; }
    if (isTotal(name)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    if (cols.voided !== undefined && truthy(get(line, "voided"))) { skipped.push({ line: lineNo, reason: "voided row" }); continue; }
    if (cols.kind !== undefined && /modif|void/i.test(get(line, "kind"))) { skipped.push({ line: lineNo, reason: /void/i.test(get(line, "kind")) ? "voided row" : "modifier row" }); continue; }
    if (/^\s*[+>]\s*\S/.test(name)) { skipped.push({ line: lineNo, reason: "modifier row" }); continue; }
    const qty = parseNumber(get(line, "qty"), decimalComma);
    const sales = parseNumber(get(line, "sales"), decimalComma);
    if (!Number.isFinite(qty) || !Number.isFinite(sales)) { skipped.push({ line: lineNo, reason: "quantity or sales not readable" }); continue; }
    let cost = null;
    if (qty > 0) {
      const price = sales / qty;
      if (cols.cost !== undefined && !isBlank(get(line, "cost"))) cost = parseNumber(get(line, "cost"), decimalComma);
      else if (cols.costTotal !== undefined && !isBlank(get(line, "costTotal"))) { const t = parseNumber(get(line, "costTotal"), decimalComma); cost = Number.isFinite(t) ? t / qty : NaN; }
      else if (cols.costPct !== undefined && !isBlank(get(line, "costPct"))) { const p = parseNumber(get(line, "costPct"), decimalComma); cost = Number.isFinite(p) ? (Math.abs(p) / 100) * price : NaN; }
      if (cost !== null && !Number.isFinite(cost)) { skipped.push({ line: lineNo, reason: "cost not readable" }); continue; }
      if (cost !== null) cost = Math.abs(cost);
    }
    if (qty < 0 || sales < 0) refundRows++;
    items.push({ line: lineNo, name, category: get(line, "category"), qty, sales, cost });
  }
  if (!items.length) return { ...empty, skipped, columns, error: "No item rows could be read. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "") };
  return { items, skipped, refundRows, columns };
}

// Pasted "item,cost" list -> { map (normalised name -> per-unit cost), names, skipped }.
export function parseCostList(text, decimalComma = false) {
  const map = new Map(), skipped = [];
  const raw = String(text ?? "");
  if (!raw.trim()) return { map, skipped };
  const d = detectDelimiter(raw);
  const dc = decimalComma || d === ";";
  parseCsv(raw, d).forEach((row, i) => {
    if (row.length < 2) { skipped.push({ line: i + 1, reason: "needs item and cost" }); return; }
    const name = row.slice(0, -1).join(d).trim();
    const c = parseNumber(row[row.length - 1], dc);
    if (!name || !Number.isFinite(c)) { if (i > 0) skipped.push({ line: i + 1, reason: "cost not readable" }); return; }
    map.set(normName(name), Math.abs(c));
  });
  return { map, skipped };
}

// Merge rows, take costs from the best source, classify, and price a rise on Plowhorses.
export function analyze(items, opts = {}) {
  const factor = opts.popularityFactor ?? POPULARITY_FACTOR;
  const defaultPct = Number.isFinite(opts.defaultCostPct) ? opts.defaultCostPct : DEFAULT_FOOD_COST_PCT;
  const rise = Number.isFinite(opts.priceIncreasePct) ? opts.priceIncreasePct : DEFAULT_PRICE_INCREASE_PCT;
  const loss = Number.isFinite(opts.volumeLossPct) ? opts.volumeLossPct : DEFAULT_VOLUME_LOSS_PCT;
  const weeks = Number.isFinite(opts.periodWeeks) && opts.periodWeeks > 0 ? opts.periodWeeks : null;
  const list = opts.costList instanceof Map ? opts.costList : new Map();
  if (defaultPct < 0 || defaultPct >= 100) return { invalid: "Default food cost % must be at least 0 and under 100." };
  if (rise < 0 || rise > 100) return { invalid: "Price increase % must be between 0 and 100." };
  if (loss < 0 || loss >= 100) return { invalid: "Volume loss % must be at least 0 and under 100." };

  const merged = new Map();
  let rowsMerged = 0, refundUnits = 0, refundSales = 0;
  for (const it of items) {
    const key = normName(it.name) + "|" + normName(it.category);
    let m = merged.get(key);
    if (!m) { m = { name: it.name.trim(), category: it.category || "", qty: 0, sales: 0, costQty: 0, costSum: 0, rows: 0 }; merged.set(key, m); }
    else { rowsMerged++; if (!m.category && it.category) m.category = it.category; }
    m.rows++;
    m.qty += it.qty; m.sales += it.sales;
    if (it.qty < 0) refundUnits += -it.qty;
    if (it.sales < 0) refundSales += -it.sales;
    if (it.cost !== null && it.qty > 0) { m.costQty += it.qty; m.costSum += it.cost * it.qty; }
  }

  const excluded = [], live = [];
  for (const m of merged.values()) (m.qty > 0 ? live : excluded).push(m);
  if (!live.length) return { invalid: "No item has a positive net quantity after refunds, so there is nothing to classify." };

  const usedNames = new Set();
  const rows = live.map((m) => {
    const price = m.sales / m.qty;
    let unitCost, costSource;
    const listed = list.get(normName(m.name));
    if (m.costQty > 0) { unitCost = m.costSum / m.costQty; costSource = "export"; }
    else if (listed !== undefined) { unitCost = listed; costSource = "list"; usedNames.add(normName(m.name)); }
    else { unitCost = price * (defaultPct / 100); costSource = "default"; }
    if (listed !== undefined) usedNames.add(normName(m.name));
    const cm = price - unitCost;
    return {
      name: m.name, category: m.category || "Uncategorised", qty: m.qty, sales: m.sales, price, unitCost, costSource,
      zeroCost: costSource !== "default" && unitCost === 0,
      costAbovePrice: unitCost > price + EPS,
      cm, cmTotal: cm * m.qty, costTotal: unitCost * m.qty, foodCostPct: price > 0 ? (unitCost / price) * 100 : null, rowsMerged: m.rows,
    };
  });

  const totalUnits = rows.reduce((s, x) => s + x.qty, 0);
  const totalSales = rows.reduce((s, x) => s + x.sales, 0);
  const totalCost = rows.reduce((s, x) => s + x.costTotal, 0);
  const totalCm = totalSales - totalCost;
  const avgCm = totalCm / totalUnits;
  const popThreshold = (100 / rows.length) * factor;

  for (const x of rows) {
    x.mixPct = (x.qty / totalUnits) * 100;
    x.popular = x.mixPct >= popThreshold - EPS;
    x.highMargin = x.cm >= avgCm - EPS;
    x.cls = x.popular ? (x.highMargin ? "Star" : "Plowhorse") : (x.highMargin ? "Puzzle" : "Dog");
  }
  rows.sort((a, b) => b.cmTotal - a.cmTotal);

  // Price rise on Plowhorses: every one goes up by `rise` percent and loses `loss` percent of its units.
  const plow = rows.filter((x) => x.cls === "Plowhorse").map((x) => {
    const newPrice = x.price * (1 + rise / 100);
    const newQty = x.qty * (1 - loss / 100);
    const after = (newPrice - x.unitCost) * newQty;
    const gain = after - x.cmTotal;
    const gainPerPlate = newPrice - x.price;
    // Volume loss at which the rise pays for itself: (cm + dp)(1 - L) = cm
    const denom = x.cm + x.price * (rise / 100);
    const breakEvenLossPct = rise > 0 && denom > 0 ? (1 - x.cm / denom) * 100 : null;
    return { name: x.name, category: x.category, qty: x.qty, price: x.price, newPrice, newQty, gain, gainPerPlate, breakEvenLossPct, costSource: x.costSource };
  });
  const gainTotal = plow.reduce((s, p) => s + p.gain, 0);
  const priceMove = { risePct: rise, lossPct: loss, items: plow, gain: gainTotal, gainPerYear: weeks ? gainTotal * (52 / weeks) : null, periodWeeks: weeks };

  const cut = rows.filter((x) => x.cls === "Dog").sort((a, b) => a.cmTotal - b.cmTotal);
  const promote = rows.filter((x) => x.cls === "Puzzle").sort((a, b) => b.cm - a.cm);

  const cats = new Map();
  for (const x of rows) {
    let c = cats.get(x.category);
    if (!c) { c = { category: x.category, items: 0, qty: 0, sales: 0, costTotal: 0, Star: 0, Plowhorse: 0, Puzzle: 0, Dog: 0 }; cats.set(x.category, c); }
    c.items++; c.qty += x.qty; c.sales += x.sales; c.costTotal += x.costTotal; c[x.cls]++;
  }
  const categories = [...cats.values()].map((c) => ({ ...c, cmTotal: c.sales - c.costTotal, cmPerPlate: (c.sales - c.costTotal) / c.qty, mixPct: (c.qty / totalUnits) * 100, foodCostPct: c.sales > 0 ? (c.costTotal / c.sales) * 100 : null })).sort((a, b) => b.cmTotal - a.cmTotal);

  const bySource = { export: 0, list: 0, default: 0 };
  for (const x of rows) bySource[x.costSource]++;
  const defaultRows = rows.filter((x) => x.costSource === "default");
  const findings = [];
  if (defaultRows.length) findings.push({ severity: "high", title: `${defaultRows.length} of ${rows.length} item(s) use the placeholder food cost of ${defaultPct}%`, detail: `The default is a placeholder, not a measurement: every one of these items gets the same food cost percentage, so its margin per plate just tracks its price and its class is not a finding about the dish. Add a cost column to the export or paste an item,cost list. Affected: ${defaultRows.slice(0, 8).map((x) => x.name).join(", ")}${defaultRows.length > 8 ? ", …" : ""}.` });
  const zero = rows.filter((x) => x.zeroCost);
  if (zero.length) findings.push({ severity: "high", title: `${zero.length} item(s) have a food cost of zero`, detail: `A zero cost makes the whole price look like margin, which usually means the cost was never entered rather than that the plate is free: ${zero.slice(0, 8).map((x) => x.name).join(", ")}${zero.length > 8 ? ", …" : ""}. Fix the cost or the class and the dollar figures for these items are overstated.` });
  const upside = rows.filter((x) => x.costAbovePrice);
  if (upside.length) findings.push({ severity: "high", title: `${upside.length} item(s) cost more to make than they sell for`, detail: `${upside.slice(0, 8).map((x) => `${x.name} (price ${usd(x.price)}, cost ${usd(x.unitCost)})`).join("; ")}. Check the cost is per plate and the export's sales are net of discounts.` });
  if (rows.length < MIN_ITEMS) findings.push({ severity: "medium", title: `Only ${rows.length} item(s): the matrix is thin`, detail: "The popularity bar and the average margin are relative to the other items in the file, so with so few items the classes say little." });
  if (refundUnits > 0) findings.push({ severity: "info", title: `${refundUnits} refunded unit(s) netted off`, detail: `Negative rows (${usd(refundSales)} of refunds) were added to the same item's quantity and sales, so they reduce popularity and revenue rather than being ignored.` });
  if (excluded.length) findings.push({ severity: "medium", title: `${excluded.length} item(s) left out: net quantity is zero or negative`, detail: `After refunds these items sold nothing: ${excluded.slice(0, 8).map((x) => x.name).join(", ")}${excluded.length > 8 ? ", …" : ""}.` });
  if (rowsMerged) findings.push({ severity: "info", title: `${rowsMerged} duplicate row(s) merged`, detail: "Rows with the same item name and category were added together (quantity and sales summed; the cost is the quantity-weighted average of the rows that carried one)." });
  const unmatched = [...list.keys()].filter((k) => !usedNames.has(k));
  if (unmatched.length) findings.push({ severity: "info", title: `${unmatched.length} name(s) in the cost list matched no item`, detail: `Names are matched ignoring case and extra spaces: ${unmatched.slice(0, 8).join(", ")}${unmatched.length > 8 ? ", …" : ""}. Items that also have a cost column in the export use that instead of the list.` });

  return {
    rows, categories, priceMove, cut, promote, excluded, findings,
    thresholds: { popularityPct: popThreshold, avgCm, factor },
    summary: { items: rows.length, units: totalUnits, sales: totalSales, cost: totalCost, cm: totalCm, avgCm, foodCostPct: totalSales > 0 ? (totalCost / totalSales) * 100 : null, bySource, defaultPct, classes: { Star: rows.filter((x) => x.cls === "Star").length, Plowhorse: plow.length, Puzzle: promote.length, Dog: cut.length }, refundUnits, rowsMerged },
  };
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// The item table as a CSV. Text cells that start with a formula character are
// prefixed so a spreadsheet does not run them.
export function reportCsv(a) {
  const head = ["item", "category", "units", "menu_mix_pct", "net_sales", "price_per_plate", "cost_per_plate", "cost_source", "contribution_margin_per_plate", "total_contribution_margin", "food_cost_pct", "popular", "above_avg_margin", "class", "flags"];
  const lines = [head.join(",")];
  for (const x of a.rows) {
    const flags = [x.costSource === "default" ? "placeholder cost" : "", x.zeroCost ? "zero cost" : "", x.costAbovePrice ? "cost above price" : ""].filter(Boolean).join("; ");
    lines.push([x.name, x.category, x.qty, x.mixPct.toFixed(2), x.sales.toFixed(2), x.price.toFixed(2), x.unitCost.toFixed(2), x.costSource, x.cm.toFixed(2), x.cmTotal.toFixed(2), x.foodCostPct === null ? "" : x.foodCostPct.toFixed(1), x.popular ? "yes" : "no", x.highMargin ? "yes" : "no", x.cls, flags].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export function summaryText(a) {
  const s = a.summary, t = a.thresholds, p = a.priceMove;
  const out = [
    `Menu mix report: ${s.items} items, ${s.units} plates, ${usd(s.sales)} net sales, food cost ${s.foodCostPct === null ? "n/a" : s.foodCostPct.toFixed(1) + "%"}, contribution margin ${usd(s.cm)} (${usd(s.avgCm)} per plate on average).`,
    `Popular = at least ${t.popularityPct.toFixed(2)}% of plates (70% of an even share). High margin = at least ${usd(t.avgCm)} per plate.`,
    `Stars ${s.classes.Star}, Plowhorses ${s.classes.Plowhorse}, Puzzles ${s.classes.Puzzle}, Dogs ${s.classes.Dog}.`,
    `Costs: ${s.bySource.export} from the export, ${s.bySource.list} from the pasted list, ${s.bySource.default} from the ${s.defaultPct}% placeholder.`,
  ];
  if (p.items.length) out.push(`A ${p.risePct}% rise on ${p.items.length} Plowhorse(s) with ${p.lossPct}% fewer plates: ${p.gain >= 0 ? "+" : ""}${usd(p.gain)} over the export period` + (p.gainPerYear !== null ? ` (about ${usd(p.gainPerYear)} a year).` : "."));
  if (a.cut.length) out.push("Review for cutting: " + a.cut.slice(0, 5).map((x) => x.name).join(", ") + ".");
  if (a.promote.length) out.push("Re-promote: " + a.promote.slice(0, 5).map((x) => x.name).join(", ") + ".");
  out.push("Estimates from the file and the costs you supplied; not advice.");
  return out.join("\n");
}

// Synthetic sample: an invented cafe. Includes a duplicate row, a refund, a
// voided row, a modifier row, thousands separators and $ signs.
export function sampleCsv() {
  const sales = [
    "Item,Category,Qty,Net Sales,Void",
    "Classic Burger,Mains,412,\"$5,768.00\",",
    "Grilled Salmon,Mains,96,\"$2,304.00\",",
    "Ribeye 12oz,Mains,58,\"$2,262.00\",",
    "Chicken Sandwich,Mains,388,\"$4,656.00\",",
    "Chicken Sandwich,Mains,20,$240.00,",
    "Chicken Sandwich,Mains,-3,-$36.00,",
    "Caesar Salad,Starters,210,\"$2,310.00\",",
    "Fried Calamari,Starters,44,$616.00,",
    "Soup of the Day,Starters,31,$217.00,",
    "House Fries,Sides,520,\"$2,600.00\",",
    "Side Salad,Sides,18,$108.00,",
    "Cheesecake,Desserts,72,$576.00,",
    "Tiramisu,Desserts,25,$212.50,",
    "Sparkling Water,Drinks,140,$490.00,",
    "Cold Brew,Drinks,260,\"$1,170.00\",",
    "Veggie Wrap,Mains,12,$132.00,",
    "Comped Test Item,Mains,3,$0.00,true",
    "+ Extra Cheese,Modifiers,180,$270.00,",
  ].join("\n");
  const costs = [
    "Classic Burger,4.10",
    "Grilled Salmon,9.60",
    "Ribeye 12oz,15.10",
    "chicken sandwich,3.35",
    "Caesar Salad,2.60",
    "Fried Calamari,4.90",
    "House Fries,1.05",
    "Cheesecake,2.30",
    "Tiramisu,3.40",
    "Sparkling Water,0.00",
  ].join("\n");
  return { sales, costs };
}
