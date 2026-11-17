// No burst on C#4-E4 (onsets.mjs readCoda `barBurst`, on by default; README "No burst on C#4-E4").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100;
// part U's D#4 pulse-4 cell, as eval/coda-check.mjs and eval/vstop-diag.mjs sing it
const U = PARTS.U.all;
const ev = []; for (const s of U) ev.push({ type: 'note', midi: 63, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
const mid = eventsToMidi(ev, { bpm: PARTS.U.bpm, title: 't' });
const x = renderMidi(mid, { rate, stems: true, sing: true }).stems.choir.channels[0];
const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
const read = (s, o) => { const j = U.indexOf(s), n = notes[j]; return readCoda(x, rate, n.t0 + 0.1, notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, o); };

test('lag and bob on D#4: a voice bar the closure rule misses, read as a nasal and as nothing, read as their stops with barBurst (the default)', () => {
  assert.equal(read('lag', { barBurst: false }).cls, 'nasal');
  assert.equal(read('bob', { barBurst: false }).cls, 'none');
  const g = read('lag'), b = read('bob');
  assert.deepEqual([g.cls, g.voiced, g.place], ['stop', true, 'vel']);
  assert.deepEqual([b.cls, b.voiced, b.place], ['stop', true, 'lab']);
});

test('barBurst leaves the nasal codas and the n-clusters of the same cell as they read', () => {
  for (const s of ['bam', 'sun', 'tem', 'hon', 'dent', 'hens', 'sonc', 'tint']) assert.deepEqual(read(s), read(s, { barBurst: false }), s);
});

test('a trace reports each closure and its burst search, and changes nothing', () => {
  const trace = {};
  assert.deepEqual(read('dag', { trace }), read('dag'));
  assert.ok(trace.closures.length >= 1 && trace.closures.some((c) => c.rel > 0));
});
