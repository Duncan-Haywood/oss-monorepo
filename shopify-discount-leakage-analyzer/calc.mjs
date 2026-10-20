// Discount-leakage analysis from a Shopify "Orders" export (Orders -> Export).
// Pure functions, no DOM, no network. Shopify writes one row per line item and
// puts the order-level fields (totals, discount, refund, email) on the first
// row of each order only, so rows are grouped by order Name first.

const ALIASES = {
  name: ["name", "order", "order name", "order number"],
  email: ["email", "customer email"],
  status: ["financial status", "payment status"],
  created: ["created at", "date", "order date", "paid at"],
  cancelled: ["cancelled at", "canceled at"],
  currency: ["currency"],
  subtotal: ["subtotal", "sub total"],
  shipping: ["shipping"],
  taxes: ["taxes", "tax"],
  total: ["total"],
  code: ["discount code", "discount codes", "discount"],
  discount: ["discount amount", "total discount", "discounts"],
  refunded: ["refunded amount", "refunds", "refunded"],
  qty: ["lineitem quantity", "quantity"],
  price: ["lineitem price", "price"],
  lineDiscount: ["lineitem discount"],
};

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

// Google's older UI export is tab-separated, the current one comma-separated,
// and European locales use semicolons. Pick whichever appears most in the
// first few lines.
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

// "1,234.56", "$12", "--" (Google's blank), "< 10" (its impression floor).
// Returns NaN only for text that is not a number at all.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  s = s.replace(/^[<>]\s*/, "");
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

const NO_CODE = "(no code)";

