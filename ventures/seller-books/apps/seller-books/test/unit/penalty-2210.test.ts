// The Form 2210 underpayment penalty. The IRS cases are printed in "Instructions for Form 2210 (2025)"
// (irs.gov/pub/irs-pdf/i2210.pdf, re-downloaded 2026-11-28) and were first checked in ai-bookkeeper's
// penalty2210.test.mjs; the rates are on irs.gov/payments/quarterly-interest-rates (read 2026-11-28).
import { type EstimateInput, estimate } from "@shared/estimated-tax";
import {
  creditsByColumn,
  form2210Penalty,
  penaltyWorksheet,
  ratePeriods,
  sectionA,
} from "@shared/penalty-2210";
import { describe, expect, it } from "vitest";

const D = (x: number) => Math.round(x * 100);
const at = (cents: number, n: number, rate = 0.07, yearDays = 365) =>
  Math.round((cents * n * rate) / yearDays);

describe("Form 2210, the IRS examples", () => {
  it("Example 1: withholding a quarter a date, last year's overpayment on April 15", () => {
    const credits = creditsByColumn(
      2025,
      [
        { date: "2025-04-15", cents: D(1000) },
        { date: "2025-09-15", cents: D(500) },
        { date: "2026-01-15", cents: D(500) },
      ],
      D(4000),
    );
    expect(credits).toEqual([D(2000), D(1000), D(1500), D(1500)]);
  });

  it("Example 3 and 4: later payments pay the earliest column first, days from the printed date", () => {
    const payments = [
      { date: "2025-04-30", cents: D(2000) },
      { date: "2025-06-15", cents: D(3000) },
      { date: "2025-09-15", cents: D(4000) },
      { date: "2026-01-15", cents: D(4000) },
    ];
    const r = form2210Penalty(2025, [D(4000), D(4000), D(4000), D(4000)], { payments });
    expect(r.sectionA.map((c) => c.l17)).toEqual([D(4000), D(3000), D(3000), D(3000)]);
    const [a, b, c, d] = r.worksheet;
    expect(a?.paidBy).toEqual([
      { date: "2025-04-30", cents: D(2000) },
      { date: "2025-06-15", cents: D(2000) },
    ]);
    expect(b?.paidBy).toEqual([{ date: "2025-09-15", cents: D(3000) }]);
    expect(c?.paidBy).toEqual([{ date: "2026-01-15", cents: D(3000) }]);
    expect(d?.paidBy).toEqual([]);
    expect(a?.lines[0]?.days).toEqual([15, 61]);
    expect(a?.penalty).toBe(at(D(2000), 15) + at(D(2000), 61));
    expect(b?.penalty).toBe(at(D(3000), 15) + at(D(3000), 77));
    expect(c?.penalty).toBe(at(D(3000), 15) + at(D(3000), 92) + at(D(3000), 15));
    expect(d?.penalty).toBe(at(D(3000), 90));
    expect(r.warnings).toEqual([]);
  });

  it("Table 2: total days per rate period when nothing is paid", () => {
    const w = penaltyWorksheet(2025, [D(100), D(100), D(100), D(100)]);
    expect(w.columns.map((c) => c.lines.map((l) => l.days[0] ?? 0))).toEqual([
      [76, 92, 92, 105],
      [15, 92, 92, 105],
      [0, 15, 92, 105],
      [0, 0, 0, 90],
    ]);
  });

  it("Example 5 (2024, a leap year): 2024's periods divide by 366 at 8%", () => {
    const payments = [
      { date: "2024-04-30", cents: D(2000) },
      { date: "2024-06-15", cents: D(3000) },
      { date: "2024-09-15", cents: D(4000) },
      { date: "2025-01-15", cents: D(4000) },
    ];
    const r = form2210Penalty(2024, [D(4000), D(4000), D(4000), D(4000)], { payments });
    // "$6.56" and "$26.67" on line 4, column (a).
    expect(r.worksheet[0]?.lines[0]?.cents).toBe(656 + 2667);
    expect(r.rates.map((p) => p.yearDays)).toEqual([366, 366, 366, 365]);
  });

  it("Section A carries an overpayment forward and a short payment's leftover (line 16)", () => {
    expect(sectionA([100, 100, 100, 100], [250, 0, 0, 100]).map((c) => c.l17)).toEqual([
      0, 0, 50, 50,
    ]);
    expect(sectionA([100, 100, 100, 100], [0, 30, 0, 0])[1]?.l16).toBe(70);
  });

  it("a payment on the Monday after a Sunday due date is on time", () => {
    const r = form2210Penalty(2025, [0, D(1000), 0, 0], {
      payments: [{ date: "2025-06-16", cents: D(1000) }],
    });
    expect(r.penalty).toBe(0);
  });

  it("2026 rates are 6% in Q2 and 7% after; 2027 Q1 is not out yet and says so", () => {
    const { periods, warnings } = ratePeriods(2026);
    expect(periods.map((p) => p.rate)).toEqual([0.06, 0.07, 0.07, 0.07]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/2027 Q1; 7% \(the last one on file, 2026 Q4\)/);
  });
});

