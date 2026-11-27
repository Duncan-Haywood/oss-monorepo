// The application's summary page (the G702 or the contractor's own "Application summary" sheet) when the workbook
// has one next to the continuation sheet. Read by its line labels, never by position: lines 4, 5a, 5b, 5 (total), 6,
// 7 and 8, plus the application number and period end. A mid-job start takes line 5a and line 6 from here, which the
// continuation sheet alone cannot give when materials are stored (its retainage column mixes 5a and 5b). Pure.
// A printed application (the PDF's summary page, `summaryPages` in pdf.ts) comes in as one sheet per page.
import { readDate, readMoney } from "./schedule";
import { colName, type Sheet } from "./xlsx";

/** A sheet to look for the summary in. A page of a PDF names its cells by page and line, and is `printed`. */
export interface SummarySheet extends Sheet {
  /** Where cell (r, c) is, for the notes and checks ("page 2, line 14"); default "cell H16". */
  where?: (r: number, c: number) => string;
  /**
   * A printed page: the amount is the first dollar figure right of the label (cents or a "$" printed), not the
   * last cell. A page can carry a second column of figures on the same line (the architect's certificate beside
   * the contractor's application on a G702), and a bare "10" after the label is a rate, not $10.00.
   */
  printed?: boolean;
}
const PRINTED_AMOUNT = /\d[.,]\d\d\)?$|\$/;

export type SummaryLine = "line4" | "line5a" | "line5b" | "line5" | "line6" | "line7" | "line8";

export interface G702Summary {
  sheet: string;
  /** Amounts in cents by line; null when the label was not found or its amount could not be read. */
  amounts: Record<SummaryLine, number | null>;
  /** Where each amount was read, e.g. "cell H16". */
  sources: Partial<Record<SummaryLine, string>>;
  /** Labelled lines whose amount could not be read, e.g. "line 5a (cell H16) is a formula with no saved result". */
  errors: string[];
  applicationNumber: number | null;
  periodTo: string | null;
}

const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

// Checked in order: a row is the first line whose label one of its cells matches. Line 6 and the 5a/5b rows mention
// retainage, so they come before the total. The total's label never carries a rate ("Retainage on work, %" is a rate).
const LINES: [SummaryLine, RegExp][] = [
  ["line6", /total earned less retain/i],
  ["line5a", /\bof completed work\b|^(line )?5\s?a\b/i],
  ["line5b", /\bof stored materials?\b|^(line )?5\s?b\b/i],
  ["line5", /^(5\.?\s*)?(total )?retain(age|ed)\b(?!.*(%|percent|\brate\b|on work|on stored))/i],
  ["line4", /total completed (and|&) stored to date/i],
  ["line7", /less previous certificates?/i],
  ["line8", /current payment due/i],
];
const APP = /^(pay )?application (no\.?|number|#)\s*:?$|^app(lication)?\.? ?(no\.?|#)\s*:?$/i;
const PERIOD = /^period( to| ending| end)?\s*:?$|^for (the )?period ending\s*:?$/i;
// Both in one ("Application no. / period to" over "3 / 2026-10-31", the free template's summary).
const APP_PERIOD = /^(pay )?application (no\.?|number|#)\s*\/\s*period( to| ending| end)?\s*:?$/i;
const LABEL_NAME: Record<SummaryLine, string> = {
  line4: "line 4",
  line5a: "line 5a",
  line5b: "line 5b",
  line5: "line 5",
  line6: "line 6",
  line7: "line 7",
  line8: "line 8",
};

function readSummary({ name, grid, where, printed }: SummarySheet): G702Summary {
  const at = where ?? ((r: number, c: number) => `cell ${colName(c)}${r + 1}`);
  const amounts: Record<SummaryLine, number | null> = {
    line4: null,
    line5a: null,
    line5b: null,
    line5: null,
    line6: null,
    line7: null,
    line8: null,
  };
  const sources: Partial<Record<SummaryLine, string>> = {};
  const errors: string[] = [];
  const seen = new Set<SummaryLine>();
  let applicationNumber: number | null = null;
  let periodTo: string | null = null;
  const rows = Math.min(grid.length, 200);
  for (let r = 0; r < rows; r++) {
    const row = (grid[r] ?? []).map(clean);
    for (let c = 0; c < row.length; c++) {
      const cell = row[c] ?? "";
      if (!cell) continue;
      // The application number and period end, as in the continuation sheet's title block.
      const inline = /:\s*(.+)$/.exec(cell)?.[1] ?? "";
      const labelOnly = inline ? cell.slice(0, cell.indexOf(":") + 1) : cell;
      const next = inline || (row.slice(c + 1).find((x) => x !== "") ?? "");
      if (applicationNumber === null && periodTo === null && APP_PERIOD.test(labelOnly)) {
        const m = /^#?(\d{1,3})\s*\/\s*(.+)$/.exec(next);
        if (m) {
          applicationNumber = Number(m[1]) >= 1 ? Number(m[1]) : null;
          periodTo = readDate(m[2] ?? "");
        }
        continue;
      }
      if (applicationNumber === null && APP.test(labelOnly)) {
        const n = Number(next.replace(/^#/, ""));
        if (Number.isInteger(n) && n >= 1 && n <= 999) applicationNumber = n;
        continue;
      }
      if (periodTo === null && PERIOD.test(labelOnly)) {
        periodTo = readDate(next);
        continue;
      }
      const line = LINES.find(([, re]) => re.test(cell))?.[0];
      if (!line) continue;
      if (seen.has(line)) break; // the first row with an amount wins (a later note that repeats the label is not a line)
      // The amount is the last cell to the right that reads as dollars; a rate ("10", "10%") sits before the label
      // or carries a percent sign, and the column notes ("Column D + E on G703") are not amounts.
      let error: string | null = null;
      const order = Array.from({ length: Math.max(0, row.length - c - 1) }, (_, i) =>
        printed ? c + 1 + i : row.length - 1 - i,
      );
      for (const k of order) {
        const v = row[k] ?? "";
        if (!v || /%/.test(v)) continue;
        if (printed && !PRINTED_AMOUNT.test(v)) continue;
        const m = readMoney(v);
        if ("cents" in m) {
          amounts[line] = m.cents;
          sources[line] = at(r, k);
          error = null;
          break;
        }
        if (/^#/.test(v)) error ??= `${LABEL_NAME[line]} (${at(r, k)}) ${m.error}`;
      }
      // A heading with no amount ("5. RETAINAGE:" above 5a and 5b) leaves the line open for a later row.
      if (amounts[line] !== null) seen.add(line);
      else if (error) {
        errors.push(error.replace(/ \(the file.*$|\. Open it.*$/, ""));
        seen.add(line);
      }
      break;
    }
  }
  return { sheet: name, amounts, sources, errors, applicationNumber, periodTo };
}

/**
 * The workbook's summary sheet, if one of the sheets other than the continuation sheet has the retainage or line 6
 * labels of an application summary. When more than one does, the one with the most lines found.
 */
export function findSummary(sheets: SummarySheet[]): G702Summary | null {
  let best: { s: G702Summary; score: number } | null = null;
  for (const sh of sheets) {
    const s = readSummary(sh);
    const keyLines = (["line5a", "line5b", "line5", "line6"] as const).filter(
      (k) => s.amounts[k] !== null || s.errors.some((e) => e.startsWith(`${LABEL_NAME[k]} `)),
    ).length;
    if (!keyLines) continue;
    const score = Object.values(s.amounts).filter((x) => x !== null).length + keyLines;
    if (!best || score > best.score) best = { s, score };
  }
  return best?.s ?? null;
}
