// Quarterly estimated tax: each expected figure is worked by hand in the comment beside it, or printed
// on the 2025 Form 2210 Schedule AI (irs.gov/pub/irs-pdf/f2210.pdf, read 2026-11-11 for ai-bookkeeper).
import {
  annualizedSeTax,
  type EstimateInput,
  estimate,
  estimatedDueDates,
  SS_WAGE_BASE,
  selfEmploymentTax,
  yearTax,
} from "@shared/estimated-tax";
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { describe, expect, it } from "vitest";

describe("estimatedDueDates", () => {
  it("gives April, June, September and January, past weekends", () => {
    expect(estimatedDueDates(2026)).toEqual([
      "2026-04-15",
      "2026-06-15",
      "2026-09-15",
      "2027-01-15",
    ]);
    // June 15 2025 was a Sunday.
    expect(estimatedDueDates(2025)).toEqual([
      "2025-04-15",
      "2025-06-16",
      "2025-09-15",
      "2026-01-15",
    ]);
  });
  it("moves past DC holidays: Emancipation Day 2022 and MLK Day 2024", () => {
    // April 16 2022 was a Saturday, observed Friday the 15th, so the date became Monday the 18th.
    expect(estimatedDueDates(2022)[0]).toBe("2022-04-18");
    // January 15 2024 was the third Monday of January.
    expect(estimatedDueDates(2023)[3]).toBe("2024-01-16");
  });
});

describe("self-employment tax", () => {
  it("caps social security at the 2026 wage base", () => {
    // $200,000 x 92.35% = 184,700; 184,500 x 12.4% = 22,878; 184,700 x 2.9% = 5,356.30; half 14,117.15.
    const se = selfEmploymentTax(20_000_000, SS_WAGE_BASE[2026]);
    expect(se).toEqual({
      netEarnings: 18_470_000,
      socialSecurity: 2_287_800,
      medicare: 535_630,
      tax: 2_823_430,
      deduction: 1_411_715,
    });
  });
  it("is nothing under $400 of net earnings", () => {
    expect(selfEmploymentTax(43_000, SS_WAGE_BASE[2026]).tax).toBe(0); // 430 x 0.9235 = 397.11
  });
  it("prorates the wage base as Schedule AI line 29 prints it", () => {
    const line29 = [0, 1, 2, 3].map((i) => annualizedSeTax(1e9, i, SS_WAGE_BASE[2025]).line29);
    expect(line29).toEqual([4_402_500, 7_337_500, 11_740_000, 17_610_000]);
  });
});

describe("yearTax", () => {
  it("works a $40,000 profit for a single filer in 2026", () => {
    // SE: 36,940 net earnings; 4,580.56 + 1,071.26 = 5,651.82; half 2,825.91.
    // AGI 37,174.09; less the 16,100 standard deduction = 21,074.09 before QBI.
    // QBI: smaller of 20% x 37,174.09 and 20% x 21,074.09 = 4,214.82. Taxable 16,859.27.
    // Brackets: 1,240.00 + 12% x 4,459.27 = 1,775.11. Total 1,775.11 + 5,651.82 = 7,426.93.
    const t = yearTax(4_000_000, { year: 2026, filing: "single", wages: 0, otherIncome: 0 });
    expect(t).toMatchObject({
      agi: 3_717_409,
      qbiDeduction: 421_482,
      taxable: 1_685_927,
      incomeTax: 177_511,
      addlMedicare: 0,
      total: 742_693,
    });
  });
  it("has no table for a year the IRS has not published", () => {
    expect(
      yearTax(4_000_000, { year: 2031, filing: "single", wages: 0, otherIncome: 0 }),
    ).toBeNull();
  });
});

const yearOver = (over: Partial<EstimateInput>): EstimateInput => ({
  year: 2026,
  asOf: "2027-01-02",
  filing: "single",
  wages: 0,
  otherIncome: 0,
  withholding: 0,
  priorYearTax: null,
  priorAgiOver150k: false,
  paid: [0, 0, 0, 0],
  profitToDate: [0, 0, 0, 4_000_000],
  ...over,
});

