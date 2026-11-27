// The balance-to-finish (H) and % (G / C) columns as cross-checks on a scanned continuation sheet: they pin a
// misread to one cell where D + E + F = G alone leaves two or three suspects.
import { describe, expect, it } from "vitest";
import { findSov, type OpeningTargetLine, openingFromImport, parseCsv } from ".";
import { misreadsInRow, rowGaps } from "./misread";
import { totalMisreadCheck } from "./pdf";
import { readPercent } from "./schedule";

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};
const sheet = (rows: string[][]) => ok(findSov(parseCsv(rows.map((r) => r.join(",")).join("\n"))));
const cells = (xs: { cell: string; swap: { cents: number } }[]) =>
  xs.map((f) => [f.cell, f.swap.cents]);

describe("readPercent", () => {
  it("reads a percentage as printed, with its precision", () => {
    expect(readPercent("45%")).toEqual({ scaled: 45, decimals: 0, sign: true });
    expect(readPercent(" 45.25 % ")).toEqual({ scaled: 4525, decimals: 2, sign: true });
    expect(readPercent("0.45")).toEqual({ scaled: 45, decimals: 2, sign: false });
    expect(readPercent("100.0%")).toEqual({ scaled: 1000, decimals: 1, sign: true });
  });
  it("is null for anything else: never an error, the column is only a cross-check", () => {
    for (const s of ["", "-", "n/a", "45 percent", "1,000%"]) expect(readPercent(s)).toBeNull();
  });
});

describe("misreadsInRow with the balance and % columns", () => {
  // D $3,000.00 + E $1,500.00 = G $4,500.00 on a $10,000.00 line, H $5,500.00 on the paper.
  const paper = {
    scheduledCents: 1_000_000,
    previousCents: 300_000,
    thisPeriodCents: 150_000,
    storedCents: null,
    toDateCents: 450_000,
    balanceCents: 550_000,
  };

  it("names only E when H agrees with G: a G that mends the sum would break the balance", () => {
    const read = { ...paper, thisPeriodCents: 160_000 }; // E's 5 read as a 6
    // Without H, G ($4,600.00 if its 5 is a 6) fits as well.
    expect(cells(misreadsInRow({ ...read, balanceCents: null }))).toEqual([
      ["E", 150_000],
      ["G", 460_000],
    ]);
    expect(cells(misreadsInRow(read))).toEqual([["E", 150_000]]);
  });

  it("names only G when both the sum and the balance are off", () => {
    const read = { ...paper, toDateCents: 480_000 }; // G's 5 read as an 8
    expect(rowGaps(read)).toEqual(["sum", "balance"]);
    // Without H, E ($1,800.00 if its 5 is an 8) would fit the sum too.
    expect(cells(misreadsInRow({ ...read, balanceCents: null }))).toEqual([
      ["E", 180_000],
      ["G", 450_000],
    ]);
    expect(cells(misreadsInRow(read))).toEqual([["G", 450_000]]);
  });

  it("finds a misread scheduled value, which the sum alone never sees", () => {
    // C $13,000.00 (so H $8,500.00) on the paper, its 3 read as an 8.
    const read = { ...paper, scheduledCents: 1_800_000, balanceCents: 850_000 };
    expect(rowGaps(read)).toEqual(["balance"]);
    // G $9,500.00 would mend the balance but not the sum: not named.
    expect(cells(misreadsInRow(read))).toEqual([["C", 1_300_000]]);
  });

  it("uses the printed % when there is no H, within the precision it is printed to", () => {
    const read = { ...paper, balanceCents: null, thisPeriodCents: 160_000 };
    expect(cells(misreadsInRow({ ...read, percent: readPercent("45.00%") }))).toEqual([
      ["E", 150_000],
    ]);
    // A bare 0.45 is read as a fraction too.
    expect(cells(misreadsInRow({ ...read, percent: readPercent("0.45") }))).toEqual([
      ["E", 150_000],
    ]);
    // Printed to whole percent it cannot tell G $4,500.00 from $4,600.00 on a $100,000.00 line (4.5%, 4.6%: both 5%).
    const big = { ...read, scheduledCents: 10_000_000 };
    expect(cells(misreadsInRow({ ...big, percent: readPercent("5%") }))).toEqual([
      ["E", 150_000],
      ["G", 460_000],
    ]);
  });

  it("ignores a % that alone disagrees, and a row whose columns agree", () => {
    expect(misreadsInRow({ ...paper, percent: readPercent("85%") })).toEqual([]);
    expect(misreadsInRow(paper)).toEqual([]);
  });
});

