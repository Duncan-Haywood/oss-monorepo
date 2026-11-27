// Read an existing self-assessment spreadsheet (saved as CSV) into control records, so a shop that has
// tracked NIST SP 800-171 or CMMC in Excel moves in without retyping 110 rows. Pure: the worker
// diffs the result against the org's records and applies it; the browser shows the same preview.
//
// Nothing is guessed. A cell is read as a requirement id only when it is one (CMMC id, NIST SP 800-171
// Rev. 2 number, or a FAR 52.204-21 item for Level 1); a status only when it is one of the phrases
// below. Anything else is reported with its line number and left out, and a blank cell never
// changes what is already recorded.

import { LEVEL1_REQUIREMENTS } from "./level1";
import { LEVEL2_BY_NIST_ID } from "./level2";
import type { ImplementationStatus } from "./scoring";

export type ImportLevel = 1 | 2;

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 3000;
const TEXT_MAX = 8000;

// ---- CSV ----

/** RFC 4180 with the usual spreadsheet exports: BOM, CRLF, quoted newlines, `,` `;` or tab. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/, 10).join("\n");
  let best = ",";
  let bestCount = -1;
  for (const d of [",", ";", "\t"]) {
    // Count outside quotes only, roughly: strip quoted runs first.
    const n = sample.replace(/"[^"]*"/g, "").split(d).length - 1;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

// ---- requirement ids ----

const ROMAN = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)$/;
const NIST_NUMBER =
  /^(?:(?:NIST\s*)?(?:SP\s*)?800-171\s*(?:r(?:ev)?\.?\s*2)?\s*[-:]?\s*)?(3\.\d{1,2}\.\d{1,2})(?![\d.])/i;
const CMMC_ID = /^([A-Z]{2})\.L([12])-(3\.\d{1,2}\.\d{1,2})(?![\d.])/i;
const L1_FAR_ID = /^([A-Z]{2})\.L1-b\.1\.([ivx]+)\b/i;
const FAR_ITEM = /^(?:FAR\s*)?(?:52\.204-21\s*)?\(?b\)?[.(]?\s*\(?1\)?[.(]?\s*\(?([ivx]+)\)?$/i;

const L1_BY_ROMAN = new Map(LEVEL1_REQUIREMENTS.map((r) => [r.farRef.slice(7, -1), r.id]));
const L1_BY_NIST = new Map<string, string>();
for (const r of LEVEL1_REQUIREMENTS) for (const n of r.nistIds) L1_BY_NIST.set(n, r.id);

export type IdResult = { ok: true; controlId: string } | { ok: false; reason: string } | null; // not an id at all

/** The library id a cell names at `level`, a reason it cannot be used, or null if it is no id. */
export function resolveControlId(cell: string, level: ImportLevel): IdResult {
  const s = cell.trim().replace(/\s+/g, " ");
  if (!s) return null;
  const l1far = L1_FAR_ID.exec(s);
  if (l1far) {
    const roman = (l1far[2] ?? "").toLowerCase();
    const id = ROMAN.test(roman) ? L1_BY_ROMAN.get(roman) : undefined;
    if (!id) return null;
    if (level === 2) return { ok: false, reason: `${s} is a Level 1 requirement` };
    return { ok: true, controlId: id };
  }
  const farRoman = FAR_ITEM.exec(s)?.[1]?.toLowerCase();
  if (farRoman && ROMAN.test(farRoman)) {
    const id = L1_BY_ROMAN.get(farRoman);
    if (!id) return null;
    if (level === 2) return { ok: false, reason: `${s} is a Level 1 requirement` };
    return { ok: true, controlId: id };
  }
  const cmmc = CMMC_ID.exec(s);
  const nist = cmmc ? cmmc[3] : NIST_NUMBER.exec(s)?.[1];
  if (!nist) return null;
  if (!LEVEL2_BY_NIST_ID.has(nist))
    return { ok: false, reason: `${nist} is not a NIST SP 800-171 Rev. 2 requirement` };
  if (level === 2) {
    const def = LEVEL2_BY_NIST_ID.get(nist);
    return def ? { ok: true, controlId: def.id } : null;
  }
  const id = L1_BY_NIST.get(nist);
  if (!id)
    return {
      ok: false,
      reason: `${nist} is a Level 2 requirement, not one of the 15 Level 1 requirements`,
    };
  return { ok: true, controlId: id };
}

// ---- status ----

