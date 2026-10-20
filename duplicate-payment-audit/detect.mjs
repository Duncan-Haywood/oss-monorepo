// Core matching engine for the duplicate-payment audit. Kept free of the DOM
// so it is testable with plain `node --test` and reusable if a CLI wrapper is
// ever added.
//
// Three independent hashmap passes, each O(n) or O(n log n) rather than one
// O(n^2) all-pairs scan across the whole ledger -- the grouping key itself
// (same vendor, and for two of the three passes, same amount) is what a real
// duplicate payment always shares, so grouping by it first turns "compare
// everything to everything" into "compare only the handful of rows that could
// possibly be a match."

const VENDOR_NAMES = ['vendor', 'vendor_name', 'payee', 'supplier', 'supplier_name'];
const AMOUNT_NAMES = ['amount', 'amount_paid', 'payment_amount', 'net', 'total', 'check_amount', 'paid_amount'];
const DATE_NAMES = ['date', 'payment_date', 'check_date', 'paid_date', 'transaction_date', 'date_paid'];
const INVOICE_NAMES = ['invoice', 'invoice_number', 'invoice_no', 'inv_number', 'invoice_num', 'bill_number'];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
      row = []; cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  if (rows.length < 2) throw new Error('CSV must include a header and at least one payment row.');
  return { headers: rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_')), rows: rows.slice(1) };
}

function column(headers, names) { return headers.findIndex(h => names.includes(h)); }

// A blank cell or a bare currency symbol strips down to an empty string, and
// `Number('')` is 0 rather than NaN -- without the digit check a missing
// amount would silently become a real $0.00 payment instead of the invalid-row
// error this tool promises.
function cents(value) { const clean = String(value).replace(/[$€£,\s]/g, ''); if (!/\d/.test(clean)) return NaN; const number = Number(clean); return Number.isFinite(number) ? Math.round(number * 100) : NaN; }
function dateValue(value) { const parsed = Date.parse(value); return Number.isNaN(parsed) ? NaN : parsed; }

