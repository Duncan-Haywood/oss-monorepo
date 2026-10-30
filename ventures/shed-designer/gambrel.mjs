// @ts-check
// The gambrel (barn) roof: two slopes a side, a steep lower one and a shallow
// upper one, meeting at a knee. For the same footprint and peak it encloses
// far more space than a gable, which is why barns and storage sheds use it.
//
// How it is framed here, the way most shed gambrels are built: a truss at each
// rafter position, made of four chords cut from the rafter stock. The lower
// chord's foot is cut level and sits on the eave wall's plates (no birdsmouth:
// at a steep pitch one would cut most of the board away); its top end is
// mitred to the upper chord at the knee; the two upper chords meet in a plumb
// cut at the peak. Plywood gussets (15/32", both faces) join the chords at the
// knees and the peak, and a tie at plate height beside the lower chords holds
// the trusses' outward thrust. There is no ridge board: the gussets and the
// sheathing hold the peak. The end trusses stand on the gable walls and the
// gable studs carry them, so they get no gussets or tie. The eaves have no
// overhang: the steep lower slope carries the water past the wall.
//
// An optional loft: the ties become loft joists (deeper boards, sized for the
// storage load) with a subfloor on them, over the whole shed or half of it.
//
// Structure (gambrelAnalysis): each truss is a three-hinged frame, pinned at
// the heels with the tie between them, a hinge at the peak, and the knees made
// rigid by the gussets. That frame is statically determinate, so its thrust,
// knee moment and member forces follow from statics alone. The chords are
// checked for combined bending and axial force (NDS 3.9), the tie for tension
// (and, under a loft, tension plus bending), the gusset nails for the knee
// moment by the elastic method with the NDS yield-limit value of an 8d common
// through 15/32" plywood, the heel nails for the thrust, and the seat for
// bearing. Snow on one side only is checked as well as snow on both. This is a
// screening check like the rest of the tool's, not an engineer's design: the
// plywood gussets' own strength, wind, uplift and the frame's spread are not
// checked.
//
// Coordinates are the model's: y across the width from the front eave wall's
// outside face, z up from the gravel. The roof is symmetric about y = W/2.

import { actual, ceil16, fmtIn } from './lumber.mjs';
import { SPF2, T, DEPTH } from './structure.mjs';
import { nailZ } from './checks.mjs';

/** Size factors CF from the NDS Supplement, Table 4A (bending and tension share them by width). */
const CF_B = { '2x4': 1.5, '2x6': 1.3, '2x8': 1.2, '2x10': 1.1, '2x12': 1.0 };
const CF_C = { '2x4': 1.15, '2x6': 1.1, '2x8': 1.05, '2x10': 1.0, '2x12': 1.0 };
/** SPF No. 2 tension parallel to grain, psi (NDS Supplement Table 4A); structure.mjs has the rest. */
const FT_SPF2 = 450;
/** Loft floor load, psf: IRC Table R301.5, uninhabitable attics with limited storage (20 live); 10 dead. */
export const LOFT_LIVE = 20;
export const LOFT_DEAD = 10;
/** Gusset stock: 15/32" rated plywood sheathing. */
export const GUSSET_T = 15 / 32;
/** Gusset nails: 8d common, 0.131" x 2-1/2", 3" apart in rows 2" apart, 3/4" from the edges. */
const NAIL = { D: 0.131, pitch: 3, row: 2, edge: 0.75 };

/** Horizontal run of the lower slope, from the eave wall's outside face to the knee. */
export function kneeRun(d) {
  const W = d.width;
  const want = d.gambrelKnee > 0 ? d.gambrelKnee : Math.round(W / 4 * 2) / 2;
  return Math.min(W / 2 - 12, Math.max(12, want));
}

/**
 * The roof's cross-section: the outer (sheathing) line and the inner
 * (underside) line of the chords, the knee and the peak.
 * @param {any} d a normalized design with style 'gambrel'
 * @param {number} plateTop height of the top of the wall plates
 */
