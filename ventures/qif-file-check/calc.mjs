// QIF (Quicken Interchange Format) checker and repairer. Pure functions, no I/O, no network.
// The rules are read from memory of the QIF conventions Quicken, QuickBooks, Xero and YNAB importers
// follow (a !Type: header, one-letter field codes D T P M N L C, a "^" line ending every record, split
// lines S/E/$ that must add up to T, dates with no declared order); confirm against the importer's own
// documentation. Nothing here asks a bank or an accounting product anything.

const TYPES = new Set(["bank", "cash", "ccard", "invst", "oth a", "oth l", "invoice", "cat", "class", "memorized", "security", "prices", "payee", "tag", "account"]);

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(b).replace(/^﻿/, "");
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

export function looksLikeOfx(text) {
  return /<OFX[\s>]/i.test(text) || /^\s*OFXHEADER:/im.test(text);
}

// "-42.10", "1,234.50", "1.234,56", "(12.50)", "12.50-", "$12.50" -> { value, fixed } where fixed is the
// plain-decimal spelling, or null when already plain; returns null when the digits cannot be read
// without guessing. A QIF amount with US thousands commas is legal, so callers decide whether to rewrite.
export function normalizeAmount(raw) {
  let s = String(raw).trim();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { value: Number(s), fixed: null };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
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

// Lines -> records. A record is everything up to a "^" line. Split lines (S category, E memo, $ amount) are
// kept on the record as `splits`.
export function parseQif(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const records = [], headers = [];
  let rec = null, type = null;
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    if (raw[0] === "!") {
      headers.push({ line, text: raw.trim() });
      if (/^!Type:/i.test(raw)) type = raw.trim().slice(6).trim();
      return;
    }
    if (raw.trim() === "^") { if (rec) records.push(rec); rec = null; return; }
    if (!rec) rec = { line, type, fields: {}, lines: {}, splits: [] };
    const c = raw[0], v = raw.slice(1);
    if (c === "S") rec.splits.push({ line, category: v, amount: null });
    else if (c === "E" && rec.splits.length) rec.splits[rec.splits.length - 1].memo = v;
    else if (c === "$" && rec.splits.length) { const sp = rec.splits[rec.splits.length - 1]; sp.amount = v; sp.amountLine = line; }
    else if (!(c in rec.fields)) { rec.fields[c] = v; rec.lines[c] = line; }
  });
  return { records, headers, unterminated: rec, lines, ...(rec ? { records: [...records, rec] } : {}) };
}

