// Does the singing choir (render.mjs `sing: true`, sing.mjs) sing the consonant that opens each
// syllable? Read back from the rendered choir stem by onsets.mjs (closure, burst, frication,
// murmur and tap cues), never from the synthesiser's settings.
//   node eval/consonant-check.mjs [--out eval/consonant-check-report.md]
// A. Vowel-consonant-vowel pairs through the whole MIDI path: "a" then a syllable (35 of them:
//    every consonant class, before a, e, i, o, u, and clusters), at six pitches E2-E4, 120 BPM
//    quarter notes. Control: the same MIDI sung with `sing: 'vowels'` (the vowel-only choir).
//    The reader's thresholds were set on this set, so A is its training score.
// B. The five corpus pieces at final D3, 124 BPM: the first note of every syllable of 0.2 s or more,
//    read against latinOnset()'s first phone. Not used to set anything; the held-out score.
// C. Every syllable in the corpus: how often each opening consonant occurs.
// Fourth coda round (2026-11-15): readCoda's murmur-tilt rule (a murmur's energy above 1 kHz a median
//    28 dB or more under its band under 500 Hz; eval/coda-check.mjs header) applied unchanged to
//    readOnset's nasal, pre-registered before the first run: A's l and j openings read as a nasal less
//    often, A's and B's nasal openings no fewer, totals and the vowel-only control no lower. If B's
//    nasals fall, the rule stays off for openings.
//    Result (one run): A 183 to 174 of 210, B 743 to 728 of 934, B's nasals 96 to 64 of 149 (the vowel-only
//    control's false nasals 123 to 23). B's nasals fell, so it stays off (readOnset `murmurTilt: 0`).
// Openings on the coda murmur (2026-11-15, README "Openings on the coda murmur"). Pre-registered here and
//    committed before the first run with the change. The change: (a) sing.mjs sings an opening nasal with
//    the coda's murmur (gain per note, NASAL_DB 7 under the vowel it goes to; antiformant; broad low
//    resonance) instead of ONSET_NASAL_GAIN's fixed gain; measured with one voice and no vibrato, outside
//    this script and before any read, the old murmur sat 6.2 to 16.5 dB under its vowel (m and n, five
//    vowels, E2-E4) and the new one 7.6 to 7.8 dB, its energy above 1 kHz 42-51 dB under its band under
//    500 Hz. (b) readOnset's nasal rule: the level bar moves from 7 dB under the vowel to 5 (the coda
//    reader's; the old bar sat on the new murmur's own level), and the murmur-tilt rule (MURMUR_TILT,
//    28 dB) is turned on, as the fourth coda round's registration allowed once the opening murmur changed.
//    Both numbers come from those measurements, not from any part below.
//    New part G: the 60 Graduale pieces of corpus/gregobase-1908, whose openings no run had scored, fixed
//    and scored on main with its misses hidden: 1833 of 2349 (78.0%), nasals 278 of 404, the vowel-only
//    control's false nasals 287 of 2349. Predictions: (1) G's total no lower than 1833; (2) G's nasals
//    read exactly on 278 or more; (3) G's control false nasals 144 or fewer (half); (4) B's total no lower
//    than 742 of 934, its nasals 96 or more of 149, its control false nasals 62 or fewer (half of 123);
//    (5) A no lower than 183 of 210, its control 210 of 210; (6) eval/coda-check.mjs: every part's total
//    within 2 of before; (7) eval/vowel-check.mjs: within 2 notes of before.
//    Result, first registration (one run each): (1) G 1825 of 2349: fails; (2) G's nasals 212 of 404: fails;
//    (3) G's control false nasals 71: holds; (4) B 720 of 934, nasals 60: fail; its control false nasals 38:
//    holds; (5) A 172 of 210: fails, control 210: holds; (6) coda check every line identical: holds; (7) vowel
//    check identical: holds. Ablation, the new murmur with the old reader (--reader-first): A 179, B 724
//    (nasals 78), G 1790 (nasals 235). Read on A only (the tuning set): every A nasal miss is the murmur-tilt
//    rule. The nasal run found by the level rule runs on into the vowel's quiet attack (lvl under -5 dB,
//    tilt -27 to -8 dB), so its median tilt sat near -22 although its middle reaches -46.
//    Second registration, written and committed before its first run: as above, but the tilt is taken over
//    the run's darkest stretch of three frames (`tiltSpan: 3`, the median of each three-frame stretch, the
//    lowest of them). Chosen on A alone: there it reads 188 of 210 (span 5: 185; a trimmed median, two or
//    three frames off each end: 173), with no A syllable read as a nasal that is not one. Same predictions
//    (1)-(5); (6) and (7) carry over unchanged, as readCoda and the synthesis are untouched by it. G is
//    printed for the third time, its misses still hidden.
//    Result, second registration (one run): (1) G 1869 of 2349 (79.6%): holds; (2) G's nasals 278 of 404:
//    holds (no gain); (3) G's control false nasals 135: holds; (4) B 753 of 934: holds, but its nasals 95 of
//    149 (one short) and its control false nasals 73 (not 62 or fewer): fail; (5) A 188 of 210, control 210:
//    holds; (6), (7): hold. Kept, with (4)'s two lines failed: README "Openings on the coda murmur".
// Nasal openings: the mouth closes, and a murmur read by its darkness (2026-11-15, README "Nasal openings:
//    the mouth closes"). Pre-registered here and committed before any run of part G with the change.
//    Found by reading B's 54 nasal misses (B is now a development set, like A): on 0.24 s notes the previous
//    vowel's 50 ms cross-fade covered the first 50 ms of the 70 ms murmur, and where the murmur showed, its
//    level against the vowel after it sat 5 dB over to 17 dB under (the five voices beat), while its tilt
//    stayed 10-25 dB darker than both neighbours. The change: (a) render.mjs cuts the cross-fade before a
//    nasal opening to 15 ms, as before a stop (`nasalCut`; --no-nasal-cut keeps 50 ms); (b) readOnset's
//    nasal rule reads a frame as murmur when its tilt is DARK_BY (10) dB darker than both the vowel after it
//    and the frame before the window, its level from 25 dB under the vowel to 6 over, its low band within
//    15 dB (--reader-level keeps the level rule). Chosen on A and B only (darkBy 6 or 10, darkLvl 0 or 6,
//    with and without the frame before): B 780 of 934, its nasals 123 of 149, its control's false nasals 6;
//    A 195 of 210. (a) alone: B 761, nasals 106; A 192. (b) without the frame before (darker than the vowel
//    after only): control false nasals 93-187, so it is part of the rule.
//    Predictions, against main (G as last printed: 1869 of 2349, nasals 278 of 404, control false nasals
//    135): (1) G's total 1869 or more; (2) G's nasals read exactly 320 or more of 404; (3) G's control false
//    nasals 30 or fewer; (4) A 188 or more of 210, its control 210 of 210; (5) eval/coda-check.mjs: every
//    part's total within 2 of main; (6) eval/vowel-check.mjs: within 2 notes of main. G's misses stay hidden.
//    Result (one run each): (1) G 1959 of 2349 (83.4%): holds; (2) G's nasals 347 of 404: holds; (3) G's
//    control false nasals 44 (from 135): fails; (4) A 195 of 210, control 210: holds; (5) coda check: every
//    part's total identical (one line moves: syllables closing on their vowel 210 to 211 of 220): holds;
//    (6) vowel check: corpus notes 865 of 920 both, before the coda 696 to 698 of 715: holds. Kept, with (3)
//    failed: README "Nasal openings: the mouth closes". G printed for the fourth time, misses still hidden.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinOnset, latinCoda, onsetLength } from '../sing.mjs';
import { readOnset, expectedRead } from '../onsets.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./consonant-check-report.md', import.meta.url);
// --parts ABGC (default all): which parts to run; --hide-misses G: print a part's score without its misses
const PARTS = args.includes('--parts') ? args[args.indexOf('--parts') + 1] : 'ABGC';
const HIDE = args.includes('--hide-misses') ? args[args.indexOf('--hide-misses') + 1] : '';
// --reader-first: the opening reader before the "openings on the coda murmur" round (an ablation)
// --reader-level: the opening reader before the "darker than both sides" round (its level rule; an ablation)
const READER = args.includes('--reader-first') ? { murmurTilt: 0, nasalBar: 7, darkBy: 0 } : args.includes('--reader-level') ? { darkBy: 0 } : args.includes('--tilt-span') ? { tiltSpan: +args[args.indexOf('--tilt-span') + 1] } : {};
const rate = 44100, corpus = new URL('../corpus/', import.meta.url);
const lines = [];
const pct = (a, b) => `${a} of ${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;
const label = (e) => e.cls === 'stop' ? `${e.voiced ? 'voiced' : 'voiceless'} ${e.place} stop` : e.cls === 'affricate' ? `${e.voiced ? 'voiced' : 'voiceless'} affricate` : e.cls === 'fricative' ? `fricative ${e.place}` : e.cls;
const match = (want, got) => Object.entries(want).every(([k, v]) => got[k] === v);
const mannerOk = (want, got) => want.cls === got.cls;

function choir(midiBytes, sing) {
  // --wall off: voiced closures' bars without the low-pass through the walls (before 2026-11-16's fourteenth coda round)
  const r = renderMidi(midiBytes, { rate, stems: true, sing, nasalCut: !args.includes('--no-nasal-cut'), voiceBarWall: !(args.includes('--wall') && args[args.indexOf('--wall') + 1] === 'off') });
  const m = parseMidi(midiBytes), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  return { x: r.stems.choir.channels[0], notes };
}
// The window: from 150 ms before the beat (the consonant is sung ahead of it, as choirs do) to the
// vowel, taken 60 ms after the beat plus whatever of the consonant spills past it; where that
// lands is the one thing taken from the renderer (onsetLength), never what it sang.
// Since final consonants are sung (2026-11-15, eval/coda-check.md) the syllable before may close on
// one just before this onset; then the window starts where this syllable's own consonant does, by the
// renderer's lead rule (its full length, at most half the previous note and any gap), not 150 ms early.
const readAt = (x, n, on, prevT0 = -1, prev = null) => {
  let from = Math.max(n.t0 - 0.15, prevT0 >= 0 ? (prevT0 + n.t0) / 2 : 0); const dur = n.t1 - n.t0;
  if (prev && prev.syl !== n.syl && latinCoda(prev.lyric).length) from = Math.max(from, n.t0 - (on.length ? Math.min(onsetLength(on), 0.5 * (prev.t1 - prev.t0) + Math.max(0, n.t0 - prev.t1)) : 0));
  const spill = on.length ? Math.max(0, Math.min(onsetLength(on), 0.15 + 0.3 * dur) - 0.15) : 0;
  return readOnset(x, rate, from, n.t0 + spill + 0.06, { window: 1, ...READER });
};

lines.push('# Does the singing choir sing the consonants?', '', 'Written by `node eval/consonant-check.mjs`. Each syllable\'s first note is read from the rendered choir stem by',
  '`onsets.mjs`: a closure then a burst (a stop; voiced when a voice bar sounds under the closure; place from the burst',
  'spectrum after Stevens and Blumstein 1978), a closure then 50 ms of noise (an affricate), noise above 2.5 kHz (a',
  'fricative, /s/ or /ʃ/ by centroid, weak and flat for /f/, voiced when the low band carries on under it), a low',
  'murmur (a nasal), one brief contact (a tap). /l/, /j/, /w/ and a bare vowel should read as none.', '');

// ---- A ----
if (PARTS.includes('A')) {
const SY = ['pa', 'ba', 'ta', 'da', 'ka', 'ga', 'ki', 'ci', 'ge', 'sa', 'sce', 'fa', 'va', 'za', 'ma', 'na', 'gna', 'la', 'ra', 'ia', 'qua', 'a', 'i', 'u', 'tri', 'spi', 'stu', 'mo', 'nu', 'lo', 're', 'pe', 'to', 'bi', 'du'];
const PITCHES = [['E2', 40], ['A2', 45], ['D3', 50], ['G3', 55], ['C4', 60], ['E4', 64]];
const aRows = [], aScore = { true: [0, 0, 0], vowels: [0, 0, 0] }, misses = [];
for (const [name, midi] of PITCHES) {
  const ev = [];
  for (const s of SY) ev.push({ type: 'note', midi, pulses: 4, syllable: 'a' }, { type: 'note', midi, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120, title: 'vcv' });
  const row = { true: 0, vowels: 0, fp: 0 };
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const on = latinOnset(s), want = expectedRead(on[0]);
      const got = readAt(x, notes[2 * j + 1], sing === true ? on : [], notes[2 * j].t0);
      const sc = aScore[sing];
      sc[1]++;
      if (sing === true) { if (match(want, got)) { sc[0]++; row.true++; } else misses.push(`${name} *${s}* (${label(want)}) read as ${label(got)}`); if (mannerOk(want, got)) sc[2]++; }
      else { if (got.cls === 'none') { sc[0]++; row.vowels++; } else row.fp++; }
    });
  }
  aRows.push(`| ${name} | ${pct(row.true, SY.length)} | ${pct(row.vowels, SY.length)} |`);
}
lines.push('## A. Vowel-consonant-vowel pairs (the set the reader was tuned on)', '', `*a* then each of: ${SY.map((s) => `*${s}*`).join(', ')}; quarter notes at 120 BPM.`, '',
  '| pitch | singing: read exactly as written | vowel-only control: read as no consonant |', '|---|---|---|', ...aRows, '',
  `All pitches: ${pct(aScore.true[0], aScore.true[1])} read exactly (class, voicing, place); ${pct(aScore.true[2], aScore.true[1])} by class alone. `
  + `The vowel-only choir on the same syllables reads as no consonant ${pct(aScore.vowels[0], aScore.vowels[1])}: how often the reader finds a consonant where none is sung.`, '', 'Misses:', '', ...misses.map((m) => `- ${m}`), '');

}

// ---- B and G ----
const CLS = ['stop', 'affricate', 'fricative', 'nasal', 'tap', 'none'];
// Score the first note of each syllable over a list of corpus files (paths under corpus/, no .gabc).
// hide: print the score without the misses (a held-out set scored before a round's change).
function scoreOpenings(list, hide = false) {
const byClass = new Map(), conf = new Map(), miss = [];
let bAll = [0, 0], bManner = 0, ctl = [0, 0], bare = [0, 0], ctlExact = 0;
const ctlConf = new Map();
const bRows = [];
for (const p of list) {
  const src = parseGabc(readFileSync(new URL(`${p}.gabc`, corpus), 'utf8'));
  const mid = eventsToMidi(fitToBars(transposeToFinal(src.events, 50), 8), { bpm: 124, title: p });
  const sungR = choir(mid, true), ctlR = choir(mid, 'vowels');
  const seen = new Set();
  let right = 0, all = 0, cRight = 0, cAll = 0;
  sungR.notes.forEach((n, k) => {
    if (!n.syl || seen.has(n.syl)) return;
    seen.add(n.syl);
    if (n.t1 - n.t0 < 0.2 || k === 0) return; // the opening note has no note before it
    const on = latinOnset(n.lyric), want = expectedRead(on[0]);
    const got = readAt(sungR.x, n, on, sungR.notes[k - 1].t0, sungR.notes[k - 1]), gotC = readAt(ctlR.x, ctlR.notes[k], [], ctlR.notes[k - 1].t0);
    if (!on.length) { bare[1]++; if (got.cls === 'none') bare[0]++; return; }
    all++; cAll++;
    const ok = match(want, got);
    if (ok) right++; else miss.push(`${p} *${n.lyric}* (${label(want)}) read as ${label(got)}`);
    if (mannerOk(want, got)) bManner++;
    if (gotC.cls === 'none') cRight++;
    if (match(want, gotC)) ctlExact++;
    ctlConf.set(gotC.cls, (ctlConf.get(gotC.cls) || 0) + 1);
    const key = label(want), c = byClass.get(key) || [0, 0];
    c[1]++; if (ok) c[0]++; byClass.set(key, c);
    const cm = conf.get(want.cls) || new Map(); cm.set(got.cls, (cm.get(got.cls) || 0) + 1); conf.set(want.cls, cm);
  });
  bAll = [bAll[0] + right, bAll[1] + all]; ctl = [ctl[0] + cRight, ctl[1] + cAll];
  bRows.push(`| ${p} | ${all} | ${pct(right, all)} | ${pct(cRight, cAll)} |`);
}
return [
  '| piece | syllables | singing: read exactly as written | vowel-only control: read as none |', '|---|---|---|---|', ...bRows,
  `| all | ${bAll[1]} | ${pct(...bAll)} | ${pct(...ctl)} |`, '',
  `By class alone: ${pct(bManner, bAll[1])}. The vowel-only control "reads" the written consonant exactly on ${pct(ctlExact, bAll[1])} of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: ${CLS.map((c) => `${c} ${ctlConf.get(c) || 0}`).join(', ')}. Syllables that open on their vowel (after another note): ${pct(...bare)} read as no consonant.`, '',
  'By written consonant:', '', '| written | read exactly |', '|---|---|',
  ...[...byClass].sort((a, b) => b[1][1] - a[1][1]).map(([k, [r, n]]) => `| ${k} | ${pct(r, n)} |`), '',
  'Class written (rows) against class read (columns):', '', `| written | ${CLS.join(' | ')} |`, '|---|' + CLS.map(() => '---').join('|') + '|',
  ...CLS.filter((c) => conf.has(c)).map((c) => `| ${c} | ${CLS.map((d) => conf.get(c).get(d) || 0).join(' | ')} |`), '',
  ...(hide ? [`Misses: ${miss.length}, not printed (held out).`, ''] : [])];
}
const PIECES = ['dies-irae', 'pange-lingua', 'veni-creator', 'te-deum', 'salve-regina'];
if (PARTS.includes('B')) lines.push('## B. The corpus pieces (held out: final D3, fitted to 4/4 at 124 BPM)', '',
  'The first note of every syllable that opens on a consonant, 0.2 s or more, after another note. The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.', '',
  ...scoreOpenings(PIECES, HIDE.includes('B')));
// G (2026-11-15, openings on the coda murmur): the 60 Graduale pieces of corpus/gregobase-1908, whose openings
// no run had scored (the coda check reads only their final consonants). Fixed and scored with its misses
// hidden (--hide-misses G) on main before the round's change, then once after it.
const GRAD = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort().map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('G')) lines.push('## G. Held out: the 60 Graduale pieces of corpus/gregobase-1908', '',
  'Same settings and rules as B. Their openings had never been scored; fixed before the "openings on the coda murmur" round (README) and scored on main with the misses hidden, then once after the change.', '',
  ...scoreOpenings(GRAD, HIDE.includes('G')));

// ---- C ----
if (PARTS.includes('C')) {
const files = [];
for (const d of ['', ...readdirSync(corpus, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${e.name}/`)])
  for (const f of readdirSync(new URL(d, corpus))) if (f.endsWith('.gabc')) files.push(`${d}${f}`);
const count = new Map(); let syl = 0, opens = 0, clusters = 0;
for (const f of files) for (const e of parseGabc(readFileSync(new URL(f, corpus), 'utf8')).events) {
  if (e.type !== 'note' || !e.syllable) continue;
  syl++;
  const on = latinOnset(e.syllable);
  if (on.length) { opens++; if (on.length > 1) clusters++; count.set(on[0], (count.get(on[0]) || 0) + 1); }
}
lines.push('## C. Opening consonants in the corpus', '', `${files.length} GABC files, ${syl} sung syllables; ${pct(opens, syl)} open on a consonant, ${clusters} on a cluster. First phone: ${[...count].sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} ${c}`).join(', ')}.`, '');
}
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
