import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGabc, pitchToMidi, fitToBars, transposeToFinal, summarize, noteName } from './gabc.mjs';
import { eventsToMidi, vlq } from './midi.mjs';
import { run } from './cli.mjs';

const here = new URL('.', import.meta.url).pathname;
const notes = (p) => p.events.filter((e) => e.type === 'note');

test('clef lines map pitches the way Gregorio draws them', () => {
  const c4 = { type: 'c', line: 4, flatB: false };
  assert.equal(pitchToMidi('j', c4), 60); // do on line 4
  assert.equal(pitchToMidi('d', c4), 50); // re, an octave below
  const c3 = { type: 'c', line: 3, flatB: false };
  assert.equal(pitchToMidi('h', c3), 60);
  const f3 = { type: 'f', line: 3, flatB: false };
  assert.equal(pitchToMidi('h', f3), 65); // fa on line 3, do (refC) three steps below it
  const cb3 = { type: 'c', line: 3, flatB: true };
  assert.equal(pitchToMidi('g', cb3), 58); // ti below do, flattened by the clef
});

test('Dies irae incipit reads as F E F D E C D D with lyrics on each syllable', () => {
  const p = parseGabc(readFileSync(join(here, 'examples/dies-irae-incipit.gabc'), 'utf8'));
  assert.equal(p.header.mode, '1');
  assert.deepEqual(notes(p).map((n) => noteName(n.midi)), ['F3', 'E3', 'F3', 'D3', 'E3', 'C3', 'D3', 'D3']);
  assert.deepEqual(notes(p).map((n) => n.syllable), ['DI', 'es', 'i', 'rae,', 'di', 'es', 'il', 'la']);
  assert.equal(notes(p).at(-1).pulses, 2); // punctum mora
  assert.deepEqual(p.events.at(-1), { type: 'bar', kind: 'full', pulses: 2 });
  const s = summarize(p);
  assert.equal(s.final, 'D3');
  assert.equal(s.modeFinalMatches, true);
  assert.equal(s.ambitus, 5);
});

test('a flat lasts to the end of the word, a custos is not sung, a neume carries several notes', () => {
  const p = parseGabc('(c4) A(ixi) ve(i) Ma(hiwj/i)ri(g+)');
  const ms = notes(p).map((n) => n.midi);
  // i = ti (B4 59) flat -> 58, next word resets -> 59
  assert.deepEqual(ms, [58, 59, 57, 59, 60, 59]);
  assert.equal(notes(p)[2].syllable, 'Ma');
  assert.equal(notes(p)[3].syllable, null);
});

test('a bar resets accidentals; mode mismatch is flagged', () => {
  const p = parseGabc('mode: 1;\n%%\n(c4) a(ix i) (;) b(i) (::)');
  assert.deepEqual(notes(p).map((n) => n.midi), [58, 59]);
  assert.equal(summarize(p).modeFinalMatches, false);
});

test('fitToBars starts every phrase after a full bar on a downbeat', () => {
  const p = parseGabc('(c4) a(f) b(g) c(h) (:) d(f) (::)');
  const fitted = fitToBars(p.events, 8);
  let t = 0;
  const starts = [];
  for (const e of fitted) {
    if (e.type === 'note') starts.push(t);
    t += e.pulses;
  }
  assert.deepEqual(starts, [0, 1, 2, 8]);
  assert.equal(t % 8, 0);
});

test('transposeToFinal moves the whole line so the final lands where asked', () => {
  const p = parseGabc('(c4) a(f) b(d)');
  assert.deepEqual(notes({ events: transposeToFinal(p.events, 45) }).map((n) => n.midi), [48, 45]);
});

test('MIDI output is a well-formed format-1 file with lyrics and an optional drone', () => {
  assert.deepEqual(vlq(0), [0]);
  assert.deepEqual(vlq(0x80), [0x81, 0x00]);
  assert.deepEqual(vlq(0x0fffffff), [0xff, 0xff, 0xff, 0x7f]);
  const p = parseGabc(readFileSync(join(here, 'examples/dies-irae-incipit.gabc'), 'utf8'));
  const bytes = Buffer.from(eventsToMidi(p.events, { drone: true, title: 'Dies irae' }));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'MThd');
  assert.equal(bytes.readUInt16BE(8), 1);
  assert.equal(bytes.readUInt16BE(10), 3);
  let off = 14;
  const lens = [];
  while (off < bytes.length) {
    assert.equal(bytes.subarray(off, off + 4).toString('ascii'), 'MTrk');
    const len = bytes.readUInt32BE(off + 4);
    lens.push(len);
    assert.deepEqual([...bytes.subarray(off + 8 + len - 3, off + 8 + len)], [0xff, 0x2f, 0x00]);
    off += 8 + len;
  }
  assert.equal(off, bytes.length);
  assert.equal(lens.length, 3);
  assert.ok(bytes.includes(Buffer.from('rae,')));
});

test('CLI prints a summary and writes a .mid', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'chant-')), 'd.mid');
  const r = run([join(here, 'examples/dies-irae-incipit.gabc'), '-o', out, '--fit', '8', '--final', '50', '--json']);
  assert.equal(r.code, 0);
  const s = JSON.parse(r.text);
  assert.equal(s.final, 'D3');
  assert.equal(s.bars, 2);
  assert.equal(readFileSync(out).subarray(0, 4).toString('ascii'), 'MThd');
  assert.equal(run([]).code, 2);
});

test('every corpus piece parses, names its source, and ends on its mode final', () => {
  const dir = join(here, 'corpus');
  const files = readdirSync(dir).filter((f) => f.endsWith('.gabc'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const p = parseGabc(readFileSync(join(dir, f), 'utf8'));
    assert.ok(p.header.book || p.header.source, `${f} names no book`);
    const s = summarize(p);
    assert.ok(s.notes > 20, `${f} has too few notes`);
    assert.equal(s.modeFinalMatches, true, `${f}: final ${s.final} does not fit mode ${s.mode}`);
  }
});
