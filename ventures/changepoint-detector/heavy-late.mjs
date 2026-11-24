// Is the composite's heaviest column also its latest? A warning for `--turns --columns`.
//
// The Conference Board weights each column of a composite by one over the volatility of its monthly percent
// changes (composite-index.mjs), so the smoothest column weighs most. In business data the smoothest column is
// often the latest one too (headcount, MRR, active customers): README "A short-phase rule for composites, third
// make" found headcount taking a mean 70% of the weight, turning 4 months late, and the composite inheriting its
// lateness. heavyLate reads that from the data alone, with no truth:
//   1. each column is dated on its own with the same rule;
//   2. a column's relative lag is the median, over every other column j and every one of its own turns, of
//      (its turn - the nearest same-kind turn of j within `far` rows); turns with no partner are left out;
//   3. the warning fires when the heaviest column weighs at least `minWeight`, its relative lag is at least
//      `minLag` rows and no other column's relative lag is larger.
// When it fires, `without` names the columns left once the heaviest is dropped (the remedy is to date those).
//
// Tested before anything used it: README "A heaviest-is-latest warning" (eval/turns-heavy-late.mjs).
import { turningPoints } from './turning-points.mjs';

const median = (v) => {
  const s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function relativeLags(turnsByColumn, { far = 6 } = {}) {
  return turnsByColumn.map((own, i) => {
    const off = [];
    turnsByColumn.forEach((other, j) => {
      if (j === i) return;
      for (const t of own) {
        let best = null;
        for (const o of other) {
          if (o.kind !== t.kind) continue;
          const d = t.i - o.i;
          if (Math.abs(d) <= far && (best === null || Math.abs(d) < Math.abs(best))) best = d;
        }
        if (best !== null) off.push(best);
      }
    });
    return off.length >= 2 ? median(off) : null;
  });
}

// series: the composite's columns (positive numbers, aligned); weights: compositeIndex(...).weights;
// rule: turningPoints options (the composite's own rule).
export function heavyLate(series, weights, { rule = { frequency: 'monthly', bigMove: 0.05 }, minWeight = 0.4, minLag = 2, far = 6 } = {}) {
  const turns = series.map((x) => turningPoints(x, rule).turns);
  const lags = relativeLags(turns, { far });
  let h = 0;
  weights.forEach((w, i) => { if (w > weights[h]) h = i; });
  const lh = lags[h];
  const latest = lh !== null && lags.every((l, i) => i === h || l === null || l <= lh);
  const fires = weights[h] >= minWeight && lh !== null && lh >= minLag && latest;
  return { fires, column: h, weight: weights[h], lag: lh, lags, without: series.map((_, i) => i).filter((i) => i !== h) };
}
