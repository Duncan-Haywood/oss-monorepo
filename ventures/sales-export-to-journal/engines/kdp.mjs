// Amazon KDP royalty report / payments export -> accounting journal.
//
// An author's KDP royalties arrive as one payment per marketplace and currency, long after the sales happened,
// and a paperback or hardcover royalty is what is left after Amazon's printing cost. A bookkeeper who books only
// the bank deposit understates income, hides printing cost, puts income in the wrong month and cannot tell which
// marketplace or format earned it. This module reads a KDP royalty report CSV (a date or month, a format or
// transaction type, a royalty amount, optionally marketplace, title, units, printing cost, tax withheld,
// currency and a per-row total), books each row gross by marketplace and format (ebook, paperback, hardcover,
// KENP page reads), books printing cost and any tax withheld as expenses, sends rows no rule recognises to an
// uncategorised account (never dropped), proves the file is complete by checking each row's Total column and
// any Total row against the rows, and writes balanced journals for Xero, QuickBooks Online, QuickBooks Desktop
// (IIF) and a plain CSV, one per currency per month, against an Amazon KDP receivable account.
//
// Currency is noted, never converted: a journal is written per currency, labelled with that currency, and no
// exchange rate is applied or invented.
//
// When the royalty column is already net of printing cost, printMode "net" adds the printing-cost column back
// onto income and books it as an expense, so income is gross and the amount owed by Amazon is unchanged.
//
// The export's column names, its format labels and each importer's layout are alias-matched guesses; no real KDP
// export and no live Xero or QuickBooks import was available when this was written. Columns are matched by
// several aliases, a row no rule explains is never dropped, and the completeness checks say whether the rows
// can be trusted.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  ebook: { label: "KDP eBook royalties (gross)", account: "KDP eBook Royalties" },
  paperback: { label: "KDP paperback royalties (gross)", account: "KDP Paperback Royalties" },
  hardcover: { label: "KDP hardcover royalties (gross)", account: "KDP Hardcover Royalties" },
  kenp: { label: "KDP KENP page-read royalties", account: "KDP KENP Royalties" },
  printing: { label: "KDP printing costs", account: "KDP Printing Costs" },
  withholding: { label: "KDP tax withheld", account: "KDP Tax Withheld" },
  uncategorised: { label: "Uncategorised KDP items", account: "KDP Uncategorised" },
  clearing: { label: "Amazon KDP royalties receivable (clearing)", account: "Amazon KDP Receivable" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);
const INCOME = new Set(["ebook", "paperback", "hardcover", "kenp"]);

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

// Format / transaction-type labels, matched loosely and in this order: a "Paperback printing cost" is a cost, not a
// paperback sale, and KENP page reads are not ebook sales. Anything else is reviewed, not guessed.
export function rowCategory(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return "uncategorised";
  if (/printing|print cost|manufactur/.test(t)) return "printing";
  if (/withh|tax held|tax-held|\btax\b/.test(t)) return "withholding";
  if (/kenp|pages? read|normali[sz]ed|kindle unlimited|\bku\b/.test(t)) return "kenp";
  if (/hardcover|hard cover|hardback/.test(t)) return "hardcover";
  if (/paperback|softcover|soft cover/.test(t)) return "paperback";
  if (/e-?book|kindle|digital/.test(t)) return "ebook";
  return "uncategorised";
}

const totalRowLabel = (cells) => { const f = cells.find((c) => c.trim()); return f ? /^(grand\s+)?totals?\b/i.test(f.trim()) : false; };

