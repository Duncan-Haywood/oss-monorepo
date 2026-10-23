// A line of prose above the header, or a BOM before an MT940 file, once made
// readStatement return nothing (found by mutating the fixtures, 2026-10-23).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readStatement } from "./bank.mjs";

const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const sum = (r) => r.rows.reduce((s, x) => s + x.cents, 0);

for (const f of ["knab-nl.csv", "postfinance-account.tsv"]) {
  test(`${f}: a preamble line above the header changes nothing`, () => {
    const base = readStatement(fx(f));
    assert.ok(base.rows.length >= 2);
    for (const pre of ["Account Summary\n", "Account Summary\nGenerated Oct 1, 2026\n\n", "Generated Oct 1, 2026\n"]) {
      const r = readStatement(pre + fx(f));
      assert.equal(r.rows.length, base.rows.length);
      assert.equal(sum(r), sum(base));
    }
  });
}

test("MT940 with a byte-order mark reads the same rows", () => {
  const t = fx("checking.mt940");
  assert.equal(readStatement("﻿" + t).rows.length, readStatement(t).rows.length);
  assert.ok(readStatement(t).rows.length > 0);
});
