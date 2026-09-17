import test from "node:test";
import assert from "node:assert/strict";

import {
  computeProratedRent,
  computeDepositSettlement,
  computeDepositInterest,
  formatItemizedStatement,
  STATEMENT_DISCLAIMER,
} from "./calculator.mjs";

function statementFor(depositAmount, deductions) {
  const settlement = computeDepositSettlement({ depositAmount, deductions });
  return formatItemizedStatement(settlement, { depositAmount });
}

function findingIds(result) {
  return result.findings.map((f) => f.id);
}

test("prorated rent: a half-occupied 30-day month is half the monthly rent", () => {
  const result = computeProratedRent({ monthlyRent: 3000, daysInMonth: 30, daysOccupied: 15 });
  assert.equal(result.dailyRate, 100);
  assert.equal(result.proratedAmount, 1500);
});

test("prorated rent: full occupancy equals the full monthly rent", () => {
  const result = computeProratedRent({ monthlyRent: 1550, daysInMonth: 31, daysOccupied: 31 });
  assert.equal(result.proratedAmount, 1550);
});

test("prorated rent: zero days occupied is zero owed", () => {
  const result = computeProratedRent({ monthlyRent: 2000, daysInMonth: 30, daysOccupied: 0 });
  assert.equal(result.proratedAmount, 0);
});

test("prorated rent: zero or missing rent is flagged", () => {
  const result = computeProratedRent({ monthlyRent: 0, daysInMonth: 30, daysOccupied: 10 });
  assert.ok(findingIds(result).includes("missing-rent"));
});

test("prorated rent: days occupied beyond the month is capped and flagged", () => {
  const result = computeProratedRent({ monthlyRent: 3000, daysInMonth: 30, daysOccupied: 45 });
  assert.equal(result.proratedAmount, 3000);
  assert.ok(findingIds(result).includes("days-exceed-month"));
});

test("prorated rent: negative or non-numeric input does not throw", () => {
  assert.doesNotThrow(() => computeProratedRent({ monthlyRent: -100, daysInMonth: 30, daysOccupied: 10 }));
  assert.doesNotThrow(() => computeProratedRent({ monthlyRent: NaN, daysInMonth: NaN, daysOccupied: NaN }));
  const result = computeProratedRent({ monthlyRent: undefined, daysInMonth: undefined, daysOccupied: undefined });
  assert.equal(result.proratedAmount, 0);
});

test("deposit settlement: no deductions refunds the full deposit", () => {
  const result = computeDepositSettlement({ depositAmount: 1500, deductions: [] });
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.refundDue, 1500);
  assert.equal(result.balanceOwed, 0);
  assert.ok(findingIds(result).includes("no-deductions"));
});

test("deposit settlement: deductions below the deposit produce a partial refund", () => {
  const result = computeDepositSettlement({
    depositAmount: 1500,
    deductions: [
      { description: "carpet cleaning", amount: 200 },
      { description: "broken blind", amount: 50 },
    ],
  });
  assert.equal(result.totalDeductions, 250);
  assert.equal(result.refundDue, 1250);
  assert.equal(result.balanceOwed, 0);
  assert.ok(!findingIds(result).includes("balance-owed"));
});

test("deposit settlement: deductions exceeding the deposit produce a balance owed, not a negative refund", () => {
  const result = computeDepositSettlement({
    depositAmount: 500,
    deductions: [{ description: "carpet replacement", amount: 900 }],
  });
  assert.equal(result.refundDue, 0);
  assert.equal(result.balanceOwed, 400);
  assert.ok(findingIds(result).includes("balance-owed"));
});

test("deposit settlement: a deduction with no description is flagged", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [{ description: "", amount: 100 }],
  });
  assert.ok(findingIds(result).includes("unitemized-deduction"));
});

test("deposit settlement: a deduction with a description is not flagged as unitemized", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [{ description: "wall patch and paint, bedroom", amount: 100 }],
  });
  assert.ok(!findingIds(result).includes("unitemized-deduction"));
});

test("deposit settlement: zero or negative deduction amounts are dropped, not counted", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [
      { description: "typo row", amount: 0 },
      { description: "negative row", amount: -50 },
      { description: "real charge", amount: 75 },
    ],
  });
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.totalDeductions, 75);
});

test("deposit settlement: the jurisdiction note is always present", () => {
  const result = computeDepositSettlement({ depositAmount: 1000, deductions: [] });
  assert.ok(findingIds(result).includes("jurisdiction-note"));
});

test("deposit settlement: negative or non-numeric input does not throw", () => {
  assert.doesNotThrow(() => computeDepositSettlement({ depositAmount: -100, deductions: null }));
  assert.doesNotThrow(() => computeDepositSettlement({ depositAmount: NaN, deductions: undefined }));
  const result = computeDepositSettlement({ depositAmount: undefined, deductions: undefined });
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.refundDue, 0);
});

// --- Deposit interest -------------------------------------------------------

test("deposit interest: a full year at a stated rate is the deposit times the rate", () => {
  const result = computeDepositInterest({ depositAmount: 1000, annualRatePercent: 2, daysHeld: 365 });
  assert.equal(result.interestAmount, 20);
});

test("deposit interest: half a year at a stated rate is half the annual interest", () => {
  const result = computeDepositInterest({ depositAmount: 2000, annualRatePercent: 1, daysHeld: 182.5 });
  assert.equal(result.interestAmount, 10);
});

test("deposit interest: no rate entered is zero interest and no finding", () => {
  const result = computeDepositInterest({ depositAmount: 1500, annualRatePercent: 0, daysHeld: 365 });
  assert.equal(result.interestAmount, 0);
  assert.equal(result.findings.length, 0);
});