// Rows are grouped by currency (never converted). opts.printMode: "separate" (default: the royalty column is before
// printing cost) or "net" (the royalty column is already after it, so income is grossed up by the printing-cost
// column). opts.currency is the currency to assume when the file has no Currency column. opts.expected, when
// given, is the total you were paid (cents) for a single-currency file.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a KDP royalty report or payments CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    date: col("royalty-date", "date", "sales-date", "month", "sales-month", "reporting-month", "period", "payment-date", "transaction-date"),
    title: col("title", "book-title", "book", "name"),
    id: col("asin/isbn", "asin-isbn", "asin", "isbn", "isbn-13", "book-id", "id"),
    market: col("marketplace", "store", "amazon-store", "market", "country", "sales-channel"),
    format: col("format", "book-format", "product-type", "binding", "edition"),
    type: col("transaction-type", "type", "entry-type", "activity", "line-item"),
    kenp: col("kindle-edition-normalized-page-(kenp)-read", "kindle-edition-normalized-pages-(kenp)-read", "kenp-read", "kenp", "pages-read", "normalized-pages-read"),
    units: col("units-sold", "units", "net-units-sold", "quantity"),
    royalty: col("royalty", "royalty-amount", "royalties", "earnings", "amount", "gross-royalty", "royalty-before-costs"),
    printing: col("printing-cost", "print-cost", "printing-costs", "manufacturing-cost", "printing"),
    withheld: col("tax-withheld", "withholding", "withholding-tax", "tax-held", "tax-withholding", "withheld"),
    currency: col("currency", "royalty-currency", "payment-currency"),
    net: col("total", "net", "net-amount", "net-royalty", "net-payment", "payment", "payment-amount", "total-royalty", "net-total"),
  };
  const missing = [];
  if (I.date < 0) missing.push("date (Royalty Date, Date or Month)");
  if (I.format < 0 && I.type < 0) missing.push("format (Format or Transaction Type)");
  if (I.royalty < 0 && I.net < 0) missing.push("royalty amount (Royalty)");
  if (missing.length) {
    add("error", "This does not look like a KDP royalty report", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. In KDP open Reports, choose the date range and download the royalty or payments report as CSV, then paste the whole file here. Column names are alias-matched and not verified against a real export, so a differently named column may need renaming.`, first + 1);
    return none;
  }
  const useNetAsRoyalty = I.royalty < 0;
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const rows = [];
  let total = null;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const rid = get(cells, "id") || get(cells, "title") || `line ${i + 1}`;
    if (totalRowLabel(cells)) {
      const num = (k) => (I[k] >= 0 ? parseAmount(get(cells, k)) : null);
      total = { line: i + 1, royalty: num("royalty"), printing: num("printing"), withheld: num("withheld"), net: num("net") };
      continue;
    }
    const royaltyRaw = parseAmount(get(cells, useNetAsRoyalty ? "net" : "royalty"));
    const printRaw = parseAmount(get(cells, "printing")), heldRaw = parseAmount(get(cells, "withheld"));
    const netRaw = useNetAsRoyalty ? null : parseAmount(get(cells, "net"));
    if ([royaltyRaw, printRaw, heldRaw, netRaw].some((v) => Number.isNaN(v))) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so the totals will not add up.", i + 1); continue; }
    if (royaltyRaw === null && printRaw === null && heldRaw === null) { add("warning", "Row has no amount", `${rid} was skipped.`, i + 1); continue; }
    const royalty = royaltyRaw ?? 0, print = Math.abs(printRaw ?? 0), held = Math.abs(heldRaw ?? 0);
    const fmtText = [get(cells, "format"), get(cells, "type")].join(" ").trim();
    const kenpPages = parseCount(get(cells, "kenp"));
    let key = rowCategory(fmtText);
    if (key === "uncategorised" && kenpPages > 0) key = "kenp";
    const created = parseDate(get(cells, "date"), opts.dateOrder);
    if (!created) add("warning", `Row ${rid} has no readable date`, `"${get(cells, "date")}" was not understood; the row is placed in the final month.`, i + 1);
    const cur = get(cells, "currency").toUpperCase();
    const market = get(cells, "market") || "Unspecified marketplace";
    let parts, gross = 0;
    if (key === "printing" || key === "withholding") parts = [{ k: key, amt: -Math.abs(royalty) }];
    else {
      const inc = opts.printMode === "net" ? royalty + print : royalty;
      parts = [{ k: key, amt: inc }];
      if (print) parts.push({ k: "printing", amt: -print });
      gross = INCOME.has(key) ? inc : 0;
    }
    if (held && key !== "withholding") parts.push({ k: "withholding", amt: -held });
    const net = parts.reduce((a, p) => a + p.amt, 0);
    const units = key === "kenp" && kenpPages > 0 ? kenpPages : parseCount(get(cells, "units"));
    if (netRaw !== null && netRaw !== net) add("error", `Total on ${rid} does not match its own columns`, `The row's Total column says ${money(netRaw, cur || "USD")} but its royalty${opts.printMode === "net" ? "" : " less printing cost"} less tax withheld is ${money(net, cur || "USD")} (off by ${money(netRaw - net, cur || "USD")}). A figure was edited or a column is missing from the paste.`, i + 1);
    rows.push({ line: i + 1, id: rid, item: get(cells, "title") || fmtText, type: fmtText, market, units, gross, net, netStated: netRaw, royalty, print, held, parts, created, currency: cur });
  }
  if (!rows.length) { add("error", "No royalty rows found", "The header was read but there were no data rows."); return none; }

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
      cmp("printing cost", total.printing === null ? null : Math.abs(total.printing), sum((r) => r.print));
      cmp("tax withheld", total.withheld === null ? null : Math.abs(total.withheld), sum((r) => r.held));
      stated = total.net !== null && !Number.isNaN(total.net) ? total.net : null;
      if (stated === null && total.royalty !== null && !Number.isNaN(total.royalty)) stated = total.royalty - (opts.printMode === "net" ? 0 : Math.abs(total.printing ?? 0)) - Math.abs(total.withheld ?? 0);
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
    return { id: `KDP-${cur}`, effective, stated: single ? stated : (perRow ? rs.reduce((a, r) => a + r.netStated, 0) : null), opening: null, currency: cur, rows: rs };
  });
  return { payouts, findings, summary: { rows: rows.length, payouts: payouts.length } };
}

