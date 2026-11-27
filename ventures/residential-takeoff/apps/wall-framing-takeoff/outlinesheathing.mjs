// @ts-check
// Roof sheathing in courses for the all-hip roof over ANY square-cornered outline
// (roofoutline.mjs, hiproof.mjs), the roof the rafters in hipframe.mjs sit on.
//
// Every plane of that roof rises from one eave side. A point inside the eave line is on
// the plane of the eave side its L-infinity distance is measured to (hiproof.mjs,
// hipframe.mjs). So the plane of side i, cut by the line parallel to side i at plan
// depth d inside it, is the stretch of that line where side i is nearest:
//
//   along side i from (its start - d) to (its end + d)       (L-infinity distance d to side i)
//   less every stretch where another side j is nearer than d (the line inside side j's
//                                                             rectangle grown by d)
//
// Two sides on one line facing the same way (a U's two arms, a step that comes back to
// the same wall line) are one plane where both are at distance d; the earlier side
// takes that part, so no area is counted twice.
//
// That is exact. Sheathing runs in courses of the sheet's width up the slope from the
// eave edge, long edges along the eave, as roof.mjs lays a gable or hip roof: course c
// covers plan depths c x w / k to (c + 1) x w / k, k = sqrt(1 + (pitch / 12)^2). Each
// piece of a course is the full length that course needs at any depth inside it (hips
// shorten a course towards its top, valleys lengthen it), so a piece is a rectangle
// that covers its part of the plane, cut at 45 degrees in plan on site.
//
// Two ways the offcuts go back on the roof:
//
// - Hip offcuts fill valley corners. Where a course ends at a hip (its end moves in one
//   plan inch per inch of depth through the whole band), the 45-degree cut leaves a right
//   triangle, legs b along the course and w up the slope (b the band's plan depth, w the
//   course width), right angle at the top of the piece's end. Where a course ends at a
//   valley (its end moves out the same way), the rectangle that reaches the course's top
//   length is b longer than the course's bottom; cut it to the bottom length instead and
//   the missing corner is the same triangle, right angle at the top of the rectangle's
//   end, hypotenuse along the valley. A hip at a course's right end leaves exactly the
//   triangle a valley at another course's left end needs, by translation alone (no
//   flipping, so the sheet's face stays up), and left hips fill right valleys, when the
//   two bands have the same depth. The joint between triangle and rectangle runs up the
//   slope, like every end joint here.
// - Leftover hip offcuts start a hip end of another course. The triangle cut off a right
//   hip end, turned end for end in the plane of the sheet (face still up, long edges still
//   along the eave), is exactly the corner another course of the same band needs at its
//   right hip end: right angle at the bottom of the run's end, hypotenuse along the hip. The
//   rectangle there then stops at the course's top length instead of its bottom length, so
//   it is b shorter and leaves no triangle of its own. Left hips likewise. Valley corners
//   take hip offcuts first (a valley fill costs no triangle, a hip start costs the one that
//   end would have given); the hip starts are kept only when they save a sheet.
// - A wider course's triangle, cut down, serves a narrower course. Every hip offcut has the same
//   shape (legs b and b x k), so one cut parallel to the long edge of a triangle from a band B,
//   keeping its right-angle corner, is the corner a band b <= B needs, for a valley fill or a hip
//   start. The narrower courses are the top course of each plane, whose band is what is left of
//   the plane's depth, so they rarely match another course's band. Same-band triangles are matched
//   first (deepest band first, each taking the narrowest triangle at least as deep), and the
//   cut-down layout is kept only when it saves a sheet; the strip trimmed off is waste.
// - Narrow top courses share sheets. Pieces are cut by length from strips of each course
//   width (the lumber optimiser), and the strips are then ripped from sheets across
//   widths, first-fit decreasing, kerf between strips: never more sheets than ripping
//   each width from its own sheets.
//
// End joints on rafters (given the framing, `o.frame` from hipframe.mjs). A rafter there
// stands square to its eave side at a station along it and covers the depths where the
// plane is on that line. A course's joints go only where a rafter's run overlaps the
// course's band: from the end the run is laid from, each piece reaches the farthest such
// station within a sheet length (at least 12 in on), as roof.mjs lays a gable plane, and
// alternate courses up a plane start with a piece of at most half a sheet so joints do
// not line up. Where no station is in reach the piece is a sheet length and the joint is
// listed as off a rafter (block it); so is the vertical joint behind a valley-corner fill
// unless a rafter happens to be there.
//
// Hip offcuts beyond both needs, valley offcuts and length offcuts are not
// reused, so the count is still an upper bound. Without the framing, end joints are not
// placed on rafters.
// The exact sloped area is the eave line's plan area times k (roofoutline.mjs); the
// courses' covered area is checked against it.
import { EPS, THICK, optimizeStock, formatInches } from "./engine.mjs";
import { SHEET, slopeFactor } from "./roof.mjs";

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ x: number, length: number, offcut?: "left" | "right", hip?: boolean, cutFrom?: number }} Piece offcut: a hip offcut filling the corner at that end of its run (not cut from a sheet); hip: that end is a hip (the triangle is widest at the bottom), else a valley; cutFrom: the triangle was cut down from a wider course's (its length along that course) */
/** @typedef {{ x: number, onRafter: boolean, fill?: boolean }} Joint an end joint at x along the course; fill: the joint behind a valley-corner fill */
/** @typedef {{ y: number, width: number, pieces: Piece[], joints?: Joint[] }} Course joints only when laid on the framing's rafters */
/** @typedef {{ plane: number, y: number, x: number, fill: boolean, size: string, nailer: number, block: number, bayKnown: boolean }} JointBlock the framing under one end joint with no rafter: a nailer the course wide under the joint, carried on a block between the rafters at each end */

const TOL = 1e-7;

/**
 * Side i of a counter-clockwise eave line as a frame: origin at its start, `t` along it,
 * `n` the inward normal (left of the direction of travel).
 * @param {Pt[]} p @param {number} i
 */
function frame(p, i) {
  const a = p[i], b = p[(i + 1) % p.length];
  const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  return { a, len, ux, uy, nx: -uy, ny: ux };
}

/**
 * The stretches (t0, t1) of side i's plane at plan depth d: the line at depth d inside
 * side i, along t, where no other side is nearer than d. Exact (open intervals removed).
 * @param {Pt[]} p counter-clockwise eave line @param {number} i @param {number} d inches, > 0
 * @returns {[number, number][]}
 */
