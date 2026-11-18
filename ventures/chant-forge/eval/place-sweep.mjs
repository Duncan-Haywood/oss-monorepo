// Diagnostic (2026-11-16, nineteenth coda round): every stop coda of parts K, N, T, U and V read by readCoda, with
// the burst's place features, one JSON line per cell, to see how far labial and velar bursts overlap.
//   node eval/place-sweep.mjs [K,N,T,U,V] > rows.jsonl
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead } from '../onsets.mjs';
import { PARTS } from './vstop-parts.mjs';
const rate = 44100;
for (const name of (process.argv[2] || 'K,N,T,U,V').split(',')) {
  const P = PARTS[name];
  for (const pulses of [4, 2]) for (const midi of P.pitches) {
    const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
    const mid = eventsToMidi(ev, { bpm: P.bpm, title: 'sweep' });
    const r = renderMidi(mid, { rate, stems: true, sing: true });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
    const x = r.stems.choir.channels[0];
    P.all.forEach((s, j) => {
      const want = expectedRead(latinCoda(s)[0]);
      if (want.cls !== 'stop') return;
      const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const got = readCoda(x, rate, vAt, tEnd);
      console.log(JSON.stringify({ part: name, s, midi, pulses, want, got: { cls: got.cls, voiced: got.voiced, place: got.place, hi1R: got.hi1R, compactAny: got.compactAny, compactHz: got.compactHz, centroid: got.centroid, relAt: got.relAt === undefined ? undefined : got.relAt - n.t1 } }));
    });
  }
}
