import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// eval/drift-warning-real-ar1.mjs: --ar1 with --trend bend on the real series; output committed alongside.
test('--ar1 keeps the drift warning on the airline series, loses it on UK gas, stays silent on Nottingham', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-real-ar1.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/drift-warning-real-ar1.out.txt', import.meta.url), 'utf8'));
  const block = (t) => out.split('\n').slice(out.split('\n').findIndex((l) => l.startsWith(t)) + 1).slice(0, 4).filter((l) => l.includes(' ar1 '));
  assert.ok(block('airline').every((l) => l.includes('warning yes')));
  assert.ok(block('UK gas').every((l) => l.includes('warning no')));
  assert.ok(block('Nottingham').every((l) => l.includes('warning no')));
});
