// How loud is a sung opening /l/ against the vowel it goes to? Measured from the synthesised wave
// (sing.mjs singNote), never from the synthesiser's settings: a held syllable l + vowel, 0.6 s, E2 to E4,
// before each of the five vowels. The vowel's level is the RMS of 0.30-0.45 s (after the formant
// transition); the /l/'s the RMS of the middle half of its span (onsetPlan's t0..t1). Also printed: the
// /l/'s own tilt (energy under 500 Hz against energy above 1 kHz, readCoda's MURMUR_TILT cue), so a level
// change is seen not to move the /l/ toward a nasal's darkness.
//   node eval/onset-lateral-check.mjs [--out eval/onset-lateral-check.md]
//
// Pre-registered 2026-11-15, written and committed before the first run with the change. The change
// (sing.mjs): an opening /l/'s voicing gain is set per note by lateralGain, as a coda /l/'s has been since
// the sixth coda round, so its steady part sits LATERAL_DB = 4 dB under the vowel it goes to (an
// assumption, not fitted to singers: README "Final consonants, sixth round"). `onsetLateral: 'first'`
// keeps PHONES.l's fixed 1.4. Measured on main before any change (one voice, no vibrato; outside this
// script, the same windows), the fixed gain put the opening /l/ 7.7 dB under to 4.8 dB over its vowel,
// a 12.5 dB spread by vowel and pitch: loudest before /e/, /i/ and /u/ at G3 and E4, quietest at C4.
// The /l/'s first 30 ms sit under the voices' swell (rawSing: a 30 ms attack when a consonant leads,
// voices starting up to 20 ms apart), which the steady-state sum does not see, so the measured level is
// expected to sit some dB under the 4 dB target. Predictions, all fixed now:
//  (1) one voice, no vibrato: the 30 cells' spread (highest minus lowest) 4 dB or less (main: 12.5), and
//      every cell under its vowel (main: 11 of 30 at or over it);
//  (2) five voices, power summed over twelve seeds: spread 6 dB or less (main: 14.0), every cell under
//      its vowel;
//  (3) the /l/'s own tilt within 0.5 dB of main in every cell (a level change only);
//  (4) eval/consonant-check.mjs: A, B and G totals each within 2 of main, and the written-none row
//      ("none": l, j, w) in B and G each within 2 of main (the change must not make an /l/ read as a
//      nasal); the vowel-only controls identical (no consonant is sung there);
//  (5) eval/coda-check.mjs every part's total within 2 of main; eval/vowel-check.mjs within 2 notes.
// If (4) fails, the change stays off for openings (the reader's thresholds were set on the fixed gain).
// Result (one run, 2026-11-15): (1) one voice -6.4 to -5.7 dB, spread 0.7, none over: holds; (2) five
// voices -6.6 to -4.2 dB, spread 2.4, none over: holds; (3) tilt unchanged (0.00 dB): holds; (4) the
// consonant-check report is byte-identical to main's (A 195 of 210, B 780 of 934, G 1959 of 2349; none
// rows 56 of 61 and 249 of 258): holds; (5) coda-check and vowel-check reports byte-identical: hold. The
// measured level sits about 2 dB under the 4 dB target: the voices' 30 ms swell, as expected above.
import { writeFileSync } from 'node:fs';
import { singNote, onsetPlan, SING_DEFAULTS } from '../sing.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const rate = 44100, dur = 0.6;
const PITCHES = [['E2', 82.41], ['A2', 110], ['D3', 146.83], ['G3', 196], ['C4', 261.63], ['E4', 329.63]];
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

const pw = (w, a, z) => { let s = 0; const i0 = Math.round(a * rate), i1 = Math.round(z * rate); for (let i = i0; i < i1; i++) s += w[i] * w[i]; return s / Math.max(1, i1 - i0); };
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

