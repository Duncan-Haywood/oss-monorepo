import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findSummary,
  importSovFile,
  type OpeningTargetLine,
  openingFromImport,
  pickSov,
  readXlsx,
} from ".";
import type { Grid } from "./xlsx";

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};
const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));

// An application summary laid out the way most G702-style sheets are: line labels in A, the rate before the 5a/5b
// label, a column note after it, a "$" cell and the amount at the right; "5. RETAINAGE:" is a heading with no amount.
// The figures match the LibreOffice fixture's continuation sheet (test/fixtures/libreoffice-g703.xlsx): G $139,125.25,
// stored $44,500.00, retainage column $13,912.53 at 10%.
const g702 = (over: Record<number, string[]> = {}): Grid => {
  const rows: Record<number, string[]> = {
    0: ["APPLICATION FOR PAYMENT"],
    2: ["Application No:", "", "7", "", "Period to:", "2026-10-31"],
    5: ["1. ORIGINAL CONTRACT SUM", "", "", "", "$", "230150.75"],
    6: ["2. Net change by Change Orders", "", "", "", "$", "18900"],
    7: ["3. CONTRACT SUM TO DATE (Line 1 ± 2)", "", "", "", "$", "249050.75"],
    8: ["4. TOTAL COMPLETED & STORED TO DATE (Column G on G703)", "", "", "", "$", "139125.25"],
    9: ["5. RETAINAGE:"],
    10: ["a.", "10", "% of Completed Work", "(Columns D + E on G703)", "$", "9462.53"],
    11: ["b.", "10", "% of Stored Material", "(Column F on G703)", "$", "4450"],
    12: [
      "Total Retainage (Lines 5a + 5b or Total in Column I of G703)",
      "",
      "",
      "",
      "$",
      "13912.53",
    ],
    13: ["6. TOTAL EARNED LESS RETAINAGE", "(Line 4 Less Line 5 Total)", "", "", "$", "125212.72"],
    14: [
      "7. LESS PREVIOUS CERTIFICATES FOR PAYMENT",
      "(Line 6 from prior Certificate)",
      "",
      "",
      "$",
      "98000",
    ],
    15: ["8. CURRENT PAYMENT DUE", "", "", "", "$", "27212.72"],
    ...over,
  };
  const grid: Grid = [];
  for (const [r, cells] of Object.entries(rows)) grid[Number(r)] = cells;
  return Array.from(grid, (x) => x ?? []);
};

const job: OpeningTargetLine[] = [
  { id: "l1", itemNumber: "1", description: "Mobilization", currentCents: 1_250_000 },
  { id: "l2", itemNumber: "2", description: "Underground conduit", currentCents: 4_825_075 },
  { id: "l3", itemNumber: "3", description: "Switchgear", currentCents: 9_600_000 },
  { id: "l4", itemNumber: "4", description: "Branch wiring", currentCents: 7_340_000 },
  { id: "l5", itemNumber: "CO-1", description: "Added EV chargers", currentCents: 1_890_000 },
];

/** The LibreOffice fixture with its title-only G702 tab replaced by `grid`. */
async function withSummary(grid: Grid) {
  const sheets = await readXlsx(fixture("libreoffice-g703.xlsx"));
  const g = sheets.find((x) => x.name === "G702");
  if (!g) throw new Error("fixture changed");
  g.grid = grid;
  return ok(pickSov(sheets));
}

