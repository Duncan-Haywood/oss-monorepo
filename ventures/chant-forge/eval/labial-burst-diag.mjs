// Part h's (eval/coda-check.mjs, thirty-second round) nasals read as a voiced labial stop: what the reader's "burst"
// looks like next to a real /b/'s, on the four cells where `murmurSource: 'match'` lost a nasal to /b/ (eighth E2,
// quarter B2, eighth B2, quarter A2; 80 BPM). Prints every nasal that is not read as a nasal, with its full readCoda
// result; with VB=1 prints part h's voiced labial stops instead (place, hi1R, burst centroid in Hz).
//   node eval/labial-burst-diag.mjs        VB=1 node eval/labial-burst-diag.mjs
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { readCoda } from '../onsets.mjs';
const rate = 44100;
const NS = ['pam', 'fam', 'vam', 'scam', 'san', 'pan', 'flan', 'sem', 'frem', 'gen', 'spen', 'gren', 'rim', 'trim', 'drin', 'clin'];
const SY = [...NS, 'plab', 'drab', 'smeb', 'crib', 'vib', 'glab', 'trep', 'slip', 'fal', 'fle'];
const cells = [[2, 40], [4, 47], [2, 47], [4, 45]];
for (const [pulses, midi] of cells) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 80, title: 'diag' });
  for (const ms of [null, 'match']) {
    const r = renderMidi(mid, { rate, stems: true, sing: true, ...(ms ? { murmurSource: ms } : {}) });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
    const x = r.stems.choir.channels[0];
    const VB = ['plab', 'drab', 'smeb', 'crib', 'vib', 'glab'];
    SY.forEach((s, j) => {
      if (process.env.VB ? !VB.includes(s) : !NS.includes(s)) return;
      const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const g = readCoda(x, rate, vAt, tEnd, { noteEnd: n.t1 });
      const cell = `${pulses === 4 ? 'quarter' : 'eighth'} midi ${midi} ${ms || 'default'}`;
      if (process.env.VB) console.log(cell, s, g.cls, g.voiced ? 'voiced' : '', g.place || '', 'hi1R', (g.hi1R ?? NaN).toExponential(1), 'centroid', Math.round(g.centroid));
      else if (g.cls !== 'nasal') console.log(cell, s, JSON.stringify(g));
    });
  }
}
