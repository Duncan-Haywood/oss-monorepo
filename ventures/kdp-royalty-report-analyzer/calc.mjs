// KDP royalty report analysis for self-published authors: net royalty per title,
// format and marketplace, refund rate, Kindle Unlimited pages read (valued only
// at a per-page rate the author types), delivery and printing costs, the 70%
// price-band check, and what ad spend left. Column names are matched by alias
// and the KDP export layout is remembered, not verified against a live account;
// nothing here claims to know Amazon's exact headers. Money is never converted
// between currencies. Pure functions, no DOM, no network.


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

// "1,234.56", "$12", "(5.00)", "-5" and blanks (0). NaN only for non-numbers.
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

// Wall-clock timestamps only: the file's own clock is the driver's clock, so no
// time zone conversion is attempted. Returns { t (UTC ms of the wall clock),
// hasTime } or null. `dmy` is decided once per file (see detectDmy).
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


const ALIASES = {
  date: ["royalty date", "date", "sales date", "order date", "transaction date", "month", "day", "report date"],
  title: ["title", "book title", "book", "product", "product title", "item", "series title"],
  asin: ["asin/isbn", "asin", "isbn", "isbn-13", "asin / isbn", "isbn/asin"],
  market: ["marketplace", "store", "market", "country", "site", "amazon store"],
  rtype: ["royalty type", "royalty plan", "royalty rate", "royalty option", "format"],
  type: ["transaction type", "type", "sale type", "order type"],
  units: ["units sold", "units ordered", "units", "orders", "quantity"],
  refunded: ["units refunded", "refunded units", "returns", "units returned"],
  netunits: ["net units sold", "net units", "net units ordered"],
  list: ["avg. list price without tax", "avg list price without tax", "list price", "avg. list price", "avg list price"],
  offer: ["avg. offer price without tax", "avg offer price without tax", "offer price", "avg. offer price", "avg offer price", "price"],
  cost: ["avg. delivery/manufacturing cost", "avg delivery/manufacturing cost", "avg. delivery cost", "avg delivery cost", "avg. manufacturing cost", "avg manufacturing cost", "delivery cost", "printing cost", "delivery/manufacturing cost", "manufacturing cost"],
  royalty: ["royalty", "royalties", "royalty amount", "estimated royalty", "earnings", "revenue", "net royalty"],
  currency: ["currency", "royalty currency"],
  kenp: ["kindle edition normalized page (kenp) read", "kindle edition normalized pages (kenp) read", "kenp read", "kenp", "pages read", "normalized pages read", "kindle unlimited pages", "ku pages"],
};

export const BAND_MIN = 2.99;
export const BAND_MAX = 9.99;
export const TIER_35 = /35\s*%/;

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  if (cols.kenp === undefined) {
    const at = norm.findIndex((h, i) => /kenp/.test(h) && !Object.values(cols).includes(i));
    if (at !== -1) cols.kenp = at;
  }
  return cols;
}

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const key = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MONTH_FMT = (t) => new Date(t).toISOString().slice(0, 7);
const RE_REFUND = /refund|return|chargeback|reversal/i;
const RE_FREE = /free|promo|price match|giveaway|lending/i;

