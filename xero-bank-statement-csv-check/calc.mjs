// Xero bank statement CSV checker and repairer. Pure functions, no DOM, no network.
// The rules are read from memory of Xero's public "import a bank statement" help pages and sample CSV
// (columns Date, Amount, Payee, Description, Reference, Check Number; Date and Amount required; one signed
// Amount column; a date format that must match the one chosen at import); confirm against Xero's own
// current documentation. No Xero import was available when this was built, and nothing here asks Xero or a
// bank anything.

export const COLUMNS = ["*Date", "*Amount", "Payee", "Description", "Reference", "Check Number"];
const bare = (h) => String(h).replace(/^\*/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const ALIASES = {
  date: "*Date", transactiondate: "*Date", postingdate: "*Date", posteddate: "*Date", bookingdate: "*Date",
  amount: "*Amount", value: "*Amount", transactionamount: "*Amount",
  payee: "Payee", name: "Payee", counterparty: "Payee", merchant: "Payee",
  description: "Description", details: "Description", memo: "Description", narrative: "Description", transactiondescription: "Description",
  reference: "Reference", ref: "Reference", checknumber: "Check Number", chequenumber: "Check Number", checkno: "Check Number", chequeno: "Check Number",
};
const DEBIT = new Set(["debit", "debits", "withdrawal", "withdrawals", "moneyout", "paidout", "dr", "spent"]);
const CREDIT = new Set(["credit", "credits", "deposit", "deposits", "moneyin", "paidin", "cr", "received"]);
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

export function detectDelimiter(text) {
  const first = String(text).split(/\r\n|\n|\r/).find((l) => l.trim()) || "";
  const n = (c) => first.split(c).length - 1;
  const best = [[",", n(",")], [";", n(";")], ["\t", n("\t")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] ? best[0] : ",";
}

// RFC 4180-ish; each row remembers the physical line it starts on.
export function parseCsv(text, delim = ",") {
  const rows = [];
  const s = String(text).replace(/^﻿/, "");
  let row = [], cell = "", q = false, line = 1, start = 1, unterminatedAt = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else { if (ch === "\n") line++; cell += ch; }
      continue;
    }
    if (ch === '"' && cell === "") { q = true; unterminatedAt = line; }
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push({ cells: row, line: start }); row = []; cell = ""; line++; start = line;
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push({ cells: row, line: start }); }
  return { rows, unterminatedQuote: q ? unterminatedAt : 0 };
}

// "-42.10", "1,234.50", "1.234,56", "(12.50)", "12.50-", "$12.50", "12.50 CR/DR" -> { value, fixed }.
// fixed is the plain-decimal spelling or null when already plain; null result when it cannot be read
// without guessing.
export function normalizeAmount(raw) {
  let s = String(raw).trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { value: Number(s), fixed: null };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const dr = s.match(/\s*(CR|DR)$/i);
  if (dr) { if (dr[1].toUpperCase() === "DR") neg = !neg; s = s.slice(0, -dr[0].length); }
  if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
  if (/^-/.test(s)) { neg = !neg; s = s.slice(1); } else if (/^\+/.test(s)) s = s.slice(1);
  s = s.replace(/^[A-Za-z]{0,3}\s*[$€£¥]?\s*/, "").replace(/\s*[A-Za-z]{3}$/, "").replace(/\s/g, "");
  let digits;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) digits = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) digits = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) digits = s.replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(s)) digits = s;
  else return null;
  return { value: Number(digits) * (neg ? -1 : 1), fixed: (neg ? "-" : "") + digits };
}

// A date cell -> { a, b, y, kind } where kind is "num" (a, b are the first two numbers), "iso" (y-m-d, a=month,
// b=day) or "text" (a = day, b = month, as in 5 Jan 2024). null when unreadable.
export function parseDate(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return { a: +m[2], b: +m[3], y: +m[1], kind: "iso", twoDigit: false };
  m = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2}|\d{4})$/);
  if (m) { let y = +m[3]; const two = m[3].length === 2; if (two) y += y < 70 ? 2000 : 1900; return { a: +m[1], b: +m[2], y, kind: "num", twoDigit: two }; }
  m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3})[A-Za-z]*[ \-,]+(\d{2}|\d{4})$/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (!mo) return null;
    let y = +m[3]; const two = m[3].length === 2; if (two) y += y < 70 ? 2000 : 1900;
    return { a: +m[1], b: mo, y, kind: "text", twoDigit: two };
  }
  return null;
}

