// BAI2 cash-management statements: the file US business banks (Chase, Bank of
// America, Wells Fargo, PNC, Citizens, most credit-union business portals)
// offer next to CSV for treasury and QuickBooks/NetSuite imports. Same row
// shape as bank.mjs readStatement, money INTO the account positive, plus
// `statement` { cents, date } from the closing ledger balance (status type 015).
// Layout from the BAI2 specification as I know it (Cash Management Balance
// Reporting Specifications, BAI 2005): records 01 file, 02 group, 03 account,
// 16 transaction, 88 continuation, 49 account trailer. Pure function, no DOM.

export function isBai2(text) {
  const head = String(text).slice(0, 4000);
  return /^\s*01,[^,\n]*,[^,\n]*,\d{6},\d{4},/m.test(head) && /^\s*0[23],/m.test(text) && /^\s*16,/m.test(text);
}

const iso = (v) => {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v ?? "");
  if (!m) return null;
  const y = +m[1] >= 70 ? 1900 + +m[1] : 2000 + +m[1];
  const t = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
  return t.getUTCMonth() === +m[2] - 1 ? t.toISOString().slice(0, 10) : null;
};
// Amounts are whole minor units with no decimal point ("12550" is 125.50).
const minor = (v) => (/^-?\d+$/.test(v ?? "") ? Number(v) : NaN);

// Joins 88 continuation records onto the record before them and drops the "/" terminator.
function records(text) {
  const out = [];
  String(text).replace(/^﻿/, "").split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (!l) return;
    if (l.startsWith("88,") && out.length) { out[out.length - 1].body += "," + l.slice(3).replace(/\/$/, ""); return; }
    out.push({ line: i + 1, body: l.replace(/\/$/, "") });
  });
  return out;
}

export function readBai2(text) {
  const problems = [], rows = [];
  let group = { date: null }, account = null, statement = null;
  const numbers = new Set();
  for (const { line, body } of records(text)) {
    const f = body.split(",");
    if (f[0] === "02") { group = { date: iso(f[4]) }; continue; }
    if (f[0] === "03") {
      // The same account repeats in each daily group of a multi-day file: count distinct numbers.
      numbers.add(f[1]);
      account = { number: f[1] };
      // Status entries repeat as (type, amount, items, funds type) from field 3.
      for (let i = 3; i + 1 < f.length; i += 4) {
        if (f[i] === "015") { const c = minor(f[i + 1]); if (Number.isFinite(c) && group.date && (!statement || group.date >= statement.date)) statement = { cents: c, date: group.date }; }
      }
      continue;
    }
    if (f[0] !== "16") continue;
    const code = Number(f[1]), amt = minor(f[2]);
    if (!Number.isInteger(code) || !Number.isFinite(amt)) { problems.push(`Line ${line}: unreadable type code or amount, skipped.`); continue; }
    // Funds type: S carries three availability amounts, V a value date and time, D a count then pairs.
    let at = 4, valueDate = null;
    const ft = f[3];
    if (ft === "S") at += 3;
    else if (ft === "V") { valueDate = iso(f[4]); at += 2; }
    else if (ft === "D") { const n = Number(f[4]); at += 1 + 2 * (Number.isInteger(n) ? n : 0); }
    const bankRef = (f[at] ?? "").trim(), custRef = (f[at + 1] ?? "").trim();
    const memo = f.slice(at + 2).join(",").replace(/\s+/g, " ").trim();
    const date = valueDate ?? group.date;
    if (!date) { problems.push(`Line ${line}: no as-of date in the group header, skipped.`); continue; }
    // 100-399 are credits, 400-699 debits; loan (7xx) and other codes are not cash movements in this account.
    let sign;
    if (code >= 100 && code <= 399) sign = 1;
    else if (code >= 400 && code <= 699) sign = -1;
    else { problems.push(`Line ${line}: type code ${f[1]} is neither a credit nor a debit, skipped.`); continue; }
    if (amt === 0) continue;
    const desc = [memo, custRef && custRef !== "0" && `ref ${custRef}`, bankRef && bankRef !== "0" && `bank ref ${bankRef}`].filter(Boolean).join(" ") || `BAI type ${f[1]}`;
    rows.push({ line, date, desc, cents: sign * Math.abs(amt), balance: null });
  }
  if (!rows.length) problems.push("No 16 transaction records were found in the BAI2 file.");
  const accounts = numbers.size;
  if (accounts > 1) problems.push(`The file holds ${accounts} accounts; all their lines were read into this one. Export one account at a time to keep them apart.`);
  return { rows, problems, columns: null, bank: "bai2", inferred: null, statement: accounts === 1 ? statement : null };
}
