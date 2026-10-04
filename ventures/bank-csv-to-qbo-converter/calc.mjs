// Bank CSV -> QBO / OFX / QIF converter. Pure functions, no DOM, no network.
// Money is held as integer minor units (cents) so nothing is summed as a float.

export const MAX_ROWS = 50000;

// ---------- CSV ----------

export function decodeBuffer(buf) {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { text = new TextDecoder("windows-1252").decode(bytes); }
  return text.replace(/^﻿/, "");
}

export function detectDelimiter(text) {
  const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ",", bestScore = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = head.map((l) => parseCsv(l, d)[0]?.length || 0);
    const min = Math.min(...counts);
    if (counts.length && min > 1 && min * (counts.every((c) => c === counts[0]) ? 2 : 1) > bestScore) { best = d; bestScore = min * (counts.every((c) => c === counts[0]) ? 2 : 1); }
  }
  return best;
}

export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [], field = "", inQuotes = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"' && field === "") { inQuotes = true; started = true; }
    else if (c === delimiter) { row.push(field); field = ""; started = true; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (started || field !== "") { row.push(field); rows.push(row); }
      row = []; field = ""; started = false;
    } else { field += c; started = true; }
  }
  if (started || field !== "") { row.push(field); rows.push(row); }
  return rows;
}

// ---------- columns ----------

const SYN = {
  date: ["date", "posted date", "post date", "posting date", "transaction date", "trans date", "booking date", "date posted", "effective date", "settlement date"],
  desc: ["description", "payee", "name", "details", "transaction description", "narrative", "merchant", "memo/description", "original description", "reference description"],
  memo: ["memo", "notes", "note", "category", "extended description"],
  amount: ["amount", "transaction amount", "amt", "value", "net amount"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "charge", "payments"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "received"],
  type: ["type", "transaction type", "dr/cr", "debit/credit", "cr/dr"],
  check: ["check number", "check no", "cheque number", "check #", "number", "check", "cheque no", "ref", "reference", "reference number"],
  balance: ["balance", "running balance", "available balance", "ledger balance"],
};

export function detectColumns(header) {
  const norm = header.map((h) => String(h).trim().toLowerCase().replace(/\s+/g, " "));
  const out = {};
  for (const key of Object.keys(SYN)) {
    let idx = -1;
    for (const s of SYN[key]) { idx = norm.indexOf(s); if (idx >= 0) break; }
    if (idx < 0) idx = norm.findIndex((h) => SYN[key].some((s) => h.includes(s)) && !Object.values(out).includes(norm.indexOf(h)));
    if (idx >= 0 && !Object.values(out).includes(idx)) out[key] = idx;
  }
  return out;
}

export function looksLikeHeader(row) {
  return row.some((c) => /[a-z]/i.test(c)) && !row.some((c) => parseAmountText(c, ".") !== null && /\d/.test(c) && /^[\s$€£()+-]*[\d,.]+/.test(c) && /[.,]\d{2}\s*$/.test(c));
}

// ---------- amounts and dates ----------

export function parseAmountText(raw, decimal = ".") {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ""); }
  if (/\bCR\b\s*$/i.test(s)) s = s.replace(/\s*CR\s*$/i, "");
  if (/\bDR\b\s*$/i.test(s)) { neg = !neg; s = s.replace(/\s*DR\s*$/i, ""); }
  s = s.replace(/^[A-Z]{3}(?=[\s\d(-])|(?<=\d)\s*[A-Z]{3}$/, "").replace(/[$€£¥\s\u00a0]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); } else if (s.startsWith("+")) s = s.slice(1);
  if (!s || !/^[\d.,']+$/.test(s)) return null;
  const group = decimal === "." ? /[,']/g : /[.']/g;
  s = s.replace(group, "");
  if (decimal === ",") s = s.replace(",", ".");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && !m[2])) return null;
  const frac = m[2] || "";
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) return null;
  const cents = Number(m[1] || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

export function detectDecimal(values) {
  let dot = 0, comma = 0;
  for (const v of values) {
    const s = String(v).replace(/[^\d.,]/g, "");
    if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s)) dot++;
  }
  return comma > dot ? "," : ".";
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validYmd(y, m, d) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d <= dim;
}