// "03/04/2024", "3/4/24", "1/ 5'24", "31.12.2024" -> { a, b, y } (a, b are the first and second numbers).
export function qifDateParts(s) {
  const m = String(s).trim().match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*(['\/.\-])\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  let y = Number(m[4]);
  if (m[4].length === 2) y += m[3] === "'" ? 2000 : (y < 70 ? 2000 : 1900);
  return { a: Number(m[1]), b: Number(m[2]), y, twoDigit: m[4].length === 2 };
}

// Whole-file date order: "dmy" or "mdy" when some date can only be read one way, "mixed" when both
// appear, "unknown" when every date has both numbers 12 or under.
export function dateOrder(records) {
  let dmy = 0, mdy = 0, n = 0;
  for (const r of records) {
    const d = r.fields.D !== undefined && qifDateParts(r.fields.D);
    if (!d) continue;
    n++;
    if (d.a > 12) dmy++; else if (d.b > 12) mdy++;
  }
  return { order: dmy && mdy ? "mixed" : dmy ? "dmy" : mdy ? "mdy" : "unknown", dmy, mdy, dated: n };
}

const keyName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cents = (n) => Math.round(n * 100);

function result(findings, records, headers) {
  const errors = findings.filter((f) => f.severity === "error").length, warnings = findings.filter((f) => f.severity === "warning").length;
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.line - b.line);
  const types = [...new Set(headers.filter((h) => /^!Type:/i.test(h.text)).map((h) => h.text.slice(6).trim()))];
  return { findings, summary: { errors, warnings, transactions: records.length, types } };
}

export function validate(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line = 0, fixable = false) => findings.push({ severity, title, detail, line, fixable });
  if (looksLikeOfx(text)) {
    add("error", "This is an OFX/QFX file, not QIF", "It contains <OFX> tags. Use the OFX file check instead; this tool reads QIF only.", 1);
    return result(findings, [], []);
  }
  const p = parseQif(text);
  const typeHeaders = p.headers.filter((h) => /^!Type:/i.test(h.text));
  if (!typeHeaders.length) add("error", "No !Type: header", "A QIF file starts with a line such as !Type:Bank, !Type:CCard or !Type:Cash. Without it the importer does not know what the records are.", 1, false);
  for (const h of typeHeaders) if (!TYPES.has(h.text.slice(6).trim().toLowerCase())) add("warning", `Unknown account type "${h.text.slice(6)}"`, "Expected Bank, Cash, CCard, Invst, Oth A or Oth L.", h.line);
  if (p.headers.some((h) => /^!(Option:AutoSwitch|Clear:AutoSwitch)/i.test(h.text))) add("info", "AutoSwitch block present", "This is a multi-account export. Each !Account section is checked as part of one file; import accounts one at a time if your importer reads only the first.", 0);
  if (!p.records.length) add("error", "No transactions found", "No records ended by a ^ line were found.", 0);
  if (p.unterminated) add("error", "Last record has no closing ^", "Every record must end with a line containing only ^. The final transaction is dropped by most importers.", p.unterminated.line, true);

  const { order, dmy, mdy, dated } = dateOrder(p.records);
  const seen = new Map();
  let prev = null, outOfOrder = 0, future = 0;
  const now = opts.now || new Date();
  for (const r of p.records) {
    const f = r.fields;
    if (f.D === undefined) add("error", "Record has no date (D)", "A transaction needs a D line.", r.line);
    else {
      const d = qifDateParts(f.D);
      if (!d) add("error", "Date not readable", `"${f.D}" is not a date like 12/31/2024, 31/12/2024 or 12/31'24.`, r.lines.D);
      else {
        const [mo, da] = order === "dmy" ? [d.b, d.a] : [d.a, d.b];
        if (order !== "unknown" && order !== "mixed" && (mo < 1 || mo > 12 || da < 1 || da > 31)) add("error", "Impossible date", `"${f.D}" has a day or month out of range for the order this file uses.`, r.lines.D);
        else if (order === "unknown" && (d.a === 0 || d.b === 0 || d.a > 31 || d.b > 31)) add("error", "Impossible date", `"${f.D}" has a day or month out of range.`, r.lines.D);
        if (d.twoDigit) add("info", "Two-digit year", `"${f.D}" — the importer guesses the century.`, r.lines.D);
        if (order === "dmy" || order === "mdy") {
          const dt = new Date(Date.UTC(d.y, mo - 1, da));
          if (dt.getUTCMonth() === mo - 1 && dt > now) future++;
          const key = d.y * 10000 + mo * 100 + da;
          if (prev && key < prev) outOfOrder++;
          prev = key;
        }
      }
    }
    const rawAmt = f.T !== undefined ? f.T : f.U;
    let amt = null;
    if (rawAmt === undefined) add("error", "Record has no amount (T)", "A transaction needs a T line.", r.line);
    else {
      const a = normalizeAmount(rawAmt);
      if (!a) add("error", "Amount not readable", `"${rawAmt}" cannot be read as an amount without guessing.`, r.lines.T || r.lines.U || r.line);
      else {
        amt = a.value;
        if (a.fixed !== null && !/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(String(rawAmt).trim())) add("warning", "Amount is not a plain decimal", `"${rawAmt}" is read as ${a.fixed}; write it that way so every importer agrees.`, r.lines.T || r.lines.U, true);
        if (a.value === 0) add("warning", "Zero amount", "A zero-value transaction is usually an error.", r.lines.T || r.line);
      }
    }
    if (r.splits.length) {
      const parts = r.splits.map((s) => (s.amount === null ? null : normalizeAmount(s.amount)));
      if (parts.some((x) => x === null)) add("error", "Split line has no readable amount", "Each S (category) line needs a $ amount.", r.splits[0].line);
      else if (amt !== null && cents(parts.reduce((s, x) => s + x.value, 0)) !== cents(amt)) add("error", "Split amounts do not add up to the total", `The splits sum to ${(parts.reduce((s, x) => s + x.value, 0)).toFixed(2)} but T is ${amt.toFixed(2)}. Importers reject the transaction or post an unbalanced one.`, r.splits[0].line);
    }
    if (!f.P && !f.M) add("warning", "No payee or memo", "The row will import with no description.", r.line);
    if (f.C !== undefined && !/^[*cXR]?$/.test(f.C.trim())) add("warning", "Unusual cleared flag", `C${f.C} is not blank, *, c, X or R.`, r.lines.C);
    if (f.D !== undefined && rawAmt !== undefined) {
      const k = `${f.D.trim()}|${amt}|${keyName(f.P)}`;
      if (seen.has(k)) add("warning", "Looks like a repeat of an earlier record", `Same date, amount and payee as the record on line ${seen.get(k)}. QIF carries no transaction ID, so a file downloaded twice imports twice; if these are two real purchases, ignore this.`, r.line);
      else seen.set(k, r.line);
    }
  }
  if (order === "mixed") add("error", "Dates mix day-first and month-first", `${dmy} date(s) can only be day/month and ${mdy} can only be month/day. The file was probably joined from two sources; no import setting reads both.`, 0);
  else if (dated && order === "unknown") add("warning", "Date order cannot be told from the file", "Every date has both numbers 12 or under, so 03/04/2024 could be 3 April or March 4. QIF declares no order. Set the importer's date format to match where the bank is, and spot-check one transaction after importing.", 0);
  else if (dated) add("info", order === "dmy" ? "Dates are day/month/year" : "Dates are month/day/year", `Proven by ${order === "dmy" ? dmy : mdy} date(s) that can only be read that way. Make the importer's date setting match.`, 0);
  if (future) add("warning", `${future} date${future === 1 ? "" : "s"} in the future`, "Usually a day/month swap or a wrong century.", 0);
  if (outOfOrder) add("info", `${outOfOrder} record${outOfOrder === 1 ? "" : "s"} out of date order`, "Harmless to most importers.", 0);
  return result(findings, p.records, p.headers);
}

