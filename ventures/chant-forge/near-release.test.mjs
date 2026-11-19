// A near-rule murmur after the note's end is the vowel's release (onsets.mjs readCoda `nearRelease`, opt-in; README
// "Held out where the release lands").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100;
// a cell of a part as eval/coda-check.mjs sings it: every syllable on one pitch and length, each followed by a rest;
// `o.rel` asks for nearRelease, and every read is given the note's end
const cell = (P, midi, pulses, sing = true) => {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const md = eventsToMidi(ev, { bpm: P.bpm, title: 't' }), x = renderMidi(md, { rate, stems: true, sing }).stems.choir.channels[0];
  const mm = parseMidi(md), sc = (t) => tickToSeconds(t, mm.division, mm.tempos);
  const ns = mm.notes.filter((n) => n.ch !== 9 && mm.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sc(n.tick), t1: sc(n.end) })).sort((a, b) => a.t0 - b.t0);
  return (s, o = {}) => { const j = P.all.indexOf(s), n = ns[j]; return readCoda(x, rate, n.t0 + (pulses === 4 ? 0.1 : 0.045), ns[j + 1] ? Math.min(n.t1 + 0.25, ns[j + 1].t0) : n.t1 + 0.25, { noteEnd: n.t1, ...o }); };
};

test("K's /o/ on A3 quarters sung on vowels only: a nasal by the near rule by default, none with nearRelease", () => {
  const v = cell(PARTS.K, 57, 4, 'vowels');
  for (const s of ['fons', 'pons', 'op', 'om']) {
    assert.deepEqual([v(s).cls, v(s).rule], ['nasal', 'near'], s);
    assert.equal(v(s, { nearRelease: true }).cls, 'none', `${s} with nearRelease`);
    // without the note's end the rule has nothing to go on and the reader is unchanged
    assert.deepEqual(v(s, { nearRelease: true, noteEnd: null }), v(s), `${s} with nearRelease, no noteEnd`);
  }
});

test("the sung cell does not move: K's A3 quarters and X's A#2 quarters", () => {
  const k = cell(PARTS.K, 57, 4);
  for (const s of ['fons', 'mons', 'om', 'on', 'op', 'ob']) assert.deepEqual(k(s, { nearRelease: true }), k(s), s);
  const x = cell(PARTS.X, 46, 4);
  for (const s of ['tum', 'fen', 'lan', 'fub', 'cub']) assert.deepEqual(x(s, { nearRelease: true }), x(s), s);
});
