import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, bracketTax, algemeneHeffingskorting, arbeidskorting, zvw, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("Box 1 brackets", () => {
  assert.equal(Math.round(bracketTax(38883, "2026") * 100) / 100, 13900.67);
  assert.ok(Math.abs(bracketTax(78426, "2026") - 28753.02) < 0.1);
  assert.ok(bracketTax(100000, "2026") > bracketTax(78426, "2026") + 21574 * 0.49);
});
test("algemene heffingskorting phases out and reaches zero", () => {
  assert.equal(algemeneHeffingskorting(20000, "2026"), 3115);
  assert.ok(algemeneHeffingskorting(78426, "2026") < 1);
  assert.equal(algemeneHeffingskorting(100000, "2026"), 0);
});
test("arbeidskorting follows the published table", () => {
  assert.equal(arbeidskorting(0, "2026"), 0);
  assert.ok(Math.abs(arbeidskorting(11965, "2026") - 996) < 0.1);
  assert.ok(Math.abs(arbeidskorting(25845, "2026") - 5300) < 0.1);
  assert.ok(Math.abs(arbeidskorting(45592, "2026") - 5685) < 0.1);
  assert.equal(arbeidskorting(140000, "2026"), 0);
});
test("Zvw is capped at the ceiling", () => {
  assert.equal(zvw(50000, "2026"), 2425);
  assert.equal(zvw(200000, "2026"), 3851.48);
});
test("worked example is consistent", () => {
  const r = run({});
  assert.equal(r.profit, 70000);
  assert.equal(r.zelfstandigenaftrek, 1200);
  assert.equal(r.mkb, 8737.6);
  assert.equal(r.taxable, 60062.4);
  assert.equal(r.tax, 16506.78);
  assert.equal(r.zvw, 2913.03);
  assert.equal(r.total, 19419.81);
  assert.ok(r.setAsidePct > 18 && r.setAsidePct < 28);
  assert.equal(r.afterTax, Math.round((r.profit - r.total) * 100) / 100);
});
test("without the hours test there is no entrepreneur deduction", () => {
  const r = run({ hours: "no", starter: "yes" });
  assert.equal(r.zelfstandigenaftrek, 0);
  assert.equal(r.startersaftrek, 0);
  assert.ok(r.total > run({}).total);
  assert.ok(r.findings.some((f) => /1,225/.test(f.title)));
});
test("starter deduction adds to the zelfstandigenaftrek", () => {
  const r = run({ starter: "yes" });
  assert.equal(r.startersaftrek, 2123);
  assert.ok(r.total < run({}).total);
});
test("deductions are worth at most 37.56% in the top bracket", () => {
  const r = run({ revenue: "250000", expenses: "0" });
  const plain = bracketTax(r.profit, "2026");
  assert.ok(plain - r.grossTax <= (r.zelfstandigenaftrek + r.mkb) * 0.3756 + 0.01);
});
test("expenses above income give nothing to set aside", () => {
  assert.equal(run({ revenue: "1000", expenses: "5000" }).total, 0);
});
test("credits never make income tax negative", () => {
  const r = run({ revenue: "12000", expenses: "0" });
  assert.ok(r.tax >= 0);
});
test("BTW and KOR finding", () => {
  assert.ok(run({}).findings.some((f) => /KOR/.test(f.title)));
  assert.ok(!run({ revenue: "15000", expenses: "0" }).findings.some((f) => /KOR/.test(f.title)));
});
test("validation", () => {
  assert.ok(run({ revenue: "" }).errors.length);
  assert.ok(run({ revenue: "-5" }).errors.length);
  assert.ok(run({ expenses: "x" }).errors.length);
});
test("summary tells the reader to verify", () => {
  assert.match(summaryText(run({})), /Verify figures on belastingdienst\.nl/);
});