export function splitDate(raw) {
  const s = String(raw).trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/, "");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return { kind: "YMD", a: +m[1], b: +m[2], c: +m[3] };
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return { kind: "YMD", a: +m[1], b: +m[2], c: +m[3] };
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*[-/. ,]+(\d{2,4})$/.exec(s);
  if (m && MONTHS.includes(m[2].toLowerCase())) return { kind: "DMON", a: +m[1], b: MONTHS.indexOf(m[2].toLowerCase()) + 1, c: expandYear(+m[3]) };
  m = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{1,2}),? (\d{2,4})$/.exec(s);
  if (m && MONTHS.includes(m[1].toLowerCase())) return { kind: "MONDY", a: MONTHS.indexOf(m[1].toLowerCase()) + 1, b: +m[2], c: expandYear(+m[3]) };
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) return { kind: "XXY", a: +m[1], b: +m[2], c: expandYear(+m[3]) };
  return null;
}
function expandYear(y) { return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y; }

// Decide MDY vs DMY from the whole column: any first part > 12 means day first,
// any second part > 12 means month first. Both clean => ambiguous.
export function detectDateOrder(values) {
  let dayFirst = 0, monthFirst = 0, ambiguous = 0, seen = 0;
  for (const v of values) {
    const p = splitDate(v);
    if (!p || p.kind !== "XXY") continue;
    seen++;
    if (p.a > 12 && p.b <= 12) dayFirst++;
    else if (p.b > 12 && p.a <= 12) monthFirst++;
    else if (p.a <= 12 && p.b <= 12 && p.a !== p.b) ambiguous++;
  }
  if (dayFirst && !monthFirst) return { order: "DMY", ambiguous: false };
  if (monthFirst && !dayFirst) return { order: "MDY", ambiguous: false };
  if (dayFirst && monthFirst) return { order: "MDY", ambiguous: false, conflict: true };
  return { order: "MDY", ambiguous: seen > 0 && ambiguous > 0 };
}

