import { describe, expect, it } from "vitest";
import { planQboCredit, QboCreditPlanError, qboCreditDocNumber } from "./qbo-credit";

const base = {
  appNumber: 3,
  shortClosedCents: 500_000,
  reason: "backcharge" as const,
  note: " Cleanup, GC letter 2/18 ",
  invoiceTotalCents: 4_500_000,
  certifiedAmountCents: null,
  openCents: 500_000,
};

describe("planQboCredit", () => {
  it("credits exactly the balance closed short, naming the reason and the note", () => {
    expect(planQboCredit(base)).toEqual({
      totalCents: 500_000,
      lines: [
        {
          kind: "closed_short",
          description: "Backcharge, pay application #3: Cleanup, GC letter 2/18",
          amountCents: 500_000,
        },
      ],
    });
  });

  it("adds the certified-below-billed difference when that is what else is open", () => {
    const plan = planQboCredit({
      ...base,
      reason: "disputed",
      note: null,
      certifiedAmountCents: 4_300_000,
      openCents: 700_000,
    });
    expect(plan.totalCents).toBe(700_000);
    expect(plan.lines.map((l) => [l.kind, l.amountCents])).toEqual([
      ["closed_short", 500_000],
      ["certified_below_billed", 200_000],
    ]);
    expect(plan.lines[1]?.description).toMatch(/\$43,000\.00, below the \$45,000\.00 billed/);
  });

  it("refuses when QuickBooks shows more or less open than PayApps can account for", () => {
    expect(() => planQboCredit({ ...base, openCents: 400_000 })).toThrow(/less than/);
    expect(() => planQboCredit({ ...base, openCents: 600_000 })).toThrow(QboCreditPlanError);
    expect(() =>
      planQboCredit({ ...base, certifiedAmountCents: 4_400_000, openCents: 800_000 }),
    ).toThrow(/more than/);
    expect(() => planQboCredit({ ...base, shortClosedCents: 0 })).toThrow(/no balance/);
  });
});

describe("qboCreditDocNumber", () => {
  it("swaps the PA prefix for CR, keeping the length", () => {
    expect(qboCreditDocNumber("PA24-117-03")).toBe("CR24-117-03");
    expect(qboCreditDocNumber("PA1234567890123456-01")).toHaveLength(21);
    expect(qboCreditDocNumber("X".repeat(21))).toHaveLength(21);
  });
});
