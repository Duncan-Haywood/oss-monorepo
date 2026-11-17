/**
 * Pattern pieces with real curves, graded across sizes, as 1:1 SVG and DXF.
 *
 * `marker.mjs` only knows rectangles. This drafts the block a pattern maker
 * starts from for a knit top (tee, long sleeve, crewneck): half front and
 * half back on the fold, with a scooped armhole and a round neck, and a
 * set-in sleeve whose cap is SOLVED so that its curve is as long as the
 * armhole it is sewn into plus a stated ease (the check every pattern maker
 * does by walking a tape along both curves). Each piece comes with its stitch
 * line, its cutting line (seam allowance added edge by edge, a deeper hem
 * allowance, none on the fold), notches, a grain line, and a size-by-size
 * grade table. DXF and SVG come out in centimetres at 1:1 so a plotter, a
 * cutting table or a home printer (tiled) can use them.
 *
 * What it is not: a fitted block from a body scan, a drape simulation or a
 * woven-cloth pattern (no darts). The proportions below are typical drafting
 * ratios of the chest measurement, typed from common drafting practice and
 * NOT checked against any pattern maker's block or a real sample garment; a
 * factory or pattern maker's own block always wins. A hoodie adds a two-piece hood
 * (neck edge solved to the neck seam) and a kangaroo pocket; hem and cuff rib bands are optional (`rib: true`, crewneck and hoodie).
 */
import { garmentMeasurements, BODY_CHEST_CM } from "./fit.mjs";

const r2 = v => Math.round(v * 100) / 100;
const KAPPA = 0.5522847498;

export const DRAFTED = Object.freeze(["tee", "longsleeve", "crewneck", "hoodie"]);
export const DEFAULTS = Object.freeze({ seamCm: 1, neckSeamCm: 0.6, hemCm: 2.5, capEaseCm: 1.0, sleeveLenCm: { tee: 22, longsleeve: 62, crewneck: 62, hoodie: 63 }, rib: false, zip: false, zipSeamCm: 1.5, facing: false, facingWidthCm: 4, hemRibCm: 6, cuffRibCm: 6, hemRibRatio: 0.85, cuffRibRatio: 0.85 });

/* ---------- geometry ---------- */

const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
};
/** Flatten a cubic into n+1 points. */
const flat = (p0, p1, p2, p3, n = 24) => Array.from({ length: n + 1 }, (_, i) => bez(p0, p1, p2, p3, i / n));
const len = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
export const polylineLength = len;

/** Shoelace area of a closed ring (positive whichever way it winds). */
export function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function segCross(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < -1e-12 && o3 * o4 < -1e-12;
}
/** True when no two non-adjacent edges of the closed ring cross. */
export function isSimple(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

const dedupe = pts => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9);

/**
 * Offset a closed ring outward by a distance per edge (edge i runs from
 * ring[i] to ring[i+1]); corners are mitred, capped at three times the larger
 * distance. The ring may wind either way: the outward side is found from the
 * area sign.
 */
export function offsetRing(ring, dists) {
  const n = ring.length;
  let a2 = 0;
  for (let i = 0; i < n; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n]; a2 += x1 * y2 - x2 * y1; }
  const sgn = a2 > 0 ? 1 : -1; // CCW (in y-up maths) when a2 > 0: outward normal is the right-hand side
  const nrm = i => {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    return [sgn * (y2 - y1) / L, -sgn * (x2 - x1) / L];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const e0 = (i - 1 + n) % n, e1 = i;
    const n0 = nrm(e0), n1 = nrm(e1), d0 = dists[e0], d1 = dists[e1];
    const cos = n0[0] * n1[0] + n0[1] * n1[1];
    // mitre: solve  p.n0 = d0 + base.n0,  p.n1 = d1 + base.n1
    const det = n0[0] * n1[1] - n0[1] * n1[0];
    let p;
    if (cos > 0.97 && Math.abs(d0 - d1) > 1e-9) p = [ring[i][0] + (n0[0] * d0 + n1[0] * d1) / 2, ring[i][1] + (n0[1] * d0 + n1[1] * d1) / 2]; // smooth join where the allowance changes
    else if (Math.abs(det) < 1e-6) p = [ring[i][0] + n1[0] * d1, ring[i][1] + n1[1] * d1];
    else {
      const b0 = d0 + n0[0] * ring[i][0] + n0[1] * ring[i][1], b1 = d1 + n1[0] * ring[i][0] + n1[1] * ring[i][1];
      p = [(b0 * n1[1] - b1 * n0[1]) / det, (n0[0] * b1 - n1[0] * b0) / det];
      const cap = 3 * Math.max(d0, d1, 1e-9);
      const dx = p[0] - ring[i][0], dy = p[1] - ring[i][1], m = Math.hypot(dx, dy);
      if (m > cap && cos < 0.9) { const s = cap / m; p = [ring[i][0] + dx * s, ring[i][1] + dy * s]; }
    }
    out.push(p);
  }
  return out;
}

