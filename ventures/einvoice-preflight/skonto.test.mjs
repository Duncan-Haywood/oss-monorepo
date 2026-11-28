// Skonto in the payment terms (BT-20): the creator keeps the line break KoSIT's BR-DE-18 needs
// after a Skonto line, and XR-013 warns on the forms BR-DE-18 lets through (skonto-bench.mjs).
import assert from "node:assert/strict";
import test from "node:test";
import { plainAvailable } from "./plain-node.mjs";
import { paymentTermsText, skontoTermsIssue } from "./profile.mjs";
import { skontoTable, VARIANTS } from "./skonto-bench.mjs";

test("paymentTermsText ends a Skonto line with the break BR-DE-18 needs and leaves plain text alone", () => {
  assert.equal(paymentTermsText(" Zahlbar in 30 Tagen "), "Zahlbar in 30 Tagen");
  assert.equal(paymentTermsText("#SKONTO#TAGE=10#PROZENT=2.00#"), "#SKONTO#TAGE=10#PROZENT=2.00#\n");
});

test("skontoTermsIssue names the line to add for Skonto in words, and stays quiet on correct lines", () => {
  assert.deepEqual(skontoTermsIssue("2 % Skonto bei Zahlung innerhalb von 10 Tagen"), { kind: "words", line: "#SKONTO#TAGE=10#PROZENT=2.00#" });
  assert.deepEqual(skontoTermsIssue("SKONTO#TAGE=14#PROZENT=3.00#"), { kind: "no-hash", line: "#SKONTO#TAGE=14#PROZENT=3.00#" });
  assert.equal(skontoTermsIssue("#SKONTO#TAGE=10#PROZENT=2.00#\n"), null);
  assert.equal(skontoTermsIssue("Zahlbar innerhalb 30 Tagen"), null);
});

test("the bench, built-in only: XR-013 on exactly the two forms BR-DE-18 skips; creator files carry no XR-013 on correct lines", async () => {
  const rows = await skontoTable({ schematron: false });
  assert.equal(rows.length, VARIANTS.length * 2);
  for (const r of rows) {
    const expected = /führendes # fehlt|nur in Worten/.test(r.label) ? ["XR-013 (warning)"] : [];
    assert.deepEqual(r.builtin, expected, `${r.format} ${r.label}`);
  }
});

test("the bench with the official rules: correct lines pass, BR-DE-18 refuses the slips, the creator's files pass", async (t) => {
  if (!plainAvailable()) return t.skip("npm i --no-save slimdom fontoxpath");
  for (const r of await skontoTable()) {
    const correct = r.label.startsWith("richtig");
    const skipped = /führendes # fehlt|nur in Worten/.test(r.label);
    if (correct) assert.deepEqual(r.official, [], `${r.format} ${r.label}`);
    else if (skipped) assert.deepEqual(r.official, ["XR-013 (warning)"], `${r.format} ${r.label}`);
    else assert.ok(r.official.includes("BR-DE-18"), `${r.format} ${r.label}: ${r.official}`);
    if (correct || r.label === "kein Zeilenumbruch am Ende") assert.deepEqual(r.creator, [], `creator ${r.format} ${r.label}`);
  }
});
