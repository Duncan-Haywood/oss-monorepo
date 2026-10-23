// Bank and card CSV reading: one statement file in, a list of transactions out,
// each with an ISO date, a description, a signed amount in integer cents (money
// INTO the account is positive) and, when the file has one, the running
// balance the bank printed. Column names are matched by alias. Pure functions,
// no DOM, no network.

import { isMt940, isCamt, readMt940, readCamt } from "./sepa.mjs";
import { isBai2, readBai2 } from "./bai2.mjs";
import { isN43, readN43 } from "./n43.mjs";
import { isCfonb, readCfonb } from "./cfonb.mjs";
import { readStatementText } from "./statementtext.mjs";

const ALIASES = {
  date: ["date", "transaction date", "posted date", "post date", "posting date", "trans date", "booking date", "effective date", "value date", "completed date", "started date", "date (utc)", "datetime", "run date", "activity date", "txn date", "tran date",
    // German, French, Spanish, Italian, Dutch headers
    "datum", "buchungstag", "buchungsdatum", "valuta", "wertstellung", "date de l'opération", "date opération", "date operation", "fecha", "fecha operación", "fecha valor", "data", "data operazione", "data contabile", "data valuta", "boekdatum", "boekingsdatum", "transactiedatum",
    // Hungarian (OTP workbook): booking date before transaction date
    "könyvelés dátuma", "tranzakció dátuma", "dátum"],
  desc: ["description", "transaction description", "payee", "merchant", "name", "details", "original description", "memo", "posting details", "narrative", "counter party", "counterparty", "narration", "reference", "partner name", "note",
    "beschreibung", "verwendungszweck", "buchungstext", "beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger", "libellé", "libelle", "descripción", "descripcion", "concepto", "descrizione", "causale", "omschrijving", "naam / omschrijving", "naam tegenpartij", "naam tegenpartij bevat", "tegenpartij", "mededeling", "mededelingen", "vrije mededeling", "paaiškinimai", "partner neve", "közlemény"],
  amount: ["amount", "amount (total)", "transaction amount", "amt", "value", "amount (usd)", "amount ($)", "amount (gbp)", "amount (eur)", "bedrag (eur)", "cad$", "betrag", "betrag (eur)", "montant", "importe", "importo", "bedrag", "net", "suma", "összeg"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "withdrawal amt.", "withdrawal amt", "withdrawal amount", "withdrawal (-)", "withdrawals (-)", "debit (-)", "money out", "paid out", "amount debit", "debit amount", "debit amount (positive)", "outflow", "debet", "soll", "débit", "debit (eur)", "cargo", "dare", "uscite"],
  credit: ["credit", "credits", "deposit", "deposits", "deposit amt.", "deposit amt", "deposit amount", "deposit (+)", "deposits (+)", "credit (+)", "money in", "paid in", "amount credit", "credit amount", "credit amount (positive)", "inflow", "haben", "crédit", "credito", "crédito", "abono", "avere", "entrate"],
  balance: ["balance", "running balance", "runningbalance", "running bal.", "ledger balance", "closing balance", "balance (gbp)", "balance (eur)", "balance (usd)", "saldo", "kontostand", "solde", "saldo (eur)", "saldo na trn"],
};

// The delimiter is the one that splits most of the first lines into the same
// number of fields, so a one-line preamble ("Account summary") or a prose line
// with a comma above the header does not decide it. The comma wins ties.
function pickDelimiter(s) {
  const lines = s.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").slice(0, 20);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t"]) {
    const freq = new Map();
    for (const l of lines) { const n = l.replace(/"[^"]*"/g, "").split(d).length; if (n > 1) freq.set(n, (freq.get(n) ?? 0) + 1); }
    let score = 0;
    for (const [n, f] of freq) score = Math.max(score, f * 1000 + n);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

// RFC 4180 CSV: quoted fields, doubled quotes, CRLF, a BOM, and a ; or tab
// delimiter when the header has more of those than commas.
export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const delim = pickDelimiter(s);
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

// "1,234.56", "(12.00)", "-$5", "12.00-", "12.50 DR" (debit, negative), "1.234,56" (decimalComma) -> cents.
export function parseCents(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  if (/\d\s*e\s*[-+]?\d/i.test(s)) return NaN; // "1e3" is not 13.00
  const neg = /\(\s*[^()]*\d[^()]*\)/.test(s) || /^[^0-9]*[-−]/.test(s) || /-\s*$/.test(s) || /\d\s*(?:dr|db|debit)\.?\s*$/i.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  // Both separators: the last one is the decimal point, whatever the flag says.
  // One separator with 1-2 digits after it is a decimal point too; only a
  // lone separator before exactly three digits ("1,234") needs the flag.
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let comma = decimalComma;
  if (lastDot >= 0 && lastComma >= 0) comma = lastComma > lastDot;
  else if (/^\d*[.,]\d{1,2}$/.test(s) && !/[.,].*[.,]/.test(s)) comma = lastComma >= 0;
  s = comma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!s) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  const c = Math.round(n * 100);
  if (!Number.isSafeInteger(c)) return NaN;
  return neg ? -c : c;
}

// ISO, M/D/Y or D/M/Y (dayFirst), with 2- or 4-digit years, or "12 Mar 2026".
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// German, French, Spanish, Italian, Dutch and Portuguese month words (accents
// stripped, lower case) by their first three letters; the ones that differ from
// English are listed here. "juin" and "juil" share a prefix, so a word
// starting "juil" is July and "juin" June.
const MONTH_WORDS = { gen: 1, aou: 8, ene: 1, fev: 2, mrz: 3, mrt: 3, abr: 4, avr: 4, mai: 5, mei: 5, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, okt: 10, ott: 10, out: 10, dez: 12, dic: 12 };
const monthOf = (word) => {
  const w = word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/^juil/.test(w)) return 7;
  if (/^juin/.test(w)) return 6;
  const k = w.slice(0, 3);
  return MONTHS[k] || MONTH_WORDS[k] || undefined;
};
export function parseDate(v, dayFirst = false) {
  const s = String(v ?? "").trim().replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "").replace(/^(\d{1,2})(?:st|nd|rd|th)\b/i, "$1").replace(/^(\d{1,2})([A-Za-z]{3})(\d{2,4})\b/, "$1 $2 $3").replace(/^(\d{1,2})\.\s*(?=\p{L})/u, "$1 ").replace(/^(\d{1,2}) de (\p{L}+) de (\d)/u, "$1 $2 $3");
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{4})[-/.:](\d{1,2})[-/.:](\d{1,2})/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    [m, d] = dayFirst ? [+x[2], +x[1]] : [+x[1], +x[2]];
    y = +x[3] < 100 ? 2000 + +x[3] : +x[3];
  } else if ((x = s.match(/^(\d{1,2})[ -](\p{L}{3}\p{L}*)\.?[ ,-]+(\d{2,4})/u))) {
    [d, m, y] = [+x[1], monthOf(x[2]), +x[3] < 100 ? 2000 + +x[3] : +x[3]];
  } else if ((x = s.match(/^(\p{L}{3}\p{L}*)\.? (\d{1,2}),? (\d{4})/u))) {
    [m, d, y] = [monthOf(x[1]), +x[2], +x[3]];
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
  // "Value" is the value date in PostFinance (Date, Posting details, Credit,
  // Debit, Value, Balance): beside money-in/out columns it is not the amount.
  if (cols.amount !== -1 && h[cols.amount] === "value" && (cols.debit !== -1 || cols.credit !== -1)) cols.amount = -1;
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

const AMT = /^[-+]?\$?\(?[\d,]*\.?\d+\)?$/;
// Australian (CBA, ANZ style) and Canadian (TD style) CSVs also come with no
// header row. CBA: date, signed amount, description, balance (balance may be
// missing, as ANZ does). TD: date, description, withdrawal, deposit, balance.
// -> { bank, columns, dayFirst } or null. Layouts are from memory.
function headerlessLayout(rows) {
  const sample = rows.slice(0, 5);
  if (!sample.length) return null;
  if (headerlessShape(sample)) return { bank: "wells-fargo", columns: { date: 0, amount: 1, desc: 4, balance: -1, debit: -1, credit: -1 }, dayFirst: false };
  const dated = (r) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[0].trim()) && parseDate(r[0], true);
  if (sample.every((r) => (r.length === 3 || r.length === 4) && dated(r) && AMT.test(r[1].trim()) && r[2].trim() && !AMT.test(r[2].trim()) && (r.length === 3 || AMT.test(r[3].trim()))))
    return { bank: sample[0].length === 4 ? "cba" : "anz", columns: { date: 0, amount: 1, desc: 2, balance: sample[0].length === 4 ? 3 : -1, debit: -1, credit: -1 }, dayFirst: true };
  if (sample.every((r) => r.length === 5 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[0].trim()) && parseDate(r[0]) && r[1].trim() && !AMT.test(r[1].trim()) && ((r[2].trim() === "") !== (r[3].trim() === "")) && AMT.test((r[2].trim() || r[3].trim())) && AMT.test(r[4].trim())))
    return { bank: "td", columns: { date: 0, desc: 1, debit: 2, credit: 3, balance: 4, amount: -1 }, dayFirst: false };
  return inferHeaderless(rows);
}

