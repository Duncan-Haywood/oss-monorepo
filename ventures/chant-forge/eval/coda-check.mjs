// Does the singing choir (render.mjs `sing: true`, sing.mjs) sing the consonants that close each
// syllable? Read back from the rendered choir stem by onsets.mjs readCoda (closure and burst,
// frication, murmur and tap cues, run from the vowel forwards), never from the synthesiser's settings.
//   node eval/coda-check.mjs [--out eval/coda-check-report.md]
// A. Vowel-consonant syllables through the whole MIDI path, each followed by a rest: 30 of them
//    (every coda class, five vowels, clusters, and five bare vowels), at six pitches E2-E4, 120 BPM
//    quarter notes. Control: the vowel-only choir (`sing: 'vowels'`). readCoda's thresholds were set
//    on these syllables, so A is its training score.
// B. The five corpus pieces at final D3, 124 BPM: the last note of every syllable of 0.2 s or more,
//    read against latinCoda()'s first phone. No threshold was set on it, but it is not clean held-out
//    data: its first run's misses (60.5%) showed the reader's window cut off bursts at the next sound
//    and that /m/ after /u/ was barely a murmur, and both were fixed before the run reported here.
// C. Every syllable in the corpus: how often each closing consonant occurs.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from '../gabc.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from '../render.mjs';
import { latinOnset, latinCoda, onsetLength } from '../sing.mjs';
import { readCoda, expectedRead } from '../onsets.mjs';

const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : new URL('./coda-check-report.md', import.meta.url);
// --parts ABDEFGC (default all): which parts to run; --hide-misses F: print a part's score without its misses
// (how a held-out set is scored before a round's changes without anyone reading what it gets wrong)
const PARTS = args.includes('--parts') ? args[args.indexOf('--parts') + 1] : 'ABDEFGC';
const HIDE = args.includes('--hide-misses') ? args[args.indexOf('--hide-misses') + 1] : '';
const rate = 44100, corpus = new URL('../corpus/', import.meta.url);
const lines = [];
const pct = (a, b) => `${a} of ${b} (${b ? ((100 * a) / b).toFixed(1) : '-'}%)`;
const label = (e) => e.cls === 'stop' ? `${e.voiced ? 'voiced' : 'voiceless'} ${e.place} stop` : e.cls === 'affricate' ? `${e.voiced ? 'voiced' : 'voiceless'} affricate` : e.cls === 'fricative' ? `fricative ${e.place}` : e.cls;
const match = (want, got) => Object.entries(want).every(([k, v]) => got[k] === v);

function choir(midiBytes, sing) {
  const r = renderMidi(midiBytes, { rate, stems: true, sing });
  const m = parseMidi(midiBytes), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch !== 9 && m.programs.get(n.ch)?.[0]?.[1] === 52).map((n) => ({ ...n, t0: sec(n.tick), t1: sec(n.end) })).sort((a, b) => a.t0 - b.t0);
  return { x: r.stems.choir.channels[0], notes };
}
// Where the next sound starts: the next note's beat less the part of its opening consonant sung
// before it (render.mjs's lead rule: up to half this note, the consonant's full length at most).
// That and the window's start are the only things taken from the renderer's timing.
const nextSound = (notes, k, firstOf) => {
  const n = notes[k], nx = notes[k + 1];
  if (!nx) return n.t1 + 0.25;
  const on = firstOf.has(nx) ? latinOnset(nx.lyric) : [];
  const lead = on.length ? Math.min(onsetLength(on), 0.5 * (n.t1 - n.t0) + Math.max(0, nx.t0 - n.t1)) : 0;
  return Math.min(n.t1 + 0.25, nx.t0 - lead);
};
// The vowel's reference: 45 ms after whatever of the syllable's opening consonant spills past the beat
const vowelStart = (n, on) => n.t0 + (on.length ? Math.max(0, Math.min(onsetLength(on), 0.15 + 0.3 * (n.t1 - n.t0)) - 0.15) : 0) + 0.045;

lines.push('# Does the singing choir sing the final consonants?', '', 'Written by `node eval/coda-check.mjs`. The last note of each syllable is read from the rendered choir stem by',
  '`onsets.mjs` `readCoda`, from 60 ms of steady vowel on: a closure and then one short burst (a stop; voiced when a voice',
  'bar sounds under the closure; place from the burst), noise above 2.5 kHz (a fricative), a deep murmur of 55 ms or more',
  'before an obstruent or 30 ms otherwise (a nasal), a brief dip with voice after it (a tap). /l/ and a bare vowel should',
  'read as none. A cluster is scored on its first phone (*nunc* on its /n/).', '');

