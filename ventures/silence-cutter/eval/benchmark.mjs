// Benchmark: how much real pause each rule removes, and how much speech it
// cuts into, on recordings whose speech times are known.
//
//   bash eval/fetch.sh DIR            # public recordings, not committed
//   node eval/benchmark.mjs DIR [--seed 1] [--takes 24]
//
// Part A (synthetic takes from real speech): Free Spoken Digit Dataset
// utterances (6 speakers) laid end to end with pauses drawn from 0.15 to
// 2.5 s, each at its own level (RMS -22 dBFS +/- 4 dB), then put through six
// recording conditions. The truth for each utterance is the span where its
// own clean signal is within 30 dB of its peak, measured before any noise is
// added. Part B: the pyannote sample (two people, hand-made speech turns).
//
// Metrics, all at the same minimum pause (0.5 s) and padding (0.12 s before,
// 0.18 s after speech):
//   pause removed  = share of the ideal cut (every true gap of 0.5 s or more,
//                    less the padding) that the rule removed;
//   speech cut     = milliseconds of true speech that fall inside a cut;
//   words hit      = utterances losing more than 20 ms.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, analyse, mixToMono, frameLevels } from '../engine.mjs';

const args = process.argv.slice(2);
const DIR = args.find((a) => !a.startsWith('--')) ?? 'eval-data';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const SEED = opt('seed', 1), TAKES = opt('takes', 24);
const PAD = { padBefore: 0.12, padAfter: 0.18, minSilence: 0.5 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const gauss = (r) => { const u = Math.max(1e-12, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

function loadDigits() {
  const dir = join(DIR, 'fsdd');
  return readdirSync(dir).filter((f) => f.endsWith('.wav')).sort().map((f) => {
    const w = decodeWav(readFileSync(join(dir, f)));
    return { name: f, sr: w.sampleRate, x: mixToMono(w.channels) };
  });
}

// Span of an utterance: frames within 30 dB of its own loudest 10 ms frame,
// grown out from the peak across dips shorter than 150 ms. Growing from the
// peak keeps a recording's stray end-click (5_lucas_1 has one, 0.9 s after
// the word) out of the truth.
function truthSpan(x, sr) {
  const lv = frameLevels(x, sr);
  const peak = Math.max(...lv);
  const p = lv.indexOf(peak);
  const on = (f) => lv[f] > peak - 30;
  let a = p, b = p;
  for (let f = p - 1, gap = 0; f >= 0 && gap < 15; f--) { if (on(f)) { a = f; gap = 0; } else gap++; }
  for (let f = p + 1, gap = 0; f < lv.length && gap < 15; f++) { if (on(f)) { b = f; gap = 0; } else gap++; }
  return [a * 0.01, (b + 1) * 0.01];
}

function buildTake(digits, r) {
  const sr = 8000;
  const parts = [], truth = [];
  let t = 0.6 + r() * 1.2; // lead-in silence
  const lead = t;
  const n = 14 + Math.floor(r() * 8);
  const segs = [];
  for (let i = 0; i < n; i++) {
    const d = digits[Math.floor(r() * digits.length)];
    const gainDb = -22 + (r() * 8 - 4);
    const g = Math.pow(10, gainDb / 20) / Math.max(1e-6, rms(d.x));
    const [a, b] = truthSpan(d.x, sr);
    segs.push({ start: t, x: d.x, g });
    truth.push({ start: t + a, end: t + b });
    t += d.x.length / sr;
    // Pauses: half inside a phrase (0.15-0.45 s), half between phrases (0.5-2.5 s).
    t += r() < 0.5 ? 0.15 + r() * 0.3 : 0.5 + r() * 2.0;
  }
  const dur = t + 0.8;
  const x = new Float32Array(Math.ceil(dur * sr));
  for (const s of segs) { const o = Math.round(s.start * sr); for (let i = 0; i < s.x.length; i++) x[o + i] += s.x[i] * s.g; }
  void lead; void parts;
  return { sr, x, truth, dur };
}

const CONDITIONS = {
  'clean (noise -80 dBFS)': (x, sr, r) => addNoise(x, r, -80),
  'white noise, SNR 20 dB': (x, sr, r) => addNoise(x, r, -42),
  'white noise, SNR 12 dB': (x, sr, r) => addNoise(x, r, -34),
  '60 Hz hum at -30 dBFS': (x, sr, r) => { addNoise(x, r, -75); for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] += 0.03 * Math.sin(2 * Math.PI * 60 * t) + 0.012 * Math.sin(2 * Math.PI * 120 * t) + 0.008 * Math.sin(2 * Math.PI * 180 * t); } },
  'quiet recording (-20 dB gain)': (x, sr, r) => { for (let i = 0; i < x.length; i++) x[i] *= 0.1; addNoise(x, r, -78); },
  'loud recording (+12 dB gain)': (x, sr, r) => { for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i] * 4)); addNoise(x, r, -60); },
};
function addNoise(x, r, dbfs) { const a = Math.pow(10, dbfs / 20); for (let i = 0; i < x.length; i++) x[i] += a * gauss(r); }