/* ---------- drafting ---------- */

/** Key points of the body block for one size (cm, y down, x from the fold). */
export function bodyBlock(g) {
  const bc = g.bodyChest, Q = g.flatWidth / 2;
  const hn = 0.09 * bc;                                  // half neck width
  const frontDrop = 0.08 * bc, backDrop = 2.5;
  const sx = Math.min(Q - 4, 0.225 * bc + 0.1 * (g.chest - bc)); // shoulder point, from the fold
  const sd = 0.04 * bc;                                  // shoulder slope drop
  const ad = 0.235 * bc + 0.1 * (g.chest - bc);          // armhole depth from the high point
  return { Q, hn, frontDrop, backDrop, sx, sd, ad, L: g.length };
}

export function armholeCurve(b, side) {
  const sc = side === "front" ? 1.25 : 0.6;               // front scoops deeper than back
  const P0 = [b.sx, b.sd], P3 = [b.Q, b.ad];
  const span = b.Q - b.sx, drop = b.ad - b.sd;
  const P1 = [b.sx - sc, b.sd + 0.45 * drop];
  const P2 = [b.Q - 0.55 * span - 0.3 * sc, b.ad - 0.02 * drop];
  return flat(P0, P1, P2, P3, 32);
}

function bodyPiece(b, side, o) {
  const open = !!(o.zip && side === "front"); // zip front: cut as two halves, centre-front seam instead of a fold
  const fd = side === "front" ? b.frontDrop : b.backDrop;
  const neck = flat([0, fd], [b.hn * KAPPA, fd], [b.hn, KAPPA * fd], [b.hn, 0], 24);
  const shoulder = [[b.hn, 0], [b.sx, b.sd]];
  const arm = armholeCurve(b, side);
  const segs = [
    { kind: "neck", pts: neck },
    { kind: "shoulder", pts: shoulder },
    { kind: "armhole", pts: arm },
    { kind: "side", pts: [[b.Q, b.ad], [b.Q, b.L]] },
    { kind: "hem", pts: [[b.Q, b.L], [0, b.L]] },
    { kind: open ? "cf" : "fold", pts: [[0, b.L], [0, fd]] },
  ];
  return {
    name: side, qty: open ? 2 : 1, cutOnFold: !open, segs,
    armholeLen: len(arm),
    notches: [{ at: arm[Math.round(arm.length * 0.45)], label: side === "front" ? "F1" : "B1" }, { at: [b.sx, b.sd], label: "shoulder" }],
    grain: [[b.Q * 0.5, b.ad + 2], [b.Q * 0.5, b.L - 4]],
  };
}

/** A cap curve (left, right halves) with its top at (t, -h) and ends at (-w/2, 0), (w/2, 0). */
function cap(w, h, t) {
  const hw = w / 2, a = hw + t, c = hw - t;
  const left = flat([-hw, 0], [-hw + 0.1 * a, -0.65 * h], [t - 0.45 * a, -h], [t, -h], 28);
  const right = flat([t, -h], [t + 0.45 * c, -h], [hw - 0.1 * c, -0.65 * h], [hw, 0], 28);
  return { left, right, pts: left.concat(right.slice(1)) };
}

/** Solve cap height and top offset so the two halves match the back/front armholes plus ease. */
export function solveCap(w, targetFront, targetBack) {
  const total = targetFront + targetBack, ratio = targetFront / targetBack;
  const halves = (h, t) => { const c = cap(w, h, t); return [len(c.left), len(c.right)]; };
  const solveT = h => {
    let lo = -w / 3, hi = w / 3; // left = front half; a larger t makes the left half longer
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, [l, r] = halves(h, m); if (l / r < ratio) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  let lo = 0.5, hi = w * 1.5;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, t = solveT(m), [l, r] = halves(m, t); if (l + r < total) lo = m; else hi = m; }
  const h = (lo + hi) / 2, t = solveT(h), c = cap(w, h, t), [l, r] = halves(h, t);
  return { h, t, cap: c, frontLen: l, backLen: r, ok: Math.abs(l + r - total) < 0.05 };
}