// ---- A ----
if (PARTS.includes('A')) {
const SY = ['as', 'es', 'is', 'os', 'us', 'at', 'et', 'ad', 'ab', 'ac', 'ap', 'am', 'an', 'em', 'um', 'al', 'el', 'ar', 'er', 'ax', 'ex', 'unt', 'ant', 'ost', 'unc', 'a', 'e', 'i', 'o', 'u'];
const PITCHES = [['E2', 40], ['A2', 45], ['D3', 50], ['G3', 55], ['C4', 60], ['E4', 64]];
const ctlMiss = [], aRows = [], aScore = { true: [0, 0, 0], vowels: [0, 0] }, misses = [];
for (const [name, midi] of PITCHES) {
  const ev = [];
  for (const s of SY) ev.push({ type: 'note', midi, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120, title: 'vc' });
  const row = { true: 0, vowels: 0 };
  for (const sing of [true, 'vowels']) {
    const { x, notes } = choir(mid, sing);
    SY.forEach((s, j) => {
      const n = notes[j], cd = latinCoda(s), want = expectedRead(cd[0]);
      const tEnd = notes[j + 1] ? Math.min(n.t1 + 0.25, notes[j + 1].t0) : n.t1 + 0.25;
      const got = readCoda(x, rate, n.t0 + 0.1, tEnd);
      const sc = aScore[sing];
      sc[1]++;
      if (sing === true) { if (match(want, got)) { sc[0]++; row.true++; } else misses.push(`${name} *${s}* (${label(want)}) read as ${label(got)}`); if (want.cls === got.cls) sc[2]++; }
      else if (got.cls === 'none') { sc[0]++; row.vowels++; } else ctlMiss.push(`${name} *${s}* read as ${label(got)}`);
    });
  }
  aRows.push(`| ${name} | ${pct(row.true, SY.length)} | ${pct(row.vowels, SY.length)} |`);
}
lines.push('## A. Syllables before a rest (the set the reader was tuned on)', '', `${SY.map((s) => `*${s}*`).join(', ')}; quarter notes at 120 BPM, each followed by a quarter rest.`, '',
  '| pitch | singing: read exactly as written | vowel-only control: read as no consonant |', '|---|---|---|', ...aRows, '',
  `All pitches: ${pct(aScore.true[0], aScore.true[1])} read exactly (class, voicing, place); ${pct(aScore.true[2], aScore.true[1])} by class alone. `
  + `The vowel-only choir on the same syllables reads as no consonant ${pct(aScore.vowels[0], aScore.vowels[1])}.`, '', 'Misses:', '', ...misses.map((m) => `- ${m}`), '', 'Vowel-only control, read as a consonant:', '', ...ctlMiss.map((m) => `- ${m}`), '');
}

