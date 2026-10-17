// Wasted-spend, negative-keyword, harvest and break-even-bid analysis from an
// Amazon Sponsored Products "Search term report" CSV. Pure functions, no DOM,
// no network. Column names are matched by alias and were written from memory
// of the export, so anything unrecognised is reported, never guessed.


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

// Meta exports MM/DD/YYYY, DD/MM/YYYY or ISO depending on account locale.
export function parseDate(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
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


// "7 Day Total Sales ($)" -> "total sales"; "Customer Search Term" stays.
const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^\d+\s*day\s+/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
const windowOf = (h) => { const m = String(h ?? "").trim().match(/^(\d+)\s*day/i); return m ? Number(m[1]) : null; };

const ALIASES = {
  term: ["customer search term", "search term", "query"],
  campaign: ["campaign name", "campaign"],
  adgroup: ["ad group name", "ad group"],
  targeting: ["targeting", "keyword", "keyword text"],
  match: ["match type"],
  impr: ["impressions", "impr."],
  clicks: ["clicks"],
  spend: ["spend", "cost"],
  sales: ["total sales", "sales", "other sku sales"],
  orders: ["total orders", "orders", "total orders #"],
  currency: ["currency"],
  start: ["start date", "date"],
  end: ["end date"],
};

function findColumns(header) {
  const n = header.map(norm);
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const a of names) { const at = n.indexOf(a); if (at !== -1) { cols[field] = at; break; } }
  }
  return cols;
}

const ASIN = /^b0[0-9a-z]{8}$/i;
const AUTO = /^\*?(close-match|loose-match|substitutes|complements)$/i;
export const isAsin = (t) => ASIN.test(String(t).trim());

// Returns { rows, skipped, totalsRows, currency, columns, period, window,
// hasSales, error }. Each row: { line, campaign, adgroup, term, targeting,
// match, auto, impr, clicks, spend, sales, orders }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { rows: [], skipped: [], totalsRows: 0, currency: "", columns: {}, period: null, window: null };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i]);
    if (c.term !== undefined && c.spend !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Customer Search Term” and “Spend” (Seller Central → Advertising → Campaign Manager → Measurement & reporting → Sponsored ads reports → Search term report → CSV)." };
  const header = table[h];
  const cols = findColumns(header);
  if (cols.clicks === undefined) return { ...empty, columns: cols, error: "No Clicks column found. Choose a Search term report (not a Placement or Targeting report) and download it again." };
  if (cols.orders === undefined) return { ...empty, columns: cols, error: "No Orders column found (for example “7 Day Total Orders (#)”). Without it there is no way to tell wasted clicks from unmeasured ones." };
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).flatMap((l) => [get(l, "start"), get(l, "end")]));
  const rows = [], skipped = [];
  let totalsRows = 0, lo = Infinity, hi = -Infinity, currency = "";
  const window = windowOf(header[cols.orders]) ?? (cols.sales === undefined ? null : windowOf(header[cols.sales]));
  for (let r = h + 1; r < table.length; r++) {
    const line = table[r];
    const term = get(line, "term");
    if (!term) { totalsRows++; continue; }
    const num = (f) => (cols[f] === undefined ? 0 : parseNumber(get(line, f), decimalComma));
    const spend = num("spend"), clicks = num("clicks"), orders = num("orders"), sales = num("sales"), impr = num("impr");
    if (!Number.isFinite(spend) || spend < 0) { skipped.push({ line: r + 1, reason: "unreadable spend" }); continue; }
    if (!Number.isFinite(clicks) || clicks < 0) { skipped.push({ line: r + 1, reason: "unreadable clicks" }); continue; }
    if (!Number.isFinite(orders) || orders < 0) { skipped.push({ line: r + 1, reason: "unreadable orders" }); continue; }
    if (!Number.isFinite(sales) || sales < 0) { skipped.push({ line: r + 1, reason: "unreadable sales" }); continue; }
    const s = parseDate(get(line, "start"), dmy), e = parseDate(get(line, "end"), dmy);
    if (Number.isFinite(s)) lo = Math.min(lo, s);
    if (Number.isFinite(e)) hi = Math.max(hi, e);
    if (!currency) currency = get(line, "currency");
    const targeting = get(line, "targeting"), match = get(line, "match").toLowerCase();
    rows.push({
      line: r + 1, campaign: get(line, "campaign"), adgroup: get(line, "adgroup"), term, targeting, match,
      auto: AUTO.test(targeting) || (!match || match === "-") && !!targeting && AUTO.test(targeting.replace(/^\*/, "")),
      impr: Number.isFinite(impr) ? impr : 0, clicks, spend, sales, orders,
    });
  }
  const period = Number.isFinite(lo) && Number.isFinite(hi) ? { from: dateStr(lo), to: dateStr(hi), days: Math.round((hi - lo) / 86400000) + 1 } : null;
  return { rows, skipped, totalsRows, currency, columns: cols, period, window, hasSales: cols.sales !== undefined, error: rows.length ? null : "No usable search-term rows were found." };
}

