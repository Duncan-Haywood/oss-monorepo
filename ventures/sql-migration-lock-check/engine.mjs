// sql-migration-lock-check -- which statements in this migration can take the
// database down, and why.
//
// Pure functions over text. No filesystem, no network, no database connection:
// the whole point is that this is safe to run against the migration you are
// about to apply to production, and the way it earns that is by having nothing
// to connect to.
//
// ---------------------------------------------------------------------------
// The rule this file follows, and the reason it is not just a keyword grep.
//
// A migration linter that flags every `ALTER TABLE` is useless: practitioners
// stop reading it by the third migration, and then it is worth less than
// nothing because they also stop reading the true findings. So every check
// here is written to the *actual* PostgreSQL behaviour, including the cases
// where the scary-looking statement is genuinely fine:
//
//   - `ADD COLUMN ... DEFAULT <constant>` has not rewritten the table since
//     PostgreSQL 11. Only a VOLATILE default does. So `DEFAULT now()` (STABLE)
//     is not flagged and `DEFAULT gen_random_uuid()` (VOLATILE) is.
//   - `ALTER COLUMN TYPE varchar(50) -> varchar(100)` does not rewrite, nor
//     does `-> text`. Narrowing, or changing to an unrelated type, does.
//   - `maxUnavailable`-style arithmetic has an analogue here: `SET NOT NULL`
//     is a cheap metadata change *if* a validated equivalent CHECK constraint
//     already exists (PostgreSQL 12+), and a full table scan holding ACCESS
//     EXCLUSIVE if it does not. Whether it does is a fact about the rest of
//     the file, not about the statement.
//
// That last shape is the wedge. Three of the checks below are *relational* --
// they are about one statement in the context of another, or of a session
// setting -- and a per-statement linter cannot see any of them:
//
//   no-lock-timeout                 an exclusive-lock statement with no
//                                   lock_timeout set anywhere above it
//   validate-in-same-transaction    NOT VALID then VALIDATE inside one
//                                   transaction, which undoes the split
//   create-index-concurrently-in-tx CONCURRENTLY inside BEGIN, which simply
//                                   errors at runtime
// ---------------------------------------------------------------------------

import { splitStatements, normalize, leadingKeyword } from './sql.mjs';

export const RISK = 'risk';
export const WARN = 'warn';

/**
 * Every check, in report order. `--list-checks` prints this verbatim, and the
 * browser page renders it, so there is nothing hidden behind the tool.
 */
export const CHECKS = [
  { id: 'no-lock-timeout', severity: RISK, title: 'An exclusive-lock statement runs with no lock_timeout, so it can queue behind a slow query and block the table for everyone' },
  { id: 'create-index-not-concurrent', severity: RISK, title: 'CREATE INDEX without CONCURRENTLY blocks every write to the table while the index builds' },
  { id: 'create-index-concurrently-in-tx', severity: RISK, title: 'CREATE INDEX CONCURRENTLY inside a transaction block fails at runtime' },
  { id: 'alter-column-type-rewrite', severity: RISK, title: 'ALTER COLUMN TYPE rewrites the whole table under an exclusive lock' },
  { id: 'add-column-volatile-default', severity: RISK, title: 'ADD COLUMN with a volatile DEFAULT rewrites every row' },
  { id: 'set-not-null-full-scan', severity: RISK, title: 'SET NOT NULL scans the whole table under an exclusive lock with no validated CHECK to lean on' },
  { id: 'add-constraint-validates', severity: RISK, title: 'ADD CONSTRAINT without NOT VALID validates every existing row before releasing the lock' },
  { id: 'validate-in-same-transaction', severity: RISK, title: 'NOT VALID and VALIDATE CONSTRAINT in one transaction hold the lock for the whole validation anyway' },
  { id: 'add-key-builds-index', severity: RISK, title: 'ADD PRIMARY KEY / UNIQUE builds its index under an exclusive lock instead of adopting one built concurrently' },
  { id: 'full-table-rewrite', severity: RISK, title: 'VACUUM FULL, CLUSTER or a non-concurrent REINDEX rewrites the table under an exclusive lock' },
  { id: 'truncate', severity: RISK, title: 'TRUNCATE discards every row and takes an exclusive lock' },
  { id: 'many-locks-one-transaction', severity: WARN, title: 'Several exclusive-lock statements share one transaction, so the first lock is held until the last one finishes' },
  { id: 'drop-column', severity: WARN, title: 'DROP COLUMN breaks any application still selecting it' },
  { id: 'rename-breaks-callers', severity: WARN, title: 'RENAME breaks any application still using the old name' },
  { id: 'drop-index-not-concurrent', severity: WARN, title: 'DROP INDEX without CONCURRENTLY takes an exclusive lock on the table' },
];

