// Microsoft Project work contours: the shape Project gives an assignment's
// work over its dates (Assignment WorkContour in MSPDI: 0 flat, 1 back
// loaded, 2 front loaded, 3 double peak, 4 early peak, 5 late peak, 6 bell,
// 7 turtle, 8 contoured = hand-edited timephased work).
//
// Measured from Project's own timephased work, not taken from a manual:
// every contoured assignment in MPXJ's MSPDI test corpus (19 assignments in
// 3 files saved by Project, all seven built-in contours, units 0.5 to 1.5, day,
// night-shift and 24-hour calendars; eval/work-contours-2026-11-21.md).
// Project cuts the assignment's working time into ten equal segments and
// works each at a fixed percentage of the assignment's peak units (the
// Units field). Work is fixed, so a contour other than flat stretches the
// assignment: its working span is work / (units x mean percentage), e.g.
// 80 h at 100% back loaded (mean 60%) spans 133.3 working hours, not 80.
//
// These are not P6's curves of the same names. P6 ships "Back Loaded" as ten
// twentieths at 3.5% then ten at 6.5% of the units, over unchanged dates, and
// MPXJ reads Project's contours as those P6 shapes (its WorkContour
// constants). Project's back loaded puts 1.7% of the work in the first tenth
// of the span and 16.7% in each of the last three.
//
// PROJECT_CONTOURS[n] -> { name, pct: [10 segment percentages of peak units] }
// contourSlices(n) -> 20 shares of the work summing to 1 (curves.mjs format:
//   each segment's share split over its two twentieths), or null for 0, 8 and
//   unknown values (flat is even; contoured has no fixed shape)
// contourCurveValues(n) -> P6 RSRCCURVDATA pct_usage_0..20 (0 then twenty
//   percentages summing to 100, 4 decimals)
// contourSpanFactor(n) -> working span / (work / units): 1 / mean percentage

export const PROJECT_CONTOURS = {
  1: { name: "Back Loaded", pct: [10, 15, 25, 50, 50, 75, 75, 100, 100, 100] },
  2: { name: "Front Loaded", pct: [100, 100, 100, 75, 75, 50, 50, 25, 15, 10] },
  3: { name: "Double Peak", pct: [25, 50, 100, 50, 25, 25, 50, 100, 50, 25] },
  4: { name: "Early Peak", pct: [25, 50, 100, 100, 75, 50, 50, 25, 15, 10] },
  5: { name: "Late Peak", pct: [10, 15, 25, 50, 50, 75, 100, 100, 50, 25] },
  6: { name: "Bell", pct: [10, 20, 40, 80, 100, 100, 80, 40, 20, 10] },
  7: { name: "Turtle", pct: [25, 50, 75, 100, 100, 100, 100, 75, 50, 25] },
};

const contour = (n) => PROJECT_CONTOURS[String(n).trim()] || null;

export function contourSlices(n) {
  const c = contour(n);
  if (!c) return null;
  const sum = c.pct.reduce((a, b) => a + b, 0);
  const out = [];
  for (const p of c.pct) out.push(p / sum / 2, p / sum / 2);
  return out;
}

export function contourCurveValues(n) {
  const s = contourSlices(n);
  if (!s) return null;
  const v = s.map((x) => Math.round(x * 1e6) / 1e4);
  // put the rounding remainder on the largest slice so the twenty sum to 100
  const rest = Math.round((100 - v.reduce((a, b) => a + b, 0)) * 1e4) / 1e4;
  if (rest) { const k = v.indexOf(Math.max(...v)); v[k] = Math.round((v[k] + rest) * 1e4) / 1e4; }
  return [0, ...v];
}

export function contourSpanFactor(n) {
  const c = contour(n);
  if (!c) return 1;
  return 1000 / c.pct.reduce((a, b) => a + b, 0);
}

export function contourName(n) {
  const c = contour(n);
  return c ? c.name : null;
}
