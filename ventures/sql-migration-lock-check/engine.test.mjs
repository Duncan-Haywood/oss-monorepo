import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSql, analyzeSources, summaryLine, targetTypeMayBeFree, CHECKS, RISK, WARN } from './engine.mjs';

const ids = (sql) => analyzeSql(sql).findings.map((f) => f.id);
const has = (sql, id) => ids(sql).includes(id);

// ---------------------------------------------------------------------------
// The anti-cry-wolf half. These are the statements a naive keyword linter
// flags and PostgreSQL executes instantly, and getting any of them wrong is
// what makes a practitioner stop reading the findings -- at which point the
// true findings are worth nothing either. Tested first because they are the
// constraint the rest of the engine is written under.
// ---------------------------------------------------------------------------

test('ADD COLUMN with a constant default is not flagged (metadata-only since PG 11)', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ADD COLUMN n int DEFAULT 0;";
  assert.deepEqual(ids(sql), []);
});

test('ADD COLUMN with a STABLE default like now() is not flagged', () => {
  // now() and CURRENT_TIMESTAMP are STABLE, not VOLATILE: no rewrite.
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ADD COLUMN seen timestamptz DEFAULT now();";
  assert.ok(!has(sql, 'add-column-volatile-default'));
});

test('ADD COLUMN with a VOLATILE default is flagged', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ADD COLUMN t uuid DEFAULT gen_random_uuid();";
  assert.ok(has(sql, 'add-column-volatile-default'));
});

test('random() and nextval() count as volatile too', () => {
  for (const fn of ['random()', 'nextval(\'s\')', 'clock_timestamp()']) {
    const sql = `SET lock_timeout='3s';\nALTER TABLE t ADD COLUMN c int DEFAULT ${fn};`;
    assert.ok(has(sql, 'add-column-volatile-default'), `${fn} should be volatile`);
  }
});

test('CREATE INDEX CONCURRENTLY outside a transaction is clean', () => {
  assert.deepEqual(ids('CREATE INDEX CONCURRENTLY idx ON users (email);'), []);
});

test('VALIDATE CONSTRAINT alone is not treated as an exclusive-lock statement', () => {
  // It takes SHARE UPDATE EXCLUSIVE. Demanding a lock_timeout for the one
  // ALTER TABLE form that does not need one would undercut the advice the
  // add-constraint check gives.
  assert.deepEqual(ids('ALTER TABLE users VALIDATE CONSTRAINT c1;'), []);
});

test('a statement inside a comment produces no finding', () => {
  assert.deepEqual(ids('-- CREATE INDEX idx ON users (email);\nSELECT 1;'), []);
});

test('SELECT and INSERT statements produce no findings', () => {
  assert.deepEqual(ids('SELECT * FROM users; INSERT INTO users (a) VALUES (1); UPDATE users SET a=2;'), []);
});

// ---------------------------------------------------------------------------
// The relational checks -- the wedge. Each depends on a *different* statement,
// so a per-statement linter cannot reach any of them.
// ---------------------------------------------------------------------------

test('no-lock-timeout fires on an exclusive-lock statement with no timeout above it', () => {
  assert.ok(has('ALTER TABLE users DROP COLUMN a;', 'no-lock-timeout'));
});

test("SET lock_timeout above the statement clears no-lock-timeout", () => {
  const sql = "SET lock_timeout = '3s';\nALTER TABLE users DROP COLUMN a;";
  assert.ok(!has(sql, 'no-lock-timeout'));
});

test('the timeout must precede the statement to protect it', () => {
  const sql = "ALTER TABLE users DROP COLUMN a;\nSET lock_timeout = '3s';";
  assert.ok(has(sql, 'no-lock-timeout'), 'a timeout set afterwards protects nothing');
});

test('SET LOCAL lock_timeout and TO syntax both count', () => {
  for (const spelling of ["SET LOCAL lock_timeout = '3s'", "SET lock_timeout TO '3s'", "SET SESSION lock_timeout = '5s'"]) {
    const sql = `${spelling};\nALTER TABLE users DROP COLUMN a;`;
    assert.ok(!has(sql, 'no-lock-timeout'), `${spelling} should count as a timeout`);
  }
});

test('lock_timeout = 0 is not a timeout — it is the dangerous default, spelled out', () => {
  // Otherwise the check could be silenced by explicitly asking for the
  // behaviour it exists to warn about.
  for (const value of ['0', "'0'", 'DEFAULT']) {
    const sql = `SET lock_timeout = ${value};\nALTER TABLE users DROP COLUMN a;`;
    assert.ok(has(sql, 'no-lock-timeout'), `lock_timeout = ${value} must not count`);
  }
});

test('CREATE INDEX CONCURRENTLY inside a transaction is flagged — it fails at runtime', () => {
  const sql = 'BEGIN;\nCREATE INDEX CONCURRENTLY idx ON users (email);\nCOMMIT;';
  assert.ok(has(sql, 'create-index-concurrently-in-tx'));
});

test('NOT VALID then VALIDATE in the same transaction is flagged', () => {
  const sql = `BEGIN;
ALTER TABLE users ADD CONSTRAINT fk1 FOREIGN KEY (org_id) REFERENCES orgs (id) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT fk1;
COMMIT;`;
  assert.ok(has(sql, 'validate-in-same-transaction'));
});

