import { describe, expect, it } from "vitest";
import { FormFillError, fillForm, pdfTextString, readFormFields } from "./form-fill";
import { PdfName, PdfRef } from "./objects";
import { PdfReader } from "./reader";

const enc = new TextEncoder();

/**
 * A one-page form with a classic xref: text field "Name" (with a stale appearance and a sample
 * value), a parent "Row" with kids "Row.A" and "Row.B" (text), and a check box "Final" whose widget
 * is a separate kid. Returns the bytes; offsets are computed, so the xref is exact.
 */
function sampleForm(): Uint8Array {
  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Annots [5 0 R 7 0 R 8 0 R 10 0 R] >>",
    "<< /Fields [5 0 R 6 0 R 9 0 R] /DA (/Helv 0 Tf 0 g) /XFA 99 0 R >>",
    "<< /FT /Tx /T (Name) /V (Arthur R) /Subtype /Widget /Rect [0 0 100 20] /P 3 0 R /AP << /N 11 0 R >> >>",
    "<< /FT /Tx /T (Row) /Kids [7 0 R 8 0 R] >>",
    "<< /T (A) /Parent 6 0 R /Subtype /Widget /Rect [0 30 50 50] /P 3 0 R >>",
    "<< /T (B) /Parent 6 0 R /Subtype /Widget /Rect [60 30 110 50] /P 3 0 R >>",
    "<< /FT /Btn /T (Final) /V /Off /Kids [10 0 R] >>",
    "<< /Parent 9 0 R /Subtype /Widget /Rect [0 60 10 70] /P 3 0 R /AS /Off /AP << /N << /Yes 11 0 R /Off 11 0 R >> >> >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(enc.encode(body).length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefAt = enc.encode(body).length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n\r\n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return enc.encode(body);
}

describe("readFormFields", () => {
  it("lists terminal fields by fully qualified name with their values", async () => {
    const f = await readFormFields(sampleForm());
    expect([...f.keys()].sort()).toEqual(["Final", "Name", "Row.A", "Row.B"]);
    expect(f.get("Name")).toMatchObject({ kind: "text", value: "Arthur R" });
    expect(f.get("Row.A")).toMatchObject({ kind: "text", value: null });
    expect(f.get("Final")).toMatchObject({ kind: "checkbox", value: false, onState: "Yes" });
  });

  it("refuses a PDF with no form", async () => {
    const plain = enc.encode(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f\r\n0000000009 00000 n\r\n0000000058 00000 n\r\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n107\n%%EOF\n",
    );
    await expect(readFormFields(plain)).rejects.toThrow(FormFillError);
  });
});

describe("fillForm", () => {
  it("appends an update that a reader sees, leaving the original bytes in place", async () => {
    const original = sampleForm();
    const out = await fillForm(original, { "Row.A": "8", "Row.B": "Café 12", Final: true });
    expect(out.subarray(0, original.length)).toEqual(original);
    const f = await readFormFields(out);
    expect(f.get("Row.A")?.value).toBe("8");
    expect(f.get("Row.B")?.value).toBe("Café 12");
    expect(f.get("Final")?.value).toBe(true);
    // Not cleared unless asked.
    expect(f.get("Name")?.value).toBe("Arthur R");

    const r = await PdfReader.open(out);
    expect(r.wasRecovered).toBe(false);
    const root = r.dict(r.updateBase()?.trailer.get("Root"));
    const form = r.dict(root?.get("AcroForm"));
    expect(form?.get("NeedAppearances")).toBe(true);
    expect(form?.get("XFA")).toBeUndefined();
    // The check box's widget shows the on state.
    const as = r.dict(new PdfRef(10, 0))?.get("AS");
    expect(as).toBeInstanceOf(PdfName);
    expect((as as PdfName).name).toBe("Yes");
  });

  it("clears sample values when asked and drops their stale appearance", async () => {
    const out = await fillForm(sampleForm(), { "Row.A": "1" }, { clearOthers: true });
    const f = await readFormFields(out);
    expect(f.get("Name")?.value).toBe("");
    const r = await PdfReader.open(out);
    const text = new TextDecoder("latin1").decode(out.subarray(sampleForm().length));
    expect(text).toContain("5 0 obj");
    expect(r.wasRecovered).toBe(false);
    const name = r.dict(new PdfRef(5, 0));
    expect(name?.get("AP")).toBeUndefined();
  });

  it("refuses a field the form does not have, and a value of the wrong kind", async () => {
    await expect(fillForm(sampleForm(), { Nope: "x" })).rejects.toThrow(
      /does not have the field "Nope"/,
    );
    await expect(fillForm(sampleForm(), { Final: "x" })).rejects.toThrow(/check box/);
    await expect(fillForm(sampleForm(), { Name: true })).rejects.toThrow(/takes text/);
  });

  it("can be filled again (a second update chains to the first)", async () => {
    const once = await fillForm(sampleForm(), { "Row.A": "1" });
    const twice = await fillForm(once, { "Row.A": "2", Final: true });
    const f = await readFormFields(twice);
    expect(f.get("Row.A")?.value).toBe("2");
    expect(f.get("Final")?.value).toBe(true);
  });
});

describe("pdfTextString", () => {
  it("keeps ASCII as is and writes anything else as UTF-16BE with a BOM", () => {
    expect([...pdfTextString("Ab 1\n").bytes]).toEqual([65, 98, 32, 49, 10]);
    expect([...pdfTextString("é").bytes]).toEqual([0xfe, 0xff, 0x00, 0xe9]);
  });
});
