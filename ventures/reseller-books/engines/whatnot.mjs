// Per-sale, per-show and per-category profit analysis from a Whatnot seller
// orders/sales CSV. Column names are matched by alias from memory of Whatnot's
// seller export; no real export was available when this was written. Pure
// functions, no DOM, no network.
//
// Fee model (same published shape as ../whatnot-seller-payout/calc.mjs, a test
// asserts the constants stay equal): commission is a percentage of the item
// price; payment processing is a percentage of what the buyer paid (item +
// shipping + tax) plus a flat 30 cents. Both rates are editable inputs, not a
// live lookup.

export const DEFAULT_COMMISSION_RATE = 8;
export const DEFAULT_PAYMENT_RATE = 2.9;
export const DEFAULT_PAYMENT_FIXED = 0.3;

export function scheduleFee(price, buyerShipping = 0, tax = 0, { commissionRate = DEFAULT_COMMISSION_RATE, paymentRate = DEFAULT_PAYMENT_RATE, paymentFixed = DEFAULT_PAYMENT_FIXED } = {}) {
  const commission = price * (commissionRate / 100);
  const processing = (price + buyerShipping + tax) * (paymentRate / 100) + paymentFixed;
  return { commission, processing, fee: commission + processing };
}

const ALIASES = {
  id: ["order id", "order #", "order number", "order no", "order", "id", "sale id", "transaction id"],
  date: ["order date", "sale date", "date sold", "sold date", "date of sale", "sold on", "order placed", "date", "order date/time", "sold at", "created at", "created"],
  title: ["product name", "item name", "item title", "title", "listing title", "item", "product", "description", "listing", "name"],
  show: ["show", "show name", "stream", "stream title", "livestream", "live stream", "show title", "show id"],
  category: ["category", "product category", "item category", "sub category", "subcategory"],
  sku: ["sku", "custom sku", "item sku", "seller sku", "custom label"],
  price: ["sold price", "sale price", "item price", "price", "hammer", "hammer price", "item subtotal", "subtotal", "gross", "sales", "amount sold", "sold for"],
  buyerShip: ["shipping charged", "buyer shipping", "shipping paid by buyer", "shipping fee", "shipping price", "shipping"],
  tax: ["sales tax", "tax", "tax collected", "buyer tax"],
  commission: ["commission", "commission fee", "whatnot commission", "selling fee", "seller fee", "marketplace fee"],
  processing: ["processing fee", "payment processing fee", "payment processing", "processing", "payment fee"],
  fee: ["total fees", "fees", "fee", "whatnot fee", "whatnot fees", "total fee"],
  net: ["net earnings", "earnings", "net payout", "payout", "seller payout", "net proceeds", "proceeds", "net", "your earnings", "seller earnings"],
  cost: ["cost", "item cost", "cost basis", "purchase price", "cogs", "my cost", "cost of goods", "cost of goods sold", "sourcing cost", "cost price", "buy price", "paid"],
  status: ["order status", "status", "state", "sale status"],
  currency: ["currency"],
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
function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

const DAY = 86400000;
export const MIN_GROUP_ITEMS = 3;
export const FEE_MODES = ["auto", "schedule"];
const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

// Returns { items, skipped, excludedCount, currency, columns, dmy, feeSource, error }.
// An item is { line, id, title, show, category, sku, t, price, fee, scheduleFee,
// payout, deductions, cost } where cost is null when the file does not say.
// feeMode "auto" reads the file's fee columns when there are any and otherwise
// applies the rates; "schedule" always applies the rates. Cancelled, returned
// and refunded orders are left out and counted.
export function normalizeRows(table, { decimalComma = false, feeMode = "auto", commissionRate = DEFAULT_COMMISSION_RATE, paymentRate = DEFAULT_PAYMENT_RATE, paymentFixed = DEFAULT_PAYMENT_FIXED } = {}) {
  const empty = { items: [], skipped: [], excludedCount: 0, currency: "", columns: {}, dmy: false, feeSource: "schedule" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.date !== undefined && c.price !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Order Date” and “Sold Price” (or “Sale Price”), plus ideally “Product Name”, “Show”, “Category”, “Commission”, “Processing Fee”, “Net Earnings” and a cost column. Download your orders from Whatnot Seller Hub or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const hasFeeCols = cols.fee !== undefined || cols.commission !== undefined || cols.processing !== undefined;
  const feeSource = feeMode !== "schedule" && hasFeeCols ? "column" : "schedule";
  const rates = { commissionRate, paymentRate, paymentFixed };

  const items = [], skipped = [];
  let currency = "", excludedCount = 0;
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const when = parseWhen(get(line, "date"), dmy);
    if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    const price = parseNumber(get(line, "price"), decimalComma);
    if (!Number.isFinite(price)) { skipped.push({ line: lineNo, reason: "price not readable" }); continue; }
    if (!(price > 0)) { skipped.push({ line: lineNo, reason: "no sale price" }); continue; }
    if (/cancel|return|refund|declin|fail/i.test(get(line, "status"))) { excludedCount++; continue; }
    const money = (f) => {
      const raw = get(line, f);
      if (cols[f] === undefined || isBlank(raw)) return null;
      const v = parseNumber(raw, decimalComma);
      return Number.isFinite(v) ? v : null;
    };
    const sched = r2(scheduleFee(price, Math.abs(money("buyerShip") ?? 0), Math.abs(money("tax") ?? 0), rates).fee);
    let fee = sched;
    if (feeSource === "column") {
      const total = money("fee"), c = money("commission"), p = money("processing");
      if (c !== null || p !== null) fee = r2(Math.abs(c ?? 0) + Math.abs(p ?? 0));
      else if (total !== null) fee = r2(Math.abs(total));
    }
    const netFile = money("net");
    const expected = price - fee;
    let payout, deductions;
    if (netFile !== null) {
      // The file's own net is trusted. Anything it takes off beyond the fees is
      // an unexplained deduction (a shipping label the seller paid, a chargeback).
      payout = netFile;
      const gap = expected - netFile;
      deductions = gap > 0.005 ? gap : 0;
    } else {
      payout = expected;
      deductions = 0;
    }
    const cur = get(line, "currency");
    if (cur && !currency) currency = cur;
    const cost = money("cost");
    items.push({
      line: lineNo, id: get(line, "id"), title: get(line, "title"), show: get(line, "show"), category: get(line, "category"), sku: get(line, "sku"),
      t: when.t, price: r2(price), fee, scheduleFee: sched, payout: r2(payout), deductions: r2(deductions), cost: cost === null ? null : r2(cost),
    });
  }
  if (!items.length) return { ...empty, skipped, excludedCount, currency, columns: cols, dmy, feeSource, error: "No sales could be read from the file. " + (skipped.length ? `${skipped.length} row(s) were skipped (first: line ${skipped[0].line}, ${skipped[0].reason}).` : "Every order was cancelled, returned or refunded.") };
  return { items, skipped, excludedCount, currency, columns: cols, dmy, feeSource };
}

// Pasted cost basis: one "SKU, cost" pair per line (comma, tab or semicolon; the
// last separator splits, so a title with commas still works). A first line whose
// cost is not a number is treated as a header. Returns { map, count, errors }.
export function parseCostList(text) {
  const map = new Map(), errors = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let count = 0;
  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const at = Math.max(line.lastIndexOf(","), line.lastIndexOf("\t"), line.lastIndexOf(";"));
    if (at <= 0) { errors.push({ line: idx + 1, reason: "needs a name, a separator and a cost" }); return; }
    const key = norm(line.slice(0, at).replace(/^"|"$/g, ""));
    const cost = parseNumber(line.slice(at + 1).replace(/^"|"$/g, ""));
    if (!key || !Number.isFinite(cost) || line.slice(at + 1).trim() === "") {
      if (idx === 0) return;
      errors.push({ line: idx + 1, reason: "cost is not a number" });
      return;
    }
    if (cost < 0) { errors.push({ line: idx + 1, reason: "cost is negative" }); return; }
    map.set(key, cost);
    count++;
  });
  return { map, count, errors };
}

