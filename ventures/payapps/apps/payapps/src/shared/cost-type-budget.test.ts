import { describe, expect, it } from "vitest";
import { computeCostTypes, isSplit, splitSum } from "./cost-type-budget";

const line = (over: object = {}) => ({
  sovLineId: "a",
  itemNumber: "1",
  description: "Ductwork",
  budgetCents: 1_581_891,
  split: { labor: 822_000, material: 759_891 },
  ...over,
});

describe("computeCostTypes", () => {
  it("compares each type's budget with the costs entered in it, to the as-of date", () => {
    const r = computeCostTypes({
      asOf: "2026-11-30",
      lines: [line()],
      entries: [
        { sovLineId: "a", incurredOn: "2026-11-10", amountCents: 900_000, category: "labor" },
        { sovLineId: "a", incurredOn: "2026-11-12", amountCents: 300_000, category: "material" },
        { sovLineId: "a", incurredOn: "2026-11-14", amountCents: -20_000, category: "material" },
        // After the as-of date: not counted.
        { sovLineId: "a", incurredOn: "2026-12-02", amountCents: 50_000, category: "labor" },
      ],
    });
    const [l] = r.lines;
    expect(l?.split).toBe(true);
    expect(l?.splitCents).toBe(1_581_891);
    expect(l?.unsplitCents).toBeNull();
    expect(l?.rows).toEqual([
      {
        category: "labor",
        budgetCents: 822_000,
        costToDateCents: 900_000,
        remainingCents: -78_000,
        overBudget: true,
        costPctOfBudgetBps: 10_949,
      },
      {
        category: "material",
        budgetCents: 759_891,
        costToDateCents: 280_000,
        remainingCents: 479_891,
        overBudget: false,
        costPctOfBudgetBps: 3_685,
      },
    ]);
    expect(r.issues.map((i) => i.message)).toEqual([
      "Line 1 (Ductwork): labor is $780.00 over its $8,220.00 budget.",
    ]);
    expect(r.totals.map((t) => [t.category, t.budgetCents, t.costToDateCents])).toEqual([
      ["labor", 822_000, 900_000],
      ["material", 759_891, 280_000],
    ]);
  });

  it("reads a cost in a type the split has none of as over a $0 budget", () => {
    const r = computeCostTypes({
      asOf: null,
      lines: [line()],
      entries: [
        { sovLineId: "a", incurredOn: "2026-11-10", amountCents: 45_000, category: "equipment" },
      ],
    });
    expect(r.lines[0]?.rows.find((x) => x.category === "equipment")).toMatchObject({
      budgetCents: 0,
      overBudget: true,
      costPctOfBudgetBps: null,
    });
    expect(r.issues[0]?.message).toBe(
      "Line 1 (Ductwork): $450.00 of equipment cost, and the line's budget has none.",
    );
  });

  it("shows a line budget changed alone as not split, and leaves unsplit lines out of the totals", () => {
    const r = computeCostTypes({
      asOf: null,
      lines: [
        line({ budgetCents: 1_700_000 }),
        line({ sovLineId: "b", itemNumber: "2", split: null, budgetCents: 320_000 }),
      ],
      entries: [
        { sovLineId: "b", incurredOn: "2026-11-10", amountCents: 100_000, category: "subcontract" },
        // A cost on no line, or on a line not on the job, is not on any line's split.
        { sovLineId: null, incurredOn: "2026-11-10", amountCents: 5_000, category: "labor" },
        { sovLineId: "gone", incurredOn: "2026-11-10", amountCents: 5_000, category: "labor" },
      ],
    });
    expect(r.lines[0]?.unsplitCents).toBe(118_109);
    expect(r.lines[1]?.split).toBe(false);
    expect(r.lines[1]?.rows).toMatchObject([
      { category: "subcontract", costToDateCents: 100_000, overBudget: false },
    ]);
    expect(r.splitLineCount).toBe(1);
    expect(r.totals.map((t) => t.category)).toEqual(["labor", "material"]);
    expect(r.issues).toEqual([]);
  });

  it("works the customer post's ductwork example: the line is under, its labor is over", () => {
    const r = computeCostTypes({
      asOf: null,
      lines: [line({ budgetCents: 1_581_891, split: { labor: 822_000, material: 759_891 } })],
      entries: [
        { sovLineId: "a", incurredOn: "2026-12-01", amountCents: 910_000, category: "labor" },
        { sovLineId: "a", incurredOn: "2026-12-01", amountCents: 640_000, category: "material" },
      ],
    });
    const rows = r.lines[0]?.rows ?? [];
    // Line: 15,500.00 against 15,818.91, under by 318.91.
    expect(1_581_891 - rows.reduce((s, x) => s + x.costToDateCents, 0)).toBe(31_891);
    expect(rows.map((x) => [x.remainingCents, x.overBudget, x.costPctOfBudgetBps])).toEqual([
      [-88_000, true, 11_071],
      [119_891, false, 8_422],
    ]);
  });

  it("treats an empty split as none", () => {
    expect(isSplit({})).toBe(false);
    expect(isSplit(null)).toBe(false);
    expect(isSplit({ other: 0 })).toBe(true);
    expect(splitSum({ labor: 1, other: 2 })).toBe(3);
  });
});
