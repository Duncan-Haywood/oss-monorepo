// A velar burst read as labial (onsets.mjs readCoda `compactVelar`, opt-in; README "A g's burst read as a b").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda, COMPACT_VELAR } from './onsets.mjs';

const rate = 44100;
// part U's A#3 pulse-2 cell, as eval/coda-check.mjs sings it
const U = ['dag', 'bob', 'mod', 'sig', 'lag', 'tib', 'ceb', 'nud', 'hod', 'fig', 'gub', 'pid', 'bam', 'sun', 'tem', 'hon', 'dent', 'hens', 'sonc', 'tint', 'dut', 'sic', 'gep', 'bos', 'lex', 'bel', 'mo', 'vit'];
const ev = []; for (const s of U) ev.push({ type: 'note', midi: 58, pulses: 2, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
const mid = eventsToMidi(ev, { bpm: 110, title: 't' });
const x = renderMidi(mid, { rate, stems: true, sing: true }).stems.choir.channels[0];
const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
const read = (s, o) => { const j = U.indexOf(s), n = notes[j]; return readCoda(x, rate, n.t0 + 0.045, notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, o); };

test('lag on A#3: a compact burst at 1.9 kHz under a low voice bar reads as b by default, g with compactVelar', () => {
  const def = read('lag'), cv = read('lag', { compactVelar: true });
  assert.deepEqual([def.cls, def.voiced, def.place], ['stop', true, 'lab']);
  assert.ok(def.hi1R < 0.5 && def.compactAny >= COMPACT_VELAR.c && def.compactHz >= COMPACT_VELAR.hz, 'low overall, compact at the velar band');
  assert.deepEqual([cv.cls, cv.voiced, cv.place], ['stop', true, 'vel']);
});

test('compactVelar leaves every other coda of the same cell as it reads', () => {
  for (const s of U.filter((s) => s !== 'lag' && s !== 'dag')) assert.deepEqual(read(s, { compactVelar: true }), read(s), s);
});
