// Slope breaks: when did the growth rate of a drifting series change?
//
// A least-squares kinked line on the LEVELS dates a slope change well (log US real GDP: 1971Q2 against the recalled
// early-1970s slowdown) but cannot test it: residuals of a drifting series are near a unit root, so the level fit's
// gain is huge for any kink (eval/slope-breaks.mjs prints 140 against a BIC bar of 10.6) and no correction on those
// residuals is honest. The test is therefore run on the DIFFERENCES (growth per step), where a slope change is a mean
// shift in noise that is only weakly serially correlated:
//   split the differences at j, W(j) = (mean after - mean before)^2 / (lrv * (1/n1 + 1/n2)),
// lrv = the long-run variance of the within-segment residuals, s2 (1 + rho)/(1 - rho) with rho the lag-1 autocorrelation of those
// residuals (capped at 0.9). The statistic is the largest W over splits that leave `margin` of the series at each end
// (a sup-Wald), compared with a critical value that depends on that trimming, simulated (see eval/slope-breaks.mjs), not
// taken from a table. More breaks by binary segmentation: the same test inside each side.
// 95th percentile of the largest W over 400 seeded null series with 15% trimming: 9.0, 9.2, 8.6 at n = 100, 200, 400 with white-noise growth;
// 10.9, 9.8, 8.8 at rho 0.3; 12.0, 10.0, 8.9 at rho 0.5 (eval/slope-calibrate.mjs). 11 holds 95% in all nine cells; it is a bar for n >= 100.
export const CRITICAL = { 0.15: 11 };

function wald(d, lo, hi, j, rhoCap) {
  // segment d[lo..j-1] and d[j..hi-1]
  const n1 = j - lo, n2 = hi - j;
  let s1 = 0, s2 = 0;
  for (let i = lo; i < j; i++) s1 += d[i];
  for (let i = j; i < hi; i++) s2 += d[i];
  const m1 = s1 / n1, m2 = s2 / n2;
  let ss = 0, ac = 0, prev = null;
  for (let i = lo; i < hi; i++) {
    const e = d[i] - (i < j ? m1 : m2);
    ss += e * e;
    if (prev !== null && (i !== j)) ac += e * prev;
    prev = e;
  }
  const rho = Math.max(0, Math.min(rhoCap, ss > 0 ? ac / ss : 0));
  const lrv = (ss / (n1 + n2)) * (1 + rho) / (1 - rho);
  return { w: lrv > 0 ? (m2 - m1) ** 2 / (lrv * (1 / n1 + 1 / n2)) : 0, m1, m2, rho };
}

/**
 * x: the series (take logs first for a percentage growth rate). Returns { knots: [{index, wald, before, after}], critical }.
 * `index` is the first point of the new slope's step (the slope up to x[index] is `before`, after it `after`, per step).
 */
export function slopeBreaks(x, { maxKnots = 3, margin = 0.15, critical = null, rhoCap = 0.9 } = {}) {
  const d = x.slice(1).map((v, i) => v - x[i]);
  const crit = critical ?? CRITICAL[margin] ?? 11;
  const found = [];
  const rec = (lo, hi) => {
    if (found.length >= maxKnots) return;
    const len = hi - lo, trim = Math.max(4, Math.floor(len * margin));
    if (len < 4 * trim / 2 + 2 * trim - 1 || len - 2 * trim < 1) return;
    let best = null;
    for (let j = lo + trim; j <= hi - trim; j++) {
      const r = wald(d, lo, hi, j, rhoCap);
      if (!best || r.w > best.w) best = { j, ...r };
    }
    if (!best || !(best.w > crit)) return;
    found.push({ index: best.j, wald: best.w, before: best.m1, after: best.m2, rho: best.rho });
    rec(lo, best.j); rec(best.j, hi);
  };
  rec(0, d.length);
  found.sort((a, b) => a.index - b.index);
  return { knots: found.slice(0, maxKnots), critical: crit };
}

/** Where the least-squares kinked line (one knot, on the levels) puts the knot: the date, not the test. */
export function lsKnotDate(x, margin = 0.15, lineRss) {
  const n = x.length; let best = null;
  for (let k = Math.floor(n * margin); k <= n - 1 - Math.floor(n * margin); k++) {
    const r = lineRss(x, [k]); if (!best || r < best.rss) best = { index: k, rss: r };
  }
  return best;
}
