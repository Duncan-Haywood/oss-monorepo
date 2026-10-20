// Wasted-spend analysis from a Google Ads "Search terms" report export (or any
// CSV with a search term, a cost, clicks and conversions). Pure functions, no
// DOM, no network.

const ALIASES = {
  term: ["search term", "search terms", "customer search term", "search query", "query"],
  cost: ["cost", "spend", "amount spent", "total cost"],
  clicks: ["clicks", "click"],
  impr: ["impr.", "impressions", "impr"],
  conv: ["conversions", "conv.", "all conv.", "all conversions"],
  value: ["conv. value", "conversion value", "all conv. value", "total conv. value"],
  match: ["match type", "search term match type", "keyword match type"],
  campaign: ["campaign"],
  adGroup: ["ad group"],
  status: ["added/excluded", "added / excluded", "status"],
  currency: ["currency code", "currency"],
};

// Words that are never worth blocking on their own.
const STOP = new Set("a an and are as at be by for from how i in is it my of on or the to with near me your you what do does can vs".split(" "));

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

export function matchKind(raw) {
  const s = String(raw ?? "").toLowerCase();
  if (!s.trim()) return "unknown";
  if (s.includes("exact")) return "exact";
  if (s.includes("phrase")) return "phrase";
  if (s.includes("broad")) return "broad";
  return "other";
}

export function tokens(term) {
  return [...new Set(String(term).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [])];
}

// Google puts a title and a date range above the header, and "Total: ..."
// rows below the data. Returns { rows, skipped, totalsRows, ignored, currency,
// columns, error } where each row is { line, term, cost, clicks, impr, conv,
// value, match, campaign, adGroup, excluded }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { rows: [], skipped: [], totalsRows: 0, ignored: 0, currency: "", columns: {} };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i]);
    if (c.term !== undefined && c.cost !== undefined) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected columns like “Search term” and “Cost” (Google Ads: Insights and reports → Search terms → Download)." };
  const cols = findColumns(table[h]);
  const need = [["clicks", "Clicks"], ["conv", "Conversions"]];
  for (const [f, label] of need) {
    if (cols[f] === undefined) return { ...empty, columns: cols, error: `No ${label} column found. ${f === "conv" ? "Without conversions there is no way to tell wasted clicks from unmeasured ones; turn on conversion tracking and include the Conversions column." : "Include the Clicks column in the export."}` };
  }
  const rows = [], skipped = [];
  let totalsRows = 0, ignored = 0;
  const tally = {};
  for (let r = h + 1; r < table.length; r++) {
    const line = table[r];
    const get = (f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
    const term = get("term");
    if (!term) { ignored++; continue; }
    if (/^total\b.*:/i.test(term)) { totalsRows++; continue; }
    const cost = parseNumber(get("cost"), decimalComma);
    const clicks = parseNumber(get("clicks"), decimalComma);
    const conv = parseNumber(get("conv"), decimalComma);
    if (!Number.isFinite(cost) || cost < 0) { skipped.push({ line: r + 1, reason: "unreadable cost" }); continue; }
    if (!Number.isFinite(clicks) || clicks < 0) { skipped.push({ line: r + 1, reason: "unreadable clicks" }); continue; }
    if (!Number.isFinite(conv) || conv < 0) { skipped.push({ line: r + 1, reason: "unreadable conversions" }); continue; }
    const value = cols.value === undefined ? 0 : parseNumber(get("value"), decimalComma);
    const impr = cols.impr === undefined ? 0 : parseNumber(get("impr"), decimalComma);
    const cur = get("currency").toUpperCase();
    if (cur) tally[cur] = (tally[cur] || 0) + 1;
    rows.push({
      line: r + 1, term: term.toLowerCase().replace(/\s+/g, " "), cost, clicks, impr: Number.isFinite(impr) ? impr : 0, conv,
      value: Number.isFinite(value) ? value : 0, match: matchKind(get("match")), campaign: get("campaign"), adGroup: get("adGroup"),
      excluded: /exclud/i.test(get("status")),
    });
  }
  const currency = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return { rows, skipped, totalsRows, ignored, currency, columns: cols, error: rows.length ? null : "No usable search-term rows were found." };
}