export function planeSection(p, i, d) {
  const f = frame(p, i);
  /** @type {[number, number][]} */
  let keep = [[-d, f.len + d]];
  const ox = f.a.x + f.nx * d, oy = f.a.y + f.ny * d; // the line: (ox, oy) + t (ux, uy)
  const off = f.a.x * f.nx + f.a.y * f.ny;
  for (let j = 0; j < p.length; j++) {
    if (j === i) continue;
    const a = p[j], b = p[(j + 1) % p.length];
    const g = frame(p, j);
    if (Math.abs(g.nx - f.nx) < TOL && Math.abs(g.ny - f.ny) < TOL && Math.abs(a.x * g.nx + a.y * g.ny - off) < 1e-6) {
      // a side on the same line, facing the same way: one plane. Where both are at distance d the earlier
      // side has it, so the shared part is counted once.
      if (j > i) continue;
      const t0 = (a.x - f.a.x) * f.ux + (a.y - f.a.y) * f.uy, t1 = (b.x - f.a.x) * f.ux + (b.y - f.a.y) * f.uy;
      keep = cut(keep, Math.min(t0, t1) - d - TOL, Math.max(t0, t1) + d + TOL);
      if (!keep.length) break;
      continue;
    }
    // side j's rectangle grown by d (open): the points nearer than d to side j in L-infinity
    const x0 = Math.min(a.x, b.x) - d, x1 = Math.max(a.x, b.x) + d, y0 = Math.min(a.y, b.y) - d, y1 = Math.max(a.y, b.y) + d;
    let lo = -Infinity, hi = Infinity;
    for (const [o, u, m0, m1] of /** @type {[number, number, number, number][]} */ ([[ox, f.ux, x0, x1], [oy, f.uy, y0, y1]])) {
      if (Math.abs(u) < TOL) { if (!(o > m0 + TOL && o < m1 - TOL)) { lo = Infinity; hi = -Infinity; } continue; }
      const s0 = (m0 - o) / u, s1 = (m1 - o) / u;
      lo = Math.max(lo, Math.min(s0, s1)); hi = Math.min(hi, Math.max(s0, s1));
    }
    if (!(hi - lo > TOL)) continue;
    keep = cut(keep, lo, hi);
    if (!keep.length) break;
  }
  // a kept stretch never crosses the eave line (every point of it is a side's, and that side is
  // nearer than d there), so its middle says whether all of it is inside
  return keep.filter(([s, e]) => e - s > 1e-6 && inside(p, ox + f.ux * (s + e) / 2, oy + f.uy * (s + e) / 2));
}

/** The stretches less (lo, hi). @param {[number, number][]} keep @param {number} lo @param {number} hi */
function cut(keep, lo, hi) {
  /** @type {[number, number][]} */
  const next = [];
  for (const [s, e] of keep) {
    if (hi <= s || lo >= e) { next.push([s, e]); continue; }
    if (lo > s + TOL) next.push([s, lo]);
    if (hi < e - TOL) next.push([hi, e]);
  }
  return next;
}

/** Even-odd inside test against the sides along y. @param {Pt[]} p @param {number} x @param {number} y */
function inside(p, x, y) {
  let c = false;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (Math.abs(a.x - b.x) <= TOL && (a.y > y) !== (b.y > y) && a.x > x) c = !c;
  }
  return c;
}

/** The deepest plan depth (in) at which side i's plane has any width: bisection on a monotone test. @param {Pt[]} p @param {number} i */
export function planeDepth(p, i) {
  let lo = 0, hi = 1;
  const any = (/** @type {number} */ d) => planeSection(p, i, d).length > 0;
  if (!any(1e-6)) return 0;
  while (any(hi)) hi *= 2;
  for (let k = 0; k < 80 && hi - lo > 1e-9; k++) { const m = (lo + hi) / 2; if (any(m)) lo = m; else hi = m; }
  return lo;
}

// Samples are taken this far (in) off a band's ends and off the depths where roof lines meet: a
// level ridge ends a plane's section in a jump, and the depth of that ridge carries float error.
const OFF = 1e-4;

/** Plan area (sq in) of side i's plane between depths d0 and d1: Simpson's rule on each straight run, split at the depths where the section changes. */
function bandArea(/** @type {Pt[]} */ p, /** @type {number} */ i, /** @type {number} */ d0, /** @type {number} */ d1, /** @type {number[]} */ breaks) {
  const w = (/** @type {number} */ d) => planeSection(p, i, d).reduce((t, [s, e]) => t + e - s, 0);
  const cuts = [d0, ...breaks.filter((b) => b > d0 + 2 * OFF && b < d1 - 2 * OFF), d1];
  let a = 0;
  for (let k = 0; k + 1 < cuts.length; k++) { const u = cuts[k], v = cuts[k + 1]; a += (v - u) * (w(u + OFF) + 4 * w((u + v) / 2) + w(v - OFF)) / 6; }
  return a;
}

/**
 * The pieces one course needs on side i's plane between plan depths d0 and d1: the
 * stretches at every depth in the band, merged where they overlap, so each piece covers
 * its whole part of the band. The section's ends move in straight lines between the
 * depths in `breaks` (where the roof's lines meet), so the band's ends and those depths
 * hold every extreme.
 * @param {Pt[]} p @param {number} i @param {number} d0 @param {number} d1 @param {number[]} breaks
 */
function coursePieces(p, i, d0, d1, breaks) {
  const ds = [d0 + OFF, d1 - OFF, ...breaks.filter((b) => b > d0 + OFF && b < d1 - OFF).flatMap((b) => [b - OFF, b + OFF])];
  // a sample between each pair, in case a stretch lives only inside the band
  const sorted = [...new Set(ds)].sort((m, n) => m - n);
  for (let k = 0; k + 1 < sorted.length; k++) ds.push((sorted[k] + sorted[k + 1]) / 2);
  const all = ds.flatMap((d) => planeSection(p, i, d)).sort((m, n) => m[0] - n[0]);
  /** @type {[number, number][]} */
  const merged = [];
  for (const [s, e] of all) { const last = merged[merged.length - 1]; if (last && s <= last[1] + 1e-6) last[1] = Math.max(last[1], e); else merged.push([s, e]); }
  return merged;
}

/**
 * How run [s, e] of a course ends: at each sample depth in the band exactly one stretch
 * overlaps the run, and its start (end) moves one plan inch per inch of depth, in at a hip,
 * out at a valley, through the whole band (the samples hold every depth where it could turn).
 * @param {Pt[]} p @param {number} i @param {number} d0 @param {number} d1 @param {number[]} breaks @param {number} s @param {number} e
 * @returns {{ left: "hip" | "valley" | null, right: "hip" | "valley" | null }}
 */
export function runEnds(p, i, d0, d1, breaks, s, e) {
  const ds = [d0 + OFF, (d0 + d1) / 2, d1 - OFF, ...breaks.filter((b) => b > d0 + OFF && b < d1 - OFF).flatMap((b) => [b - OFF, b + OFF])];
  /** @type {[number, number, number][]} */
  const at = [];
  for (const d of ds) {
    const hit = planeSection(p, i, d).filter(([a, b]) => b > s + 1e-6 && a < e - 1e-6);
    if (hit.length !== 1) return { left: null, right: null };
    at.push([d - d0, hit[0][0], hit[0][1]]);
  }
  const band = d1 - d0, TOLD = 1e-3;
  // does the edge (1: start, 2: end) move by `dir` plan inches per inch of depth from `edge` at the bottom?
  const moves = (/** @type {number} */ edge, /** @type {1 | 2} */ k, /** @type {number} */ dir) => at.every(([u, a, b]) => Math.abs((k === 1 ? a : b) - (edge + dir * u)) < TOLD);
  // a hip pulls the edge in (the run is widest at the bottom); a valley pushes it out (widest at the top)
  return {
    left: moves(s, 1, 1) ? "hip" : moves(s + band, 1, -1) ? "valley" : null,
    right: moves(e, 2, -1) ? "hip" : moves(e - band, 2, 1) ? "valley" : null,
  };
}

