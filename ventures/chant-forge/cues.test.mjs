import test from 'node:test';
import assert from 'node:assert/strict';
import { cueRows, cueSheet } from './cues.mjs';
import { run } from './cli.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ev = [
  { type: 'note', midi: 62, pulses: 2, syllable: 'Ky' },
  { type: 'note', midi: 64, pulses: 4, syllable: 'ri' },
  { type: 'rest', pulses: 2 },
  { type: 'note', midi: 65, pulses: 2, syllable: 'e' },
];

test('bar, beat and seconds follow the pulse grid', () => {
  const r = cueRows(ev, { bpm: 120, pulsesPerBar: 8 });
  assert.deepEqual(r.map((x) => [x.bar, x.beat]), [[1, 1], [1, 2], [2, 1]]);
  assert.equal(r[1].seconds, 0.5);
  assert.equal(r[2].seconds, 2);
  assert.equal(r[0].note, 'D4');
});

test('sheet has a header and one line per note', () => {
  const s = cueSheet(ev, { bpm: 120 });
  assert.equal(s.trim().split('\n').length, 4);
  assert.match(s, /Ky/);
});

test('cli --cues writes the sheet', () => {
  const d = mkdtempSync(join(tmpdir(), 'cf-'));
  const f = join(d, 'a.gabc');
  writeFileSync(f, 'name:T;\nmode:1;\n%%\n(c4) Ky(f)ri(g)e(f)\n');
  const out = join(d, 'cues.txt');
  const r = run([f, '--cues', out]);
  assert.equal(r.code, 0, r.text);
  assert.match(readFileSync(out, 'utf8'), /Ky/);
});
