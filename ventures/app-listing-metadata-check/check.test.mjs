import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, collectLocales } from './check.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'listing-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
const capture = () => { const lines = []; return { lines, log: (s) => lines.push(s) }; };

test('multi-locale tree: clean exits 0, over-limit exits 1', () => {
  const ok = tree({ 'en-US/name.txt': 'Streakly\n' });
  assert.equal(run([ok], () => {}), 0);
  const bad = tree({ 'en-US/name.txt': 'x'.repeat(40) });
  assert.equal(run([bad], () => {}), 1);
});

test('a single locale folder works and infers play from title.txt', () => {
  const root = tree({ 'title.txt': 'Streakly', 'short_description.txt': 'Habits' });
  const c = capture();
  assert.equal(run([root, '--json'], c.log), 0);
  assert.equal(JSON.parse(c.lines[0]).results[0].store, 'play');
});

test('fastlane android subtree is walked', () => {
  const root = tree({ 'android/en-US/title.txt': 'A', 'en-US/name.txt': 'A' });
  assert.deepEqual(collectLocales(root).map((l) => l.locale), ['android/en-US', 'en-US']);
});

test('--strict fails on notices; --avoid blocks', () => {
  const root = tree({ 'en-US/name.txt': 'A', 'en-US/keywords.txt': 'habit,uber' });
  assert.equal(run([root], () => {}), 0);
  assert.equal(run([root, '--strict'], () => {}), 1);
  assert.equal(run([root, '--avoid', 'uber'], () => {}), 1);
});

test('bad arguments and empty trees exit 2', () => {
  assert.equal(run([], () => {}), 2);
  assert.equal(run(['--nope', '.'], () => {}), 2);
  assert.equal(run([tree({ 'x/readme.md': 'hi' })], () => {}), 2);
  assert.equal(run(['/no/such/dir'], () => {}), 2);
});
