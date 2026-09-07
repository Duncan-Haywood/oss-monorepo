import assert from 'node:assert/strict';
import test from 'node:test';
import { readRecords, detectDuplicates } from '../detect.mjs';
import { csvCell, reviewCsv, REVIEW_HEADER } from '../export.mjs';

test('csvCell neutralises a leading formula character with an inert apostrophe', () => {
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('Acme Inc'), 'Acme Inc');
});

test('csvCell quotes a value containing a comma or quote', () => {
  assert.equal(csvCell('Acme, Inc.'), '"Acme, Inc."');
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
});

test('reviewCsv renders the header and one row per flag, with formula-guarded cells', () => {
  const { records } = readRecords([
    'vendor,invoice_number,amount,date',
    '"=Acme Corp",INV-001,500.00,2026-01-05',
    '"=Acme Corp",INV-001,500.00,2026-03-14',
  ].join('\n'));
  const flags = detectDuplicates(records);
  const csv = reviewCsv(flags);
  const lines = csv.split('\n');
  assert.equal(lines[0], REVIEW_HEADER);
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^high,exact-duplicate,'=Acme Corp/);
});

test('reviewCsv on an empty flag list is just the header', () => {
  assert.equal(reviewCsv([]), REVIEW_HEADER);
});
