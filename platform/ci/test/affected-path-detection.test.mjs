import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getChangedFiles,
  resolveDiffRange,
  resolveAffectedComponents,
  VENTURE_CATALOG,
} from '../src/pipeline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Every commit that exists; used where the decision under test is about the
// event, not about what the checkout happens to contain.
const ALL_PRESENT = () => true;
const NONE_PRESENT = () => false;

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'ci-fixture',
      GIT_AUTHOR_EMAIL: 'ci@example.invalid',
      GIT_COMMITTER_NAME: 'ci-fixture',
      GIT_COMMITTER_EMAIL: 'ci@example.invalid',
    },
  }).trim();
}

/**
 * A repository shaped like the push that exposed the defect: a venture change,
 * then two unrelated commits on top of it. Returns the tip each commit created.
 */
function makePushFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-path-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');

  const commit = (file, message) => {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), `${message}\n`);
    git(dir, 'add', '--all');
    git(dir, 'commit', '--quiet', '--no-gpg-sign', '-m', message);
    return git(dir, 'rev-parse', 'HEAD');
  };

  const base = commit('README.md', 'base');
  const venture = commit('ventures/quick-pick-survey/src/index.ts', 'venture change');
  commit('docs/notes.md', 'docs only');

  return { dir, base, venture };
}

