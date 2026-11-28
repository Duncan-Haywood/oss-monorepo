import { describe, expect, it } from "vitest";
import {
  draftForms,
  formsCsv,
  normSpec,
  readCode,
  readDrawingNumber,
  readForm2,
} from "./fai-forms";

const DRAWING = `DWG NO: BRK-1001 REV B
MATERIAL: 6061-T6 ALUMINUM PLATE PER AMS 4027
FINISH: ANODIZE PER MIL-A-8625 TYPE II CLASS 2, BLACK
UNLESS OTHERWISE SPECIFIED: .XXX ±.005
INTERPRET PER ASME Y14.5-2009
NOTES:
1. BREAK SHARP EDGES .010 MAX
2. FLUORESCENT PENETRANT INSPECT PER ASTM E1417 TYPE I METHOD A SENSITIVITY 2
3. PRESSURE TEST TO 300 PSI, NO LEAKS
4. TYP 4X R.03
3.250 ±.005`;

describe("normSpec", () => {
  it("writes each family one way", () => {
    expect(normSpec("ams2700")).toBe("AMS 2700");
    expect(normSpec("SAE AMS-2759/1")).toBe("AMS 2759/1");
    expect(normSpec("AMS-QQ-P-416")).toBe("AMS-QQ-P-416");
    expect(normSpec("astm-b209")).toBe("ASTM B209");
    expect(normSpec("mil-prf-8625")).toBe("MIL-PRF-8625");
  });
});

describe("readCode", () => {
  it("reads type, class and method after the spec", () => {
    expect(readCode("PER MIL-A-8625 TYPE II CLASS 2, BLACK")).toBe("Type II, Class 2");
    expect(readCode("AMS 2700 METHOD 1 TY 6")).toBe("Method 1, Type 6");
  });
  it("does not read TYP as a type", () => {
    expect(readCode("TYP 4X R.03")).toBeNull();
  });
});

describe("readDrawingNumber", () => {
  it("reads the number and revision from the title block", () => {
    expect(readDrawingNumber(DRAWING)).toEqual({ number: "BRK-1001", revision: "B" });
    expect(readDrawingNumber("DRAWING NUMBER 12-3456\nREV: C")).toEqual({
      number: "12-3456",
      revision: "C",
    });
  });
  it("does not take a word with no digit as the number", () => {
    expect(readDrawingNumber("DWG NO: SEE TITLE").number).toBeNull();
  });
});

describe("readForm2", () => {
  const { rows, standards } = readForm2(DRAWING);

  it("lists the material with its specification, not plate stock as plating", () => {
    expect(rows[0]).toMatchObject({
      kind: "material",
      name: "6061-T6 Aluminum Plate",
      spec: "AMS 4027",
      line: 2,
      check: null,
    });
    expect(rows.some((r) => r.name === "Plate")).toBe(false);
  });

  it("lists each special process with its spec and code, in drawing order", () => {
    const procs = rows.filter((r) => r.kind === "special process");
    expect(procs.map((r) => [r.name, r.spec, r.code])).toEqual([
      ["Anodize", "MIL-A-8625", "Type II, Class 2"],
      ["Penetrant inspection", "ASTM E1417", "Type I, Method A, Sensitivity 2"],
    ]);
  });

  it("lists a functional test from a note, flagging the missing procedure", () => {
    const tests = rows.filter((r) => r.kind === "functional test");
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({ name: "Pressure test", spec: null, line: 9 });
    expect(tests[0]?.check).toContain("procedure number");
  });

  it("keeps drawing standards out of Form 2", () => {
    expect(standards).toEqual(["ASME Y14.5-2009"]);
    expect(rows.some((r) => r.spec?.startsWith("ASME"))).toBe(false);
  });

  it("flags a material with no specification instead of guessing one", () => {
    const r = readForm2("MATL: 17-4 PH STAINLESS H1150").rows;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "material", spec: null });
    expect(r[0]?.check).toContain("no specification");
  });

  it("names a process from its specification's family when the line has no process word", () => {
    const r = readForm2("5. PER AMS 2700 METHOD 1\n6. HT PER AMS 2759/3").rows;
    expect(r.map((x) => [x.name, x.spec])).toEqual([
      ["Passivate", "AMS 2700"],
      ["Heat treat", "AMS 2759/3"],
    ]);
  });

  it("does not list a process word outside a call-up line", () => {
    expect(readForm2("TITLE: PLATE, MOUNTING").rows).toEqual([]);
  });
});

