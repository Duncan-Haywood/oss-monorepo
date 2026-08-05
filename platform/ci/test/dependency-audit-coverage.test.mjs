import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SECURITY_WORKFLOW = path.join(REPO_ROOT, '.gitea/workflows/security.yml');

/**
 * Every committed lockfile is audited for known vulnerabilities, or carries a
 * tracked, expiring, counted exception saying it is not.
 *
 * `.gitea/workflows/security.yml` has always had a `dependency-audit` job, and
 * it has always been a hand-written matrix of four ventures. The repository
 * tracks ten Node lockfiles. Nothing measured that ratio, nothing noticed when a
 * venture grew its first lockfile, and the four were not chosen because they
 * were the risky ones — they are simply the four somebody typed.
 *
 * Measured 2026-08-02, the six unaudited lockfiles carried 32 high-severity
 * advisories between them, including a Next.js middleware/proxy bypass in
 * `local-site-studio`, whose `src/proxy.ts` gates only `/dashboard` and leaves
 * every `/api` handler to guard itself. So the uncovered half of the matrix was
 * where the findings were, which is the usual shape: the gate covered what was
 * easy to list rather than what existed.
 *
 * This is the same control shape as `route-auth-posture-coverage.test.mjs`. It
 * scans for lockfiles rather than trusting a list, so a new package with
 * dependencies fails here until someone decides whether it is audited or
 * explicitly excepted.
 *
 * What it deliberately does not do is run `npm audit` itself. Advisory counts
 * change when a CVE is published against an unchanged lockfile, so a test that
 * asserted them would fail on days nobody committed anything and would need the
 * network to run at all. Auditing is the CI job's work; this test's work is
 * making sure the job looks at everything.
 *
 * The workflow is parsed with regular expressions rather than a YAML library
 * for the reason `ci-workflow-tooling.test.mjs` gives: `platform/ci` has one
 * dependency and adding a parser to assert on twenty lines of matrix is a worse
 * trade than reading them directly.
 */

/** Lockfile and manifest basenames or suffixes, mapped to the package manager that audits them. */
const MANIFEST_MANAGERS = new Map([
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['requirements-ci.txt', 'pip'],
  ['requirements-sast.txt', 'pip'],
  ['requirements.txt', 'pip'],
  ['Pipfile.lock', 'pip'],
  ['poetry.lock', 'poetry'],
  ['go.sum', 'go'],
  ['Cargo.lock', 'cargo'],
  ['Gemfile.lock', 'bundler'],
]);

/**
 * Dependency manifests that are tracked but deliberately not audited.
 *
 * Follows the exception register's shape for the reason it does: an exception
 * nobody re-reads is a policy change made without review, and one whose size is
 * not recorded grows for free. `packages` is the exact number of pinned
 * requirements accepted, and fails both when it grows and when it goes stale.
 */
const EXCEPTED = {
  'requirements-ci.txt': {
    owner: 'duncan',
    issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
    expires: '2026-11-30',
    packages: 2,
    reason:
      'CI runner tooling rather than product dependencies: pytest and PyYAML, ' +
      'which scripts/test-ci.sh needs. Auditing Python requires pip-audit ' +
      'in the runner image, which is the same "add a scanner" work the roadmap ' +
      'tracks under SAST/SCA and is not done in passing here. Sized and dated ' +
      'so it cannot sit unreviewed.',
  },
  'requirements-sast.txt': {
    owner: 'duncan',
    issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
    expires: '2026-11-30',
    packages: 2,
    reason:
      'Dependencies for the SAST gate (bandit and semgrep). Blocked on the ' +
      'same missing pip-audit runner tooling as requirements-ci.txt.',
  },
  'ventures/photos-import-tools/requirements.txt': {
    owner: 'duncan',
    issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
    expires: '2026-11-30',
    packages: 1,
    reason:
      'A local operator script that offloads photographs from an SD card. It ' +
      'has no network surface and no production deployment, so it is the lowest ' +
      'priority Python manifest to bring under pip-audit, but it is recorded ' +
      'rather than ignored so the count cannot grow unnoticed.',
  },
  'ventures/ubuntu-agent-server/tests/requirements.txt': {
    owner: 'duncan',
    issue: 'docs/ENGINEERING-ROADMAP.md#now-establish-and-enforce-the-baseline',
    expires: '2026-11-30',
    packages: 2,
    reason:
      'Test-only dependencies for the agent server suite, not shipped with any ' +
      'deployed artifact. Blocked on the same missing pip-audit tooling as the ' +
      'other two Python manifests; they are expected to be brought in together.',
  },
};

