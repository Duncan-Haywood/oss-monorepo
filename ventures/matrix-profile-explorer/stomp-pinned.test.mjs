import { test } from "node:test";
import assert from "node:assert/strict";
import { matrixProfile, exclusionZone, LIMITS } from "./engine.mjs";

// The STOMP loop before the correlation screen (2026-11-19 perf pass,
// docs/history/ci-perf-2026-11-19-matrix-profile-correlation-screen.md),
// copied verbatim. The shipped loop must give the same profile and index,
// bit for bit, including which neighbour wins a tie.
function oldMatrixProfile(values, m) {
  const n = values.length;
  const l = n - m + 1;
  if (!(m >= LIMITS.minWindow) || l < 2) throw new Error(`window must be at least ${LIMITS.minWindow} and at most half the series length`);
  // Centre the series: z-normalized distances are unchanged, and dot products lose less precision.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += values[i];
  mean /= n;
  const T = new Float64Array(n);
  for (let i = 0; i < n; i++) T[i] = values[i] - mean;

  // Per-subsequence mean and population std, two-pass for accuracy; exact constancy by run length.
  const mu = new Float64Array(l);
  const sig = new Float64Array(l);
  const constant = new Uint8Array(l);
  const run = new Int32Array(n);
  run[n - 1] = 1;
  for (let i = n - 2; i >= 0; i--) run[i] = values[i] === values[i + 1] ? run[i + 1] + 1 : 1;
  for (let i = 0; i < l; i++) {
    let s = 0;
    for (let k = 0; k < m; k++) s += T[i + k];
    const u = s / m;
    let v = 0;
    for (let k = 0; k < m; k++) { const d = T[i + k] - u; v += d * d; }
    mu[i] = u;
    sig[i] = Math.sqrt(v / m);
    if (run[i] >= m || sig[i] === 0) { constant[i] = 1; sig[i] = 0; }
  }

  const zone = exclusionZone(m);
  const P = new Float64Array(l).fill(Infinity);
  const I = new Int32Array(l).fill(-1);
  const twoM = 2 * m;
  const sqrtM = Math.sqrt(m);

  // First row: QT[0][j] by direct dot products (equal to the first column by symmetry).
  const first = new Float64Array(l);
  for (let j = 0; j < l; j++) {
    let s = 0;
    for (let k = 0; k < m; k++) s += T[k] * T[j + k];
    first[j] = s;
  }
  const QT = new Float64Array(l);
  QT.set(first);

  for (let i = 0; i < l; i++) {
    if (i > 0) {
      // Row i from row i-1, right to left so QT[j-1] still holds row i-1.
      const a = T[i - 1];
      const b = T[i + m - 1];
      // QT[i] (the diagonal) is kept: row i+1 needs it for QT[i+1].
      for (let j = l - 1; j >= i; j--) QT[j] = QT[j - 1] - a * T[j - 1] + b * T[j + m - 1];
    }
    const ci = constant[i];
    const mi = mu[i];
    const si = sig[i];
    for (let j = i + zone + 1; j < l; j++) {
      let d;
      if (ci || constant[j]) d = ci && constant[j] ? 0 : sqrtM;
      else {
        let r = (QT[j] - m * mi * mu[j]) / (m * si * sig[j]);
        if (r > 1) r = 1; else if (r < -1) r = -1;
        d = Math.sqrt(twoM * (1 - r));
      }
      if (d < P[i]) { P[i] = d; I[i] = j; }
      if (d < P[j]) { P[j] = d; I[j] = i; }
    }
  }
  return { profile: P, index: I, mu, sigma: sig, constant, zone };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(r, kind, n) {
  const v = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    if (kind === 0) { x += r() - 0.5; v.push(x); }
    // Small integers: many windows repeat exactly, so distances tie.
    else if (kind === 1) v.push(Math.floor(r() * 3));
    // Flat runs between noisy stretches: constant windows on both paths.
    else if (kind === 2) v.push(i % 40 < 15 ? 7 : r() * 4);
    // A pure period: every window has exact (to rounding) twins.
    else if (kind === 3) v.push([1, 4, 2, 8, 5, 7][i % 6]);
    // Spikes on a sine, the shape the page's discords look for.
    else v.push(Math.sin(i / 5) + (r() < 0.02 ? 6 : 0) + 1e-3 * r());
  }
  return v;
}

test("correlation-screened STOMP equals the earlier loop bit for bit", () => {
  const r = rng(20261119);
  let cases = 0;
  for (let rep = 0; rep < 40; rep++) {
    const kind = rep % 5;
    const n = 20 + Math.floor(r() * 300);
    const m = Math.max(LIMITS.minWindow, Math.min(Math.floor(n / 2), 3 + Math.floor(r() * 30)));
    const v = series(r, kind, n);
    const got = matrixProfile(v, m);
    const want = oldMatrixProfile(v, m);
    assert.equal(got.zone, exclusionZone(m));
    assert.deepEqual(Array.from(got.index), Array.from(want.index), `index, kind ${kind}, n ${n}, m ${m}`);
    for (let i = 0; i < want.profile.length; i++) {
      assert.ok(Object.is(got.profile[i], want.profile[i]), `profile[${i}] kind ${kind}, n ${n}, m ${m}: ${got.profile[i]} vs ${want.profile[i]}`);
    }
    assert.deepEqual(Array.from(got.constant), Array.from(want.constant));
    cases++;
  }
  assert.equal(cases, 40);
});
