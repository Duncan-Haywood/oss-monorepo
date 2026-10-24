// Switching from QuickBooks Online or Xero: read the chart of accounts the old
// system exports (QuickBooks "Account List", Xero "Chart of Accounts") and its
// trial balance, which names accounts instead of numbering them, and start
// these books from them. The trial balance becomes the opening balances
// (opening.mjs), so nothing is retyped and nothing is keyed by hand.
//
// Layouts are read from the column names the products print, not from a sample
// of a real company's file: QuickBooks Account List (Account, Type, Detail
// Type, Description, Balance; title rows above the header), Xero (*Code, *Name,
// *Type, *Tax Code ...). An unknown account type is reported, never guessed.

import { parseCsv, parseCents } from "./bank.mjs";
import { accountMap } from "./ledger.mjs";
import { AR, AP } from "./accruals.mjs";
import { setOpeningBalances } from "./opening.mjs";

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

// type name (letters only, lower case) -> [our type, is a bank/card account]
const TYPES = {
  // QuickBooks
  bank: ["asset", true], accountsreceivable: ["asset"], accountsreceivablear: ["asset"], othercurrentassets: ["asset"], othercurrentasset: ["asset"],
  fixedassets: ["asset"], fixedasset: ["asset"], otherassets: ["asset"], otherasset: ["asset"],
  creditcard: ["liability", true], accountspayable: ["liability"], accountspayableap: ["liability"], othercurrentliabilities: ["liability"],
  othercurrentliability: ["liability"], longtermliabilities: ["liability"], longtermliability: ["liability"],
  equity: ["equity"], income: ["income"], otherincome: ["income"],
  costofgoodssold: ["expense"], expenses: ["expense"], expense: ["expense"], otherexpense: ["expense"],
  // Xero
  currentasset: ["asset"], noncurrentasset: ["asset"], inventory: ["asset"], prepayment: ["asset"],
  currentliability: ["liability"], liability: ["liability"], noncurrentliability: ["liability"], termliability: ["liability"], paygliability: ["liability"], wagespayablepayroll: ["liability"],
  revenue: ["income"], sales: ["income"], directcosts: ["expense"], overhead: ["expense"], depreciation: ["expense"],
};
// Receivable and payable control accounts keep the codes invoices and bills post to.
const CONTROL = { accountsreceivable: AR, accountsreceivablear: AR, accountspayable: AP, accountspayableap: AP };
const FIRST_FREE = { asset: 1600, liability: 2400, equity: 3200, income: 4300, expense: 6200 };

// Drop the title rows some exports print above the header; the header is the
// first row that names an account/name column and a second known column.
function tableFrom(text, wants) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const cells = parseCsv(lines[i])[0]?.map((c) => norm(c)) ?? [];
    const found = wants(cells);
    if (found) return { found, title: lines.slice(0, i).join(" "), rows: parseCsv(lines.slice(i + 1).join("\n")).filter((r) => r.some((c) => String(c).trim() !== "")) };
  }
  return null;
}

const nameKey = (n) => norm(String(n).replace(/^\s*\d+[\s.:-]+/, ""));

