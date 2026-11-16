// A p's burst read as a k (onsets.mjs readCoda `voicelessLow`, on by default; README "A p's burst read as a k").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda, VOICELESS_LOW } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100;
// part V's B3 pulse-4 cell, as eval/coda-check.mjs sings it
const V = PARTS.V.all;
const ev = []; for (const s of V) ev.push({ type: 'note', midi: 59, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
const mid = eventsToMidi(ev, { bpm: PARTS.V.bpm, title: 't' });
const x = renderMidi(mid, { rate, stems: true, sing: true }).stems.choir.channels[0];
const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
const read = (s, o) => { const j = V.indexOf(s), n = notes[j]; return readCoda(x, rate, n.t0 + 0.1, notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, o); };

test('rup on B3: a p burst with 60% of its energy above 1 kHz reads as k without voicelessLow, p with it (the default)', () => {
  const def = read('rup', { voicelessLow: false }), vl = read('rup');
  assert.deepEqual([def.cls, def.voiced, def.place], ['stop', false, 'vel']);
  assert.ok(def.hi1R > 0.5 && def.hi1R < VOICELESS_LOW, 'over half above 1 kHz, under the voiceless line');
  assert.deepEqual([vl.cls, vl.voiced, vl.place], ['stop', false, 'lab']);
});

test('voicelessLow leaves the velar and voiced codas of the same cell as they read', () => {
  for (const s of V.filter((s) => !s.endsWith('p'))) assert.deepEqual(read(s), read(s, { voicelessLow: false }), s);
});
