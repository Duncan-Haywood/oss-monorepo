import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/ci/validate-release-exception.sh');

function isoDate(daysFromToday) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function run(...args) {
  return spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8' });
}

test('Release Exception - accepts bounded, traceable evidence', () => {
  for (const expiry of [isoDate(0), isoDate(7), isoDate(30)]) {
    assert.doesNotThrow(() =>
      execFileSync('bash', [
        SCRIPT,
        'APPROVED',
        'https://git.marisstella.dev/owner/repo/issues/123',
        'https://git.marisstella.dev/owner/repo/pulls/456',
        expiry,
      ]),
    );
  }
});

test('Release Exception - rejects malformed metadata and unbounded expiry', () => {
  const valid = [
    'APPROVED',
    'https://git.marisstella.dev/owner/repo/issues/123',
    'https://git.marisstella.dev/owner/repo/pulls/456',
    isoDate(7),
  ];
  for (const args of [
    ['yes', ...valid.slice(1)],
    [valid[0], 'anything', ...valid.slice(2)],
    [valid[0], valid[1], 'anything', valid[3]],
    [...valid.slice(0, 3), isoDate(-1)],
    [...valid.slice(0, 3), isoDate(31)],
  ]) {
    assert.notEqual(run(...args).status, 0, `expected rejection for ${args.join(' ')}`);
  }
});
