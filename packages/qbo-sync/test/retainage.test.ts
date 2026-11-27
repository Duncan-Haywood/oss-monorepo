import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { amountToCents, applyRateBps, centsToAmount } from "../src/money.ts";
import { AccountingValidationError } from "../src/port.ts";
import { planPayAppInvoice, retainageBalanceFromLines } from "../src/retainage.ts";

const RET = "ret-item";
const isValidation = (re: RegExp) => (err: unknown) =>
  err instanceof AccountingValidationError && re.test(err.message);

describe("money", () => {
  it("converts cents and amounts both ways without float noise", () => {
    assert.equal(centsToAmount(123456), 1234.56);
    assert.equal(amountToCents(1234.56), 123456);
    assert.equal(amountToCents(0.1 + 0.2), 30);
    assert.equal(amountToCents("-3000.00"), -300000);
    assert.equal(amountToCents(undefined), 0);
    assert.throws(() => centsToAmount(1.5), /integer/);
  });

  it("rounds a rate half away from zero, symmetric for negatives", () => {
    assert.equal(applyRateBps(105, 1000), 11); // 10.5 -> 11
    assert.equal(applyRateBps(-105, 1000), -11);
    assert.equal(applyRateBps(104, 1000), 10);
    assert.equal(applyRateBps(0, 1000), 0);
    assert.equal(applyRateBps(1, 0), 0);
  });
});

