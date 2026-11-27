import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import { readXlsx, UNCALCULATED } from "../xlsx";
import { parseCsv, planImport } from "./csv-import";
import { chooseSheet, gridToCsv, looksLikeWorkbook, readWorkbookForImport } from "./sheet-import";

const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../../test/fixtures/${n}`, import.meta.url)));

describe("gridToCsv", () => {
  it("round-trips through the CSV reader, row N staying line N", () => {
    const grid = [
      ["Title"],
      [],
      ["Requirement", "Status", "Statement"],
      ["3.1.1", "Met", 'Badges, keys; "two-person" rule\nreviewed yearly'],
      ["3.1.2", "", "tab\there"],
      [],
      [],
    ];
    const csv = gridToCsv(grid);
    const back = parseCsv(csv);
    expect(back).toHaveLength(5); // trailing blank rows dropped
    expect(back[3]).toEqual(grid[3]);
    expect(back[4]).toEqual(grid[4]);
    expect(back[1]).toEqual([""]);
  });

  it("picks commas even when the first rows hold only semicolons or tabs inside cells", () => {
    const csv = gridToCsv([
      ["a;b", "c\td"],
      ["3.1.1", "Met"],
    ]);
    expect(parseCsv(csv)).toEqual([
      ["a;b", "c\td"],
      ["3.1.1", "Met"],
    ]);
  });
});

describe("chooseSheet", () => {
  it("prefers the sheet with the most requirement ids, first on a tie", async () => {
    const wb = await workbook({
      Instructions: { 1: ["Fill in 3.1.1 and the rest on the next sheet"] },
      Level2: { 1: ["Requirement", "Status"], 2: ["3.1.1", "Met"], 3: ["3.1.2", "Not met"] },
      Copy: { 1: ["Requirement", "Status"], 2: ["3.1.1", "Met"], 3: ["3.1.2", "Met"] },
    });
    const read = await readWorkbookForImport(wb, 2);
    expect(read.sheets.map((s) => s.name)).toEqual(["Instructions", "Level2", "Copy"]);
    expect(read.sheets.map((s) => s.idCells)).toEqual([0, 2, 2]);
    expect(read.best).toBe(1);
  });

  it("returns -1 when no sheet has an id at the level", async () => {
    const sheets = await readXlsx(await workbook({ A: { 1: ["Name", "Value"], 2: ["x", 1] } }));
    expect(chooseSheet(sheets, 2).best).toBe(-1);
  });

  it("counts Level 1 ids for a Level 1 import", async () => {
    const wb = await workbook({ L1: { 1: ["Practice", "Status"], 2: ["AC.L1-b.1.i", "Met"] } });
    expect((await readWorkbookForImport(wb, 1)).best).toBe(0);
  });
});

describe("looksLikeWorkbook", () => {
  it("knows a ZIP and an old .xls from text", async () => {
    expect(looksLikeWorkbook(await workbook({ S: { 1: ["x"] } }))).toBe(true);
    expect(looksLikeWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).toBe(true);
    expect(looksLikeWorkbook(new TextEncoder().encode("Requirement,Status\n"))).toBe(false);
  });
});

describe("a workbook LibreOffice wrote", () => {
  it("imports the same rows as its CSV, with Excel row numbers", async () => {
    const read = await readWorkbookForImport(fixture("self-assessment-libreoffice.xlsx"), 2);
    expect(read.best).toBe(0);
    const plan = planImport(gridToCsv(read.grids[0] ?? []), 2);
    expect(plan.columns).toMatchObject({
      id: "Requirement",
      status: "Status",
      owner: "Owner",
      statement: "Implementation statement",
      notes: "Notes",
    });
    expect(plan.rows.map((r) => [r.line, r.controlId, r.status])).toEqual([
      [5, "AC.L2-3.1.1", "implemented"],
      [6, "AC.L2-3.1.2", "not_implemented"], // the formula's cached result
      [9, "AT.L2-3.2.1", "partially_implemented"],
    ]);
    expect(plan.rows[0]?.statement).toBe("Accounts are created by IT\nfrom a signed request.");
    expect(plan.rows[0]?.ownerEmail).toBe("it@acme.example");
    expect(plan.rows[2]?.statement).toBe('Annual training, slides; "phishing" module, quarterly');
    expect(plan.issues).toEqual([
      { line: 7, message: expect.stringMatching(/^"mostly" is not a status/) },
    ]);

    const fromCsv = planImport(
      readFileSync(
        new URL("../../../test/fixtures/self-assessment-libreoffice.source.csv", import.meta.url),
        "utf8",
      ),
      2,
    );
    expect(fromCsv.rows.map((r) => r.controlId)).toEqual(plan.rows.map((r) => r.controlId));
  });

  it("names the row of a formula saved without its result", async () => {
    const wb = await workbook({
      S: { 1: ["Requirement", "Status"], 2: ["3.1.1", { f: 'IF(A1="","Met","")' }] },
    });
    const read = await readWorkbookForImport(wb, 2);
    expect(read.grids[0]?.[1]?.[1]).toBe(UNCALCULATED);
    const plan = planImport(gridToCsv(read.grids[0] ?? []), 2);
    expect(plan.issues[0]?.line).toBe(2);
    expect(plan.issues[0]?.message).toContain(UNCALCULATED);
  });
});
