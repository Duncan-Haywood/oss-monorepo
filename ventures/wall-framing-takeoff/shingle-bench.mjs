// @ts-check
// How many bundles of shingles does a roof really take? The field shingles laid strip by strip,
// course by course, on 16 rectangular houses at four pitches, gable and hip, counted against the
// usual rule (roof area in squares x 3 bundles, plus 10% for a gable or 15% for a hip).
//
// The strip and its layout are typed, typical figures, not one maker's product or instructions:
//
//   strip        39-3/8 x 13-1/4 in laminated (architectural) strip, laid at 5-5/8 in exposure
//   bundle       22 strips (33.8 sq ft at that exposure); 3 bundles a square, as the rule assumes
//   courses      from the eave up, ceil(slope length / exposure) of them; the top one is cut down
//                and covered by the ridge or hip cap
//   offsets      each course starts 6 in further along than the one below, repeating every 6
//                courses (the first strip of a course is cut 0, 6, 12, 18, 24 or 30 in short)
//   ends         a gable's rake end is cut square; a hip plane's ends are cut along the hip line,
//                which moves in by (exposure / slope factor) every course
//
// Two ways of buying them:
//
//   offcuts thrown   every cut piece is taken from a new strip and what is left over is thrown away
//   offcuts reused   a piece shorter than a strip is cut from the shortest left-over piece it fits,
//                    across the whole roof, before a new strip is opened; a left-over piece counts
//                    only its shorter edge, so the wedge a hip cut leaves is lost
//
// Starter strip and hip and ridge cap are their own products and are left out of both counts,
// as they are of the rule. Cutting waste only: damaged bundles and mistakes are a separate allowance.
//
//   node shingle-bench.mjs     # prints the table quoted on shingle-bundles-for-a-roof.html
import { pathToFileURL } from "node:url";
import { slopeFactor } from "./roof.mjs";

export const STRIP = /** @type {const} */ ({ length: 39.375, height: 13.25, exposure: 5.625, perBundle: 22 });
export const OFFSETS = /** @type {const} */ ([0, 6, 12, 18, 24, 30]);
/** Footprints, outside of the walls, in feet: width (eave to eave) by length (along the ridge). The roof sheathing bench's houses. */
export const HOUSES = /** @type {const} */ ([[24, 36], [28, 40], [32, 48], [36, 60]]);
export const PITCHES = /** @type {const} */ ([4, 6, 8, 10]);
export const OVERHANG = 12; // in, at the eaves and the rakes
/** The rule: squares x 3 bundles x (1 + waste). 10% gable and 15% hip are the free roof calculator's defaults. */
export const RULE_WASTE = /** @type {const} */ ({ gable: 0.10, hip: 0.15 });
const EPS = 1e-9;

/**
 * The roof's planes, in inches: each has a slope length and, for a course whose bottom edge is y up
 * the slope, the course's length along the eave and whether its ends are hip cuts.
 * @param {number} w feet @param {number} len feet @param {number} pitch rise in 12 @param {"gable" | "hip"} shape
 */
export function planes(w, len, pitch, shape) {
  const W = w * 12, L = len * 12, o = OVERHANG, k = slopeFactor(pitch);
  const slope = (W / 2 + o) * k; // eave to ridge, along the roof, overhang included
  const inset = (/** @type {number} */ y) => y / k; // how far a hip line moves in along the eave, y up the slope
  if (shape === "gable") {
    const P = L + 2 * o;
    return [0, 1].map(() => ({ slope, k, hip: false, length: () => P }));
  }
  const side = { slope, k, hip: true, length: (/** @type {number} */ y) => L + 2 * o - 2 * inset(y) };
  const end = { slope, k, hip: true, length: (/** @type {number} */ y) => W + 2 * o - 2 * inset(y) };
  return [side, side, end, end];
}

/** Roof surface in sq ft, from the same planes (equals roof.mjs's own figure; the test checks). */
export function surface(w, len, pitch, /** @type {"gable" | "hip"} */ shape) {
  const W = w * 12, L = len * 12, o = OVERHANG, slope = (W / 2 + o) * slopeFactor(pitch);
  const area = shape === "gable" ? 2 * (L + 2 * o) * slope
    : 2 * ((L + 2 * o + (L - W)) / 2) * slope + 2 * ((W + 2 * o) / 2) * slope;
  return area / 144;
}

/**
 * The pieces each course needs, eave course first across every plane, then the next course up.
 * A piece is { length, wedge }: length along the strip's bottom edge, and for a hip cut the slant
 * over the strip's height (13-1/4 in / slope factor), 0 for a square cut.
 * @param {ReturnType<typeof planes>} ps
 */
