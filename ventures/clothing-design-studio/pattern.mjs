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
 * factory or pattern maker's own block always wins. Hoodies need a hood and
 * a pocket, which are not drafted here.
 */
import { garmentMeasurements, BODY_CHEST_CM } from "./fit.mjs";

const r2 = v => Math.round(v * 100) / 100;
const KAPPA = 0.5522847498;

export const DRAFTED = Object.freeze(["tee", "longsleeve", "crewneck"]);
export const DEFAULTS = Object.freeze({ seamCm: 1, neckSeamCm: 0.6, hemCm: 2.5, capEaseCm: 1.0, sleeveLenCm: { tee: 22, longsleeve: 62, crewneck: 62 } });

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
    if (Math.abs(det) < 1e-6) p = [ring[i][0] + n1[0] * d1, ring[i][1] + n1[1] * d1];
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

function armholeCurve(b, side) {
  const sc = side === "front" ? 1.25 : 0.6;               // front scoops deeper than back
  const P0 = [b.sx, b.sd], P3 = [b.Q, b.ad];
  const span = b.Q - b.sx, drop = b.ad - b.sd;
  const P1 = [b.sx - sc, b.sd + 0.45 * drop];
  const P2 = [b.Q - 0.55 * span - 0.3 * sc, b.ad - 0.02 * drop];
  return flat(P0, P1, P2, P3, 32);
}

function bodyPiece(b, side, o) {
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
    { kind: "fold", pts: [[0, b.L], [0, fd]] },
  ];
  return {
    name: side, qty: 1, cutOnFold: true, segs,
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
  const w = 0.22 * bc + 0.1 * (g.chest - bc) + 1;            // bicep width, flat
  const sl = o.sleeveLenCm[garment];
  const hemW = garment === "tee" ? w - 2.5 : Math.max(0.13 * bc, w * 0.62);
  const solved = solveCap(w, front.armholeLen + o.capEaseCm / 2, back.armholeLen + o.capEaseCm / 2);
  if (!solved.ok) return { error: "no sleeve cap reaches the armhole length at this width" };
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
    name: "sleeve", qty: 2, cutOnFold: false, segs, solved,
    notches: [
      { at: [t, -solved.h], label: "shoulder" },
      { at: solved.cap.left[Math.round(solved.cap.left.length * 0.55)], label: "F" },
      { at: solved.cap.right[Math.round(solved.cap.right.length * 0.45)], label: "B" },
    ],
    grain: [[0, sl * 0.15], [0, sl * 0.85]],
  };
}

function finish(piece, o) {
  const allow = { neck: o.neckSeamCm, shoulder: o.seamCm, armhole: o.seamCm, side: o.seamCm, hem: o.hemCm, fold: 0, cap: o.seamCm, sleeveSeam: o.seamCm, sleeveHem: o.hemCm };
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
  if (!DRAFTED.includes(garment)) return { ok: false, error: garment === "hoodie" ? "A hoodie needs a hood and a pocket, which are not drafted here; use a crewneck block." : `No block for "${garment}".` };
  const g = garmentMeasurements(garment, fit, sizeChart)[size];
  if (!g) return { ok: false, error: `Size ${size} is not in the size chart.` };
  const o = { ...DEFAULTS, ...opt, sleeveLenCm: { ...DEFAULTS.sleeveLenCm, ...(opt.sleeveLenCm || {}) } };
  for (const k of ["seamCm", "neckSeamCm", "hemCm", "capEaseCm"]) {
    if (!(Number.isFinite(o[k]) && o[k] >= 0 && o[k] <= 10)) return { ok: false, error: `${k} must be a number from 0 to 10.` };
  }
  const b = bodyBlock(g);
  if (!(b.Q - b.sx > 3 && b.ad > b.sd + 8 && b.L > b.ad + 10)) return { ok: false, error: "This size and fit leave no room for an armhole and a body length." };
  const front = bodyPiece(b, "front", o), back = bodyPiece(b, "back", o);
  const sleeve = sleevePiece(g, b, front, back, garment, o);
  if (sleeve.error) return { ok: false, error: sleeve.error };
  const pieces = [front, back, sleeve].map(p => finish(p, o));
  const s = sleeve.solved;
  const checks = {
    frontArmholeCm: r2(front.armholeLen), backArmholeCm: r2(back.armholeLen),
    capFrontCm: r2(s.frontLen), capBackCm: r2(s.backLen),
    capEaseCm: r2(s.frontLen + s.backLen - front.armholeLen - back.armholeLen),
    capHeightCm: r2(s.h), capHeightRatio: r2(s.h / (front.armholeLen + back.armholeLen)),
    allSimple: pieces.every(p => p.simple),
  };
  const notes = [];
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
    c.allSimple ? "No piece crosses itself." : "A piece crosses itself: check the block.",
    ...d.notes,
  ].join("\n");
}