test('NOT VALID and VALIDATE in separate transactions is the correct pattern, not flagged', () => {
  const sql = `SET lock_timeout='3s';
ALTER TABLE users ADD CONSTRAINT fk1 FOREIGN KEY (org_id) REFERENCES orgs (id) NOT VALID;
ALTER TABLE users VALIDATE CONSTRAINT fk1;`;
  assert.ok(!has(sql, 'validate-in-same-transaction'));
  assert.ok(!has(sql, 'add-constraint-validates'), 'NOT VALID is the fix, not the defect');
});

test('SET NOT NULL with a validated CHECK earlier in the file takes the PG12 fast path', () => {
  const sql = `SET lock_timeout='3s';
ALTER TABLE users ADD CONSTRAINT users_email_nn CHECK (email IS NOT NULL);
ALTER TABLE users ALTER COLUMN email SET NOT NULL;`;
  assert.ok(!has(sql, 'set-not-null-full-scan'), 'the validated CHECK is the proof that skips the scan');
});

test('SET NOT NULL with no CHECK to lean on is flagged', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ALTER COLUMN email SET NOT NULL;";
  assert.ok(has(sql, 'set-not-null-full-scan'));
});

test('a NOT VALID check does not count as the proof — it has not been validated', () => {
  const sql = `SET lock_timeout='3s';
ALTER TABLE users ADD CONSTRAINT nn CHECK (email IS NOT NULL) NOT VALID;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;`;
  assert.ok(has(sql, 'set-not-null-full-scan'), 'only a VALIDATED check skips the scan');
});