// Returns { orders, skipped, cancelled, currency, columns, error }. Each order is
// { name, email, created (ms or null), gross, discount, refunded, total, codes[] }.
// gross is the price before any discount: subtotal + discount, or the summed
// line items when the subtotal is missing.
export function normalizeOrders(table, { decimalComma = false } = {}) {
  const empty = { orders: [], skipped: [], cancelled: 0, currency: "", columns: {} };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.name !== undefined && (c.total !== undefined || c.subtotal !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the Shopify orders export columns “Name” and “Total” (Shopify admin: Orders → Export → CSV for Excel, numbers, or other spreadsheet programs)." };
  const cols = findColumns(table[h]);
  if (cols.code === undefined && cols.discount === undefined) {
    return { ...empty, columns: cols, error: "No “Discount Code” or “Discount Amount” column found, so there is nothing to measure. Export orders again with all columns (the default export includes them)." };
  }
  const byName = new Map();
  const skipped = [];
  const tally = {};
  for (let r = h + 1; r < table.length; r++) {
    const line = table[r];
    const get = (f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
    const name = get("name");
    if (!name) continue;
    let o = byName.get(name);
    if (!o) {
      o = { name, line: r + 1, email: "", created: null, cancelled: false, status: "", subtotal: null, total: null, discount: null, refunded: null, codes: "", lines: 0, bad: "" };
      byName.set(name, o);
    }
    const num = (f) => { const v = get(f); if (v === "") return null; const n = parseNumber(v, decimalComma); return Number.isFinite(n) ? n : NaN; };
    if (!o.email) o.email = get("email").toLowerCase();
    if (!o.status) o.status = get("status").toLowerCase();
    if (get("cancelled")) o.cancelled = true;
    if (o.created === null && get("created")) { const t = Date.parse(get("created").replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/ ([+-]\d{2}):?(\d{2})$/, "$1:$2")); if (Number.isFinite(t)) o.created = t; }
    for (const f of ["subtotal", "total", "discount", "refunded"]) {
      if (o[f] === null) { const v = num(f); if (v !== null) o[f] = v; }
    }
    if (!o.codes && get("code")) o.codes = get("code");
    const q = num("qty"), p = num("price");
    if (Number.isFinite(q) && Number.isFinite(p) && q !== null && p !== null) o.lines += q * p;
    const cur = get("currency").toUpperCase();
    if (cur) tally[cur] = (tally[cur] || 0) + 1;
    for (const f of ["subtotal", "total", "discount", "refunded"]) if (Number.isNaN(o[f])) o.bad = f;
  }
  const orders = [];
  let cancelled = 0;
  for (const o of byName.values()) {
    if (o.bad) { skipped.push({ line: o.line, reason: `unreadable ${o.bad} on ${o.name}` }); continue; }
    if (o.cancelled || /^(voided|cancelled|canceled)$/.test(o.status)) { cancelled++; continue; }
    const discount = Math.abs(o.discount ?? 0);
    const subtotal = o.subtotal ?? (o.total !== null ? o.total : null);
    const gross = o.subtotal !== null ? o.subtotal + discount : o.lines > 0 ? o.lines : subtotal !== null ? subtotal + discount : null;
    if (gross === null) { skipped.push({ line: o.line, reason: `no subtotal or total on ${o.name}` }); continue; }
    const codes = o.codes ? o.codes.split(/[,;]/).map((c) => c.trim().toUpperCase()).filter(Boolean) : [];
    orders.push({
      name: o.name, email: o.email, created: o.created, gross, discount: Math.min(discount, gross),
      refunded: Math.abs(o.refunded ?? 0), total: o.total ?? gross - discount, codes,
    });
  }
  const currency = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (!orders.length) return { ...empty, columns: cols, skipped, cancelled, error: "No usable orders found in this file." };
  return { orders, skipped, cancelled, currency, columns: cols };
}

// Fraction of a code's orders that must come from customers who would NOT
// otherwise have bought, for the discount to pay for itself. Derivation: with
// margin m per gross dollar (1 - cogs - fee), discount rate d and fee f on what
// the customer pays, an incremental order earns m - d(1-f) and a non-incremental
// one loses d(1-f); the two balance when the incremental share is d(1-f)/m.
// Returns null when the product has no margin to defend, Infinity when
// discounted orders lose money outright.
export function breakEvenShare(d, m, fee = 0) {
  if (!(m > 0)) return null;
  const cost = d * (1 - fee);
  const s = cost / m;
  return s > 1 ? Infinity : s;
}

function group(orders, keyOf, extra) {
  const g = new Map();
  for (const o of orders) {
    for (const k of keyOf(o)) {
      let x = g.get(k);
      if (!x) { x = { key: k, orders: 0, gross: 0, discount: 0, refunded: 0, total: 0 }; g.set(k, x); }
      x.orders++; x.gross += o.gross; x.discount += o.discount; x.refunded += o.refunded; x.total += o.total;
      if (extra) extra(x, o);
    }
  }
  return [...g.values()];
}

function finish(x, m, fee) {
  const rate = x.gross > 0 ? x.discount / x.gross : 0;
  return {
    ...x, rate, aov: x.orders ? x.total / x.orders : 0, refundRate: x.total > 0 ? x.refunded / x.total : 0,
    breakEven: m === null ? null : breakEvenShare(rate, m, fee),
  };
}

// cogsPct and feePct are fractions of pre-discount price / of what was paid; fixedFee per order.
export function analyze(orders, { cogsPct = null, feePct = 0.029, fixedFee = 0.3, minOrders = 5 } = {}) {
  const hasCogs = cogsPct !== null && cogsPct >= 0 && cogsPct < 1;
  const m = hasCogs ? 1 - cogsPct - feePct : null;
  const n = orders.length;
  const sum = (arr, f) => arr.reduce((a, o) => a + f(o), 0);
  const gross = sum(orders, (o) => o.gross), discount = sum(orders, (o) => o.discount);
  const refunded = sum(orders, (o) => o.refunded), total = sum(orders, (o) => o.total);
  const withCode = orders.filter((o) => o.discount > 0.005 || o.codes.length);
  const without = orders.filter((o) => !(o.discount > 0.005 || o.codes.length));
  const dated = orders.filter((o) => o.created !== null).sort((a, b) => a.created - b.created);
  const seen = new Set();
  let returningDiscount = 0, returningOrders = 0, newDiscount = 0, emailed = 0;
  for (const o of dated) {
    if (!o.email) continue;
    emailed++;
    const back = seen.has(o.email);
    seen.add(o.email);
    if (o.discount > 0.005) {
      if (back) { returningDiscount += o.discount; returningOrders++; } else newDiscount += o.discount;
    }
  }
  const codeKey = (o) => (o.codes.length ? o.codes : o.discount > 0.005 ? ["(automatic discount)"] : [NO_CODE]);
  const byCode = group(orders, codeKey).map((x) => finish(x, m, feePct)).sort((a, b) => b.discount - a.discount);
  const noCode = byCode.find((c) => c.key === NO_CODE);
  const bands = [["No discount", 0, 0], ["Under 10%", 0, 0.1], ["10% to 19.9%", 0.1, 0.2], ["20% to 29.9%", 0.2, 0.3], ["30% and over", 0.3, Infinity]];
  const bandOf = (o) => {
    const r = o.gross > 0 ? o.discount / o.gross : 0;
    if (o.discount <= 0.005) return ["No discount"];
    return [bands.slice(1).find(([, lo, hi]) => r >= lo && r < hi)[0]];
  };
  const byBand = bands.map(([label]) => finish(group(orders, bandOf).find((x) => x.key === label) ?? { key: label, orders: 0, gross: 0, discount: 0, refunded: 0, total: 0 }, m, feePct));
  // Contribution per order when margin inputs are given: what is left after
  // product cost and payment fees, before shipping and ad cost.
  let losing = 0, lostAmount = 0, contribution = null;
  if (hasCogs) {
    contribution = 0;
    for (const o of orders) {
      const paid = o.gross - o.discount;
      const c = paid - o.gross * cogsPct - (paid * feePct + fixedFee) - o.refunded;
      contribution += c;
      if (c < 0) { losing++; lostAmount += -c; }
    }
  }
  const stacked = orders.filter((o) => o.codes.length > 1).length;
  const summary = {
    orders: n, gross, discount, refunded, total, discountRate: gross > 0 ? discount / gross : 0,
    codeShare: n ? withCode.length / n : 0, aovCode: withCode.length ? sum(withCode, (o) => o.total) / withCode.length : null,
    aovNone: without.length ? sum(without, (o) => o.total) / without.length : null,
    refundRateCode: sum(withCode, (o) => o.total) > 0 ? sum(withCode, (o) => o.refunded) / sum(withCode, (o) => o.total) : null,
    refundRateNone: sum(without, (o) => o.total) > 0 ? sum(without, (o) => o.refunded) / sum(without, (o) => o.total) : null,
    returningDiscount, returningOrders, newDiscount, emailed, stacked,
    returningShare: returningDiscount + newDiscount > 0 ? returningDiscount / (returningDiscount + newDiscount) : null,
    hasCogs, margin: m, contribution, losing, lostAmount,
  };
  const findings = [];
  const money0 = (v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (discount > 0) findings.push({ severity: "info", title: `${(summary.discountRate * 100).toFixed(1)}% of pre-discount sales was given away`, detail: `${money0(discount)} in discounts on ${money0(gross)} of list-price sales across ${n} orders; ${(summary.codeShare * 100).toFixed(0)}% of orders used a discount.` });
  else findings.push({ severity: "info", title: "No discounts found in this file", detail: "Every order has a zero discount amount and no code, so there is no leakage to measure." });
  for (const c of byCode) {
    if (c.key === NO_CODE || c.orders < minOrders) continue;
    if (c.breakEven === Infinity) findings.push({ severity: "high", title: `${c.key} discounts ${(c.rate * 100).toFixed(0)}%, more than the margin`, detail: `On ${c.orders} orders it gave ${money0(c.discount)} away at a discount deeper than your margin after product cost and fees, so even a customer who would not have bought otherwise loses you money.` });
    else if (c.breakEven !== null && c.breakEven >= 0.6) findings.push({ severity: "high", title: `${c.key} needs ${(c.breakEven * 100).toFixed(0)}% of its orders to be new sales to pay for itself`, detail: `${c.orders} orders, ${money0(c.discount)} discounted at ${(c.rate * 100).toFixed(1)}% average. If more than ${(100 - c.breakEven * 100).toFixed(0)}% of those customers would have bought anyway, this code lost money.` });
    if (summary.refundRateNone !== null && c.refundRate > Math.max(0.03, summary.refundRateNone * 2)) findings.push({ severity: "medium", title: `${c.key} orders refund at ${(c.refundRate * 100).toFixed(1)}% versus ${(summary.refundRateNone * 100).toFixed(1)}% without a code`, detail: `${c.orders} orders. A discounted order that is then refunded costs you the fee and handling on a sale that never happened.` });
  }
  if (summary.returningShare !== null && summary.returningDiscount > 0 && summary.returningShare >= 0.3) findings.push({ severity: "medium", title: `${(summary.returningShare * 100).toFixed(0)}% of discount value went to customers who had already ordered`, detail: `${money0(summary.returningDiscount)} across ${returningOrders} repeat orders (repeat measured only within this export, so the true share is at least this). A code shared on coupon sites reaches customers you already had.` });
  if (stacked) findings.push({ severity: "info", title: `${stacked} orders stacked more than one code`, detail: "Check that your discount settings intend to combine these; stacked codes multiply the give-away." });
  if (hasCogs && losing) findings.push({ severity: "high", title: `${losing} orders lost money after product cost and fees`, detail: `${money0(lostAmount)} in total, counting the discount, refunds, your product cost and payment fees, before shipping and ads.` });
  const heavy = byBand[4];
  if (heavy.orders >= minOrders && heavy.discount / Math.max(discount, 1) >= 0.25) findings.push({ severity: "medium", title: `Orders discounted 30% or more carry ${((heavy.discount / discount) * 100).toFixed(0)}% of all discount value`, detail: `${heavy.orders} orders. Deep discounts train buyers to wait for the next one.` });
  return { summary, byCode, byBand, noCode, findings, minOrders };
}

export function codesCsv(result) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = "code,orders,list_price_sales,discount_given,discount_rate,average_order_value,refund_rate,new_sales_share_needed";
  return [head].concat(result.byCode.map((c) => [q(c.key), c.orders, c.gross.toFixed(2), c.discount.toFixed(2), c.rate.toFixed(4), c.aov.toFixed(2), c.refundRate.toFixed(4), c.breakEven === null ? "" : c.breakEven === Infinity ? "never" : c.breakEven.toFixed(4)].join(","))).join("\n");
}

export function money(v) { return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v) { return v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`; }

// Deterministic synthetic store in Shopify's own export layout (one row per line
// item, order fields on the first row only) so the example, tests and docs agree.
export function sampleCsv() {
  const header = "Name,Email,Financial Status,Paid at,Fulfillment Status,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Created at,Lineitem quantity,Lineitem name,Lineitem price,Refunded Amount,Cancelled at";
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const lines = [header];
  const codes = [["", 0, 0.55], ["WELCOME10", 0.1, 0.13], ["SPRING25", 0.25, 0.12], ["INFLUENCER40", 0.4, 0.06], ["VIP15", 0.15, 0.09], ["FREESHIP", 0, 0.05]];
  const buyers = Array.from({ length: 60 }, (_, i) => `buyer${i}@example.com`);
  for (let i = 0; i < 260; i++) {
    let r = rnd(), acc = 0, pick = codes[0];
    for (const c of codes) { acc += c[2]; if (r <= acc) { pick = c; break; } }
    const price = 24 + Math.floor(rnd() * 5) * 8;
    const qty = 1 + Math.floor(rnd() * 3);
    const gross = price * qty;
    const disc = Math.round(gross * pick[1] * 100) / 100;
    const sub = gross - disc;
    const total = sub + 6;
    const day = 1 + (i % 28), hr = 8 + Math.floor(rnd() * 12);
    const buyer = pick[0] === "INFLUENCER40" ? `new${i}@example.com` : buyers[Math.floor(rnd() * buyers.length)];
    const refund = rnd() < (pick[0] === "INFLUENCER40" ? 0.22 : 0.04) ? total : 0;
    lines.push([`#${1001 + i}`, buyer, "paid", `2026-08-${String(day).padStart(2, "0")} ${String(hr).padStart(2, "0")}:15:00 -0500`, "fulfilled", "USD", sub.toFixed(2), "6.00", "0.00", total.toFixed(2), pick[0], disc.toFixed(2), `2026-08-${String(day).padStart(2, "0")} ${String(hr).padStart(2, "0")}:10:00 -0500`, qty, "Enamel camp mug", price, refund.toFixed(2), ""].join(","));
    if (i % 7 === 0) lines.push(["#" + (1001 + i), "", "", "", "", "", "", "", "", "", "", "", "", "1", "Mug lid", "0", "", ""].join(","));
  }
  return lines.join("\n");
}