function sleevePiece(g, b, front, back, garment, o) {
  const bc = g.bodyChest;
  // The piece is the whole sleeve opened out, so its width is the sleeve's full
  // girth at the bicep: twice the flat (laid-down) bicep measurement. Until
  // 2026-11-13 the flat figure was used as the full width, a 24 cm sleeve at M
  // that the drape (arms added) stretched 37% round a 31 cm upper arm.
  const flatBicep = Number(o.bicepCm) > 0 ? Number(o.bicepCm) : 0.17 * bc + 0.1 * (g.chest - bc); // o.bicepCm: the designer's own flat bicep
  const w = 2 * flatBicep;
  const solved = solveCap(w, front.armholeLen + o.capEaseCm / 2, back.armholeLen + o.capEaseCm / 2);
  if (!solved.ok) return { error: "no sleeve cap reaches the armhole length at this width" };
  // Sleeve length is measured from the shoulder point (the cap's top) to the cuff, as in
  // the spec sheet (spec.mjs, tryon.mjs). Until 2026-11-13 it ran from the underarm,
  // so every sleeve came out a cap height (9 to 17 cm) too long.
  const sl = o.sleeveLenCm[garment] - (o.rib ? o.cuffRibCm : 0) - solved.h;
  if (!(sl > 3)) return { error: "the sleeve is shorter than its cap: lengthen the sleeve" };
  const hemW = garment === "tee" ? w * 0.85 : Math.max(0.21 * bc, w * 0.52);
  const cp = solved.cap.pts;
  const hemL = [-hemW / 2, sl], hemR = [hemW / 2, sl];
  const segs = [
    { kind: "cap", pts: cp },
    { kind: "sleeveSeam", pts: [[w / 2, 0], hemR] },
    { kind: "sleeveHem", pts: [hemR, hemL] },
    { kind: "sleeveSeam", pts: [hemL, [-w / 2, 0]] },
  ];
  const t = solved.t;
  return {
    name: "sleeve", qty: 2, cutOnFold: false, segs, solved, girthCm: w, lengthCm: solved.h + sl,
    notches: [
      { at: [t, -solved.h], label: "shoulder" },
      { at: solved.cap.left[Math.round(solved.cap.left.length * 0.55)], label: "F" },
      { at: solved.cap.right[Math.round(solved.cap.right.length * 0.45)], label: "B" },
    ],
    grain: [[0, sl * 0.15], [0, sl * 0.85]],
  };
}

/** Flat width of the sleeve's hem edge. */
const sleeveHemWidth = piece => len(piece.segs.find(s => s.kind === "sleeveHem").pts);

/**
 * A rib band: one strip folded along its length (fold in the middle), cut to
 * `ratio` of the opening it is sewn to because rib stretches. Finished height
 * is `h`; the cut strip is twice that. Notches at quarters help even stretching.
 */
function ribPiece(name, length, h, qty) {
  const W = length, H = 2 * h;
  const segs = [
    { kind: "ribJoin", pts: [[0, 0], [W, 0]] },
    { kind: "ribJoin", pts: [[W, 0], [W, H]] },
    { kind: "ribJoin", pts: [[W, H], [0, H]] },
    { kind: "ribJoin", pts: [[0, H], [0, 0]] },
  ];
  return {
    name, qty, cutOnFold: false, segs, ribLen: W,
    notches: [1, 2, 3].map(i => ({ at: [W * i / 4, 0], label: `${i}/4` })).concat([{ at: [0, h], label: "fold" }]),
    grain: [[W * 0.2, h], [W * 0.8, h]],
  };
}

/** Centre-front facing strip for a zip front: two strips (one per half), each as long as the zip opening and twice the finished width (folded). */
function facingPiece(length, w) {
  const H = 2 * w;
  const segs = [[[0, 0], [length, 0]], [[length, 0], [length, H]], [[length, H], [0, H]], [[0, H], [0, 0]]].map(pts => ({ kind: "ribJoin", pts }));
  return { name: "zipFacing", qty: 2, cutOnFold: false, segs, notches: [{ at: [0, w], label: "fold" }], grain: [[length * 0.2, w], [length * 0.8, w]] };
}