test('two exclusive-lock statements in one transaction are reported once', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
ALTER TABLE a DROP COLUMN x;
ALTER TABLE b DROP COLUMN y;
ALTER TABLE c DROP COLUMN z;
COMMIT;`;
  const found = ids(sql).filter((id) => id === 'many-locks-one-transaction');
  assert.equal(found.length, 1, 'one finding per transaction, not one per statement');
});

test('exclusive-lock statements outside a transaction are not grouped', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE a DROP COLUMN x;\nALTER TABLE b DROP COLUMN y;";
  assert.ok(!has(sql, 'many-locks-one-transaction'));
});

test('a new transaction resets the lock grouping', () => {
  const sql = `SET lock_timeout='3s';
BEGIN; ALTER TABLE a DROP COLUMN x; COMMIT;
BEGIN; ALTER TABLE b DROP COLUMN y; COMMIT;`;
  assert.ok(!has(sql, 'many-locks-one-transaction'), 'one lock each is not a grouping');
});

// ---------------------------------------------------------------------------
// The per-statement checks.
// ---------------------------------------------------------------------------

test('CREATE INDEX without CONCURRENTLY is flagged', () => {
  assert.ok(has('CREATE INDEX idx ON users (email);', 'create-index-not-concurrent'));
});

test('CREATE UNIQUE INDEX without CONCURRENTLY is flagged too', () => {
  assert.ok(has('CREATE UNIQUE INDEX idx ON users (email);', 'create-index-not-concurrent'));
});

test('ALTER COLUMN TYPE is flagged, including numeric(p,s) whose comma broke the first draft', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2);";
  assert.ok(has(sql, 'alter-column-type-rewrite'));
});

test('SET DATA TYPE spelling is recognised', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE orders ALTER COLUMN total SET DATA TYPE bigint;";
  assert.ok(has(sql, 'alter-column-type-rewrite'));
});

test('a type change to text says it may be free rather than asserting a rewrite', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ALTER COLUMN name TYPE text;";
  const f = analyzeSql(sql).findings.find((x) => x.id === 'alter-column-type-rewrite');
  assert.match(f.impact, /may be an exception|metadata-only/i);
  assert.match(f.impact, /cannot tell/i, 'it must say it does not know the current type');
});

test('a type change to an unrelated type does not claim it may be free', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE t ALTER COLUMN c TYPE jsonb;";
  const f = analyzeSql(sql).findings.find((x) => x.id === 'alter-column-type-rewrite');
  assert.doesNotMatch(f.impact, /may be an exception/i);
});

test('targetTypeMayBeFree recognises only the widening targets', () => {
  assert.equal(targetTypeMayBeFree('text'), true);
  assert.equal(targetTypeMayBeFree('varchar(100)'), true);
  assert.equal(targetTypeMayBeFree('character varying(100)'), true);
  assert.equal(targetTypeMayBeFree('jsonb'), false);
  assert.equal(targetTypeMayBeFree('bigint'), false);
});

test('a validating foreign key is flagged, and NOT VALID is not', () => {
  const base = "SET lock_timeout='3s';\nALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (o) REFERENCES orgs (id)";
  assert.ok(has(`${base};`, 'add-constraint-validates'));
  assert.ok(!has(`${base} NOT VALID;`, 'add-constraint-validates'));
});

test('a validating CHECK constraint is flagged', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE t ADD CONSTRAINT c CHECK (n > 0);";
  assert.ok(has(sql, 'add-constraint-validates'));
});

test('ADD PRIMARY KEY builds an index under lock', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE t ADD PRIMARY KEY (id);";
  assert.ok(has(sql, 'add-key-builds-index'));
});

test('ADD UNIQUE USING INDEX adopts an index built concurrently earlier, and is not flagged', () => {
  const sql = `CREATE UNIQUE INDEX CONCURRENTLY u_email ON users (email);
SET lock_timeout='3s';
ALTER TABLE users ADD CONSTRAINT u_email UNIQUE USING INDEX u_email;`;
  assert.ok(!has(sql, 'add-key-builds-index'), 'the index already exists; attaching it is metadata-only');
});

test('USING INDEX naming an index this file never builds is still flagged, with the reason', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ADD CONSTRAINT u UNIQUE USING INDEX u_email;";
  const f = analyzeSql(sql).findings.find((x) => x.id === 'add-key-builds-index');
  assert.ok(f, 'flagged, because this file does not show the index being built');
  assert.match(f.impact, /nothing earlier in this file/i);
});

test('VACUUM FULL, CLUSTER and non-concurrent REINDEX are flagged; REINDEX CONCURRENTLY is not', () => {
  const pre = "SET lock_timeout='3s';\n";
  assert.ok(has(`${pre}VACUUM FULL users;`, 'full-table-rewrite'));
  assert.ok(has(`${pre}CLUSTER users USING idx;`, 'full-table-rewrite'));
  assert.ok(has(`${pre}REINDEX TABLE users;`, 'full-table-rewrite'));
  assert.ok(!has(`${pre}REINDEX TABLE CONCURRENTLY users;`, 'full-table-rewrite'));
});

test('TRUNCATE is flagged', () => {
  assert.ok(has("SET lock_timeout='3s';\nTRUNCATE audit_log;", 'truncate'));
});

test('DROP COLUMN and RENAME are warnings about the deploy, not the lock', () => {
  const pre = "SET lock_timeout='3s';\n";
  assert.ok(has(`${pre}ALTER TABLE users DROP COLUMN legacy;`, 'drop-column'));
  assert.ok(has(`${pre}ALTER TABLE users RENAME COLUMN a TO b;`, 'rename-breaks-callers'));
  const f = analyzeSql(`${pre}ALTER TABLE users DROP COLUMN legacy;`).findings.find((x) => x.id === 'drop-column');
  assert.equal(f.severity, WARN);
  assert.match(f.impact, /rolling deploy/i);
});

test('DROP INDEX without CONCURRENTLY is a warning', () => {
  const sql = "SET lock_timeout='3s';\nDROP INDEX idx;";
  assert.ok(has(sql, 'drop-index-not-concurrent'));
  assert.ok(!has('DROP INDEX CONCURRENTLY idx;', 'drop-index-not-concurrent'));
});

// ---------------------------------------------------------------------------
// Report shape.
// ---------------------------------------------------------------------------

test('every finding carries a line, the statement, an impact and a fix', () => {
  const result = analyzeSql('ALTER TABLE users ADD COLUMN t uuid DEFAULT gen_random_uuid();');
  assert.ok(result.findings.length > 0);
  for (const f of result.findings) {
    assert.ok(Number.isInteger(f.line) && f.line > 0, `${f.id} has no line`);
    assert.ok(f.statement && f.statement.length > 0, `${f.id} does not quote the statement`);
    assert.ok(f.impact && f.impact.length > 40, `${f.id} has no substantive impact text`);
    assert.ok(f.fix && f.fix.length > 20, `${f.id} has no fix`);
    assert.ok([RISK, WARN].includes(f.severity), `${f.id} has an odd severity`);
  }
});

test('every check id in CHECKS is unique and every finding id is declared', () => {
  const declared = new Set(CHECKS.map((c) => c.id));
  assert.equal(declared.size, CHECKS.length, 'duplicate check id');
  // A finding whose id is not in CHECKS would be invisible to --list-checks,
  // so the page's "the whole list, nothing hidden" claim would be false.
  const sql = `BEGIN;
ALTER TABLE users ADD COLUMN t uuid DEFAULT gen_random_uuid();
CREATE INDEX i ON users (t);
CREATE INDEX CONCURRENTLY j ON users (t);
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT fk FOREIGN KEY (o) REFERENCES orgs (id);
ALTER TABLE users ADD PRIMARY KEY (id);
ALTER TABLE users DROP COLUMN legacy;
ALTER TABLE users RENAME COLUMN a TO b;
ALTER TABLE users ALTER COLUMN c TYPE bigint;
DROP INDEX k;
TRUNCATE audit;
VACUUM FULL users;
COMMIT;`;
  for (const f of analyzeSql(sql).findings) {
    assert.ok(declared.has(f.id), `finding ${f.id} is not declared in CHECKS`);
  }
});

test('findings are ordered by line so the report reads top to bottom', () => {
  const sql = `ALTER TABLE a DROP COLUMN x;
TRUNCATE b;
CREATE INDEX i ON c (d);`;
  const lines = analyzeSql(sql).findings.map((f) => f.line);
  assert.deepEqual(lines, [...lines].sort((p, q) => p - q));
});

test('the verdict escalates from clean to review to can-block', () => {
  assert.equal(analyzeSql('SELECT 1;').verdict, 'clean');
  assert.equal(analyzeSql("SET lock_timeout='3s';\nALTER TABLE t RENAME COLUMN a TO b;").verdict, 'review');
  assert.equal(analyzeSql('CREATE INDEX i ON t (a);').verdict, 'can-block');
});

test('summaryLine never claims the migration is safe', () => {
  assert.match(summaryLine(analyzeSql('SELECT 1;')), /these checks found nothing|No blocking statement/i);
  assert.doesNotMatch(summaryLine(analyzeSql('SELECT 1;')), /\bis safe\b/i);
});

test('statement and kind counts are reported', () => {
  const r = analyzeSql('SELECT 1; ALTER TABLE t DROP COLUMN a;');
  assert.equal(r.statements, 2);
  assert.deepEqual(r.kinds, ['ALTER', 'SELECT']);
});

test('analyzeSources attributes every finding to its file', () => {
  const result = analyzeSources([
    { name: '001.sql', text: 'CREATE INDEX i ON t (a);' },
    { name: '002.sql', text: 'SELECT 1;' },
  ]);
  assert.equal(result.files.length, 2);
  assert.ok(result.findings.every((f) => f.file === '001.sql'));
  assert.equal(result.verdict, 'can-block');
});

test('an empty input is clean rather than an error', () => {
  const r = analyzeSql('');
  assert.equal(r.verdict, 'clean');
  assert.equal(r.statements, 0);
});

test('a realistic migration that would pass code review is caught', () => {
  // The page's worked example. If this stops producing findings, the example
  // has stopped making the point the page claims it makes.
  const sql = `BEGIN;
ALTER TABLE users ADD COLUMN api_token uuid DEFAULT gen_random_uuid();
CREATE INDEX idx_users_api_token ON users (api_token);
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT fk_orders_org
  FOREIGN KEY (org_id) REFERENCES organisations (id);
COMMIT;`;
  const found = new Set(ids(sql));
  for (const expected of [
    'add-column-volatile-default',
    'create-index-not-concurrent',
    'set-not-null-full-scan',
    'add-constraint-validates',
    'no-lock-timeout',
  ]) {
    assert.ok(found.has(expected), `worked example should report ${expected}`);
  }
  assert.equal(analyzeSql(sql).verdict, 'can-block');
});

// ---------------------------------------------------------------------------
// Statements against a table this file just created. Added after running the
// tool against this repository's own Prisma migrations, where it produced 72
// findings and almost every one was a CREATE INDEX on a table created a few
// lines above -- i.e. an initial migration, where there are no rows to lock
// and no contention to wait for. The checks below are the ones that keep that
// correction honest in both directions.
// ---------------------------------------------------------------------------

test('CREATE INDEX on a table created in the same file is not flagged', () => {
  const sql = `CREATE TABLE users (id bigserial PRIMARY KEY, email text);
CREATE INDEX idx_users_email ON users (email);`;
  assert.ok(!has(sql, 'create-index-not-concurrent'), 'a new table has no rows to lock');
});

test('CREATE INDEX on a table this file did NOT create is still flagged', () => {
  const sql = `CREATE TABLE orders (id bigserial PRIMARY KEY);
CREATE INDEX idx_users_email ON users (email);`;
  assert.ok(has(sql, 'create-index-not-concurrent'), 'users is pre-existing');
});

test('quoted table names match when deciding a table is new', () => {
  // Prisma and other generators quote every identifier, so this is the common
  // spelling rather than an edge case.
  const sql = `CREATE TABLE "Participant" ("id" text NOT NULL);
CREATE INDEX "Participant_idx" ON "Participant"("id");`;
  assert.ok(!has(sql, 'create-index-not-concurrent'));
});

test('ALTER TABLE on a newly created table is not flagged at all', () => {
  const sql = `CREATE TABLE users (id bigserial PRIMARY KEY, email text);
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT fk FOREIGN KEY (id) REFERENCES orgs (id);`;
  assert.deepEqual(ids(sql), [], 'no rows exist, so nothing is scanned or rewritten');
});

test('CREATE TABLE IF NOT EXISTS and UNLOGGED spellings register the table', () => {
  for (const spelling of ['CREATE TABLE IF NOT EXISTS users', 'CREATE UNLOGGED TABLE users']) {
    const sql = `${spelling} (id int);\nCREATE INDEX i ON users (id);`;
    assert.ok(!has(sql, 'create-index-not-concurrent'), `${spelling} should register users`);
  }
});

// The one check that must survive the new-table rule, because it is about a
// statement that *cannot run* rather than one that is slow.
test('CREATE INDEX CONCURRENTLY in a transaction is flagged even on a new table', () => {
  const sql = `BEGIN;
CREATE TABLE users (id int);
CREATE INDEX CONCURRENTLY i ON users (id);
COMMIT;`;
  assert.ok(
    has(sql, 'create-index-concurrently-in-tx'),
    'it fails at runtime regardless of how many rows the table has',
  );
});

test('a new table does not suppress findings against a different table', () => {
  const sql = `CREATE TABLE fresh (id int);
CREATE INDEX i ON fresh (id);
TRUNCATE audit_log;`;
  assert.ok(!has(sql, 'create-index-not-concurrent'));
  assert.ok(has(sql, 'truncate'), 'audit_log is not the new table');
});

test('the quoted statement excludes its own leading comment', () => {
  // Found by dogfooding: generated migrations put a comment above every
  // statement, and quoting the raw text rendered the finding as
  // "-- CreateIndex CREATE UNIQUE INDEX ...", which reads as commented-out
  // code and makes a correct finding look like a tool bug.
  const sql = '-- CreateIndex\nCREATE INDEX idx ON users (email);';
  const f = analyzeSql(sql).findings.find((x) => x.id === 'create-index-not-concurrent');
  assert.ok(f, 'the finding should still be produced');
  assert.doesNotMatch(f.statement, /--/, 'the comment must not be quoted as part of the SQL');
  assert.match(f.statement, /^CREATE INDEX/i);
});

test('a string literal survives into the quoted statement', () => {
  // The other half of the comment fix: comments go, literals stay, so the
  // user sees the statement they actually wrote.
  const sql = "ALTER TABLE t ADD COLUMN c text DEFAULT 'hello world';\nTRUNCATE t2;";
  const f = analyzeSql(sql).findings.find((x) => x.id === 'no-lock-timeout');
  assert.match(f.statement, /'hello world'/);
});

test('the lock grouping counts non-ALTER exclusive statements too', () => {
  // TRUNCATE and DROP TABLE both take ACCESS EXCLUSIVE. The grouping check
  // used to live inside the ALTER TABLE branch, so this file -- two exclusive
  // locks held together for the length of the block, exactly what the check's
  // title describes -- reported nothing at all.
  const sql = `SET lock_timeout='3s';
BEGIN;
TRUNCATE audit_log;
DROP TABLE legacy_sessions;
COMMIT;`;
  assert.ok(has(sql, 'many-locks-one-transaction'));
});

test('a single non-ALTER exclusive statement in a transaction is not a grouping', () => {
  const sql = "SET lock_timeout='3s';\nBEGIN;\nTRUNCATE audit_log;\nCOMMIT;";
  assert.ok(!has(sql, 'many-locks-one-transaction'));
});

test('mixed ALTER and non-ALTER exclusive statements group together', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
TRUNCATE audit_log;
ALTER TABLE users DROP COLUMN legacy;
COMMIT;`;
  assert.ok(has(sql, 'many-locks-one-transaction'));
});