export function toIsoDate(raw, order) {
  const p = splitDate(raw);
  if (!p) return null;
  let y, m, d;
  if (p.kind === "YMD") ({ a: y, b: m, c: d } = p);
  else if (p.kind === "DMON") ({ a: d, b: m, c: y } = p);
  else if (p.kind === "MONDY") ({ a: m, b: d, c: y } = p);
  else if (order === "DMY") ({ a: d, b: m, c: y } = p);
  else ({ a: m, b: d, c: y } = p);
  if (!validYmd(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function money(cents) {
  const neg = cents < 0, a = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

// ---------- conversion ----------

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function guessTrnType(cents, desc) {
  const d = desc.toUpperCase();
  if (/\bATM\b/.test(d)) return "ATM";
  if (/\bCHECK\b|\bCHEQUE\b/.test(d)) return "CHECK";
  if (/\bINTEREST\b/.test(d) && cents > 0) return "INT";
  if (/\bFEE\b|\bSERVICE CHARGE\b/.test(d) && cents < 0) return "SRVCHG";
  if (/\bDIVIDEND\b/.test(d)) return "DIV";
  if (/\bTRANSFER\b|\bXFER\b/.test(d)) return cents < 0 ? "XFER" : "XFER";
  return cents < 0 ? "DEBIT" : "CREDIT";
}

export function convert(text, options = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || null });
  const clean = String(text || "").replace(/^﻿/, "");
  const delimiter = options.delimiter || detectDelimiter(clean);
  let rows = parseCsv(clean, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  const result = { delimiter, columns: {}, transactions: [], findings, summary: { rows: 0, imported: 0, skipped: 0, credits: 0, debits: 0, net: 0, from: null, to: null, dateOrder: null } };
  if (!rows.length) { add("error", "No rows found", "The text is empty or is not delimited text."); return result; }
  if (rows.length > MAX_ROWS) { add("error", "File too large", `More than ${MAX_ROWS} rows; split the file by month.`); return result; }

  let startRow = 0, cols;
  if (looksLikeHeader(rows[0])) { cols = detectColumns(rows[0]); startRow = 1; }
  else { cols = {}; add("warning", "No header row found", "The first row looks like data. Columns are guessed from the values: date, description, amount."); }
  let data = rows.slice(startRow);

  if (options.columns) cols = { ...cols, ...options.columns };
  if (!("date" in cols) || (!("amount" in cols) && !("debit" in cols && "credit" in cols) && !("debit" in cols) && !("credit" in cols))) {
    // guess from values
    const width = Math.max(...data.slice(0, 20).map((r) => r.length));
    for (let c = 0; c < width; c++) {
      const vals = data.slice(0, 20).map((r) => r[c] || "").filter(Boolean);
      if (!vals.length) continue;
      if (!("date" in cols) && vals.every((v) => splitDate(v))) { cols.date = c; continue; }
    }
    for (let c = 0; c < width; c++) {
      if (Object.values(cols).includes(c)) continue;
      const vals = data.slice(0, 20).map((r) => r[c] || "").filter(Boolean);
      if (!vals.length) continue;
      if (!("amount" in cols) && !("debit" in cols) && vals.every((v) => parseAmountText(v, detectDecimal(vals)) !== null)) cols.amount = c;
      else if (!("desc" in cols) && vals.some((v) => /[A-Za-z]{3}/.test(v))) cols.desc = c;
    }
  }
  result.columns = cols;
  if (!("date" in cols)) { add("error", "No date column", "Name a column Date, Posted Date or Transaction Date, or choose it in the column mapping."); return result; }
  if (!("amount" in cols) && !("debit" in cols) && !("credit" in cols)) { add("error", "No amount column", "Name a column Amount, or Debit and Credit, or choose them in the column mapping."); return result; }

  const get = (r, k) => (k in cols ? (r[cols[k]] ?? "").trim() : "");
  const amountVals = data.map((r) => [get(r, "amount"), get(r, "debit"), get(r, "credit")]).flat().filter(Boolean);
  const decimal = options.decimal || detectDecimal(amountVals);
  const dateInfo = options.dateOrder ? { order: options.dateOrder, ambiguous: false } : detectDateOrder(data.map((r) => get(r, "date")));
  result.summary.dateOrder = dateInfo.order;
  if (dateInfo.ambiguous) add("warning", "Date order is ambiguous", `Every date has both parts 12 or under, so ${dateInfo.order === "DMY" ? "day/month" : "month/day"} was assumed. Pick the other order if 03/04/2026 means ${dateInfo.order === "DMY" ? "March 4" : "4 April"}.`);
  if (dateInfo.conflict) add("warning", "Mixed date orders", "Some dates only make sense as month/day and others as day/month. Month first was used; check the file.");

  const flip = Boolean(options.flipSign);
  const typeIsDrCr = "type" in cols && data.slice(0, 50).some((r) => /^(debit|credit|dr|cr|d|c)$/i.test(get(r, "type")));
  const seen = new Map();
  let lineNo = startRow;
  for (const r of data) {
    lineNo++;
    result.summary.rows++;
    const rawDate = get(r, "date");
    const iso = toIsoDate(rawDate, dateInfo.order);
    if (!iso) { add("error", "Row skipped: unreadable date", `"${rawDate}" is not a date this tool recognises.`, lineNo); result.summary.skipped++; continue; }
    let cents = null;
    if ("amount" in cols && get(r, "amount") !== "") {
      cents = parseAmountText(get(r, "amount"), decimal);
      if (cents !== null && typeIsDrCr) {
        const t = get(r, "type");
        if (/^(debit|dr|d)$/i.test(t) && cents > 0) cents = -cents;
        if (/^(credit|cr|c)$/i.test(t) && cents < 0) cents = -cents;
      }
    } else {
      const dr = get(r, "debit") ? parseAmountText(get(r, "debit"), decimal) : 0;
      const cr = get(r, "credit") ? parseAmountText(get(r, "credit"), decimal) : 0;
      if (dr === null || cr === null) cents = null;
      else {
        if (dr && cr) add("warning", "Debit and credit both filled", "Both columns have a value on this row; they were netted.", lineNo);
        cents = cr - Math.abs(dr);
        if (get(r, "debit") === "" && get(r, "credit") === "") cents = null;
      }
    }
    if (cents === null) { add("error", "Row skipped: unreadable amount", `The amount on this row could not be read as a number (${[get(r, "amount"), get(r, "debit"), get(r, "credit")].filter(Boolean).join(" / ") || "empty"}).`, lineNo); result.summary.skipped++; continue; }
    if (flip) cents = -cents;
    const desc = get(r, "desc") || get(r, "memo") || "(no description)";
    const memo = get(r, "desc") ? get(r, "memo") : "";
    const check = get(r, "check");
    const key = `${iso}|${cents}|${desc}`;
    const nth = (seen.get(key) || 0) + 1;
    seen.set(key, nth);
    result.transactions.push({ line: lineNo, date: iso, cents, desc, memo, check: /^\d{1,9}$/.test(check) ? check : "", fitid: `${iso.replace(/-/g, "")}${fnv(key)}${nth > 1 ? "-" + nth : ""}`, type: guessTrnType(cents, desc), balance: "balance" in cols && get(r, "balance") !== "" ? parseAmountText(get(r, "balance"), decimal) : null });
  }

  const tx = result.transactions;
  for (const [key, n] of seen) if (n > 1) add("warning", "Identical rows", `${n} rows share the same date, amount and description (${key.replaceAll("|", " · ")}). They get distinct IDs so both import; confirm they are not an export overlap.`);
  const today = options.today || new Date().toISOString().slice(0, 10);
  const future = tx.filter((t) => t.date > today);
  if (future.length) add("warning", "Dates in the future", `${future.length} row(s) are dated after ${today}; the first is ${future[0].date}.`, future[0].line);
  if (tx.length) {
    const dates = tx.map((t) => t.date).sort();
    result.summary.from = dates[0]; result.summary.to = dates[dates.length - 1];
    if (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0]) > 800 * 86400000) add("info", "Long date range", "The file spans more than two years; QuickBooks Online imports are easier to reconcile one statement period at a time.");
  }
  for (const t of tx) { result.summary.net += t.cents; if (t.cents >= 0) result.summary.credits += t.cents; else result.summary.debits += t.cents; }
  result.summary.imported = tx.length;
  if (tx.length && tx.every((t) => t.cents > 0)) add("warning", "Every amount is positive", "A bank export normally has both money in and money out. If this is a credit card file, positive charges may need the sign flipped.");
  if (tx.length && tx.every((t) => t.cents < 0)) add("warning", "Every amount is negative", "Only money out was found. If the file lists payments as positive in a separate column, check the column mapping.");

  // balance continuity, when the file carries a running balance
  const withBal = tx.filter((t) => t.balance !== null);
  if (withBal.length >= 3) {
    let breaks = 0, firstBreak = null;
    const sorted = tx.every((t, i) => i === 0 || tx[i - 1].date <= t.date) ? tx : tx.every((t, i) => i === 0 || tx[i - 1].date >= t.date) ? [...tx].reverse() : null;
    if (sorted) {
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].balance === null || sorted[i - 1].balance === null) continue;
        if (sorted[i - 1].balance + sorted[i].cents !== sorted[i].balance) { breaks++; firstBreak = firstBreak || sorted[i]; }
      }
      if (breaks) add("warning", "Running balance does not follow the amounts", `${breaks} row(s) have a balance that is not the previous balance plus the amount; the first is line ${firstBreak.line}. A row may be missing, duplicated or in the wrong sign.`, firstBreak.line);
    }
  }
  if (!tx.length) add("error", "Nothing to convert", "No row could be read as a transaction.");
  return result;
}