/** Pieces of a run laid in sheet lengths from one end. @param {number} s @param {number} e @param {number} len @param {boolean} fromRight */
function layRun(s, e, len, fromRight) {
  /** @type {Piece[]} */
  const out = [];
  if (fromRight) {
    let at = e;
    while (at - s > 1e-6) { const l = Math.min(at - s, len); out.unshift({ x: Math.round((at - l) * 16) / 16, length: Math.round(l * 16) / 16 }); at -= l; }
  } else {
    let at = s;
    while (e - at > 1e-6) { const l = Math.min(e - at, len); out.push({ x: Math.round(at * 16) / 16, length: Math.round(l * 16) / 16 }); at += l; }
  }
  return out;
}

/**
 * Pieces of a run with every end joint on a rafter station where one is in reach.
 * @param {number} s @param {number} e @param {number} len sheet length @param {boolean} fromRight
 * @param {number[]} stations rafter stations (t) that cover this course, sorted
 * @param {number} lead the first piece's longest length (half a sheet on staggered courses; `len` otherwise)
 * @param {number[]} [below] the joints (t) of the course below: a station there is taken only when no other is in reach
 * @returns {{ pieces: Piece[], joints: { t: number, on: boolean }[] }}
 */
export function layRunOnRafters(s, e, len, fromRight, stations, lead, below = []) {
  // lay from the left in a mirrored frame when the run starts at its right end
  const sg = fromRight ? -1 : 1;
  const a0 = fromRight ? -e : s, a1 = fromRight ? -s : e;
  const st = stations.map((x) => sg * x).sort((m, n) => m - n);
  const bl = below.map((x) => sg * x);
  const free = (/** @type {number} */ x) => !bl.some((b) => Math.abs(b - x) < 1 / 16);
  /** @type {{ t: number, on: boolean }[]} */
  const cuts = [];
  let at = a0;
  for (;;) {
    // the short lead only where the run needs a joint anyway (longer than a sheet)
    const lim = !cuts.length && a1 - a0 > len + 1e-6 ? Math.min(lead, len) : len;
    if (a1 - at <= lim + 1e-6) break;
    // in reach: at least 12 in on, at most the piece's length, short of the run's end; best is one that leaves
    // no sliver (12 in or more) at the end and does not line up with the course below
    const reach = st.filter((x) => x > at + 12 - 1e-6 && x <= at + lim + 1e-6 && x < a1 - 1e-6);
    const roomy = reach.filter((x) => x <= a1 - 12 + 1e-6);
    const next = roomy.filter(free).pop() ?? roomy.pop() ?? reach.filter(free).pop() ?? reach.pop();
    if (next == null) { cuts.push({ t: at + lim, on: false }); at += lim; } else { cuts.push({ t: next, on: true }); at = next; }
  }
  /** @type {Piece[]} */
  const pieces = [];
  let prev = a0;
  for (const x of [...cuts.map((c) => c.t), a1]) {
    const lo = fromRight ? -x : prev, hi = fromRight ? -prev : x;
    pieces.push({ x: Math.round(lo * 16) / 16, length: Math.round((hi - lo) * 16) / 16 });
    prev = x;
  }
  if (fromRight) pieces.reverse();
  return { pieces, joints: cuts.map((c) => ({ t: sg * c.t, on: c.on })) };
}

/**
 * Rip strips of several widths from sheets, first-fit decreasing, kerf between strips.
 * @param {number[]} widths @param {number} sheetW @param {number} kerf
 * @returns {number[][]} the strips' widths on each sheet
 */
export function ripStrips(widths, sheetW, kerf) {
  /** @type {{ ws: number[], used: number }[]} */
  const bins = [];
  for (const w of [...widths].sort((a, b) => b - a)) {
    const bin = bins.find((b) => b.used + kerf + w <= sheetW + EPS);
    if (bin) { bin.ws.push(w); bin.used += kerf + w; } else bins.push({ ws: [w], used: w });
  }
  return bins.map((b) => b.ws);
}

/** A price as dollars and cents. @param {number} v */
const money = (v) => `$${v.toFixed(2)}`;

/**
 * Weigh the hip starts' blocks against the sheets they save. Each hip start adds an end joint, and on the framing
 * that joint often has no rafter under it, so it is blocked (a nailer the course wide on two blocks between the
 * rafters). With the framing and both prices typed, each layout is priced as sheets x sheet price + blocked joints x
 * blocked-joint price and the cheapest kept; a tie keeps the simpler one (no starts first, then same-band starts).
 * Returns null when there is nothing to weigh (no framing, a price missing, or no layout with starts), so the sheet
 * count decides as before.
 * @template {{ count: number, starts: number, blocks: unknown[] }} T
 * @param {{ price?: number, blockedJointPrice?: number }} sheet @param {unknown} fr @param {T} plain @param {(T | null)[]} tried
 * @returns {{ use: T, sheetPrice: number, blockedJointPrice: number, saved: number, added: number } | null}
 */
export function weighStarts(sheet, fr, plain, tried) {
  const sp = sheet.price, bp = sheet.blockedJointPrice;
  if (!fr || typeof sp !== "number" || typeof bp !== "number") return null;
  const withStarts = /** @type {T[]} */ (tried.filter((t) => t && t.starts > 0));
  if (!withStarts.length) return null;
  const cost = (/** @type {T} */ t) => t.count * sp + t.blocks.length * bp;
  let use = plain;
  for (const t of withStarts) if (cost(t) < cost(use) - 1e-9) use = t;
  return { use, sheetPrice: sp, blockedJointPrice: bp, saved: (plain.count - use.count) * sp, added: (use.blocks.length - plain.blocks.length) * bp };
}

/** Most re-layouts the start-by-start weighing tries (each is a full layout and cut of the roof). */
export const START_TRIES = 48;

/**
 * Weigh hip starts one at a time, after weighStarts has weighed whole layouts. From the cheapest layout with starts
 * (sheets x sheet price + blocked joints x blocked-joint price), each start in turn is barred and the roof laid again
 * the same way; the bar is kept when the layout gets cheaper (another end may take the freed triangle), and the
 * search goes again from the start until no single bar helps or `START_TRIES` re-layouts are spent. The result is
 * the cheapest of that and whole.use, so it never costs more than the whole-layout weighing, nor than no starts.
 * @template {{ count: number, starts: number, blocks: unknown[], startEnds: { r: unknown, flag: "fillL" | "fillR" }[] }} T
 * @param {{ use: T, sheetPrice: number, blockedJointPrice: number, saved: number, added: number }} whole weighStarts' result
 * @param {{ count: number, blocks: unknown[] }} plain the layout with no starts
 * @param {(T | null)[]} tried the layouts with starts weighStarts was given
 * @param {(from: T, ban: { r: unknown, flag: "fillL" | "fillR" }[]) => T} relay lay `from`'s way again with these ends barred from starting
 * @returns {{ use: T, sheetPrice: number, blockedJointPrice: number, saved: number, added: number, dropped: number }}
 */