export function gambrelShape(d, plateTop) {
  const W = d.width;
  const rd = actual(d.rafterSize).depth;
  const tl = d.gambrelLower / 12;
  const tu = d.pitch / 12;
  const cl = 1 / Math.hypot(1, tl);
  const cu = 1 / Math.hypot(1, tu);
  const sl = tl * cl;
  const su = tu * cu;
  const yk = kneeRun(d);
  const zk = plateTop + yk * tl;
  const ridgeTop = zk + (W / 2 - yk) * tu;
  const lowIn = (a) => plateTop + a * tl - rd / cl;
  const upIn = (a) => zk + (a - yk) * tu - rd / cu;
  const ykIn = yk + (rd / cl - rd / cu) / (tl - tu);
  const seat = rd / sl; // the level cut on the foot: the board's depth across a level line
  const half = (y) => Math.min(y, W - y);
  /** Outer (top) line, absolute z. */
  const top = (y) => { const a = half(y); return a <= yk ? plateTop + a * tl : zk + (a - yk) * tu; };
  /** Underside of the chords, absolute z (below the plate near the walls, where the lower chord's foot is). */
  const under = (y) => { const a = half(y); return a <= ykIn ? lowIn(a) : upIn(a); };
  const lowerLen = yk / cl; // along the outer line
  const upperLen = (W / 2 - yk) / cu;
  return { W, rd, tl, tu, cl, cu, sl, su, yk, zk, ykIn, zkIn: lowIn(ykIn), ridgeTop, ridgeIn: upIn(W / 2), seat, top, under, lowerLen, upperLen, plateTop };
}

/** The cut length of a board whose profile this is, along the direction (c, s). */
const cutAlong = (pts, c, s) => {
  const p = pts.map(([y, z]) => y * c + z * s);
  return Math.max(...p) - Math.min(...p);
};
/** Degrees off square of a cut along (dy, dz) across a board running at (c, s). */
const offSquare = (dy, dz, c, s) => {
  const n = Math.hypot(dy, dz);
  return Math.round((Math.acos(Math.min(1, Math.abs(dy * -s + dz * c) / n)) * 180) / Math.PI);
};

/**
 * Profiles (front side, y from the front wall) of the four chords and the gussets.
 * @param {ReturnType<typeof gambrelShape>} g
 * @param {{ knee: number, peak: number }} gusset lengths of the gussets along each chord, from the joint
 */
export function gambrelParts(g, gusset) {
  const { plateTop: pt, yk, zk, ykIn, zkIn, W, ridgeTop, ridgeIn, seat, cl, sl, cu, su, rd } = g;
  /** @type {[number, number][]} */
  const lower = [[0, pt], [seat, pt], [ykIn, zkIn], [yk, zk]];
  /** @type {[number, number][]} */
  const upper = [[yk, zk], [ykIn, zkIn], [W / 2, ridgeIn], [W / 2, ridgeTop]];
  const nl = [sl, -cl]; // inward normal of the lower chord
  const nu = [su, -cu];
  const Lk = gusset.knee;
  const lo = [yk - Lk * cl, zk - Lk * sl];
  const up = [yk + Lk * cu, zk + Lk * su];
  /** @type {[number, number][]} */
  const knee = [[lo[0], lo[1]], [yk, zk], [up[0], up[1]], [up[0] + rd * nu[0], up[1] + rd * nu[1]], [ykIn, zkIn], [lo[0] + rd * nl[0], lo[1] + rd * nl[1]]];
  const Lp = gusset.peak;
  const pl = [W / 2 - Lp * cu, ridgeTop - Lp * su];
  /** @type {[number, number][]} */
  const peak = [[pl[0], pl[1]], [pl[0] + rd * nu[0], pl[1] + rd * nu[1]], [W / 2, ridgeIn], [W - pl[0] - rd * nu[0], pl[1] + rd * nu[1]], [W - pl[0], pl[1]], [W / 2, ridgeTop]];
  return {
    lower, upper, knee, peak,
    lowerCut: ceil16(cutAlong(lower, cl, sl)),
    upperCut: ceil16(cutAlong(upper, cu, su)),
    footDeg: offSquare(1, 0, cl, sl),
    kneeLowDeg: offSquare(ykIn - yk, zkIn - zk, cl, sl),
    kneeUpDeg: offSquare(ykIn - yk, zkIn - zk, cu, su),
    ridgeDeg: offSquare(0, 1, cu, su),
  };
}

/** Polygon area, in the profile's units squared. @param {[number, number][]} pts */
export function polyArea(pts) {
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i]; const [x1, y1] = pts[(i + 1) % pts.length]; a2 += x0 * y1 - x1 * y0; }
  return Math.abs(a2) / 2;
}

