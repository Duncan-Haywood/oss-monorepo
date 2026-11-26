import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  contentMismatchReason,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  resolveMimeType,
  titleFromFilename,
  zipBombReason,
} from "./files";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ascii = (s: string) => new TextEncoder().encode(s);

/** Minimal ZIP: one stored local entry + central directory declaring `uncompressed` bytes per entry. */
function zip(entries: number, uncompressed: number): Uint8Array {
  const local = [0x50, 0x4b, 0x03, 0x04, ...new Array(26).fill(0)];
  const cd: number[] = [];
  for (let i = 0; i < entries; i++) {
    const h = new Uint8Array(46);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint32(24, uncompressed, true);
    cd.push(...h);
  }
  const eocd = new Uint8Array(22);
  const v = new DataView(eocd.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries, true);
  v.setUint16(10, entries, true);
  v.setUint32(12, cd.length, true);
  v.setUint32(16, local.length, true);
  return new Uint8Array([...local, ...cd, ...eocd]);
}

describe("resolveMimeType", () => {
  it("accepts allowlisted types and aliases", () => {
    expect(resolveMimeType("application/pdf", "a.pdf")).toBe("application/pdf");
    expect(resolveMimeType("text/plain; charset=utf-8", "a.txt")).toBe("text/plain");
    expect(resolveMimeType("image/jpg", "a.jpg")).toBe("image/jpeg");
    expect(resolveMimeType("text/rtf", "a.rtf")).toBe("application/rtf");
  });
  it("falls back to the extension for generic declared types", () => {
    expect(resolveMimeType("", "notes.md")).toBe("text/markdown");
    expect(resolveMimeType("application/octet-stream", "budget.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(resolveMimeType("text/plain", "data.csv")).toBe("text/csv");
  });
  it("rejects anything else", () => {
    expect(resolveMimeType("application/x-msdownload", "setup.exe")).toBeNull();
    expect(resolveMimeType("", "archive.zip")).toBeNull();
    expect(resolveMimeType("image/svg+xml", "logo.svg")).toBeNull();
  });
});

describe("filenames", () => {
  it("derives a title from the filename", () => {
    expect(titleFromFilename("2024_annual_report.pdf")).toBe("2024 annual report");
    expect(titleFromFilename("C:\\Users\\me\\Mission.docx")).toBe("Mission");
  });
  it("builds a safe Content-Disposition", () => {
    const cd = contentDisposition('../../etc/pa"ss\r\nwd', "text/plain");
    expect(cd).toMatch(/^attachment; filename="[\w.\- ()]+\.txt"; filename\*=UTF-8''/);
    expect(cd).not.toMatch(/[\r\n]/);
    expect(contentDisposition("Informe año.pdf", "application/pdf")).toContain(
      "filename*=UTF-8''Informe%20a%C3%B1o.pdf",
    );
  });
});

describe("contentMismatchReason (magic bytes)", () => {
  it("accepts files whose bytes match their type", () => {
    expect(contentMismatchReason("application/pdf", ascii("%PDF-1.7\n..."))).toBeNull();
    expect(
      contentMismatchReason(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0]),
      ),
    ).toBeNull();
    expect(
      contentMismatchReason("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
    ).toBeNull();
    expect(contentMismatchReason(DOCX, zip(3, 1000))).toBeNull();
    expect(contentMismatchReason("text/markdown", ascii("# Mission\nWe serve."))).toBeNull();
  });

  it("rejects HTML/script disguised as PDF, DOCX or images, and binaries posing as text", () => {
    const html = ascii("<html><script>alert(document.cookie)</script></html>");
    expect(contentMismatchReason("application/pdf", html)).toMatch(/not a valid PDF/);
    expect(contentMismatchReason(DOCX, html)).toMatch(/not a valid Office/);
    expect(contentMismatchReason("image/png", html)).toMatch(/PNG/);
    expect(contentMismatchReason("image/jpeg", html)).toMatch(/JPEG/);
    expect(contentMismatchReason("text/plain", new Uint8Array([0x4d, 0x5a, 0, 0, 3]))).toMatch(
      /binary/,
    );
  });

  it("rejects ZIP bombs and damaged archives in DOCX/XLSX", () => {
    const perEntry = Math.ceil(MAX_ZIP_UNCOMPRESSED_BYTES / 4);
    expect(zipBombReason(zip(5, perEntry))).toMatch(/200 MB/);
    expect(zipBombReason(zip(6000, 10))).toMatch(/too many/);
    expect(contentMismatchReason(DOCX, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toMatch(
      /damaged/,
    );
  });
});
