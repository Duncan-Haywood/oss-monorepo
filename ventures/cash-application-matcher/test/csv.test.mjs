import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, parseMoney, parseDate, fmtDate, detectColumns, INVOICE_COLUMNS, RECEIPT_COLUMNS, readReceipts, readInvoices } from '../csv.mjs';

test('money in the formats AR and bank exports use', () => {
  assert.equal(parseMoney('$1,234.56'), 123456);
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('1 234,56 €'), 123456);
  assert.equal(parseMoney('(12.00)'), -1200);
  assert.equal(parseMoney('-12'), -1200);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('1,234'), 123400);
  assert.equal(parseMoney('12,50'), 1250);
  assert.equal(parseMoney('0.125'), 13);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('n/a'), null);
});

test('dates: ISO, US, day-first, dotted, named months; impossible dates refused', () => {
  assert.equal(fmtDate(parseDate('2026-11-03')), '2026-11-03');
  assert.equal(fmtDate(parseDate('11/03/2026')), '2026-11-03');
  assert.equal(fmtDate(parseDate('03/11/2026', { dayFirst: true })), '2026-11-03');
  assert.equal(fmtDate(parseDate('25/11/2026')), '2026-11-25');
  assert.equal(fmtDate(parseDate('03.11.2026')), '2026-11-03');
  assert.equal(fmtDate(parseDate('3 Nov 2026')), '2026-11-03');
  assert.equal(fmtDate(parseDate('Nov 3, 2026')), '2026-11-03');
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('soon'), null);
});

test('CSV: quotes, doubled quotes, semicolons, CRLF, BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1,5;2\n'), [['a', 'b'], ['1,5', '2']]);
});

test('column detection finds QuickBooks-style and bank-style headers', () => {
  const c = detectColumns(['Num', 'Customer', 'Date', 'Due Date', 'Terms', 'Open Balance'], INVOICE_COLUMNS);
  assert.deepEqual(c, { id: 0, customer: 1, date: 2, due: 3, terms: 4, amount: 5 });
  const b = detectColumns(['Booking Date', 'Counterparty Name', 'Remittance Information', 'Amount'], RECEIPT_COLUMNS);
  assert.equal(b.date, 0); assert.equal(b.payer, 1); assert.equal(b.reference, 2); assert.equal(b.amount, 3);
});

test('bank debits and credit memos are dropped; missing columns are reported', () => {
  const r = readReceipts('Date,Description,Amount\n2026-11-01,PAYROLL,-500.00\n2026-11-02,ACH CREDIT ACME,250.00\n');
  assert.equal(r.receipts.length, 1);
  assert.equal(r.receipts[0].amount, 25000);
  const i = readInvoices('Customer,Date\nA,2026-01-01\n');
  assert.equal(i.invoices.length, 0);
  assert.ok(i.warnings.length >= 1);
});