// Whole-file order of the numeric dates: "dmy"/"mdy" when some date can only be read one way, "mixed" when
// both appear, "unknown" when every numeric date has both numbers 12 or under.
export function dateOrder(dates) {
  let dmy = 0, mdy = 0, n = 0;
  for (const d of dates) {
    if (!d || d.kind !== "num") continue;
    n++;
    if (d.a > 12) dmy++; else if (d.b > 12) mdy++;
  }
  return { order: dmy && mdy ? "mixed" : dmy ? "dmy" : mdy ? "mdy" : "unknown", dmy, mdy, numeric: n };
}

function ymd(d, order) {
  if (d.kind === "iso") return [d.y, d.a, d.b];
  if (d.kind === "text") return [d.y, d.b, d.a];
  return order === "dmy" ? [d.y, d.b, d.a] : [d.y, d.a, d.b];
}
const realDate = ([y, m, d]) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const cents = (n) => Math.round(n * 100);
const keyName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Finds the header row (first row within 30 whose cells name a date and an amount or a debit/credit pair)
// and maps columns. The delimiter is the first of , ; tab that yields a header, so a title line above the
// header cannot decide it.
export function analyse(text) {
  let best = null;
  for (const delim of [detectDelimiter(text), ",", ";", "\t"]) {
    const { rows, unterminatedQuote } = parseCsv(text, delim);
    let h = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const keys = rows[i].cells.map(bare);
      const hasDate = keys.some((k) => ALIASES[k] === "*Date");
      const hasAmt = keys.some((k) => ALIASES[k] === "*Amount") || (keys.some((k) => DEBIT.has(k)) && keys.some((k) => CREDIT.has(k)));
      if (hasDate && hasAmt) { h = i; break; }
    }
    if (!best) best = { delim, rows, unterminatedQuote, h };
    if (h >= 0) { best = { delim, rows, unterminatedQuote, h }; break; }
  }
  const { delim, rows, unterminatedQuote, h } = best;
  const map = {};
  let debit = -1, credit = -1;
  if (h >= 0) rows[h].cells.forEach((c, i) => {
    const k = bare(c), col = ALIASES[k];
    if (col && !(col in map)) map[col] = i;
    if (DEBIT.has(k) && debit < 0) debit = i;
    if (CREDIT.has(k) && credit < 0) credit = i;
  });
  return { delim, rows, unterminatedQuote, headerIndex: h, map, debit, credit };
}

function result(findings, summary) {
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  return { findings, summary: { errors: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length, ...summary } };
}

