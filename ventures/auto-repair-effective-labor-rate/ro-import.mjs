/**
 * Turn a repair-order labor export into the five figures the calculator asks for.
 *
 * The calculator's twelve inputs are the part a shop does not have to hand: a
 * management system reports labor sales and hours, but per repair order and per
 * line, never as the month's three totals split by who paid. This reads that
 * line-level export (CSV, or cells pasted straight from a spreadsheet) and does
 * the splitting, so the visitor checks a table instead of adding up a column.
 *
 * ## Load-bearing decisions
 *
 * **A row it cannot classify is reported, never guessed.** Pay type decides
 * which of three buckets an hour lands in, and a wrong bucket moves the whole
 * gap decomposition. Rows with an unrecognised pay type, a non-number or a
 * negative hour are counted in `skipped` with the line number and reason, and
 * left out of every total. A silent best guess would produce a clean-looking
 * month that no report the shop already runs could reproduce.
 *
 * **Fleet, wholesale, insurance and coupon work are customer pay.** They are
 * the discounting the calculator exists to expose, so they stay in the
 * customer-pay bucket where the shortfall is attributed to pricing.
 *
 * **Negative dollars are allowed, negative hours are not.** A credit or a
 * refunded line legitimately reduces labor sales; a negative hour has no
 * meaning in a billed-hours total and is almost always a sign error.
 *
 * Nothing here leaves the device. It is arithmetic on a pasted export.
 */

const BUCKETS = Object.freeze(['customerPay', 'warranty', 'internal']);

const HEADER_ALIASES = Object.freeze({
  payType: ['pay type', 'paytype', 'labor type', 'labortype', 'type', 'pay', 'sale type', 'charge type', 'work type'],
  hours: ['hours', 'billed hours', 'hours billed', 'book hours', 'book time', 'flat hours', 'labor hours', 'hrs', 'sold hours'],
  sales: ['labor sales', 'labor $', 'labor amount', 'labor total', 'labor', 'amount', 'sales', 'labor revenue', 'total', 'extended'],
  tech: ['tech', 'technician', 'tech name', 'tech id', 'mechanic'],
  clock: ['clock hours', 'actual hours', 'actual time', 'time clocked', 'clocked hours', 'clock time'],
});

const WARRANTY_WORDS = ['warrant', 'wty', 'wrty', 'factory', 'recall', 'goodwill', 'extended', 'service contract', 'contract'];
const INTERNAL_WORDS = ['internal', 'comeback', 'come back', 'policy', 'shop use', 'shop vehicle', 'demo', 'no charge', 'nocharge', 'redo', 'rework'];
const CUSTOMER_WORDS = ['customer', 'cust', 'retail', 'cp', 'c/p', 'fleet', 'wholesale', 'insurance', 'coupon', 'special', 'paid', 'diag'];