// Clicks with zero conversions needed before a term counts as proven waste:
// the fewest clicks n for which a term converting at the account's own rate p
// would have shown no conversion less than (1 - confidence) of the time,
// (1 - p)^n < 1 - confidence.
export function clicksNeeded(convRate, confidence = 0.95) {
  const p = Math.min(0.99, Math.max(0, convRate));
  if (p <= 0) return Infinity;
  return Math.max(3, Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
}

function sum(list, f) { return list.reduce((t, x) => t + f(x), 0); }

function aggregate(rows) {
  const m = new Map();
  for (const r of rows) {
    let t = m.get(r.term);
    if (!t) { t = { term: r.term, cost: 0, clicks: 0, impr: 0, conv: 0, value: 0, matches: new Set(), rows: 0, allExcluded: true }; m.set(r.term, t); }
    t.cost += r.cost; t.clicks += r.clicks; t.impr += r.impr; t.conv += r.conv; t.value += r.value; t.rows++;
    t.matches.add(r.match);
    if (!r.excluded) t.allExcluded = false;
  }
  return [...m.values()];
}

function groupRows(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = key(r) || "(none)"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.entries()].map(([k, list]) => {
    const cost = sum(list, (r) => r.cost), conv = sum(list, (r) => r.conv);
    const zeroCost = sum(list.filter((r) => r.conv <= 0), (r) => r.cost);
    return { key: k, rows: list.length, cost, clicks: sum(list, (r) => r.clicks), conv, zeroCost, wasteShare: cost ? zeroCost / cost : 0, cpa: conv ? cost / conv : null };
  }).sort((a, b) => b.zeroCost - a.zeroCost);
}

