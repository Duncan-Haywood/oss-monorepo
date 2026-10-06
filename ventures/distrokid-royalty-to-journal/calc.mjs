// DistroKid earnings report (the "Bank" export) -> accounting journal.
//
// A musician's distributor pays out by store, long after the streams happened, and holds back songwriter royalties
// for publishing administration. A bookkeeper who books only the bank deposit understates income, puts it in the
// wrong month, and cannot tell which stores (Spotify, Apple Music, YouTube, TikTok ...) earned it. This module reads
// an earnings report CSV or TSV (a sale month or reporting date, a store, an earnings amount, optionally title,
// artist, ISRC/UPC, quantity, country, songwriter royalties withheld, currency and a per-row total), books each row
// to an income account for its kind of store (streaming, downloads, social and video), books the withheld amount as a
// separate deduction, sends stores no rule recognises to an uncategorised account (never dropped), proves the file is
// complete by checking each row's Total column and any Total row against the rows, and writes balanced journals for
// Xero, QuickBooks Online, QuickBooks Desktop (IIF) and a plain CSV, one per currency per month, against a
// DistroKid receivable account.
//
// Currency is noted, never converted: DistroKid reports in USD, but a file with a Currency column is journalled per
// currency and no exchange rate is applied or invented.
//
// When the earnings column is already net of the withheld amount, withheldMode "net" adds the withheld column back
// onto income and books it as a deduction, so income is gross and the amount owed by the distributor is unchanged.
//
// The export's column names, its store names and each importer's layout are alias-matched guesses; no real DistroKid
// export and no live Xero or QuickBooks import was available when this was written. A row no rule explains is never
// dropped, and the completeness checks say whether the rows can be trusted.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  streaming: { label: "Streaming royalties (gross)", account: "Music Streaming Income" },
  download: { label: "Download and store sales (gross)", account: "Music Download Income" },
  social: { label: "Social and video platform royalties (gross)", account: "Music Social Video Income" },
  withheld: { label: "Songwriter royalties withheld by distributor", account: "Distributor Withholdings" },
  uncategorised: { label: "Uncategorised store earnings", account: "Music Uncategorised" },
  clearing: { label: "DistroKid earnings receivable (clearing)", account: "DistroKid Receivable" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);
const INCOME = new Set(["streaming", "download", "social"]);

export const defaultMapping = () => Object.fromEntries(CATEGORY_ORDER.map((k) => [k, CATEGORIES[k].account]));

