#!/usr/bin/env node
// master.mjs against EBU Tech 3341 (November 2023), Table 1, "Minimum requirements
// test signals". The EBU's own WAV set (tech.ebu.ch test material) answered 403
// from a cloud session on 2026-11-14, so each signal is synthesised here at
// 48 kHz from the table's own words, in 64-bit floats. Cases 6 (5.0 channels),
// 7 and 8 (authentic programme) and 11 and 14 ("live" meters) are not run:
// master.mjs reads mono and stereo, the programme files are only in the EBU set,
// and 10 and 13 are the file-meter halves of 11 and 14.
// node eval/ebu-tech3341.mjs [--json]   exit 0 when every case is inside tolerance
import { integratedLufs, truePeak, truePeakAnnex2, maxWindowLoudness, windowLoudnessRange } from '../master.mjs';

const fs = 48000;
const amp = (dbfs) => 10 ** (dbfs / 20);
// "Stereo sine wave, 1000 Hz ... signal applied in phase to both channels";
// levels are per-channel peak. Phase runs on across segments, as one oscillator.
function tones(segments) {
  const n = segments.reduce((t, [s]) => t + Math.round(s * fs), 0), x = new Float64Array(n);
  let i = 0;
  for (const [sec, db] of segments) {
    const a = db === null ? 0 : amp(db), m = Math.round(sec * fs);
    for (let k = 0; k < m; k++, i++) x[i] = a * Math.sin(2 * Math.PI * 1000 * i / fs);
  }
  return [x, x];
}
const rep = (seg, times) => Array.from({ length: times }, () => seg).flat();

// 15-19: sine at fs/div, amplitude in FFS, start phase in degrees, 10 ms fade in and
// out (raised cosine). The duration "does not matter": 1 s.
function tpSine(div, a, deg) {
  const n = fs, x = new Float64Array(n), f = Math.round(0.01 * fs);
  for (let i = 0; i < n; i++) {
    const g = i < f ? 0.5 - 0.5 * Math.cos(Math.PI * i / f) : i >= n - f ? 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / f) : 1;
    x[i] = g * a * Math.sin(2 * Math.PI * i / div + deg * Math.PI / 180);
  }
  return [x, x];
}
// 20-23: at 4*fs, a sine at fs/6 (0.5 FFS) with one period of fs/4 at 1.0 FFS in the
// middle, phase-continuous at both joins; low-pass filtered, then every 4th sample
// kept from `offset`. The table does not give the filter: here a 1023-tap
// Blackman-windowed sinc with its cut at 20 kHz (of 96 kHz Nyquist at 192 kHz),
// unity gain at DC. Fades: 10 ms raised cosine.
function tpBurst(offset) {
  const up = 4 * fs, n = up, x = new Float64Array(n), f = Math.round(0.01 * up);
  const mid = n / 2, burst = up / (fs / 4); // 16 samples: one period of fs/4
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const inBurst = i >= mid && i < mid + burst;
    const g = i < f ? 0.5 - 0.5 * Math.cos(Math.PI * i / f) : i >= n - f ? 0.5 - 0.5 * Math.cos(Math.PI * (n - 1 - i) / f) : 1;
    x[i] = g * (inBurst ? 1 : 0.5) * Math.sin(ph);
    ph += 2 * Math.PI * (inBurst ? fs / 4 : fs / 6) / up;
  }
  const L = 1023, h = new Float64Array(L), fc = 20000 / up, c = (L - 1) / 2;
  let sum = 0;
  for (let k = 0; k < L; k++) {
    const d = k - c, s = d === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
    h[k] = s * (0.42 - 0.5 * Math.cos(2 * Math.PI * k / (L - 1)) + 0.08 * Math.cos(4 * Math.PI * k / (L - 1)));
    sum += h[k];
  }
  for (let k = 0; k < L; k++) h[k] /= sum;
  const out = new Float64Array(Math.floor((n - offset) / 4));
  for (let o = 0; o < out.length; o++) {
    const i = offset + 4 * o;
    let s = 0;
    for (let k = 0; k < L; k++) { const j = i - k + c; if (j >= 0 && j < n) s += h[k] * x[j]; }
    out[o] = s;
  }
  return [out, out];
}

