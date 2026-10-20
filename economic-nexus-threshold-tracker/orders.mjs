// Orders-CSV import for the economic nexus tracker.
//
// Typing fifty states in by hand is the slow part of the tracker, and the
// numbers a seller needs are already sitting in an order export: Shopify's
// "Export orders", Etsy's "Sold Orders" download, Amazon's order reports and
// most WooCommerce exports all carry a ship-to state, an amount and a date.
// This module reads such a file, picks the columns by header name, keeps the
// trailing 12 months, and totals sales and orders per ship-to state. It then
// replays each uncrossed state forward at its recent pace to estimate the
// date a threshold would be crossed.
//
// Everything here is plain arithmetic on text the visitor already holds. It
// never touches the network (page.test.mjs enforces that).
//
// What it cannot know, and says so on the page: which measurement period a
// state uses (several use the prior or current calendar year, this uses a
// trailing 12 months), whether a marketplace's sales are exempt for a given
// state, and whether an export's "total" includes tax. The amount column it
// picks is the order subtotal where one exists, because thresholds are
// written in gross sales and tax collected is not a sale.

import { STATE_THRESHOLDS, checkEntry } from './calc.mjs';

const DAY_MS = 86400000;

// Header synonyms, lower-cased with punctuation collapsed to single spaces.
// Order matters: the first header that matches the earliest synonym wins, so
// "subtotal" beats "total" and a province CODE beats a province name.
const COLUMN_SYNONYMS = {
  state: [
    'shipping province', 'ship state', 'shipping state', 'ship to state',
    'shipping address state', 'shipping province name', 'ship state province',
    'delivery state', 'buyer state', 'state',
  ],
  amount: [
    'subtotal', 'item total', 'order value', 'sale amount', 'order subtotal',
    'item subtotal', 'item price', 'gross sales', 'order total', 'total', 'amount',
  ],
  date: [
    'created at', 'sale date', 'order date', 'purchase date', 'date', 'paid at',
    'order created', 'date created',
  ],
  id: ['name', 'order id', 'order number', 'order', 'receipt id', 'amazon order id'],
};

export function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Minimal RFC 4180 reader: quoted fields, doubled quotes, newlines inside
// quotes, CRLF or LF, and a trailing newline. Returns rows of strings.
export function parseCsv(text) {
  const input = String(text ?? '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

const NAME_TO_CODE = new Map(STATE_THRESHOLDS.map((s) => [s.label.toLowerCase(), s.code]));
const CODES = new Set(STATE_THRESHOLDS.map((s) => s.code));

// "ca", "CA", " California ", "calif." -> "CA"; anything else -> null.
export function normalizeState(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase().replace(/[^A-Z ]/g, '');
  if (CODES.has(upper)) return upper;
  const lower = raw.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (NAME_TO_CODE.has(lower)) return NAME_TO_CODE.get(lower);
  if (lower === 'washington dc' || lower === 'dc' || lower === 'washington d c') return 'DC';
  return null;
}

export function parseAmount(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ISO ("2026-03-04", "2026-03-04 10:11:12 -0500", "2026-03-04T10:11:12Z"),
// US ("3/4/2026", "03/04/26") and Etsy ("03/04/2026"). Day-first dates are
// not guessed at: a file that needs them reports the rows it could not read
// rather than quietly swapping day and month.
export function parseDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(t) ? null : t;
  }
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const month = Number(m[1]);
    const day = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Date.UTC(year, month - 1, day);
  }
  return null;
}

