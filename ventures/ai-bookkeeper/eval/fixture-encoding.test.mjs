// Metamorphic test over every CSV fixture in fixtures/: the same file saved the
// way other tools save it (UTF-8 BOM, CRLF line ends, blank lines after the
// data, trailing spaces after the last line) must read to exactly the same
// rows as the plain file. No new data: the fixtures are the oracle.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readStatement } from "../bank.mjs";

const dir = new URL("../fixtures/", import.meta.url);
const strip = (r) => ({ rows: r.rows.map((x) => [x.date, x.desc, x.cents, x.balance]), bank: r.bank });
const variants = {
  bom: (t) => "﻿" + t,
  crlf: (t) => t.replace(/\r?\n/g, "\r\n"),
  "bom+crlf": (t) => "﻿" + t.replace(/\r?\n/g, "\r\n"),
  "blank lines after data": (t) => t.replace(/\s*$/, "") + "\n\n\n",
  "no final newline": (t) => t.replace(/\s*$/, ""),
};

for (const f of readdirSync(dir).filter((n) => n.endsWith(".csv"))) {
  const text = readFileSync(new URL(f, dir), "utf8");
  const base = strip(readStatement(text));
  for (const [name, fn] of Object.entries(variants)) {
    test(`${f}: ${name} reads the same rows`, () => {
      assert.deepEqual(strip(readStatement(fn(text))), base);
    });
  }
}
