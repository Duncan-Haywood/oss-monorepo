import test from 'node:test';
import assert from 'node:assert/strict';
import { maskNonCode, splitStatements, normalize, leadingKeyword, transactionEffect } from './sql.mjs';

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

// Red-team gap tests, 2026-11-18: mutants that survived the suite above.

test('a semicolon at the very start of the file ends an empty statement', () => {
  // The loop must look at offset 0: `;SELECT 1` is one statement, `SELECT 1`.
  const statements = splitStatements(';SELECT 1');
  assert.equal(statements.length, 1);
  assert.equal(statements[0].text, 'SELECT 1');
});

test('a stray COMMIT outside any block does not swallow the next BEGIN', () => {
  // COMMIT with no open block only warns in PostgreSQL; the BEGIN after it
  // still opens a block, so the statement after that is inside one.
  const statements = splitStatements('COMMIT; BEGIN; CREATE INDEX CONCURRENTLY i ON t (a);');
  assert.equal(statements[2].inTransaction, true);
});

test('transactionEffect follows PostgreSQL: flat blocks, savepoints, ABORT, AND CHAIN', () => {
  assert.equal(transactionEffect('BEGIN'), 'begin');
  assert.equal(transactionEffect('start transaction isolation level serializable'), 'begin');
  for (const end of ['COMMIT', 'END', 'ROLLBACK', 'ABORT', 'COMMIT WORK', 'ROLLBACK AND NO CHAIN']) {
    assert.equal(transactionEffect(end), 'end', end);
  }
  assert.equal(transactionEffect('COMMIT AND CHAIN'), 'chain');
  assert.equal(transactionEffect('ROLLBACK TRANSACTION AND CHAIN'), 'chain');
  for (const none of ['ROLLBACK TO SAVEPOINT a', 'ROLLBACK TO a', 'ROLLBACK WORK TO SAVEPOINT a',
    "COMMIT PREPARED 'x'", "ROLLBACK PREPARED 'x'", 'SAVEPOINT a', 'RELEASE SAVEPOINT a', 'ENDPOINT', 'SELECT 1']) {
    assert.equal(transactionEffect(none), null, none);
  }
});

test('a second BEGIN does not nest, and ROLLBACK TO SAVEPOINT leaves the block open', () => {
  const st = splitStatements('BEGIN; BEGIN; COMMIT; SELECT 1; BEGIN; SAVEPOINT a; ROLLBACK TO a; SELECT 2;');
  assert.equal(st[3].inTransaction, false, 'one COMMIT ends the block');
  assert.equal(st[7].inTransaction, true, 'ROLLBACK TO undoes work, not the block');
});

test('an unterminated quoted identifier keeps all its characters', () => {
  assert.equal(maskNonCode('ALTER TABLE "users').masked, 'ALTER TABLE  users');
  assert.equal(maskNonCode('ALTER TABLE "users"').masked, 'ALTER TABLE  users ');
  assert.equal(maskNonCode('"a""b"').masked, ' a""b ');
});

test('quoted schema-qualified names come out as one dotted token in the masked text', () => {
  const [st] = splitStatements('ALTER TABLE "public"."users" ADD COLUMN "n" int;');
  assert.equal(st.masked, 'ALTER TABLE public.users ADD COLUMN n int');
  const [lit] = splitStatements("SELECT 'a.b' AS x;");
  assert.equal(lit.display, "SELECT 'a.b' AS x", 'the quoted text keeps the original spelling');
});

// Red team 2026-11-18: each of these swallowed the rest of the file, so a
// blocking CREATE INDEX after it produced no finding at all.
test("E'...' strings take backslash escapes, so \\' does not end them", () => {
  const st = splitStatements("UPDATE t SET note = E'it\\'s';\nCREATE INDEX idx ON t (a);");
  assert.deepEqual(st.map((s) => s.masked), ['UPDATE t SET note = E', 'CREATE INDEX idx ON t (a)']);
  // `\\` is an escaped backslash, so the quote after it does end the literal.
  const both = splitStatements("SELECT e'a\\\\';\nCREATE INDEX idx ON t (a);");
  assert.equal(both.length, 2);
  // A plain literal keeps standard rules: a backslash is just a character.
  const plain = splitStatements("SELECT 'a\\';\nCREATE INDEX idx ON t (a);");
  assert.equal(plain.length, 2);
  // `somE'x'` is not an E-string prefix (the E is the end of a name).
  const named = splitStatements("SELECT typE'a\\';\nCREATE INDEX idx ON t (a);");
  assert.equal(named.length, 2);
});

test('a $ inside an identifier does not open a dollar quote', () => {
  const st = splitStatements('SELECT a$b$c FROM t;\nCREATE INDEX idx ON t (a);');
  assert.equal(st.length, 2);
  assert.equal(st[1].masked, 'CREATE INDEX idx ON t (a)');
});

test('dollar-quote tags take only identifier characters', () => {
  assert.equal(splitStatements('SELECT $a|b$;\nCREATE INDEX idx ON t (a);').length, 2);
});

test('maskNonCode marks string characters, not comment characters, as inString', () => {
  const text = "'ab' -- c";
  const { inString, isComment } = maskNonCode(text);
  assert.deepEqual(inString.slice(0, 4), [true, true, true, true]);
  assert.equal(inString[7], false, 'a comment is not a string');
  assert.equal(isComment[7], true);
});

// Red team 2026-11-19: boundary cases the tests above left open.
test('a line comment that ends the file keeps the masked text the same length', () => {
  for (const text of ['SELECT 1; -- last', '-- only a comment']) {
    assert.equal(maskNonCode(text).masked.length, text.length);
  }
});

test("an E-string after a keyword and a space still takes backslash escapes", () => {
  // The character two before the quote is a space; the one before that is a
  // letter. Only the space decides whether the E starts a name.
  const st = splitStatements("SELECT E'it\\'s';\nCREATE INDEX idx ON t (a);");
  assert.deepEqual(st.map((s) => s.masked), ['SELECT E', 'CREATE INDEX idx ON t (a)']);
});

test("an E that ends a name at the start of the file is not an E-string prefix", () => {
  // Quote at offset 2: text[0] is a name character, so `de'...'` is a plain
  // literal and `\\'` ends it.
  const st = splitStatements("de'a\\';\nCREATE INDEX idx ON t (a);");
  assert.equal(st.length, 2);
  assert.equal(st[1].masked, 'CREATE INDEX idx ON t (a)');
});

test('a quoted identifier that starts with an escaped quote ("") keeps it', () => {
  // `"""a"` is the identifier `"a`: the opening quote, an escaped quote, a,
  // and the closing quote. Only the outer two quotes are blanked.
  assert.equal(maskNonCode('"""a" x').masked, ' ""a  x');
});
