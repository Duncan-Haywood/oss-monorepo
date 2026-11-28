import { describe, expect, it } from "vitest";
import { planQboInterest, QboInterestPlanError, qboInterestDocNumber } from "./qbo-interest";

const base = {
  appNumber: 3,
  projectName: "Elm St clinic",
  invoiceDocNumber: "PA24-117-03",
  dueOn: "2026-09-30",
  paidOn: "2026-10-31",
  daysLate: 31,
  paidCents: 4_500_000,
  interestCents: 69_750,
  terms: {
    bps: 150,
    per: "month" as const,
    method: "prorata" as const,
    source: "Subcontract § 7.2",
  },
};

describe("late-payment interest as a QuickBooks invoice", () => {
  it("numbers it LI + the application's invoice tail, within 21 characters", () => {
    expect(qboInterestDocNumber("PA24-117-03")).toBe("LI24-117-03");
    expect(qboInterestDocNumber("PA123456789012345678-03")).toBe("LI123456789012345678-03");
    expect(qboInterestDocNumber("X".repeat(25))).toHaveLength(21);
  });

  it("describes the application, balance, dates, days and rate on one line", () => {
    const p = planQboInterest(base);
    expect(p.totalCents).toBe(69_750);
    expect(p.description).toBe(
      "Interest on late payment of pay application #3, invoice PA24-117-03: $45,000.00 due 2026-09-30, paid 2026-10-31, 31 days late, at 1.5% a month (Subcontract § 7.2).",
    );
    expect(p.customerMemo).toContain("Elm St clinic, pay application #3");
  });

  it("leaves out an invoice number and source it does not have, and says 1 day", () => {
    const p = planQboInterest({
      ...base,
      invoiceDocNumber: null,
      daysLate: 1,
      terms: { ...base.terms, per: "year", bps: 1000, source: null },
    });
    expect(p.description).toBe(
      "Interest on late payment of pay application #3: $45,000.00 due 2026-09-30, paid 2026-10-31, 1 day late, at 10% a year.",
    );
  });

  it("refuses nothing to invoice", () => {
    expect(() => planQboInterest({ ...base, interestCents: 0 })).toThrow(QboInterestPlanError);
    expect(() => planQboInterest({ ...base, interestCents: 1.5 })).toThrow(QboInterestPlanError);
  });
});
