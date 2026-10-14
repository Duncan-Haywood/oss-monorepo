import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, incomeTax, soli, gewerbesteuer, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("section 32a tariff: zone boundaries are continuous and match the statute", () => {
  assert.equal(incomeTax(12348, "2026"), 0);
  assert.equal(incomeTax(12349, "2026"), 0);
  assert.equal(incomeTax(17799, "2026"), 1034);
  assert.equal(incomeTax(17800, "2026"), 1035);
  assert.equal(incomeTax(60000, "2026"), 14233);
  assert.equal(incomeTax(69878, "2026"), 18213);
  assert.equal(incomeTax(69879, "2026"), 18213);
  assert.equal(incomeTax(300000, "2026"), 115529);
});
test("soli is zero under the Freigrenze, phased in above it, 5.5% far above", () => {
  assert.equal(soli(20350, "2026"), 0);
  assert.equal(soli(21350, "2026"), 119);
  assert.equal(soli(100000, "2026"), 5500);
});
test("Gewerbesteuer uses the 24,500 allowance and 3.5% Messzahl", () => {
  assert.deepEqual(gewerbesteuer(24500, 400, "2026"), { messbetrag: 0, tax: 0 });
  assert.deepEqual(gewerbesteuer(70000, 400, "2026"), { messbetrag: 1592, tax: 6368 });
});
test("worked example for a Freiberufler", () => {
  const r = run({});
  assert.equal(r.profit, 70000);
  assert.equal(r.zve, 61000);
  assert.equal(r.incomeTax, 14620);
  assert.equal(r.gewerbesteuer, 0);
  assert.equal(r.soli, 0);
  assert.equal(r.total, 14620);
  assert.equal(r.afterTax, 55380);
});
test("at a 400% Hebesatz the section 35 credit offsets Gewerbesteuer, so the total does not rise", () => {
  const f = run({}), g = run({ kind: "gewerbe" });
  assert.equal(g.gewerbesteuer, 6368);
  assert.equal(g.credit35, 6368);
  assert.equal(g.total, f.total);
});
test("a high Hebesatz costs real money beyond the credit", () => {
  assert.ok(run({ kind: "gewerbe", hebesatz: "490" }).total > run({}).total);
});
test("Kirchensteuer is a percentage of income tax", () => {
  assert.equal(run({ church: "9" }).church, 1315.8);
});
test("Soli appears for high earners", () => {
  assert.ok(run({ revenue: "250000", expenses: "20000" }).soli > 0);
});
test("loss-making year owes nothing", () => {
  const r = run({ revenue: "5000", expenses: "9000" });
  assert.equal(r.total, 0);
});
test("input validation", () => {
  assert.ok(run({ revenue: "abc" }).errors.length);
  assert.ok(run({ expenses: "-1" }).errors.length);
  assert.ok(run({ hebesatz: "5" }).errors.length);
  assert.ok(run({ revenue: "" }).errors.length);
});
test("Kleinunternehmer flag appears above 100,000", () => {
  const r = run({ revenue: "120000" });
  assert.ok(r.findings.some((f) => /ends the Kleinunternehmer/.test(f.title)));
});
test("summary text carries the disclaimer", () => {
  assert.match(summaryText(run({})), /Not tax advice/);
});
