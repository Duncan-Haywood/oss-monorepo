import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './cli.mjs';

const dir = mkdtempSync(join(tmpdir(), 'cf-rep-'));
const f = join(dir, 'a.gabc');
writeFileSync(f, 'name: Test;\nmode: 1;\n%%\n(c4) A(d) men(f) (::)\n');

test('--repeat multiplies notes and length', () => {
  const one = JSON.parse(run([f, '--json']).text);
  const three = JSON.parse(run([f, '--repeat', '3', '--json']).text);
  assert.equal(three.notes, one.notes * 3);
  assert.ok(Math.abs(three.seconds - one.seconds * 3) < 1e-6);
});

test('--repeat writes a longer MIDI and rejects bad values', () => {
  run([f, '-o', join(dir, '1.mid')]);
  run([f, '--repeat', '4', '-o', join(dir, '4.mid')]);
  assert.ok(readFileSync(join(dir, '4.mid')).length > readFileSync(join(dir, '1.mid')).length);
  for (const v of ['0', '1.5', '65', 'x']) assert.equal(run([f, '--repeat', v]).code, 2);
});
