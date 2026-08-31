import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseSnapshot,
  scan,
  reportText,
  recoveryManifest,
  csvText,
  hasUnresolvedRisk,
  classificationCounts,
  summaryLine,
  REVIEW_ACTIONS,
  CSV_COLUMNS,
} from './scan.mjs';
import { EXAMPLE_SNAPSHOT } from './examples.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, 'src', 'branch_hygiene.py');

const classify = (snapshot) =>
  Object.fromEntries(scan(snapshot).map((finding) => [finding.branch, finding.classification]));

test('the worked example demonstrates all six classifications', () => {
  const byName = classify(EXAMPLE_SNAPSHOT);
  assert.equal(byName['main'], 'protected');
  assert.equal(byName['release/2026-08'], 'protected');
  assert.equal(byName['feature/merged-cleanly'], 'merged');
  assert.equal(byName['feature/rebased-after-merge'], 'moved-tip');
  assert.equal(byName['chore/closed-without-merging'], 'moved-tip');
  assert.equal(byName['feature/in-review'], 'active');
  assert.equal(byName['spike/never-had-a-pr'], 'uncertain');
  assert.equal(byName['hotfix/cherry-pick-a'], 'shared');
  assert.equal(byName['hotfix/cherry-pick-b'], 'shared');
  assert.equal(new Set(Object.values(byName)).size, 6);
});

test('a merged pull request whose tip moved is never a delete candidate', () => {
  // The whole product promise. A branch list cannot tell this apart from a
  // clean merge, and deleting it drops the only copy of x2/x1.
  const findings = scan(EXAMPLE_SNAPSHOT);
  const moved = findings.find((finding) => finding.branch === 'feature/rebased-after-merge');
  assert.equal(moved.classification, 'moved-tip');
  assert.equal(moved.review_action, 'preserve-and-review');
  assert.notEqual(moved.review_action, REVIEW_ACTIONS.merged);
});

test('protected wins over shared so a protected ref never weakens to preserve-shared-ref', () => {
  const findings = scan({
    protected_branches: ['main'],
    branches: [
      { name: 'main', tip: 't1', commits: ['t1'] },
      { name: 'mirror', tip: 't1', commits: ['t1'] },
    ],
    pull_requests: [],
  });
  assert.equal(findings[0].classification, 'protected');
  assert.equal(findings[0].review_action, 'do-not-delete');
  assert.equal(findings[1].classification, 'shared');
});

test('an open pull request wins over a stale closed record on a reused branch name', () => {
  // Otherwise active work inherits an old closed PR and lands as a delete candidate.
  const findings = scan({
    protected_branches: [],
    branches: [{ name: 'feature/reused', tip: 'n1', commits: ['n1'] }],
    pull_requests: [
      { head: 'feature/reused', state: 'closed', merged: true, base: 'main', base_commits: ['n1'] },
      { head: 'feature/reused', state: 'open', merged: false, base: 'main', base_commits: [] },
    ],
  });
  assert.equal(findings[0].classification, 'active');
});

test('unresolved risk matches the CLI exit-2 condition', () => {
  assert.equal(hasUnresolvedRisk(scan(EXAMPLE_SNAPSHOT)), true);
  const clean = scan({
    protected_branches: ['main'],
    branches: [
      { name: 'main', tip: 'm1', commits: ['m1'] },
      { name: 'done', tip: 'd1', commits: ['d1'] },
    ],
    pull_requests: [{ head: 'done', state: 'closed', merged: true, base: 'main', base_commits: ['d1'] }],
  });
  assert.equal(hasUnresolvedRisk(clean), false);
  assert.match(summaryLine(clean), /1 delete candidate to review/);
});

test('no summary line can read as clearance to delete', () => {
  for (const snapshot of [EXAMPLE_SNAPSHOT, { protected_branches: [], branches: [], pull_requests: [] }]) {
    assert.doesNotMatch(summaryLine(scan(snapshot)), /safe to delete|clear to delete|can be deleted/i);
  }
});

