import { describe, expect, it } from "vitest";
import { findSov, type OpeningTargetLine, openingFromImport, parseCsv } from ".";
import { lookAlikes, misreadsAgainstTotal, misreadsInRow } from "./misread";
import { totalMisreadCheck } from "./pdf";
import type { SovImportOk } from "./schedule";

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("lookAlikes", () => {
  it("swaps one digit at a time for a look-alike, keeping the number of digits", () => {
    const xs = lookAlikes(1_345_000).map((s) => s.cents);
    expect(xs).toContain(1_845_000); // the 3 an 8
    expect(xs).toContain(1_346_000); // the 5 a 6
    expect(xs).toContain(7_345_000); // the 1 a 7
    expect(xs).not.toContain(345_000); // never a leading 0
    expect(xs).not.toContain(1_345_000);
    expect(xs.every((x) => String(x).length === 7)).toBe(true);
  });
  it("tries nothing for a negative or unsafe amount", () => {
    expect(lookAlikes(-500)).toEqual([]);
    expect(lookAlikes(Number.MAX_SAFE_INTEGER + 2)).toEqual([]);
  });
});

const lines = [
  { label: "1 Framing", source: "page 1, line 5", cents: 1_200_000 },
  { label: "2 Drywall", source: "page 1, line 6", cents: 850_000 },
  { label: "3 Paint", source: "page 1, line 7", cents: 425_050 },
  { label: "4 Doors", source: "page 1, line 8", cents: 610_000 },
];
const sum = 1_200_000 + 850_000 + 425_050 + 610_000;

describe("misreadsAgainstTotal", () => {
  it("is empty when the lines add up", () => {
    expect(misreadsAgainstTotal(lines, { source: "t", cents: sum }, 4)).toEqual([]);
  });

  it("names the one line a look-alike digit would put right", () => {
    // Paint is $4,750.50 on the paper, read as $4,250.50: its 7 read as a 2.
    const paper = sum - 425_050 + 475_050;
    const found = misreadsAgainstTotal(lines, { source: "page 1, line 9", cents: paper }, 4);
    expect(found).toEqual([
      {
        label: "3 Paint",
        source: "page 1, line 7",
        readCents: 425_050,
        swap: { cents: 475_050, read: "2", paper: "7" },
      },
    ]);
  });

  it("can name the totals row itself", () => {
    // The lines read right; the total's 8 read as a 3.
    const read = 3_035_050;
    expect(sum).toBe(3_085_050);
    const found = misreadsAgainstTotal(lines, { source: "page 1, line 9", cents: read }, 4);
    expect(found.map((f) => f.label)).toEqual(["the totals row"]);
    expect(found[0]?.swap).toEqual({ cents: 3_085_050, read: "3", paper: "8" });
  });

  it("names nothing a single look-alike cannot explain (a line left out of the SUM)", () => {
    const found = misreadsAgainstTotal(lines, { source: "t", cents: sum + 1_234_567 }, 4);
    expect(found).toEqual([]);
  });
});

describe("misreadsInRow", () => {
  it("names the cell of a continuation-sheet row that one look-alike would make add up", () => {
    // D $3,000.00 + E $1,500.00 = G $4,500.00 on the paper; E read as $1,600.00, its 5 as a 6. G read wrong
    // ($4,600.00 on the paper, its 6 as a 5) fits the row too: both are named.
    const found = misreadsInRow({
      previousCents: 300_000,
      thisPeriodCents: 160_000,
      storedCents: null,
      toDateCents: 450_000,
    });
    expect(found.map((f) => [f.cell, f.swap.cents])).toContainEqual(["E", 150_000]);
    expect(found.every((f) => f.cell !== "F")).toBe(true); // F not on the sheet: not tried
  });
  it("is empty for a row that adds up, or one with a cell unread", () => {
    const base = { previousCents: 300_000, thisPeriodCents: 150_000, storedCents: 0 };
    expect(misreadsInRow({ ...base, toDateCents: 450_000 })).toEqual([]);
    expect(misreadsInRow({ ...base, toDateCents: null })).toEqual([]);
  });
});