function rollup(label, list) {
  const price = list.reduce((s, x) => s + x.price, 0);
  const fee = list.reduce((s, x) => s + x.fee, 0);
  const payout = list.reduce((s, x) => s + x.payout, 0);
  const costed = list.filter((x) => x.cost !== null);
  const costedPrice = costed.reduce((s, x) => s + x.price, 0);
  const cost = costed.reduce((s, x) => s + x.cost, 0);
  const profit = costed.reduce((s, x) => s + x.profit, 0);
  return {
    label, items: list.length, price: r2(price), fee: r2(fee), feeRate: price > 0 ? fee / price : null,
    deductions: r2(list.reduce((s, x) => s + x.deductions, 0)), payout: r2(payout),
    costedItems: costed.length, cost: r2(cost), profit: costed.length ? r2(profit) : null,
    margin: costed.length && costedPrice > 0 ? profit / costedPrice : null,
    avgPrice: list.length ? price / list.length : null,
  };
}

const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

// items: normalizeRows(...).items. costList: pasted text (overrides the file's
// cost column for any item it matches, by SKU, then order id, then title).
export function analyze(rawItems, { costList = "", from = null, to = null, minGroupItems = MIN_GROUP_ITEMS, lowPrice = 10 } = {}) {
  const parsedList = parseCostList(costList);
  const matchedKeys = new Set();
  let items = rawItems.filter((x) => (from === null || x.t >= from) && (to === null || x.t < to + DAY));
  if (!items.length) return { invalid: "No sales fall inside the date range you chose." };
  items = items.map((x) => {
    let cost = x.cost, costSource = x.cost === null ? null : "file";
    for (const k of [norm(x.sku), norm(x.id), norm(x.title)]) {
      if (k && parsedList.map.has(k)) { cost = r2(parsedList.map.get(k)); costSource = "list"; matchedKeys.add(k); break; }
    }
    const profit = cost === null ? null : r2(x.payout - cost);
    return { ...x, cost, costSource, profit, showLabel: x.show || "(no show)", categoryLabel: x.category || "(no category)", effectiveFeeRate: x.price > 0 ? x.fee / x.price : null };
  });
  const unmatched = [...parsedList.map.keys()].filter((k) => !matchedKeys.has(k));

  const group = (keyFn, sortFn) => {
    const m = new Map();
    for (const x of items) { const k = keyFn(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); }
    return [...m].map(([k, list]) => rollup(k, list)).sort(sortFn);
  };
  const byValue = (a, b) => ((b.profit ?? b.payout) - (a.profit ?? a.payout)) || (b.items - a.items);
  const byMonth = group((x) => monthKey(x.t), (a, b) => (a.label < b.label ? -1 : 1));
  const byShow = group((x) => x.showLabel, byValue);
  const byCategory = group((x) => x.categoryLabel, byValue);

  const total = rollup("All", items);
  const costed = items.filter((x) => x.cost !== null);
  const rankBasis = costed.length ? "profit" : "payout";
  const rankPool = costed.length ? costed : items;
  const metric = (x) => (rankBasis === "profit" ? x.profit : x.payout);
  const worstItems = [...rankPool].sort((a, b) => metric(a) - metric(b)).slice(0, 10);
  const bestItems = [...rankPool].sort((a, b) => metric(b) - metric(a)).slice(0, 10);
  const losing = costed.filter((x) => x.profit < 0);

  const cheap = items.filter((x) => x.price < lowPrice);
  const cheapFees = cheap.reduce((s, x) => s + x.fee, 0), cheapSales = cheap.reduce((s, x) => s + x.price, 0);
  const feeMismatch = items.filter((x) => Math.abs(x.fee - x.scheduleFee) > 0.05);
  const deducted = items.filter((x) => x.deductions > 0.005);

  const losers = (groups) => groups.filter((g) => g.costedItems >= minGroupItems && g.profit < 0 && !g.label.startsWith("("));
  const stopShows = losers(byShow), stopCategories = losers(byCategory);
  const thinCategories = byCategory.filter((g) => g.costedItems >= minGroupItems && g.profit >= 0 && g.margin !== null && g.margin < 0.1 && !g.label.startsWith("("));
  const feeHeavy = costed.length ? [] : byCategory.filter((g) => g.items >= minGroupItems && g.feeRate >= 0.15 && !g.label.startsWith("("));

  const findings = [];
  if (!costed.length) findings.push({ severity: "high", title: "No cost basis, so nothing here is profit yet", detail: "Payout below is sale price minus Whatnot's fees (and any other deduction in the file), before what you paid for the item. Add a cost column to the file or paste SKU,cost pairs in step 2 to see profit, losing sales, and the shows and categories that lose money." });
  else if (costed.length < items.length) findings.push({ severity: "medium", title: `${items.length - costed.length} of ${items.length} sales have no cost`, detail: `Profit, margin and the show and category verdicts use only the ${costed.length} sales with a cost. Payout totals cover all ${items.length}.` });
  if (losing.length) findings.push({ severity: "high", title: `${losing.length} sale${losing.length === 1 ? "" : "s"} lost money after fees and cost`, detail: `Together ${usd(losing.reduce((s, x) => s + x.profit, 0))}. The worst are listed below.` });
  if (stopCategories.length) findings.push({ severity: "high", title: `Categories that lost money: ${stopCategories.map((g) => g.label).join(", ")}`, detail: stopCategories.map((g) => `${g.label}: ${usd(g.profit)} over ${g.costedItems} costed sales (${(g.feeRate * 100).toFixed(0)}% effective fee)`).join("; ") + `. A group needs at least ${minGroupItems} costed sales to be named.` });
  if (stopShows.length) findings.push({ severity: "high", title: `Shows that lost money: ${stopShows.map((g) => g.label).join(", ")}`, detail: stopShows.map((g) => `${g.label}: ${usd(g.profit)} over ${g.costedItems} costed sales`).join("; ") + ". Look at your starting bids, and whether the lots sold below what they cost." });
  if (thinCategories.length) findings.push({ severity: "medium", title: `Thin margin categories: ${thinCategories.map((g) => g.label).join(", ")}`, detail: thinCategories.map((g) => `${g.label}: ${(g.margin * 100).toFixed(0)}% of sale price kept as profit`).join("; ") + "." });
  if (feeHeavy.length) findings.push({ severity: "medium", title: `Fees take 15% or more of the price: ${feeHeavy.map((g) => g.label).join(", ")}`, detail: "The flat 30 cents and the processing on shipping and tax weigh on small sales. Without a cost column this is the only sourcing signal the file can give." });
  if (cheap.length) findings.push({ severity: cheapSales > 0 && cheapFees / cheapSales >= 0.15 ? "medium" : "info", title: `${cheap.length} sale${cheap.length === 1 ? "" : "s"} under ${usd(lowPrice)} paid ${(cheapFees / cheapSales * 100).toFixed(0)}% in fees`, detail: `${usd(cheapFees)} in fees on ${usd(cheapSales)} of sales. The flat 30 cents of processing is a fixed cost per order, so the smaller the sale, the bigger its share.` });
  if (deducted.length) findings.push({ severity: "medium", title: `${deducted.length} sale${deducted.length === 1 ? "" : "s"} paid out less than price minus fees`, detail: `${usd(deducted.reduce((s, x) => s + x.deductions, 0))} in total, an average of ${usd(deducted.reduce((s, x) => s + x.deductions, 0) / deducted.length)} on those sales. The file's net figure is used as your payout; the gap can be a shipping label, an adjustment or a fee column the file does not itemise.` });
  if (feeMismatch.length) findings.push({ severity: "info", title: `${feeMismatch.length} fee${feeMismatch.length === 1 ? "" : "s"} in the file differ from the rates used here`, detail: "The fee in your file is used. Category rates, promotions, a different processor rate or an old schedule can explain this; check a few against your own statement." });

  return {
    items, byShow, byCategory, byMonth, worstItems, bestItems, rankBasis, findings, stopShows, stopCategories, thinCategories, unmatched, costList: { count: parsedList.count, errors: parsedList.errors },
    summary: {
      ...total, from: Math.min(...items.map((x) => x.t)), to: Math.max(...items.map((x) => x.t)), shows: byShow.filter((g) => !g.label.startsWith("(")).length, categories: byCategory.filter((g) => !g.label.startsWith("(")).length,
      losingItems: losing.length, cheapItems: cheap.length, deductionItems: deducted.length, feeMismatches: feeMismatch.length,
    },
  };
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Plain text for pasting into a note, a forum post or a message to yourself.
export function summaryText(r, { currency = "" } = {}) {
  const s = r.summary, c = currency ? currency + " " : "";
  const m = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + c + "$" + Math.abs(n).toFixed(2) : "n/a");
  const lines = [
    `Whatnot sales ${dateStr(s.from)} to ${dateStr(s.to)}: ${s.items} sales, ${s.shows} show(s), ${s.categories} categor${s.categories === 1 ? "y" : "ies"}`,
    `Sales ${m(s.price)}, Whatnot fees ${m(s.fee)} (${(s.feeRate * 100).toFixed(1)}% effective), other deductions ${m(s.deductions)}, payout ${m(s.payout)}`,
  ];
  if (s.costedItems) lines.push(`Cost ${m(s.cost)} on ${s.costedItems} item(s), profit ${m(s.profit)}${s.margin !== null ? ` (${(s.margin * 100).toFixed(0)}% of sale price)` : ""}, ${s.losingItems} losing`);
  else lines.push("No cost basis supplied: figures are payout before what the items cost");
  const top = r.byCategory.slice(0, 3).map((g) => `${g.label} ${m(g.profit ?? g.payout)}`);
  lines.push(`Top categories by ${r.rankBasis}: ${top.join("; ")}`);
  if (r.stopCategories.length) lines.push(`Categories that lost money: ${r.stopCategories.map((g) => `${g.label} (${m(g.profit)})`).join("; ")}`);
  if (r.stopShows.length) lines.push(`Shows that lost money: ${r.stopShows.map((g) => `${g.label} (${m(g.profit)})`).join("; ")}`);
  const w = r.worstItems[0], b = r.bestItems[0];
  if (w) lines.push(`Worst sale: ${w.title || w.id || "(untitled)"} ${m(r.rankBasis === "profit" ? w.profit : w.payout)}; best: ${b.title || b.id || "(untitled)"} ${m(r.rankBasis === "profit" ? b.profit : b.payout)}`);
  lines.push("Made with the Whatnot Sales Report Analyzer (nothing uploaded). Estimates from the file supplied.");
  return lines.join("\n");
}

