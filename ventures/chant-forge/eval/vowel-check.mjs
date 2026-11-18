// Does the singing choir (render.mjs `sing: true`, sing.mjs) sing the vowel written under each
// note? Measured from the rendered audio with an LPC formant estimator (formants.mjs), never
// from the synthesiser's own settings.
//   node eval/vowel-check.mjs [--out eval/vowel-check-report.md]
// A. The estimator on signals it did not make: harmonics weighted by the exact magnitude of a
//    five-pole cascade at the target formants (computed analytically, not by sing.mjs's filters).
// B. Held vowels through the whole MIDI path: a note on "la", "le", "li", "lo", "lu" at six
//    pitches across the men's range, choir stem only; the pad (sing off) as the control.
// C. The five corpus pieces at final D3, every choir note of 0.2 s or more, the vowel measured
//    against the vowel latinVowel() reads from its syllable; pad as the control.
// E. The misreads of C: one cached short G3 /i/, re-made with 20 other seeds and with one voice.
// D. Every syllable in every corpus GABC file: how many have no vowel latinVowel() can read.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { FORMANTS, latinVowel, latinOnset, latinCoda, codaPlan, onsetLength, SING_DEFAULTS, singNote } from '../sing.mjs';
import { estimateFormants, nearestVowel } from '../formants.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./vowel-check-report.md', import.meta.url);
const rate = 44100, V = Object.keys(FORMANTS);
const corpus = new URL('../corpus/', import.meta.url);
const lines = [];
const pct = (a, b) => `${a} of ${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;
const relErr = (got, want) => Math.abs(got - want) / want;

// ---- A ----
function cascadeMag(f, F) {
  const poles = [...F, 3350, 3750], bw = [80, 100, 140, 250, 300];
  let g = 1;
  for (let k = 0; k < 5; k++) {
    const r = Math.exp((-Math.PI * bw[k]) / rate), th = (2 * Math.PI * poles[k]) / rate, w = (2 * Math.PI * f) / rate;
    // |1 - 2r cos(th) + r^2| / |1 - 2r cos(th) e^{-jw} + r^2 e^{-2jw}|: unity gain at 0 Hz
    const num = 1 - 2 * r * Math.cos(th) + r * r;
    const re = 1 - 2 * r * Math.cos(th) * Math.cos(w) + r * r * Math.cos(2 * w);
    const im = 2 * r * Math.cos(th) * Math.sin(w) - r * r * Math.sin(2 * w);
    g *= num / Math.hypot(re, im);
  }
  return g;
}
function analytic(f0, F, dur = 1) {
  const n = Math.round(dur * rate), x = new Float64Array(n);
  for (let h = 1; h * f0 < 5000; h++) {
    const g = cascadeMag(h * f0, F) / h, w = (2 * Math.PI * h * f0) / rate;
    for (let i = 0; i < n; i++) x[i] += g * Math.sin(w * i + 0.7 * h);
  }
  return x;
}
const PITCHES = [['E2', 40], ['A2', 45], ['D3', 50], ['G3', 55], ['C4', 60], ['E4', 64]];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
lines.push('# Does the singing choir sing the written vowels?', '', 'Written by `node eval/vowel-check.mjs`. Formants are measured from the rendered audio by',
  'linear prediction (`formants.mjs`: decimate to 11 kHz, order 12, median of the frames), and the vowel is',
  'the nearest of the five targets in log F1 and log F2. Targets: Peterson and Barney (1952), men, Table II',
  '(/ɑ/ 730/1090/2440, /ɛ/ 530/1840/2480, /i/ 270/2290/3010, /ɔ/ 570/840/2410, /u/ 300/870/2240 Hz).', '');
lines.push('## A. The estimator on signals it did not make', '', 'Harmonics of a -6 dB/octave source weighted by the analytic magnitude of the target cascade.', '',
  '| pitch | ' + V.map((v) => `/${v}/ F1, F2 (vowel read)`).join(' | ') + ' |', '|---|' + V.map(() => '---').join('|') + '|');
let aRight = 0, aAll = 0;
for (const [name, m] of PITCHES) {
  const row = [];
  for (const v of V) {
    const e = estimateFormants(analytic(hz(m), FORMANTS[v]), rate, { from: 0.1 });
    const got = nearestVowel(e, FORMANTS); aAll++; if (got === v) aRight++;
    row.push(`${Math.round(e[0])}, ${Math.round(e[1])} (${got})`);
  }
  lines.push(`| ${name} | ${row.join(' | ')} |`);
}
lines.push('', `Vowel read right: ${pct(aRight, aAll)}.`, '');

// ---- B ----
function heldMidi(midi) {
  const ev = [];
  for (const v of V) ev.push({ type: 'note', midi, pulses: 8, syllable: `l${v}` }, { type: 'bar', kind: 'full', pulses: 4 });
  return eventsToMidi(ev, { bpm: 120, title: 'vowels' });
}
function choirNotes(midiBytes, sing) {
  const r = renderMidi(midiBytes, { rate, stems: true, sing });
  const m = parseMidi(midiBytes);
  const sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const stem = r.stems.choir.channels[0];
  return { stem, notes: m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0) };
}
lines.push('## B. Held vowels through the MIDI path (2 s notes on la, le, li, lo, lu)', '');
const bTable = { true: [], false: [] }, bScore = { true: [0, 0], false: [0, 0] }, errs = [[], [], []];
for (const sing of [true, false]) {
  for (const [name, m] of PITCHES) {
    const { stem, notes } = choirNotes(heldMidi(m), sing);
    const row = [];
    notes.forEach((n, k) => {
      const want = V[k];
      const e = estimateFormants(stem, rate, { from: n.t0 + 0.4, to: n.t1 - 0.05 });
      const got = nearestVowel(e, FORMANTS); bScore[sing][1]++; if (got === want) bScore[sing][0]++;
      if (sing && m <= 60) e.forEach((x, j) => errs[j].push(relErr(x, FORMANTS[want][j])));
      row.push(`${Math.round(e[0])}, ${Math.round(e[1])} (${got})`);
    });
    bTable[sing].push(`| ${name} | ${row.join(' | ')} |`);
  }
}
const head = '| pitch | ' + V.map((v) => `/${v}/ F1, F2 (read)`).join(' | ') + ' |';
const sep = '|---|' + V.map(() => '---').join('|') + '|';
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const max = (a) => Math.max(...a);
lines.push('Singing (`sing: true`):', '', head, sep, ...bTable.true, '',
  `Vowel read right: ${pct(...bScore.true)}. E2 to C4 (25 notes): F1 off by ${(100 * mean(errs[0])).toFixed(1)}% on average (worst ${(100 * max(errs[0])).toFixed(1)}%), F2 ${(100 * mean(errs[1])).toFixed(1)}% (worst ${(100 * max(errs[1])).toFixed(1)}%), F3 ${(100 * mean(errs[2])).toFixed(1)}% (worst ${(100 * max(errs[2])).toFixed(1)}%).`, '',
  'The pad (`sing` off, the control):', '', head, sep, ...bTable.false, '', `Vowel read right: ${pct(...bScore.false)}.`, '');

// ---- C ----
const PIECES = ['dies-irae', 'pange-lingua', 'veni-creator', 'te-deum', 'salve-regina'];
lines.push('## C. The corpus pieces (final D3, fitted to 4/4 at 124 BPM, every choir note of 0.2 s or more)', '',
  'The window is the note from 60 ms in to 10 ms before its end (a diphthong\'s last note: up to where the glide starts), so the previous note\'s 50 ms legato crossfade has ended. On a syllable\'s first note the window starts later by the part of its consonant sung after the beat plus the 45 ms formant transition (the consonant goes before the beat where the previous note has room; `eval/consonant-check-report.md`), and it ends where the next syllable\'s consonant starts (up to half the note before the next beat). Notes left with under 0.1 s are skipped.', '',
  '| piece | notes measured | singing: vowel read right | pad (control): read right | pad reads everything as |', '|---|---|---|---|---|');
const confusion = Object.fromEntries(V.map((v) => [v, Object.fromEntries(V.map((w) => [w, 0]))]));
let cAll = [0, 0], pAll = [0, 0]; const newWin = [0, 0];
for (const p of PIECES) {
  const src = parseGabc(readFileSync(new URL(`${p}.gabc`, corpus), 'utf8'));
  const midiBytes = eventsToMidi(fitToBars(transposeToFinal(src.events, 50), 8), { bpm: 124, title: p });
  const res = {};
  for (const sing of [true, false]) {
    const { stem, notes } = choirNotes(midiBytes, sing);
    const last = new Map(), first = new Map();
    for (const n of notes) if (n.syl) { last.set(n.syl, n); if (!first.has(n.syl)) first.set(n.syl, n); }
    let right = 0, all = 0; const reads = {};
    for (const n of notes) {
      const want = latinVowel(n.lyric);
      if (!want || n.t1 - n.t0 < 0.2) continue;
      const glides = want.glide && last.get(n.syl) === n;
      // and it ends where the next syllable's consonant starts, up to half this note before its beat
      const nx = notes[notes.indexOf(n) + 1], nxOn = sing && nx && first.get(nx.syl) === nx ? latinOnset(nx.lyric) : [];
      const cut = nxOn.length ? Math.max(0, Math.min(onsetLength(nxOn), 0.5 * (n.t1 - n.t0) + Math.max(0, nx.t0 - n.t1)) - Math.max(0, nx.t0 - n.t1)) : 0;
      const toOld = glides ? n.t0 + SING_DEFAULTS.glideFrom * (n.t1 - n.t0) : n.t1 - cut - 0.01;
      // and on a syllable's last note it ends where the final consonant's formant transition starts
      // (codaPlan: the coda ends where the note's sound does); the first round's window ran over it
      const cd = sing && last.get(n.syl) === n ? latinCoda(n.lyric) : [];
      // (the renderer plans the coda on the note less what the next consonant cuts from it)
      const cp = cd.length ? codaPlan(cd, n.t1 - n.t0 - cut, n.t1 - cut) : null;
      const to = cp ? Math.min(toOld, cp.codaAt - 0.045 * cp.scale - 0.01) : toOld;
      // a syllable's consonant is sung mostly before the beat; what of it does not fit there spills
      // past the beat (render.mjs), so the window starts after the spill and its formant transition
      const on = sing && first.get(n.syl) === n ? latinOnset(n.lyric) : [];
      const spill = on.length ? Math.max(0, Math.min(onsetLength(on), 0.15 + 0.3 * (n.t1 - n.t0)) - 0.15) + 0.045 : 0;
      if (toOld - (n.t0 + 0.06 + spill) < 0.1) continue;
      const e = estimateFormants(stem, rate, { from: n.t0 + 0.06 + spill, to: toOld, frames: 3, frameMs: 30 });
      const got = nearestVowel(e, FORMANTS);
      all++; if (got === want.vowel) right++;
      if (sing && to - (n.t0 + 0.06 + spill) >= 0.1) { const en = to === toOld ? e : estimateFormants(stem, rate, { from: n.t0 + 0.06 + spill, to, frames: 3, frameMs: 30 }); newWin[1]++; if (nearestVowel(en, FORMANTS) === want.vowel) newWin[0]++; }
      reads[got] = (reads[got] || 0) + 1;
      if (sing) confusion[want.vowel][got]++;
    }
    res[sing] = { right, all, reads };
  }
  cAll = [cAll[0] + res.true.right, cAll[1] + res.true.all]; pAll = [pAll[0] + res.false.right, pAll[1] + res.false.all];
  const top = Object.entries(res.false.reads).sort((a, b) => b[1] - a[1]).map(([v, c]) => `/${v}/ ${c}`).join(', ');
  lines.push(`| ${p} | ${res.true.all} | ${pct(res.true.right, res.true.all)} | ${pct(res.false.right, res.false.all)} | ${top} |`);
}
lines.push(`| all | ${cAll[1]} | ${pct(...cAll)} | ${pct(...pAll)} | |`, '',
  `This window runs on into a syllable's final consonant, which since the second round of codas (per-phone floors, up to half a short note; README "Final consonants, second round") takes more of a short note: with the first round's codas it read 895 of 920. Ending the window where the final consonant's formant transition starts (\`codaPlan\`), on the ${newWin[1]} notes left with 0.1 s or more: ${pct(...newWin)}.`, '', 'Singing, written vowel (rows) against vowel read (columns):', '',
  '| written | ' + V.map((v) => `/${v}/`).join(' | ') + ' |', '|---|' + V.map(() => '---').join('|') + '|',
  ...V.map((v) => `| /${v}/ | ${V.map((w) => confusion[v][w]).join(' | ')} |`), '');

