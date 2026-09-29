// Wasted-spend and negative-keyword analysis from an Amazon Ads (Sponsored
// Products / Brands) search term report. Pure functions, no DOM, no network.
// Column names are matched by alias and were written from memory of the
// report, so anything unrecognised is reported, never guessed.

const ALIASES = {
  term: ["customer search term", "search term"],
  campaign: ["campaign name", "campaign"],
  adgroup: ["ad group name", "ad group"],
  targeting: ["targeting", "keyword", "keyword text"],
  match: ["match type"],
  spend: ["spend", "cost"],
  impr: ["impressions", "impr."],
  clicks: ["clicks"],
  orders: ["7 day total orders (#)", "14 day total orders (#)", "30 day total orders (#)", "total orders (#)", "orders", "7 day total orders", "7 day total orders (#) - same sku"],
  sales: ["7 day total sales", "14 day total sales", "30 day total sales", "total sales", "sales", "7 day total sales (#)"],
  start: ["start date"],
  end: ["end date"],
  day: ["date", "day"],
  currency: ["currency"],
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

// "1,234.56", "$12", "12.5%", "--", "(3)". Blank is 0. NaN only for text that
// is not a number at all.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Amazon exports MM/DD/YYYY, DD/MM/YYYY or ISO depending on account locale.
export function parseDate(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  const named = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    mo = MONTHS.indexOf(named[1].toLowerCase()) + 1; d = +named[2]; y = +named[3];
    if (!mo) return NaN;
  } else if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) return NaN;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t).getUTCDate() === d ? t : NaN;
}

// Day-first if any slash date has a first part above 12 and none has a second
// part above 12. Ambiguous files default to month-first.
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

export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

const strip = (h) => h.trim().toLowerCase().replace(/\s+/g, " ");
const bare = (h) => strip(h).replace(/\s*\([^)]*\)\s*$/, "").trim();

function findColumns(header) {
  const full = header.map(strip), plain = header.map(bare);
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    // Earlier aliases win, and an exact header beats one with a suffix such as
    // "Spend (USD)".
    for (const n of names) {
      let at = full.indexOf(n);
      if (at === -1) at = plain.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Some exports put the currency in the header: "Spend (USD)".
function currencyOf(header, at) {
  const m = at === undefined ? null : String(header[at] ?? "").match(/\(([A-Za-z]{3})\)\s*$/);
  return m ? m[1].toUpperCase() : "";
}


const isAuto = (targeting, match) => {
  const t = String(targeting ?? "").toLowerCase(), m = String(match ?? "").toLowerCase();
  return /close-match|loose-match|substitutes|complements|\*|category=|asin=|expanded=/.test(t) || m === "-" || m === "";
};

// Returns { rows, skipped, totalsRows, currency, columns, period, hasMatch,
// error }. Each row: { line, campaign, adgroup, term, targeting, match, spend,
// impr, clicks, orders, sales }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { rows: [], skipped: [], totalsRows: 0, currency: "", columns: {}, period: null };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i]);
    if (c.term !== undefined && c.spend !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Customer Search Term” and “Spend” (Seller/Vendor Central or the Ads console: Measurement & reporting → Sponsored ads reports → Search term → CSV or XLSX saved as CSV)." };
  const header = table[h];
  const cols = findColumns(header);
  if (cols.clicks === undefined) return { ...empty, columns: cols, error: "No Clicks column found. Add Clicks to the search term report and download again." };
  if (cols.orders === undefined) return { ...empty, columns: cols, error: "No orders column found (for example “7 Day Total Orders (#)”). Without it there is no way to tell wasted clicks from unmeasured ones." };
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).flatMap((l) => [get(l, "day"), get(l, "start"), get(l, "end")]));
  const rows = [], skipped = [];
  let totalsRows = 0, lo = Infinity, hi = -Infinity, currency = "";
  for (let r = h + 1; r < table.length; r++) {
    const line = table[r];
    const term = get(line, "term");
    if (!term) { totalsRows++; continue; }
    const num = (f) => (cols[f] === undefined ? 0 : parseNumber(get(line, f), decimalComma));
    const spend = num("spend"), impr = num("impr"), clicks = num("clicks"), orders = num("orders"), sales = num("sales");
    if (!Number.isFinite(spend) || spend < 0) { skipped.push({ line: r + 1, reason: "unreadable spend" }); continue; }
    if (!Number.isFinite(clicks) || clicks < 0) { skipped.push({ line: r + 1, reason: "unreadable clicks" }); continue; }
    if (!Number.isFinite(orders) || orders < 0) { skipped.push({ line: r + 1, reason: "unreadable orders" }); continue; }
    if (!Number.isFinite(sales) || sales < 0) { skipped.push({ line: r + 1, reason: "unreadable sales" }); continue; }
    if (!currency) currency = get(line, "currency").toUpperCase().slice(0, 3);
    const s = parseDate(get(line, "start") || get(line, "day"), dmy), e = parseDate(get(line, "end") || get(line, "day"), dmy);
    if (Number.isFinite(s)) lo = Math.min(lo, s);
    if (Number.isFinite(e)) hi = Math.max(hi, e);
    rows.push({ line: r + 1, campaign: get(line, "campaign"), adgroup: get(line, "adgroup"), term, targeting: get(line, "targeting"), match: get(line, "match"), spend, impr: Number.isFinite(impr) ? impr : 0, clicks, orders, sales });
  }
  const period = Number.isFinite(lo) && Number.isFinite(hi) ? { from: dateStr(lo), to: dateStr(hi), days: Math.round((hi - lo) / 86400000) + 1 } : null;
  return {
    rows, skipped, totalsRows, currency: currency || currencyOf(header, cols.spend), columns: cols, period,
    hasSales: cols.sales !== undefined, hasMatch: cols.match !== undefined,
    error: rows.length ? null : "No usable search term rows were found.",
  };
}