const CHECK_BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

/** PostgreSQL functions that are VOLATILE, and so force a table rewrite when
 * used as a column default. Deliberately a list of the volatile ones rather
 * than a "looks like a function call" pattern: `now()`, `current_timestamp`
 * and `CURRENT_DATE` are STABLE, do *not* rewrite on PostgreSQL 11+, and
 * flagging them is exactly the cry-wolf failure this tool is trying to avoid. */
const VOLATILE_DEFAULTS = [
  'random', 'gen_random_uuid', 'uuid_generate_v1', 'uuid_generate_v4',
  'clock_timestamp', 'timeofday', 'nextval', 'statement_timestamp',
];

/**
 * Is the *target* type one that can be reached without a rewrite, given a
 * compatible current type?
 *
 * This deliberately answers a weaker question than "is this change safe?",
 * because the stronger one is not answerable from a migration file: `ALTER
 * COLUMN x TYPE text` never states what `x` is today, and the current type is
 * what decides. Widening `varchar(50)` to `varchar(100)`, or either to `text`,
 * is metadata-only; narrowing, or crossing to an unrelated type, rewrites
 * every row.
 *
 * So the engine reports the change either way and uses this only to decide
 * whether to add "this may be free — check the current type" to the finding.
 * Claiming to have recognised a safe change when the deciding fact is absent
 * from the input would be the cry-wolf failure running the other way: a
 * confident all-clear on a statement that does rewrite the table.
 */
export function targetTypeMayBeFree(to) {
  const t = String(to).toLowerCase().replace(/\s+/g, '');
  return t === 'text' || /^(?:charactervarying|varchar)\(\d+\)$/.test(t);
}

/** Does this statement need an ACCESS EXCLUSIVE lock (blocks readers too)? */
function takesExclusiveLock(masked) {
  const s = masked.toUpperCase();
  if (/^\s*ALTER\s+TABLE\b/.test(s)) {
    // ALTER TABLE ... VALIDATE CONSTRAINT takes only SHARE UPDATE EXCLUSIVE,
    // which is the whole reason the NOT VALID / VALIDATE split works. Calling
    // it exclusive here would recommend a lock_timeout for the one ALTER TABLE
    // form that does not need one, and undercut the advice two checks above
    // it give.
    if (/\bVALIDATE\s+CONSTRAINT\b/.test(s)) return false;
    // ALTER TABLE ... SET STATISTICS / ATTACH PARTITION are lighter too, but
    // they are rare in migrations and treating them as exclusive is the safe
    // direction for a warning about a timeout.
    return true;
  }
  if (/^\s*DROP\s+(TABLE|INDEX|VIEW|SEQUENCE)\b/.test(s)) return true;
  if (/^\s*TRUNCATE\b/.test(s)) return true;
  if (/^\s*(VACUUM\s+FULL|CLUSTER)\b/.test(s)) return true;
  if (/^\s*REINDEX\b/.test(s) && !/\bCONCURRENTLY\b/.test(s)) return true;
  return false;
}