test("deposit interest: a rate with no days held is zero interest, flagged rather than silently dropped", () => {
  const result = computeDepositInterest({ depositAmount: 1500, annualRatePercent: 2, daysHeld: 0 });
  assert.equal(result.interestAmount, 0);
  assert.ok(findingIds(result).includes("interest-rate-without-days"));
});

test("deposit interest: negative or non-numeric input does not throw", () => {
  assert.doesNotThrow(() => computeDepositInterest({ depositAmount: -100, annualRatePercent: NaN, daysHeld: undefined }));
  const result = computeDepositInterest({});
  assert.equal(result.interestAmount, 0);
});

test("deposit settlement: interest adds to the refund when deductions are below the deposit", () => {
  const interest = computeDepositInterest({ depositAmount: 1000, annualRatePercent: 2, daysHeld: 365 });
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [{ description: "cleaning", amount: 100 }],
    depositInterest: interest.interestAmount,
  });
  assert.equal(result.depositInterest, 20);
  assert.equal(result.refundDue, 920);
});

test("deposit settlement: interest can turn a balance owed into a smaller balance or a refund", () => {
  const result = computeDepositSettlement({
    depositAmount: 500,
    deductions: [{ description: "carpet replacement", amount: 520 }],
    depositInterest: 30,
  });
  assert.equal(result.balanceOwed, 0);
  assert.equal(result.refundDue, 10);
});

test("deposit settlement: with no interest entered, behaviour is unchanged from before interest existed", () => {
  const result = computeDepositSettlement({ depositAmount: 1500, deductions: [{ description: "cleaning", amount: 200 }] });
  assert.equal(result.depositInterest, 0);
  assert.equal(result.refundDue, 1300);
});

test("statement: an entered interest amount is credited on its own line before the total", () => {
  const settlement = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [{ description: "cleaning", amount: 100 }],
    depositInterest: 20,
  });
  const text = formatItemizedStatement(settlement, { depositAmount: 1000 });
  assert.match(text, /Interest credited: \$20\.00/);
  assert.match(text, /Refund due: \$920\.00/);
});

test("statement: no interest entered omits the interest line entirely", () => {
  const text = statementFor(1500, [{ description: "cleaning", amount: 200 }]);
  assert.doesNotMatch(text, /Interest credited/);
});

test("deposit settlement: rounds to the cent rather than accumulating float drift", () => {
  const result = computeDepositSettlement({
    depositAmount: 1000,
    deductions: [
      { description: "a", amount: 10.1 },
      { description: "b", amount: 20.2 },
      { description: "c", amount: 30.3 },
    ],
  });
  assert.equal(result.totalDeductions, 60.6);
});

// --- The itemized statement ------------------------------------------------
//
// The statement is the only output of this tool that leaves the browser and
// is read by somebody who never saw the page, so these tests are about what
// the other party to the lease receives, not about formatting taste.

test("statement: names every deduction and its amount, numbered", () => {
  const text = statementFor(1500, [
    { description: "Carpet cleaning, living room", amount: 180 },
    { description: "Replace broken mini blind", amount: 45 },
  ]);
  assert.match(text, /1\. Carpet cleaning, living room - \$180\.00/);
  assert.match(text, /2\. Replace broken mini blind - \$45\.00/);
});

test("statement: totals and the refund agree with the settlement it was built from", () => {
  const settlement = computeDepositSettlement({
    depositAmount: 1500,
    deductions: [{ description: "Carpet cleaning", amount: 180 }, { description: "Blind", amount: 45 }],
  });
  const text = formatItemizedStatement(settlement, { depositAmount: 1500 });
  assert.match(text, /Security deposit held: \$1,500\.00/);
  assert.match(text, /Total deductions: \$225\.00/);
  assert.match(text, /Refund due: \$1,275\.00/);
  assert.equal(settlement.refundDue, 1275);
});

test("statement: says balance owed rather than a refund when deductions exceed the deposit", () => {
  const text = statementFor(500, [{ description: "Unpaid rent", amount: 900 }]);
  assert.match(text, /Balance owed beyond the deposit: \$400\.00/);
  assert.doesNotMatch(text, /Refund due:/);
});

test("statement: a full refund reads as a refund of the whole deposit, not an empty document", () => {
  const text = statementFor(1200, []);
  assert.match(text, /Itemized deductions: none\./);
  assert.match(text, /Refund due: \$1,200\.00/);
});

// The page already flags an unlabelled deduction, but the page is not what
// the other party reads. A blank line item in a sent statement is an
// unexplained charge, which is the specific thing an itemized statement
// exists to prevent -- so it must be visible in the artifact too.
test("statement: an unlabelled deduction is called out rather than printed blank", () => {
  const text = statementFor(1000, [{ description: "   ", amount: 75 }]);
  assert.match(text, /1\. \(description needed\) - \$75\.00/);
});

test("statement: the arithmetic-only disclaimer travels with the copied text", () => {
  const text = statementFor(1500, [{ description: "Cleaning", amount: 100 }]);
  assert.ok(text.includes(STATEMENT_DISCLAIMER), "the disclaimer must be in the statement itself");
  assert.match(text, /not a legal determination of what may be deducted/);
  assert.match(text, /check the lease and local landlord-tenant law/);
});

test("statement: missing or malformed input does not throw", () => {
  assert.doesNotThrow(() => formatItemizedStatement(undefined, undefined));
  assert.doesNotThrow(() => formatItemizedStatement({}, { depositAmount: NaN }));
  assert.match(formatItemizedStatement({}, {}), /Security deposit held: \$0\.00/);
});