export function weighStartsOneByOne(whole, plain, tried, relay) {
  const sp = whole.sheetPrice, bp = whole.blockedJointPrice;
  const cost = (/** @type {T} */ t) => t.count * sp + t.blocks.length * bp;
  const starting = /** @type {T[]} */ (tried.filter((t) => t && t.starts > 0)).sort((a, b) => cost(a) - cost(b))[0];
  let best = whole.use, dropped = 0;
  if (starting && sp > 0) {
    let cur = starting, tries = 0;
    /** @type {{ r: unknown, flag: "fillL" | "fillR" }[]} */
    let ban = [];
    for (let again = true; again && tries < START_TRIES;) {
      again = false;
      for (const e of cur.startEnds) {
        if (tries >= START_TRIES) break;
        tries++;
        const next = relay(starting, [...ban, e]);
        if (cost(next) < cost(cur) - 1e-9) { ban = [...ban, e]; cur = next; again = true; break; }
      }
    }
    if (ban.length && cost(cur) < cost(best) - 1e-9) { best = cur; dropped = ban.length; }
  }
  if (best === whole.use) return { ...whole, dropped: 0 };
  // saved and added are against the layout with no starts, as weighStarts gives them
  return { use: best, sheetPrice: sp, blockedJointPrice: bp, saved: (plain.count - best.count) * sp, added: (best.blocks.length - plain.blocks.length) * bp, dropped };
}

/**
 * Sheathing courses for an outline roof.
 * @param {{ ok: boolean, eaveLine: Pt[], pitch: number, lines: { z0: number, z1: number }[], slopedSqFt: number }} ro outlineRoof result
 * @param {{ sheet?: { width?: number, length?: number, price?: number, blockedJointPrice?: number }, kerf?: number, hipStarts?: boolean, crossBands?: boolean, frame?: { ok: boolean, id?: string, spacing?: number, rafterSize?: string, rafters?: { plane: number, x0: number, y0: number, x1: number, y1: number }[] } | null }} [o]
 *   frame: frameOutlineRoof's result for the same outline; with it end joints go on its rafters and courses are staggered
 *   hipStarts: false keeps leftover hip offcuts off other courses' hip ends (default true; they are used only when they save a sheet)
 *   crossBands: false reuses a hip offcut only in a course of its own band (default true: a wider course's triangle may be cut down for a narrower one, kept only when it saves a sheet)
 *   sheet.price and sheet.blockedJointPrice (both typed, with the framing): hip starts are kept only when the sheets they
 *   save cost more than the blocking they add under joints with no rafter (a nailer and two blocks each, and the
 *   labour: the blocked-joint price is yours); without both, a start is kept whenever it saves a sheet
 */
