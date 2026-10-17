// Per-item, per-brand and per-month profit analysis from a Poshmark "My Sales
// Report" CSV. Column names are matched by alias from memory of Poshmark's
// export; no real export was available when this was written. Pure functions,
// no DOM, no network.
//
// The fee constants and commissionFor() are the same rules as
// ../poshmark-fee-calculator/calc.mjs (a test asserts the two stay equal):
// a flat $2.95 under $15.00, 20% of the sale price at $15.00 or more.

export const COMMISSION_THRESHOLD = 15;
export const FLAT_FEE = 2.95;
export const PERCENT_RATE = 20;
/** The sale price at which 20% of the price equals the flat fee. */
export const BREAK_EVEN_PRICE = Math.round((FLAT_FEE / (PERCENT_RATE / 100)) * 100) / 100;

export function commissionFor(salePrice) {
  if (salePrice < COMMISSION_THRESHOLD) return { tier: "flat", commission: Math.min(FLAT_FEE, salePrice) };
  return { tier: "percent", commission: salePrice * (PERCENT_RATE / 100) };
}

const ALIASES = {
  id: ["order id", "order #", "order number", "order no", "order", "id", "sale id", "transaction id"],
  date: ["order date", "sale date", "date sold", "sold date", "date of sale", "sold on", "order placed", "date", "order date/time", "sold at"],
  listed: ["listed date", "listing date", "date listed", "list date", "listed on", "created date", "created at", "date created", "listed at"],
  title: ["listing title", "title", "item title", "item name", "item", "listing name", "name", "description", "listing"],
  brand: ["brand", "designer", "brand name", "item brand"],
  sku: ["sku", "custom sku", "item sku", "seller sku", "listing sku", "custom label"],
  listPrice: ["listing price", "list price", "listed price", "original price", "original listing price", "asking price"],
  price: ["order price", "sale price", "sold price", "price", "item price", "order subtotal", "subtotal", "order total", "total sales", "sales", "gross", "item sale price"],
  fee: ["poshmark fee", "posh fee", "poshmark fees", "seller fee", "selling fee", "transaction fee", "commission", "fee", "fees", "marketplace fee"],
  net: ["net earnings", "seller earnings", "your earnings", "earnings", "net payout", "payout", "net proceeds", "proceeds", "net", "seller payout"],
  shipDisc: ["seller shipping discount", "shipping discount", "seller shipping discount amount", "shipping discount (seller)", "seller paid shipping", "seller-paid shipping", "shipping subsidy", "shipping discount amount"],
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
export const MIN_BRAND_ITEMS = 3;
export const FEE_MODES = ["auto", "schedule"];
const r2 = (n) => Math.round(n * 100) / 100;
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const usd = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

// Returns { items, skipped, excludedCount, currency, columns, dmy, feeSource, error }.
// An item is { line, id, title, brand, sku, t, listedT, price, fee, scheduleFee,
// payout, shippingLoss, cost, listPrice } where cost is null when the file does
// not say. feeMode "auto" reads the fee column when there is one and otherwise
// applies the published schedule; "schedule" always applies the schedule.
// Cancelled, returned and refunded orders are left out and counted.
export function normalizeRows(table, { decimalComma = false, feeMode = "auto" } = {}) {
  const empty = { items: [], skipped: [], excludedCount: 0, currency: "", columns: {}, dmy: false, feeSource: "schedule" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.date !== undefined && c.price !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Order Date” and “Order Price” (or “Sale Price”), plus ideally “Brand”, “Listing Title”, “Poshmark Fee”, “Net Earnings”, “Listed Date” and a cost column. Download My Sales Report from Poshmark or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const feeSource = feeMode !== "schedule" && cols.fee !== undefined ? "column" : "schedule";

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
    const scheduleFee = r2(commissionFor(price).commission);
    const feeRaw = feeSource === "column" ? money("fee") : null;
    const fee = feeRaw === null ? scheduleFee : r2(Math.abs(feeRaw));
    const shipDisc = Math.abs(money("shipDisc") ?? 0);
    const netFile = money("net");
    const expected = price - fee;
    let payout, shippingLoss;
    if (netFile !== null) {
      // The file's own net is trusted. Anything it takes off beyond the fee is a
      // deduction (a seller shipping discount is the usual one).
      payout = netFile;
      const gap = expected - netFile;
      shippingLoss = Math.max(shipDisc, gap > 0.005 ? gap : 0);
    } else {
      payout = expected - shipDisc;
      shippingLoss = shipDisc;
    }
    const listed = parseWhen(get(line, "listed"), dmy);
    const cur = get(line, "currency");
    if (cur && !currency) currency = cur;
    const cost = money("cost");
    items.push({
      line: lineNo, id: get(line, "id"), title: get(line, "title"), brand: get(line, "brand"), sku: get(line, "sku"),
      t: when.t, listedT: listed ? listed.t : null, price: r2(price), fee, scheduleFee,
      payout: r2(payout), shippingLoss: r2(shippingLoss), cost: cost === null ? null : r2(cost),
      listPrice: money("listPrice"),
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
  const days = list.filter((x) => x.daysToSell !== null).map((x) => x.daysToSell);
  return {
    label, items: list.length, price: r2(price), fee: r2(fee), feeRate: price > 0 ? fee / price : null,
    shippingLoss: r2(list.reduce((s, x) => s + x.shippingLoss, 0)), payout: r2(payout),
    costedItems: costed.length, cost: r2(cost), profit: costed.length ? r2(profit) : null,
    margin: costed.length && costedPrice > 0 ? profit / costedPrice : null,
    avgDays: days.length ? days.reduce((s, d) => s + d, 0) / days.length : null,
  };
}

const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

// items: normalizeRows(...).items. costList: pasted text (overrides the file's
// cost column for any item it matches, by SKU, then order id, then title).
export function analyze(rawItems, { costList = "", from = null, to = null, minBrandItems = MIN_BRAND_ITEMS } = {}) {
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
    const daysToSell = x.listedT !== null && x.t >= x.listedT ? Math.round((x.t - x.listedT) / DAY) : null;
    return { ...x, cost, costSource, profit, daysToSell, brandLabel: x.brand || "(no brand)", effectiveFeeRate: x.price > 0 ? x.fee / x.price : null };
  });
  const unmatched = [...parsedList.map.keys()].filter((k) => !matchedKeys.has(k));

  const group = (keyFn, sortFn) => {
    const m = new Map();
    for (const x of items) { const k = keyFn(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); }
    return [...m].map(([k, list]) => rollup(k, list)).sort(sortFn);
  };
  const byMonth = group((x) => monthKey(x.t), (a, b) => (a.label < b.label ? -1 : 1));
  const byBrand = group((x) => x.brandLabel, (a, b) => ((b.profit ?? b.payout) - (a.profit ?? a.payout)) || (b.items - a.items));

  const total = rollup("All", items);
  const costed = items.filter((x) => x.cost !== null);
  const rankBasis = costed.length ? "profit" : "payout";
  const rankPool = costed.length ? costed : items;
  const metric = (x) => (rankBasis === "profit" ? x.profit : x.payout);
  const worstItems = [...rankPool].sort((a, b) => metric(a) - metric(b)).slice(0, 10);
  const bestItems = [...rankPool].sort((a, b) => metric(b) - metric(a)).slice(0, 10);
  const losing = costed.filter((x) => x.profit < 0);

  const flat = items.filter((x) => x.scheduleFee > 0 && x.price < COMMISSION_THRESHOLD);
  const flatExtra = r2(flat.reduce((s, x) => s + Math.max(0, x.scheduleFee - x.price * (PERCENT_RATE / 100)), 0));
  const feeMismatch = items.filter((x) => Math.abs(x.fee - x.scheduleFee) > 0.02);
  const shipLossItems = items.filter((x) => x.shippingLoss > 0.005);
  const days = items.filter((x) => x.daysToSell !== null).map((x) => x.daysToSell);
  const slow = items.filter((x) => x.daysToSell !== null && x.daysToSell > 90);

  // Brands to stop sourcing: with costs, a brand that lost money over at least
  // minBrandItems costed sales. Without any costs the file cannot say, so the
  // fallback names brands where the fee alone takes a quarter of the price.
  const stopBrands = byBrand.filter((b) => b.costedItems >= minBrandItems && b.profit < 0);
  const thinBrands = byBrand.filter((b) => b.costedItems >= minBrandItems && b.profit >= 0 && b.margin !== null && b.margin < 0.1);
  const feeHeavyBrands = costed.length ? [] : byBrand.filter((b) => b.items >= minBrandItems && b.feeRate >= 0.25);

  const findings = [];
  if (!costed.length) findings.push({ severity: "high", title: "No cost basis, so nothing here is profit yet", detail: "Payout below is sale price minus Poshmark's fee (and any shipping deduction), before what you paid for the item. Add a cost column to the file or paste SKU,cost pairs in step 2 to see profit, losing items and brands to stop sourcing." });
  else if (costed.length < items.length) findings.push({ severity: "medium", title: `${items.length - costed.length} of ${items.length} sales have no cost`, detail: `Profit, margin and the brand verdicts use only the ${costed.length} sales with a cost. Payout totals cover all ${items.length}.` });
  if (losing.length) findings.push({ severity: "high", title: `${losing.length} sale${losing.length === 1 ? "" : "s"} lost money after fee and cost`, detail: `Together ${usd(losing.reduce((s, x) => s + x.profit, 0))}. The worst are listed below.` });
  if (stopBrands.length) findings.push({ severity: "high", title: `Consider not sourcing: ${stopBrands.map((b) => b.label).join(", ")}`, detail: stopBrands.map((b) => `${b.label}: ${usd(b.profit)} over ${b.costedItems} sales (${(b.feeRate * 100).toFixed(0)}% effective fee)`).join("; ") + `. A brand needs at least ${minBrandItems} costed sales to be named.` });
  if (thinBrands.length) findings.push({ severity: "medium", title: `Thin margin brands: ${thinBrands.map((b) => b.label).join(", ")}`, detail: thinBrands.map((b) => `${b.label}: ${(b.margin * 100).toFixed(0)}% of sale price kept as profit`).join("; ") + "." });
  if (feeHeavyBrands.length) findings.push({ severity: "medium", title: `Fee takes 25% or more of the price: ${feeHeavyBrands.map((b) => b.label).join(", ")}`, detail: "The flat fee is heavy on low-priced items. Without a cost column this is the only sourcing signal the file can give." });
  if (flat.length) findings.push({ severity: flatExtra > 0 ? "medium" : "info", title: `${flat.length} sale${flat.length === 1 ? "" : "s"} under $15 paid the flat $2.95`, detail: `That is ${usd(flat.reduce((s, x) => s + x.scheduleFee, 0))} in fees on ${usd(flat.reduce((s, x) => s + x.price, 0))} of sales (${(flat.reduce((s, x) => s + x.scheduleFee, 0) / flat.reduce((s, x) => s + x.price, 0) * 100).toFixed(0)}%)${flatExtra > 0 ? `, ${usd(flatExtra)} more than 20% would have taken, because the flat fee costs more than 20% below $${BREAK_EVEN_PRICE.toFixed(2)}` : ""}.` });
  if (shipLossItems.length) findings.push({ severity: "medium", title: `${shipLossItems.length} sale${shipLossItems.length === 1 ? "" : "s"} carried a shipping discount or deduction`, detail: `${usd(shipLossItems.reduce((s, x) => s + x.shippingLoss, 0))} in total, an average of ${usd(shipLossItems.reduce((s, x) => s + x.shippingLoss, 0) / shipLossItems.length)} on those sales. Where the file lists a seller shipping discount it is used; otherwise any gap between price minus fee and net earnings is counted.` });
  if (feeMismatch.length) findings.push({ severity: "info", title: `${feeMismatch.length} fee${feeMismatch.length === 1 ? "" : "s"} in the file differ from the published $2.95 / 20% schedule`, detail: "The fee in your file is used. Promotions, a different rate on your account or an old schedule can explain this; check a few against your own statement." });
  if (slow.length) findings.push({ severity: "info", title: `${slow.length} item${slow.length === 1 ? "" : "s"} took more than 90 days to sell`, detail: "Slow sellers tie up cash and closet space. Days are from the listed date to the order date in the file." });

  return {
    items, byBrand, byMonth, worstItems, bestItems, rankBasis, findings, stopBrands, thinBrands, unmatched, costList: { count: parsedList.count, errors: parsedList.errors },
    summary: {
      ...total, from: Math.min(...items.map((x) => x.t)), to: Math.max(...items.map((x) => x.t)), brands: byBrand.length,
      losingItems: losing.length, flatItems: flat.length, flatExtraVs20: flatExtra, shippingLossItems: shipLossItems.length,
      feeMismatches: feeMismatch.length, avgDays: days.length ? days.reduce((s, d) => s + d, 0) / days.length : null, medianDays: median(days), daysItems: days.length,
    },
  };
}

// Plain text for pasting into a note, a forum post or a message to yourself.
export function summaryText(r, { currency = "" } = {}) {
  const s = r.summary, c = currency ? currency + " " : "";
  const m = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + c + "$" + Math.abs(n).toFixed(2) : "n/a");
  const lines = [
    `Poshmark sales ${dateStr(s.from)} to ${dateStr(s.to)}: ${s.items} sales across ${s.brands} brand(s)`,
    `Sales ${m(s.price)}, Poshmark fees ${m(s.fee)} (${(s.feeRate * 100).toFixed(1)}% effective), shipping deductions ${m(s.shippingLoss)}, payout ${m(s.payout)}`,
  ];
  if (s.costedItems) lines.push(`Cost ${m(s.cost)} on ${s.costedItems} item(s), profit ${m(s.profit)}${s.margin !== null ? ` (${(s.margin * 100).toFixed(0)}% of sale price)` : ""}, ${s.losingItems} losing`);
  else lines.push("No cost basis supplied: figures are payout before what the items cost");
  if (s.avgDays !== null) lines.push(`Days to sell: average ${s.avgDays.toFixed(0)}, median ${s.medianDays.toFixed(0)} (${s.daysItems} items)`);
  const top = r.byBrand.slice(0, 3).map((b) => `${b.label} ${m(b.profit ?? b.payout)}`);
  lines.push(`Top brands by ${r.rankBasis}: ${top.join("; ")}`);
  if (r.stopBrands.length) lines.push(`Consider not sourcing: ${r.stopBrands.map((b) => `${b.label} (${m(b.profit)})`).join("; ")}`);
  const w = r.worstItems[0], b = r.bestItems[0];
  if (w) lines.push(`Worst item: ${w.title || w.id || "(untitled)"} ${m(r.rankBasis === "profit" ? w.profit : w.payout)}; best: ${b.title || b.id || "(untitled)"} ${m(r.rankBasis === "profit" ? b.profit : b.payout)}`);
  lines.push("Made with the Poshmark Sales Report Analyzer (nothing uploaded). Estimates from the file supplied.");
  return lines.join("\n");
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Synthetic, invented sales for the "Load an example" button. Not a real account.
export function sampleCsv() {
  const lines = ["Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price,Poshmark Fee,Seller Shipping Discount,Net Earnings,Cost"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const brands = [
    { name: "Lululemon", titles: ["Align leggings", "Define jacket", "Scuba hoodie"], price: [48, 78], cost: [14, 22], slow: 20 },
    { name: "Free People", titles: ["Boho dress", "Knit cardigan", "Lace top"], price: [32, 58], cost: [10, 18], slow: 35 },
    { name: "Zara", titles: ["Satin blouse", "Pleated skirt", "Crop tee"], price: [9, 14], cost: [6, 9], slow: 50 },
    { name: "Old Navy", titles: ["Tee", "Jogger", "Tank"], price: [7, 12], cost: [7, 11], slow: 70 },
    { name: "Nike", titles: ["Dri-FIT tee", "Tech fleece", "Running shorts"], price: [18, 36], cost: [8, 15], slow: 25 },
  ];
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const b = brands[i % brands.length];
    const price = Math.round(b.price[0] + rnd() * (b.price[1] - b.price[0]));
    const cost = Math.round((b.cost[0] + rnd() * (b.cost[1] - b.cost[0])) * 100) / 100;
    const fee = r2(commissionFor(price).commission);
    const disc = rnd() < 0.2 ? 2 : 0;
    const sold = Date.UTC(2026, 3 + Math.floor(i / 14), 1 + ((i * 7) % 27));
    const listed = sold - Math.round(b.slow * (0.4 + rnd() * 1.2)) * DAY;
    n++;
    lines.push([`SAMPLE-${1000 + n}`, dateStr(sold), dateStr(listed), `${b.titles[i % 3]}`, b.name, `${b.name.slice(0, 3).toUpperCase()}-${String(n).padStart(3, "0")}`, price.toFixed(2), fee.toFixed(2), disc.toFixed(2), (price - fee - disc).toFixed(2), cost.toFixed(2)].join(","));
  }
  return lines.join("\n");
}
