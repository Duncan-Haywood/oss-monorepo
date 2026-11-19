// Bar sizes, bend radii, mass and cut lengths for a bar bending schedule.
//
// Sources and what each number rests on (README, "Spec sources"):
// - Minimum scheduling radius r: BS 8666 table of minimum scheduling radii,
//   r = 2d for bars up to 16 mm and 3.5d for 20 mm and over (12, 16, 20, 24,
//   32, 70, 87, 112, 140, 175 mm for 6 to 50 mm bars). The table is copied
//   below as published, not computed, so a test can pin it.
// - Mass per metre: steel at 7850 kg/m3 on the nominal cross-section,
//   pi d^2 / 4 x 7850 / 1e6 = 0.006165 d^2 kg/m (the usual d^2/162 rule).
// - Shape codes 00, 11, 21 and 51: the total-length formulas as printed on
//   UK fabricators' BS 8666 shape-code charts. Each bent shape is also
//   computed from first principles (straight legs plus arcs along the bar's
//   centreline, from outside dimensions), and the tests check the chart
//   formula against that geometry, so a misprinted formula would fail.
// - Shape 'R' (ours, not a BS code): any bar whose bends are all 90 degrees
//   in one plane, legs given as outside dimensions; its length is the exact
//   centreline length from the geometry.

export const SIZES = [6, 8, 10, 12, 16, 20, 25, 32, 40, 50];

// Minimum scheduling radius (mm) by nominal size, as BS 8666 tabulates it.
export const MIN_RADIUS = { 6: 12, 8: 16, 10: 20, 12: 24, 16: 32, 20: 70, 25: 87, 32: 112, 40: 140, 50: 175 };

export function massPerMetre(d) {
  return (Math.PI * d * d / 4) * 7850 / 1e6;
}

// Length lost at one 90-degree bend when the legs are outside dimensions:
// each leg's straight part stops r + d short of the outside corner, and the
// arc along the centreline has radius r + d/2.
export function bendDeduction90(d, r) {
  return 2 * (r + d) - (Math.PI / 2) * (r + d / 2);
}

// Exact centreline length of a bar of `legs` (outside dimensions, mm) joined
// by 90-degree bends of inside radius r, all in one plane.
export function rightAngleLength(legs, d, r) {
  const sum = legs.reduce((s, x) => s + x, 0);
  return sum - (legs.length - 1) * bendDeduction90(d, r);
}

// The shapes the schedule accepts. `dims` lists the dimensions the shape
// needs, `length(dims, d, r)` the total (cut) length before rounding, and
// `legs(dims, d, r)` the outside legs for the geometric check, where the
// shape is a 90-degree polyline.
export const SHAPES = {
  '00': {
    name: 'Straight bar',
    dims: ['A'],
    length: ({ A }) => A,
  },
  '11': {
    name: 'L-bar (one 90 degree bend)',
    dims: ['A', 'B'],
    length: ({ A, B }, d, r) => A + B - 0.5 * r - d,
    legs: ({ A, B }) => [A, B],
  },
  '21': {
    name: 'U-bar (two 90 degree bends)',
    dims: ['A', 'B', 'C'],
    length: ({ A, B, C }, d, r) => A + B + C - r - 2 * d,
    legs: ({ A, B, C }) => [A, B, C],
  },
  '51': {
    name: 'Closed link with hooks (A, B outside, C hook leg)',
    dims: ['A', 'B', 'C'],
    length: ({ A, B, C }, d, r) => 2 * (A + B + C) - 2.5 * r - 5 * d,
  },
  R: {
    name: '90 degree shape by geometry (legs A, B, C, ... outside)',
    dims: ['A', 'B'],
    variadic: true,
    length: (dims, d, r) => rightAngleLength(legsOf(dims), d, r),
    legs: dims => legsOf(dims),
  },
};

function legsOf(dims) {
  return ['A', 'B', 'C', 'D', 'E', 'F'].map(k => dims[k]).filter(v => Number.isFinite(v) && v > 0);
}

export function radiusFor(d, override) {
  if (Number.isFinite(override) && override > 0) return override;
  const r = MIN_RADIUS[d];
  if (r == null) throw new Error(`No minimum radius for a ${d} mm bar; give the radius.`);
  return r;
}

// Cut length of one bar: the shape's total length rounded up to `round` mm.
export function cutLength(shape, dims, d, { radius, round = 25 } = {}) {
  const s = SHAPES[shape];
  if (!s) throw new Error(`Shape code ${shape} is not supported (use 00, 11, 21, 51 or R).`);
  for (const k of s.dims) if (!(Number.isFinite(dims[k]) && dims[k] > 0)) throw new Error(`Shape ${shape} needs dimension ${k}.`);
  const r = radiusFor(d, radius);
  const exact = s.length(dims, d, r);
  if (!(exact > 0)) throw new Error(`Shape ${shape} with these dimensions has no length.`);
  const step = round > 0 ? round : 1;
  return { exact, cut: Math.ceil(exact / step - 1e-9) * step, r };
}
