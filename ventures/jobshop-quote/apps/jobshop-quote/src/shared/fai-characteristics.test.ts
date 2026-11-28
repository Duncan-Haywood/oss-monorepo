import { describe, expect, it } from "vitest";
import { draftCharacteristics, drawingUnit, FORM3_COLUMNS, form3Csv } from "./fai-characteristics";

// An invented bracket drawing's text layer, the way a CAD export's PDF reads: title block, notes,
// and dimension text in no particular order.
const DRAWING = `TITLE: MOTOR MOUNT BRACKET
DWG NO: BRK-1001 REV B   SCALE 2:1   SHEET 1 OF 1   DATE 2026-11-28
MATERIAL: 6061-T6 ALUMINUM PER AMS-QQ-A-250/11
FINISH: BLACK ANODIZE TYPE II PER MIL-A-8625
UNLESS OTHERWISE SPECIFIED: .XX ±.01 .XXX ±.005 ANGLES ±1°
NOTES:
1. REMOVE ALL BURRS AND BREAK SHARP EDGES .010 MAX.
2. MARK PART NUMBER AND REV PER MIL-STD-130.
3.250 ±.005
4X Ø.201 +.003/-.000 THRU
Ø.500 1.0005/1.0000
POSITION ⌀.010 A B C
⏥ .002
1/4-20 UNC-2B X .50 DP 2 PL
32 RMS
45° ±1°`;

describe("draftCharacteristics", () => {
  const d = draftCharacteristics(DRAWING);
  const byReq = (s: string) => d.characteristics.filter((c) => c.requirement.includes(s));

  it("numbers every characteristic in reading order, repeats as n.1 ... n.k", () => {
    expect(d.characteristics.map((c) => [c.no, c.kind])).toEqual([
      ["1", "material"],
      ["2", "material"],
      ["3", "note"],
      ["4", "note"],
      ["5", "dimension"],
      ["6.1", "dimension"],
      ["6.2", "dimension"],
      ["6.3", "dimension"],
      ["6.4", "dimension"],
      ["7", "dimension"],
      ["8", "gdt"],
      ["9", "gdt"],
      ["10.1", "thread"],
      ["10.2", "thread"],
      ["11", "surface"],
      ["12", "dimension"],
    ]);
  });

  it("reads limits for bilateral, unequal and limit dimensions", () => {
    expect(byReq("3.250")[0]).toMatchObject({
      lower: 3.245,
      upper: 3.255,
      unit: "in",
      record: "value",
      line: 9,
    });
    expect(byReq("Ø.201")[0]).toMatchObject({
      requirement: "4X Ø.201 +.003/-.000",
      lower: 0.201,
      upper: 0.204,
    });
    expect(byReq("1.0005")[0]).toMatchObject({ lower: 1, upper: 1.0005 });
    expect(byReq("45°")[0]).toMatchObject({ lower: 44, upper: 46, unit: "°" });
  });

  it("reads geometric tolerances from 0 to the tolerance, threads and finishes", () => {
    expect(byReq("POSITION")[0]).toMatchObject({
      requirement: "POSITION ⌀.010 A B C",
      lower: 0,
      upper: 0.01,
    });
    expect(byReq("⏥")[0]).toMatchObject({ lower: 0, upper: 0.002 });
    expect(byReq("1/4-20")[0]).toMatchObject({
      requirement: "1/4-20 UNC-2B X .50 DP 2 PL",
      record: "accept/reject",
    });
    expect(byReq("32 RMS")[0]).toMatchObject({ upper: 32, unit: "µin" });
  });

  it("keeps the general tolerance block out of the list and shows it", () => {
    expect(d.general.map((g) => g.text)).toEqual([
      "UNLESS OTHERWISE SPECIFIED: .XX ±.01 .XXX ±.005 ANGLES ±1°",
    ]);
    expect(byReq(".XXX")).toEqual([]);
  });

  it("does not read dates, scales, drawing numbers or spec numbers as characteristics", () => {
    expect(byReq("2026")).toEqual([]);
    expect(byReq("SCALE")).toEqual([]);
    expect(d.characteristics.filter((c) => c.line === 2)).toEqual([]);
  });

  it("keeps a tolerance inside a note as part of the note", () => {
    expect(byReq(".010 MAX")).toHaveLength(1);
    expect(byReq(".010 MAX")[0]?.kind).toBe("note");
  });

  it("reads metric drawings: mm limits, M threads, Ra in µm", () => {
    const m = draftCharacteristics(
      "DIMENSIONS IN MM\n25 ±0,1\n12.00 +0.1 -0.05\nM6x1.0-6H\nRa 0.8\nISO 2768-m",
    );
    expect(m.characteristics.map((c) => [c.kind, c.lower, c.upper, c.unit])).toEqual([
      ["dimension", 24.9, 25.1, "mm"],
      ["dimension", 11.95, 12.1, "mm"],
      ["thread", null, null, null],
      ["surface", null, 0.8, "µm"],
    ]);
    expect(m.general).toHaveLength(1);
  });

  it("returns an empty draft for no text, and caps repeats", () => {
    expect(draftCharacteristics(null).characteristics).toEqual([]);
    expect(draftCharacteristics("").characteristics).toEqual([]);
    const many = draftCharacteristics("999X Ø.250 ±.001");
    expect(many.characteristics).toHaveLength(50);
    expect(many.characteristics.at(-1)?.no).toBe("1.50");
  });

  it("stops at the characteristic cap and says so", () => {
    const text = Array.from({ length: 600 }, (_, i) => `${i + 1}.000 ±.005`).join("\n");
    const big = draftCharacteristics(text);
    expect(big.characteristics).toHaveLength(500);
    expect(big.truncated).toBe(true);
  });
});

describe("drawingUnit", () => {
  it("defaults to inches and reads millimetres only when the drawing says so", () => {
    expect(drawingUnit("1.250 ±.005")).toBe("in");
    expect(drawingUnit("ALL DIMENSIONS IN MM")).toBe("mm");
    expect(drawingUnit("25 mm, 1 inch")).toBe("in");
  });
});

describe("form3Csv", () => {
  it("writes the header rows, the draft warning and one row per characteristic", () => {
    const csv = form3Csv(draftCharacteristics(DRAWING), {
      fileName: "BRK-1001.pdf",
      partNumber: "BRK-1001",
      revision: "B",
    });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("AS9102 Form 3 draft: characteristic accountability");
    expect(lines).toContain("Part Number,BRK-1001");
    expect(lines.some((l) => l.startsWith("Draft,"))).toBe(true);
    const head = lines.indexOf(FORM3_COLUMNS.join(","));
    expect(head).toBeGreaterThan(0);
    expect(lines.length - head - 1).toBe(16);
    expect(lines[head + 5]).toBe("5,,,3.250 ±.005,,,,Dimension,3.245,3.255,in,value,9");
  });

  it("quotes commas and defuses formula cells", () => {
    const csv = form3Csv(draftCharacteristics('NOTES:\n1. =HYPERLINK("x"), SEE SPEC'), {
      fileName: "a.pdf",
    });
    expect(csv).toContain('"Note 1: =HYPERLINK(""x""), SEE SPEC"');
    const evil = form3Csv(
      { characteristics: [], general: [], truncated: false },
      { fileName: "=cmd.pdf" },
    );
    expect(evil).toContain("Read from,'=cmd.pdf");
  });
});