export function analyze(rows, { targetCpa = null, minClicks = null, confidence = 0.95, coreWords = [] } = {}) {
  if (!rows.length) return { invalid: "No search terms to analyze." };
  const cost = sum(rows, (r) => r.cost), clicks = sum(rows, (r) => r.clicks), conv = sum(rows, (r) => r.conv);
  if (cost <= 0) return { invalid: "The file records no spend, so there is nothing to waste." };
  if (conv <= 0) return { invalid: "This file records no conversions at all, so there is no way to tell wasted clicks from unmeasured ones. Check that conversion tracking is on and that the export includes the Conversions column." };
  const convRate = clicks ? conv / clicks : 0;
  const needed = minClicks && minClicks > 0 ? minClicks : clicksNeeded(convRate, confidence);
  const cpaRef = targetCpa && targetCpa > 0 ? targetCpa : cost / conv;
  const terms = aggregate(rows);
  const live = terms.filter((t) => !t.allExcluded);
  const excludedTerms = terms.filter((t) => t.allExcluded);
  const zero = live.filter((t) => t.conv <= 0 && t.cost > 0);
  const tierOf = (t) => (t.clicks >= needed ? "proven" : t.cost >= cpaRef ? "overspent" : "watch");
  for (const t of zero) t.tier = tierOf(t);
  const tier = (k) => zero.filter((t) => t.tier === k);
  const convertingCost = sum(live.filter((t) => t.conv > 0), (t) => t.cost);
  const buckets = {
    converting: convertingCost,
    proven: sum(tier("proven"), (t) => t.cost),
    overspent: sum(tier("overspent"), (t) => t.cost),
    watch: sum(tier("watch"), (t) => t.cost),
    excluded: sum(excludedTerms, (t) => t.cost),
  };
  const zeroCost = buckets.proven + buckets.overspent + buckets.watch;

  // Word-level negatives. A word is a candidate only if it appears in no
  // converting term anywhere in the file, in at least two terms (one term is
  // better blocked as itself), and is not the account's core vocabulary.
  const core = new Set(coreWords.map((w) => w.toLowerCase().trim()).filter(Boolean));
  const words = new Map();
  for (const t of terms) {
    for (const w of tokens(t.term)) {
      let s = words.get(w);
      if (!s) { s = { word: w, cost: 0, clicks: 0, conv: 0, terms: [], zeroCost: 0 }; words.set(w, s); }
      s.cost += t.cost; s.clicks += t.clicks; s.conv += t.conv; s.terms.push(t);
      if (t.conv <= 0 && !t.allExcluded) s.zeroCost += t.cost;
    }
  }
  const wordCandidates = [...words.values()]
    .filter((s) => s.conv <= 0 && s.terms.length >= 2 && s.word.length >= 3 && !STOP.has(s.word) && !core.has(s.word) && !/^\d+$/.test(s.word)
      && s.clicks / clicks < 0.25 && s.zeroCost > 0 && (s.clicks >= needed || s.zeroCost >= cpaRef) && s.terms.some((t) => !t.allExcluded))
    .sort((a, b) => b.zeroCost - a.zeroCost)
    .slice(0, 25)
    .map((s) => ({ word: s.word, cost: s.zeroCost, clicks: s.clicks, terms: s.terms.length, examples: [...s.terms].sort((a, b) => b.cost - a.cost).slice(0, 3).map((t) => t.term) }));
  const negWords = new Set(wordCandidates.map((c) => c.word));
  const hitByWord = (t) => tokens(t.term).some((w) => negWords.has(w));
  const exactNegatives = [...tier("proven"), ...tier("overspent")].filter((t) => !hitByWord(t)).sort((a, b) => b.cost - a.cost).slice(0, 25)
    .map((t) => ({ term: t.term, cost: t.cost, clicks: t.clicks, tier: t.tier }));
  const negatives = [
    ...wordCandidates.map((c) => ({ text: c.word, type: "broad", cost: c.cost, reason: `appears in ${c.terms} terms, none converted` })),
    ...exactNegatives.map((c) => ({ text: `[${c.term}]`, type: "exact", cost: c.cost, reason: c.tier === "proven" ? `${c.clicks} clicks, no conversion` : "spent more than one conversion is worth, no conversion" })),
  ];
  const exactSet = new Set(exactNegatives.map((e) => e.term));
  const covered = sum(zero.filter((t) => hitByWord(t) || exactSet.has(t.term)), (t) => t.cost);

  const promote = live.filter((t) => t.conv >= 2 && !t.matches.has("exact") && !(t.matches.size === 1 && t.matches.has("unknown")))
    .sort((a, b) => b.conv - a.conv || a.cost - b.cost).slice(0, 15)
    .map((t) => ({ term: t.term, conv: t.conv, cost: t.cost, cpa: t.cost / t.conv, matches: [...t.matches].join("/") }));
  const expensive = targetCpa ? live.filter((t) => t.conv > 0 && t.cost / t.conv > 2 * targetCpa).sort((a, b) => (b.cost - b.conv * targetCpa) - (a.cost - a.conv * targetCpa))
    .map((t) => ({ term: t.term, conv: t.conv, cost: t.cost, cpa: t.cost / t.conv, excess: t.cost - t.conv * targetCpa })) : [];

  const byMatch = groupRows(rows, (r) => r.match);
  const hasMatch = rows.some((r) => r.match !== "unknown");
  const byCampaign = rows.some((r) => r.campaign) ? groupRows(rows, (r) => r.campaign) : [];
  const topWaste = [...zero].sort((a, b) => b.cost - a.cost).slice(0, 10).map((t) => ({ term: t.term, cost: t.cost, clicks: t.clicks, tier: t.tier }));
  const summary = { cost, clicks, conv, value: sum(rows, (r) => r.value), convRate, cpa: cost / conv, terms: terms.length, needed, cpaRef, targetCpa: targetCpa || null, zeroCost, wasteShare: zeroCost / cost, buckets, covered, coveredShare: zeroCost ? covered / zeroCost : 0, excludedTerms: excludedTerms.length };

  const findings = [];
  const pc = (v) => `${Math.round(v * 100)}%`;
  const m2 = (v) => v.toFixed(2);
  findings.push({ severity: summary.wasteShare > 0.3 ? "high" : summary.wasteShare > 0.15 ? "medium" : "info", title: `${pc(summary.wasteShare)} of spend went to search terms that never converted`, detail: `${m2(zeroCost)} of ${m2(cost)}. Of that, ${m2(buckets.proven)} is proven waste (${needed}+ clicks and nothing, which at your ${(convRate * 100).toFixed(1)}% conversion rate would happen by chance less than ${Math.round((1 - confidence) * 100)}% of the time), ${m2(buckets.overspent)} spent more than ${m2(cpaRef)} (${targetCpa ? "your target" : "your average"} cost per conversion) with none, and ${m2(buckets.watch)} is too little data to judge.` });
  if (wordCandidates.length) findings.push({ severity: "high", title: `${wordCandidates.length} word(s) are safe-looking negative keywords worth ${m2(sum(wordCandidates, (c) => c.cost))}`, detail: `Each appears in at least two search terms and in no term that converted. The top three: ${wordCandidates.slice(0, 3).map((c) => `“${c.word}”`).join(", ")}. Add them as negatives at campaign level, and add plurals and spelling variants yourself, since negative keywords do not match close variants.` });
  if (negatives.length) findings.push({ severity: "info", title: `The negative list below covers ${pc(summary.coveredShare)} of the zero-conversion spend`, detail: "That is the spend on the file's own search terms. It does not predict future queries, and a negative keyword can block a query that would have converted next month." });
  if (hasMatch) {
    const worst = byMatch.filter((g) => g.key !== "unknown").sort((a, b) => b.zeroCost - a.zeroCost)[0];
    if (worst && zeroCost && worst.zeroCost / zeroCost >= 0.5 && byMatch.filter((g) => g.key !== "unknown").length > 1) findings.push({ severity: "medium", title: `${pc(worst.zeroCost / zeroCost)} of zero-conversion spend came through ${worst.key} match`, detail: `${worst.key} match rows spent ${m2(worst.cost)} and ${pc(worst.wasteShare)} of it converted nothing. Tighter match types or more negatives are the usual fix.` });
  }
  if (promote.length) findings.push({ severity: "medium", title: `${promote.length} converting search term(s) are not yet exact-match keywords`, detail: `The best: ${promote.slice(0, 3).map((p) => `“${p.term}” (${p.conv} conv at ${m2(p.cpa)} each)`).join("; ")}. Adding them as exact-match keywords gives you control of their bids and copy.` });
  if (expensive.length) findings.push({ severity: "medium", title: `${expensive.length} term(s) convert at more than twice your target cost`, detail: `Together they spent ${m2(sum(expensive, (e) => e.excess))} over what your target allows. Bid down or move them to a lower-intent campaign rather than blocking them.` });
  if (convRate > 0.4) findings.push({ severity: "info", title: `Conversion rate of ${(convRate * 100).toFixed(1)}% is unusually high`, detail: "That often means a soft conversion action (page view, click-to-call button) is being counted. Waste is measured against whatever you count, so check that Conversions means something you would pay for." });
  if (clicks < 200) findings.push({ severity: "info", title: "This is a small sample", detail: `${clicks} clicks is thin evidence for any single term; treat the tiers as leads, not verdicts, and export a longer date range.` });
  if (excludedTerms.length) findings.push({ severity: "info", title: `${excludedTerms.length} term(s) are already excluded`, detail: `They spent ${m2(buckets.excluded)} in this period before being blocked. They are left out of every suggestion.` });
  return { summary, buckets, wordCandidates, exactNegatives, negatives, promote, expensive, byMatch: hasMatch ? byMatch : [], byCampaign, topWaste, findings };
}

