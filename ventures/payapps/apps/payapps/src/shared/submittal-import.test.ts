// Submittal register import: a GC's register as CSV, xlsx-like grids and a Chromium-printed PDF, and
// spec sections printed by Chromium (test/fixtures/README.md, "Submittal fixtures").
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./sov-import/csv";
import {
  alreadyOnLog,
  normalizeSpecSection,
  readDays,
  readRegister,
  readSpecSections,
  registerColumns,
  type SpecLine,
  typeFromText,
} from "./submittal-import";
import { importRegisterFile, pageLines } from "./submittal-import-file";

const fixture = (n: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/${n}`, import.meta.url)));

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
  return r as Extract<T, { ok: true }>;
};

describe("cells", () => {
  it("normalizes MasterFormat numbers and keeps other schemes", () => {
    expect(normalizeSpecSection("033000")).toBe("03 30 00");
    expect(normalizeSpecSection("03-30-00")).toBe("03 30 00");
    expect(normalizeSpecSection("08 1 1 00")).toBe("08 11 00");
    expect(normalizeSpecSection("23 31 13.13")).toBe("23 31 13.13");
    expect(normalizeSpecSection("03300")).toBe("03300");
    expect(normalizeSpecSection("ELEC-4")).toBe("ELEC-4");
    expect(normalizeSpecSection("  ")).toBeNull();
  });

  it("reads types from words and short codes, else null", () => {
    expect(typeFromText("Shop Drawings")).toBe("shop_drawings");
    expect(typeFromText("PD")).toBe("product_data");
    expect(typeFromText("Samples for Verification")).toBe("samples");
    expect(typeFromText("Operation and Maintenance Data")).toBe("o_and_m");
    expect(typeFromText("Field quality-control reports")).toBe("test_report");
    expect(typeFromText("Welding certificates")).toBe("certificate");
    expect(typeFromText("Mock-up")).toBe("mock_up");
    expect(typeFromText("O&M manual")).toBe("o_and_m");
    expect(typeFromText("Coordination drawings")).toBe("shop_drawings");
    expect(typeFromText("LEED documentation")).toBeNull();
  });

  it("reads calendar days and weeks, refuses business days", () => {
    expect(readDays("14")).toBe(14);
    expect(readDays("14 days")).toBe(14);
    expect(readDays("3 weeks")).toBe(21);
    expect(readDays("2 wks")).toBe(14);
    expect(readDays("10 business days")).toBe("business");
    expect(readDays("10 working days")).toBe("business");
    expect(readDays("TBD")).toBeNull();
    expect(readDays("1.5")).toBeNull();
    expect(readDays("9999")).toBeNull();
  });

  it("matches header names and needs a title column", () => {
    const c = registerColumns([
      "Spec Section",
      "Submittal #",
      "Submittal Title",
      "Submittal Type",
      "Due Date",
      "Required On-Site Date",
      "Lead Time (days)",
      "Design Team Review Time",
    ]);
    expect(c).toEqual({
      specSection: 0,
      gcReference: 1,
      title: 2,
      type: 3,
      requiredBy: 4,
      neededOnSite: 5,
      leadTimeDays: 6,
      reviewDays: 7,
    });
    expect(registerColumns(["Spec Section", "Number", "Status"])).toBeNull();
  });
});

describe("a register from a spreadsheet or CSV", () => {
  const csv = [
    "Harbor Clinic TI,,,,,,",
    "Submittal Register,,,,,,",
    ",,,,,,",
    "Spec Section,Number,Title,Type,Due Date,Required On-Site Date,Lead Time",
    ",,DIVISION 09 - FINISHES,,,,",
    "092116,09 21 16-1,Gypsum board product data,PD,12/01/2026,01/15/2027,14",
    '09 21 16,09 21 16-2,"Control joint layout, levels 1-3",Shop Drawings,2026-12-05,,3 weeks',
    "09 91 23,09 91 23-1,Paint color samples,,,,",
    "09 30 13,,Tile setting materials,Cut sheets,,,10 business days",
    "09 51 13,09 51 13-1,Acoustical ceiling panels,LEED,soon,,",
    "09 65 13,09 65 13-1,,Product Data,,,",
  ].join("\n");

  it("reads the rows under the title block, with dates, days and types", () => {
    const r = ok(readRegister(parseCsv(csv)));
    expect(r.kind).toBe("register");
    expect(r.items).toHaveLength(5);
    expect(r.items[0]).toEqual({
      specSection: "09 21 16",
      title: "Gypsum board product data",
      type: "product_data",
      typeFrom: "column",
      gcReference: "09 21 16-1",
      requiredBy: "2026-12-01",
      neededOnSite: "2027-01-15",
      leadTimeDays: 14,
      reviewDays: null,
      notes: null,
      source: "row 6",
    });
    expect(r.items[1]?.leadTimeDays).toBe(21);
    expect(r.items[1]?.title).toBe("Control joint layout, levels 1-3");
    // No type column value: read from the title's words.
    expect(r.items[2]).toMatchObject({ type: "samples", typeFrom: "title" });
    // "Cut sheets" is product data; business days are left blank and kept in the notes.
    expect(r.items[3]).toMatchObject({
      type: "product_data",
      leadTimeDays: null,
      notes: "Lead time in the register: 10 business days",
    });
    // An unknown type and an unreadable date are kept in the notes, never guessed.
    expect(r.items[4]).toMatchObject({
      type: "other",
      typeFrom: "none",
      requiredBy: null,
      notes: "Type in the register: LEED; Required back in the register: soon",
    });
    expect(r.skipped).toEqual([
      { source: "row 5", reason: 'a heading: "DIVISION 09 - FINISHES"' },
      { source: "row 11", reason: "no title or description" },
    ]);
    expect(r.notes.join(" ")).toMatch(/1 lead or review time is in business days/);
    expect(r.notes.join(" ")).toMatch(/1 type was read from words in the title/);
  });

  it("refuses a sheet with no register header", () => {
    const r = readRegister(parseCsv("Item,Amount\nConcrete,100"));
    expect(r.ok).toBe(false);
  });

  it("spots rows already on the log by spec section and title", () => {
    const r = ok(readRegister(parseCsv(csv)));
    const dupes = alreadyOnLog(r.items, [
      { specSection: "092116", title: "Gypsum Board Product Data" },
      { specSection: null, title: "Paint color samples" },
    ]);
    expect([...dupes]).toEqual([0]);
  });

  it("reads a CSV file through the file entry point", async () => {
    const r = ok(await importRegisterFile("register.csv", new TextEncoder().encode(csv)));
    expect(r.items).toHaveLength(5);
  });
});

describe("a register printed to PDF", () => {
  it("reads every row over two pages, the repeated header and division rows left out", async () => {
    const r = ok(
      await importRegisterFile("register.pdf", fixture("submittal-register-chrome.pdf")),
    );
    expect(r.kind).toBe("register");
    expect(r.items).toHaveLength(45);
    expect(r.columns).toEqual({
      specSection: "Spec Section",
      title: "Title",
      type: "Type",
      gcReference: "Number",
      neededOnSite: "Required On-Site Date",
      leadTimeDays: "Lead Time",
    });
    expect(r.items[0]).toMatchObject({
      specSection: "08 11 00",
      gcReference: "001",
      title: "Openings item 1 product data",
      type: "product_data",
      neededOnSite: "2026-12-02",
      leadTimeDays: 11,
    });
    // "N weeks" rows are seven days a week.
    expect(r.items[3]?.leadTimeDays).toBe(35);
    expect(r.items.some((i) => i.source.startsWith("page 2"))).toBe(true);
    const last = r.items[r.items.length - 1];
    expect(last).toMatchObject({ specSection: "09 21 16", leadTimeDays: null });
    expect(r.skipped.every((s) => s.reason.startsWith("a heading"))).toBe(true);
  });
});

describe("spec sections", () => {
  it("lists each lettered paragraph of the SUBMITTALS articles, not the procedures section", async () => {
    const r = ok(await importRegisterFile("specs.pdf", fixture("spec-sections-chrome.pdf")));
    expect(r.kind).toBe("spec");
    expect(r.items.map((i) => [i.specSection, i.title, i.type])).toEqual([
      ["09 21 16", "Gypsum Board Assemblies: Product Data", "product_data"],
      ["09 21 16", "Gypsum Board Assemblies: Shop Drawings", "shop_drawings"],
      ["09 21 16", "Gypsum Board Assemblies: Samples", "samples"],
      ["09 21 16", "Gypsum Board Assemblies: Product Test Reports", "test_report"],
      ["23 31 13", "Metal Ducts: Product Data", "product_data"],
      ["23 31 13", "Metal Ducts: Shop Drawings", "shop_drawings"],
      ["23 31 13", "Metal Ducts: Welding certificates", "certificate"],
      ["23 31 13", "Metal Ducts: Operation and Maintenance Data", "o_and_m"],
      ["23 31 13", "Metal Ducts: Warranty", "warranty"],
    ]);
    // Sub-paragraphs and wrapped lines stay with their paragraph; the page footer does not.
    expect(r.items[1]?.notes).toBe(
      "Spec 09 21 16: Shop Drawings: Show locations of control joints and reveals. 1. Include partition types, heights and head-of-wall details.",
    );
    expect(r.items[5]?.notes).toMatch(/including duct layout drawn with the other trades\.$/);
    // The mockup is under QUALITY ASSURANCE, not a SUBMITTALS article.
    expect(r.items.some((i) => /mock/i.test(i.title))).toBe(false);
    expect(r.skipped).toEqual([
      {
        source: "page 3",
        reason:
          'procedure, not a submittal: "Submit the following in accordance with Section 01 33 00."',
      },
    ]);
    expect(r.notes).toContain(
      "Section 01 33 00 sets the submittal procedures, so nothing was listed from it.",
    );
  });

  const lines = (...t: string[]): SpecLine[] => t.map((text) => ({ text, source: "page 1" }));

  it("takes the title from the next line and counts sections with no SUBMITTALS article", () => {
    const r = ok(
      readSpecSections(
        lines(
          "SECTION 081113",
          "HOLLOW METAL DOORS AND FRAMES",
          "PART 1 - GENERAL",
          "1.3 SUBMITTALS",
          "A. Shop Drawings: Elevations of each door type.",
          "B. Product Data: For each type of product indicated.",
          "END OF SECTION",
          "SECTION 08 71 00 - DOOR HARDWARE",
          "PART 1 - GENERAL",
          "1.1 SUMMARY",
          "A. Section includes door hardware.",
          "END OF SECTION 08 71 00",
        ),
      ),
    );
    expect(r.items.map((i) => [i.specSection, i.title])).toEqual([
      ["08 11 13", "Hollow Metal Doors and Frames: Shop Drawings"],
      ["08 11 13", "Hollow Metal Doors and Frames: Product Data"],
    ]);
    expect(r.notes).toEqual([
      "1 section has no SUBMITTALS article read (check those sections by hand).",
    ]);
  });

  it("says why when there are no sections or no submittals", () => {
    expect(readSpecSections(lines("Some text"))).toMatchObject({ ok: false });
    expect(
      readSpecSections(lines("SECTION 08 71 00 - DOOR HARDWARE", "1.1 SUMMARY", "A. Hardware.")),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/no lettered paragraphs/) });
  });

  it("joins runs on one baseline into lines", () => {
    expect(
      pageLines({
        page: 1,
        rules: [],
        runs: [
          { x0: 100, x1: 160, y: 50, size: 10, text: "Product" },
          { x0: 72, x1: 82, y: 50.5, size: 10, text: "A." },
          { x0: 163, x1: 190, y: 50, size: 10, text: "Data:" },
          { x0: 72, x1: 120, y: 64, size: 10, text: "B. Next" },
        ],
      }),
    ).toEqual(["A. Product Data:", "B. Next"]);
  });
});

describe("spec sections: federal (UFGS) lists and longer books", () => {
  const lines = (...t: string[]): SpecLine[] => t.map((text) => ({ text, source: "page 2" }));

  it("reads UFGS SD lists into rows with the approval code in the notes", () => {
    const r = readSpecSections(
      lines(
        "SECTION 09 29 00",
        "GYPSUM BOARD",
        "PART 1 GENERAL",
        "1.2 SUBMITTALS",
        'Government approval is required for submittals with a "G" classification.',
        "SD-02 Shop Drawings",
        "Control Joint Shop Drawings; G",
        "SD-03 Product Data",
        "Gypsum Board",
        "1.3 CERTIFICATIONS",
        "END OF SECTION",
      ),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.items.map((i) => [i.specSection, i.title, i.type, i.source])).toEqual([
      ["09 29 00", "Gypsum Board: Control Joint Shop Drawings", "shop_drawings", "page 2"],
      ["09 29 00", "Gypsum Board: Gypsum Board (Product Data)", "product_data", "page 2"],
    ]);
    expect(r.items[0]?.notes).toBe(
      "Spec 09 29 00: SD-02 Shop Drawings: Control Joint Shop Drawings; G",
    );
  });
});
