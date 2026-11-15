import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acquireBuildLock, lockPath } from './build-lock.mjs';

function tmpOut() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'build-lock-')), 'dist');
}

test('the lock sits beside outDir, so the build\'s rm -rf of outDir keeps it', () => {
  assert.equal(lockPath('/a/dist/'), '/a/dist.building');
});

test('a second build into the same directory is refused while the first is alive', () => {
  const out = tmpOut();
  const release = acquireBuildLock(out, { pid: 111, isAlive: () => true });
  assert.throws(() => acquireBuildLock(out, { pid: 222, isAlive: () => true }),
    (e) => e.code === 'BUILD_LOCKED' && /pid 111/.test(e.message) && /--out=/.test(e.message));
  release();
  assert.equal(fs.existsSync(lockPath(out)), false);
  acquireBuildLock(out, { pid: 222, isAlive: () => true })();
});

test('a lock left by a killed build is taken over', () => {
  const out = tmpOut();
  fs.writeFileSync(lockPath(out), '999999\n');
  const release = acquireBuildLock(out, { pid: 333, isAlive: () => false });
  assert.equal(fs.readFileSync(lockPath(out), 'utf8').trim(), '333');
  release();
});

test('release does not remove a lock another build has since taken', () => {
  const out = tmpOut();
  const release = acquireBuildLock(out, { pid: 444, isAlive: () => true });
  fs.writeFileSync(lockPath(out), '555\n');
  release();
  assert.equal(fs.readFileSync(lockPath(out), 'utf8').trim(), '555');
});

test('build directories elsewhere do not block each other', () => {
  const a = acquireBuildLock(tmpOut(), { pid: 1, isAlive: () => true });
  const b = acquireBuildLock(tmpOut(), { pid: 2, isAlive: () => true });
  a(); b();
});
