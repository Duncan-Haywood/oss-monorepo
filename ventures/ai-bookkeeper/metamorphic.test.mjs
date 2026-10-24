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
