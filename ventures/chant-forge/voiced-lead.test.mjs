// A voiced stop's lead read as a nasal (onsets.mjs readCoda `voicedLead`; README "A g's voice bar read as a nasal").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100;
// part X's C#4 pulse-4 cell, as eval/coda-check.mjs and eval/burst-diag.mjs sing it
const X = PARTS.X.all;
const ev = []; for (const s of X) ev.push({ type: 'note', midi: 61, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
const mid = eventsToMidi(ev, { bpm: PARTS.X.bpm, title: 't' });
const x = renderMidi(mid, { rate, stems: true, sing: true }).stems.choir.channels[0];
const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
const read = (s, o) => { const j = X.indexOf(s), n = notes[j]; return readCoda(x, rate, n.t0 + 0.1, notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, o); };

test('cog on C#4: the /o/ darkening into a voice bar reads as a nasal by default, as its voiced velar stop with voicedLead', () => {
  assert.equal(read('cog').cls, 'nasal');
  const g = read('cog', { voicedLead: true });
  assert.deepEqual([g.cls, g.voiced, g.place], ['stop', true, 'vel']);
});

test('voicedLead leaves the nasal codas and the n-clusters of the same cell as they read', () => {
  for (const s of ['fen', 'gim', 'lan', 'tum', 'lens', 'sunc', 'fant', 'gonc', 'rins']) assert.deepEqual(read(s, { voicedLead: true }), read(s), s);
});
