import { test } from "node:test";
import assert from "node:assert/strict";
import { run, generate, VARIATIONS } from "./mt940-differential.mjs";
import { analyze } from "./calc.mjs";

// The three MT940 readers in the portfolio (ai-bookkeeper, mt940-statement-check and this one) must read
// the same transactions from every generated valid statement, and none may call a valid one an error.
for (const v of [[], ...VARIATIONS.map((x) => [x]), ["multi", "envelope", "hdr3", "trailer"], ["all"]]) {
  test(`all three MT940 readers agree with the generator: ${v.join(",") || "plain"}`, () => {
    const { tally, examples } = run({ seed: 7, variations: v, cases: 120 });
    for (const [name, t] of Object.entries(tally)) {
      assert.deepEqual(t, { wrong: 0, errors: 0, threw: 0 }, `${name}: ${JSON.stringify(examples[name])?.slice(0, 900)}`);
    }
  });
}

test("no reader throws on damaged files", () => {
  const { tally } = run({ seed: 11, variations: ["all", "mangle"], cases: 600 });
  for (const [name, t] of Object.entries(tally)) assert.equal(t.threw, 0, name);
});

test("the generator is deterministic for a seed", () => {
  assert.equal(generate(42, ["all"]).text, generate(42, ["all"]).text);
  assert.notEqual(generate(42, ["all"]).text, generate(43, ["all"]).text);
});

// The two bugs the harness found, pinned as plain examples.
const msg = (id, open, line, close, extra = "") =>
  `{1:F01ABNANL2AAXXX0000000000}{2:O9401200231001ABNANL2AAXXX00000000002310011200N}{4:\n:20:${id}\n:25:NL91ABNA0417164300\n:28C:${id}/1\n:60F:C${open}\n:61:${line}\n:86:Order {42} card payment\n:62F:C${close}\n-}${extra}`;

test("a SWIFT file with several {4:} messages reads every statement, not only the first", () => {
  const text = [
    msg("1", "231001EUR100,00", "231001C50,00NTRFNONREF", "231001EUR150,00", "{5:{CHK:ABCDEF123456}}"),
    msg("2", "231002EUR150,00", "231002D20,00NTRFNONREF", "231002EUR130,00"),
    msg("3", "231003EUR130,00", "231003RD5,00NTRFNONREF", "231003EUR135,00"),
  ].join("\n");
  const r = analyze(text);
  assert.equal(r.statements.length, 3);
  assert.deepEqual(r.statements.flatMap((s) => s.entries.map((e) => e.amount)), [5000, -2000, 500]);
  assert.deepEqual(r.findings.filter((f) => f.severity === "error"), []);
  // Line numbers still point at the original file: the second :61: is on line 15.
  assert.equal(r.statements[1].entries[0].line, 15);
});

test("a brace in :86: text does not end the SWIFT block early", () => {
  const r = analyze(msg("1", "231001EUR100,00", "231001C50,00NTRFNONREF", "231001EUR150,00"));
  assert.equal(r.statements[0].closing.amount, 15000);
  assert.match(r.statements[0].entries[0].text, /Order \{42\} card payment/);
});

test("two-digit years 70-99 are 19xx, like the portfolio's other MT940 readers", () => {
  const r = analyze(":20:A\n:25:NL91ABNA0417164300\n:60F:C961230EUR1,00\n:61:961231C1,00NTRFNONREF\n:86:x\n:62F:C961231EUR2,00\n-");
  assert.equal(r.statements[0].entries[0].valueDate, "1996-12-31");
  assert.equal(r.statements[0].opening.date, "1996-12-30");
});