export function validate(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line = 0, fixable = false) => findings.push({ severity, title, detail, line, fixable });
  const a = analyse(text);
  const blank = { transactions: 0, order: "unknown" };
  if (!String(text).trim()) { add("error", "The file is empty", "Nothing to check.", 0); return result(findings, blank); }
  if (a.unterminatedQuote) add("error", "A quoted field is never closed", `A " opened on line ${a.unterminatedQuote} has no closing quote, so everything after it reads as one cell.`, a.unterminatedQuote);
  if (a.headerIndex < 0) {
    add("error", "No header row naming a date and an amount", "Xero's importer needs a first row naming the columns, with at least Date and Amount (or a Debit and Credit pair to merge). Bank downloads often put account details above the header.", 1);
    return result(findings, blank);
  }
  if (a.headerIndex > 0) add("error", `${a.headerIndex} row${a.headerIndex === 1 ? "" : "s"} above the header`, "Xero reads the first row as column names. Account details, balances or a title above it make the import fail or map the wrong columns.", 1, true);
  const hdr = a.rows[a.headerIndex];
  const cleanNames = hdr.cells.map((c) => String(c).trim());
  const need = ["*Date", "*Amount"];
  const split = a.debit >= 0 && a.credit >= 0 && !("*Amount" in a.map);
  if (split) add("error", "Money in and money out are in separate columns", "Xero takes one Amount column, negative for money out. Separate Debit/Credit columns import with every amount missing or wrong. Repair merges them.", hdr.line, true);
  for (const n of need) if (!(n in a.map) && !(n === "*Amount" && split)) add("error", `No ${n.slice(1)} column`, `Xero requires a ${n.slice(1)} column.`, hdr.line);
  cleanNames.forEach((c, i) => {
    if (!c) return;
    const col = ALIASES[bare(c)];
    if (col && a.map[col] === i && c !== col && c !== col.replace(/^\*/, "")) add("info", `Column "${c}" is read as ${col.replace(/^\*/, "")}`, `Xero's template names it ${col}; the repair renames it.`, hdr.line, true);
    else if (!col && !DEBIT.has(bare(c)) && !CREDIT.has(bare(c))) add("info", `Column "${c}" is not a Xero statement column`, "Xero ignores or rejects columns it does not recognise; the repair drops it.", hdr.line, true);
  });

  const body = a.rows.slice(a.headerIndex + 1);
  const dates = [];
  const seen = new Map();
  let n = 0, blanks = 0, future = 0, outOfOrder = 0, prev = null, sci = 0;
  const now = opts.now || new Date();
  const dIdx = a.map["*Date"], aIdx = a.map["*Amount"];
  for (const r of body) {
    const c = r.cells;
    if (c.every((x) => !String(x).trim())) { blanks++; continue; }
    n++;
    if (c.length !== hdr.cells.length) add("warning", "Row has a different number of cells than the header", `${c.length} cells against ${hdr.cells.length} in the header. An unquoted comma in a payee or description is the usual cause.`, r.line);
    for (const x of c) {
      if (EXCEL_ERR.test(String(x).trim())) { add("error", "Excel error value in a cell", `"${String(x).trim()}" was written by a spreadsheet formula, not by your bank.`, r.line); break; }
      if (SCI.test(String(x).trim())) { sci++; add("warning", "Number in scientific notation", `"${String(x).trim()}" is a long reference or cheque number that a spreadsheet rewrote; the original digits are lost.`, r.line); break; }
    }
    let d = null;
    if (dIdx !== undefined) {
      const raw = String(c[dIdx] ?? "").trim();
      if (!raw) add("error", "Row has no date", "Every row needs a date.", r.line);
      else { d = parseDate(raw); if (!d) add("error", "Date not readable", `"${raw}" is not a date like 31/12/2024, 12/31/2024, 2024-12-31 or 31 Dec 2024.`, r.line); }
    }
    dates.push(d);
    let amt = null;
    if (split) {
      const dv = String(c[a.debit] ?? "").trim(), cv = String(c[a.credit] ?? "").trim();
      if (dv && cv) add("error", "Both Debit and Credit are filled", "A row cannot be money in and money out.", r.line);
      else if (!dv && !cv) add("error", "Row has no amount", "Debit and Credit are both empty.", r.line);
      else { const p = normalizeAmount(dv || cv); if (!p) add("error", "Amount not readable", `"${dv || cv}" cannot be read as an amount without guessing.`, r.line); else amt = Math.abs(p.value) * (dv ? -1 : 1); }
    } else if (aIdx !== undefined) {
      const raw = String(c[aIdx] ?? "").trim();
      if (!raw) add("error", "Row has no amount", "Every row needs an Amount.", r.line);
      else {
        const p = normalizeAmount(raw);
        if (!p) add("error", "Amount not readable", `"${raw}" cannot be read as an amount without guessing.`, r.line);
        else {
          amt = p.value;
          if (p.fixed !== null) add("warning", "Amount is not a plain decimal", `"${raw}" is read as ${p.fixed}. Xero wants digits, an optional minus and a decimal point, with no currency symbol, brackets or thousands separator.`, r.line, true);
          if (p.value === 0) add("warning", "Zero amount", "A zero-value row is usually an error.", r.line);
        }
      }
    }
    const pIdx = a.map["Payee"], dsIdx = a.map["Description"];
    if (pIdx !== undefined || dsIdx !== undefined) if (!String(c[pIdx] ?? "").trim() && !String(c[dsIdx] ?? "").trim()) add("warning", "No payee or description", "The row will import with nothing to recognise it by.", r.line);
    if (d && amt !== null) {
      const k = `${String(c[dIdx]).trim()}|${amt}|${keyName(c[pIdx])}|${keyName(c[dsIdx])}`;
      if (seen.has(k)) add("warning", "Looks like a repeat of an earlier row", `Same date, amount and text as line ${seen.get(k)}. Xero de-duplicates on its own rules, not on yours, so a statement downloaded twice can post twice; if these are two real payments, ignore this.`, r.line);
      else seen.set(k, r.line);
    }
  }
  const o = dateOrder(dates);
  const order = o.order === "unknown" ? (opts.order || "unknown") : o.order;
  if (o.order === "mixed") add("error", "Dates mix day-first and month-first", `${o.dmy} date(s) can only be day/month and ${o.mdy} can only be month/day. The file was probably joined from two sources; one Xero date-format choice cannot read both.`, 0);
  for (const [i, d] of dates.entries()) {
    if (!d || (d.kind === "num" && (order === "unknown" || order === "mixed"))) continue;
    const t = ymd(d, order);
    if (!realDate(t)) { add("error", "Impossible date", `Day or month is out of range (read as ${order === "dmy" ? "day/month" : order === "mdy" ? "month/day" : "its own format"}).`, body.filter((r) => !r.cells.every((x) => !String(x).trim()))[i].line); continue; }
    const key = t[0] * 10000 + t[1] * 100 + t[2];
    if (new Date(Date.UTC(t[0], t[1] - 1, t[2])) > now) future++;
    if (prev && key < prev) outOfOrder++;
    prev = key;
  }
  const numeric = dates.filter((d) => d && d.kind === "num").length;
  if (numeric && o.order === "unknown") add("warning", "Date order cannot be told from the file", "Every date has both numbers 12 or under, so 03/04/2024 could be 3 April or March 4. Xero asks you to pick the date format at import; pick the one your bank uses and spot-check one row afterwards.", 0);
  else if (o.order === "dmy" || o.order === "mdy") add("info", o.order === "dmy" ? "Dates are DD/MM/YYYY" : "Dates are MM/DD/YYYY", `Proven by ${o.order === "dmy" ? o.dmy : o.mdy} date(s) that can only be read that way. Choose that format in Xero's import step.`, 0);
  if (dates.some((d) => d && d.twoDigit)) add("warning", "Two-digit years", "Xero's accepted formats use a four-digit year; the repair rewrites them (the century is guessed as 1970-2069).", 0, true);
  if (future) add("warning", `${future} date${future === 1 ? "" : "s"} in the future`, "Usually a day/month swap or a wrong year.", 0);
  if (outOfOrder) add("info", `${outOfOrder} row${outOfOrder === 1 ? "" : "s"} out of date order`, "Harmless to Xero; it sorts by date.", 0);
  if (blanks) add("info", `${blanks} blank row${blanks === 1 ? "" : "s"}`, "The repair removes them.", 0, true);
  if (!n) add("error", "No transactions under the header", "The header is there but no rows follow it.", hdr.line);
  return result(findings, { transactions: n, order: o.order, delimiter: a.delim === "\t" ? "tab" : a.delim });
}

