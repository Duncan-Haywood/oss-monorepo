// Property test: render random transactions as bank CSVs with the quirks real
// exports have (BOM, CRLF, quoted commas and quotes, parenthesised negatives,
// thousands separators, European decimals, split debit/credit columns) and
// check readStatement returns exactly what was rendered. Seeded; no real bank
// file is involved.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "../bank.mjs";

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const descs = ['SQ *COFFEE, DOWNTOWN', 'ACME "PRO" SUPPLY', 'Rent', 'AMZN Mktp US*2K3', 'Müller & Söhne GmbH'];

function gen(r, n) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`,
    desc: pick(r, descs),
    cents: (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2_500_000)),
    i,
  }));
}
const money = (c, { thousands, comma, paren }) => {
  const a = Math.abs(c), whole = Math.floor(a / 100), frac = String(a % 100).padStart(2, "0");
  const w = thousands ? String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, comma ? "." : ",") : String(whole);
  const s = `${w}${comma ? "," : "."}${frac}`;
  return c < 0 ? (paren ? `(${s})` : `-${s}`) : s;
};

for (let seed = 1; seed <= 40; seed++) {
  test(`round trip, seed ${seed}`, () => {
    const r = rng(seed);
    const opt = { thousands: r() < 0.5, comma: r() < 0.3, paren: r() < 0.3 };
    const split = r() < 0.3, bom = r() < 0.4, crlf = r() < 0.5;
    const rows = gen(r, 5 + Math.floor(r() * 30));
    const style = pick(r, ["iso", "mdy", "dmy", "dMonY"]);
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fd = (d) => { const [y, m, dd] = d.split("-"); return style === "mdy" ? `${m}/${dd}/${y}` : style === "dmy" ? `${dd}/${m}/${y}` : style === "dMonY" ? `${+dd} ${MON[+m - 1]} ${y}` : d; };
    const sep = opt.comma ? ";" : ",";
    const qq = (s) => (s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const head = split ? ["Date", "Description", "Debit", "Credit"] : ["Date", "Description", "Amount"];
    const lines = [head.join(sep)];
    for (const x of rows) {
      const m = (c) => qq(money(c, { ...opt, paren: false }));
      const cells = split
        ? [fd(x.date), qq(x.desc), x.cents < 0 ? qq(money(-x.cents, { ...opt, paren: false })) : "", x.cents > 0 ? m(x.cents) : ""]
        : [fd(x.date), qq(x.desc), qq(money(x.cents, opt))];
      lines.push(cells.join(sep));
    }
    const text = (bom ? "﻿" : "") + lines.join(crlf ? "\r\n" : "\n") + (crlf ? "\r\n" : "\n");
    const out = readStatement(text, { decimalComma: opt.comma, dayFirst: style === "dmy" });
    assert.deepEqual(out.problems, []);
    assert.deepEqual(out.rows.map((x) => [x.date, x.desc, x.cents]), rows.map((x) => [x.date, x.desc.replace(/\s+/g, " "), x.cents]));
  });
}
