// QuickBooks Desktop IIF (Intuit Interchange Format) checker and repairer. Pure functions, no I/O, no
// network. The rules are read from memory of the IIF conventions QuickBooks Desktop importers follow: tab
// delimited; "!" header rows that name the columns of each record type (!TRNS, !SPL, !ENDTRNS, !ACCNT,
// !CUST, !VEND); every transaction a TRNS row, one or more SPL rows and an ENDTRNS row; the TRNS and SPL
// amounts of one transaction summing to zero; dates in the computer's short-date format (normally
// MM/DD/YYYY). Confirm against Intuit's own IIF documentation. Nothing here asks QuickBooks anything.

const TRNSTYPES = new Set(["BILL", "BILL REFUND", "CASH SALE", "CHECK", "CREDIT CARD", "CREDIT MEMO", "DEPOSIT", "ESTIMATE", "GENERAL JOURNAL", "INVOICE", "ITEM RECEIPT", "LIABILITY CHECK", "PAYMENT", "PAYCHECK", "PURCHASE ORDER", "SALES ORDER", "SALES TAX PAYMENT", "TRANSFER", "VENDOR CREDIT", "YTD ADJUSTMENT"]);
const ACCNTTYPES = new Set(["BANK", "AR", "OCASSET", "FIXASSET", "OASSET", "AP", "CCARD", "OCLIAB", "LTLIAB", "EQUITY", "INC", "COGS", "EXP", "EXINC", "EXEXP", "NONPOSTING"]);

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

// "-42.10", "1,234.50", "(12.50)", "12.50-", "$12.50" -> { value, fixed }; fixed is the plain-decimal
// spelling or null when already plain. Null when the digits cannot be read without guessing.
export function normalizeAmount(raw) {
  let s = String(raw).trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { value: Number(s), fixed: null };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); } else if (/^\+/.test(s)) s = s.slice(1);
  s = s.replace(/^[A-Za-z]{0,3}\s*[$€£¥]?\s*/, "").replace(/\s/g, "");
  let digits;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) digits = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) digits = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) digits = s.replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(s)) digits = s;
  else return null;
  return { value: Number(digits) * (neg ? -1 : 1), fixed: (neg ? "-" : "") + digits };
}

// A cell wrapped in double quotes (what Excel writes when a tab file is re-saved) -> its inner text.
function unquote(cell) {
  const m = cell.match(/^"([\s\S]*)"$/);
  return m ? m[1].replace(/""/g, '"') : cell;
}

// Lines -> rows. Header rows (leading "!") define the columns of their record type; data rows are keyed by
// the column names of their own type's header.
export function parseIif(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const headers = {}, rows = [];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = raw.split("\t");
    const line = i + 1;
    if (cells[0].startsWith("!")) {
      const type = cells[0].slice(1).trim().toUpperCase();
      if (!headers[type]) headers[type] = { line, cols: cells.slice(1).map((c) => c.trim().toUpperCase()), raw: cells };
      return;
    }
    const type = cells[0].trim().toUpperCase();
    const h = headers[type];
    const fields = {};
    if (h) h.cols.forEach((c, k) => { if (c && !(c in fields)) fields[c] = cells[k + 1] === undefined ? "" : cells[k + 1]; });
    rows.push({ line, type, cells, fields, hasHeader: Boolean(h) });
  });
  return { lines, headers, rows };
}

// "03/05/2024", "3/5/24", "2024-03-05", "05.03.2024" -> { kind, a, b, y } or null. kind "iso" is
// year-first and unambiguous; "slash" has a and b in the order written.
export function dateParts(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { kind: "iso", a: Number(m[2]), b: Number(m[3]), y: Number(m[1]) };
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
  return { kind: "slash", a: Number(m[1]), b: Number(m[2]), y, twoDigit: m[3].length === 2 };
}