/** The longest number of days an unaudited manifest may stay unaudited. */
const MAX_EXPIRY_DAYS = 180;

const workflowSource = fs.readFileSync(SECURITY_WORKFLOW, 'utf8');

/** Every lockfile and dependency manifest git tracks. */
function trackedManifests() {
  const output = execFileSync(
    'git',
    [
      'ls-files',
      '--',
      '*package-lock.json',
      '*pnpm-lock.yaml',
      '*yarn.lock',
      '*requirements*.txt',
      '*requirements.txt',
      '*Pipfile.lock',
      '*poetry.lock',
      '*go.sum',
      '*Cargo.lock',
      '*Gemfile.lock',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }
  );
  return output.split('\n').filter(Boolean).filter((file) => !file.includes('node_modules/'));
}

/** The tracked lockfiles and manifests a package manager can audit, as path -> manager. */
function trackedLockfiles() {
  const lockfiles = new Map();
  for (const file of trackedManifests()) {
    const manager = MANIFEST_MANAGERS.get(path.basename(file));
    if (manager) lockfiles.set(file, manager);
  }
  return lockfiles;
}

/**
 * The `dependency-audit` matrix, as an array of { venture, directory, manager }.
 *
 * Sliced to the job rather than the whole file so another job growing its own
 * `include:` block cannot be misread as audit coverage.
 */
function auditMatrix() {
  const jobStart = workflowSource.indexOf('\n  dependency-audit:');
  assert.notEqual(
    jobStart,
    -1,
    'security.yml no longer defines a `dependency-audit` job. Nothing audits ' +
      'any lockfile, and every check in this file is vacuous until it is back.'
  );

  const rest = workflowSource.slice(jobStart + 1);
  const nextJob = rest.slice(1).search(/^ {2}\w[\w-]*:/m);
  const jobSource = nextJob === -1 ? rest : rest.slice(0, nextJob + 1);

  const entries = [];
  for (const block of jobSource.split(/^\s+- venture:/m).slice(1)) {
    const venture = block.match(/^\s*(\S+)/)?.[1];
    const directory = block.match(/^\s*directory:\s*(\S+)/m)?.[1];
    const manager = block.match(/^\s*manager:\s*(\S+)/m)?.[1];
    if (venture && directory && manager) entries.push({ venture, directory, manager });
  }
  return { entries, jobSource };
}

test('Dependency Audit Coverage - the lockfile scan finds lockfiles at all', () => {
  // A scan that silently returns nothing makes every check below vacuous, which
  // is the exact failure this file exists to prevent elsewhere.
  const lockfiles = trackedLockfiles();
  assert.ok(
    lockfiles.size > 0,
    'No lockfiles found anywhere in the repository. Either every package moved ' +
      'or the lockfile names changed; this control verifies nothing until that ' +
      'is fixed.'
  );
});

test('Dependency Audit Coverage - the matrix parse finds entries at all', () => {
  const { entries } = auditMatrix();
  assert.ok(
    entries.length > 0,
    'Parsed no entries out of the dependency-audit matrix. Either the job is ' +
      'empty or its shape changed and this parser no longer reads it; either ' +
      'way the coverage check below would pass by finding nothing.'
  );
});

