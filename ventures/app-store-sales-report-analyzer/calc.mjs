// Sales analysis from an App Store Connect "Sales and Trends" summary sales report
// (tab-separated .txt or a CSV export). Column names are matched by alias from memory
// of Apple's report; no real report was available when this was written. Proceeds are
// in the currency Apple pays them in, so a total across currencies uses exchange rates
// the user types. Pure functions, no DOM, no network.

const ALIASES = {
  sku: ["sku"],
  title: ["title", "app name", "name"],
  type: ["product type identifier", "product type", "type"],
  units: ["units"],
  proceeds: ["developer proceeds", "proceeds", "partner share"],
  begin: ["begin date", "start date", "date"],
  end: ["end date"],
  custCurrency: ["customer currency"],
  country: ["country code", "country of sale", "country"],
  procCurrency: ["currency of proceeds", "partner share currency", "proceeds currency"],
  price: ["customer price", "price"],
  subscription: ["subscription"],
  period: ["period"],
  reason: ["proceeds reason"],
  promo: ["promo code"],
  parent: ["parent identifier"],
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

// "$5.00", "1,234.50", "5.00 USD", "(5)", "-5" and blanks (0). NaN for non-numbers.
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

// Calendar dates. Returns UTC ms or null. `dmy` is decided once per file.
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

// Day-first only when unambiguous: some first part above 12, no second above 12.
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
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

export const MIN_GROUP = 5;
export const DEFAULT_OPTIONS = Object.freeze({ baseCurrency: "USD", rates: "" });

// Apple product type identifiers -> app | update | inapp | subscription | other.
export function classifyType(id) {
  const t = String(id ?? "").trim().toUpperCase();
  if (!t) return "other";
  if (t.startsWith("IAY") || t === "IAC") return "subscription";
  if (t.startsWith("IA") || t === "FI1") return "inapp";
  if (/^7/.test(t)) return "update";
  if (/^(1|F1)/.test(t)) return "app";
  return "other";
}

// "EUR=1.08, GBP 1.27" -> Map. USD-style base is 1. Returns { map, error }.
export function parseRates(text, base = "USD") {
  const map = new Map([[String(base).toUpperCase(), 1]]);
  for (const part of String(text ?? "").split(/[,;\n]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^([A-Za-z]{3})\s*[=:\s]\s*([0-9]*\.?[0-9]+)$/);
    if (!m || !(Number(m[2]) > 0)) return { map, error: `Could not read the exchange rate “${s}”. Use the form EUR=1.08, GBP=1.27 (one unit of that currency in ${String(base).toUpperCase()}).` };
    map.set(m[1].toUpperCase(), Number(m[2]));
  }
  return { map };
}

// Returns { sales, skipped, columns, dmy, error }. A sale is { line, sku, title, kind,
// units, unitProceeds, proceeds, date, country, currency, custCurrency, price, reason, promo }.
export function normalizeRows(table) {
  const empty = { sales: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.units !== undefined && c.proceeds !== undefined && (c.begin !== undefined || c.sku !== undefined || c.title !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the App Store Connect Sales and Trends summary columns, such as “Title”, “Product Type Identifier”, “Units”, “Developer Proceeds”, “Begin Date”, “Country Code” and “Currency of Proceeds”. Download the Summary Sales report from Sales and Trends, or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "begin")));
  const sales = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    if (!get(line, "units") && !get(line, "proceeds")) { skipped.push({ line: lineNo, reason: "empty row" }); continue; }
    const units = parseNumber(get(line, "units"));
    const unitProceeds = parseNumber(get(line, "proceeds"));
    if (!Number.isFinite(units) || !Number.isFinite(unitProceeds)) { skipped.push({ line: lineNo, reason: "units or proceeds is not a number" }); continue; }
    const price = parseNumber(get(line, "price"));
    sales.push({
      line: lineNo,
      sku: get(line, "sku"),
      title: get(line, "title") || get(line, "sku") || "(untitled)",
      kind: classifyType(get(line, "type")),
      units, unitProceeds, proceeds: units * unitProceeds,
      date: parseWhen(get(line, "begin"), dmy),
      country: get(line, "country").toUpperCase() || "??",
      currency: (get(line, "procCurrency") || "USD").toUpperCase(),
      custCurrency: get(line, "custCurrency").toUpperCase(),
      price: Number.isFinite(price) ? price : 0,
      reason: get(line, "reason"),
      promo: get(line, "promo"),
      parent: get(line, "parent"),
    });
  }
  if (!sales.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { sales, skipped, columns: cols, dmy };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const ym = (t) => new Date(t).toISOString().slice(0, 7);
const KIND_LABEL = { app: "Paid app or free download", update: "Update (no sale)", inapp: "In-app purchase", subscription: "Auto-renewable subscription", other: "Other" };
export const kindLabel = (k) => KIND_LABEL[k] ?? k;

export function analyze(sales, opts = {}) {
  const base = String(opts.baseCurrency || DEFAULT_OPTIONS.baseCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) return { invalid: "The reporting currency must be a three-letter code such as USD." };
  const { map: rates, error } = parseRates(opts.rates, base);
  if (error) return { invalid: error };
  const conv = (s) => (rates.has(s.currency) ? s.proceeds * rates.get(s.currency) : null);
  const unrated = [...new Set(sales.filter((s) => !rates.has(s.currency) && s.proceeds !== 0).map((s) => s.currency))].sort();

  const dated = sales.map((s) => s.date).filter((t) => t !== null);
  const first = dated.length ? Math.min(...dated) : null, last = dated.length ? Math.max(...dated) : null;
  const spanDays = first !== null ? Math.max(1, (last - first) / 86400000 + 1) : null;

  // Net proceeds per currency exactly as Apple reports them (no conversion), then converted.
  const cur = new Map();
  for (const s of sales) {
    const c = cur.get(s.currency) ?? { currency: s.currency, gross: 0, refunds: 0, net: 0 };
    if (s.proceeds >= 0) c.gross += s.proceeds; else c.refunds += s.proceeds;
    c.net += s.proceeds; cur.set(s.currency, c);
  }
  const byCurrency = [...cur.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).map((c) => ({ ...c, rate: rates.get(c.currency) ?? null, netBase: rates.has(c.currency) ? c.net * rates.get(c.currency) : null }));
  const netBase = sum(byCurrency.filter((c) => c.netBase !== null).map((c) => c.netBase));
  const grossBase = sum(byCurrency.filter((c) => c.rate !== null).map((c) => c.gross * c.rate));
  const refundsBase = sum(byCurrency.filter((c) => c.rate !== null).map((c) => c.refunds * c.rate));

  // Units: downloads are free-app rows and paid installs; refunds are negative units.
  const posUnits = (f) => sum(sales.filter((s) => f(s) && s.units > 0).map((s) => s.units));
  const negUnits = (f) => -sum(sales.filter((s) => f(s) && s.units < 0).map((s) => s.units));
  const downloads = posUnits((s) => s.kind === "app");
  const paidUnits = posUnits((s) => s.kind === "inapp" || s.kind === "subscription" || (s.kind === "app" && s.unitProceeds > 0));
  const refundUnits = negUnits((s) => s.kind !== "update");
  const soldUnits = posUnits((s) => s.kind !== "update" && (s.unitProceeds > 0 || s.kind === "inapp" || s.kind === "subscription"));

  // By product.
  const prod = new Map();
  const appTitle = new Map(sales.filter((s) => s.kind === "app" || s.kind === "update").map((s) => [s.sku, s.title]));
  for (const s of sales) {
    if (s.kind === "update") continue;
    const key = s.parent || s.sku || s.title;
    const p = prod.get(key) ?? { title: appTitle.get(key) ?? (s.parent ? s.parent : s.title), downloads: 0, iapUnits: 0, subUnits: 0, refunds: 0, sold: 0, net: 0, unratedNet: 0 };
    if (s.kind === "app") p.downloads += Math.max(0, s.units);
    if (s.kind === "inapp") p.iapUnits += Math.max(0, s.units);
    if (s.kind === "subscription") p.subUnits += Math.max(0, s.units);
    if (s.units > 0 && (s.unitProceeds > 0 || s.kind === "inapp" || s.kind === "subscription")) p.sold += s.units;
    if (s.units < 0) p.refunds += -s.units;
    const v = conv(s); if (v === null) p.unratedNet += s.proceeds; else p.net += v;
    prod.set(key, p);
  }
  const byProduct = [...prod.values()].map((p) => ({ ...p, refundRate: p.sold ? p.refunds / p.sold : null })).sort((a, b) => b.net - a.net || a.title.localeCompare(b.title));

  // By type of sale.
  const kinds = new Map();
  for (const s of sales) {
    const k = kinds.get(s.kind) ?? { kind: s.kind, units: 0, net: 0 };
    k.units += s.units; const v = conv(s); if (v !== null) k.net += v; kinds.set(s.kind, k);
  }
  const byKind = [...kinds.values()].filter((k) => k.net !== 0 || k.kind !== "update").sort((a, b) => b.net - a.net);

  // By country: proceeds and downloads.
  const ctry = new Map();
  for (const s of sales) {
    const c = ctry.get(s.country) ?? { country: s.country, downloads: 0, net: 0 };
    if (s.kind === "app") c.downloads += Math.max(0, s.units);
    const v = conv(s); if (v !== null) c.net += v; ctry.set(s.country, c);
  }
  const byCountry = [...ctry.values()].map((c) => ({ ...c, share: netBase > 0 ? c.net / netBase : null, perDownload: c.downloads >= 50 ? c.net / c.downloads : null })).sort((a, b) => b.net - a.net || a.country.localeCompare(b.country));

  // By month.
  const months = new Map();
  for (const s of sales) {
    if (s.date === null) continue;
    const k = ym(s.date); const m = months.get(k) ?? { month: k, net: 0, downloads: 0, refunds: 0 };
    const v = conv(s); if (v !== null) m.net += v;
    if (s.kind === "app") m.downloads += Math.max(0, s.units);
    if (s.units < 0 && s.kind !== "update") m.refunds += -s.units;
    months.set(k, m);
  }
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));

  // Commission evidence: proceeds as a share of customer price where both are in one currency.
  let pSum = 0, cSum = 0, sbUnits = 0, y2Units = 0, promoUnits = 0, nonSbPaid = 0;
  for (const s of sales) {
    if (s.units <= 0 || s.kind === "update") continue;
    if (s.promo) promoUnits += s.units;
    if (/small business/i.test(s.reason)) sbUnits += s.units;
    else if (/one year|after (1|one) year|year (2|two)/i.test(s.reason)) y2Units += s.units;
    else if (s.unitProceeds > 0) nonSbPaid += s.units;
    if (s.custCurrency && s.custCurrency === s.currency && s.price > 0 && s.unitProceeds > 0) { pSum += s.units * s.unitProceeds; cSum += s.units * s.price; }
  }
  const reasonColumn = reasonSeen(sales);
  const proceedsShare = cSum > 0 ? pSum / cSum : null;
  const annualNet = spanDays ? netBase * 365 / spanDays : null;

  const result = {
    summary: { first, last, spanDays, rows: sales.length, base, netBase, grossBase, refundsBase, annualNet, downloads, paidUnits, soldUnits, refundUnits, refundRate: soldUnits ? refundUnits / soldUnits : null, paidPer100: downloads ? (paidUnits / downloads) * 100 : null, proceedsShare, comparedPrice: cSum, sbUnits, y2Units, promoUnits, nonSbPaid, reasonColumn, unrated },
    byCurrency, byProduct, byKind, byCountry, byMonth,
  };
  result.findings = findings(result);
  return result;
}

