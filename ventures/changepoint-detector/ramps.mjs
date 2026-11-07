// Group adjacent same-direction changes into one ramp. Pure post-processing: the changes PELT found are untouched.
// A ramp is two or more consecutive changes that all move the level the same way, where every segment between two of
// them is at most `maxGap` points long (default a fiftieth of the series, at least 3). A rise from 10 to 25 weeks
// cut into three steps is then reported once, as one rise over its span.
// Not a test: it says "these cuts sit close together and agree in sign", which a ramp does and so can a run of steps.
export function groupRamps(changes, segments, n, { maxGap = Math.max(3, Math.ceil(n / 50)) } = {}) {
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
