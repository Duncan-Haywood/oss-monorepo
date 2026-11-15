// Formant tuning on high notes (sing.mjs `f1Tune`): does raising F1 to at least 1.1 x f0 keep the
// high /i/ and /u/ from losing level, without costing the vowel reader? Measured from the audio.
//   node eval/f1-tune-check.mjs [--out eval/f1-tune-check-report.md]
// Pre-registered (2026-11-15, before any number below was seen; README "Formant tuning on high notes"):
//   ratio 1.1; held 2 s notes on la le li lo lu at E2 A2 D3 G3 C4 E4 G4 A4 through the singNote path,
//   five seeds each. Line 1: at G4 and A4 the level of /i/ and /u/ against /a/ at the same pitch rises
//   by 2 dB or more on average. Line 2: vowels read right on the held notes, E2 to A4, no fewer than
//   with tuning off. Line 3 (in vowel-check.mjs and coda-check.mjs, run separately): corpus vowels and
//   codas at final D3 within 0.5 points of off. Ships as the default only if all three hold.
import { writeFileSync } from 'node:fs';
import { FORMANTS, singNote } from '../sing.mjs';
import { estimateFormants, nearestVowel } from '../formants.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./f1-tune-check-report.md', import.meta.url);
const rate = 44100, V = Object.keys(FORMANTS), RATIO = 1.1, SEEDS = [11, 23, 37, 41, 59];
const PITCHES = [['E2', 40], ['A2', 45], ['D3', 50], ['G3', 55], ['C4', 60], ['E4', 64], ['G4', 67], ['A4', 69]];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const db = (x) => 20 * Math.log10(x);
function rms(w, a, b) { let s = 0; const i0 = Math.round(a * rate), i1 = Math.round(b * rate); for (let i = i0; i < i1; i++) s += w[i] * w[i]; return Math.sqrt(s / (i1 - i0)); }

function measure(ratio) {
  const level = {}, read = {}, f1 = {};
  for (const [name, m] of PITCHES) {
    level[name] = {}; read[name] = {}; f1[name] = {};
    for (const v of V) {
      let L = 0, right = 0, F = 0;
      for (const seed of SEEDS) {
        const w = singNote(hz(m), 2, rate, { vowel: v, seed, f1Tune: ratio });
        L += db(rms(w, 0.4, 1.95)) / SEEDS.length;
        const e = estimateFormants(w, rate, { from: 0.4, to: 1.95 });
        F += e[0] / SEEDS.length;
        if (nearestVowel(e, FORMANTS) === v) right++;
      }
      level[name][v] = L; read[name][v] = right; f1[name][v] = F;
    }
  }
  return { level, read, f1 };
}
const off = measure(0), on = measure(RATIO);
const L = [];
const pct = (a, b) => `${a} of ${b} (${((100 * a) / b).toFixed(1)}%)`;
L.push('# Formant tuning on high notes', '', 'Written by `node eval/f1-tune-check.mjs`. Held 2 s notes from `singNote` (one choir voice-group,',
  `five detuned voices), seeds ${SEEDS.join(', ')}; level is the RMS from 0.4 to 1.95 s, F1 the LPC estimate`,
  '(`formants.mjs`) over the same span, the vowel the nearest of the five targets. Tuning on: F1 raised to at',
  `least ${RATIO} x f0 (\`f1Tune: ${RATIO}\`); off: the Peterson and Barney targets at every pitch.`, '',
  'Pre-registered before the first run (the header of `eval/f1-tune-check.mjs`): line 1, at G4 and A4 the',
  'level of /i/ and /u/ against /a/ rises by 2 dB or more on average; line 2, vowels read right E2 to A4 no',
  'fewer than with tuning off. Line 3 (corpus vowels and codas at final D3) is in the vowel and coda reports.', '');
L.push('## Level against /a/ at the same pitch (dB), off -> on', '', '| pitch | f0 (Hz) | ' + V.filter((v) => v !== 'a').map((v) => `/${v}/`).join(' | ') + ' |', '|---|---|' + V.slice(1).map(() => '---').join('|') + '|');
for (const [name, m] of PITCHES) {
  L.push(`| ${name} | ${hz(m).toFixed(0)} | ` + V.filter((v) => v !== 'a').map((v) => `${(off.level[name][v] - off.level[name].a).toFixed(1)} -> ${(on.level[name][v] - on.level[name].a).toFixed(1)}`).join(' | ') + ' |');
}
const gain = [];
for (const p of ['G4', 'A4']) for (const v of ['i', 'u']) gain.push((on.level[p][v] - on.level[p].a) - (off.level[p][v] - off.level[p].a));
const g = gain.reduce((a, b) => a + b, 0) / gain.length;
L.push('', `Line 1: /i/ and /u/ at G4 and A4 against /a/ change by ${gain.map((x) => x.toFixed(1)).join(', ')} dB, mean ${g.toFixed(2)} dB (bar: 2 dB or more): **${g >= 2 ? 'holds' : 'fails'}**.`, '');
L.push('## Vowel read right (of 5 seeds) and measured F1 (Hz), off -> on', '', '| pitch | ' + V.map((v) => `/${v}/`).join(' | ') + ' |', '|---|' + V.map(() => '---').join('|') + '|');
let rOff = 0, rOn = 0, n = 0;
for (const [name] of PITCHES) {
  L.push(`| ${name} | ` + V.map((v) => { rOff += off.read[name][v]; rOn += on.read[name][v]; n += SEEDS.length; return `${off.read[name][v]} -> ${on.read[name][v]} (F1 ${Math.round(off.f1[name][v])} -> ${Math.round(on.f1[name][v])})`; }).join(' | ') + ' |');
}
L.push('', `Line 2: read right E2 to A4, off ${pct(rOff, n)}, on ${pct(rOn, n)}: **${rOn >= rOff ? 'holds' : 'fails'}**.`, '');
writeFileSync(outFile, L.join('\n') + '\n');
console.log(L.join('\n'));
