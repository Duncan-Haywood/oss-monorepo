import { test } from "node:test";
import assert from "node:assert/strict";
import { run, generate, WRITERS, VARIATIONS } from "./export-differential.mjs";
import { validate } from "./calc.mjs";
import * as csvConv from "../bank-csv-to-qbo-converter/calc.mjs";
import * as camtConv from "../camt053-to-ofx-converter/calc.mjs";

// Every OFX and QIF the portfolio's three converters write must be read back by the four readers with the
// same dates, amounts and payee, and our own checkers must find no error and no over-long field in it.
for (const v of [[], ...VARIATIONS.map((x) => [x]), ["all"]]) {
  test(`converters' OFX and QIF round-trip through every reader: ${v.join(",") || "plain"}`, () => {
    const { tally, examples } = run({ seed: 3, variations: v, cases: 60 });
    const bad = Object.entries(tally).filter(([, n]) => n);
    assert.deepEqual(bad, [], bad.map(([k]) => `${k}: ${JSON.stringify(examples[k]).slice(0, 900)}`).join("\n"));
  });
}

test("the generator is deterministic for a seed", () => {
  for (const w of WRITERS) {
    assert.equal(generate(42, w, ["all"]).source, generate(42, w, ["all"]).source);
    assert.notEqual(generate(42, w, ["all"]).source, generate(43, w, ["all"]).source);
  }
});

// The defects the harness found, pinned as plain examples.
const NOW = { now: "2026-11-18T12:00:00" };
const findings = (ofx) => validate(ofx).findings.filter((f) => f.severity === "error" || / longer than /.test(f.title)).map((f) => f.title);
const tag = (ofx, name) => [...ofx.matchAll(new RegExp(`<${name}>([^<\\r\\n]*)`, "g"))].map((m) => m[1]);

test("camt.053: a memo cut at 255 characters never ends inside an &amp; escape", () => {
  const ustrd = "X".repeat(252) + " &amp; tail"; // XML text "X...X & tail": the & sits at character 253
  const camt = camtConv.sampleCamt().replace("Rechnung 1041 Oktober", ustrd);
  const ofx = camtConv.toOfx(camtConv.analyze(camt).statements[0], NOW);
  for (const m of tag(ofx, "MEMO")) {
    assert.ok(m.length <= 255, `MEMO is ${m.length} characters`);
    assert.doesNotMatch(m, /&(?!amp;|lt;|gt;)/, `bare & in ${m.slice(-12)}`);
  }
  assert.deepEqual(findings(ofx), []);
});

test("ofx-file-check counts a field's length with each escape read once, as OFX 2's schema does", () => {
  const ofx = (name) => camtConv.toOfx(camtConv.analyze(camtConv.sampleCamt()).statements[0], NOW).replace(/<NAME>[^<\r\n]*/, `<NAME>${name}`);
  assert.deepEqual(findings(ofx("AT&amp;T &lt;wireless&gt; bill for the who")), []); // 32 characters once read
  assert.deepEqual(findings(ofx("AT&amp;T &lt;wireless&gt; bill for the whol")), ["NAME longer than 32 characters"]);
});

test("bank CSV: padding spaces do not use up the 32 characters of a NAME", () => {
  const csv = `Date,Description,Amount\r\n10/03/2026,"AMAZON      MKTPLACE      PMTS      SEATTLE WA",-12.50\r\n`;
  const ofx = csvConv.toOfx(csvConv.convert(csv, { dateOrder: "MDY", today: "2099-01-01" }), NOW);
  assert.deepEqual(tag(ofx, "NAME"), ["AMAZON MKTPLACE PMTS SEATTLE WA"]);
});
