/**
 * Nesting marker from the real cut outlines (pattern.mjs), replacing the
 * rectangles of marker.mjs: the armhole, neck and sleeve-cap curves can now sit
 * in each other's gaps, so the metres per garment come from a layout of the
 * actual shapes.
 *
 * How: each piece is unfolded if it is cut on the fold (mirrored about its
 * fold line, x = 0), a pair is a piece and its mirror, and every piece is
 * rasterised on a grid (default 0.5 cm) with every cell the outline touches or
 * encloses marked busy, so the raster is never smaller than the shape. Pieces
 * keep the grain (y runs along the cloth) and may turn 180 degrees. They are
 * placed bottom-left: the position that ends earliest along the cloth, then
 * nearest the left selvedge. Several orders (largest area, longest, widest and
 * seeded shuffles) are tried and the shortest marker wins. Deterministic.
 *
 * Checked independently by `verifyNest`, which tests the placed outlines in
 * exact arithmetic (no edges crossing, no piece inside another, all inside the
 * usable width), so a raster error cannot hide an overlap.
 *
 * What it is not: a factory's CAD marker (those allow small turns off grain
 * where the fabric permits, tune the gaps, and respect a fabric's pattern
 * repeat or nap). A greedy raster marker is usually a few points less efficient
 * than a good CAD one, so treat the metres as a cautious estimate and let the
 * factory's marker consumption win. Stripes, plaids and one-way (nap) fabrics
 * are not handled: `oneWay: true` forbids the 180 degree turn.
 */
import { draft, area } from "./pattern.mjs";

const r2 = v => Math.round(v * 100) / 100;

function mirror(ring) { return ring.map(([x, y]) => [-x, y]).reverse(); }
function rot180(ring) { return ring.map(([x, y]) => [-x, -y]); }
function bboxOf(rings) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const r of rings) for (const [x, y] of r) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return { minX: a, minY: b, maxX: c, maxY: d };
}

/** The full-width cut shapes of one garment in one size: [{name, rings:[ring...]}], one entry per piece to cut. */
export function cutShapes(pieces, label = "") {
  const out = [];
  for (const p of pieces) {
    for (let k = 0; k < p.qty; k++) {
      let rings = [p.cut];
      if (p.cutOnFold) rings = [p.cut, mirror(p.cut)];
      // a pair is left and right: the second of a pair is the mirror image
      else if (p.qty === 2 && k === 1) rings = [mirror(p.cut)];
      out.push({ name: p.name + (p.qty > 1 ? ` ${k + 1}` : ""), label, rings });
    }
  }
  return out;
}

/** Cells (dx, dy) of a shape's raster, as row spans [{dy, x0, x1}] (x1 exclusive), for shapes translated so bbox min is the origin. */
function rasterise(rings, g) {
  const rows = new Map(); // dy -> Uint8Array busy flags built lazily
  const bb = bboxOf(rings), W = Math.ceil((bb.maxX - bb.minX) / g) + 2, H = Math.ceil((bb.maxY - bb.minY) / g) + 2;
  const grid = new Uint8Array(W * H);
  const mark = (x, y) => {
    const cx = Math.floor((x - bb.minX) / g) + 1, cy = Math.floor((y - bb.minY) / g) + 1;
    // mark the cell and, because an outline can sit right on a cell edge, its neighbours across an edge it touches
    for (let dy = -0; dy <= 0; dy++) grid[(cy + dy) * W + cx] = 1;
  };
  // edges: sample finely and mark every cell a sample falls in, plus the cells either side along the cell edge
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (g / 8)));
      for (let k = 0; k <= n; k++) mark(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n);
    }
  }
  // interior: even-odd scanline through cell centres
  for (const ring of rings) {
    for (let cy = 0; cy < H; cy++) {
      const y = bb.minY + (cy - 0.5) * g;
      const xs = [];
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
        if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let j = 0; j + 1 < xs.length; j += 2) {
        const a = Math.floor((xs[j] - bb.minX) / g) + 1, b = Math.floor((xs[j + 1] - bb.minX) / g) + 1;
        for (let cx = a; cx <= b; cx++) grid[cy * W + cx] = 1;
      }
    }
  }
  const spans = [];
  for (let cy = 0; cy < H; cy++) {
    let cx = 0;
    while (cx < W) {
      if (!grid[cy * W + cx]) { cx++; continue; }
      let e = cx; while (e < W && grid[cy * W + e]) e++;
      spans.push({ dy: cy, x0: cx, x1: e }); cx = e;
    }
  }
  return { spans, W, H, bb };
}

