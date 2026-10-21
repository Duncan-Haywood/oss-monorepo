// Bank and card CSV reading: one statement file in, a list of transactions out,
// each with an ISO date, a description, a signed amount in integer cents (money
// INTO the account is positive) and, when the file has one, the running
// balance the bank printed. Column names are matched by alias. Pure functions,
// no DOM, no network.

const ALIASES = {
  date: ["date", "transaction date", "posted date", "post date", "posting date", "trans date", "booking date", "effective date", "value date"],
  desc: ["description", "transaction description", "payee", "merchant", "name", "details", "original description", "memo", "narrative", "reference"],
  amount: ["amount", "transaction amount", "amt", "value", "amount (usd)"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "amount debit", "debit amount"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "amount credit", "credit amount"],
  balance: ["balance", "running balance", "running bal.", "ledger balance"],
};

// RFC 4180 CSV: quoted fields, doubled quotes, CRLF, a BOM, and a ; or tab
// delimiter when the header has more of those than commas.
export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const head = s.slice(0, s.indexOf("\n") === -1 ? s.length : s.indexOf("\n"));
  const counts = [",", ";", "\t"].map((d) => [d, head.split(d).length]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// "1,234.56", "(12.00)", "-$5", "12.00-", "1.234,56" (decimalComma) -> cents.
export function parseCents(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[^0-9]*[-−]/.test(s) || /-\s*$/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!s) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  const c = Math.round(n * 100);
  return neg ? -c : c;
}

// ISO, M/D/Y or D/M/Y (dayFirst), with 2- or 4-digit years, or "12 Mar 2026".
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(v, dayFirst = false) {
  const s = String(v ?? "").trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    [m, d] = dayFirst ? [+x[2], +x[1]] : [+x[1], +x[2]];
    y = +x[3] < 100 ? 2000 + +x[3] : +x[3];
  } else if ((x = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -,]+(\d{2,4})/))) {
    [d, m, y] = [+x[1], MONTHS[x[2].toLowerCase()], +x[3] < 100 ? 2000 + +x[3] : +x[3]];
  } else if ((x = s.match(/^([A-Za-z]{3})[A-Za-z]* (\d{1,2}),? (\d{4})/))) {
    [m, d, y] = [MONTHS[x[1].toLowerCase()], +x[2], +x[3]];
  }
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

const norm = (h) => String(h).trim().toLowerCase().replace(/\s+/g, " ").replace(/^"|"$/g, "");

export function detectColumns(header) {
  const h = header.map(norm);
  const find = (key) => {
    for (const a of ALIASES[key]) { const i = h.indexOf(a); if (i !== -1) return i; }
    return -1;
  };
  const cols = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, find(k)]));
  if (cols.desc === -1) {
    // Some banks split payee and memo; take the first text-looking column left.
    cols.desc = h.findIndex((x, i) => !Object.values(cols).includes(i) && /desc|payee|name|memo|detail/.test(x));
  }
  return cols;
}

// Wells Fargo checking exports have no header row: date, amount, "*", check
// number, description. Recognised by shape, since there is nothing to name.
function headerlessShape(rows) {
  const sample = rows.slice(0, 5);
  return sample.length > 0 && sample.every((r) => r.length === 5 && parseDate(r[0]) && /^[-+]?\$?[\d,]*\.?\d+$/.test(r[1].trim()) && r[2].trim() === "*");
}

