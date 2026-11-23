import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { loadIran } from './eval/turns-iran.mjs';

// README "A turning-point option on Iran's dated cycle" (2026-11-23, pre-registered; T1 and T2 fail).
const root = dirname(fileURLToPath(import.meta.url));

test('the data: 108 quarters, 13 MBRI turns alternating trough and peak, the level rebuilt from growth', () => {
  const { quarter, level, turns } = loadIran();
  assert.equal(level.length, 108);
  assert.equal(quarter[0], '1367Q1');
  assert.equal(quarter[107], '1393Q4');
  assert.equal(turns.length, 13);
  turns.forEach((t, k) => assert.equal(t.kind, k % 2 ? 'peak' : 'trough'));
  assert.ok(turns.every((t) => Number.isInteger(t.i)));
  const rows = readFileSync(`${root}/data/iran-non-oil-gdp-quarterly.csv`, 'utf8').trim().split('\n').slice(2);
  rows.forEach((r, k) => {
    const g = Number(r.split(',')[1]);
    assert.ok(Math.abs(level[k + 1] - level[k] * (1 + g / 100)) < 1e-5);
  });
});

test('the registered result reruns: T1 and T2 fail, nothing ships', () => {
  const out = execFileSync('node', ['eval/turns-iran.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(readFileSync(`${root}/eval/turns-iran.out.txt`, 'utf8'), out);
  assert.match(out, /T1 FAILS: stiff excess over random \+0\.044 \(bar \+0\.10\), p 0\.527/);
  assert.match(out, /T2 FAILS: stiff - shipped -0\.017/);
  assert.match(out, /Ships: nothing in the CLI \(one series\)\. The turning-point option is dropped/);
});
