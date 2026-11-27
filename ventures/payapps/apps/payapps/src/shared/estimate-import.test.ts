// Cost lines from a bid sheet, a supplier quote, the takeoff's material list, and a paste: each
// expected value worked by hand from the rows in the test.
import { describe, expect, it } from "vitest";
import { computeEstimate } from "./estimate";
import {
  type EstimateImportOk,
  type EstimateImportResult,
  importEstimateFile,
  readCategory,
  readEstimateGrid,
  readEstimatePaste,
  readFixed,
} from "./estimate-import";
import { writeXlsx } from "./gc-export/xlsx-write";

const ok = (r: EstimateImportResult): EstimateImportOk => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("readFixed", () => {
  it("reads what a sheet holds, in fixed point", () => {
    expect(readFixed("1,200", 3)).toEqual({ value: 1_200_000, rounded: false });
    expect(readFixed("$145.50", 6)).toEqual({ value: 145_500_000, rounded: false });
    expect(readFixed("(12)", 2)).toEqual({ value: -1200, rounded: false });
    expect(readFixed("12.500000000000002", 3)).toEqual({ value: 12_500, rounded: false });
    expect(readFixed("0.3333", 3)).toEqual({ value: 333, rounded: true });
    expect(readFixed("1.5E-2", 6)).toEqual({ value: 15_000, rounded: false });
    expect(readFixed("", 2)).toBeNull();
    expect(readFixed("$ -", 2)).toBeNull();
    expect(readFixed("#REF!", 2)).toBe("shows the Excel error #REF!");
    expect(readFixed("about 5", 2)).toMatch(/not a number/);
  });
});

describe("readCategory", () => {
  it("reads the words and letters bid sheets use", () => {
    expect(readCategory("Labor")).toBe("labor");
    expect(readCategory("MAT'L")).toBe("material");
    expect(readCategory("Equip.")).toBe("equipment");
    expect(readCategory("Subs")).toBe("subcontract");
    expect(readCategory("S")).toBe("subcontract");
    expect(readCategory("Misc")).toBe("other");
    expect(readCategory("Freight")).toBeNull();
  });
});

