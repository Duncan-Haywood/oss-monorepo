// Page counting for the "an RFQ counts once per 10 drawing pages" rule. Real files printed by
// Chromium, LibreOffice and pdfunite (test/fixtures/pdf, page counts checked with poppler's
// pdfinfo), plus small hand-built files for object streams, incremental updates and broken input.
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { countPdfPages, filePages, rfqUnitsForPages, scanPageTree } from "./pdf-pages";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../test/fixtures/pdf/${name}`, import.meta.url)));
const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));

/** A minimal uncompressed PDF with `n` pages under one root. */
function plainPdf(n: number) {
  const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`).join(" ");
  let body = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  body += `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`;
  for (let i = 0; i < n; i++) {
    body += `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`;
  }
  return `${body}trailer\n<< /Root 1 0 R >>\n%%EOF\n`;
}

describe("countPdfPages", () => {
  it.each([
    ["drawing-1-chrome.pdf", 1],
    ["drawings-12-chrome.pdf", 12],
    ["sheets-15-libreoffice.pdf", 15],
    ["united-15-pdfunite.pdf", 15],
  ])("%s has %i pages", async (name, pages) => {
    expect(await countPdfPages(fixture(name))).toBe(pages);
  });

  it("reads a nested page tree by its root's /Count, not its branches", async () => {
    const pdf = `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 25 >> endobj
3 0 obj << /Type /Pages /Parent 2 0 R /Kids [] /Count 20 >> endobj
4 0 obj << /Type /Pages /Parent 2 0 R /Kids [] /Count 5 >> endobj
%%EOF`;
    expect(await countPdfPages(bytes(pdf))).toBe(25);
  });

  it("reads the page tree inside a compressed object stream (PDF 1.5+)", async () => {
    const objects =
      "<< /Type /Pages /Kids [10 0 R 11 0 R 12 0 R] /Count 3 >> " +
      "<< /Type /Page /Parent 5 0 R >> << /Type /Page /Parent 5 0 R >> << /Type /Page /Parent 5 0 R >>";
    const data = deflateSync(Buffer.from(objects, "latin1"));
    const head = bytes(
      `%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 5 0 R >>\nendobj\n` +
        `7 0 obj\n<< /Type /ObjStm /N 4 /First 20 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`,
    );
    const pdf = concat(head, data, bytes("\nendstream\nendobj\n%%EOF\n"));
    expect(await countPdfPages(pdf)).toBe(3);
  });

  it("uses the newest root after an incremental update (a page deleted and saved again)", async () => {
    const first = plainPdf(4);
    const update = `2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n%%EOF\n`;
    expect(await countPdfPages(bytes(first + update))).toBe(3);
  });

  it("falls back to counting page leaves when the root has no /Count", async () => {
    const pdf = plainPdf(3).replace("/Count 3", "");
    expect(await countPdfPages(bytes(pdf))).toBe(3);
  });

  it("never guesses: not a PDF, no page tree, a corrupt object stream, an absurd count", async () => {
    expect(await countPdfPages(bytes("hello, this is a text file"))).toBeNull();
    expect(
      await countPdfPages(bytes("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n")),
    ).toBeNull();
    const junk = bytes(
      "%PDF-1.5\n7 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length 8 >>\nstream\nnotflate\nendstream\nendobj\n",
    );
    expect(await countPdfPages(junk)).toBeNull();
    expect(
      await countPdfPages(bytes(plainPdf(1).replace("/Count 1", "/Count 9999999"))),
    ).toBeNull();
  });

  it("does not read /Count from a neighbouring object or a /Type /PageLabel", () => {
    const scan = scanPageTree(
      "<< /Type /PageLabels /Nums [] >> << /Type /Pages /Kids [] >> << /Type /Outlines /Count 40 >>",
    );
    expect(scan.roots).toEqual([]);
    expect(scan.leaves).toBe(0);
  });
});

describe("RFQ units", () => {
  it("counts once per 10 pages, at least once", () => {
    expect([0, 1, 10, 11, 20, 21, 95].map(rfqUnitsForPages)).toEqual([1, 1, 1, 2, 2, 3, 10]);
  });

  it("PDFs count their pages (one when unreadable), images one, text and CAD none", () => {
    const pdf = { mimeType: "application/pdf", isCad: false };
    expect(filePages({ ...pdf, pageCount: 14 })).toBe(14);
    expect(filePages({ ...pdf, pageCount: null })).toBe(1);
    expect(filePages({ mimeType: "image/png", pageCount: null, isCad: false })).toBe(1);
    expect(filePages({ mimeType: "text/plain", pageCount: null, isCad: false })).toBe(0);
    expect(filePages({ mimeType: "application/octet-stream", pageCount: null, isCad: true })).toBe(
      0,
    );
  });
});