/** A nail pattern on one chord inside a gusset: positions [along, across] from the group's centroid. */
function nailGroup(rd, len) {
  const rows = [];
  for (let a = NAIL.edge; a <= rd - NAIL.edge + 1e-9; a += NAIL.row) rows.push(a);
  if (rd - NAIL.edge - rows[rows.length - 1] > 0.5) rows.push(rd - NAIL.edge);
  const cols = [];
  // Start 1-1/2" clear of the joint (the mitre cut), stop 3/4" short of the gusset's end.
  for (let s = 1.5; s <= len - NAIL.edge + 1e-9; s += NAIL.pitch) cols.push(s);
  const pts = cols.flatMap((s) => rows.map((a) => [s, a]));
  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
  const cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const rel = pts.map(([x, y]) => [x - cx, y - cy]);
  return { n: rel.length, J: rel.reduce((t, [x, y]) => t + x * x + y * y, 0), rel };
}

/** Largest force on one nail of a group carrying force (fa along, fb across) and moment M. */
function worstNail(group, fa, fb, M) {
  if (!group.n) return Infinity;
  let worstF = 0;
  for (const [x, y] of group.rel) {
    const px = fa / group.n - (M * y) / group.J;
    const py = fb / group.n + (M * x) / group.J;
    worstF = Math.max(worstF, Math.hypot(px, py));
  }
  return worstF;
}

/**
 * Forces in one truss, by statics: a three-hinged frame on the centrelines.
 * Loads are point loads at many slices of the plan, so any distribution works.
 * @param {ReturnType<typeof gambrelShape>} g
 * @param {(y: number) => number} q load on plan, lb per inch of plan, at y
 * @param {number} tieDepth
 */
export function solveFrame(g, q, tieDepth) {
  const { W, rd, tl, tu, cl, cu, yk, plateTop: pt } = g;
  const zA = pt + tieDepth / 2;
  const lowC = (y) => pt + y * tl - rd / 2 / cl;
  const ykC = yk + (rd / 2 / cl - rd / 2 / cu) / (tl - tu);
  const zkC = lowC(ykC);
  const upC = (y) => zkC + (y - ykC) * tu;
  const yA = (zA - pt + rd / 2 / cl) / tl;
  const yC = W / 2;
  const zC = upC(yC);
  const N = 240;
  const dy = W / N;
  /** @type {[number, number][]} */
  const P = [];
  for (let i = 0; i < N; i++) { const y = (i + 0.5) * dy; P.push([y, q(y) * dy]); }
  const yB = W - yA;
  const total = P.reduce((t, p) => t + p[1], 0);
  const VA = P.reduce((t, [y, p]) => t + p * (yB - y), 0) / (yB - yA);
  const VB = total - VA;
  const leftM = P.filter(([y]) => y < yC).reduce((t, [y, p]) => t + p * (yC - y), 0);
  const H = (VA * (yC - yA) - leftM) / (zC - zA);
  // Section forces on the left half at plan position y (on the centreline).
  const at = (y, V0, loads) => {
    const z = y <= ykC ? lowC(y) : upC(y);
    const left = loads.filter(([yy]) => yy < y);
    const Fy = V0 - left.reduce((t, p) => t + p[1], 0);
    const M = V0 * (y - yA) - H * (z - zA) - left.reduce((t, [yy, p]) => t + p * (y - yy), 0);
    const [c, s] = y <= ykC ? [cl, tl * cl] : [cu, tu * cu];
    return { y, N: H * c + Fy * s, V: Math.abs(-H * s + Fy * c), M: Math.abs(M) };
  };
  const side = (V0, loads) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) pts.push(at(yA + ((ykC - yA) * i) / 60, V0, loads));
    for (let i = 1; i <= 60; i++) pts.push(at(ykC + ((yC - ykC) * i) / 60, V0, loads));
    return pts;
  };
  const mirrored = /** @type {[number, number][]} */ (P.map(([y, p]) => [W - y, p]));
  const sides = [side(VA, P), side(VB, mirrored)];
  const pts = sides.flat();
  const lower = pts.filter((p) => p.y <= ykC + 1e-9);
  const upper = pts.filter((p) => p.y > ykC + 1e-9);
  const knee = sides.map((s) => s.reduce((b, p) => (Math.abs(p.y - ykC) < Math.abs(b.y - ykC) ? p : b)));
  // The peak: the hinge carries the thrust and whatever shear the unbalanced load leaves.
  const peakV = Math.abs(VA - P.filter(([y]) => y < yC).reduce((t, p) => t + p[1], 0));
  return { H, VA, VB, lower, upper, knee, peak: { H, V: peakV }, lenLower: Math.hypot(ykC - yA, zkC - zA), lenUpper: Math.hypot(yC - ykC, zC - zkC), yA, zA, ykC, zkC, yC, zC, total };
}