// Whole-file date order among slash dates: "dmy" or "mdy" when a date can only be read one way, "mixed"
// when both appear, "unknown" when every date has both numbers 12 or under.
export function dateOrder(rows) {
  let dmy = 0, mdy = 0, n = 0;
  for (const r of rows) {
    if (r.type !== "TRNS" || r.fields.DATE === undefined) continue;
    const d = dateParts(unquote(r.fields.DATE));
    if (!d || d.kind !== "slash") continue;
    n++;
    if (d.a > 12) dmy++; else if (d.b > 12) mdy++;
  }
  return { order: dmy && mdy ? "mixed" : dmy ? "dmy" : mdy ? "mdy" : "unknown", dmy, mdy, dated: n };
}

const cents = (n) => Math.round(n * 100);
const keyName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");

// Transactions: TRNS ... SPL ... ENDTRNS. `closed` is false when the next TRNS or the end of file came first.
function transactions(rows) {
  const txs = [], stray = [], strayEnd = [];
  let cur = null;
  for (const r of rows) {
    if (r.type === "TRNS") {
      if (cur) txs.push(cur);
      cur = { trns: r, spls: [], closed: false, end: null };
    } else if (r.type === "SPL") {
      if (cur && !cur.closed) cur.spls.push(r); else stray.push(r);
    } else if (r.type === "ENDTRNS") {
      if (cur && !cur.closed) { cur.closed = true; cur.end = r; txs.push(cur); cur = null; } else strayEnd.push(r);
    }
  }
  if (cur) txs.push(cur);
  return { txs, stray, strayEnd };
}

function result(findings, p, txs) {
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  const errors = findings.filter((f) => f.severity === "error").length, warnings = findings.filter((f) => f.severity === "warning").length;
  const lists = Object.keys(p.headers).filter((t) => !["TRNS", "SPL", "ENDTRNS"].includes(t));
  return { findings, summary: { errors, warnings, transactions: txs.length, lists } };
}

