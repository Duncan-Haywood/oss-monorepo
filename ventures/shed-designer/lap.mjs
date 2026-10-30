// @ts-check
// Horizontal lap siding: fiber cement (HardiePlank-type) and engineered wood
// (LP SmartSide-type) planks over OSB sheathing and a weather-resistive barrier.
//
// Each wall face is laid out in courses from a starter strip at the bottom of
// the siding up to the plate (eave walls) or the rake (gable walls). Every
// course shows the product's exposure; the top course is ripped to fit. A run
// longer than one plank is split at butt joints, and each joint sits on the
// centre of a stud (or other full-height framing), with joints in the course
// above and below kept at least `stagger` away (in stud bays, per maker). Openings cut a course where they
// cover its whole exposed face and notch it where they cover part. The figures
// in LAP_PRODUCTS are from the makers' install guides cited there.

import { fmtIn } from './lumber.mjs';

/**
 * @typedef {{ label: string, short: string, width: number, exposure: number, thickness: number, length: number,
 *   staggerBays: (spacing: number) => number, minPiece: number, jointGap: number, jointFlashing: boolean, nail: string,
 *   clearance: number, starterWidth: number, source: string }} LapProduct
 */

/**
 * The two products, from their makers' install guides:
 * - James Hardie, "HardiePlank Lap Siding" install instructions HS11119
 *   (effective December 2019; the newest we could read), as hosted by Home
 *   Depot: https://images.thdstatic.com/catalog/pdfImages/d8/d8e5c4e7-8d56-4098-8c70-4cb1d36aeb90.pdf
 *   (coverage chart p.4: 8-1/4" plank at 7" exposure, 12 ft planks; min.
 *   1-1/4" overlap; studs max 24" o.c. or 7/16" OSB; WRB required; 1-1/4"
 *   starter strip; planks in moderate contact at butt joints, which need joint
 *   flashing, caulk or an H jointer (IRC R703.10.2); blind nail 3/4" to 1"
 *   from the top, 3/8" from the ends, galvanized or stainless; 6" above
 *   grade). James Hardie's installer advice puts butt joints on studs and two
 *   stud bays apart course to course at 16" o.c. (one at 24"):
 *   https://www.jameshardie.com/blog/for-siding-pros/tips-for-installing-james-hardie-lap-siding/
 *   Tech Bulletin 9 gives 6" wide joint flashing lapping the course below by 1".
 * - LP, "SmartSide Primed Lap Siding" application instructions LPZB0515
 *   (12/08/2023): 38 Series lap direct to studs at max. 16" o.c., or over
 *   7/16" structural sheathing at 24"; WRB required; 3/8" x 1-1/2" starter;
 *   min. 1" overlap; blind nail 3/8" from the ends and 3/4" from the top,
 *   0.092" hot-dip galvanized nails into studs 1-1/2"; butt joints staggered
 *   course to course with a 3/16" gap, sealed or over 4" pan flashing; 6"
 *   above grade; paint within 180 days. The 2014 edition says joints must
 *   occur over studs. Actual size 0.315" x 7.844" from Lowe's listing of the
 *   16 ft plank (model 25797).
 * Neither product braces a wall (IRC Table R602.10.4 lists wood structural
 * panels, not lap siding), so this tool always puts OSB under it.
 * @type {Record<string, LapProduct>}
 */
