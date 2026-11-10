// F1 and segmentation cover against several annotators, ported line for line
// from TCPDBench analysis/scripts/metrics.py (van den Burg and Williams 2020,
// "An Evaluation of Change Point Detection Algorithms", arXiv:2003.06222; MIT,
// Copyright (c) 2020 The Alan Turing Institute). Change point locations are
// 0-based and mark the first point of a new segment.

export function truePositives(T, X, margin = 5) {
  const left = new Set(X);
  const tp = new Set();
  for (const tau of [...T].sort((a, b) => a - b)) {
    let best = null;
    for (const x of left) {
      const d = Math.abs(tau - x);
      if (d <= margin && (best === null || d < best.d || (d === best.d && x < best.x))) best = { d, x };
    }
    if (!best) continue;
    tp.add(tau);
    left.delete(best.x);
  }
  return tp;
}

// annotations: { annotatorId: [locations] }; predictions: [locations].
export function fMeasure(annotations, predictions, margin = 5, alpha = 0.5) {
  const Tks = Object.values(annotations).map((a) => new Set([...a, 0]));
  const X = new Set([...predictions, 0]);
  const Tstar = new Set(Tks.flatMap((t) => [...t]));
  const K = Tks.length;
  const P = truePositives(Tstar, X, margin).size / X.size;
  const R = Tks.reduce((s, Tk) => s + truePositives(Tk, X, margin).size / Tk.size, 0) / K;
  const F = P * R / (alpha * R + (1 - alpha) * P);
  return { F: Number.isFinite(F) ? F : 0, P, R };
}

export function partitionFromCps(locations, n) {
  const cps = [...new Set(locations)].sort((a, b) => a - b);
  const parts = [];
  let cur = [], j = 0;
  for (let i = 0; i < n; i++) {
    if (i === cps[j]) { if (cur.length) parts.push(cur); cur = []; j++; }
    cur.push(i);
  }
  parts.push(cur);
  return parts;
}

// Segments are runs of consecutive indexes, so overlaps are interval arithmetic.
const span = (s) => [s[0], s[s.length - 1]];
function overlap(a, b) {
  const [a0, a1] = span(a), [b0, b1] = span(b);
  const inter = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0) + 1);
  return inter / (a.length + b.length - inter);
}

export function coverSingle(S, Sp) {
  const T = Sp.reduce((s, r) => s + r.length, 0);
  let C = 0;
  for (const R of S) C += R.length * Math.max(...Sp.map((Rp) => overlap(R, Rp)));
  return C / T;
}

export function covering(annotations, predictions, n) {
  const pX = partitionFromCps(predictions, n);
  const Cs = Object.values(annotations).map((a) => coverSingle(partitionFromCps(a, n), pX));
  return Cs.reduce((s, c) => s + c, 0) / Cs.length;
}