export function negativesList(result) {
  return result.negatives.map((n) => n.text).join("\n");
}

export function money(v) { return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v) { return v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`; }

// Deterministic synthetic data in Google Ads' own export layout (title, date
// range, header, Total row) so the example, the tests and the docs agree.
export function sampleCsv() {
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // [term, monthly impressions, ctr, cpc, conversion rate]
  const terms = [
    ["emergency plumber near me", 900, 0.14, 4.2, 0.16], ["24 hour plumber", 700, 0.12, 3.9, 0.15], ["plumber near me", 2600, 0.07, 3.1, 0.09],
    ["water heater repair", 800, 0.09, 3.4, 0.11], ["burst pipe repair", 300, 0.11, 4.4, 0.18], ["clogged drain plumber", 500, 0.1, 3.6, 0.13],
    ["leaking toilet repair", 400, 0.08, 3.0, 0.1], ["plumbing services austin", 600, 0.08, 3.3, 0.09],
    ["plumber salary", 1500, 0.05, 1.6, 0], ["plumbing jobs near me", 1800, 0.06, 1.4, 0], ["how to become a plumber", 1200, 0.05, 1.2, 0],
    ["plumbing school", 700, 0.05, 1.5, 0], ["diy fix leaky faucet", 1600, 0.04, 1.1, 0], ["free plumber", 600, 0.06, 2.0, 0],
    ["plumbing supply store", 900, 0.05, 1.7, 0], ["plumber apprenticeship", 500, 0.05, 1.3, 0], ["cheap plumbing parts", 400, 0.05, 1.6, 0],
    ["plumbing course online", 500, 0.04, 1.4, 0], ["toilet repair diy video", 700, 0.04, 1.0, 0], ["pex pipe fittings", 400, 0.05, 1.8, 0],
    ["plumber union", 300, 0.04, 1.4, 0], ["plumbing jobs hiring", 900, 0.05, 1.3, 0], ["how much does a plumber make", 1000, 0.05, 1.3, 0],
  ];
  const kinds = [["Broad match", 0.55], ["Phrase match", 0.3], ["Exact match", 0.15]];
  const money2 = (v) => v.toFixed(2);
  const out = [];
  let tot = { clicks: 0, impr: 0, cost: 0, conv: 0 };
  for (const [n, [term, impr, ctr, cpc, rate]] of terms.entries()) {
    const isGood = rate > 0;
    for (const [kind, share] of kinds) {
      if (kind === "Exact match" && (!isGood || n >= 4)) continue; // later winners are still only reached via broad/phrase
      const i = Math.round(impr * share * (0.7 + rnd() * 0.6));
      const c = Math.max(1, Math.round(i * ctr * (0.8 + rnd() * 0.4)));
      let conv = 0;
      for (let k = 0; k < c; k++) if (rnd() < rate) conv++;
      const cost = c * cpc * (0.85 + rnd() * 0.3);
      tot = { clicks: tot.clicks + c, impr: tot.impr + i, cost: tot.cost + cost, conv: tot.conv + conv };
      out.push(`${term},${kind},None,Plumbing – Search,Emergency,USD,${c},${i},${(c / i * 100).toFixed(2)}%,${money2(cost / c)},${money2(cost)},${(conv / c * 100).toFixed(2)}%,${conv}.00,${conv ? money2(cost / conv) : " --"},${money2(conv * 240)}`);
    }
  }
  return ["Search terms report", '"September 1, 2026 - September 28, 2026"',
    "Search term,Match type,Added/Excluded,Campaign,Ad group,Currency code,Clicks,Impr.,CTR,Avg. CPC,Cost,Conv. rate,Conversions,Cost / conv.,Conv. value",
    ...out,
    `Total: Search terms, , , , , ,${tot.clicks},${tot.impr},,,${money2(tot.cost)},,${tot.conv}.00, --,${money2(tot.conv * 240)}`].join("\n");
}