export const LAP_PRODUCTS = {
  'fiber cement': {
    label: 'Fiber cement lap (HardiePlank-type), 8-1/4" x 12 ft, 7" exposure',
    short: 'fiber cement lap',
    width: 8.25,
    exposure: 7,
    thickness: 5 / 16,
    length: 144,
    staggerBays: (spacing) => (spacing <= 16 ? 2 : 1),
    minPiece: 12,
    jointGap: 0,
    jointFlashing: true,
    nail: '8d (2-1/2") hot-dipped galvanized siding nails, blind-nailed 3/4" to 1" down from the top edge and 3/8" from each end, into every stud',
    clearance: 6,
    starterWidth: 1.25,
    source: 'James Hardie HardiePlank install instructions (HS11119)',
  },
  'LP SmartSide lap': {
    label: 'Engineered wood lap (LP SmartSide-type), 8" x 12 or 16 ft, 6-13/16" exposure',
    short: 'engineered wood lap',
    width: 7.844,
    exposure: 6.8125,
    thickness: 0.315,
    length: 192,
    staggerBays: () => 1,
    minPiece: 12,
    jointGap: 3 / 16,
    jointFlashing: true,
    nail: '8d (2-1/2") hot-dipped galvanized siding nails, blind-nailed at least 3/4" down from the top edge and 3/8" from each end, into every stud',
    clearance: 6,
    starterWidth: 1.5,
    source: 'LP SmartSide primed lap siding application instructions (LPZB0515)',
  },
};

/** Plank lengths sold, by product, with their shopping-list keys. */
export const LAP_STOCKS = {
  'fiber cement': [{ length: 144, key: 'lapHardie' }],
  'LP SmartSide lap': [{ length: 144, key: 'lapLP12' }, { length: 192, key: 'lapLP16' }],
};

/** The plank lengths this design may buy: those in its board lengths, or all of them when none is ticked. @param {any} d */
export function lapStocks(d) {
  const all = LAP_STOCKS[d.sidingType] || [];
  const ticked = all.filter((x) => d.lengths.includes(x.length / 12));
  return ticked.length ? ticked : all;
}

/** How far apart butt joints in neighbouring courses must be, in inches. @param {any} d */
export const lapStagger = (d) => LAP_PRODUCTS[d.sidingType].staggerBays(d.studSpacing) * d.studSpacing;

/**
 * The exposure to lay at, as installers set it with a story pole: no more than
 * the maker's, and even, so that the top course on the long walls is a full
 * plank whose top edge meets the plate rather than a strip ripped to fit.
 * The story pole is marked at each course's height from the bottom, rounded to 1/16".
 * @param {LapProduct} spec @param {number} height bottom of the siding to the top of the plates
 */
export function evenExposure(spec, height) {
  if (!(height > spec.width)) return spec.exposure;
  const n = Math.ceil((height - spec.width) / spec.exposure - 1e-9) + 1;
  return (height - spec.width) / (n - 1);
}

/** @param {string} type */
export const isLap = (type) => Object.prototype.hasOwnProperty.call(LAP_PRODUCTS, type);

/**
 * @typedef {{ s0: number, s1: number, z0: number, z1: number }} Box
 * @typedef {{ wall: string, len: number, bottom: number, top: (s: number) => number, peakAt?: number,
 *   from: number, to: number, holes: Box[], wood: Box[], maxPlank: number, stagger: number }} Face
 * @typedef {{ wall: string, course: number, zb: number, a: number, b: number, len: number, rake: boolean, notched: boolean, pts: [number, number][] }} LapPiece
 */

const EPS = 1e-6;
const WALL_WORD = { front: 'front', back: 'back', left: 'left end', right: 'right end' };

/** Wood behind both plank ends at x, all the way up the band z0..z1 (sampled every inch). */
export function backed(wood, x, z0, z1, half = 0.75) {
  for (let z = z0; z <= z1 + EPS; z += Math.max(0.5, Math.min(1, z1 - z0))) {
    // Pieces that meet end to end (two plates spliced over a stud) count together.
    const spans = wood.filter((w) => w.z0 <= z + EPS && w.z1 >= z - EPS && w.s1 > x - half && w.s0 < x + half).sort((p, q) => p.s0 - q.s0);
    let reach = x - half;
    for (const w of spans) if (w.s0 <= reach + EPS) reach = Math.max(reach, w.s1);
    if (reach < x + half - EPS) return false;
  }
  return true;
}