// Red-team gap tests, 2026-11-18: mutants that survived the suite above.

test('NOT VALID outside a block, VALIDATE inside a later one, is not the same transaction', () => {
  const sql = `SET lock_timeout='3s';
ALTER TABLE users ADD CONSTRAINT fk1 FOREIGN KEY (org_id) REFERENCES orgs (id) NOT VALID;
BEGIN;
ALTER TABLE users VALIDATE CONSTRAINT fk1;
COMMIT;`;
  assert.ok(!has(sql, 'validate-in-same-transaction'));
});

test('ADD PRIMARY KEY USING INDEX with no concurrent build names the index in the impact', () => {
  const sql = "SET lock_timeout='3s';\nALTER TABLE users ADD CONSTRAINT users_pk PRIMARY KEY USING INDEX users_pk_idx;";
  const f = analyzeSql(sql).findings.find((x) => x.id === 'add-key-builds-index');
  assert.ok(f, 'an index built elsewhere is still reported');
  assert.match(f.impact, /USING INDEX users_pk_idx/);
});

// Real defects found 2026-11-18: transaction-block tracking. PostgreSQL has one
// flat transaction block, ended by COMMIT, END, ROLLBACK or ABORT; it does not
// nest, and ROLLBACK TO SAVEPOINT does not end it.