export function detectColumns(headers) {
  const norm = headers.map(normalizeHeader);
  const found = {};
  for (const [key, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
    for (const synonym of synonyms) {
      const index = norm.indexOf(synonym);
      if (index !== -1) { found[key] = index; break; }
    }
  }
  return found;
}

/**
 * Read an orders export. Returns the usable orders and an honest account of
 * everything that was left out, so the page can show it.
 */
export function readOrders(text) {
  const table = parseCsv(text);
  if (table.length < 2) {
    return { ok: false, error: 'The file has no data rows.', orders: [], skipped: {} };
  }
  const headers = table[0];
  const columns = detectColumns(headers);
  const missing = ['state', 'amount', 'date'].filter((k) => columns[k] === undefined);
  if (missing.length) {
    return {
      ok: false,
      error: `Could not find a ${missing.join(', ')} column. Headers seen: ${headers.slice(0, 12).join(', ')}`,
      columns,
      orders: [],
      skipped: {},
    };
  }

  const skipped = { noState: 0, unknownState: 0, noAmount: 0, badDate: 0, refund: 0, duplicateLine: 0 };
  const orders = [];
  const seenIds = new Set();
  for (let r = 1; r < table.length; r += 1) {
    const row = table[r];
    const idRaw = columns.id !== undefined ? String(row[columns.id] ?? '').trim() : '';
    const stateRaw = String(row[columns.state] ?? '').trim();
    const amountRaw = String(row[columns.amount] ?? '').trim();
    // Shopify writes one row per line item and leaves the order-level fields
    // blank on every row after the first; those are not extra orders.
    if (!stateRaw && !amountRaw) { skipped.duplicateLine += 1; continue; }
    if (!stateRaw) { skipped.noState += 1; continue; }
    const state = normalizeState(stateRaw);
    if (!state) { skipped.unknownState += 1; continue; }
    const amount = parseAmount(amountRaw);
    if (amount === null) { skipped.noAmount += 1; continue; }
    if (amount < 0) { skipped.refund += 1; continue; }
    const date = parseDate(row[columns.date]);
    if (date === null) { skipped.badDate += 1; continue; }
    if (idRaw) {
      if (seenIds.has(idRaw)) { skipped.duplicateLine += 1; continue; }
      seenIds.add(idRaw);
    }
    orders.push({ state, amount, date });
  }
  return { ok: true, columns, headers, orders, skipped, rowCount: table.length - 1 };
}

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Total trailing-12-month sales and orders per state, and for every state
 * not yet crossed, the date it would cross if the last `paceDays` of selling
 * simply continued while the oldest sales roll out of the window.
 */
export function analyzeOrders(orders, { asOf = Date.now(), paceDays = 90, horizonDays = 365 } = {}) {
  const asOfDay = Math.floor(asOf / DAY_MS) * DAY_MS;
  const windowStart = asOfDay - 364 * DAY_MS;
  const inWindow = orders.filter((o) => o.date >= windowStart && o.date <= asOfDay + DAY_MS - 1);
  const byState = new Map();
  for (const o of inWindow) {
    if (!byState.has(o.state)) byState.set(o.state, []);
    byState.get(o.state).push(o);
  }

  const paceStart = asOfDay - (paceDays - 1) * DAY_MS;
  const rows = [];
  for (const [state, list] of byState) {
    list.sort((a, b) => a.date - b.date);
    const sales = round2(list.reduce((s, o) => s + o.amount, 0));
    const transactions = list.length;
    const check = checkEntry({ state, grossSales: sales, transactionCount: transactions });
    const threshold = check.threshold;
    const recent = list.filter((o) => o.date >= paceStart);
    const dailySales = recent.reduce((s, o) => s + o.amount, 0) / paceDays;
    const dailyTxns = recent.length / paceDays;

    let crossesOn = null;
    if (threshold && !threshold.noSalesTax && check.crossed === false) {
      crossesOn = projectCrossing(list, state, { asOfDay, dailySales, dailyTxns, horizonDays });
    }
    rows.push({
      state,
      label: threshold ? threshold.label : state,
      sales,
      transactions,
      status: check.status,
      crossed: check.crossed,
      threshold,
      percentOfThreshold: threshold && !threshold.noSalesTax ? percentUsed(threshold, sales, transactions) : null,
      dailySales: round2(dailySales),
      crossesOn,
    });
  }
  rows.sort((a, b) => (Number(b.crossed === true) - Number(a.crossed === true))
    || ((b.percentOfThreshold ?? -1) - (a.percentOfThreshold ?? -1))
    || b.sales - a.sales);

  const totalSales = round2(inWindow.reduce((s, o) => s + o.amount, 0));
  return {
    asOf: isoDay(asOfDay),
    windowStart: isoDay(windowStart),
    orderCount: inWindow.length,
    outsideWindow: orders.length - inWindow.length,
    totalSales,
    rows,
  };
}

// How far toward the line the seller is, as a percentage, for ranking. An OR
// state is crossed by whichever test is met first, so the leading test counts;
// an AND state needs both, so the lagging test counts.
export function percentUsed(threshold, sales, transactions) {
  const dollar = sales / threshold.amount;
  if (threshold.transactions == null) return round1(dollar * 100);
  const count = transactions / threshold.transactions;
  return round1((threshold.condition === 'AND' ? Math.min(dollar, count) : Math.max(dollar, count)) * 100);
}

function projectCrossing(list, state, { asOfDay, dailySales, dailyTxns, horizonDays }) {
  if (dailySales <= 0 && dailyTxns <= 0) return null;
  // Replay day by day. Sales older than 364 days before the replay day drop
  // out; each future day adds the recent average. Fractional orders are fine
  // here because the output is a date estimate, not a count.
  let start = 0;
  let sales = list.reduce((s, o) => s + o.amount, 0);
  let txns = list.length;
  for (let day = 1; day <= horizonDays; day += 1) {
    const cutoff = asOfDay + day * DAY_MS - 364 * DAY_MS;
    while (start < list.length && list[start].date < cutoff) {
      sales -= list[start].amount;
      txns -= 1;
      start += 1;
    }
    const future = { sales: sales + dailySales * day, txns: txns + dailyTxns * day };
    const result = checkEntry({
      state,
      grossSales: round2(future.sales),
      transactionCount: Math.floor(future.txns),
    });
    if (result.crossed === true) return isoDay(asOfDay + day * DAY_MS);
  }
  return null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/** Rows -> the tracker's own entry shape, so the existing table takes them. */
export function toEntries(analysis) {
  return analysis.rows
    .filter((r) => r.threshold && !r.threshold.noSalesTax)
    .map((r) => ({ state: r.state, grossSales: r.sales, transactionCount: r.transactions }));
}

export function planToCsv(analysis) {
  const fields = ['state', 'sales_12mo', 'orders_12mo', 'percent_of_threshold', 'status', 'projected_crossing'];
  const quote = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = analysis.rows.map((r) => [
    r.label, r.sales, r.transactions, r.percentOfThreshold ?? '', r.status, r.crossed === true ? 'already crossed' : (r.crossesOn ?? ''),
  ].map(quote).join(','));
  return [fields.join(','), ...lines].join('\n');
}

/** A made-up export in Shopify's shape, for the "try a sample file" button. */
export function sampleCsv(asOf = Date.now()) {
  const day = Math.floor(asOf / DAY_MS) * DAY_MS;
  const lines = ['Name,Created at,Subtotal,Total,Shipping Province,Financial Status'];
  // [state, typical order, orders]. Orders bunch toward today so the sample
  // shows sellers who are speeding up, which is when a projection matters.
  const states = [['CA', 1300, 330], ['ID', 900, 120], ['TX', 1400, 150], ['GA', 150, 190], ['NY', 250, 60], ['FL', 100, 40]];
  let n = 1000;
  for (const [st, perOrder, count] of states) {
    for (let i = 0; i < count; i += 1) {
      const u = (i + 1) / count;
      const when = day - Math.floor(360 * (1 - u) ** 2) * DAY_MS;
      const amt = (perOrder + (i % 5) * 7).toFixed(2);
      lines.push(`#${n += 1},${isoDay(when)} 10:00:00 -0500,${amt},${amt},${st},paid`);
    }
  }
  return lines.join('\n');
}