/**
 * Courses, pieces and butt joints on one wall face.
 * @param {Face} face
 * @param {LapProduct} spec
 */
export function layoutFace(face, spec) {
  const e = spec.exposure;
  const topMax = Math.max(...[face.from, face.to, face.peakAt ?? face.from].map((s) => face.top(s)));
  /** Places where a joint may go: full-height framing at least 1-1/2" wide. */
  const centres = [...new Set(face.wood.filter((w) => w.z1 - w.z0 >= 12 && w.s1 - w.s0 >= 1.5 - EPS).map((w) => Math.round(((w.s0 + w.s1) / 2) * 16) / 16))].sort((a, b) => a - b);
  /** @type {LapPiece[]} */
  const pieces = [];
  /** @type {{ x: number, course: number, zb: number, backed: boolean }[]} */
  const joints = [];
  let starter = 0;
  let below = /** @type {number[]} */ ([]);
  let nails = 0;
  const courses = [];
  for (let i = 0; ; i++) {
    const zb = face.bottom + i * e;
    if (zb > topMax - 1) break;
    // The band this course shows, and the band its plank covers (for nailing into wood).
    const zt = zb + e;
    // Extent: where the top of the wall is at least an inch above the course bottom.
    let a = face.from;
    let b = face.to;
    const reach = (s) => face.top(s) > zb + 2;
    // Nothing left to cover but a sliver under the eave or at the peak: the soffit or rake board covers it.
    if (!reach(face.peakAt ?? a) && !reach(a) && !reach(b)) break;
    if (!reach(a)) { let lo = a; let hi = face.peakAt ?? (a + b) / 2; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (reach(m)) hi = m; else lo = m; } a = hi; }
    if (!reach(b)) { let lo = face.peakAt ?? (a + b) / 2; let hi = b; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (reach(m)) lo = m; else hi = m; } b = lo; }
    if (b - a < 1) break;
    const rake = face.top(a) < zt - EPS || face.top(b) < zt - EPS;
    // Openings that cover the whole exposed band split the course.
    let segs = [[a, b]];
    const notches = [];
    for (const h of face.holes) {
      if (h.s1 <= a + EPS || h.s0 >= b - EPS || h.z1 <= zb + EPS || h.z0 >= zt - EPS) continue;
      if (h.z0 <= zb + EPS && h.z1 >= zt - EPS) {
        segs = segs.flatMap(([p, q]) => (h.s1 <= p || h.s0 >= q ? [[p, q]] : [[p, Math.max(p, h.s0)], [Math.min(q, h.s1), q]])).filter(([p, q]) => q - p > 0.5);
      } else notches.push(h);
    }
    const course = { course: i, zb, segs: [] };
    /** @type {number[]} */
    const here = [];
    for (const [p, q] of segs) {
      // Butt joints: each plank as long as it can be, ending on a stud centre
      // clear of the joints in the course below.
      const cuts = [p];
      let pos = p;
      while (q - pos > face.maxPlank + EPS) {
        const wooded = (c) => backed(face.wood, c, zb + 0.75, Math.min(zb + spec.width, face.top(c)) - 0.75)
          && !notches.some((h) => h.s0 < c + 0.75 && h.s1 > c - 0.75);
        const ok = (c) => c > pos + spec.minPiece - EPS && c <= pos + face.maxPlank + EPS && (q - c >= spec.minPiece - EPS)
          && below.every((j) => Math.abs(j - c) >= face.stagger - EPS) && wooded(c);
        // No stud clear of the course below: take the best stud anyway and let the stagger check say so.
        const c = [...centres].reverse().find(ok) ?? [...centres].reverse().find((x) => x > pos + spec.minPiece - EPS && x <= pos + face.maxPlank + EPS && wooded(x));
        const at = c ?? pos + face.maxPlank;
        joints.push({ x: at, course: i, zb, backed: c !== undefined });
        here.push(at);
        cuts.push(at);
        pos = at;
      }
      cuts.push(q);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const s0 = cuts[k];
        const s1 = cuts[k + 1];
        // A sliver at the peak is left to the rake board that covers it.
        if (rake && s1 - s0 < 4) continue;
        const pts = outline(face, s0, s1, zb, zt, notches);
        pieces.push({ wall: face.wall, course: i, zb, a: s0, b: s1, len: Math.ceil((s1 - s0) * 8) / 8, rake, notched: notches.some((h) => h.s0 < s1 && h.s1 > s0), pts });
        // One nail per stud the piece crosses (the ends share the joint's stud).
        nails += centres.filter((c) => c >= s0 - 0.75 && c <= s1 + 0.75).length;
      }
      if (i === 0) starter += q - p;
      course.segs.push([p, q]);
    }
    courses.push(course);
    below = here;
  }
  return { wall: face.wall, len: face.len, courses, pieces, joints, starter, nails };
}

