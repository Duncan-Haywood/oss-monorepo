// Diagnostic (2026-11-19, README "Held out where the release lands"): part e's vowel-only false nasals, all on
// E4 eighths at 84 BPM. For each syllable sung on its vowel at a given pitch, pulses and BPM: readCoda's answer,
// the rule that fired, and for a level-rule nasal where its run starts against the window's last frame (`left`,
// 5 ms frames), its length and level; and the release-cells measure (the window's last six frames against the
// 60 ms reference) for the same note.
//   node eval/e4-eighth-diag.mjs [midi=64] [pulses=2] [bpm=84]
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { readCoda, frameFeatures } from '../onsets.mjs';
const [midi = 64, pulses = 2, bpm = 84] = process.argv.slice(2).map(Number);
const SY = ['grom', 'crom', 'trom', 'frum', 'drun', 'prum', 'blum', 'clum', 'spum', 'flon', 'plom', 'brom', 'trog', 'brub', 'frod', 'clog', 'crud', 'dram', 'flem', 'brin', 'glen', 'brant', 'clonc', 'plunt', 'grons', 'frup', 'clot', 'drup', 'brus', 'frul', 'clu', 'dro'];
const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20)), hop = Math.round(0.005 * rate);
const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
const mid = eventsToMidi(ev, { bpm, title: 'e diag' });
const r = renderMidi(mid, { rate, stems: true, sing: 'vowels' });
const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
const x = r.stems.choir.channels[0];
SY.forEach((s, j) => {
  const n = notes[j], tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25, vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
  const trace = {}, got = readCoda(x, rate, vAt, tEnd, { trace });
  const a = Math.round((vAt + 0.06) * rate); let ref = 0, k = 0;
  for (let i = Math.round(vAt * rate); i < a; i += hop, k++) ref += frameFeatures(x, i, rate).tot;
  ref /= Math.max(1, k);
  const last = []; for (let i = a; i <= Math.round((tEnd - 0.02) * rate); i += hop) last.push(Math.round(db(frameFeatures(x, i, rate).tot, ref)));
  const t = trace.level || trace.near, lv = t && got.cls === 'nasal' ? `left ${t.left}, end ${t.endLeft}, ${t.ms} ms, level ${t.lv.join(' ')}${t.tilt ? `, tilt ${t.tilt.join(' ')}` : ''}` : '';
  console.log(`${s.padEnd(6)} ${got.cls.padEnd(9)} rule ${String(got.rule).padEnd(6)} ${lv} | frames ${last.length}, last 12: ${last.slice(-12).join(' ')}`);
});