// ---------- exporters ----------

const ofxEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[^\x20-\x7e]/g, "?");
const ymd = (iso) => iso.replace(/-/g, "");
const acctTypes = { checking: "CHECKING", savings: "SAVINGS", moneymrkt: "MONEYMRKT", credit: "CREDITCARD" };

export function toOfx(result, o = {}) {
  const type = o.accountType || "checking";
  const cc = type === "credit";
  const cur = (o.currency || "USD").toUpperCase();
  const tx = [...result.transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line));
  const now = (o.now || new Date().toISOString()).replace(/[-:T]/g, "").slice(0, 14);
  const first = tx[0]?.date || now.slice(0, 8), last = tx[tx.length - 1]?.date || first;
  const acctId = ofxEsc(o.accountId || "0000").slice(0, 22);
  const lines = [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX>",
    "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>" + `<DTSERVER>${now}<LANGUAGE>ENG` +
      `<FI><ORG>${ofxEsc(o.org || "Bank")}<FID>${ofxEsc(o.fid || "0000")}</FI>` + (o.intuBid ? `<INTU.BID>${ofxEsc(o.intuBid)}` : "") + "</SONRS></SIGNONMSGSRSV1>",
    cc ? "<CREDITCARDMSGSRSV1><CCSTMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><CCSTMTRS>" : "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS><STMTRS>",
    `<CURDEF>${cur}`,
    cc ? `<CCACCTFROM><ACCTID>${acctId}</CCACCTFROM>` : `<BANKACCTFROM><BANKID>${ofxEsc(o.routing || "000000000")}<ACCTID>${acctId}<ACCTTYPE>${acctTypes[type] || "CHECKING"}</BANKACCTFROM>`,
    `<BANKTRANLIST><DTSTART>${ymd(first)}120000<DTEND>${ymd(last)}120000`,
  ];
  for (const t of tx) {
    const name = ofxEsc(t.desc.slice(0, 32));
    lines.push(`<STMTTRN><TRNTYPE>${t.type}<DTPOSTED>${ymd(t.date)}120000<TRNAMT>${money(t.cents)}<FITID>${t.fitid}` + (t.check ? `<CHECKNUM>${t.check}` : "") + `<NAME>${name}` + (t.memo || t.desc.length > 32 ? `<MEMO>${ofxEsc((t.memo || t.desc).slice(0, 255))}` : "") + "</STMTTRN>");
  }
  lines.push("</BANKTRANLIST>");
  if (o.endingBalanceCents != null) lines.push(`<LEDGERBAL><BALAMT>${money(o.endingBalanceCents)}<DTASOF>${ymd(last)}120000</LEDGERBAL>`);
  lines.push(cc ? "</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>" : "</STMTRS></STMTTRNRS></BANKMSGSRSV1>", "</OFX>");
  return lines.join("\r\n") + "\r\n";
}