test('ROLLBACK TO SAVEPOINT does not end the block: a later CONCURRENTLY still fails', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
SAVEPOINT before_index;
ROLLBACK TO SAVEPOINT before_index;
CREATE INDEX CONCURRENTLY idx ON users (email);
COMMIT;`;
  assert.ok(has(sql, 'create-index-concurrently-in-tx'));
});

test('ROLLBACK TO SAVEPOINT keeps NOT VALID and VALIDATE in the same transaction', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
ALTER TABLE users ADD CONSTRAINT fk1 FOREIGN KEY (org_id) REFERENCES orgs (id) NOT VALID;
SAVEPOINT s;
ROLLBACK TO s;
ALTER TABLE users VALIDATE CONSTRAINT fk1;
COMMIT;`;
  assert.ok(has(sql, 'validate-in-same-transaction'));
});

test('ABORT ends a block like ROLLBACK', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
ABORT;
CREATE INDEX CONCURRENTLY idx ON users (email);`;
  assert.ok(!has(sql, 'create-index-concurrently-in-tx'));
});

test('a second BEGIN does not nest: one COMMIT ends the block', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
BEGIN;
COMMIT;
CREATE INDEX CONCURRENTLY idx ON users (email);`;
  assert.ok(!has(sql, 'create-index-concurrently-in-tx'));
});

test('COMMIT AND CHAIN opens a new block at once', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
COMMIT AND CHAIN;
CREATE INDEX CONCURRENTLY idx ON users (email);
COMMIT;`;
  assert.ok(has(sql, 'create-index-concurrently-in-tx'));
});

// ---------------------------------------------------------------------------
// Red team 2026-11-18: guards for mutants that escaped the suite.
// ---------------------------------------------------------------------------

test('a non-concurrent REINDEX needs a lock_timeout like any exclusive lock', () => {
  assert.ok(has('REINDEX TABLE users;', 'no-lock-timeout'));
  assert.ok(!has('REINDEX TABLE CONCURRENTLY users;', 'no-lock-timeout'));
});

test('COMMIT ends the lock grouping: one exclusive lock in each of two transactions is not "many locks"', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
TRUNCATE a;
COMMIT;
BEGIN;
TRUNCATE b;
COMMIT;`;
  assert.ok(!has(sql, 'many-locks-one-transaction'));
});