export function validate(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line = 0, fixable = false) => findings.push({ severity, title, detail, line, fixable });
  const p = parseIif(text);
  const rawText = String(text);
  const { txs, stray, strayEnd } = transactions(p.rows);

  if (!/\t/.test(rawText) || !Object.keys(p.headers).length) {
    if (/^\s*!?(TRNS|SPL|ACCNT|CUST|VEND)[ ,]{2,}/im.test(rawText)) add("error", "Columns are not separated by tabs", "IIF is tab-delimited. This file separates columns with spaces or commas (usually after a copy from a web page or a save as CSV). Re-save from the spreadsheet as Text (Tab delimited) and rename it .iif.", 1);
    else add("error", "No ! header rows", "An IIF file starts with header rows such as !TRNS, !SPL and !ENDTRNS that name the columns. Without them QuickBooks cannot map the data rows.", 1);
    return result(findings, p, txs);
  }

  for (const [type, label] of [["TRNS", "!TRNS"], ["SPL", "!SPL"]]) {
    const h = p.headers[type];
    if (!h) { if (p.rows.some((r) => r.type === type)) add("error", `No ${label} header row`, `${type} rows appear but nothing names their columns, so QuickBooks skips them.`, p.rows.find((r) => r.type === type).line); continue; }
    const need = type === "TRNS" ? ["TRNSTYPE", "DATE", "ACCNT", "AMOUNT"] : ["ACCNT", "AMOUNT"];
    const miss = need.filter((c) => !h.cols.includes(c));
    if (miss.length) add("error", `${label} header lacks ${miss.join(", ")}`, `A ${type} row needs ${need.join(", ")}. Check the header spelling; column names are matched exactly.`, h.line);
    const dup = h.cols.filter((c, i) => c && h.cols.indexOf(c) !== i);
    if (dup.length) add("warning", `${label} header repeats ${[...new Set(dup)].join(", ")}`, "Only the first column of that name is read.", h.line);
  }
  if (txs.length && !p.headers.ENDTRNS) add("error", "No !ENDTRNS header row", "Each transaction ends with an ENDTRNS row, and QuickBooks expects the !ENDTRNS header too.", 1, true);
  for (const r of p.rows) {
    if (!r.hasHeader && !["TRNS", "SPL", "ENDTRNS"].includes(r.type)) add("error", `Row type "${r.cells[0]}" has no header row`, `No !${r.type} line names the columns for this row, so the importer does not know what it is.`, r.line);
    else if (r.hasHeader && r.cells.length - 1 > p.headers[r.type].cols.length) add("error", "Row has more columns than its header", `The ${r.type} header names ${p.headers[r.type].cols.length} columns but this row has ${r.cells.length - 1}. A stray tab (often inside a memo or a name) shifts every later field one column right.`, r.line);
  }

  const quoted = p.rows.filter((r) => r.cells.slice(1).some((c) => /^"[\s\S]*"$/.test(c)));
  if (quoted.length) add("warning", `${quoted.length} row${quoted.length === 1 ? "" : "s"} with cells wrapped in quotation marks`, "Excel adds quotes around some cells when it saves a tab file. QuickBooks reads the quotes as part of the name or amount, so accounts and customers fail to match.", quoted[0].line, true);

  if (stray.length) add("error", "SPL row outside a transaction", "An SPL row must follow a TRNS row, before its ENDTRNS.", stray[0].line);
  if (strayEnd.length) add("warning", "ENDTRNS with no open transaction", "An ENDTRNS row appears without a TRNS before it.", strayEnd[0].line);

  const accounts = new Set((p.rows.filter((r) => r.type === "ACCNT").map((r) => keyName(unquote(r.fields.NAME || "")))));
  const used = new Map();
  const seen = new Map();
  const { order, dmy, mdy } = dateOrder(p.rows);
  for (const t of txs) {
    const r = t.trns;
    if (!t.closed) add("error", "Transaction has no ENDTRNS", "The next TRNS (or the end of the file) arrived before an ENDTRNS row, so QuickBooks rejects this transaction and what follows it.", r.line, true);
    if (!t.spls.length) add("error", "Transaction has no SPL rows", "A transaction with only a TRNS row cannot balance.", r.line);
    const f = r.fields;
    const type = unquote(f.TRNSTYPE || "").trim().toUpperCase();
    if (f.TRNSTYPE !== undefined && !TRNSTYPES.has(type)) add("warning", `Unknown TRNSTYPE "${unquote(f.TRNSTYPE)}"`, "Expected a QuickBooks transaction type such as GENERAL JOURNAL, INVOICE, BILL, CHECK, DEPOSIT or PAYMENT.", r.line);

    if (f.DATE !== undefined) {
      const raw = unquote(f.DATE).trim();
      const d = dateParts(raw);
      if (!d) add("error", "Date not readable", `"${raw}" is not a date like 12/31/2024.`, r.line);
      else {
        const [mo, da] = d.kind === "iso" ? [d.a, d.b] : order === "dmy" ? [d.b, d.a] : [d.a, d.b];
        if (mo < 1 || mo > 12 || da < 1 || da > 31) add("error", "Impossible date", d.kind === "slash" && d.a > 12 ? `"${raw}" has a first number over 12. QuickBooks in a US locale reads MM/DD/YYYY, so this is read as month ${d.a}.` : `"${raw}" has a day or month out of range.`, r.line);
        else if (d.kind === "iso") add("warning", "Date is year-first", `"${raw}" is not the MM/DD/YYYY form QuickBooks expects from a US-locale computer, and is imported as a different date or refused.`, r.line, true);
        else if (d.twoDigit) add("info", "Two-digit year", `"${raw}" — QuickBooks guesses the century.`, r.line);
        if (d.kind === "slash" && order === "dmy" && d.a > 12) add("error", "Date reads day-first", `"${raw}" can only be day/month/year. QuickBooks with US regional settings reads month first and refuses or misdates it.`, r.line, false);
      }
    }
    const rows = [r, ...t.spls];
    let total = 0, readable = true;
    for (const row of rows) {
      const raw = row.fields.AMOUNT;
      const a = raw === undefined || unquote(raw).trim() === "" ? null : normalizeAmount(unquote(raw));
      if (a === null) { readable = false; add("error", raw === undefined || !String(raw).trim() ? `${row.type} row has no amount` : "Amount not readable", raw === undefined || !String(raw).trim() ? "Every TRNS and SPL row needs an AMOUNT." : `"${raw}" cannot be read as an amount without guessing.`, row.line); }
      else {
        total += a.value;
        if (a.fixed !== null) add("warning", "Amount is not a plain decimal", `"${raw}" is read as ${a.fixed}; write it that way so QuickBooks reads the same number.`, row.line, true);
        row.amountValue = a.value;
      }
      const acct = unquote(row.fields.ACCNT || "").trim();
      if (row.fields.ACCNT !== undefined && !acct) add("error", `${row.type} row has no account`, "ACCNT is empty; QuickBooks has nowhere to post the line.", row.line);
      else if (acct) {
        if (acct.length > 31) add("warning", "Account name over 31 characters", `"${acct}" — QuickBooks account names stop at 31 characters.`, row.line);
        if (!used.has(keyName(acct))) used.set(keyName(acct), { name: acct, line: row.line });
        if (accounts.size && !accounts.has(keyName(acct))) add("warning", "Account not defined in this file", `"${acct}" has no !ACCNT row here; QuickBooks creates nothing, so it must already exist with exactly this name (colons separate sub-accounts).`, row.line);
      }
      const nm = unquote(row.fields.NAME || "");
      if (nm.length > 41) add("warning", "Name over 41 characters", `"${nm}" is longer than the 41 characters QuickBooks keeps for a customer, vendor or employee name.`, row.line);
      if (nm && nm !== nm.trim()) add("warning", "Name has leading or trailing spaces", `"${nm}" will not match the list entry without the spaces.`, row.line, true);
    }
    if (readable && t.spls.length && cents(total) !== 0) add("error", "Transaction does not balance", `The TRNS and SPL amounts sum to ${total.toFixed(2)}, not 0. QuickBooks rejects an unbalanced transaction. A TRNS and its SPL rows carry opposite signs.`, r.line);
    if (f.DATE !== undefined && f.AMOUNT !== undefined) {
      const k = [type, unquote(f.DATE).trim(), keyName(unquote(f.NAME || "")), keyName(unquote(f.DOCNUM || "")), r.amountValue].join("|");
      if (seen.has(k)) add("warning", "Looks like a repeat of an earlier transaction", `Same type, date, name, number and amount as the transaction on line ${seen.get(k)}. IIF has no duplicate check, so QuickBooks books both; if these are two real transactions, ignore this.`, r.line);
      else seen.set(k, r.line);
    }
  }
  for (const a of p.rows.filter((r) => r.type === "ACCNT")) {
    const t = unquote(a.fields.ACCNTTYPE || "").trim().toUpperCase();
    if (a.fields.ACCNTTYPE !== undefined && !ACCNTTYPES.has(t)) add("error", `Unknown ACCNTTYPE "${unquote(a.fields.ACCNTTYPE)}"`, "Expected BANK, AR, AP, CCARD, OCASSET, FIXASSET, OASSET, OCLIAB, LTLIAB, EQUITY, INC, COGS, EXP, EXINC, EXEXP or NONPOSTING.", a.line);
  }
  const names = new Map();
  for (const a of p.rows.filter((r) => r.type === "ACCNT")) {
    const k = keyName(unquote(a.fields.NAME || ""));
    if (names.has(k)) add("error", "Duplicate account in !ACCNT list", `"${unquote(a.fields.NAME)}" already appears on line ${names.get(k)}.`, a.line); else names.set(k, a.line);
  }
  if (order === "mixed") add("error", "Dates mix day-first and month-first", `${dmy} date(s) can only be day/month and ${mdy} can only be month/day. No regional setting reads both.`, 0);
  else if (order === "dmy") add("info", "Dates are day/month/year", `Proven by ${dmy} date(s). QuickBooks reads dates in your computer's short-date format; with US settings these are refused or misdated. The repair can rewrite them to MM/DD/YYYY.`, 0);
  else if (order === "unknown" && txs.some((t) => dateParts(unquote(t.trns.fields.DATE || "")) && dateParts(unquote(t.trns.fields.DATE || "")).kind === "slash")) add("info", "Date order cannot be told from the file", "Every date has both numbers 12 or under. QuickBooks reads them in the computer's short-date order; spot-check one imported transaction.", 0);
  if (used.size && !accounts.size) add("info", `${used.size} account name${used.size === 1 ? "" : "s"} used`, `Each must already exist in your chart of accounts, spelled exactly: ${[...used.values()].map((u) => u.name).slice(0, 12).join("; ")}${used.size > 12 ? "; …" : ""}.`, 0);
  return result(findings, p, txs);
}