// ---- E ----
// The corpus renders each (pitch, length, vowel) once and reuses it, so a misread can be one
// waveform counted many times. Re-make the short G3 /i/ the corpus uses with 20 other seeds
// (the seed sets each voice's vibrato rate, phase and onset), and with one voice.
const g3 = hz(55), g3dur = 0.242;
const readI = (o) => { const w = singNote(g3, g3dur, rate, { vowel: 'i', release: 0.05, ...o }); const e = estimateFormants(w, rate, { from: 0.06, to: g3dur - 0.01, frames: 3, frameMs: 30 }); return { e, ok: nearestVowel(e, FORMANTS) === 'i' }; };
const corpusSeed = readI({ seed: 55 * 7919 + Math.round(g3dur * 1000) });
const seeds = Array.from({ length: 20 }, (_, k) => readI({ seed: k + 1 }));
const solo = Array.from({ length: 20 }, (_, k) => readI({ seed: k + 1, detunes: [0] }));
const f1s = (rs) => rs.map((r) => Math.round(r.e[0]));
lines.push('## E. The short /i/ on G3 (0.24 s, the corpus\'s eighth note at 124 BPM)', '',
  `The waveform the corpus renders for it: F1 ${Math.round(corpusSeed.e[0])}, F2 ${Math.round(corpusSeed.e[1])}, read as /${nearestVowel(corpusSeed.e, FORMANTS)}/. `
  + `The same note with 20 other seeds (each voice's vibrato rate, phase and onset): ${seeds.filter((r) => r.ok).length} of 20 read /i/, F1 ${Math.min(...f1s(seeds))} to ${Math.max(...f1s(seeds))} Hz. `
  + `One voice instead of five, same 20 seeds: ${solo.filter((r) => r.ok).length} of 20, F1 ${Math.min(...f1s(solo))} to ${Math.max(...f1s(solo))} Hz. `
  + 'So the F1 reading of a short note moves with the beating of the five detuned voices near the first harmonics (196 and 392 Hz around a 270 Hz F1), and the cache repeats one unlucky draw.', '');

