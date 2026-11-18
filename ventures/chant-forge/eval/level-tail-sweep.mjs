// Diagnostic (2026-11-17, README "A /u/ release read as a nasal"): every coda the level rule reads as a nasal on the
// parts of eval/vstop-parts.mjs, sung and vowel-only, with where its run starts against the read window's last frame
// (`left`, 5 ms frames) and its level's first frames. Prints the rows the rule gets wrong, then how many it gets right
// and wrong by `left`, so a tail guard (onsets.mjs LEVEL_FADE) can be read off before it is tried.
//   node eval/level-tail-sweep.mjs [parts, default every part in vstop-parts.mjs]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead } from '../onsets.mjs';
import { PARTS } from './vstop-parts.mjs';
const rate = 44100, rows = [];
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PARTS);
for (const part of want) {
  const P = PARTS[part];
  for (const pulses of [4, 2]) for (const midi of P.pitches) for (const sing of [true, 'vowels']) {
    const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
    const mid = eventsToMidi(ev, { bpm: P.bpm, title: 'level tail sweep' });
    const r = renderMidi(mid, { rate, stems: true, sing });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
    const x = r.stems.choir.channels[0];
    P.all.forEach((s, j) => {
      const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
      const trace = {}, got = readCoda(x, rate, vAt, tEnd, { trace });
      if (got.rule !== 'level') return;
      const w = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
      rows.push({ part, s, midi, pulses, sung: sing === true, ok: Object.entries(w).every(([k, v]) => got[k] === v), ...trace.level });
    });
  }
}
for (const r of rows.filter((q) => !q.ok)) console.log(`wrong: ${r.part} ${r.s}${r.sung ? '' : ' (vowel only)'} midi ${r.midi} p${r.pulses}: left ${r.left}, ${r.ms} ms, level ${r.lv.join(' ')}`);
const by = new Map();
for (const r of rows) { const k = Math.min(r.left, 20); const v = by.get(k) || [0, 0]; v[r.ok ? 0 : 1]++; by.set(k, v); }
console.log('left (frames; 20 = 20 or more): right, wrong');
for (const k of [...by.keys()].sort((a, b) => a - b)) console.log(`  ${k}: ${by.get(k)[0]}, ${by.get(k)[1]}`);