test('push range covers every commit in the push, not just the last one', () => {
  const { dir, base } = makePushFixture();
  try {
    const changed = getChangedFiles({ GITHUB_EVENT_BEFORE: base }, dir);

    // The venture was changed mid-push and the push ended with a docs commit.
    // Diffing only the final commit — the old `HEAD~1` behaviour — sees just
    // docs/notes.md and verifies nothing, which is the defect this pins.
    assert.ok(
      changed.includes('ventures/quick-pick-survey/src/index.ts'),
      `push range dropped a mid-push change: ${JSON.stringify(changed)}`
    );
    assert.ok(changed.includes('docs/notes.md'));

    const affected = resolveAffectedComponents(changed, [
      { id: 'quick-pick-survey', dir: 'ventures/quick-pick-survey' },
      { id: 'other', dir: 'ventures/other' },
    ]);
    assert.deepEqual(affected, ['quick-pick-survey']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the single-commit range that caused the defect is never used as a fallback', () => {
  const { dir } = makePushFixture();
  try {
    // No event data at all: the engine must widen to a full run rather than
    // quietly falling back to a one-commit diff.
    assert.equal(getChangedFiles({}, dir), null);
    assert.equal(resolveDiffRange({}, ALL_PRESENT).range, null);

    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'platform/ci/src/pipeline.mjs'),
      'utf8'
    );
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(
      !/HEAD~1/.test(codeOnly),
      'HEAD~1 reappeared in pipeline.mjs: a one-commit diff drops mid-push changes'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a shallow checkout widens to a full run instead of failing to a narrow one', () => {
  // actions/checkout defaults to fetch-depth 1, so the push base is absent.
  const { range, reason } = resolveDiffRange(
    { GITHUB_EVENT_BEFORE: 'a'.repeat(40) },
    NONE_PRESENT
  );
  assert.equal(range, null);
  assert.match(reason, /not in this checkout/);

  // And the full run is what the caller actually gets.
  assert.deepEqual(
    resolveAffectedComponents(null, [{ id: 'a', dir: 'x' }, { id: 'b', dir: 'y' }]),
    ['a', 'b']
  );
});

test('a newly created ref has no prior tip and forces a full run', () => {
  const { range, reason } = resolveDiffRange(
    { GITHUB_EVENT_BEFORE: '0'.repeat(40) },
    ALL_PRESENT
  );
  assert.equal(range, null);
  assert.match(reason, /new ref/);
});

test('pull requests diff the whole branch against the merge target', () => {
  const { range } = resolveDiffRange({ GITHUB_BASE_REF: 'main' }, ALL_PRESENT);
  assert.equal(range, 'origin/main...HEAD');

  // A base ref naming a remote branch this checkout never fetched must widen,
  // not diff against something that does not exist.
  assert.equal(resolveDiffRange({ GITHUB_BASE_REF: 'main' }, NONE_PRESENT).range, null);
});

test('the pull-request base wins over a stale push base in the same environment', () => {
  const { range } = resolveDiffRange(
    { GITHUB_BASE_REF: 'main', GITHUB_EVENT_BEFORE: 'b'.repeat(40) },
    ALL_PRESENT
  );
  assert.equal(range, 'origin/main...HEAD');
});

test('the push base is read from the event payload Gitea writes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-event-'));
  const eventPath = path.join(dir, 'event.json');
  try {
    const before = 'c'.repeat(40);
    fs.writeFileSync(eventPath, JSON.stringify({ before, after: 'd'.repeat(40) }));

    const { range } = resolveDiffRange(
      { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventPath },
      ALL_PRESENT
    );
    assert.equal(range, `${before}...HEAD`);

    // A non-push event carries no `before`, so nothing may be inferred from it.
    assert.equal(
      resolveDiffRange(
        { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventPath },
        ALL_PRESENT
      ).range,
      null
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable or malformed event payload widens to a full run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-bad-event-'));
  try {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    assert.equal(
      resolveDiffRange({ GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: bad }, ALL_PRESENT).range,
      null
    );

    assert.equal(
      resolveDiffRange(
        { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: path.join(dir, 'missing.json') },
        ALL_PRESENT
      ).range,
      null
    );

    // Present file, but no `before` field.
    const noBefore = path.join(dir, 'no-before.json');
    fs.writeFileSync(noBefore, JSON.stringify({ after: 'e'.repeat(40) }));
    assert.equal(
      resolveDiffRange(
        { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: noBefore },
        ALL_PRESENT
      ).range,
      null
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Files that decide how every component is verified. Selecting a subset for a
// change to one of these is wrong, and — because none of them sits inside a
// component directory — the failure mode is selecting *nothing*, which reports
// as a pass. This only became reachable when detection started resolving a
// range instead of always failing open.
const REPO_WIDE_GATE_INPUTS = [
  'scripts/test-ci.sh',
  'platform/ci/src/pipeline.mjs',
  'tests/test_coverage_ratchet.py',
  'pytest.ini',
  'requirements-ci.txt',
  'platform/coverage-baseline.yaml',
  'platform/exception-register.yaml',
];

test('a change to a repo-wide gate input verifies every component', () => {
  const everything = VENTURE_CATALOG.map(c => c.id);

  for (const file of REPO_WIDE_GATE_INPUTS) {
    // A renamed or deleted input must break this test rather than quietly
    // becoming a path that matches nothing and selects nothing.
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, file)),
      `${file} no longer exists; update the global trigger list it stands for`
    );
    assert.deepEqual(
      resolveAffectedComponents([file], VENTURE_CATALOG).sort(),
      [...everything].sort(),
      `${file} changes how every component is verified but selected a subset`
    );
  }
});

test('a change confined to one venture verifies only that venture', () => {
  // The other half of the contract: widening on everything would make the
  // detection pointless and pay for a full catalog run on every push.
  const target = VENTURE_CATALOG.find(c => c.dir.startsWith('ventures/'));
  assert.ok(target, 'catalog has no venture component to select');

  assert.deepEqual(
    resolveAffectedComponents([`${target.dir}/src/some-file.ts`], VENTURE_CATALOG),
    [target.id]
  );
});

test('the engine workflow checks out the history its detection needs', () => {
  // Detection is inert without the base commit: with the default depth of 1 the
  // range can never resolve, so the selection the engine reports is really the
  // whole catalog. These two must not drift apart again.
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, '.gitea/workflows/ci-cd.yml'),
    'utf8'
  );

  const checkoutStep = workflow.match(
    /^ *- name: Checkout Code\n[\s\S]*?(?=^ *- name: |\Z)/m
  );
  assert.ok(checkoutStep, 'ci-cd.yml no longer has a checkout step to constrain');
  assert.match(
    checkoutStep[0],
    /fetch-depth:\s*0/,
    'ci-cd.yml checkout must fetch full history or affected-path detection cannot resolve a base'
  );
});
