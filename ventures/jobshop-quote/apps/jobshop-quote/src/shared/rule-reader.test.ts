import { describe, expect, it } from "vitest";
import { DRAWING_TEXT, RFQ_EMAIL } from "../../test/fixtures/rfq";
import { verifyExtraction } from "./extraction";
import { readRfqByRules } from "./rule-reader";

/** Read by rules, then through the same anti-fabrication check the AI's answer goes through. */
const read = (text: string) => {
  const raw = readRfqByRules(text);
  return { raw, v: verifyExtraction(raw, text) };
};

describe("readRfqByRules", () => {
  it("reads a labelled RFQ email, and every value survives verification", () => {
    const { v } = read(RFQ_EMAIL);
    expect(v.warnings).toEqual([]);
    expect(v.customer).toEqual({
      company: "Example Robotics LLC",
      contactName: "Dana Ortiz",
      email: "dana.ortiz@example-robotics.test",
    });
    expect(v.parts).toHaveLength(2);
    expect(v.parts[0]).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      description: "Motor mount bracket",
      materialText: "6061-T6 aluminum plate",
      quantities: [10, 50, 100],
      tolerances: "+/- .005 unless noted",
      finishText: "Black anodize Type II",
      dueDate: "2026-12-18",
    });
    expect(v.parts[1]).toMatchObject({
      partNumber: "SPC-220",
      materialText: "303 stainless bar",
      quantities: [250],
      finishText: "Passivate",
    });
  });

  it("does not lend one part's material to the next part", () => {
    const text = `Part number: A-100\nMaterial: 6061-T6\nQty: 5\n\nPart number: B-200\nQty: 8`;
    const { raw, v } = read(text);
    expect(v.parts[1]?.materialText).toBeNull();
    expect(raw.missingInfo).toEqual(["Material for B-200"]);
  });

  it("applies a material stated above the list to every part", () => {
    const text = `All parts in 304 stainless.\nMaterial: 304 stainless\n\nP/N: A-100\nQty: 5\n\nP/N: B-200\nQty 8`;
    const { v } = read(text);
    expect(v.parts.map((p) => p.materialText)).toEqual(["304 stainless", "304 stainless"]);
    expect(v.parts.map((p) => p.quantities)).toEqual([[5], [8]]);
  });

  it("reads a table pasted from Excel (tab-separated)", () => {
    const text = [
      "Please quote the following:",
      "Part Number\tRev\tDescription\tMaterial\tQty",
      "BRK-1001\tB\tMotor mount bracket\t6061-T6\t10",
      "SPC-220\tA\tSpacer\t303 SS\t250",
      "",
      "Need by 2026-12-18",
    ].join("\n");
    const { v } = read(text);
    expect(v.warnings).toEqual([]);
    expect(v.parts).toHaveLength(2);
    expect(v.parts[0]).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      description: "Motor mount bracket",
      materialText: "6061-T6",
      quantities: [10],
      dueDate: "2026-12-18",
    });
    expect(v.parts[1]).toMatchObject({ partNumber: "SPC-220", quantities: [250] });
    expect(v.parts[1]?.sources.partNumber?.quote).toBe("SPC-220\tA\tSpacer\t303 SS\t250");
  });

  it("reads a Markdown pipe table, as a converted PDF gives it", () => {
    const text = [
      "| P/N | Description | Qty | Finish |",
      "| --- | --- | --- | --- |",
      "| 12-3456-01 | Shaft, 1.00 dia | 25, 50 | Black oxide |",
      "| 12-3457-01 | Collar | 100 | |",
    ].join("\n");
    const { v } = read(text);
    expect(v.warnings).toEqual([]);
    expect(v.parts.map((p) => p.partNumber)).toEqual(["12-3456-01", "12-3457-01"]);
    expect(v.parts[0]).toMatchObject({ quantities: [25, 50], finishText: "Black oxide" });
    expect(v.parts[1]?.finishText).toBeNull();
  });

  it("reads columns lined up with spaces only when every cell is there", () => {
    const text = [
      "PART NO      DESCRIPTION        QTY",
      "A-100        Bracket            12",
      "B-200        Plate",
    ].join("\n");
    const { v } = read(text);
    expect(v.parts).toHaveLength(1);
    expect(v.parts[0]).toMatchObject({ partNumber: "A-100", quantities: [12] });
  });

  it('reads "25 pcs of BRK-1001 Rev B" in a sentence', () => {
    const { v } = read("Hi Sam,\nPlease quote 25 pcs of BRK-1001 Rev B, due 12/18/2026.\nThanks");
    expect(v.warnings).toEqual([]);
    expect(v.parts[0]).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      quantities: [25],
      dueDate: "2026-12-18",
    });
  });

  it("fills a part's blanks from the drawing that carries its number", () => {
    const text = `Part number: BRK-1001\nQty: 10\n\n--- Attachment: brk-1001.pdf ---\n${DRAWING_TEXT}`;
    const { v } = read(text);
    expect(v.warnings).toEqual([]);
    expect(v.parts).toHaveLength(1);
    expect(v.parts[0]).toMatchObject({
      partNumber: "BRK-1001",
      materialText: "6061-T6 ALUMINUM",
      finishText: "BLACK ANODIZE TYPE II PER MIL-A-8625",
      tolerances: ".XXX +/- .005",
      quantities: [10],
    });
  });

  it("leaves out a forecast and a year that are not quantities", () => {
    const { v } = read("Part number: A-100\nQty: 50, 100 (EAU 1,200)\nDue 2027-01-15");
    expect(v.parts[0]?.quantities).toEqual([50, 100]);
    expect(v.parts[0]?.dueDate).toBe("2027-01-15");
  });

  it('reads quantity breaks written "10/25/50" in a labelled line and in a table', () => {
    const labelled = read("Part number: BRK-1001 Rev B\nQty: 10/25/50\nMaterial: 6061-T6");
    expect(labelled.v.warnings).toEqual([]);
    expect(labelled.v.parts[0]?.quantities).toEqual([10, 25, 50]);
    const table = read("Part No\tQty\tMaterial\nBRK-1001\t100/250/500\t304 SS\nSPC-220\t25\t1018");
    expect(table.v.warnings).toEqual([]);
    expect(table.v.parts.map((p) => p.quantities)).toEqual([[100, 250, 500], [25]]);
    // A date written the same way is not a quantity list.
    const dated = read("Part number: A-100\nQty: 40\nNeed by 1/15/2027");
    expect(dated.v.parts[0]?.quantities).toEqual([40]);
    expect(dated.v.parts[0]?.dueDate).toBe("2027-01-15");
  });

  it("guesses nothing: a date without a year and an unlabelled material stay blank", () => {
    const { raw, v } = read("Part number: A-100\nMade from aluminum\nQty: 4\nNeed by Dec 18");
    expect(v.parts[0]?.materialText).toBeNull();
    expect(v.parts[0]?.dueDate).toBeNull();
    expect(raw.missingInfo).toEqual(["Material for A-100"]);
  });

  it('does not take "Part: the bracket below" as a part number', () => {
    const { v } = read("Part: the bracket below\nQty: 3\nMaterial: 1018 steel");
    expect(v.parts).toHaveLength(1);
    expect(v.parts[0]?.partNumber).toBeNull();
    expect(v.parts[0]).toMatchObject({ quantities: [3], materialText: "1018 steel" });
  });

  it("reads a numbered list with one part per line, and the lines below it for every part", () => {
    const text = [
      "Please quote the following parts:",
      "",
      "1) 4410-0021 Rev C - Mounting Bracket, 6061-T6 Aluminum, Qty 50 / 100 / 250",
      "2) 4410-0022 Rev A - Spacer, 304 SS, Qty 200",
      "3) 4410-0035 Rev B - Cover Plate, 5052-H32, Qty 25, 50",
      "",
      "Finish: Clear anodize per MIL-A-8625 Type II",
      "Need by 01/15/2027",
    ].join("\n");
    const { raw, v } = read(text);
    expect(v.warnings).toEqual([]);
    expect(v.parts.map((p) => [p.partNumber, p.revision, p.quantities])).toEqual([
      ["4410-0021", "C", [50, 100, 250]],
      ["4410-0022", "A", [200]],
      ["4410-0035", "B", [25, 50]],
    ]);
    expect(v.parts[0]?.description).toBe("Mounting Bracket, 6061-T6 Aluminum");
    expect(v.parts.every((p) => p.finishText === "Clear anodize per MIL-A-8625 Type II")).toBe(
      true,
    );
    expect(v.parts.every((p) => p.dueDate === "2027-01-15")).toBe(true);
    // The material sits in free text, not a labelled line: it is asked for, not guessed.
    expect(v.parts.every((p) => p.materialText === null)).toBe(true);
    expect(raw.missingInfo).toContain("Material for 4410-0021");
  });

  it('reads bulleted "PN 30311 rev B, qty 12" lines with no colon after the label', () => {
    const { v } = read(
      "Quote request\n\n- PN 30311 rev B, qty 12\n- PN 30312 rev B, qty 12\nMaterial: 4140 HT",
    );
    expect(v.warnings).toEqual([]);
    expect(v.parts.map((p) => [p.partNumber, p.revision, p.quantities, p.materialText])).toEqual([
      ["30311", "B", [12], "4140 HT"],
      ["30312", "B", [12], "4140 HT"],
    ]);
  });

  it("keeps a line indented under a list item with that item", () => {
    const text =
      "1) A-100 Rev B, Qty 5\n   Material: 6061-T6\n2) B-200 Rev A, Qty 8\nMaterial: 1018";
    const { v } = read(text);
    expect(v.parts.map((p) => p.materialText)).toEqual(["6061-T6", "1018"]);
  });

  it("does not take a count, a date or a note in a list for a part", () => {
    const text = [
      "Part number: A-100",
      "Qty: 5",
      "Notes:",
      "- 1000 pcs per year expected",
      "1) M6x1.0 tapped holes, qty 4 per part",
      "2) 2027-01-15 delivery, qty as above",
      "3. Please confirm lead time",
    ].join("\n");
    const { v } = read(text);
    expect(v.parts.map((p) => p.partNumber)).toEqual(["A-100"]);
  });

  it('gives each part its own count when one line names two: "50 pcs of A-1001 and 100 pcs of A-1002"', () => {
    const { v } = read("Can you quote 50 pcs of A-1001 rev C and 100 pcs of A-1002 rev A?");
    expect(v.warnings).toEqual([]);
    expect(v.parts.map((p) => [p.partNumber, p.revision, p.quantities])).toEqual([
      ["A-1001", "C", [50]],
      ["A-1002", "A", [100]],
    ]);
  });

  it('reads a purchasing export\'s "Item" column as the part, and "Req Date" as the due date', () => {
    const tabs = read(
      "Line\tItem\tRev\tDescription\tQty\tUOM\tReq Date\n1\tBRK-2201\tC\tBRACKET, MOTOR\t100\tEA\t12/18/2026",
    );
    expect(tabs.v.warnings).toEqual([]);
    expect(tabs.v.parts[0]).toMatchObject({
      partNumber: "BRK-2201",
      revision: "C",
      quantities: [100],
      dueDate: "2026-12-18",
    });
    // With a part number column too, "Item" is the line number and is left alone.
    const both = read("Item\tPart No\tQty\n1\tBRK-2201\t100\n2\tSHF-0090\t40");
    expect(both.v.parts.map((p) => [p.partNumber, p.quantities])).toEqual([
      ["BRK-2201", [100]],
      ["SHF-0090", [40]],
    ]);
  });

  it("returns no parts for text with nothing to read", () => {
    const { raw } = read("Hello, can you call me about a job? Thanks");
    expect(raw.parts).toEqual([]);
  });
});
