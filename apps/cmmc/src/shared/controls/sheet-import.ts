// "Import from a spreadsheet", part 2: an Excel workbook (.xlsx) is read in the browser (src/shared/xlsx.ts)
// and the chosen worksheet is turned back into CSV text for the same server-side reader
// (csv-import.ts), so there is one importer, one preview and one set of rules. Row N of the sheet is
// line N of the CSV, so "Line 14" in the preview is row 14 in Excel.
import { readXlsx, type Sheet, UNCALCULATED } from "../xlsx";
import { IMPORT_MAX_ROWS, type ImportLevel, resolveControlId } from "./csv-import";

export interface SheetChoice {
  name: string;
  /** Cells that read as a requirement id at this level (ok or refused with a reason). */
  idCells: number;
  rows: number;
}

export interface WorkbookRead {
  sheets: SheetChoice[];
  /** Index into `sheets` of the sheet with the most requirement ids (the first on a tie), or -1. */
  best: number;
  grids: string[][][];
}

/** One cell as CSV: quoted when it holds a delimiter the reader might pick, a quote or a line break. */
function csvCell(v: string): string {
  return /[",;\t\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * The grid as comma-separated text, one line per spreadsheet row (blank rows kept, so line numbers
 * stay row numbers), trailing blank rows dropped. A formula cell saved without its result becomes
 * the visible marker "#UNCALCULATED" so the preview names its row rather than treating it as blank.
 */
export function gridToCsv(grid: string[][]): string {
  let end = grid.length;
  while (end > 0 && !(grid[end - 1] ?? []).some((v) => v.trim())) end--;
  return grid
    .slice(0, end)
    .map((row) => Array.from(row, (v) => csvCell(v ?? "")).join(","))
    .join("\r\n");
}

/** How many cells of a grid read as a requirement id (capped at the import's row limit). */
export function countIdCells(grid: string[][], level: ImportLevel): number {
  let n = 0;
  for (const row of grid.slice(0, IMPORT_MAX_ROWS))
    for (const v of row) if (v && v !== UNCALCULATED && resolveControlId(v.trim(), level)) n++;
  return n;
}

export function chooseSheet(sheets: Sheet[], level: ImportLevel): WorkbookRead {
  const choices = sheets.map((s) => ({
    name: s.name,
    idCells: countIdCells(s.grid, level),
    rows: s.grid.length,
  }));
  let best = -1;
  choices.forEach((c, i) => {
    if (c.idCells > 0 && (best < 0 || c.idCells > (choices[best]?.idCells ?? 0))) best = i;
  });
  return { sheets: choices, best, grids: sheets.map((s) => s.grid) };
}

/** Reads a workbook and ranks its sheets for an import at `level`. Throws ImportError on a bad file. */
export async function readWorkbookForImport(
  bytes: ArrayBuffer | Uint8Array,
  level: ImportLevel,
): Promise<WorkbookRead> {
  return chooseSheet(await readXlsx(bytes), level);
}

/** True when the bytes are a ZIP (an .xlsx) or an old OLE .xls, whatever the file is named. */
export function looksLikeWorkbook(bytes: Uint8Array): boolean {
  const sig =
    ((bytes[0] ?? 0) |
      ((bytes[1] ?? 0) << 8) |
      ((bytes[2] ?? 0) << 16) |
      ((bytes[3] ?? 0) << 24)) >>>
    0;
  return sig === 0x04034b50 || sig === 0xe011cfd0;
}