export function courses(ps) {
  const S = STRIP.length, e = STRIP.exposure;
  const n = Math.max(...ps.map((p) => Math.ceil(p.slope / e - EPS)));
  /** @type {{ length: number, wedge: number }[][]} */
  const out = [];
  for (let c = 0; c < n; c++) {
    for (const p of ps) {
      if (c * e >= p.slope - EPS) continue;
      const run = p.length(c * e);
      if (run <= EPS) continue;
      const first = S - OFFSETS[c % OFFSETS.length];
      /** @type {{ length: number, wedge: number }[]} */
      const pieces = [];
      let left = run, start = true;
      while (left > EPS) {
        const want = start ? first : S;
        const piece = Math.min(left, want);
        left -= piece;
        pieces.push({ length: piece, wedge: p.hip && (start || left <= EPS) ? STRIP.height / p.k : 0 });
        start = false;
      }
      out.push(pieces);
    }
  }
  return out;
}

/**
 * Strips bought for a list of courses.
 * @param {{ length: number, wedge: number }[][]} cs @param {boolean} reuse
 */
export function strips(cs, reuse) {
  const S = STRIP.length;
  let bought = 0;
  /** @type {number[]} usable lengths of left-over pieces, kept sorted */
  const pool = [];
  for (const course of cs) for (const piece of course) {
    if (piece.length >= S - EPS) { bought++; continue; }
    if (reuse) {
      const i = pool.findIndex((u) => u >= piece.length - EPS);
      if (i >= 0) {
        const u = pool.splice(i, 1)[0];
        // What is left of a left-over piece after this one, measured on its shorter edge.
        // A hip cut from a piece that may already have one slanted edge loses the slant over the
        // strip's height as well (the worst way round); a square cut loses nothing.
        const rest = u - piece.length - piece.wedge;
        if (rest > EPS) insert(pool, rest);
        continue;
      }
    }
    bought++;
    if (reuse) insert(pool, S - piece.length);
  }
  return bought;
}

/** @param {number[]} xs @param {number} x */
function insert(xs, x) {
  let i = 0;
  while (i < xs.length && xs[i] < x) i++;
  xs.splice(i, 0, x);
}

/** Bundles by the rule: squares x 3 x (1 + waste), rounded up. */
export function ruleBundles(area, /** @type {"gable" | "hip"} */ shape) {
  return Math.ceil((area / 100) * 3 * (1 + RULE_WASTE[shape]) - EPS);
}

/**
 * One house, pitch and roof shape: the surface, the strips and bundles each way, the rule's bundles,
 * and the extra over the surface each way (strips x exposed area of a strip / surface - 1).
 */
export function measure(w, len, pitch, /** @type {"gable" | "hip"} */ shape) {
  const area = surface(w, len, pitch, shape);
  const cs = courses(planes(w, len, pitch, shape));
  const per = (STRIP.length * STRIP.exposure) / 144;
  const way = (/** @type {boolean} */ reuse) => {
    const n = strips(cs, reuse);
    return { strips: n, bundles: Math.ceil(n / STRIP.perBundle - EPS), extra: (n * per) / area - 1 };
  };
  return { area, rule: ruleBundles(area, shape), thrown: way(false), reused: way(true) };
}

/** Every case: { w, len, pitch, gable, hip }. */
export function table() {
  const rows = [];
  for (const pitch of PITCHES) for (const [w, len] of HOUSES) {
    rows.push({ w, len, pitch, gable: measure(w, len, pitch, "gable"), hip: measure(w, len, pitch, "hip") });
  }
  return rows;
}

/** Lowest, highest and mean of a list. @param {number[]} xs */
export function spread(xs) {
  return { min: Math.min(...xs), max: Math.max(...xs), mean: xs.reduce((s, x) => s + x, 0) / xs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
  const rows = table();
  console.log("house | pitch | squares | gable rule | gable thrown | gable reused | hip rule | hip thrown | hip reused");
  for (const r of rows) {
    const f = (/** @type {ReturnType<typeof measure>} */ m) => `${m.rule} | ${m.thrown.bundles} (${pct(m.thrown.extra)}) | ${m.reused.bundles} (${pct(m.reused.extra)})`;
    console.log(`${r.w} x ${r.len} | ${r.pitch}:12 | ${(r.gable.area / 100).toFixed(2)} | ${f(r.gable)} | ${f(r.hip)}`);
  }
  for (const shape of /** @type {const} */ (["gable", "hip"])) for (const k of /** @type {const} */ (["thrown", "reused"])) {
    const s = spread(rows.map((r) => r[shape][k].extra));
    const short = rows.filter((r) => r[shape].rule < r[shape][k].bundles).length;
    const over = rows.map((r) => r[shape].rule - r[shape][k].bundles);
    console.log(`${shape} ${k}: ${pct(s.min)} to ${pct(s.max)}, mean ${pct(s.mean)}; rule short on ${short} of ${rows.length}; rule minus counted ${Math.min(...over)} to ${Math.max(...over)} bundles`);
  }
}