const sheet = (rows: string[][]) => ok(findSov(parseCsv(rows.map((r) => r.join(",")).join("\n"))));

describe("totalMisreadCheck on an import", () => {
  const rows = [
    ["Item", "Description", "Scheduled Value"],
    ["1", "Framing", "11000.00"],
    ["2", "Drywall", "8500.00"],
    ["3", "Paint", "4250.50"],
    ["4", "Doors", "6100.00"],
    ["", "Total", "34850.50"], // Paint is $9,250.50 on the paper, its 9 read as a 4
  ];

  it("adds one check that names the figure to look at, beside the total check", () => {
    const r = sheet(rows);
    expect(r.checks.map((c) => c.message).join(" ")).toMatch(/sheet's own total/);
    const c = totalMisreadCheck(r);
    expect(c?.severity).toBe("high");
    expect(c?.message).toContain(
      "The scan probably misread one figure: 3 Paint (line 4) reads $4,250.50; $9,250.50 if a 4 there is a 9 on the paper",
    );
  });

  it("says nothing when the lines add up, or with no totals row", () => {
    const right = rows.map((r) => (r[1] === "Total" ? ["", "Total", "29850.50"] : r));
    expect(totalMisreadCheck(sheet(right))).toBeNull();
    expect(totalMisreadCheck(sheet(rows.slice(0, -1)))).toBeNull();
  });

  it("says nothing when too many figures could explain the gap", () => {
    // $50.00 off, and every line's 3 could be an 8 on the paper: eight suspects, too many to name.
    const many: SovImportOk = sheet([
      ["Item", "Description", "Scheduled Value"],
      ...Array.from({ length: 8 }, (_, i) => [String(i + 1), `Line ${i + 1}`, "1030.00"]),
      ["", "Total", `${8 * 1030 + 50}.00`],
    ]);
    expect(totalMisreadCheck(many)).toBeNull();
  });
});

describe("opening balance from a scanned continuation sheet", () => {
  const job: OpeningTargetLine[] = [
    { id: "l1", itemNumber: "1", description: "Mobilization", currentCents: 1_250_000 },
    { id: "l2", itemNumber: "2", description: "Conduit", currentCents: 4_825_075 },
  ];
  const csv = [
    [
      "Item",
      "Description",
      "Scheduled Value",
      "From Previous Application",
      "This Period",
      "Total Completed and Stored to Date",
    ],
    ["1", "Mobilization", "12500.00", "12500.00", "0.00", "12500.00"],
    // E is $3,125.25 on the paper, its 3 read as an 8 (G's 3 as an 8 would fit too, and is named as well).
    ["2", "Conduit", "48250.75", "30000.00", "8125.25", "33125.25"],
  ];

  it("names the likely misread cell when the scan's row does not add up", () => {
    const s = { ...sheet(csv), scanned: true };
    const f = ok(openingFromImport(s, job));
    const msg = f.checks.map((c) => c.message).join(" ");
    expect(msg).toMatch(/The sheet's own columns disagree: 2 Conduit/);
    expect(msg).toContain("column E reads $8,125.25; $3,125.25 if an 8 there is a 3 on the paper");
    expect(msg).toMatch(/check which is right on the paper/);
    // Nothing is corrected: work completed is still D + E as read.
    expect(f.completed.l2).toBe(3_812_525);
  });

  it("keeps the plain message for a spreadsheet", () => {
    const f = ok(openingFromImport(sheet(csv), job));
    const msg = f.checks.map((c) => c.message).join(" ");
    expect(msg).toMatch(/The sheet's own columns disagree/);
    expect(msg).not.toMatch(/look-alike|on the paper/);
  });
});