describe("a bid sheet with a bid item and category column", () => {
  const grid = [
    ["Smith Elementary, HVAC", "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["Bid item", "Type", "Description", "Qty", "UOM", "Unit cost", "Extended"],
    ["Ductwork", "Material", "26 ga galvanized duct", "1,200", "LB", "2.15", "2,580.00"],
    ["Ductwork", "Labor", "Install duct", "96", "HR", "68.50", "6,576.00"],
    ["Ductwork", "Freight", "Delivery", "1", "LS", "350", "350.00"],
    ["Equipment", "Sub", "Crane pick", "", "", "", "1,800.00"],
    ["Equipment", "Material", "RTU-1", "1", "EA", "18,400", "18,000.00"],
    ["", "", "Subtotal", "", "", "", "29,306.00"],
    ["", "", "Total bid", "", "", "", "29,306.00"],
    ["Controls", "Labor", "Programming", "ten", "HR", "95", ""],
  ];
  const r = ok(readEstimateGrid(grid));

  it("finds the header under the title block and maps every column", () => {
    expect(r.columns).toEqual([
      'Bid item: "Bid item"',
      'Category: "Type"',
      'Description: "Description"',
      'Quantity: "Qty"',
      'Unit: "UOM"',
      'Unit cost: "Unit cost"',
      'Total: "Extended"',
    ]);
  });

  it("reads each line, a lump sum from a total alone, and flags what to check", () => {
    expect(
      r.lines.map((l) => [l.bidItem, l.category, l.quantityMilli, l.unit, l.unitCostMicros]),
    ).toEqual([
      ["Ductwork", "material", 1_200_000, "LB", 2_150_000],
      ["Ductwork", "labor", 96_000, "HR", 68_500_000],
      ["Ductwork", "material", 1_000, "LS", 350_000_000],
      ["Equipment", "subcontract", 1_000, "LS", 1_800_000_000],
      ["Equipment", "material", 1_000, "EA", 18_400_000_000],
    ]);
    expect(r.lines[2]?.flags).toEqual(['category "Freight" not read: set to Material']);
    expect(r.lines[3]?.flags).toEqual(["lump sum: no quantity in the file"]);
    // 1 × $18,400 is $18,400.00; the sheet says $18,000.00: the unit cost wins, and it is flagged.
    expect(r.lines[4]?.flags).toEqual([
      "quantity × unit cost is $18,400.00; the file's total is $18,000.00",
    ]);
    expect(r.lines[0]?.source).toBe("row 4");
  });

  it("skips totals and rows that do not read, with the reason", () => {
    expect(r.skipped).toEqual([
      { source: "row 9", reason: "a total row (the estimate adds its own)" },
      { source: "row 10", reason: "a total row (the estimate adds its own)" },
      { source: "row 11", reason: 'the quantity is not a number ("ten")' },
    ]);
    expect(r.notes).toEqual([
      "1 category cell did not read as labor, material, equipment, subcontract or other and was set to Material.",
    ]);
  });

  it("the lines price the same in the estimate: 2580 + 6576 + 350 + 1800 + 18400", () => {
    const zero = { labor: 0, material: 0, equipment: 0, subcontract: 0, other: 0 };
    const e = computeEstimate(r.lines, { markupBps: zero, materialTaxBps: 0 });
    expect(e.totals.costCents).toBe(2_970_600);
    expect(e.bidItems.map((b) => b.description)).toEqual(["Ductwork", "Equipment"]);
  });
});

describe("a supplier quote with heading rows and no bid item column", () => {
  const csv = [
    "Line,Item,Description,Qty,Unit,Net price,Amount",
    "Rough plumbing,,,,,,",
    '1,PEX-12,"1/2"" PEX tubing, 300 ft",4,RL,89.95,359.80',
    "2,ELB-12,1/2 PEX elbow,50,EA,1.18,59.00",
    "Fixtures,,,,,,",
    "3,WC-1,Elongated toilet,6,EA,,1137.00",
    "4,LAV-2,Lavatory faucet,6,EA,,",
  ].join("\n");
  const r = ok(readEstimatePaste(csv, { defaultCategory: "material" }));

  it("uses the heading row above a group as its bid item", () => {
    expect(r.lines.map((l) => [l.bidItem, l.description, l.unitCostMicros])).toEqual([
      ["Rough plumbing", '1/2" PEX tubing, 300 ft', 89_950_000],
      ["Rough plumbing", "1/2 PEX elbow", 1_180_000],
      ["Fixtures", "Elongated toilet", 189_500_000],
      ["Fixtures", "Lavatory faucet", 0],
    ]);
  });

  it("works out a unit cost from a total (1137 / 6 = 189.50) and flags a line with no price", () => {
    expect(r.lines[2]?.flags).toEqual(["unit cost worked out from the total"]);
    expect(r.lines[3]?.flags).toEqual(["no unit cost in the file: price it"]);
    expect(r.notes).toContain(
      "1 line has no unit cost in the file and come in at $0: price it before sending the proposal.",
    );
    expect(r.notes).toContain(
      "No bid item column: each heading row (text with no numbers) names the bid item for the lines under it.",
    );
    expect(r.notes).toContain("No category column: every line is Material.");
  });

  it("flags a total that does not divide to the cent: 100 / 3", () => {
    const r2 = ok(readEstimatePaste("Description,Qty,Total\nBrackets,3,100.00\nBolts,3,100.01"));
    // $33.333333 × 3 = $99.999999, $100.00 to the cent: no flag beyond the working-out.
    expect(r2.lines[0]?.unitCostMicros).toBe(33_333_333);
    expect(r2.lines[0]?.flags).toEqual(["unit cost worked out from the total"]);
    expect(r2.lines[1]?.unitCostMicros).toBe(33_336_667);
    expect(r2.lines[1]?.flags).toEqual(["unit cost worked out from the total"]);
  });
});

describe("a bid sheet with a unit cost per category", () => {
  const grid = [
    ["Description", "Qty", "Unit", "Mat unit", "Labor unit", "Equip unit", "Sub"],
    ["Metal stud wall, 3-5/8 in", "2,400", "SF", "1.85", "3.10", "", ""],
    ["Scaffold", "1", "MO", "", "", "1,250", ""],
    ["Fire caulk", "", "", "", "", "", "4,500.00"],
    ["Patch existing", "120", "SF", "", "", "", ""],
  ];
  const r = ok(readEstimateGrid(grid, { defaultBidItem: "Drywall", defaultCategory: "labor" }));

  it("gives one line per category with a cost, under the default bid item", () => {
    expect(
      r.lines.map((l) => [l.description, l.category, l.quantityMilli, l.unitCostMicros]),
    ).toEqual([
      ["Metal stud wall, 3-5/8 in", "labor", 2_400_000, 3_100_000],
      ["Metal stud wall, 3-5/8 in", "material", 2_400_000, 1_850_000],
      ["Scaffold", "equipment", 1_000, 1_250_000_000],
      ["Fire caulk", "subcontract", 1_000, 4_500_000_000],
      ["Patch existing", "labor", 120_000, 0],
    ]);
    expect(new Set(r.lines.map((l) => l.bidItem))).toEqual(new Set(["Drywall"]));
    expect(r.columns).toContain('Material unit cost: "Mat unit"');
    expect(r.columns).toContain('Subcontract total: "Sub"');
  });
});

describe("the takeoff's material list", () => {
  // materialListCsv (apps/wall-framing-takeoff/materiallist.mjs), priced, with a warning row.
  const csv = [
    "section,item,size,length,qty,unit,note,cost",
    'Warning,1 wall not on this list,,,1,walls,"W3: opening wider than wall"',
    `Walls,stud,2x4,"8' 0""",146,pcs,,598.60`,
    `Walls,plate,2x4,"16' 0""",22,pcs,,184.80`,
    "Roof,roof area,,,24.6,squares,6:12,",
  ].join("\n");
  const r = ok(readEstimatePaste(csv));

  it("reads sections as bid items, item + size + length as the description", () => {
    expect(r.lines.map((l) => [l.bidItem, l.description, l.quantityMilli, l.unit])).toEqual([
      ["Walls", "stud 2x4 8' 0\"", 146_000, "pcs"],
      ["Walls", "plate 2x4 16' 0\"", 22_000, "pcs"],
      ["Roof", "roof area", 24_600, "squares"],
    ]);
    // 598.60 / 146 = 4.10; 184.80 / 22 = 8.40.
    expect(r.lines.map((l) => l.unitCostMicros)).toEqual([4_100_000, 8_400_000, 0]);
  });

  it("carries the warning into the notes and leaves it off the lines", () => {
    expect(r.notes[0]).toBe(
      "The file warns: 1 wall not on this list: 1: walls: W3: opening wider than wall",
    );
    expect(r.skipped).toEqual([{ source: "row 2", reason: "a warning row, not a cost" }]);
  });
});

describe("limits and failures", () => {
  it("stops at the estimate's 1,000 lines, counting the ones already there", () => {
    const rows = [
      "Description,Qty,Unit cost",
      ...Array.from({ length: 12 }, (_, i) => `L${i},1,1`),
    ];
    const r = ok(readEstimatePaste(rows.join("\n"), { existingLines: 990 }));
    expect(r.lines).toHaveLength(10);
    expect(r.notes[0]).toBe("2 more lines were left out: an estimate takes at most 1000 lines.");
  });

  it("refuses negative amounts and a unit cost with no quantity", () => {
    const r = ok(
      readEstimatePaste("Description,Qty,Unit cost\nCredit,-1,50\nBolts,,2\nNuts,4,0.25"),
    );
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "it is below $0 (enter credits on the estimate by hand)",
      "it has a unit cost and no quantity",
    ]);
    expect(r.lines).toHaveLength(1);
  });

  it("says what a header needs when there is none", () => {
    const r = readEstimatePaste("Ductwork\t1200\t2.15");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No header row found/);
    expect(readEstimatePaste("  ").ok).toBe(false);
  });

  it("says why nothing was read", () => {
    const r = readEstimatePaste("Description,Qty,Unit cost\nTotal,,\nX,ten,1");
    expect(r).toEqual({
      ok: false,
      error:
        "No cost lines read: 2 rows were skipped (first, row 2: a total row (the estimate adds its own)).",
    });
  });
});