/** Length of a polyline's first segment run of the given kind. */
const segLen = (piece, kind) => piece.segs.filter(s => s.kind === kind).reduce((a, s) => a + len(s.pts), 0);

/**
 * One side of a two-piece hood (cut two, one reversed). Its neck edge is a
 * straight line as long as the body's neck seam (front neck + back neck, one
 * side), the check a pattern maker does with a tape. Face opening on the left
 * (drawcord casing allowance), centre-back seam over the crown on the right.
 */
function hoodPiece(g, front, back) {
  const bc = g.bodyChest;
  const N = segLen(front, "neck") + segLen(back, "neck");
  const H = 0.37 * bc + 0.04 * (g.chest - bc) + 1;           // neck edge to crown
  const D = Math.max(N + 6, 0.29 * bc + 0.05 * (g.chest - bc)); // front to back at the widest
  const A = [0, 0], B = [N, 0];
  // one smooth cubic from the neck corner over the forehead to the crown (a hard corner would
  // make the seam allowance loop); the lower part is the face opening, the rest the crown seam
  const crownTop = [0.5 * D, H];
  const P = [A, [-0.16 * D, 0.5 * H], [-0.02 * D, 1.04 * H], crownTop];
  const arc = Array.from({ length: 49 }, (_, i) => bez(P[0], P[1], P[2], P[3], i / 48));
  const face = arc.slice(0, 25), crown = arc.slice(24);
  const backCrown = flat(crownTop, [0.8 * D, H], [N + 0.35 * D, 0.82 * H], [N + 0.3 * D, 0.5 * H], 24);
  const nape = flat([N + 0.3 * D, 0.5 * H], [N + 0.3 * D, 0.2 * H], [N + 0.1 * D, 0.04 * H], B, 16);
  const segs = [
    { kind: "hoodNeck", pts: [B, A] },
    { kind: "hoodFace", pts: face },
    { kind: "hoodCrown", pts: crown },
    { kind: "hoodCrown", pts: backCrown },
    { kind: "hoodCrown", pts: nape },
  ];
  return {
    name: "hood", qty: 2, cutOnFold: false, segs, neckEdgeLen: N, hoodHeight: H, hoodDepth: D,
    notches: [{ at: [N * 0.5, 0], label: "shoulder" }, { at: A, label: "CF" }, { at: B, label: "CB" }],
    grain: [[N * 0.5, H * 0.2], [N * 0.5, H * 0.75]],
  };
}

/** Kangaroo pocket: wider at the bottom, hand openings on the slanted sides, top and bottom sewn to the body. */
function pocketPiece(g) {
  const bc = g.bodyChest;
  const wb = 0.36 * bc + 0.1 * (g.chest - bc), wt = 0.78 * wb, h = 0.21 * bc;
  const segs = [
    { kind: "pocketJoin", pts: [[-wt / 2, 0], [wt / 2, 0]] },
    { kind: "pocketOpening", pts: [[wt / 2, 0], [wb / 2, h]] },
    { kind: "pocketJoin", pts: [[wb / 2, h], [-wb / 2, h]] },
    { kind: "pocketOpening", pts: [[-wb / 2, h], [-wt / 2, 0]] },
  ];
  return { name: "pocket", qty: 1, cutOnFold: false, segs, pocketW: wb, pocketH: h, notches: [{ at: [0, 0], label: "centre" }], grain: [[0, h * 0.2], [0, h * 0.8]] };
}