test('Dependency Audit Coverage - every tracked lockfile is audited or excepted', () => {
  const { entries } = auditMatrix();
  const unaudited = [];

  for (const manifest of trackedManifests()) {
    const manager = MANIFEST_MANAGERS.get(path.basename(manifest));
    const directory = path.dirname(manifest);
    const isAudited = entries.some(e => e.directory === directory && e.manager === manager);
    if (isAudited) continue;
    if (manifest in EXCEPTED) continue;
    unaudited.push(`${manifest} (${manager ?? 'unknown'})`);
  }

  assert.deepEqual(
    unaudited,
    [],
    'These lockfiles/manifests are committed and nothing audits them for known ' +
      'vulnerabilities. When this control was written the six unaudited ' +
      'lockfiles held 32 high-severity advisories and the four audited ones ' +
      'held 15, so an unaudited lockfile is not a quiet one — it is an ' +
      'unmeasured one.\n' +
      'Add the package to the dependency-audit matrix in ' +
      '.gitea/workflows/security.yml, or register an exception with an owner, ' +
      'an issue, a reason and an expiry in `EXCEPTED` here:\n  ' +
      unaudited.join('\n  ')
  );
});

test('Dependency Audit Coverage - no matrix entry outlives its lockfile', () => {
  const { entries } = auditMatrix();
  const lockfiles = trackedLockfiles();

  const stale = entries
    .filter(e => ![...lockfiles.entries()].some(([file, manager]) => path.dirname(file) === e.directory && manager === e.manager))
    .map(e => `${e.venture} (${e.directory}, ${e.manager})`);

  assert.deepEqual(
    stale,
    [],
    'These matrix entries name directories with no committed lockfile. The job ' +
      'either fails on a missing file or audits nothing, and either way the ' +
      'entry reads as coverage and covers nothing:\n  ' + stale.join('\n  ')
  );
});

test('Dependency Audit Coverage - every entry audits with its own lockfile’s manager', () => {
  const { entries } = auditMatrix();
  const lockfiles = trackedLockfiles();
  const mismatched = [];

  for (const { venture, directory, manager } of entries) {
    const lockfilesInDir = [...lockfiles.entries()].filter(([file]) => path.dirname(file) === directory);
    if (lockfilesInDir.length === 0) continue;
    const hasExactMatch = lockfilesInDir.some(([, actual]) => actual === manager);
    if (!hasExactMatch) {
      const [firstFile, actual] = lockfilesInDir[0];
      mismatched.push(
        `${venture}: the matrix audits ${directory} with ${manager}, and the ` +
          `committed lockfile is ${path.basename(firstFile)}, which ${actual} owns`
      );
    }
  }

  assert.deepEqual(
    mismatched,
    [],
    // `npm audit` in a pnpm workspace reports zero vulnerabilities rather than
    // failing, because it finds no package-lock.json to read. A green cell that
    // audited nothing is worse than a missing one.
    'These matrix entries audit a lockfile with the wrong package manager, ' +
      'which reports success without reading the lockfile:\n  ' + mismatched.join('\n  ')
  );
});

test('Dependency Audit Coverage - the audit steps can still fail', () => {
  const { jobSource } = auditMatrix();
  const problems = [];

  const auditCommands = [...jobSource.matchAll(/^\s*run:.*audit.*$/gm)].map((m) => m[0]);
  const inlineAudits = [...jobSource.matchAll(/^\s+\S*\s*(?:corepack )?(?:npm|pnpm) audit.*$/gm)]
    .map((m) => m[0]);
  const allAudits = [...auditCommands, ...inlineAudits];

  assert.ok(
    allAudits.length > 0,
    'The dependency-audit job runs no audit command at all.'
  );

  for (const command of allAudits) {
    if (/\|\|\s*true/.test(command) || /\|\|\s*:/.test(command)) {
      problems.push(`\`${command.trim()}\` discards its own failure`);
    }
    if (!/--audit-level[= ]/.test(command)) {
      problems.push(
        `\`${command.trim()}\` sets no --audit-level, so it fails on advisories ` +
          'of every severity and will be switched off the first noisy week'
      );
    }
  }

  if (/^\s*continue-on-error:\s*true/m.test(jobSource)) {
    problems.push('the job sets continue-on-error: true, so no advisory fails it');
  }

  assert.deepEqual(
    problems,
    [],
    'The dependency audit is declared and cannot fail, which is the state ' +
      '`gate-substance.test.mjs` exists to catch elsewhere:\n  ' + problems.join('\n  ')
  );
});

