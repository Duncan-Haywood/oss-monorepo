// Pure helpers: exact rounding, the PRO rules, and the edit-based diff. Proprietary.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { applyEdits, unifiedDiff } from "./diff.mjs";
import { exactSums, proRules, roundToCents } from "./rules.mjs";

test("roundToCents is exact half-up on the decimal string", () => {
  assert.equal(roundToCents("48.504"), "48.50");
  assert.equal(roundToCents("48.505"), "48.51");
  assert.equal(roundToCents("0.005"), "0.01");
  assert.equal(roundToCents("-1.005"), "-1.01");
  assert.equal(roundToCents("-0.004"), "0.00");
  assert.equal(roundToCents("1.015"), "1.02"); // binary floating point would give 1.01
  assert.equal(roundToCents("5"), "5.00");
  assert.equal(roundToCents(" 999.999 "), "1000.00");
});

test("PRO rules stay silent on every clean example invoice", () => {
  const dir = new URL("../examples/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".xml") && !f.includes("defects"))) {
    assert.deepEqual(proRules(readFileSync(new URL(f, dir), "utf8")), [], f);
  }
});

test("PRO-SUM-001 finds the totals the defect example gets wrong", () => {
  const xml = readFileSync(new URL("../examples/ubl-invoice-with-defects.xml", import.meta.url), "utf8");
  const rules = exactSums(xml).map((f) => f.message);
  assert.ok(rules.some((m) => m.includes("BR-CO-15")));
});

test("applyEdits applies in order and refuses overlaps", () => {
  assert.equal(applyEdits("abcdef", [{ start: 4, end: 5, text: "E" }, { start: 0, end: 1, text: "A" }]), "AbcdEf");
  assert.equal(applyEdits("abc", [{ start: 3, end: 3, text: "!" }]), "abc!");
  assert.throws(() => applyEdits("abcdef", [{ start: 0, end: 3, text: "" }, { start: 2, end: 4, text: "" }]));
});

test("unifiedDiff: separate hunks, line numbers shifted by insertions", () => {
  const src = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
  const at = (n) => src.indexOf(`line ${n}\n`);
  const edits = [
    { start: at(2) + "line 2".length, end: at(2) + "line 2".length, text: "\ninserted" },
    { start: at(15), end: at(15) + "line 15".length, text: "LINE 15" },
  ];
  const d = unifiedDiff(src, edits, { name: "f.xml", context: 1 });
  assert.equal(
    d,
    [
      "--- a/f.xml",
      "+++ b/f.xml",
      "@@ -1,3 +1,4 @@",
      " line 1",
      "-line 2",
      "+line 2",
      "+inserted",
      " line 3",
      "@@ -14,3 +15,3 @@",
      " line 14",
      "-line 15",
      "+LINE 15",
      " line 16",
      "",
    ].join("\n"),
  );
  assert.equal(unifiedDiff(src, []), "");
});

test("the paid layer imports no test data (eval/, fixtures/) and no module outside the app", () => {
  const dir = new URL("./", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".mjs") && !f.includes(".test."))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)) {
      assert.ok(!/eval\/|fixtures\//.test(m[1]), `${f} imports ${m[1]}`);
      assert.ok(m[1].startsWith("./") || m[1].startsWith("../") || m[1].startsWith("node:"), `${f} imports ${m[1]}`);
    }
  }
});