function finish(piece, o) {
  const allow = { neck: o.neckSeamCm, shoulder: o.seamCm, armhole: o.seamCm, side: o.seamCm, hem: o.hemCm, fold: 0, cf: o.zipSeamCm, cap: o.seamCm, sleeveSeam: o.seamCm, sleeveHem: o.hemCm, hoodNeck: o.seamCm, hoodFace: o.faceCm ?? o.hemCm, ribJoin: o.seamCm, hoodCrown: o.seamCm, pocketOpening: o.seamCm + 0.5, pocketJoin: o.seamCm };
  const ring = [], dists = [];
  piece.segs.forEach(s => {
    const pts = s.pts;
    for (let i = 0; i < pts.length - 1; i++) { ring.push(pts[i]); dists.push(allow[s.kind]); }
  });
  const stitch = dedupeRing(ring, dists);
  // the stitch ring closes back to its first point
  const cut = offsetRing(stitch.ring, stitch.dists);
  const all = cut.concat(stitch.ring);
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    name: piece.name, qty: piece.qty, cutOnFold: piece.cutOnFold,
    stitch: stitch.ring, cut, notches: piece.notches, grain: piece.grain,
    stitchAreaCm2: r2(area(stitch.ring)), cutAreaCm2: r2(area(cut)),
    bbox: { minX: r2(minX), minY: r2(minY), w: r2(maxX - minX), h: r2(maxY - minY) },
    simple: isSimple(stitch.ring) && isSimple(cut),
    armholeLen: piece.armholeLen, solved: piece.solved,
  };
}

function dedupeRing(ring, dists) {
  const R = [], D = [];
  ring.forEach((p, i) => {
    const q = R[R.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9) { D[D.length - 1] = dists[i]; return; }
    R.push(p); D.push(dists[i]);
  });
  const f = R[0], l = R[R.length - 1];
  if (R.length > 1 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) { R.pop(); D.pop(); }
  return { ring: R, dists: D };
}

/**
 * Draft one size.
 * @returns {{ok:boolean, error?:string, pieces?:object[], checks?:object, block?:object}}
 */
