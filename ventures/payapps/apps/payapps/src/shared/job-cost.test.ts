import { describe, expect, it } from "vitest";
import {
  type CostEntryInput,
  computeJobCost,
  type JobCostLineInput,
  mulDivRound,
  parseCostDate,
  parseCostPaste,
} from "./job-cost";

const line = (over: Partial<JobCostLineInput> & { sovLineId: string }): JobCostLineInput => ({
  itemNumber: over.sovLineId,
  description: `Line ${over.sovLineId}`,
  scheduledValueCents: 0,
  billedToDateCents: 0,
  budgetCents: null,
  ...over,
});

const cost = (
  amountCents: number,
  sovLineId: string | null,
  incurredOn = "2026-10-15",
  category: CostEntryInput["category"] = "other",
): CostEntryInput => ({ amountCents, sovLineId, incurredOn, category });

// Worked by hand (dollars): A C 60,000, G 30,000, budget 45,000, cost 20,000 (labor 12,000 +
// material 8,000); B C 40,000, G 10,000, budget 30,000, cost 15,000 (subcontract), plus 5,000
// dated after the report date; 1,000 of other cost on no line.
// Estimate = 45,000 + 30,000 + 1,000 = 76,000; cost to date 36,000; 36/76 = 47.37%;
// earned = 100,000 x 36/76 = 47,368.42; billed 40,000 -> under billed 7,368.42;
// projected gross profit 24,000 (24.00%); gross profit to date 11,368.42.
const worked = () =>
  computeJobCost({
    asOf: "2026-10-31",
    lines: [
      line({
        sovLineId: "A",
        scheduledValueCents: 6_000_000,
        billedToDateCents: 3_000_000,
        budgetCents: 4_500_000,
      }),
      line({
        sovLineId: "B",
        scheduledValueCents: 4_000_000,
        billedToDateCents: 1_000_000,
        budgetCents: 3_000_000,
      }),
    ],
    entries: [
      cost(1_200_000, "A", "2026-10-01", "labor"),
      cost(800_000, "A", "2026-10-20", "material"),
      cost(1_500_000, "B", "2026-10-31", "subcontract"),
      cost(500_000, "B", "2026-11-01", "subcontract"),
      cost(100_000, null, "2026-09-30", "other"),
    ],
  });

