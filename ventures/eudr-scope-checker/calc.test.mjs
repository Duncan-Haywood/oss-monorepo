import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, classifyCode, classifyCodes, applicationDate, daysUntil, SAMPLE, summaryText, dutiesCsv, codesCsv } from "./calc.mjs";

const run = (o) => compute({ role: "operator", size: "large", eu: "market", risk: "standard", products: ["coffee"], ...o }, "2026-10-13");

test("rejects missing inputs instead of guessing", () => {
  assert.deepEqual(compute({}).errors, ["Choose your role.", "Choose your company size.", "Say whether you place products on the EU market or export from the EU."]);
  assert.match(run({ products: ["gold"] }).errors[0], /not an option/);
  assert.match(run({ risk: "extreme" }).errors[0], /risk/);
});

test("no EU connection, no commodity and out-of-scope types leave scope", () => {
  assert.equal(run({ eu: "none" }).status, "out");
  assert.equal(run({ products: [] }).status, "out");
  const r = run({ products: ["wood"], outOfScope: ["printed"] });
  assert.equal(r.status, "out");
  assert.match(r.reason, /Chapter 49|Printed/);
});

test("application dates follow size and EUTR coverage", () => {
  assert.equal(applicationDate("large", false), "2026-12-30");
  assert.equal(applicationDate("medium", false), "2026-12-30");
  assert.equal(applicationDate("small", false), "2027-06-30");
  assert.equal(applicationDate("micro", false), "2027-06-30");
  assert.equal(applicationDate("small", true), "2026-12-30");
  assert.equal(run({ size: "micro" }).applicationDate, "2027-06-30");
});

test("daysUntil counts calendar days and rejects junk", () => {
  assert.equal(daysUntil("2026-12-30", "2026-10-13"), 78);
  assert.equal(daysUntil("2026-12-30", "nope"), null);
  assert.equal(run({}).daysToApply, 78);
});

test("operators file a statement; small ones get the simplified route", () => {
  assert.ok(run({}).duties.some((d) => d.article === "Art 4(2), Art 12"));
  const s = run({ size: "small" });
  assert.ok(s.duties.some((d) => /simplified declaration/.test(d.text)));
  assert.ok(!s.duties.some((d) => d.article === "Art 4(2), Art 12"));
});

test("country risk changes the due diligence steps", () => {
  assert.ok(run({ risk: "low" }).duties.some((d) => d.article === "Art 13"));
  assert.ok(!run({ risk: "low" }).duties.some((d) => d.article === "Art 10, Art 11"));
  assert.ok(run({ risk: "standard" }).duties.some((d) => d.article === "Art 10, Art 11"));
  assert.ok(run({ risk: "high" }).duties.some((d) => /9%/.test(d.text)));
  assert.ok(run({ risk: "unknown" }).findings.some((f) => /benchmarking/.test(f.title)));
});

test("downstream operators and traders file no statement of their own", () => {
  for (const role of ["downstream", "trader"]) {
    const r = run({ role });
    assert.equal(r.status, "in");
    assert.ok(!r.duties.some((d) => /Art 4\(2\)/.test(d.article)), role);
    assert.ok(r.duties.some((d) => /five years/.test(d.text)), role);
  }
});

test("penalty line names Article 25 and the 4% floor", () => {
  assert.ok(run({}).duties.some((d) => d.article === "Art 25" && /4%/.test(d.text)));
});

test("code screen: likely, check, out, not listed, invalid", () => {
  assert.equal(classifyCode("0901 11 00").status, "likely");
  assert.equal(classifyCode("0901 11 00").commodity, "coffee");
  assert.equal(classifyCode("1806.32").commodity, "cocoa");
  assert.equal(classifyCode("9403 60 33").status, "check");
  assert.equal(classifyCode("4802 56").status, "check");
  assert.equal(classifyCode("4901 99").status, "out");
  assert.equal(classifyCode("8471 30").status, "not-listed");
  assert.equal(classifyCode("12").status, "invalid");
  assert.equal(classifyCodes("0901, 4901\n8471; x").length, 4);
});

test("sample, summary and CSVs round-trip", () => {
  const r = compute(SAMPLE, "2026-10-13");
  assert.equal(r.errors.length, 0);
  assert.match(summaryText(r), /In scope/);
  assert.match(dutiesCsv(r), /^role,article,duty/);
  assert.match(codesCsv(classifyCodes("0901")), /^code,status/);
});