// Fixes only what is provable. opts.fixDates: "dmy" rewrites day-first dates as MM/DD/YYYY (only when the
// file proves day-first or opts.order is "dmy"). Year-first ISO dates are always rewritten. Returns
// { text, changes }.
export function repair(text, opts = {}) {
  const p = parseIif(text);
  const changes = [];
  const eol = /\r\n/.test(String(text)) ? "\r\n" : "\n";
  const out = p.lines.map((l) => l);
  const { txs } = transactions(p.rows);
  const proven = dateOrder(p.rows).order;
  const dayFirst = proven === "dmy" || (proven === "unknown" && opts.order === "dmy");
  let nQuote = 0, nAmt = 0, nDate = 0, nTrim = 0;
  const edited = new Map();
  for (const r of p.rows) {
    const cells = r.cells.slice();
    let touched = false;
    if (r.hasHeader) {
      const cols = p.headers[r.type].cols;
      for (let k = 1; k < cells.length; k++) {
        const col = cols[k - 1];
        let c = cells[k];
        if (/^"[\s\S]*"$/.test(c)) { c = unquote(c); nQuote++; touched = true; }
        if (col === "AMOUNT" && c.trim() !== "") {
          const a = normalizeAmount(c);
          if (a && a.fixed !== null) { c = a.fixed; nAmt++; touched = true; }
        } else if (col === "DATE") {
          const d = dateParts(c);
          if (d && d.kind === "iso" && d.a >= 1 && d.a <= 12 && d.b >= 1 && d.b <= 31) { c = `${pad(d.a)}/${pad(d.b)}/${d.y}`; nDate++; touched = true; }
          else if (d && d.kind === "slash" && dayFirst && opts.fixDates === "dmy" && d.b >= 1 && d.b <= 12 && d.a >= 1 && d.a <= 31) { c = `${pad(d.b)}/${pad(d.a)}/${d.y}`; nDate++; touched = true; }
        } else if (col === "NAME" && c !== c.trim()) { c = c.trim(); nTrim++; touched = true; }
        cells[k] = c;
      }
    }
    if (touched) edited.set(r.line, cells.join("\t"));
  }
  for (const [line, s] of edited) out[line - 1] = s;
  if (nQuote) changes.push(`${nQuote} cell${nQuote === 1 ? "" : "s"} unwrapped from quotation marks.`);
  if (nAmt) changes.push(`${nAmt} amount${nAmt === 1 ? "" : "s"} written as plain decimals.`);
  if (nDate) changes.push(`${nDate} date${nDate === 1 ? "" : "s"} rewritten as MM/DD/YYYY${dayFirst && opts.fixDates === "dmy" ? " (read as day/month, " + (proven === "dmy" ? "proven by the file" : "the order you chose") + ")" : " (year-first dates are unambiguous)"}.`);
  if (nTrim) changes.push(`${nTrim} name${nTrim === 1 ? "" : "s"} trimmed of leading or trailing spaces.`);
  // Insert missing ENDTRNS rows (before the next TRNS, or at the end), working from the bottom up.
  const inserts = [];
  for (const t of txs) {
    if (t.closed) continue;
    inserts.push({ after: [t.trns, ...t.spls].reduce((m, r) => Math.max(m, r.line), 0), from: t.trns.line });
  }
  for (const ins of inserts.sort((a, b) => b.after - a.after)) { out.splice(ins.after, 0, "ENDTRNS"); changes.push(`Line ${ins.from}: ENDTRNS added after the transaction's last SPL row (line ${ins.after}).`); }
  let result = out.join(eol);
  if (txs.length && !p.headers.ENDTRNS) { result = `!ENDTRNS${eol}` + result; changes.push("Added the !ENDTRNS header row at the top."); }
  return { text: result, changes };
}