test('COMMIT AND CHAIN ends the lock grouping too', () => {
  const sql = `SET lock_timeout='3s';
BEGIN;
TRUNCATE a;
COMMIT AND CHAIN;
TRUNCATE b;
COMMIT;`;
  assert.ok(!has(sql, 'many-locks-one-transaction'));
});

test('analyzeSources: a single warning across all files makes the verdict "review"', () => {
  const r = analyzeSources([
    { name: 'a.sql', text: 'SELECT 1;' },
    { name: 'b.sql', text: "SET lock_timeout='3s';\nALTER TABLE t RENAME COLUMN a TO b;" },
  ]);
  assert.deepEqual(r.counts, { risk: 0, warn: 1 });
  assert.equal(r.verdict, 'review');
});

// Real defect (red team 2026-11-18): a lock_timeout, once seen, protected every
// later statement in the file, even after the file turned it off again or the
// transaction that set it ended. PostgreSQL scopes it: SET LOCAL lasts until
// COMMIT/ROLLBACK, a ROLLBACK undoes a SET made inside the block, and
// `SET ... = 0`, `TO DEFAULT`, `RESET lock_timeout` and `RESET ALL` switch it off.
const RENAME = 'ALTER TABLE t RENAME COLUMN a TO b;';
test('turning lock_timeout off again leaves the next exclusive lock unprotected', () => {
  for (const off of ['SET lock_timeout = 0;', "SET lock_timeout = '0';", 'SET lock_timeout TO DEFAULT;', 'RESET lock_timeout;', 'RESET ALL;']) {
    assert.ok(has(`SET lock_timeout='3s';\n${off}\n${RENAME}`, 'no-lock-timeout'), off);
  }
  assert.ok(!has(`SET lock_timeout = 0;\nSET lock_timeout='3s';\n${RENAME}`, 'no-lock-timeout'));
});

test('SET LOCAL lock_timeout stops applying when its transaction ends', () => {
  assert.ok(!has(`BEGIN;\nSET LOCAL lock_timeout='3s';\n${RENAME}\nCOMMIT;`, 'no-lock-timeout'));
  assert.ok(has(`BEGIN;\nSET LOCAL lock_timeout='3s';\nCOMMIT;\n${RENAME}`, 'no-lock-timeout'));
  // A session-level timeout survives COMMIT, and a SET LOCAL 0 only hides it inside its block.
  assert.ok(!has(`BEGIN;\nSET lock_timeout='3s';\nCOMMIT;\n${RENAME}`, 'no-lock-timeout'));
  assert.ok(has(`SET lock_timeout='3s';\nBEGIN;\nSET LOCAL lock_timeout = 0;\n${RENAME}\nCOMMIT;`, 'no-lock-timeout'));
  assert.ok(!has(`SET lock_timeout='3s';\nBEGIN;\nSET LOCAL lock_timeout = 0;\nCOMMIT;\n${RENAME}`, 'no-lock-timeout'));
  // Without an explicit BEGIN, a migration runner's own transaction is assumed: still protected.
  assert.ok(!has(`SET LOCAL lock_timeout='3s';\n${RENAME}`, 'no-lock-timeout'));
});

test('ROLLBACK undoes a SET lock_timeout made inside the block', () => {
  assert.ok(has(`BEGIN;\nSET lock_timeout='3s';\nROLLBACK;\n${RENAME}`, 'no-lock-timeout'));
  assert.ok(!has(`SET lock_timeout='3s';\nBEGIN;\nRESET lock_timeout;\nROLLBACK;\n${RENAME}`, 'no-lock-timeout'));
});

test('VACUUM FULL and CLUSTER need a lock_timeout like any other ACCESS EXCLUSIVE statement', () => {
  assert.ok(has('VACUUM FULL users;', 'no-lock-timeout'));
  assert.ok(has('CLUSTER users USING idx;', 'no-lock-timeout'));
});

// Red-team 2026-11-18: lock classes the engine had wrong.
test('DROP INDEX CONCURRENTLY is not reported as needing a lock_timeout; plain DROP INDEX is', () => {
  assert.ok(!has('DROP INDEX CONCURRENTLY idx_users_email;', 'no-lock-timeout'));
  assert.ok(!has('DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;', 'no-lock-timeout'));
  assert.ok(has('DROP INDEX idx_users_email;', 'no-lock-timeout'));
});

test('REFRESH MATERIALIZED VIEW, DROP MATERIALIZED VIEW and LOCK TABLE take ACCESS EXCLUSIVE', () => {
  assert.ok(has('REFRESH MATERIALIZED VIEW mv;', 'no-lock-timeout'));
  assert.ok(!has('REFRESH MATERIALIZED VIEW CONCURRENTLY mv;', 'no-lock-timeout'), 'readers pass the CONCURRENTLY form');
  assert.ok(has('DROP MATERIALIZED VIEW mv;', 'no-lock-timeout'));
  assert.ok(has('LOCK TABLE users;', 'no-lock-timeout'), 'no mode means ACCESS EXCLUSIVE');
  assert.ok(has('LOCK TABLE users IN ACCESS EXCLUSIVE MODE;', 'no-lock-timeout'));
  assert.ok(!has('LOCK TABLE users IN SHARE MODE;', 'no-lock-timeout'));
  assert.ok(!has("SET lock_timeout='3s';\nLOCK TABLE users;", 'no-lock-timeout'));
});