// ---- D ----
const files = [];
for (const d of ['', ...readdirSync(corpus, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${e.name}/`)])
  for (const f of readdirSync(new URL(d, corpus))) if (f.endsWith('.gabc')) files.push(`${d}${f}`);
let syl = 0; const none = new Map(), counts = Object.fromEntries(V.map((v) => [v, 0])); let glides = 0;
for (const f of files) {
  for (const e of parseGabc(readFileSync(new URL(f, corpus), 'utf8')).events) {
    if (e.type !== 'note' || !e.syllable) continue;
    syl++;
    const r = latinVowel(e.syllable);
    if (!r) none.set(e.syllable, (none.get(e.syllable) || 0) + 1);
    else { counts[r.vowel]++; if (r.glide) glides++; }
  }
}
const noneN = [...none.values()].reduce((a, b) => a + b, 0);
lines.push('## D. Every sung syllable in the corpus', '', `${files.length} GABC files, ${syl} syllables with a note. Vowel read: ${pct(syl - noneN, syl)}; ${V.map((v) => `/${v}/ ${counts[v]}`).join(', ')}; ${glides} diphthongs. No vowel (sung on the pad's /a/): ${[...none].sort((a, b) => b[1] - a[1]).map(([s, c]) => `\`${s}\` ${c}`).join(', ') || 'none'}.`, '');
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