describe("the count stops at `through`", () => {
  it("an unpaid April installment runs to the day given, not to next April", () => {
    // $1,000 short on April 15 2026, figured on May 15: 30 days at 6%.
    const w = penaltyWorksheet(2026, [D(1000), 0, 0, 0], [], { through: "2026-05-15" });
    expect(w.columns[0]?.lines.map((l) => l.days)).toEqual([[30], [], [], []]);
    expect(w.penalty).toBe(at(D(1000), 30, 0.06));
  });

  it("a later date past April 15 of the next year is held to April 15", () => {
    const w = penaltyWorksheet(2025, [D(1000), 0, 0, 0], [], { through: "2026-08-01" });
    expect(w.through).toBe("2026-04-15");
    expect(w.columns[0]?.lines.map((l) => l.days[0])).toEqual([76, 92, 92, 105]);
  });

  it("a payment after `through` has not happened yet", () => {
    const w = penaltyWorksheet(2026, [D(1000), 0, 0, 0], [{ date: "2026-06-01", cents: D(1000) }], {
      through: "2026-05-15",
    });
    expect(w.columns[0]?.paidBy).toEqual([]);
    expect(w.columns[0]?.unpaid).toBe(D(1000));
  });
});

describe("estimate() carries the penalty so far", () => {
  // A single seller with no wages: last year's tax $8,000, so the regular installment is $2,000.
  const base: EstimateInput = {
    year: 2026,
    asOf: "2026-07-15",
    filing: "single",
    wages: 0,
    otherIncome: 0,
    withholding: 0,
    priorYearTax: D(8000),
    priorAgiOver150k: false,
    paid: [0, 0, 0, 0],
    profitToDate: [D(15000), D(25000), D(40000), null],
  };

  it("is null before the first due date", () => {
    expect(
      estimate({ ...base, asOf: "2026-04-10", profitToDate: [D(15000), null, null, null] }).penalty,
    ).toBeNull();
  });

  it("nothing paid: April and June shortfalls run to today, the lower method wins", () => {
    const e = estimate(base);
    const p = e.penalty;
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.through).toBe("2026-07-15");
    expect(p.byDate.map((b) => b.due)).toEqual(["2026-04-15", "2026-06-15"]);
    const regular = form2210Penalty(2026, [D(2000), D(2000), D(2000), D(2000)], {
      payments: [],
      through: "2026-07-15",
    }).penalty;
    expect(p.cents).toBeLessThanOrEqual(regular);
    expect(p.cents).toBeGreaterThan(0);
    expect(p.next30Days).toBeGreaterThan(0);
    expect(
      e.warnings.some((w) => w.includes("as if each payment typed in was sent by its due date")),
    ).toBe(true);
  });

  it("the regular installments paid on time: no penalty", () => {
    const e = estimate({ ...base, paid: [D(2000), D(2000), 0, 0] });
    expect(e.penalty?.cents).toBe(0);
    expect(e.penalty?.next30Days).toBe(0);
    expect(e.warnings.some((w) => w.includes("underpayment penalty"))).toBe(false);
  });

  it("the regular figure matches a hand count when the annualized one is not figured", () => {
    // No books for the first period, so Schedule AI cannot be used: regular only.
    const e = estimate({ ...base, asOf: "2026-05-15", profitToDate: [null, D(30000), null, null] });
    expect(e.safeHarbor.required).toBe(D(8000));
    expect(e.penalty?.method).toBe("regular");
    // $2,000 short from April 15 to May 15: 30 days at 6% / 365.
    expect(e.penalty?.cents).toBe(at(D(2000), 30, 0.06));
    // 30 more days (to June 14, before the June installment is due): 60 days in all at 6%, less the 30.
    expect(e.penalty?.next30Days).toBe(at(D(2000), 60, 0.06) - at(D(2000), 30, 0.06));
  });

  it("under $1,000 of tax after withholding owes no penalty", () => {
    const e = estimate({
      ...base,
      priorYearTax: D(500),
      profitToDate: [D(100), D(200), D(300), null],
    });
    expect(e.exempt).toBe(true);
    expect(e.penalty?.cents).toBe(0);
  });

  it("after April 15 of the next year the count has stopped and the balance-due note shows", () => {
    const e = estimate({
      ...base,
      year: 2025,
      asOf: "2026-06-01",
      priorYearTax: D(8000),
      profitToDate: [D(15000), D(25000), D(40000), D(60000)],
    });
    expect(e.penalty?.through).toBe("2026-04-15");
    expect(e.penalty?.next30Days).toBe(0);
    expect(e.warnings.some((w) => w.includes("stops on April 15"))).toBe(true);
  });
});

describe("the worked case in the customer post (docs/posts/2026-11-24-reseller-payouts-...)", () => {
  it("$2,000 a date, nothing paid, figured on November 28, 2026: $174.14, and $34.53 per 30 days more", () => {
    const required = [D(2000), D(2000), D(2000), D(2000)];
    const now = form2210Penalty(2026, required, { through: "2026-11-28" });
    // April: 76 days at 6%, 92 at 7%, 59 at 7%; June: 15 at 6%, 92, 59; September: 15 and 59 at 7%.
    expect(now.worksheet.map((c) => c.penalty)).toEqual([8291, 6285, 2838, 0]);
    expect(now.penalty).toBe(17414);
    const later = form2210Penalty(2026, required, { through: "2026-12-28" });
    expect(later.penalty - now.penalty).toBe(3453);
  });
});