/** NDS 3.9.2 (or 3.9.1 in tension) for a chord with axial force N (+ compression) and moment M, lb and lb-in. */
function chordRatio(size, N, M, V, le, CD) {
  const d = DEPTH[size];
  const A = T * d;
  const S = (T * d * d) / 6;
  const Fb = SPF2.Fb * CD * CF_B[size] * 1.15; // repetitive member factor: trusses at 24" or closer
  const fb = M / S;
  const shear = (1.5 * V) / A / (SPF2.Fv * CD);
  if (N < 0) return Math.max(shear, -N / A / (FT_SPF2 * CD * CF_B[size]) + fb / Fb);
  const FcStar = SPF2.Fc * CD * CF_C[size];
  const FcE = (0.822 * SPF2.Emin) / (le / d) ** 2;
  const a = FcE / FcStar;
  const b = (1 + a) / 1.6;
  const Cp = b - Math.sqrt(b * b - a / 0.8);
  const fc = N / A;
  // Past the Euler load the interaction has no meaning; report a ratio that fails by at least that much.
  if (fc >= FcE) return Math.max(shear, 1 + fc / FcE + fb / Fb);
  return Math.max(shear, (fc / (FcStar * Cp)) ** 2 + fb / (Fb * (1 - fc / FcE)));
}

/** The loft's extent along the shed, [x0, x1], or null. */
export function loftSpan(d, wallDepth) {
  if (d.loft === 'full') return [wallDepth, d.length - wallDepth];
  if (d.loft === 'half') return [d.length / 2, d.length - wallDepth];
  return null;
}

/**
 * Size the gussets and check every part of a truss.
 * @param {any} d a normalized gambrel design
 */
