// Upload limits, MIME allowlist and filename helpers (pure).

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Max pasted text / service-created text document size. */
export const MAX_TEXT_CHARS = 2_000_000;

/** Canonical MIME type per allowed extension. */
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Accepted declared types (incl. common aliases) -> canonical type. */
const MIME_ALIASES: Record<string, string> = {
  "text/x-markdown": "text/markdown",
  "application/xhtml+xml": "text/html",
  "text/rtf": "application/rtf",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "application/csv": "text/csv",
  "text/x-csv": "text/csv",
};

const CANONICAL = new Set(Object.values(EXT_TO_MIME));

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/rtf": "rtf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const ALLOWED_EXTENSIONS = Object.keys(EXT_TO_MIME);

export function extensionOf(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(filename.trim());
  return m?.[1]?.toLowerCase() ?? "";
}

export const extensionForMime = (mime: string) => MIME_TO_EXT[mime] ?? "bin";

/**
 * Resolve the canonical MIME type of an upload from its declared type and filename, or null if
 * not allowed. Browsers often send "" or application/octet-stream for .md/.csv, so the extension
 * decides when the declared type is generic or unknown.
 */
export function resolveMimeType(declared: string | undefined, filename: string): string | null {
  const base = (declared ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const canonical = MIME_ALIASES[base] ?? base;
  const byExt = EXT_TO_MIME[extensionOf(filename)];
  // A .md/.csv declared as text/plain is better handled as its real type.
  if (canonical === "text/plain" && byExt?.startsWith("text/")) return byExt;
  if (CANONICAL.has(canonical)) return canonical;
  return byExt ?? null;
}

/** Strip path components and control characters; keep it short. */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|?*:]/g, "").trim();
  return cleaned.slice(-150) || "document";
}

export function titleFromFilename(name: string): string {
  const cleaned = cleanFilename(name).replace(/\.[A-Za-z0-9]{1,10}$/, "");
  return cleaned.replace(/[_]+/g, " ").trim() || "Untitled document";
}

/** Content-Disposition header value for a download: ASCII fallback + RFC 5987 UTF-8 name. */
export function contentDisposition(filename: string, mime: string): string {
  let name = cleanFilename(filename);
  const ext = extensionForMime(mime);
  if (
    ext !== "bin" &&
    extensionOf(name) !== ext &&
    !(ext === "jpg" && extensionOf(name) === "jpeg")
  )
    name = `${name}.${ext}`;
  const ascii = name.replace(/[^\w.\- ()]+/g, "_").replace(/_+/g, "_") || `document.${ext}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------------------------
// Content checks: the bytes must actually be the type we are about to store and convert.
// ---------------------------------------------------------------------------------------------

const ZIP_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/** Expanded size of all entries a DOCX/XLSX may declare (zip-bomb guard). */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 5_000;

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) =>
  b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

const indexOfAscii = (b: Uint8Array, needle: string, limit: number) => {
  const n = [...needle].map((ch) => ch.charCodeAt(0));
  const end = Math.min(b.length, limit) - n.length;
  for (let i = 0; i <= end; i++) if (startsWith(b, n, i)) return i;
  return -1;
};

/**
 * Inspects a ZIP's central directory (no decompression) and rejects archives that declare an
 * implausible expanded size or entry count. Returns an error message or null.
 * Residual: entries can lie about their sizes; conversion runs in Workers AI and extracted text is
 * capped at MAX_TEXT_CHARS, so a lying archive cannot exhaust this isolate.
 */
export function zipBombReason(b: Uint8Array): string | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // End of central directory record: 22 bytes + up to 64 KiB comment, at the end of the file.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return "The file is not a valid Office document (damaged ZIP).";
  const entries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || cdOffset === 0xffffffff) {
    return "The file uses an unsupported ZIP64 layout.";
  }
  if (entries > MAX_ZIP_ENTRIES) return "The document contains too many embedded files.";
  let pos = cdOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (pos + 46 > b.length || view.getUint32(pos, true) !== 0x02014b50) {
      return "The file is not a valid Office document (damaged ZIP).";
    }
    total += view.getUint32(pos + 24, true);
    if (total > MAX_ZIP_UNCOMPRESSED_BYTES) {
      return "The document expands to more than 200 MB and cannot be processed.";
    }
    // Header: 46 bytes + file name + extra field + file comment.
    pos +=
      46 +
      view.getUint16(pos + 28, true) +
      view.getUint16(pos + 30, true) +
      view.getUint16(pos + 32, true);
  }
  return null;
}

/**
 * Checks the leading bytes ("magic numbers") against the resolved type. Binary types must carry
 * their signature; text types must not contain NUL bytes. Returns an error message or null.
 */
export function contentMismatchReason(
  mime: string,
  input: ArrayBuffer | Uint8Array,
): string | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bad = (what: string) => `The file's contents are not a valid ${what}.`;
  switch (mime) {
    case "application/pdf":
      // Readers accept the header anywhere in the first 1 KiB.
      return indexOfAscii(b, "%PDF-", 1024) >= 0 ? null : bad("PDF");
    case "image/png":
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ? null
        : bad("PNG image");
    case "image/jpeg":
      return startsWith(b, [0xff, 0xd8, 0xff]) ? null : bad("JPEG image");
    case "application/msword":
      return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        ? null
        : bad("Word document");
    case "application/rtf":
      return indexOfAscii(b, "{\\rtf", 16) >= 0 ? null : bad("RTF document");
    default:
      if (ZIP_TYPES.has(mime)) {
        return startsWith(b, [0x50, 0x4b, 0x03, 0x04]) ? zipBombReason(b) : bad("Office document");
      }
      if (mime.startsWith("text/")) {
        const head = b.subarray(0, 8192);
        return head.includes(0) ? "This looks like a binary file, not text." : null;
      }
      return null;
  }
}
