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

test('cog on C#4: the /o/ darkening into a voice bar reads as a nasal without voicedLead, as its voiced velar stop with it', () => {
  assert.equal(read('cog', { voicedLead: false }).cls, 'nasal');
  const g = read('cog', { voicedLead: true });
  assert.deepEqual([g.cls, g.voiced, g.place], ['stop', true, 'vel']);
});

test('voicedLead leaves the nasal codas and the n-clusters of the same cell as they read', () => {
  for (const s of ['fen', 'gim', 'lan', 'tum', 'lens', 'sunc', 'fant', 'gonc', 'rins']) assert.deepEqual(read(s, { voicedLead: true }), read(s, { voicedLead: false }), s);
});

// The hold form, readCoda's default since the twenty-second round (README "A voiced closure that holds to its burst")
const cell = (part, midi, pulses) => {
  const P = PARTS[part], ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const md = eventsToMidi(ev, { bpm: P.bpm, title: 't' }), xx = renderMidi(md, { rate, stems: true, sing: true }).stems.choir.channels[0];
  const mm = parseMidi(md), sc = (t) => tickToSeconds(t, mm.division, mm.tempos);
  const ns = mm.notes.filter((n) => n.ch !== 9 && mm.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sc(n.tick), t1: sc(n.end) })).sort((a, b) => a.t0 - b.t0);
  return (s, o) => { const j = P.all.indexOf(s), n = ns[j]; return readCoda(xx, rate, n.t0 + (pulses === 4 ? 0.1 : 0.045), ns[j + 1] ? Math.min(n.t1 + 0.25, ns[j + 1].t0) : n.t1 + 0.25, o); };
};

test('sob on C4: a closure-rule closure whose voicing holds to its burst takes back the nasal it was read as', () => {
  const r = cell('Y', 60, 4);
  assert.equal(r('sob', { voicedLead: false }).cls, 'nasal');
  assert.equal(r('sob', { voicedLead: true }).cls, 'nasal'); // the bar form skips closure-rule closures
  const b = r('sob');
  assert.deepEqual([b.cls, b.voiced, b.place], ['stop', true, 'lab']);
});

test('om on F3: a final nasal held 270 ms before a release blip stays a nasal (the 100 ms span)', () => {
  const r = cell('K', 53, 4);
  assert.equal(r('om').cls, 'nasal');
  assert.equal(r('om', { voicedLead: { hold: true, span: 1000 } }).cls, 'stop');
});
