// Trimble Pay (formerly Flashtract): an invited subcontractor builds the contract's schedule of values by
// hand or with Bulk upload, which takes the Flashtract template the GC's Trimble Pay offers in its Upload
// Spreadsheet window. From Trimble's help, "SOV - Upload a Template" and "Set up a Schedule of Values"
// (invited subcontractors; read 2026-11-27):
//
// - "Fill out columns A, B, and C completely." "Leave the row 1 and row 2 headers unchanged."
//   "Don't put spaces between line items." "Don't add line item section headers." "Don't enter current
//   period values." Then select the file and "Create line items".
// - Line item values must sum to the current contract value, and every line needs a description;
//   otherwise "Schedule of values incomplete" shows on the contract. With accounting lines (cost code
//   groupings), the lines in each grouping must sum to that grouping's value.
//
// The help page does not name the three columns, so nothing here assumes their order: the person picks
// the template they downloaded, its two header rows are kept exactly, each of A, B and C is matched to
// item number, description or value from the header text (or chosen by hand), and the job's lines are
// written from row 3 with no blank rows, no section rows and no billing. Runs in the browser; nothing is
// uploaded. Not checked against a live Trimble Pay contract.
import { centsToDecimal } from "../money";
import { parseCsv } from "../sov-import/csv";
import type { Grid } from "../sov-import/xlsx";
import { writeXlsx, type XlsxCell } from "./xlsx-write";

export const TRIMBLE_PAY_HELP_URL =
  "https://help.trimble.com/en/trimble-pay/trimble-pay/invited-subcontractors/schedule-of-values/sov---upload-a-template";

export type TrimblePayRole = "item" | "description" | "value";
export const TRIMBLE_PAY_ROLES: TrimblePayRole[] = ["item", "description", "value"];

export interface TrimblePaySovLine {
  itemNumber: string;
  description: string;
  cents: number;
}

export interface TrimblePayTemplate {
  /** Rows 1 and 2 as the template has them, each at least three cells wide. */
  header: string[][];
  /** The header text of A, B and C (rows 1 and 2 joined), for the column pickers. */
  labels: [string, string, string];
  /** What A, B and C hold, read from the header text; null where the text says nothing clear. */
  roles: [TrimblePayRole | null, TrimblePayRole | null, TrimblePayRole | null];
  /** Non-empty rows below row 2 (example or old lines): the download replaces them. */
  existingRows: number;
  sheetName: string;
}

