// A dark-vowel m with a slow closure (onsets.mjs readCoda `lipShut: { span: 4, settle: 2, rise: 4 }`, opt-in;
// README "A dark-vowel m that closes slowly").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100, SLOW = { lipShut: { span: 4, settle: 2, rise: 4 } };
// eval/coda-check.mjs part A (each syllable a quarter at 120 BPM, then a rest), the set the rise guard was set on
const A = { bpm: 120, all: ['as', 'es', 'is', 'os', 'us', 'at', 'et', 'ad', 'ab', 'ac', 'ap', 'am', 'an', 'em', 'um', 'al', 'el', 'ar', 'er', 'ax', 'ex', 'unt', 'ant', 'ost', 'unc', 'a', 'e', 'i', 'o', 'u'] };
// a cell of a part as eval/coda-check.mjs sings it: every syllable on one pitch and length, each followed by a rest
const cell = (P, midi, pulses, sing = true) => {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const md = eventsToMidi(ev, { bpm: P.bpm, title: 't' }), x = renderMidi(md, { rate, stems: true, sing }).stems.choir.channels[0];
  const mm = parseMidi(md), sc = (t) => tickToSeconds(t, mm.division, mm.tempos);
  const ns = mm.notes.filter((n) => n.ch !== 9 && mm.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sc(n.tick), t1: sc(n.end) })).sort((a, b) => a.t0 - b.t0);
  return (s, o) => { const j = P.all.indexOf(s), n = ns[j]; return readCoda(x, rate, n.t0 + (pulses === 4 ? 0.1 : 0.045), ns[j + 1] ? Math.min(n.t1 + 0.25, ns[j + 1].t0) : n.t1 + 0.25, o); };
};

test("b's num on E4: nothing by default, a nasal by the slow lip closure", () => {
  const r = cell(PARTS.b, 64, 4);
  assert.equal(r('num').cls, 'none');
  assert.deepEqual([r('num', SLOW).cls, r('num', SLOW).rule], ['nasal', 'shut']);
  for (const s of ['bud', 'dud', 'god', 'dup', 'loc', 'mul', 'fo', 'pem']) assert.deepEqual(r(s, SLOW), r(s), s);
});

test("A's /u/ on C4 sung on vowels only stays none: the rise guard (without it, a fading /u/ read as a nasal)", () => {
  const v = cell(A, 60, 4, 'vowels');
  for (const s of ['u', 'us', 'um', 'unt', 'unc']) {
    assert.equal(v(s, SLOW).cls, 'none', s);
    assert.equal(v(s, { lipShut: { span: 4, settle: 2 } }).cls, 'nasal', `${s} without rise`);
  }
});