// -> { books, added: [{code, name, type, bank}], matched: [{name, code}], problems }
export function importChart(booksIn, text) {
  const t = tableFrom(text, (h) => {
    const name = h.findIndex((c) => c === "account" || c === "name" || c === "accountname");
    const type = h.findIndex((c) => c === "type" || c === "accounttype");
    const code = h.findIndex((c) => c === "code" || c === "accountnumber" || c === "number" || c === "acct");
    return name !== -1 && type !== -1 ? { name, type, code } : null;
  });
  if (!t) return { books: booksIn, added: [], matched: [], problems: ["No header with an account name and a type column was found. Export the Account List (QuickBooks) or Chart of Accounts (Xero) as CSV."] };
  const books = JSON.parse(JSON.stringify(booksIn));
  const used = new Set(books.accounts.map((a) => a.code));
  const byName = new Map(books.accounts.map((a) => [nameKey(a.name), a.code]));
  const added = [], matched = [], problems = [];
  const nextCode = (type) => { let n = FIRST_FREE[type]; while (used.has(String(n))) n += 10; return String(n); };
  for (const r of t.rows) {
    const name = String(r[t.found.name] ?? "").trim();
    const typeName = norm(r[t.found.type]);
    if (!name || /^total/i.test(name)) continue;
    const kind = TYPES[typeName];
    if (!kind) { problems.push(`"${name}": the account type "${String(r[t.found.type]).trim()}" is not one this reader knows, so the account was left out.`); continue; }
    const control = CONTROL[typeName];
    const hit = byName.get(nameKey(name)) ?? (control && books.accounts.some((a) => a.code === control) ? control : null);
    if (hit) { matched.push({ name, code: hit }); byName.set(nameKey(name), hit); continue; }
    let code = control && !used.has(control) ? control : t.found.code !== -1 ? String(r[t.found.code] ?? "").trim() : "";
    if (!/^\d{3,8}$/.test(code) || used.has(code)) code = nextCode(kind[0]);
    const a = { code, name, type: kind[0], ...(kind[1] ? { bank: true } : {}) };
    books.accounts.push(a); used.add(code); byName.set(nameKey(name), code); added.push(a);
  }
  books.accounts.sort((x, y) => x.code.localeCompare(y.code));
  return { books, added, matched, problems };
}

// A trial balance that names accounts, as QuickBooks and Xero print it.
// `date` is optional when the title row says "As of December 31, 2025".
// -> setOpeningBalances's result, plus `date`; problems list names not in the chart.
export function importTrialBalance(booksIn, text, { date, decimalComma = false } = {}) {
  const t = tableFrom(text, (h) => {
    const name = h.findIndex((c) => c === "account" || c === "name" || c === "accountname");
    const debit = h.indexOf("debit"), credit = h.indexOf("credit");
    return name !== -1 && debit !== -1 && credit !== -1 ? { name, debit, credit } : null;
  });
  if (!t) return { books: booksIn, lines: [], plug: 0, before: 0, problems: ["No header with Account, Debit and Credit columns was found. Export the Trial Balance as CSV."] };
  const asOf = date ?? parseTitleDate(t.title);
  if (!asOf) return { books: booksIn, lines: [], plug: 0, before: 0, problems: ["The file does not say what day the balances are as of; pass the date."] };
  const byName = new Map(booksIn.accounts.map((a) => [nameKey(a.name), a.code]));
  const problems = [], out = ["code,debit,credit"];
  for (const r of t.rows) {
    const name = String(r[t.found.name] ?? "").trim();
    if (!name || /^total/i.test(name)) continue;
    const d = parseCents(r[t.found.debit] ?? "", decimalComma) || 0, c = parseCents(r[t.found.credit] ?? "", decimalComma) || 0;
    if (!d && !c) continue;
    const code = byName.get(nameKey(name)) ?? (/receivable/i.test(name) ? AR : /payable/i.test(name) && /a\/p|accounts/i.test(name) ? AP : null);
    if (!code || !accountMap(booksIn.accounts).has(code)) { problems.push(`"${name}" is not in the chart; import the old system's chart of accounts first.`); continue; }
    out.push(`${code},${(d / 100).toFixed(2)},${(c / 100).toFixed(2)}`);
  }
  if (problems.length) return { books: booksIn, lines: [], plug: 0, before: 0, problems };
  const r = setOpeningBalances(booksIn, out.join("\n"), { date: asOf });
  return { ...r, date: asOf };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
// "As of December 31, 2025", "As of 31 December 2025", "As at 31 Dec 2025", "31/12/2025" is not guessed.
export function parseTitleDate(title) {
  const s = String(title ?? "").toLowerCase();
  let m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  let mon, day, year;
  if (m) [, mon, day, year] = m;
  else if ((m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/))) [, day, mon, year] = m;
  else return null;
  const mi = MONTHS.findIndex((x) => x.startsWith(mon));
  const iso = `${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) || new Date(iso).getUTCDate() !== +day ? null : iso;
}