// One "key = Account name" per line; blank lines and # comments are ignored.
export function parseMapping(text) {
  const out = defaultMapping(), errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^([a-z]+)\s*[=:]\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: expected "category = account", got "${line}"`); return; }
    const key = m[1].toLowerCase();
    if (!CATEGORIES[key]) { errors.push(`Line ${i + 1}: unknown category "${m[1]}" (use ${CATEGORY_ORDER.join(", ")})`); return; }
    out[key] = m[2].trim();
  });
  return { mapping: out, errors };
}
export const mappingText = (mapping = defaultMapping()) => CATEGORY_ORDER.map((k) => `${k} = ${mapping[k]}`).join("\n");

const dollars = (c) => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);
export const money = (c, cur = "USD") => (c < 0 ? "-" : "") + Math.abs(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur;

// ---- parsing ----------------------------------------------------------------

function splitLine(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (h) => h.trim().toLowerCase().replace(/^﻿/, "").replace(/[\s_]+/g, "-").replace(/\(.*\)$/, "").replace(/-+$/, "");

// "$1,234.56", "-$12.00", "(12.00)", "USD 5" and European "1.234,56" all read to cents. Empty is null, junk is NaN.
export function parseAmount(s) {
  let t = String(s ?? "").trim().replace(/\s/g, "");
  if (t === "") return null;
  t = t.replace(/^([-+]?)(?:[A-Za-z]{3})/, "$1").replace(/[$€£]/g, "");
  const paren = t.match(/^\((.*)\)$/);
  if (paren) t = "-" + paren[1];
  let u = t;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) u = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(t)) u = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) u = t.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(u)) return NaN;
  return Math.round(parseFloat(u) * 100);
}

// A units or page count: whole numbers, thousands separators allowed. Empty or junk is 0.
const parseCount = (s) => { const n = Number(String(s ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : 0; };

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const endOfMonth = (y, m) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(+y, +m, 0)).getUTCDate()).padStart(2, "0")}`;

// Returns YYYY-MM-DD or null. Accepts ISO (with a time), "Sep 28, 2026", DD.MM.YYYY, slashed dates read per `order`,
// and month-only values ("2026-09", "September 2026"), which read as the last day of that month.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})$/))) { if (+x[2] < 1 || +x[2] > 12) return null; return endOfMonth(x[1], x[2]); }
  if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/)) && MONTHS[x[1].toLowerCase()]) return endOfMonth(x[2], MONTHS[x[1].toLowerCase()]);
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MONTHS[x[1].toLowerCase()]) [m, d, y] = [MONTHS[x[1].toLowerCase()], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/)) && MONTHS[x[2].toLowerCase()]) [d, m, y] = [x[1], MONTHS[x[2].toLowerCase()], x[3]];
  else if ((x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Store names, matched loosely. Download stores are tested first (an "Amazon MP3" is a sale, "Amazon Music" is a stream),
// then social and video platforms, then streaming services. A store no rule knows is reviewed, not guessed.
export function rowCategory(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return "uncategorised";
  if (/itunes|mp3|download|beatport|traxsource|7digital|juno|bandcamp|google play|amazon digital/.test(t)) return "download";
  if (/tiktok|instagram|facebook|snap|youtube content|content id|youtube shorts|reels|capcut|resso|triller|meta\b/.test(t)) return "social";
  if (/spotify|apple music|amazon (prime|music|unlimited)|tidal|deezer|youtube( music)?\b|pandora|napster|iheart|soundcloud|anghami|boomplay|jiosaavn|saavn|audiomack|qobuz|netease|tencent|kkbox|yandex|vk music|zvuk|melon|flo\b|line music|awa\b|joox|claro|slacker|tunein|shazam|medianet|streaming|amazon/.test(t)) return "streaming";
  return "uncategorised";
}

const totalRowLabel = (cells) => { const f = cells.find((c) => c.trim()); return f ? /^(grand\s+)?totals?\b/i.test(f.trim()) : false; };

// Rows are grouped by currency (never converted). opts.withheldMode: "separate" (default: the earnings column is before
// the withheld amount) or "net" (the earnings column is already after it, so income is grossed up by the withheld
// column). opts.currency is the currency to assume when the file has no Currency column (USD). opts.expected, when
// given, is the total you were paid (cents) for a single-currency file.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a DistroKid earnings report CSV or TSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    date: col("sale-month", "reporting-date", "date", "month", "sales-month", "reporting-month", "period", "payment-date", "transaction-date"),
    title: col("title", "song-title", "track", "song", "release", "album"),
    id: col("isrc", "upc", "isrc/upc", "id"),
    market: col("store", "store-name", "platform", "service", "dsp", "retailer", "channel"),
    units: col("quantity", "units", "streams", "plays", "units-sold"),
    royalty: col("earnings", "earnings-usd", "royalty", "royalties", "amount", "revenue", "payout", "gross-earnings"),
    withheld: col("songwriter-royalties-withheld", "royalties-withheld", "songwriter-royalties", "withheld", "withholding", "songwriter-withheld"),
    currency: col("currency", "earnings-currency", "payment-currency"),
    net: col("total", "net", "net-amount", "net-earnings", "net-payment", "payment", "payment-amount", "net-total"),
  };
  const missing = [];
  if (I.date < 0) missing.push("date (Sale Month, Reporting Date or Date)");
  if (I.market < 0) missing.push("store (Store)");
  if (I.royalty < 0 && I.net < 0) missing.push("earnings amount (Earnings)");
  if (missing.length) {
    add("error", "This does not look like a DistroKid earnings report", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In DistroKid open Bank, then Download your earnings report as a spreadsheet, then paste the whole file here. Column names are alias-matched and not verified against a real export, so a differently named column may need renaming.`, first + 1);
    return none;
  }
  const useNetAsRoyalty = I.royalty < 0;
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const rows = [];
  let total = null;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const rid = get(cells, "title") || get(cells, "id") || `line ${i + 1}`;
    if (totalRowLabel(cells)) {
      const num = (k) => (I[k] >= 0 ? parseAmount(get(cells, k)) : null);
      total = { line: i + 1, royalty: num("royalty"), withheld: num("withheld"), net: num("net") };
      continue;
    }
    const royaltyRaw = parseAmount(get(cells, useNetAsRoyalty ? "net" : "royalty"));
    const heldRaw = parseAmount(get(cells, "withheld"));
    const netRaw = useNetAsRoyalty ? null : parseAmount(get(cells, "net"));
    if ([royaltyRaw, heldRaw, netRaw].some((v) => Number.isNaN(v))) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so the totals will not add up.", i + 1); continue; }
    if (royaltyRaw === null && heldRaw === null) { add("warning", "Row has no amount", `${rid} was skipped.`, i + 1); continue; }
    const royalty = royaltyRaw ?? 0, held = Math.abs(heldRaw ?? 0);
    const store = get(cells, "market");
    const key = rowCategory(store);
    const created = parseDate(get(cells, "date"), opts.dateOrder);
    if (!created) add("warning", `Row ${rid} has no readable date`, `"${get(cells, "date")}" was not understood; the row is placed in the final month.`, i + 1);
    const cur = get(cells, "currency").toUpperCase();
    const market = store || "Unspecified store";
    const inc = opts.withheldMode === "net" ? royalty + held : royalty;
    const parts = [{ k: key, amt: inc }];
    if (held) parts.push({ k: "withheld", amt: -held });
    const gross = INCOME.has(key) ? inc : 0;
    const net = parts.reduce((a, p) => a + p.amt, 0);
    const units = parseCount(get(cells, "units"));
    if (netRaw !== null && netRaw !== net) add("error", `Total on ${rid} does not match its own columns`, `The row's Total column says ${money(netRaw, cur || "USD")} but its earnings${opts.withheldMode === "net" ? "" : " less songwriter royalties withheld"} come to ${money(net, cur || "USD")} (off by ${money(netRaw - net, cur || "USD")}). A figure was edited or a column is missing from the paste.`, i + 1);
    rows.push({ line: i + 1, id: rid, item: get(cells, "title") || store, type: store, market, units, gross, net, netStated: netRaw, royalty, held, parts, created, currency: cur });
  }
  if (!rows.length) { add("error", "No earnings rows found", "The header was read but there were no data rows."); return none; }

  const fallback = String(opts.currency || "USD").toUpperCase();
  const haveCurrencyColumn = I.currency >= 0 && rows.some((r) => r.currency);
  if (!haveCurrencyColumn) add("warning", "No currency in the file", `The report has no Currency column, so every row is journalled as ${fallback} (the setting on this page). No exchange rate is applied; set the currency to what the report was paid in.`, 0);
  const by = new Map();
  for (const r of rows) {
    const c = r.currency || fallback;
    if (!by.has(c)) by.set(c, []);
    by.get(c).push(r);
  }
  if (by.size > 1) add("info", `${by.size} currencies in the file`, `${[...by.keys()].join(", ")}. Each currency is journalled separately in its own currency; no conversion is made, so convert in your accounting software if you need a base-currency figure.`, 0);

  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const single = by.size === 1;
  let stated = null;
  if (total) {
    if (!single) add("info", "A Total row was found in a multi-currency file", "A single total cannot be compared with rows in several currencies, so it was not checked. The per-row Total column, if present, was.", total.line);
    else {
      const cur = [...by.keys()][0];
      const cmp = (label, got, want) => { if (got !== null && !Number.isNaN(got) && got !== want) add("error", `Rows add up to ${money(want, cur)} but the Total row says ${money(got, cur)} (${label})`, `Off by ${money(got - want, cur)}. Rows are missing from the paste, or an amount was skipped or edited. Do not post these journals until the figures agree.`, total.line); };
      cmp("royalty", total.royalty, sum((r) => r.royalty));
      cmp("songwriter royalties withheld", total.withheld === null ? null : Math.abs(total.withheld), sum((r) => r.held));
      stated = total.net !== null && !Number.isNaN(total.net) ? total.net : null;
      if (stated === null && total.royalty !== null && !Number.isNaN(total.royalty)) stated = total.royalty - (opts.withheldMode === "net" ? 0 : Math.abs(total.withheld ?? 0));
    }
  }
  const perRow = rows.every((r) => r.netStated !== null);
  if (stated === null && perRow) stated = sum((r) => r.netStated);
  if (!total && !perRow) add("warning", "No Total column or Total row, so completeness cannot be proved", "Without a per-row Total column or a Total row the page cannot tell if a row is missing. Download the full royalty report including its total and paste that.", 0);
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    if (!single) add("info", "The amount you entered was not checked", "It is compared only for a single-currency file.", 0);
    else if (opts.expected !== sum((r) => r.net)) add("warning", "The rows do not add up to the amount you entered", `The rows total ${money(sum((r) => r.net), [...by.keys()][0])} but you entered ${money(opts.expected, [...by.keys()][0])}. The report may stop before the payment period ends, or rows are missing.`, 0);
  }

  const payouts = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cur, rs]) => {
    const effective = rs.map((r) => r.created).filter(Boolean).sort().pop() || null;
    return { id: `DK-${cur}`, effective, stated: single ? stated : (perRow ? rs.reduce((a, r) => a + r.netStated, 0) : null), opening: null, currency: cur, rows: rs };
  });
  return { payouts, findings, summary: { rows: rows.length, payouts: payouts.length } };
}