export function draft(garment, size, { fit = "regular", sizeChart = BODY_CHEST_CM, ...opt } = {}) {
  if (!DRAFTED.includes(garment)) return { ok: false, error: `No block for "${garment}".` };
  const g = garmentMeasurements(garment, fit, sizeChart)[size];
  if (!g) return { ok: false, error: `Size ${size} is not in the size chart.` };
  const o = { ...DEFAULTS, ...opt, sleeveLenCm: { ...DEFAULTS.sleeveLenCm, ...(opt.sleeveLenCm || {}) } };
  for (const k of ["seamCm", "neckSeamCm", "hemCm", "capEaseCm"]) {
    if (!(Number.isFinite(o[k]) && o[k] >= 0 && o[k] <= 10)) return { ok: false, error: `${k} must be a number from 0 to 10.` };
  }
  if (opt.rib) {
    if (!["crewneck", "hoodie"].includes(garment)) return { ok: false, error: "Rib bands are drafted for the crewneck and hoodie only." };
    for (const k of ["hemRibCm", "cuffRibCm"]) if (!(Number.isFinite(o[k]) && o[k] >= 3 && o[k] <= 15)) return { ok: false, error: `${k} must be a number from 3 to 15.` };
    for (const k of ["hemRibRatio", "cuffRibRatio"]) if (!(Number.isFinite(o[k]) && o[k] >= 0.6 && o[k] <= 1)) return { ok: false, error: `${k} must be a number from 0.6 to 1.` };
    o.faceCm = o.hemCm; o.hemCm = o.seamCm; // the band takes the hem allowance's place
  }
  if (opt.zip) {
    if (garment !== "hoodie") return { ok: false, error: "A zip front is drafted for the hoodie only." };
    if (!(Number.isFinite(o.zipSeamCm) && o.zipSeamCm >= 0.5 && o.zipSeamCm <= 4)) return { ok: false, error: "zipSeamCm must be a number from 0.5 to 4." };
  }
  if (opt.facing) {
    if (!opt.zip) return { ok: false, error: "A zip facing needs a zip front (zip: true)." };
    if (!(Number.isFinite(o.facingWidthCm) && o.facingWidthCm >= 2 && o.facingWidthCm <= 8)) return { ok: false, error: "facingWidthCm must be a number from 2 to 8." };
  }
  const b = bodyBlock(g);
  if (o.rib) b.L -= o.hemRibCm;
  if (!(b.Q - b.sx > 3 && b.ad > b.sd + 8 && b.L > b.ad + 10)) return { ok: false, error: "This size and fit leave no room for an armhole and a body length." };
  const front = bodyPiece(b, "front", o), back = bodyPiece(b, "back", o);
  const sleeve = sleevePiece(g, b, front, back, garment, o);
  if (sleeve.error) return { ok: false, error: sleeve.error };
  const hood = garment === "hoodie" ? hoodPiece(g, front, back) : null;
  const pocket = garment === "hoodie" ? pocketPiece(g) : null;
  let ribs = [];
  if (o.rib) {
    const hemOpening = 4 * b.Q, cuffOpening = sleeveHemWidth(sleeve) * 2;
    ribs = [ribPiece("hemRib", hemOpening * o.hemRibRatio, o.hemRibCm, 1), ribPiece("cuffRib", cuffOpening * o.cuffRibRatio, o.cuffRibCm, 2)];
  }
  let facing = null;
  if (o.zip && o.facing) facing = facingPiece(len(front.segs.find(x => x.kind === "cf").pts), o.facingWidthCm);
  const pieces = [front, back, sleeve, hood, pocket, ...ribs, facing].filter(Boolean).map(p => finish(p, o));
  const s = sleeve.solved;
  const checks = {
    frontArmholeCm: r2(front.armholeLen), backArmholeCm: r2(back.armholeLen),
    capFrontCm: r2(s.frontLen), capBackCm: r2(s.backLen),
    capEaseCm: r2(s.frontLen + s.backLen - front.armholeLen - back.armholeLen),
    capHeightCm: r2(s.h), capHeightRatio: r2(s.h / (front.armholeLen + back.armholeLen)),
    sleeveBicepGirthCm: r2(sleeve.girthCm), sleeveLengthCm: r2(sleeve.lengthCm), // girth = the piece's width; length from the shoulder point (cap top) to the cuff seam
    allSimple: pieces.every(p => p.simple),
  };
  if (o.rib) {
    checks.hemOpeningCm = r2(4 * b.Q); checks.hemRibLengthCm = r2(ribs[0].ribLen);
    checks.cuffOpeningCm = r2(sleeveHemWidth(sleeve) * 2); checks.cuffRibLengthCm = r2(ribs[1].ribLen);
    checks.bodyLengthCm = r2(b.L); checks.finishedBodyLengthCm = r2(b.L + o.hemRibCm);
  }
  const notes = [];
  if (o.zip) {
    const fd = front.segs.find(x => x.kind === "cf").pts;
    checks.zipOpeningCm = r2(len(fd)); // centre-front stitch line, neck to hem (with rib: to the band seam)
    checks.zipFrontPiecesCut = 2; checks.zipSeamAllowanceCm = o.zipSeamCm;
    notes.push(`Zip front: cut two front halves (one mirrored), each with a ${o.zipSeamCm} cm centre-front allowance. Buy an open-end zip of about ${Math.ceil((checks.zipOpeningCm + (o.rib ? o.hemRibCm : 0)) / 5) * 5} cm; the stitch line is ${checks.zipOpeningCm} cm before any hem band or hood-neck turn-back.`);
  }
  if (facing) {
    checks.zipFacingLengthCm = r2(checks.zipOpeningCm); checks.zipFacingWidthCm = o.facingWidthCm; checks.zipFacingPiecesCut = 2;
    notes.push(`Zip facing: cut two ${checks.zipFacingLengthCm} cm strips, ${o.facingWidthCm} cm finished width (cut ${2 * o.facingWidthCm} cm plus seam allowance, folded in half), one behind each front edge to cover the zip tape. Typed width; the zip tape width and the hood-neck turn-back are not checked.`);
  }
  if (hood) {
    checks.neckSeamCm = r2(segLen(front, "neck") + segLen(back, "neck"));
    checks.hoodNeckEdgeCm = r2(hood.neckEdgeLen);
    checks.hoodHeightCm = r2(hood.hoodHeight); checks.hoodDepthCm = r2(hood.hoodDepth);
    checks.pocketWidthCm = r2(pocket.pocketW); checks.pocketHeightCm = r2(pocket.pocketH);
  }
  if (checks.capHeightRatio < 0.22) notes.push("The sleeve cap is flat (a drop shoulder); the sleeve will hang with little shaping.");
  if (checks.capHeightRatio > 0.4) notes.push("The sleeve cap is tall; check the armhole depth against the sleeve width.");
  return { ok: true, garment, size, fit, block: b, pieces, checks, notes, seam: { seamCm: o.seamCm, neckSeamCm: o.neckSeamCm, hemCm: o.hemCm } };
}