class Strip {
  constructor(widthCells) { this.w = widthCells; this.rows = []; this.pref = []; this.firstOpen = 0; }
  ensure(y) { while (this.rows.length <= y) { this.rows.push(new Uint8Array(this.w)); const p = new Int32Array(this.w + 1); this.pref.push(p); } }
  fits(r, x, y) {
    if (x < 0 || x + r.W > this.w) return false;
    this.ensure(y + r.H);
    for (const s of r.spans) {
      const p = this.pref[y + s.dy];
      if (p[x + s.x1] - p[x + s.x0] !== 0) return false;
    }
    return true;
  }
  /**
   * Leftmost x where raster r fits with its top at row y, or -1. When a span is
   * blocked it jumps x past the rightmost busy cell under that span (found by
   * binary search on the row's running count), so a crowded row costs a few
   * jumps instead of one test per column. Same answer as testing every x.
   */
  firstFit(r, y) {
    this.ensure(y + r.H);
    let x = 0;
    const lim = this.w - r.W;
    outer: while (x <= lim) {
      for (const s of r.spans) {
        const p = this.pref[y + s.dy], a = x + s.x0, b = x + s.x1;
        if (p[b] - p[a] === 0) continue;
        // rightmost busy cell in [a, b): smallest k in (a, b] with p[k] === p[b], minus one
        let lo = a + 1, hi = b;
        while (lo < hi) { const m = (lo + hi) >> 1; if (p[m] === p[b]) hi = m; else lo = m + 1; }
        x = lo - s.x0; // busy cell lo - 1 now sits just left of the span
        continue outer;
      }
      return x;
    }
    return -1;
  }
  put(r, x, y) {
    this.ensure(y + r.H);
    const touched = new Set();
    for (const s of r.spans) { const row = this.rows[y + s.dy]; for (let c = x + s.x0; c < x + s.x1; c++) row[c] = 1; touched.add(y + s.dy); }
    for (const t of touched) { const p = this.pref[t], row = this.rows[t]; for (let c = 0; c < this.w; c++) p[c + 1] = p[c] + row[c]; }
    while (this.firstOpen < this.rows.length && this.pref[this.firstOpen][this.w] === this.w) this.firstOpen++;
  }
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function placeAll(shapes, order, widthCm, g, oneWay) {
  const wc = Math.floor(widthCm / g + 1e-9), strip = new Strip(wc);
  const placed = [];
  let endRow = 0;
  for (const idx of order) {
    const sh = shapes[idx];
    let best = null;
    for (const o of sh.orients) {
      if (o.r.W > wc) continue;
      // scan rows from the top of the marker; stop when no later row can beat the best end row
      // rows above the first row with a free cell are full, so the piece's first busy row cannot sit there
      const dyMin = o.r.spans.length ? o.r.spans[0].dy : 0;
      for (let y = Math.max(0, strip.firstOpen - dyMin); ; y++) {
        if (best && y + o.r.H - 2 > best.end) break;
        const hit = strip.firstFit(o.r, y);
        if (hit >= 0) {
          const end = y + o.r.H;
          if (!best || end < best.end || (end === best.end && (y < best.y || (y === best.y && hit < best.x)))) best = { o, x: hit, y, end };
          break;
        }
        if (y > endRow + 4000) return null;
      }
    }
    if (!best) return null;
    strip.put(best.o.r, best.x, best.y);
    const last = best.y + best.o.r.H - 1; // the raster has a 1-cell pad each side
    if (last > endRow) endRow = last;
    placed.push({ idx, o: best.o, x: best.x, y: best.y });
  }
  return placed;
}

/**
 * Nest cut shapes onto a fabric width.
 * @param shapes from cutShapes(), may be concatenated across sizes
 * @param {{widthCm:number, edgeCm?:number, gridCm?:number, tries?:number, oneWay?:boolean, seed?:number}} opt
 * widthCm is the cloth width; edgeCm is lost at each selvedge.
 */
export function nest(shapes, { widthCm = 150, edgeCm = 1.5, gridCm = 0.5, tries = 12, oneWay = false, seed = 1, improve = 0 } = {}) {
  if (!shapes.length) return { ok: false, error: "No pieces to nest." };
  if (!(widthCm > 10 && widthCm <= 400)) return { ok: false, error: "Fabric width must be from 10 to 400 cm." };
  if (!(edgeCm >= 0 && edgeCm * 2 < widthCm / 2)) return { ok: false, error: "Selvedge loss is too large for this width." };
  if (!(gridCm >= 0.2 && gridCm <= 2)) return { ok: false, error: "Grid must be from 0.2 to 2 cm." };
  if (!(Number.isInteger(improve) && improve >= 0 && improve <= 5000)) return { ok: false, error: "Search steps must be a whole number from 0 to 5000." };
  const usable = widthCm - 2 * edgeCm;
  const prepared = shapes.map(s => {
    const orients = [{ rot: 0, rings: s.rings }];
    if (!oneWay) orients.push({ rot: 180, rings: s.rings.map(rot180) });
    for (const o of orients) { o.r = rasterise(o.rings, gridCm); }
    return { ...s, orients, areaCm2: s.rings.reduce((a, r) => a + Math.abs(area(r)), 0) };
  });
  for (const p of prepared) {
    const need = Math.min(...p.orients.map(o => (o.r.W - 2) * gridCm));
    if (need > usable) return { ok: false, error: `Piece "${p.name}" is ${r2(need)} cm wide, more than the ${r2(usable)} cm of usable cloth.` };
  }
  const idx = prepared.map((_, i) => i);
  const byArea = [...idx].sort((a, b) => prepared[b].areaCm2 - prepared[a].areaCm2);
  const byLen = [...idx].sort((a, b) => (prepared[b].orients[0].r.H) - (prepared[a].orients[0].r.H));
  const byWid = [...idx].sort((a, b) => (prepared[b].orients[0].r.W) - (prepared[a].orients[0].r.W));
  const orders = [byArea, byLen, byWid];
  const rnd = mulberry(seed);
  for (let t = 0; t < tries; t++) {
    const o = [...byArea];
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    // keep the big pieces first and shuffle the tail, so a try is a variation of a good order
    const keep = Math.max(1, Math.floor(o.length / 3));
    const head = byArea.slice(0, keep), tail = o.filter(i => !head.includes(i));
    orders.push(head.concat(tail));
  }
  let bestRun = null, rowsTried = 0;
  const run = ord => {
    const placed = placeAll(prepared, ord, usable, gridCm, oneWay);
    rowsTried++;
    if (!placed) return null;
    const len = Math.max(...placed.map(p => (p.y + p.o.r.H - 1) * gridCm));
    // tie-break on how far down the cloth the pieces end in total, so a move that
    // packs the tail tighter without yet shortening the marker still counts
    let sink = 0; for (const p of placed) sink += p.y + p.o.r.H;
    return { len, sink, placed, ord };
  };
  const better = (a, b) => !b || a.len < b.len - 1e-9 || (Math.abs(a.len - b.len) < 1e-9 && a.sink < b.sink);
  for (const ord of orders) {
    const r = run(ord);
    if (r && better(r, bestRun)) bestRun = r;
  }
  if (!bestRun) return { ok: false, error: "No layout found." };
  const startRun = bestRun;
  // Local search over the placement order (the bottom-left placer stays greedy):
  // swap two pieces or move one to another place in the order; keep the result
  // when it is no worse. Seeded, so the same inputs give the same marker.
  let accepted = 0;
  if (improve > 0 && prepared.length > 1) {
    let cur = bestRun;
    const n = prepared.length;
    for (let it = 0; it < improve; it++) {
      const ord = [...cur.ord];
      const i = Math.floor(rnd() * n);
      // mostly near moves (a few places apart), sometimes anywhere
      let j = rnd() < 0.7 ? i + 1 + Math.floor(rnd() * Math.min(6, n - 1)) : Math.floor(rnd() * n);
      j = ((j % n) + n) % n; if (j === i) j = (i + 1) % n;
      if (rnd() < 0.5) { [ord[i], ord[j]] = [ord[j], ord[i]]; }
      else { const [v] = ord.splice(i, 1); ord.splice(j, 0, v); }
      const r = run(ord);
      if (!r) continue;
      if (!better(cur, r)) { cur = r; accepted++; }
      if (better(r, bestRun)) bestRun = r;
    }
  }
  // transform the real outlines to marker coordinates (cm): x from the left usable edge, y along the cloth
  const toMarker = run => run.placed.map(p => {
    const o = p.o, bb = o.r.bb;
    const dx = edgeCm + p.x * gridCm - (bb.minX - gridCm), dy = p.y * gridCm - (bb.minY - gridCm);
    const rings = o.rings.map(r => r.map(([x, y]) => [r2(x + dx), r2(y + dy)]));
    return { name: prepared[p.idx].name, label: prepared[p.idx].label, rot: o.rot, rings, areaCm2: prepared[p.idx].areaCm2 };
  });
  const lengthOf = ps => r2(Math.max(...ps.flatMap(p => p.rings.flat().map(pt => pt[1]))) - Math.min(0, ...ps.flatMap(p => p.rings.flat().map(pt => pt[1]))));
  const out = toMarker(bestRun);
  const lengthCm = lengthOf(out), lengthBeforeSearchCm = lengthOf(toMarker(startRun));
  const pieceArea = out.reduce((a, p) => a + p.areaCm2, 0);
  return {
    ok: true, widthCm, usableCm: r2(usable), edgeCm, lengthCm, pieces: out, ordersTried: rowsTried,
    searchSteps: improve, searchAccepted: accepted, lengthBeforeSearchCm,
    pieceAreaCm2: r2(pieceArea), efficiencyPct: r2(100 * pieceArea / (lengthCm * widthCm)),
    efficiencyUsablePct: r2(100 * pieceArea / (lengthCm * usable)),
  };
}

/** A marker for a ratio of sizes of one drafted garment: ratio {S:1, M:2, L:1}. Adds the metres per garment. */
export function nestRatio(garment, ratio, { fit = "regular", widthCm = 150, endLossCm = 6, only = null, ...opt } = {}) {
  // only: "body" keeps every piece except the rib bands, "rib" keeps just the bands (rib is usually a separate knit with its own width)
  const keep = p => only === "rib" ? /Rib$/.test(p.name) : only === "body" ? !/Rib$/.test(p.name) : true;
  const shapes = [];
  let garments = 0;
  for (const [size, n] of Object.entries(ratio)) {
    if (!(Number.isInteger(n) && n >= 0 && n <= 20)) return { ok: false, error: `Count for ${size} must be a whole number from 0 to 20.` };
    if (!n) continue;
    const d = draft(garment, size, { fit, ...(opt.draftOpts || {}) });
    if (!d.ok) return d;
    for (let i = 0; i < n; i++) shapes.push(...cutShapes(d.pieces.filter(keep), size));
    garments += n;
  }
  if (!garments) return { ok: false, error: "Ratio has no garments." };
  const m = nest(shapes, { widthCm, ...opt });
  if (!m.ok) return m;
  const total = m.lengthCm + endLossCm;
  return { ...m, garments, endLossCm, cmPerGarment: r2(total / garments), metresPerGarment: r2(total / garments / 100) };
}

// ---- independent exact check -------------------------------------------------

function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}
function inside(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Do two rings overlap (edges crossing, or one inside the other)? */
export function ringsOverlap(A, B) {
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) if (segCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return inside(A[0], B) || inside(B[0], A);
}

/** Exact check of a nest() result: every outline within the usable width, none overlapping another. */
export function verifyNest(res, tol = 0.02) {
  const problems = [];
  const lo = res.edgeCm - tol, hi = res.widthCm - res.edgeCm + tol;
  const rings = [];
  res.pieces.forEach((p, i) => p.rings.forEach(r => rings.push({ i, r, bb: bboxOf([r]) })));
  for (const { i, bb } of rings) {
    if (bb.minX < lo || bb.maxX > hi) problems.push(`${res.pieces[i].name}: outside the usable width (${r2(bb.minX)} to ${r2(bb.maxX)})`);
    if (bb.minY < -tol) problems.push(`${res.pieces[i].name}: starts before the cloth does`);
  }
  for (let a = 0; a < rings.length; a++) for (let b = a + 1; b < rings.length; b++) {
    if (rings[a].i === rings[b].i && res.pieces[rings[a].i].rings.length === 2) continue; // halves of one unfolded piece meet on the fold
    const A = rings[a].bb, B = rings[b].bb;
    if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) continue;
    if (ringsOverlap(rings[a].r, rings[b].r)) problems.push(`${res.pieces[rings[a].i].name} overlaps ${res.pieces[rings[b].i].name}`);
  }
  return { ok: problems.length === 0, problems };
}

