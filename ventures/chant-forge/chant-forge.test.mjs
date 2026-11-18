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

import { arrange, barsFor, SCALES, GENRE_NAMES, BAR } from './genre.mjs';

test('every genre fills each bar with drums, bass and chords inside the mode scale', () => {
  for (const genre of GENRE_NAMES) {
    for (const [mode, name] of [[1, 'dorian'], [3, 'phrygian'], [5, 'lydian'], [8, 'mixolydian']]) {
      const a = arrange({ genre, mode, final: 50, bars: 8 });
      assert.equal(a.mode, name);
      const pcs = new Set(SCALES[name].map((x) => (50 + x) % 12));
      for (const part of ['bass', 'chords']) {
        assert.ok(a[part].length >= 8, `${genre} ${part}`);
        for (const n of a[part]) assert.ok(pcs.has(n.note % 12), `${genre}/${name} ${part} note ${n.note} outside scale`);
      }
      assert.ok(a.drums.every((d) => d.tick >= 0 && d.tick < 8 * BAR));
      for (let bar = 0; bar < 8; bar++) assert.ok(a.drums.some((d) => d.tick >= bar * BAR && d.tick < (bar + 1) * BAR && d.note === 36), `${genre} bar ${bar} has no kick`);
    }
  }
});

test('deep house is four on the floor with the open hat on the offbeat; metal is half time', () => {
  const h = arrange({ genre: 'deep-house', mode: 1, final: 50, bars: 1 });
  assert.deepEqual(h.drums.filter((d) => d.note === 36).map((d) => d.tick), [0, 480, 960, 1440]);
  assert.deepEqual(h.drums.filter((d) => d.note === 46).map((d) => d.tick), [240, 720, 1200, 1680]);
  const m = arrange({ genre: 'metal', mode: 3, final: 50, bars: 1 });
  assert.deepEqual(m.drums.filter((d) => d.note === 38).map((d) => d.tick), [960]);
  assert.equal(m.drums.filter((d) => d.note === 36).length, 16);
});

test('arrange rejects bad input and the progression follows the mode', () => {
  assert.throws(() => arrange({ genre: 'polka', mode: 1, final: 50, bars: 1 }), /unknown genre/);
  assert.throws(() => arrange({ genre: 'metal', mode: 9, final: 50, bars: 1 }), /mode must be/);
  assert.deepEqual(arrange({ genre: 'edm', mode: 3, final: 50, bars: 4 }).progression, [0, 1, 0, 6]);
  assert.equal(barsFor([{ type: 'note', pulses: 8 }, { type: 'note', pulses: 1 }]), 2);
});

test('the CLI writes a multi-track file with --genre and refuses a genre without a mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-'));
  const out = join(dir, 'x.mid');
  const r = run([join(here, 'examples/dies-irae-incipit.gabc'), '-o', out, '--genre', 'metal', '--bpm', '170', '--fit', '8']);
  assert.equal(r.code, 0);
  const b = readFileSync(out);
  assert.equal(b.readUInt16BE(10), 5); // tempo, choir, drums, bass, chords
  const bad = run([join(here, 'examples/dies-irae-incipit.gabc'), '-o', out, '--genre', 'polka']);
  assert.equal(bad.code, 2);
});

test('a bivirga, trivirga, distropha or tristropha is sung as one note per printed head (2026-11-14)', () => {
  // Gregorio: gvv bivirga, gvvv trivirga, gss distropha, gsss tristropha.
  // Until 2026-11-14 each played as one note; the 1908 Graduale prints two or
  // three heads (leaf 423, "lau-date" of Qui timetis, GregoBase 3670).
  const one = (g) => notes(parseGabc(`(c4) a(${g})`)).map((n) => `${n.letter}${n.pulses}${n.syllable ?? ''}`).join(' ');
  assert.equal(one('kvvJH'), 'k1a k1 j1 h1');
  assert.equal(one('gvvv'), 'g1a g1 g1');
  assert.equal(one('gss'), 'g1a g1');
  assert.equal(one('gsss.'), 'g1a g1 g2'); // the mora lengthens the last head
  assert.equal(one('gv'), 'g1a');
  assert.equal(one('gs'), 'g1a');
  // the corpus's 26 bivirgas: every file that writes vv gains one note per vv
  const f = join(here, 'corpus', 'gregobase-1908', '3407.gabc');
  const src = readFileSync(f, 'utf8');
  const plain = src.replace(/([a-m])vv/g, '$1v');
  assert.equal(notes(parseGabc(src)).length - notes(parseGabc(plain)).length, (src.match(/[a-m]vv/g) || []).length);
});
