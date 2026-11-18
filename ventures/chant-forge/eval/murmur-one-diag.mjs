// Diagnostic (2026-11-18, eval/murmur-one-check.md "next: why"): the final nasals of part D of eval/coda-check.mjs
// (ten Graduale pieces at final D3, 124 BPM) that read right with the chorus's murmur and wrong with one voice's
// (sing.mjs `murmurSource: 'one'`). For each final nasal of 0.2 s or more, both ways: readCoda's answer, and the
// frames from 60 ms after the reference to the window's end: level against the reference (lvl), the band under
// 500 Hz against the reference's (lo), and the frame's own tilt (above 1 kHz against under 500 Hz) minus the
// reference's (tilt; readCoda's darkness test wants 15 dB or more). Same window and reference as coda-check.mjs.
//   node eval/murmur-one-diag.mjs [--pieces 3400,3430,3450] [--all] [--source one|match]
import { readFileSync, readdirSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinOnset, latinCoda, onsetLength } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';

const rate = 44100, corpus = new URL('../corpus/', import.meta.url), db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const args = process.argv.slice(2), all = args.includes('--all'), SRC = args.includes('--source') ? args[args.indexOf('--source') + 1] : 'one';
const pick = args.includes('--pieces') ? args[args.indexOf('--pieces') + 1].split(',') : null;
const HELD = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort().filter((_, i) => i % 6 === 0).map((f) => f.slice(0, -5));
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], pname = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
function choir(mid, murmurSource) {
  const r = renderMidi(mid, { rate, stems: true, sing: true, ...(murmurSource ? { murmurSource } : {}) });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  return { x: r.stems.choir.channels[0], notes };
}
const nextSound = (notes, k, firstOf) => {
  const n = notes[k], nx = notes[k + 1];
  if (!nx) return n.t1 + 0.25;
  const on = firstOf.has(nx) ? latinOnset(nx.lyric) : [];
  const lead = on.length ? Math.min(onsetLength(on), 0.5 * (n.t1 - n.t0) + Math.max(0, nx.t0 - n.t1)) : 0;
  return Math.min(n.t1 + 0.25, nx.t0 - lead);
};
const vowelStart = (n, on) => n.t0 + (on.length ? Math.max(0, Math.min(onsetLength(on), 0.15 + 0.3 * (n.t1 - n.t0)) - 0.15) : 0) + 0.045;
const frames = (x, vAt, tEnd) => {
  const hop = Math.round(0.005 * rate), a = Math.round((vAt + 0.06) * rate), z = Math.round((tEnd - 0.02) * rate);
  const ref = []; for (let i = Math.round(vAt * rate); i < a; i += hop) ref.push(frameFeatures(x, i, rate));
  const avg = (k) => ref.reduce((s, f) => s + f[k], 0) / ref.length, vTot = avg('tot'), vLow = avg('low'), vT = db(avg('hi1'), vLow);
  const out = []; for (let i = a; i <= z; i += hop) { const f = frameFeatures(x, i, rate); out.push({ lvl: db(f.tot, vTot), lo: db(f.low, vLow), tilt: db(f.hi1, f.low) - vT }); }
  return { out, vT };
};
const r0 = (v) => String(Math.round(v)).padStart(4);
const sum = { both: 0, lost: 0, gained: 0, n: 0 }, gaps = [];
// the murmur's held level: the median lvl of the frames from 60 ms to 20 ms before the window's end (the coda's steady part)
const held = (out) => { const v = out.slice(-12, -4).map((f) => f.lvl).sort((a, b) => a - b); return v[v.length >> 1]; };
for (const p of HELD.filter((h) => !pick || pick.includes(h))) {
  const src = parseGabc(readFileSync(new URL(`gregobase-1908/${p}.gabc`, corpus), 'utf8'));
  const mid = eventsToMidi(fitToBars(transposeToFinal(src.events, 50), 8), { bpm: 124, title: p });
  const A = choir(mid, null), B = choir(mid, SRC);
  const firstOf = new Set(), lastOf = new Map();
  for (const n of A.notes) if (n.syl) { if (![...firstOf].some((f) => f.syl === n.syl)) firstOf.add(n); lastOf.set(n.syl, n); }
  A.notes.forEach((n, k) => {
    if (!n.syl || lastOf.get(n.syl) !== n || n.t1 - n.t0 < 0.2) return;
    const cd = latinCoda(n.lyric); if (!cd.length || expectedRead(cd[0]).cls !== 'nasal') return;
    const on = firstOf.has(n) ? latinOnset(n.lyric) : [], vAt = vowelStart(n, on), tEnd = nextSound(A.notes, k, firstOf);
    if (vAt + 0.06 > n.t1 - 0.35 * (n.t1 - n.t0) - 0.045 || tEnd - vAt < 0.15) return;
    const ga = readCoda(A.x, rate, vAt, tEnd).cls, gb = readCoda(B.x, rate, vAt, tEnd).cls;
    sum.n++; if (ga === 'nasal' && gb === 'nasal') sum.both++; else if (ga === 'nasal') sum.lost++; else if (gb === 'nasal') sum.gained++;
    const ha = held(frames(A.x, vAt, tEnd).out), hb = held(frames(B.x, vAt, tEnd).out);
    gaps.push({ p, syl: n.lyric, ha, hb, ga, gb });
    if (!all && ga === gb) return;
    const nx = A.notes[k + 1];
    console.log(`\n${p} *${n.lyric}* ${pname(n.note)}, ${Math.round((n.t1 - n.t0) * 1000)} ms, reference starts ${Math.round((vAt - n.t0) * 1000)} ms in, window to ${Math.round((tEnd - n.t0) * 1000)} ms${nx ? ` (then *${nx.lyric}* ${pname(nx.note)})` : ''}: chorus ${ga}, ${SRC} ${gb}`);
    for (const [name, R] of [['chorus', A], [SRC, B]]) {
      const { out, vT } = frames(R.x, vAt, tEnd);
      console.log(`  ${name.padEnd(6)} vowel tilt ${Math.round(vT)} dB; frames every 5 ms from ${Math.round((vAt + 0.06 - n.t0) * 1000)} ms`);
      console.log(`    lvl  ${out.map((f) => r0(f.lvl)).join('')}`);
      console.log(`    lo   ${out.map((f) => r0(f.lo)).join('')}`);
      console.log(`    tilt ${out.map((f) => r0(f.tilt)).join('')}`);
    }
  });
}
console.log(`\nheld murmur against the vowel, dB (chorus / ${SRC} / ${SRC} minus chorus):`);
for (const g of gaps) console.log(`  ${g.p} *${g.syl}*: ${Math.round(g.ha)} / ${Math.round(g.hb)} / ${Math.round(g.hb - g.ha) >= 0 ? '+' : ''}${Math.round(g.hb - g.ha)}  (${g.ga}, ${g.gb})`);
console.log(`\nfinal nasals read: ${sum.n}; nasal both ways ${sum.both}, chorus only ${sum.lost}, one voice only ${sum.gained}`);
