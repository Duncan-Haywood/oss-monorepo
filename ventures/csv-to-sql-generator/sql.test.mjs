import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, parseCsv, detectDelimiter, makeIdentifiers, quoteString } from './sql.mjs';

const col = (r, name) => r.columns.find((c) => c.name === name);

test('parses quotes, embedded commas, embedded newlines, CRLF and a BOM', () => {
  const { rows } = parseCsv('﻿a,b\r\n"x, y","line1\nline2"\r\n"he said ""hi""",z\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'line1\nline2'], ['he said "hi"', 'z']]);
});

test('keeps an empty quoted field but drops blank lines', () => {
  assert.deepEqual(parseCsv('a,b\n\n"",1\n').rows, [['a', 'b'], ['', '1']]);
});

test('an unterminated quote is an error, not silent data loss', () => {
  assert.throws(() => parseCsv('a,b\n"oops,1\n'), /Unterminated quote/);
});

test('detects semicolon, tab and pipe delimiters, ignoring delimiters inside quotes', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\n1\t2'), '\t');
  assert.equal(detectDelimiter('a|b\n1|2'), '|');
  assert.equal(detectDelimiter('name,note\n"a;b;c;d",x'), ',');
});

test('identifiers are snake_cased, deduplicated, and never empty or digit-led', () => {
  const { names } = makeIdentifiers(['Full Name', 'fullName', '', '2024 Sales', 'Full Name']);
  assert.deepEqual(names, ['full_name', 'full_name_2', 'column_3', 'col_2024_sales', 'full_name_3']);
});

test('infers integer, bigint, decimal, boolean, date, timestamp, uuid and text', () => {
  const r = convert([
    'i,b,d,t,ts,u,s,flag',
    '1,9999999999,1.25,2024-01-02,2024-01-02 03:04:05,123e4567-e89b-12d3-a456-426614174000,hello,yes',
    '2,2,10.5,2024-02-29,2024-01-02T03:04,123e4567-e89b-12d3-a456-426614174001,world,no',
  ].join('\n'));
  const kinds = Object.fromEntries(r.columns.map((c) => [c.name, c.kind]));
  assert.deepEqual(kinds, { i: 'integer', b: 'bigint', d: 'decimal', t: 'date', ts: 'timestamp', u: 'uuid', s: 'text', flag: 'boolean' });
  assert.equal(col(r, 'd').type, 'NUMERIC(4,2)');
  assert.equal(col(r, 'b').type, 'BIGINT');
});

test('decimal precision covers the widest integer part and the longest fraction', () => {
  const r = convert('p\n12345.5\n1.123456\n');
  assert.equal(col(r, 'p').type, 'NUMERIC(11,6)');
});

test('leading zeros keep a column as text, with a warning', () => {
  const r = convert('zip\n02134\n10001\n');
  assert.equal(col(r, 'zip').kind, 'text');
  assert.match(r.warnings.join('\n'), /leading zeros/);
  assert.match(r.sql, /'02134'/);
});

test('a plain 0 or 1 column is an integer unless the flag is set', () => {
  assert.equal(col(convert('f\n0\n1\n'), 'f').kind, 'integer');
  const r = convert('f\n0\n1\n', { zeroOneBool: true });
  assert.equal(col(r, 'f').kind, 'boolean');
  assert.match(r.sql, /\(TRUE\)/);
});

test('slash dates: unambiguous order is detected, ambiguous order warns and obeys the option', () => {
  const dmy = convert('d\n25/12/2024\n01/02/2024\n');
  assert.match(dmy.sql, /'2024-12-25'/);
  assert.match(dmy.sql, /'2024-02-01'/);
  const amb = convert('d\n03/04/2024\n05/06/2024\n');
  assert.match(amb.sql, /'2024-03-04'/);
  assert.match(amb.warnings.join(' '), /day\/month or month\/day/);
  assert.match(convert('d\n03/04/2024\n05/06/2024\n', { dateOrder: 'dmy' }).sql, /'2024-04-03'/);
});

test('mixed date formats stay text and say so', () => {
  const r = convert('d\n2024-01-02\n03/04/2024\nlater\n');
  assert.equal(col(r, 'd').kind, 'text');
  assert.match(r.warnings.join(' '), /not in one consistent format/);
});

test('an impossible calendar date is not a DATE', () => {
  assert.equal(col(convert('d\n2023-02-29\n'), 'd').kind, 'text');
});

test('thousands separators are stripped from numbers', () => {
  const r = convert('amt\n"1,234.50"\n"12"\n');
  assert.equal(col(r, 'amt').kind, 'decimal');
  assert.match(r.sql, /\(1234\.50\)/);
});

test('scientific notation becomes floating point', () => {
  assert.equal(col(convert('x\n1e5\n2.5\n'), 'x').kind, 'float');
});

test('empty cells and NULL tokens load as NULL and make the column nullable', () => {
  const r = convert('a,b\n1,\n2,NULL\n3,x\n');
  assert.match(r.sql, /b TEXT\n/);
  assert.equal(col(r, 'b').nullable, true);
  assert.equal((r.sql.match(/NULL\)/g) || []).length, 2);
});

test('a column that is empty in every row is TEXT, not a crash', () => {
  const r = convert('a,b\n1,\n2,\n');
  assert.equal(col(r, 'b').kind, 'text');
  assert.match(r.warnings.join(' '), /empty in every row/);
});

