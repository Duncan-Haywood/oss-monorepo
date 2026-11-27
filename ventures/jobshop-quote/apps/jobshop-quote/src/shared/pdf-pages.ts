// Counts the pages of an uploaded PDF, for the plan's "an RFQ counts once per 10 drawing pages" rule
// (docs/BILLING.md). It never renders or trusts the file: it looks for the page tree's /Count in the
// raw bytes and in compressed object streams (PDF 1.5+ writers put dictionaries there), and falls
// back to counting /Type /Page leaves. When neither is found (an encrypted object stream, a broken
// file) it answers null and the caller counts the file as one page. With incremental updates (a file
// saved again after edits) the last page-tree root in the file is the current one, and that is used.

/** Object streams inflated per file, and bytes per stream: bounds the work a hostile file can cause. */
const MAX_OBJECT_STREAMS = 400;
const MAX_INFLATED_BYTES = 8 * 1024 * 1024;
/** A page count above this is treated as unreadable (no RFQ is a 100,000-page drawing set). */
const MAX_PLAUSIBLE_PAGES = 10_000;

export const latin1 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return s;
};

export interface PageScan {
  /** /Count of each page-tree root (a /Type /Pages node with no /Parent), with its offset. */
  roots: { at: number; count: number }[];
  /** /Type /Page leaf dictionaries seen. */
  leaves: number;
}

/** Scans PDF syntax (raw bytes or an inflated object stream) for page-tree facts. */
export function scanPageTree(text: string): PageScan {
  const roots: { at: number; count: number }[] = [];
  let leaves = 0;
  // Each dictionary that names a type; the window ends at the next "obj" boundary so a /Count from a
  // neighbouring object is never read. Object streams have no "endobj": their objects are separated
  // only by position, so the window also stops at the next /Type.
  const typeRe = /\/Type\s*\/(Pages|Page)(?![A-Za-z0-9#])/g;
  for (let m = typeRe.exec(text); m; m = typeRe.exec(text)) {
    if (m[1] === "Page") {
      leaves++;
      continue;
    }
    const start = dictStart(text, m.index);
    const end = dictEnd(text, m.index);
    const dict = text.slice(start, end);
    if (/\/Parent\s+\d+\s+\d+\s+R/.test(dict)) continue;
    const count = /\/Count\s+(\d{1,7})(?![\d.])/.exec(dict);
    if (!count?.[1]) continue;
    roots.push({ at: m.index, count: Number(count[1]) });
  }
  return { roots, leaves };
}

/** Start of the innermost "<<" that encloses `at` (or a little before it if none is found). */
function dictStart(text: string, at: number) {
  let depth = 0;
  for (let i = at; i > 0 && at - i < 4096; i--) {
    if (text[i] === ">" && text[i - 1] === ">") {
      depth++;
      i--;
    } else if (text[i] === "<" && text[i - 1] === "<") {
      if (depth === 0) return i - 1;
      depth--;
      i--;
    }
  }
  return Math.max(0, at - 512);
}

/** End of the dictionary that encloses `at`, matching "<<" and ">>" pairs. */
function dictEnd(text: string, at: number) {
  let depth = 0;
  for (let i = at; i < text.length - 1 && i - at < 4096; i++) {
    if (text[i] === "<" && text[i + 1] === "<") {
      depth++;
      i++;
    } else if (text[i] === ">" && text[i + 1] === ">") {
      if (depth === 0) return i + 2;
      depth--;
      i++;
    }
  }
  return Math.min(text.length, at + 512);
}

export async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([data.slice()])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_INFLATED_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.byteLength;
    }
    return out;
  } catch {
    // Truncated or not deflate: whatever was read is not trusted.
    return null;
  }
}

/** The page count of a PDF, or null when it cannot be read without guessing. */
export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  const text = latin1(bytes);
  const head = text.indexOf("%PDF-");
  if (head < 0 || head > 1024) return null;
  // Roots by position, so the newest one (last in the file) wins; an object stream's roots take
  // the stream's position.
  const raw = scanPageTree(text);
  const roots = [...raw.roots];
  let leaves = raw.leaves;

  // Compressed object streams: /Type /ObjStm ... stream <deflate> endstream.
  const objStmRe = /\/Type\s*\/ObjStm(?![A-Za-z0-9#])/g;
  let seen = 0;
  for (let m = objStmRe.exec(text); m && seen < MAX_OBJECT_STREAMS; m = objStmRe.exec(text)) {
    seen++;
    const end = dictEnd(text, m.index);
    const dict = text.slice(dictStart(text, m.index), end);
    if (!/\/Filter\s*(\[\s*)?\/FlateDecode/.test(dict)) continue;
    if (/\/DecodeParms/.test(dict)) continue; // predictors are not used for object streams in practice
    const kw = /^\s*stream\r?\n/.exec(text.slice(end, end + 64));
    if (!kw) continue;
    const dataStart = end + kw[0].length;
    // A direct /Length is exact; otherwise read up to "endstream" less the end-of-line before it.
    const len = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    let dataEnd = text.indexOf("endstream", dataStart);
    if (dataEnd < 0) continue;
    if (len?.[1] && dataStart + Number(len[1]) <= dataEnd) dataEnd = dataStart + Number(len[1]);
    else
      while (dataEnd > dataStart && (text[dataEnd - 1] === "\n" || text[dataEnd - 1] === "\r"))
        dataEnd--;
    const inflated = await inflate(bytes.subarray(dataStart, dataEnd));
    if (!inflated) continue;
    const inner = scanPageTree(latin1(inflated));
    leaves += inner.leaves;
    for (const r of inner.roots) roots.push({ at: m.index, count: r.count });
  }

  roots.sort((a, b) => a.at - b.at);
  const pages = roots.at(-1)?.count ?? (leaves > 0 ? leaves : null);
  if (pages === null || pages < 1 || pages > MAX_PLAUSIBLE_PAGES) return null;
  return pages;
}

/** Drawing pages per counted RFQ: "bigger packages count once per 10 pages" (the pricing page). */
export const PAGES_PER_RFQ = 10;

/** How many RFQs of the allowance a package of `pages` drawing pages uses: at least one. */
export const rfqUnitsForPages = (pages: number) =>
  Math.max(1, Math.ceil(Math.max(0, pages) / PAGES_PER_RFQ));

/**
 * Pages each uploaded file contributes. PDFs by their page tree (one when unreadable), images one
 * each, text and CAD files none: the email itself and a CAD model ride on the RFQ's first count.
 */
export function filePages(file: { mimeType: string; pageCount: number | null; isCad: boolean }) {
  if (file.isCad) return 0;
  if (file.mimeType === "application/pdf") return file.pageCount ?? 1;
  if (file.mimeType.startsWith("image/")) return 1;
  return 0;
}