/**
 * `SET lock_timeout` / `SET LOCAL lock_timeout`, with a non-zero value.
 *
 * Reads the *raw* statement text, not the masked copy, and that is the whole
 * subtlety: the idiomatic spelling is `SET lock_timeout = '3s'`, and the
 * masker blanks string literals — so against masked text this function sees
 * `SET lock_timeout =` with the value gone, decides no timeout was set, and
 * every statement below it gets a false `no-lock-timeout` finding. Caught by
 * the first smoke test written against this engine.
 */
function setsLockTimeout(raw) {
  const m = /^\s*SET\s+(?:LOCAL\s+|SESSION\s+)?lock_timeout\s*(?:=|TO)\s*(.+)$/i.exec(raw.trim());
  if (!m) return false;
  const value = m[1].trim().replace(/;$/, '').replace(/^'|'$/g, '').trim();
  // `SET lock_timeout = 0` disables it, which is the default and is not a
  // timeout. Treating it as one would let a migration silence this check by
  // explicitly asking for the dangerous behaviour.
  return !/^0(\s*(ms|s|min))?$/i.test(value) && value.toLowerCase() !== 'default';
}

function tableOf(masked) {
  const m = /^\s*(?:ALTER|DROP)\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([A-Za-z0-9_."]+)/i.exec(masked)
    || /^\s*TRUNCATE\s+(?:TABLE\s+)?([A-Za-z0-9_."]+)/i.exec(masked)
    || /\bON\s+([A-Za-z0-9_."]+)/i.exec(masked);
  return m ? m[1].replace(/"/g, '') : null;
}

function finding(id, statement, extra = {}) {
  const check = CHECK_BY_ID.get(id);
  if (!check) throw new Error(`unknown check id: ${id}`);
  return {
    id,
    severity: check.severity,
    title: extra.title ?? check.title,
    line: statement.line,
    // `display` rather than `text`: comments stripped, string literals kept.
    // Quoting the raw text prefixes most generated migrations with their own
    // comment ("-- CreateIndex CREATE UNIQUE INDEX ..."), which reads as
    // though the statement were commented out and the tool confused.
    statement: shorten(statement.display ?? statement.text),
    table: tableOf(statement.masked),
    impact: extra.impact,
    fix: extra.fix,
  };
}

/** Keep a quoted statement short enough to read in a CI log. */
function shorten(text, limit = 160) {
  const one = normalize(text);
  return one.length <= limit ? one : `${one.slice(0, limit - 1)}…`;
}

/**
 * Analyse one migration file's text.
 *
 * @param {string} text
 * @returns {{ findings: object[], statements: number, counts: { risk: number, warn: number }, verdict: string, kinds: string[] }}
 */
export function analyzeSql(text) {
  const statements = splitStatements(text);
  const findings = [];

  // Session state, accumulated as we walk the file in order. A `SET
  // lock_timeout` protects the statements *after* it, so this cannot be
  // answered by looking at any statement alone.
  let lockTimeout = false;
  // Exclusive-lock statements seen inside the current explicit transaction.
  let exclusiveInTx = [];
  let reportedManyLocks = false;
  // Columns with a validated CHECK that already implies NOT NULL.
  const notNullChecked = new Set();
  // Indexes built concurrently, available for ADD CONSTRAINT ... USING INDEX.
  const concurrentIndexes = new Set();
  // Constraints added NOT VALID, and whether that happened in this transaction.
  const notValid = new Map();
  // Tables this file creates. Everything in this engine is about the cost of
  // touching rows that already exist, and a table created a few statements
  // ago has none -- so indexing it, adding a constraint to it or setting a
  // column NOT NULL on it is instant and takes a lock nothing else is
  // holding. Suppressing those is not a softening of the checks; a finding
  // that is wrong in the common case is what teaches a reader to skip the
  // report. Measured on this repository's own Prisma migrations: 72 findings
  // before this rule, almost all of them `CREATE INDEX` against a table
  // created in the same file, which is exactly what an initial migration
  // looks like.
  const createdHere = new Set();

  /**
   * Record that `st` needs an ACCESS EXCLUSIVE lock: report the missing
   * `lock_timeout`, and count it toward the per-transaction lock grouping.
   *
   * One helper rather than repeating the pair at each call site, because the
   * grouping half used to live *inside* the `ALTER TABLE` branch while the
   * check's own title says "several exclusive-lock statements share one
   * transaction". So `BEGIN; TRUNCATE a; DROP TABLE b; COMMIT;` -- two
   * ACCESS EXCLUSIVE locks held together, exactly what the check describes --
   * reported nothing at all.
   */
  const noteExclusive = (st) => {
    if (!lockTimeout) pushNoTimeout(findings, st);
    if (!st.inTransaction) return;
    exclusiveInTx.push(st);
    if (exclusiveInTx.length === 2 && !reportedManyLocks) {
      reportedManyLocks = true;
      findings.push(finding('many-locks-one-transaction', st, {
        impact: `This transaction takes an exclusive lock at line ${exclusiveInTx[0].line} and another here. A transaction releases no lock until it commits, so the first table stays locked for the combined duration of everything that follows — including any slow scan later in the block. Locking two tables at once also widens the window for a deadlock against application traffic taking the same locks in the other order.`,
        fix: 'Split these into separate transactions (usually separate migrations) so each lock is held only for its own statement, and take them in a consistent order where you cannot.',
      }));
    }
  };

  for (const st of statements) {
    const s = st.masked;
    const upper = s.toUpperCase();

    if (setsLockTimeout(st.text)) {
      lockTimeout = true;
      continue;
    }

    // Leaving a transaction clears both the per-transaction lock set and the
    // LOCAL-scoped timeout. Tracked conservatively: a `SET LOCAL` inside a
    // transaction stops applying at COMMIT.
    if (/^\s*(COMMIT|END|ROLLBACK)\b/i.test(s)) {
      exclusiveInTx = [];
      reportedManyLocks = false;
      notValid.clear();
      continue;
    }
    if (/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(s)) {
      exclusiveInTx = [];
      reportedManyLocks = false;
      continue;
    }

    // ---- remember facts later statements depend on -------------------------
    const created = /^\s*CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)/i.exec(s);
    if (created) createdHere.add(created[1].replace(/"/g, '').toLowerCase());

    // A statement against a table this file just created touches no existing
    // rows and contends with nothing, so none of the cost checks apply.
    const targetsNewTable = () => {
      const t = tableOf(s);
      return t !== null && createdHere.has(t.toLowerCase());
    };

    const concurrentIdx = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)/i.exec(s);
    if (concurrentIdx) concurrentIndexes.add(concurrentIdx[1].replace(/"/g, '').toLowerCase());

    const validCheck = /ADD\s+CONSTRAINT\s+([A-Za-z0-9_."]+)\s+CHECK\s*\((.*?)\)\s*(?:NOT\s+VALID)?\s*$/is.exec(s);
    if (validCheck && !/NOT\s+VALID\s*$/i.test(s)) {
      const col = /([A-Za-z0-9_."]+)\s+IS\s+NOT\s+NULL/i.exec(validCheck[2]);
      if (col) notNullChecked.add(col[1].replace(/"/g, '').toLowerCase());
    }
    const validated = /ALTER\s+TABLE\s+\S+\s+VALIDATE\s+CONSTRAINT\s+([A-Za-z0-9_."]+)/i.exec(s);
    if (validated) {
      const name = validated[1].replace(/"/g, '').toLowerCase();
      const prior = notValid.get(name);
      if (prior && prior.inTransaction && st.inTransaction) {
        findings.push(finding('validate-in-same-transaction', st, {
          impact: `Constraint \`${name}\` was added \`NOT VALID\` and validated inside the same transaction block. The point of the two-step split is that the cheap step takes a brief lock and the expensive scan takes a *weaker* one, so readers and writers continue. Inside one transaction no lock is released until COMMIT, so the table is held for the whole validation exactly as if \`NOT VALID\` had never been written.`,
          fix: 'Commit after the `NOT VALID` statement and run `VALIDATE CONSTRAINT` in a separate transaction — usually a separate migration, since many migration runners wrap each file in one transaction.',
        }));
      }
      continue;
    }
    const addedNotValid = /ADD\s+CONSTRAINT\s+([A-Za-z0-9_."]+)[\s\S]*?NOT\s+VALID\s*$/i.exec(s);
    if (addedNotValid) {
      notValid.set(addedNotValid[1].replace(/"/g, '').toLowerCase(), { inTransaction: st.inTransaction });
    }

    // ---- CREATE INDEX -----------------------------------------------------
    if (/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(s)) {
      if (/\bCONCURRENTLY\b/i.test(s)) {
        if (st.inTransaction) {
          findings.push(finding('create-index-concurrently-in-tx', st, {
            impact: 'PostgreSQL cannot run `CREATE INDEX CONCURRENTLY` inside a transaction block — it raises `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` and the migration aborts. This is the most common way a correct concurrency fix fails in practice, because most migration frameworks wrap each migration in a transaction by default.',
            fix: 'Move this statement out of the transaction block, and tell your migration runner not to wrap it (Rails `disable_ddl_transaction!`, Django `atomic = False`, golang-migrate `-x`, Alembic autocommit block). Then handle the INVALID-index case: a concurrent build that fails leaves an invalid index behind that must be dropped before retrying.',
          }));
        }
      } else if (!targetsNewTable()) {
        findings.push(finding('create-index-not-concurrent', st, {
          impact: 'A plain `CREATE INDEX` takes a SHARE lock on the table, which blocks every INSERT, UPDATE and DELETE until the index is fully built. Reads continue, so this does not look like an outage in a health check — writes simply hang, for as long as the build takes. On a large table that is minutes, and the application usually surfaces it as connection-pool exhaustion rather than as anything mentioning an index.',
          fix: 'Use `CREATE INDEX CONCURRENTLY`, which builds the index without blocking writes. It cannot run inside a transaction block, takes longer overall, and can leave an INVALID index if it fails — check for one and drop it before retrying.',
        }));
      }
      continue;
    }

    // Everything below is a cost check: it is about rows and locks that only
    // exist for a table with a history. The runtime-error check above
    // deliberately sits before this line, because `CREATE INDEX CONCURRENTLY`
    // inside a transaction fails on an empty table exactly as it does on a
    // large one -- suppressing it here would hide a migration that cannot run
    // at all.
    if (targetsNewTable()) continue;

    if (/^\s*DROP\s+INDEX\b/i.test(s) && !/\bCONCURRENTLY\b/i.test(s)) {
      findings.push(finding('drop-index-not-concurrent', st, {
        impact: 'Dropping an index takes an ACCESS EXCLUSIVE lock on its table, which blocks reads as well as writes. The drop itself is fast, so this is usually brief — but it still has to reach the front of the lock queue, and while it waits every later query queues behind it.',
        fix: 'Use `DROP INDEX CONCURRENTLY`, which takes a weaker lock. It cannot run inside a transaction block.',
      }));
      continue;
    }

    // ---- REINDEX / VACUUM FULL / CLUSTER / TRUNCATE ------------------------
    if (/^\s*(VACUUM\s+FULL|CLUSTER)\b/i.test(upper) || (/^\s*REINDEX\b/i.test(upper) && !/\bCONCURRENTLY\b/i.test(upper))) {
      findings.push(finding('full-table-rewrite', st, {
        impact: 'This rewrites the table (or its indexes) in full while holding an ACCESS EXCLUSIVE lock, so every read and every write on it blocks for the entire rewrite. On a large table that is a planned outage whether or not it was planned as one.',
        fix: '`REINDEX` has a `CONCURRENTLY` form. For bloat, `VACUUM FULL` has no online equivalent in core PostgreSQL — `pg_repack` does the same job without the long exclusive lock, or schedule this inside a maintenance window and say so.',
      }));
      if (takesExclusiveLock(s)) noteExclusive(st);
      continue;
    }

    if (/^\s*TRUNCATE\b/i.test(s)) {
      findings.push(finding('truncate', st, {
        impact: 'TRUNCATE removes every row in the table and takes an ACCESS EXCLUSIVE lock. It is not row-by-row and it does not fire per-row DELETE triggers, so data is gone without the usual audit trail. In a migration this is almost always either a mistake or an undocumented destructive step.',
        fix: 'If the data is genuinely disposable, say so in a comment on this statement so the next reader does not have to guess. If it is not, this is the statement to remove.',
      }));
      noteExclusive(st);
      continue;
    }

    // ---- ALTER TABLE ------------------------------------------------------
    if (/^\s*ALTER\s+TABLE\b/i.test(s)) {
      // ADD COLUMN with a volatile default
      const addCol = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_."]+)[\s\S]*?DEFAULT\s+([A-Za-z0-9_.]+)\s*\(/i.exec(s);
      if (addCol && VOLATILE_DEFAULTS.includes(addCol[2].toLowerCase().replace(/^.*\./, ''))) {
        findings.push(finding('add-column-volatile-default', st, {
          impact: `\`${addCol[2]}()\` is VOLATILE, so PostgreSQL has to evaluate it once per existing row — which means rewriting the entire table while holding an ACCESS EXCLUSIVE lock. Since PostgreSQL 11 a *constant* default is a metadata-only change, so this statement looks identical to the cheap version and behaves nothing like it.`,
          fix: 'Add the column with no default, backfill in batches with your own UPDATE loop (committing between batches), then `SET DEFAULT` for new rows. A `DEFAULT` that is a constant — or a STABLE function like `now()` — needs none of this.',
        }));
      }

      // ALTER COLUMN TYPE
      // The type name has to admit commas and digits: `numeric(12,2)` is the
      // single most common target of a type change in a real migration, and
      // leaving `,` out of the class made this check silently match nothing
      // for it. Anchored past `ALTER TABLE` so the table name cannot be
      // mistaken for the column.
      const typeChange = /ALTER\s+TABLE\s+[A-Za-z0-9_."]+\s+ALTER\s+(?:COLUMN\s+)?([A-Za-z0-9_."]+)\s+(?:SET\s+DATA\s+)?TYPE\s+([A-Za-z0-9_ (),]+?)(?:\s+USING\b|\s*$)/i.exec(s);
      if (typeChange) {
        const mayBeFree = targetTypeMayBeFree(typeChange[2]);
        findings.push(finding('alter-column-type-rewrite', st, {
          impact: `Changing a column's type generally rewrites every row of the table, and holds an ACCESS EXCLUSIVE lock — blocking reads *and* writes — for the whole rewrite. Indexes on the column are rebuilt too. ${
            mayBeFree
              ? `This one may be an exception: a target of \`${normalize(typeChange[2])}\` is metadata-only when the column is already a narrower \`varchar\`. A migration file never states the column's current type, so this tool cannot tell which case you are in — that is the one fact worth checking before you schedule a window.`
              : 'Whether the rewrite happens depends on the column\'s current type, which a migration file does not state, so assume it does.'
          }`,
          fix: `${mayBeFree ? 'Check the current type first (`\\d+ <table>` in psql): if it is a narrower `varchar` and the target is wider or `text`, this is instant and needs nothing else. Otherwise: ' : ''}add a new column of the target type, backfill it in committed batches, keep both in sync with a trigger while the application is mid-deploy, switch readers over, then drop the old column.`,
        }));
      }

      // SET NOT NULL
      const setNotNull = /ALTER\s+(?:COLUMN\s+)?([A-Za-z0-9_."]+)\s+SET\s+NOT\s+NULL/i.exec(s);
      if (setNotNull) {
        const col = setNotNull[1].replace(/"/g, '').toLowerCase();
        if (!notNullChecked.has(col)) {
          findings.push(finding('set-not-null-full-scan', st, {
            impact: `\`SET NOT NULL\` has to prove no existing row is null, and it does that with a full table scan while holding an ACCESS EXCLUSIVE lock, so reads and writes both block for the length of the scan. There is a fast path — PostgreSQL 12 and later will skip the scan if a *validated* CHECK constraint already proves the column is not null — but nothing earlier in this file adds one for \`${col}\`.`,
            fix: `Add \`CHECK (${col} IS NOT NULL) NOT VALID\` first (instant), \`VALIDATE CONSTRAINT\` in a later transaction (scans under a weaker lock that allows reads and writes), and only then \`SET NOT NULL\`, which now finds its proof and skips the scan. The CHECK constraint can be dropped afterwards.`,
          }));
        }
      }

      // ADD CONSTRAINT that validates immediately
      const addConstraint = /ADD\s+(?:CONSTRAINT\s+([A-Za-z0-9_."]+)\s+)?(FOREIGN\s+KEY|CHECK)\b/i.exec(s);
      if (addConstraint && !/NOT\s+VALID\s*$/i.test(s)) {
        const kind = addConstraint[2].toUpperCase().includes('FOREIGN') ? 'foreign key' : 'check';
        findings.push(finding('add-constraint-validates', st, {
          impact: `Adding a ${kind} constraint without \`NOT VALID\` makes PostgreSQL verify every existing row before it releases the lock. For a foreign key that means scanning this table *and* taking a lock on the referenced table as well, so one statement can block two tables at once.`,
          fix: 'Add it `NOT VALID` — which checks only new and updated rows and returns immediately — then `ALTER TABLE ... VALIDATE CONSTRAINT` in a *separate* transaction. The validation scan takes SHARE UPDATE EXCLUSIVE, which lets reads and writes continue.',
        }));
      }

      // ADD PRIMARY KEY / UNIQUE
      const addKey = /ADD\s+(?:CONSTRAINT\s+[A-Za-z0-9_."]+\s+)?(PRIMARY\s+KEY|UNIQUE)\b/i.exec(s);
      if (addKey) {
        const usingIndex = /USING\s+INDEX\s+([A-Za-z0-9_."]+)/i.exec(s);
        const adopted = usingIndex && concurrentIndexes.has(usingIndex[1].replace(/"/g, '').toLowerCase());
        if (!adopted) {
          findings.push(finding('add-key-builds-index', st, {
            impact: `Adding a ${addKey[1].toUpperCase().includes('PRIMARY') ? 'primary key' : 'unique'} constraint builds the index it needs while holding an ACCESS EXCLUSIVE lock, so reads and writes block for the whole build — the same cost as a non-concurrent \`CREATE INDEX\`, reached by a different statement.${usingIndex ? ` This statement does say \`USING INDEX ${usingIndex[1]}\`, but nothing earlier in this file builds that index concurrently, so either it is built elsewhere — fine, and worth a comment — or the name is wrong.` : ''}`,
            fix: 'Build the index first with `CREATE UNIQUE INDEX CONCURRENTLY`, then attach it with `ALTER TABLE ... ADD CONSTRAINT ... USING INDEX <name>`, which is a metadata-only change because the index already exists.',
          }));
        }
      }

      // DROP COLUMN
      if (/DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?[A-Za-z0-9_."]+/i.test(s) && /DROP\s+COLUMN\b/i.test(s)) {
        findings.push(finding('drop-column', st, {
          impact: 'Dropping a column is fast in the database — it is a metadata change, not a rewrite — but it breaks every running application instance that still names that column, including in a `SELECT *` fed into a strict row mapper. During a rolling deploy the old and new code run at the same time by design, so this takes effect while the old code is still serving.',
          fix: 'Ship the code that stops referencing the column first, let that deploy finish everywhere, and drop the column in a later migration. If it is urgent, the intermediate step is to stop reading it and leave it in place.',
        }));
      }

      // RENAME
      if (/RENAME\b/i.test(s)) {
        findings.push(finding('rename-breaks-callers', st, {
          impact: 'A rename is instant and atomic in the database, and that is the problem: from the moment it commits the old name does not exist, while every already-running application instance is still using it. There is no window in which both names work, so a rolling deploy cannot be safe by ordering alone.',
          fix: 'Treat it as add-and-migrate rather than rename: create the new name, write to both, move readers over across a deploy, then drop the old one. For a table, a view under the old name can bridge the gap.',
        }));
      }

      if (takesExclusiveLock(s)) noteExclusive(st);
      continue;
    }

    if (takesExclusiveLock(s)) noteExclusive(st);
  }

  findings.sort((a, b) => (a.line - b.line) || a.id.localeCompare(b.id));

  const counts = {
    risk: findings.filter((f) => f.severity === RISK).length,
    warn: findings.filter((f) => f.severity === WARN).length,
  };
  const verdict = counts.risk > 0 ? 'can-block' : counts.warn > 0 ? 'review' : 'clean';
  const kinds = [...new Set(statements.map((st) => leadingKeyword(st.masked)).filter(Boolean))].sort();

  return { findings, statements: statements.length, counts, verdict, kinds };
}

function pushNoTimeout(findings, st) {
  // Reported once per statement rather than once per file: the fix is a
  // session setting, but *which* statements are exposed is the useful part,
  // and a single file-level note would not say.
  findings.push(finding('no-lock-timeout', st, {
    impact: 'This statement needs an ACCESS EXCLUSIVE lock, and no `lock_timeout` is set above it. That combination is how a metadata change that takes milliseconds becomes a full outage: if any query is still holding a read lock on the table — a slow analytics SELECT, a forgotten open transaction, `pg_dump` — this statement waits. While it waits it sits at the head of the lock queue, and *every* later query on that table, including plain reads, queues behind it. The table is then unavailable for as long as the original slow query runs, and the migration looks like it is simply taking a while.',
    fix: "Set a short timeout before the statement — `SET lock_timeout = '3s';` — so the migration fails fast and harmlessly instead of taking the table down, then retry it. Pair it with `SET statement_timeout` for the statements that do real work, and wrap the retry in your deploy tooling rather than removing the timeout.",
  }));
}

/**
 * Analyse several named sources, keeping per-file attribution.
 *
 * @param {{ name: string, text: string }[]} sources
 */
export function analyzeSources(sources) {
  const findings = [];
  const files = [];
  for (const src of sources) {
    const result = analyzeSql(src.text);
    files.push({ name: src.name, statements: result.statements, counts: result.counts });
    for (const f of result.findings) findings.push({ ...f, file: src.name });
  }
  const counts = {
    risk: findings.filter((f) => f.severity === RISK).length,
    warn: findings.filter((f) => f.severity === WARN).length,
  };
  return {
    findings,
    files,
    counts,
    verdict: counts.risk > 0 ? 'can-block' : counts.warn > 0 ? 'review' : 'clean',
  };
}

/** One-line human summary, shared by the CLI and the browser page so the two
 * can never drift into describing the same result differently. */
export function summaryLine(result) {
  const { risk, warn } = result.counts;
  if (result.verdict === 'clean') return 'No blocking statement found by these checks.';
  const parts = [];
  if (risk) parts.push(`${risk} statement${risk === 1 ? '' : 's'} that can block the table`);
  if (warn) parts.push(`${warn} to review`);
  return parts.join(', ') + '.';
}
