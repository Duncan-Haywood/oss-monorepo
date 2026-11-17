// A dark-vowel nasal's lip closure (onsets.mjs readCoda `lipShut`, the default since the twenty-third round; README
// "A dark-vowel m").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100;
// a cell of a part as eval/coda-check.mjs sings it: every syllable on one pitch and length, each followed by a rest
const cell = (part, midi, pulses, sing = true) => {
  const P = PARTS[part], ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const md = eventsToMidi(ev, { bpm: P.bpm, title: 't' }), x = renderMidi(md, { rate, stems: true, sing }).stems.choir.channels[0];
  const mm = parseMidi(md), sc = (t) => tickToSeconds(t, mm.division, mm.tempos);
  const ns = mm.notes.filter((n) => n.ch !== 9 && mm.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sc(n.tick), t1: sc(n.end) })).sort((a, b) => a.t0 - b.t0);
  return (s, o) => { const j = P.all.indexOf(s), n = ns[j]; return readCoda(x, rate, n.t0 + (pulses === 4 ? 0.1 : 0.045), ns[j + 1] ? Math.min(n.t1 + 0.25, ns[j + 1].t0) : n.t1 + 0.25, o); };
};

test('lum on D#4: the m after /u/ reads as nothing without lipShut, as a nasal (the lip-closure rule) with it', () => {
  const r = cell('Z', 63, 4);
  assert.equal(r('lum', { lipShut: false }).cls, 'none');
  const g = r('lum', { lipShut: true });
  assert.deepEqual([g.cls, g.rule], ['nasal', 'shut']);
  assert.deepEqual(r('lum'), g); // the default since its registration held on part a
});

test('the same cell sung on vowels only reads as none with lipShut, and its voiced stops and n-clusters do not move', () => {
  const v = cell('Z', 63, 4, 'vowels');
  for (const s of ['lum', 'dun', 'hub', 'cud', 'fud', 'dunt', 'hunt']) assert.equal(v(s, { lipShut: true }).cls, 'none', s);
  const r = cell('Z', 63, 4);
  for (const s of ['hub', 'cud', 'bub', 'fud', 'dunt', 'hunt', 'bont', 'luc']) assert.deepEqual(r(s, { lipShut: true }), r(s, { lipShut: false }), s);
});