// Fewest clicks n for which a term converting at the account's own rate p
// would have shown no order less than (1 - confidence) of the time.
export function clicksNeeded(rate, confidence = 0.95) {
  const p = Math.min(0.99, Math.max(0, rate));
  if (p <= 0) return Infinity;
  return Math.max(3, Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
}

const sum = (list, f) => list.reduce((t, x) => t + f(x), 0);

function derive(a) {
  return { ...a, cpc: a.clicks ? a.spend / a.clicks : null, acos: a.sales ? a.spend / a.sales : null, cvr: a.clicks ? a.orders / a.clicks : null, aov: a.orders ? a.sales / a.orders : null, ctr: a.impr ? a.clicks / a.impr : null };
}

function aggregate(rows, keyOf, seed) {
  const m = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    let a = m.get(key);
    if (!a) { a = { key, ...seed(r), impr: 0, clicks: 0, spend: 0, sales: 0, orders: 0, rows: 0, autoOnly: true, matches: new Set(), campaigns: new Set() }; m.set(key, a); }
    a.impr += r.impr; a.clicks += r.clicks; a.spend += r.spend; a.sales += r.sales; a.orders += r.orders; a.rows++;
    if (!r.auto) a.autoOnly = false;
    a.matches.add(r.auto ? "auto" : r.match || "?");
    a.campaigns.add(r.campaign || "(none)");
  }
  return [...m.values()].map(derive);
}