// Gross by store and kind, with what the distributor held back: the figures a bookkeeper wants per store.
export function royaltySummary(payouts) {
  const byMarket = new Map();
  const tot = { gross: 0, withheld: 0, other: 0, net: 0 };
  for (const s of payouts) for (const r of s.rows) for (const p of r.parts) {
    const key = `${s.currency}|${r.market}|${p.k}`;
    const e = byMarket.get(key) || { currency: s.currency, market: r.market, category: p.k, amount: 0, units: 0 };
    e.amount += p.amt;
    if (INCOME.has(p.k) && p === r.parts[0]) e.units += r.units;
    byMarket.set(key, e);
    if (INCOME.has(p.k)) tot.gross += p.amt;
    else if (p.k === "withheld") tot.withheld -= p.amt;
    else tot.other += p.amt;
    tot.net += p.amt;
  }
  return { rows: [...byMarket.values()].sort((a, b) => a.currency.localeCompare(b.currency) || a.market.localeCompare(b.market) || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)), ...tot, withheldShare: tot.gross > 0 ? tot.withheld / tot.gross : null };
}

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// split: "month" (default) writes one journal per calendar month a currency group touches.
export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const split = opts.split || "month";
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = s.rows.reduce((a, r) => a + r.net, 0);
    const cur = s.currency || "USD";
    const endDate = s.effective || [...s.rows].map((r) => r.created).filter(Boolean).sort().pop() || null;
    if (s.stated === null) findings.push({ severity: "warning", title: `The ${cur} royalties could not be checked`, detail: `The rows add up to ${money(sum, cur)}. Without a Total column or Total row the page cannot prove nothing is missing.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Rows add up to ${money(sum, cur)} but the report's total is ${money(s.stated, cur)}`, detail: `Off by ${money(s.stated - sum, cur)} (${cur}). Rows are missing from the paste, or an amount was skipped or edited. Do not post these journals until the figures agree.`, line: 0 });

    const periods = new Map();
    let undated = 0;
    for (const r of s.rows) {
      let ym = r.created ? r.created.slice(0, 7) : (endDate || "").slice(0, 7);
      if (!r.created) undated++;
      if (split === "none") ym = (endDate || ym || "").slice(0, 7);
      if (!ym) ym = "undated";
      if (!periods.has(ym)) periods.set(ym, new Map());
      const m = periods.get(ym);
      for (const p of r.parts) {
        if (!p.amt) continue;
        const key = `${p.k}\u0000${r.market}`;
        const e = m.get(key) || { k: p.k, market: r.market, net: 0, count: 0 };
        e.net += p.amt; e.count++; m.set(key, e);
      }
    }
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} had no readable date`, detail: "They were placed in the final month.", line: 0 });
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `The ${cur} rows span ${keys.length} months`, detail: `Written as ${keys.length} ${cur} journals (${keys.join(", ")}), each balanced to the DistroKid receivable account, so every month's royalties and costs land in the month they were reported.`, line: 0 });
    keys.forEach((ym, idx) => {
      const m = periods.get(ym), last = idx === keys.length - 1;
      const date = ym === "undated" ? (endDate || "") : last && endDate && endDate.slice(0, 7) === ym ? endDate : lastDay(ym);
      const lines = [];
      for (const k of CATEGORY_ORDER) {
        if (k === "clearing") continue;
        for (const e of [...m.values()].filter((x) => x.k === k).sort((a, b) => a.market.localeCompare(b.market))) {
          if (e.net === 0) continue;
          const where = ` - ${e.market}`;
          lines.push({ category: k, account: mapping[k], debit: e.net < 0 ? -e.net : 0, credit: e.net > 0 ? e.net : 0, memo: `${CATEGORIES[k].label}${where} (${e.count} row${e.count === 1 ? "" : "s"})`, market: e.market });
        }
      }
      const net = lines.reduce((a, l) => a + l.credit - l.debit, 0);
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Earnings owed by DistroKid (${ym}, ${cur})`, market: "" });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `DistroKid earnings ${ym} (${cur})`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised"));
    if (unknown.length) findings.push({ severity: "warning", title: `${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.type || r.item || r.id))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the total. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised")).map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const js = journals.filter((j) => j.payoutId === s.id);
    const sum = js.reduce((a, j) => a + j.clearing, 0);
    return { id: s.id, deposit: s.effective, currency: s.currency || "USD", stated: s.stated, journalled: sum, periods: js.map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.stated === null ? null : s.stated === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parsePayouts(text, opts);
  const b = buildJournals(p.payouts, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { payouts: p.payouts, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), summaryByMarket: royaltySummary(p.payouts), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const journalsOf = (journals, id) => journals.filter((j) => j.payoutId === id).length;
const docNo = (journals, j) => `${j.payoutId}${j.period && j.period !== "undated" && journalsOf(journals, j.payoutId) > 1 ? "-" + j.period : ""}`;

// Xero manual journal import: debits positive, credits negative. Xero's file has no currency column: the currency is in the narration.
export function toXeroJournalCsv(journals, o = {}) {
  const tax = o.taxRate || "Tax Exempt";
  const rows = [csvRow(["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.narration, fmtDate(j.date, o.dateOrder || "dmy"), l.memo, l.account, tax, dollars(l.debit - l.credit)]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Online journal entry import.
export function toQboJournalCsv(journals, o = {}) {
  const rows = [csvRow(["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description", "Name", "Currency"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([docNo(journals, j), fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(docNo(journals, j));
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)} [${j.currency}]`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["group", "period", "date", "currency", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.payoutId, j.period, j.date, j.currency, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
  return rows.join("\r\n") + "\r\n";
}

export function findingsCsv(result) {
  return [csvRow(["severity", "line", "title", "detail"]), ...result.findings.map((f) => csvRow([f.severity, f.line || "", f.title, f.detail]))].join("\r\n") + "\r\n";
}

export function decodeBuffer(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u);
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u);
  return new TextDecoder("utf-8").decode(u);
}

// ---- samples -----------------------------------------------------------------

const HEAD = ["Sale Month", "Store", "Artist", "Title", "ISRC", "Quantity", "Earnings (USD)", "Songwriter Royalties Withheld", "Currency", "Total"];

// items: [month, store, title, isrc, quantity, earnings, withheld, currency]. Each row's Total is earnings - withheld.
// `skip` drops rows from the output as a hand-edited paste would; `mangleTotal` replaces a row's Total text; `mangle`
// replaces a row's Earnings text; `totalRow` appends a Total row (one currency only).
export function buildReport({ items, skip = [], mangle = {}, mangleTotal = {}, totalRow = false, totalOverride = {} }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const f = (c) => (c / 100).toFixed(2);
  const rows = items.map(([month, store, title, isrc, qty, earn, held, cur], n) => {
    const r = Math.round(earn * 100), h = Math.round(held * 100);
    return [month, store, "Harbor Static", title, isrc, qty, mangle[n] ?? f(r), h ? f(h) : "", cur, mangleTotal[n] ?? f(r - h)].map(csv).join(",");
  });
  const kept = rows.filter((_, n) => !skip.includes(n));
  const out = [HEAD.join(","), ...kept];
  if (totalRow) {
    const r = items.reduce((a, x) => a + Math.round(x[5] * 100), 0), h = items.reduce((a, x) => a + Math.round(x[6] * 100), 0);
    out.push(["Total", "", "", "", "", items.reduce((a, x) => a + x[4], 0), f(totalOverride.royalty ?? r), f(totalOverride.withheld ?? h), "", totalOverride.net ?? f(r - h)].join(","));
  }
  return out.join("\n") + "\n";
}

// A made-up band: invented titles, ISRCs and amounts.
const SAMPLE_ITEMS = [
  ["2026-08", "Spotify", "Night Bus Home", "USXX00000001", 9400, 31.20, 0, "USD"],
  ["2026-08", "Apple Music", "Night Bus Home", "USXX00000001", 2100, 14.70, 0, "USD"],
  ["2026-08", "YouTube Music", "Night Bus Home", "USXX00000001", 1800, 4.10, 0, "USD"],
  ["2026-08", "iTunes", "Night Bus Home", "USXX00000001", 6, 5.40, 0, "USD"],
  ["2026-08", "TikTok", "Night Bus Home", "USXX00000001", 52000, 12.80, 0, "USD"],
  ["2026-09", "Spotify", "Night Bus Home", "USXX00000001", 8800, 29.40, 1.20, "USD"],
  ["2026-09", "Spotify", "Salt Flats", "USXX00000002", 3100, 10.30, 0, "USD"],
  ["2026-09", "Amazon Music", "Salt Flats", "USXX00000002", 900, 5.55, 0, "USD"],
  ["2026-09", "TikTok", "Salt Flats", "USXX00000002", 18000, 4.20, 0, "USD"],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same report after a hand edit: one row's Total altered, one earnings figure that is not a number, and a store no rule knows.
export function sampleBrokenReport() {
  const items = [...SAMPLE_ITEMS, ["2026-09", "Zorbo Radio", "Salt Flats", "USXX00000002", 40, 0.90, 0, "USD"], ["2026-09", "Spotify", "Salt Flats", "USXX00000002", 100, 0.80, 0, "USD"]];
  return buildReport({ items, mangleTotal: { 1: "100.00" }, mangle: { 10: "8..0" } });
}