const HEADER = [
  "Item",
  "Description",
  "Scheduled Value",
  "From Previous Application",
  "This Period",
  "Total Completed and Stored to Date",
  "% (G / C)",
  "Balance to Finish",
];

describe("reading H and % from a continuation sheet", () => {
  it("reads them into the row's billing, a blank or text H as unread", () => {
    const s = sheet([
      HEADER,
      ["1", "Mobilization", "12500.00", "12500.00", "0.00", "12500.00", "100%", "0.00"],
      ["2", "Conduit", "48250.75", "30000.00", "3125.25", "33125.25", "68.65%", ""],
      ["3", "Trim", "1000.00", "0.00", "0.00", "0.00", "-", "see note"],
    ]);
    expect(s.lines.map((l) => [l.billing?.balanceCents, l.billing?.percent?.scaled])).toEqual([
      [0, 100],
      [null, 6865],
      [null, undefined],
    ]);
    expect(s.lines.every((l) => l.billing?.errors.length === 0)).toBe(true);
  });
});

describe("opening balance from a scanned sheet with H and %", () => {
  const job: OpeningTargetLine[] = [
    { id: "l1", itemNumber: "1", description: "Mobilization", currentCents: 1_250_000 },
    { id: "l2", itemNumber: "2", description: "Conduit", currentCents: 4_825_075 },
  ];

  it("names E alone where the sum alone would name E or G", () => {
    const s = {
      ...sheet([
        HEADER,
        ["1", "Mobilization", "12500.00", "12500.00", "0.00", "12500.00", "100%", "0.00"],
        // E is $3,125.25 on the paper, its 3 read as an 8; G and H agree with C.
        ["2", "Conduit", "48250.75", "30000.00", "8125.25", "33125.25", "68.65%", "15125.50"],
      ]),
      scanned: true,
    };
    const msg = ok(openingFromImport(s, job))
      .checks.map((c) => c.message)
      .join(" ");
    expect(msg).toContain("column E reads $8,125.25; $3,125.25 if an 8 there is a 3 on the paper");
    expect(msg).not.toContain("column G");
  });

  it("reports a row whose C - G is not its H, and names the misread C", () => {
    const s = {
      ...sheet([
        HEADER,
        ["1", "Mobilization", "12500.00", "12500.00", "0.00", "12500.00", "100%", "0.00"],
        // C is $43,250.75 on the paper, its 3 read as an 8; the sum D + E = G holds.
        ["2", "Conduit", "48250.75", "30000.00", "3125.25", "33125.25", "76.59%", "10125.50"],
      ]),
      scanned: true,
    };
    const msg = ok(openingFromImport(s, job))
      .checks.map((c) => c.message)
      .join(" ");
    expect(msg).toMatch(/The sheet's own columns disagree: 2 Conduit/);
    expect(msg).toContain("C - G = $15,125.50, H = $10,125.50");
    expect(msg).toContain(
      "column C reads $48,250.75; $43,250.75 if an 8 there is a 3 on the paper",
    );
    expect(msg).not.toContain("D + E + F");
  });

  it("raises nothing for a sheet that leaves H blank", () => {
    const s = sheet([
      HEADER,
      ["1", "Mobilization", "12500.00", "12500.00", "0.00", "12500.00", "", ""],
      ["2", "Conduit", "48250.75", "30000.00", "3125.25", "33125.25", "", ""],
    ]);
    const msg = ok(openingFromImport(s, job))
      .checks.map((c) => c.message)
      .join(" ");
    expect(msg).not.toMatch(/columns disagree/);
  });
});

describe("totalMisreadCheck pinned by each row's balance to finish", () => {
  // Both lines read $1,030.00 and the sheet's total is $2,110.00: either line's 3 could be an 8 on the paper.
  const rows = (h1: string, h2: string) => [
    HEADER,
    ["1", "Layout", "1030.00", "0.00", "500.00", "500.00", "", h1],
    ["2", "Cleanup", "1030.00", "0.00", "500.00", "500.00", "", h2],
    ["", "Total", "2110.00", "", "", "", "", ""],
  ];

  it("names both lines when the rows cannot tell them apart", () => {
    const c = totalMisreadCheck(sheet(rows("", "")));
    expect(c?.message).toMatch(/any of these 2 figures/);
  });

  it("names the one line whose own row says its scheduled value is off", () => {
    // Line 1: $1,030.00 - $500.00 = $530.00, its H: C agrees. Line 2's H is $580.00: C is $1,080.00 on the paper.
    const c = totalMisreadCheck(sheet(rows("530.00", "580.00")));
    expect(c?.message).toContain(
      "The scan probably misread one figure: 2 Cleanup (line 3) reads $1,030.00; $1,080.00 if a 3 there is an 8 on the paper",
    );
  });
});