describe("estimate", () => {
  it("lets a fourth-quarter seller pay nothing until January under Schedule AI", () => {
    // Required: smaller of 90% x 7,426.93 = 6,684.24 and last year's 6,000 = 6,000; 1,500 a quarter.
    const e = estimate(yearOver({ priorYearTax: 600_000 }));
    expect(e.safeHarbor).toEqual({ current90: 668_424, prior: 600_000, required: 600_000 });
    expect(e.rows.map((r) => r.regularInstallment)).toEqual([150_000, 150_000, 150_000, 150_000]);
    // No profit until the last period; then 90% x 7,426.93 is capped by the four regular quarters.
    expect(e.rows.map((r) => r.annualizedInstallment)).toEqual([0, 0, 0, 600_000]);
    expect(e.rows.map((r) => r.cumulativeTarget)).toEqual([0, 0, 0, 600_000]);
    expect(e.rows.every((r) => r.status === "complete")).toBe(true);
    // January 2: the fourth date (January 15) is still ahead, with the whole $6,000 to send.
    expect(e.next).toEqual({ due: "2027-01-15", stillToPay: 600_000 });
  });
  it("adds 10% to last year's tax when last year's AGI was over $150,000", () => {
    const e = estimate(yearOver({ priorYearTax: 600_000, priorAgiOver150k: true }));
    expect(e.safeHarbor.prior).toBe(660_000);
    expect(e.safeHarbor.required).toBe(660_000);
  });
  it("counts payments and withholding against the target", () => {
    const even = [1_000_000, 1_666_667, 2_666_667, 4_000_000];
    const e = estimate(
      yearOver({
        profitToDate: even,
        priorYearTax: 600_000,
        withholding: 40_000,
        paid: [150_000, 0, 0, 0],
      }),
    );
    const r0 = e.rows[0];
    // Credited by April 15: the 1,500 paid plus a quarter of the 400 withheld.
    expect(r0?.credited).toBe(160_000);
    expect(r0?.stillToPay).toBe(Math.max(0, (r0?.cumulativeTarget ?? 0) - 160_000));
  });
  it("needs no payments when tax after withholding is under $1,000", () => {
    const e = estimate(yearOver({ profitToDate: [0, 0, 0, 500_000], withholding: 0 }));
    // $5,000 profit: SE 706.48, no income tax after the standard deduction.
    expect(e.projected?.total).toBe(70_648);
    expect(e.exempt).toBe(true);
    expect(e.rows.every((r) => r.stillToPay === 0)).toBe(true);
  });
  it("projects a year in progress and figures only the periods begun", () => {
    // 2026-02-14 is day 45 of 365: $1,000 so far projects to $8,111.11.
    const e = estimate(
      yearOver({
        asOf: "2026-02-14",
        profitToDate: [100_000, null, null, null],
        priorYearTax: 600_000,
      }),
    );
    expect(e.projectedProfit).toBe(811_111);
    expect(e.rows.map((r) => r.status)).toEqual([
      "in-progress",
      "not-started",
      "not-started",
      "not-started",
    ]);
    expect(e.rows[1]?.annualizedInstallment).toBeNull();
    expect(e.next?.due).toBe("2026-04-15");
  });
  it("uses only last year's tax for a year with no brackets on file", () => {
    const e = estimate(yearOver({ year: 2031, asOf: "2032-01-02", priorYearTax: 400_000 }));
    expect(e.bracketsOnFile).toBe(false);
    expect(e.safeHarbor).toEqual({ current90: null, prior: 400_000, required: 400_000 });
    expect(e.rows.map((r) => r.cumulativeTarget)).toEqual([100_000, 200_000, 300_000, 400_000]);
  });
});

describe("buildScheduleC through a date", () => {
  const input: ScInput = {
    year: 2026,
    sales: [
      {
        kind: "order",
        date: "2026-02-01",
        itemCents: 5000,
        shippingChargedCents: 0,
        refundCents: 0,
        shippingLabelCents: 0,
        fees: [],
      },
      {
        kind: "order",
        date: "2026-07-01",
        itemCents: 9000,
        shippingChargedCents: 0,
        refundCents: 0,
        shippingLabelCents: 0,
        fees: [],
      },
    ],
    charges: [],
    expenses: [],
    items: [
      { acquiredDate: "2026-01-10", costCents: 2000, status: "sold", disposedDate: "2026-02-01" },
      { acquiredDate: "2026-01-10", costCents: 3000, status: "sold", disposedDate: "2026-07-01" },
    ],
    unallocatedLots: [],
    businessMiles: 0,
    mileageRateCents: null,
  };
  it("counts only sales to the date and keeps later-sold items in closing inventory", () => {
    const ws = buildScheduleC({ ...input, through: "2026-03-31" });
    const line = (l: string) => ws.lines.find((x) => x.line === l)?.amountCents;
    expect(line("1")).toBe(5000);
    expect(ws.partIII.find((x) => x.line === "41")?.amountCents).toBe(3000);
    expect(line("29")).toBe(3000); // 5,000 sales less 2,000 cost of the item sold
    expect(buildScheduleC(input).lines.find((x) => x.line === "29")?.amountCents).toBe(9000);
  });
  it("refuses a date outside the year", () => {
    expect(() => buildScheduleC({ ...input, through: "2027-01-01" })).toThrow();
  });
});
