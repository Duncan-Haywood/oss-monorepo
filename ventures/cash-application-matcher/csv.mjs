// CSV reading, column detection, money and date parsing for the cash
// application matcher. No dependencies, so the same file runs in the browser
// and under Node.

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, comma/semicolon/tab. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, countOutsideQuotes(firstLine, d)]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function countOutsideQuotes(line, d) {
  let n = 0;
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === d && !q) n++;
  }
  return n;
}

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Header names seen in AR aging and bank exports, most specific first.
export const INVOICE_COLUMNS = {
  id: ['invoice number', 'invoice no', 'invoice num', 'invoice id', 'invoice', 'inv no', 'inv', 'num', 'number', 'doc number', 'document number', 'reference', 'ref'],
  customer: ['customer name', 'customer', 'client name', 'client', 'bill to', 'account name', 'name', 'debtor', 'payer'],
  date: ['invoice date', 'date issued', 'issue date', 'txn date', 'transaction date', 'date', 'doc date'],
  due: ['due date', 'due', 'payment due'],
  amount: ['open balance', 'balance due', 'amount due', 'open amount', 'balance', 'outstanding', 'amount outstanding', 'open', 'amount', 'total'],
  terms: ['terms', 'payment terms', 'term'],
};

export const RECEIPT_COLUMNS = {
  id: ['transaction id', 'bank reference', 'id', 'fitid', 'receipt id', 'receipt number'],
  date: ['posting date', 'posted date', 'value date', 'booking date', 'transaction date', 'date', 'received', 'deposit date'],
  amount: ['credit', 'credit amount', 'deposit', 'amount received', 'received amount', 'money in', 'paid in', 'amount'],
  payer: ['payer', 'payer name', 'remitter', 'originator', 'counterparty', 'counterparty name', 'from', 'name', 'customer'],
  reference: ['remittance information', 'remittance info', 'remittance', 'payment reference', 'reference', 'memo', 'description', 'details', 'narrative', 'notes', 'addenda'],
};

/** Map each wanted field to a column index by header name; exact match first, then contains. */
export function detectColumns(header, wanted) {
  const h = header.map(norm);
  const used = new Set();
  const out = {};
  for (const [field, names] of Object.entries(wanted)) {
    let idx = -1;
    for (const name of names) {
      idx = h.findIndex((x, i) => !used.has(i) && x === name);
      if (idx >= 0) break;
    }
    if (idx < 0) {
      for (const name of names) {
        if (name.length < 4) continue;
        idx = h.findIndex((x, i) => !used.has(i) && x.includes(name));
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) { out[field] = idx; used.add(idx); }
  }
  return out;
}

/**
 * Money to integer cents. Accepts "$1,234.56", "1.234,56", "(12.00)", "-12",
 * "12.00 CR", "1 234,56". Returns null when nothing numeric is present.
 */
export function parseMoney(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/\([^()]*\d[^()]*\)/.test(s)) { neg = true; s = s.replace(/[()]/g, ""); }
  if (/\bDR\b/i.test(s)) neg = true;
  s = s.replace(/\b(CR|DR)\b/gi, '');
  if (/^[^0-9]*-/.test(s) || /-\s*$/.test(s)) neg = true;
  s = s.replace(/[^0-9.,]/g, '');
  if (!/[0-9]/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart;
  let frac = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    intPart = s.slice(0, dec).replace(/[.,]/g, '');
    frac = s.slice(dec + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const pos = Math.max(lastDot, lastComma);
    const after = s.slice(pos + 1);
    const count = s.split(sep).length - 1;
    // "1,234" or "1.234.567" are thousands groupings; "12,5" or "12.50" are decimals.
    if (count === 1 && after.length !== 3) { intPart = s.slice(0, pos); frac = after; }
    else if (count === 1 && after.length === 3 && sep === '.' && /^0/.test(s)) { intPart = s.slice(0, pos); frac = after; }
    else { intPart = s.replace(/[.,]/g, ''); }
  } else intPart = s;
  frac = (frac + '00').slice(0, 3);
  let cents = Number(intPart || '0') * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return neg ? -cents : cents;
}

export const fmtMoney = (cents) => {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
};

/**
 * Dates to a day number (days since 1970-01-01, UTC). ISO, "MM/DD/YYYY"
 * (or day-first when dayFirst is set), "DD.MM.YYYY", "15 Mar 2026",
 * "Mar 15, 2026". Returns null when unreadable.
 */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseDate(raw, { dayFirst = false } = {}) {
  const s = String(raw ?? '').trim();
  let y; let m; let d;
  let r;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/))) [y, m, d] = [r[1], r[2], r[3]].map(Number);
  else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [r[1], r[2], r[3]].map(Number);
  else if ((r = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/))) [d, m, y] = [r[1], r[2], r[3]].map(Number);
  else if ((r = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/))) {
    const [a, b, c] = [r[1], r[2], r[3]].map(Number);
    if (a > 12) [d, m] = [a, b];
    else if (b > 12) [m, d] = [a, b];
    else if (dayFirst) [d, m] = [a, b];
    else [m, d] = [a, b];
    y = c;
  } else if ((r = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -,]*(\d{4}|\d{2})(?!\d)/))) {
    d = Number(r[1]); m = MONTHS[r[2].toLowerCase()]; y = Number(r[3]);
  } else if ((r = s.match(/^([A-Za-z]{3})[A-Za-z]* (\d{1,2}),? (\d{4}|\d{2})(?!\d)/))) {
    m = MONTHS[r[1].toLowerCase()]; d = Number(r[2]); y = Number(r[3]);
  } else return null;
  if (y < 100) y += 2000;
  if (!m || m > 12 || !d || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}