/** The marker drawn to scale: a 1 cm : px scale SVG, each piece filled, labelled with size and piece. */
export function nestSvg(res, { pxPerCm = 4 } = {}) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const W = res.widthCm, L = res.lengthCm;
  const path = r => "M" + r.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L") + "Z";
  const cols = ["#dbe9f6", "#f6e3d3", "#e3f1dc", "#f1dcee", "#f3efc9"];
  const sizes = [...new Set(res.pieces.map(p => p.label))];
  const body = res.pieces.map(p => {
    const bb = bboxOf(p.rings), fill = cols[Math.max(0, sizes.indexOf(p.label)) % cols.length];
    return `<g><path d="${p.rings.map(path).join(" ")}" fill="${fill}" stroke="#222" stroke-width="0.15"/><text x="${r2((bb.minX + bb.maxX) / 2)}" y="${r2((bb.minY + bb.maxY) / 2)}" font-size="2.4" text-anchor="middle" fill="#222">${esc((p.label ? p.label + " " : "") + p.name)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(L)}" width="${r2(W * pxPerCm)}" height="${r2(L * pxPerCm)}" role="img" aria-label="Marker ${r2(W)} cm wide and ${r2(L)} cm long, ${res.pieces.length} pieces, ${res.efficiencyPct} percent of the cloth used"><rect x="0" y="0" width="${r2(W)}" height="${r2(L)}" fill="#fff" stroke="#999" stroke-width="0.2"/><rect x="0" y="0" width="${res.edgeCm}" height="${r2(L)}" fill="#eee"/><rect x="${r2(W - res.edgeCm)}" y="0" width="${res.edgeCm}" height="${r2(L)}" fill="#eee"/>${body}</svg>`;
}

/** For tests only: the occupancy strip and the rasteriser. */
export const _internals = { Strip, rasterise };
