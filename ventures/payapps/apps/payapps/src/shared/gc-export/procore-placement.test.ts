import { describe, expect, it } from "vitest";
import type { ContinuationLine } from "../payapp-math";
import { procoreInvoiceSheet } from "./procore-invoice";
import { invoiceByPosition, parsePlacement, placementProblems } from "./procore-placement";

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

const positions = [
  { position: "1", description: "Electrical rough-in", amountCents: 5_000_000 },
  { position: "2", description: "Electrical trim", amountCents: 1_000_000 },
  { position: "3", description: "Fire alarm", amountCents: 900_000 },
];

describe("invoiceByPosition", () => {
  const sheet = (previous: ContinuationLine[] | null) =>
    procoreInvoiceSheet({
      lines: [
        line("a", "1", "Rough-in level 1", 3_000_000, 600_000, 200_000, 1_000_000),
        line("b", "2", "Rough-in level 2", 2_000_000, 400_000, 0),
        line("c", "3", "Trim", 1_000_000, 0, 50_000),
        line("d", "4", "Temporary power", 300_000, 300_000, 0),
        line("co", "CO-1", "Extra circuit", 80_000, 80_000, 0),
      ],
      previousLines: previous,
      changeOrderLineIds: new Set(["co"]),
      openedMidJob: false,
    });
  const placed = { a: "1", b: "1", c: "2" };

  it("totals each position, keeps empty positions, lists change orders and unplaced lines apart", () => {
    const g = invoiceByPosition(sheet(null), { positions, placed });
    expect(g.positions.map((p) => [p.position, p.workThisPeriodCents, p.lines.length])).toEqual([
      ["1", 1_000_000, 2],
      ["2", 0, 1],
      ["3", 0, 0],
    ]);
    const one = g.positions[0];
    expect(one?.scheduledValueCents).toBe(5_000_000);
    expect(one?.storedNowCents).toBe(200_000);
    expect(one?.newStoredCents).toBe(200_000); // first application here: all stored is new
    // G = (1,000,000 + 600,000 + 200,000) + 400,000 = 2,200,000 of 5,000,000
    expect(one?.percentComplete).toBe("44.00");
    expect(g.positions[2]?.percentComplete).toBeNull();
    expect(g.changeOrders.map((r) => r.sovLineId)).toEqual(["co"]);
    expect(g.unplaced.map((r) => r.sovLineId)).toEqual(["d"]);
    // Position 3's GC amount is 9,000.00 with nothing placed under it; 1 and 2 match.
    expect(g.amountMismatches.map((p) => p.position)).toEqual(["3"]);
  });

  it("an unknown new-stored amount on any line makes the position's unknown", () => {
    const prev = [line("a", "1", "Rough-in level 1", 3_000_000, 1_000_000, 500_000)];
    const g = invoiceByPosition(sheet(prev), { positions, placed });
    expect(g.positions[0]?.newStoredCents).toBeNull(); // a's stored fell from 5,000 to 2,000
    expect(g.positions[1]?.newStoredCents).toBe(50_000);
  });

  it("a line placed under a position the GC no longer has counts as unplaced", () => {
    const g = invoiceByPosition(sheet(null), {
      positions,
      placed: { ...placed, d: "9" },
    });
    expect(g.unplaced.map((r) => r.sovLineId)).toEqual(["d"]);
  });

  it("writes a CSV per position, then change orders and unplaced lines, with the sheet's total", () => {
    const g = invoiceByPosition(sheet(null), { positions, placed });
    const rows = g.csv.trimEnd().split("\r\n");
    expect(rows[0]).toBe(
      "SOV Position,Description,Scheduled Value,Work Completed This Period,Materials Presently Stored,New Materials Stored,% Complete",
    );
    expect(rows[1]).toBe("1,Electrical rough-in,50000.00,10000.00,2000.00,2000.00,44.00");
    expect(rows[3]).toBe("3,Fire alarm,0.00,0.00,0.00,0.00,");
    expect(rows[4]).toBe("Change order,CO-1 Extra circuit,800.00,800.00,0.00,0.00,100.00");
    expect(rows[5]).toBe("Not placed,4 Temporary power,3000.00,3000.00,0.00,0.00,100.00");
    expect(rows[6]).toBe("Total,,63800.00,13800.00,2500.00,2500.00,");
  });
});

describe("placementProblems", () => {
  const base = new Set(["a", "b"]);
  it("accepts base lines under known positions", () => {
    expect(placementProblems({ positions, placed: { a: "1", b: "3" } }, base)).toEqual([]);
  });
  it("refuses duplicate positions, change-order or foreign lines, and unknown positions", () => {
    const p = placementProblems(
      {
        positions: [...positions, { position: "1", description: "", amountCents: null }],
        placed: { a: "7", co: "1" },
      },
      base,
    );
    expect(p).toHaveLength(3);
    expect(p[0]).toMatch(/Position 1 is listed twice/);
    expect(p.join(" ")).toMatch(/Position 7 is not one of/);
    expect(p.join(" ")).toMatch(/Line co is not a base-contract line/);
  });
});

describe("parsePlacement", () => {
  it("reads what was saved and treats anything malformed as never saved", () => {
    const saved = { positions, placed: { a: "1" }, savedOn: "2026-11-26" };
    expect(parsePlacement(JSON.stringify(saved))).toEqual(saved);
    expect(parsePlacement(null)).toBeNull();
    expect(parsePlacement("{")).toBeNull();
    expect(parsePlacement(JSON.stringify({ positions: "x", placed: {} }))).toBeNull();
    expect(parsePlacement(JSON.stringify({ positions: [{}], placed: {} }))).toBeNull();
  });
});
