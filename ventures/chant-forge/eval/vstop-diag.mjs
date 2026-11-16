// Diagnostic (2026-11-16, fourteenth coda round): parts K's and N's voiced-stop codas read back frame by frame, levels
// against the reference vowel, with the burst search's verdict per closure.
//   node eval/vstop-diag.mjs [K|N] [ib,eb] [-v: frames of the misses] [-a: every cell] [--voice-bar off]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';
const rate = 44100;
const db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const part = process.argv[2] || 'K';
const P = {
  K: { bpm: 104, pitches: [47, 53, 57, 59, 62], all: ['fons', 'dens', 'pons', 'mons', 'gens', 'hinc', 'runt', 'bunt', 'tent', 'cant', 'frons', 'sanct', 'lunt', 'quent', 'ep', 'ip', 'op', 'ec', 'ic', 'oc', 'eb', 'ib', 'ob', 'ef', 'of', 'ot', 'ux', 'ix', 'ox', 'im', 'om', 'on', 'in', 'e', 'i', 'u'] },
  N: { bpm: 108, pitches: [42, 49, 54, 58, 63, 64], all: ['dant', 'lent', 'sint', 'gunt', 'hunc', 'rens', 'tens', 'fans', 'font', 'vint', 'nab', 'ped', 'lud', 'gab', 'rud', 'tob', 'vig', 'cod', 'pet', 'lac', 'sup', 'rot', 'tac', 'dum', 'ven', 'nam', 'pes', 'vos', 'ma', 'ne'] },
}[part];
const SY = (process.argv[3] || (part === 'K' ? 'ib,eb,ob' : 'nab,gab')).split(',');
const verbose = process.argv.includes('-v'), every = process.argv.includes('-a');
const voiceBar = !(process.argv.includes('--voice-bar') && process.argv[process.argv.indexOf('--voice-bar') + 1] === 'off');
for (const pulses of [4, 2]) for (const midi of P.pitches) {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: P.bpm, title: 'diag' });
  const r = renderMidi(mid, { rate, stems: true, sing: true, voiceBar });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const x = r.stems.choir.channels[0];
  P.all.forEach((s, j) => {
    if (!SY.includes(s)) return;
    const n = notes[j], want = expectedRead(latinCoda(s)[0]);
    const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
    const got = readCoda(x, rate, vAt, tEnd);
    const ok = Object.entries(want).every(([k, v]) => got[k] === v);
    console.log(`${s} midi ${midi} pulses ${pulses} note ${(n.t1 - n.t0).toFixed(3)}s: got ${got.cls}${got.voiced !== undefined ? ' v=' + got.voiced : ''}${got.place ? ' ' + got.place : ''} ${ok ? 'OK' : 'MISS'}`);
    if (verbose && (!ok || every)) {
      const ref = []; for (let i = Math.round(vAt * rate); i < Math.round((vAt + 0.06) * rate); i += Math.round(0.005 * rate)) ref.push(frameFeatures(x, i, rate));
      const avg = (k) => ref.reduce((q, f) => q + f[k], 0) / ref.length;
      const vT = avg('tot'), vL = avg('low'), vH = avg('hi1'), vR = avg('hiR');
      for (let t = n.t1 - 0.2; t < tEnd; t += 0.005) {
        const f = frameFeatures(x, Math.round(t * rate), rate);
        console.log(`  t-end ${(t - n.t1).toFixed(3)} lvl ${db(f.tot, vT).toFixed(1)} lo ${db(f.low, vL).toFixed(1)} hi ${db(f.hi1, vH).toFixed(1)} tilt ${db(f.hi1, f.low).toFixed(1)} hiR ${f.hiR.toFixed(2)}/${(3 * vR).toFixed(2)} lowR ${f.lowR.toFixed(2)}`);
      }
    }
  });
}
