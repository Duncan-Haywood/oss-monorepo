// CFONB 120 statements (releve de compte, 120-column records): the fixed-width
// file French banks offer next to CSV and CAMT.053 for accounting imports.
// Same row shape as bank.mjs readStatement, money INTO the account positive,
// plus `statement` { cents, date } from the 07 (new balance) record. Layout
// from the CFONB "releve de compte 120 caracteres" format as I know it: 01
// previous balance, 04 movement, 05 complementary lines (3-letter qualifier
// at columns 45-47, text from 48), 07 new balance. The amount's last digit
// carries the sign (overpunch: { A-I positive, } J-R negative). Pure function.

const LEN = 104;
const OVERPUNCH = { "{": [0, 1], "}": [0, -1] };
"ABCDEFGHI".split("").forEach((c, i) => { OVERPUNCH[c] = [i + 1, 1]; });
"JKLMNOPQR".split("").forEach((c, i) => { OVERPUNCH[c] = [i + 1, -1]; });

const lines = (text) => String(text).replace(/^﻿/, "").split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
const head = (l) => l.length >= LEN && /^(01|04|07)/.test(l) && /^[A-Z]{3}\d$/.test(l.slice(16, 20)) && /^\d{11}|^\w{11}/.test(l.slice(21, 32));
export function isCfonb120(text) {
  const ls = lines(text).filter(head);
  return ls.some((l) => l.startsWith("04") && /^\d{6}$/.test(l.slice(34, 40))) && ls.some((l) => l.startsWith("01") || l.startsWith("07"));
}

const iso = (v) => {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v ?? "");
  if (!m) return null;
  const y = +m[3] >= 70 ? 1900 + +m[3] : 2000 + +m[3];
  const t = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  return t.getUTCMonth() === +m[2] - 1 ? t.toISOString().slice(0, 10) : null;
};
// 14 characters, the last carrying the sign; the 20th column of the record gives the decimals (2 for EUR).
function amount(l) {
  const raw = l.slice(90, 104);
  const last = raw.slice(-1), digits = raw.slice(0, -1);
  if (!/^\d{13}$/.test(digits)) return NaN;
  let d, sign = 1;
  if (/\d/.test(last)) d = +last;
  else if (OVERPUNCH[last]) [d, sign] = OVERPUNCH[last];
  else return NaN;
  const n = Number(digits + d), dec = +l[19];
  return sign * (dec === 2 ? n : dec < 2 ? n * 10 ** (2 - dec) : Math.round(n / 10 ** (dec - 2)));
}
const clean = (s) => s.replace(/\s+/g, " ").trim();
const KEEP = new Set(["LIB", "NPY", "NBE", "MMO"]);

export function readCfonb120(text) {
  const problems = [], rows = [];
  let accounts = 0, statement = null, last = null, currency = null, decimals = null;
  lines(text).forEach((l, i) => {
    const line = i + 1, kind = l.slice(0, 2);
    if (kind === "01") {
      accounts++; currency = l.slice(16, 19); decimals = +l[19]; last = null;
    } else if (kind === "04") {
      const date = iso(l.slice(34, 40)) ?? iso(l.slice(42, 48));
      const c = amount(l);
      if (!date || !Number.isFinite(c)) { problems.push(`Line ${line}: unreadable date or amount in a 04 record, skipped.`); last = null; return; }
      if (c === 0) { last = null; return; }
      last = { line, date, desc: clean(l.slice(48, 79)), cents: c, balance: null };
      rows.push(last);
    } else if (kind === "05") {
      if (last && KEEP.has(l.slice(44, 47))) last.desc = clean(`${last.desc} ${l.slice(47, 119)}`);
    } else if (kind === "07") {
      const c = amount(l);
      if (Number.isFinite(c)) statement = { cents: c, date: iso(l.slice(34, 40)) };
      last = null;
    } else {
      problems.push(`Line ${line}: record "${kind}" is not part of CFONB 120, ignored.`);
    }
  });
  for (const r of rows) r.desc = r.desc || "CFONB movement";
  if (!rows.length) problems.push("No 04 movement records were found in the CFONB 120 file.");
  if (currency && currency !== "EUR" && rows.length) problems.push(`The account currency is ${currency}, not EUR; amounts are read as they are.`);
  if (decimals !== null && decimals !== 2 && rows.length) problems.push(`The file states ${decimals} decimals, not 2; amounts were scaled to cents.`);
  if (accounts > 1) problems.push(`The file holds ${accounts} accounts; all their lines were read into this one. Export one account at a time to keep them apart.`);
  return { rows, problems, columns: null, bank: "cfonb120", inferred: null, statement: accounts === 1 && statement?.date ? statement : null };
}
