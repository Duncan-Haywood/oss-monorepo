// A voice bar read as a murmur (onsets.mjs readCoda `barLead`, opt-in; README "A voice bar read as a murmur").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';

const rate = 44100;
// part T's F#3 pulse-2 cell, as eval/coda-check.mjs sings it
const T = ['lub', 'tag', 'pob', 'sug', 'cad', 'mub', 'fod', 'rib', 'vob', 'tid', 'hag', 'peg', 'fun', 'ram', 'lim', 'ben', 'lut', 'mic', 'hep', 'gos', 'rax', 'lunc', 'hel', 'fa'];
function sung(syls, midi, pulses, bpm) {
  const ev = []; for (const s of syls) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm, title: 't' });
  const r = renderMidi(mid, { rate, stems: true, sing: true });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  return { x: r.stems.choir.channels[0], notes };
}
const { x, notes } = sung(T, 54, 2, 118);
const read = (s, o) => { const j = T.indexOf(s), n = notes[j]; return readCoda(x, rate, n.t0 + 0.045, notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, o); };

test('pob on F#3: the level rule takes the voice bar for a murmur; with barLead it is the b', () => {
  const def = read('pob'), bar = read('pob', { barLead: 8 });
  assert.equal(def.cls, 'nasal');
  assert.equal(def.rule, 'level');
  assert.ok(def.stopAt >= def.at && def.stopAt - def.at <= 8, 'the closure starts inside the run');
  assert.deepEqual([bar.cls, bar.voiced, bar.place], ['stop', true, 'lab']);
});

test('barLead leaves the nasal codas of the same cell as they read', () => {
  for (const s of ['fun', 'ram', 'lim', 'ben', 'lunc']) assert.equal(read(s, { barLead: 8 }).cls, read(s).cls, s);
});
