import { test } from "node:test";
import assert from "node:assert/strict";
import { overUnder, EXAMPLE } from "./billing.mjs";

test("worked example on the page: $480,000 contract, $400,000 estimate, $150,000 cost, $210,000 billed", () => {
  const r = overUnder(EXAMPLE);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.costPct, 0.375);
  assert.equal(r.billedPct, 0.4375);
  assert.equal(r.earned, 18000000);
  assert.equal(r.over, 3000000);
  assert.equal(r.status, "over");
  assert.equal(r.grossProfit, 8000000);
  assert.equal(r.profitToDate, 3000000);
  assert.equal(r.netBilled, 18900000);
  assert.equal(r.cashOverCost, 3900000);
  // (150,000 + 60,000) / 400,000 = 52.5% of 480,000 = 252,000, less 210,000 billed.
  assert.equal(r.nextBill, 4200000);
  assert.match(r.entry, /^Dr Contract revenue \$30,000\.00\nCr Billings in excess of costs and estimated earnings/);
  assert.match(r.summary, /Overbilled by \$30,000\.00/);
});

test("underbilled: cost on work not yet billed (an unapproved change order, say)", () => {
  const r = overUnder({ ...EXAMPLE, costToDate: "200000", nextCost: "" });
  assert.equal(r.earned, 24000000);
  assert.equal(r.over, -3000000);
  assert.equal(r.status, "under");
  assert.match(r.entry, /^Dr Costs and estimated earnings in excess of billings \(an asset\) \$30,000\.00\nCr Contract revenue \$30,000\.00$/);
  assert.equal(r.nextBill, null);
  assert.doesNotMatch(r.summary, /next period/);
});

test("over plus earned always equals billed, to the cent", () => {
  for (const [c, e, k, b] of [["100000.01", "77777.77", "33333.33", "40000"], ["1", "3", "1", "0.33"], ["999999.99", "1", "0.5", "123.45"]]) {
    const r = overUnder({ contract: c, estCost: e, costToDate: k, billed: b });
    assert.equal(r.earned + r.over, r.billed);
    assert.ok(Number.isInteger(r.earned));
  }
});

test("cost past the estimate caps progress at 100% and says the estimate is stale", () => {
  const r = overUnder({ ...EXAMPLE, costToDate: "420000", billed: "470000" });
  assert.equal(r.costPct, 1);
  assert.equal(r.earned, 48000000);
  assert.match(r.warnings.join(" "), /more than the estimated total cost/);
});

test("a loss job is flagged with the whole expected loss", () => {
  const r = overUnder({ ...EXAMPLE, estCost: "500000" });
  assert.equal(r.loss, true);
  assert.equal(r.grossProfit, -2000000);
  assert.match(r.warnings.join(" "), /expected to lose \$20,000\.00/);
});

test("billing past the contract sum is warned about; next-period bill never goes negative", () => {
  const r = overUnder({ ...EXAMPLE, billed: "500000", nextCost: "0" });
  assert.match(r.warnings.join(" "), /more than the contract sum/);
  assert.equal(r.nextBill, 0);
});

test("bad input is reported, not computed", () => {
  assert.match(overUnder({ ...EXAMPLE, contract: "0" }).errors[0], /Contract sum must be more than zero/);
  assert.match(overUnder({ ...EXAMPLE, estCost: "" }).errors[0], /Estimated total cost must be more than zero/);
  assert.match(overUnder({ ...EXAMPLE, costToDate: "abc" }).errors[0], /Cost to date is not a number/);
  assert.match(overUnder({ ...EXAMPLE, billed: "-5" }).errors[0], /cannot be negative/);
  assert.match(overUnder({ ...EXAMPLE, retainage: "300000" }).errors[0], /Retainage held cannot be more than billed/);
  assert.equal(overUnder({ ...EXAMPLE, contract: "0" }).summary, undefined);
});

test("thousands separators and a dollar sign are read as the calculator reads them", () => {
  const r = overUnder({ ...EXAMPLE, contract: "$480,000.00", billed: "210,000" });
  assert.equal(r.over, 3000000);
});