test('BEGIN; LOCK TABLE a; LOCK TABLE b; COMMIT counts as two exclusive locks in one transaction', () => {
  assert.ok(has("SET lock_timeout='3s';\nBEGIN;\nLOCK TABLE a;\nLOCK TABLE b;\nCOMMIT;", 'many-locks-one-transaction'));
});

test('a table created as public.t is the same table as t, either way round', () => {
  const pre = "SET lock_timeout='3s';\n";
  assert.ok(!has(`${pre}CREATE TABLE public.t (id int);\nCREATE INDEX i ON t (id);`, 'create-index-not-concurrent'));
  assert.ok(!has(`${pre}CREATE TABLE t (id int);\nCREATE INDEX i ON public.t (id);`, 'create-index-not-concurrent'));
  assert.ok(!has(`${pre}CREATE TABLE "public"."T" (id int);\nCREATE INDEX i ON "T" (id);`, 'create-index-not-concurrent'));
  assert.ok(has(`${pre}CREATE TABLE other.t (id int);\nCREATE INDEX i ON t (id);`, 'create-index-not-concurrent'), 'another schema is another table');
});

test('CREATE INDEX ... ON ONLY t names t, so a table created here is still recognised', () => {
  const pre = "SET lock_timeout='3s';\n";
  assert.ok(!has(`${pre}CREATE TABLE t (id int);\nCREATE INDEX i ON ONLY t (id);`, 'create-index-not-concurrent'));
  const f = analyzeSql(`${pre}CREATE INDEX i ON ONLY users (id);`).findings.find((x) => x.id === 'create-index-not-concurrent');
  assert.equal(f.table, 'users');
});

test('a quoted schema-qualified name is one name to every check', () => {
  const pre = "SET lock_timeout='3s';\n";
  const typeChange = analyzeSql(`${pre}ALTER TABLE "public"."users" ALTER COLUMN "email" TYPE bigint;`).findings;
  assert.ok(typeChange.some((f) => f.id === 'alter-column-type-rewrite'), 'a full rewrite must not pass silently');
  const notNull = analyzeSql(`${pre}ALTER TABLE "public"."users" ALTER COLUMN "email" SET NOT NULL;`).findings
    .find((f) => f.id === 'set-not-null-full-scan');
  assert.equal(notNull.table, 'public.users');
});

test('plain DROP INDEX needs a lock_timeout and counts toward one transaction\'s locks', () => {
  assert.ok(has('DROP INDEX i;', 'no-lock-timeout'));
  assert.ok(has("SET lock_timeout='3s';\nBEGIN;\nDROP INDEX i;\nTRUNCATE b;\nCOMMIT;", 'many-locks-one-transaction'));
});

// Red team 2026-11-18 (second pass): a stray ROLLBACK before any BEGIN
// restores the timeout state "at BEGIN", which must start as off. Seeding
// `sessionAtBegin = true` made the stray ROLLBACK switch the timeout on and
// silenced every later finding; no test noticed.
test('a stray ROLLBACK before any BEGIN does not invent a lock_timeout', () => {
  assert.ok(has(`ROLLBACK;\n${RENAME}`, 'no-lock-timeout'));
});

// Red team 2026-11-19: every TRUNCATE test above sets a lock_timeout, so
// TRUNCATE could stop counting as an exclusive-lock statement unseen.
test('TRUNCATE with no lock_timeout gets the no-lock-timeout risk', () => {
  assert.ok(has('TRUNCATE audit_log;', 'no-lock-timeout'));
  assert.ok(!has("SET lock_timeout = '3s';\nTRUNCATE audit_log;", 'no-lock-timeout'));
});

// Red team 2026-11-19, real defect: setsLockTimeout read the raw statement,
// comments included, so a comment above `SET lock_timeout` (how most
// hand-written migrations explain it) hid the SET and every exclusive-lock
// statement after it got a false no-lock-timeout risk.
test('a comment before SET lock_timeout does not hide it', () => {
  for (const sql of [
    "-- give up fast rather than queue\nSET lock_timeout = '3s';\nDROP TABLE t;",
    "/* fail fast */ SET lock_timeout = '3s';\nDROP TABLE t;",
    "SET lock_timeout = /* 3 s */ '3s';\nDROP TABLE t;",
    "-- one\n-- two\nBEGIN;\n-- local\nSET LOCAL lock_timeout TO '2s';\nDROP TABLE t;\nCOMMIT;",
  ]) assert.ok(!has(sql, 'no-lock-timeout'), sql);
});

