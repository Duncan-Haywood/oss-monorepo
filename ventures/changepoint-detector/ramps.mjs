// Group adjacent same-direction changes into one ramp. Pure post-processing: the changes PELT found are untouched.
// A ramp is two or more consecutive changes that all move the level the same way, where every segment between two of
// them is at most `maxGap` points long (default a fiftieth of the series, at least 3). A rise from 10 to 25 weeks
// cut into three steps is then reported once, as one rise over its span.
// Not a test: it says "these cuts sit close together and agree in sign", which a ramp does and so can a run of steps.
export function groupRamps(changes, segments, n, { maxGap = Math.max(3, Math.ceil(n / 50)), values = null, wideGap = Math.ceil(n / 5) } = {}) {
  if (values && values.length === n) return groupRampsByFit(changes, segments, values, wideGap);
  const ramps = [];
  let i = 0;
  while (i < changes.length) {
    let j = i;
    const sign = Math.sign(changes[i].shift);
    // segment after change k is segments[k + 1]
    while (j + 1 < changes.length && sign !== 0 && Math.sign(changes[j + 1].shift) === sign && segments[j + 1].n <= maxGap) j++;
    if (j > i) {
      const a = changes[i], b = changes[j];
      ramps.push({
        from: a.label, to: b.label, startIndex: a.index, endIndex: b.index,
        cuts: j - i + 1, labels: changes.slice(i, j + 1).map((c) => c.label),
        meanBefore: a.meanBefore, meanAfter: b.meanAfter,
        shift: Math.round((b.meanAfter - a.meanBefore) * 1e4) / 1e4,
        direction: sign > 0 ? 'rise' : 'fall', maxGap,
      });
    }
    i = j + 1;
  }
  return ramps;
}

// Span-aware rule (2026-11-08). Candidate runs: consecutive same-direction cuts with every inner segment at most `wideGap`
// long. The run is kept as one ramp only if a flat-line-flat fit (levels A and B, a straight line between two knots placed
// anywhere from the previous cut to the next one) beats the steps PELT found by BIC; steps are charged for their cut
// positions too (2k+1 parameters for k cuts, against 4). If the whole run fails, the last cut is dropped and it is tried again.
// A ramp of only a few points is, in the data, two close steps: this rule does not claim to tell those apart.
function sse(values, lo, hi, ka, kb) {
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (let i = lo; i < hi; i++) {
    const w = i < ka ? 0 : i >= kb ? 1 : (i - ka) / (kb - ka), f1 = 1 - w;
    s11 += f1 * f1; s12 += f1 * w; s22 += w * w; t1 += f1 * values[i]; t2 += w * values[i];
  }
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-9) return Infinity;
  const A = (t1 * s22 - t2 * s12) / det, B = (s11 * t2 - s12 * t1) / det;
  let e = 0;
  for (let i = lo; i < hi; i++) {
    const w = i < ka ? 0 : i >= kb ? 1 : (i - ka) / (kb - ka);
    e += (values[i] - (A * (1 - w) + B * w)) ** 2;
  }
  return e;
}
export function rampBeatsSteps(values, cutIdx, lo, hi) {
  const k = cutIdx.length, m = hi - lo;
  if (k < 2 || m < 8) return false;
  const bounds = [lo, ...cutIdx, hi];
  let steps = 0;
  for (let p = 0; p <= k; p++) {
    let mu = 0; const len = bounds[p + 1] - bounds[p];
    for (let i = bounds[p]; i < bounds[p + 1]; i++) mu += values[i];
    mu /= len;
    for (let i = bounds[p]; i < bounds[p + 1]; i++) steps += (values[i] - mu) ** 2;
  }
  let best = Infinity;
  const st = Math.max(1, Math.floor(m / 60));
  for (let ka = lo; ka <= cutIdx[0]; ka += st) for (let kb = Math.max(ka + 2, cutIdx[k - 1]); kb <= hi; kb += st) best = Math.min(best, sse(values, lo, hi, ka, kb));
  const tiny = 1e-12;
  const bicSteps = m * Math.log(Math.max(steps, tiny) / m) + (2 * k + 1) * Math.log(m);
  const bicRamp = m * Math.log(Math.max(best, tiny) / m) + 4 * Math.log(m);
  return bicRamp < bicSteps;
}
function groupRampsByFit(changes, segments, values, wideGap) {
  const out = [];
  let i = 0;
  while (i < changes.length) {
    let j = i;
    const sign = Math.sign(changes[i].shift);
    while (j + 1 < changes.length && sign !== 0 && Math.sign(changes[j + 1].shift) === sign && segments[j + 1].n <= wideGap) j++;
    let e = j;
    while (e > i) {
      const lo = i > 0 ? changes[i - 1].index : 0, hi = e + 1 < changes.length ? changes[e + 1].index : values.length;
      if (rampBeatsSteps(values, changes.slice(i, e + 1).map((c) => c.index), lo, hi)) break;
      e--;
    }
    if (e > i) {
      const a = changes[i], b = changes[e];
      out.push({
        from: a.label, to: b.label, startIndex: a.index, endIndex: b.index,
        cuts: e - i + 1, labels: changes.slice(i, e + 1).map((c) => c.label),
        meanBefore: a.meanBefore, meanAfter: b.meanAfter,
        shift: Math.round((b.meanAfter - a.meanBefore) * 1e4) / 1e4,
        direction: sign > 0 ? 'rise' : 'fall', maxGap: wideGap, rule: 'fit',
      });
    }
    i = e + 1;
  }
  return out;
}