const RULES = process.env.RULES ? JSON.parse(process.env.RULES) : {
  'auto (this tool)': { threshold: 'auto' },
  'auto, no edge pass': { threshold: 'auto', lowOver: null },
  'fixed -30 dBFS, full band': { threshold: -30, bandLimit: false, lowOver: null },
  'fixed -40 dBFS, full band': { threshold: -40, bandLimit: false, lowOver: null },
  'fixed -50 dBFS, full band': { threshold: -50, bandLimit: false, lowOver: null },
};

function overlap(a, b) { // total overlap of two sorted interval lists
  let i = 0, j = 0, s = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i].start, b[j].start), hi = Math.min(a[i].end, b[j].end);
    if (hi > lo) s += hi - lo;
    if (a[i].end < b[j].end) i++; else j++;
  }
  return s;
}
function idealCuts(truth, dur) {
  const merged = [];
  for (const t of [...truth].sort((p, q) => p.start - q.start)) {
    const l = merged[merged.length - 1];
    if (l && t.start <= l.end) l.end = Math.max(l.end, t.end); else merged.push({ ...t });
  }
  const out = [];
  const gaps = [{ start: 0, end: merged[0].start, lead: true }];
  for (let i = 1; i < merged.length; i++) gaps.push({ start: merged[i - 1].end, end: merged[i].start });
  gaps.push({ start: merged[merged.length - 1].end, end: dur, tail: true });
  for (const g of gaps) {
    if (g.end - g.start < PAD.minSilence) continue;
    const a = g.lead ? 0 : g.start + PAD.padAfter, b = g.tail ? dur : g.end - PAD.padBefore;
    if (b > a) out.push({ start: a, end: b });
  }
  return { ideal: out, merged };
}
function score(analysis, truth, dur) {
  const { ideal, merged } = idealCuts(truth, dur);
  const idealLen = ideal.reduce((s, c) => s + c.end - c.start, 0);
  const removed = overlap(ideal, analysis.cuts);
  const speechCut = overlap(merged, analysis.cuts);
  const hits = truth.filter((t) => overlap([t], analysis.cuts) > 0.02).length;
  return { idealLen, removed, speechCut, hits, words: truth.length };
}

function partA() {
  const digits = loadDigits();
  const rows = [];
  for (const [cname, cond] of Object.entries(CONDITIONS)) {
    const tot = Object.fromEntries(Object.keys(RULES).map((k) => [k, { idealLen: 0, removed: 0, speechCut: 0, hits: 0, words: 0 }]));
    for (let k = 0; k < TAKES; k++) {
      const r = rng(SEED * 1000 + k);
      const take = buildTake(digits, r);
      cond(take.x, take.sr, rng(SEED * 7777 + k));
      for (const [rname, ropt] of Object.entries(RULES)) {
        const a = analyse(take.x, take.sr, { ...PAD, ...ropt });
        const s = score(a, take.truth, take.dur);
        for (const key of Object.keys(s)) tot[rname][key] += s[key];
      }
    }
    for (const [rname, t] of Object.entries(tot)) rows.push({ condition: cname, rule: rname, ...t });
  }
  return rows;
}

function partB() {
  const w = decodeWav(readFileSync(join(DIR, 'sample.wav')));
  const x = mixToMono(w.channels);
  const truth = readFileSync(join(DIR, 'sample.rttm'), 'utf8').trim().split('\n').map((l) => { const p = l.split(/\s+/); return { start: +p[3], end: +p[3] + +p[4] }; });
  const dur = x.length / w.sampleRate;
  return Object.entries(RULES).map(([rname, ropt]) => ({ rule: rname, ...score(analyse(x, w.sampleRate, { ...PAD, ...ropt }), truth, dur) }));
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
const rowsA = partA();
console.log(`# Part A: ${TAKES} synthetic takes per condition from Free Spoken Digit Dataset speech (seed ${SEED})\n`);
console.log('| condition | rule | pause removed | speech cut | words hit |');
console.log('|---|---|---:|---:|---:|');
for (const r of rowsA) console.log(`| ${r.condition} | ${r.rule} | ${pct(r.removed, r.idealLen)} | ${(r.speechCut * 1000).toFixed(0)} ms | ${r.hits} of ${r.words} |`);
const sum = {};
for (const r of rowsA) { const s = (sum[r.rule] ??= { idealLen: 0, removed: 0, speechCut: 0, hits: 0, words: 0, worst: 100 }); for (const k of ['idealLen', 'removed', 'speechCut', 'hits', 'words']) s[k] += r[k]; s.worst = Math.min(s.worst, (100 * r.removed) / r.idealLen); }
console.log('\n| rule, all conditions | pause removed | worst condition | speech cut | words hit |');
console.log('|---|---:|---:|---:|---:|');
for (const [k, s] of Object.entries(sum)) console.log(`| ${k} | ${pct(s.removed, s.idealLen)} | ${s.worst.toFixed(1)}% | ${(s.speechCut * 1000).toFixed(0)} ms | ${s.hits} of ${s.words} |`);
console.log('\n# Part B: pyannote sample.wav (30 s, two speakers, hand-made turns)\n');
console.log('| rule | ideal cut | pause removed | speech cut | turns hit |');
console.log('|---|---:|---:|---:|---:|');
for (const r of partB()) console.log(`| ${r.rule} | ${r.idealLen.toFixed(2)} s | ${pct(r.removed, r.idealLen)} | ${(r.speechCut * 1000).toFixed(0)} ms | ${r.hits} of ${r.words} |`);