// Gross by marketplace and format, with what KDP took out: the figures a bookkeeper wants per marketplace.
export function royaltySummary(payouts) {
  const byMarket = new Map();
  const tot = { gross: 0, printing: 0, withheld: 0, other: 0, net: 0 };
  for (const s of payouts) for (const r of s.rows) for (const p of r.parts) {
    const key = `${s.currency}|${r.market}|${p.k}`;
    const e = byMarket.get(key) || { currency: s.currency, market: r.market, category: p.k, amount: 0, units: 0 };
    e.amount += p.amt;
    if (INCOME.has(p.k) && p === r.parts[0]) e.units += r.units;
    byMarket.set(key, e);
    if (INCOME.has(p.k)) tot.gross += p.amt;
    else if (p.k === "printing") tot.printing -= p.amt;
    else if (p.k === "withholding") tot.withheld -= p.amt;
    else tot.other += p.amt;
    tot.net += p.amt;
  }
  return { rows: [...byMarket.values()].sort((a, b) => a.currency.localeCompare(b.currency) || a.market.localeCompare(b.market) || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)), ...tot, printingShare: tot.gross > 0 ? tot.printing / tot.gross : null };
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
    if (keys.length > 1) findings.push({ severity: "info", title: `The ${cur} rows span ${keys.length} months`, detail: `Written as ${keys.length} ${cur} journals (${keys.join(", ")}), each balanced to the KDP receivable account, so every month's royalties and costs land in the month they were reported.`, line: 0 });
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
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Royalties owed by Amazon KDP (${ym}, ${cur})`, market: "" });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `KDP royalties ${ym} (${cur})`, lines, clearing: net });
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

const HEAD = ["Royalty Date", "Title", "ASIN/ISBN", "Marketplace", "Format", "Units Sold", "Royalty", "Printing Cost", "Tax Withheld", "Currency", "Total"];

// items: [date, title, id, marketplace, format, units, royalty, printing, withheld, currency]. Each row's Total is
// royalty - printing - withheld. `skip` drops rows from the output as a hand-edited paste would; `mangleTotal`
// replaces a row's Total text; `mangle` replaces a row's Royalty text; `totalRow` appends a Total row (one currency only).
export function buildReport({ items, skip = [], mangle = {}, mangleTotal = {}, totalRow = false, totalOverride = {} }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const f = (c) => (c / 100).toFixed(2);
  const rows = items.map(([date, title, id, market, fmt, units, roy, print, held, cur], n) => {
    const r = Math.round(roy * 100), p = Math.round(print * 100), h = Math.round(held * 100);
    return [date, title, id, market, fmt, units, mangle[n] ?? f(r), p ? f(p) : "", h ? f(h) : "", cur, mangleTotal[n] ?? f(r - p - h)].map(csv).join(",");
  });
  const kept = rows.filter((_, n) => !skip.includes(n));
  const out = [HEAD.join(","), ...kept];
  if (totalRow) {
    const r = items.reduce((a, x) => a + Math.round(x[6] * 100), 0), p = items.reduce((a, x) => a + Math.round(x[7] * 100), 0), h = items.reduce((a, x) => a + Math.round(x[8] * 100), 0);
    out.push(["Total", "", "", "", "", items.reduce((a, x) => a + x[5], 0), f(totalOverride.royalty ?? r), f(totalOverride.printing ?? p), f(totalOverride.withheld ?? h), "", totalOverride.net ?? f(r - p - h)].join(","));
  }
  return out.join("\n") + "\n";
}

// A made-up author: invented titles, ASINs and amounts.
const SAMPLE_ITEMS = [
  ["2026-08", "The Lantern Keeper", "B0EXAMPLE1", "Amazon.com", "Kindle eBook", 120, 252.00, 0, 0, "USD"],
  ["2026-08", "The Lantern Keeper", "B0EXAMPLE1", "Amazon.com", "Paperback", 40, 150.00, 56.00, 0, "USD"],
  ["2026-08", "The Lantern Keeper", "B0EXAMPLE1", "Amazon.com", "Kindle Edition Normalized Pages (KENP) read", 18000, 90.00, 0, 0, "USD"],
  ["2026-08", "The Lantern Keeper", "B0EXAMPLE1", "Amazon.co.uk", "Kindle eBook", 30, 48.00, 0, 0, "GBP"],
  ["2026-09", "The Lantern Keeper", "B0EXAMPLE1", "Amazon.com", "Kindle eBook", 100, 210.00, 0, 0, "USD"],
  ["2026-09", "The Lantern Keeper", "B0EXAMPLE1", "Amazon.com", "Paperback", 55, 205.00, 77.00, 0, "USD"],
  ["2026-09", "Salt and Signal", "B0EXAMPLE2", "Amazon.com", "Hardcover", 12, 60.00, 30.00, 0, "USD"],
  ["2026-09", "Salt and Signal", "B0EXAMPLE2", "Amazon.de", "Kindle eBook", 25, 40.00, 0, 6.00, "EUR"],
];

export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS });
// The same report after a hand edit: one row's Total altered, one royalty that is not a number, and a format no rule knows.
export function sampleBrokenReport() {
  const items = [...SAMPLE_ITEMS, ["2026-09", "Salt and Signal", "B0EXAMPLE2", "Amazon.com", "Audio Replica", 3, 9.00, 0, 0, "USD"], ["2026-09", "Salt and Signal", "B0EXAMPLE2", "Amazon.com", "Kindle eBook", 4, 8.00, 0, 0, "USD"]];
  return buildReport({ items, mangleTotal: { 1: "100.00" }, mangle: { 9: "8..0" } });
}