export const fmtDate = (day) => (day == null ? '' : new Date(day * 86400000).toISOString().slice(0, 10));

/** Read an AR open-invoice export. Returns { invoices, warnings }. */
export function readInvoices(text, opts = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { invoices: [], warnings: ['The invoice file has no data rows.'] };
  const cols = detectColumns(rows[0], INVOICE_COLUMNS);
  const warnings = [];
  for (const f of ['id', 'amount']) if (cols[f] == null) warnings.push(`No ${f === 'id' ? 'invoice number' : 'open amount'} column found in the invoice file (headers: ${rows[0].join(', ')}).`);
  if (cols.id == null || cols.amount == null) return { invoices: [], warnings };
  const invoices = [];
  rows.slice(1).forEach((r, i) => {
    const amount = parseMoney(r[cols.amount]);
    const id = String(r[cols.id] ?? '').trim();
    if (!id || amount == null) { warnings.push(`Invoice row ${i + 2} skipped: missing number or amount.`); return; }
    if (amount <= 0) return; // credits and paid lines are not open receivables
    invoices.push({
      id,
      customer: cols.customer != null ? String(r[cols.customer] ?? '').trim() : '',
      date: cols.date != null ? parseDate(r[cols.date], opts) : null,
      due: cols.due != null ? parseDate(r[cols.due], opts) : null,
      amount,
      terms: cols.terms != null ? String(r[cols.terms] ?? '').trim() : '',
    });
  });
  return { invoices, warnings };
}

/** Read a bank export of incoming payments. Debits (negative) are dropped. */
export function readReceipts(text, opts = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { receipts: [], warnings: ['The bank file has no data rows.'] };
  const cols = detectColumns(rows[0], RECEIPT_COLUMNS);
  const warnings = [];
  if (cols.amount == null) return { receipts: [], warnings: [`No amount column found in the bank file (headers: ${rows[0].join(', ')}).`] };
  if (cols.payer == null && cols.reference == null) warnings.push('No payer or reference column found: matching will rely on amounts alone.');
  const receipts = [];
  rows.slice(1).forEach((r, i) => {
    const amount = parseMoney(r[cols.amount]);
    if (amount == null || amount <= 0) return;
    receipts.push({
      id: cols.id != null && String(r[cols.id] ?? '').trim() ? String(r[cols.id]).trim() : `row ${i + 2}`,
      date: cols.date != null ? parseDate(r[cols.date], opts) : null,
      amount,
      payer: cols.payer != null ? String(r[cols.payer] ?? '').trim() : '',
      reference: cols.reference != null ? String(r[cols.reference] ?? '').trim() : '',
    });
  });
  return { receipts, warnings };
}