/**
 * The part of a course you see, as a polygon in face coordinates (s, z): the
 * band from zb up to the next course (or the rake), less any notches.
 */
function outline(face, s0, s1, zb, zt, notches) {
  const brk = new Set([s0, s1]);
  if (face.peakAt !== undefined && face.peakAt > s0 && face.peakAt < s1) brk.add(face.peakAt);
  for (const h of notches) for (const s of [h.s0, h.s1]) if (s > s0 && s < s1) brk.add(s);
  const xs = [...brk].sort((p, q) => p - q);
  const topAt = (s, mid) => {
    let z = Math.min(zt, face.top(s));
    for (const h of notches) if (h.s0 <= mid && h.s1 >= mid && h.z0 > zb + EPS) z = Math.min(z, h.z0);
    return Math.max(z, zb);
  };
  const botAt = (mid) => {
    let z = zb;
    for (const h of notches) if (h.s0 <= mid && h.s1 >= mid && h.z0 <= zb + EPS) z = Math.max(z, h.z1);
    return z;
  };
  /** @type {[number, number][]} */
  const bottom = [];
  /** @type {[number, number][]} */
  const top = [];
  for (let k = 0; k + 1 < xs.length; k++) {
    const mid = (xs[k] + xs[k + 1]) / 2;
    const zbot = Math.min(botAt(mid), topAt(mid, mid));
    bottom.push([xs[k], zbot], [xs[k + 1], zbot]);
    top.push([xs[k], topAt(xs[k], mid)], [xs[k + 1], topAt(xs[k + 1], mid)]);
  }
  const ring = [...bottom, ...top.reverse()];
  /** @type {[number, number][]} */
  const out = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  if (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 1e-6 && Math.abs(out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
  // Drop collinear points so the 3D view's ear clipping gets a clean ring.
  return out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length];
    const r = out[(i + 1) % out.length];
    return Math.abs((p[0] - q[0]) * (r[1] - q[1]) - (p[1] - q[1]) * (r[0] - q[0])) > 1e-9;
  });
}

/**
 * Short words for a joint's place, for checks and build steps: measured from
 * the left corner as you face the wall from outside (as the Plans sheets draw it).
 * @param {{ wall: string, len: number }} f
 */
export const jointLabel = (f, j) => `${WALL_WORD[f.wall] || f.wall} course ${j.course + 1} at ${fmtIn(f.wall === 'front' || f.wall === 'right' ? j.x : f.len - j.x)}`;

/**
 * Build steps for lap siding, in the order a carpenter puts it up.
 * @param {import('./model.mjs').Shed} shed
 * @param {any} est the estimate (for the plank count and the cut plan)
 */
