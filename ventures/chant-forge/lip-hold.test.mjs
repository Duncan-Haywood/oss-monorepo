// A dark-vowel m that holds level (onsets.mjs readCoda `lipHold`, opt-in; README "A dark-vowel m that holds level").
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

test('hum and bum on D4: nothing by default (lipShut cannot see them), a nasal by the level-hold rule with lipHold', () => {
  const r = cell('a', 62, 4);
  for (const s of ['hum', 'bum']) {
    assert.equal(r(s).cls, 'none', s);
    const g = r(s, { lipHold: true });
    assert.deepEqual([g.cls, g.rule], ['nasal', 'hold'], s);
  }
});

test('the same cell sung on vowels only reads as none with lipHold, and its other codas do not move', () => {
  const v = cell('a', 62, 4, 'vowels');
  for (const s of ['hum', 'bum', 'fum', 'tom', 'bog', 'fob', 'tur', 'bu']) assert.equal(v(s, { lipHold: true }).cls, 'none', s);
  const r = cell('a', 62, 4);
  for (const s of ['bog', 'dod', 'vud', 'gug', 'fob', 'nuc', 'tup', 'gul', 'po']) assert.deepEqual(r(s, { lipHold: true }), r(s), s);
});