describe("importEstimateFile", () => {
  it("reads the sheet of a workbook that holds the lines", async () => {
    const wb = writeXlsx("Bid", [
      ["Description", "Qty", "Unit", "Unit cost"],
      ["Rebar #4", { number: 2.5 }, "TON", { number: 1450 }],
    ]);
    const r = ok(await importEstimateFile("bid.xlsx", wb));
    expect(r.lines).toEqual([
      {
        bidItem: "Base bid",
        category: "material",
        description: "Rebar #4",
        quantityMilli: 2_500,
        unit: "TON",
        unitCostMicros: 1_450_000_000,
        source: "row 2",
        flags: [],
      },
    ]);
  });

  it("asks for .xlsx or CSV for other formats", async () => {
    const r = await importEstimateFile("bid.xls", new Uint8Array([1, 2, 3]));
    expect(r).toEqual({
      ok: false,
      error: "Save the sheet as .xlsx or CSV first (File → Save As), then choose that file.",
    });
    const p = await importEstimateFile("quote.pdf", new TextEncoder().encode("%PDF-1.4"));
    expect(p.ok).toBe(false);
  });

  it("reads a CSV file", async () => {
    const r = ok(
      await importEstimateFile(
        "q.csv",
        new TextEncoder().encode("Item,Qty,Price each\nHinge,10,4.25"),
      ),
    );
    expect(r.lines[0]?.unitCostMicros).toBe(4_250_000);
  });
});