export function analyze(rows, { targetAcos = null, minClicks = 10, minOrders = 2, confidence = 0.95, hasSales = true } = {}) {
  if (!rows.length) return { invalid: "No search terms to analyze." };
  const spend = sum(rows, (r) => r.spend), clicks = sum(rows, (r) => r.clicks), orders = sum(rows, (r) => r.orders), sales = sum(rows, (r) => r.sales);
  if (spend <= 0) return { invalid: "The file records no spend." };
  if (clicks <= 0) return { invalid: "The file records no clicks." };
  if (orders <= 0) return { invalid: "This file records no orders at all, so there is no way to tell wasted clicks from unmeasured ones. Check the report includes the Orders column and that the attribution window has passed." };
  const acosAll = hasSales && sales ? spend / sales : null;
  const target = targetAcos && targetAcos > 0 ? targetAcos : acosAll;
  const rate = orders / clicks;
  const needed = clicksNeeded(rate, confidence);
  const aovAll = hasSales && orders ? sales / orders : null;
  // Cost of one order at the target: what a sale is worth times the share of it
  // you are prepared to spend. Without sales there is no such figure.
  const orderCost = target && aovAll ? aovAll * target : null;

  // Placement = one search term inside one campaign and ad group. Waste and the
  // reconciling buckets live here, because a negative is applied to a placement.
  const places = aggregate(rows, (r) => `${r.campaign}\u0001${r.adgroup}\u0001${r.term.toLowerCase()}`, (r) => ({ campaign: r.campaign, adgroup: r.adgroup, term: r.term.toLowerCase(), targeting: r.targeting }));
  for (const p of places) {
    if (p.orders <= 0) p.tier = p.clicks >= needed ? "proven" : orderCost && p.spend >= orderCost ? "overspent" : "watch";
    else p.tier = target && p.acos !== null && p.acos > target ? "unprofitable" : "profitable";
  }
  const of = (t) => places.filter((p) => p.tier === t);
  const buckets = { profitable: sum(of("profitable"), (p) => p.spend), unprofitable: sum(of("unprofitable"), (p) => p.spend), proven: sum(of("proven"), (p) => p.spend), overspent: sum(of("overspent"), (p) => p.spend), watch: sum(of("watch"), (p) => p.spend) };
  const wasteSpend = buckets.proven + buckets.overspent + buckets.watch;
  const excess = target ? sum(of("unprofitable"), (p) => p.spend - p.sales * target) : 0;

  // Terms (across placements): harvest and cannibalisation live here.
  const terms = aggregate(rows, (r) => r.term.toLowerCase(), (r) => ({ term: r.term.toLowerCase() }));
  const exactCovered = new Set(rows.filter((r) => r.match === "exact" && r.targeting && r.targeting.toLowerCase() === r.term.toLowerCase()).map((r) => r.term.toLowerCase()));
  for (const t of terms) t.asin = isAsin(t.term);
  const harvest = terms.filter((t) => !t.asin && !exactCovered.has(t.term) && t.orders >= minOrders && t.acos !== null && target && t.acos <= target)
    .map((t) => ({ ...t, bid: Math.round(Math.min(t.cpc, t.aov * t.cvr * target) * 100) / 100, maxCpc: t.aov * t.cvr * target }))
    .sort((a, b) => b.sales - a.sales).slice(0, 25);

  const negatives = of("proven").concat(of("overspent")).sort((a, b) => b.spend - a.spend);

  // Break-even bid: the highest CPC at which the term's own orders still meet
  // the target. Above it every click loses money at the observed conversion.
  const bids = places.filter((p) => p.tier === "unprofitable" && p.clicks >= minClicks && p.cpc !== null)
    .map((p) => { const maxCpc = (p.sales / p.clicks) * target; return { ...p, maxCpc, cut: p.cpc > maxCpc ? p.spend - p.clicks * maxCpc : 0 }; })
    .filter((p) => p.cut > 0).sort((a, b) => b.cut - a.cut).slice(0, 25);

  const overlap = terms.filter((t) => t.campaigns.size >= 2 && t.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 25);

  const summary = { terms: terms.length, placements: places.length, spend, clicks, orders, sales, acos: acosAll, target, targetGiven: Boolean(targetAcos && targetAcos > 0), cpc: spend / clicks, cvr: rate, aov: aovAll, needed, minClicks, minOrders, wasteSpend, wasteShare: wasteSpend / spend, excess, buckets, orderCost };
  const pc = (v) => `${Math.round(v * 100)}%`, m2 = (v) => v.toFixed(2);
  const findings = [];
  findings.push({ severity: summary.wasteShare > 0.3 ? "high" : summary.wasteShare > 0.15 ? "medium" : "info", title: `${pc(summary.wasteShare)} of spend went to search terms with no orders`, detail: `${m2(wasteSpend)} of ${m2(spend)}. ${m2(buckets.proven)} is proven (${needed}+ clicks and no order, which at the account's ${(rate * 100).toFixed(1)}% click-to-order rate would happen by chance under ${Math.round((1 - confidence) * 100)}% of the time), ${m2(buckets.overspent)} spent more than one order is worth at the target ACOS${orderCost ? ` (${m2(orderCost)})` : ""} with none, and ${m2(buckets.watch)} is too little data to judge.` });
  if (target && buckets.unprofitable > 0) findings.push({ severity: excess / spend > 0.1 ? "high" : "medium", title: `${m2(excess)} was spent above the ${pc(target)} target ACOS on terms that did sell`, detail: `${of("unprofitable").length} placement(s) had orders but an ACOS over the target ${summary.targetGiven ? "you entered" : "(the account average, since none was entered)"}. That figure is the spend beyond target ACOS on their own sales, not a saving: lower bids also lose some clicks and orders.` });
  if (negatives.length) findings.push({ severity: "high", title: `${negatives.length} placement(s) are negative-keyword candidates (${m2(sum(negatives, (p) => p.spend))})`, detail: `No orders and either enough clicks to be proven or more spend than one order is worth. Review each in context before adding it as a negative exact: seasonal, branded and new-listing terms can look like this and then convert.` });
  if (harvest.length) findings.push({ severity: "medium", title: `${harvest.length} search term(s) could be harvested into an exact-match campaign`, detail: `At least ${minOrders} orders, ACOS at or under the target, and no exact-match keyword for the term in this file. The suggested bid is the lower of the current average CPC and the break-even CPC (order value × click-to-order rate × target ACOS).` });
  if (overlap.length) findings.push({ severity: "info", title: `${overlap.length} search term(s) are served by two or more campaigns`, detail: `Your own campaigns compete on these terms and split the data. Check that the campaign you want winning has the highest bid.` });
  if (!hasSales) findings.push({ severity: "info", title: "No sales column", detail: "Without sales there is no ACOS, target check, harvest list or break-even bid: only the proven no-order tier is available." });
  if (orders / Math.max(1, terms.length) < 0.5) findings.push({ severity: "info", title: "Few orders per term", detail: "Most terms have little conversion data. Export a longer date range before acting on a single row." });
  return { summary, places: [...places].sort((a, b) => b.spend - a.spend), terms: [...terms].sort((a, b) => b.spend - a.spend), negatives, harvest, bids, overlap, buckets, findings };
}