test('Dependency Audit Coverage - the job reports every venture rather than stopping at the first', () => {
  const { jobSource } = auditMatrix();
  // With fail-fast the matrix cancels the remaining ventures on the first
  // failure, so one venture's advisories hide every other venture's. The four
  // original entries included two that fail today; under fail-fast the second
  // would never have been measured.
  assert.match(
    jobSource,
    /fail-fast:\s*false/,
    'The dependency-audit matrix must set `fail-fast: false`, so one failing ' +
      'venture does not cancel the audit of every other venture.'
  );
});

test('Dependency Audit Coverage - every exception is owned, reasoned, sized and expiring', () => {
  const problems = [];
  const today = new Date(new Date().toISOString().slice(0, 10));
  const tracked = new Set(trackedManifests());

  for (const [manifest, entry] of Object.entries(EXCEPTED)) {
    const { owner, issue, reason, expires, packages } = entry;

    for (const [field, value] of Object.entries({ owner, issue, reason, expires })) {
      if (!value || String(value).trim() === '') {
        problems.push(`${manifest}: exception has no ${field}`);
      }
    }
    if (reason && reason.trim().length < 60) {
      problems.push(
        `${manifest}: the exception states no decision. Say why it is not ` +
          'audited and what auditing it involves'
      );
    }

    if (!tracked.has(manifest)) {
      problems.push(
        `${manifest}: excepted from auditing and no longer tracked by git. ` +
          'Remove the exception rather than leaving it to read as coverage'
      );
      continue;
    }

    if (expires) {
      const expiryDate = new Date(expires);
      if (Number.isNaN(expiryDate.getTime())) {
        problems.push(`${manifest}: expires '${expires}' is not a date`);
      } else {
        const days = Math.round((expiryDate - today) / 86_400_000);
        if (days < 0) {
          problems.push(
            `${manifest}: the exception expired ${-days} days ago. Bring it ` +
              'under an audit, or re-decide the exception in review and re-date it'
          );
        } else if (days > MAX_EXPIRY_DAYS) {
          problems.push(
            `${manifest}: expires ${expires}, ${days} days out. An exception ` +
              `nobody re-reads is a policy change made without review; ` +
              `${MAX_EXPIRY_DAYS} days is the limit, as it is in the exception register`
          );
        }
      }
    }

    // The size of what is accepted, held the way `count` is held in
    // platform/exception-register.yaml: it fails high because the unaudited
    // surface grew and nobody decided that, and low because the register is stale.
    const declared = fs.readFileSync(path.join(REPO_ROOT, manifest), 'utf8');
    const actual = declared
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter((line) => line !== '' && !line.startsWith('-')).length;
    if (packages !== actual) {
      problems.push(
        `${manifest}: the exception accepts ${packages} unaudited requirements ` +
          `and the file now pins ${actual}. ` +
          (actual > packages
            ? 'The unaudited surface grew. Review the new requirements, then ' +
              'raise the number deliberately.'
            : 'The register is stale; lower the number.')
      );
    }
  }

  assert.deepEqual(
    problems,
    [],
    'Registered audit exceptions that are not real exceptions:\n  ' + problems.join('\n  ')
  );
});

test('Dependency Audit Coverage - no exception is tracked for a lockfile the matrix audits', () => {
  const { entries } = auditMatrix();
  const resolved = Object.keys(EXCEPTED).filter((manifest) => {
    const manager = MANIFEST_MANAGERS.get(path.basename(manifest));
    const directory = path.dirname(manifest);
    return entries.some((e) => e.directory === directory && e.manager === manager);
  });

  assert.deepEqual(
    resolved,
    [],
    'An exception is tracked for a package the matrix already audits, so the ' +
      'exception hides that the work is done:\n  ' + resolved.join('\n  ')
  );
});