export type TrimblePayTemplateResult =
  | { ok: true; template: TrimblePayTemplate }
  | { ok: false; error: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** The role a header names, or null. Description first: "Line Description" is a description. */
export function roleFromHeader(text: string): TrimblePayRole | null {
  const t = norm(text);
  if (t === "") return null;
  if (/\bdesc|\bname\b|\bscope\b|\bwork item\b/.test(t)) return "description";
  if (/value|amount|\bprice\b|\bcost\b(?! code)|\btotal\b|\$|\bcontract\b|\bbudget\b/.test(t))
    return "value";
  if (/\bitem\b|\bno\b|\bnumber\b|#|\bcode\b|\bline\b|\bphase\b|\bid\b/.test(t)) return "item";
  return null;
}

/**
 * Roles for A, B and C: each header's own reading, kept only when no other column reads the same; when
 * two are known and distinct, the third is the one left.
 */
export function guessRoles(
  labels: [string, string, string],
): [TrimblePayRole | null, TrimblePayRole | null, TrimblePayRole | null] {
  const read = labels.map(roleFromHeader);
  const out = read.map((r) => (r && read.filter((x) => x === r).length === 1 ? r : null)) as [
    TrimblePayRole | null,
    TrimblePayRole | null,
    TrimblePayRole | null,
  ];
  const missing = out.map((r, i) => (r === null ? i : -1)).filter((i) => i >= 0);
  if (missing.length === 1) {
    const left = TRIMBLE_PAY_ROLES.find((r) => !out.includes(r));
    if (left) out[missing[0] as number] = left;
  }
  return out;
}

/** Reads the downloaded template's grid (first sheet of the .xlsx, or the CSV). Never throws. */
export function readTrimblePayGrid(grid: Grid, sheetName = "Sheet1"): TrimblePayTemplateResult {
  const rows = grid.map((r) => r.map((c) => c ?? ""));
  if (rows.every((r) => r.every((c) => c.trim() === "")))
    return { ok: false, error: "The file is empty." };
  const header = [rows[0] ?? [], rows[1] ?? []].map((r) => {
    const out = [...r];
    while (out.length < 3) out.push("");
    return out;
  });
  const [h1, h2] = header as [string[], string[]];
  if ([0, 1, 2].every((c) => (h1[c] ?? "").trim() === "" && (h2[c] ?? "").trim() === ""))
    return {
      ok: false,
      error:
        "Columns A to C of rows 1 and 2 are empty. Choose the Flashtract template from Trimble Pay's Upload Spreadsheet window.",
    };
  const labels = [0, 1, 2].map((c) =>
    [h1[c], h2[c]]
      .map((s) => (s ?? "").trim())
      .filter((s) => s !== "")
      .join(" / "),
  ) as [string, string, string];
  return {
    ok: true,
    template: {
      header,
      labels,
      // Row 2 sits on the data, so its text decides; row 1 (often a title across the sheet) only
      // where row 2 is blank.
      roles: guessRoles(
        [0, 1, 2].map((c) => (h2[c] ?? "").trim() || (h1[c] ?? "").trim()) as [
          string,
          string,
          string,
        ],
      ),
      existingRows: rows.slice(2).filter((r) => r.some((c) => c.trim() !== "")).length,
      sheetName,
    },
  };
}

/** Reads the template saved as CSV. Never throws. */
export function readTrimblePayCsv(text: string): TrimblePayTemplateResult {
  const src = text.replace(/^﻿/, "");
  if (src.trim() === "") return { ok: false, error: "The file is empty." };
  return readTrimblePayGrid(parseCsv(src));
}

/** True when A, B and C hold item number, description and value once each. */
export function rolesComplete(roles: (TrimblePayRole | null)[]): roles is TrimblePayRole[] {
  return TRIMBLE_PAY_ROLES.every((r) => roles.filter((x) => x === r).length === 1);
}

export interface TrimblePaySovCheck {
  lines: number;
  totalCents: number;
  contractCents: number;
  /** total minus the contract value: 0 when Trimble Pay will call the schedule complete. */
  diffCents: number;
  /** Lines with no description (Trimble Pay requires one on every line). */
  undescribed: number;
  /** Lines with no item number ("fill out columns A, B, and C completely"). */
  unnumbered: number;
  /** Item numbers used by more than one line. */
  duplicateNumbers: string[];
  /** Lines with a value of zero or less. */
  nonPositive: number;
}

export function checkTrimblePaySov(
  lines: TrimblePaySovLine[],
  contractCents: number,
): TrimblePaySovCheck {
  const totalCents = lines.reduce((s, l) => s + l.cents, 0);
  const seen = new Map<string, number>();
  for (const l of lines) {
    const n = l.itemNumber.trim();
    if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  return {
    lines: lines.length,
    totalCents,
    contractCents,
    diffCents: totalCents - contractCents,
    undescribed: lines.filter((l) => l.description.trim() === "").length,
    unnumbered: lines.filter((l) => l.itemNumber.trim() === "").length,
    duplicateNumbers: [...seen].filter(([, c]) => c > 1).map(([n]) => n),
    nonPositive: lines.filter((l) => l.cents <= 0).length,
  };
}

/**
 * The upload's rows: the template's rows 1 and 2 unchanged (every cell, past C too), then one row per line
 * in the job's order, A to C only, from row 3 with no blank rows. Throws when the roles are not complete.
 */
export function trimblePaySovRows(
  template: TrimblePayTemplate,
  roles: (TrimblePayRole | null)[],
  lines: TrimblePaySovLine[],
): XlsxCell[][] {
  if (!rolesComplete(roles)) throw new Error("Columns A, B and C need one role each.");
  const cell = (l: TrimblePaySovLine, r: TrimblePayRole): XlsxCell =>
    r === "item"
      ? l.itemNumber.trim() || null
      : r === "description"
        ? l.description.trim()
        : { number: Number(centsToDecimal(l.cents)) };
  return [
    ...template.header.map((r) => r.map((c): XlsxCell => (c === "" ? null : c))),
    ...lines.map((l) => roles.map((r) => cell(l, r))),
  ];
}

export function trimblePaySovWorkbook(
  template: TrimblePayTemplate,
  roles: (TrimblePayRole | null)[],
  lines: TrimblePaySovLine[],
): Uint8Array {
  const widths = roles.map((r) => (r === "description" ? 60 : 16));
  return writeXlsx(template.sheetName, trimblePaySovRows(template, roles, lines), widths);
}

const csvCell = (v: XlsxCell): string => {
  const s = v === null ? "" : typeof v === "string" ? v : String(v.number);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The same rows as CSV, for a template that was saved as CSV. */
export function trimblePaySovCsv(
  template: TrimblePayTemplate,
  roles: (TrimblePayRole | null)[],
  lines: TrimblePaySovLine[],
): string {
  return `${trimblePaySovRows(template, roles, lines)
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

/** A file name for the download: the job's number or name, made safe. */
export function trimblePaySovFileName(
  job: { number: string | null; name: string },
  ext: "xlsx" | "csv" = "xlsx",
): string {
  const base = (job.number?.trim() || job.name.trim() || "job")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "job"}-trimble-pay-sov.${ext}`;
}