// Red team 2026-11-19, real defect: only `0`, `0ms`, `0s` and `0min` read as
// "off", so `'0us'`, `'0h'`, `'0d'`, `'0.0'` and `00` -- all of which
// PostgreSQL takes as lock_timeout = 0, no timeout -- silenced the risk.
test('every spelling of a zero lock_timeout counts as no timeout', () => {
  for (const v of ['0', '00', '0.0', "'0us'", "'0ms'", "'0 ms'", "'0s'", "'0min'", "'0h'", "'0d'", "'0.4ms'", "'400us'", 'DEFAULT', "'-1'"]) {
    assert.ok(has(`SET lock_timeout = ${v};\nDROP TABLE t;`, 'no-lock-timeout'), v);
  }
  for (const v of ['1', "'3s'", "'2 s'", "'1.5s'", "'500ms'", "'1min'", "'1h'", "'1500us'", '3000', "'0.6ms'"]) {
    assert.ok(!has(`SET lock_timeout = ${v};\nDROP TABLE t;`, 'no-lock-timeout'), v);
  }
});

// Red team 2026-11-19. DISCARD ALL resets every session setting, lock_timeout
// included, exactly as RESET ALL does: a timeout set above it no longer
// protects what follows.
test('DISCARD ALL turns lock_timeout off like RESET ALL', () => {
  assert.ok(has(`SET lock_timeout='3s';\nDISCARD ALL;\n${RENAME}`, 'no-lock-timeout'));
  assert.ok(has(`SET lock_timeout='3s';\ndiscard all\n;\n${RENAME}`, 'no-lock-timeout'));
  // DISCARD PLANS / SEQUENCES / TEMP leave settings alone.
  assert.ok(!has(`SET lock_timeout='3s';\nDISCARD PLANS;\n${RENAME}`, 'no-lock-timeout'));
});

// Red team 2026-11-19. set_config('lock_timeout', v, is_local) is the function
// form of SET (is_local true = SET LOCAL); a file that used it got a false
// no-lock-timeout on every exclusive statement below.
test("SELECT set_config('lock_timeout', ...) counts as SET / SET LOCAL", () => {
  assert.ok(!has(`SELECT set_config('lock_timeout', '3s', false);\n${RENAME}`, 'no-lock-timeout'));
  assert.ok(!has(`select pg_catalog.set_config( 'lock_timeout' , '5000' , true );\n${RENAME}`, 'no-lock-timeout'));
  assert.ok(has(`SET lock_timeout='3s';\nSELECT set_config('lock_timeout', '0', false);\n${RENAME}`, 'no-lock-timeout'));
  // is_local true ends at COMMIT, like SET LOCAL.
  assert.ok(has(`BEGIN;\nSELECT set_config('lock_timeout', '3s', true);\nCOMMIT;\n${RENAME}`, 'no-lock-timeout'));
  // Another setting is not a lock_timeout.
  assert.ok(has(`SELECT set_config('statement_timeout', '3s', false);\n${RENAME}`, 'no-lock-timeout'));
});

// Red team 2026-11-19 (escaped mutants engine.mjs:156 and :215).
test("lock_timeout in seconds is 1000 ms: '0.0005s' rounds to 0, '0.0006s' to 1 ms", () => {
  assert.ok(has(`SET lock_timeout = '0.0005s';\n${RENAME}`, 'no-lock-timeout'));
  assert.ok(!has(`SET lock_timeout = '0.0006s';\n${RENAME}`, 'no-lock-timeout'));
});

test('a statement of exactly 160 characters is quoted whole; 161 is shortened to 160', () => {
  const quote = (len) => {
    const pad = 'x'.repeat(len - 'ALTER TABLE t DROP COLUMN '.length);
    return analyzeSql(`SET lock_timeout='3s';\nALTER TABLE t DROP COLUMN ${pad};`).findings.find((f) => f.id === 'drop-column').statement;
  };
  const at160 = quote(160);
  assert.equal(at160.length, 160);
  assert.ok(!at160.endsWith('…'));
  const at161 = quote(161);
  assert.equal(at161.length, 160);
  assert.ok(at161.endsWith('…'));
});

// Red team 2026-11-19: three mutants of the timeout parser and the finding
// order escaped every test above.
test('lock_timeout under half a millisecond is 0 in every unit, minutes included', () => {
  const RENAME = 'ALTER TABLE users DROP COLUMN a;';
  // 0.0000083333 min = 0.499998 ms, which PostgreSQL rounds to 0: still off.
  for (const v of ["'0.4ms'", "'400us'", "'0.0000083333min'"]) {
    assert.ok(has(`SET lock_timeout = ${v};\n${RENAME}`, 'no-lock-timeout'), `${v} rounds to 0`);
  }
  // 0.00001 min = 0.6 ms rounds to 1 ms: a timeout.
  assert.ok(!has(`SET lock_timeout = '0.00001min';\n${RENAME}`, 'no-lock-timeout'));
});

test('a lock_timeout value the parser cannot read counts as a timeout, not as 0', () => {
  // PostgreSQL rejects real garbage, so no false all-clear ships; a spelling
  // the regex misses ('1e3') must not raise a false finding.
  assert.ok(!has("SET lock_timeout = '1e3';\nALTER TABLE users DROP COLUMN a;", 'no-lock-timeout'));
});

test('findings come back in line order, then by id within a line', () => {
  const got = analyzeSql('BEGIN;\nALTER TABLE a DROP COLUMN x;\nALTER TABLE b DROP COLUMN y;\nCOMMIT;').findings.map((f) => `${f.line}:${f.id}`);
  assert.deepEqual(got, ['2:drop-column', '2:no-lock-timeout', '3:drop-column', '3:many-locks-one-transaction', '3:no-lock-timeout']);
});