describe("the application summary sheet (G702)", () => {
  it("reads lines 4 to 8 by label, the amount at the right, never the rate or a column note", () => {
    const s = findSummary([{ name: "G702", grid: g702() }]);
    expect(s?.amounts).toEqual({
      line4: 13_912_525,
      line5a: 946_253,
      line5b: 445_000,
      line5: 1_391_253,
      line6: 12_521_272,
      line7: 9_800_000,
      line8: 2_721_272,
    });
    expect(s?.sources.line5a).toBe("cell F11");
    expect(s?.applicationNumber).toBe(7);
    expect(s?.periodTo).toBe("2026-10-31");
    expect(s?.errors).toEqual([]);
  });

  it("a sheet without retainage or line 6 labels is not a summary; a continuation sheet's rate label is not line 5", () => {
    expect(findSummary([{ name: "G702", grid: [["APPLICATION FOR PAYMENT"]] }])).toBeNull();
    expect(
      findSummary([
        {
          name: "SOV",
          grid: [
            ["Retainage on work, %", "", "10"],
            ["Item", "Description"],
          ],
        },
      ]),
    ).toBeNull();
  });

  it("an uncalculated amount is an error naming the cell, not $0.00", () => {
    const s = findSummary([
      { name: "Summary", grid: [["5. Retainage", "", "#UNCALCULATED", "Column J total."]] },
    ]);
    expect(s?.amounts.line5).toBeNull();
    expect(s?.errors).toEqual(["line 5 (cell C1) is a formula with no saved result"]);
  });

  it("the free template's own summary: line 7 typed in, the formulas read as unreadable", async () => {
    const sheet = ok(await importSovFile("sov.xlsx", fixture("schedule-of-values-example.xlsx")));
    expect(sheet.summary?.sheet).toBe("Summary");
    expect(sheet.summary?.amounts.line7).toBe(3_150_000);
    expect(sheet.summary?.amounts.line6).toBeNull();
    expect(sheet.summary?.errors.join(" ")).toMatch(
      /line 6 \(cell C9\) is a formula with no saved result/,
    );
  });
});

describe("mid-job start with the summary sheet", () => {
  it("stored materials no longer leave 5a blank: 5a and line 6 come from the G702", async () => {
    const f = ok(openingFromImport(await withSummary(g702()), job));
    expect(f.storedCents).toBe(4_450_000);
    expect(f.line5aCents).toBe(946_253);
    expect(f.line6Cents).toBe(12_521_272); // same as G less the retainage column
    expect(f.periodTo).toBe("2026-10-31"); // the continuation sheet has none
    expect(f.checks).toEqual([]);
    const notes = f.notes.join(" ");
    expect(notes).toMatch(
      /From the summary sheet "G702": line 6 \(\$125,212.72, cell F14\); line 5a \(\$9,462.53, cell F11\); the period end \(2026-10-31\)/,
    );
    expect(notes).not.toMatch(/Line 5a is left blank/);
    expect(notes).not.toMatch(/not found/);
  });

  it("5a worked out as line 5 less 5b when the summary has no 5a amount", async () => {
    const f = ok(
      openingFromImport(await withSummary(g702({ 10: ["a.", "10", "% of Completed Work"] })), job),
    );
    expect(f.line5aCents).toBe(946_253);
    expect(f.notes.join(" ")).toMatch(/line 5 less 5b, cell F13 less cell F12/);
  });

  it("a summary that disagrees with the continuation sheet wins, with a check naming both figures", async () => {
    const f = ok(
      openingFromImport(
        await withSummary(g702({ 13: ["6. TOTAL EARNED LESS RETAINAGE", "$", "125000"] })),
        job,
      ),
    );
    expect(f.line6Cents).toBe(12_500_000);
    const msgs = f.checks.map((c) => c.message).join(" ");
    expect(msgs).toMatch(
      /gives line 6 as \$125,000.00; the continuation sheet's columns give \$125,212.72/,
    );
    expect(msgs).toMatch(/line 4 \(\$139,125.25\) less line 5 \(\$13,912.53\) is not line 6/);
  });

  it("a summary for another application is not used at all", async () => {
    const f = ok(
      openingFromImport(
        await withSummary(
          g702({ 2: ["Application No:", "", "6", "", "Period to:", "2026-09-30"] }),
        ),
        job,
      ),
    );
    expect(f.checks[0]?.severity).toBe("high");
    expect(f.checks[0]?.message).toMatch(
      /is for application 6, the period to 2026-09-30, but the continuation sheet is for application 7/,
    );
    expect(f.line5aCents).toBeNull();
    expect(f.periodTo).toBeNull();
  });
});

