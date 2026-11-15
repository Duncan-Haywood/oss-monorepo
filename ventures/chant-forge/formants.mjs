// Formant estimation by linear prediction, to check what sing.mjs sings.
//
// The textbook method (Markel and Gray 1976; Praat's "To Formant (burg)" does the same job
// by another fit): low-pass and decimate to about 11 kHz, pre-emphasise, Hamming-window a
// frame, fit an order-12 all-pole model by the autocorrelation method (Levinson-Durbin),
// take the roots of the predictor polynomial (Durand-Kerner), and read each complex root
// as a resonance: frequency from its angle, bandwidth from its radius. Roots wider than
// 500 Hz or under 120 Hz are not formants. The median over several frames is reported.
// Known limit: on voiced sound the all-pole fit is pulled toward the harmonics, and
// worse the higher the pitch (a 300 Hz voice samples the spectrum every 300 Hz).

function lowpassDecimate(x, factor) {
  const taps = 8 * factor + 1, mid = (taps - 1) / 2, fc = 0.45 / factor;
  const h = new Float64Array(taps);
  let s = 0;
  for (let k = 0; k < taps; k++) {
    const n = k - mid;
    const sinc = n === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * n) / (Math.PI * n);
    h[k] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (taps - 1)));
    s += h[k];
  }
  for (let k = 0; k < taps; k++) h[k] /= s;
  const out = new Float64Array(Math.floor((x.length - taps) / factor));
  for (let j = 0; j < out.length; j++) {
    let acc = 0; const o = j * factor;
    for (let k = 0; k < taps; k++) acc += h[k] * x[o + k];
    out[j] = acc;
  }
  return out;
}

export function lpc(frame, order) {
  const n = frame.length, r = new Float64Array(order + 1);
  for (let lag = 0; lag <= order; lag++) { let s = 0; for (let i = lag; i < n; i++) s += frame[i] * frame[i - lag]; r[lag] = s; }
  r[0] *= 1 + 1e-9;
  const a = new Float64Array(order + 1); a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    const prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    err *= 1 - k * k;
  }
  return a;
}

// roots of z^p + a1 z^(p-1) + ... + ap, as [re, im] pairs
export function polyRoots(a) {
  const p = a.length - 1;
  let z = Array.from({ length: p }, (_, k) => { const r = 0.9, t = (2 * Math.PI * k) / p + 0.4; return [r * Math.cos(t), r * Math.sin(t)]; });
  const mul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const div = (x, y) => { const d = y[0] * y[0] + y[1] * y[1]; return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]; };
  for (let it = 0; it < 800; it++) {
    let moved = 0;
    z = z.map((zi, i) => {
      let v = [1, 0];
      for (let k = 1; k <= p; k++) { v = mul(v, zi); v[0] += a[k]; }
      let d = [1, 0];
      for (let j = 0; j < p; j++) if (j !== i) d = mul(d, [zi[0] - z[j][0], zi[1] - z[j][1]]);
      const step = div(v, d);
      moved = Math.max(moved, Math.hypot(step[0], step[1]));
      return [zi[0] - step[0], zi[1] - step[1]];
    });
    if (moved < 1e-12) break;
  }
  return z;
}

export function frameFormants(frame, fs, order = 12) {
  const n = frame.length, x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = (frame[i] - 0.97 * (i ? frame[i - 1] : 0)) * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const roots = polyRoots(lpc(x, order));
  return roots
    .filter(([, im]) => im > 0)
    .map(([re, im]) => ({ f: (Math.atan2(im, re) * fs) / (2 * Math.PI), bw: (-Math.log(Math.hypot(re, im)) * fs) / Math.PI }))
    .filter((r) => r.f > 120 && r.bw < 500 && r.f < fs / 2 - 100)
    .sort((p, q) => p.f - q.f);
}

const median = (v) => { const s = [...v].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

// F1-F3 of a steady stretch of `signal` (rate Hz) between `from` and `to` seconds
export function estimateFormants(signal, rate, { from = 0.3, to = null, frameMs = 40, frames = 7, order = 12 } = {}) {
  const factor = Math.max(1, Math.round(rate / 11025));
  const a = Math.round(from * rate), z = Math.round((to ?? signal.length / rate) * rate);
  const y = lowpassDecimate(signal.subarray(a, z), factor), fs = rate / factor;
  const n = Math.round((frameMs / 1000) * fs);
  const hop = Math.max(1, Math.floor((y.length - n) / Math.max(1, frames - 1)));
  const got = [[], [], []];
  for (let k = 0; k < frames && k * hop + n <= y.length; k++) {
    const ff = frameFormants(y.subarray(k * hop, k * hop + n), fs, order);
    for (let j = 0; j < 3; j++) if (ff[j]) got[j].push(ff[j].f);
  }
  return got.map(median);
}

// nearest of the given vowel targets by distance in log F1, log F2
export function nearestVowel([f1, f2], targets) {
  let best = null, bd = Infinity;
  for (const [v, t] of Object.entries(targets)) {
    const d = Math.hypot(Math.log(f1 / t[0]), Math.log(f2 / t[1]));
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
