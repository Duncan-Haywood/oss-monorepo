// Diagnostic (2026-11-21, README "The murmur inside an E4 quarter"): part f's sung *crun* and *frun* on E4 quarters at
// 86 BPM were read as nasals by default only from a near-rule run starting ~200 ms after the note's end, so
// `nearRelease` read them as nothing: the murmur sung inside the note (codaPlan puts the n before the note's end) was
// never caught. For each syllable at the cell: readCoda's answer and rule, and frame by frame from the reference's end
// (5 ms hops, `t` in ms against the note's end): level, low band and band above 1 kHz against the reference, tilt
// (above 1 kHz against under 500 Hz), and the near rule's view of each frame (its tilt and level against the vowel
// 25-45 ms before). Frames inside the sung murmur (codaPlan's n) are marked `n`.
//   node eval/e4-quarter-diag.mjs [midi=64] [pulses=4] [bpm=86] [sing=1] syllables...
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { readCoda, frameFeatures, NEAR, MURMUR_TILT } from '../onsets.mjs';
import { codaPlan, latinCoda } from '../sing.mjs';
const argv = process.argv.slice(2), nums = argv.filter((a) => /^\d+$/.test(a)).map(Number), syl = argv.filter((a) => !/^\d+$/.test(a));
const [midi = 64, pulses = 4, bpm = 86, singN = 1] = nums;
// part f's syllables in its order (eval/coda-check.mjs), so each note lands where it did there: the five voices' beat
// phase at the coda depends on the note's place in the render
const SY = ['fon', 'blon', 'cron', 'con', 'glun', 'snom', 'clon', 'smum', 'crun', 'plon', 'frun', 'slun', 'snug', 'frub', 'plud', 'glob', 'crod', 'pren', 'len', 'gran', 'clen', 'banc', 'flont', 'spant', 'snons', 'glop', 'gluc', 'brop', 'dor', 'snor', 'pu', 'stur'];
const SHOW = syl.length ? syl : ['crun', 'frun'];
const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20)), hop = Math.round(0.005 * rate);
const median = (v) => { const s = [...v].sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
const mid = eventsToMidi(ev, { bpm, title: 'held-out near-rule release' });
const r = renderMidi(mid, { rate, stems: true, sing: singN ? true : 'vowels' });
const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
const x = r.stems.choir.channels[0];
SY.forEach((s, j) => {
  if (!SHOW.includes(s)) return;
  const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
  const trace = {}, def = readCoda(x, rate, vAt, tEnd, { trace, noteEnd: n.t1 }), rel = readCoda(x, rate, vAt, tEnd, { nearRelease: true, noteEnd: n.t1 });
  const plan = codaPlan(latinCoda(s), n.t1 - n.t0, n.t1), nas = plan.segs.find((g) => 'mnN'.includes(g.ph));
  const a = vAt + 0.06, ref = [];
  for (let i = Math.round(vAt * rate); i < Math.round(a * rate); i += hop) ref.push(frameFeatures(x, i, rate));
  const avg = (k) => ref.reduce((q, f) => q + f[k], 0) / ref.length, vTot = avg('tot'), vLow = avg('low'), vHi1 = avg('hi1');
  const fr = [];
  for (let i = Math.round(a * rate); i <= Math.round((tEnd - 0.02) * rate); i += hop) {
    const f = frameFeatures(x, i, rate), t = i / rate;
    fr.push({ t, lvl: db(f.tot, vTot), lo: db(f.low, vLow), hi: db(f.hi1, vHi1), tilt: db(f.hi1, f.low) });
  }
  console.log(`\n## ${s} (midi ${midi}, ${pulses} pulses, ${bpm} BPM, ${singN ? 'sung' : 'vowels'}): default ${def.cls} (rule ${def.rule ?? '-'}), nearRelease ${rel.cls} (rule ${rel.rule ?? '-'}); note ${Math.round(1000 * (n.t1 - n.t0))} ms; sung n ${nas ? `${Math.round(1000 * (nas.t0 - n.t1))} to ${Math.round(1000 * (nas.t1 - n.t1))} ms` : 'none'}; trace near ${JSON.stringify(trace.near || null)}`);
  console.log('     t  lvl   lo   hi  tilt | nearDark nearLvl ok');
  fr.forEach((f, k) => {
    if (f.t < n.t1 - 0.35) return;
    let nd = '', nl = '', ok = '';
    if (k >= 9) {
      const pre = fr.slice(k - 9, k - 4), pl = median(pre.map((q) => q.lvl)), pt = median(pre.map((q) => q.tilt));
      nd = (pt - f.tilt).toFixed(0); nl = (f.lvl - pl).toFixed(0);
      ok = pt - f.tilt >= NEAR.dark && f.lvl - pl >= NEAR.lo && f.lvl - pl <= NEAR.hi && f.tilt <= -MURMUR_TILT ? 'Y' : '.';
    }
    const inN = nas && f.t >= nas.t0 && f.t < nas.t1 ? 'n' : ' ';
    console.log(`${inN}${String(Math.round(1000 * (f.t - n.t1))).padStart(5)} ${[f.lvl, f.lo, f.hi, f.tilt].map((v) => v.toFixed(0).padStart(4)).join(' ')} | ${nd.padStart(5)} ${nl.padStart(7)}  ${ok}`);
  });
});
