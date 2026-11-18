// A closure read against the vowel before it (onsets.mjs LOCAL_REF; README "A closure against the vowel before it").
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';
import { readCoda } from './onsets.mjs';

const rate = 44100;
// part K's D4 pulse-2 cell: *ib* among its neighbours, as eval/coda-check.mjs sings it
function sung(syls, midi, pulses, bpm) {
  const ev = []; for (const s of syls) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm, title: 't' });
  const r = renderMidi(mid, { rate, stems: true, sing: true });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  return { x: r.stems.choir.channels[0], notes };
}

test('a D4 voice bar in a beat trough of the reference reads as a b only against the vowel before it', () => {
  const syls = ['eb', 'ib', 'ob', 'ef'];
  const { x, notes } = sung(syls, 62, 4, 104);
  const n = notes[1], tEnd = Math.min(n.t1 + 0.25, notes[2].t0), vAt = n.t0 + 0.1;
  const got = readCoda(x, rate, vAt, tEnd), before = readCoda(x, rate, vAt, tEnd, { localRef: false });
  assert.deepEqual([got.cls, got.voiced, got.place], ['stop', true, 'lab']);
  assert.notEqual(before.cls, 'stop');
});

test('a vowel with no coda still reads as none with the local reference', () => {
  const { x, notes } = sung(['i', 'e', 'u'], 62, 4, 104);
  for (let j = 0; j < 3; j++) {
    const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25;
    assert.equal(readCoda(x, rate, n.t0 + 0.1, tEnd).cls, 'none');
  }
});