// Any other file with no header row: find the columns from the cells. The date
// column parses as dates in every row, the amount is a numeric column (or a
// money-out / money-in pair with one cell filled per row), a balance is the
// numeric column that chains with the amounts, a D/C or Af/Bij flag signs an
// unsigned amount, and the description is the longest text column. The first
// row must be data, so a file with a header is never read this way.
// Layouts: the 17 header-less ones in bank2ynab's config (eval/bank2ynab-probe.mjs).
const NUMCELL = /^[-+]?[$€£]?\(?[\d.,' ]*\d\)?-?$/;
const FLAG = /^(d|c|dr|cr|debit|credit|debet|af|bij)$/i;
function inferHeaderless(rows) {
  const body = rows.filter((r) => r.some((c) => String(c ?? "").trim())).slice(0, 30);
  if (body.length < 2 || body[0].length < 3) return null;
  const width = Math.max(...body.map((r) => r.length));
  const cell = (r, i) => String(r[i] ?? "").trim();
  const col = (i) => body.map((r) => cell(r, i));
  const isDate = (v) => { if (/^\d{8}$/.test(v)) { const d = parseDate(v); return !!d && +d.slice(0, 4) > 1990 && +d.slice(0, 4) < 2100; } return /^\d{1,4}[-/. :]\d|^\d{1,2}[ -][A-Za-z]{3}/.test(v) && (!!parseDate(v, true) || !!parseDate(v, false)); };
  const dateCol = Array.from({ length: width }, (_, i) => i).find((i) => { const c = col(i); return isDate(c[0]) && c.filter(isDate).length >= 0.9 * c.length; });
  if (dateCol === undefined) return null;
  const money = (v) => NUMCELL.test(v) && /[.,]\d{1,2}\)?-?$/.test(v);
  const fill = (c) => c.filter(Boolean).length / c.length;
  const numeric = []; const flags = []; const texts = [];
  for (let i = 0; i < width; i++) {
    if (i === dateCol) continue;
    const c = col(i), ne = c.filter(Boolean);
    if (!ne.length) continue;
    if (ne.every(money)) numeric.push(i);
    else if (fill(c) >= 0.9 && ne.every((v) => FLAG.test(v))) flags.push(i);
    else if (fill(c) >= 0.5 && !ne.every((v) => NUMCELL.test(v))) texts.push(i);
  }
  if (!texts.length) return null;
  const all = numeric.flatMap((i) => col(i));
  const comma = all.some((v) => /,\d{1,2}\)?-?$/.test(v)) && !all.some((v) => /\.\d{1,2}\)?-?$/.test(v));
  const cents = (v) => { const x = parseCents(v, comma); return Number.isFinite(x) ? x : 0; };
  const full = numeric.filter((i) => fill(col(i)) >= 0.9), sparse = numeric.filter((i) => fill(col(i)) < 0.9);
  // Does the balance column move by the amounts, whichever way the file is sorted?
  const chains = (amt, bal) => { if (amt.length < 2) return false; const up = amt.every((a, i) => i === 0 || bal[i] - bal[i - 1] === a), down = amt.every((a, i) => i === 0 || bal[i - 1] - bal[i] === a); return up || down; };
  const columns = { date: dateCol, amount: -1, debit: -1, credit: -1, balance: -1, desc: -1 };
  let note = null;
  const bodyCents = (i) => col(i).map(cents);
  if (sparse.length >= 2 && sparse.length + full.length <= 3) {
    const [a, b] = sparse.slice(0, 2), ca = col(a), cb = col(b);
    if (ca.every((v, k) => Boolean(v) !== Boolean(cb[k]))) {
      const bal = full.length === 1 ? bodyCents(full[0]) : null;
      const aOut = ca.map((v) => (v ? -Math.abs(cents(v)) : 0)), bIn = cb.map((v) => (v ? Math.abs(cents(v)) : 0));
      const aIn = ca.map((v) => (v ? Math.abs(cents(v)) : 0)), bOut = cb.map((v) => (v ? -Math.abs(cents(v)) : 0));
      const firstOut = aOut.map((x, k) => x + bIn[k]), firstIn = aIn.map((x, k) => x + bOut[k]);
      const signed = ca.concat(cb).some((v) => /^\(|^-|-$/.test(v));
      let outFirst = true;
      if (bal && chains(firstOut, bal)) outFirst = true;
      else if (bal && chains(firstIn, bal)) outFirst = false;
      else if (!signed) note = "Money-out and money-in columns are not labelled; the first was read as money out. Check the signs against the statement.";
      if (signed) { columns.debit = b; columns.credit = a; }
      else { columns.debit = outFirst ? a : b; columns.credit = outFirst ? b : a; }
      if (bal) columns.balance = full[0];
    }
  }
  if (columns.debit === -1) {
    if (!full.length) return null;
    if (full.length === 1) columns.amount = full[0];
    else {
      let found = false;
      for (const a of full) for (const b of full) if (!found && a !== b && chains(bodyCents(a), bodyCents(b))) { columns.amount = a; columns.balance = b; found = true; }
      if (!found) columns.amount = full[0];
    }
  }
  const amountCol = columns.amount;
  const drcr = amountCol !== -1 && flags.length === 1 && !col(amountCol).some((v) => /^\(|^-|-$/.test(v)) ? flags[0] : -1;
  columns.desc = texts.reduce((best, i) => (col(i).reduce((n, v) => n + v.length, 0) > col(best).reduce((n, v) => n + v.length, 0) ? i : best), texts[0]);
  // Day or month first, from any date with a part above 12; a dot separator reads as European.
  let dayFirst = false, decided = false;
  for (const v of col(dateCol)) {
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) { if (/^\d{1,2}[ -][A-Za-z]/.test(v)) { dayFirst = true; decided = true; } continue; }
    if (+m[1] > 12) { dayFirst = true; decided = true; break; }
    if (+m[2] > 12) { dayFirst = false; decided = true; break; }
  }
  if (!decided && col(dateCol).some((v) => /^\d{1,2}\.\d{1,2}\.\d/.test(v))) dayFirst = true;
  return { bank: null, columns, dayFirst, drcr, note };
}