export function sheatheOutlineRoof(ro, o = {}) {
  if (!ro || !ro.ok) return { ok: false, errors: ["No roof outline to sheathe."] };
  if (ro.eaveLine.some((a, i) => { const b = ro.eaveLine[(i + 1) % ro.eaveLine.length]; return a.x !== b.x && a.y !== b.y; })) return { ok: false, errors: ["The outline has angled sides; sheathing courses are laid out on square-cornered outlines only (the squares are still given)."] };
  const sheet = { ...SHEET, ...(o.sheet || {}) };
  const kerf = o.kerf ?? 0.125;
  if (!(sheet.width > 0 && sheet.length > 0 && sheet.width <= 96 && sheet.length <= 192)) return { ok: false, errors: ["Sheet width and length must be positive inches (at most 96 by 192)."] };
  for (const kk of /** @type {("price" | "blockedJointPrice")[]} */ (["price", "blockedJointPrice"])) {
    const v = /** @type {any} */ (sheet)[kk];
    if (v != null && !(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000)) return { ok: false, errors: [`The roof sheet's ${kk === "price" ? "price" : "blocked-joint price"} (sheet.${kk}) must be a number from 0 to 10000.`] };
  }
  const p = ro.eaveLine, k = slopeFactor(ro.pitch), rise = ro.pitch / 12;
  // depths (plan inches) where the roof's lines meet: the section's ends change direction only there
  // and where any plane runs out: two sides on one line facing the same way are one plane split between
  // them by a 45-degree line no roof line marks (planeSection), and where that line meets a hip the earlier
  // side's share ends and the other side's section turns, a kink between the roof lines' depths
  const depths = p.map((_, i) => planeDepth(p, i));
  const breaks = [...new Set([...ro.lines.flatMap((l) => [l.z0 / rise, l.z1 / rise]), ...depths].map((d) => Math.round(d * 1e6) / 1e6))].filter((d) => d > OFF).sort((m, n) => m - n);
  const bandW = sheet.width / k; // plan depth one course covers
  // pass 1: every course's runs and how each end meets the roof
  /** @type {{ side: number, eaveIn: number, depthIn: number, slopeIn: number, courses: { y: number, width: number, band: number, d0: number, d1: number, runs: { s: number, e: number, left: string | null, right: string | null, fillL: boolean, fillR: boolean, srcL?: number, srcR?: number }[] }[] }[]} */
  const draft = [];
  let exact = 0;
  for (let i = 0; i < p.length; i++) {
    const f = frame(p, i);
    const depth = depths[i];
    if (depth <= 1e-6) continue;
    const courses = [];
    for (let c = 0; c * bandW < depth - 1e-6; c++) {
      const d0 = c * bandW, d1 = Math.min(depth, (c + 1) * bandW);
      const width = Math.round((d1 - d0) * k * 16) / 16;
      const runs = coursePieces(p, i, d0, d1, breaks).map(([s0, e0]) => ({ s: s0, e: e0, ...runEnds(p, i, d0, d1, breaks, s0, e0), fillL: false, fillR: false }));
      courses.push({ y: Math.round(d0 * k * 16) / 16, width, band: d1 - d0, d0, d1, runs });
      exact += bandArea(p, i, d0, d1, breaks) * k;
    }
    draft.push({ side: i + 1, eaveIn: f.len, depthIn: depth, slopeIn: depth * k, courses });
  }
  const area = ro.slopedSqFt;
  if (Math.abs(exact / 144 - area) > 1e-3 * Math.max(1, area)) return { ok: false, errors: [`The planes' areas (${(exact / 144).toFixed(2)} sq ft) disagree with the eave line's sloped area (${area.toFixed(2)} sq ft); please report the outline.`] };
  // the framing's rafters (o.frame), each as its station t along its eave side and the depths its run covers
  const fr = o.frame && o.frame.ok && Array.isArray(o.frame.rafters) ? o.frame : null;
  /** @type {Map<number, { t: number, r0: number, r1: number }[]>} */
  const rafterRuns = new Map();
  if (fr) for (const r of fr.rafters) {
    if (!(r.plane >= 0 && r.plane < p.length)) continue;
    const f = frame(p, r.plane);
    const T = (/** @type {number} */ x, /** @type {number} */ y) => (x - f.a.x) * f.ux + (y - f.a.y) * f.uy;
    const D = (/** @type {number} */ x, /** @type {number} */ y) => (x - f.a.x) * f.nx + (y - f.a.y) * f.ny;
    const d0 = D(r.x0, r.y0), d1 = D(r.x1, r.y1);
    const list = rafterRuns.get(r.plane) || [];
    list.push({ t: T(r.x0, r.y0), r0: Math.min(d0, d1), r1: Math.max(d0, d1) });
    rafterRuns.set(r.plane, list);
  }
  /** Rafter stations on side i whose run overlaps the band d0..d1. @param {number} i @param {number} d0 @param {number} d1 */
  const stationsFor = (i, d0, d1) => [...new Set((rafterRuns.get(i) || []).filter((q) => Math.min(q.r1, d1) - Math.max(q.r0, d0) > 1e-3).map((q) => Math.round(q.t * 1e6) / 1e6))].sort((m, n) => m - n);
  const key = (/** @type {number} */ b) => String(Math.round(b * 1e4));
  /** A fill's triangle came from a wider course: the band (plan depth along the course) it was cut down from. @param {number | undefined} src @param {number} band */
  const cutFrom = (src, band) => (src != null && key(src) !== key(band) ? { cutFrom: Math.round(src * 16) / 16 } : {});
  // lay every course's runs (with the corner fills assigned so far): a run is laid from its hip end when only
  // its right end is a hip, so the piece there is the one that holds the hip's triangle
  const layout = () => draft.map((pl) => { let below = /** @type {number[]} */ ([]); return pl.courses.map((c, ci) => {
    const st = fr ? stationsFor(pl.side - 1, c.d0, c.d1) : null;
    const onAt = (/** @type {number} */ t) => !!st && st.some((x) => Math.abs(x - t) < 1 / 16);
    /** @type {Piece[]} */
    const pieces = [];
    /** @type {{ t: number, on: boolean, fill?: boolean }[]} */
    const joints = [];
    const ends = [];
    for (const r of c.runs) {
      const s0 = r.fillL ? r.s + c.band : r.s, e0 = r.fillR ? r.e - c.band : r.e;
      const fromRight = r.right === "hip" && r.left !== "hip";
      const own = e0 - s0 <= 1e-6 ? { pieces: [], joints: [] }
        : st ? layRunOnRafters(s0, e0, sheet.length, fromRight, st, ci % 2 ? sheet.length / 2 : sheet.length, below)
        : { pieces: layRun(s0, e0, sheet.length, fromRight), joints: [] };
      if (r.fillL) { pieces.push({ x: Math.round(r.s * 16) / 16, length: Math.round(c.band * 16) / 16, offcut: "left", ...(r.left === "hip" ? { hip: true } : {}), ...cutFrom(r.srcL, c.band) }); if (own.pieces.length) joints.push({ t: s0, on: onAt(s0), fill: true }); }
      pieces.push(...own.pieces);
      joints.push(...own.joints);
      if (r.fillR) { if (own.pieces.length) joints.push({ t: e0, on: onAt(e0), fill: true }); pieces.push({ x: Math.round(e0 * 16) / 16, length: Math.round(c.band * 16) / 16, offcut: "right", ...(r.right === "hip" ? { hip: true } : {}), ...cutFrom(r.srcR, c.band) }); }
      ends.push({ r, first: own.pieces[0], last: own.pieces[own.pieces.length - 1] });
    }
    below = joints.map((j) => j.t);
    return { pieces, joints, ends };
  }); });
  // hip offcuts: the piece at a hip end holds the triangle when it is at least the band long and that end is not
  // itself started with a triangle. Pool "R" (right hips' triangles) fills left valleys and starts right hips;
  // pool "L" fills right valleys and starts left hips, band for band.
  const supplyOf = (/** @type {ReturnType<typeof layout>} */ lay) => {
    /** @type {Map<string, { L: number, R: number, b: number }>} */
    const m = new Map();
    draft.forEach((pl, pi) => pl.courses.forEach((c, ci) => {
      const sv = m.get(key(c.band)) || { L: 0, R: 0, b: c.band };
      for (const { r, first, last } of lay[pi][ci].ends) {
        if (r.left === "hip" && !r.fillL && first && first.length >= c.band - 1e-6) sv.L++;
        if (r.right === "hip" && !r.fillR && last && last.length >= c.band - 1e-6) sv.R++;
      }
      m.set(key(c.band), sv);
    }));
    return m;
  };
  /** @typedef {{ s: number, e: number, left: string | null, right: string | null, fillL: boolean, fillR: boolean, srcL?: number, srcR?: number }} Run */
  /** Every pool's spare triangles as their bands, narrowest first. @param {ReturnType<typeof supplyOf>} m */
  const avail = (m) => {
    /** @type {{ L: number[], R: number[] }} */
    const av = { L: [], R: [] };
    for (const v of m.values()) for (const pool of /** @type {("L" | "R")[]} */ (["L", "R"])) for (let n = 0; n < v[pool]; n++) av[pool].push(v.b);
    av.L.sort((m1, n1) => m1 - n1); av.R.sort((m1, n1) => m1 - n1);
    return av;
  };
  /**
   * Take a triangle for a course of band `band` out of `list` (narrowest first): one of the same band, or with
   * `cross` the narrowest one at least that deep, cut down. A triangle cut off at a hip is similar for every band
   * (legs b along the course and b x k up the slope), so a wider one trimmed by one cut parallel to its long edge,
   * keeping its right-angle corner, is the narrower course's corner exactly. Returns the band it came from, or null.
   * @param {number[]} list @param {number} band @param {boolean} cross
   */
  const take = (list, band, cross) => {
    const kb = key(band);
    const at = list.findIndex((b) => key(b) === kb || (cross && b >= band - 1e-6));
    return at < 0 ? null : list.splice(at, 1)[0];
  };
  /** Every run with its course's band, deepest band first (draft order within a band: full bands differ in the last bits). */
  const runsByBand = () => draft.flatMap((pl) => pl.courses.flatMap((c) => c.runs.map((r) => ({ r, band: c.band })))).sort((m1, n1) => Math.round(n1.band * 1e4) - Math.round(m1.band * 1e4));
  const blockSize = fr && typeof fr.rafterSize === "string" ? fr.rafterSize : null;
  // hip ends kept from starting by the start-by-start weighing below (a run object and its side's flag)
  /** @type {Set<Run>} */
  const noStartL = new Set();
  /** @type {Set<Run>} */
  const noStartR = new Set();
  const barred = (/** @type {Run} */ r, /** @type {"fillL" | "fillR"} */ flag) => (flag === "fillL" ? noStartL : noStartR).has(r);
  const spacing = fr && Number(fr.spacing) > 0 ? Number(fr.spacing) : null;
  /**
   * Lay the courses with valley fills, and with hip starts when `hs`, then cut and rip the pieces. With `cross`
   * a course may take a wider course's triangle cut down, not only one of its own band.
   * @param {boolean} hs @param {boolean} cross
   */
  const pack = (hs, cross) => {
    for (const pl of draft) for (const c of pl.courses) for (const r of c.runs) { r.fillL = false; r.fillR = false; delete r.srcL; delete r.srcR; }
    let lay = layout();
    const sv0 = supplyOf(lay);
    const av = avail(sv0);
    for (const { r, band } of runsByBand()) {
      if (r.left === "valley" && take(av.R, band, cross) != null) r.fillL = true;
      if (r.right === "valley" && take(av.L, band, cross) != null) r.fillR = true;
    }
    if (hs) {
      /** The hip ends on `pool`'s side, with whether each gives a triangle of its own. @param {"L" | "R"} pool */
      const hipEnds = (pool) => {
        /** @type {{ r: Run, flag: "fillL" | "fillR", band: number, donor: boolean }[]} */
        const ends = [];
        draft.forEach((pl, pi) => pl.courses.forEach((c, ci) => {
          for (const { r, first, last } of lay[pi][ci].ends) {
            if (pool === "R" && r.right === "hip") ends.push({ r, flag: "fillR", band: c.band, donor: !!last && last.length >= c.band - 1e-6 });
            if (pool === "L" && r.left === "hip") ends.push({ r, flag: "fillL", band: c.band, donor: !!first && first.length >= c.band - 1e-6 });
          }
        }));
        return ends;
      };
      // the rectangle left once this end takes the triangle must have length
      const room = (/** @type {{ r: Run, band: number }} */ q) => q.r.e - q.r.s - q.band * (1 + (q.r.fillL ? 1 : 0) + (q.r.fillR ? 1 : 0)) > 1e-6;
      for (const pool of /** @type {("L" | "R")[]} */ (["L", "R"])) {
        const all = hipEnds(pool);
        for (const kk of sv0.keys()) {
          // same band: first the ends too short to give a triangle, then every other one that can
          // (each of those gives up its own triangle, so at most half the spare ones start)
          const ends = all.filter((q) => key(q.band) === kk);
          let spare = av[pool].filter((b) => key(b) === kk).length, used = 0;
          for (const q of ends) if (!q.donor && spare > 0 && room(q) && !barred(q.r, q.flag)) { q.r[q.flag] = true; spare--; used++; }
          let pairs = Math.floor(spare / 2);
          ends.filter((q) => q.donor).forEach((q, n) => { if (n % 2 === 1 && pairs > 0 && room(q) && !barred(q.r, q.flag)) { q.r[q.flag] = true; pairs--; used += 2; } });
          for (; used > 0; used--) av[pool].splice(av[pool].findIndex((b) => key(b) === kk), 1);
        }
        if (!cross) continue;
        // then a wider course's leftover triangle, cut down, at a narrower course's hip end (the top courses, whose
        // bands are what is left of each plane's depth, so rarely the same): ends that give no triangle first;
        // one that gives one gives it up, so it starts only while its own is still spare
        const open = all.filter((q) => !q.r[q.flag]).sort((m1, n1) => Number(m1.donor) - Number(n1.donor) || n1.band - m1.band);
        for (const q of open) {
          if (!room(q) || barred(q.r, q.flag) || !av[pool].some((b) => b > q.band + 1e-6)) continue;
          if (q.donor) {
            const own = av[pool].findIndex((b) => key(b) === key(q.band));
            if (own < 0) continue;
            av[pool].splice(own, 1);
          }
          if (take(av[pool], q.band, true) != null) q.r[q.flag] = true;
        }
      }
    }
    // a fill shortens its run, which can shorten the hip piece of that run: lay again until every fill has its
    // triangle, valley corners first and then hip starts, deepest band first, dropping the fills left without
    // one (each pass only drops fills, so this ends)
    let supply;
    for (;;) {
      lay = layout();
      supply = supplyOf(lay);
      const left = avail(supply);
      let over = false;
      const order = runsByBand();
      for (const kind of ["valley", "hip"]) for (const { r, band } of order) {
        // a valley corner takes the other side's hip triangle (by translation), a hip start its own side's (turned)
        for (const [f, side, pool, src] of /** @type {["fillL" | "fillR", "left" | "right", "L" | "R", "srcL" | "srcR"][]} */ (kind === "valley" ? [["fillL", "left", "R", "srcL"], ["fillR", "right", "L", "srcR"]] : [["fillL", "left", "L", "srcL"], ["fillR", "right", "R", "srcR"]])) {
          if (!r[f] || r[side] !== kind) continue;
          const got = take(left[pool], band, cross);
          if (got == null) { r[f] = false; delete r[src]; over = true; } else r[src] = got;
        }
      }
      if (!over) break;
    }
    // the fills' sources are known now: lay once more so the pieces say which were cut down
    if (cross) lay = layout();
    let filled = 0, starts = 0, hipOffcuts = 0, cutDown = 0;
    /** @type {{ r: Run, flag: "fillL" | "fillR" }[]} */
    const startEnds = [];
    for (const v of supply.values()) hipOffcuts += v.L + v.R;
    for (const pl of draft) for (const c of pl.courses) for (const r of c.runs) {
      for (const [f, side, src] of /** @type {["fillL" | "fillR", "left" | "right", "srcL" | "srcR"][]} */ ([["fillL", "left", "srcL"], ["fillR", "right", "srcR"]])) if (r[f]) {
        if (r[side] === "hip") { starts++; startEnds.push({ r, flag: f }); } else filled++;
        const from = r[src];
        if (from != null && key(from) !== key(c.band)) cutDown++;
      }
    }
    // the pieces
    const planes = [];
    /** @type {{ width: number, pieces: Piece[] }[]} */
    const byCourse = [];
    let covered = 0, onRafters = 0, offRafters = 0, offFills = 0, lined = 0;
    /** @type {JointBlock[]} */
    const blocks = [];
    draft.forEach((pl, pi) => {
      /** @type {Course[]} */
      const courses = [];
      pl.courses.forEach((c, ci) => {
        const { pieces, joints } = lay[pi][ci];
        const cut = pieces.filter((q) => !q.offcut);
        courses.push({ y: c.y, width: c.width, pieces, ...(fr ? { joints: joints.map((j) => ({ x: Math.round(j.t * 16) / 16, onRafter: j.on, ...(j.fill ? { fill: true } : {}) })) } : {}) });
        byCourse.push({ width: c.width, pieces: cut });
        covered += c.width * cut.reduce((t, q) => t + q.length, 0) + pieces.filter((q) => q.offcut).reduce((t, q) => t + c.width * q.length / 2, 0);
        for (const j of joints) { if (j.on) onRafters++; else { offRafters++; if (j.fill) offFills++; } }
        if (fr && blockSize) {
          // the bay a joint with no rafter falls in: the nearest station on each side whose run covers this course
          const st = stationsFor(pl.side - 1, c.d0, c.d1);
          for (const j of joints.filter((q) => !q.on)) {
            const lo = st.filter((x) => x < j.t - 1 / 16).pop(), hi = st.find((x) => x > j.t + 1 / 16);
            const bay = lo != null && hi != null ? hi - lo : spacing;
            if (bay == null || !(bay - THICK >= THICK)) continue;
            blocks.push({ plane: pl.side, y: c.y, x: Math.round(j.t * 16) / 16, fill: !!j.fill, size: blockSize, nailer: c.width, block: Math.round((bay - THICK) * 16) / 16, bayKnown: lo != null && hi != null });
          }
        }
        if (ci > 0) lined += joints.filter((j) => lay[pi][ci - 1].joints.some((q) => Math.abs(q.t - j.t) < 1 / 16)).length;
      });
      planes.push({ side: pl.side, eaveIn: pl.eaveIn, depthIn: pl.depthIn, slopeIn: pl.slopeIn, courses });
    });
    let pieceCount = 0;
    const rows = [];
    /** @type {number[]} */
    const strips = [];
    for (const w of [...new Set(byCourse.map((c) => c.width))].sort((m, n) => n - m)) {
      const ps = byCourse.filter((c) => Math.abs(c.width - w) < EPS).flatMap((c) => c.pieces);
      if (!ps.length) continue;
      const res = optimizeStock(ps.map((q) => ({ length: q.length, qty: 1 })), [{ length: sheet.length, price: 1 }], kerf);
      pieceCount += ps.length;
      for (let b = 0; b < res.bars.length; b++) strips.push(w);
      rows.push({ width: w, strips: res.bars.length, pieces: ps.length, ownSheets: Math.ceil(res.bars.length / Math.max(1, Math.floor((sheet.width + kerf) / (w + kerf)))) });
    }
    const bins = ripStrips(strips, sheet.width, kerf);
    return { planes, byCourse, covered, onRafters, offRafters, offFills, lined, blocks, pieceCount, rows, bins, count: bins.length, filled, starts, hipOffcuts, cutDown, startEnds, hs, cross };
  };
  // each way is laid in full and the fewest sheets kept; a tie keeps the simpler one (no cut-down triangles, no starts)
  const cross = o.crossBands !== false;
  const better = (/** @type {ReturnType<typeof pack>} */ a, /** @type {ReturnType<typeof pack> | null} */ b) => (b && b.count < a.count ? b : a);
  const plainSame = pack(false, false);
  const plain = better(plainSame, cross ? pack(false, true) : null);
  const triedSame = o.hipStarts === false ? null : pack(true, false);
  const triedCross = o.hipStarts === false || !cross ? null : pack(true, true);
  const tried = triedSame ? better(triedSame, triedCross) : null;
  // hip starts add a joint each (often off a rafter), so they are worth it only for a sheet saved; with the framing
  // and both prices typed, only when the sheets they save cost more than the blocking they add (weighStarts)
  const whole = weighStarts(sheet, fr, plain, [triedSame, triedCross]);
  const counted = tried && tried.starts && tried.count < plain.count ? tried : plain;
  // then start by start (weighStartsOneByOne): a start whose blocks cost more than its share of the sheets is dropped,
  // even when the layout as a whole pays (or does not pay) for its blocks
  const weigh = whole ? weighStartsOneByOne(whole, plain, [triedSame, triedCross], (t, ban) => {
    noStartL.clear(); noStartR.clear();
    for (const b of ban) (b.flag === "fillL" ? noStartL : noStartR).add(/** @type {Run} */ (b.r));
    const out = pack(t.hs, t.cross);
    noStartL.clear(); noStartR.clear();
    return out;
  }) : null;
  const use = weigh ? weigh.use : counted;
  // the same reuse with only same-band triangles, to say what cutting wider ones down saves
  const sameOnly = triedSame && triedSame.starts && triedSame.count < plainSame.count ? triedSame : plainSame;
  const { planes, byCourse, covered, onRafters, offRafters, offFills, lined, blocks, pieceCount, rows, bins, count, filled, starts, hipOffcuts, cutDown } = use;
  const ripBins = bins.filter((b) => !(b.length === 1 && b[0] >= sheet.width - EPS));
  /** @type {Map<string, { widths: number[], count: number }>} */
  const pat = new Map();
  for (const b of ripBins) { const kk = b.join("+"); const r = pat.get(kk) || { widths: b, count: 0 }; r.count++; pat.set(kk, r); }
  const rips = [...pat.values()];
  const unpooled = rows.reduce((t, r) => t + r.ownSheets, 0);
  const sheetSqFt = sheet.width * sheet.length / 144;
  const notes = [
    `Roof sheathing on the all-hip roof from the outline: ${planes.length} planes in ${byCourse.length} courses of ${formatInches(sheet.width)} up the slope from the eave edge, ${pieceCount} pieces cut from ${count} sheets of ${sheet.width} x ${sheet.length} in for ${area.toFixed(0)} sq ft (${count ? (100 * (1 - area / (count * sheetSqFt))).toFixed(1) : "0.0"}% offcut).`,
    `Each piece is the full length its course needs anywhere up that course (a hip shortens a course towards its top), cut at 45 degrees in plan on site.${fr ? "" : " End joints are not placed on rafters and courses are not staggered."}`,
  ];
  /** @type {number | null} */
  let looseCount = null;
  if (fr) {
    const total = onRafters + offRafters;
    const loose = sheatheOutlineRoof(ro, { ...o, frame: null });
    const extra = loose.ok && "sheets" in loose ? count - loose.sheets.count : 0;
    looseCount = loose.ok && "sheets" in loose ? loose.sheets.count : null;
    notes.push(`End joints on the rafters: ${onRafters} of ${total} joint${total === 1 ? "" : "s"} land on a rafter centre, alternate courses up each plane starting with at most half a sheet so joints do not line up${lined ? ` (${lined} still share a rafter with the course below, where a short run leaves no other choice)` : ""}; ${extra > 0 ? `${extra} more sheet${extra === 1 ? "" : "s"} than cutting at sheet lengths regardless of the rafters` : extra < 0 ? `${-extra} fewer sheet${extra === -1 ? "" : "s"} than cutting at sheet lengths regardless of the rafters` : "the same sheet count as cutting at sheet lengths regardless of the rafters"}.${offRafters ? ` ${offRafters} ${offRafters === 1 ? "has" : "have"} no rafter under ${offRafters === 1 ? "it" : "them"}${offFills ? ` (${offFills} behind a corner fill)` : ""}: block ${offRafters === 1 ? "it" : "each"} between the rafters or move ${offRafters === 1 ? "it" : "them"} by hand.` : ""}`);
  }
  if (blocks.length) {
    const guessed = blocks.filter((b) => !b.bayKnown).length;
    notes.push(`Blocking under the ${blocks.length} end joint${blocks.length === 1 ? "" : "s"} with no rafter${offFills ? ` (${blocks.filter((b) => b.fill).length} behind a corner fill)` : ""}: a ${blockSize} nailer the course wide on edge under each joint, carried on a ${blockSize} block between the rafters at each end (cut the nailer to fit between them), ${blocks.length} nailer${blocks.length === 1 ? "" : "s"} and ${2 * blocks.length} blocks in the lumber order${guessed ? `; ${guessed} bay${guessed === 1 ? " has" : "s have"} a rafter on one side only (a hip or valley closes it), so ${guessed === 1 ? "its blocks are" : "their blocks are"} listed at the rafter spacing less one thickness: cut to fit` : ""}. Check the blocking and nailing against your roof sheathing schedule.`);
  }
  const left = hipOffcuts - filled - starts;
  if (filled) notes.push(`${filled} valley corner${filled === 1 ? " is" : "s are"} filled with the triangle cut off at a hip in a course of the same width (same shape, face up, no flipping)${starts ? "" : `; ${left} hip offcut${left === 1 ? " is" : "s are"} left over`}.`);
  const addedBlocks = (/** @type {ReturnType<typeof pack>} */ t) => t.blocks.length - plain.blocks.length;
  const blockText = (/** @type {number} */ n) => (n > 0 ? `${n} more joint${n === 1 ? "" : "s"} with no rafter to block` : n < 0 ? `${-n} fewer joint${n === -1 ? "" : "s"} with no rafter to block` : "no more joints with no rafter to block");
  const sheetsText = (/** @type {number} */ n) => `${n} sheet${n === 1 ? "" : "s"}`;
  if (starts) notes.push(`${starts} hip end${starts === 1 ? " starts" : "s start"} with a hip offcut from another course of the same width${cutDown ? " or a wider one cut down" : ""}, turned end for end (face up, long edges along the eave), so the sheet there stops at the course's top length: ${sheetsText(plain.count - count)} fewer${fr ? `, ${blockText(addedBlocks(use))}` : ""}${weigh ? ` (${money(weigh.saved)} of sheets at ${money(weigh.sheetPrice)} a sheet against ${money(weigh.added)} of blocking at ${money(weigh.blockedJointPrice)} a joint)` : ""}; ${left} hip offcut${left === 1 ? " is" : "s are"} left over.${weigh && weigh.dropped ? ` ${weigh.dropped} hip end${weigh.dropped === 1 ? " is" : "s are"} not started though ${weigh.dropped === 1 ? "it" : "they"} could be: weighed one at a time, leaving each out makes the roof cheaper at these prices (the blocking it adds costs more than the sheets it saves).` : ""}`);
  else if (weigh && counted !== plain) notes.push(`Starting hip ends with the leftover hip offcuts would save ${sheetsText(plain.count - counted.count)} (${money((plain.count - counted.count) * weigh.sheetPrice)} at ${money(weigh.sheetPrice)} a sheet) but leave ${blockText(addedBlocks(counted))} (${money(addedBlocks(counted) * weigh.blockedJointPrice)} at ${money(weigh.blockedJointPrice)} a joint), so they are not used: the sheets they save cost no more than the blocking they add.`);
  else if (tried && tried.starts) notes.push(`Starting hip ends with the leftover hip offcuts would save no sheet here, so they are not used (each would add a joint).`);
  if (cutDown) notes.push(`${cutDown} of the triangle${cutDown === 1 ? "s placed is" : "s placed are"} cut down from a wider course's hip offcut for a narrower (top) course: every hip offcut has the same shape (legs in the ratio of the slope), so one cut parallel to its long edge, keeping the right-angle corner, gives the narrower corner; the strip trimmed off is waste. ${sameOnly.count - count} sheet${sameOnly.count - count === 1 ? "" : "s"} fewer than reusing same-width offcuts only.`);
  if (!filled && !starts) notes.push("Hip offcuts are not reused here (no valley corner of a matching course, and starting hip ends with them saves no sheet), so the sheet count is an upper bound.");
  if (ripBins.length) notes.push(`Courses narrower than a sheet are ripped from ${ripBins.length} sheet${ripBins.length === 1 ? "" : "s"}, strips of different widths sharing a sheet: ${rips.map((r) => `${r.count} sheet${r.count === 1 ? "" : "s"} of ${ripText(r.widths)}`).join(", ")}${unpooled > count ? `; ripping each width from its own sheets would take ${unpooled - count} more` : ""}.`);
  notes.push("Length offcuts and the hip offcuts not placed are not reused, so the count is an upper bound.");
  return { ok: true, errors: [], sheet: { width: sheet.width, length: sheet.length }, planes, sheets: { count, rows, rips, unpooled, valleyFills: filled, hipStarts: starts, hipOffcuts, cutDown, withoutHipStarts: plain.count, withoutCutDown: sameOnly.count, startsWeighed: weigh ? { sheetPrice: weigh.sheetPrice, blockedJointPrice: weigh.blockedJointPrice, sheetsSaved: plain.count - count, blocksAdded: use.blocks.length - plain.blocks.length, countedSheets: counted.count, countedBlocks: counted.blocks.length, startsDropped: weigh.dropped } : null, joints: fr ? { onRafters, offRafters, offRafterFills: offFills, linedUp: lined, looseSheets: looseCount } : null, blocks, area, coveredSqFt: covered / 144, waste: count ? 1 - area / (count * sheetSqFt) : 0 }, notes };
}

