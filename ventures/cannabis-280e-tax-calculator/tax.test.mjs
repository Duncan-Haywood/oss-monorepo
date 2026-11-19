import test from "node:test";
import assert from "node:assert/strict";
import { estimate, opexSensitivity, reclassFromLines, EXAMPLE, renderText } from "./tax.mjs";

test("280E taxes gross profit, not net profit", () => {
  const r = estimate({ ...EXAMPLE, stateRatePct: 0 });
  assert.equal(r.grossProfit, 1100000);
  assert.equal(r.trueNet, 320000);
  assert.equal(r.fedTaxableIncome, 1100000);
  assert.equal(r.fedTax, 231000);
  assert.equal(r.taxIfOrdinaryBusiness, 67200);
  assert.equal(r.extraTaxFrom280E, 163800);
  assert.equal(r.afterTaxCash, 89000);
  assert.equal(r.effectiveRateOnRealProfit, 72.19);
});

test("turning 280E off gives the ordinary-business answer", () => {
  const r = estimate({ ...EXAMPLE, applies: false });
  assert.equal(r.extraTaxFrom280E, 0);
  assert.equal(r.totalTax, r.taxIfOrdinaryBusiness);
});

test("a state that decouples taxes real net income", () => {
  const r = estimate({ ...EXAMPLE, stateConforms: false });
  assert.equal(r.stateTaxableIncome, 320000);
  assert.equal(r.stateTax, 22400);
});

test("tax can be owed while the business loses money", () => {
  const r = estimate({ receipts: 1000000, cogs: 600000, opex: 500000, fedRatePct: 21, stateRatePct: 0 });
  assert.equal(r.trueNet, -100000);
  assert.equal(r.fedTax, 84000);
  assert.equal(r.owesTaxWhileLosingMoney, true);
  assert.equal(r.effectiveRateOnRealProfit, null);
});

test("reclassifying expenses into COGS lowers the tax at the combined rate", () => {
  const base = estimate(EXAMPLE);
  const moved = estimate({ ...EXAMPLE, reclass: 50000 });
  assert.equal(base.totalTax - moved.totalTax, 14000);
  assert.equal(base.savingPer1000Reclassified, 280);
});

test("reclassification is capped at operating expenses", () => {
  const r = estimate({ ...EXAMPLE, reclass: 99999999 });
  assert.equal(r.fedTaxableIncome, 1100000 - 780000);
});

test("max opex before cash goes negative matches the after-tax identity", () => {
  const input = { ...EXAMPLE, stateRatePct: 0 };
  const m = estimate(input).maxOpexBeforeCashNegative;
  assert.equal(estimate({ ...input, opex: m }).afterTaxCash, 0);
});

test("sensitivity rows move with opex", () => {
  const rows = opexSensitivity(EXAMPLE);
  assert.equal(rows.length, 5);
  assert.ok(rows[0].trueNet > rows[4].trueNet);
  assert.equal(rows[0].totalTax, rows[4].totalTax);
});

test("worksheet lines sum to a reclass amount", () => {
  assert.equal(reclassFromLines([{ label: "Freight-in", amount: 40000, cogsPct: 100 }, { label: "Rent", amount: 120000, cogsPct: 10 }]), 52000);
  assert.throws(() => reclassFromLines([{ amount: 1, cogsPct: 120 }]));
});

test("bad input is rejected, not guessed", () => {
  assert.throws(() => estimate({ ...EXAMPLE, receipts: "abc" }), /number/);
  assert.throws(() => estimate({ ...EXAMPLE, cogs: 3000000 }), /exceed/);
  assert.throws(() => estimate({ ...EXAMPLE, fedRatePct: 90 }));
});

test("renderText mentions the extra tax", () => {
  assert.match(renderText(estimate(EXAMPLE)), /extra/);
});

test("renderText puts a loss's minus sign outside the dollar sign", () => {
  // 280E's own headline case: tax owed on a real loss. Was "$-200,000.00".
  const text = renderText(estimate({ ...EXAMPLE, opex: 1300000 }));
  assert.match(text, /real net after operating expenses -\$200,000\.00/);
  assert.match(text, /Cash left after tax -\$508,000\.00/);
  assert.doesNotMatch(text, /\$-/);
});

test("an open-ended range says '0 or more', not 'between 0 and Infinity'", () => {
  // The button sweep with FILL=-1 (2026-11-19) caught the page printing
  // "Gross receipts must be between 0 and Infinity".
  assert.throws(() => estimate({ ...EXAMPLE, receipts: -1 }), /^Error: Gross receipts must be 0 or more$/);
});
