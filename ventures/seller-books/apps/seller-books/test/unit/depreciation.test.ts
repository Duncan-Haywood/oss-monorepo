// Form 4562 for line 13 (services/books/depreciation.ts): the MACRS tables, bonus rates by date, section 179
// limits, the mid-quarter test, later years, and the Schedule C worksheet counting line 13 in lines 28-31.
import {
  bonusPct,
  type DepAsset,
  depreciationForYear,
  HALF_YEAR,
  MID_QUARTER,
  macrsYear,
  RECOVERY_YEARS,
} from "@worker/services/books/depreciation";
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { describe, expect, it } from "vitest";

const asset = (over: Partial<DepAsset> = {}): DepAsset => ({
  id: "exp_1",
  date: "2026-03-10",
  amountCents: 300_000,
  vendor: "Laptop store",
  memo: null,
  method: null,
  recoveryYears: null,
  businessUsePct: null,
  ...over,
});

/** The 200%-declining-balance-to-straight-line method the IRS tables come from, in percent. */
function generated(life: number, firstYearFraction: number): number[] {
  const rate = 2 / life;
  const out: number[] = [];
  let basis = 1;
  let remainingLife = life;
  for (let y = 0; y <= life; y++) {
    let amt: number;
    if (y === 0) {
      amt = basis * rate * firstYearFraction;
      remainingLife = life - firstYearFraction;
    } else {
      amt = Math.min(basis, Math.max(basis * rate, basis / remainingLife));
      remainingLife -= 1;
    }
    out.push(amt * 100);
    basis -= amt;
  }
  return out.filter((x) => x > 1e-9);
}

describe("the MACRS tables", () => {
  it("each row adds to 100%", () => {
    for (const cls of RECOVERY_YEARS) {
      expect(HALF_YEAR[cls].reduce((s, p) => s + p, 0)).toBe(10_000);
      for (const row of MID_QUARTER[cls]) expect(row.reduce((s, p) => s + p, 0)).toBe(10_000);
    }
  });

  it("match the declining-balance method they come from, to a few hundredths of a point", () => {
    const fractions = [0.875, 0.625, 0.375, 0.125];
    for (const cls of RECOVERY_YEARS) {
      const hy = generated(cls, 0.5);
      HALF_YEAR[cls].forEach((p, k) => {
        expect(Math.abs(p / 100 - (hy[k] ?? 0))).toBeLessThan(0.05);
      });
      MID_QUARTER[cls].forEach((row, q) => {
        const g = generated(cls, fractions[q] ?? 0);
        expect(row.length).toBe(g.length);
        row.forEach((p, k) => {
          expect(Math.abs(p / 100 - (g[k] ?? 0))).toBeLessThan(0.05);
        });
      });
    }
  });

  it("spreads a basis over the years to the cent", () => {
    const table = HALF_YEAR[7];
    const years = table.map((_, k) => macrsYear(123_457, table, k));
    expect(years.reduce((s, c) => s + c, 0)).toBe(123_457);
    expect(years[0]).toBe(Math.round(123_457 * 0.1429));
    expect(macrsYear(123_457, table, table.length)).toBe(0);
  });
});

describe("bonus rates by the date bought", () => {
  it("follows the 2025 law and the phase-down before it", () => {
    expect(bonusPct("2026-06-01")).toBe(100);
    expect(bonusPct("2025-01-20")).toBe(100);
    expect(bonusPct("2025-01-19")).toBe(40);
    expect(bonusPct("2024-12-31")).toBe(60);
    expect(bonusPct("2023-05-01")).toBe(80);
    expect(bonusPct("2019-05-01")).toBe(100);
    expect(bonusPct("2017-05-01")).toBeNull();
  });
});

