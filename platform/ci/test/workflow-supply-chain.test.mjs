import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.gitea/workflows');
const SECURITY_WORKFLOW = path.join(WORKFLOW_DIR, 'security.yml');

/**
 * Two supply-chain claims this repository states as present-tense fact, neither
 * of which was checked by anything.
 *
 * `docs/DEV-WORKFLOW.md` — "All third-party Gitea Actions are pinned to
 * immutable commit SHAs with release tags in comments." All thirty `uses:`
 * values happen to be pinned today, so this half of the test passes on its first
 * run. That is the point: `actionlint` does not check pinning, and nothing else
 * looked, so `uses: actions/checkout@v4` would have satisfied every gate in the
 * repository. A mutable tag is a third party's write access to our CI.
 *
 * `docs/CI-CD-ARCHITECTURE.md` — "per-venture lockfile audit" as a required
 * security check. The `dependency-audit` matrix in `security.yml` hard-codes
 * four directories. Ten lockfiles are on disk. The six that were never audited
 * are not hypothetical: five of them carry high-severity advisories, and
 * `SECURITY_ROADMAP.md` already lists those findings — the scanner that writes
 * the roadmap walks the whole tree, while the gate that blocks a merge walks a
 * hand-maintained list. So the findings were logged and simultaneously
 * ungated, which reads from the outside as "tracked" and blocks nothing. The
 * roadmap header claims "Block PR merges on Critical/High vulnerabilities"; for
 * six of ten lockfiles that was false.
 *
 * A lockfile may be left out of the matrix only by being registered below with
 * an owner, an issue, a reason and an expiry — the same shape the exception
 * register and the route-posture gap list already use, so an unaudited package
 * is a dated decision rather than an omission nobody can see.
 */

/**
 * Lockfiles deliberately outside the merge-blocking audit, with the date the
 * exemption dies.
 *
 * Deliberately empty since 2026-08-03. This list and the dependency-audit
 * matrix were built on two different branches, against the same defect — the
 * matrix covered four of ten committed lockfiles while the scanner that writes
 * `SECURITY_ROADMAP.md` walked the whole tree, so six packages' findings were
 * logged and ungated at once. One branch closed it by listing every lockfile in
 * the matrix; this one closed it by making an omission a dated, owned decision.
 * Merging both put the same five packages in the matrix *and* in this register,
 * which the contradiction check below caught.
 *
 * The matrix won, so the register is empty. That is the stricter reading and
 * the one the roadmap header already promises — "Block PR merges on
 * Critical/High vulnerabilities", for every package rather than for the four
 * somebody had typed. It has a cost that should not be discovered by surprise:
 * `npm audit --audit-level=high` was run against all five on 2026-08-03 and all
 * five fail, so their `Dependency audit` jobs are red until the semver-major
 * upgrades land (Next 16, wrangler 4, sharp 0.35). `npm audit fix` without
 * `--force` clears none of them. That redness is not new breakage; it is a
 * pre-existing condition the short matrix was hiding.
 *
 * The mechanism is kept rather than deleted. If the portfolio owner would
 * rather carry that debt as a visible waiver than as a red job, re-adding an
 * entry here — with an owner, an issue, a reason and an expiry inside
 * MAX_EXEMPTION_DAYS — and dropping the matching matrix row is a two-line
 * change, and both contract tests will hold it to being a real decision.
 */
const REGISTERED_UNAUDITED = [];

const MAX_EXEMPTION_DAYS = 180;

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort()
    .map((entry) => ({
      relative: path.posix.join('.gitea/workflows', entry),
      text: fs.readFileSync(path.join(WORKFLOW_DIR, entry), 'utf8'),
    }));
}

/** `uses:` values that are not `owner/repo@<40-hex sha>  # vX.Y.Z`. */
export function unpinnedUses(text) {
  const offenders = [];
  text.split('\n').forEach((line, index) => {
    const match = /^\s*(?:-\s+)?uses:\s*(\S+)\s*(.*)$/.exec(line);
    if (!match) return;
    const [, reference, trailing] = match;

    // Local composite actions are the repository's own code, already reviewed.
    if (reference.startsWith('./')) return;

    const pinned = /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*@[0-9a-f]{40}$/.test(reference);
    if (!pinned) {
      offenders.push({ line: index + 1, reference, why: 'not pinned to a 40-character commit SHA' });
      return;
    }
    if (!/#\s*v?\d+(\.\d+)*/.test(trailing)) {
      offenders.push({
        line: index + 1,
        reference,
        why: 'pinned but carries no version comment, so nobody can tell what it is',
      });
    }
  });
  return offenders;
}

