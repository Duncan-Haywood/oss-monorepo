// P6 resource curves: how an assignment's units and cost are spread over its
// dates when it is not spread evenly.
//
// A P6 export carries its curves in RSRCCURVDATA: a curve id, a name and 21
// values pct_usage_0 .. pct_usage_20, one for each 5% point of the
// assignment's duration. An assignment (TASKRSRC) names its curve in
// curv_id; no curv_id is P6's default, an even spread. The 20 values after
// the first are read as the share of the units that falls in each
// twentieth of the assignment's working time (pct_usage_k: the slice ending
// at k x 5%). That is how MPXJ reads them (its WorkContour holds P6's
// "Linear" as 0 then twenty 5s), and P6's own curves fit it: every shipped
// curve starts at 0 and the twenty slices sum to 100 ("Linear" 20 x 5,
// "Back Loaded" 10 x 3.5 then 10 x 6.5). A curve whose values do not sum to
// 100 is scaled to it, as P6 normalises a curve; a non-zero pct_usage_0 is
// added to the first slice, so nothing is lost.
//
// No public XER carries P6's own timephased spread of a curved assignment
// to check the slices against (target_crv, P6's stored spread, is filled on
// 1 of 36,808 assignments in the CCA file, and that one names no curve the
// file has). What is checked: the slices sum to the amount, a linear curve
// gives the even spread to the cent, and the shape lands where the curve
// says (eval/resource-curves-2026-11-21.md).
//
// readCurves(xer) -> Map(curv_id -> { id, name, slices: [20 shares summing to 1], raw: [21] })
// spreadCurve(cal, s, e, amount, slices, add, cut) -> the part before `cut`;
//   `add(dayIndex, part)` receives the daily parts, as evm.mjs's spread does.
// curvePartBefore(cal, s, e, amount, slices, cut) -> the part before `cut`.

import { num } from "./xer.mjs";

const DAY = 1440;
export const SLICES = 20;

export function readCurves(xer) {
  const out = new Map();
  for (const r of xer.tables.RSRCCURVDATA || []) {
    const raw = [];
    for (let k = 0; k <= SLICES; k++) raw.push(Math.max(0, num(r[`pct_usage_${k}`]) ?? 0));
    const slices = raw.slice(1);
    slices[0] += raw[0];
    const sum = slices.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) continue;
    out.set(r.curv_id, { id: r.curv_id, name: r.curv_name || `curve ${r.curv_id}`, slices: slices.map((v) => v / sum), raw, sum, isDefault: r.default_flag === "Y" });
  }
  return out;
}

// true when the curve spreads exactly evenly (P6's "Linear"): spreading by
// it changes nothing
export function isEven(slices) {
  return slices.every((v) => Math.abs(v - 1 / SLICES) < 1e-9);
}

// Walk the working time of [s, e) on `cal` and give each working piece its
// share: the slice it falls in, by working-time position, times the piece's
// fraction of that slice. `add` gets (day, part); returns the part before cut.
export function spreadCurve(cal, s, e, amount, slices, add, cut = Infinity) {
  if (!amount) return 0;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  if (e < s) [s, e] = [e, s];
  const total = e > s && cal ? cal.workBetween(s, e) : 0;
  if (!(total > 0)) {
    add(Math.floor(e / DAY), amount);
    return e <= cut ? amount : 0;
  }
  const seg = total / SLICES;
  let worked = 0, before = 0;
  // the share of [w0, w1) of working time (minutes from the start)
  const share = (w0, w1) => {
    let v = 0;
    let k = Math.min(SLICES - 1, Math.floor(w0 / seg));
    while (w0 < w1 - 1e-9 && k < SLICES) {
      const end = Math.min(w1, (k + 1) * seg);
      v += slices[k] * ((end - w0) / seg);
      w0 = end;
      k++;
    }
    return v;
  };
  for (let d = Math.floor(s / DAY), last = Math.floor((e - 1) / DAY); d <= last; d++) {
    const base = d * DAY;
    let dayPart = 0;
    for (const [a, b] of cal.day(d)) {
      const x = Math.max(base + a, s), y = Math.min(base + b, e);
      if (y <= x) continue;
      const part = amount * share(worked, worked + (y - x));
      dayPart += part;
      if (y <= cut) before += part;
      else if (x < cut) before += amount * share(worked, worked + (cut - x));
      worked += y - x;
    }
    if (dayPart) add(d, dayPart);
  }
  return before;
}

export function curvePartBefore(cal, s, e, amount, slices, cut) {
  if (!amount || !Number.isFinite(s) || !Number.isFinite(e)) return 0;
  if (e < s) [s, e] = [e, s];
  if (cut <= s) return 0;
  if (cut >= e) return amount;
  return spreadCurve(cal, s, e, amount, slices, () => {}, cut);
}

// The rows of a curved spread, for Microsoft Project's timephased work
// (MSPDI Assignment/TimephasedData, msproject.mjs). Project stores an
// assignment's spread as consecutive rows of elapsed time, each holding the
// work done in it (rows over time with no work hold none). The rows here are
// cut at midnights and at the twenty slice boundaries (in working time,
// rounded to the minute), so the work inside a row falls at one rate over
// its working time, as Project spreads a row; their work sums to `amount`
// exactly. Returns [{ start, finish, work }] in minutes; work is 0 on a row
// with no working time.
export function curveRows(cal, s, e, amount, slices) {
  if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s) || !cal) return [];
  const total = cal.workBetween(s, e);
  if (!(total > 0)) return [{ start: s, finish: e, work: amount || 0 }];
  const seg = total / SLICES;
  const cuts = new Set([s, e]);
  for (let d = Math.floor(s / DAY) + 1; d * DAY < e; d++) cuts.add(d * DAY);
  for (let k = 1; k < SLICES; k++) {
    const t = Math.round(cal.addWork(s, k * seg));
    if (t > s && t < e) cuts.add(t);
  }
  const at = [...cuts].sort((a, b) => a - b);
  // the share of the working time [w0, w1) from the start
  const share = (w0, w1) => {
    let v = 0;
    let k = Math.min(SLICES - 1, Math.floor(w0 / seg));
    while (w0 < w1 - 1e-9 && k < SLICES) {
      const end = Math.min(w1, (k + 1) * seg);
      v += slices[k] * ((end - w0) / seg);
      w0 = end;
      k++;
    }
    return v;
  };
  const rows = [];
  let worked = 0;
  for (let i = 0; i + 1 < at.length; i++) {
    const w = cal.workBetween(at[i], at[i + 1]);
    rows.push({ start: at[i], finish: at[i + 1], work: w > 0 ? (amount || 0) * share(worked, worked + w) : 0 });
    worked += w;
  }
  return rows;
}

// which Microsoft Project work contour (1-7) a curve is, or 0: a curve
// written from one (p6xer.mjs's "MS Project <contour>" curves) goes back as
// that contour, so a Project -> XER -> Project trip keeps it
export function matchContour(slices, contourSlices) {
  for (let n = 1; n <= 7; n++) {
    const c = contourSlices(n);
    if (c && c.every((v, k) => Math.abs(v - slices[k]) < 5e-6)) return n;
  }
  return 0;
}
