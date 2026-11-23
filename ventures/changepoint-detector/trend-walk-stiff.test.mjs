import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// README "A stiff slope" (2026-11-23, pre-registered; R0-R2 pass, R3 fails on TCPD, nothing ships).
// eval/trend-walk-stiff.mjs needs the TCPD download, so its committed output is checked for the
// registered lines; the post hoc chance check runs on committed data and is rerun here.
const root = dirname(fileURLToPath(import.meta.url));

test('the registered result: cap 3e-4 chosen in simulation, R3 fails, nothing ships', () => {
  const out = readFileSync(`${root}/eval/trend-walk-stiff.out.txt`, 'utf8');
  assert.match(out, /Chosen cap 3e-4/);
  assert.match(out, /R0 PASSES/);
  assert.match(out, /R1 PASSES: fresh set mean diff \+0\.166/);
  assert.match(out, /R2 PASSES: NBER seven mean diff \+0\.316/);
  assert.match(out, /R3 FAILS: TCPD floored mean diff -0\.105/);
  assert.match(out, /Ships: nothing in the CLI/);
});

test('post hoc: the stiff walk beats its own count of random cuts on all ten NBER-labelled series', () => {
  const out = execFileSync('node', ['eval/trend-walk-stiff-chance.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(readFileSync(`${root}/eval/trend-walk-stiff-chance.out.txt`, 'utf8'), out);
  assert.match(out, /all ten: shipped excess over random 0\.022, stiff excess 0\.214; stiff beats its random baseline on 10 of 10, shipped on 6 of 10/);
});
