// Copied from apps/payapps (src/shared/sov-import/csv.ts, 2026-11-25) for the rate-card import.
// RFC 4180 CSV (or tab-separated, or semicolon-separated as European Excel saves it) into a grid of cell text.
import type { Grid } from "./xlsx";

/**
 * The delimiter: the one found (outside quotes) on the most of the first 30 non-empty lines; on a tie
 * tab, then semicolon, then comma, because commas also turn up inside cells ("Haas VF-2, left bay",
 * "$1,095.00") and decimal commas sit inside semicolon files. Looking past the first line matters for
 * a paste from a sheet whose first line is a bare title with no delimiter at all. Changed from
 * apps/payapps' copy, which counts the first line only.
 */
function delimiter(lines: string[]): string {
  const order = ["\t", ";", ","];
  const seen = new Map<string, number>(order.map((d) => [d, 0]));
  for (const line of lines) {
    const found = new Set<string>();
    let q = false;
    for (const c of line) {
      if (c === '"') q = !q;
      else if (!q && seen.has(c)) found.add(c);
    }
    for (const d of found) seen.set(d, (seen.get(d) ?? 0) + 1);
  }
  let pick = ",";
  let most = 0;
  for (const d of order) {
    const n = seen.get(d) ?? 0;
    if (n > most) {
      pick = d;
      most = n;
    }
  }
  return pick;
}

export function parseCsv(text: string): Grid {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delim = delimiter(
    src
      .split("\n")
      .filter((l) => l.trim() !== "")
      .slice(0, 30),
  );
  const rows: Grid = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines are kept as empty rows so row numbers in messages match the file's line numbers.
  return rows.map((r) => (r.every((x) => x.trim() === "") ? [] : r));
}