describe("computeJobCost", () => {
  it("matches the hand-worked WIP example", () => {
    const r = worked();
    expect(r.totals).toEqual({
      contractCents: 10_000_000,
      budgetCents: 7_500_000,
      costToDateCents: 3_600_000,
      costAfterCents: 500_000,
      unassignedCostToDateCents: 100_000,
      billedToDateCents: 4_000_000,
      estimateAtCompletionCents: 7_600_000,
      costToCompleteCents: 4_000_000,
      percentCompleteBps: 4737,
      earnedRevenueCents: 4_736_842,
      overUnderBilledCents: -736_842,
      grossProfitToDateCents: 1_136_842,
      projectedGrossProfitCents: 2_400_000,
      projectedMarginBps: 2400,
      estimateVsBudgetCents: 0,
      costToCompleteLines: 0,
      committedCents: 0,
      openCommittedCents: 0,
    });
    expect(r.byCategory).toEqual({
      labor: 1_200_000,
      material: 800_000,
      equipment: 0,
      subcontract: 1_500_000,
      other: 100_000,
    });
    const [a, b] = r.lines;
    expect(a).toMatchObject({
      costToDateCents: 2_000_000,
      budgetRemainingCents: 2_500_000,
      costPctOfBudgetBps: 4444,
      billedPctBps: 5000,
      overBudget: false,
    });
    expect(b).toMatchObject({ costToDateCents: 1_500_000, costAfterCents: 500_000 });
    expect(r.issues.map((i) => i.code)).toEqual(["unassigned_costs", "costs_after_as_of"]);
  });

  it("counts every cost when there is no report date", () => {
    const r = computeJobCost({
      ...worked(),
      asOf: null,
      lines: worked().lines,
      entries: [cost(5, "A", "2030-01-01")],
      commitments: [],
    });
    expect(r.totals.costToDateCents).toBe(5);
    expect(r.totals.costAfterCents).toBe(0);
  });

  it("waits for every budget before working out the estimate", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [
        line({ sovLineId: "A", scheduledValueCents: 100_00, budgetCents: 80_00 }),
        line({ sovLineId: "B", scheduledValueCents: 50_00 }),
        // A change-order line at $0 with no budget does not hold up the estimate.
        line({ sovLineId: "CO", scheduledValueCents: 0 }),
      ],
      entries: [cost(10_00, "A"), cost(3_00, "CO")],
    });
    expect(r.missingBudgetLineIds).toEqual(["B"]);
    expect(r.totals.estimateAtCompletionCents).toBeNull();
    expect(r.totals.percentCompleteBps).toBeNull();
    expect(r.totals.earnedRevenueCents).toBeNull();
    expect(r.totals.overUnderBilledCents).toBeNull();
    expect(r.totals.projectedGrossProfitCents).toBeNull();
    expect(r.issues[0]?.code).toBe("missing_budgets");
    expect(r.lines[2]?.estimateAtCompletionCents).toBe(3_00);
  });

  it("raises the estimate to the cost when a line runs over budget, and flags a projected loss", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [
        line({
          sovLineId: "A",
          scheduledValueCents: 100_00,
          billedToDateCents: 90_00,
          budgetCents: 80_00,
        }),
      ],
      entries: [cost(110_00, "A")],
    });
    expect(r.lines[0]).toMatchObject({
      overBudget: true,
      budgetRemainingCents: -30_00,
      estimateAtCompletionCents: 110_00,
    });
    expect(r.totals.percentCompleteBps).toBe(10_000);
    expect(r.totals.earnedRevenueCents).toBe(100_00);
    expect(r.totals.overUnderBilledCents).toBe(-10_00);
    expect(r.totals.projectedGrossProfitCents).toBe(-10_00);
    expect(r.totals.projectedMarginBps).toBe(-1000);
    expect(r.issues.map((i) => i.code)).toEqual(["over_budget_line", "projected_loss"]);
  });

  it("treats a cost on a deleted line as a cost on no line, and reports a job with no costs", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [line({ sovLineId: "A", scheduledValueCents: 100, budgetCents: 50 })],
      entries: [cost(7, "gone")],
    });
    expect(r.totals.unassignedCostToDateCents).toBe(7);
    const empty = computeJobCost({ asOf: null, lines: [], entries: [] });
    expect(empty.issues.map((i) => i.code)).toEqual(["no_costs"]);
    expect(empty.totals.percentCompleteBps).toBeNull();
    expect(empty.totals.projectedMarginBps).toBeNull();
  });

  it("keeps percent complete between 0 and 100 when credits exceed costs", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [line({ sovLineId: "A", scheduledValueCents: 100_00, budgetCents: 50_00 })],
      entries: [cost(-5_00, "A")],
    });
    expect(r.totals.percentCompleteBps).toBe(0);
    expect(r.totals.earnedRevenueCents).toBe(0);
  });
});