describe("draftForms", () => {
  const part = {
    partNumber: "BRK-1001",
    revision: "B",
    description: "Bracket, mounting",
    materialText: "6061-T6",
    finishText: "Black anodize, then passivate",
  };

  it("fills Form 1 from the part, the shop, the PO and the drawing; leaves the rest blank", () => {
    const d = draftForms({
      text: DRAWING,
      fileName: "BRK-1001.pdf",
      part,
      organizationName: "Acme Machine",
      poNumber: "PO-5521",
      quoteLabel: "Q-1042",
    });
    const f = Object.fromEntries(d.form1.map((x) => [x.label, x]));
    expect(f["Part Number"]?.value).toBe("BRK-1001");
    expect(f["Part Name"]?.value).toBe("Bracket, mounting");
    expect(f["Drawing Number"]).toMatchObject({ value: "BRK-1001", from: "drawing text" });
    expect(f["Organization Name"]?.value).toBe("Acme Machine");
    expect(f["PO Number"]).toMatchObject({ value: "PO-5521", from: "won quote Q-1042" });
    expect(f["Serial Number"]?.value).toBe("");
    expect(f["Supplier Code"]?.value).toBe("");
  });

  it("adds an RFQ finish the drawing did not call up, and numbers the rows", () => {
    const d = draftForms({ text: DRAWING, fileName: "BRK-1001.pdf", part });
    expect(d.form2.map((r) => r.no)).toEqual(d.form2.map((_, i) => i + 1));
    const pass = d.form2.find((r) => r.name === "Passivate");
    expect(pass).toMatchObject({ line: null, spec: null });
    expect(pass?.source).toContain("RFQ part finish");
    // Anodize is already on the drawing: not listed twice.
    expect(d.form2.filter((r) => r.name === "Anodize")).toHaveLength(1);
    // The drawing has a material row, so the RFQ's material is not added.
    expect(d.form2.filter((r) => r.kind === "material")).toHaveLength(1);
  });

  it("uses the RFQ's material when the drawing has none", () => {
    const d = draftForms({ text: "3.250 ±.005", fileName: "x.pdf", part });
    expect(d.form2[0]).toMatchObject({ kind: "material", spec: null, line: null });
    const f = Object.fromEntries(d.form1.map((x) => [x.label, x]));
    expect(f["PO Number"]?.value).toBe("");
    expect(f["Drawing Number"]).toMatchObject({ value: "BRK-1001", from: "RFQ part number" });
  });

  it("writes one CSV with Form 1's fields and Form 2's two tables, formulas defused", () => {
    const d = draftForms({
      text: `${DRAWING}\n=HYPERLINK("x")`,
      fileName: "BRK-1001.pdf",
      part: { ...part, description: "=cmd" },
    });
    const csv = formsCsv(d, "BRK-1001.pdf");
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[0]).toBe("AS9102 Forms 1 and 2 draft");
    expect(rows).toContain("Part Name,'=cmd,RFQ part description");
    expect(rows).toContain("Drawing standards (not Form 2 rows),ASME Y14.5-2009");
    const head = rows.indexOf(
      "No.,Material or Process Name,Specification Number,Code,Special Process Supplier Code,Customer Approval Verification,Certificate of Conformance Number,Type,From,Drawing Text Line,Check",
    );
    expect(head).toBeGreaterThan(0);
    expect(rows[head + 1]).toBe(
      "1,6061-T6 Aluminum Plate,AMS 4027,,,,,Material,MATERIAL: 6061-T6 ALUMINUM PLATE PER AMS 4027,2,",
    );
    expect(rows.some((r) => r.startsWith("Form 2: functional testing"))).toBe(true);
  });
});