// ---- B and D ----
// Score the last note of each syllable over a list of corpus files (paths under corpus/, no .gabc).
function scorePieces(list, hide = false) {
  const byClass = new Map(), conf = new Map(), miss = [], rows = [];
  const t = { all: [0, 0], manner: 0, ctl: [0, 0], bare: [0, 0], bareCtl: [0, 0], skipped: 0, beforeCons: [0, 0], beforeVow: [0, 0] };
  for (const p of list) {
    const src = parseGabc(readFileSync(new URL(`${p}.gabc`, corpus), 'utf8'));
    const mid = eventsToMidi(fitToBars(transposeToFinal(src.events, 50), 8), { bpm: 124, title: p });
    const sungR = choir(mid, true), ctlR = choir(mid, 'vowels');
    const firstOf = new Set(), lastOf = new Map();
    for (const n of sungR.notes) if (n.syl) { if (![...firstOf].some((f) => f.syl === n.syl)) firstOf.add(n); lastOf.set(n.syl, n); }
    let right = 0, all = 0, cRight = 0;
    sungR.notes.forEach((n, k) => {
      if (!n.syl || lastOf.get(n.syl) !== n || n.t1 - n.t0 < 0.2) return;
      const cd = latinCoda(n.lyric), on = firstOf.has(n) ? latinOnset(n.lyric) : [];
      const vAt = vowelStart(n, on), tEnd = nextSound(sungR.notes, k, firstOf);
      // the reference must be steady vowel: before the coda's room (35% of the note and its transition)
      if (vAt + 0.06 > n.t1 - 0.35 * (n.t1 - n.t0) - 0.045 || tEnd - vAt < 0.15) { t.skipped++; return; }
      const got = readCoda(sungR.x, rate, vAt, tEnd), gotC = readCoda(ctlR.x, rate, vAt, tEnd);
      if (!cd.length) { t.bare[1]++; if (got.cls === 'none') t.bare[0]++; t.bareCtl[1]++; if (gotC.cls === 'none') t.bareCtl[0]++; return; }
      const nx = sungR.notes[k + 1], nxOn = nx && firstOf.has(nx) ? latinOnset(nx.lyric) : [];
      const want = expectedRead(cd[0]), ok = match(want, got);
      all++; if (ok) right++; else miss.push(`${p} *${n.lyric}*${nxOn.length ? ` (then ${nx.lyric})` : ''}, ${Math.round((n.t1 - n.t0) * 1000)} ms: ${label(want)} read as ${label(got)}`);
      if (want.cls === got.cls) t.manner++;
      if (gotC.cls === 'none') cRight++;
      const side = nxOn.length ? t.beforeCons : t.beforeVow; side[1]++; if (ok) side[0]++;
      const key = cd.length > 1 ? `${label(want)} (cluster ${cd.join(' ')})` : label(want), c = byClass.get(key) || [0, 0];
      c[1]++; if (ok) c[0]++; byClass.set(key, c);
      const cm = conf.get(want.cls) || new Map(); cm.set(got.cls, (cm.get(got.cls) || 0) + 1); conf.set(want.cls, cm);
    });
    t.all = [t.all[0] + right, t.all[1] + all]; t.ctl = [t.ctl[0] + cRight, t.ctl[1] + all];
    rows.push(`| ${p} | ${all} | ${pct(right, all)} | ${pct(cRight, all)} |`);
  }
  return [
    '| piece | syllables | singing: read exactly as written | vowel-only control: read as none |', '|---|---|---|---|', ...rows,
    `| all | ${t.all[1]} | ${pct(...t.all)} | ${pct(...t.ctl)} |`, '',
    `By class alone: ${pct(t.manner, t.all[1])}. Before a syllable that opens on a consonant: ${pct(...t.beforeCons)}; before a vowel or a rest: ${pct(...t.beforeVow)}. `
    + `Syllables that close on their vowel: ${pct(...t.bare)} read as no consonant (vowel-only choir: ${pct(...t.bareCtl)}). Too short for a steady vowel before the coda, skipped: ${t.skipped}.`, '',
    'By written consonant (a cluster scored on its first phone is listed apart):', '', '| written | read exactly |', '|---|---|',
    ...[...byClass].sort((x, y) => y[1][1] - x[1][1]).map(([k, [r, n]]) => `| ${k} | ${pct(r, n)} |`), '',
    'Class written (rows) against class read (columns):', '', `| written | ${CLS.join(' | ')} |`, '|---|' + CLS.map(() => '---').join('|') + '|',
    ...CLS.filter((c) => conf.has(c)).map((c) => `| ${c} | ${CLS.map((d) => conf.get(c).get(d) || 0).join(' | ')} |`), '',
    ...(hide ? [`Misses: ${miss.length}, not printed (held out).`, ''] : ['Misses:', '', ...miss.map((m) => `- ${m}`), ''])];
}
const CLS = ['stop', 'fricative', 'nasal', 'tap', 'none'];
const PIECES = ['dies-irae', 'pange-lingua', 'veni-creator', 'te-deum', 'salve-regina'];
if (PARTS.includes('B')) lines.push('## B. The corpus pieces (final D3, fitted to 4/4 at 124 BPM)', '',
  'Not a clean held-out set: no threshold was set on it, but its first run (60.5%) was read for misses, which showed the window cutting off bursts at the next sound and /m/ after /u/ barely a murmur; both were fixed (in the reader\'s window and in sing.mjs) before this run. One looser nasal rule was also tried and dropped: it read 136 of 162 here (84.0%) but called 13 of 30 vowel-only A2 fades in part A nasals. Its misses were read again for the second round (README "Final consonants, second round") and the third, which found the blip of bare vowel at the end of every final nasal\'s murmur (README "Final consonants, third round").', '',
  'The last note of every syllable that closes on a consonant, 0.2 s or more, with 60 ms of steady vowel before the coda\'s room. The window ends where the next sound starts (the next beat, less its opening consonant sung before it). The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.', '',
  ...scorePieces(PIECES, HIDE.includes('B')));