describe("cost to complete (revised estimate per line)", () => {
  // Worked by hand (dollars): one line, C 100,000, billed 50,000, budget 60,000. Costs 30,000 on
  // 2026-10-10 and 6,000 on 2026-10-20. The PM typed a cost to complete of 40,000 on 2026-10-15.
  // Estimate = 30,000 (through 10-15) + 40,000 = 70,000 (10,000 over budget); cost to date at
  // 10-31 is 36,000, so 51.43% complete; earned = 100,000 x 36/70 = 51,428.57; over billed by
  // -1,428.57 (under); remaining 34,000; projected gross profit 30,000.
  const ctcJob = (over: Partial<JobCostLineInput> = {}, asOf: string | null = "2026-10-31") =>
    computeJobCost({
      asOf,
      lines: [
        line({
          sovLineId: "A",
          scheduledValueCents: 100_000_00,
          billedToDateCents: 50_000_00,
          budgetCents: 60_000_00,
          costToCompleteCents: 40_000_00,
          costToCompleteOn: "2026-10-15",
          ...over,
        }),
      ],
      entries: [cost(30_000_00, "A", "2026-10-10"), cost(6_000_00, "A", "2026-10-20")],
    });

  it("estimates the line at the cost through the estimate's date plus the cost to complete", () => {
    const r = ctcJob();
    expect(r.lines[0]).toMatchObject({
      estimateBasis: "cost_to_complete",
      costToCompleteCents: 40_000_00,
      costToCompleteOn: "2026-10-15",
      estimateAtCompletionCents: 70_000_00,
      remainingCostCents: 34_000_00,
      estimateVsBudgetCents: 10_000_00,
      overBudget: false,
    });
    expect(r.totals).toMatchObject({
      estimateAtCompletionCents: 70_000_00,
      costToDateCents: 36_000_00,
      percentCompleteBps: 5143,
      earnedRevenueCents: 51_428_57,
      overUnderBilledCents: -1_428_57,
      projectedGrossProfitCents: 30_000_00,
      estimateVsBudgetCents: 10_000_00,
      costToCompleteLines: 1,
    });
    expect(r.issues.map((i) => i.code)).toEqual(["estimate_over_budget_line"]);
  });

  it("uses the budget when no cost to complete is typed", () => {
    const r = ctcJob({ costToCompleteCents: null, costToCompleteOn: null });
    expect(r.lines[0]).toMatchObject({
      estimateBasis: "budget",
      estimateAtCompletionCents: 60_000_00,
      remainingCostCents: 24_000_00,
      estimateVsBudgetCents: 0,
      costToCompleteCents: null,
    });
    expect(r.totals.costToCompleteLines).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it("keeps the same estimate whatever the report date (costs after it use it up)", () => {
    // Report as of 10-12: only the first 30,000 is to date, but the estimate is still 70,000.
    const r = ctcJob({}, "2026-10-12");
    expect(r.totals.estimateAtCompletionCents).toBe(70_000_00);
    expect(r.totals.costToDateCents).toBe(30_000_00);
    expect(r.lines[0]?.remainingCostCents).toBe(40_000_00);
  });

  it("never lets the estimate fall below the cost to date, and says the estimate is used up", () => {
    const r = ctcJob({ costToCompleteCents: 2_000_00 });
    // 30,000 + 2,000 = 32,000, but 36,000 is already spent.
    expect(r.lines[0]?.estimateAtCompletionCents).toBe(36_000_00);
    expect(r.lines[0]?.remainingCostCents).toBe(0);
    expect(r.totals.percentCompleteBps).toBe(10_000);
    expect(r.issues.map((i) => i.code)).toEqual(["cost_to_complete_used_up"]);
  });

  it("lets a re-estimate come in under budget without a flag", () => {
    const r = ctcJob({ costToCompleteCents: 20_000_00 });
    expect(r.lines[0]?.estimateAtCompletionCents).toBe(50_000_00);
    expect(r.lines[0]?.estimateVsBudgetCents).toBe(-10_000_00);
    expect(r.totals.estimateVsBudgetCents).toBe(-10_000_00);
    expect(r.issues).toEqual([]);
  });

  it("counts a line with a cost to complete as estimated even without a budget", () => {
    const r = ctcJob({ budgetCents: null });
    expect(r.missingBudgetLineIds).toEqual([]);
    expect(r.lines[0]?.estimateAtCompletionCents).toBe(70_000_00);
    expect(r.lines[0]?.estimateVsBudgetCents).toBeNull();
    expect(r.totals.estimateVsBudgetCents).toBe(0);
  });

  it("ignores a cost to complete with no date", () => {
    const r = ctcJob({ costToCompleteOn: null });
    expect(r.lines[0]?.estimateBasis).toBe("budget");
    expect(r.lines[0]?.costToCompleteCents).toBeNull();
  });
});

describe("mulDivRound", () => {
  it("rounds half away from zero and stays exact past 2^53", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(99_999_999_999, 99_999_999_999, 99_999_999_999)).toBe(99_999_999_999);
  });
});