// Returns { rows, skipped, columns, dmy, error }. A row is { line, t, title,
// asin, market, rtype, currency, sold, refundUnits, netUnits, freeUnits, royalty
// (as in the file, negative on refund rows), kenp, offer, list, cost }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { rows: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if ((c.royalty !== undefined || c.kenp !== undefined) && (c.title !== undefined || c.asin !== undefined || c.date !== undefined || c.market !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected a royalty or KENP column plus ideally “Title”, “Royalty Date”, “Marketplace”, “Units Sold”, “Net Units Sold” and “Currency”. If you downloaded an Excel report, save the sheet as CSV first." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).map((l) => get(l, "date")));
  const num = (line, f) => (cols[f] === undefined || isBlank(get(line, f)) ? null : parseNumber(get(line, f), decimalComma));
  const rows = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    if (line.every((x) => !String(x).trim())) continue;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    let when = null;
    if (cols.date !== undefined && !isBlank(get(line, "date"))) {
      // "2026-05" month-only cells are read as the first of the month.
      const raw = get(line, "date");
      when = parseWhen(/^\d{4}-\d{1,2}$/.test(raw) ? raw + "-01" : raw, dmy);
      if (!when) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    }
    const v = { units: num(line, "units"), refunded: num(line, "refunded"), netunits: num(line, "netunits"), royalty: num(line, "royalty"), kenp: num(line, "kenp"), offer: num(line, "offer"), list: num(line, "list"), cost: num(line, "cost") };
    if (Object.values(v).some((x) => x !== null && Number.isNaN(x))) { skipped.push({ line: lineNo, reason: "number not readable" }); continue; }
    if (v.royalty === null && !(v.kenp > 0)) { skipped.push({ line: lineNo, reason: "no royalty or KENP figure" }); continue; }
    const typeText = `${get(line, "type")} ${cols.type === undefined ? "" : ""}`.trim();
    const isRefundRow = RE_REFUND.test(typeText) || (v.royalty !== null && v.royalty < 0 && (v.units === null || v.units <= 0));
    const isFree = RE_FREE.test(typeText) && !(v.royalty > 0);
    const unitsAbs = Math.abs(v.units ?? 0);
    let sold = 0, refundUnits = v.refunded > 0 ? v.refunded : 0, freeUnits = 0;
    if (isRefundRow) refundUnits += unitsAbs;
    else if (isFree) freeUnits = unitsAbs;
    else sold = unitsAbs;
    let netUnits = v.netunits !== null ? v.netunits : sold - refundUnits;
    if (isFree) netUnits = 0;
    rows.push({
      line: lineNo, t: when ? when.t : null,
      title: get(line, "title").replace(/\s+/g, " ") || get(line, "asin") || "Untitled",
      asin: get(line, "asin"), market: get(line, "market"), rtype: get(line, "rtype"),
      currency: get(line, "currency").toUpperCase(),
      sold, refundUnits, netUnits, freeUnits,
      royalty: v.royalty ?? 0, kenp: v.kenp > 0 ? v.kenp : 0,
      offer: v.offer, list: v.list, cost: v.cost && v.cost > 0 ? v.cost : 0,
    });
  }
  if (!rows.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { rows, skipped, columns: cols, dmy };
}

const fmt = (n) => (n < 0 ? "-" : "") + Math.abs(n).toFixed(2);
const p1 = (x) => (x * 100).toFixed(1) + "%";
const blankT = (k, label) => ({ key: k, label, sold: 0, refundUnits: 0, netUnits: 0, freeUnits: 0, royalty: 0, kenp: 0, costTotal: 0 });