// Held out: every sixth Graduale piece (1908 edition) by file name, fixed before the second round's
// changes and scored once before and once after them; its misses were not read while tuning.
const HELD = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort().filter((_, i) => i % 6 === 0).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('D')) lines.push('## D. Held out: ten Graduale pieces (every sixth file of corpus/gregobase-1908)', '',
  `${HELD.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Chosen by file name before the second round's changes, and scored before and after them without its misses being read in between; scored again after the third round (README "Final consonants, third round"), when E below is the clean set.`, '',
  ...scorePieces(HELD, HIDE.includes('D')));

// Held out, second set (2026-11-15, third round): every sixth file from the fourth (3403 ... 3459), fixed and
// scored before the third round's changes (README "Final consonants, third round"); its misses were not
// read while tuning. D had been printed three times by then, so this is the round's clean score.
const HELD2 = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort().filter((_, i) => i % 6 === 3).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('E')) lines.push('## E. Held out, second set: ten more Graduale pieces (every sixth file from the fourth)', '',
  `${HELD2.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Chosen by file name and scored before the third round's changes (README "Final consonants, third round"), then once after them; its misses were not read in between.`, '',
  ...scorePieces(HELD2, HIDE.includes('E')));

// Held out, third set (2026-11-15, fourth round: final r): every other Graduale piece D and E do not take
// (files 1 and 4 of every six, 20 pieces), fixed and scored before the fourth round's changes with its misses
// hidden (--hide-misses F), so the round's tap changes have a clean score with enough r to count (E has 11).
const GRAD = readdirSync(new URL('gregobase-1908/', corpus)).filter((f) => f.endsWith('.gabc')).sort();
const HELD3 = GRAD.filter((_, i) => i % 6 === 1 || i % 6 === 4).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('F')) lines.push('## F. Held out, third set: twenty more Graduale pieces (files 1 and 4 of every six)', '',
  `${HELD3.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Chosen by file name and scored before the fourth round's changes (README "Final consonants, fourth round") with its misses hidden.`, '',
  ...scorePieces(HELD3, HIDE.includes('F')));
// The fourth round's development set: the remaining Graduale pieces (files 2 and 5 of every six), read for
// misses alongside B while tuning the final r. Not held out.
const DEV = GRAD.filter((_, i) => i % 6 === 2 || i % 6 === 5).map((f) => `gregobase-1908/${f.slice(0, -5)}`);
if (PARTS.includes('G')) lines.push('## G. Development set: the other twenty Graduale pieces (files 2 and 5 of every six)', '',
  `${DEV.map((h) => h.split('/')[1]).join(', ')}; same settings and rules as B. Read for misses while tuning the fourth round (final r); not held out.`, '',
  ...scorePieces(DEV, HIDE.includes('G')));

// ---- C ----
if (PARTS.includes('C')) {
const files = [];
for (const d of ['', ...readdirSync(corpus, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${e.name}/`)])
  for (const f of readdirSync(new URL(d, corpus))) if (f.endsWith('.gabc')) files.push(`${d}${f}`);
const count = new Map(); let syl = 0, closes = 0, clusters = 0;
for (const f of files) for (const e of parseGabc(readFileSync(new URL(f, corpus), 'utf8')).events) {
  if (e.type !== 'note' || !e.syllable) continue;
  syl++;
  const cd = latinCoda(e.syllable);
  if (cd.length) { closes++; if (cd.length > 1) clusters++; count.set(cd[0], (count.get(cd[0]) || 0) + 1); }
}
lines.push('## C. Closing consonants in the corpus', '', `${files.length} GABC files, ${syl} sung syllables; ${pct(closes, syl)} close on a consonant, ${clusters} on a cluster. First phone: ${[...count].sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} ${c}`).join(', ')}.`, '');
}
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(lines.join('\n'));
