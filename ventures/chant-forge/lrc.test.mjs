import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lrc } from './lrc.mjs';
import { run } from './cli.mjs';

const ev = [
  { type: 'note', midi: 62, pulses: 2, syllable: 'Ky', wordStart: true },
  { type: 'note', midi: 64, pulses: 2, syllable: 'rie', wordStart: false },
  { type: 'bar', kind: 'full', pulses: 2 },
  { type: 'note', midi: 62, pulses: 2, syllable: 'e', wordStart: true },
  { type: 'note', midi: 62, pulses: 2, syllable: 'lei', wordStart: true },
];

test('phrases split at bars, words from word starts, 100 ms stamps', () => {
  assert.equal(lrc(ev, { bpm: 120 }, 'T'), '[ti:T]\n[00:00.00]Kyrie\n[00:01.50]e lei\n');
});

test('stamps roll over a minute', () => {
  const s = lrc([{ type: 'rest', pulses: 250 }, { type: 'note', midi: 60, pulses: 1, syllable: 'A', wordStart: true }], { bpm: 120 });
  assert.equal(s, '[01:02.50]A\n');
});

test('cli --lrc writes the file', () => {
  const d = mkdtempSync(join(tmpdir(), 'cf-'));
  const f = join(d, 'a.gabc');
  writeFileSync(f, 'name:T;\nmode:1;\n%%\n(c4) Ky(f)ri(g)e(f) e(g)lei(f)\n');
  const out = join(d, 'a.lrc');
  const r = run([f, '--lrc', out]);
  assert.equal(r.code, 0, r.text);
  assert.match(readFileSync(out, 'utf8'), /\[ti:T\]\n\[00:00\.00\]Kyrie e/);
});
