import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecords, detectDuplicates, normalizeVendor, normalizeInvoice, levenshtein } from '../detect.mjs';

function csv(rows) { return rows.map(r => r.join(',')).join('\n'); }

test('normalizeVendor lowercases, strips punctuation, and collapses whitespace', () => {
  assert.equal(normalizeVendor('Acme,  Inc.'), 'acme inc');
  assert.equal(normalizeVendor('  Acme Inc  '), 'acme inc');
});

test('normalizeInvoice uppercases and strips non-alphanumeric characters', () => {
  assert.equal(normalizeInvoice('inv-0042'), 'INV0042');
  assert.equal(normalizeInvoice(' INV 0042 '), 'INV0042');
});

test('levenshtein distance', () => {
  assert.equal(levenshtein('ABC', 'ABC'), 0);
  assert.equal(levenshtein('ABC', 'ABD'), 1);
  assert.equal(levenshtein('INV0042', 'INV0043'), 1);
  assert.equal(levenshtein('', 'ABC'), 3);
});

test('readRecords requires vendor, amount, and date columns', () => {
  assert.throws(() => readRecords(csv([['vendor', 'amount'], ['Acme', '100']])), /vendor, amount, and date/);
});

test('readRecords parses a well-formed ledger, with or without an invoice column', () => {
  const { records, hasInvoiceColumn } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    ['Acme Inc', 'INV-001', '500.00', '2026-01-05'],
  ]));
  assert.equal(hasInvoiceColumn, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].vendorKey, 'acme inc');
  assert.equal(records[0].invoiceKey, 'INV001');
  assert.equal(records[0].cents, 50000);

  const { hasInvoiceColumn: noInvoice } = readRecords(csv([
    ['vendor', 'amount', 'date'],
    ['Acme Inc', '500.00', '2026-01-05'],
  ]));
  assert.equal(noInvoice, false);
});

test('readRecords rejects a row with a missing vendor, or an invalid amount or date', () => {
  assert.throws(() => readRecords(csv([['vendor', 'amount', 'date'], ['', '100', '2026-01-05']])), /missing vendor/);
  assert.throws(() => readRecords(csv([['vendor', 'amount', 'date'], ['Acme', 'not-a-number', '2026-01-05']])), /missing vendor/);
  assert.throws(() => readRecords(csv([['vendor', 'amount', 'date'], ['Acme', '100', 'not-a-date']])), /missing vendor/);
});

test('exact-duplicate: same vendor, invoice, and amount', () => {
  const { records } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    ['Acme Inc', 'INV-001', '500.00', '2026-01-05'],
    ['Acme Inc', 'INV-001', '500.00', '2026-03-14'],
  ]));
  const flags = detectDuplicates(records);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].tier, 'exact-duplicate');
  assert.equal(flags[0].confidence, 'high');
  assert.match(flags[0].reason, /paid twice for the same amount/);
});

test('same-invoice-different-amount: same vendor and invoice, different amount', () => {
  const { records } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    ['Acme Inc', 'INV-001', '500.00', '2026-01-05'],
    ['Acme Inc', 'INV-001', '250.00', '2026-01-20'],
  ]));
  const flags = detectDuplicates(records);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].tier, 'same-invoice-different-amount');
  assert.equal(flags[0].confidence, 'medium');
});

test('near-duplicate-invoice: same vendor and amount, invoice numbers a likely typo', () => {
  const { records } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    ['Acme Inc', 'INV-0042', '500.00', '2026-01-05'],
    ['Acme Inc', 'INV-0043', '500.00', '2026-05-01'],
  ]));
  const flags = detectDuplicates(records);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].tier, 'near-duplicate-invoice');
  assert.equal(flags[0].confidence, 'high');
});

test('near-duplicate-invoice does not fire when invoice numbers are unrelated', () => {
  const { records } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    ['Acme Inc', 'INV-0042', '500.00', '2026-01-05'],
    ['Acme Inc', 'BILL-9931', '500.00', '2026-05-01'],
  ]));
  const flags = detectDuplicates(records);
  // Falls through to the same-amount-near-date tier only if within the window;
  // 116 days apart with an unrelated invoice number should produce no flag.
  assert.equal(flags.length, 0);
});

test('same-amount-near-date: same vendor and amount, close together, no invoice link', () => {
  const { records } = readRecords(csv([
    ['vendor', 'amount', 'date'],
    ['Acme Inc', '500.00', '2026-01-05'],
    ['Acme Inc', '500.00', '2026-01-09'],
  ]));
  const flags = detectDuplicates(records, { dateWindowDays: 7 });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].tier, 'same-amount-near-date');
  assert.equal(flags[0].confidence, 'review');
  assert.match(flags[0].reason, /regular schedule/);
});

test('same-amount-near-date respects the date window', () => {
  const { records } = readRecords(csv([
    ['vendor', 'amount', 'date'],
    ['Acme Inc', '500.00', '2026-01-05'],
    ['Acme Inc', '500.00', '2026-02-05'],
  ]));
  const flags = detectDuplicates(records, { dateWindowDays: 7 });
  assert.equal(flags.length, 0);
});

test('different vendors with the same amount are never flagged against each other', () => {
  const { records } = readRecords(csv([
    ['vendor', 'amount', 'date'],
    ['Acme Inc', '500.00', '2026-01-05'],
    ['Globex Corp', '500.00', '2026-01-06'],
  ]));
  assert.equal(detectDuplicates(records).length, 0);
});

test('a pair already explained by an invoice-based tier is not also flagged by the near-date tier', () => {
  const { records } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    ['Acme Inc', 'INV-001', '500.00', '2026-01-05'],
    ['Acme Inc', 'INV-001', '500.00', '2026-01-06'],
  ]));
  const flags = detectDuplicates(records, { dateWindowDays: 7 });
  assert.equal(flags.length, 1);
  assert.equal(flags[0].tier, 'exact-duplicate');
});

test('flags are sorted highest confidence first', () => {
  const { records } = readRecords(csv([
    ['vendor', 'invoice_number', 'amount', 'date'],
    // review-tier: same amount, near date, no invoice link
    ['Acme Inc', '', '500.00', '2026-01-05'],
    ['Acme Inc', '', '500.00', '2026-01-09'],
    // high-tier: exact invoice + amount duplicate
    ['Globex Corp', 'INV-9', '900.00', '2026-02-01'],
    ['Globex Corp', 'INV-9', '900.00', '2026-02-02'],
  ]));
  const flags = detectDuplicates(records, { dateWindowDays: 7 });
  assert.equal(flags.length, 2);
  const rank = { high: 0, medium: 1, review: 2 };
  for (let i = 1; i < flags.length; i += 1) {
    assert.ok(rank[flags[i - 1].confidence] <= rank[flags[i].confidence]);
  }
  assert.equal(flags[0].confidence, 'high');
  assert.equal(flags[flags.length - 1].confidence, 'review');
});
