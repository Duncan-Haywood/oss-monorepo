// Shopify shop analysis from two CSVs the merchant already has: the Shopify
// Payments "Transactions" export (every charge, fee, refund, dispute,
// adjustment and payout) and, optionally, the Orders export (which products
// each order held, the discount code used). Output is the fee waterfall,
// net-to-bank per order, effective fee rate by card and gateway, profit per
// product after unit costs, discount-code cost, dispute and refund findings
// and a monthly table. Pure functions, no DOM, no network.

const TX_ALIASES = {
  date: ["transaction date", "date"],
  type: ["type", "transaction type"],
  order: ["order", "order name", "order id"],
  cardBrand: ["card brand"],
  cardSource: ["card source"],
  payoutStatus: ["payout status"],
  payoutId: ["payout id"],
  amount: ["amount"],
  fee: ["fee", "fees"],
  net: ["net"],
  method: ["payment method name", "payment method"],
  presCurrency: ["presentment currency"],
  currency: ["currency"],
};

const ORDER_ALIASES = {
  name: ["name", "order", "order name"],
  financial: ["financial status"],
  paidAt: ["paid at", "created at"],
  subtotal: ["subtotal"],
  shipping: ["shipping"],
  taxes: ["taxes", "tax"],
  total: ["total"],
  code: ["discount code"],
  discount: ["discount amount"],
  qty: ["lineitem quantity"],
  item: ["lineitem name"],
  price: ["lineitem price"],
  sku: ["lineitem sku"],
  refunded: ["refunded amount"],
  method: ["payment method"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
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

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Shopify writes "2026-09-01 14:03:22 -0400"; older exports and spreadsheets
// re-saved by hand give "Sep 1, 2026" or "09/01/2026".
export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) return { y: +m[3], mo: MONTHS[m[1].toLowerCase()], d: +m[2] };
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return { y: +m[3], mo: MONTHS[m[2].toLowerCase()], d: +m[1] };
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return { y: +m[3], mo: +m[1] - 1, d: +m[2] }; // US month-first
  return null;
}
const monthKeyOf = (p) => `${p.y}-${String(p.mo + 1).padStart(2, "0")}`;