// Which export this is, from its header or shape alone. Informational; the
// column matching does the work. null when it is none of the five shapes.
export function sniffBank(rows) {
  { const h = headerlessLayout(rows); if (h) return h.bank; }
  for (const r of rows.slice(0, 12)) {
    const h = r.map(norm).join("|");
    if (/^details\|posting date\|description\|amount\|type\|balance/.test(h)) return "chase-checking";
    if (/^transaction date\|post date\|description\|category\|type\|amount/.test(h)) return "chase-card";
    if (/^account type\|account number\|transaction date\|cheque number\|description 1\|description 2\|cad\$/.test(h)) return "rbc";
    if (/^bank account\|date\|narrative\|debit amount\|credit amount\|balance/.test(h)) return "westpac";
    if (/^date\|amount\|account number\|\|transaction type\|transaction details\|balance/.test(h)) return "nab";
    if (/^date\|description\|amount\|running bal/.test(h)) return "bank-of-america";
    if (/^type\|product\|started date\|completed date\|description\|amount\|fee\|currency\|state\|balance/.test(h)) return "revolut";
    if (/^transaction id\|date\|time\|type\|name\|emoji\|category\|amount\|currency/.test(h)) return "monzo";
    if (/^date\|counter party\|reference\|type\|amount \((gbp|eur|usd)\)\|balance/.test(h)) return "starling";
    if (/^date \(utc\)\|description\|amount\|status\|source account/.test(h)) return "mercury";
    if (/^booking date\|value date\|partner name\|partner iban\|type\|payment reference/.test(h)) return "n26";
    if (/^id\|datetime\|type\|status\|note\|from\|to\|amount \(total\)/.test(h.replace(/^\|/, ""))) return "venmo";
    if (/^transaction id\|date\|transaction type\|currency\|amount\|fee\|net amount/.test(h)) return "cash-app";
    if (/^date\|description\|original description\|category\|amount\|status/.test(h)) return "usaa";
    if (/^date\|description\|type\|amount\|current balance\|status/.test(h)) return "sofi";
    if (/^transferwise id\|date\|amount\|currency\|description/.test(h)) return "wise";
    if (/^transaction date\|posted date\|card no\.\|description\|category\|debit\|credit/.test(h)) return "capital-one";
    if (/^trans\. date\|post date\|description\|amount\|category/.test(h)) return "discover";
    if (/^status\|date\|description\|debit\|credit/.test(h)) return "citi";
    if (/^date\|transaction\|name\|memo\|amount/.test(h)) return "us-bank";
    if (/^date\|time\|amount\|type\|description/.test(h)) return "ally";
    if (/^transaction date\|clearing date\|description\|merchant\|category\|type\|amount \(usd\)/.test(h)) return "apple-card";
    if (/^transaction date\|transaction type\|sort code\|account number\|transaction description\|debit amount\|credit amount/.test(h)) return "lloyds";
    if (/^number\|date\|account\|amount\|subcategory\|memo/.test(h)) return "barclays";
    if (/^date\|description\|withdrawals\|deposits\|balance/.test(h)) return "pnc";
    if (/^date\|status\|type\|checknumber\|description\|withdrawal\|deposit\|runningbalance/.test(h)) return "schwab";
    if (/^run date\|account\|account number\|action\|symbol\|description/.test(h)) return "fidelity";
    if (/^date\|time\|/.test(h) && /\|gross\|/.test(h) && /\|status\|/.test(h) && /\|net(\||$)/.test(h)) return "paypal";
    if (/^date\|description\|amount\|balance\|account name/.test(h)) return "relay";
    if (/^transaction date\|posted date\|description\|amount\|status\|memo\|card last four/.test(h)) return "brex";
    if (/^transaction date\|description\|type\|amount\|net amount\|settled date/.test(h)) return "chime";
    if (/^date\|description\|debit\|credit\|balance\|type/.test(h)) return "bluevine";
    if (/^date\|description\|(card member\|account #\|)?amount/.test(h)) return "amex";
  }
  return null;
}

// Card exports disagree on which sign is a charge (Amex lists charges as
// positive, Chase as negative). The payment rows settle it: a payment lowers
// what is owed, so charges carry the opposite sign.
function chargesArePositive(rows) {
  // "Payment thank you" style rows only appear on card statements. "Autopay"
  // and "online payment" also name a checking account's outgoing bill
  // payments, so they count only when most rows are positive, as a card
  // export with positive charges would be.
  const strong = rows.filter((r) => /payment.*thank you|payment received|directpay|ach deposit internet transfer/i.test(r.desc));
  const weak = rows.filter((r) => /autopay|automatic payment|online payment|^(card |statement )?payment$/i.test(r.desc));
  let pay = strong;
  if (pay.length === 0 && weak.length > 0 && rows.filter((r) => r.cents > 0).length >= rows.length * 0.7) pay = weak;
  if (pay.length === 0) return null;
  const neg = pay.filter((r) => r.cents < 0).length;
  return neg > pay.length / 2;
}

// OFX/QFX (SGML 1.x or XML 2.x) and QIF, which most banks offer next to CSV.
// Both carry signed amounts in the account's own convention (a card charge is
// already negative), so no sign inference is done. Returns the same shape as
// the CSV path. The balance is only known for the last row (LEDGERBAL).
export function sniffFormat(text) {
  text = String(text ?? "");
  if (isCamt(text)) return "camt053";
  if (isMt940(text)) return "mt940";
  if (isBai2(text)) return "bai2";
  if (isN43(text)) return "n43";
  if (isCfonb(text)) return "cfonb";
  const head = text.slice(0, 2000);
  if (/<OFX>|OFXHEADER:|<STMTTRN>/i.test(head) || /<STMTTRN>/i.test(text)) return "ofx";
  if (/^\s*!(Type|Account|Option)/im.test(head)) return "qif";
  if (/^000\t\d{8}\t/.test(head)) return "esis";
  if (/^07[45]\d{16}/m.test(head) && /^075\d{16}/m.test(head)) return "gpc";
  if (/^\uFEFF?Pohyby na .{1,4}tu/i.test(head) && /^datum za.{1,4}tov.{1,3}n.{1,3}:/im.test(head)) return "cz-text";
  return "csv";
}

function ofxDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v).trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function ofxTag(block, tag) {
  const m = new RegExp(`<${tag}>(?:\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<\\r\\n]*))`, "i").exec(block);
  return m ? (m[1] ?? m[2]).trim().replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#0?39;/g, "'").replace(/&#0?38;/g, "&").replace(/&amp;/g, "&") : "";
}

// A file from a bank with several accounts (or a card beside a checking
// account) holds one STMTRS or CCSTMTRS block per account. -> [{ id, type,
// card, text }], each `text` a complete one-account OFX file, so readOfx and
// the importer need no changes. A single-account file comes back as one entry.
export function splitOfx(text) {
  const re = /<(STMTRS|CCSTMTRS)>[\s\S]*?<\/\1>/gi;
  const blocks = text.match(re) ?? [];
  if (blocks.length < 2) {
    const one = blocks[0] ?? text;
    return [{ ...ofxAccount(one), text }];
  }
  const first = text.search(re);
  const head = text.slice(0, first);
  return blocks.map((b) => ({ ...ofxAccount(b), text: head + b + "</OFX>" }));
}

function ofxAccount(block) {
  const id = ofxTag(block, "ACCTID");
  const type = ofxTag(block, "ACCTTYPE");
  return { id, type, card: /<CCSTMTRS>/i.test(block) || /<CCACCTFROM>/i.test(block) };
}

export function readOfx(text) {
  const problems = [];
  const out = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((raw, i) => {
    const b = raw.split(/<\/STMTTRN>/i)[0];
    const date = ofxDate(ofxTag(b, "DTPOSTED"));
    const cents = parseCents(ofxTag(b, "TRNAMT"));
    if (!date) { problems.push(`Transaction ${i + 1}: unreadable date, skipped.`); return; }
    if (!Number.isFinite(cents) || !/\d/.test(ofxTag(b, "TRNAMT"))) { problems.push(`Transaction ${i + 1}: unreadable amount, skipped.`); return; }
    if (cents === 0) return;
    // A memo that starts with the name (many banks repeat it, then add detail) is the fuller text on its own.
    const name = (ofxTag(b, "NAME") || ofxTag(b, "PAYEE")).replace(/\s+/g, " ");
    const memo = ofxTag(b, "MEMO").replace(/\s+/g, " ");
    const desc = (memo.toLowerCase().startsWith(name.toLowerCase()) ? memo : [name, memo].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" "));
    out.push({ line: i + 1, date, desc, cents, balance: null });
  });
  const lb = /<LEDGERBAL>[\s\S]*?<BALAMT>\s*([-+]?[\d.,]+)/i.exec(text);
  if (lb && out.length) {
    const last = out.reduce((a, r) => (r.date >= a.date ? r : a), out[0]);
    const bal = parseCents(lb[1]);
    if (Number.isFinite(bal)) last.balance = bal;
  }
  if (!blocks.length) {
    // A failed download saves an error reply as a .ofx file; an investment-only file holds positions, not cash lines.
    const status = /<STATUS>\s*<CODE>\s*(\d+)\s*<SEVERITY>\s*ERROR\s*(?:<MESSAGE>([^<]*))?/i.exec(text);
    if (status && status[1] !== "0") problems.push(`The OFX file is an error reply from the bank (code ${status[1]}${status[2] ? `: ${status[2].trim()}` : ""}), not a statement. Download it again.`);
    else if (/<(INVPOSLIST|INVTRANLIST|INVSTMTRS)>/i.test(text)) problems.push("This OFX file is an investment statement (positions and trades) with no cash transactions; investment lines are not booked.");
    else problems.push("No transactions (STMTTRN) were found in the OFX file.");
  }
  let statement = null;
  if (lb) {
    const d = /<LEDGERBAL>[\s\S]*?<DTASOF>\s*(\d{4})(\d{2})(\d{2})/i.exec(text);
    const bal = parseCents(lb[1]);
    if (d && Number.isFinite(bal)) statement = { cents: bal, date: `${d[1]}-${d[2]}-${d[3]}` };
  }
  return { rows: out, problems, columns: null, bank: "ofx", inferred: null, statement };
}

