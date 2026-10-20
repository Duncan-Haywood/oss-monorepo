// Shared CSV helpers for cut-list-optimizer's plan exports.
//
// Piece and part labels come straight from what a visitor typed into the
// parts/cuts textarea, so they are free text a spreadsheet could try to
// execute as a formula (`=cmd|'/c calc'!A0`, `-2+3`, `@SUM(...)`) or that
// could break a naive comma split (a label containing a comma or a quote).
// Every CSV export in this venture goes through `csvCell` for exactly that
// reason — a plan a shop pastes into Excel or Sheets should never run code
// it didn't ask for.

/** Quote a free-text cell and neutralise a leading formula trigger. */
export function csvCell(value) {
  const raw = String(value ?? '');
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Numeric cells this venture computes itself (lengths, coordinates) never
 * need the formula guard — only text a visitor typed does.
 */
export function csvNumber(value) {
  return value === '' || value === null || value === undefined ? '' : String(value);
}

/** Joins a header row and data rows of already-escaped cells into one CSV string. */
export function toCSV(header, rows) {
  return [header, ...rows].map((row) => row.join(',')).join('\r\n') + '\r\n';
}
