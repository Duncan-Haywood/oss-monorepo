// Diagnostic (2026-11-17, README "Cluster onsets before -um: a murmur no reference can find"): on part c of
// eval/coda-check.mjs, how much darker than its own vowel does each sung nasal after /u/ or /o/ get, and does
// that split the reader's hits from its misses (brum, glum, stum, flum, prun: 21 of 144 read as nothing)?
// For each note: the vowel's tilt (dB above 1 kHz against under 500 Hz) as the median of its frames from the
// reader's reference (0.1 s after the beat on a quarter, 0.045 s on an eighth) to 0.15 s before the note's end,
// its lowest and highest 40 ms median tilt in that stretch, and the darkest 40 ms median tilt from 0.15 s
// before the note's end to 0.1 s after it (the coda). readCoda's answer is the default reader's (lipShut on).
//   node eval/cluster-um-diag.mjs [--out eval/cluster-um-report.md]
import { writeFileSync } from 'node:fs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinCoda } from '../sing.mjs';
import { readCoda, expectedRead, frameFeatures } from '../onsets.mjs';
import { PARTS } from './vstop-parts.mjs';

const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
const args = process.argv.slice(2), out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const P = PARTS.c, DK = ['nun', 'brum', 'glum', 'stum', 'flum', 'prun', 'non', 'mom', 'bom', 'pon', 'vom', 'lom'];
const CLUSTER = new Set(['brum', 'glum', 'stum', 'flum', 'prun']);
const rows = [];
for (const pulses of [4, 2]) for (const midi of P.pitches) {
  const ev = []; for (const s of P.all) ev.push({ type: 'note', midi, pulses, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: P.bpm, title: 'cluster -um diag' });
  const r = renderMidi(mid, { rate, stems: true, sing: true });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  const x = r.stems.choir.channels[0];
  const tilts = (a, b) => { const v = []; for (let t = a; t < b; t += 0.005) { const f = frameFeatures(x, Math.round(t * rate), rate); v.push(db(f.hi1, f.low)); } return v; };
  const win40 = (v) => v.slice(0, Math.max(1, v.length - 7)).map((_, k) => med(v.slice(k, k + 8)));
  P.all.forEach((s, j) => {
    if (!DK.includes(s)) return;
    const n = notes[j], vAt = n.t0 + (pulses === 4 ? 0.1 : 0.045);
    const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25;
    const got = readCoda(x, rate, vAt, tEnd, { lipShut: true }), want = expectedRead(latinCoda(s)[0]);
    const ok = Object.entries(want).every(([k, v]) => got[k] === v);
    const vt = tilts(vAt, n.t1 - 0.15), vw = win40(vt), cw = win40(tilts(n.t1 - 0.15, n.t1 + 0.1));
    rows.push({ s, midi, pulses, ok, rule: got.rule || got.cls, vowel: med(vt), lo: Math.min(...vw), hi: Math.max(...vw), coda: Math.min(...cw), ref: med(vt.slice(0, 12)) });
  });
}
const summ = (g) => {
  if (!g.length) return '0 | - | - | -';
  const d = g.map((q) => q.coda - q.vowel).sort((a, b) => a - b), dl = g.map((q) => q.coda - q.lo).sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return `${g.length} | ${q(d, 0.1).toFixed(0)} / ${q(d, 0.5).toFixed(0)} / ${q(d, 0.9).toFixed(0)} | ${q(dl, 0.1).toFixed(0)} / ${q(dl, 0.5).toFixed(0)} / ${q(dl, 0.9).toFixed(0)} | ${g.filter((r) => r.coda - r.vowel <= -15).length}`;
};
const groups = [['cluster onset, read', (r) => CLUSTER.has(r.s) && r.ok], ['cluster onset, missed', (r) => CLUSTER.has(r.s) && !r.ok], ['single onset, read', (r) => !CLUSTER.has(r.s) && r.ok], ['single onset, missed', (r) => !CLUSTER.has(r.s) && !r.ok]];
const md = ['# Part c: how much darker than its vowel each nasal after /u/ or /o/ gets', '',
  'Written by `node eval/cluster-um-diag.mjs`. Tilt is dB above 1 kHz against under 500 Hz; "coda - vowel" is the darkest',
  '40 ms of the coda against the median tilt of the vowel (from the reader\'s reference to 0.15 s before the note\'s end);',
  '"coda - darkest vowel" is against the darkest 40 ms of that vowel. 10th / 50th / 90th percentiles. The plain level',
  'rule asks for 15 dB darker than the reference.', '',
  '| group | notes | coda - vowel (dB) | coda - darkest vowel (dB) | 15 dB or more under the vowel |', '|---|---|---|---|---|',
  ...groups.map(([t, f]) => `| ${t} | ${summ(rows.filter(f))} |`), '',
  '## Every missed note', '', '| syllable | pitch | note | vowel tilt | vowel 40 ms range | coda darkest | first 60 ms |', '|---|---|---|---|---|---|---|',
  ...rows.filter((r) => !r.ok).map((r) => `| ${r.s} | ${r.midi} | ${r.pulses === 4 ? 'quarter' : 'eighth'} | ${r.vowel.toFixed(0)} | ${r.lo.toFixed(0)} to ${r.hi.toFixed(0)} | ${r.coda.toFixed(0)} | ${r.ref.toFixed(0)} |`), ''];
if (out) writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