const STATUS_PHRASES: Record<string, ImplementationStatus> = {};
const phrases = (status: ImplementationStatus, list: string[]) => {
  for (const p of list) STATUS_PHRASES[p] = status;
};
phrases("implemented", [
  "implemented",
  "fully implemented",
  "met",
  "yes",
  "y",
  "compliant",
  "fully compliant",
  "complete",
  "completed",
  "in place",
  "satisfied",
  "pass",
  "passed",
]);
phrases("not_implemented", [
  "not implemented",
  "not met",
  "no",
  "n",
  "non compliant",
  "noncompliant",
  "not compliant",
  "planned",
  "planned to be implemented",
  "not started",
  "gap",
  "fail",
  "failed",
  "other than satisfied",
]);
phrases("partially_implemented", [
  "partially implemented",
  "partial",
  "partially",
  "partially met",
  "partially compliant",
  "in progress",
]);
phrases("not_applicable", ["n a", "na", "not applicable"]);
phrases("not_assessed", ["not assessed", "tbd", "to be determined", "not reviewed", "unknown"]);

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The status a cell names, or null when it names none of the phrases above. */
export function parseStatus(cell: string): ImplementationStatus | null {
  return STATUS_PHRASES[normalise(cell)] ?? null;
}

// ---- columns ----

export type ColumnKind = "id" | "status" | "owner" | "notes" | "statement";

const HEADER_HINTS: Record<Exclude<ColumnKind, "id">, RegExp> = {
  status: /\b(status|met|implemented|compliance|result|assessment)\b/,
  owner: /\b(owner|responsible|assigned|poc)\b/,
  notes: /\b(notes?|comments?|remarks?|gaps?|findings?)\b/,
  statement:
    /\b(implementation (statement|description|details?|narrative)|how (it is )?(implemented|met)|statement|narrative|implementation)\b/,
};

export interface ImportRow {
  /** 1-based line in the file. */
  line: number;
  controlId: string;
  status?: ImplementationStatus;
  /** E-mail address as written; the worker matches it to a member. */
  ownerEmail?: string;
  notes?: string;
  statement?: string;
}

export interface ImportIssue {
  line: number | null;
  message: string;
}

export interface ImportPlan {
  level: ImportLevel;
  /** Column header (or "column N") used for each kind, null if not found. */
  columns: Record<ColumnKind, string | null>;
  rows: ImportRow[];
  issues: ImportIssue[];
}

/**
 * Finds the requirement-id column by its contents (the column most of whose cells are ids), the
 * header row just above the first id, and the other columns by their headers. Status falls back to
 * contents when no header says "status".
 */
