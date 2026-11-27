import { describe, expect, it } from "vitest";
import { parseCsv } from "../sov-import/csv";
import { readXlsx } from "../sov-import/xlsx";
import {
  checkTrimblePaySov,
  guessRoles,
  readTrimblePayCsv,
  readTrimblePayGrid,
  roleFromHeader,
  rolesComplete,
  type TrimblePaySovLine,
  trimblePaySovCsv,
  trimblePaySovFileName,
  trimblePaySovRows,
  trimblePaySovWorkbook,
} from "./trimble-pay-sov";
import { writeXlsx } from "./xlsx-write";

const lines: TrimblePaySovLine[] = [
  { itemNumber: "01", description: "Mobilization", cents: 250_000 },
  { itemNumber: "1.10", description: 'Rough-in, "level 1"', cents: 4_000_050 },
  { itemNumber: "", description: "Trim and devices", cents: 2_500_000 },
];

describe("roleFromHeader", () => {
  it("reads the usual header words", () => {
    expect(roleFromHeader("Description")).toBe("description");
    expect(roleFromHeader("Line Item Description")).toBe("description");
    expect(roleFromHeader("Scheduled Value")).toBe("value");
    expect(roleFromHeader("Amount ($)")).toBe("value");
    expect(roleFromHeader("Item #")).toBe("item");
    expect(roleFromHeader("Cost Code")).toBe("item");
    expect(roleFromHeader("Line No")).toBe("item");
    expect(roleFromHeader("Notes")).toBeNull();
    expect(roleFromHeader("")).toBeNull();
  });
});

describe("guessRoles", () => {
  it("fills the one column left when two are known", () => {
    expect(guessRoles(["Code", "Something", "Value"])).toEqual(["item", "description", "value"]);
  });
  it("drops a reading two columns share", () => {
    expect(guessRoles(["Value", "Amount", "Notes"])).toEqual([null, null, null]);
  });
  it("keeps any order the header gives", () => {
    expect(guessRoles(["Description", "Value", "Item"])).toEqual(["description", "value", "item"]);
  });
});

describe("readTrimblePayGrid", () => {
  it("keeps rows 1 and 2, joins their text per column and counts rows below", () => {
    const r = readTrimblePayGrid(
      [
        ["Schedule of Values", "", "", "Do not edit"],
        ["Item", "Description", "Scheduled Value"],
        ["1", "Example", "100"],
        [],
      ],
      "SOV",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.template.header).toEqual([
      ["Schedule of Values", "", "", "Do not edit"],
      ["Item", "Description", "Scheduled Value"],
    ]);
    expect(r.template.labels).toEqual([
      "Schedule of Values / Item",
      "Description",
      "Scheduled Value",
    ]);
    expect(r.template.roles).toEqual(["item", "description", "value"]);
    expect(r.template.existingRows).toBe(1);
    expect(r.template.sheetName).toBe("SOV");
  });

  it("refuses an empty file and one with nothing in A to C of the header", () => {
    expect(readTrimblePayGrid([[""], []]).ok).toBe(false);
    expect(readTrimblePayGrid([["", "", "", "x"], []]).ok).toBe(false);
    expect(readTrimblePayCsv("").ok).toBe(false);
  });

  it("reads a CSV template", () => {
    const r = readTrimblePayCsv("\uFEFFNo.,Description,Value\r\n,,\r\n");
    expect(r.ok && r.template.roles).toEqual(["item", "description", "value"]);
  });
});

describe("checkTrimblePaySov", () => {
  it("compares the total with the contract value and lists what Trimble Pay would flag", () => {
    const c = checkTrimblePaySov(
      [...lines, { itemNumber: "01", description: " ", cents: 0 }],
      6_750_050,
    );
    expect(c).toEqual({
      lines: 4,
      totalCents: 6_750_050,
      contractCents: 6_750_050,
      diffCents: 0,
      undescribed: 1,
      unnumbered: 1,
      duplicateNumbers: ["01"],
      nonPositive: 1,
    });
    expect(checkTrimblePaySov(lines, 7_000_000).diffCents).toBe(-249_950);
  });
});

describe("trimblePaySovRows", () => {
  const read = readTrimblePayGrid([
    ["Flashtract", "", "", "keep"],
    ["Description", "Value", "Cost Code"],
  ]);
  if (!read.ok) throw new Error("template");
  const t = read.template;

  it("writes rows 1 and 2 unchanged, then A to C in the template's order", () => {
    expect(rolesComplete(t.roles)).toBe(true);
    expect(trimblePaySovRows(t, t.roles, lines)).toEqual([
      ["Flashtract", null, null, "keep"],
      ["Description", "Value", "Cost Code"],
      ["Mobilization", { number: 2500 }, "01"],
      ['Rough-in, "level 1"', { number: 40000.5 }, "1.10"],
      ["Trim and devices", { number: 25000 }, null],
    ]);
  });

  it("refuses roles that are not one each", () => {
    expect(rolesComplete(["item", "item", "value"])).toBe(false);
    expect(() => trimblePaySovRows(t, ["item", null, "value"], lines)).toThrow();
  });

  it("round-trips the workbook through the app's own reader, item numbers as text", async () => {
    const [sheet] = await readXlsx(trimblePaySovWorkbook(t, t.roles, lines));
    expect(sheet?.grid).toEqual([
      ["Flashtract", "", "", "keep"],
      ["Description", "Value", "Cost Code"],
      ["Mobilization", "2500", "01"],
      ['Rough-in, "level 1"', "40000.5", "1.10"],
      ["Trim and devices", "25000"],
    ]);
  });

  it("reads a template it wrote itself back the same", async () => {
    const [sheet] = await readXlsx(writeXlsx("S", [["Item"], ["", "Description", "Value"]]));
    const r = readTrimblePayGrid(sheet?.grid ?? []);
    expect(r.ok && r.template.roles).toEqual(["item", "description", "value"]);
  });

  it("writes CSV with quoting, parseable by the app's CSV reader", () => {
    const csv = trimblePaySovCsv(t, t.roles, lines);
    expect(csv.split("\r\n")[3]).toBe('"Rough-in, ""level 1""",40000.5,1.10');
    expect(parseCsv(csv)[3]).toEqual(['Rough-in, "level 1"', "40000.5", "1.10"]);
  });
});

it("names the file after the job", () => {
  expect(trimblePaySovFileName({ number: "24-118", name: "Elm" })).toBe(
    "24-118-trimble-pay-sov.xlsx",
  );
  expect(trimblePaySovFileName({ number: null, name: "Elm St / Unit 2" }, "csv")).toBe(
    "Elm-St-Unit-2-trimble-pay-sov.csv",
  );
});
