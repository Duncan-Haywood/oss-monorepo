// Diagnostic (2026-11-18, README "A murmur dark in every phase"): does a sung final nasal after /u/ get as dark
// against its vowel whatever the onset's lead (where its closure falls in the five voices' beating)? singNote
// alone, *bum* and *brum* on A#3, D4 and E4, quarters and eighths at part c's tempo, lead swept 40-200 ms in 10 ms
// steps. Darkness as in eval/cluster-um-diag.mjs: the coda's darkest 40 ms of tilt (dB above 1 kHz against under
// 500 Hz) against the median tilt of the vowel from 0.1 s (quarter) or 0.045 s (eighth) after the beat to 0.15 s
// before the note's end. Prints, per setting, the 10th / 50th / 90th percentile and the share 15 dB or more darker.
//   node eval/murmur-phase.mjs [--opt '{"murmurSource":"one"}']
import { singNote, latinOnset, latinCoda } from '../sing.mjs';
import { frameFeatures } from '../onsets.mjs';
const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const argv = process.argv.slice(2), opt = argv.includes('--opt') ? JSON.parse(argv[argv.indexOf('--opt') + 1]) : {};
const bpm = 88, rows = [];
for (const syl of ['bum', 'brum', 'bun']) for (const midi of [58, 62, 64]) for (const pulses of [4, 2]) {
  const dur = (60 / bpm) * pulses / 4 * 2, f = 440 * 2 ** ((midi - 69) / 12);
  for (let lead = 0.04; lead <= 0.2001; lead += 0.01) {
    const x = singNote(f, dur, rate, { vowel: 'u', onset: latinOnset(syl), coda: latinCoda(syl), lead, onsetLen: lead + 0.03, seed: midi * 7919 + Math.round(dur * 1000), ...opt });
    const tilts = (a, b) => { const v = []; for (let t = a; t < b; t += 0.005) { const q = frameFeatures(x, Math.round(t * rate), rate); v.push(db(q.hi1, q.low)); } return v; };
    const t0 = lead, t1 = lead + dur, vAt = t0 + (pulses === 4 ? 0.1 : 0.045);
    const vt = tilts(vAt, t1 - 0.15), cw = tilts(t1 - 0.15, t1 + 0.1);
    const c40 = cw.slice(0, cw.length - 7).map((_, k) => med(cw.slice(k, k + 8)));
    // the murmur itself, from 40 ms before the note's end (past the closing transition) to 80 ms after: its
    // brightest 40 ms of tilt, and its low band's deepest dip under the murmur's median low band
    const mt = tilts(t1 - 0.04, t1 + 0.08), m40 = mt.slice(0, mt.length - 7).map((_, k) => med(mt.slice(k, k + 8)));
    const lows = []; for (let t = t1 - 0.04; t < t1 + 0.08; t += 0.005) lows.push(10 * Math.log10(frameFeatures(x, Math.round(t * rate), rate).low + 1e-20));
    rows.push({ syl, midi, pulses, lead, d: Math.min(...c40) - med(vt), bright: Math.max(...m40), dip: Math.min(...lows) - med(lows) });
  }
}
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const show = (t, g) => { const d = g.map((r) => r.d).sort((a, b) => a - b); console.log(`${t}: n ${d.length}, coda - vowel ${q(d, 0.1).toFixed(0)} / ${q(d, 0.5).toFixed(0)} / ${q(d, 0.9).toFixed(0)} dB, range ${d[0].toFixed(0)} to ${d[d.length - 1].toFixed(0)}, 15 dB or darker ${g.filter((r) => r.d <= -15).length}; murmur's brightest 40 ms ${q(g.map((r) => r.bright).sort((a, b) => a - b), 0.5).toFixed(0)} median, ${Math.max(...g.map((r) => r.bright)).toFixed(0)} worst dB; low-band dip ${q(g.map((r) => r.dip).sort((a, b) => a - b), 0.5).toFixed(0)} median, ${Math.min(...g.map((r) => r.dip)).toFixed(0)} worst dB`); };
console.log(`opts ${JSON.stringify(opt)}`);
show('all', rows);
for (const s of ['bum', 'bun']) for (const p of [4, 2]) show(`${s} ${p === 4 ? 'quarter' : 'eighth'}`, rows.filter((r) => r.syl === s && r.pulses === p));
