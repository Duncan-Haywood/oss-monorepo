// WIP schedule PDF (services/export/wip-pdf.ts): the columns a surety reads, totals over complete
// jobs only (matching the report's own totals), an incomplete job printed with a note, the review
// block and the notice on every page.
import type { WipReportDto, WipRowDto } from "@shared/api/types";
import { backlogCents, wipPdf, wipPdfFileName, wipTotals } from "@worker/services/export/wip-pdf";
import { describe, expect, it } from "vitest";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function row(name: string, over: Partial<WipRowDto["totals"]> = {}, missing = 0): WipRowDto {
  return {
    projectId: name,
    projectName: name,
    projectNumber: null,
    gcName: "Copper State Builders",
    billedThrough: { number: 3, periodTo: "2026-10-31" },
    missingBudgets: missing,
    overBudgetLines: 0,
    totals: {
      contractCents: 10_000_000,
      budgetCents: 7_600_000,
      costToDateCents: 3_600_000,
      costAfterCents: 0,
      unassignedCostToDateCents: 0,
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
      ...over,
    },
  };
}

const incomplete = row(
  "Pima Library",
  {
    estimateAtCompletionCents: null,
    costToCompleteCents: null,
    percentCompleteBps: null,
    earnedRevenueCents: null,
    overUnderBilledCents: null,
    grossProfitToDateCents: null,
    projectedGrossProfitCents: null,
    projectedMarginBps: null,
  },
  2,
);

const over = row("Tempe Lofts", {
  contractCents: 2_000_000,
  estimateAtCompletionCents: 1_500_000,
  costToDateCents: 750_000,
  costToCompleteCents: 750_000,
  percentCompleteBps: 5000,
  earnedRevenueCents: 1_000_000,
  billedToDateCents: 1_200_000,
  overUnderBilledCents: 200_000,
  projectedGrossProfitCents: 500_000,
});

function report(rows: WipRowDto[]): WipReportDto {
  return {
    asOf: "2026-11-26",
    rows,
    totals: {
      contractCents: 0,
      billedToDateCents: 0,
      costToDateCents: 0,
      earnedRevenueCents: 0,
      overBilledCents: 0,
      underBilledCents: 0,
      projectedGrossProfitCents: 0,
    },
    incompleteJobs: rows.filter((r) => r.totals.earnedRevenueCents === null).length,
    canEdit: true,
  };
}

describe("wipTotals", () => {
  it("sums complete jobs only, splits over and under billing, and works backlog", () => {
    const t = wipTotals([row("Mesa Clinic TI"), incomplete, over]);
    expect(t).toEqual({
      contractCents: 12_000_000,
      estimateAtCompletionCents: 9_100_000,
      projectedGrossProfitCents: 2_900_000,
      costToDateCents: 4_350_000,
      earnedRevenueCents: 5_736_842,
      billedToDateCents: 5_200_000,
      overBilledCents: 200_000,
      underBilledCents: 736_842,
      costToCompleteCents: 4_750_000,
      backlogCents: 6_263_158,
      percentCompleteBps: 4780, // 4,350,000 / 9,100,000
    });
    expect(backlogCents(row("x"))).toBe(5_263_158);
    expect(backlogCents(incomplete)).toBeNull();
  });

  it("has no percent complete with nothing estimated", () => {
    expect(wipTotals([incomplete]).percentCompleteBps).toBeNull();
    expect(wipTotals([]).contractCents).toBe(0);
  });
});

describe("WIP schedule PDF", () => {
  it("prints each job's figures, the totals and the review block", () => {
    const r = report([row("Mesa Clinic TI"), incomplete, over]);
    const text = decode(wipPdf({ report: r, contractor: { name: "Volt Electric" } }));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Volt Electric) Tj");
    expect(text).toContain("(Work-in-progress schedule) Tj");
    expect(text).toContain("(Mesa Clinic TI) Tj");
    expect(text).toContain("(Copper State Builders - #3 to 2026-10-31) Tj");
    expect(text).toContain("(47.37%) Tj");
    expect(text).toContain("(7,368.42) Tj"); // under billed on Mesa
    expect(text).toContain("(52,631.58) Tj"); // revenue still to earn on Mesa
    expect(text).toContain("(62,631.58) Tj"); // total revenue to earn
    expect(text).toContain(
      "(2 jobs in the totals; 1 left out until every line has a cost budget.) Tj",
    );
    expect(text).toContain("(Net under billed: 5,368.42) Tj");
    expect(text).toMatch(/\(Not worked out: 2 lines with no cost budget\./);
    expect(text).toContain("(Reviewed by \\(name\\)) Tj");
    expect(text).toContain("(Page 1 of 1) Tj");
  });

  it("says when a job's estimate uses the PM's revised cost to complete", () => {
    const r = report([row("Mesa Clinic TI", { costToCompleteLines: 2 })]);
    const text = decode(wipPdf({ report: r, contractor: { name: "Volt Electric" } }));
    expect(text).toContain("(2 lines re-estimated by the PM) Tj");
  });

  it("runs onto more pages for a long list and footers every page", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(`Job ${String(i + 1).padStart(2, "0")}`));
    const text = decode(wipPdf({ report: report(rows), contractor: { name: "Volt Electric" } }));
    expect(text).toContain("(Job 40) Tj");
    const pages = Number(/\(Page 1 of (\d+)\) Tj/.exec(text)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text.match(/\(Prepared with PayApps from the budgets/g)?.length).toBe(pages);
    expect(text).toContain("(40 jobs in the totals.) Tj");
  });

  it("says when there are no active jobs and names the file by date", () => {
    const r = report([]);
    expect(decode(wipPdf({ report: r, contractor: { name: "Volt" } }))).toContain(
      "(No active jobs.) Tj",
    );
    expect(wipPdfFileName(r)).toBe("wip-schedule-2026-11-26.pdf");
  });
});