describe("parseCostPaste", () => {
  it("reads tab or comma rows, skips a header and reports rows it cannot read", () => {
    const r = parseCostPaste(
      [
        "Date\tAmount\tCategory\tItem\tDescription",
        "2026-10-01\t$1,200.00\tPayroll\t1\tWeek 40 crew",
        '10/5/2026,"(250.50)",materials,,"Return, wire"',
        "2026-02-30\t10\tlabor",
        "2026-10-07\tabc\tlabor",
        "2026-10-08\t10\tfood",
        "",
      ].join("\n"),
    );
    expect(r.rows).toEqual([
      {
        incurredOn: "2026-10-01",
        amountCents: 120_000,
        category: "labor",
        itemNumber: "1",
        description: "Week 40 crew",
      },
      {
        incurredOn: "2026-10-05",
        amountCents: -25_050,
        category: "material",
        itemNumber: null,
        description: "Return, wire",
      },
    ]);
    expect(r.errors.map((e) => e.row)).toEqual([4, 5, 6]);
  });

  it("validates calendar dates", () => {
    expect(parseCostDate("2028-02-29")).toBe("2028-02-29");
    expect(parseCostDate("2027-02-29")).toBeNull();
    expect(parseCostDate("13/1/2026")).toBeNull();
  });
});