// opts: { currency ("" picks the one with the most royalty), kenpRate (money
// per page in that currency; blank leaves pages unvalued), adSpend (in that
// currency, for the whole range), bandMin/bandMax (offer-price range where you
// believe the 70% option applies; prices outside are ignored), from, to (day
// timestamps) }. Royalty is summed as the file states it; refund rows are
// negative already, so it is net of refunds. KENP value is added on top only
// when a rate is given, because KDP reports pages read, not the money.
export function analyze(rows, opts = {}) {
  const dayMs = 86400000;
  const ranged = rows.filter((x) => x.t === null || ((opts.from == null || x.t >= opts.from) && (opts.to == null || x.t < opts.to + dayMs)));
  if (!ranged.length) return { invalid: "No rows fall inside that date range." };
  const totals = new Map();
  for (const r of ranged) {
    const c = r.currency || "";
    totals.set(c, (totals.get(c) || 0) + Math.abs(r.royalty));
  }
  const currencies = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([code, volume]) => ({ code, volume }));
  const chosen = opts.currency !== undefined && opts.currency !== null && currencies.some((c) => c.code === opts.currency) ? opts.currency : currencies[0].code;
  const inCur = ranged.filter((r) => (r.currency || "") === chosen);
  const kenpRate = Number(opts.kenpRate) > 0 ? Number(opts.kenpRate) : null;
  const adSpend = Number(opts.adSpend) > 0 ? Number(opts.adSpend) : 0;
  const bandMin = Number(opts.bandMin) > 0 ? Number(opts.bandMin) : BAND_MIN;
  const bandMax = Number(opts.bandMax) > 0 ? Number(opts.bandMax) : BAND_MAX;
  const dated = inCur.filter((x) => x.t !== null).map((x) => x.t);

  const titles = new Map(), markets = new Map(), formats = new Map(), months = new Map();
  const grab = (map, k, label) => { if (!map.has(k)) map.set(k, blankT(k, label)); return map.get(k); };
  const add = (b, r) => { b.sold += r.sold; b.refundUnits += r.refundUnits; b.netUnits += r.netUnits; b.freeUnits += r.freeUnits; b.royalty += r.royalty; b.kenp += r.kenp; b.costTotal += r.cost * r.sold; };
  for (const r of inCur) {
    add(grab(titles, key(r.title) || "untitled", r.title), r);
    add(grab(markets, key(r.market) || "unknown", r.market || "Not in file"), r);
    add(grab(formats, key(r.rtype) || "all", r.rtype || "Not in file"), r);
    if (r.t !== null) add(grab(months, MONTH_FMT(r.t), MONTH_FMT(r.t)), r);
  }
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const royalty = sum(inCur, (r) => r.royalty);
  const kenp = sum(inCur, (r) => r.kenp);
  const kenpValue = kenpRate !== null ? kenp * kenpRate : null;
  const sold = sum(inCur, (r) => r.sold), refundUnits = sum(inCur, (r) => r.refundUnits), netUnits = sum(inCur, (r) => r.netUnits), freeUnits = sum(inCur, (r) => r.freeUnits);
  const costTotal = sum(inCur, (r) => r.cost * r.sold);
  const total = royalty + (kenpValue ?? 0);
  const fin = (b) => {
    const value = kenpRate !== null ? b.kenp * kenpRate : 0;
    return { ...b, kenpValue: kenpRate !== null ? value : null, total: b.royalty + value, share: total > 0 ? (b.royalty + value) / total : null, royaltyPerUnit: b.netUnits > 0 ? b.royalty / b.netUnits : null, refundRate: b.sold > 0 ? b.refundUnits / b.sold : null, costShare: b.royalty + b.costTotal > 0 ? b.costTotal / (b.royalty + b.costTotal) : null };
  };
  const byTitle = [...titles.values()].map(fin).sort((a, b) => b.total - a.total);
  const byMarket = [...markets.values()].map(fin).sort((a, b) => b.total - a.total);
  const byFormat = [...formats.values()].map(fin).sort((a, b) => b.total - a.total);
  const byMonth = [...months.values()].map(fin).sort((a, b) => (a.key < b.key ? -1 : 1));

  // 70% price band: rows on the 35% option whose offer price sits in the band
  // you gave. Estimated 70% royalty = 0.70 x offer price minus the row's own
  // delivery cost per unit, so it is a what-if, not something the file shows.
  let band = null;
  const inBand = inCur.filter((r) => r.sold > 0 && TIER_35.test(r.rtype) && r.offer !== null && r.offer >= bandMin && r.offer <= bandMax);
  if (inBand.length) {
    const unitsB = sum(inBand, (r) => r.sold);
    const now = sum(inBand, (r) => r.royalty);
    const est = sum(inBand, (r) => r.sold * Math.max(0.7 * r.offer - r.cost, 0));
    const titlesB = [...new Set(inBand.map((r) => r.title))];
    band = { units: unitsB, now, est, gain: est - now, titles: titlesB, bandMin, bandMax };
  }
  const ads = adSpend > 0 ? { spend: adSpend, net: total - adSpend, perDollar: total / adSpend, unitsToCover: royalty > 0 && netUnits > 0 ? adSpend / (royalty / netUnits) : null } : null;
  const summary = {
    currency: chosen, otherCurrencies: currencies.filter((c) => c.code !== chosen), royalty, kenp, kenpValue, kenpRate, total,
    sold, refundUnits, netUnits, freeUnits, refundRate: sold > 0 ? refundUnits / sold : null,
    royaltyPerUnit: netUnits > 0 ? royalty / netUnits : null, costTotal, titles: byTitle.length,
    from: dated.length ? Math.min(...dated) : null, to: dated.length ? Math.max(...dated) : null, rows: inCur.length,
  };
  return { summary, byTitle, byMarket, byFormat, byMonth, band, ads, currencies, findings: findings({ summary, byTitle, byMarket, band, ads }) };
}