export function money(v) { return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v) { return v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`; }

const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
const f = (v, d = 2) => (v === null || v === undefined ? "" : Number(v).toFixed(d));

// Amazon accepts negatives as keyword text with a match type; this is a review
// sheet in that shape, not a bulk-upload file.
export function negativesCsv(result) {
  return ["campaign,ad_group,negative_keyword,match_type,spend,clicks,evidence"].concat(result.negatives.map((p) => [q(p.campaign), q(p.adgroup), q(p.term), "negative exact", f(p.spend), p.clicks, p.tier].join(","))).join("\n");
}
export function harvestCsv(result) {
  return ["keyword,match_type,suggested_bid,orders,sales,acos,cpc"].concat(result.harvest.map((t) => [q(t.term), "exact", f(t.bid), t.orders, f(t.sales), f(t.acos === null ? null : t.acos * 100, 1), f(t.cpc)].join(","))).join("\n");
}
export function termsCsv(result) {
  const flag = (t) => [result.harvest.includes(t) ? "harvest" : "", t.asin ? "asin" : ""].filter(Boolean).join("|");
  return ["search_term,spend,clicks,orders,sales,acos_pct,cpc,click_to_order_pct,flags"].concat(result.terms.map((t) => [q(t.term), f(t.spend), t.clicks, t.orders, f(t.sales), f(t.acos === null ? null : t.acos * 100, 1), f(t.cpc), f(t.cvr === null ? null : t.cvr * 100, 1), q(flag(t))].join(","))).join("\n");
}

// Deterministic synthetic data in the Search term report's layout, so the
// example, the tests and the docs agree. Not a real account.
export function sampleCsv() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // [campaign, ad group, targeting, match, term, clicks, CPC, click-to-order rate, price]
  const T = [
    ["SP - Auto - Yoga", "Auto", "close-match", "-", "yoga mat non slip", 220, 0.92, 0.14, 29.99],
    ["SP - Auto - Yoga", "Auto", "close-match", "-", "yoga mat thick", 140, 0.88, 0.11, 29.99],
    ["SP - Auto - Yoga", "Auto", "loose-match", "-", "exercise mat", 160, 0.74, 0.02, 29.99],
    ["SP - Auto - Yoga", "Auto", "loose-match", "-", "gym flooring", 58, 0.7, 0, 29.99],
    ["SP - Auto - Yoga", "Auto", "substitutes", "-", "b07xj8c8f5", 44, 0.81, 0.09, 29.99],
    ["SP - Auto - Yoga", "Auto", "complements", "-", "yoga blocks", 36, 0.66, 0, 29.99],
    ["SP - Broad - Yoga", "Broad", "yoga mat", "broad", "yoga mat non slip", 180, 1.31, 0.12, 29.99],
    ["SP - Broad - Yoga", "Broad", "yoga mat", "broad", "yoga mat for hot yoga", 42, 1.2, 0.17, 29.99],
    ["SP - Broad - Yoga", "Broad", "yoga mat", "broad", "pilates mat", 95, 1.15, 0.03, 29.99],
    ["SP - Broad - Yoga", "Broad", "yoga mat", "broad", "free yoga mat", 61, 0.98, 0, 29.99],
    ["SP - Broad - Yoga", "Broad", "yoga mat", "broad", "yoga mat bag", 18, 0.9, 0, 29.99],
    ["SP - Phrase - Yoga", "Phrase", "eco yoga mat", "phrase", "eco friendly yoga mat", 74, 1.05, 0.13, 29.99],
    ["SP - Phrase - Yoga", "Phrase", "eco yoga mat", "phrase", "cork yoga mat", 39, 0.95, 0.15, 29.99],
    ["SP - Phrase - Yoga", "Phrase", "eco yoga mat", "phrase", "yoga mat cleaner", 47, 0.85, 0, 29.99],
    ["SP - Exact - Yoga", "Exact", "yoga mat non slip", "exact", "yoga mat non slip", 260, 1.62, 0.15, 29.99],
    ["SP - Exact - Yoga", "Exact", "extra thick yoga mat", "exact", "extra thick yoga mat", 90, 1.48, 0.13, 29.99],
  ];
  const head = "Start Date,End Date,Portfolio name,Currency,Campaign Name,Ad Group Name,Targeting,Match Type,Customer Search Term,Impressions,Clicks,Click-Thru Rate (CTR),Cost Per Click (CPC),Spend,7 Day Total Sales ,Total Advertising Cost of Sales (ACOS) ,Total Return on Advertising Spend (ROAS),7 Day Total Orders (#)";
  const out = [];
  for (const [camp, ag, tg, mt, term, c0, cpc, cvr, price] of T) {
    const clicks = Math.max(1, Math.round(c0 * (0.9 + rnd() * 0.2)));
    let o = 0;
    for (let k = 0; k < clicks; k++) if (rnd() < cvr) o++;
    const spend = clicks * cpc * (0.95 + rnd() * 0.1);
    const sales = o * price;
    const impr = Math.round(clicks / (0.004 + rnd() * 0.004));
    out.push([ "09/01/2026", "09/28/2026", "", "USD", camp, ag, tg, mt, term, impr, clicks, `${(clicks / impr * 100).toFixed(2)}%`, `$${(spend / clicks).toFixed(2)}`, `$${spend.toFixed(2)}`, o ? `$${sales.toFixed(2)}` : "$0.00", o ? `${(spend / sales * 100).toFixed(2)}%` : "", o ? (sales / spend).toFixed(2) : "", o ].join(","));
  }
  return [head, ...out].join("\n");
}
