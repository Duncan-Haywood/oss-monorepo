// @ts-check
// How many bundles of shingles does a roof really take, and how much more does
// a hip roof waste than a gable? Every field shingle laid course by course on 16
// rectangular roofs (four house sizes at four pitches), each as a gable and as a
// hip, then counted against the roof's own surface and against the usual rule:
// squares x 3 bundles plus 10% for a gable, 15% for a hip (what roof.mjs's
// default waste orders).
//
// The shingle: a laminated ("architectural") shingle 39-3/8 x 13-1/4 in laid at
// a 5-5/8 in exposure, 22 to a bundle (33.8 sq ft exposed), a common size and
// count; every one of these is an input. Starter strip, ridge and hip cap are
// separate products and are not in the field count.
//
// The layout, on each plane (eave to ridge, the 12 in overhang included):
//   courses     bottom edges at 0, 5-5/8, 11-1/4 in ... up the slope until the ridge; the
//               top course is still whole shingles (cut to height, covered by the cap)
//   joints      every 39-3/8 in from a reference line, the line stepping 6-1/2 in per course
//               (a six-course stair-step, so joints in neighbouring courses are 6-1/2 in or more
//               apart); the reference is the left rake on a gable and the plane's centre on a hip
//   ends        a course's end piece is cut from a whole shingle. On a hip plane the course is
//               shorter by slope / slope factor at each end, so its end pieces are cut on the
//               diagonal; a piece is sized by its bottom edge, the longest
//   offcuts     "thrown": every offcut goes in the bin. "Reused": an offcut at least 6 in long
//               (its short side) fills a later end piece that fits in it, smallest fit first, over
//               the whole roof; a rectangle's leftover keeps the rest, a diagonal recut loses
//               another slope-run of shingle height
//
// Cutting waste only. Damaged shingles, mistakes, valleys, dormers, vents and the
// roofer's own pattern are not here.
//
//   node shingle-bench.mjs     # prints the tables quoted on how-many-bundles-of-shingles.html
import { pathToFileURL } from "node:url";

/** Footprints, outside of the walls, in feet: width (eave to eave) by length (along the ridge). */
export const HOUSES = /** @type {const} */ ([[24, 36], [28, 40], [32, 48], [36, 60]]);
export const PITCHES = /** @type {const} */ ([4, 6, 8, 10]);
export const OVERHANG = 12; // in, eaves and rakes

/** The shingle and its bundle, in inches. */
export const SHINGLE = /** @type {const} */ ({ length: 39.375, height: 13.25, exposure: 5.625, perBundle: 22, stagger: 6.5, staggerCourses: 6, minOffcut: 6 });

const EPS = 1e-9;

/** sqrt(1 + (pitch/12)^2): slope length per unit of run. @param {number} pitch */
export const slopeFactor = (pitch) => Math.sqrt(1 + (pitch / 12) ** 2);

/**
 * The planes of a rectangular roof with the same pitch all round, in inches.
 * Each: eave length, slope length, how much each end of a course shortens per inch up the
 * slope (0 on a gable; 1 / slope factor on a hip), where the joint reference sits, and how many.
 * @param {number} wFt @param {number} lenFt @param {number} pitch @param {"gable"|"hip"} shape
 */
export function planes(wFt, lenFt, pitch, shape) {
  const w = wFt * 12, len = lenFt * 12, k = slopeFactor(pitch);
  const slope = (w / 2 + OVERHANG) * k;
  if (shape === "gable") return [{ name: "side", eave: len + 2 * OVERHANG, slope, shrink: 0, ref: 0, count: 2 }];
  const shrink = 1 / k;
  return [
    { name: "side", eave: len + 2 * OVERHANG, slope, shrink, ref: (len + 2 * OVERHANG) / 2, count: 2 },
    { name: "end", eave: w + 2 * OVERHANG, slope, shrink, ref: (w + 2 * OVERHANG) / 2, count: 2 },
  ];
}

/** A plane's area in sq ft: a trapezoid (or triangle) of the eave and ridge lengths. @param {ReturnType<typeof planes>[number]} p */
export const planeArea = (p) => ((p.eave + Math.max(0, p.eave - 2 * p.shrink * p.slope)) / 2) * p.slope / 144;

/**
 * Every course's pieces on one plane: whole shingles and end pieces (length and whether cut on
 * the diagonal).
 * @param {ReturnType<typeof planes>[number]} p @param {typeof SHINGLE} s
 */
export function coursePieces(p, s = SHINGLE) {
  const out = [];
  for (let i = 0; i * s.exposure < p.slope - EPS; i++) {
    const y = i * s.exposure;
    const a = p.shrink * y, b = p.eave - p.shrink * y;
    if (b - a <= EPS) break;
    const ref = p.ref + (i % s.staggerCourses) * s.stagger;
    // joints at ref + j * length; the first joint at or left of a
    let x = ref - Math.ceil((ref - a) / s.length - EPS) * s.length;
    let whole = 0;
    const ends = [];
    const diag = p.shrink > 0;
    while (x < b - EPS) {
      const lo = Math.max(x, a), hi = Math.min(x + s.length, b);
      if (hi - lo > EPS) {
        const cutLeft = lo > x + EPS, cutRight = hi < x + s.length - EPS;
        if (!cutLeft && !cutRight) whole++;
        else ends.push({ length: hi - lo, diag });
      }
      x += s.length;
    }
    out.push({ course: i, whole, ends });
  }
  return out;
}

