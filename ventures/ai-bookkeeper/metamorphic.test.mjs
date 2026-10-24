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