const reasonSeen = (sales) => sales.some((s) => s.reason);

function findings(r) {
  const out = [];
  const s = r.summary;
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const $ = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + s.base;
  const p = (n) => (n * 100).toFixed(0) + "%";
  if (s.unrated.length) add("high", `No exchange rate for ${s.unrated.join(", ")}, so those proceeds are left out of every ${s.base} total`, `Apple pays proceeds in each region's currency. Type rates in the box above (for example ${s.unrated[0]}=0.5, meaning one ${s.unrated[0]} is worth 0.5 ${s.base}) and analyze again. The per-currency table shows the unconverted amounts.`);
  const worst = r.byProduct.filter((x) => x.sold >= MIN_GROUP && x.refundRate !== null && x.refundRate >= 0.08).sort((a, b) => b.refundRate - a.refundRate)[0];
  if (worst) add("high", `${worst.title}: ${p(worst.refundRate)} of sold units were refunded`, `${worst.refunds} refunded against ${worst.sold} sold in this file. A refund rate this high often points to a mismatch between the store listing and the app, or to a paywall shown before the value; Apple does not pay proceeds back on refunded units.`);
  else if (s.refundRate !== null && s.soldUnits >= 20 && s.refundRate >= 0.05) add("medium", `${p(s.refundRate)} of sold units were refunded`, `${s.refundUnits} refunded against ${s.soldUnits} sold across all products.`);
  if (s.reasonColumn && s.sbUnits === 0 && s.nonSbPaid >= MIN_GROUP && s.annualNet !== null && s.annualNet < 1000000) add("medium", "No sale in this file shows the Small Business Program rate", `${s.nonSbPaid} paid units carry no Small Business or subscription-anniversary proceeds reason. Apple's Small Business Program lowers its commission from 30% to 15% for developers earning up to 1 million USD a year, and it applies only from the fiscal month after you enrol. If you are not enrolled, the enrolment page is in App Store Connect under Agreements, Tax and Banking; check Apple's current terms, since this file cannot tell you whether you qualify.`);
  if (s.proceedsShare !== null) add("info", `Proceeds are ${p(s.proceedsShare)} of the customer price on comparable rows`, `Across rows where the customer and proceeds currencies match (${$(s.comparedPrice)} of customer price). The gap is Apple's commission plus any sales tax or VAT included in the price, so it will sit below 70% in VAT countries and cannot be read as the commission rate alone.`);
  if (s.y2Units > 0) add("info", `${s.y2Units} subscription unit(s) earned the after-one-year rate`, "Apple's commission on a subscription falls after a subscriber's first year, so keeping subscribers past twelve months pays more per renewal than a new signup.");
  const top = r.byCountry[0];
  if (top && top.share !== null && top.share >= 0.6 && r.byCountry.length >= 3) add("info", `${top.country} is ${p(top.share)} of proceeds`, "Most revenue comes from one storefront. Localised listings and regional pricing in the next largest storefronts are the usual first step.");
  const weak = r.byCountry.filter((c) => c.perDownload !== null && r.byCountry.some((x) => x.perDownload !== null && x.country !== c.country)).sort((a, b) => a.perDownload - b.perDownload)[0];
  if (weak && weak.downloads >= 100 && weak.net <= 0.5 * weak.downloads * (r.byCountry.filter((c) => c.perDownload !== null).reduce((t, c) => t + c.net, 0) / Math.max(1, r.byCountry.filter((c) => c.perDownload !== null).reduce((t, c) => t + c.downloads, 0)))) add("info", `${weak.country} has ${weak.downloads} downloads but earns little per download`, `${$(weak.perDownload)} per download there, against ${$(s.netBase / Math.max(1, s.downloads))} across all storefronts. It can mean the price is too high for that market or the paywall is not localised.`);
  if (r.byMonth.length >= 3) {
    const a = r.byMonth[r.byMonth.length - 2], b = r.byMonth[r.byMonth.length - 3];
    if (b.net > 0 && a.net / b.net <= 0.8) add("medium", `Proceeds fell ${p(1 - a.net / b.net)} from ${b.month} to ${a.month}`, `${$(b.net)} then ${$(a.net)}. The final month in the file is left out of this comparison because it may be partial.`);
  }
  if (s.paidPer100 !== null && s.downloads >= 200) add("info", `${s.paidPer100.toFixed(1)} paid units for every 100 downloads`, "Counts in-app purchases, subscription starts and renewals and paid app sales against free and paid downloads in the same file. Renewals inflate it, so use it to compare periods rather than as a conversion rate.");
  if (s.netBase !== 0) add("info", `Net proceeds of ${$(s.netBase)} over ${Math.round(s.spanDays ?? 0)} day(s)`, `About ${s.annualNet !== null ? $(s.annualNet) : "–"} a year at this pace. Proceeds are before your income tax, and before Apple's payment timing and exchange-rate differences from your own rates.`);
  if (!out.length) add("info", "Nothing stands out", "No refund, rate or concentration problem was found in this file.");
  return out;
}

