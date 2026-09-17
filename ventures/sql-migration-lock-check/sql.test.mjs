import test from 'node:test';
import assert from 'node:assert/strict';
import { maskNonCode, splitStatements, normalize, leadingKeyword } from './sql.mjs';

// The splitter's whole job is deciding which characters are code. Everything
// below is a way that question has a non-obvious answer -- and every one of
// them, got wrong, produces a *false finding on a real migration*, which is
// the failure that makes a practitioner stop reading the tool.

test('masking preserves length and line structure', () => {
  const text = "SELECT 'a;b'; -- note\nSELECT 1;";
  const { masked } = maskNonCode(text);
  assert.equal(masked.length, text.length, 'offsets must stay aligned with the original');
  assert.equal((masked.match(/\n/g) || []).length, 1, 'newlines survive so line numbers survive');
});

test('a semicolon inside a string literal does not split a statement', () => {
  const statements = splitStatements("INSERT INTO t VALUES ('a;b');");
  assert.equal(statements.length, 1);
});

test("'' is an escaped quote, not the end of a literal", () => {
  const statements = splitStatements("INSERT INTO t VALUES ('it''s; fine');");
  assert.equal(statements.length, 1);
});

test('a semicolon inside a dollar-quoted body does not split a statement', () => {
  const sql = `CREATE FUNCTION f() RETURNS int AS $$
BEGIN
  TRUNCATE x;
  RETURN 1;
END;
$$ LANGUAGE plpgsql;`;
  const statements = splitStatements(sql);
  assert.equal(statements.length, 1, 'a function body is one statement');
});

test('a tagged dollar quote is matched by its own tag', () => {
  const sql = `SELECT $tag$ ; $$ still inside ; $tag$; SELECT 2;`;
  const statements = splitStatements(sql);
  assert.equal(statements.length, 2);
});

test('$1 placeholders are not dollar quotes', () => {
  const statements = splitStatements('SELECT * FROM t WHERE id = $1; SELECT 2;');
  assert.equal(statements.length, 2);
});

test('a line comment hides code from the scanner', () => {
  const statements = splitStatements('-- TRUNCATE audit;\nSELECT 1;');
  assert.equal(statements.length, 1);
  assert.match(statements[0].masked, /SELECT 1/);
  assert.doesNotMatch(statements[0].masked, /TRUNCATE/);
});

test('block comments nest, as they do in PostgreSQL', () => {
  // C-style scanners stop at the first `*/` and treat the rest as code, which
  // here would leak `TRUNCATE` into a finding.
  const statements = splitStatements('/* outer /* inner */ TRUNCATE audit; */ SELECT 1;');
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0].masked, /TRUNCATE/);
});

test('quoted identifiers stay matchable as code', () => {
  // `ALTER TABLE "users"` must still be recognised as an ALTER TABLE, so the
  // quotes are dropped rather than the contents blanked.
  const [st] = splitStatements('ALTER TABLE "users" DROP COLUMN "a";');
  assert.match(st.masked, /ALTER\s+TABLE\s+users/i);
});

test('line numbers point at the statement, not the file start', () => {
  const statements = splitStatements('SELECT 1;\n\n\nSELECT 2;');
  assert.equal(statements[0].line, 1);
  assert.equal(statements[1].line, 4);
});

test('a trailing statement without a semicolon is still a statement', () => {
  const statements = splitStatements('SELECT 1;\nSELECT 2');
  assert.equal(statements.length, 2);
});

test('whitespace-only trailing text is not a statement', () => {
  const statements = splitStatements('SELECT 1;\n\n  \n');
  assert.equal(statements.length, 1);
});

test('inTransaction tracks explicit BEGIN/COMMIT', () => {
  const statements = splitStatements('SELECT 0; BEGIN; SELECT 1; COMMIT; SELECT 2;');
  const byText = Object.fromEntries(statements.map((s) => [s.text, s.inTransaction]));
  assert.equal(byText['SELECT 0'], false);
  assert.equal(byText['SELECT 1'], true, 'inside the block');
  assert.equal(byText['SELECT 2'], false, 'after COMMIT');
  assert.equal(byText['BEGIN'], false, 'BEGIN is not itself inside a transaction');
});

test('START TRANSACTION opens a block too', () => {
  const statements = splitStatements('START TRANSACTION; SELECT 1;');
  assert.equal(statements.at(-1).inTransaction, true);
});

test('ROLLBACK closes a block', () => {
  const statements = splitStatements('BEGIN; SELECT 1; ROLLBACK; SELECT 2;');
  assert.equal(statements.at(-1).inTransaction, false);
});

test('normalize collapses multi-line statements onto one line', () => {
  assert.equal(normalize('ALTER  TABLE\n  users\n  DROP COLUMN a'), 'ALTER TABLE users DROP COLUMN a');
});

test('leadingKeyword reports the statement kind', () => {
  assert.equal(leadingKeyword('  alter table x'), 'ALTER');
  assert.equal(leadingKeyword(''), '');
});

test('an unterminated dollar quote does not hang or split', () => {
  // A truncated file is a plausible input; it must terminate.
  const statements = splitStatements('SELECT $$ unterminated ; still going');
  assert.equal(statements.length, 1);
});

test('an unterminated string literal does not hang', () => {
  const statements = splitStatements("SELECT 'unterminated ; text");
  assert.equal(statements.length, 1);
});
