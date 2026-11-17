// Diagnostic (2026-11-17, README "A dark-vowel m"): the frames of a final nasal after /u/ (X's *tum*, Z's *lum* and
// *dun*), sung and vowel-only, from 200 ms before the note's end: level, low band (under 500 Hz) and band above 1 kHz
// against the vowel's reference, and the frame's own tilt (above 1 kHz against under 500 Hz), with readCoda's answer.
//   node eval/dark-nasal-diag.mjs [part] [syllables] [pitches]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';
import { PARTS } from './vstop-parts.mjs';
const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const argv = process.argv.slice(2), args = argv.filter((s, i) => !s.startsWith('-') && argv[i - 1] !== '--opt'), opts = process.argv.includes('--opt') ? JSON.parse(process.argv[process.argv.indexOf('--opt') + 1]) : {};
const part = args[0] || 'Z', P = PARTS[part], SY = (args[1] || 'lum,dun').split(','), PITCH = args[2] ? args[2].split(',').map(Number) : P.pitches;
for (const pulses of [4, 2]) for (const midi of PITCH) for (const sing of [true, 'vowels']) {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: P.bpm, title: 'diag' });
  const r = renderMidi(mid, { rate, stems: true, sing });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const x = r.stems.choir.channels[0];
  P.all.forEach((s, j) => {
    if (!SY.includes(s)) return;
    const n = notes[j], want = sing === true ? expectedRead(latinCoda(s)[0]) : { cls: 'none' };
    const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045), t0 = vAt + 0.06;
    const got = readCoda(x, rate, vAt, tEnd, opts), ok = Object.entries(want).every(([k, v]) => got[k] === v);
    const ref = []; for (let i = Math.round(vAt * rate); i < Math.round(t0 * rate); i += Math.round(0.005 * rate)) ref.push(frameFeatures(x, i, rate));
    const avg = (k) => ref.reduce((q, f) => q + f[k], 0) / ref.length, vT = avg('tot'), vL = avg('low'), vH = avg('hi1');
    const rows = [];
    for (let t = Math.max(t0, n.t1 - 0.2); t < tEnd - 0.02; t += 0.005) {
      const f = frameFeatures(x, Math.round(t * rate), rate);
      rows.push(`${(1000 * (t - t0)).toFixed(0)}:${db(f.tot, vT).toFixed(0)}/${db(f.low, vL).toFixed(0)}/${db(f.hi1, vH).toFixed(0)}/${db(f.hi1, f.low).toFixed(0)}`);
    }
    console.log(`${s}${sing === true ? '' : ' (vowel only)'} midi ${midi} p${pulses}: got ${got.cls}${got.rule ? ' ' + got.rule : ''} ${ok ? 'OK' : 'MISS'}; note end +${(1000 * (n.t1 - t0)).toFixed(0)} ms; ref tilt ${db(vH, vL).toFixed(0)}`);
    console.log('  ms:lvl/lo/hi/tilt ' + rows.join(' '));
  });
}
