// Diagnostic (2026-11-17): why readCoda finds no burst after a voiced closure on C#4-E4 (README "No burst on
// C#4-E4"). For each cell it prints readCoda's closures with the burst search's window, its baseline against the
// vowel above 600 Hz, the largest rise it saw and each candidate it tried (rise, and the level 20-30 ms after
// against the peak: a burst must fall 6 dB), then with -v the frames from 120 ms before the note's end.
//   node eval/burst-diag.mjs [part] [syllables] [pitches] [-v]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';
import { PARTS } from './vstop-parts.mjs';
const rate = 44100;
const db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const argv = process.argv.slice(2), args = argv.filter((s, i) => !s.startsWith('-') && argv[i - 1] !== '--opt');
const part = args[0] || 'U', P = PARTS[part];
const SY = (args[1] || 'bob,lag').split(','), PITCH = args[2] ? args[2].split(',').map(Number) : P.pitches.filter((m) => m >= 61);
const verbose = process.argv.includes('-v'), opts = process.argv.includes('--opt') ? JSON.parse(process.argv[process.argv.indexOf('--opt') + 1]) : {};
for (const pulses of [4, 2]) for (const midi of PITCH) {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: P.bpm, title: 'diag' });
  const r = renderMidi(mid, { rate, stems: true, sing: true });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const x = r.stems.choir.channels[0];
  P.all.forEach((s, j) => {
    if (!SY.includes(s)) return;
    const n = notes[j], want = expectedRead(latinCoda(s)[0]);
    const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
    const trace = {};
    const got = readCoda(x, rate, vAt, tEnd, { ...opts, trace });
    const ok = Object.entries(want).every(([k, v]) => got[k] === v), t0 = vAt + 0.06;
    console.log(`${s} midi ${midi} pulses ${pulses}: got ${got.cls}${got.place ? ' ' + got.place : ''}${got.rule ? " rule " + got.rule + " at +" + (got.at * 0.005).toFixed(3) + " " + got.ms + " ms" : ""} ${ok ? 'OK' : 'MISS'} (note end at +${(n.t1 - t0).toFixed(3)}s, tEnd +${(tEnd - t0).toFixed(3)})`);
    for (const c of trace.barCands || []) console.log(`  bar run +${c.t.toFixed(3)}..+${c.end.toFixed(3)} burst ${c.rel < 0 ? 'none' : '+' + c.rel.toFixed(3)} max rise ${c.maxDb.toFixed(1)}${c.hi ? ' / above ' + 'hz: ' + c.hi.maxDb.toFixed(1) + ' series ' + c.hi.series.join(',') + ' to +' + c.hi.to.toFixed(3) + ' tries ' + c.hi.tries.map((q) => `+${q.at.toFixed(3)} rise ${q.riseDb.toFixed(1)} late ${q.lateDb.toFixed(1)}`).join('; ') : ''}`);
    for (const c of trace.closures || []) console.log(`  closure +${c.t.toFixed(3)} ${c.ms} ms, search +${c.from.toFixed(3)}..+${c.to.toFixed(3)}, base ${c.baseDb.toFixed(1)} dB of vowel>600, max rise ${c.maxDb.toFixed(1)} dB, burst ${c.rel < 0 ? 'none' : '+' + c.rel.toFixed(3)}; tries ${c.tries.map((q) => `+${q.at.toFixed(3)} rise ${q.riseDb.toFixed(1)} late ${q.lateDb.toFixed(1)}`).join('; ') || '-'}`);
    if (verbose) {
      const ref = []; for (let i = Math.round(vAt * rate); i < Math.round(t0 * rate); i += Math.round(0.005 * rate)) ref.push(frameFeatures(x, i, rate));
      const avg = (k) => ref.reduce((q, f) => q + f[k], 0) / ref.length, vT = avg('tot'), vL = avg('low'), vH = avg('hi1');
      for (let t = n.t1 - 0.12; t < tEnd; t += 0.005) {
        const f = frameFeatures(x, Math.round(t * rate), rate);
        console.log(`   +${(t - t0).toFixed(3)} lvl ${db(f.tot, vT).toFixed(1)} lo ${db(f.low, vL).toFixed(1)} hi1 ${db(f.hi1, vH).toFixed(1)} hiR ${f.hiR.toFixed(2)}`);
      }
    }
  });
}
