import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { bbq, hpFilter, turningPoints } from './turning-points.mjs';

// README "Dated turning points by Bry-Boschan's rule" (2026-11-24, pre-registered; D2, D3, G1 pass, D1 fails).
const root = dirname(fileURLToPath(import.meta.url));

test('BBQ dates a sine at its crests and troughs, alternating', () => {
  const x = Array.from({ length: 80 }, (_, i) => Math.sin((2 * Math.PI * i) / 20));
  assert.deepEqual(bbq(x).map((t) => `${t.i}${t.kind[0]}`), ['5p', '15t', '25p', '35t', '45p', '55t', '65p', '75t']);
});

test('the duration rules drop a one-quarter wobble and a too-short cycle', () => {
  // a long rise with a single-quarter dip in it: no turn (phase under 2 quarters)
  const up = [1, 2, 3, 4, 5, 6, 5.9, 7, 8, 9, 10, 11, 12];
  assert.deepEqual(bbq(up), []);
  // peak-trough-peak 4 quarters apart (under the 5-quarter cycle): the lower peak goes
  const x = [0, 1, 2, 5, 3, 2, 1, 2, 3, 4, 6, 4, 2, 1, 0, -1, -2];
  const t = bbq(x);
  for (let j = 1; j < t.length; j++) assert.notEqual(t[j].kind, t[j - 1].kind);
  for (let j = 2; j < t.length; j++) assert.ok(t[j].i - t[j - 2].i >= 5);
  for (let j = 1; j < t.length; j++) assert.ok(t[j].i - t[j - 1].i >= 2);
});

test('the HP filter leaves a line alone and its cycle sums to about zero', () => {
  const line = Array.from({ length: 60 }, (_, i) => 3 + 0.2 * i);
  assert.ok(Math.max(...hpFilter(line).cycle.map(Math.abs)) < 1e-9);
  const y = Array.from({ length: 100 }, (_, i) => 0.01 * i + Math.sin(i / 3));
  const { cycle } = hpFilter(y);
  assert.ok(Math.abs(cycle.reduce((s, v) => s + v, 0)) < 1e-6);
});

test('turningPoints reports phases with their length and relative change', () => {
  const x = Array.from({ length: 60 }, (_, i) => Math.exp(0.01 * i + 0.05 * Math.sin((2 * Math.PI * i) / 16)));
  const r = turningPoints(x);
  assert.ok(r.logged && r.turns.length >= 4);
  for (const p of r.phases) assert.equal(p.kind === 'expansion' ? p.change > 0 : p.change < 0, true);
  assert.throws(() => turningPoints(x, { mode: 'other' }), /classical or growth/);
});

test('the registered result reruns: D1 fails by 0.019, nothing ships', () => {
  const out = execFileSync('node', ['eval/turns-bbq.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(readFileSync(`${root}/eval/turns-bbq.out.txt`, 'utf8'), out);
  assert.match(out, /D1 FAILS: GDP matched share 0\.781 \(bar 0\.80\)/);
  assert.match(out, /D2 PASSES/);
  assert.match(out, /D3 PASSES: mean bbq - shipped \+0\.407/);
  assert.match(out, /G1 PASSES: Iran growth F1 0\.727/);
  assert.match(out, /Ships: nothing\./);
});
