// Creative-fatigue and wasted-spend analysis from a Meta (Facebook / Instagram)
// Ads Manager ad-level CSV export. Pure functions, no DOM, no network.
// Column names are matched by alias and were written from memory of the
// export, so anything unrecognised is reported, never guessed.

const ALIASES = {
  ad: ["ad name", "ad", "creative name"],
  adset: ["ad set name", "ad set", "adset name"],
  campaign: ["campaign name", "campaign"],
  spend: ["amount spent", "spend", "cost", "amount spent (usd)"],
  impr: ["impressions", "impr."],
  reach: ["reach"],
  freq: ["frequency"],
  clicks: ["link clicks", "clicks (link)", "outbound clicks", "clicks"],
  ctr: ["ctr (link click-through rate)", "link ctr", "ctr (all)", "ctr"],
  results: ["purchases", "website purchases", "results", "leads", "website leads", "conversions"],
  value: ["purchases conversion value", "website purchases conversion value", "purchase conversion value", "conversion value", "conversion value (all)"],
  roas: ["purchase roas (return on ad spend)", "purchase roas", "website purchase roas (return on ad spend)", "roas"],
  day: ["day", "date"],
  start: ["reporting starts"],
  end: ["reporting ends"],
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

const strip = (h) => h.trim().toLowerCase().replace(/\s+/g, " ");
const bare = (h) => strip(h).replace(/\s*\([^)]*\)\s*$/, "").trim();

function findColumns(header) {
  const full = header.map(strip), plain = header.map(bare);
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    // Earlier aliases win, and an exact header beats one with a suffix such as
    // "Amount spent (USD)".
    for (const n of names) {
      let at = full.indexOf(n);
      if (at === -1) at = plain.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Meta puts the account currency in the header: "Amount spent (USD)".
function currencyOf(header, at) {
  const m = at === undefined ? null : String(header[at] ?? "").match(/\(([A-Za-z]{3})\)\s*$/);
  return m ? m[1].toUpperCase() : "";
}

// Returns { rows, skipped, ignored, totalsRows, currency, columns, period,
// hasDaily, error }. Each row: { line, campaign, adset, ad, day, spend,
// impr, reach, freq, clicks, results, value }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { rows: [], skipped: [], ignored: 0, totalsRows: 0, currency: "", columns: {}, period: null, hasDaily: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i]);
    if (c.ad !== undefined && c.spend !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Ad name” and “Amount spent” (Ads Manager: set the view to Ads, add the columns, then Reports → Export table data → CSV)." };
  const header = table[h];
  const cols = findColumns(header);
  if (cols.impr === undefined) return { ...empty, columns: cols, error: "No Impressions column found. Add Impressions in Ads Manager's Columns menu and export again." };
  if (cols.results === undefined) return { ...empty, columns: cols, error: "No Results, Purchases or Leads column found. Without one there is no way to tell spend with no results from spend that was not measured." };
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).flatMap((l) => [get(l, "day"), get(l, "start"), get(l, "end")]));
  const rows = [], skipped = [];
  let ignored = 0, totalsRows = 0, lo = Infinity, hi = -Infinity;
  for (let r = h + 1; r < table.length; r++) {
    const line = table[r];
    const ad = get(line, "ad");
    if (!ad) { totalsRows++; continue; }
    const num = (f) => {
      if (cols[f] === undefined) return 0;
      const n = parseNumber(get(line, f), decimalComma);
      return n;
    };
    const spend = num("spend"), impr = num("impr"), results = num("results");
    if (!Number.isFinite(spend) || spend < 0) { skipped.push({ line: r + 1, reason: "unreadable amount spent" }); continue; }
    if (!Number.isFinite(impr) || impr < 0) { skipped.push({ line: r + 1, reason: "unreadable impressions" }); continue; }
    if (!Number.isFinite(results) || results < 0) { skipped.push({ line: r + 1, reason: "unreadable results" }); continue; }
    const clicks = num("clicks"), reach = num("reach"), freq = num("freq");
    let value = cols.value === undefined ? 0 : parseNumber(get(line, "value"), decimalComma);
    if (cols.value === undefined && cols.roas !== undefined) {
      const ro = parseNumber(get(line, "roas"), decimalComma);
      value = Number.isFinite(ro) ? ro * spend : 0;
    }
    const dayRaw = get(line, "day") || get(line, "start");
    const day = parseDate(dayRaw, dmy);
    if (cols.day !== undefined && Number.isFinite(day)) { lo = Math.min(lo, day); hi = Math.max(hi, day); }
    const s = parseDate(get(line, "start"), dmy), e = parseDate(get(line, "end"), dmy);
    if (Number.isFinite(s)) lo = Math.min(lo, s);
    if (Number.isFinite(e)) hi = Math.max(hi, e);
    rows.push({
      line: r + 1, campaign: get(line, "campaign"), adset: get(line, "adset"), ad,
      day: cols.day !== undefined && Number.isFinite(day) ? day : null,
      spend, impr, reach: Number.isFinite(reach) ? reach : 0, freq: Number.isFinite(freq) ? freq : 0,
      clicks: Number.isFinite(clicks) ? clicks : 0, results, value: Number.isFinite(value) ? value : 0,
    });
  }
  const period = Number.isFinite(lo) && Number.isFinite(hi) ? { from: dateStr(lo), to: dateStr(hi), days: Math.round((hi - lo) / 86400000) + 1 } : null;
  return {
    rows, skipped, ignored, totalsRows, currency: currencyOf(header, cols.spend), columns: cols, period,
    hasDaily: cols.day !== undefined && rows.some((x) => x.day !== null),
    hasClicks: cols.clicks !== undefined, hasValue: cols.value !== undefined || cols.roas !== undefined,
    error: rows.length ? null : "No usable ad rows were found.",
  };
}

