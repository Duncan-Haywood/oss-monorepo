// The whole value of history-blob.mjs is one discrimination, so that is what
// these tests pin: a missing object is a SKIP in a shallow clone and a REAL
// FAILURE in a full one. Get it backwards in the lenient direction and the
// suite's best test retires itself silently the first time a sha is rewritten.
//
// Both cases are built against real git repositories in a temp dir rather than
// a stub, because the thing under test is precisely how git behaves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHistoryBlob, isShallowClone } from './history-blob.mjs';

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** A two-commit repo whose first commit carries `old.txt`, and its shallow clone. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'history-blob-'));
  const full = join(root, 'full');
  execFileSync('git', ['init', '-q', '-b', 'main', full]);
  git(full, 'config', 'user.email', 'test@example.com');
  git(full, 'config', 'user.name', 'test');

  writeFileSync(join(full, 'old.txt'), 'first revision\n');
  git(full, 'add', '.');
  git(full, 'commit', '-q', '-m', 'first');
  const first = git(full, 'rev-parse', 'HEAD');

  writeFileSync(join(full, 'new.txt'), 'second revision\n');
  git(full, 'add', '.');
  git(full, 'commit', '-q', '-m', 'second');

  const shallow = join(root, 'shallow');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${full}`, shallow]);

  return { root, full, shallow, first };
}

test('a shallow clone is detected, a full one is not', () => {
  const { root, full, shallow } = fixture();
  try {
    assert.equal(isShallowClone(full), false);
    assert.equal(isShallowClone(shallow), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a blob present in the clone is returned verbatim', () => {
  const { root, full, first } = fixture();
  try {
    const result = readHistoryBlob(full, first, 'old.txt');
    assert.equal(result.ok, true);
    assert.equal(result.content, 'first revision\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('history the shallow clone does not carry is reported as unavailable, not thrown', () => {
  const { root, shallow, first } = fixture();
  try {
    // `first` is a real commit in the repository and genuinely absent from a
    // --depth 1 clone. This is the exact shape that made `main` read red in
    // every web session on 2026-09-07.
    const result = readHistoryBlob(shallow, first, 'old.txt');
    assert.equal(result.ok, false);
    assert.match(result.reason, /shallow/);
    assert.match(result.reason, /git fetch --unshallow/, 'the remedy must be named, not implied');
    assert.match(result.reason, /Not a failure of the checker under test/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing object in a FULL clone throws — that absence is a real defect', () => {
  const { root, full } = fixture();
  try {
    // The load-bearing half. A test pinned to a sha that no longer exists in a
    // complete history has gone stale or the history was rewritten; either way
    // it must go red rather than quietly skip.
    assert.throws(
      () => readHistoryBlob(full, 'deadbee', 'old.txt'),
      /invalid object name|unknown revision|does not exist/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a path missing at a revision that exists still throws in a full clone', () => {
  const { root, full, first } = fixture();
  try {
    // `new.txt` was not added until the second commit.
    assert.throws(() => readHistoryBlob(full, first, 'new.txt'), /does not exist|exists on disk|invalid object/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