// A printed application: the summary page of a PDF beside the continuation sheet (test/fixtures/README.md).
describe("the summary page of a PDF", () => {
  const pdfJob: OpeningTargetLine[] = [
    { id: "l1", itemNumber: "1", description: "Mobilization", currentCents: 1_250_000 },
    { id: "l2", itemNumber: "2", description: "Underground conduit", currentCents: 4_825_075 },
    { id: "l3", itemNumber: "3", description: "Switchgear", currentCents: 9_600_000 },
    { id: "l4", itemNumber: "4", description: "Branch wiring", currentCents: 7_340_000 },
    { id: "l5", itemNumber: "CO-1", description: "Added EV chargers", currentCents: 1_890_000 },
  ];

  it("reads an AIA-style G702 page by its labels: leader dots, the rate in the 5a blank, the architect's amount beside line 6 left out", async () => {
    const sheet = ok(await importSovFile("app-7.pdf", fixture("g702-g703-chrome.pdf")));
    expect(sheet.lines).toHaveLength(4);
    const s = sheet.summary;
    expect(s?.sheet).toBe("PDF page 1");
    expect(s?.amounts).toEqual({
      line4: 13_962_525,
      line5a: 951_253,
      line5b: 445_000,
      line5: 1_396_253,
      line6: 12_566_272, // not the $27,662.72 certified on the same baseline
      line7: 9_800_000,
      line8: 2_766_272,
    });
    expect(s?.sources.line6).toMatch(/^page 1, line \d+$/);
    expect(s?.applicationNumber).toBe(7);
    expect(s?.periodTo).toBe("2026-10-31");
    expect(s?.errors).toEqual([]);
  });

  it("mid-job start from the PDF: stored materials no longer leave 5a blank", async () => {
    const sheet = ok(await importSovFile("app-7.pdf", fixture("g702-g703-chrome.pdf")));
    const f = ok(openingFromImport(sheet, pdfJob));
    expect(f.applicationNumber).toBe(7);
    expect(f.storedCents).toBe(4_450_000);
    expect(f.line5aCents).toBe(951_253);
    expect(f.line6Cents).toBe(12_566_272);
    expect(f.checks).toEqual([]);
    const notes = f.notes.join(" ");
    expect(notes).toMatch(
      /From the summary sheet "PDF page 1": line 6 \(\$125,662.72, page 1, line \d+\)/,
    );
    expect(notes).not.toMatch(/Line 5a is left blank/);
  });

  it("the free template printed by LibreOffice: page 2's summary, its combined application no. / period label, every formula's printed result", async () => {
    const sheet = ok(await importSovFile("sov.pdf", fixture("schedule-of-values-example.pdf")));
    const s = sheet.summary;
    expect(s?.sheet).toBe("PDF page 2");
    // The .xlsx has these as formulas with no saved result; the PDF has what LibreOffice printed.
    expect(s?.amounts).toMatchObject({
      line4: 7_985_000,
      line5: 798_500,
      line6: 7_186_500,
      line7: 3_150_000,
      line8: 4_036_500,
    });
    expect(s?.sources.line6).toBe("page 2, line 9");
    expect(s?.applicationNumber).toBe(3);
    expect(s?.periodTo).toBe("2026-10-31");
  });

  it("a printed line whose only figure after the label is a bare number takes no amount (a rate, not dollars)", () => {
    const s = findSummary([
      {
        name: "PDF page 1",
        grid: [
          ["5. Retainage", "10"],
          ["6. Total earned less retainage", "$1,000.00"],
        ],
        printed: true,
        where: (r) => `page 1, line ${r + 1}`,
      },
    ]);
    expect(s?.amounts.line5).toBeNull();
    expect(s?.amounts.line6).toBe(100_000);
    expect(s?.sources.line6).toBe("page 1, line 2");
  });
});