export function gambrelAnalysis(d) {
  const g = gambrelShape(d, 0);
  const s = d.rafterSpacing;
  const loft = d.loft === 'full' || d.loft === 'half';
  const tieSize = loft ? d.loftJoist : d.tieSize;
  const td = actual(tieSize).depth;
  const per = s / 12 / 12; // psf to lb per inch of plan, for one truss
  const dead = (y) => (15 / (Math.min(y, g.W - y) <= g.yk ? g.cl : g.cu)) * per;
  const snow = d.snowLoad * per;
  const cases = [
    { name: 'dead + snow', CD: 1.15, q: (y) => dead(y) + snow },
    { name: 'dead + snow on one side', CD: 1.15, q: (y) => dead(y) + (y < g.W / 2 ? snow : 0) },
    { name: 'dead only', CD: 0.9, q: dead },
  ];
  const Z8 = nailZ(NAIL.D, GUSSET_T, 1.5, 0.42, 100000);
  const Z16 = nailZ(0.162, 1.5, 2.0);
  const solved = cases.map((c) => ({ ...c, f: solveFrame(g, c.q, td) }));
  const worstOf = (fn) => solved.reduce((b, c) => { const r = fn(c); return r.ratio > b.ratio ? { ...r, case: c.name } : b; }, { ratio: -1, case: '' });

  const lowerR = worstOf((c) => ({ ratio: Math.max(...c.f.lower.map((p) => chordRatio(d.rafterSize, p.N, p.M, p.V, c.f.lenLower, c.CD))) }));
  const upperR = worstOf((c) => ({ ratio: Math.max(...c.f.upper.map((p) => chordRatio(d.rafterSize, p.N, p.M, p.V, c.f.lenUpper, c.CD))) }));
  const H = Math.max(...solved.map((c) => c.f.H));

  // Knee gussets: the shortest (10" to 24" along each chord) whose nails carry the knee.
  const kneeRatio = (len) => worstOf((c) => ({
    ratio: Math.max(...c.f.knee.map((k) => {
      const grp = nailGroup(g.rd, len);
      // Two gussets share the joint; each chord's nails in one gusset carry half.
      return worstNail(grp, k.N / 2, k.V / 2, k.M / 2) / (Z8 * c.CD);
    })),
  }));
  let knee = 10;
  while (knee < 24 && kneeRatio(knee).ratio > 1) knee += 2;
  const kneeR = kneeRatio(knee);
  const peakRatio = (len) => worstOf((c) => ({ ratio: worstNail(nailGroup(g.rd, len), c.f.peak.H / 2, c.f.peak.V / 2, 0) / (Z8 * c.CD) }));
  let peak = 8;
  while (peak < 18 && peakRatio(peak).ratio > 1) peak += 2;
  const peakR = peakRatio(peak);
  const heelNails = Math.max(3, Math.ceil(H / (Z16 * 1.15) - 1e-9));
  const seatR = worstOf((c) => ({ ratio: Math.max(c.f.VA, c.f.VB) / (T * Math.min(g.seat, actual(d.studSize).depth)) / SPF2.Fc_perp }));

  // The tie: tension, plus the loft's load in bending when it is a loft joist.
  const span = d.width - actual(d.studSize).depth; // bearing centre to bearing centre
  const A = T * td;
  const S = (T * td * td) / 6;
  const I = (T * td ** 3) / 12;
  const loftW = (psf) => (psf * s) / 144; // lb per inch along the joist
  const tieCases = solved.flatMap((c) => {
    const out = [{ name: c.name, CD: c.CD, H: c.f.H, w: loft ? loftW(LOFT_DEAD) : 0 }];
    if (loft && c.name === 'dead only') out.push({ name: 'dead + loft storage', CD: 1.0, H: c.f.H, w: loftW(LOFT_DEAD + LOFT_LIVE) });
    if (loft && c.name === 'dead + snow') out.push({ name: 'dead + 3/4 (snow + loft storage)', CD: 1.15, H: (solved[2].f.H + 0.75 * (c.f.H - solved[2].f.H)), w: loftW(LOFT_DEAD + 0.75 * LOFT_LIVE) });
    return out;
  });
  const tieR = tieCases.reduce((b, c) => {
    const ft = c.H / A;
    const fb = (c.w * span * span) / 8 / S;
    const Ft = FT_SPF2 * c.CD * CF_B[tieSize];
    const Fb = SPF2.Fb * c.CD * CF_B[tieSize] * 1.15;
    const ratio = Math.max(ft / Ft + fb / Fb, (fb - ft) / Fb, c.w ? ((1.5 * c.w * span) / 2) / A / (SPF2.Fv * c.CD) : 0);
    return ratio > b.ratio ? { ratio, case: c.name } : b;
  }, { ratio: -1, case: '' });
  const loftDefl = loft ? ((5 * loftW(LOFT_LIVE) * span ** 4) / (384 * SPF2.E * I)) / (span / 240) : 0;

  const rows = [
    { member: 'Lower chords', size: `${d.rafterSize} at ${s}"`, detail: `${d.gambrelLower}/12, ${fmtIn(g.lowerLen)} along the slope; bending with compression (NDS 3.9.2), worst case ${lowerR.case}`, ratio: lowerR.ratio, governs: 'combined bending and compression' },
    { member: 'Upper chords', size: `${d.rafterSize} at ${s}"`, detail: `${d.pitch}/12, ${fmtIn(g.upperLen)} along the slope; worst case ${upperR.case}`, ratio: upperR.ratio, governs: 'combined bending and compression' },
    { member: loft ? 'Loft joists (also the truss ties)' : 'Truss ties', size: `${tieSize} at ${s}"`, detail: `${Math.round(H)} lb of thrust${loft ? `, plus ${LOFT_LIVE} psf storage and ${LOFT_DEAD} dead over ${fmtIn(span)}` : ''}; worst case ${tieR.case}`, ratio: tieR.ratio, governs: loft ? 'tension with bending (NDS 3.9.1)' : 'tension' },
    ...(loft ? [{ member: 'Loft joist deflection', size: tieSize, detail: `${LOFT_LIVE} psf storage, limit span/240`, ratio: loftDefl, governs: 'deflection' }] : []),
    { member: 'Knee gussets (nails)', size: `15/32" plywood both faces, ${knee}" along each chord`, detail: `8d commons ${NAIL.pitch}" apart in rows ${NAIL.row}" apart, ${Math.round(Z8)} lb a nail (NDS yield limit); worst case ${kneeR.case}`, ratio: kneeR.ratio, governs: 'nail shear' },
    { member: 'Peak gussets (nails)', size: `15/32" plywood both faces, ${peak}" along each chord`, detail: `the thrust and the unbalanced shear; worst case ${peakR.case}`, ratio: peakR.ratio, governs: 'nail shear' },
    { member: 'Heel (tie to lower chord)', size: `${heelNails} 16d commons`, detail: `${Math.round(H)} lb thrust; ${Math.round(Z16 * 1.15)} lb a nail (NDS yield limit, SPF)`, ratio: H / (heelNails * Z16 * 1.15), governs: 'nail shear' },
    { member: 'Chord seat on the plate', size: `${fmtIn(Math.min(g.seat, actual(d.studSize).depth))} of bearing`, detail: `${Math.round(Math.max(...solved.map((c) => Math.max(c.f.VA, c.f.VB))))} lb a truss`, ratio: seatR.ratio, governs: 'bearing' },
  ];
  // What each eave wall carries per foot: the trusses' reactions, and the loft.
  const perFt = 12 / s;
  const wall = {
    dead: solved[2].f.VA * perFt + (loft ? (LOFT_DEAD * d.width) / 2 / 12 : 0),
    snow: (solved[0].f.VA - solved[2].f.VA) * perFt,
    loft: loft ? (LOFT_LIVE * d.width) / 2 / 12 : 0,
  };
  return { rows, gusset: { knee, peak }, heelNails, thrust: H, tieSize, tieDepth: td, wall, nailZ: Z8, nailsPerKnee: 4 * nailGroup(g.rd, knee).n, nailsPerPeak: 4 * nailGroup(g.rd, peak).n };
}