test('malformed input is rejected with advice, not a stack trace', () => {
  assert.throws(() => parseSnapshot(''), /Paste a snapshot/);
  assert.throws(() => parseSnapshot('not json'), /not valid JSON/);
  assert.throws(() => parseSnapshot('[1,2]'), /branches.*pull_requests/);
  assert.throws(() => scan({ branches: [], pull_requests: null }), /requires branches and pull_requests/);
  assert.throws(() => scan({ branches: [{ name: 'a' }], pull_requests: [] }), /string name and tip/);
  assert.throws(() => scan({ branches: [{ name: 'a', tip: 't', commits: [1] }], pull_requests: [] }), /invalid commits for a/);
});

test('csv quotes a branch name containing a comma', () => {
  // An unquoted comma silently shifts every later column in a reviewer's sheet.
  const text = csvText(scan({
    protected_branches: [],
    branches: [{ name: 'feat/a,b', tip: 't1', commits: ['t1'] }],
    pull_requests: [],
  }));
  assert.equal(text.split('\n')[0], CSV_COLUMNS.join(','));
  assert.match(text, /"feat\/a,b"/);
});

test('the recovery manifest marks itself read-only and approval-required', () => {
  const manifest = recoveryManifest(scan(EXAMPLE_SNAPSHOT));
  assert.equal(manifest.format, 2);
  assert.equal(manifest.read_only, true);
  assert.equal(manifest.approval_required, true);
  assert.equal(manifest.findings.length, EXAMPLE_SNAPSHOT.branches.length);
  for (const finding of manifest.findings) {
    assert.equal(finding.review_action, REVIEW_ACTIONS[finding.classification]);
  }
});

// The guard that matters most: the page and the CLI must never disagree about
// what a branch is. Both are run over the same snapshot and their reports are
// compared byte for byte, so a rule changed in one file and not the other fails
// here rather than in front of someone deleting a ref.
test('the browser port and the Python CLI produce identical reports', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'branch-hygiene-parity-'));
  const snapshotPath = path.join(dir, 'snapshot.json');
  const reportPath = path.join(dir, 'report.txt');
  const manifestPath = path.join(dir, 'manifest.json');
  const csvPath = path.join(dir, 'queue.csv');
  writeFileSync(snapshotPath, JSON.stringify(EXAMPLE_SNAPSHOT));

  execFileSync('python3', [
    CLI, snapshotPath,
    '--report', reportPath,
    '--manifest', manifestPath,
    '--csv', csvPath,
  ], { encoding: 'utf8' });

  const findings = scan(EXAMPLE_SNAPSHOT);
  assert.equal(reportText(findings), readFileSync(reportPath, 'utf8'));
  assert.equal(csvText(findings), readFileSync(csvPath, 'utf8'));
  assert.deepEqual(recoveryManifest(findings), JSON.parse(readFileSync(manifestPath, 'utf8')));
});

test('--emit-snapshot prints a snapshot this page can scan, and writes nothing else', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'branch-hygiene-emit-'));
  const snapshotPath = path.join(dir, 'snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify(EXAMPLE_SNAPSHOT));
  const stdout = execFileSync('python3', [CLI, snapshotPath, '--emit-snapshot'], {
    encoding: 'utf8',
    cwd: dir,
  });
  const findings = scan(parseSnapshot(stdout));
  assert.equal(findings.length, EXAMPLE_SNAPSHOT.branches.length);
  // No report or manifest beside the snapshot: redirecting stdout to a file
  // must not also leave two stale outputs next to it.
  assert.throws(() => readFileSync(path.join(dir, 'branch-report.txt')));
  assert.throws(() => readFileSync(path.join(dir, 'recovery-manifest.json')));
});

test('classification counts are stable and total the branch list', () => {
  const findings = scan(EXAMPLE_SNAPSHOT);
  const tally = classificationCounts(findings);
  assert.equal(Object.values(tally).reduce((a, b) => a + b, 0), findings.length);
  assert.equal(tally.protected, 2);
  assert.equal(tally.shared, 2);
  assert.equal(tally['moved-tip'], 2);
});
