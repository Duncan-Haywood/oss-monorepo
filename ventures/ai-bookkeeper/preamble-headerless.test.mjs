// Header-less exports (Wells Fargo, CBA, TD, and inferred layouts) with a title
// or prose lines above the data were read as nothing (2026-10-23 mutation probe).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readStatement } from "./bank.mjs";

const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const sum = (r) => r.rows.reduce((s, x) => s + x.cents, 0);

for (const f of ["cba-no-header.csv", "td-no-header.csv"]) {
  test(`${f}: lines of prose above the first row change nothing`, () => {
    const base = readStatement(fx(f));
    assert.ok(base.rows.length >= 2);
    for (const pre of ["Account Summary\n", "Account Summary\nGenerated Oct 1, 2026\n\n", "Statement for account 1234, 1 Sep to 30 Sep\n"]) {
      const r = readStatement(pre + fx(f));
      assert.equal(r.rows.length, base.rows.length);
      assert.equal(sum(r), sum(base));
      assert.ok(r.problems.some((p) => /skipped as a preamble/.test(p)));
    }
  });
}

test("Wells Fargo shape with a preamble reads the same rows", () => {
  const wf = `"09/01/2026","-12.50","*","","COFFEE SHOP"\n"09/02/2026","1000.00","*","","PAYROLL"\n"09/03/2026","-40.00","*","101","CHECK"\n"09/04/2026","-5.00","*","","FEE"\n"09/05/2026","-6.00","*","","FEE2"\n`;
  const base = readStatement(wf), r = readStatement("Wells Fargo export\n" + wf);
  assert.equal(base.rows.length, 5);
  assert.equal(r.rows.length, 5);
  assert.equal(sum(r), sum(base));
});

test("a file with no data rows still fails cleanly", () => {
  assert.equal(readStatement("hello\nworld\nfoo\n").rows.length, 0);
});
