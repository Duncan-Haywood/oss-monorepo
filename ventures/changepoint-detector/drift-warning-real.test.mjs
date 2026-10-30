import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// eval/drift-warning-real.mjs on the real series in data/; the full table is in eval/drift-warning-real.out.txt and the README.
test('driftWarning on real series: silent on the fixed-season temperatures, fires on growing seasons and on the 1973 dip', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-real.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  const block = (title) => out.split('\n').slice(out.split('\n').findIndex((l) => l.startsWith(title)) + 1).slice(0, 4);
  assert.ok(block('Nottingham').every((l) => l.includes('warning no')), out);
  for (const t of ['airline', 'UK gas']) assert.ok(block(t).every((l) => l.includes('warning yes')), out);
  assert.ok(block('UK driver deaths').every((l) => l.includes('warning yes')), out);
});
