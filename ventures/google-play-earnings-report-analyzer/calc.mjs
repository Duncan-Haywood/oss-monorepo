// Earnings, fees, refunds and market analysis from a Google Play Console
// "Earnings report" CSV (one row per charge, fee, tax or refund transaction, with
// the amount in the buyer's currency and in the merchant's), and from the older
// "Estimated sales report" (charges and refunds only, no fee rows). Column names and
// transaction wording are matched by alias from memory of Play Console reports; no
// real report was available when this was written. Merchant-currency amounts are
// used as the file gives them (charges positive, refunds and fees negative); the
// report's own sign is trusted and only the direction is normalised. Pure
// functions, no DOM, no network.

const ALIASES = {
  date: ["transaction date", "order charged date", "date", "order date"],
  txType: ["transaction type", "financial status", "type"],
  description: ["description", "order number"],
  product: ["product title", "product", "app name", "title", "package name"],
  productId: ["product id", "package name", "sku id", "sku"],
  productType: ["product type", "item type"],
  country: ["buyer country", "country of buyer", "country"],
  buyerCurrency: ["buyer currency", "sale currency"],
  amountBuyer: ["amount (buyer currency)", "item price", "charged amount"],
  rate: ["currency conversion rate", "conversion rate"],
  merchantCurrency: ["merchant currency", "currency of proceeds"],
  amountMerchant: ["amount (merchant currency)", "amount merchant currency", "amount (merchant currency) "],
  taxType: ["tax type"],
};

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

// "1,234.50", "5.00 USD", "(5)", "-5" and blanks (0). NaN for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  const m = s.match(/\d[\d.,]*/);
  if (!m) return NaN;
  s = m[0];
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Calendar dates -> UTC ms or null. `dmy` is decided once per file.
export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t).getUTCDate() === d ? t : null;
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


// Transaction wording -> charge | refund | fee | feeRefund | tax | taxRefund | other.
export function classifyTx(s) {
  const t = String(s ?? "").toLowerCase().trim();
  if (!t) return "none";
  if (/google fee refund|fee refund/.test(t)) return "feeRefund";
  if (/google fee|service fee|^fee/.test(t)) return "fee";
  if (/tax refund/.test(t)) return "taxRefund";
  if (/^tax|tax$/.test(t) && !/refund/.test(t)) return "tax";
  if (/refund|chargeback|reversal/.test(t)) return "refund";
  if (/charge|sale|purchase/.test(t)) return "charge";
  return "other";
}

export function classifyProduct(s, id = "") {
  const t = String(s ?? "").toLowerCase();
  if (/sub/.test(t)) return "subscription";
  if (/inapp|in-app|managed|unmanaged|consumable/.test(t)) return "in-app";
  if (/app|premium|paid/.test(t)) return "app";
  return t.trim() ? "other" : "unspecified";
}

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const upper = (s) => String(s ?? "").trim().toUpperCase();