// Quicken's multi-account export: an `!Account` block (N name, T type) opens
// each account, followed by its `!Type:` section of transactions. -> [{ id,
// type, text }], `id` the account name and each `text` a one-account QIF file,
// or [] when the file names fewer than two accounts.
// Lithuania's LITAS-ESIS statement (.acc, tab-separated, cp1257, no header): a
// "000" line for the account, "010" lines for transactions (date YYYYMMDD in
// column 3, amount in cents in 5, a D/K flag in 7, document no. in 11, purpose in
// 14, counterparty in 18) and "020" opening/closing balance lines. Layout from
// the ofxstatement-lithuanian plugin's parser (read from its sdist).
export function readEsis(text) {
  const problems = [], out = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const f = l.split("\t");
    if (f[0] !== "010") return;
    const date = ofxDate(f[2]);
    const cents = /^\d+$/.test((f[4] ?? "").trim()) ? Number(f[4]) : NaN;
    const flag = (f[6] ?? "").trim().toUpperCase();
    if (!date) return problems.push(`Line ${i + 1}: unreadable date "${f[2] ?? ""}", skipped.`);
    if (!Number.isFinite(cents)) return problems.push(`Line ${i + 1}: unreadable amount, skipped.`);
    if (flag !== "D" && flag !== "K" && flag !== "C") return problems.push(`Line ${i + 1}: no debit/credit flag (D or K), skipped.`);
    if (cents === 0) return;
    const desc = [f[17], f[13]].map((x) => (x ?? "").trim()).filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    out.push({ line: i + 1, date, desc, cents: flag === "D" ? -cents : cents, balance: null });
  });
  if (!out.length) problems.push("No transactions (010 lines) were found in the LITAS-ESIS file.");
  return { rows: out, problems, columns: null, bank: "litas-esis", inferred: null };
}