export function lapSteps(shed, est) {
  const d = shed.design;
  const spec = LAP_PRODUCTS[d.sidingType];
  const lc = est.lapCuts;
  const k = shed.dims;
  const trimmed = d.wallTrim !== 'none';
  const eave = shed.lap.find((f) => f.wall === 'front');
  const gable = shed.lap.find((f) => f.wall === 'right');
  const marks = (f) => f.courses.slice(0, 4).map((c) => fmtIn(c.zb - k.skidTop)).join(', ');
  const joints = shed.lap.flatMap((f) => f.joints.map((j) => jointLabel(f, j)));
  const fc = d.sidingType === 'fiber cement';
  return [
    `Sheathe the walls with 7/16" OSB (${shed.sidingFull.length} sheet columns), long edges vertical, every edge on a stud, nailer or plate; 8d every 6" on edges and 12" in the field. Lap siding braces nothing, so the OSB is what keeps the walls square.`,
    'Wrap the walls with house wrap from the bottom up, each course lapping the one below by 6" and each vertical seam by 6" to 12", fastened with the cap nails; tape the seams. Cut an I at each door and window, fold the sides and bottom in, and leave the head flap loose to go over the head flashing later.',
    trimmed ? `Corner boards and casings go on first here, over the wrap: lap courses butt into them${fc ? '' : ' (LP asks for 5/4 trim, its 540 Series, so the siding does not stand proud of the trim; 3/4" boards leave the butt edges about level with the trim face)'}. Leave a 1/8" to 3/16" gap where each course meets trim and caulk it.` : 'With no trim, each course runs to the corner; caulk the end grain at every corner and paint it well.',
    `Starter: rip ${lc.starterPlanks} plank${lc.starterPlanks > 1 ? 's' : ''} into ${fmtIn(spec.starterWidth)} strips (${lc.perPlank} to a plank) and nail them along the bottom of every wall, flush with the top of the skids (${fmtIn(lc.starterIn)} in all). It tips the first course out to the same angle as the rest.`,
    `Courses: ${spec.short}, ${fmtIn(shed.lapExposure ?? spec.exposure)} to the weather${(shed.lapExposure ?? spec.exposure) < spec.exposure - 1e-9 ? ` (the maker allows up to ${fmtIn(spec.exposure)}; this evens the courses out so the top one on the long walls is a full plank)` : ''}. Mark a story pole: course bottoms at ${eave ? marks(eave) : ''} and so on up (measure each from the bottom, not course to course, so rounding does not add up) from the bottom of the siding (top of the skids), ${eave?.courses.length ?? 0} courses on the long walls and ${gable?.courses.length ?? 0} up each gable to the peak. Snap a level line for every few courses so they stay level round the corners. The top course is ripped to fit under the eave blocking or the rake.`,
    `Nail: ${spec.nail}. The next course hides the nails. ${fc ? 'Fiber cement: cut it outdoors with a fiber cement blade or shears and keep the dust down (it is silica).' : 'Seal every cut end with primer or paint before it goes up.'}`,
    joints.length
      ? `Butt joints (${joints.length}): every one is centred on a stud, with each plank end at least 3/8" from its nail${spec.jointGap ? ` and a ${fmtIn(spec.jointGap)} gap between the ends` : ', the ends in moderate contact'}. Slip a 6" x 10" piece of the flashing coil behind each joint, lapping the course below by 1". They are at: ${joints.slice(0, 12).join('; ')}${joints.length > 12 ? '; and the rest as the Plans sheets show' : ''}.`
      : 'No butt joints: every course is one plank from trim to trim or opening to opening, cut from the planks on the Cut sheet.',
    'Round each window and door: notch the planks around the casing, and over each head fit Z-flashing over the casing with the wrap\'s head flap lapped down over it, leaving 1/4" above the flashing (do not caulk that gap).',
    `Gables: cut each course end to the roof pitch (${d.pitch}/12); the lengths on the Cut sheet are to the long point. Stop short of the rafter so the rake board covers the cut.`,
    `Keep the bottom of the siding at least ${fmtIn(spec.clearance)} above the ground, as the ${spec.source} ask. Paint within 180 days; primed plank is not a finish.`,
  ];
}

