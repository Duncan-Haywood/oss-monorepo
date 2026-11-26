// Oracle Textura Payment Management (TPM): a subcontractor's invoice can be filled from a file. In the
// billing workflow, the Progress tab's More menu has "Upload Billing Amounts"; the dialog offers "This
// Period Billing Amounts" or "To Date Billing Amounts" and a Download Template button that gives "a
// pre-formatted Excel spreadsheet for uploading. The template includes phase codes, description, budget
// amounts, and the current billing amounts for the line items in your contract." The steps then say to
// "Update the file with desired billing and retention values", save it as CSV and upload it; "If your
// retention amounts do not meet the retention settings, the system will override the amounts in the
// file." (Oracle, "Importing a Payment Application from a File for Subcontractors" and the Subcontractor
// Billing Workflow Guide, North America; both read 2026-11-26.)
//
// Oracle does not publish the template's column headings, so the format is read from the GC's own file
// and never assumed: its rows above the header, its header, its columns and their order, its delimiter
// and every cell we do not fill are written back unchanged. Columns are recognised by their headings
// (Textura's own field names are "Work This Period" and "Material Stored This Period"), and the person
// can point at a different column when a GC's template words them otherwise. Only the This Period
// upload is filled: those two columns map one to one onto the G703 (column E, and the materials newly
// stored this period). Retention cells are left as the template has them, as Textura applies the
// draw's retention settings. Amounts are plain numbers ("1234.56", no commas or $). Runs in the
// browser; nothing is uploaded.
import { centsToDecimal } from "../money";
import { detectDelimiter, parseCsv } from "../sov-import/csv";
import { readMoney } from "../sov-import/schedule";

export const TEXTURA_UPLOAD_HELP_URL =
  "https://docs.oracle.com/cd/E97085_01/TPMhelp/en/Europe/10307605.htm";

export type TexturaRole = "phase" | "description" | "budget" | "work" | "material";

export interface TexturaColumns {
  phase: number | null;
  description: number | null;
  budget: number | null;
  /** "Work This Period": required before the file can be filled. */
  work: number | null;
  /** "Material Stored This Period"; null when the template has none (stored materials on their own tab). */
  material: number | null;
}

export interface TexturaRow {
  /** Index into `TexturaTemplate.body`. */
  index: number;
  phase: string;
  description: string;
  /** The template's budget amount in cents, or null when there is no budget column or it is not a number. */
  budgetCents: number | null;
}

export interface TexturaTemplate {
  delimiter: string;
  /** Rows above the header (titles, notes), written back unchanged. */
  preamble: string[][];
  header: string[];
  /** Every row under the header, as read (each padded to the header's width). */
  body: string[][];
  /** The columns found from the headings. */
  col: TexturaColumns;
  /** The rows that are contract line items (not blank, not a total). */
  rows: TexturaRow[];
  /** True when a heading reads "to date" and none reads "this period": the To Date template. */
  looksToDate: boolean;
}

export type TexturaTemplateResult =
  | { ok: true; template: TexturaTemplate }
  | { ok: false; error: string };

/** One line of this pay application, as the template is filled from it. */
export interface TexturaLine {
  sovLineId: string;
  itemNumber: string;
  description: string;
  scheduledValueCents: number;
  /** G703 column E. */
  workThisPeriodCents: number;
  /** Materials newly stored this period; null when that cannot be told from the stored balance. */
  newStoredCents: number | null;
}

const norm = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");

const thisPeriod = (h: string) =>
  /\b(this period|current period|current billing|this draw)\b/.test(h);
const notBilling = (h: string) =>
  /\b(retention|retainage|percent|previous|prior|to date|net)\b|%/.test(h);
const isMaterial = (h: string) => /\b(material|materials|stored)\b/.test(h);

