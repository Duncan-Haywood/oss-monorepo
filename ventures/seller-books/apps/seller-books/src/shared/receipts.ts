// Receipts on expenses (2026-11-28): a photo or PDF of the receipt behind each expense, so the books keep
// what the IRS asks a business to keep (Publication 583, "Supporting Business Documents": receipts,
// canceled checks, account statements and invoices that show the payee, amount, proof of payment, date
// and a description of what was bought). Shared by the worker (what it accepts) and the browser (what the
// picker offers and the limits it names before uploading).
//
// Files live in D1 (`expense_receipt` and `expense_receipt_chunk`, migration 0015), cut into chunks under
// D1's 2 MB value limit. D1's free plan gives a database 500 MB shared with every shop's books, so storage
// is capped per shop and for the whole deployment; nothing here depends on R2.

/** One receipt file, at most. A phone photo is 2 to 5 MB; a scanned PDF rarely more. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
/** Receipts on one expense (a receipt and its card slip, a two-page invoice). */
export const MAX_RECEIPTS_PER_EXPENSE = 5;
/** Every receipt a shop keeps, while receipts live in D1. */
export const SHOP_RECEIPT_LIMIT_BYTES = 50 * 1024 * 1024;
/** Every shop's receipts together, leaving the rest of a 500 MB D1 database to the books. */
export const TOTAL_RECEIPT_LIMIT_BYTES = 300 * 1024 * 1024;
/** Bytes per D1 row: D1 allows 2,000,000 bytes per value; 1 MiB keeps each insert small. */
export const RECEIPT_CHUNK_BYTES = 1024 * 1024;

/**
 * The types a receipt may be, by extension. The stored type always comes from this table, never from the
 * browser, and the file's first bytes must match it (`receiptKind`), so a renamed page or script is
 * refused rather than kept as a "receipt".
 */
export const RECEIPT_TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
} as const satisfies Record<string, string>;

export type ReceiptExtension = keyof typeof RECEIPT_TYPES;

/** For the file picker's `accept`. */
export const RECEIPT_ACCEPT = Object.keys(RECEIPT_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export const RECEIPT_TYPES_LABEL = "a PDF or a JPEG, PNG, WebP or HEIC photo";

export function receiptExtension(fileName: string): ReceiptExtension | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  const ext = m?.[1]?.toLowerCase();
  return ext && ext in RECEIPT_TYPES ? (ext as ReceiptExtension) : null;
}

/** HEIF brands a phone writes (Apple's heic, mif1 from others, heix/hevc/heim/heis for variants). */
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
  "heif",
]);

const ascii = (b: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...b.subarray(from, Math.min(to, b.byteLength)));

/**
 * The type the bytes are, read from their first bytes, or null. HEIC and HEIF are one family here, as
 * are .jpg and .jpeg.
 */
export function sniffReceipt(bytes: Uint8Array): "pdf" | "jpeg" | "png" | "webp" | "heif" | null {
  if (bytes.byteLength < 12) return null;
  // A PDF may carry a few junk bytes before its header; readers look in the first 1,024.
  if (ascii(bytes, 0, 1024).includes("%PDF-")) return "pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (ascii(bytes, 4, 8) === "ftyp") {
    // The major brand, then the compatible brands up to the box's own size.
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    const end = Math.min(boxSize > 0 ? boxSize : 32, bytes.byteLength, 64);
    const brands = [ascii(bytes, 8, 12)];
    for (let at = 16; at + 4 <= end; at += 4) brands.push(ascii(bytes, at, at + 4));
    if (brands.some((b) => HEIF_BRANDS.has(b))) return "heif";
  }
  return null;
}

const FAMILY: Record<ReceiptExtension, ReturnType<typeof sniffReceipt>> = {
  pdf: "pdf",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heif",
  heif: "heif",
};

export type ReceiptCheck =
  | { ok: true; extension: ReceiptExtension; contentType: string }
  | { ok: false; reason: string };

/** Whether a file may be kept as a receipt: its name's extension, its size and its first bytes. */
export function checkReceipt(fileName: string, bytes: Uint8Array): ReceiptCheck {
  const extension = receiptExtension(fileName);
  if (!extension) {
    return { ok: false, reason: `A receipt must be ${RECEIPT_TYPES_LABEL}.` };
  }
  if (bytes.byteLength === 0) return { ok: false, reason: "The file is empty." };
  if (bytes.byteLength > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      reason: `A receipt can be up to ${MAX_RECEIPT_BYTES / 1024 / 1024} MB; this file is ${megabytes(bytes.byteLength)}.`,
    };
  }
  const sniffed = sniffReceipt(bytes);
  if (sniffed !== FAMILY[extension]) {
    return {
      ok: false,
      reason: sniffed
        ? `The file is named .${extension} but is a ${sniffed.toUpperCase()} file. Rename it to match and try again.`
        : `The file is named .${extension} but is not one. A receipt must be ${RECEIPT_TYPES_LABEL}.`,
    };
  }
  return { ok: true, extension, contentType: RECEIPT_TYPES[extension] };
}

/** A file name safe to store and to put in a download header and a ZIP: no folders, no control characters. */
export function cleanReceiptName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "receipt";
  if (cleaned.length <= 120) return cleaned;
  const ext = receiptExtension(cleaned);
  return ext ? `${cleaned.slice(0, 115 - ext.length)}.${ext}` : cleaned.slice(0, 120);
}

export function megabytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
