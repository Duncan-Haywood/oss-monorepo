// The review CSV is what actually leaves the browser: an AP clerk opens it and
// works the flagged pairs from there, so it is tested on its own rather than
// only through app.mjs.

import { money } from './detect.mjs';

export const REVIEW_HEADER = 'confidence,tier,vendor,row_a,date_a,invoice_a,row_b,date_b,invoice_b,amount,note';

/**
 * Quote a free-text cell, and neutralise one a spreadsheet would evaluate.
 *
 * Vendor and invoice values come straight out of the visitor's own CSV, so a
 * crafted ledger export can put `=...` in front of the spreadsheet this
 * review file is opened in, where a leading = + - or @ starts a formula. A
 * leading apostrophe is the standard inert prefix: the spreadsheet consumes
 * it and shows the literal text.
 */
export function csvCell(value) {
  const raw = String(value ?? '');
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The full flagged-pair list as a CSV string, one row per suspected duplicate. */
export function reviewCsv(flags) {
  const rows = flags.map(flag => [
    csvCell(flag.confidence),
    csvCell(flag.tier),
    csvCell(flag.a.vendor),
    String(flag.a.row),
    csvCell(flag.a.date),
    csvCell(flag.a.invoice),
    String(flag.b.row),
    csvCell(flag.b.date),
    csvCell(flag.b.invoice),
    money(flag.a.cents),
    csvCell(flag.reason),
  ].join(','));
  return [REVIEW_HEADER, ...rows].join('\n');
}
