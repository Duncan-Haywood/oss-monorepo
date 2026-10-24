// Norma 43 (Cuaderno 43, AEB) statements: the fixed-width file every Spanish
// bank (Santander, BBVA, CaixaBank, Sabadell, Bankinter...) offers next to
// CSV for accounting imports. Same row shape as bank.mjs readStatement, money
// INTO the account positive, plus `statement` { cents, date } from the final
// balance in the 33 record. Layout from the AEB Norma 43 specification as I
// know it: 11 account header, 22 movement, 23 complementary concept lines,
// 24 currency equivalence, 33 account trailer, 88 end of file. Pure function.

const LINE = /^(11|22|23|24|33|88)/;
export function isN43(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = lines.find((l) => /^11\d{18}\d{12}[12]\d{14}/.test(l));
  return !!head && lines.some((l) => /^22.{4}\d{4}\d{12}\d{5}[12]\d{14}/.test(l));
}

const iso = (v) => {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v ?? "");
  if (!m) return null;
  const y = +m[1] >= 70 ? 1900 + +m[1] : 2000 + +m[1];
  const t = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
  return t.getUTCMonth() === +m[2] - 1 ? t.toISOString().slice(0, 10) : null;
};
// 14 digits, the last two decimals; sign digit 1 is debe (money out), 2 haber (money in).
const amount = (sign, v) => (/^\d{14}$/.test(v) && (sign === "1" || sign === "2") ? (sign === "2" ? 1 : -1) * Number(v) : NaN);
const clean = (s) => s.replace(/\s+/g, " ").trim();

export function readN43(text) {
  const problems = [], rows = [];
  let accounts = 0, statement = null, last = null, currency = null;
  String(text).replace(/^﻿/, "").split(/\r?\n/).forEach((raw, i) => {
    const l = raw.replace(/\s+$/, "");
    if (!l) return;
    const line = i + 1, kind = (LINE.exec(l) ?? [])[1];
    if (kind === "11") {
      accounts++;
      currency = l.slice(47, 50);
    } else if (kind === "22") {
      const date = iso(l.slice(10, 16)) ?? iso(l.slice(16, 22));
      const c = amount(l[27], l.slice(28, 42));
      if (!date || !Number.isFinite(c)) { problems.push(`Line ${line}: unreadable date, sign or amount in a 22 record, skipped.`); last = null; return; }
      const ref = clean(l.slice(52, 80));
      if (c === 0) { last = null; return; }
      last = { line, date, desc: "", ref, cents: c, balance: null };
      rows.push(last);
    } else if (kind === "23") {
      // Complementary concept lines (two 38-character texts) carry the payee and the concept.
      if (last) last.desc = clean(`${last.desc} ${l.slice(4, 80)}`);
    } else if (kind === "33") {
      const c = amount(l[58], l.slice(59, 73));
      if (Number.isFinite(c)) statement = { cents: c, date: null };
      last = null;
    } else if (kind === "24") {
      last = null;
    } else if (kind !== "88") {
      problems.push(`Line ${line}: record "${l.slice(0, 2)}" is not part of Norma 43, ignored.`);
    }
  });
  for (const r of rows) { r.desc = r.desc || r.ref || "Norma 43 movement"; delete r.ref; }
  if (!rows.length) problems.push("No 22 movement records were found in the Norma 43 file.");
  if (currency && currency !== "978" && currency !== "   " && rows.length) problems.push(`The account currency code is ${currency}, not 978 (EUR); amounts are read as they are.`);
  if (accounts > 1) problems.push(`The file holds ${accounts} accounts; all their lines were read into this one. Export one account at a time to keep them apart.`);
  // The 33 record has no date of its own; the statement ends on the header's end date.
  if (statement && accounts === 1) {
    const h = String(text).replace(/^﻿/, "").split(/\r?\n/).find((l) => l.startsWith("11"));
    statement.date = iso(h.slice(26, 32)) ?? (rows.length ? rows[rows.length - 1].date : null);
  }
  return { rows, problems, columns: null, bank: "n43", inferred: null, statement: accounts === 1 && statement?.date ? statement : null };
}