/**
 * Cut rows for takeoff(plan, cuts), in roofCuts' shape: the nailers and blocks under the end joints with no rafter,
 * so they join the lumber order and the material list.
 * @param {ReturnType<typeof sheatheOutlineRoof>} s @param {string} [id] the roof's name in the cut list
 */
export function outlineSheathingCuts(s, id = "Roof") {
  if (!s || !s.ok || !("sheets" in s)) return [];
  /** @type {Map<string, { size: string, length: number, kind: string, qty: number, walls: string[] }>} */
  const map = new Map();
  const add = (/** @type {string} */ size, /** @type {number} */ length, /** @type {string} */ kind, /** @type {number} */ n) => {
    const key = `${size}|${length}|${kind}`;
    const row = map.get(key) || { size, length, kind, qty: 0, walls: [id] };
    row.qty += n;
    map.set(key, row);
  };
  for (const b of s.sheets.blocks || []) {
    add(b.size, b.nailer, "sheathing nailer", 1);
    add(b.size, b.block, "sheathing block", 2);
  }
  return [...map.values()];
}

/** "2 x 21" + 3-9/16"": a sheet's strips, equal widths counted. @param {number[]} ws */
function ripText(ws) {
  /** @type {[number, number][]} */
  const g = [];
  for (const w of ws) { const last = g[g.length - 1]; if (last && Math.abs(last[0] - w) < EPS) last[1]++; else g.push([w, 1]); }
  return g.map(([w, n]) => (n > 1 ? `${n} x ${formatInches(w)}` : formatInches(w))).join(" + ");
}

