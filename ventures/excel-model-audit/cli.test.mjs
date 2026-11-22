import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./cli.mjs";
import { exampleWorkbook } from "./example.mjs";
import { buildXlsx } from "./xlsxwrite.mjs";

const sink = () => { const out = { text: "", write(s) { out.text += s; } }; return out; };
const dir = mkdtempSync(join(tmpdir(), "ema-"));

test("the CLI prints findings, writes a CSV and exits 1 on a high finding", async () => {
  const f = join(dir, "ex.xlsx"); writeFileSync(f, exampleWorkbook());
  const out = sink();
  const code = await main([f, "--csv", join(dir, "ex.csv"), "--min", "medium"], out);
  assert.equal(code, 1);
  assert.match(out.text, /108 formulas \(17 distinct\)/);
  assert.match(out.text, /\[high\] Plan!H5: .*neighbours imply =H4\*Inputs!\$B\$5/);
  assert.doesNotMatch(out.text, /\[info\]/);
  assert.match(readFileSync(join(dir, "ex.csv"), "utf8"), /^severity,rule/);
});

test("a clean workbook exits 0; --json is parseable; --help shows the disclaimer", async () => {
  const f = join(dir, "clean.xlsx"); writeFileSync(f, buildXlsx({ sheets: [{ name: "S", cells: { A1: 1, A2: 2, A3: "=SUM(A1:A2)" } }] }));
  const out = sink();
  assert.equal(await main([f, "--json"], out), 0);
  assert.equal(JSON.parse(out.text).summary.formulas, 1);
  const h = sink(); assert.equal(await main(["--help"], h), 0); assert.match(h.text, /No warranty/);
});

test("an unreadable file is reported, not thrown", async () => {
  const f = join(dir, "bad.xlsx"); writeFileSync(f, "not a zip");
  const out = sink();
  assert.equal(await main([f], out), 1);
  assert.match(out.text, /Not an \.xlsx file/);
});

test("a flag with no value exits 2 with the usage line", async () => {
  const out = sink();
  assert.equal(await main(["x.xlsx", "--csv"], out), 2);
  assert.match(out.text, /--csv needs a value/);
});