function lockfilesOnDisk() {
  const found = [];
  const skip = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);

  const walk = (absolute, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        walk(path.join(absolute, entry.name), path.posix.join(relative, entry.name));
      } else if (entry.name === 'package-lock.json' || entry.name === 'pnpm-lock.yaml') {
        found.push({ directory: relative, manager: entry.name === 'pnpm-lock.yaml' ? 'pnpm' : 'npm' });
      }
    }
  };

  for (const root of ['ventures', 'portfolio', 'platform']) {
    const absolute = path.join(REPO_ROOT, root);
    if (fs.existsSync(absolute)) walk(absolute, root);
  }
  return found.sort((a, b) => a.directory.localeCompare(b.directory));
}

/** The `directory:` values inside security.yml's `dependency-audit` job. */
export function auditedDirectories(text) {
  const start = text.indexOf('\n  dependency-audit:');
  if (start === -1) return [];
  // The job ends at the next top-level (two-space) job key.
  const rest = text.slice(start + 1);
  const nextJob = /\n {2}[\w-]+:\n/.exec(rest.slice(1));
  const block = nextJob ? rest.slice(0, nextJob.index + 1) : rest;

  return [...block.matchAll(/^\s*directory:\s*(\S+)\s*$/gm)].map((match) => match[1]);
}

test('Supply chain - every third-party action is pinned to a commit SHA', () => {
  const offenders = [];
  for (const { relative, text } of workflowFiles()) {
    for (const { line, reference, why } of unpinnedUses(text)) {
      offenders.push(`${relative}:${line} — '${reference}' ${why}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'actions that a third party can change under us:\n' +
      offenders.map((line) => `  - ${line}`).join('\n')
  );
});

test('Supply chain - the pinning detector still detects', () => {
  assert.equal(unpinnedUses('      - uses: actions/checkout@v4\n').length, 1, 'a mutable tag is unpinned');
  assert.equal(unpinnedUses('      - uses: actions/checkout@main\n').length, 1, 'a branch is unpinned');
  assert.equal(
    unpinnedUses(`      - uses: actions/checkout@${'a'.repeat(40)}\n`).length,
    1,
    'a SHA with no version comment is unreadable'
  );
  assert.deepEqual(
    unpinnedUses(`      - uses: actions/checkout@${'0'.repeat(40)} # v4.2.2\n`),
    [],
    'a SHA with a version comment is correct'
  );
  assert.deepEqual(unpinnedUses('      - uses: ./.gitea/actions/local\n'), [], 'local actions are our own code');
});

test('Supply chain - every lockfile is audited by the merge-blocking gate', () => {
  const text = fs.readFileSync(SECURITY_WORKFLOW, 'utf8');
  const audited = new Set(auditedDirectories(text));
  const registered = new Map(REGISTERED_UNAUDITED.map((entry) => [entry.directory, entry]));

  assert.ok(audited.size > 0, 'the dependency-audit matrix parsed to nothing — the job or its shape changed');

  const ungated = lockfilesOnDisk()
    .filter(({ directory }) => !audited.has(directory) && !registered.has(directory))
    .map(
      ({ directory, manager }) =>
        `${directory} (${manager}) — no dependency-audit matrix entry and no registered exemption`
    );

  assert.deepEqual(
    ungated,
    [],
    'lockfiles no merge-blocking audit covers:\n' + ungated.map((line) => `  - ${line}`).join('\n')
  );
});

test('Supply chain - every audit exemption is owned, explained and dated', () => {
  const onDisk = new Set(lockfilesOnDisk().map(({ directory }) => directory));
  const today = new Date();
  const problems = [];

  for (const entry of REGISTERED_UNAUDITED) {
    const { directory, owner, issue, reason, expires } = entry;

    if (!onDisk.has(directory)) {
      problems.push(`${directory} — exempted but has no lockfile; remove the stale entry`);
      continue;
    }
    if (!owner || !issue || !reason) {
      problems.push(`${directory} — an exemption needs an owner, an issue and a reason`);
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      problems.push(`${directory} — 'expires' must be an ISO date, got '${expires}'`);
      continue;
    }

    const expiry = new Date(`${expires}T00:00:00Z`);
    if (expiry <= today) {
      problems.push(`${directory} — exemption expired on ${expires}; audit it or re-justify it`);
      continue;
    }
    const days = (expiry - today) / 86_400_000;
    if (days > MAX_EXEMPTION_DAYS) {
      problems.push(
        `${directory} — expires ${expires}, ${Math.round(days)} days out; the cap is ${MAX_EXEMPTION_DAYS}`
      );
    }
  }

  // An exemption that is also in the matrix is a contradiction; the matrix wins,
  // so the register is stale and should shrink.
  const audited = new Set(auditedDirectories(fs.readFileSync(SECURITY_WORKFLOW, 'utf8')));
  for (const { directory } of REGISTERED_UNAUDITED) {
    if (audited.has(directory)) {
      problems.push(`${directory} — audited by the matrix and exempted at the same time; drop the exemption`);
    }
  }

  assert.deepEqual(
    problems,
    [],
    'audit exemptions that are not decisions anybody owns:\n' +
      problems.map((line) => `  - ${line}`).join('\n')
  );
});