const db = (v) => 20 * Math.log10(v);
const I = (ch) => integratedLufs(ch, fs).lufs;
const rows = [];
const within = (got, want, plus, minus) => got <= want + plus && got >= want - minus;
function add(num, what, got, want, plus, minus = plus) {
  rows.push({ case: num, what, got: +got.toFixed(3), want, tol: plus === minus ? `+/-${plus}` : `+${plus}/-${minus}`, ok: within(got, want, plus, minus) });
}

add(1, 'I', I(tones([[20, -23]])), -23, 0.1);
add(1, 'M max', maxWindowLoudness(tones([[20, -23]]), fs, 0.4), -23, 0.1);
add(1, 'S max', maxWindowLoudness(tones([[20, -23]]), fs, 3), -23, 0.1);
add(2, 'I', I(tones([[20, -33]])), -33, 0.1);
add(3, 'I', I(tones([[10, -36], [60, -23], [10, -36]])), -23, 0.1);
add(4, 'I', I(tones([[10, -72], [10, -36], [60, -23], [10, -36], [10, -72]])), -23, 0.1);
add(5, 'I', I(tones([[20, -26], [20.1, -20], [20, -26]])), -23, 0.1);
{
  const r = windowLoudnessRange(tones(rep([[1.34, -20], [1.66, -30]], 5)), fs, 3, 3);
  add(9, 'S min after 3 s', r.min, -23, 0.1); add(9, 'S max after 3 s', r.max, -23, 0.1);
}
for (let i = 0; i < 20; i++) add(10, `S max, file ${i}`, maxWindowLoudness(tones([[i * 0.15, null], [3, -23], [1, null]]), fs, 3), -23, 0.1);
{
  const r = windowLoudnessRange(tones(rep([[0.18, -20], [0.22, -30]], 25)), fs, 0.4, 1);
  add(12, 'M min after 1 s', r.min, -23, 0.1); add(12, 'M max after 1 s', r.max, -23, 0.1);
}
for (let i = 0; i < 20; i++) add(13, `M max, file ${i}`, maxWindowLoudness(tones([[i * 0.02, null], [0.4, -23], [1, null]]), fs, 0.4), -23, 0.1);

const tpCases = [[15, () => tpSine(4, 0.5, 0), -6], [16, () => tpSine(4, 0.5, 45), -6], [17, () => tpSine(6, 0.5, 60), -6],
  [18, () => tpSine(8, 0.5, 67.5), -6], [19, () => tpSine(4, 1.41, 45), 3], [20, () => tpBurst(0), 0], [21, () => tpBurst(1), 0],
  [22, () => tpBurst(2), 0], [23, () => tpBurst(3), 0]];
for (const [num, make, want] of tpCases) {
  const [l] = make();
  add(num, 'TP (master.mjs, 4x windowed sinc)', db(truePeak(l)), want, 0.2, 0.4);
  add(num, 'TP (BS.1770-5 Annex 2 FIR)', db(truePeakAnnex2(l)), want, 0.2, 0.4);
  add(num, 'sample peak (for scale)', db(l.reduce((m, v) => Math.max(m, Math.abs(v)), 0)), want, 0.2, 0.4);
}

if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  #${r.case} ${r.what}: ${r.got} (want ${r.want} ${r.tol})`);
const meter = rows.filter((r) => !r.what.startsWith('sample peak'));
const bad = meter.filter((r) => !r.ok);
console.log(`${meter.length - bad.length} of ${meter.length} meter readings inside Tech 3341's tolerance`);
process.exit(bad.length ? 1 : 0);
