import {
  checkReceipt,
  cleanReceiptName,
  MAX_RECEIPT_BYTES,
  receiptExtension,
  sniffReceipt,
} from "@shared/receipts";
import { describe, expect, it } from "vitest";

const bytes = (...parts: (number[] | string)[]) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
};

const PNG = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe1]);
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBP");
/** An iPhone photo's first box: size 24, ftyp, major brand heic, minor version, compatible mif1 heic. */
const HEIC = bytes([0, 0, 0, 24], "ftyp", "heic", [0, 0, 0, 0], "mif1", "heic");
/** An MP4 video is also an ftyp box, with no HEIF brand. */
const MP4 = bytes([0, 0, 0, 24], "ftyp", "isom", [0, 0, 2, 0], "isom", "mp41");

describe("receipt checks", () => {
  it("reads each kept type from its first bytes", () => {
    expect(sniffReceipt(bytes("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffReceipt(bytes([0xef, 0xbb, 0xbf], "%PDF-1.4"))).toBe("pdf");
    expect(sniffReceipt(PNG)).toBe("png");
    expect(sniffReceipt(JPEG)).toBe("jpeg");
    expect(sniffReceipt(WEBP)).toBe("webp");
    expect(sniffReceipt(HEIC)).toBe("heif");
    expect(sniffReceipt(MP4)).toBeNull();
    expect(sniffReceipt(bytes("<svg xmlns="))).toBeNull();
    expect(sniffReceipt(new Uint8Array(4))).toBeNull();
  });

  it("takes the type from the extension, any case, and the bytes must agree", () => {
    expect(receiptExtension("IMG_1234.HEIC")).toBe("heic");
    expect(receiptExtension("scan.final.Pdf")).toBe("pdf");
    expect(receiptExtension("receipt.svg")).toBeNull();
    expect(receiptExtension("receipt")).toBeNull();
    expect(checkReceipt("IMG_1234.HEIC", HEIC)).toEqual({
      ok: true,
      extension: "heic",
      contentType: "image/heic",
    });
    expect(checkReceipt("photo.jpeg", JPEG)).toMatchObject({ ok: true, contentType: "image/jpeg" });
    expect(checkReceipt("photo.png", JPEG)).toMatchObject({ ok: false });
    expect(checkReceipt("clip.heic", MP4)).toMatchObject({ ok: false });
    expect(checkReceipt("page.svg", bytes("<svg"))).toMatchObject({ ok: false });
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    big.set(JPEG);
    expect(checkReceipt("big.jpg", big)).toMatchObject({ ok: false });
  });

  it("cleans names for storage, headers and the ZIP", () => {
    expect(cleanReceiptName("C:\\Users\\me\\Desktop\\uline.pdf")).toBe("uline.pdf");
    expect(cleanReceiptName('../a"b\u0007.pdf')).toBe("ab.pdf");
    expect(cleanReceiptName("   ")).toBe("receipt");
    const long = `${"x".repeat(200)}.jpeg`;
    const cleaned = cleanReceiptName(long);
    expect(cleaned.length).toBeLessThanOrEqual(120);
    expect(cleaned.endsWith(".jpeg")).toBe(true);
  });
});

describe("purchaseProof", () => {
  it("counts an item covered by its own receipt or its lot's, and leaves zero-cost items apart", async () => {
    const { purchaseProof } = await import("@shared/receipts");
    const p = purchaseProof(
      [
        { id: "a", lotId: "L1", costCents: 1000 },
        { id: "b", lotId: "L1", costCents: 1000 },
        { id: "c", lotId: null, costCents: 800 },
        { id: "d", lotId: null, costCents: 1500 },
        { id: "e", lotId: "L2", costCents: 0 },
      ],
      { lots: new Set(["L1"]), items: new Set(["c"]) },
    );
    expect(p).toEqual({
      items: 5,
      covered: 3,
      coveredCents: 2800,
      zeroCost: 1,
      missing: 1,
      missingCents: 1500,
      missingIds: ["d"],
    });
  });
});