// Returns { rows, skipped, columns, dmy, error }. A row is { line, date, kind,
// product, ptype, country, buyerCurrency, buyerAmount, currency, amount } where
// `amount` is the merchant-currency amount signed by direction. Buyer personal data
// (city, postcode, order numbers) is never read.
export function normalizeRows(table) {
  const empty = { rows: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.txType !== undefined && (c.amountMerchant !== undefined || c.amountBuyer !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the Play Console Earnings report columns, such as “Transaction Date”, “Transaction Type”, “Product Title”, “Product Type”, “Buyer Country” and “Amount (Merchant Currency)” (or the Estimated sales report’s “Financial Status” and “Charged Amount”). Download it from Play Console (Download reports, Financial)." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const rows = [], skipped = [];
  const hasFees = table.slice(h + 1).some((l) => classifyTx(get(l, "txType")) === "fee");
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    if (classifyTx(get(line, "txType")) === "none" && !get(line, "amountMerchant") && !get(line, "amountBuyer")) { skipped.push({ line: lineNo, reason: "empty row" }); continue; }
    if (/^transaction type|^financial status/i.test(get(line, "txType"))) { skipped.push({ line: lineNo, reason: "repeated header" }); continue; }
    const kind = classifyTx(get(line, "txType"));
    const useMerchant = cols.amountMerchant !== undefined && !isBlank(get(line, "amountMerchant"));
    const raw = parseNumber(useMerchant ? get(line, "amountMerchant") : get(line, "amountBuyer"));
    if (!Number.isFinite(raw)) { skipped.push({ line: lineNo, reason: "amount is not a number" }); continue; }
    const buyerRaw = parseNumber(get(line, "amountBuyer"));
    // Direction: trust the sign when the file signs its rows; otherwise (the
    // Estimated sales report reports positive amounts) refunds are negative.
    const mag = Math.abs(raw);
    let amount = raw;
    if (kind === "refund" || kind === "fee" || kind === "taxRefund") amount = -mag;
    else if (kind === "charge" || kind === "feeRefund") amount = mag;
    else if (kind === "tax") amount = raw;
    rows.push({
      line: lineNo, date: parseWhen(get(line, "date"), dmy), kind, product: get(line, "product") || get(line, "productId") || "(unlabelled)",
      ptype: classifyProduct(get(line, "productType"), get(line, "productId")), country: upper(get(line, "country")) || "??",
      buyerCurrency: upper(get(line, "buyerCurrency")), buyerAmount: Number.isFinite(buyerRaw) ? buyerRaw : 0,
      currency: upper(get(line, "merchantCurrency")) || (useMerchant ? "" : upper(get(line, "buyerCurrency"))) || "USD",
      amount, estimated: !useMerchant,
    });
  }
  if (!rows.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { rows, skipped, columns: cols, dmy, hasFees };
}

export const MIN_GROUP = 5;
// "EUR=1.08, GBP=1.27" or one per line -> { EUR: 1.08, GBP: 1.27 }, or { error }.
export function parseRates(text) {
  const out = {};
  for (const part of String(text ?? "").split(/[\n,;]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^([A-Za-z]{3})\s*[=:]\s*([0-9]*\.?[0-9]+)$/);
    if (!m || !(Number(m[2]) > 0)) return { error: `Could not read the rate “${s}”. Use the form EUR=1.08 (one unit of EUR is worth 1.08 in your base currency).` };
    out[m[1].toUpperCase()] = Number(m[2]);
  }
  return { rates: out };
}


const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const ym = (t) => new Date(t).toISOString().slice(0, 7);
const round2 = (n) => Math.round(n * 100) / 100;
const KINDS = { app: "Paid apps", "in-app": "In-app products", subscription: "Subscriptions", other: "Other", unspecified: "Unspecified" };

export function analyze(rows, opts = {}) {
  const parsed = parseRates(opts.rates);
  if (parsed.error) return { invalid: parsed.error };
  const rates = parsed.rates;
  const feePct = opts.feePct === undefined || opts.feePct === null || opts.feePct === "" ? 15 : Number(opts.feePct);
  if (!Number.isFinite(feePct) || feePct < 0 || feePct >= 100) return { invalid: "The fee percentage must be a number from 0 to under 100." };

  const counts = new Map();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currencies = [...counts.keys()].sort();
  const base = upper(opts.baseCurrency) || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";
  rates[base] = 1;
  const excluded = new Map();
  const money = [];
  for (const r of rows) {
    if (rates[r.currency] === undefined) { if (r.amount !== 0) excluded.set(r.currency, (excluded.get(r.currency) ?? 0) + 1); money.push({ ...r, amt: 0 }); }
    else money.push({ ...r, amt: r.amount * rates[r.currency] });
  }

  const hasFeeRows = money.some((r) => r.kind === "fee");
  const of = (k) => money.filter((r) => r.kind === k);
  const charges = sum(of("charge").map((r) => r.amt));
  const refunds = Math.abs(sum(of("refund").map((r) => r.amt)));
  let fees = Math.abs(sum(of("fee").map((r) => r.amt))) - sum(of("feeRefund").map((r) => r.amt));
  const taxNet = sum(of("tax").map((r) => r.amt)) + sum(of("taxRefund").map((r) => r.amt));
  const gross = charges - refunds;
  let feeEstimated = false;
  if (!hasFeeRows && gross > 0) { fees = gross * feePct / 100; feeEstimated = true; }
  const reported = sum(money.map((r) => r.amt));
  const net = feeEstimated ? reported - fees : reported;
  const feeRate = gross > 0 ? fees / gross : null;
  const refundRate = charges > 0 ? refunds / charges : null;
  const chargeCount = of("charge").length, refundCount = of("refund").length;

  const dated = rows.map((r) => r.date).filter((t) => t !== null);
  const first = dated.length ? Math.min(...dated) : null, last = dated.length ? Math.max(...dated) : null;

  // A group's net is the sum of every signed row in it (charge, refund, fee, tax), so
  // group tables reconcile to the summary net.
  const group = (keyOf, label) => {
    const m = new Map();
    for (const r of money) {
      const k = keyOf(r);
      if (k === null) continue;
      const g = m.get(k) ?? { key: k, label: label ? label(k) : k, charges: 0, refunds: 0, fees: 0, net: 0, orders: 0, refundOrders: 0 };
      if (r.kind === "charge") { g.charges += r.amt; g.orders += 1; }
      if (r.kind === "refund") { g.refunds += Math.abs(r.amt); g.refundOrders += 1; }
      if (r.kind === "fee") g.fees += Math.abs(r.amt);
      if (r.kind === "feeRefund") g.fees -= r.amt;
      g.net += r.amt; m.set(k, g);
    }
    for (const g of m.values()) {
      const gg = g.charges - g.refunds;
      g.feeRate = hasFeeRows && gg > 0 ? g.fees / gg : null;
      g.refundRate = g.charges > 0 ? g.refunds / g.charges : null;
      g.enough = g.orders >= MIN_GROUP;
    }
    return [...m.values()];
  };
  const byType = group((r) => r.ptype, (k) => KINDS[k] ?? k).sort((a, b) => b.net - a.net);
  const byProduct = group((r) => r.product).sort((a, b) => b.net - a.net);
  const byCountry = group((r) => r.country).sort((a, b) => b.net - a.net);
  const byMonth = group((r) => (r.date === null ? null : ym(r.date))).sort((a, b) => a.key.localeCompare(b.key));
  const lastYear = byMonth.slice(-12);
  if (feeEstimated) for (const g of [byType, byProduct, byCountry, byMonth]) for (const x of g) { const gg = x.charges - x.refunds; x.fees = gg > 0 ? gg * feePct / 100 : 0; x.net -= x.fees; }

  const posNet = sum(byCountry.filter((c) => c.net > 0).map((c) => c.net));
  const topCountry = byCountry[0];
  const topCountryShare = topCountry && posNet > 0 && topCountry.net > 0 ? topCountry.net / posNet : null;
  const posProd = sum(byProduct.filter((c) => c.net > 0).map((c) => c.net));
  const topProduct = byProduct[0];
  const topProductShare = topProduct && posProd > 0 && topProduct.net > 0 ? topProduct.net / posProd : null;
  let trend = null;
  if (byMonth.length >= 6) {
    const recent = byMonth.slice(-3), prior = byMonth.slice(-6, -3);
    const r = sum(recent.map((m) => m.net)), p = sum(prior.map((m) => m.net));
    trend = { recent: r, prior: p, change: p > 0 ? (r - p) / p : null, months: [recent[0].key, recent[2].key] };
  }

  const summary = { rows: rows.length, first, last, base, charges, refunds, fees, taxNet, gross, net, reported, feeRate, refundRate, chargeCount, refundCount, hasFeeRows, feeEstimated, feePct, topCountry: topCountry?.key ?? null, topCountryShare, topProduct: topProduct?.key ?? null, topProductShare };

  const findings = [];
  if (excluded.size) {
    const list = [...excluded].map(([c, n]) => `${c || "(blank)"} (${n} rows)`).join(", ");
    findings.push({ severity: "high", title: "Some money is not in the totals", detail: `Rows in ${list} are in a different merchant currency from ${base} and have no rate, so they are left out of every money figure. Type a rate such as ${[...excluded.keys()][0] || "EUR"}=1.10 to include them.` });
  }
  if (feeEstimated) findings.push({ severity: "medium", title: "Fees are an estimate, not from your file", detail: `This report has no Google fee rows (the Estimated sales report never does), so fees are ${feePct}% of charges net of refunds, the percentage you entered. Use the Earnings report for the fee Google actually took.` });
  if (hasFeeRows && feeRate !== null && gross > 0) {
    if (feeRate >= 0.27) findings.push({ severity: "medium", title: `Google's fee is ${(feeRate * 100).toFixed(1)}% of net charges`, detail: "That is close to the standard 30% tier. Google's reduced 15% tier applies to subscriptions and to the first slice of yearly earnings for enrolled developers, so it is worth checking in Play Console that your account is on the tier you expect. This tool cannot see your enrollment." });
    else if (feeRate <= 0.17) findings.push({ severity: "info", title: `Google's fee is ${(feeRate * 100).toFixed(1)}% of net charges`, detail: "That is consistent with the reduced 15% tier across this file." });
  }
  if (refundRate !== null && chargeCount >= 20 && refundRate >= 0.05) findings.push({ severity: refundRate >= 0.1 ? "high" : "medium", title: `Refunds are ${(refundRate * 100).toFixed(1)}% of charges`, detail: `${refundCount} refund rows against ${chargeCount} charges, ${round2(refunds)} ${base} reversed. Check the by-product table before changing prices; a single product usually carries most of it.` });
  const worst = byProduct.filter((p) => p.enough && p.refundRate !== null && p.refundRate >= 0.1).sort((a, b) => b.refundRate - a.refundRate)[0];
  if (worst) findings.push({ severity: "medium", title: `${worst.key} has ${(worst.refundRate * 100).toFixed(0)}% refunds`, detail: `${worst.refundOrders} refunds against ${worst.orders} charges. Products with fewer than five charges are never flagged.` });
  if (topCountryShare !== null && topCountryShare >= 0.6) findings.push({ severity: "info", title: `${topCountry.key} is ${(topCountryShare * 100).toFixed(0)}% of net earnings`, detail: "One country carries most of the revenue; a price or ranking change there moves the whole business, and other countries are where localization would add the most." });
  if (topProductShare !== null && topProductShare >= 0.8 && byProduct.filter((p) => p.net > 0).length > 1) findings.push({ severity: "info", title: `${topProduct.key} is ${(topProductShare * 100).toFixed(0)}% of net earnings`, detail: "One product pays for the rest; judge time spent on the others against what they could add to it." });
  if (trend && trend.change !== null && trend.prior > 0 && Math.abs(trend.change) >= 0.15) {
    const up = trend.change > 0;
    findings.push({ severity: up ? "info" : "medium", title: `Net earnings ${up ? "up" : "down"} ${(Math.abs(trend.change) * 100).toFixed(0)}% over the last three months`, detail: `${trend.months[0]} to ${trend.months[1]}: ${round2(trend.recent)} ${base}, against ${round2(trend.prior)} ${base} in the three months before.` });
  }
  if (!findings.length) findings.push({ severity: "info", title: "Nothing stands out", detail: "No group was large and unusual enough to suggest anything. Groups under five charges never drive a suggestion." });

  return { summary, findings, byType, byProduct, byCountry: byCountry.slice(0, 12), byMonth: lastYear, trend, excluded: [...excluded].map(([currency, n]) => ({ currency, rows: n })), currencies, assumptions: { base, rates, feePct } };
}

// A deterministic, clearly synthetic Earnings report: two apps and a subscription, five
// countries, charges with Google fee rows and some refunds, over eight months.
export function sampleCsv() {
  const head = ["Description", "Transaction Date", "Transaction Time", "Tax Type", "Transaction Type", "Refund Type", "Product Title", "Product id", "Product Type", "Sku Id", "Hardware", "Buyer Country", "Buyer State", "Buyer Postal Code", "Buyer Currency", "Amount (Buyer Currency)", "Currency Conversion Rate", "Merchant Currency", "Amount (Merchant Currency)"];
  const lines = [head.join(",")];
  let n = 0, seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const add = (date, type, title, pid, ptype, cc, bcur, buyer, rate, merchant) => {
    n += 1;
    lines.push([`GPA.0000-${String(n).padStart(4, "0")}`, date, "10:00 PST", "", type, "", title, pid, ptype, pid, "", cc, "", "", bcur, buyer, rate, "USD", merchant].join(","));
  };
  const products = [
    ["Trail Log Pro", "com.example.traillog.pro", "app", 4.99, 0.30],
    ["Trail Log Pro", "com.example.traillog.plus_monthly", "subscription", 2.99, 0.15],
    ["Trail Log Pro", "com.example.traillog.maps_pack", "inapp", 1.99, 0.30],
    ["Pocket Ledger", "com.example.pocketledger.pro", "app", 2.99, 0.30],
  ];
  const countries = [["US", "USD", 1], ["GB", "GBP", 0.79], ["DE", "EUR", 0.92], ["BR", "BRL", 5.0], ["JP", "JPY", 150]];
  for (let m = 1; m <= 8; m++) {
    const mo = String(m).padStart(2, "0");
    for (const [title, pid, ptype, price, fee] of products) {
      for (const [cc, bcur, fx] of countries) {
        const w = cc === "US" ? 3 : cc === "GB" ? 1 : 0.6;
        const count = Math.round(w * (1 + m * 0.15) * (0.6 + rnd() * 0.8) * (ptype === "app" ? 2 : 1));
        for (let i = 0; i < count; i++) {
          const day = String(1 + Math.floor(rnd() * 27)).padStart(2, "0");
          const date = `2026-${mo}-${day}`;
          const usd = price;
          const buyer = Math.round(usd * fx * 100) / 100;
          add(date, "Charge", title, pid, ptype, cc, bcur, buyer, (1 / fx).toFixed(4), usd.toFixed(2));
          add(date, "Google fee", title, pid, ptype, cc, bcur, -Math.round(buyer * fee * 100) / 100, (1 / fx).toFixed(4), (-usd * fee).toFixed(2));
          if (rnd() < (pid.endsWith("maps_pack") ? 0.12 : 0.03)) {
            add(date, "Charge refund", title, pid, ptype, cc, bcur, -buyer, (1 / fx).toFixed(4), (-usd).toFixed(2));
            add(date, "Google fee refund", title, pid, ptype, cc, bcur, Math.round(buyer * fee * 100) / 100, (1 / fx).toFixed(4), (usd * fee).toFixed(2));
          }
        }
      }
    }
  }
  return lines.join("\n");
}

export const money = (n, cur = "") => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${s}${cur ? " " + cur : ""}`;
};
export const pct = (n) => (n === null || n === undefined ? "–" : (n * 100).toFixed(1) + "%");
export const dateStr = (t) => (t === null || t === undefined ? "–" : new Date(t).toISOString().slice(0, 10));