/** Text lines for the CLI. @param {ReturnType<typeof sheatheOutlineRoof>} s */
export function outlineSheathingText(s) {
  if (!s.ok || !("planes" in s)) return [];
  const out = [`  Roof sheathing (all-hip, from outline): ${s.sheets.count} sheets for ${s.sheets.area.toFixed(0)} sq ft (${(100 * s.sheets.waste).toFixed(1)}% offcut)`];
  for (const pl of s.planes) {
    out.push(`    Plane ${pl.side} (eave side ${formatInches(pl.eaveIn)}, ${formatInches(pl.slopeIn)} up the slope):`);
    for (const c of pl.courses) {
      const off = (c.joints || []).filter((j) => !j.onRafter);
      out.push(`      course at ${formatInches(c.y)} (${formatInches(c.width)} wide): ${c.pieces.map((q) => q.offcut ? `[hip offcut ${formatInches(q.length)}${q.cutFrom ? `, cut down from ${formatInches(q.cutFrom)}` : ""}]` : formatInches(q.length)).join(" + ")}${off.length ? `; block the joint${off.length === 1 ? "" : "s"} at ${off.map((j) => formatInches(j.x)).join(", ")} (no rafter)` : ""}`);
    }
  }
  const bl = s.sheets.blocks || [];
  if (bl.length) {
    const sizes = [...new Set(bl.map((b) => b.size))].join(", ");
    out.push(`    Blocking under joints with no rafter (${sizes}, in the lumber order): ${bl.length} nailer${bl.length === 1 ? "" : "s"} the course wide and ${2 * bl.length} blocks between the rafters (${[...new Set(bl.map((b) => formatInches(b.block)))].join(", ")})`);
  }
  return out;
}
