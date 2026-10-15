import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, incomeTax, personalAllowance, relief, trapGift } from "./calc.mjs";

test("personal allowance tapers away between 100k and 125,140", () => {
  assert.equal(personalAllowance(100000), 12570);
  assert.equal(personalAllowance(110000), 7570);
  assert.equal(personalAllowance(125140), 0);
});

test("income tax matches known figures", () => {
  assert.equal(incomeTax(50270), 7540);
  assert.equal(Math.round(incomeTax(150000)), 53703);
});

test("higher rate payer: 20% of the gross gift back", () => {
  const r = relief(800, 70000);
  assert.equal(r.gross, 1000);
  assert.equal(Math.round(r.relief), 200);
});

test("additional rate payer: 25% of the gross gift back", () => {
  assert.equal(Math.round(relief(800, 150000).relief), 250);
});

test("basic rate payer gets no extra relief", () => {
  assert.equal(relief(800, 30000).relief, 0);
});

test("inside the taper band relief exceeds 40% of the gross gift", () => {
  const r = relief(800, 110000);
  assert.equal(Math.round(r.relief), 400);
  assert.ok(r.relief / r.gross > 0.25);
});

test("a gift equal to income over 100k restores the full allowance", () => {
  const t = trapGift(110000);
  assert.equal(t.gross, 10000);
  assert.equal(t.net, 8000);
  assert.equal(Math.round(relief(t.net, 110000).relief), 4000);
  assert.equal(trapGift(90000), null);
});

test("worked example", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.gross, 1000);
  assert.equal(r.charityExtra, 200);
  assert.equal(Math.round(r.costNow), 600);
  assert.equal(r.carryBackBetter, null);
});

test("carry-back wins when last year's income was higher", () => {
  const r = compute({ ...SAMPLE, income: "30000", prevIncome: "80000" });
  assert.equal(r.carryBackBetter, true);
  assert.equal(r.best.which, "previous year");
  assert.ok(r.findings.some((f) => /Carrying the gift back/.test(f.title)));
});

test("carry-back is not recommended when it is worse", () => {
  const r = compute({ ...SAMPLE, prevIncome: "30000" });
  assert.equal(r.carryBackBetter, false);
  assert.equal(r.best.which, "this year");
});

test("tax too low to cover the claim is flagged", () => {
  const r = compute({ gift: "8000", income: "20000", prevIncome: "" });
  assert.ok(r.findings.some((f) => /may owe the difference/.test(f.title)));
});

test("scenarios scale the gift", () => {
  const r = compute(SAMPLE);
  assert.equal(r.scenarios.length, 4);
  assert.equal(r.scenarios[1].net, 800);
  assert.ok(r.scenarios[3].relief > r.scenarios[0].relief);
});

test("bad input is rejected", () => {
  assert.ok(compute({ ...SAMPLE, gift: "-1" }).errors.length);
  assert.ok(compute({ ...SAMPLE, gift: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, income: "" }).errors.length);
});

test("summary names the numbers", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /Net cost to you: £600\.00/);
  assert.match(t, /Not tax advice/);
});

test("the basic-rate 'no extra relief' finding appears only when there is no relief and no better carry-back", () => {
  const none = /No extra relief for you/;
  assert.ok(compute({ gift: "800", income: "30000", prevIncome: "" }).findings.some((f) => none.test(f.title)));
  assert.ok(!compute({ gift: "800", income: "30000", prevIncome: "" }).findings.some((f) => /Carrying the gift back/.test(f.title)));
  // Relief this year, so the message must not appear.
  assert.ok(!compute({ gift: "800", income: "60000", prevIncome: "" }).findings.some((f) => none.test(f.title)));
  // No relief this year but a better carry-back: the message is wrong then.
  const cb = compute({ gift: "800", income: "30000", prevIncome: "60000" });
  assert.equal(cb.carryBackBetter, true);
  assert.ok(!cb.findings.some((f) => none.test(f.title)));
});

test("the taper-trap finding appears only for incomes inside the 100k to 125,140 band", () => {
  const trap = /would restore the full allowance/;
  assert.ok(compute({ gift: "1000", income: "110000", prevIncome: "" }).findings.some((f) => trap.test(f.title)));
  assert.ok(!compute({ gift: "1000", income: "60000", prevIncome: "" }).findings.some((f) => trap.test(f.title)));
  assert.ok(!compute({ gift: "1000", income: "150000", prevIncome: "" }).findings.some((f) => trap.test(f.title)));
});