/** Draft every size and report how each key point moves from size to size. */
export function grade(garment, sizes, opts = {}) {
  const sizeChart = opts.sizeChart || BODY_CHEST_CM;
  const list = (sizes && sizes.length ? sizes : Object.keys(sizeChart)).filter(s => sizeChart[s] > 0);
  const drafts = [];
  for (const s of list) {
    const d = draft(garment, s, opts);
    if (!d.ok) return { ok: false, error: `${s}: ${d.error}` };
    drafts.push(d);
  }
  const ordered = drafts.slice().sort((a, b) => sizeChart[a.size] - sizeChart[b.size]);
  const keys = [
    ["Half chest (side seam out)", d => d.block.Q], ["Armhole depth", d => d.block.ad], ["Shoulder point from fold", d => d.block.sx],
    ["Body length", d => d.block.L], ["Front armhole length", d => d.checks.frontArmholeCm], ["Sleeve cap height", d => d.checks.capHeightCm],
  ];
  const table = keys.map(([label, f]) => {
    const vals = ordered.map(d => r2(f(d)));
    return { label, values: Object.fromEntries(ordered.map((d, i) => [d.size, vals[i]])), steps: vals.slice(1).map((v, i) => r2(v - vals[i])) };
  });
  const monotone = table.every(row => row.steps.every(v => v >= -1e-9));
  return { ok: true, garment, sizes: ordered.map(d => d.size), drafts: ordered, table, monotone };
}

/* ---------- output ---------- */

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pathOf = ring => "M" + ring.map(p => `${r2(p[0])} ${r2(p[1])}`).join(" L") + " Z";

/** One piece as SVG in cm (width/height carry the unit, so it prints 1:1). */
export function pieceSvg(piece, { margin = 2 } = {}) {
  if (!piece || !piece.cut) return "";
  const b = piece.bbox, x0 = b.minX - margin, y0 = b.minY - margin, w = b.w + 2 * margin, h = b.h + 2 * margin;
  const n = piece.notches.map(n => `<circle cx="${r2(n.at[0])}" cy="${r2(n.at[1])}" r="0.35" fill="#c0392b"><title>${esc(n.label)}</title></circle>`).join("");
  const gr = piece.grain && piece.grain.length === 2 ? `<line x1="${r2(piece.grain[0][0])}" y1="${r2(piece.grain[0][1])}" x2="${r2(piece.grain[1][0])}" y2="${r2(piece.grain[1][1])}" stroke="#444" stroke-width="0.12" marker-end="url(#a)" marker-start="url(#a)"/>` : "";
  const label = `<text x="${r2(b.minX + b.w / 2)}" y="${r2(b.minY + b.h / 2)}" font-size="2" text-anchor="middle" fill="#333">${esc(piece.name)} x${piece.qty}${piece.cutOnFold ? " on fold" : ""}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x0)} ${r2(y0)} ${r2(w)} ${r2(h)}" width="${r2(w)}cm" height="${r2(h)}cm" role="img" aria-label="Pattern piece ${esc(piece.name)}, ${piece.qty} to cut, ${b.w} by ${b.h} cm"><defs><marker id="a" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4 Z" fill="#444"/></marker></defs><path d="${pathOf(piece.cut)}" fill="none" stroke="#111" stroke-width="0.15"/><path d="${pathOf(piece.stitch)}" fill="#f6f1e6" fill-opacity="0.6" stroke="#2c7a4b" stroke-width="0.12" stroke-dasharray="0.6 0.4"/>${gr}${n}${label}</svg>`;
}

/** Every size's stitch line of one piece on top of each other, from the same origin (the grading overlay). */
export function gradeSvg(graded, pieceName, { px = 6 } = {}) {
  if (!graded || !graded.ok) return "";
  const rings = graded.drafts.map(d => ({ size: d.size, p: d.pieces.find(x => x.name === pieceName) })).filter(x => x.p);
  if (!rings.length) return "";
  const all = rings.flatMap(r => r.p.stitch);
  const minX = Math.min(...all.map(p => p[0])) - 2, maxX = Math.max(...all.map(p => p[0])) + 2;
  const minY = Math.min(...all.map(p => p[1])) - 2, maxY = Math.max(...all.map(p => p[1])) + 2;
  const hues = rings.map((_, i) => Math.round(220 - (i * 200) / Math.max(1, rings.length - 1)));
  const paths = rings.map((r, i) => `<path d="${pathOf(r.p.stitch)}" fill="none" stroke="hsl(${hues[i]} 65% 40%)" stroke-width="0.14"><title>${esc(r.size)}</title></path>`).join("");
  const key = rings.map((r, i) => `<text x="${r2(minX + 1)}" y="${r2(minY + 2.5 + i * 2.2)}" font-size="1.8" fill="hsl(${hues[i]} 65% 40%)">${esc(r.size)}</text>`).join("");
  const w = maxX - minX, h = maxY - minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(minX)} ${r2(minY)} ${r2(w)} ${r2(h)}" width="${r2(w * px)}" height="${r2(h * px)}" role="img" aria-label="Graded ${esc(pieceName)}, sizes ${esc(rings.map(r => r.size).join(", "))}, drawn from the same origin">${paths}${key}</svg>`;
}