/** The outer roof line across the width: eave, knee, peak, knee, eave. @param {ReturnType<typeof gambrelShape>} g */
export function outerLine(g) {
  return /** @type {[number, number][]} */ ([[0, g.plateTop], [g.yk, g.zk], [g.W / 2, g.ridgeTop], [g.W - g.yk, g.zk], [g.W, g.plateTop]]);
}

/**
 * A line `dist` above the outer roof line, measured square to each slope (the
 * sheathing's top, or the bottom of a rake board), with its corners where the
 * offset slopes meet and its ends plumb over the eaves.
 * @param {ReturnType<typeof gambrelShape>} g
 */
export function bandAbove(g, dist) {
  const pts = outerLine(g);
  /** @type {[number, number][]} */
  const out = [];
  const seg = (i) => {
    const [y0, z0] = pts[i]; const [y1, z1] = pts[i + 1];
    const len = Math.hypot(y1 - y0, z1 - z0);
    const n = [-(z1 - z0) / len, (y1 - y0) / len]; // up-and-out normal
    return { a: [y0 + n[0] * dist, z0 + n[1] * dist], b: [y1 + n[0] * dist, z1 + n[1] * dist], k: (z1 - z0) / (y1 - y0) };
  };
  const segs = [0, 1, 2, 3].map(seg);
  const zAt = (s, y) => s.a[1] + (y - s.a[0]) * s.k;
  out.push([0, zAt(segs[0], 0)]);
  for (let i = 0; i < 3; i++) {
    const s0 = segs[i]; const s1 = segs[i + 1];
    // zAt(s0, y) = zAt(s1, y)
    const y = (s1.a[1] - s0.a[1] + s0.k * s0.a[0] - s1.k * s1.a[0]) / (s0.k - s1.k);
    out.push([y, zAt(s0, y)]);
  }
  out.push([g.W, zAt(segs[3], g.W)]);
  return out;
}

/** Height of a polyline (points in increasing y) at y. @param {[number, number][]} pts */
export function zOnPoly(pts, y) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [y0, z0] = pts[i]; const [y1, z1] = pts[i + 1];
    if (y <= y1 + 1e-9 || i + 2 === pts.length) return z0 + ((y - y0) * (z1 - z0)) / (y1 - y0 || 1);
  }
  return pts[0][1];
}
