import { makeFormPdf } from "@test/unit/form-fixture";
import { describe, expect, it } from "vitest";
import {
  decodeTextString,
  encodeTextString,
  FormFillError,
  fillForm,
  readFormFields,
} from "./form-fill";
import { PdfReader, PdfUnreadable } from "./reader";

const fields = [
  { name: "Contractor Name", kind: "text" as const, maxLen: 30, value: "Old Name" },
  { name: "1 Other .0.1.0", kind: "text" as const },
  { name: "1 Other 0.2.0", kind: "text" as const },
  { name: "Subcontractor", kind: "checkbox" as const, on: "On", value: "On" },
  { name: "NoWorkWeek", kind: "checkbox" as const },
];

describe("readFormFields", () => {
  it("reads nested field names, kinds, limits, values and check box states", async () => {
    const f = await readFormFields(makeFormPdf(fields));
    expect([...f.keys()].sort()).toEqual(
      ["1 Other .0.1.0", "1 Other 0.2.0", "Contractor Name", "NoWorkWeek", "Subcontractor"].sort(),
    );
    expect(f.get("Contractor Name")).toMatchObject({ kind: "text", maxLen: 30, value: "Old Name" });
    expect(f.get("Subcontractor")).toMatchObject({ kind: "checkbox", onState: "On", value: "On" });
    expect(f.get("NoWorkWeek")).toMatchObject({ kind: "checkbox", onState: "Yes", value: "" });
  });

  it("refuses a PDF with no form", async () => {
    const plain = makeFormPdf([]);
    await expect(readFormFields(plain)).rejects.toBeInstanceOf(PdfUnreadable);
  });
});

describe("fillForm", () => {
  for (const xrefStream of [false, true]) {
    it(`fills text and check boxes as an incremental update (${xrefStream ? "xref stream" : "xref table"})`, async () => {
      const before = makeFormPdf(fields, { xrefStream });
      const after = await fillForm(before, {
        "Contractor Name": "Garden State Electric (NJ) LLC",
        "1 Other .0.1.0": "12.50",
        Subcontractor: false,
        NoWorkWeek: true,
      });
      // The original bytes are kept and the update follows them.
      expect(after.subarray(0, before.length)).toEqual(before);
      const f = await readFormFields(after);
      expect(f.get("Contractor Name")?.value).toBe("Garden State Electric (NJ) LLC");
      expect(f.get("1 Other .0.1.0")?.value).toBe("12.50");
      expect(f.get("1 Other 0.2.0")?.value).toBe("");
      expect(f.get("Subcontractor")?.value).toBe("Off");
      expect(f.get("NoWorkWeek")?.value).toBe("Yes");
      // A fresh read takes the new objects (newest xref wins), not a recovery scan.
      const r = await PdfReader.open(after);
      expect(r.wasRecovered).toBe(false);
      const text = new TextDecoder("latin1").decode(after.subarray(before.length));
      expect(text).toContain("/NeedAppearances true");
      expect(text).toContain("(Garden State Electric \\(NJ\\) LLC) Tj");
      expect(text).toMatch(/\/AS \/Yes/);
    });
  }

  it("fills twice: the second update chains to the first", async () => {
    const once = await fillForm(makeFormPdf(fields), { "Contractor Name": "First" });
    const twice = await fillForm(once, { "Contractor Name": "Second" });
    expect((await readFormFields(twice)).get("Contractor Name")?.value).toBe("Second");
  });

  it("refuses an unknown field, a value of the wrong kind and one past MaxLen", async () => {
    const pdf = makeFormPdf(fields);
    await expect(fillForm(pdf, { Nope: "x" })).rejects.toBeInstanceOf(FormFillError);
    await expect(fillForm(pdf, { Subcontractor: "x" })).rejects.toBeInstanceOf(FormFillError);
    await expect(fillForm(pdf, { "Contractor Name": true })).rejects.toBeInstanceOf(FormFillError);
    await expect(fillForm(pdf, { "Contractor Name": "x".repeat(31) })).rejects.toThrow(
      /at most 30/,
    );
  });
});

describe("text strings", () => {
  it("round-trips Latin-1 and other text", () => {
    for (const s of ["Muñoz, José", "Ł. Kowalski", "plain"]) {
      expect(decodeTextString(encodeTextString(s))).toBe(s);
    }
    expect(encodeTextString("Ł")[0]).toBe(0xfe);
  });
});