export function normalizeVendor(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeInvoice(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Bounded edit distance between two short strings (invoice numbers). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let previous = Array.from({ length: n + 1 }, (_, index) => index);
  for (let i = 1; i <= m; i += 1) {
    const current = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[n];
}

/**
 * Parse the payment ledger CSV into normalized records.
 *
 * Vendor, amount, and date columns are required; invoice/reference is
 * optional -- some AP exports don't carry one, and the tool still runs the
 * same-amount/near-date check without it.
 */
export function readRecords(text) {
  const csv = parseCsv(text);
  const vendorIndex = column(csv.headers, VENDOR_NAMES);
  const amountIndex = column(csv.headers, AMOUNT_NAMES);
  const dateIndex = column(csv.headers, DATE_NAMES);
  const invoiceIndex = column(csv.headers, INVOICE_NAMES);
  if (vendorIndex < 0 || amountIndex < 0 || dateIndex < 0) {
    throw new Error('CSV needs recognizable vendor, amount, and date columns.');
  }
  const records = csv.rows.map((row, index) => {
    const vendor = row[vendorIndex] || '';
    const invoice = invoiceIndex >= 0 ? (row[invoiceIndex] || '') : '';
    return {
      row: index + 2,
      vendor,
      vendorKey: normalizeVendor(vendor),
      invoice,
      invoiceKey: normalizeInvoice(invoice),
      date: row[dateIndex],
      time: dateValue(row[dateIndex]),
      cents: cents(row[amountIndex]),
    };
  });
  if (!records.length || records.some(r => !r.vendorKey || !Number.isFinite(r.time) || !Number.isFinite(r.cents))) {
    throw new Error('CSV contains a row with a missing vendor, or an invalid date or amount.');
  }
  return { records, hasInvoiceColumn: invoiceIndex >= 0 };
}

const DAY = 86400000;
// A group sharing a vendor and an exact payment amount is already a narrow
// slice of a real ledger; this only guards the pathological case (years of an
// identical recurring amount) from quadratic edit-distance comparisons.
const MAX_TYPO_GROUP = 200;
const MAX_EDIT_DISTANCE = 2;

function pairKey(a, b) { return a.row < b.row ? `${a.row}:${b.row}` : `${b.row}:${a.row}`; }

/**
 * Flag likely duplicate or double payments in a parsed ledger.
 *
 * Three passes, each grouping by the key a real duplicate would share so only
 * plausible pairs are ever compared:
 *
 * 1. Same vendor + same invoice number -> same amount is an exact duplicate
 *    submission; a different amount is a possible partial payment or
 *    data-entry error on one of the two.
 * 2. Same vendor + same amount, invoice numbers a likely typo of each other
 *    (edit distance <= 2) -> probably the same invoice entered twice.
 * 3. Same vendor + same amount, landing within `dateWindowDays` of each other,
 *    with no invoice match above -> two payments that could be the same bill
 *    paid twice under separate references, or could be a legitimate recurring
 *    charge; the tool cannot tell the two apart and says so.
 */
export function detectDuplicates(records, { dateWindowDays = 7 } = {}) {
  const flags = [];
  const seenPairs = new Set();
  function addFlag(a, b, tier, confidence, reason) {
    const key = pairKey(a, b);
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    flags.push({ a, b, tier, confidence, reason });
  }

  // Pass 1: same vendor + same invoice number.
  const byVendorInvoice = new Map();
  for (const record of records) {
    if (!record.invoiceKey) continue;
    const key = `${record.vendorKey}|${record.invoiceKey}`;
    if (!byVendorInvoice.has(key)) byVendorInvoice.set(key, []);
    byVendorInvoice.get(key).push(record);
  }
  for (const group of byVendorInvoice.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [a, b] = [group[i], group[j]];
        if (a.cents === b.cents) {
          addFlag(a, b, 'exact-duplicate', 'high',
            `${a.vendor}: invoice ${a.invoice || a.invoiceKey} was paid twice for the same amount ($${money(a.cents)}) — on ${a.date} and ${b.date}.`);
        } else {
          addFlag(a, b, 'same-invoice-different-amount', 'medium',
            `${a.vendor}: invoice ${a.invoice || a.invoiceKey} was paid twice at different amounts ($${money(a.cents)} on ${a.date}, $${money(b.cents)} on ${b.date}) — check for a partial payment or a data-entry error.`);
        }
      }
    }
  }

  // Passes 2 and 3 share a grouping by vendor + exact amount.
  const byVendorAmount = new Map();
  for (const record of records) {
    const key = `${record.vendorKey}|${record.cents}`;
    if (!byVendorAmount.has(key)) byVendorAmount.set(key, []);
    byVendorAmount.get(key).push(record);
  }
  for (const group of byVendorAmount.values()) {
    if (group.length < 2) continue;

    // Pass 2: near-identical invoice numbers within the same amount group.
    if (group.length <= MAX_TYPO_GROUP) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const [a, b] = [group[i], group[j]];
          if (!a.invoiceKey || !b.invoiceKey || a.invoiceKey === b.invoiceKey) continue;
          const distance = levenshtein(a.invoiceKey, b.invoiceKey);
          if (distance > 0 && distance <= MAX_EDIT_DISTANCE) {
            addFlag(a, b, 'near-duplicate-invoice', 'high',
              `${a.vendor}: invoices ${a.invoice} and ${b.invoice} are nearly identical and both were paid $${money(a.cents)} — check whether this is the same invoice entered twice.`);
          }
        }
      }
    }

    // Pass 3: same amount, close together in time, no invoice link above.
    const sorted = [...group].sort((x, y) => x.time - y.time);
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const [a, b] = [sorted[i], sorted[j]];
        const gapDays = Math.abs(b.time - a.time) / DAY;
        if (gapDays > dateWindowDays) break; // sorted by time, nothing further qualifies
        if (seenPairs.has(pairKey(a, b))) continue; // already explained by an invoice-based tier
        if (a.invoiceKey && b.invoiceKey && a.invoiceKey === b.invoiceKey) continue; // pass 1 covers this
        const days = Math.round(gapDays * 10) / 10;
        const invoiceNote = a.invoice && b.invoice ? ` under different invoice numbers (${a.invoice}, ${b.invoice})` : '';
        addFlag(a, b, 'same-amount-near-date', 'review',
          `${a.vendor}: two payments of $${money(a.cents)} landed ${days} day${days === 1 ? '' : 's'} apart${invoiceNote} — verify these are separate bills, not the same charge submitted twice. If this vendor is paid this amount on a regular schedule (rent, a subscription, a retainer), this is likely expected.`);
      }
    }
  }

  const rank = { high: 0, medium: 1, review: 2 };
  return flags.sort((x, y) => (rank[x.confidence] - rank[y.confidence]) || (x.a.row - y.a.row));
}

export function money(centsValue) { return (centsValue / 100).toFixed(2); }