test('a unique, never-empty id column becomes the primary key; a duplicate one does not', () => {
  assert.match(convert('id,x\n1,a\n2,b\n').sql, /id INTEGER PRIMARY KEY/);
  assert.doesNotMatch(convert('id,x\n1,a\n1,b\n').sql, /PRIMARY KEY/);
  assert.doesNotMatch(convert('id,x\n1,a\n2,b\n', { pk: false }).sql, /PRIMARY KEY/);
});

test('strings: quotes doubled everywhere; backslashes and newlines escaped where the dialect needs it', () => {
  assert.equal(quoteString("it's", 'postgres'), "'it''s'");
  assert.equal(quoteString('a\\b', 'mysql'), "'a\\\\b'");
  assert.equal(quoteString('a\nb', 'bigquery'), "'a\\nb'");
  assert.equal(quoteString('é', 'sqlserver', true), "N'é'");
  assert.equal(quoteString('a\\b', 'postgres'), "'a\\b'");
});

test('dialect type names', () => {
  const csv = 'n,t,b,d\n1,hello,yes,2024-01-02 03:04:05\n';
  const types = (dialect) => convert(csv, { dialect }).columns.map((c) => c.type);
  assert.deepEqual(types('postgres'), ['INTEGER', 'TEXT', 'BOOLEAN', 'TIMESTAMP']);
  assert.deepEqual(types('mysql'), ['INT', 'VARCHAR(32)', 'TINYINT(1)', 'DATETIME']);
  assert.deepEqual(types('sqlite'), ['INTEGER', 'TEXT', 'INTEGER', 'TEXT']);
  assert.deepEqual(types('sqlserver'), ['INT', 'NVARCHAR(32)', 'BIT', 'DATETIME2']);
  assert.deepEqual(types('bigquery'), ['INT64', 'STRING', 'BOOL', 'DATETIME']);
});

test('long text: MySQL TEXT, SQL Server NVARCHAR(MAX)', () => {
  const csv = `t\n${'x'.repeat(300)}\n`;
  assert.equal(convert(csv, { dialect: 'mysql' }).columns[0].type, 'TEXT');
  assert.equal(convert(csv, { dialect: 'sqlserver' }).columns[0].type, 'NVARCHAR(500)');
  assert.equal(convert(`t\n${'x'.repeat(4001)}\n`, { dialect: 'sqlserver' }).columns[0].type, 'NVARCHAR(MAX)');
});

test('reserved words are quoted in the dialect’s own quote style', () => {
  assert.match(convert('order,group\n1,2\n').sql, /"order" INTEGER/);
  assert.match(convert('order,group\n1,2\n', { dialect: 'mysql' }).sql, /`order` INT/);
  assert.match(convert('order,group\n1,2\n', { dialect: 'sqlserver' }).sql, /\[order\] INT/);
});

test('inserts are batched, and SQL Server never exceeds 1000 rows per VALUES', () => {
  const csv = 'n\n' + Array.from({ length: 25 }, (_, i) => i + 1).join('\n');
  assert.equal(convert(csv, { batch: 10 }).stats.statements, 3);
  assert.equal(convert(csv, { insert: 'single' }).stats.statements, 25);
  const big = 'n\n' + Array.from({ length: 2500 }, (_, i) => i).join('\n');
  assert.equal(convert(big, { dialect: 'sqlserver', batch: 5000 }).stats.statements, 3);
});

test('transaction and drop options; BigQuery has no transaction wrapper', () => {
  assert.match(convert('a\n1\n', { drop: true }).sql, /DROP TABLE IF EXISTS imported_data;/);
  assert.doesNotMatch(convert('a\n1\n', { transaction: false }).sql, /BEGIN|COMMIT/);
  assert.doesNotMatch(convert('a\n1\n', { dialect: 'bigquery' }).sql, /BEGIN|COMMIT/);
  assert.match(convert('a\n1\n', { dialect: 'mysql' }).sql, /^START TRANSACTION;/);
});

test('ragged rows are padded and reported', () => {
  const r = convert('a,b,c\n1,2\n3,4,5\n');
  assert.match(r.warnings.join(' '), /1 row has fewer or more fields/);
  assert.equal(r.stats.rows, 2);
});

test('header-less input names columns column_1..n', () => {
  const r = convert('1,a\n2,b\n', { header: false });
  assert.deepEqual(r.columns.map((c) => c.name), ['column_1', 'column_2']);
  assert.equal(r.stats.rows, 2);
});

test('table name is sanitised; keepNames quotes originals', () => {
  assert.match(convert('a\n1\n', { table: 'My Table!' }).sql, /CREATE TABLE my_table \(/);
  const r = convert('First Name\nAda\n', { keepNames: true, table: 'People' });
  assert.match(r.sql, /CREATE TABLE "People" \(\n  "First Name" TEXT NOT NULL/);
});

test('rejects empty input, header-only input and absurd sizes with a clear message', () => {
  assert.throws(() => convert('   '), /Paste some CSV/);
  assert.throws(() => convert('a,b\n'), /no data rows/);
  assert.throws(() => convert('a\n1\n2\n', { maxRows: 1 }), /bulk loader/);
  assert.throws(() => convert('a\n1\n', { dialect: 'oracle' }), /dialect must be/);
});

test('generated SQLite output actually runs (when node:sqlite is available)', async () => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { return; }
  const r = convert('id,name,amount,active\n1,"O\'Brien, Pat","1,200.50",yes\n2,Zed,3,no\n', { dialect: 'sqlite' });
  const db = new DatabaseSync(':memory:');
  db.exec(r.sql);
  const rows = db.prepare('SELECT * FROM imported_data ORDER BY id').all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "O'Brien, Pat");
  assert.equal(rows[0].amount, 1200.5);
  assert.equal(rows[0].active, 1);
});
