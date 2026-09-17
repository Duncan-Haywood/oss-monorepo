import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, csvNumber, toCSV } from './csv.mjs';

test('plain text passes through unquoted', () => {
  assert.equal(csvCell('Shelf'), 'Shelf');
});

test('a comma or quote in a label forces quoting and doubled quotes', () => {
  assert.equal(csvCell('24" shelf, oak'), '"24"" shelf, oak"');
});

test('a label that looks like a spreadsheet formula is neutralised', () => {
  // A pasted cut list is untrusted text by the time it reaches a CSV export;
  // a label of "=cmd|'/c calc'!A0" must not become a live formula when the
  // file is opened in Excel or Sheets.
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvCell('+1+1'), "'+1+1");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('@cmd'), "'@cmd");
});

test('null and undefined cells are empty strings, not "null"', () => {
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvNumber(null), '');
  assert.equal(csvNumber(undefined), '');
  assert.equal(csvNumber(''), '');
});

test('numeric cells are not formula-guarded, so a legitimate negative stays plain', () => {
  assert.equal(csvNumber(-4.5), '-4.5');
  assert.equal(csvNumber(0), '0');
});

test('toCSV joins a header and rows with CRLF and a trailing line', () => {
  const text = toCSV(['a', 'b'], [['1', '2'], ['3', '4']]);
  assert.equal(text, 'a,b\r\n1,2\r\n3,4\r\n');
});