// Which export this is, from its header or shape alone. Informational; the
// column matching does the work. null when it is none of the five shapes.
export function sniffBank(rows) {
  if (headerlessShape(rows)) return "wells-fargo";
  for (const r of rows.slice(0, 12)) {
    const h = r.map(norm).join("|");
    if (/^details\|posting date\|description\|amount\|type\|balance/.test(h)) return "chase-checking";
    if (/^transaction date\|post date\|description\|category\|type\|amount/.test(h)) return "chase-card";
    if (/^date\|description\|amount\|running bal/.test(h)) return "bank-of-america";
    if (/^transaction date\|posted date\|card no\.\|description\|category\|debit\|credit/.test(h)) return "capital-one";
    if (/^date\|description\|(card member\|account #\|)?amount/.test(h)) return "amex";
  }
  return null;
}

// Card exports disagree on which sign is a charge (Amex lists charges as
// positive, Chase as negative). The payment rows settle it: a payment lowers
// what is owed, so charges carry the opposite sign.
function chargesArePositive(rows) {
  const pay = rows.filter((r) => /payment.*thank you|autopay|automatic payment|online payment/i.test(r.desc));
  if (pay.length === 0) return null;
  const neg = pay.filter((r) => r.cents < 0).length;
  return neg > pay.length / 2;
}

// -> { rows: [{ line, date, desc, cents, balance }], problems: [string], columns, bank, inferred }
// `invert` flips signs for card exports that list charges as positive. Leave it
// undefined and a file with no running balance that has payment rows is
// flipped when its payments are negative (`inferred` says so).
export function readStatement(text, { dayFirst = false, decimalComma = false, invert } = {}) {
  const rows = parseCsv(text);
  const problems = [];
  if (rows.length < 2 && !(rows.length === 1 && headerlessShape(rows))) return { rows: [], problems: ["The file has no data rows."], columns: null };
  const bank = sniffBank(rows);
  let headerAt = rows.findIndex((r) => { const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); });
  let columns, first;
  if (headerAt === -1 && bank === "wells-fargo") { columns = { date: 0, amount: 1, desc: 4, balance: -1, debit: -1, credit: -1 }; first = 0; }
  else if (headerAt === -1) return { rows: [], problems: ["No date and amount columns were found. Name them Date and Amount (or Debit and Credit)."], columns: null };
  else { columns = detectColumns(rows[headerAt]); first = headerAt + 1; }
  const out = [];
  for (let i = first; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[columns.date], dayFirst);
    if (!date) { problems.push(`Line ${i + 1}: unreadable date "${r[columns.date] ?? ""}", skipped.`); continue; }
    let cents;
    if (columns.amount !== -1 && String(r[columns.amount] ?? "").trim() !== "") cents = parseCents(r[columns.amount], decimalComma);
    else cents = (columns.credit !== -1 ? Math.abs(parseCents(r[columns.credit], decimalComma) || 0) : 0) - (columns.debit !== -1 ? Math.abs(parseCents(r[columns.debit], decimalComma) || 0) : 0);
    if (!Number.isFinite(cents)) { problems.push(`Line ${i + 1}: unreadable amount, skipped.`); continue; }
    if (cents === 0) continue;
    const balance = columns.balance !== -1 && String(r[columns.balance] ?? "").trim() !== "" ? parseCents(r[columns.balance], decimalComma) : null;
    out.push({ line: i + 1, date, desc: String(r[columns.desc] ?? "").trim().replace(/\s+/g, " "), cents, balance: Number.isFinite(balance) ? balance : null });
  }
  let inferred = null;
  let flip = !!invert;
  if (invert === undefined && out.every((r) => r.balance === null) && columns.amount !== -1) {
    const pos = chargesArePositive(out);
    if (pos) { flip = true; inferred = "Charges were positive (the payment rows are negative), so signs were flipped."; }
  }
  if (flip) for (const r of out) r.cents = -r.cents;
  return { rows: out, problems, columns, bank, inferred };
}

// A stable id per row so importing the same statement twice adds nothing: the
// account, date, amount and description, plus how many identical rows came
// before it in this file (two real $4.50 coffees on one day stay two rows).
export function rowIds(rows, account) {
  const seen = new Map();
  return rows.map((r) => {
    const base = `${account}|${r.date}|${r.cents}|${r.desc.toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${hash(base)}-${n}`;
  });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// When the file has a running balance, check each row against the one before:
// a mismatch means a missing, duplicated or mis-signed row. Banks print rows
// newest-first or oldest-first, so both orders are tried.
export function checkRunningBalance(rows) {
  const withBal = rows.filter((r) => r.balance !== null);
  if (withBal.length < 2 || withBal.length !== rows.length) return { checked: false, breaks: [] };
  const tryOrder = (list) => {
    const breaks = [];
    for (let i = 1; i < list.length; i++) if (list[i - 1].balance + list[i].cents !== list[i].balance) breaks.push({ line: list[i].line, expected: list[i - 1].balance + list[i].cents, printed: list[i].balance });
    return breaks;
  };
  const fwd = tryOrder(rows), back = tryOrder([...rows].reverse());
  const breaks = fwd.length <= back.length ? fwd : back;
  const ordered = fwd.length <= back.length ? rows : [...rows].reverse();
  return { checked: true, breaks, opening: ordered[0].balance - ordered[0].cents, closing: ordered[ordered.length - 1].balance, closingDate: ordered[ordered.length - 1].date };
}
