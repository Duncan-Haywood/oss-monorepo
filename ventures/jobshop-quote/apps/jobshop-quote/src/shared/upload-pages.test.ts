// The New RFQ form's page count must match what the worker charges (services/billing.ts,
// `rfqPackage`): the same files give the same pages and units on both sides.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countPackage, type PendingUpload, uploadMimeType } from "./upload-pages";

const fixture = (name: string) =>
  readFileSync(new URL(`../../test/fixtures/pdf/${name}`, import.meta.url));

function upload(name: string, type: string, data: Uint8Array | string = "x"): PendingUpload {
  const buf = typeof data === "string" ? Buffer.from(data, "latin1") : Buffer.from(data);
  return {
    name,
    type,
    bytes: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

describe("uploadMimeType", () => {
  it("keeps the browser's type and falls back to the name", () => {
    expect(uploadMimeType("a.pdf", "application/pdf; charset=binary")).toBe("application/pdf");
    expect(uploadMimeType("A.PDF", "")).toBe("application/pdf");
    expect(uploadMimeType("a.pdf", "application/octet-stream")).toBe("application/pdf");
    expect(uploadMimeType("notes.txt", "")).toBe("text/plain");
    expect(uploadMimeType("part.step", "")).toBe("application/octet-stream");
  });

  it("calls a .pdf file a PDF whatever type the sender put on it", () => {
    // Older mail clients and some browsers label PDFs application/x-pdf or application/acrobat; a
    // client can send any type it likes. The page count, and so the allowance, must not depend on it.
    for (const type of ["application/x-pdf", "application/acrobat", "text/plain", "image/png"]) {
      expect(uploadMimeType("drawings.pdf", type), type).toBe("application/pdf");
    }
    for (const type of [
      "application/x-pdf",
      "application/acrobat",
      "application/vnd.pdf",
      "text/pdf",
    ]) {
      expect(uploadMimeType("drawings", type), type).toBe("application/pdf");
    }
  });
});

describe("countPackage", () => {
  it("counts no files as one RFQ (the pasted email)", async () => {
    expect(await countPackage([])).toEqual({ pages: 0, units: 1 });
  });

  it("counts real PDFs by their page tree: 12 + 15 pages is 3 RFQs", async () => {
    const pkg = await countPackage([
      upload("set.pdf", "application/pdf", fixture("drawings-12-chrome.pdf")),
      upload("sheets.pdf", "", fixture("sheets-15-libreoffice.pdf")),
    ]);
    expect(pkg).toEqual({ pages: 27, units: 3 });
  });

  it("counts images one page each and text and CAD none, without reading them", async () => {
    let reads = 0;
    const counted = (u: PendingUpload): PendingUpload => ({
      ...u,
      bytes: () => {
        reads++;
        return u.bytes();
      },
    });
    const pkg = await countPackage([
      counted(upload("photo.jpg", "image/jpeg")),
      counted(upload("scan.png", "image/png")),
      counted(upload("notes.txt", "text/plain")),
      counted(upload("part.step", "")),
      counted(upload("flat.dxf", "application/dxf")),
    ]);
    expect(pkg).toEqual({ pages: 2, units: 1 });
    expect(reads).toBe(0);
  });

  it("counts a mislabelled PDF by its page tree, not as zero pages", async () => {
    const pkg = await countPackage([
      upload("set.pdf", "application/x-pdf", fixture("drawings-12-chrome.pdf")),
      upload("sheets.pdf", "text/plain", fixture("sheets-15-libreoffice.pdf")),
    ]);
    expect(pkg).toEqual({ pages: 27, units: 3 });
  });

  it("counts an unreadable PDF, or one whose bytes cannot be read, as one page", async () => {
    const broken = upload("broken.pdf", "application/pdf", "not a pdf at all");
    const failing: PendingUpload = {
      name: "gone.pdf",
      type: "application/pdf",
      bytes: () => Promise.reject(new Error("file removed")),
    };
    expect(await countPackage([broken, failing])).toEqual({ pages: 2, units: 1 });
  });
});
