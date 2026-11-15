// How loud is the sung final /l/ against the vowel it leaves? Measured from the synthesised wave
// (sing.mjs singNote), never from the synthesiser's settings: a held syllable vowel + l, 0.6 s, E2 to E4,
// after each of the five vowels. The vowel's level is the RMS of 0.15-0.30 s; the /l/'s the RMS of the
// middle half of its span (codaPlan's t0..t1), where the formant transition is over. Also printed: the
// /l/'s own tilt (energy above 1 kHz against its band under 500 Hz, readCoda's MURMUR_TILT cue), so a
// lower /l/ is seen not to drift toward a nasal's darkness.
//   node eval/lateral-level-check.mjs [--out eval/lateral-level-check.md]
//
// Pre-registered 2026-11-15, before the first run with the change (sixth round of final consonants):
// the coda /l/'s voicing gain is set per note (lateralGain in sing.mjs) so that its steady part sits
// LATERAL_DB = 4 dB under its vowel, worked out from the harmonics' power through the vowel's resonators
// against the /l/'s, as nasalGain does for the murmur. 4 dB is an assumption, not fitted to recordings of
// singers: a liquid is quieter than a vowel and louder than a nasal (the sonority order; the nasal is set
// 7 dB under), and nobody has listened. Before the change the /l/ sat -1 to +8 dB against the vowel
// (README "Final consonants, fourth round"). Predictions, all fixed now:
//  (1) here, every /l/ (5 vowels x 6 pitches) sits 1 to 7 dB under its vowel (the target 4 +/- 3 dB:
//      vibrato, detuning and the 5-voice beating are outside the steady-state sum);
//  (2) the /l/'s own tilt unchanged in every cell, to 0.5 dB (a level change only). Reworded after the
//      baseline run on main and before any run with the change: as first written ("at least 3 dB brighter
//      than MURMUR_TILT") it already failed on main, at A2, where the /l/'s tilt is 26.7 dB after every
//      vowel (eval/lateral-level-check.md, "Before");
//  (3) eval/coda-check.mjs: A, B, D, E, F and H totals no lower than on main; A's *al* and *el* still
//      read as none on 11 or more of 12; F's /l/ read as a nasal on 10% or fewer; vowel-only controls
//      unchanged;
//  (4) eval/consonant-check.mjs openings unchanged (the opening /l/ keeps its gain, as openings kept the
//      first murmur: the opening reader's thresholds were set on it).
import { writeFileSync } from 'node:fs';
import { singNote, codaPlan, SING_DEFAULTS } from '../sing.mjs';
import { MURMUR_TILT } from '../onsets.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const rate = 44100, dur = 0.6;
const PITCHES = [['E2', 82.41], ['A2', 110], ['D3', 146.83], ['G3', 196], ['C4', 261.63], ['E4', 329.63]];
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

const rms = (w, a, z) => { let s = 0; const i0 = Math.round(a * rate), i1 = Math.round(z * rate); for (let i = i0; i < i1; i++) s += w[i] * w[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
// energy in [lo, hi) Hz of w[a..z] by a plain DFT over a Hann window (short spans: cheap enough)
function band(w, a, z, lo, hi) {
  const i0 = Math.round(a * rate), n = Math.round(z * rate) - i0;
  let e = 0;
  for (let f = Math.max(1, Math.round((lo * n) / rate)); f < Math.round((hi * n) / rate); f++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)), x = w[i0 + i] * h, ph = (2 * Math.PI * f * i) / n; re += x * Math.cos(ph); im -= x * Math.sin(ph); }
    e += re * re + im * im;
  }
  return e;
}
const dB = (x) => 20 * Math.log10(x);

const rows = [];
for (const [name, f] of PITCHES) {
  for (const v of VOWELS) {
    const w = singNote(f, dur, rate, { vowel: v, coda: ['l'], seed: 3 });
    const sg = codaPlan(['l'], dur, dur, SING_DEFAULTS.codaShare).segs[0];
    const q = (sg.t1 - sg.t0) / 4, la = sg.t0 + q, lz = sg.t1 - q;
    const lvl = dB(rms(w, la, lz) / rms(w, 0.15, 0.3));
    const tilt = 10 * Math.log10(band(w, la, lz, 0, 500) / band(w, la, lz, 1000, 5000));
    rows.push({ name, v, lvl, tilt });
  }
}
const lv = rows.map((r) => r.lvl), tl = rows.map((r) => r.tilt);
const p1 = rows.filter((r) => r.lvl <= -1 && r.lvl >= -7).length, p2 = rows.filter((r) => r.tilt <= MURMUR_TILT - 3).length; // p2: how many stay 3 dB clear of the nasal rule
const out = [
  '# The sung final /l/ against its vowel',
  '',
  'Written by `node eval/lateral-level-check.mjs`. A held syllable (vowel + l, 0.6 s, seed 3) per vowel and pitch;',
  'level: RMS of the middle half of the /l/ against RMS of the vowel at 0.15-0.30 s. Tilt: the /l/\'s band under',
  `500 Hz over its energy above 1 kHz (readCoda reads a coda murmur as a nasal only at ${MURMUR_TILT} dB or more).`,
  '',
  '| pitch | ' + VOWELS.map((v) => `${v}l level`).join(' | ') + ' | ' + VOWELS.map((v) => `${v}l tilt`).join(' | ') + ' |',
  '|---|' + VOWELS.map(() => '---').join('|') + '|' + VOWELS.map(() => '---').join('|') + '|',
  ...PITCHES.map(([name]) => {
    const r = rows.filter((x) => x.name === name);
    return `| ${name} | ` + r.map((x) => `${x.lvl >= 0 ? '+' : ''}${x.lvl.toFixed(1)} dB`).join(' | ') + ' | ' + r.map((x) => `${x.tilt.toFixed(1)} dB`).join(' | ') + ' |';
  }),
  '',
  `Level range ${Math.min(...lv).toFixed(1)} to ${Math.max(...lv).toFixed(1)} dB (mean ${(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1)}); tilt ${Math.min(...tl).toFixed(1)} to ${Math.max(...tl).toFixed(1)} dB.`,
  '',
  `Prediction (1), every /l/ 1 to 7 dB under its vowel: ${p1} of ${rows.length}. Tilt at least 3 dB under ${MURMUR_TILT}: ${p2} of ${rows.length} (prediction (2) compares the tilt column with the run on main).`,
  '',
];
const text = out.join('\n');
if (outFile) writeFileSync(outFile, text); else process.stdout.write(text);
