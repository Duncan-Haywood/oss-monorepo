import { describe, expect, it } from "vitest";
import type { ContinuationLine } from "../payapp-math";
import { procoreInvoiceSheet } from "./procore-invoice";

function line(
  id: string,
  itemNumber: string,
  description: string,
  c: number,
  e: number,
  f: number,
  d = 0,
): ContinuationLine {
  const g = d + e + f;
  return {
    sovLineId: id,
    itemNumber,
    description,
    scheduledValueCents: c,
    fromPreviousCents: d,
    thisPeriodCents: e,
    storedMaterialsCents: f,
    completedAndStoredCents: g,
    percentCompleteBps: c === 0 ? null : Math.round((g * 10_000) / c),
    balanceToFinishCents: c - g,
    retainageCents: 0,
    retainageReleasedThisPeriodCents: 0,
    retainageRateBps: null,
  };
}

const none = new Set<string>();

describe("procoreInvoiceSheet", () => {
  it("first application here: all stored materials are new", () => {
    const s = procoreInvoiceSheet({
      lines: [
        line("a", "1", "Rough-in", 4_000_000, 1_000_000, 250_000),
        line("b", "2", "Trim", 1_000_000, 0, 0),
      ],
      previousLines: null,
      changeOrderLineIds: none,
      openedMidJob: false,
    });
    expect(s.rows.map((r) => [r.description, r.workThisPeriodCents, r.newStoredCents])).toEqual([
      ["1 Rough-in", 1_000_000, 250_000],
      ["2 Trim", 0, 0],
    ]);
    expect(s.rows[0]?.percentComplete).toBe("31.25");
    expect(s.totals).toEqual({
      workThisPeriodCents: 1_000_000,
      storedNowCents: 250_000,
      newStoredCents: 250_000,
    });
    expect(s.storedFell).toEqual([]);
    expect(s.noPreviousStored).toBe(false);
  });

  it("a stored balance that only rose: the rise is new", () => {
    const s = procoreInvoiceSheet({
      lines: [line("a", "1", "Rough-in", 4_000_000, 500_000, 400_000, 1_000_000)],
      previousLines: [line("a", "1", "Rough-in", 4_000_000, 1_000_000, 250_000)],
      changeOrderLineIds: none,
      openedMidJob: false,
    });
    expect(s.rows[0]?.storedBeforeCents).toBe(250_000);
    expect(s.rows[0]?.newStoredCents).toBe(150_000);
    expect(s.totals.newStoredCents).toBe(150_000);
  });

  it("a stored balance that fell is flagged, not guessed", () => {
    const s = procoreInvoiceSheet({
      lines: [
        line("a", "1", "Rough-in", 4_000_000, 600_000, 100_000, 1_000_000),
        line("b", "2", "Trim", 1_000_000, 0, 50_000),
      ],
      previousLines: [line("a", "1", "Rough-in", 4_000_000, 1_000_000, 250_000)],
      changeOrderLineIds: none,
      openedMidJob: false,
    });
    expect(s.rows[0]?.newStoredCents).toBeNull();
    // A line missing from the previous application had nothing stored then.
    expect(s.rows[1]?.newStoredCents).toBe(50_000);
    expect(s.storedFell.map((r) => r.sovLineId)).toEqual(["a"]);
    expect(s.totals.newStoredCents).toBeNull();
    expect(s.csv).toContain("1 Rough-in,,40000.00,6000.00,1000.00,check,");
  });

  it("opened mid-job: the first application here has nothing to compare stored with", () => {
    const s = procoreInvoiceSheet({
      lines: [line("a", "1", "Rough-in", 4_000_000, 500_000, 100_000, 2_000_000)],
      previousLines: null,
      changeOrderLineIds: none,
      openedMidJob: true,
    });
    expect(s.noPreviousStored).toBe(true);
    expect(s.rows[0]?.storedBeforeCents).toBeNull();
    expect(s.rows[0]?.newStoredCents).toBeNull();
    expect(s.storedFell).toEqual([]);
  });

  it("marks change order lines and writes a plain-number CSV with a total row", () => {
    const s = procoreInvoiceSheet({
      lines: [
        line("a", "1", "Rough-in, level 1", 4_000_000, 1_000_000, 0),
        line("c", "CO-1", "Extra circuit", 50_000, 50_000, 0),
        line("z", "", "Zero line", 0, 0, 0),
      ],
      previousLines: null,
      changeOrderLineIds: new Set(["c"]),
      openedMidJob: false,
    });
    expect(s.rows.map((r) => r.changeOrder)).toEqual([false, true, false]);
    expect(s.rows[2]?.percentComplete).toBeNull();
    expect(s.csv.split("\r\n")).toEqual([
      "Description,Change order,Scheduled Value,Work Completed This Period,Materials Presently Stored,New Materials Stored,% Complete",
      '"1 Rough-in, level 1",,40000.00,10000.00,0.00,0.00,25.00',
      "CO-1 Extra circuit,yes,500.00,500.00,0.00,0.00,100.00",
      "Zero line,,0.00,0.00,0.00,0.00,",
      "Total,,40500.00,10500.00,0.00,0.00,",
      "",
    ]);
  });
});