function findings({ summary: s, byTitle, byMarket, band, ads }) {
  const out = [];
  const cur = s.currency ? `${s.currency} ` : "";
  out.push({ severity: "info", title: `${cur}${fmt(s.royalty)} net royalty from ${s.netUnits} net unit${s.netUnits === 1 ? "" : "s"}${s.royaltyPerUnit !== null ? `, ${cur}${fmt(s.royaltyPerUnit)} per unit` : ""}`, detail: `${s.sold} sold, ${s.refundUnits} refunded${s.freeUnits ? `, ${s.freeUnits} free or promotional (no royalty)` : ""} across ${s.titles} title${s.titles === 1 ? "" : "s"}. Royalty is summed as the file states it, so refund rows are already taken out.` });
  if (s.otherCurrencies.length) out.push({ severity: "medium", title: `The file has ${s.otherCurrencies.length} other currenc${s.otherCurrencies.length === 1 ? "y" : "ies"}, not included above`, detail: `Showing ${s.currency || "the rows with no currency"}. Also present: ${s.otherCurrencies.map((c) => `${c.code || "no code"} (${fmt(c.volume)})`).join(", ")}. Amounts are never converted between currencies; pick another one in the currency box to see it.` });
  if (s.refundRate !== null && s.refundUnits > 0) out.push({ severity: s.refundRate >= 0.1 ? "high" : "info", title: `${p1(s.refundRate)} of units sold were refunded`, detail: `${s.refundUnits} of ${s.sold}. A rate this high on one title usually points at the book's description, cover, formatting or file, not at bad luck.` });
  const badRefund = byTitle.filter((t) => t.sold >= 10 && t.refundRate >= 0.15);
  if (badRefund.length) out.push({ severity: "high", title: `${badRefund.length} title${badRefund.length === 1 ? "" : "s"} refunded on 15% or more of sales`, detail: badRefund.map((t) => `${t.label}: ${p1(t.refundRate)} of ${t.sold}`).join("; ") + "." });
  if (s.kenp > 0) {
    out.push(s.kenpRate !== null
      ? { severity: "info", title: `${s.kenp.toLocaleString("en-US")} Kindle Unlimited pages read, about ${cur}${fmt(s.kenpValue)} at your rate`, detail: `That is ${p1(s.total > 0 ? s.kenpValue / s.total : 0)} of ${cur}${fmt(s.total)} total. The per-page rate is what you typed (${s.kenpRate}); the file reports pages, not money, and Amazon sets the real rate each month.` }
      : { severity: "info", title: `${s.kenp.toLocaleString("en-US")} Kindle Unlimited pages read, not valued`, detail: "The report gives pages read, not the payout. Type the per-page rate from your KDP payments page in step 2 to add them to the totals." });
  }
  const top = byTitle[0];
  if (top && byTitle.length >= 2 && top.share >= 0.6) out.push({ severity: "medium", title: `${top.label} earns ${p1(top.share)} of the total`, detail: "One title carries most of the income; a rank drop, a price change or a takedown there moves the whole account." });
  const costly = byTitle.filter((t) => t.costTotal > 0 && t.costShare >= 0.1).sort((a, b) => b.costShare - a.costShare);
  if (costly.length) out.push({ severity: "medium", title: `Delivery or printing costs came to ${cur}${fmt(s.costTotal)}, already taken out of the royalty shown`, detail: `Highest share of royalty before those costs: ${costly.slice(0, 3).map((t) => `${t.label} ${p1(t.costShare)} (${cur}${fmt(t.costTotal)})`).join("; ")}. Costs are the file's per-unit figure times units sold. For ebooks on a delivery-fee royalty option, a lighter file (compressed images) lowers it.` });
  if (band) out.push({ severity: "medium", title: `${band.units} sale${band.units === 1 ? "" : "s"} on the 35% option were priced inside ${band.bandMin}–${band.bandMax}`, detail: `${band.titles.slice(0, 4).join(", ")}${band.titles.length > 4 ? ", …" : ""}. If those titles qualify for the 70% option in that store, the estimate is about ${cur}${fmt(band.est)} against the ${cur}${fmt(band.now)} you were paid (${cur}${fmt(band.gain)} more). The 70% eligibility rules, price range and delivery fee are Amazon's and change; the range here is the one you can edit, and this is an estimate, not what you would have received.` });
  if (byMarket.length >= 2 && byMarket[0].share !== null) out.push({ severity: "info", title: `${byMarket[0].label} is ${p1(byMarket[0].share)} of the total`, detail: byMarket.slice(0, 5).map((m) => `${m.label} ${cur}${fmt(m.total)}`).join("; ") + "." });
  if (ads) out.push({ severity: ads.net < 0 ? "high" : "info", title: `After ${cur}${fmt(ads.spend)} of ad spend, ${cur}${fmt(ads.net)} is left`, detail: `${cur}${fmt(ads.perDollar)} of royalty${s.kenpRate !== null ? " and page-read value" : ""} per ad dollar${ads.unitsToCover !== null ? `; at your average royalty per unit, ${Math.ceil(ads.unitsToCover)} units would cover the spend on their own` : ""}. Ad spend is the figure you entered for the whole range; the KDP report does not contain it. Read-through and page-reads after the ad click are not tracked here.` });
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Deterministic synthetic file for the "Load an example" button: made-up books
// and amounts over four months, in the layout of a KDP-style royalty report. Not
// real data.
export function sampleCsv() {
  const lines = ["Royalty Date,Title,Author Name,ASIN/ISBN,Marketplace,Royalty Type,Transaction Type,Units Sold,Units Refunded,Net Units Sold,Avg. List Price without tax,Avg. Offer Price without tax,Avg. Delivery/Manufacturing Cost,Royalty,Currency,Kindle Edition Normalized Pages (KENP) Read"];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const books = [
    { title: "The Lantern Keeper", asin: "B0SAMPLE01", price: 4.99, tier: "70%", mb: 1.2, weight: 3 },
    { title: "Salt Road", asin: "B0SAMPLE02", price: 3.99, tier: "35%", mb: 0.8, weight: 1.5 },
    { title: "Salt Road (Paperback)", asin: "9780000000012", price: 12.99, tier: "60%", mb: 0, weight: 1 },
  ];
  const stores = [["Amazon.com", "USD", 1], ["Amazon.co.uk", "GBP", 0.79], ["Amazon.ca", "CAD", 1.36]];
  for (let day = 0; day < 120; day += 1 + Math.floor(rnd() * 3)) {
    const d = new Date(Date.UTC(2026, 4, 1 + day)).toISOString().slice(0, 10);
    for (const b of books) {
      if (rnd() > 0.55 * b.weight / 2) continue;
      const [store, cur, fx] = stores[rnd() < 0.72 ? 0 : rnd() < 0.6 ? 1 : 2];
      const sold = 1 + Math.floor(rnd() * 3 * b.weight);
      const refunded = rnd() < (b.title === "Salt Road" ? 0.22 : 0.05) ? 1 : 0;
      const net = Math.max(sold - refunded, 0);
      const offer = +(b.price * fx).toFixed(2);
      const rate = b.tier === "70%" ? 0.7 : b.tier === "35%" ? 0.35 : 0.6;
      const cost = b.tier === "70%" ? +(b.mb * 0.15).toFixed(2) : b.tier === "60%" ? 3.6 : 0;
      const roy = net * Math.max(rate * offer - cost, 0);
      const kenp = b.tier === "60%" ? 0 : Math.round(rnd() * 900 * b.weight);
      lines.push([d, `"${b.title}"`, "Sample Author", b.asin, store, b.tier, "Standard", sold, refunded, net, offer.toFixed(2), offer.toFixed(2), cost.toFixed(2), roy.toFixed(2), cur, kenp].join(","));
    }
  }
  return lines.join("\n") + "\n";
}
