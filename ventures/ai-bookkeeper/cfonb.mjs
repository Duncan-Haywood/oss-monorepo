// CFONB 120 account statements ("relevé de compte CFONB120"): the fixed-width
// file French banks (BNP Paribas, Crédit Agricole, Société Générale, LCL,
// Banque Populaire...) offer for accounting imports. Same row shape as
// bank.mjs readStatement, money INTO the account positive, plus `statement`
// { cents, date } from the 07 (new balance) record. Layout from the CFONB
// 120-character standard as I know it: 01 previous balance, 04 movement, 05
// complement lines (qualifier code in columns 46-48), 07 new balance. The
// amount's last character carries the sign (overpunch: { A-I credit digits 0-9,
// } J-R debit digits 0-9). Pure function.

const HEAD = /^(01|07)\d{5}.{4}\d{5}[A-Z]{3}\d\s.{11}.{2}\d{6}/;
const MOVE = /^04\d{5}.{4}\d{5}[A-Z]{3}\d\s.{11}.{2}\d{6}/;
export function isCfonb(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  return lines.some((l) => l.length >= 104 && HEAD.test(l) && l.startsWith("01")) && lines.some((l) => l.length >= 104 && MOVE.test(l));
}

const iso = (v) => {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v ?? "");
  if (!m) return null;
  const y = +m[3] >= 70 ? 1900 + +m[3] : 2000 + +m[3];
  const t = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  return t.getUTCMonth() === +m[2] - 1 ? t.toISOString().slice(0, 10) : null;
};
// 14 characters, the last one overpunched; `dec` decimal places (column 20, normally 2).
const OVER = "{ABCDEFGHI}JKLMNOPQR";
function amount(v, dec) {
  if (!/^\d{13}[\d{A-R}]$/.test(v)) return NaN;
  const k = OVER.indexOf(v[13]);
  const digit = k < 0 ? Number(v[13]) : k % 10, neg = k >= 10;
  const n = Number(v.slice(0, 13) + digit);
  const scaled = dec === 2 ? n : dec < 2 ? n * 10 ** (2 - dec) : Math.round(n / 10 ** (dec - 2));
  return neg ? -scaled : scaled;
}
const clean = (s) => s.replace(/\s+/g, " ").trim();

export function readCfonb(text) {
  const problems = [], rows = [];
  let accounts = 0, statement = null, last = null, currency = null;
  String(text).replace(/^﻿/, "").split(/\r?\n/).forEach((raw, i) => {
    const l = raw.replace(/\s+$/, "");
    if (!l) return;
    const line = i + 1, kind = l.slice(0, 2);
    const dec = /\d/.test(l[19] ?? "") ? Number(l[19]) : 2;
    if (kind === "01") {
      accounts++;
      currency = l.slice(16, 19);
      last = null;
    } else if (kind === "04") {
      const date = iso(l.slice(34, 40)) ?? iso(l.slice(42, 48));
      const c = amount(l.slice(90, 104).padEnd(14), dec);
      if (!date || !Number.isFinite(c)) { problems.push(`Line ${line}: unreadable date or amount in a 04 record, skipped.`); last = null; return; }
      if (c === 0) { last = null; return; }
      last = { line, date, desc: clean(l.slice(48, 79)), ref: clean(l.slice(104, 120)), cents: c, balance: null };
      rows.push(last);
    } else if (kind === "05") {
      // Complement lines: LIB/LC2 (label), NPY/NBE (payer or beneficiary name) and RCN/REF (reference) carry the payee and the memo;
      // MMO (payment mode) and the IBAN/BIC qualifiers would only add noise to payee memory.
      const q = l.slice(45, 48), info = clean(l.slice(48, 118));
      if (last && info && ["LIB", "LC2", "LCC", "NPY", "NBE", "RCN", "REF"].includes(q)) last.desc = clean(`${last.desc} ${info}`);
    } else if (kind === "07") {
      const c = amount(l.slice(90, 104).padEnd(14), dec);
      const date = iso(l.slice(34, 40));
      if (Number.isFinite(c) && date) statement = { cents: c, date };
      last = null;
    } else {
      problems.push(`Line ${line}: record "${kind}" is not part of CFONB 120, ignored.`);
    }
  });
  for (const r of rows) { r.desc = r.desc || r.ref || "CFONB movement"; delete r.ref; }
  if (!rows.length) problems.push("No 04 movement records were found in the CFONB file.");
  if (currency && currency !== "EUR" && rows.length) problems.push(`The account currency code is ${currency}, not EUR; amounts are read as they are.`);
  if (accounts > 1) problems.push(`The file holds ${accounts} accounts; all their lines were read into this one. Export one account at a time to keep them apart.`);
  return { rows, problems, columns: null, bank: "cfonb", inferred: null, statement: accounts === 1 ? statement : null };
}