describe("line 13 for a year", () => {
  it("takes the whole laptop as bonus by default, with nothing in later years", () => {
    const r = depreciationForYear([asset()], 2026);
    expect(r.line13Cents).toBe(300_000);
    expect(r.rows[0]).toMatchObject({ method: "bonus", bonusCents: 300_000, macrsCents: 0 });
    expect(depreciationForYear([asset()], 2027).rows).toEqual([]);
  });

  it("depreciates what 40% bonus leaves over 5 years, half-year", () => {
    const a = asset({ date: "2025-01-10", amountCents: 1_000_000, recoveryYears: 5 });
    const y1 = depreciationForYear([a], 2025);
    // 40% bonus = 4,000; 6,000 left; 20% of it = 1,200.
    expect(y1.rows[0]).toMatchObject({ bonusCents: 400_000, macrsCents: 120_000 });
    expect(y1.line13Cents).toBe(520_000);
    const y2 = depreciationForYear([a], 2026);
    expect(y2.rows[0]).toMatchObject({ bonusCents: 0, macrsCents: 192_000 });
    // Every year adds back to the cost.
    let total = 0;
    for (let y = 2025; y <= 2031; y++) total += depreciationForYear([a], y).line13Cents;
    expect(total).toBe(1_000_000);
  });

  it("asks for the class when bonus leaves something and none is chosen", () => {
    const r = depreciationForYear([asset({ date: "2024-06-01", amountCents: 500_000 })], 2024);
    expect(r.rows[0]?.totalCents).toBeNull();
    expect(r.rows[0]?.reason).toMatch(/5 years/);
    expect(r.line13Cents).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/1 equipment purchase is not worked out/);
  });

  it("uses no bonus when elected out, and flags a class that mixes the two", () => {
    const a = asset({ method: "no_bonus", recoveryYears: 7 });
    const r = depreciationForYear([a, asset({ id: "exp_2", recoveryYears: 7 })], 2026);
    expect(r.rows[0]).toMatchObject({ bonusCents: 0, macrsCents: Math.round(300_000 * 0.1429) });
    expect(r.warnings.join(" ")).toMatch(/mixes bonus and "no bonus"/);
  });

  it("applies the mid-quarter tables when most of the year's basis came in October to December", () => {
    const a = asset({ date: "2026-11-20", method: "no_bonus", recoveryYears: 5 });
    const r = depreciationForYear([a], 2026);
    expect(r.midQuarterYears).toEqual([2026]);
    expect(r.rows[0]).toMatchObject({ convention: "mid-quarter", macrsCents: 15_000 }); // 5% of 3,000
    expect(depreciationForYear([a], 2027).rows[0]?.macrsCents).toBe(114_000); // 38%
  });

  it("depreciates only the business share and refuses 50% or less", () => {
    const part = depreciationForYear([asset({ businessUsePct: 80 })], 2026);
    expect(part.rows[0]).toMatchObject({ basisCents: 240_000, bonusCents: 240_000 });
    const half = depreciationForYear([asset({ businessUsePct: 50 })], 2026);
    expect(half.rows[0]?.reason).toMatch(/listed property/);
    expect(half.line13Cents).toBe(0);
  });

  it("limits section 179 to the business's profit and carries the rest", () => {
    const a = asset({ method: "section_179", amountCents: 500_000 });
    expect(depreciationForYear([a], 2026).line13Cents).toBe(500_000);
    const r = depreciationForYear([a], 2026, { profitBefore179Cents: 120_000 });
    expect(r).toMatchObject({
      section179ElectedCents: 500_000,
      section179AllowedCents: 120_000,
      section179CarryoverCents: 380_000,
      line13Cents: 120_000,
    });
    expect(r.warnings.join(" ")).toMatch(/carries forward/);
    expect(depreciationForYear([a], 2026, { profitBefore179Cents: -5 }).line13Cents).toBe(0);
  });

  it("counts only what was placed in service by the period's end", () => {
    const r = depreciationForYear([asset({ date: "2026-08-01" })], 2026, { through: "2026-05-31" });
    expect(r.rows).toEqual([]);
  });
});

const base: ScInput = {
  year: 2026,
  sales: [
    {
      kind: "order",
      date: "2026-01-05",
      itemCents: 1_000_000,
      shippingChargedCents: 0,
      refundCents: 0,
      shippingLabelCents: 0,
      fees: [],
    },
  ],
  charges: [],
  expenses: [{ date: "2026-03-10", category: "equipment", amountCents: 300_000 }],
  items: [],
  unallocatedLots: [],
  businessMiles: 0,
  mileageRateCents: null,
};
const line = (ws: ReturnType<typeof buildScheduleC>, l: string) =>
  ws.lines.find((x) => x.line === l)?.amountCents;

describe("the worksheet with the Form 4562 helper", () => {
  it("puts line 13 in lines 28 to 31", () => {
    const ws = buildScheduleC({ ...base, equipmentAssets: [asset()] });
    expect(line(ws, "13")).toBe(300_000);
    expect(line(ws, "28")).toBe(300_000);
    expect(line(ws, "31")).toBe(700_000);
    expect(ws.depreciation?.rows).toHaveLength(1);
    expect(ws.warnings.join(" ")).not.toMatch(/not on this worksheet/);
  });

  it("limits section 179 to line 29 before it", () => {
    const ws = buildScheduleC({
      ...base,
      expenses: [{ date: "2026-03-10", category: "equipment", amountCents: 1_500_000 }],
      equipmentAssets: [asset({ amountCents: 1_500_000, method: "section_179" })],
    });
    expect(line(ws, "13")).toBe(1_000_000);
    expect(line(ws, "31")).toBe(0);
    expect(ws.depreciation?.section179CarryoverCents).toBe(500_000);
  });

  it("keeps depreciating last year's equipment", () => {
    const ws = buildScheduleC({
      ...base,
      expenses: [],
      equipmentAssets: [asset({ date: "2025-01-10", amountCents: 1_000_000, recoveryYears: 5 })],
    });
    expect(line(ws, "13")).toBe(192_000);
    expect(line(ws, "31")).toBe(1_000_000 - 192_000);
  });

  it("leaves line 13 blank, as before, when the caller gives no equipment list", () => {
    const ws = buildScheduleC(base);
    expect(line(ws, "13")).toBeNull();
    expect(line(ws, "28")).toBe(0);
    expect(ws.depreciation).toBeNull();
  });
});
