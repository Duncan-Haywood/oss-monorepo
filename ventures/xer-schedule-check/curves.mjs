// P6 resource curves (RSRCCURVDATA) as cumulative distributions.
//
// A P6 resource curve says how an assignment's units and cost are spread
// over its duration, when the spread is not even. The XER holds each curve
// as 21 numbers, pct_usage_0 .. pct_usage_20. In every curve P6 ships
// (Back Loaded, Bell Shaped, Front Loaded, Linear, Triangular Increase, as
// exported in the public 6.0 hospital file) and in that file's own curve,
// pct_usage_0 is 0 and pct_usage_1..20 add up to 100: point k is the share of
// the k-th twentieth of the duration ("Linear" is 0 then 5 twenty times). So
// point 0 is read as the share at the start instant (put into the first
// twentieth, so nothing is lost when a hand-made curve has one), and the
// twenty shares as constant within their twentieth. A curve whose points do
// not add up to 100 is scaled so that they do; one that adds up to nothing is
// left out (the assignment is spread evenly), and both are reported.
//
// The duration is the assignment's working time on the activity's calendar,
// so "the k-th twentieth" is a twentieth of the working minutes, not of the
// calendar days (the same working-time basis evm.mjs spreads evenly on).
//
// curveTable(tables) -> { curves: Map(curv_id -> curve), scaled: [names], empty: [names] }
// curve = { id, name, shares: [20 numbers adding to 1], F(f) -> cumulative share at fraction f of the duration }
// tailF(F, f0) -> the cumulative of what is left after fraction f0, rescaled to 0..1
// LINEAR_F: the even spread

import { num } from "./xer.mjs";

export const LINEAR_F = (f) => Math.max(0, Math.min(1, f));

export function cumulative(shares) {
  const n = shares.length;
  const cum = [0];
  for (let k = 0; k < n; k++) cum.push(cum[k] + shares[k]);
  return (f) => {
    if (!(f > 0)) return 0;
    if (f >= 1) return 1;
    const x = f * n, k = Math.floor(x);
    return cum[k] + (x - k) * shares[k];
  };
}

export function curveTable(T) {
  const curves = new Map(), scaled = [], empty = [];
  for (const r of T.RSRCCURVDATA || []) {
    const pts = Array.from({ length: 21 }, (_, k) => Math.max(0, num(r[`pct_usage_${k}`]) ?? 0));
    const raw = pts.slice(1);
    raw[0] += pts[0];
    const sum = raw.reduce((a, b) => a + b, 0);
    const name = r.curv_name || `curve ${r.curv_id}`;
    if (!(sum > 0)) { empty.push(name); continue; }
    if (Math.abs(sum - 100) > 0.01) scaled.push(`${name} (${Math.round(sum * 100) / 100})`);
    const shares = raw.map((v) => v / sum);
    curves.set(r.curv_id, { id: r.curv_id, name, shares, F: cumulative(shares), linear: shares.every((s) => Math.abs(s - 1 / 20) < 1e-9) });
  }
  return { curves, scaled, empty };
}

// The part of a curve after fraction f0 of the duration, as a curve of its
// own over what is left (for remaining work on a started activity). Nothing
// left on the curve -> the even spread.
export function tailF(F, f0) {
  f0 = Math.max(0, Math.min(1, f0 || 0));
  if (!f0) return F;
  const base = F(f0), left = 1 - base;
  if (!(left > 1e-12) || f0 >= 1) return LINEAR_F;
  return (f) => (f <= 0 ? 0 : f >= 1 ? 1 : (F(f0 + f * (1 - f0)) - base) / left);
}
