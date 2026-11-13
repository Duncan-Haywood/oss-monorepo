// CSV reading and column guessing for the Benford audit. No dependencies.
import { parseAmount } from './benford.mjs';

/** Guess the delimiter from the first line: comma, semicolon or tab. */
export function sniffDelimiter(text) {
  const line = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',';
}

/** RFC 4180 parser: quoted fields, doubled quotes, CRLF, a BOM. */
export function parseCsv(text, delimiter = sniffDelimiter(text)) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

const AMOUNT_NAMES = /^(amount|amt|total|net|gross|value|debit|credit|payment|paid|invoice[ _]?amount|transaction[ _]?amount|expense|cost|price|sum|charge)s?$/i;
const AMOUNT_HINT = /amount|total|debit|credit|paid|payment|expense|cost|charge|value/i;
const GROUP_NAMES = /^(vendor|supplier|payee|merchant|employee|cardholder|card[ _]?holder|name|customer|account|cost[ _]?cent(er|re)|department|approver|submitted[ _]?by|user)s?([ _]?name)?$/i;
const GROUP_HINT = /vendor|supplier|payee|merchant|employee|cardholder|holder|approver|department|account/i;

/** Pick the most likely amount column and group column from the header and the data. */
export function guessColumns(header, body) {
  const sample = body.slice(0, 500);
  const numericShare = header.map((_, c) => {
    const vals = sample.map((r) => r[c]).filter((v) => v !== undefined && String(v).trim() !== '');
    if (!vals.length) return 0;
    return vals.filter((v) => parseAmount(v) !== null && !/^\d{4}-\d{2}-\d{2}/.test(String(v).trim())).length / vals.length;
  });
  let amount = header.findIndex((h) => AMOUNT_NAMES.test(h.trim()) && numericShare[header.indexOf(h)] > 0.5);
  if (amount < 0) amount = header.findIndex((h, c) => AMOUNT_HINT.test(h) && numericShare[c] > 0.5);
  if (amount < 0) {
    // The numeric column with the widest spread of values, skipping id-like ones.
    let best = -1;
    let bestScore = -1;
    header.forEach((h, c) => {
      if (numericShare[c] < 0.8 || /(^|_|\b)(id|no|number|zip|code|year|qty|quantity)$/i.test(h.trim())) return;
      const distinct = new Set(sample.map((r) => r[c])).size;
      if (distinct > bestScore) { best = c; bestScore = distinct; }
    });
    amount = best;
  }
  let group = header.findIndex((h, c) => c !== amount && GROUP_NAMES.test(h.trim()));
  if (group < 0) group = header.findIndex((h, c) => c !== amount && GROUP_HINT.test(h) && numericShare[c] < 0.5);
  return { amount, group };
}

/**
 * Read CSV text into audit records.
 * @returns {{header:string[], records:{row:number, amount:number|null, group:string, raw:string}[], amountColumn:number, groupColumn:number}}
 */
export function readLedger(text, { amountColumn, groupColumn } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) return { header: [], records: [], amountColumn: -1, groupColumn: -1 };
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1);
  const guess = guessColumns(header, body);
  const a = amountColumn ?? guess.amount;
  const g = groupColumn ?? guess.group;
  const records = body.map((r, i) => ({
    row: i + 2, // spreadsheet row number, header is row 1
    amount: a >= 0 ? parseAmount(r[a]) : null,
    group: g >= 0 ? String(r[g] ?? '').trim() : '',
    raw: a >= 0 ? String(r[a] ?? '') : '',
  }));
  return { header, records, amountColumn: a, groupColumn: g };
}

// Formula-injection guard: a vendor name like "=HYPERLINK(...)" from the
// user's own file must not run when the export is opened in a spreadsheet.
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The flagged-records list as CSV for the auditor's workpapers. */
export function flaggedToCsv(flagged) {
  const lines = [['row', 'amount', 'group', 'tests_flagging', 'reasons'].join(',')];
  for (const f of flagged) lines.push([f.row, f.amount, f.group, f.score, f.reasons.join('; ')].map(csvCell).join(','));
  return lines.join('\n') + '\n';
}
