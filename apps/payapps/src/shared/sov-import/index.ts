// Schedule-of-values import: a contractor's own Excel workbook or CSV in, the lines to add to a project out.
// Runs in the browser; the file is never uploaded, only the lines the user confirms go to the bulk SOV endpoint.
import { parseCsv } from "./csv";
import { importSovPdf } from "./pdf";
import { findSov, pickSov, type SovImportResult } from "./schedule";
import { ImportError, readXlsx } from "./xlsx";

export { parseCsv } from "./csv";
export type { OpeningFill, OpeningFillOk, OpeningTargetLine, OpeningUnmatched } from "./opening";
export { openingFromImport, overScheduled, placeUnmatched } from "./opening";
export type { PdfTable } from "./pdf";
export { importSovPdf, tablesFromText } from "./pdf";
export type {
  ImportCheck,
  ImportedBilling,
  ImportedSovLine,
  SkippedRow,
  SovImportOk,
  SovImportResult,
} from "./schedule";
export { findSov, MAX_IMPORT_LINES, pickSov, readDate, readMoney } from "./schedule";
export type { G702Summary, SummaryLine } from "./summary";
export { findSummary } from "./summary";
export { readXlsx } from "./xlsx";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const fail = (error: string): SovImportResult => ({ ok: false, error, errors: [error] });

/** Reads a file the user picked (.xlsx, .csv, .tsv, .txt or a PDF with text) into an import preview. Never throws. */
export async function importSovFile(name: string, bytes: Uint8Array): Promise<SovImportResult> {
  if (bytes.length > MAX_IMPORT_BYTES)
    return fail(
      "This file is over 10 MB. Save just the schedule of values sheet as CSV and choose that.",
    );
  const lower = name.toLowerCase();
  const looksZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  try {
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || looksZip)
      return pickSov(await readXlsx(bytes));
    if (lower.endsWith(".xls") || lower.endsWith(".numbers") || lower.endsWith(".ods"))
      return fail("Save the sheet as .xlsx or CSV first (File → Save As), then choose that file.");
    const looksPdf =
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    if (lower.endsWith(".pdf") || looksPdf) return await importSovPdf(bytes);
    return findSov(parseCsv(new TextDecoder().decode(bytes)));
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    return fail("This file could not be read. Save it again as .xlsx or CSV and retry.");
  }
}