/**
 * Shingles for a set of end pieces. Thrown: one whole shingle each. Reused: offcuts at least
 * `minOffcut` long fill later pieces, smallest fit first.
 * @param {{ length: number, diag: boolean, slopeRun?: number }[]} ends @param {boolean} reuse @param {typeof SHINGLE} s
 */
export function endShingles(ends, reuse, s = SHINGLE) {
  if (!reuse) return ends.length;
  /** @type {number[]} */
  const pool = [];
  let n = 0;
  // Longest pieces first, so short ones fill the leftovers.
  for (const e of [...ends].sort((p, q) => q.length - p.length)) {
    let best = -1;
    for (let j = 0; j < pool.length; j++) if (pool[j] >= e.length - EPS && (best < 0 || pool[j] < pool[best])) best = j;
    if (best >= 0) {
      const left = pool[best] - e.length - (e.diag ? (e.slopeRun ?? 0) : 0);
      pool.splice(best, 1);
      if (left >= s.minOffcut - EPS) pool.push(left);
    } else {
      n++;
      const left = s.length - e.length;
      if (left >= s.minOffcut - EPS) pool.push(left);
    }
  }
  return n;
}

/**
 * One roof, counted.
 * @param {number} wFt @param {number} lenFt @param {number} pitch @param {"gable"|"hip"} shape @param {boolean} reuse
 */
export function count(wFt, lenFt, pitch, shape, reuse, s = SHINGLE) {
  let whole = 0, area = 0;
  const ends = [];
  const k = slopeFactor(pitch);
  for (const p of planes(wFt, lenFt, pitch, shape)) {
    area += planeArea(p) * p.count;
    for (let c = 0; c < p.count; c++) for (const course of coursePieces(p, s)) {
      whole += course.whole;
      // A diagonal recut from an offcut loses the shingle's height run along the eave.
      for (const e of course.ends) ends.push({ ...e, slopeRun: e.diag ? s.height / k : 0 });
    }
  }
  const shingles = whole + endShingles(ends, reuse, s);
  const bundles = Math.ceil(shingles / s.perBundle - EPS);
  const exposed = (s.length * s.exposure) / 144; // sq ft per shingle
  return { shingles, bundles, area, extra: (shingles * exposed) / area - 1, endPieces: ends.length };
}

/** The rule: squares x 3 bundles x (1 + waste), rounded up. @param {number} area sq ft @param {number} waste */
export const ruleBundles = (area, waste) => Math.ceil((area / 100) * 3 * (1 + waste) - EPS);

/** Every case: { w, len, pitch, gable: { thrown, reused, rule }, hip: { thrown, reused, rule } }. */
export function table() {
  const rows = [];
  for (const pitch of PITCHES) for (const [w, len] of HOUSES) {
    const row = { w, len, pitch };
    for (const [shape, waste] of /** @type {const} */ ([["gable", 0.1], ["hip", 0.15]])) {
      const thrown = count(w, len, pitch, shape, false), reused = count(w, len, pitch, shape, true);
      row[shape] = { thrown, reused, rule: ruleBundles(thrown.area, waste) };
    }
    rows.push(/** @type {{ w: number, len: number, pitch: number, gable: any, hip: any }} */ (row));
  }
  return rows;
}

/** Lowest, highest and mean of a list. @param {number[]} xs */
export function spread(xs) {
  return { min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((t, x) => t + x, 0) / xs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
  const rows = table();
  console.log("house | pitch | surface | gable thrown | gable reused | gable rule 10% | hip thrown | hip reused | hip rule 15%");
  for (const r of rows) {
    const g = r.gable, h = r.hip;
    console.log(`${r.w} x ${r.len} | ${r.pitch}:12 | ${Math.round(g.thrown.area)} | ${g.thrown.bundles} (${pct(g.thrown.extra)}) | ${g.reused.bundles} (${pct(g.reused.extra)}) | ${g.rule} | ${h.thrown.bundles} (${pct(h.thrown.extra)}) | ${h.reused.bundles} (${pct(h.reused.extra)}) | ${h.rule}`);
  }
  for (const shape of /** @type {const} */ (["gable", "hip"])) for (const way of /** @type {const} */ (["thrown", "reused"])) {
    const sp = spread(rows.map((r) => r[shape][way].extra));
    const short = rows.filter((r) => r[shape].rule < r[shape][way].bundles).length;
    const over = rows.map((r) => r[shape].rule - r[shape][way].bundles);
    console.log(`${shape} ${way}: ${pct(sp.min)} to ${pct(sp.max)}, mean ${pct(sp.mean)}; rule short on ${short}/${rows.length}; rule minus layout ${Math.min(...over)} to ${Math.max(...over)}`);
  }
}