// The Czech GPC statement (Fio, Ceska sporitelna, KB and others offer it): fixed-
// width lines of 128 characters. "074" opens a statement (account, previous and
// new balance in hellers with a +/- sign, statement date DDMMYY); "075" is a
// transaction (counter-account 20-35, document no. 36-48, amount in hellers
// 49-60, code 61: 1 debit, 2 credit, 4 debit storno, 5 credit storno, variable
// symbol 62-71, bank code + constant symbol 72-81, specific symbol 82-91,
// client name 98-117, due date DDMMYY 123-128). Layout as published in the
// ofxstatement-czech plugin's docstring (read from its sdist); code is mine.
// Decode the file as Windows-1250 first.
export function readGpc(text) {
  const problems = [], out = [];
  let statement = null;
  const date6 = (v) => { const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v); return m ? `${Number(m[3]) < 70 ? 20 : 19}${m[3]}-${m[2]}-${m[1]}` : null; };
  text.split(/\r?\n/).forEach((l, i) => {
    const kind = l.slice(0, 3);
    if (kind === "074") {
      const n = l.slice(60, 74), sign = l[74], d = date6(l.slice(108, 114));
      if (/^\d{14}$/.test(n) && (sign === "+" || sign === "-") && d) statement = { cents: (sign === "-" ? -1 : 1) * Number(n), date: d };
      return;
    }
    if (kind !== "075") return;
    const n = l.slice(48, 60), code = l[60], date = date6(l.slice(122, 128));
    if (!/^\d{12}$/.test(n)) return problems.push(`Line ${i + 1}: unreadable amount, skipped.`);
    if (!date) return problems.push(`Line ${i + 1}: unreadable date, skipped.`);
    if (!"1245".includes(code ?? "x")) return problems.push(`Line ${i + 1}: unknown accounting code "${code ?? ""}", skipped.`);
    const cents = Number(n) * (code === "1" || code === "5" ? -1 : 1);
    if (cents === 0) return;
    const strip = (v) => v.replace(/^0+/, "");
    const vs = strip(l.slice(61, 71)), acct = strip(l.slice(19, 35)), bank = /^0+$/.test(l.slice(71, 75)) ? "" : l.slice(71, 75);
    const desc = [l.slice(97, 117).trim(), acct && `acc ${acct}${bank ? "/" + bank : ""}`, vs && `VS ${vs}`].filter(Boolean).join(" ").replace(/\s+/g, " ");
    out.push({ line: i + 1, date, desc, cents, balance: null });
  });
  if (!out.length) problems.push("No transactions (075 lines) were found in the GPC file.");
  return { rows: out, problems, columns: null, bank: "gpc", inferred: null, statement };
}

// The Czech "Pohyby na uctu" text export (Raiffeisenbank's online banking and
// others): one block per movement, "key:   value" lines (booking date D.M.YYYY,
// amount with a dot, currency, balance after the movement, symbols, operation
// type, counter-account name and number, note). Values start at column 20. The
// note is wrapped at a fixed width, so its continuation lines are joined raw
// (the padding keeps words apart, a number split mid-way is rejoined). Newest
// block first. Layout read from the two samples in the ofxstatement-czech sdist
// (GPLv3, layout only, nothing copied); code is mine.
export function readCzBlocks(text) {
  const problems = [], out = [];
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const account = /Pohyby na .{1,4}tu.{0,6}:\s*(\d+)/i.exec(lines[0] ?? "")?.[1] ?? null;
  const keys = [["date", /^datum/i], ["amount", /^.{1,3}stka$/i], ["ccy", /^m.{1,3}na$/i], ["balance", /^z.{1,3}statek$/i], ["vs", /^variabiln/i], ["type", /^ozna.{1,3}en/i], ["name", /^n.{1,3}zev prot/i], ["acct", /^prot.{1,3}.{1,3}et$/i], ["note", /^pozn.{1,3}mka$/i]];
  const money = (v) => {
    const m = /^([-+])?(\d+)(?:[.,](\d{1,2}))?$/.exec(String(v ?? "").replace(/\s/g, ""));
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0") || 0)) : null;
  };
  let cur = null, last = null;
  const flush = () => {
    if (!cur) return;
    const b = cur; cur = null; last = null;
    const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(b.date ?? "");
    const cents = money(b.amount);
    if (!dm || cents === null) return problems.push(`Line ${b.line}: unreadable date or amount, skipped.`);
    const vs = (b.vs ?? "").replace(/^0+(?=\d)/, "");
    const desc = [b.type, b.name, b.acct && `acc ${b.acct}`, vs && `VS ${vs}`, (b.note ?? "").replace(/\s+/g, " ")].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
    out.push({ line: b.line, date: `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`, desc, cents, balance: money(b.balance), ccy: b.ccy ?? "" });
  };
  lines.forEach((l, i) => {
    if (!l.trim()) { flush(); return; }
    const m = /^(\S[^:]*?):/.exec(l);
    const k = m && keys.find(([, re]) => re.test(m[1].trim()))?.[0];
    if (k) {
      if (k === "date") { flush(); cur = { line: i + 1 }; }
      if (!cur) return;
      cur[k] = k === "note" ? l.slice(19) : l.slice(m[0].length).trim();
      last = k;
    } else if (cur && last === "note" && /^\s/.test(l)) cur.note += l.slice(19);
  });
  flush();
  const ccys = new Set(out.map((r) => r.ccy).filter(Boolean));
  if (ccys.size > 1) problems.push(`The file mixes currencies (${[...ccys].join(", ")}); amounts are read as one currency. Split it per currency.`);
  if (!out.length) problems.push("No movements (datum/castka blocks) were found in the Czech text statement.");
  for (const r of out) delete r.ccy;
  return { rows: out, problems, columns: null, bank: "cz-text", inferred: null, account };
}

export function splitQif(text) {
  const parts = [];
  let head = "", cur = null, inAcct = false;
  for (const l of String(text ?? "").split(/\r?\n/)) {
    if (/^!account\b/i.test(l.trim())) { cur = { id: "", type: "", body: [] }; parts.push(cur); inAcct = true; continue; }
    if (l[0] === "!") inAcct = false;
    if (inAcct && cur) {
      if (l[0] === "N") cur.id = l.slice(1).trim();
      else if (l[0] === "T") cur.type = l.slice(1).trim();
      continue;
    }
    (cur ? cur.body : head ? [] : []).push(l);
    if (!cur) head += l + "\n";
  }
  const named = parts.filter((p) => p.id);
  if (named.length < 2) return [];
  return named.map((p) => ({ id: p.id, type: p.type, text: head + p.body.join("\n") + "\n" }));
}

