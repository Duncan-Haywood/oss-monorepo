import { describe, expect, it } from "vitest";
import { readXlsx } from "./xlsx";
import { cellXml, safeSheetName, workbookParts, writeXlsx } from "./xlsx-write";

describe("cellXml", () => {
  it("writes plain numbers as numbers, two decimals with the 0.00 format", () => {
    expect(cellXml("A1", "95", false)).toBe('<c r="A1"><v>95</v></c>');
    expect(cellXml("B2", "95.00", false)).toBe('<c r="B2" s="2"><v>95</v></c>');
    expect(cellXml("C3", "0.0975", false)).toBe('<c r="C3"><v>0.0975</v></c>');
  });
  it("writes percentages as fractions with a percent format", () => {
    expect(cellXml("A1", "15%", false)).toBe('<c r="A1" s="3"><v>0.15</v></c>');
    expect(cellXml("A1", "12.5%", false)).toBe('<c r="A1" s="4"><v>0.125</v></c>');
  });
  it("keeps as text what the reader would not give back unchanged", () => {
    // More decimals than the reader keeps, leading zeros, a header, a text column.
    for (const [text, header, asText] of [
      ["0.0000001", false, false],
      ["007", false, false],
      ["1e5", false, false],
      ["95", true, false],
      ["1.50", false, true],
    ] as const)
      expect(cellXml("A1", text, header, asText)).toContain('t="inlineStr"');
  });
  it("escapes XML, drops control characters, and never writes a formula", () => {
    const x = cellXml("A1", '\'=HYPERLINK("x")<&>\u0001', false);
    expect(x).toContain("=HYPERLINK(&quot;x&quot;)&lt;&amp;&gt;</t>");
    expect(x).not.toContain("<f>");
    expect(cellXml("A1", "", false)).toBe("");
  });
});

describe("safeSheetName", () => {
  it("removes characters Excel refuses, cuts to 31 and de-duplicates", () => {
    const taken = new Set<string>();
    expect(safeSheetName("Cut speeds [in/min]", taken)).toBe("Cut speeds  in min");
    expect(safeSheetName("A".repeat(40), taken)).toBe("A".repeat(31));
    expect(safeSheetName("a".repeat(40), taken)).toBe(`${"a".repeat(27)} (2)`);
    expect(safeSheetName("", taken)).toBe("Sheet");
  });
});

describe("writeXlsx", () => {
  it("reads back through readXlsx with the same text, tab by tab", async () => {
    const sheets = [
      {
        name: "Machines",
        grid: [
          ["Machine", "Hourly rate", "Scrap %", "Active"],
          ["Haas VF-2", "95.00", "12.5%", "yes"],
          ['Okuma LB3000, 10" chuck', "110.50", "0%", "no"],
          ["Ünïcode & <brackets>", "", "", "yes"],
        ],
        textColumns: [0],
      },
      {
        name: "Shop settings",
        grid: [
          ["Setting", "Value"],
          ["Default quantities", "1, 5, 10, 25"],
        ],
      },
    ];
    const back = await readXlsx(await writeXlsx(sheets));
    expect(back.map((s) => s.name)).toEqual(["Machines", "Shop settings"]);
    expect(back[0]?.grid).toEqual([
      ["Machine", "Hourly rate", "Scrap %", "Active"],
      ["Haas VF-2", "95", "12.5%", "yes"],
      ['Okuma LB3000, 10" chuck', "110.5", "0%", "no"],
      ["Ünïcode & <brackets>", "", "", "yes"],
    ]);
    expect(back[1]?.grid).toEqual(sheets[1]?.grid);
  });

  it("gives the same bytes for the same input (no clock in the file)", async () => {
    const s = [{ name: "A", grid: [["x"], ["1"]] }];
    expect(await writeXlsx(s)).toEqual(await writeXlsx(s));
  });

  it("declares every sheet in the content types and the workbook", () => {
    const parts = workbookParts([
      { name: "One", grid: [["a"]] },
      { name: "Two", grid: [["b"]] },
    ]);
    expect(Object.keys(parts)).toContain("xl/worksheets/sheet2.xml");
    expect(parts["[Content_Types].xml"]).toContain("/xl/worksheets/sheet2.xml");
    expect(parts["xl/workbook.xml"]).toContain('name="Two" sheetId="2" r:id="rId2"');
    expect(parts["xl/_rels/workbook.xml.rels"]).toContain('Id="rId3"');
    expect(() => workbookParts([])).toThrow();
  });
});