// "" and "--" are zero, not errors; anything unparseable is NaN so the row is
// listed rather than counted as free.
export function parseMoney(value) {
  let s = String(value ?? "").trim();
  if (!s || /^-+$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^\s*-/.test(s)) neg = true;
  s = s.replace(/[^0-9.,]/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return neg ? -n : n;
}

function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

function headerRowIndex(table, must) {
  for (let i = 0; i < Math.min(table.length, 20); i++) {
    const norm = table[i].map((h) => h.trim().toLowerCase());
    if (must.every((alts) => alts.some((a) => norm.includes(a)))) return i;
  }
  return -1;
}

// "#1001", "1001" and " #1001 " are the same order.
export const orderKey = (v) => String(v ?? "").trim().replace(/^#\s*/, "").toLowerCase();

// Transaction rows: one per money movement. `net` is signed from the shop's
// point of view. When the export has no Net column it is rebuilt as
// Amount - Fee (Shopify writes Fee as a positive cost).
export function normalizeTransactions(table) {
  if (!table.length) return { rows: [], skipped: [], error: "The transactions file is empty." };
  const h = headerRowIndex(table, [["type", "transaction type"], ["amount"], ["transaction date", "date"]]);
  if (h === -1) return { rows: [], skipped: [], error: "No header row found. Expected the Shopify Payments transactions export with columns like “Transaction Date”, “Type”, “Order”, “Amount”, “Fee” and “Net”." };
  const cols = findColumns(table[h], TX_ALIASES);
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const date = parseDate(get(r, "date"));
    if (!date) { skipped.push({ line, reason: `unreadable date “${get(r, "date")}”` }); continue; }
    const amount = parseMoney(get(r, "amount"));
    const fee = parseMoney(get(r, "fee"));
    const hasNet = cols.net !== undefined && get(r, "net") !== "";
    const net = hasNet ? parseMoney(get(r, "net")) : amount - fee;
    if ([amount, fee, net].some(Number.isNaN)) { skipped.push({ line, reason: "unreadable amount, fee or net" }); continue; }
    const type = get(r, "type");
    rows.push({
      line, date, month: monthKeyOf(date),
      type, typeKey: type.toLowerCase().replace(/[\s-]+/g, "_"),
      order: get(r, "order"), orderKey: orderKey(get(r, "order")),
      cardBrand: get(r, "cardBrand").toLowerCase(), cardSource: get(r, "cardSource").toLowerCase(),
      payoutStatus: get(r, "payoutStatus").toLowerCase(), payoutId: get(r, "payoutId"),
      method: get(r, "method").toLowerCase(),
      currency: get(r, "currency").toUpperCase(), presCurrency: get(r, "presCurrency").toUpperCase(),
      amount, fee, net,
      // Net is trusted over the Fee column so the waterfall always reconciles.
      feeCost: amount - net,
      feeMismatch: hasNet && cols.fee !== undefined && Math.abs(amount - fee - net) > 0.011,
    });
  }
  return { rows, skipped, error: null };
}

// Orders export: one row per line item; extra lines of a multi-item order
// repeat only the order name, so order-level fields are taken from whichever
// row of the order carries them.
export function normalizeOrders(table) {
  if (!table.length) return { orders: [], skipped: [], error: null };
  const h = headerRowIndex(table, [["name", "order", "order name"], ["lineitem name"]]);
  if (h === -1) return { orders: [], skipped: [], error: "The orders file needs “Name” and “Lineitem name” columns. Export Shopify admin → Orders → Export → CSV for Excel, Numbers, or other spreadsheet programs." };
  const cols = findColumns(table[h], ORDER_ALIASES);
  const get = (r, f) => (cols[f] === undefined ? "" : (r[cols[f]] ?? "")).trim();
  const byKey = new Map(), skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const name = get(r, "name");
    if (!name) { skipped.push({ line, reason: "no order name" }); continue; }
    const money = (f) => parseMoney(get(r, f));
    const qtyText = get(r, "qty"), priceText = get(r, "price");
    const price = money("price"), qty = qtyText === "" ? 1 : parseInt(qtyText, 10);
    const orderLevel = [money("subtotal"), money("taxes"), money("total"), money("discount"), money("refunded")];
    if (Number.isNaN(price) || Number.isNaN(qty) || orderLevel.some(Number.isNaN)) { skipped.push({ line, reason: "unreadable quantity, price or amount" }); continue; }
    const k = orderKey(name);
    if (!byKey.has(k)) byKey.set(k, { key: k, name, code: "", discount: 0, taxes: 0, total: 0, refunded: 0, paidAt: null, method: "", financial: "", items: [] });
    const o = byKey.get(k);
    if (get(r, "code") && !o.code) o.code = get(r, "code").toUpperCase();
    if (get(r, "discount") !== "" && !o.discount) o.discount = Math.abs(money("discount"));
    if (get(r, "taxes") !== "" && !o.taxes) o.taxes = money("taxes");
    if (get(r, "total") !== "" && !o.total) o.total = money("total");
    if (get(r, "refunded") !== "" && !o.refunded) o.refunded = Math.abs(money("refunded"));
    if (!o.paidAt) o.paidAt = parseDate(get(r, "paidAt"));
    if (!o.method) o.method = get(r, "method");
    if (!o.financial) o.financial = get(r, "financial");
    const item = get(r, "item");
    if (item) o.items.push({ line, name: item, sku: get(r, "sku"), quantity: qty || 1, price, gross: Math.max(0, price * (qty || 1)), priceText });
  }
  return { orders: [...byKey.values()], skipped, error: null };
}

const round2 = (n) => Math.round(n * 100) / 100;

// Every transaction row lands in exactly one category. Reversals are checked
// before refunds/disputes so "chargeback_won" is not read as a new dispute.
export function classify(r) {
  const y = r.typeKey;
  if (y === "payout") return "payout";
  if (/chargeback|dispute/.test(y)) return "dispute";
  if (/refund/.test(y)) return "refund";
  if (/third_?party|gateway|paypal|external/.test(y)) return "gateway";
  if (y === "charge" || y === "payment" || y === "capture" || y === "sale") return "charge";
  if (/adjust|reserve|correction|balance|payout_(failure|cancel|reversal)/.test(y)) return "adjustment";
  return "other";
}
const isDisputeReversal = (y) => /won|reversal|reversed|release/.test(y);

const BUCKETS = ["charges", "refunds", "disputes", "processing", "gateway", "disputeFees", "adjustments", "other"];

