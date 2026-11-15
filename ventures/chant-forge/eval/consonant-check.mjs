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
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinOnset, latinCoda, onsetLength } from '../sing.mjs';
import { readOnset, expectedRead } from '../onsets.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./consonant-check-report.md', import.meta.url);
const rate = 44100, corpus = new URL('../corpus/', import.meta.url);
const lines = [];
const pct = (a, b) => `${a} of ${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;
const label = (e) => e.cls === 'stop' ? `${e.voiced ? 'voiced' : 'voiceless'} ${e.place} stop` : e.cls === 'affricate' ? `${e.voiced ? 'voiced' : 'voiceless'} affricate` : e.cls === 'fricative' ? `fricative ${e.place}` : e.cls;
const match = (want, got) => Object.entries(want).every(([k, v]) => got[k] === v);
const mannerOk = (want, got) => want.cls === got.cls;

function choir(midiBytes, sing) {
  const r = renderMidi(midiBytes, { rate, stems: true, sing });
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
  return readOnset(x, rate, from, n.t0 + spill + 0.06, { window: 1 });
};

lines.push('# Does the singing choir sing the consonants?', '', 'Written by `node eval/consonant-check.mjs`. Each syllable\'s first note is read from the rendered choir stem by',
  '`onsets.mjs`: a closure then a burst (a stop; voiced when a voice bar sounds under the closure; place from the burst',
  'spectrum after Stevens and Blumstein 1978), a closure then 50 ms of noise (an affricate), noise above 2.5 kHz (a',
  'fricative, /s/ or /ʃ/ by centroid, weak and flat for /f/, voiced when the low band carries on under it), a low',
  'murmur (a nasal), one brief contact (a tap). /l/, /j/, /w/ and a bare vowel should read as none.', '');

// ---- A ----
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

// ---- B ----
const PIECES = ['dies-irae', 'pange-lingua', 'veni-creator', 'te-deum', 'salve-regina'];
const CLS = ['stop', 'affricate', 'fricative', 'nasal', 'tap', 'none'];
const byClass = new Map(), conf = new Map();
let bAll = [0, 0], bManner = 0, ctl = [0, 0], bare = [0, 0], ctlExact = 0;
const ctlConf = new Map();
const bRows = [];
for (const p of PIECES) {
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
    if (ok) right++;
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
lines.push('## B. The corpus pieces (held out: final D3, fitted to 4/4 at 124 BPM)', '',
  'The first note of every syllable that opens on a consonant, 0.2 s or more, after another note. The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.', '',
  '| piece | syllables | singing: read exactly as written | vowel-only control: read as none |', '|---|---|---|---|', ...bRows,
  `| all | ${bAll[1]} | ${pct(...bAll)} | ${pct(...ctl)} |`, '',
  `By class alone: ${pct(bManner, bAll[1])}. The vowel-only control "reads" the written consonant exactly on ${pct(ctlExact, bAll[1])} of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: ${CLS.map((c) => `${c} ${ctlConf.get(c) || 0}`).join(', ')}. Syllables that open on their vowel (after another note): ${pct(...bare)} read as no consonant.`, '',
  'By written consonant:', '', '| written | read exactly |', '|---|---|',
  ...[...byClass].sort((a, b) => b[1][1] - a[1][1]).map(([k, [r, n]]) => `| ${k} | ${pct(r, n)} |`), '',
  'Class written (rows) against class read (columns):', '', `| written | ${CLS.join(' | ')} |`, '|---|' + CLS.map(() => '---').join('|') + '|',
  ...CLS.filter((c) => conf.has(c)).map((c) => `| ${c} | ${CLS.map((d) => conf.get(c).get(d) || 0).join(' | ')} |`), '');

// ---- C ----
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
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