// Fewest clicks n for which a term converting at the account's own rate p would
// have shown no order less than (1 - confidence) of the time.
export function clicksNeeded(rate, confidence = 0.95) {
  const p = Math.min(0.99, Math.max(0, rate));
  if (p <= 0) return Infinity;
  return Math.max(5, Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
}

const sum = (list, f) => list.reduce((t, x) => t + f(x), 0);

function aggregate(rows) {
  const m = new Map();
  for (const r of rows) {
    const key = [r.campaign, r.adgroup, r.term.toLowerCase()].join("\u0001");
    let a = m.get(key);
    if (!a) { a = { key, campaign: r.campaign, adgroup: r.adgroup, term: r.term, targets: new Set(), matches: new Set(), spend: 0, impr: 0, clicks: 0, orders: 0, sales: 0 }; m.set(key, a); }
    a.spend += r.spend; a.impr += r.impr; a.clicks += r.clicks; a.orders += r.orders; a.sales += r.sales;
    if (r.targeting) a.targets.add(r.targeting);
    if (r.match) a.matches.add(r.match);
  }
  return [...m.values()].map((a) => ({
    ...a, targets: [...a.targets], matches: [...a.matches],
    auto: [...a.targets].some((t) => isAuto(t, "x")) || [...a.matches].some((x) => /^-?$/.test(x)),
    exactTarget: [...a.matches].some((x) => /exact/i.test(x)),
    acos: a.sales ? a.spend / a.sales : null, cpc: a.clicks ? a.spend / a.clicks : null, convRate: a.clicks ? a.orders / a.clicks : null,
  }));
}

function groupBy(entries, key) {
  const m = new Map();
  for (const a of entries) { const k = key(a) || "(none)"; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
  return [...m.entries()].map(([k, list]) => {
    const spend = sum(list, (a) => a.spend), sales = sum(list, (a) => a.sales), orders = sum(list, (a) => a.orders), clicks = sum(list, (a) => a.clicks);
    return { key: k, terms: list.length, spend, sales, orders, clicks, acos: sales ? spend / sales : null, convRate: clicks ? orders / clicks : null, zeroSpend: sum(list.filter((a) => a.orders <= 0), (a) => a.spend) };
  }).sort((a, b) => b.spend - a.spend);
}

// breakEvenAcos is a fraction (0.30 = 30%): the ACOS at which a sale pays for
// its own ads before any profit, i.e. the seller's margin before advertising.
export function analyze(rows, { breakEvenAcos = null, minClicks = 10, minOrders = 2, confidence = 0.95 } = {}) {
  if (!rows.length) return { invalid: "No search terms to analyze." };
  const spend = sum(rows, (r) => r.spend), clicks = sum(rows, (r) => r.clicks), orders = sum(rows, (r) => r.orders), sales = sum(rows, (r) => r.sales);
  if (spend <= 0) return { invalid: "The file records no spend." };
  if (clicks <= 0) return { invalid: "The file records no clicks." };
  if (orders <= 0 || sales <= 0) return { invalid: "This file records no orders or sales at all, so there is no way to tell wasted clicks from unmeasured ones. Check the report includes the orders and sales columns and that the date range covers a period with sales." };
  const entries = aggregate(rows);
  const acosAll = spend / sales, convRate = orders / clicks, aov = sales / orders;
  const be = breakEvenAcos && breakEvenAcos > 0 ? breakEvenAcos : null;
  const refAcos = be ?? acosAll;
  const orderCost = aov * refAcos; // ad spend one order can carry at the reference ACOS
  const needed = clicksNeeded(convRate, confidence);

  const zero = entries.filter((a) => a.orders <= 0 && a.spend > 0);
  for (const a of zero) a.tier = a.clicks >= needed ? "proven" : a.spend >= orderCost ? "overspent" : "watch";
  const inTier = (k) => zero.filter((a) => a.tier === k);
  const withOrders = entries.filter((a) => a.orders > 0);
  const overBar = (a) => (be ? a.acos > be : a.acos > 1.5 * acosAll);
  const highAcos = withOrders.filter((a) => a.clicks >= minClicks && overBar(a)).map((a) => ({ ...a, excess: a.spend - a.sales * refAcos })).sort((a, b) => b.excess - a.excess);
  const harvest = withOrders.filter((a) => a.orders >= minOrders && a.acos <= 0.8 * refAcos && !a.exactTarget).sort((a, b) => b.orders - a.orders || a.acos - b.acos).slice(0, 25);
  const buckets = {
    withOrders: sum(withOrders, (a) => a.spend),
    proven: sum(inTier("proven"), (a) => a.spend),
    overspent: sum(inTier("overspent"), (a) => a.spend),
    watch: sum(inTier("watch"), (a) => a.spend),
  };
  const zeroSpend = buckets.proven + buckets.overspent + buckets.watch;
  const excessSpend = sum(highAcos, (a) => a.excess);
  const summary = { terms: entries.length, spend, sales, orders, clicks, acos: acosAll, convRate, aov, cpc: spend / clicks, refAcos, breakEvenAcos: be, orderCost, needed, minClicks, minOrders, zeroSpend, zeroShare: zeroSpend / spend, buckets, excessSpend, highAcosCount: highAcos.length };

  const pc = (v) => `${Math.round(v * 100)}%`;
  const m2 = (v) => v.toFixed(2);
  const findings = [];
  findings.push({ severity: summary.zeroShare > 0.3 ? "high" : summary.zeroShare > 0.15 ? "medium" : "info", title: `${pc(summary.zeroShare)} of ad spend went to search terms with no orders`, detail: `${m2(zeroSpend)} of ${m2(spend)}. ${m2(buckets.proven)} is proven (${Number.isFinite(needed) ? needed + "+ clicks" : "enough clicks"} and no order, which at the account's ${(convRate * 100).toFixed(1)}% click-to-order rate would happen by chance under ${Math.round((1 - confidence) * 100)}% of the time), ${m2(buckets.overspent)} spent more than ${m2(orderCost)} (what one average order can carry at ${be ? "your break-even" : "the account"} ACOS of ${pc(refAcos)}) with none, and ${m2(buckets.watch)} is too little data to judge.` });
  if (highAcos.length) findings.push({ severity: excessSpend > 0.1 * spend ? "high" : "medium", title: `${highAcos.length} converting term(s) run above ${be ? "your break-even" : "1.5 times the account"} ACOS, ${m2(excessSpend)} over the line`, detail: `Terms with at least ${minClicks} clicks and an ACOS over ${be ? pc(be) : pc(1.5 * acosAll)}. Excess is spend beyond what their sales carry at ${pc(refAcos)}. Lowering the bid or moving the term to exact match is the usual first step; that is a judgement, not something the file proves.` });
  if (harvest.length) findings.push({ severity: "medium", title: `${harvest.length} term(s) convert well but are not running as exact match`, detail: `At least ${minOrders} orders and an ACOS at least 20% under ${pc(refAcos)}, reached through auto, broad or phrase targeting. Adding them as exact-match keywords is the standard harvest. It describes the period in the file, not what more control would do.` });
  if (!be) findings.push({ severity: "info", title: "No break-even ACOS entered", detail: `Cost and “high ACOS” are judged against the account's own ACOS (${pc(acosAll)}). Enter your break-even ACOS (your margin before ad spend) to judge terms against what a sale really pays for.` });
  if (!Number.isFinite(needed) || needed > clicks / 4) findings.push({ severity: "info", title: "Few clicks for a firm verdict", detail: "At this conversion rate it takes many clicks to be sure a term will never order, so most no-order spend lands in overspent or watch. Export a longer date range." });
  return { summary, entries: [...entries].sort((a, b) => b.spend - a.spend), zero: [...zero].sort((a, b) => b.spend - a.spend), highAcos, harvest, buckets, byCampaign: groupBy(entries, (a) => a.campaign), byMatch: groupBy(entries, (a) => a.matches.join(" + ") || "auto"), findings };
}

export function money(v) { return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v) { return v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`; }

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
// Terms worth adding as negative exact keywords: proven plus overspent with no
// order, in the ad group they wasted money in (negatives are set per campaign
// or ad group in Amazon Ads).
export function negativesCsv(result) {
  const list = result.zero.filter((a) => a.tier !== "watch");
  return ["campaign,ad_group,negative_keyword,match_type,spend,clicks,evidence"].concat(list.map((a) => [q(a.campaign), q(a.adgroup), q(a.term), "negative exact", a.spend.toFixed(2), a.clicks, a.tier].join(","))).join("\n");
}

export function termsCsv(result) {
  const f = (v, d = 2) => (v === null || v === undefined ? "" : Number(v).toFixed(d));
  const flags = (a) => [a.orders <= 0 ? `no_orders_${a.tier}` : "", result.highAcos.some((h) => h.key === a.key) ? "high_acos" : "", result.harvest.includes(a) ? "harvest_exact" : ""].filter(Boolean).join("|");
  return ["campaign,ad_group,search_term,match_types,spend,clicks,orders,sales,acos_pct,flags"].concat(result.entries.map((a) => [q(a.campaign), q(a.adgroup), q(a.term), q(a.matches.join("+")), f(a.spend), a.clicks, a.orders, f(a.sales), f(a.acos === null ? null : a.acos * 100, 1), q(flags(a))].join(","))).join("\n");
}

// Deterministic synthetic data in the report's own layout, so the example, the
// tests and the docs agree. Not a real account.
export function sampleCsv() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // [campaign, ad group, targeting, match, search term, clicks, cpc, conv rate, price]
  const t = [
    ["SP - Auto", "Auto 1", "close-match", "-", "stainless steel water bottle", 220, 0.55, 0.13, 24],
    ["SP - Auto", "Auto 1", "loose-match", "-", "insulated bottle 32 oz", 140, 0.5, 0.11, 24],
    ["SP - Auto", "Auto 1", "substitutes", "-", "hydro flask", 96, 1.05, 0.02, 24],
    ["SP - Auto", "Auto 1", "close-match", "-", "gym shaker cup", 71, 0.6, 0, 24],
    ["SP - Auto", "Auto 1", "loose-match", "-", "kids lunch box", 58, 0.55, 0, 24],
    ["SP - Auto", "Auto 1", "complements", "-", "bottle cleaning brush", 33, 0.5, 0.02, 24],
    ["SP - Broad", "Bottles", "water bottle", "broad", "water bottle with straw", 180, 0.9, 0.095, 24],
    ["SP - Broad", "Bottles", "water bottle", "broad", "free water bottle", 64, 0.7, 0, 24],
    ["SP - Broad", "Bottles", "water bottle", "broad", "water bottle bulk wholesale", 41, 0.88, 0, 24],
    ["SP - Broad", "Bottles", "water bottle", "broad", "40 oz tumbler with handle", 120, 1.1, 0.06, 24],
    ["SP - Phrase", "Bottles", "insulated bottle", "phrase", "insulated water bottle", 150, 0.95, 0.12, 24],
    ["SP - Phrase", "Bottles", "insulated bottle", "phrase", "vacuum insulated flask", 85, 1.0, 0.075, 24],
    ["SP - Exact", "Bottles", "stainless steel water bottle", "exact", "stainless steel water bottle", 210, 1.15, 0.16, 24],
    ["SP - Exact", "Bottles", "insulated water bottle", "exact", "insulated water bottle", 130, 1.2, 0.14, 24],
    ["SP - Exact", "Bottles", "sports water bottle", "exact", "sports water bottle", 12, 0.9, 0, 24],
  ];
  const head = "Start Date,End Date,Currency,Campaign Name,Ad Group Name,Targeting,Match Type,Customer Search Term,Impressions,Clicks,Click-Thru Rate (CTR),Cost Per Click (CPC),Spend,7 Day Total Sales,Total Advertising Cost of Sales (ACOS),7 Day Total Orders (#)";
  const out = [];
  for (const [camp, ag, tg, mt, term, clicks0, cpc, cvr, price] of t) {
    const clicks = Math.round(clicks0 * (0.9 + rnd() * 0.2));
    let o = 0;
    for (let k = 0; k < clicks; k++) if (rnd() < cvr) o++;
    const spend = clicks * cpc * (0.95 + rnd() * 0.1), sales = o * price, impr = clicks * 90;
    out.push(`Sep 01 2026,Sep 28 2026,USD,${camp},${ag},${tg},${mt},${term},${impr},${clicks},${(clicks / impr * 100).toFixed(2)}%,${(spend / clicks).toFixed(2)},${spend.toFixed(2)},${sales ? sales.toFixed(2) : "0.00"},${sales ? (spend / sales * 100).toFixed(2) + "%" : ""},${o}`);
  }
  return [head, ...out].join("\n");
}