export function readQif(text, { dayFirst = false } = {}) {
  const problems = [];
  const out = [];
  let cur = {};
  let n = 0;
  let inAccount = false; // an !Account block lists account names (N) and types (T), not transactions
  let accounts = 0;
  const flush = (line) => {
    if (inAccount || (cur.D === undefined && cur.T === undefined)) { cur = {}; return; }
    n++;
    const date = parseDate(String(cur.D ?? "").replace(/'/g, "/").replace(/\s+/g, ""), dayFirst);
    const cents = parseCents(String(cur.T ?? cur.U ?? ""));
    if (!date) problems.push(`Line ${line}: unreadable date "${cur.D ?? ""}", skipped.`);
    else if (!Number.isFinite(cents)) problems.push(`Line ${line}: unreadable amount, skipped.`);
    else if (cents !== 0) out.push({ line, date, desc: [cur.P, cur.M].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" ").replace(/\s+/g, " ").trim(), cents, balance: null });
    cur = {};
  };
  text.split(/\r?\n/).forEach((l, i) => {
    if (!l) return;
    const c = l[0];
    if (c === "!") {
      inAccount = /^!account\b/i.test(l.trim());
      if (/^!type:/i.test(l.trim())) accounts++;
      return;
    }
    if (c === "^") return flush(i + 1);
    cur[c] = l.slice(1).trim();
  });
  if (Object.keys(cur).length) flush(text.split(/\r?\n/).length);
  if (!n) problems.push("No transactions were found in the QIF file.");
  if (accounts > 1 && n) problems.push(`The QIF file has ${accounts} account sections; all rows were read into one account. Split the file per account to keep transfers apart.`);
  return { rows: out, problems, columns: null, bank: "qif", inferred: null };
}

// -> { rows: [{ line, date, desc, cents, balance }], problems: [string], columns, bank, inferred }
// `invert` flips signs for card exports that list charges as positive. Leave it
// undefined and a file with no running balance that has payment rows is
// flipped when its payments are negative (`inferred` says so).
// Without dayFirst or decimalComma the CSV branch infers them from the cells
// (inferLocale); passing either one, true or false, is never overridden.
export function readStatement(text, { dayFirst, decimalComma, invert, year, onlyAccount } = {}) {
  text = String(text ?? "");
  const dfGiven = dayFirst !== undefined, dcGiven = decimalComma !== undefined;
  dayFirst = !!dayFirst; decimalComma = !!decimalComma;
  const format = sniffFormat(text);
  if (format === "camt053" || format === "mt940") {
    const r = format === "camt053" ? readCamt(text) : readMt940(text);
    if (invert === true) for (const x of r.rows) x.cents = -x.cents;
    return r;
  }
  if (format === "bai2") { const r = readBai2(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "n43") { const r = readN43(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "cfonb") { const r = readCfonb(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "ofx") return readOfx(text);
  if (format === "esis") return readEsis(text);
  if (format === "gpc") return readGpc(text);
  if (format === "cz-text") return readCzBlocks(text);
  if (format === "qif") return readQif(text, { dayFirst });
  const rows = parseCsv(text);
  const problems = [];
  // A header-less file with a few lines of account summary above the data: drop leading rows until the rest has a layout.
  const hasHeader = (r) => { if (r.length < 2) return false; const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); };
  if (!rows.some(hasHeader) && !headerlessLayout(rows)) {
    for (let k = 1; k <= Math.min(10, rows.length - 2); k++) {
      if (headerlessLayout(rows.slice(k))) { rows.splice(0, k); problems.push(`${k} line${k === 1 ? "" : "s"} above the first transaction ${k === 1 ? "was" : "were"} skipped as a preamble.`); break; }
    }
  }
  if (!rows.some((r) => { if (r.length < 2) return false; const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); }) && !headerlessLayout(rows)) {
    const t = readStatementText(text, { dayFirst, decimalComma, year });
    if (t.rows.length) { if (invert === true) for (const x of t.rows) x.cents = -x.cents; return t; }
    if (t.problems.length) return t;
  }
  if (rows.length < 2 && !(rows.length === 1 && headerlessLayout(rows))) return { rows: [], problems: ["The file has no data rows."], columns: null };
  const bank = sniffBank(rows);
  let headerAt = rows.findIndex((r) => { const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); });
  let columns, first;
  // A header wider than every data row (Danske's Lithuanian export names 12 columns and writes 10):
  // the header's positions are wrong, so drop it and find the columns from the cells.
  let shortHeader = false;
  if (headerAt !== -1) {
    const hc = detectColumns(rows[headerAt]);
    const body = rows.slice(headerAt + 1).filter((r) => String(r[hc.date] ?? "").trim());
    if (body.length >= 2 && body.every((r) => r.length < rows[headerAt].length) && inferHeaderless(rows.slice(headerAt + 1))) { rows.splice(0, headerAt + 1); headerAt = -1; shortHeader = true; }
  }
  const hl = headerAt === -1 ? headerlessLayout(rows) : null;
  if (shortHeader) problems.push("The header names more columns than the rows have, so the columns were found from the cells instead. Check the signs and descriptions.");
  if (hl) { columns = hl.columns; first = 0; if (hl.dayFirst) dayFirst = true; }
  else if (headerAt === -1) return { rows: [], problems: ["No date and amount columns were found. Name them Date and Amount (or Debit and Credit)."], columns: null };
  else { columns = detectColumns(rows[headerAt]); first = headerAt + 1; }
  const out = [];
  let localeNote = null;
  if (!dfGiven || !dcGiven) {
    const loc = inferLocale(rows.slice(first), columns);
    if (!dfGiven && !hl && loc.dayFirst) { dayFirst = true; localeNote = "Dates read day first"; }
    if (!dcGiven && loc.decimalComma) { decimalComma = true; localeNote = (localeNote ? localeNote + " and " : "Amounts read") + (localeNote ? "amounts with decimal commas" : " with decimal commas"); }
  }
  // A DR/CR (or Debit/Credit) marker column beside one unsigned amount column.
  const hdr0 = headerAt === -1 ? [] : rows[headerAt].map(norm);
  let drcrCol = columns.amount !== -1 ? hdr0.findIndex((x) => /^(d ?\/ ?k|af ?\/? ?bij|credit ?\/? ?debet|debet ?\/? ?credit|soll ?\/? ?haben|dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit|credit ?\/ ?debit|dr or cr|cr or dr|(?:credit ?\/? ?debit|debit ?\/? ?credit|cr ?\/? ?dr|dr ?\/? ?cr) indicator|(?:credit|debit) or (?:debit|credit) indicator)$/.test(x)) : -1;
  if (hl?.drcr > -1) drcrCol = hl.drcr;
  if (hl?.note) problems.push(hl.note);
  // Or a plain Type column holding DEBIT/CREDIT (Deposit/Withdrawal) words beside an
  // unsigned amount. Only when every value is in that vocabulary and no amount is
  // negative, so a card export's Sale/Return/Payment column is left alone.
  if (drcrCol === -1 && columns.amount !== -1 && headerAt !== -1) {
    const DRCR = /^(debit|credit|withdrawal|deposit)$/i;
    const body = rows.slice(first).filter((r) => String(r[columns.date] ?? "").trim());
    const t = hdr0.findIndex((x) => /^(transaction type|trans type|type|debit or credit|credit or debit|dr or cr)$/.test(x));
    if (t !== -1 && body.length && body.every((r) => DRCR.test(String(r[t] ?? "").trim()) && !/^\s*[-(]|-\s*$/.test(String(r[columns.amount] ?? "")))) drcrCol = t;
  }
  // Wise writes DD-MM-YYYY. Revolut lists pending, declined and reverted rows
  // beside completed ones and keeps the fee in its own column.
  if (bank === "lloyds" || bank === "barclays" || bank === "wise" || bank === "monzo" || bank === "starling" || bank === "westpac" || bank === "nab") dayFirst = true;
  const hdr = headerAt === -1 ? [] : rows[headerAt].map(norm);
  if (bank === "nab") columns.desc = hdr.indexOf("transaction details");
  const rbc2 = bank === "rbc" ? hdr.indexOf("description 2") : -1;
  // RBC puts a US-dollar movement in its own USD$ column and leaves CAD$ blank.
  const rbcUsd = bank === "rbc" ? hdr.indexOf("usd$") : -1;
  if (bank === "monzo") columns.desc = hdr.indexOf("name");
  // Cash App: the fee sits in its own column, so the net amount is what moved.
  // The payee column beats the free-text note.
  // PayPal activity: the Net column is what moved the balance (Gross less Fee); only Completed rows count.
  if (bank === "paypal") {
    const net = hdr.indexOf("net");
    if (net !== -1) columns.amount = net;
    else if (hdr.indexOf("gross") !== -1) columns.amount = hdr.indexOf("gross");
    if (hdr.indexOf("balance") !== -1) columns.balance = hdr.indexOf("balance");
  }
  if (bank === "cash-app") { columns.amount = hdr.indexOf("net amount"); columns.desc = hdr.indexOf("notes"); }
  // Mercury lists Pending, Failed and Cancelled rows beside Sent ones.
  // Venmo lists Pending and Cancelled payments, and its balance rows have no date.
  const stateCol = bank === "revolut" ? hdr.indexOf("state") : bank === "mercury" || bank === "paypal" || bank === "venmo" || bank === "cash-app" || bank === "sofi" || bank === "usaa" ? hdr.indexOf("status") : -1;
  const okState = bank === "mercury" ? /^(sent|completed)$/i : bank === "cash-app" ? /^complete$/i : bank === "sofi" || bank === "usaa" ? /^posted$/i : bank === "venmo" ? /^(complete|issued)$/i : bank === "paypal" ? /^completed$/i : /^completed$/i;
  // Any other export with a Status or State column (Chime, Brex, Bluevine and the like): skip
  // rows whose status is plainly not a booked transaction. Only that vocabulary is skipped, so
  // an unknown label such as "Settled" or "Cleared" keeps the row.
  const anyState = stateCol === -1 && columns.amount !== -1 ? hdr.findIndex((x) => x === "status" || x === "state" || x === "transaction status") : -1;
  const NOT_BOOKED = /^(pending|declined|failed|cancell?ed|reversed|reverted|voided|rejected|authori[sz]ed|authori[sz]ation|processing|in progress|on hold|returned)$/i;
  const feeCol = bank === "revolut" ? hdr.indexOf("fee") : -1;
  // Any file with a currency column (Revolut, Swedbank's Valiuta, Wise and the like) is checked for a mix.
  const curRe = /^(currency|valiuta|valuta|waluta|währung|wahrung|waehrung|devise|moneda|divisa|moeda|pénznem)( code)?$/;
  // "Valuta" can be the value date, so any other currency header wins over it.
  const curCol = hdr.findIndex((x) => curRe.test(x) && x !== "valuta") !== -1 ? hdr.findIndex((x) => curRe.test(x) && x !== "valuta") : hdr.findIndex((x) => x === "valuta");
  const currencies = new Set();
  // Belgian and Dutch exports keep the free-text message apart from the counterparty's name.
  const msgCol = hdr.findIndex((x) => /^(vrije )?mededeling(en)?$/.test(x));
  // Rabobank splits its description over Omschrijving-1..3.
  const omsCols = hdr.map((x, ix) => (/^omschrijving-[123]$/.test(x) ? ix : -1)).filter((ix) => ix !== -1);
  // German exports keep the other party in its own column, apart from the purpose text.
  const payeeCol = columns.desc === -1 ? -1 : hdr.findIndex((x, ix) => ix !== columns.desc && /^(beguenstigter\/zahlungspflichtiger|begünstigter\/zahlungspflichtiger|auftraggeber ?\/ ?begünstigter|auftraggeber ?\/ ?beguenstigter|name zahlungsbeteiligter|zahlungsempfänger|zahlungsempfaenger|empfänger|empfaenger)$/.test(x));
  // Deutsche Bank style: one column for each side; the other party is the payee on money out, the payer on money in.
  const payeeOut = hdr.findIndex((x) => /^beg(ue|ü)nstigter$/.test(x)), payerIn = hdr.findIndex((x) => /^zahlungspflichtiger$/.test(x));
  // Mint, Monarch, Tiller and YNAB write every account into one file and name the account on each row.
  const acctCol = hdr.findIndex((x) => /^(account name|account|account nickname)$/.test(x));
  const accountNames = new Set();
  for (let i = first; i < rows.length; i++) {
    const r = rows[i];
    const acctName = acctCol === -1 ? "" : String(r[acctCol] ?? "").trim();
    if (acctName && String(r[columns.date] ?? "").trim()) accountNames.add(acctName);
    if (onlyAccount !== undefined && acctName !== onlyAccount) continue;
    if (bank === "venmo" && !String(r[columns.date] ?? "").trim()) continue;
    if (stateCol !== -1 && !okState.test(String(r[stateCol] ?? "").trim())) { problems.push(`Line ${i + 1}: state ${String(r[stateCol] ?? "").trim() || "blank"}, not a completed transaction, skipped.`); continue; }
    if (anyState !== -1 && NOT_BOOKED.test(String(r[anyState] ?? "").trim())) { problems.push(`Line ${i + 1}: status ${String(r[anyState]).trim()}, not a booked transaction, skipped.`); continue; }
    // German and Italian "Valuta" is often the value date; only a three-letter code counts as a currency.
    if (curCol !== -1 && /^[a-z]{3}$/i.test(String(r[curCol] ?? "").trim())) currencies.add(r[curCol].trim().toUpperCase());
    if (/^(likutis (pradžiai|pabaigai)|opening balance|closing balance)$/i.test(String(r[columns.desc] ?? "").trim())) { problems.push(`Line ${i + 1}: a balance row, not a transaction, skipped.`); continue; }
    if (headerAt !== -1 && r.length <= Math.max(columns.amount, columns.debit, columns.credit) && String(r[columns.date] ?? "").trim()) { problems.push(`Line ${i + 1}: the row has ${r.length} columns, fewer than the header, so the amount column is missing; skipped. Check the quoting in the file.`); continue; }
    const date = parseDate(r[columns.date], dayFirst);
    if (!date) { problems.push(`Line ${i + 1}: unreadable date "${r[columns.date] ?? ""}", skipped.`); continue; }
    let cents;
    if (columns.amount !== -1 && String(r[columns.amount] ?? "").trim() !== "") { cents = parseCents(r[columns.amount], decimalComma); if (rbcUsd !== -1) currencies.add("CAD"); }
    else if (rbcUsd !== -1 && String(r[rbcUsd] ?? "").trim() !== "") { cents = parseCents(r[rbcUsd], decimalComma); currencies.add("USD"); }
    else cents = (columns.credit !== -1 ? Math.abs(parseCents(r[columns.credit], decimalComma) || 0) : 0) - (columns.debit !== -1 ? Math.abs(parseCents(r[columns.debit], decimalComma) || 0) : 0);
    if (!Number.isFinite(cents)) { problems.push(`Line ${i + 1}: unreadable amount, skipped.`); continue; }
    if (drcrCol !== -1) {
      const m = String(r[drcrCol] ?? "").trim().toLowerCase();
      if (/^(dr|d|debit|debet|af|soll|s|withdrawal)$/.test(m)) cents = -Math.abs(cents);
      else if (/^(cr|c|k|credit|bij|haben|h|deposit)$/.test(m)) cents = Math.abs(cents);
    }
    if (feeCol !== -1) { const fee = parseCents(r[feeCol], decimalComma); if (Number.isFinite(fee)) cents -= Math.abs(fee); }
    if (cents === 0) {
      // A zero is harmless, but a row with a description and every amount cell blank may be a lost transaction.
      const blank = [columns.amount, columns.debit, columns.credit, rbcUsd].filter((k) => k !== -1).every((k) => String(r[k] ?? "").trim() === "");
      if (blank && String(r[columns.desc] ?? "").trim() && !/balance|saldo/i.test(String(r[columns.desc])) && !(columns.balance !== -1 && String(r[columns.balance] ?? "").trim())) problems.push(`Line ${i + 1}: no amount, skipped.`);
      continue;
    }
    const balance = columns.balance !== -1 && String(r[columns.balance] ?? "").trim() !== "" ? parseCents(r[columns.balance], decimalComma) : null;
    let desc = String(r[columns.desc] ?? "").trim().replace(/\s+/g, " ");
    if (bank === "cash-app") {
      const who = String(r[hdr.indexOf("name of sender/receiver")] ?? "").trim();
      desc = [who, desc || String(r[hdr.indexOf("transaction type")] ?? "").trim()].filter(Boolean).join(" - ");
    }
    if (omsCols.length) desc = [desc, ...omsCols.map((ix) => String(r[ix] ?? "").trim())].filter((x, j, a) => x && a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    if (msgCol !== -1 && msgCol !== columns.desc) desc = [desc, String(r[msgCol] ?? "").trim()].filter((x, j, a) => x && a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    const sideCol = payeeCol !== -1 ? payeeCol : payeeOut !== -1 && payerIn !== -1 ? (cents < 0 ? payeeOut : payerIn) : -1;
    if (sideCol !== -1) {
      const who = String(r[sideCol] ?? "").trim().replace(/\s+/g, " ");
      if (who && !desc.toLowerCase().includes(who.toLowerCase())) desc = [who, desc].filter(Boolean).join(" - ");
    }
    if (rbc2 !== -1) desc = [desc, String(r[rbc2] ?? "").trim()].filter(Boolean).join(" ").replace(/\s+/g, " ");
    if (bank === "paypal") {
      const nameI = hdr.indexOf("name");
      desc = [nameI !== -1 ? String(r[nameI] ?? "").trim() : "", String(r[hdr.indexOf("type")] ?? "").trim() || desc].filter(Boolean).join(" - ").replace(/\s+/g, " ");
    }
    if (bank === "venmo") {
      // The note is free text; name the other party, and fall back to the type for transfers.
      const who = String(r[hdr.indexOf(cents < 0 ? "to" : "from")] ?? "").trim();
      desc = [who, desc || String(r[hdr.indexOf("type")] ?? "").trim()].filter(Boolean).join(" - ");
    }
    out.push({ line: i + 1, date, desc, cents, balance: Number.isFinite(balance) ? balance : null });
  }
  if (currencies.size > 1) problems.push(`The file mixes currencies (${[...currencies].join(", ")}). Amounts are booked as written, with no conversion: import each currency on its own account.`);
  let inferred = null;
  let flip = !!invert;
  if (invert === undefined && out.every((r) => r.balance === null) && columns.amount !== -1) {
    // Discover's header is distinctive and its export always lists charges as positive, so a
    // file with no recognisable payment row (a month of purchases only) still flips.
    const pos = chargesArePositive(out) ?? (bank === "discover" || bank === "apple-card" ? true : null);
    if (pos) { flip = true; inferred = "Charges were positive (the payment rows are negative), so signs were flipped."; }
  }
  if (flip) for (const r of out) r.cents = -r.cents;
  if (localeNote) inferred = [inferred, localeNote + " (inferred from the file; pass dayFirst / decimalComma to override)."].filter(Boolean).join(" ");
  return { rows: out, problems, columns, bank, inferred, ...(accountNames.size > 1 ? { accountNames: [...accountNames] } : {}) };
}

// Guess day-first dates and decimal commas from the data rows. Day first when a
// date has a first number over 12 (and none a second), or the separator is a dot
// (dd.mm.yyyy); decimal comma when amounts end ",dd" and none ends ".dd".
function inferLocale(dataRows, columns) {
  let dayHi = 0, monHi = 0, dots = 0, comma = 0, point = 0;
  for (const r of dataRows) {
    const d = columns.date === -1 ? null : String(r[columns.date] ?? "").trim().match(/^(\d{1,2})([-/.])(\d{1,2})\2\d{2,4}/);
    if (d) { if (+d[1] > 12) dayHi++; if (+d[3] > 12) monHi++; if (d[2] === ".") dots++; }
    for (const k of ["amount", "debit", "credit", "balance"]) {
      if (columns[k] === -1) continue;
      const a = String(r[columns[k]] ?? "").trim().replace(/[^0-9.,]/g, "");
      if (/\d,\d{1,2}$/.test(a)) comma++;
      else if (/\d\.\d{1,2}$/.test(a)) point++;
    }
  }
  return { dayFirst: (dayHi > 0 && monHi === 0) || (dayHi === 0 && monHi === 0 && dots > 0), decimalComma: comma > 0 && point === 0 };
}

// A stable id per row so importing the same statement twice adds nothing: the
// account, date, amount and description, plus how many identical rows came
// before it in this file (two real $4.50 coffees on one day stay two rows).
// `loose` folds runs of spaces, case and punctuation in the description, so the
// same line read from a CSV and from an OFX or PDF of the same period (which
// spell it with different spacing) gets one id. Without it, the exact text.
export function rowIds(rows, account, { loose = false } = {}) {
  const seen = new Map();
  return rows.map((r) => {
    const d = loose ? r.desc.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() : r.desc.toLowerCase();
    const base = `${account}|${r.date}|${r.cents}|${d}`;
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
