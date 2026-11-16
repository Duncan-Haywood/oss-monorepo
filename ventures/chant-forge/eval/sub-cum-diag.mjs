// Diagnostic (2026-11-16, thirteenth coda round): part L's syllables read back frame by frame, levels against the
// reference vowel.   node eval/sub-cum-diag.mjs [sub,cum] [-v: frames of the misses] [-a: frames of every cell]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';
const rate = 44100;
const db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const SY = (process.argv[2] || 'sub,cum').split(',');
const all = ['vis', 'sit', 'dic', 'nis', 'mil', 'vir', 'fid', 'bis', 'rit', 'tim', 'lin', 'qui', 'tri', 'pi', 'li', 'di', 'iz', 'az', 'ev', 'uv', 'das', 'nos', 'mel', 'per', 'sub', 'cum', 'tet', 'rec', 'pa', 'te', 'ro', 'lu'];
const verbose = process.argv.includes('-v');
for (const pulses of [4, 2]) for (const midi of [43, 48, 51, 56, 61]) {
  const ev = []; for (const s of all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 96, title: 'held-out i' });
  const r = renderMidi(mid, { rate, stems: true, sing: true });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const x = r.stems.choir.channels[0];
  all.forEach((s, j) => {
    if (!SY.includes(s)) return;
    const n = notes[j], want = expectedRead(latinCoda(s)[0]);
    const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
    const got = readCoda(x, rate, vAt, tEnd);
    const ok = Object.entries(want).every(([k, v]) => got[k] === v);
    console.log(`${s} midi ${midi} pulses ${pulses} note ${(n.t1 - n.t0).toFixed(3)}s: want ${JSON.stringify(want)} got ${got.cls}${got.voiced !== undefined ? ' v=' + got.voiced : ''}${got.place ? ' ' + got.place : ''} ${ok ? 'OK' : 'MISS'}`);
    if (verbose && (!ok || process.argv.includes("-a"))) {
      const ref = []; for (let i = Math.round(vAt * rate); i < Math.round((vAt + 0.06) * rate); i += Math.round(0.005 * rate)) ref.push(frameFeatures(x, i, rate));
      const avg = (k) => ref.reduce((q, f) => q + f[k], 0) / ref.length;
      const vT = avg('tot'), vL = avg('low'), vH = avg('hi1');
      for (let t = n.t1 - 0.25; t < tEnd; t += 0.005) {
        const f = frameFeatures(x, Math.round(t * rate), rate);
        console.log(`  t-end ${(t - n.t1).toFixed(3)} lvl ${db(f.tot, vT).toFixed(1)} lo ${db(f.low, vL).toFixed(1)} hi ${db(f.hi1, vH).toFixed(1)} tilt ${db(f.hi1, f.low).toFixed(1)}`);
      }
    }
  });
}