export function toQif(result, o = {}) {
  const tx = [...result.transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.line - b.line));
  const out = [o.accountType === "credit" ? "!Type:CCard" : "!Type:Bank"];
  for (const t of tx) {
    const [y, m, d] = t.date.split("-");
    out.push(`D${m}/${d}/${y}`, `T${money(t.cents)}`);
    if (t.check) out.push(`N${t.check}`);
    out.push(`P${t.desc.replace(/[\r\n]+/g, " ")}`);
    if (t.memo) out.push(`M${t.memo.replace(/[\r\n]+/g, " ")}`);
    out.push("^");
  }
  return out.join("\r\n") + "\r\n";
}

function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCleanCsv(result) {
  const rows = [["Date", "Description", "Amount", "Memo", "Check Number", "ID"]];
  for (const t of result.transactions) rows.push([t.date, t.desc, money(t.cents), t.memo, t.check, t.fitid]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function findingsCsv(result) {
  const rows = [["Severity", "Line", "Title", "Detail"]];
  for (const f of result.findings) rows.push([f.severity, f.line || "", f.title, f.detail]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function maskAccount(a) {
  const s = String(a || "");
  return s.length <= 4 ? s : "*".repeat(s.length - 4) + s.slice(-4);
}

// ---------- examples ----------

export function sampleCsv() {
  return [
    "Date,Description,Debit,Credit,Balance",
    "10/01/2026,OPENING DEPOSIT,,5000.00,5000.00",
    "10/02/2026,CHECK 1042 ACME SUPPLY,812.40,,4187.60",
    "10/03/2026,\"STRIPE PAYOUT, ORDERS\",,1260.15,5447.75",
    "10/05/2026,MONTHLY SERVICE FEE,15.00,,5432.75",
    "10/07/2026,ATM WITHDRAWAL MAIN ST,200.00,,5232.75",
    "10/09/2026,INTEREST PAID,,1.84,5234.59",
  ].join("\n");
}

export function sampleEuropean() {
  return [
    "Buchungstag;Verwendungszweck;Betrag;Saldo",
    "03.10.2026;Miete Büro Oktober;-1.250,00;8.750,00",
    "13.10.2026;Rechnung 2026-117 Müller GmbH;2.380,50;11.130,50",
    "15.10.2026;Strom Abschlag;-96,40;11.034,10",
  ].join("\n");
}

export function sampleBroken() {
  return [
    "Date,Description,Amount,Balance",
    "10/01/2026,Opening,5000.00,5000.00",
    "10/02/2026,Coffee Roasters,-18.50,4981.50",
    "10/02/2026,Coffee Roasters,-18.50,4963.00",
    "10/03/2026,Office Depot,($142.19),4800.00",
    "10/13/2026,Client payment,900.00,5700.00",
    "01/15/2027,Annual software,-99.00,5601.00",
    "not a date,Mystery,12.00,",
    "10/08/2026,Software,12.9x,",
  ].join("\n");
}
