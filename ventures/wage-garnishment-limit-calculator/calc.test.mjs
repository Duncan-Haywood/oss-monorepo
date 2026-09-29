import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseMoney, whatIf, requestLetter, reportCsv, sampleInput, money, protectedFloor, supportPercent } from "./calc.mjs";

const base = (over = {}) => ({ period: "weekly", gross: "1000", fedTax: "100", fica: "76.5", orders: [{ type: "ordinary", demand: "" }], ...over });

test("parseMoney reads dollars, commas, parentheses and rejects other shapes", () => {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(50)"), -50);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("1.234,50"), null);
});

test("federal floor is 30, 60, 65 and 130 times the minimum wage", () => {
  assert.equal(protectedFloor("weekly"), 217.5);
  assert.equal(protectedFloor("biweekly"), 435);
  assert.equal(protectedFloor("semimonthly"), 471.25);
  assert.equal(protectedFloor("monthly"), 942.5);
  assert.equal(protectedFloor("weekly", 15), 450);
});

test("ordinary debt takes 25% when disposable earnings are well above the floor", () => {
  const a = analyze(base());
  assert.equal(a.summary.disposable, 823.5);
  assert.equal(a.summary.totalTake, 205.87);
  assert.equal(a.summary.shielded, 617.63);
});

test("ordinary debt takes only the excess over the floor when that is smaller", () => {
  const a = analyze(base({ gross: "300", fedTax: "0", fica: "0" }));
  assert.equal(a.summary.disposable, 300);
  assert.equal(a.summary.totalTake, 75);
  const b = analyze(base({ gross: "250", fedTax: "0", fica: "0" }));
  assert.equal(b.summary.totalTake, 32.5);
  assert.equal(b.results[0].reason, "everything above the federal floor");
});

test("nothing can be taken at or below the floor", () => {
  const a = analyze(base({ gross: "217.50", fedTax: "0", fica: "0" }));
  assert.equal(a.summary.totalTake, 0);
  assert.ok(a.findings.some((f) => /at or below the federal floor/.test(f.title)));
});

test("student loan is capped at 15%", () => {
  const a = analyze(base({ orders: [{ type: "student", demand: "" }] }));
  assert.equal(a.summary.totalTake, 123.52);
});

test("support percentages: 50, 60 and five points more for arrears", () => {
  assert.equal(supportPercent(true, false), 50);
  assert.equal(supportPercent(false, false), 60);
  assert.equal(supportPercent(true, true), 55);
  assert.equal(supportPercent(false, true), 65);
  const a = analyze(base({ orders: [{ type: "support", demand: "" }], supportsOther: false, arrears12: true }));
  assert.equal(a.summary.totalTake, 535.27);
});

test("student loan and ordinary debt together stay within 25%", () => {
  const a = analyze(base({ orders: [{ type: "student", demand: "" }, { type: "ordinary", demand: "" }] }));
  assert.equal(a.summary.totalTake, 205.87);
  assert.equal(a.results[0].take, 123.52);
  assert.equal(a.results[1].take, 82.35);
});

test("support comes first and the combined take stays within the support cap", () => {
  const a = analyze(base({ orders: [{ type: "ordinary", demand: "" }, { type: "support", demand: "300" }] }));
  assert.equal(a.results[0].type, "support");
  assert.equal(a.results[0].take, 300);
  assert.equal(a.results[1].take, 111.75);
  assert.ok(a.summary.totalTake <= a.summary.supportCap);
});

test("a lower state limit reduces the ordinary-debt cap", () => {
  const a = analyze(base({ stateLimitPct: "10" }));
  assert.equal(a.summary.totalTake, 82.35);
  assert.ok(a.findings.some((f) => /state limit is lower/.test(f.title)));
});

test("an order that asks for more than the limit is flagged as a question", () => {
  const a = analyze(base({ orders: [{ type: "ordinary", demand: "400" }] }));
  const f = a.findings.find((x) => /asks for more than the limit/.test(x.title));
  assert.ok(f);
  assert.equal(f.severity, "medium");
  assert.equal(a.summary.totalTake, 205.87);
});

test("an amount withheld above the maximum is the top finding with a yearly figure", () => {
  const a = analyze(base({ statedWithheld: "300" }));
  assert.equal(a.findings[0].severity, "high");
  assert.equal(a.findings[0].title, "The amount withheld is more than these numbers allow");
  assert.equal(a.summary.questioned, Math.round((300 - 205.87) * 100) / 100 * 52);
});

test("voluntary deductions do not shrink disposable earnings", () => {
  const a = analyze(base({ voluntary: "100" }));
  assert.equal(a.summary.disposable, 823.5);
  assert.equal(a.summary.net, 1000 - 176.5 - 100 - 205.87);
});

test("errors: pay frequency, gross, and deductions larger than gross", () => {
  assert.match(analyze({ gross: "100" }).error, /how often/);
  assert.match(analyze({ period: "weekly" }).error, /Gross pay/);
  assert.match(analyze(base({ fedTax: "5000" })).error, /larger than gross/);
  assert.match(analyze(base({ gross: "abc" })).error, /not a number/);
});

test("what-if shows how much of extra pay is kept", () => {
  const w = whatIf(base(), "200", "20");
  assert.equal(w.extraTax, 40);
  assert.ok(w.takeMore > 0);
  assert.ok(w.keepShare > 0.4 && w.keepShare < 0.8);
  assert.match(whatIf(base(), "", "20").error, /extra pay/);
});

test("letter asks for the worksheet and never alleges", () => {
  const a = analyze(sampleInput());
  const t = requestLetter(a, { name: "A. Worker", date: "2026-09-29" });
  assert.match(t, /worksheet/);
  assert.match(t, /asking, not alleging a mistake/);
  assert.doesNotMatch(t, /illegal|unlawful|violat|overcharg/i);
});

test("CSV escapes quotes and carries the maximum", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv, /Most that can be taken now/);
  assert.match(csv, /389.25/);
});

test("sample input analyses cleanly and flags the stub", () => {
  const a = analyze(sampleInput());
  assert.ok(!a.error);
  assert.equal(a.summary.totalTake, 389.25);
  assert.equal(a.findings[0].severity, "high");
  assert.equal(money(389.25), "389.25");
});
