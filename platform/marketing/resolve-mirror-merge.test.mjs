import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OUTPUT_DIR } from './front-door-tools.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(HERE, 'resolve-mirror-merge.sh');

const scriptText = fs.readFileSync(SCRIPT, 'utf8');

/**
 * The script's whole safety argument is that everything it overwrites is
 * regenerable. That holds only while its `MIRROR_DIR` is the directory the
 * generator actually writes. If `OUTPUT_DIR` moves and this constant does not,
 * the script silently stops matching any conflict — it would report "no
 * conflicted paths" on exactly the merge it exists to resolve.
 */
test('MIRROR_DIR is the directory the generator writes', () => {
  const match = scriptText.match(/^MIRROR_DIR="([^"]+)"$/m);
  assert.ok(match, 'resolve-mirror-merge.sh must set MIRROR_DIR');
  const expected = path.relative(REPO_ROOT, OUTPUT_DIR);
  assert.equal(match[1], expected);
});

test('the generator path it invokes exists', () => {
  const match = scriptText.match(/^GENERATOR="([^"]+)"$/m);
  assert.ok(match, 'resolve-mirror-merge.sh must set GENERATOR');
  assert.ok(
    fs.existsSync(path.join(REPO_ROOT, match[1])),
    `${match[1]} does not exist`,
  );
});

test('the script is executable', () => {
  const mode = fs.statSync(SCRIPT).mode;
  assert.ok(mode & 0o111, 'resolve-mirror-merge.sh must be executable');
});

/**
 * A fresh repo with no merge under way. Running the script here must refuse
 * rather than "resolve" anything: run outside a merge it would otherwise
 * `git checkout --ours` over a directory of real files.
 */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-merge-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'seed'), 'seed\n');
  git('add', '.');
  git('commit', '-qm', 'seed');
  return { dir, git };
}

test('refuses when no merge is in progress', () => {
  const { dir } = makeRepo();
  const run = spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /No merge in progress/);
});

/**
 * The refusal that matters most. A merge whose conflicts are in authored code
 * must not be handed to a script that resolves by overwriting: the generator
 * knows nothing about those files, so `git checkout --ours` would silently
 * discard the other side's edits.
 */
test('refuses a conflict outside the mirror directory', () => {
  const { dir, git } = makeRepo();
  fs.writeFileSync(path.join(dir, 'authored.txt'), 'from main\n');
  git('add', '.');
  git('commit', '-qm', 'main side');

  git('checkout', '-qb', 'other', 'HEAD~1');
  fs.writeFileSync(path.join(dir, 'authored.txt'), 'from other\n');
  git('add', '.');
  git('commit', '-qm', 'other side');

  const merge = spawnSync('git', ['merge', 'main'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(merge.status, 0, 'fixture should produce a conflict');

  const run = spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Conflicts outside/);
  assert.match(run.stderr, /authored\.txt/);

  // And it must have left the conflict alone for a human to read.
  assert.match(fs.readFileSync(path.join(dir, 'authored.txt'), 'utf8'), /<<<<<<</);
});