const sg = onsetPlan(['l'], dur, SING_DEFAULTS.onsetShare).segs[0], q = (sg.t1 - sg.t0) / 4, la = sg.t0 + q, lz = sg.t1 - q;
const ONE = { detunes: [0], vibratoCents: 0 };
function measure(extra, seeds) {
  const rows = [];
  for (const [name, f] of PITCHES) for (const v of VOWELS) {
    let L = 0, V = 0, tilt = 0;
    for (const seed of seeds) {
      const w = singNote(f, dur, rate, { vowel: v, onset: ['l'], seed, ...extra });
      L += pw(w, la, lz); V += pw(w, 0.3, 0.45);
      // a longer window for the tilt (the whole /l/): 12 ms gives a coarse spectrum, but the same one before and after
      if (seed === seeds[0]) tilt = 10 * Math.log10(band(w, sg.t0, sg.t1, 0, 500) / band(w, sg.t0, sg.t1, 1000, 5000));
    }
    rows.push({ name, v, lvl: 10 * Math.log10(L / V), tilt });
  }
  return rows;
}
const fmt = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(1)} dB`;
const table = (rows) => [
  '| pitch | ' + VOWELS.map((v) => `l${v} level`).join(' | ') + ' | ' + VOWELS.map((v) => `l${v} tilt`).join(' | ') + ' |',
  '|---|' + VOWELS.map(() => '---').join('|') + '|' + VOWELS.map(() => '---').join('|') + '|',
  ...PITCHES.map(([name]) => {
    const r = rows.filter((x) => x.name === name);
    return `| ${name} | ` + r.map((x) => fmt(x.lvl)).join(' | ') + ' | ' + r.map((x) => `${x.tilt.toFixed(1)} dB`).join(' | ') + ' |';
  }),
];
const sum = (rows) => {
  const lv = rows.map((r) => r.lvl), hi = Math.max(...lv), lo = Math.min(...lv);
  return { hi, lo, spread: hi - lo, mean: lv.reduce((a, b) => a + b, 0) / lv.length, over: rows.filter((r) => r.lvl >= 0).length, text: `${fmt(lo)} to ${fmt(hi)} (spread ${(hi - lo).toFixed(1)} dB), mean ${fmt(lv.reduce((a, b) => a + b, 0) / lv.length)}; at or over the vowel: ${rows.filter((r) => r.lvl >= 0).length} of ${rows.length}` };
};
const SEEDS = Array.from({ length: 12 }, (_, k) => k + 1);
const sets = {
  oneNew: measure(ONE, [3]), oneOld: measure({ ...ONE, onsetLateral: 'first' }, [3]),
  manyNew: measure({}, SEEDS), manyOld: measure({ onsetLateral: 'first' }, SEEDS),
};
const S = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, sum(v)]));
const tiltMax = Math.max(...sets.oneNew.map((r, i) => Math.abs(r.tilt - sets.oneOld[i].tilt)), ...sets.manyNew.map((r, i) => Math.abs(r.tilt - sets.manyOld[i].tilt)));
const verdict = (ok) => (ok ? 'holds' : '**fails**');
const lines = [
  '# Opening /l/ against the vowel it goes to', '',
  'Written by `node eval/onset-lateral-check.mjs`. A held syllable *l* + vowel, 0.6 s; the /l/ is the RMS of the middle half of',
  `its span (${(la * 1000).toFixed(1)}-${(lz * 1000).toFixed(1)} ms), the vowel the RMS of 0.30-0.45 s. Tilt: the whole /l/'s energy under 500 Hz against`,
  'its energy above 1 kHz (a nasal murmur sits 28 dB or more; `MURMUR_TILT`).', '',
  '## Predictions (pre-registered in the script header)', '',
  '| prediction | main (fixed gain) | per-note gain | |', '|---|---|---|---|',
  `| (1) one voice: spread 4 dB or less, every cell under its vowel | ${S.oneOld.text} | ${S.oneNew.text} | ${verdict(S.oneNew.spread <= 4 && S.oneNew.over === 0)} |`,
  `| (2) five voices, 12 seeds: spread 6 dB or less, every cell under | ${S.manyOld.text} | ${S.manyNew.text} | ${verdict(S.manyNew.spread <= 6 && S.manyNew.over === 0)} |`,
  `| (3) tilt within 0.5 dB of main in every cell | | largest change ${tiltMax.toFixed(2)} dB | ${verdict(tiltMax <= 0.5)} |`, '',
  '(4) and (5) are read from eval/consonant-check-report.md, eval/coda-check-report.md and eval/vowel-check-report.md (README).', '',
  '## One voice, no vibrato: per-note gain', '', ...table(sets.oneNew), '',
  '## One voice, no vibrato: fixed gain (main, `onsetLateral: \'first\'`)', '', ...table(sets.oneOld), '',
  '## Five voices, power over 12 seeds: per-note gain', '', ...table(sets.manyNew), '',
  '## Five voices, power over 12 seeds: fixed gain', '', ...table(sets.manyOld), '',
];
if (outFile) writeFileSync(outFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