const q = (s) => (/[",\r\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

// Fixes only what is provable: drops rows above the header and blank rows, renames known columns to Xero's
// names, drops unknown columns, merges Debit/Credit into one signed Amount, writes plain-decimal amounts,
// and, only if asked, rewrites dates in opts.dateFormat ("DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD") using
// the order the file proves or opts.order. Returns { text, changes }.
export function repair(text, opts = {}) {
  const a = analyse(text);
  const changes = [];
  if (a.headerIndex < 0) return { text: String(text), changes };
  if (a.headerIndex > 0) changes.push(`Removed ${a.headerIndex} row(s) above the header.`);
  const hdr = a.rows[a.headerIndex];
  const split = a.debit >= 0 && a.credit >= 0 && !("*Amount" in a.map);
  const cols = COLUMNS.filter((c) => c in a.map || (c === "*Amount" && split));
  const body = a.rows.slice(a.headerIndex + 1).filter((r) => r.cells.some((x) => String(x).trim()));
  const blanks = a.rows.length - a.headerIndex - 1 - body.length;
  if (blanks) changes.push(`Removed ${blanks} blank row(s).`);
  const dropped = hdr.cells.map((c, i) => [c, i]).filter(([c, i]) => String(c).trim() && !Object.values(a.map).includes(i) && i !== a.debit && i !== a.credit).map(([c]) => c);
  if (dropped.length) changes.push(`Dropped column(s) Xero does not read: ${dropped.join(", ")}.`);
  const renamed = cols.filter((c) => c in a.map && hdr.cells[a.map[c]].trim() !== c);
  if (renamed.length) changes.push(`Renamed column(s) to Xero's names: ${renamed.map((c) => `${hdr.cells[a.map[c]].trim()} to ${c}`).join(", ")}.`);
  if (split) changes.push("Merged Debit and Credit into one Amount column (money out negative).");
  const dates = body.map((r) => (a.map["*Date"] !== undefined ? parseDate(r.cells[a.map["*Date"]] ?? "") : null));
  const proven = dateOrder(dates).order;
  const order = proven === "dmy" || proven === "mdy" ? proven : opts.order;
  let nAmt = 0, nDate = 0;
  const out = [cols.map(q).join(a.delim === "\t" ? "," : ",")];
  body.forEach((r, ri) => {
    const row = cols.map((c) => {
      let v = c === "*Amount" && split ? null : String(r.cells[a.map[c]] ?? "").trim();
      if (c === "*Amount") {
        if (split) {
          const dv = String(r.cells[a.debit] ?? "").trim(), cv = String(r.cells[a.credit] ?? "").trim();
          const p = normalizeAmount(dv || cv);
          if (!p || (dv && cv)) return dv || cv;
          return (dv ? "-" : "") + (p.fixed ?? (dv || cv)).replace(/^[-+]/, "");
        }
        const p = normalizeAmount(v);
        if (p && p.fixed !== null) { nAmt++; return p.fixed; }
        return v;
      }
      if (c === "*Date" && opts.dateFormat) {
        const d = dates[ri];
        if (d && (d.kind !== "num" || order === "dmy" || order === "mdy") && proven !== "mixed") {
          const [y, m, dd] = ymd(d, order);
          if (realDate([y, m, dd])) {
            const p2 = (x) => String(x).padStart(2, "0");
            const f = opts.dateFormat === "YYYY-MM-DD" ? `${y}-${p2(m)}-${p2(dd)}` : opts.dateFormat === "MM/DD/YYYY" ? `${p2(m)}/${p2(dd)}/${y}` : `${p2(dd)}/${p2(m)}/${y}`;
            if (f !== v) nDate++;
            return f;
          }
        }
      }
      return v;
    });
    out.push(row.map(q).join(","));
  });
  if (nAmt) changes.push(`${nAmt} amount(s) written as plain decimals.`);
  if (nDate) changes.push(`${nDate} date(s) rewritten as ${opts.dateFormat}${order ? ` (read as ${order === "dmy" ? "day/month" : "month/day"}${proven === order ? ", proven by the file" : ", the order you chose"})` : ""}.`);
  return { text: out.join("\r\n") + "\r\n", changes };
}

export function findingsCsv(res) {
  const qq = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,problem,detail,auto_fixable", ...res.findings.map((f) => [f.severity, f.line || "", qq(f.title), qq(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return `*Date,*Amount,Payee,Description,Reference,Check Number
15/01/2024,-42.10,Corner Grocery,Card purchase,,
16/01/2024,1500.00,Acme Co,Payroll,INV-1001,
20/01/2024,-89.99,Internet Service,Monthly plan,,
`;
}

export function sampleBrokenFile() {
  return `Account: 123-456-789
Statement period: Jan 2024

Date;Description;Debit;Credit;Balance
13/01/2024;Corner Grocery;42,10;;1000.00
01/13/2024;Wireless;18.00;;982.00
03/02/2024;Hardware store;100.00;;882.00
03/02/2024;Hardware store;100.00;;882.00
05/01/24;Refund;;25.50;907.50
06/01/2024;Cafe;;;
07/01/2024;Cheque 1.2345E+11;5.00;;902.50

`;
}
