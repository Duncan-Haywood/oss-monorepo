import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, cpp, federalTax, bpa, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("CPP 2025: 11.9% of earnings between the $3,500 exemption and YMPE", () => {
  const c = cpp(50000, "2025");
  assert.equal(c.pens, 46500);
  assert.equal(c.total, 5533.5);
  assert.equal(c.cpp2, 0);
});
test("CPP is capped at the YMPE and CPP2 starts above it", () => {
  const c = cpp(90000, "2025");
  assert.equal(c.pens, 67800);
  assert.equal(c.base + c.enhanced, 8068.2);
  assert.equal(c.cpp2, 792); // (81,200 - 71,300) x 8%
});
test("no CPP on zero profit", () => {
  assert.equal(cpp(0, "2025").total, 0);
});
test("federal brackets stack", () => {
  assert.equal(federalTax(57375, "2025"), 8319.38);
  assert.equal(federalTax(100000, "2025"), 17057.5);
});
test("basic personal amount phases down only in the top bracket", () => {
  assert.equal(bpa(100000, "2025"), 16129);
  assert.equal(bpa(300000, "2025"), 14538);
  assert.ok(bpa(215000, "2025") < 16129 && bpa(215000, "2025") > 14538);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.net, 67000);
  assert.equal(r.cpp.pens, 63500);
  assert.equal(r.cpp.total, 7556.5);
  assert.equal(r.total, r2(r.federal + r.provincial + r.cpp.total));
  assert.ok(r.federal > 0 && r.provincial > 0);
  assert.equal(r.afterTax, r2(r.net - r.total));
});
test("expenses larger than revenue give nothing to set aside", () => {
  const r = run({ revenue: "1000", expenses: "5000" });
  assert.equal(r.net, 0);
  assert.equal(r.total, 0);
});
test("small supplier and instalment findings", () => {
  const big = run({});
  assert.ok(big.findings.some((f) => /small-supplier/.test(f.title)));
  assert.ok(big.findings.some((f) => /instalments/.test(f.title)));
  const small = run({ revenue: "20000", expenses: "0" });
  assert.ok(!small.findings.some((f) => /small-supplier/.test(f.title)));
});
test("2026 table is selectable and changes the answer", () => {
  assert.notEqual(run({ year: "2026" }).total, run({}).total);
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ provincialRate: "50" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on canada\.ca/);
});
function r2(n) { return Math.round(n * 100) / 100; }
