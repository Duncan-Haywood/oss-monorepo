import { describe, expect, it } from "vitest";
import {
  type BudgetLine,
  budgetWarnings,
  computeLine,
  computeTotals,
  lineTotalCents,
  NEEDS_INPUT_NOTE,
} from "./budget";

let n = 0;
const line = (over: Partial<BudgetLine> = {}): BudgetLine =>
  computeLine({
    id: `bln_test${String(++n).padStart(6, "0")}`,
    category: "personnel",
    description: "Program coordinator",
    quantity: 1,
    unitCostCents: 0,
    source: "user",
    factIds: [],
    fundingSource: "request",
    note: "",
    ...over,
  });

describe("budget totals math", () => {
  it("computes line totals in code (quantity to 2 decimals, rounded cents)", () => {
    expect(lineTotalCents(2, 1_500_000)).toBe(3_000_000);
    expect(lineTotalCents(0.5, 6_000_001)).toBe(3_000_001); // 0.5 × $60,000.01, rounded
    expect(lineTotalCents(1.25, 10_001)).toBe(12_501);
    expect(lineTotalCents(0.333, 300_000)).toBe(99_000); // quantity rounds to 0.33
    // A client-sent total is ignored: computeLine recomputes it.
    expect(
      computeLine({ ...line(), quantity: 3, unitCostCents: 100, totalCents: 999 }).totalCents,
    ).toBe(300);
  });

  it("sums SF-424A categories by funding column with direct, indirect and grand totals", () => {
    const lines = [
      line({ category: "personnel", quantity: 1, unitCostCents: 3_000_000 }),
      line({ category: "fringe", quantity: 1, unitCostCents: 900_000 }),
      line({
        category: "equipment",
        quantity: 2,
        unitCostCents: 1_250_000,
        fundingSource: "match",
      }),
      line({ category: "supplies", quantity: 10, unitCostCents: 5_000, fundingSource: "other" }),
      line({ category: "indirect", quantity: 1, unitCostCents: 390_000 }),
    ];
    const t = computeTotals(lines);
    const row = (c: string) => t.categories.rows.find((r) => r.category === c);
    expect(t.categories.rows.map((r) => r.category)).toEqual([
      "personnel",
      "fringe",
      "travel",
      "equipment",
      "supplies",
      "contractual",
      "construction",
      "other",
      "indirect",
    ]);
    expect(row("equipment")).toMatchObject({
      requestCents: 0,
      matchCents: 2_500_000,
      totalCents: 2_500_000,
    });
    expect(row("supplies")).toMatchObject({ otherCents: 50_000, totalCents: 50_000 });
    expect(t.categories.totalDirect).toEqual({
      requestCents: 3_900_000,
      matchCents: 2_500_000,
      otherCents: 50_000,
      totalCents: 6_450_000,
    });
    expect(t.categories.indirect.totalCents).toBe(390_000);
    expect(t.categories.total).toEqual({
      requestCents: 4_290_000,
      matchCents: 2_500_000,
      otherCents: 50_000,
      totalCents: 6_840_000,
    });
    expect(t.match).toMatchObject({
      requestCents: 4_290_000,
      matchCents: 2_500_000,
      totalProjectCents: 6_840_000,
      matchPercentOfTotal: 36.5,
    });
    expect(t.lineCount).toBe(5);
    expect(t.needsInputCount).toBe(0);
  });

  it("marks $0 lines as needing input and clears the note once an amount is entered", () => {
    const placeholder = line({ unitCostCents: 0 });
    expect(placeholder.note).toBe(NEEDS_INPUT_NOTE);
    expect(computeTotals([placeholder]).needsInputCount).toBe(1);
    const filled = computeLine({ ...placeholder, unitCostCents: 120_000 });
    expect(filled.note).toBe("");
    expect(filled.totalCents).toBe(120_000);
  });
});

describe("budget warnings", () => {
  const codes = (lines: BudgetLine[], rules: Parameters<typeof budgetWarnings>[1]) =>
    budgetWarnings(computeTotals(lines, rules), rules).map((w) => w.code);

  it("flags a request over the award ceiling (match does not count)", () => {
    const lines = [
      line({ unitCostCents: 2_600_000 }),
      line({ unitCostCents: 5_000_000, fundingSource: "match" }),
    ];
    expect(codes(lines, { awardCeilingCents: 2_500_000 })).toEqual(["over_ceiling"]);
    expect(codes(lines, { awardCeilingCents: 2_600_000 })).toEqual([]);
    const w = budgetWarnings(computeTotals(lines), { awardCeilingCents: 2_500_000 })[0];
    expect(w?.severity).toBe("blocker");
    expect(w?.message).toContain("$25,000");
    expect(w?.message).toContain("$1,000");
  });

  it("flags missing or short cost share only when the funder requires it", () => {
    const req = [line({ unitCostCents: 1_000_000 })];
    expect(codes(req, { costSharingRequired: false })).toEqual([]);
    expect(codes(req, { costSharingRequired: true })).toEqual([
      "cost_share_missing",
      "cost_share_amount_unknown",
    ]);
    const withMatch = [...req, line({ unitCostCents: 200_000, fundingSource: "match" })];
    expect(codes(withMatch, { costSharingRequired: true, requiredMatchCents: 250_000 })).toEqual([
      "cost_share_short",
    ]);
    const t = computeTotals(withMatch, { costSharingRequired: true, requiredMatchCents: 250_000 });
    expect(t.match.shortfallCents).toBe(50_000);
    expect(codes(withMatch, { costSharingRequired: true, requiredMatchCents: 200_000 })).toEqual(
      [],
    );
  });

  it("flags placeholders and a budget request that differs from the application's ask", () => {
    const lines = [line({ unitCostCents: 1_000_000 }), line({ unitCostCents: 0 })];
    expect(codes(lines, { requestedAmountCents: 1_200_000 })).toEqual([
      "needs_input",
      "request_mismatch",
    ]);
    expect(codes(lines.slice(0, 1), { requestedAmountCents: 1_000_000 })).toEqual([]);
  });
});
