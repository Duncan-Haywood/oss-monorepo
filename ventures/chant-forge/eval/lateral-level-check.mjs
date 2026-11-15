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

const pw = (w, a, z) => rms(w, a, z) ** 2;
const sg = codaPlan(['l'], dur, dur, SING_DEFAULTS.codaShare).segs[0], q = (sg.t1 - sg.t0) / 4, la = sg.t0 + q, lz = sg.t1 - q;
function measure(extra, seeds) {
  const rows = [];
  for (const [name, f] of PITCHES) for (const v of VOWELS) {
    let L = 0, V = 0, tilt = 0;
    for (const seed of seeds) {
      const w = singNote(f, dur, rate, { vowel: v, coda: ['l'], seed, ...extra });
      L += pw(w, la, lz); V += pw(w, 0.15, 0.3);
      if (seed === seeds[0]) tilt = 10 * Math.log10(band(w, la, lz, 0, 500) / band(w, la, lz, 1000, 5000));
    }
    rows.push({ name, v, lvl: 10 * Math.log10(L / V), tilt });
  }
  return rows;
}
const fmt = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)} dB`;
function table(rows, withTilt) {
  return [
    '| pitch | ' + VOWELS.map((v) => `${v}l level`).join(' | ') + (withTilt ? ' | ' + VOWELS.map((v) => `${v}l tilt`).join(' | ') : '') + ' |',
    '|---|' + VOWELS.map(() => '---').join('|') + (withTilt ? '|' + VOWELS.map(() => '---').join('|') : '') + '|',
    ...PITCHES.map(([name]) => {
      const r = rows.filter((x) => x.name === name);
      return `| ${name} | ` + r.map((x) => fmt(x.lvl)).join(' | ') + (withTilt ? ' | ' + r.map((x) => `${x.tilt.toFixed(1)} dB`).join(' | ') : '') + ' |';
    }),
  ];
}
const sum = (rows) => { const lv = rows.map((r) => r.lvl); return `range ${fmt(Math.min(...lv))} to ${fmt(Math.max(...lv))}, mean ${fmt(lv.reduce((a, b) => a + b, 0) / lv.length)}; within 1 to 7 dB under the vowel: ${rows.filter((r) => r.lvl <= -1 && r.lvl >= -7).length} of ${rows.length}`; };
const SEEDS = Array.from({ length: 12 }, (_, k) => k + 1);
const one = measure({}, [3]), oneOld = measure({ lateralLevel: false }, [3]);
const many = measure({}, SEEDS), manyOld = measure({ lateralLevel: false }, SEEDS);
const sameTilt = one.filter((r, k) => Math.abs(r.tilt - oneOld[k].tilt) <= 0.5).length;
const out = [
  '# The sung final /l/ against its vowel',
  '',
  'Written by `node eval/lateral-level-check.mjs`. A held syllable (vowel + l, 0.6 s) per vowel and pitch, sung by',
  '`sing.mjs` `singNote`. Level: power of the middle half of the /l/ (codaPlan\'s span) against power of the vowel at',
  '0.15-0.30 s. Tilt: the /l/\'s band under 500 Hz over its energy above 1 kHz (readCoda reads a coda murmur as a',
  `nasal only at ${MURMUR_TILT} dB or more). "Fixed gain" is \`lateralLevel: false\`, PHONES.l.av = 1.4, as on main before this round.`,
  '',
  '## As registered: one seed (3)',
  '',
  '### Fixed gain (before)',
  '',
  ...table(oneOld, true),
  '',
  `Level ${sum(oneOld)}.`,
  '',
  '### Per-note gain, LATERAL_DB = 4 (after)',
  '',
  ...table(one, true),
  '',
  `Level ${sum(one)}.`,
  '',
  `Prediction (1), every /l/ 1 to 7 dB under its vowel: ${one.filter((r) => r.lvl <= -1 && r.lvl >= -7).length} of ${one.length}${one.every((r) => r.lvl <= -1 && r.lvl >= -7) ? ': holds' : ': fails'}.`,
  `Prediction (2), tilt unchanged to 0.5 dB: ${sameTilt} of ${one.length}${sameTilt === one.length ? ': holds' : ': fails'}.`,
  '',
  '## Not registered: twelve seeds (1-12), power summed',
  '',
  'The /l/\'s middle half is 25 ms; over it the five detuned voices beat, so one seed\'s level moves by about 5 dB',
  'either way from note to note. Summed over twelve seeds that variation averages out and the gain\'s own error shows.',
  '',
  '### Fixed gain (before)',
  '',
  ...table(manyOld, false),
  '',
  `Level ${sum(manyOld)}.`,
  '',
  '### Per-note gain (after)',
  '',
  ...table(many, false),
  '',
  `Level ${sum(many)}.`,
  '',
];
const text = out.join('\n');
if (outFile) writeFileSync(outFile, text); else process.stdout.write(text);
