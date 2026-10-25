// Metamorphic check: a file's rows must not change when only its packaging does
// (line endings, byte-order mark, blank lines around it, trailing spaces).
// Every text fixture is read as it is and in each wrapping; the rows must match.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readStatement } from "./bank.mjs";

const dir = new URL("./fixtures/", import.meta.url);
const WRAPS = {
  crlf: (t) => t.replace(/\r?\n/g, "\r\n"),
  "bare CR (classic Mac)": (t) => t.replace(/\r?\n/g, "\r"),
  bom: (t) => "﻿" + t,
  "trailing blank lines": (t) => t.replace(/\s+$/, "") + "\n\n\n",
  "leading blank lines": (t) => "\n\n" + t,
  "trailing spaces": (t) => t.replace(/\n/g, "  \n"),
};
const sig = (r) => JSON.stringify((r.rows ?? []).map((x) => [x.date, x.cents, x.desc]));

for (const f of readdirSync(dir).filter((f) => !/\.(xls|xlsx|pdf)$/.test(f))) {
  test(`${f}: same rows under every wrapping`, () => {
    const t = readFileSync(new URL(f, dir), "utf8");
    const base = sig(readStatement(t));
    for (const [name, wrap] of Object.entries(WRAPS)) assert.equal(sig(readStatement(wrap(t))), base, `${f} changed under: ${name}`);
  });
}

// The same relation for the delimiter: a rectangular CSV re-written with ;, tab
// or | between fields must give the same rows. (Pipe-delimited bank exports
// read nothing until 2026-10-27; found by this loop.)
import { parseCsv } from "./bank.mjs";
const quote = (v, d) => (v.includes(d) || /["\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.every((r) => r.length === rows[0].length)) continue;
  test(`${f}: same rows under every delimiter`, () => {
    const base = sig(readStatement(t));
    for (const d of [";", "\t", "|"]) {
      const out = rows.map((r) => r.map((v) => quote(v, d)).join(d)).join("\n") + "\n";
      assert.equal(sig(readStatement(out)), base, `${f} changed with delimiter ${JSON.stringify(d)}`);
    }
  });
}

// Row order: banks export newest-first or oldest-first. Reversing the data
// lines under the header must give the same set of rows. (Checked 2026-10-25:
// no fixture changed, so this pins the behaviour rather than fixing a fault.)
const setSig = (r) => JSON.stringify((r.rows ?? []).map((x) => [x.date, x.cents, x.desc]).sort());
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8").replace(/\r\n/g, "\n");
  const lines = t.split("\n").filter(Boolean);
  const base = readStatement(t);
  if (!base.rows.length || lines.some((l) => (l.match(/"/g) ?? []).length % 2)) continue;
  test(`${f}: same rows when the data lines are reversed`, () => {
    for (let h = 0; h < Math.min(8, lines.length - 2); h++) {
      const out = [...lines.slice(0, h + 1), ...lines.slice(h + 1).reverse()].join("\n") + "\n";
      let r;
      try { r = readStatement(out); } catch { continue; }
      if (r.rows.length === base.rows.length) return assert.equal(setSig(r), setSig(base), `${f} changed when reversed under header line ${h}`);
    }
    assert.fail(`${f}: no header position read the reversed file`);
  });
}

// Amount spelling: the same cents written as $1,234.56, 1,234.56, (59.99) for
// money out, or 59.99- must read the same rows. (2026-10-25: a header-less CBA
// file with trailing-minus amounts failed the header-less test and had its
// dates read month first; found by this loop, fixed in `AMT`.)
const comma = (s) => { const [i, d] = s.split("."); return i.replace(/\B(?=(\d{3})+$)/g, ",") + "." + d; };
const FORMS = {
  dollar: (neg, a) => (neg ? "-$" : "$") + comma(a),
  commas: (neg, a) => (neg ? "-" : "") + comma(a),
  parens: (neg, a) => (neg ? "(" + a + ")" : a),
  "trailing minus": (neg, a) => a + (neg ? "-" : ""),
};
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  test(`${f}: same rows under every amount spelling`, () => {
    const base = sig(readStatement(t));
    for (const [name, fn] of Object.entries(FORMS)) {
      const out = rows.map((r) => r.map((v) => { const m = /^(-?)(\d+\.\d\d)$/.exec(v.trim()); return quote(m ? fn(!!m[1], m[2]) : v, ","); }).join(",")).join("\n") + "\n";
      assert.equal(sig(readStatement(out)), base, `${f} changed with amounts as ${name}`);
    }
  });
}