// Fixes only what is provable. opts.convertDates: "mdy" | "dmy" -> rewrite every D line to MM/DD/YYYY or
// DD/MM/YYYY using the order proven by the file (or, when the file cannot prove one, the order given in
// opts.order). Returns { text, changes }.
export function repair(text, opts = {}) {
  if (looksLikeOfx(text)) return { text: String(text), changes: [] };
  const p = parseQif(text);
  const changes = [];
  const lines = p.lines.slice();
  const eol = /\r\n/.test(String(text)) ? "\r\n" : "\n";
  for (const r of p.records) {
    for (const c of ["T", "U"]) {
      if (r.fields[c] === undefined) continue;
      const a = normalizeAmount(r.fields[c]);
      const ln = r.lines[c];
      if (a && a.fixed !== null && !/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(r.fields[c].trim())) { lines[ln - 1] = c + a.fixed; changes.push(`Line ${ln}: amount ${r.fields[c]} written as ${a.fixed}.`); }
    }
  }
  const proven = dateOrder(p.records).order;
  const order = proven === "dmy" || proven === "mdy" ? proven : opts.order;
  if (opts.convertDates && (order === "dmy" || order === "mdy") && proven !== "mixed") {
    let n = 0;
    for (const r of p.records) {
      const d = r.fields.D !== undefined && qifDateParts(r.fields.D);
      if (!d) continue;
      const [mo, da] = order === "dmy" ? [d.b, d.a] : [d.a, d.b];
      if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
      const out = opts.convertDates === "dmy" ? `${String(da).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${d.y}` : `${String(mo).padStart(2, "0")}/${String(da).padStart(2, "0")}/${d.y}`;
      if (lines[r.lines.D - 1] !== "D" + out) { lines[r.lines.D - 1] = "D" + out; n++; }
    }
    if (n) changes.push(`${n} date${n === 1 ? "" : "s"} rewritten as ${opts.convertDates === "dmy" ? "DD/MM/YYYY" : "MM/DD/YYYY"} with a four-digit year (read as ${order === "dmy" ? "day/month" : "month/day"}${proven === order ? ", proven by the file" : ", the order you chose"}).`);
  }
  let out = lines.join(eol);
  if (p.unterminated) { out = out.replace(/\s*$/, "") + eol + "^" + eol; changes.push(`Line ${p.unterminated.line}: closing ^ added after the last record.`); }
  if (!p.headers.some((h) => /^!Type:/i.test(h.text)) && opts.assumeType) { out = `!Type:${opts.assumeType}${eol}` + out; changes.unshift(`Added !Type:${opts.assumeType} at the top, as you chose.`); }
  return { text: out, changes };
}

export function findingsCsv(res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,problem,detail,auto_fixable", ...res.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return `!Type:Bank
D01/05/2024
T-42.10
PCORNER GROCERY
LGroceries
^
D01/12/2024
T1500.00
PPAYROLL ACME CO
LSalary
^
D01/20/2024
T-89.99
PINTERNET SERVICE
LUtilities
^
`;
}

export function sampleBrokenFile() {
  return `D13/01/2024
T-42,10
PCORNER GROCERY
^
D01/13/2024
T(18.00)
PAT&T WIRELESS
^
D02/03/2024
T-100.00
PHARDWARE STORE
SMaterials
$-60.00
SSupplies
$-30.00
^
D02/03/2024
T-100.00
PHARDWARE STORE
SMaterials
$-60.00
SSupplies
$-30.00
^
D05/01/24
Tabc
PUNKNOWN
^
D06/01/2024
T-5.00
PCAFE`;
}
