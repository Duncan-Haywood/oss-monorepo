// A file the user picked, read into a submittal register preview (src/shared/submittal-import.ts).
// Runs in the browser: the file is never uploaded. A spreadsheet or CSV is read as a register; a PDF
// is read as a register when one of its tables has a register header, and otherwise as spec
// sections (their SUBMITTALS articles).

import { PdfUnreadable } from "./pdf/reader";
import { extractText, type PageText } from "./pdf/text";
import { parseCsv } from "./sov-import/csv";
import { tablesFromText } from "./sov-import/pdf";
import { ImportError, readXlsx } from "./sov-import/xlsx";
import { MAX_SPEC_PAGES } from "./spec-submittals";
import {
  type RegisterImportResult,
  readRegister,
  readSpecSections,
  type SpecLine,
} from "./submittal-import";

export const MAX_REGISTER_BYTES = 20 * 1024 * 1024;

const fail = (error: string): RegisterImportResult => ({ ok: false, error });

/**
 * A page's text as lines in reading order: runs on the same baseline (within a third of the font
 * size) joined left to right, with a space where there is a gap.
 */
export function pageLines(page: PageText): string[] {
  const runs = [...page.runs].filter((r) => r.text.trim()).sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: { y: number; size: number; runs: typeof runs }[] = [];
  for (const r of runs) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.y - last.y) <= Math.max(1, Math.min(r.size, last.size) / 3))
      last.runs.push(r);
    else lines.push({ y: r.y, size: r.size, runs: [r] });
  }
  return lines.map((l) => {
    const sorted = l.runs.sort((a, b) => a.x0 - b.x0);
    let out = "";
    let x1 = Number.NEGATIVE_INFINITY;
    for (const r of sorted) {
      const gap = r.x0 - x1;
      if (out && gap > r.size * 0.15 && !out.endsWith(" ") && !r.text.startsWith(" ")) out += " ";
      out += r.text;
      x1 = r.x1;
    }
    return out.replace(/\s+/g, " ").trim();
  });
}

/** Reads a register or spec file into a preview. Never throws. */
export async function importRegisterFile(
  name: string,
  bytes: Uint8Array,
): Promise<RegisterImportResult> {
  if (bytes.length > MAX_REGISTER_BYTES)
    return fail("This file is over 20 MB. Choose just the register, or fewer spec sections.");
  const lower = name.toLowerCase();
  const looksZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const looksPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  try {
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || looksZip) {
      const sheets = await readXlsx(bytes);
      let first: RegisterImportResult | null = null;
      for (const s of sheets) {
        const r = readRegister(s.grid);
        if (r.ok)
          return sheets.length > 1 ? { ...r, notes: [`Sheet "${s.name}".`, ...r.notes] } : r;
        first ??= r;
      }
      return first ?? fail("This workbook has no sheets.");
    }
    if (lower.endsWith(".xls") || lower.endsWith(".numbers") || lower.endsWith(".ods"))
      return fail(
        "Save the register as .xlsx or CSV first (File → Save As), then choose that file.",
      );
    if (lower.endsWith(".pdf") || looksPdf) return await importRegisterPdf(bytes);
    return readRegister(parseCsv(new TextDecoder().decode(bytes)));
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    return fail("This file could not be read. Save it again as .xlsx, CSV or PDF and retry.");
  }
}

async function importRegisterPdf(bytes: Uint8Array): Promise<RegisterImportResult> {
  let text: Awaited<ReturnType<typeof extractText>>;
  try {
    // A spec PDF runs to hundreds of pages; a register is a few.
    text = await extractText(bytes, { maxPages: MAX_SPEC_PAGES });
  } catch (e) {
    if (e instanceof PdfUnreadable)
      return fail(
        `This PDF ${e.message}. Export the register as .xlsx or CSV, or print an unprotected PDF.`,
      );
    return fail("This PDF could not be read. Export the register as .xlsx or CSV and choose that.");
  }
  if (text.chars - text.unreadable < 20)
    return fail(
      "This PDF has no text to read (a scan with no text layer). Ask the GC for the register as a spreadsheet, or the spec sections as the architect's PDF.",
    );
  const pageCount = text.pageCount ?? text.pages.length;
  const capped =
    pageCount > text.pages.length
      ? [
          `Only the first ${text.pages.length} of ${pageCount} pages were read. Split a longer file (one division at a time) and import each.`,
        ]
      : [];
  // A printed register: a table with a register header.
  for (const t of tablesFromText(text)) {
    const r = readRegister(t.grid, t.labels);
    if (r.ok) return { ...r, notes: [...r.notes, ...capped] };
  }
  const lines: SpecLine[] = [];
  for (const p of text.pages)
    for (const l of pageLines(p)) lines.push({ text: l, source: `page ${p.page}` });
  const r = readSpecSections(lines);
  return r.ok ? { ...r, notes: [...r.notes, ...capped] } : r;
}
