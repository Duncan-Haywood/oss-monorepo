import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { localFitScale } from './engine.mjs';
test('eval/noise-floor-local-real.mjs output is current; local-fit floor beats differences on GDP but still over-cuts Australian residents', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-local-real.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-local-real.out.txt', import.meta.url), 'utf8'));
  const count = (series, setting) => { const b = out.split(/\n(?=\S)/).find((x) => x.startsWith(series)); return +b.split('\n').find((l) => l.trim().startsWith(setting + ':')).match(/: (\d+) \[/)[1]; };
  assert.equal(count('US real GDP', 'local k=3'), count('US real GDP', 'd1 k=2'));
  assert.ok(count('Australian residents', 'local k=3') > count('Australian residents', 'd1 k=2'));
});
test('localFitScale is about 0.954 sd on white noise', () => {
  let s = 7; const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const v = Array.from({ length: 20000 }, () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()));
  assert.ok(Math.abs(localFitScale(v) - 0.954) < 0.05);
});
