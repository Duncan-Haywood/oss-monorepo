// Diagnostic (2026-11-16, fourteenth coda round): parts K's and N's voiced-stop codas read back frame by frame
// with the per-note voice bar (sing.mjs VOICE_BAR_DB) and with the fixed gain, levels against the reference vowel.
//   node eval/voice-bar-diag.mjs [K|N] [syllables,comma,separated] [-v: frames of the misses]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';
const rate = 44100;
const db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const PART = process.argv[2] || 'K';
const LAYOUT = {
  K: { bpm: 104, pitches: [47, 53, 57, 59, 62], sy: ['fons', 'dens', 'pons', 'mons', 'gens', 'hinc', 'runt', 'bunt', 'tent', 'cant', 'frons', 'sanct', 'lunt', 'quent', 'ep', 'ip', 'op', 'ec', 'ic', 'oc', 'eb', 'ib', 'ob', 'ef', 'of', 'ot', 'ux', 'ix', 'ox', 'im', 'om', 'on', 'in', 'e', 'i', 'u'] },
  N: { bpm: 108, pitches: [42, 49, 54, 58, 63, 64], sy: ['dant', 'lent', 'sint', 'gunt', 'hunc', 'rens', 'tens', 'fans', 'font', 'vint', 'nab', 'ped', 'lud', 'gab', 'rud', 'tob', 'vig', 'cod', 'pet', 'lac', 'sup', 'rot', 'tac', 'dum', 'ven', 'nam', 'pes', 'vos', 'ma', 'ne'] },
}[PART];
const SY = (process.argv[3] || 'eb,ib,ob').split(',');
const verbose = process.argv.includes('-v');
const opts = JSON.parse(process.env.RC || '{}');
for (const pulses of [4, 2]) for (const midi of LAYOUT.pitches) {
  const ev = []; for (const s of LAYOUT.sy) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: LAYOUT.bpm, title: 'diag' });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const xs = Object.fromEntries([true, false].map((vb) => [vb, renderMidi(mid, { rate, stems: true, sing: true, voiceBar: vb }).stems.choir.channels[0]]));
  LAYOUT.sy.forEach((s, j) => {
    if (!SY.includes(s)) return;
    const n = notes[j], want = expectedRead(latinCoda(s)[0]);
    const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
    const res = [true, false].map((vb) => { const g = readCoda(xs[vb], rate, vAt, tEnd, opts); return [g, Object.entries(want).every(([k, v]) => g[k] === v)]; });
    const lab = ([g, ok]) => `${g.cls}${g.voiced !== undefined ? (g.voiced ? ' voiced' : ' voiceless') : ''}${g.place ? ' ' + g.place : ''}${g.bar !== undefined ? ` bar ${g.bar.toFixed(1)}` : ''} ${ok ? 'OK' : 'MISS'}`;
    console.log(`${s} midi ${midi} pulses ${pulses}: per-note ${lab(res[0])} | fixed ${lab(res[1])}`);
    if (verbose && !res[0][1]) for (const vb of [true, false]) {
      const x = xs[vb];
      const ref = []; for (let i = Math.round(vAt * rate); i < Math.round((vAt + 0.06) * rate); i += Math.round(0.005 * rate)) ref.push(frameFeatures(x, i, rate));
      const avg = (k) => ref.reduce((q, f) => q + f[k], 0) / ref.length;
      const vT = avg('tot'), vL = avg('low'), vH = avg('hi1');
      console.log(`  ${vb ? 'per-note' : 'fixed'}:`);
      for (let t = n.t1 - 0.2; t < tEnd; t += 0.005) {
        const f = frameFeatures(x, Math.round(t * rate), rate);
        console.log(`   t-end ${(t - n.t1).toFixed(3)} lvl ${db(f.tot, vT).toFixed(1)} lo ${db(f.low, vL).toFixed(1)} hi ${db(f.hi1, vH).toFixed(1)} tilt ${db(f.hi1, f.low).toFixed(1)} hiR ${f.hiR.toFixed(2)}`);
      }
    }
  });
}