describe("planPayAppInvoice", () => {
  it("holds retainage as a negative line on the retainage item", () => {
    const plan = planPayAppInvoice({
      applicationNumber: 2,
      retainageItemId: RET,
      retainageRateBps: 1000,
      workLines: [{ itemId: "framing", description: "Framing", amountCents: 3_000_000 }],
    });
    assert.deepEqual(plan.lines, [
      { itemId: "framing", description: "Framing", amountCents: 3_000_000 },
      {
        itemId: RET,
        description: "Retainage held (10%), pay application #2",
        amountCents: -300_000,
      },
    ]);
    assert.deepEqual(plan.summary, {
      grossCents: 3_000_000,
      retainageHeldCents: 300_000,
      retainageReleasedCents: 0,
      netCents: 2_700_000,
      retainageBalanceAfterCents: null,
    });
  });

  it("groups held retainage by rate (e.g. stored materials at 5%)", () => {
    const plan = planPayAppInvoice({
      applicationNumber: 1,
      retainageItemId: RET,
      retainageRateBps: 1000,
      workLines: [
        { itemId: "a", description: "Labor", amountCents: 1_000_000 },
        { itemId: "b", description: "Stored lumber", amountCents: 400_000, retainageRateBps: 500 },
        { itemId: "c", description: "Labor, phase 2", amountCents: 200_000 },
      ],
    });
    const heldLines = plan.lines.filter((l) => l.itemId === RET);
    assert.deepEqual(
      heldLines.map((l) => [l.description, l.amountCents]),
      [
        ["Retainage held (10%), pay application #1", -120_000],
        ["Retainage held (5%), pay application #1", -20_000],
      ],
    );
    assert.equal(plan.summary.netCents, 1_600_000 - 140_000);
  });

  it("formats fractional rates", () => {
    const plan = planPayAppInvoice({
      applicationNumber: 1,
      retainageItemId: RET,
      retainageRateBps: 750,
      workLines: [{ itemId: "a", description: "Work", amountCents: 100_000 }],
    });
    assert.equal(plan.lines[1]?.description, "Retainage held (7.5%), pay application #1");
  });

  it("omits the held line at 0% and handles a negative change-order line", () => {
    const zero = planPayAppInvoice({
      applicationNumber: 1,
      retainageItemId: RET,
      retainageRateBps: 0,
      workLines: [{ itemId: "a", description: "Work", amountCents: 100_000 }],
    });
    assert.equal(zero.lines.length, 1);

    const co = planPayAppInvoice({
      applicationNumber: 3,
      retainageItemId: RET,
      retainageRateBps: 1000,
      workLines: [
        { itemId: "a", description: "Work", amountCents: 500_000 },
        { itemId: "co", description: "Deductive change order #4", amountCents: -100_000 },
      ],
    });
    assert.equal(co.summary.retainageHeldCents, 40_000);
    assert.equal(co.summary.netCents, 360_000);
  });

  it("releases retainage as a positive line and tracks the receivable balance", () => {
    const plan = planPayAppInvoice({
      applicationNumber: 6,
      retainageItemId: RET,
      retainageRateBps: 1000,
      workLines: [{ itemId: "a", description: "Punch list", amountCents: 100_000 }],
      retainageHeldToDateCents: 900_000,
      retainageReleasedCents: 910_000,
    });
    assert.deepEqual(plan.lines.at(-1), {
      itemId: RET,
      description: "Retainage released, pay application #6",
      amountCents: 910_000,
    });
    assert.equal(plan.summary.netCents, 100_000 - 10_000 + 910_000);
    assert.equal(plan.summary.retainageBalanceAfterCents, 0);
  });

  it("supports a release-only invoice", () => {
    const plan = planPayAppInvoice({
      applicationNumber: 7,
      retainageItemId: RET,
      retainageRateBps: 1000,
      workLines: [],
      retainageHeldToDateCents: 500_000,
      retainageReleasedCents: 250_000,
    });
    assert.equal(plan.lines.length, 1);
    assert.equal(plan.summary.netCents, 250_000);
    assert.equal(plan.summary.retainageBalanceAfterCents, 250_000);
  });

  it("refuses releases it cannot check, over-releases, and negative nets", () => {
    const base = {
      applicationNumber: 1,
      retainageItemId: RET,
      retainageRateBps: 1000,
      workLines: [{ itemId: "a", description: "Work", amountCents: 100_000 }],
    };
    assert.throws(
      () => planPayAppInvoice({ ...base, retainageReleasedCents: 1 }),
      isValidation(/retainageHeldToDateCents is required/),
    );
    assert.throws(
      () =>
        planPayAppInvoice({ ...base, retainageHeldToDateCents: 5, retainageReleasedCents: 10_006 }),
      isValidation(/exceeds retainage held to date \(10005\)/),
    );
    assert.throws(
      () =>
        planPayAppInvoice({
          ...base,
          workLines: [{ itemId: "a", description: "Credit", amountCents: -100_000 }],
        }),
      isValidation(/negative invoice/),
    );
    assert.throws(
      () => planPayAppInvoice({ ...base, retainageRateBps: 10_001 }),
      isValidation(/rate/),
    );
    assert.throws(
      () => planPayAppInvoice({ ...base, applicationNumber: 0 }),
      isValidation(/application/),
    );
    assert.throws(
      () => planPayAppInvoice({ ...base, workLines: [] }),
      isValidation(/nothing to bill/),
    );
    assert.throws(
      () =>
        planPayAppInvoice({
          ...base,
          workLines: [{ itemId: "a", description: "x", amountCents: 1.5 }],
        }),
      isValidation(/integer cents/),
    );
  });

  it("a whole job bills the contract sum and ends with a zero retainage balance", () => {
    const contract = 10_000_000; // $100,000.00
    const periods = [4_000_000, 3_500_000, 2_500_000];
    let heldToDate = 0;
    let billed = 0;
    const allLines: { itemId: string; amountCents: number }[] = [];
    periods.forEach((work, i) => {
      const last = i === periods.length - 1;
      const plan = planPayAppInvoice({
        applicationNumber: i + 1,
        retainageItemId: RET,
        retainageRateBps: 1000,
        workLines: [{ itemId: "contract", description: `Period ${i + 1}`, amountCents: work }],
        retainageHeldToDateCents: heldToDate,
        ...(last ? { retainageReleasedCents: heldToDate + Math.round(work / 10) } : {}),
      });
      heldToDate = plan.summary.retainageBalanceAfterCents ?? Number.NaN;
      billed += plan.summary.netCents;
      allLines.push(...plan.lines);
    });
    assert.equal(heldToDate, 0);
    assert.equal(billed, contract);
    assert.equal(retainageBalanceFromLines(allLines, RET), 0);
  });
});

describe("retainageBalanceFromLines", () => {
  it("is held minus released, ignoring other items", () => {
    assert.equal(
      retainageBalanceFromLines(
        [
          { itemId: "a", amountCents: 1_000 },
          { itemId: RET, amountCents: -100 },
          { itemId: RET, amountCents: -50 },
          { itemId: RET, amountCents: 30 },
        ],
        RET,
      ),
      120,
    );
  });
});
