// A vowel's release read as a nasal (onsets.mjs readCoda `levelFade`, opt-in; README "A /u/ release read as a nasal").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';
import { PARTS } from './eval/vstop-parts.mjs';

const rate = 44100, FADE = { levelFade: true };
// a cell of a part as eval/coda-check.mjs sings it: every syllable on one pitch and length, each followed by a rest
const cell = (P, midi, pulses, sing = true) => {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const md = eventsToMidi(ev, { bpm: P.bpm, title: 't' }), x = renderMidi(md, { rate, stems: true, sing }).stems.choir.channels[0];
  const mm = parseMidi(md), sc = (t) => tickToSeconds(t, mm.division, mm.tempos);
  const ns = mm.notes.filter((n) => n.ch !== 9 && mm.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sc(n.tick), t1: sc(n.end) })).sort((a, b) => a.t0 - b.t0);
  return (s, o) => { const j = P.all.indexOf(s), n = ns[j]; return readCoda(x, rate, n.t0 + (pulses === 4 ? 0.1 : 0.045), ns[j + 1] ? Math.min(n.t1 + 0.25, ns[j + 1].t0) : n.t1 + 0.25, o); };
};

test("c's /u/ on A#3 quarters sung on vowels only: a nasal by the level rule by default, none with levelFade", () => {
  const v = cell(PARTS.c, 58, 4, 'vowels');
  for (const s of ['nun', 'brum', 'mut', 'nul']) {
    assert.deepEqual([v(s).cls, v(s).rule], ['nasal', 'level'], s);
    assert.equal(v(s, FADE).cls, 'none', `${s} with levelFade`);
  }
  for (const s of ['bo', 'non', 'ban']) assert.equal(v(s, FADE).cls, 'none', s);
});

test("the sung cell does not move: c's A#3 quarters, and b's run on D#4 eighths (a level-rule m 7 frames from the end)", () => {
  const r = cell(PARTS.c, 58, 4);
  for (const s of ['nun', 'mom', 'mem', 'nant', 'brud', 'mut', 'nus', 'bo']) assert.deepEqual(r(s, FADE), r(s), s);
  const b = cell(PARTS.b, 63, 2);
  assert.deepEqual([b('run', FADE).cls, b('run', FADE).rule], ['nasal', 'level']);
});