// Fewest link clicks n for which an ad converting at the account's own rate p
// would have shown no result less than (1 - confidence) of the time.
export function clicksNeeded(rate, confidence = 0.95) {
  const p = Math.min(0.99, Math.max(0, rate));
  if (p <= 0) return Infinity;
  return Math.max(3, Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
}

const sum = (list, f) => list.reduce((t, x) => t + f(x), 0);
export function median(list) {
  const v = list.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function aggregateAds(rows) {
  const m = new Map();
  for (const r of rows) {
    const key = `${r.campaign}\u0001${r.adset}\u0001${r.ad}`;
    let a = m.get(key);
    if (!a) { a = { key, campaign: r.campaign, adset: r.adset, ad: r.ad, spend: 0, impr: 0, reach: 0, freqWeighted: 0, clicks: 0, results: 0, value: 0, rows: 0, daily: [] }; m.set(key, a); }
    a.spend += r.spend; a.impr += r.impr; a.reach += r.reach; a.clicks += r.clicks; a.results += r.results; a.value += r.value; a.rows++;
    a.freqWeighted += r.freq * r.impr;
    if (r.day !== null) a.daily.push(r);
  }
  return [...m.values()].map((a) => {
    // Reach cannot be added across days, so with several rows per ad the
    // frequency is the impression-weighted average of the reported ones.
    let freq = a.impr && a.freqWeighted ? a.freqWeighted / a.impr : 0;
    if (!freq && a.rows === 1 && a.reach) freq = a.impr / a.reach;
    return { ...a, freq, ctr: a.impr ? a.clicks / a.impr : null, cpa: a.results ? a.spend / a.results : null, roas: a.spend && a.value ? a.value / a.spend : null, clickRate: a.clicks ? a.results / a.clicks : null };
  });
}

// CTR in the first and last third of an ad's days, impression-weighted. Only
// for daily exports and ads with at least six days.
function trendOf(a) {
  const days = [...new Set(a.daily.map((r) => r.day))].sort((x, y) => x - y);
  if (days.length < 6) return null;
  const k = Math.floor(days.length / 3);
  const early = new Set(days.slice(0, k)), late = new Set(days.slice(-k));
  const ctr = (set) => { const rs = a.daily.filter((r) => set.has(r.day)); const i = sum(rs, (r) => r.impr); return i ? sum(rs, (r) => r.clicks) / i : null; };
  const e = ctr(early), l = ctr(late);
  return e && l !== null ? { early: e, late: l, change: l / e - 1, days: days.length } : null;
}

function groupBy(ads, key) {
  const m = new Map();
  for (const a of ads) { const k = key(a) || "(none)"; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
  return [...m.entries()].map(([k, list]) => {
    const spend = sum(list, (a) => a.spend), results = sum(list, (a) => a.results), value = sum(list, (a) => a.value), impr = sum(list, (a) => a.impr), clicks = sum(list, (a) => a.clicks);
    return { key: k, ads: list.length, spend, results, cpa: results ? spend / results : null, roas: spend && value ? value / spend : null, ctr: impr && clicks ? clicks / impr : null, noResultSpend: sum(list.filter((a) => a.results <= 0), (a) => a.spend) };
  }).sort((a, b) => b.spend - a.spend);
}

export function analyze(rows, { targetCpa = null, freqThreshold = 3, minImpr = 1000, minResults = 5, confidence = 0.95, hasClicks = true, hasValue = true } = {}) {
  if (!rows.length) return { invalid: "No ads to analyze." };
  const spend = sum(rows, (r) => r.spend), results = sum(rows, (r) => r.results);
  if (spend <= 0) return { invalid: "The file records no spend." };
  if (results <= 0) return { invalid: "This file records no results at all, so there is no way to tell spend with no results from unmeasured spend. Check the export includes the Purchases or Results column." };
  const ads = aggregateAds(rows);
  for (const a of ads) a.trend = trendOf(a);
  const impr = sum(ads, (a) => a.impr), clicks = sum(ads, (a) => a.clicks), value = sum(ads, (a) => a.value);
  const cpaAll = spend / results;
  const cpaRef = targetCpa && targetCpa > 0 ? targetCpa : cpaAll;
  const rate = clicks ? results / clicks : 0;
  const needed = hasClicks && rate > 0 ? clicksNeeded(rate, confidence) : Infinity;

  const eligible = ads.filter((a) => a.impr >= minImpr);
  const medCtr = median(eligible.map((a) => a.ctr).filter((v) => v !== null));
  const medCpa = median(eligible.filter((a) => a.results > 0).map((a) => a.cpa));
  const medRoas = hasValue ? median(eligible.filter((a) => a.roas !== null).map((a) => a.roas)) : null;

  for (const a of ads) {
    a.reasons = [];
    a.fatigued = false;
    if (a.impr >= minImpr && a.freq >= freqThreshold) {
      if (medCtr && a.ctr !== null && a.ctr < 0.8 * medCtr) a.reasons.push(`CTR ${(a.ctr * 100).toFixed(2)}% is below 80% of the account median ${(medCtr * 100).toFixed(2)}%`);
      if (medCpa && a.cpa !== null && a.cpa > 1.25 * medCpa) a.reasons.push(`cost per result ${a.cpa.toFixed(2)} is above 125% of the account median ${medCpa.toFixed(2)}`);
      if (a.results <= 0 && a.spend >= cpaRef) a.reasons.push(`spent ${a.spend.toFixed(2)} (over one result's cost) with no results`);
      if (a.trend && a.trend.change <= -0.25) a.reasons.push(`daily CTR fell ${Math.round(-a.trend.change * 100)}% from the first to the last third of its days`);
      a.fatigued = a.reasons.length > 0;
    }
  }
  const fatigued = ads.filter((a) => a.fatigued).sort((a, b) => b.spend - a.spend);

  // Spend with no results, graded the way the Google Ads sibling grades terms.
  const zero = ads.filter((a) => a.results <= 0 && a.spend > 0);
  const tierOf = (a) => (a.clicks >= needed ? "proven" : a.spend >= cpaRef ? "overspent" : "watch");
  for (const a of zero) a.tier = tierOf(a);
  const tier = (k) => zero.filter((a) => a.tier === k);
  const buckets = {
    withResults: sum(ads.filter((a) => a.results > 0), (a) => a.spend),
    proven: sum(tier("proven"), (a) => a.spend),
    overspent: sum(tier("overspent"), (a) => a.spend),
    watch: sum(tier("watch"), (a) => a.spend),
  };
  const zeroSpend = buckets.proven + buckets.overspent + buckets.watch;

  const scale = ads.filter((a) => {
    if (a.fatigued || a.results < minResults || a.impr < minImpr || a.cpa === null) return false;
    if (a.freq && a.freq >= freqThreshold) return false;
    const cheap = medCpa && a.cpa <= 0.8 * medCpa;
    const rich = medRoas && a.roas !== null && a.roas >= 1.25 * medRoas && medCpa && a.cpa <= medCpa;
    return cheap || rich;
  }).sort((a, b) => a.cpa - b.cpa).slice(0, 15);

  const summary = {
    ads: ads.length, spend, impr, clicks, results, value, cpa: cpaAll, roas: value && spend ? value / spend : null, ctr: impr && clicks ? clicks / impr : null,
    freq: impr ? sum(ads, (a) => a.freqWeighted) / impr : 0, medCtr, medCpa, medRoas, cpaRef, targetCpa: targetCpa || null, needed, freqThreshold, minImpr, minResults,
    fatiguedSpend: sum(fatigued, (a) => a.spend), fatiguedCount: fatigued.length, zeroSpend, zeroShare: zeroSpend / spend, buckets, eligible: eligible.length,
  };
  const pc = (v) => `${Math.round(v * 100)}%`;
  const m2 = (v) => v.toFixed(2);
  const findings = [];
  findings.push({ severity: summary.zeroShare > 0.3 ? "high" : summary.zeroShare > 0.15 ? "medium" : "info", title: `${pc(summary.zeroShare)} of spend went to ads with no results`, detail: `${m2(zeroSpend)} of ${m2(spend)}. ${m2(buckets.proven)} is proven (${Number.isFinite(needed) ? needed + "+ link clicks" : "enough link clicks"} and nothing, which at the account's ${(rate * 100).toFixed(1)}% click-to-result rate would happen by chance under ${Math.round((1 - confidence) * 100)}% of the time), ${m2(buckets.overspent)} spent more than ${m2(cpaRef)} (${targetCpa ? "your target" : "the account average"} cost per result) with none, and ${m2(buckets.watch)} is too little data to judge.` });
  if (fatigued.length) findings.push({ severity: "high", title: `${fatigued.length} ad(s) show fatigue signals, with ${m2(summary.fatiguedSpend)} spent`, detail: `Frequency at or above ${freqThreshold} plus at least one weak signal against the account median. The heaviest: ${fatigued.slice(0, 3).map((a) => `“${a.ad}” (frequency ${a.freq.toFixed(1)})`).join("; ")}. This is a pattern in the file, not proof that the creative is worn out: audience size, seasonality and budget changes move the same numbers.` });
  if (scale.length) findings.push({ severity: "medium", title: `${scale.length} ad(s) beat the account median with enough results`, detail: `Each has at least ${minResults} results, a cost per result at least 20% under the median${medRoas ? " (or a return at least 25% above it)" : ""}, and frequency under ${freqThreshold}. That describes the period in the file; it does not predict what more budget would do.` });
  if (!hasClicks) findings.push({ severity: "info", title: "No link clicks column", detail: "Without link clicks the proven tier and CTR checks are unavailable: no-result spend is graded by cost only." });
  if (eligible.length < 5) findings.push({ severity: "info", title: "Few ads have enough impressions", detail: `Only ${eligible.length} ad(s) reach ${minImpr} impressions, so the account medians are thin. Treat flags as leads.` });
  if (results / Math.max(1, ads.length) < 3) findings.push({ severity: "info", title: "Few results per ad", detail: "Cost per result and ROAS swing widely on a handful of results. Export a longer date range." });
  return { summary, ads: [...ads].sort((a, b) => b.spend - a.spend), fatigued, zero: [...zero].sort((a, b) => b.spend - a.spend), scale, buckets, byCampaign: groupBy(ads, (a) => a.campaign), byAdset: groupBy(ads, (a) => a.adset), findings };
}

export function money(v) { return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v) { return v === null || v === undefined ? "–" : `${(v * 100).toFixed(2)}%`; }

export function adsCsv(result) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const f = (v, d = 2) => (v === null || v === undefined ? "" : Number(v).toFixed(d));
  const flags = (a) => [a.fatigued ? "fatigue" : "", a.results <= 0 ? `no_results_${a.tier}` : "", result.scale.includes(a) ? "scale_candidate" : ""].filter(Boolean).join("|");
  return ["campaign,ad_set,ad,spend,impressions,frequency,link_clicks,ctr,results,cost_per_result,roas,flags"].concat(result.ads.map((a) => [q(a.campaign), q(a.adset), q(a.ad), f(a.spend), a.impr, f(a.freq), a.clicks, f(a.ctr === null ? null : a.ctr * 100, 3), a.results, f(a.cpa), f(a.roas), q(flags(a))].join(","))).join("\n");
}

// Deterministic synthetic data in Ads Manager's own layout, so the example, the
// tests and the docs agree. Not a real account.
export function sampleCsv() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // [campaign, ad set, ad, impressions, reach ratio (impr/reach), link CTR, CPM, click-to-purchase rate, AOV]
  const ads = [
    ["Prospecting - US", "Broad 25-54", "UGC unboxing v1", 90000, 1.3, 0.021, 11, 0.045, 64],
    ["Prospecting - US", "Broad 25-54", "UGC unboxing v2", 70000, 1.4, 0.019, 11.5, 0.04, 64],
    ["Prospecting - US", "Broad 25-54", "Static - bestseller", 52000, 1.6, 0.011, 10, 0.02, 64],
    ["Prospecting - US", "Interest - fitness", "Carousel - 5 products", 61000, 1.5, 0.014, 12, 0.028, 64],
    ["Prospecting - US", "Interest - fitness", "Founder story video", 38000, 1.4, 0.017, 13, 0.035, 64],
    ["Prospecting - US", "Lookalike 1%", "Static - 20% off", 30000, 1.7, 0.009, 14, 0.012, 64],
    ["Retargeting - 30d", "Site visitors", "Testimonial reel", 26000, 4.6, 0.006, 24, 0.03, 64],
    ["Retargeting - 30d", "Site visitors", "Static - bestseller", 24000, 5.2, 0.004, 22, 0.02, 64],
    ["Retargeting - 30d", "Cart abandoners", "Discount reminder", 9000, 6.4, 0.005, 30, 0.05, 64],
    ["Retargeting - 30d", "Cart abandoners", "Old holiday promo", 7000, 7.1, 0.002, 26, 0, 64],
    ["Testing", "Angle test", "Meme format", 4200, 1.2, 0.006, 9, 0, 64],
    ["Testing", "Angle test", "Long-form review", 6300, 1.3, 0.012, 10, 0, 64],
    ["Testing", "Angle test", "Comparison chart", 1500, 1.1, 0.01, 10, 0, 64],
  ];
  const head = "Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Delivery,Amount spent (USD),Impressions,Reach,Frequency,Link clicks,CTR (link click-through rate),Purchases,Purchase ROAS (return on ad spend),Purchases conversion value";
  const out = [];
  for (const [camp, set, ad, impr0, fr, ctr, cpm, cvr, aov] of ads) {
    const impr = Math.round(impr0 * (0.9 + rnd() * 0.2));
    const clicks = Math.round(impr * ctr * (0.9 + rnd() * 0.2));
    let p = 0;
    for (let k = 0; k < clicks; k++) if (rnd() < cvr) p++;
    const spend = impr / 1000 * cpm * (0.9 + rnd() * 0.2);
    const val = p * aov;
    out.push(`2026-09-01,2026-09-28,${camp},${set},${ad},active,${spend.toFixed(2)},${impr},${Math.round(impr / fr)},${fr.toFixed(2)},${clicks},${(clicks / impr * 100).toFixed(2)}%,${p || ""},${p ? (val / spend).toFixed(2) : ""},${p ? val.toFixed(2) : ""}`);
  }
  return [head, ...out].join("\n");
}