describe("committed costs", () => {
  // Worked by hand (dollars): line A C 60,000, budget 45,000, cost to date 20,000 of which 8,000 is
  // invoiced against PO-1 (committed 30,000, so 22,000 open). Cost + open = 42,000 < 45,000: the
  // budget stays the estimate. Line B C 40,000, budget 30,000, cost 15,000 all against SUB-1
  // (committed 25,000, 10,000 open) plus SUB-2 (12,000, nothing invoiced): 15,000 + 22,000 = 37,000
  // > 30,000, so B's estimate is 37,000 (committed). A PO on no line, 3,000 with 1,000 invoiced,
  // adds 2,000 open. A PO dated after the report date is left out.
  // Estimate = 45,000 + 37,000 + 1,000 (cost on no line) + 2,000 = 85,000; cost to date 36,000.
  const committed = () =>
    computeJobCost({
      asOf: "2026-10-31",
      lines: [
        line({ sovLineId: "A", scheduledValueCents: 6_000_000, budgetCents: 4_500_000 }),
        line({ sovLineId: "B", scheduledValueCents: 4_000_000, budgetCents: 3_000_000 }),
      ],
      entries: [
        cost(1_200_000, "A", "2026-10-01", "labor"),
        { ...cost(800_000, "A", "2026-10-20", "material"), commitmentId: "PO-1" },
        { ...cost(1_500_000, "B", "2026-10-31", "subcontract"), commitmentId: "SUB-1" },
        // After the report date: not invoiced as of it.
        { ...cost(500_000, "B", "2026-11-01", "subcontract"), commitmentId: "SUB-1" },
        { ...cost(100_000, null, "2026-09-30"), commitmentId: "PO-X" },
      ],
      commitments: [
        { id: "PO-1", sovLineId: "A", committedOn: "2026-09-01", amountCents: 3_000_000 },
        { id: "SUB-1", sovLineId: "B", committedOn: "2026-09-01", amountCents: 2_500_000 },
        { id: "SUB-2", sovLineId: "B", committedOn: "2026-10-05", amountCents: 1_200_000 },
        { id: "PO-X", sovLineId: null, committedOn: "2026-09-15", amountCents: 300_000 },
        { id: "PO-LATE", sovLineId: "A", committedOn: "2026-11-02", amountCents: 9_000_000 },
      ],
    });

  it("floors each line's estimate at cost to date plus open commitments", () => {
    const r = committed();
    const [a, b] = r.lines;
    expect(a?.openCommittedCents).toBe(2_200_000);
    expect(a?.committedCents).toBe(3_000_000);
    expect(a?.estimateBasis).toBe("budget");
    expect(a?.estimateAtCompletionCents).toBe(4_500_000);
    expect(b?.committedCents).toBe(3_700_000);
    expect(b?.openCommittedCents).toBe(2_200_000);
    expect(b?.estimateBasis).toBe("committed");
    expect(b?.estimateAtCompletionCents).toBe(3_700_000);
    expect(b?.estimateVsBudgetCents).toBe(700_000);
    expect(r.totals.estimateAtCompletionCents).toBe(8_500_000);
    expect(r.totals.costToDateCents).toBe(3_600_000);
    expect(r.totals.committedCents).toBe(7_000_000);
    expect(r.totals.openCommittedCents).toBe(4_600_000);
    expect(r.totals.projectedGrossProfitCents).toBe(1_500_000);
    expect(r.issues.map((i) => i.code)).toContain("committed_over_estimate_line");
  });

  it("reports each commitment's invoiced and open amounts", () => {
    const st = Object.fromEntries(committed().commitments.map((c) => [c.id, c]));
    expect(st["SUB-1"]).toMatchObject({ invoicedCents: 1_500_000, openCents: 1_000_000 });
    expect(st["PO-X"]).toMatchObject({ invoicedCents: 100_000, openCents: 200_000 });
    expect(st["PO-LATE"]).toMatchObject({ openCents: 0, afterAsOf: true });
  });

  it("never lets an over-invoiced commitment lower the estimate, and flags it", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [line({ sovLineId: "A", scheduledValueCents: 1_000_000, budgetCents: 500_000 })],
      entries: [{ ...cost(600_000, "A"), commitmentId: "PO-1" }],
      commitments: [
        { id: "PO-1", sovLineId: "A", committedOn: "2026-10-01", amountCents: 400_000 },
      ],
    });
    expect(r.commitments[0]).toMatchObject({ openCents: 0, overInvoicedCents: 200_000 });
    expect(r.lines[0]?.estimateAtCompletionCents).toBe(600_000);
    expect(r.issues.map((i) => i.code)).toContain("commitment_over_invoiced");
  });

  it("raises a revised estimate when commitments pass it", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [
        line({
          sovLineId: "A",
          scheduledValueCents: 1_000_000,
          budgetCents: 800_000,
          costToCompleteCents: 100_000,
          costToCompleteOn: "2026-10-01",
        }),
      ],
      entries: [cost(200_000, "A", "2026-09-20")],
      commitments: [{ id: "S", sovLineId: "A", committedOn: "2026-10-02", amountCents: 250_000 }],
    });
    expect(r.lines[0]?.estimateAtCompletionCents).toBe(450_000);
    expect(r.lines[0]?.estimateBasis).toBe("committed");
    expect(r.issues.find((i) => i.code === "committed_over_estimate_line")?.message).toContain(
      "revised estimate",
    );
  });

  // The customer post's example (dollars): a $40,000 line with a $30,000 budget and a $35,000
  // lower-tier subcontract, $10,000 invoiced against it. On the budget: 10/30 = 33.33% complete,
  // earned 13,333.33, projected profit 10,000. With the $25,000 still open: estimate 35,000,
  // 10/35 = 28.57%, earned 11,428.57, projected profit 5,000.
  it("matches the post's committed-cost example", () => {
    const input = {
      asOf: null,
      lines: [line({ sovLineId: "A", scheduledValueCents: 4_000_000, budgetCents: 3_000_000 })],
      entries: [{ ...cost(1_000_000, "A"), commitmentId: "SC" }],
    };
    const before = computeJobCost(input).totals;
    expect(before).toMatchObject({
      percentCompleteBps: 3333,
      earnedRevenueCents: 1_333_333,
      projectedGrossProfitCents: 1_000_000,
    });
    const after = computeJobCost({
      ...input,
      commitments: [
        { id: "SC", sovLineId: "A", committedOn: "2026-10-01", amountCents: 3_500_000 },
      ],
    }).totals;
    expect(after).toMatchObject({
      estimateAtCompletionCents: 3_500_000,
      percentCompleteBps: 2857,
      earnedRevenueCents: 1_142_857,
      projectedGrossProfitCents: 500_000,
      openCommittedCents: 2_500_000,
    });
  });

  it("waits for budgets: a commitment does not stand in for a missing budget", () => {
    const r = computeJobCost({
      asOf: null,
      lines: [line({ sovLineId: "A", scheduledValueCents: 1_000_000 })],
      entries: [],
      commitments: [{ id: "S", sovLineId: "A", committedOn: "2026-10-02", amountCents: 250_000 }],
    });
    expect(r.lines[0]?.estimateAtCompletionCents).toBeNull();
    expect(r.lines[0]?.openCommittedCents).toBe(250_000);
    expect(r.totals.estimateAtCompletionCents).toBeNull();
  });
});