function norm(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

/** Classify a pay-type cell, or return null if it is not one of the three. */
export function classifyPayType(cell) {
  const text = norm(cell);
  if (!text) return null;
  // Warranty and internal are checked first: "extended warranty" must not
  // become customer pay because it also contains a customer-ish word.
  if (WARRANTY_WORDS.some((w) => text.includes(w))) return 'warranty';
  if (INTERNAL_WORDS.some((w) => text.includes(w))) return 'internal';
  if (text === 'i' || text === 'int') return 'internal';
  if (text === 'w' || text === 'wty') return 'warranty';
  if (CUSTOMER_WORDS.some((w) => text === w || text.includes(w))) return 'customerPay';
  return null;
}

/** Parse "$1,234.50", "(120.00)" and "-5" into a number, or NaN. */
export function parseNumber(cell) {
  let text = String(cell ?? '').trim();
  if (text === '') return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[$,\s]/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return NaN;
  const value = Number(text);
  return negative ? -value : value;
}

/** Split text into rows of cells: tab-separated when tabs appear, else commas; quotes honoured. */
export function parseTable(text) {
  const source = String(text ?? '').replace(/^﻿/, '');
  const delimiter = source.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function findColumns(header) {
  const names = header.map(norm);
  const found = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    // Exact alias match wins over a partial one, in alias priority order.
    let index = -1;
    for (const alias of aliases) {
      index = names.indexOf(alias);
      if (index !== -1) break;
    }
    if (index !== -1) found[key] = index;
  }
  return found;
}

const emptyBucket = () => ({ hours: 0, sales: 0, lines: 0 });

/**
 * Read an export and total it.
 *
 * Returns `{ ok: false, error }` when the header cannot be understood, else
 * `{ ok: true, totals, byTech, skipped, lines, fields }` where `fields` holds
 * the values to place in the calculator's inputs (as strings, rounded to the
 * precision the inputs accept).
 */
export function importRepairOrders(text) {
  const table = parseTable(text);
  if (table.length < 2) return { ok: false, error: 'Paste a header row and at least one line, with columns for pay type, hours billed and labor sales.' };
  const cols = findColumns(table[0]);
  const missing = ['payType', 'hours', 'sales'].filter((k) => cols[k] === undefined);
  if (missing.length > 0) {
    const labels = { payType: 'pay type', hours: 'hours billed', sales: 'labor sales' };
    return { ok: false, error: `The header row has no column for ${missing.map((k) => labels[k]).join(', ')}. Rename the header cells or add them; the first row must be the column names.` };
  }

  const totals = { customerPay: emptyBucket(), warranty: emptyBucket(), internal: emptyBucket() };
  const byTech = new Map();
  const skipped = [];
  let clockHours = 0;
  let clockSeen = false;

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const cells = table[r];
    const bucket = classifyPayType(cells[cols.payType]);
    if (!bucket) {
      skipped.push({ line, reason: `pay type "${String(cells[cols.payType] ?? '').trim()}" is not customer pay, warranty or internal` });
      continue;
    }
    const hours = parseNumber(cells[cols.hours]);
    if (!Number.isFinite(hours) || hours < 0) {
      skipped.push({ line, reason: `hours "${String(cells[cols.hours] ?? '').trim()}" is not a number of zero or more` });
      continue;
    }
    const sales = bucket === 'internal' && String(cells[cols.sales] ?? '').trim() === '' ? 0 : parseNumber(cells[cols.sales]);
    if (!Number.isFinite(sales)) {
      skipped.push({ line, reason: `labor sales "${String(cells[cols.sales] ?? '').trim()}" is not a dollar amount` });
      continue;
    }
    totals[bucket].hours += hours;
    totals[bucket].sales += sales;
    totals[bucket].lines += 1;

    if (cols.clock !== undefined) {
      const clock = parseNumber(cells[cols.clock]);
      if (Number.isFinite(clock) && clock >= 0) {
        clockHours += clock;
        clockSeen = true;
      }
    }
    if (cols.tech !== undefined) {
      const name = String(cells[cols.tech] ?? '').trim() || '(no tech)';
      if (!byTech.has(name)) byTech.set(name, { name, soldHours: 0, soldSales: 0, internalHours: 0, lines: 0 });
      const t = byTech.get(name);
      t.lines += 1;
      if (bucket === 'internal') t.internalHours += hours;
      else {
        t.soldHours += hours;
        t.soldSales += sales;
      }
    }
  }

  const lines = BUCKETS.reduce((n, b) => n + totals[b].lines, 0);
  if (lines === 0) {
    return { ok: false, error: 'No line could be read. Check the pay type, hours and labor sales columns.', skipped };
  }

  const techs = [...byTech.values()]
    .map((t) => ({ ...t, effectiveRate: t.soldHours > 0 ? t.soldSales / t.soldHours : null }))
    .sort((a, b) => (b.soldSales - a.soldSales) || a.name.localeCompare(b.name));

  const round1 = (n) => String(Math.round(n * 10) / 10);
  const round0 = (n) => String(Math.round(n));
  const fields = {
    customerPayHours: round1(totals.customerPay.hours),
    customerPayLaborSales: round0(totals.customerPay.sales),
    warrantyHours: round1(totals.warranty.hours),
    warrantyLaborSales: round0(totals.warranty.sales),
    internalHours: round1(totals.internal.hours),
  };
  if (clockSeen) fields.totalClockHours = round0(clockHours);

  return { ok: true, totals, byTech: techs, skipped, lines, fields, clockSeen };
}
