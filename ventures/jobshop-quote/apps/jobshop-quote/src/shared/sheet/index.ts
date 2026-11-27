// A spreadsheet the user picked (.xlsx, .csv, .tsv or .txt) as grids of cell text, read in the
// browser and never uploaded. Readers copied from apps/payapps' SOV import (same owner, MIT).
import { parseCsv } from "./csv";
import { type Grid, ImportError, readXlsx, type Sheet } from "./xlsx";

export type { Grid, Sheet };
export { parseCsv };

export const MAX_SHEET_BYTES = 5 * 1024 * 1024;

export type SheetFile = { ok: true; sheets: Sheet[] } | { ok: false; error: string };

/** Never throws: an unreadable file comes back as a message for the page. */
export async function readSheetFile(name: string, bytes: Uint8Array): Promise<SheetFile> {
  if (bytes.length > MAX_SHEET_BYTES)
    return {
      ok: false,
      error: "This file is over 5 MB. Save just the rate sheet as CSV and choose that.",
    };
  const lower = name.toLowerCase();
  const looksZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  try {
    if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || looksZip)
      return { ok: true, sheets: await readXlsx(bytes) };
    if (/\.(xls|numbers|ods|pdf)$/.test(lower))
      return {
        ok: false,
        error: "Save the sheet as .xlsx or CSV first (File → Save As), then choose that file.",
      };
    return { ok: true, sheets: [{ name, grid: parseCsv(new TextDecoder().decode(bytes)) }] };
  } catch (e) {
    if (e instanceof ImportError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: "This file could not be read. Save it again as .xlsx or CSV and retry.",
    };
  }
}
