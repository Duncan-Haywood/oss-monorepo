import { describe, expect, it } from "vitest";
import { readXlsx, unzip } from "../sov-import/xlsx";
import {
  checkGcpaySov,
  GCPAY_SOV_HEADER,
  type GcpaySovLine,
  gcpaySovFileName,
  gcpaySovRows,
  gcpaySovWorkbook,
  gcpayUnitPriceSovRows,
  gcpayUnitPriceSovWorkbook,
} from "./gcpay-sov";
import { crc32, writeXlsx } from "./xlsx-write";

const lines: GcpaySovLine[] = [
  { itemNumber: "01", description: "Mobilization", cents: 250_000 },
  { itemNumber: "1.10", description: "Rough-in & conduit <level 1>", cents: 4_000_050 },
  { itemNumber: "", description: "Trim and devices", cents: 2_500_000 },
];

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("writeXlsx", () => {
  it("round-trips text, numbers and blanks through the app's own reader", async () => {
    const book = writeXlsx("Sheet: one/two", [
      ["a", { number: 1.5 }, null, "x"],
      [],
      ["", { number: -20 }],
    ]);
    const [sheet] = await readXlsx(book);
    expect(sheet?.name).toBe("Sheet  one two");
    expect(sheet?.grid).toEqual([["a", "1.5", "", "x"], [], ["", "-20"]]);
  });

  it("strips characters XML cannot hold", async () => {
    const [sheet] = await readXlsx(writeXlsx("S", [["bell\u0007 tab\tok"]]));
    expect(sheet?.grid[0]?.[0]).toBe("bell tab\tok");
  });

  it("is a ZIP with the parts Excel needs", () => {
    const names = [...unzip(writeXlsx("S", [["a"]])).keys()].sort();
    expect(names).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });
});

describe("gcpay SOV", () => {
  it("writes the guide's three columns, the item number kept as text", async () => {
    expect(gcpaySovRows(lines)[0]).toEqual(["Item Number", "Description", "Value"]);
    const [sheet] = await readXlsx(gcpaySovWorkbook(lines));
    expect(sheet?.grid).toEqual([
      [...GCPAY_SOV_HEADER],
      ["01", "Mobilization", "2500"],
      ["1.10", "Rough-in & conduit <level 1>", "40000.5"],
      ["", "Trim and devices", "25000"],
    ]);
  });

  it("checks the total against the original contract sum", () => {
    expect(checkGcpaySov(lines, 6_750_050)).toMatchObject({
      lines: 3,
      totalCents: 6_750_050,
      diffCents: 0,
      unnumbered: 1,
      duplicateNumbers: [],
    });
    expect(checkGcpaySov(lines, 7_000_000).diffCents).toBe(-249_950);
    expect(
      checkGcpaySov(
        [
          { itemNumber: "1", description: "a", cents: 1 },
          { itemNumber: " 1 ", description: "b", cents: 1 },
        ],
        2,
      ).duplicateNumbers,
    ).toEqual(["1"]);
  });

  it("names the file after the job", () => {
    expect(gcpaySovFileName({ number: "24-118", name: "Elm St" })).toBe("24-118-gcpay-sov.xlsx");
    expect(gcpaySovFileName({ number: null, name: "Elm St / Phase 2" })).toBe(
      "Elm-St-Phase-2-gcpay-sov.xlsx",
    );
    expect(gcpaySovFileName({ number: "", name: "///" })).toBe("job-gcpay-sov.xlsx");
  });
});

describe("gcpay unit-price SOV", () => {
  const unitLines: GcpaySovLine[] = [
    { itemNumber: "1", description: "Mobilization", cents: 1_500_000 },
    {
      itemNumber: "2",
      description: "Concrete curb",
      cents: 6_205_000,
      unitPrice: { quantityMilli: 3_400_000, unit: "LF", unitPriceMicros: 18_250_000 },
    },
    {
      itemNumber: "3",
      description: "Aggregate base",
      cents: 0,
      unitPrice: { quantityMilli: null, unit: "TON", unitPriceMicros: 32_000_000 },
    },
  ];
  it("writes the guide's five columns: quantity, unit, unit price; lump sums as 1 LS", async () => {
    expect(gcpayUnitPriceSovRows(unitLines)[0]).toEqual([
      "Item Number",
      "Description",
      "Units",
      "Unit Description",
      "Unit Value",
    ]);
    const [sheet] = await readXlsx(gcpayUnitPriceSovWorkbook(unitLines));
    expect(sheet?.grid).toEqual([
      ["Item Number", "Description", "Units", "Unit Description", "Unit Value"],
      ["1", "Mobilization", "1", "LS", "15000"],
      ["2", "Concrete curb", "3400", "LF", "18.25"],
      ["3", "Aggregate base", "1", "LS", "0"],
    ]);
  });
  it("counts unit-price lines and names the ones with no contract quantity", () => {
    expect(checkGcpaySov(unitLines, 7_705_000)).toMatchObject({
      diffCents: 0,
      unitPriceLines: 2,
      unitPriceWithoutQuantity: ["3"],
    });
  });
});