export function planImport(csv: string, level: ImportLevel): ImportPlan {
  const columns: Record<ColumnKind, string | null> = {
    id: null,
    status: null,
    owner: null,
    notes: null,
    statement: null,
  };
  const issues: ImportIssue[] = [];
  const plan: ImportPlan = { level, columns, rows: [], issues };
  if (csv.length > IMPORT_MAX_BYTES) {
    issues.push({
      line: null,
      message: "The file is over 1 MB. Save only the assessment sheet as CSV.",
    });
    return plan;
  }
  const table = parseCsv(csv);
  if (table.length > IMPORT_MAX_ROWS) {
    issues.push({
      line: null,
      message: `The file has over ${IMPORT_MAX_ROWS} rows. Save only the assessment sheet as CSV.`,
    });
    return plan;
  }
  const width = Math.max(0, ...table.map((r) => r.length));
  const cell = (r: number, c: number) => (table[r]?.[c] ?? "").trim();

  // The id column: most cells that resolve (ok or not) to a requirement id.
  let idCol = -1;
  let idHits = 0;
  for (let c = 0; c < width; c++) {
    let hits = 0;
    for (let r = 0; r < table.length; r++) if (resolveControlId(cell(r, c), level)) hits++;
    if (hits > idHits) {
      idCol = c;
      idHits = hits;
    }
  }
  if (idCol < 0) {
    issues.push({
      line: null,
      message:
        "No column of requirement ids was found. The sheet needs one column with ids such as AC.L2-3.1.1, 3.1.1 or (for Level 1) AC.L1-b.1.i.",
    });
    return plan;
  }
  const firstIdRow = table.findIndex((_, r) => resolveControlId(cell(r, idCol), level));
  // The header is the nearest row above the first id with two or more labels; a one-cell row there is
  // a title or a family heading ("Access Control"), not the header.
  const filled = (r: number) => (table[r] ?? []).filter((v) => v.trim()).length;
  let headerRow = -1;
  for (let r = firstIdRow - 1; r >= 0; r--) {
    if (filled(r) >= 2) {
      headerRow = r;
      break;
    }
  }
  const header = (c: number) => (headerRow >= 0 ? cell(headerRow, c) : "");
  const label = (c: number) => header(c) || `column ${c + 1}`;
  columns.id = label(idCol);

  const taken = new Set([idCol]);
  const byHeader = (kind: Exclude<ColumnKind, "id">) => {
    for (let c = 0; c < width; c++) {
      if (taken.has(c)) continue;
      const h = normalise(header(c));
      if (h && HEADER_HINTS[kind].test(h)) {
        taken.add(c);
        return c;
      }
    }
    return -1;
  };
  // Order matters: "Implementation statement" must not be taken as the status column.
  const statementCol = byHeader("statement");
  let statusCol = byHeader("status");
  const ownerCol = byHeader("owner");
  const notesCol = byHeader("notes");
  if (statusCol < 0) {
    let best = 0;
    for (let c = 0; c < width; c++) {
      if (taken.has(c)) continue;
      let hits = 0;
      for (let r = firstIdRow; r < table.length; r++) if (parseStatus(cell(r, c))) hits++;
      if (hits > best) {
        best = hits;
        statusCol = c;
      }
    }
  }
  if (statusCol >= 0) columns.status = label(statusCol);
  if (ownerCol >= 0) columns.owner = label(ownerCol);
  if (notesCol >= 0) columns.notes = label(notesCol);
  if (statementCol >= 0) columns.statement = label(statementCol);
  if (statusCol < 0 && notesCol < 0 && statementCol < 0 && ownerCol < 0) {
    issues.push({
      line: null,
      message:
        "Only a requirement id column was found: there is no status, owner, notes or implementation statement to import.",
    });
    return plan;
  }

  const seen = new Map<string, number>();
  for (let r = firstIdRow; r < table.length; r++) {
    const line = r + 1;
    const id = resolveControlId(cell(r, idCol), level);
    if (!id) continue; // section headings, blank rows, totals
    if (!id.ok) {
      issues.push({ line, message: id.reason });
      continue;
    }
    const prior = seen.get(id.controlId);
    if (prior !== undefined) {
      issues.push({
        line,
        message: `${id.controlId} is also on line ${prior}; only line ${prior} is imported. Merge the rows in the sheet if both matter.`,
      });
      continue;
    }
    seen.set(id.controlId, line);
    const row: ImportRow = { line, controlId: id.controlId };
    if (statusCol >= 0) {
      const raw = cell(r, statusCol);
      if (raw) {
        const status = parseStatus(raw);
        if (status) row.status = status;
        else
          issues.push({
            line,
            message: `"${raw.slice(0, 60)}" is not a status this import reads (implemented, partially implemented, not implemented, not applicable, met, not met); the status is left as it is.`,
          });
      }
    }
    if (ownerCol >= 0) {
      const raw = cell(r, ownerCol);
      if (raw) {
        const email = /[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/.exec(raw)?.[0];
        if (email) row.ownerEmail = email.toLowerCase();
        else
          issues.push({
            line,
            message: `Owner "${raw.slice(0, 60)}" has no e-mail address; owners are matched by e-mail.`,
          });
      }
    }
    const textCell = (c: number, what: string) => {
      if (c < 0) return undefined;
      const raw = (table[r]?.[c] ?? "").replace(/\r\n?/g, "\n").trim();
      if (!raw) return undefined;
      if (raw.length > TEXT_MAX) {
        issues.push({
          line,
          message: `The ${what} is over ${TEXT_MAX} characters; the first ${TEXT_MAX} are imported.`,
        });
        return raw.slice(0, TEXT_MAX);
      }
      return raw;
    };
    const notes = textCell(notesCol, "notes");
    if (notes) row.notes = notes;
    const statement = textCell(statementCol, "implementation statement");
    if (statement) row.statement = statement;
    if (row.status || row.ownerEmail || row.notes || row.statement) plan.rows.push(row);
  }
  if (!plan.rows.length && !issues.length) {
    issues.push({
      line: null,
      message:
        "Every requirement row is blank in the columns found, so there is nothing to import.",
    });
  }
  return plan;
}