export const money = (n, c = "USD") => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + c : "–");
export const pct = (n) => (Number.isFinite(n) && n !== null ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Synthetic sales for the "Load an example" button: not a real developer or app.
export function sampleTsv() {
  const head = ["Provider", "Provider Country", "SKU", "Developer", "Title", "Version", "Product Type Identifier", "Units", "Developer Proceeds", "Begin Date", "End Date", "Customer Currency", "Country Code", "Currency of Proceeds", "Apple Identifier", "Customer Price", "Promo Code", "Parent Identifier", "Subscription", "Period", "Category", "CMB", "Device", "Supported Platforms", "Proceeds Reason", "Preserved Pricing", "Client", "Order Type"];
  const lines = [head.join("\t")];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const markets = [["US", "USD", 1, 0], ["GB", "GBP", 0.79, 0.2], ["DE", "EUR", 0.92, 0.19], ["JP", "JPY", 150, 0.1], ["BR", "BRL", 5.2, 0.05], ["IN", "INR", 83, 0]];
  const mo = (i) => { const d = new Date(Date.UTC(2026, i, 1)); return d; };
  const fmt = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
  for (let m = 0; m < 6; m++) {
    for (const [cc, cur, fx, vat] of markets) {
      const start = mo(m), end = new Date(Date.UTC(2026, m + 1, 0));
      const dl = Math.round((cc === "US" ? 900 : 120) * (1 + m * 0.12) * (0.8 + rnd() * 0.4));
      const row = (sku, title, type, units, unitP, price, reason = "", parent = "") => lines.push(["APPLE", "US", sku, "Sample Studio", title, "1.0", type, units, unitP.toFixed(2), fmt(start), fmt(end), cur, cc, cur, "100000001", price.toFixed(2), "", parent, type === "IAY" ? "Monthly" : "", "", "Productivity", "", "iPhone", "iOS", reason, "", "", ""].join("\t"));
      row("SAMPLE_APP", "Sample Habit Tracker", "1F", dl, 0, 0);
      const monthly = 4.99 * fx * (1 + vat), net = 4.99 * fx * 0.7;
      const subs = Math.round(dl * (cc === "US" ? 0.045 : 0.02));
      if (subs) row("SAMPLE_PRO_MONTHLY", "Pro Monthly", "IAY", subs, net, monthly, "", "SAMPLE_APP");
      const renew = Math.round(subs * 0.5);
      if (renew) row("SAMPLE_PRO_MONTHLY", "Pro Monthly", "IAY", renew, 4.99 * fx * 0.85, monthly, "Rate After One Year", "SAMPLE_APP");
      const life = Math.round(dl * 0.012);
      if (life) row("SAMPLE_LIFETIME", "Lifetime Unlock", "IA1", life, 39.99 * fx * 0.7, 39.99 * fx * (1 + vat), "", "SAMPLE_APP");
      const ref = Math.round(life * (cc === "IN" ? 0.4 : 0.06));
      if (ref) row("SAMPLE_LIFETIME", "Lifetime Unlock", "IA1", -ref, 39.99 * fx * 0.7, 39.99 * fx * (1 + vat), "", "SAMPLE_APP");
      row("SAMPLE_APP", "Sample Habit Tracker", "7F", dl * 3, 0, 0);
    }
  }
  return lines.join("\n") + "\n";
}
