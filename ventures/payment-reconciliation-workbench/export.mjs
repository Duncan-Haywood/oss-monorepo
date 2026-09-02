// The review CSV is the artefact that leaves this tool: the operator opens it
// in Excel, Sheets, or LibreOffice and works the exceptions from there. Keeping
// it out of app.mjs means the file the bookkeeper actually receives is testable
// without a browser — including the parts that are security-relevant.

import { explanation } from './reconcile.mjs';

export const REVIEW_HEADER = 'status,payout_date,deposit_date,amount_cents,deposit_count,difference_cents,what_to_check';

/**
 * Quote a free-text cell, and neutralise one a spreadsheet would evaluate.
 *
 * Date cells come straight out of the visitor's own CSV, so a crafted
 * processor export can put `=...` in front of the spreadsheet this file is
 * opened in, where a leading = + - or @ starts a formula. A leading apostrophe
 * is the standard inert prefix: the spreadsheet consumes it and shows the
 * literal text.
 */
export function csvCell(value) {
  const raw = String(value ?? '');
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Numeric cells are produced by this module, never typed by a visitor, so they
 * skip the formula guard. A negative difference legitimately opens with "-",
 * and prefixing it would turn a figure the recipient needs to sum into text.
 */
export function csvNumber(value) {
  return value === '' || value === null || value === undefined ? '' : String(value);
}

function depositDates(match) {
  const deposits = match.deposits || (match.deposit ? [match.deposit] : []);
  return deposits.map(deposit => deposit.date).filter(Boolean).join(' + ') || match.deposit?.date || '';
}

/** The full review queue as a CSV string, one row per reconciliation outcome. */
export function reviewCsv(matches) {
  const rows = matches.map(match => [
    csvCell(match.status),
    csvCell(match.payout?.date || ''),
    csvCell(depositDates(match)),
    csvNumber((match.payout || match.deposit).cents),
    csvNumber(match.deposits?.length || 0),
    csvNumber(match.hint ? match.hint.difference : ''),
    csvCell(explanation(match)),
  ].join(','));
  return [REVIEW_HEADER, ...rows].join('\n');
}

export { depositDates };