// One row becomes one or two signed parts that add up to its Net exactly.
function parts(cat, r) {
  const fee = -r.feeCost;
  switch (cat) {
    case "charge": return [["charges", r.amount], ["processing", fee]];
    case "refund": return [["refunds", r.amount], ["processing", fee]];
    case "dispute": return [["disputes", r.amount], ["disputeFees", fee]];
    case "gateway": return [["gateway", r.net]];
    case "adjustment": return [["adjustments", r.net]];
    default: return [["other", r.net]];
  }
}

const isPending = (s) => !!s && !/^(paid|complete|completed)$/.test(s);
const isCardBrand = (s) => !!s;

// costs: { [product name or SKU]: unit cost }
export function analyze(rows, orders = [], { costs = {}, returnsResellable = true, thirdPartyRate = 0 } = {}) {
  if (!rows.length) return { invalid: "No usable transaction rows." };
  const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  const counts = {};
  let payouts = 0, pendingNet = 0, pendingRows = 0, feeMismatch = 0;
  const months = new Map(), txOrders = new Map(), cards = new Map(), gateways = new Map();
  const disputeStats = { opened: 0, won: 0, lostAmount: 0, recovered: 0 };
  const cur = { domestic: { n: 0, gross: 0, fee: 0 }, foreign: { n: 0, gross: 0, fee: 0 } };

  const month = (k) => {
    if (!months.has(k)) months.set(k, { key: k, charges: 0, fees: 0, refunds: 0, disputes: 0, other: 0, net: 0 });
    return months.get(k);
  };
  const txOrder = (r) => {
    if (!txOrders.has(r.orderKey)) txOrders.set(r.orderKey, { key: r.orderKey, id: r.order, month: r.month, charged: 0, processing: 0, gateway: 0, refunds: 0, disputes: 0, disputeFees: 0, other: 0, net: 0 });
    return txOrders.get(r.orderKey);
  };
  const group = (map, key) => {
    if (!map.has(key)) map.set(key, { key, count: 0, gross: 0, fee: 0 });
    return map.get(key);
  };

  for (const r of rows) {
    const cat = classify(r);
    counts[cat] = (counts[cat] || 0) + 1;
    if (r.feeMismatch) feeMismatch++;
    if (cat === "payout") { payouts += Math.abs(r.net); continue; }
    const m = month(r.month);
    m.net += r.net;
    const o = r.orderKey ? txOrder(r) : null;
    if (o) o.net += r.net;
    for (const [b, v] of parts(cat, r)) {
      totals[b] += v;
      if (b === "charges") m.charges += v;
      else if (b === "refunds") m.refunds += v;
      else if (b === "disputes") m.disputes += v;
      else if (b === "processing" || b === "gateway" || b === "disputeFees") m.fees += v;
      else m.other += v;
      if (o) o[b === "charges" ? "charged" : b] += v;
    }
    if (isPending(r.payoutStatus)) { pendingNet += r.net; pendingRows++; }
    if (cat === "dispute") {
      if (isDisputeReversal(r.typeKey)) { disputeStats.recovered += Math.max(0, r.amount); if (/won|reversal|reversed/.test(r.typeKey)) disputeStats.won++; }
      else if (/^(chargeback|dispute)$/.test(r.typeKey)) { disputeStats.opened++; disputeStats.lostAmount += Math.abs(Math.min(0, r.amount)); }
    }
    if (cat === "charge") {
      const card = group(cards, `${isCardBrand(r.cardBrand) ? r.cardBrand : "(no card brand)"} · ${r.cardSource || "source not stated"}`);
      const gw = group(gateways, r.method || "(not stated)");
      for (const g of [card, gw]) { g.count++; g.gross += r.amount; g.fee += r.feeCost; }
      const foreign = r.presCurrency && r.currency && r.presCurrency !== r.currency ? cur.foreign : cur.domestic;
      foreign.n++; foreign.gross += r.amount; foreign.fee += r.feeCost;
    }
  }

  const charges = totals.charges;
  const feeTotal = totals.processing + totals.gateway + totals.disputeFees;
  const operating = BUCKETS.reduce((a, b) => a + totals[b], 0);
  const rate = (g) => (g.gross ? g.fee / g.gross : 0);
  const rated = (map) => [...map.values()].map((g) => ({ ...g, rate: rate(g), avg: g.count ? g.gross / g.count : 0 })).sort((a, b) => b.gross - a.gross);

  // ---- per order, from transactions alone ----
  const orderList = [...txOrders.values()].filter((o) => o.charged !== 0 || o.refunds !== 0 || o.disputes !== 0).map((o) => ({
    ...o,
    fees: o.processing + o.gateway + o.disputeFees,
    netRate: o.charged > 0 ? o.net / o.charged : null,
    fullyRefunded: o.charged > 0 && -o.refunds >= o.charged * 0.95,
  })).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  const chargedOrders = orderList.filter((o) => o.charged > 0);

  // ---- per product, only where the orders file names the products ----
  const products = new Map();
  const product = (k, name, sku) => {
    if (!products.has(k)) products.set(k, { name, sku, units: 0, unitsRefunded: 0, orders: 0, gross: 0, discount: 0, revenue: 0, fees: 0, refunds: 0, net: 0 });
    return products.get(k);
  };
  let matchedOrders = 0, unmatchedOrders = 0, attributedNet = 0, otherGatewayOrders = 0, otherGatewayTotal = 0;
  const codes = new Map();
  let discountTotal = 0, grossLines = 0;
  for (const ord of orders) {
    const gross = ord.items.reduce((a, x) => a + x.gross, 0);
    const disc = Math.min(ord.discount, gross);
    grossLines += gross; discountTotal += disc;
    if (ord.method && !/shopify[ _]?payments|shop[ _]?pay|^shopify$/i.test(ord.method) && !/manual|cash|gift/i.test(ord.method)) { otherGatewayOrders++; otherGatewayTotal += ord.total; }
    const tx = txOrders.get(ord.key);
    const label = ord.code || (disc > 0 ? "(automatic discount)" : "");
    if (label) {
      if (!codes.has(label)) codes.set(label, { code: label, orders: 0, discount: 0, gross: 0, matched: 0, net: 0 });
      const c = codes.get(label);
      c.orders++; c.discount += disc; c.gross += gross;
      if (tx && tx.charged > 0) { c.matched++; c.net += tx.net; }
    }
    if (!ord.items.length) continue;
    if (!tx || tx.charged <= 0) { unmatchedOrders++; continue; }
    matchedOrders++;
    const refundFrac = Math.min(1, Math.max(0, -tx.refunds / tx.charged));
    const taxNet = ord.taxes > 0 ? ord.taxes * (1 - refundFrac) : 0;
    const attributable = tx.net - taxNet;
    const lineRev = ord.items.map((x) => (gross ? x.gross - disc * (x.gross / gross) : 0));
    const revTotal = lineRev.reduce((a, x) => a + x, 0);
    const fullyRefunded = -tx.refunds >= tx.charged * 0.95;
    ord.items.forEach((it, i) => {
      const share = revTotal > 0 ? lineRev[i] / revTotal : 1 / ord.items.length;
      const p = product(it.name.toLowerCase(), it.name, it.sku);
      p.units += it.quantity; p.orders++;
      p.gross += it.gross; p.discount += disc * (gross ? it.gross / gross : 0); p.revenue += lineRev[i];
      p.fees += (tx.processing + tx.gateway + tx.disputeFees) * share;
      p.refunds += (tx.refunds + tx.disputes) * share;
      p.net += attributable * share;
      if (fullyRefunded) p.unitsRefunded += it.quantity;
      attributedNet += attributable * share;
    });
  }
  const productList = [...products.values()].map((p) => {
    const cost = costs[p.name] ?? (p.sku ? costs[p.sku] : undefined);
    const hasCost = typeof cost === "number" && !Number.isNaN(cost);
    const netUnits = p.units - p.unitsRefunded;
    const costedUnits = returnsResellable ? Math.max(0, netUnits) : p.units;
    const cogs = hasCost ? cost * costedUnits : null;
    return {
      ...p, netUnits, unitCost: hasCost ? cost : null,
      refundRate: p.units ? p.unitsRefunded / p.units : 0,
      feeRate: p.revenue ? -p.fees / p.revenue : 0,
      cogs,
      profit: hasCost ? p.net - cogs : null,
      profitPerUnit: hasCost && netUnits > 0 ? (p.net - cogs) / netUnits : null,
      margin: hasCost && p.revenue ? (p.net - cogs) / p.revenue : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);
  const codeList = [...codes.values()].map((c) => ({
    ...c, pct: c.gross ? c.discount / c.gross : 0, share: discountTotal ? c.discount / discountTotal : 0,
    netPerOrder: c.matched ? c.net / c.matched : null,
  })).sort((a, b) => b.discount - a.discount);

  const allCosted = productList.length > 0 && productList.every((p) => p.profit !== null);
  const anyCosted = productList.some((p) => p.profit !== null);
  const cogsTotal = productList.reduce((a, p) => a + (p.cogs ?? 0), 0);
  const monthList = [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  const tpRate = Number.isFinite(thirdPartyRate) && thirdPartyRate > 0 ? thirdPartyRate : 0;

  const summary = {
    firstMonth: monthList[0]?.key ?? "", lastMonth: monthList[monthList.length - 1]?.key ?? "",
    totals, charges, feeTotal, operating, payouts, counts, rowCount: rows.length,
    orderCount: chargedOrders.length,
    processingRate: charges ? -totals.processing / charges : 0,
    allFeeRate: charges ? -feeTotal / charges : 0,
    refundRate: charges ? -totals.refunds / charges : 0,
    disputeRate: chargedOrders.length ? disputeStats.opened / chargedOrders.length : 0,
    avgOrder: chargedOrders.length ? charges / chargedOrders.length : 0,
    avgNetPerOrder: chargedOrders.length ? chargedOrders.reduce((a, o) => a + o.net, 0) / chargedOrders.length : 0,
    disputes: disputeStats, pendingNet, pendingRows, feeMismatch,
    foreign: { ...cur.foreign, rate: rate(cur.foreign) }, domestic: { ...cur.domestic, rate: rate(cur.domestic) },
    matchedOrders, unmatchedOrders, productCount: productList.length,
    attributedNet, cogsTotal, allCosted, anyCosted,
    profit: anyCosted ? operating - cogsTotal : null,
    discountTotal, grossLines, discountRate: grossLines ? discountTotal / grossLines : 0,
    otherGatewayOrders, otherGatewayTotal,
    gatewayEstimate: tpRate ? otherGatewayTotal * tpRate : 0, thirdPartyRate: tpRate,
    ordersFileGiven: orders.length > 0,
  };
  const out = { summary, orders: orderList, products: productList, cards: rated(cards), gateways: rated(gateways), codes: codeList, months: monthList };
  out.findings = findings(summary, out);
  return out;
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const $2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
const P = (x, d = 1) => (x * 100).toFixed(d) + "%";

function findings(s, a) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const t = s.totals;

  if (s.charges > 0) {
    add("info", `Fees took ${P(s.allFeeRate)} of what customers paid`,
      `${$(-s.feeTotal)} of fees against ${$(s.charges)} of charges: processing ${$(-t.processing)} (${P(s.processingRate)}), third-party gateway ${$(-t.gateway)}, dispute fees ${$(-t.disputeFees)}. Compare the processing rate with the Shopify Payments rate on your plan and country; a rate well above it usually means international or manually keyed cards.`);
  }

  if (s.refundRate > 0.05) {
    const lostFees = a.orders.filter((o) => o.fullyRefunded).reduce((x, o) => x + o.processing, 0);
    add(s.refundRate > 0.1 ? "high" : "medium", `Refunds are ${P(s.refundRate)} of charges (${$(-t.refunds)})`,
      `Shopify does not normally return the processing fee on a refund, so each refund costs more than the sale it removes: about ${$(-lostFees)} of fees sit on orders that were refunded in full. Look at which products they were and fix the listing, sizing or delivery promise behind the top ones.`);
  }

  const d = s.disputes;
  if (d.opened > 0) {
    add(s.disputeRate > 0.01 || d.opened >= 3 ? "high" : "medium", `${d.opened} chargeback${d.opened > 1 ? "s" : ""}: ${$(d.lostAmount)} disputed, ${$(-t.disputeFees)} in dispute fees`,
      `That is ${P(s.disputeRate, 2)} of orders. ${d.won ? `${d.won} reversal${d.won > 1 ? "s" : ""} returned ${$(d.recovered)}.` : "None show a reversal in this file yet."} Fees are usually not returned even when a dispute is won, so a chargeback costs the fee on top of the sale. Card networks commonly watch shops whose dispute ratio approaches 1% of transactions; a clear billing descriptor, tracking on every order and prompt replies to evidence requests keep it down.`);
  }

  if (t.adjustments < 0 && -t.adjustments > s.charges * 0.005) {
    add("medium", `Adjustments took ${$(-t.adjustments)}`,
      `${s.counts.adjustment || 0} adjustment or reserve row(s) reduced the balance. Open the rows in the transactions export to see Shopify's reason; reserves usually come back later.`);
  }

  if (s.counts.other > 0) {
    add("info", `${s.counts.other} row${s.counts.other > 1 ? "s" : ""} of a type this tool does not recognise (${$(t.other)})`,
      "They are counted in the “Other rows” line so the waterfall still adds up to the bank total. If a type appears here regularly, tell us its name so it gets its own line.");
  }

  if (s.foreign.n >= 5 && s.domestic.n >= 5 && s.foreign.rate - s.domestic.rate > 0.005) {
    add("medium", `Charges presented in another currency cost ${P(s.foreign.rate)} vs ${P(s.domestic.rate)} at home`,
      `${s.foreign.n} charges were shown to the customer in a different currency than you are paid in, and their effective fee rate is ${P(s.foreign.rate - s.domestic.rate)} higher. If those orders are thin-margin, price them separately or check the international card surcharge on your plan.`);
  }

  const cardsBig = a.cards.filter((c) => c.count >= 5);
  if (cardsBig.length >= 2) {
    const hi = [...cardsBig].sort((x, y) => y.rate - x.rate)[0], lo = [...cardsBig].sort((x, y) => x.rate - y.rate)[0];
    if (hi.rate - lo.rate > 0.005) add("info", `Highest effective fee rate: ${hi.key} at ${P(hi.rate, 2)} (lowest ${lo.key} at ${P(lo.rate, 2)})`,
      "The gap is the fixed per-charge fee on small orders plus any card-type surcharge. Rates are fee divided by charge amount, so small baskets look worse.");
  }

  if (s.ordersFileGiven && s.discountRate > 0.08) {
    const top = a.codes[0];
    add(s.discountRate > 0.2 ? "high" : "medium", `Discounts cost ${P(s.discountRate)} of product sales (${$(s.discountTotal)})`,
      top ? `Biggest: ${top.code} at ${$(top.discount)} (${P(top.share, 0)} of all discount) across ${top.orders} orders. Check whether those orders would have come anyway, and whether the margin after the code still covers fees.` : "");
  }
  const codeOverlap = a.codes.find((c) => c.matched >= 5 && s.avgNetPerOrder > 0 && c.netPerOrder !== null && c.netPerOrder < s.avgNetPerOrder * 0.7);
  if (codeOverlap) {
    add("medium", `${codeOverlap.code} orders bring in ${$2(codeOverlap.netPerOrder)} to the bank vs ${$2(s.avgNetPerOrder)} on average`,
      "Net per order on that code is at least 30% below the shop average. That is before cost of goods, so the margin on those orders is thinner still.");
  }

  const losers = a.products.filter((x) => x.profit !== null && x.profit < 0 && x.units >= 2);
  if (losers.length) {
    const worst = [...losers].sort((x, y) => x.profit - y.profit).slice(0, 3);
    add("high", `${losers.length} product${losers.length > 1 ? "s" : ""} lose money after unit cost`,
      `Worst: ${worst.map((x) => `${x.name} (${$(x.profit)} on ${x.units} units)`).join("; ")}. Raise the price, cut the cost, or stop discounting and advertising it.`);
  }
  const thin = a.products.filter((x) => x.margin !== null && x.margin >= 0 && x.margin < 0.15 && x.units >= 5);
  if (thin.length) {
    add("medium", `${thin.length} product${thin.length > 1 ? "s" : ""} earn under 15% after unit cost`,
      `${thin.slice(0, 4).map((x) => `${x.name} ${P(x.margin)}`).join("; ")}. Shipping you pay and your time are not in the cost figure, so a thin margin here is thinner than it looks.`);
  }
  const refunded = a.products.filter((x) => x.units >= 5 && x.refundRate >= 0.1).sort((x, y) => y.refundRate - x.refundRate);
  if (refunded.length) {
    add("high", `${refunded.length} product${refunded.length > 1 ? "s" : ""} with 10%+ of units in fully refunded orders`,
      `${refunded.slice(0, 4).map((x) => `${x.name} ${P(x.refundRate)}`).join("; ")}.`);
  }

  if (a.months.length >= 4) {
    const r = (m) => (m.charges ? -m.fees / m.charges : null);
    const first = a.months.slice(0, 2).map(r).filter((x) => x !== null), last = a.months.slice(-2).map(r).filter((x) => x !== null);
    if (first.length && last.length) {
      const x = first.reduce((p, q) => p + q) / first.length, y = last.reduce((p, q) => p + q) / last.length;
      if (y - x > 0.01) add("medium", `Fees rose from ${P(x)} to ${P(y)} of charges`,
        `Comparing the first two and last two months. More disputes, more international cards or smaller baskets (the fixed fee weighs more on them) all push it up.`);
    }
  }

  if (s.otherGatewayOrders > 0) {
    add("medium", `${s.otherGatewayOrders} order${s.otherGatewayOrders > 1 ? "s were" : " was"} paid through another gateway (${$(s.otherGatewayTotal)})`,
      s.gatewayEstimate > 0
        ? `Those payments are not in a Shopify Payments transactions file, so their processor fees are missing here. Shopify also charges a third-party transaction fee unless you use Shopify Payments; at your ${P(s.thirdPartyRate)} that is about ${$(s.gatewayEstimate)}, shown as an estimate and not added to the waterfall.`
        : "Those payments are not in a Shopify Payments transactions file, so their processor fees are missing here. Shopify also charges a third-party transaction fee unless you use Shopify Payments; enter its rate for your plan to see an estimate.");
  }

  if (s.pendingRows > 0 && Math.abs(s.pendingNet) >= 1) {
    add("info", `${$(s.pendingNet)} has not been paid out yet`,
      `${s.pendingRows} row${s.pendingRows > 1 ? "s" : ""} have a payout status other than paid. The bank total in the waterfall includes them, so your deposits will lag it by this amount.`);
  }
  if (s.feeMismatch > 0) {
    add("info", `${s.feeMismatch} row${s.feeMismatch > 1 ? "s" : ""} where Net is not Amount minus Fee`,
      "The Net column was used, so totals match what reached the balance. Check those rows if you compare against your own records.");
  }

  if (!s.ordersFileGiven) {
    add("info", "Add the Orders export to see profit per product and discount cost",
      "The transactions file names orders, not products. Export Orders from Shopify admin and add it above to split each order's net across its line items and to see the cost of discount codes.");
  } else if (s.unmatchedOrders > 0) {
    add("info", `${s.unmatchedOrders} order${s.unmatchedOrders > 1 ? "s" : ""} in the orders file have no charge in the transactions file`,
      "Their payments fall outside the transactions date range, went through another gateway, or were free. They are left out of per-product figures rather than counted as free.");
  }
  if (s.productCount > 0 && !s.anyCosted) {
    add("info", "Enter your unit costs to see real profit",
      "Product cost, shipping you pay and packaging are not in either Shopify file. Type a cost per unit next to each product (or paste name,cost lines) and profit, margin and loss-maker findings appear.");
  } else if (s.productCount > 0 && !s.allCosted) {
    add("info", "Some products have no unit cost yet", "Profit for those products is left out rather than counted as free.");
  }

  const order = { high: 0, medium: 1, info: 2 };
  return out.sort((x, y) => order[x.severity] - order[y.severity]);
}

export function parseCosts(text) {
  const costs = {};
  const bad = [];
  String(text ?? "").split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = parseCsv(line)[0] || [];
    if (cells.length < 2) { bad.push(i + 1); return; }
    const v = parseMoney(cells[cells.length - 1]);
    const k = cells.slice(0, -1).join(",").trim();
    if (!k || Number.isNaN(v) || v < 0) { if (i > 0 || !/^(name|product|item|sku)/i.test(k)) bad.push(i + 1); return; }
    costs[k] = v;
  });
  return { costs, bad };
}

const PRODUCTS = [
  { name: "Merino Beanie - Charcoal", price: 32, per: 22, cost: 9.5, refund: 0.03, sku: "BEAN-CH" },
  { name: "Ceramic Pour-over Set", price: 68, per: 10, cost: 27, refund: 0.07, sku: "POUR-01" },
  { name: "Cold Brew Concentrate 1L", price: 18, per: 26, cost: 8.4, refund: 0.1, sku: "CB-1L" },
  { name: "Canvas Weekender Bag", price: 96, per: 6, cost: 41, refund: 0.05, sku: "BAG-WK" },
];
const CODES = [["", 0], ["WELCOME10", 0.1], ["SPRING25", 0.25], ["", 0]];
const CARDS = [["visa", "online"], ["master", "online"], ["american_express", "online"], ["visa", "pos"], ["discover", "online"]];

// Deterministic synthetic shop: returns { transactions, orders, costs } as text.
export function sampleData() {
  const txHead = "Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Payout ID,Available On,Amount,Fee,Net,Checkout,Payment Method Name,Presentment Amount,Presentment Currency,Currency,Vat";
  const orHead = "Name,Email,Financial Status,Paid at,Fulfillment Status,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Payment Method,Refunded Amount,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku";
  const tx = [txHead], or = [orHead];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const f = (n) => round2(n).toFixed(2);
  const names = ["06", "07", "08", "09"];
  let n = 0, payoutId = 7000;
  const txRow = (date, type, order, brand, source, status, amount, fee, method, pres, cur) =>
    tx.push([`${date} 12:${String(10 + (n % 40))}:05 -0400`, type, order, brand, source, status, "", status === "paid" ? payoutId : "", date, f(amount), f(fee), f(amount - fee), "", method, f(pres ?? amount), cur === "USD" ? "USD" : cur, "USD", ""].join(","));
  names.forEach((mm, mi) => {
    const status = mi === 3 ? "pending" : "paid";
    PRODUCTS.forEach((p, pi) => {
      const count = Math.round(p.per * (1 + mi * 0.1));
      for (let i = 0; i < count; i++) {
        n++;
        const day = String(1 + ((i * 3 + pi + mi) % 27)).padStart(2, "0");
        const date = `2026-${mm}-${day}`;
        const name = `#${1000 + n}`;
        const [code, pct] = CODES[(i + pi) % 4];
        const qty = i % 7 === 3 ? 2 : 1;
        const bag = pi === 0 && i % 5 === 0; // some orders also hold a second product
        const lines = [[p, qty]];
        if (bag) lines.push([PRODUCTS[2], 1]);
        const gross = lines.reduce((a, [x, k]) => a + x.price * k, 0);
        const disc = round2(gross * pct);
        const ship = gross > 60 ? 0 : 6.5, tax = round2((gross - disc) * 0.07);
        const total = round2(gross - disc + ship + tax);
        const [brand, source] = CARDS[(i + mi) % 5];
        const foreign = i % 9 === 4;
        const fee = round2(total * (foreign ? 0.049 : source === "pos" ? 0.026 : 0.029) + (source === "pos" ? 0.1 : 0.3));
        const paypal = i % 13 === 6;
        const method = paypal ? "PayPal Express Checkout" : "Shopify Payments";
        const refunded = !paypal && i > 0 && (i + mi * 2) % Math.round(1 / p.refund) === 0;
        lines.forEach(([x, k], li) => {
          const first = li === 0;
          or.push([name, "shopper@example.com", "paid", first ? `${date} 12:00:00 -0400` : "", "fulfilled", "USD", first ? f(gross) : "", first ? f(ship) : "", first ? f(tax) : "", first ? f(total) : "", first ? code : "", first ? f(disc) : "", first ? method : "", first && refunded ? f(total) : "", k, q(x.name), f(x.price), x.sku].join(","));
        });
        if (!paypal) {
          txRow(date, "charge", name, brand, source, status, total, fee, brand, foreign ? total * 1.35 : total, foreign ? "CAD" : "USD");
          if (refunded) {
            txRow(date, "refund", name, brand, source, status, -total, 0, brand, -total, "USD");
          } else if (i > 0 && i % 23 === 0) {
            txRow(date, "chargeback", name, brand, source, status, -total, 15, brand, -total, "USD");
            if (mi === 1) txRow(date, "chargeback_won", name, brand, source, status, total, -15, brand, total, "USD");
          }
        }
      }
    });
    tx.push([`2026-${mm}-14 03:00:00 -0400`, "adjustment", "", "", "", status, "", "", `2026-${mm}-14`, mi === 2 ? "-42.00" : "-3.50", "0.00", mi === 2 ? "-42.00" : "-3.50", "", "", "", "USD", "USD", ""].join(","));
    tx.push([`2026-${mm}-15 03:00:00 -0400`, "shopify_capital_repayment", "", "", "", status, "", "", `2026-${mm}-15`, "-25.00", "0.00", "-25.00", "", "", "", "USD", "USD", ""].join(","));
    payoutId++;
    tx.push([`2026-${mm}-28 03:00:00 -0400`, "payout", "", "", "", status, `2026-${mm}-28`, payoutId, `2026-${mm}-28`, "800.00", "0.00", "800.00", "", "", "", "USD", "USD", ""].join(","));
  });
  const costs = PRODUCTS.map((p) => `${p.name},${p.cost.toFixed(2)}`);
  return { transactions: tx.join("\n"), orders: or.join("\n"), costs: "name,cost\n" + costs.join("\n") };
}

export const money = $;
export const money2 = $2;
export const pct = P;
