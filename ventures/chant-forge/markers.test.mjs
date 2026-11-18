import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eventsToMidi } from './midi.mjs';
import { run } from './cli.mjs';

const ev = [
  { type: 'note', midi: 62, pulses: 2, syllable: 'Ky' },
  { type: 'bar', kind: 'full', pulses: 2 },
  { type: 'note', midi: 64, pulses: 2, syllable: 'rie' },
];
const text = (b) => Buffer.from(b).toString('latin1');

test('markers off by default, on with the option', () => {
  assert.ok(!text(eventsToMidi(ev)).includes('Phrase'));
  const t = text(eventsToMidi(ev, { markers: true }));
  assert.ok(t.includes('Phrase 1 Ky') && t.includes('Phrase 2 rie'));
});

test('cli --markers', () => {
  const d = mkdtempSync(join(tmpdir(), 'cf-'));
  const f = join(d, 'a.gabc');
  writeFileSync(f, 'name:T;\nmode:1;\n%%\n(c4) Ky(f)ri(g)e(f) (:) e(g)lei(f)\n');
  const o = join(d, 'a.mid');
  const r = run([f, '--markers', '-o', o]);
  assert.equal(r.code, 0, r.text);
  assert.match(text(readFileSync(o)), /Phrase 1 Ky/);
});
