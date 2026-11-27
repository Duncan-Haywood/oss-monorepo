// The offline converter's PDF text reader: real files printed by Chromium, LibreOffice and pdfunite
// (test/fixtures/pdf, subset fonts read through their ToUnicode maps), a synthetic drawing whose title
// block is a form XObject, and the files it must read as empty or refuse.
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { drawingPdf } from "../../test/fixtures/drawing-pdf";
import { countPdfPages } from "./pdf-pages";
import { extractPdfText } from "./pdf-text";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/pdf/${name}`, import.meta.url)));
const bytes = (s: string | Buffer) =>
  new Uint8Array(typeof s === "string" ? Buffer.from(s, "latin1") : s);

/** A one-page PDF whose page content is `content` (uncompressed) with font F1 = `font`. */
function onePage(content: string, font: string, extra = "") {
  return bytes(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
      `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n` +
      `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n` +
      `5 0 obj\n${font}\nendobj\n${extra}%%EOF\n`,
  );
}
const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

describe("extractPdfText", () => {
  it("reads Chromium's subset fonts through ToUnicode, a word kerned into two runs kept whole", async () => {
    expect(await extractPdfText(fixture("drawing-1-chrome.pdf"))).toBe("SHEET 1 OF 1 BRK-1001");
    const twelve = await extractPdfText(fixture("drawings-12-chrome.pdf"));
    expect(twelve?.split("\n\n")).toHaveLength(12);
    // Chromium writes "11" as two runs with a move between them; no space goes in.
    expect(twelve).toContain("SHEET 11 OF 12 BRK-1001");
  });

  it("reads every page of a LibreOffice file (content streams with indirect /Length)", async () => {
    // Page 15 is blank (LibreOffice's trailing page break; poppler's pdftotext reads it empty too).
    const text = await extractPdfText(fixture("sheets-15-libreoffice.pdf"));
    expect(text?.split("\n\n")).toEqual(Array.from({ length: 14 }, (_, i) => `SHEET ${i + 1}`));
  });

  it("follows the page tree in order across a pdfunite merge", async () => {
    const pages = (await extractPdfText(fixture("united-15-pdfunite.pdf")))?.split("\n\n") ?? [];
    expect(pages).toHaveLength(15);
    expect(pages[0]).toBe("SHEET 1 OF 3 BRK-1001");
    expect(pages[3]).toBe("SHEET 1 OF 12 BRK-1001");
    expect(pages[14]).toBe("SHEET 12 OF 12 BRK-1001");
  });

  it("reads a drawing's notes and its title block drawn as a form XObject, one line per row", async () => {
    const pdf = drawingPdf({
      titleBlock: [
        "TITLE: MOTOR MOUNT BRACKET",
        "DWG NO: BRK-1001 REV B",
        "MATERIAL: 6061-T6 (AL)",
      ],
      notes: ["1. BREAK ALL SHARP EDGES", "2. FINISH: BLACK ANODIZE TYPE II"],
    });
    expect(await countPdfPages(bytes(pdf))).toBe(1);
    expect(await extractPdfText(bytes(pdf))).toBe(
      [
        "NOTES:",
        "1. BREAK ALL SHARP EDGES",
        "2. FINISH: BLACK ANODIZE TYPE II",
        "TITLE: MOTOR MOUNT BRACKET",
        "DWG NO: BRK-1001 REV B",
        "MATERIAL: 6061-T6 (AL)",
      ].join("\n"),
    );
  });

  it("decodes string escapes, TJ word gaps, ' and \" operators and a new Tm baseline", async () => {
    const content = [
      "BT /F1 10 Tf 1 0 0 1 50 700 Tm (Tol \\(typ\\) \\261.005) Tj ET",
      "BT /F1 10 Tf 1 0 0 1 50 680 Tm [(QTY)-400(50)] TJ (next) ' 0 0 (last) \" ET",
      "BT /F1 10 Tf 1 0 0 1 50 660 Tm [(SPC-)20(220)] TJ ET",
    ].join("\n");
    expect(await extractPdfText(onePage(content, HELVETICA))).toBe(
      "Tol (typ) ±.005\nQTY 50\nnext\nlast\nSPC-220",
    );
  });

  it("reads a page stored in a compressed object stream", async () => {
    const content = "BT /F1 9 Tf 40 40 Td (MATERIAL: 303 SS) Tj ET";
    const inner = `<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> ${HELVETICA}`;
    const header = `3 0 5 ${inner.indexOf(HELVETICA)} `;
    const data = deflateSync(Buffer.from(header + inner, "latin1"));
    const pdf = Buffer.concat([
      Buffer.from(
        `%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
          `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
          `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n` +
          `7 0 obj\n<< /Type /ObjStm /N 2 /First ${header.length} /Filter /FlateDecode /Length ${data.length} >>\nstream\n`,
        "latin1",
      ),
      data,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]);
    expect(await extractPdfText(bytes(pdf))).toBe("MATERIAL: 303 SS");
  });

  it("reads nothing it cannot decode: a scan, Identity-H without ToUnicode, an unknown filter", async () => {
    // A scanned sheet: one image, no text operators.
    const scan = onePage("q 612 0 0 792 0 0 cm /Im1 Do Q", HELVETICA);
    expect(await extractPdfText(scan)).toBe("");
    // Glyph ids with no map to text are not text.
    const cid = onePage(
      "BT /F1 10 Tf 50 700 Td <00360037> Tj ET",
      "<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H >>",
    );
    expect(await extractPdfText(cid)).toBe("");
    const lzw = bytes(
      `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
        `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n` +
        `4 0 obj\n<< /Length 5 /Filter /LZWDecode >>\nstream\n\x80\x0b\x60\x50\x22\nendstream\nendobj\n%%EOF\n`,
    );
    expect(await extractPdfText(lzw)).toBe("");
  });

  it("reads an encrypted file as empty and refuses bytes that are not a PDF", async () => {
    const enc = onePage(
      "BT /F1 10 Tf 50 700 Td (secret) Tj ET",
      HELVETICA,
      "trailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n",
    );
    expect(await extractPdfText(enc)).toBe("");
    expect(await extractPdfText(bytes("TITLE: MOTOR MOUNT BRACKET"))).toBeNull();
  });

  it("skips inline image data and marked-content dictionaries", async () => {
    const content =
      "/Span << /ActualText (x) >> BDC BT /F1 10 Tf 50 700 Td (A) Tj ET EMC\n" +
      "BI /W 2 /H 1 /BPC 8 /CS /G ID \x28\x29 EI\n" +
      "BT /F1 10 Tf 50 680 Td (B) Tj ET";
    expect(await extractPdfText(onePage(content, HELVETICA))).toBe("A\nB");
  });
});