export function findingsCsv(res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,problem,detail,auto_fixable", ...res.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

const T = (...c) => c.join("\t");

export function sampleFile() {
  return [
    T("!ACCNT", "NAME", "ACCNTTYPE"),
    T("ACCNT", "Checking", "BANK"),
    T("ACCNT", "Office Supplies", "EXP"),
    T("ACCNT", "Consulting Income", "INC"),
    T("!TRNS", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"),
    T("!SPL", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"),
    "!ENDTRNS",
    T("TRNS", "CHECK", "01/05/2024", "Checking", "Paper Mart", "-84.20", "1001", "Printer paper"),
    T("SPL", "CHECK", "01/05/2024", "Office Supplies", "Paper Mart", "84.20", "1001", "Printer paper"),
    "ENDTRNS",
    T("TRNS", "DEPOSIT", "01/15/2024", "Checking", "Acme Co", "1500.00", "", "January retainer"),
    T("SPL", "DEPOSIT", "01/15/2024", "Consulting Income", "Acme Co", "-1500.00", "", "January retainer"),
    "ENDTRNS",
    "",
  ].join("\r\n");
}

export function sampleBrokenFile() {
  return [
    T("!ACCNT", "NAME", "ACCNTTYPE"),
    T("ACCNT", "Checking", "BANK"),
    T("ACCNT", "Office Supplies", "EXP"),
    T("ACCNT", "Consulting Income", "INCOME"),
    T("!TRNS", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"),
    T("!SPL", "TRNSTYPE", "DATE", "ACCNT", "NAME", "AMOUNT", "DOCNUM", "MEMO"),
    T("TRNS", "CHECK", "01/05/2024", "Checking", "Paper Mart", "-84.20", "1001", "Printer paper"),
    T("SPL", "CHECK", "01/05/2024", "Office Supplies", "Paper Mart", "84.20", "1001", "Printer paper"),
    "ENDTRNS",
    T("TRNS", "CHECK", "2024-01-09", "Checking", "Paper Mart ", "(120.00)", "1002", "Toner"),
    T("SPL", "CHECK", "2024-01-09", "Office Supplies", "Paper Mart ", "119.00", "1002", "Toner"),
    "ENDTRNS",
    T("TRNS", "DEPOSIT", "01/12/2024", "Checking", "Acme Co", "1,500.00", "", "January retainer"),
    T("SPL", "DEPOSIT", "01/12/2024", "Consulting Income", "Acme Co", "-1500.00", "", "Memo with", "a stray tab"),
    T("TRNS", "CHECK", '"01/15/2024"', '"Checking"', "Paper Mart", "-30.00", "1003", "Stamps"),
    T("SPL", "CHECK", "01/15/2024", "Postage", "Paper Mart", "30.00", "1003", "Stamps"),
    "ENDTRNS",
    T("TRNS", "CHECK", "01/05/2024", "Checking", "Paper Mart", "-84.20", "1001", "Printer paper"),
    T("SPL", "CHECK", "01/05/2024", "Office Supplies", "Paper Mart", "84.20", "1001", "Printer paper"),
    "ENDTRNS",
    "",
  ].join("\r\n");
}
