// RFC 4180 CSV (or tab-separated, or semicolon-separated as European Excel saves it) into a grid of cell text.
import type { Grid } from "./xlsx";

/** The delimiter of a CSV line: comma, tab or semicolon, whichever appears most outside quotes (comma on a tie). */
export function detectDelimiter(firstLine: string): string {
  // Count delimiters outside quotes on the first non-empty line; the most frequent wins, comma on a tie.
  const counts = new Map<string, number>([
    [",", 0],
    ["\t", 0],
    [";", 0],
  ]);
  let q = false;
  for (const c of firstLine) {
    if (c === '"') q = !q;
    else if (!q && counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = ",";
  for (const [d, n] of counts) if (n > (counts.get(best) ?? 0)) best = d;
  return best;
}

export function parseCsv(text: string): Grid {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n").find((l) => l.trim() !== "") ?? "";
  const delim = detectDelimiter(first);
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