export const ROLE_TESTS: Record<TexturaRole, (h: string) => boolean> = {
  phase: (h) =>
    /^phase$|\b(phase|cost) (code|codes|#|no\.?|number)\b/.test(h) ||
    /^(item|line|line item)( (number|no\.?|#))?$/.test(h),
  description: (h) => /\bdescription\b/.test(h) && !/\bsub/.test(h),
  budget: (h) =>
    /\b(budget|scheduled value|contract amount|current value|original value)\b/.test(h) &&
    !thisPeriod(h) &&
    !notBilling(h),
  work: (h) => thisPeriod(h) && !isMaterial(h) && !notBilling(h),
  material: (h) => isMaterial(h) && thisPeriod(h) && !notBilling(h),
};

/** The first column whose heading passes `role`'s test, or null. */
function find(header: string[], role: TexturaRole): number | null {
  const at = header.findIndex((h) => ROLE_TESTS[role](norm(h)));
  return at < 0 ? null : at;
}

function money(cell: string): number | null {
  const m = readMoney(cell);
  return "cents" in m ? m.cents : null;
}

const isTotal = (cells: string[]) => cells.some((c) => /^(grand )?totals?:?$/i.test(c.trim()));

/** Reads a grid already parsed from the GC's template (a CSV, or the first sheet of the .xlsx). */
export function readTexturaGrid(grid: string[][], delimiter = ","): TexturaTemplateResult {
  const at = grid.findIndex(
    (r) => r.some((h) => ROLE_TESTS.description(norm(h))) && r.filter((h) => h.trim()).length >= 2,
  );
  if (at < 0)
    return {
      ok: false,
      error:
        "No row of this file has a “Description” heading, so it does not look like Textura's billing template. In Textura, open the billing workflow's Progress tab, choose More → Upload Billing Amounts → This Period Billing Amounts → Download Template, and choose that file.",
    };
  const header = (grid[at] ?? []).map((h) => h.replace(/^\uFEFF/, ""));
  const width = Math.max(header.length, ...grid.slice(at + 1).map((r) => r.length));
  while (header.length < width) header.push("");
  const body = grid.slice(at + 1).map((r) => header.map((_, i) => r[i] ?? ""));
  const col: TexturaColumns = {
    phase: find(header, "phase"),
    description: find(header, "description"),
    budget: find(header, "budget"),
    work: find(header, "work"),
    material: find(header, "material"),
  };
  const rows = texturaRows(body, col);
  if (rows.length === 0)
    return {
      ok: false,
      error:
        "The template has no line items under its headings. Textura lists the contract's schedule of values in it once the GC has set up the draw.",
    };
  const heads = header.map(norm);
  return {
    ok: true,
    template: {
      delimiter,
      preamble: grid.slice(0, at),
      header,
      body,
      col,
      rows,
      looksToDate: heads.some((h) => /\bto date\b/.test(h)) && !heads.some(thisPeriod),
    },
  };
}

/** The line-item rows of `body` under the columns `col` (blank rows and total rows left out). */
export function texturaRows(body: string[][], col: TexturaColumns): TexturaRow[] {
  const cell = (r: string[], c: number | null) => (c === null ? "" : (r[c] ?? "").trim());
  const rows: TexturaRow[] = [];
  body.forEach((r, index) => {
    const phase = cell(r, col.phase);
    const description = cell(r, col.description);
    const budget = cell(r, col.budget);
    if (phase === "" && description === "") return;
    if (isTotal([phase, description, r[0] ?? ""])) return;
    rows.push({ index, phase, description, budgetCents: budget === "" ? null : money(budget) });
  });
  return rows;
}

/** Reads the GC's template saved as CSV (comma, semicolon or tab). Never throws. */
export function readTexturaTemplate(text: string): TexturaTemplateResult {
  const src = text.replace(/^\uFEFF/, "");
  if (src.trim() === "") return { ok: false, error: "The file is empty." };
  const first =
    src
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .find((l) => l.trim() !== "") ?? "";
  return readTexturaGrid(parseCsv(src), detectDelimiter(first));
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * A first guess at which of this application's lines each template row is: the phase code equal to the
 * line's item number, else the same description (with or without the item number in front), else the
 * only line whose scheduled value equals the row's budget. A line is guessed for one row at most; rows
 * with no safe guess are left for the person.
 */
export function suggestTexturaMatches(
  t: Pick<TexturaTemplate, "rows">,
  lines: readonly TexturaLine[],
): Record<number, string> {
  const out: Record<number, string> = {};
  const used = new Set<string>();
  const unique = <T>(xs: T[]) => (xs.length === 1 ? xs[0] : undefined);
  const free = () => lines.filter((l) => !used.has(l.sovLineId));
  const pass = (test: (r: TexturaRow, l: TexturaLine) => boolean) => {
    for (const r of t.rows) {
      if (out[r.index] !== undefined) continue;
      const hit = unique(free().filter((l) => test(r, l)));
      // Only when the row is also the only row that line would take.
      if (hit && t.rows.filter((o) => out[o.index] === undefined && test(o, hit)).length === 1) {
        out[r.index] = hit.sovLineId;
        used.add(hit.sovLineId);
      }
    }
  };
  pass((r, l) => key(r.phase) !== "" && key(r.phase) === key(l.itemNumber));
  pass(
    (r, l) =>
      key(r.description) !== "" &&
      (key(r.description) === key(l.description) ||
        key(r.description) === key(`${l.itemNumber} ${l.description}`)),
  );
  pass((r, l) => r.budgetCents !== null && r.budgetCents === l.scheduledValueCents);
  return out;
}

export interface TexturaFill {
  /** null while something blocks the file (no work column, a line matched twice). */
  csv: string | null;
  blocking: string[];
  /** Rows the file was filled on: the row, its line and the amounts written. */
  filled: {
    row: TexturaRow;
    line: TexturaLine;
    workCents: number;
    /** Written to the material column; null when the column is absent or the amount unknown. */
    materialCents: number | null;
  }[];
  /** Template rows not matched to a line: written back exactly as the template had them. */
  unmatchedRows: TexturaRow[];
  /** This application's lines that are on no row, with something billed on them this period. */
  missingLines: TexturaLine[];
  /** Matched lines whose new stored materials cannot be told; their material cell is left as it was. */
  materialUnknown: TexturaLine[];
  /** Matched rows whose budget differs from the line's scheduled value. */
  budgetMismatches: { row: TexturaRow; line: TexturaLine }[];
  /** Materials stored this period when the template has no column for them. */
  materialWithoutColumnCents: number;
  totals: { workCents: number; materialCents: number };
}

function out(v: string, delim: string): string {
  return v.includes(delim) || /["\r\n]/.test(v) || v !== v.trim()
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

/**
 * Fills the template: on each matched row, Work This Period from column E and Material Stored This
 * Period from the materials newly stored; every other cell, and every unmatched row, as the GC's file
 * had it.
 */
export function fillTextura(
  t: TexturaTemplate,
  col: TexturaColumns,
  lines: readonly TexturaLine[],
  match: Record<number, string>,
): TexturaFill {
  const rows = texturaRows(t.body, col);
  const byId = new Map(lines.map((l) => [l.sovLineId, l]));
  const blocking: string[] = [];
  if (col.work === null)
    blocking.push(
      "Choose the template's “Work This Period” column (the this-period billing amount) to fill.",
    );
  if (col.work !== null && col.work === col.material)
    blocking.push("Work and stored materials cannot be written to the same column.");
  const taken = new Map<string, number>();
  for (const r of rows) {
    const id = match[r.index];
    if (id === undefined || !byId.has(id)) continue;
    taken.set(id, (taken.get(id) ?? 0) + 1);
  }
  for (const [id, n] of taken)
    if (n > 1)
      blocking.push(
        `“${byId.get(id)?.description ?? id}” is chosen for ${n} rows: each of your lines goes on one row.`,
      );

  const grid = t.body.map((r) => [...r]);
  const filled: TexturaFill["filled"] = [];
  const unmatchedRows: TexturaRow[] = [];
  const materialUnknown: TexturaLine[] = [];
  const budgetMismatches: TexturaFill["budgetMismatches"] = [];
  for (const r of rows) {
    const line = byId.get(match[r.index] ?? "");
    if (!line) {
      unmatchedRows.push(r);
      continue;
    }
    const target = grid[r.index];
    if (target && col.work !== null) target[col.work] = centsToDecimal(line.workThisPeriodCents);
    let materialCents: number | null = null;
    if (col.material !== null) {
      if (line.newStoredCents === null) materialUnknown.push(line);
      else {
        materialCents = line.newStoredCents;
        if (target) target[col.material] = centsToDecimal(materialCents);
      }
    }
    if (r.budgetCents !== null && r.budgetCents !== line.scheduledValueCents)
      budgetMismatches.push({ row: r, line });
    filled.push({ row: r, line, workCents: line.workThisPeriodCents, materialCents });
  }
  const placed = new Set(filled.map((f) => f.line.sovLineId));
  const missingLines = lines.filter(
    (l) =>
      !placed.has(l.sovLineId) && (l.workThisPeriodCents !== 0 || (l.newStoredCents ?? 0) !== 0),
  );
  const materialWithoutColumnCents =
    col.material === null ? lines.reduce((s, l) => s + (l.newStoredCents ?? 0), 0) : 0;
  const csv =
    blocking.length > 0
      ? null
      : `${[...t.preamble, t.header, ...grid].map((r) => r.map((v) => out(v, t.delimiter)).join(t.delimiter)).join("\r\n")}\r\n`;
  return {
    csv,
    blocking,
    filled,
    unmatchedRows,
    missingLines,
    materialUnknown,
    budgetMismatches,
    materialWithoutColumnCents,
    totals: {
      workCents: filled.reduce((s, f) => s + f.workCents, 0),
      materialCents: filled.reduce((s, f) => s + (f.materialCents ?? 0), 0),
    },
  };
}