/**
 * ASCII DXF (R12 style: POLYLINEs and TEXT, units centimetres) with layers
 * CUT, STITCH, GRAIN and NOTCH. Pieces are laid left to right with a gap so
 * they do not overlap; size goes in the label. Opens in any DXF reader.
 */
export function dxf(drafts, { gapCm = 5 } = {}) {
  const list = Array.isArray(drafts) ? drafts : [drafts];
  const out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "5", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  let x = 0;
  const poly = (layer, pts, closed, dx, dy) => {
    out.push("0", "POLYLINE", "8", layer, "66", "1", "70", closed ? "1" : "0");
    pts.forEach(p => out.push("0", "VERTEX", "8", layer, "10", String(r2(p[0] + dx)), "20", String(r2(-(p[1]) + dy)), "30", "0"));
    out.push("0", "SEQEND", "8", layer);
  };
  for (const d of list) {
    if (!d || !d.ok) continue;
    for (const p of d.pieces) {
      const dx = x - p.bbox.minX, dy = -p.bbox.minY + p.bbox.h; // DXF y points up
      poly("CUT", p.cut, true, dx, dy);
      poly("STITCH", p.stitch, true, dx, dy);
      if (p.grain && p.grain.length === 2) poly("GRAIN", p.grain, false, dx, dy);
      p.notches.forEach(n => out.push("0", "POINT", "8", "NOTCH", "10", String(r2(n.at[0] + dx)), "20", String(r2(-n.at[1] + dy)), "30", "0"));
      out.push("0", "TEXT", "8", "STITCH", "10", String(r2(p.bbox.minX + p.bbox.w / 2 + dx)), "20", String(r2(p.bbox.h / 2)), "30", "0", "40", "1.5", "1", `${d.size} ${p.name} x${p.qty}${p.cutOnFold ? " fold" : ""}`);
      x += p.bbox.w + gapCm;
    }
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n") + "\n";
}

/** Text summary of the checks a pattern maker runs before cutting. */
export function checkText(d) {
  if (!d || !d.ok) return d && d.error ? d.error : "No draft.";
  const c = d.checks;
  return [
    `${d.garment} ${d.size} (${d.fit}): seam ${d.seam.seamCm} cm, neck ${d.seam.neckSeamCm} cm, hem ${d.seam.hemCm} cm`,
    `Front armhole ${c.frontArmholeCm} cm, back armhole ${c.backArmholeCm} cm`,
    `Sleeve cap ${c.capFrontCm} + ${c.capBackCm} cm = ease ${c.capEaseCm} cm over the armholes; cap height ${c.capHeightCm} cm`,
    ...(c.hoodNeckEdgeCm ? [`Hood neck edge ${c.hoodNeckEdgeCm} cm to sew onto a neck seam of ${c.neckSeamCm} cm (one side); hood ${c.hoodHeightCm} cm high, ${c.hoodDepthCm} cm front to back; pocket ${c.pocketWidthCm} x ${c.pocketHeightCm} cm`] : []),
    ...(c.hemRibLengthCm ? [`Rib: hem band ${c.hemRibLengthCm} cm for a ${c.hemOpeningCm} cm opening, cuff band ${c.cuffRibLengthCm} cm for a ${c.cuffOpeningCm} cm opening; body cut ${c.bodyLengthCm} cm, ${c.finishedBodyLengthCm} cm finished with the band`] : []),
    c.allSimple ? "No piece crosses itself." : "A piece crosses itself: check the block.",
    ...d.notes,
  ].join("\n");
}
