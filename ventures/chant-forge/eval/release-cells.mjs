// Which tempo, pitch and note-length cells put a sung vowel's release at the nasal level rule's depth in the last
// 30 ms of readCoda's window (2026-11-17, README "A darkness reference over the beating")? Measured on the
// vowel-only render (render.mjs `sing: 'vowels'`) from frame levels alone: readCoda is never run here, so the
// cells a held-out part is built on are picked before any reader has seen them.
//
// A cell is BPM x MIDI pitch x pulses (4 = a quarter, 2 = an eighth). In each, /u/ and /o/ syllables are sung on
// their vowel only, each followed by a bar's rest, as eval/coda-check.mjs's parts are. For each note the reference
// is the 60 ms readCoda takes (from 0.1 s after the beat on a quarter, 0.045 s on an eighth), and the window ends
// 20 ms before tEnd (the note's end + 0.25 s, the rest here). A note "lands" when all of the window's last six 5 ms
// frames sit 5 to 25 dB under that reference, the level band a level-rule nasal has to be in. The cell's score is
// the share of its notes that land.
//   node eval/release-cells.mjs [--out eval/release-cells-report.md]
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { frameFeatures } from '../onsets.mjs';

const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./release-cells-report.md', import.meta.url);
// Vowels only are sung, so the consonants matter only through the onset's timing (the vowel lands after it):
// plain, nasal and cluster openings, /u/ and /o/.
const SY = ['tu', 'mu', 'bru', 'stu', 'to', 'mo', 'gro', 'flo'];
const BPMS = [84, 90, 96, 100, 106, 112, 116, 120, 126], PITCHES = [40, 43, 45, 47, 50, 52, 53, 55, 57, 59, 60, 62, 64];

export function landShare(bpm, midi, pulses) {
  const ev = []; for (const s of SY) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm, title: 'release cells' });
  const r = renderMidi(mid, { rate, stems: true, sing: 'vowels' });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const x = r.stems.choir.channels[0], hop = Math.round(0.005 * rate);
  let land = 0;
  notes.forEach((n) => {
    const vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045), a = Math.round((vAt + 0.06) * rate), tEnd = n.t1 + 0.25;
    let ref = 0, k = 0; for (let i = Math.round(vAt * rate); i < a; i += hop, k++) ref += frameFeatures(x, i, rate).tot;
    ref /= Math.max(1, k);
    const z = Math.round((tEnd - 0.02) * rate), last = [];
    for (let i = a; i <= z; i += hop) last.push(db(frameFeatures(x, i, rate).tot, ref));
    if (last.slice(-6).every((l) => l < -5 && l > -25)) land++;
  });
  return land / notes.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [];
  for (const bpm of BPMS) for (const pulses of [4, 2]) {
    const cells = PITCHES.map((p) => landShare(bpm, p, pulses));
    rows.push(`| ${bpm} | ${pulses === 4 ? 'quarter' : 'eighth'} | ${cells.map((v) => (v ? `**${Math.round(8 * v)}**` : '0')).join(' | ')} |`);
  }
  const names = ['E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'];
  const md = ['# Where a vowel-only release ends in the window\'s last 30 ms', '',
    'Written by `node eval/release-cells.mjs`. Each cell: how many of 8 vowel-only /u/ and /o/ notes (*' + SY.join('*, *') + '*,',
    'sung on their vowel) have all of readCoda\'s last six window frames 5 to 25 dB under the note\'s 60 ms reference, the',
    'level rule\'s band. Frame levels only; readCoda is not run.', '',
    `| BPM | note | ${names.join(' | ')} |`, `|---|---|${names.map(() => '---').join('|')}|`, ...rows, ''];
  writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
}
