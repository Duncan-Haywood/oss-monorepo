import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * `docs/DEV-WORKFLOW.md` states, in the present tense, that "all third-party
 * Gitea Actions are pinned to immutable commit SHAs with release tags in
 * comments". Nothing checked it.
 *
 * Every `uses:` value in the repository happens to be pinned today, so this
 * file passes on its first run. That is the point rather than a reason to skip
 * it: `actionlint` does not check pinning, no other gate looks, and so
 * `uses: actions/checkout@v4` would have satisfied every check in the
 * repository. A mutable tag is a third party's write access to our CI — they
 * can move the tag after review and the next run executes different code with
 * whatever secrets the job holds.
 *
 * A version comment is required alongside the SHA because a bare 40-character
 * hex string tells a reviewer nothing about what they are approving, and an
 * unreadable pin gets replaced with a tag by the next person in a hurry.
 *
 * This arrived on `agent/profit-lever-2026-08-02` welded to a second, weaker
 * copy of the lockfile-audit control that `dependency-audit-coverage.test.mjs`
 * already implements more thoroughly. The pinning sweep was the half with no
 * counterpart anywhere, so it is kept here on its own and the rest was dropped.
 *
 * 2026-08-04 — the sentence above ("every `uses:` value in the repository") was
 * false when it was written, because this file read one directory. The input was
 * `.gitea/workflows` alone, and `docs/CONTROL-AUDIT-2026-08-04.md` finding 2
 * measured what that missed: 15 tracked workflow files under
 * `ventures/*/.github/workflows/` holding 60 `uses:` refs, none of them pinned,
 * one of them `anomalyco/opencode/github@latest` — a third party's mutable ref
 * in a scheduled job that carries repository credentials. The control was
 * correct, could fail, and was pointed at the smaller half of its own subject.
 *
 * The input is now every workflow file git tracks, enumerated from git rather
 * than from a second hardcoded list, so the next venture to commit a
 * `.github/workflows/` directory is covered without anyone remembering this
 * file exists. There is no directory exemption: a mutable action reference is
 * exactly as dangerous in a venture's workflow as in the monorepo's.
 */

/**
 * The two places this repository keeps workflows: the monorepo's own Gitea CI,
 * and the per-venture GitHub workflows that ship inside each venture directory.
 */
const WORKFLOW_PATHSPECS = ['.gitea/workflows', 'ventures/*/.github/workflows'];

/** Every tracked workflow file, discovered from the git index. */
function trackedWorkflowPaths() {
  const listed = execFileSync('git', ['ls-files', '-z', '--', ...WORKFLOW_PATHSPECS], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  return listed
    .split('\0')
    .filter(Boolean)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort();
}

function workflowFiles() {
  return trackedWorkflowPaths().map((relative) => ({
    relative,
    text: fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8'),
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

test('Action pinning - every third-party action is pinned to a commit SHA', () => {
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

test('Action pinning - the sweep reads every workflow, not an empty directory', () => {
  // Without this, renaming the workflow directory would leave the check above
  // passing over nothing, which is the failure mode it exists to prevent.
  const files = workflowFiles();
  assert.ok(files.length >= 5, `expected the workflow directory to hold files, found ${files.length}`);
  assert.ok(
    files.some(({ text }) => /^\s*(?:-\s+)?uses:/m.test(text)),
    'no workflow declares a `uses:` at all — the parser is looking at the wrong thing'
  );

  // Both halves of the subject must actually be in the collection. `length >= 5`
  // was satisfied by `.gitea/workflows` alone for as long as this control only
  // read that directory, so a future narrowing back to one root would restore
  // the exact blind spot that finding 2 recorded without turning anything red.
  for (const root of ['.gitea/workflows/', 'ventures/']) {
    assert.ok(
      files.some(({ relative }) => relative.startsWith(root)),
      `no workflow under '${root}' reached the pinning sweep — the collection narrowed and ` +
        'the actions there are now unchecked'
    );
  }
});

test('Action pinning - the pinning detector still detects', () => {
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