// Synthetic, invented sales for the "Load an example" button. Not a real account.
export function sampleCsv() {
  const lines = ["Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price,Shipping Charged,Sales Tax,Commission,Processing Fee,Net Earnings,Cost"];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const cats = [
    { name: "Trading cards", items: ["Rookie card", "Holo rare", "Graded slab"], price: [12, 90], cost: [6, 40], show: "Friday Card Break" },
    { name: "Sneakers", items: ["Retro high", "Runner", "Slide"], price: [40, 140], cost: [30, 95], show: "Sneaker Sunday" },
    { name: "Vintage", items: ["Tee", "Denim jacket", "Windbreaker"], price: [8, 45], cost: [4, 22], show: "Thrift Haul Live" },
    { name: "Coins", items: ["Silver round", "Morgan dollar", "Proof set"], price: [25, 60], cost: [24, 58], show: "Friday Card Break" },
    { name: "Plush", items: ["Blind box", "Limited plush", "Keychain"], price: [3, 9], cost: [3, 8], show: "Thrift Haul Live" },
  ];
  for (let i = 0; i < 45; i++) {
    const c = cats[i % cats.length];
    const price = Math.round(c.price[0] + rnd() * (c.price[1] - c.price[0]));
    const cost = Math.round((c.cost[0] + rnd() * (c.cost[1] - c.cost[0])) * 100) / 100;
    const ship = 4.5, tax = Math.round(price * 0.06 * 100) / 100;
    const comm = r2(price * DEFAULT_COMMISSION_RATE / 100);
    const proc = r2((price + ship + tax) * DEFAULT_PAYMENT_RATE / 100 + DEFAULT_PAYMENT_FIXED);
    const sold = Date.UTC(2026, 4 + Math.floor(i / 15), 1 + ((i * 5) % 27));
    lines.push([`SAMPLE-${2000 + i}`, dateStr(sold), `${c.items[i % 3]}`, c.show, c.name, `${c.name.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}`, price.toFixed(2), ship.toFixed(2), tax.toFixed(2), comm.toFixed(2), proc.toFixed(2), (price - comm - proc).toFixed(2), cost.toFixed(2)].join(","));
  }
  return lines.join("\n");
}
