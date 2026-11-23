// Irregular-part nesting on rectangular sheets.
//
// Method (deterministic):
//  1. Each part's outline and holes are flattened with chord tolerance `tol`
//     and, at every allowed rotation, rasterised on a square grid of cell
//     size `res` *conservatively*: a cell is busy if the outline passes
//     through it or its centre is inside the material. Holes stay free, so a
//     small part can be placed inside a large part's cut-out.
//  2. A placed part reserves its cells grown by k = ceil((gap + 2 tol) / res)
//     cells in every direction. Two busy cells k+1 or more apart are at least
//     k*res >= gap + 2 tol apart, and the true curves lie within tol of their
//     chords, so the real parts keep at least `gap` between them. The same
//     argument keeps every part `margin` inside the sheet edge.
//  3. Parts go in largest first (and in a few other orders); each copy takes
//     the first sheet where it fits, at the rotation and position that keep
//     the used length of the sheet shortest, then leftmost, then lowest, so
//     the offcut is one clean strip at the far end of the sheet.
//  4. `verify` re-checks the result without the raster: it measures the
//     distance between every pair of placed outlines from their edges.
//
// The grid makes this a greedy heuristic, not an optimum (compact.mjs can
// squeeze the last sheet afterwards): on the classic
// ESICUP strip benchmarks its strips are about 20% longer than the best
// published ones (eval/esicup-strip-2026-11-22.md). The point of the guarantee in (2) is that whatever it
// produces can be cut as drawn.

import { compactSheet } from "./compact.mjs";
import { partRings, bboxOf, transformEdges, rotation, flattenLoop, pointInRing } from "./geom.mjs";

const SNAP = 1e-9;
const snap = (u) => {
  const r = Math.round(u);
  return Math.abs(u - r) < SNAP ? r : u;
};

function rotRings(rings, deg) {
  const m = rotation(deg);
  return rings.map((r) => r.map(([x, y]) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y]));
}

/**
 * Conservative raster of polygon rings (even-odd fill) on cells of size res,
 * with cell (0, 0) starting at the rings' bbox minimum.
 * Returns { w, h, minX, minY, grid: Uint8Array(w*h), spans: [[a, b], ...] per row }.
 */
export function rasterise(rings, res) {
  const bb = bboxOf(rings);
  const U = (x) => snap((x - bb.minX) / res), V = (y) => snap((y - bb.minY) / res);
  const w = Math.max(1, Math.ceil(U(bb.maxX))), h = Math.max(1, Math.ceil(V(bb.maxY)));
  const grid = new Uint8Array(w * h);
  const mark = (i, j) => {
    if (i >= 0 && i < w && j >= 0 && j < h) grid[j * w + i] = 1;
  };
  const urs = rings.map((r) => r.map(([x, y]) => [U(x), V(y)]));
  // cells whose open interior meets a segment
  for (const r of urs) {
    for (let k = 0; k < r.length; k++) {
      let [x1, y1] = r[k], [x2, y2] = r[(k + 1) % r.length];
      if (y1 > y2) [x1, y1, x2, y2] = [x2, y2, x1, y1];
      const j0 = Math.floor(y1), j1 = Math.ceil(y2) - 1;
      for (let j = j0; j <= j1; j++) {
        // clip to the band j..j+1
        const ya = Math.max(y1, j), yb = Math.min(y2, j + 1);
        let xa, xb;
        if (y2 === y1) { xa = Math.min(x1, x2); xb = Math.max(x1, x2); }
        else {
          const xa0 = x1 + ((x2 - x1) * (ya - y1)) / (y2 - y1), xb0 = x1 + ((x2 - x1) * (yb - y1)) / (y2 - y1);
          xa = Math.min(xa0, xb0); xb = Math.max(xa0, xb0);
        }
        const i0 = Math.floor(snap(xa)), i1 = Math.ceil(snap(xb)) - 1;
        for (let i = i0; i <= i1; i++) mark(i, j);
      }
    }
  }
  // cell centres inside the material (even-odd over all rings)
  for (let j = 0; j < h; j++) {
    const yc = j + 0.5, xs = [];
    for (const r of urs) for (let k = 0; k < r.length; k++) {
      const [x1, y1] = r[k], [x2, y2] = r[(k + 1) % r.length];
      if ((y1 > yc) !== (y2 > yc)) xs.push(x1 + ((x2 - x1) * (yc - y1)) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil(xs[q] - 0.5)), i1 = Math.min(w - 1, Math.floor(xs[q + 1] - 0.5));
      for (let i = i0; i <= i1; i++) grid[j * w + i] = 1;
    }
  }
  return { w, h, minX: bb.minX, minY: bb.minY, grid, spans: spansOf(grid, w, h) };
}

function spansOf(grid, w, h) {
  const rows = [];
  for (let j = 0; j < h; j++) {
    const row = [];
    let i = 0;
    while (i < w) {
      if (!grid[j * w + i]) { i++; continue; }
      const a = i;
      while (i < w && grid[j * w + i]) i++;
      row.push([a, i]);
    }
    rows.push(row);
  }
  return rows;
}

/** Grow a raster by k cells in every direction (a square, Chebyshev dilation). */
export function dilate(m, k) {
  if (k <= 0) return { w: m.w, h: m.h, off: 0, grid: m.grid };
  const W = m.w + 2 * k, H = m.h + 2 * k;
  const tmp = new Uint8Array(W * m.h);
  for (let j = 0; j < m.h; j++) {
    for (const [a, b] of m.spans[j]) tmp.fill(1, j * W + a, j * W + b + 2 * k);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W; i++) {
    // vertical: out[j] = any tmp[j-2k..j] (in tmp's row coordinates shifted by k)
    let count = 0;
    for (let j = 0; j < H; j++) {
      const add = j < m.h ? tmp[j * W + i] : 0;
      count += add;
      const drop = j - 2 * k - 1;
      if (drop >= 0 && drop < m.h) count -= tmp[drop * W + i];
      if (count > 0) out[j * W + i] = 1;
    }
  }
  return { w: W, h: H, off: k, grid: out };
}

class Sheet {
  constructor(GW, GH, lo, hi) {
    this.GW = GW;
    this.GH = GH;
    this.occ = new Uint8Array(GW * GH);
    this.prevOcc = new Int32Array(GW * GH);
    this.nextFree = new Int32Array((GW + 1) * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      if (i < lo.i || i > hi.i || j < lo.j || j > hi.j) this.occ[j * GW + i] = 1;
    }
    for (let j = 0; j < GH; j++) this.rebuild(j);
    this.extent = 0;
    this.placements = [];
  }
  rebuild(j) {
    const { GW, occ, prevOcc, nextFree } = this;
    let prev = -1;
    for (let i = 0; i < GW; i++) {
      if (occ[j * GW + i]) prev = i;
      prevOcc[j * GW + i] = prev;
    }
    const base = j * (GW + 1);
    nextFree[base + GW] = GW;
    for (let i = GW - 1; i >= 0; i--) nextFree[base + i] = occ[j * GW + i] ? nextFree[base + i + 1] : i;
  }
  /** Best (x, y) for a raster, or null; `best` is the score to beat [ext, xw, y]. */
  find(mask, best) {
    const { GW, GH, prevOcc, nextFree } = this;
    const { w, h, spans } = mask;
    let found = null, lastDy = 0;
    for (let y = 0; y + h <= GH; y++) {
      let x = 0;
      for (;;) {
        if (x + w > GW) break;
        const ext = Math.max(this.extent, x + w);
        if (best && (ext > best[0] || (ext === best[0] && x + w >= best[1]))) break;
        // Test the mask row that blocked last first: a neighbouring part
        // usually blocks the next candidate at the same height too.
        let hit = false;
        for (let q = -1; q < h && !hit; q++) {
          const dy = q < 0 ? lastDy : q;
          if (q === lastDy) continue;
          const row = y + dy;
          for (const [a, b] of spans[dy]) {
            const p = prevOcc[row * GW + x + b - 1];
            if (p >= x + a) {
              const nx = nextFree[row * (GW + 1) + p] - a;
              x = Math.max(x + 1, nx);
              hit = true;
              lastDy = dy;
              break;
            }
          }
        }
        if (!hit) {
          best = [ext, x + w, y];
          found = { x, y, score: best };
          break;
        }
      }
    }
    return found;
  }
  place(dmask, x, y, w) {
    const { GW, GH, occ } = this;
    const x0 = x - dmask.off, y0 = y - dmask.off;
    for (let j = 0; j < dmask.h; j++) {
      const row = y0 + j;
      if (row < 0 || row >= GH) continue;
      let changed = false;
      for (let i = 0; i < dmask.w; i++) {
        const col = x0 + i;
        if (col < 0 || col >= GW || !dmask.grid[j * dmask.w + i]) continue;
        occ[row * GW + col] = 1;
        changed = true;
      }
      if (changed) this.rebuild(row);
    }
    this.extent = Math.max(this.extent, x + w);
  }
}

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * Nest parts on sheets.
 * parts: [{ id, name, qty, part }] where `part` comes from geom.finishPart.
 * opts: { sheetW, sheetH, gap, margin, res, tol, rotations: [deg], maxSheets, orders, searchIters, timeLimitMs }
 */
export function nest(items, opts) {
  const o = {
    gap: 0, margin: 0, tol: 0.01, rotations: [0, 90, 180, 270], maxSheets: 50, orders: 4, searchIters: 0, compactMoves: 0, timeLimitMs: 20000,
    ...opts,
  };
  const { sheetW, sheetH, gap, margin, tol } = o;
  if (!(sheetW > 0 && sheetH > 0)) return { ok: false, error: "Sheet width and length must be positive." };
  if (!(gap >= 0) || !(margin >= 0)) return { ok: false, error: "Gap and edge margin cannot be negative." };
  const res = o.res > 0 ? o.res : autoRes(sheetW, sheetH);
  const GW = Math.floor(sheetW / res + SNAP), GH = Math.floor(sheetH / res + SNAP);
  if (GW * GH > 6e6) return { ok: false, error: `The grid would be ${GW} x ${GH} cells; use a coarser grid (larger cell size).` };
  const k = Math.ceil(snap((gap + 2 * tol) / res));
  // usable cells: closed cell [i res, (i+1) res] inside [margin + tol, W - margin - tol]
  const lo = { i: Math.ceil(snap((margin + tol) / res)), j: Math.ceil(snap((margin + tol) / res)) };
  const hi = { i: Math.floor(snap((sheetW - margin - tol) / res)) - 1, j: Math.floor(snap((sheetH - margin - tol) / res)) - 1 };
  const t0 = Date.now();

  // rasters per item and rotation
  const shapes = items.map((it) => {
    const rings = partRings(it.part, tol);
    const rots = [];
    const seen = new Set();
    for (const deg of o.rotations) {
      const rr = rotRings(rings, deg);
      const mask = rasterise(rr, res);
      const sig = mask.w + "x" + mask.h + ":" + hashGrid(mask.grid);
      if (seen.has(sig)) continue; // a symmetric part looks the same at this turn
      seen.add(sig);
      const fits = mask.w <= hi.i - lo.i + 1 && mask.h <= hi.j - lo.j + 1;
      rots.push({ deg, mask, dmask: dilate(mask, k), fits });
    }
    return { it, rots, fits: rots.some((r) => r.fits), area: it.part.area, cells: rots[0].mask.grid.reduce((s, v) => s + v, 0) };
  });

  const copies = [];
  shapes.forEach((s, si) => {
    for (let c = 0; c < s.it.qty; c++) copies.push({ si, c });
  });
  const orders = [];
  const byArea = copies.slice().sort((a, b) => shapes[b.si].cells - shapes[a.si].cells || a.si - b.si || a.c - b.c);
  orders.push(byArea);
  const longSide = (s) => Math.max(s.rots[0].mask.w, s.rots[0].mask.h);
  orders.push(copies.slice().sort((a, b) => longSide(shapes[b.si]) - longSide(shapes[a.si]) || shapes[b.si].cells - shapes[a.si].cells || a.si - b.si || a.c - b.c));
  const rnd = lcg(12345);
  for (let q = 2; q < o.orders; q++) {
    // largest-first with random swaps of neighbours
    const ord = byArea.slice();
    for (let i = 0; i + 1 < ord.length; i++) if (rnd() < 0.3) [ord[i], ord[i + 1]] = [ord[i + 1], ord[i]];
    orders.push(ord);
  }

  let bestRun = null, bestOrd = null, tried = 0;
  const env = { GW, GH, lo, hi, maxSheets: o.maxSheets };
  for (const ord of orders) {
    if (tried > 0 && Date.now() - t0 > o.timeLimitMs) break;
    tried++;
    const run = runOrder(ord, shapes, env, bestRun);
    if (run && (!bestRun || better(run, bestRun))) { bestRun = run; bestOrd = ord; }
  }
  // Order search: mutate the best order (swap two copies of different parts,
  // or move one earlier) and keep the change when the nest is no worse. A
  // fixed number of tries from a fixed seed, so the answer is repeatable; the
  // time limit only cuts it short on a slow machine.
  const srnd = lcg(777);
  let searched = 0;
  for (let it = 0; it < o.searchIters && bestOrd.length > 1; it++) {
    if (Date.now() - t0 > o.timeLimitMs) break;
    const ord = bestOrd.slice();
    const n = ord.length;
    let moved = false;
    for (let tries = 0; tries < 8 && !moved; tries++) {
      const i = Math.floor(srnd() * n), j = Math.floor(srnd() * n);
      if (i === j || ord[i].si === ord[j].si) continue;
      if (srnd() < 0.5) [ord[i], ord[j]] = [ord[j], ord[i]];
      else { const a = Math.min(i, j), b = Math.max(i, j); const [x] = ord.splice(b, 1); ord.splice(a, 0, x); }
      moved = true;
    }
    if (!moved) break;
    searched++;
    tried++;
    const run = runOrder(ord, shapes, env, bestRun);
    if (run && !better(bestRun, run)) { bestRun = run; bestOrd = ord; }
  }
  // Compaction: shorten the last sheet's used length by overlap
  // minimisation (compact.mjs). Seeded and counted in moves, so repeatable.
  let compacted = null;
  const last = bestRun.sheets[bestRun.sheets.length - 1];
  if (o.compactMoves > 0 && last && last.placements.length > 1) {
    compacted = compactSheet(last.placements, shapes, env, { moves: o.compactMoves, seed: 4242, deadline: t0 + o.timeLimitMs });
    last.placements = compacted.placements;
    last.extent = compacted.extent;
  }
  const sheets = bestRun.sheets.map((s) => ({
    placements: s.placements.map((p) => {
      const sh = shapes[p.si], rot = sh.rots[p.ri];
      // put the raster's cell (0, 0) at sheet cell (x, y)
      return { id: sh.it.id, name: sh.it.name, copy: p.c, angle: rot.deg, tx: p.x * res - rot.mask.minX, ty: p.y * res - rot.mask.minY };
    }),
    usedLength: Math.min(sheetW, s.extent * res),
  }));
  const unplaced = {};
  for (const u of bestRun.unplaced) {
    const sh = shapes[u.si];
    const key = sh.it.id;
    if (!unplaced[key]) unplaced[key] = { id: key, name: sh.it.name, count: 0, reason: sh.fits ? "no room left within the sheet limit" : "larger than the sheet's usable area at every allowed rotation" };
    unplaced[key].count++;
  }
  return {
    ok: true,
    res,
    k,
    gridW: GW,
    gridH: GH,
    sheetW,
    sheetH,
    gap,
    margin,
    tol,
    ordersTried: tried,
    searched,
    compaction: compacted && { attempts: compacted.attempts, successes: compacted.successes, moves: compacted.moves },
    ms: Date.now() - t0,
    sheets,
    unplaced: Object.values(unplaced),
  };
}

function better(a, b) {
  if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length < b.unplaced.length;
  if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length;
  const la = a.sheets.length ? a.sheets[a.sheets.length - 1].extent : 0, lb = b.sheets.length ? b.sheets[b.sheets.length - 1].extent : 0;
  return la < lb;
}

// With `bound` (a complete run with nothing unplaced), give up and return
// null as soon as this run can no longer beat it: sheets and the last sheet's
// used length only grow as parts are added.
function runOrder(order, shapes, { GW, GH, lo, hi, maxSheets }, bound = null) {
  const sheets = [], unplaced = [];
  const prune = bound && bound.unplaced.length === 0;
  const bSheets = prune ? bound.sheets.length : 0, bExt = prune && bSheets ? bound.sheets[bSheets - 1].extent : 0;
  for (const { si, c } of order) {
    if (prune && (unplaced.length > 0 || sheets.length > bSheets || (sheets.length === bSheets && sheets[bSheets - 1].extent > bExt))) return null;
    const sh = shapes[si];
    if (!sh.fits) { unplaced.push({ si, c }); continue; }
    let done = false;
    for (let s = 0; s <= sheets.length && !done; s++) {
      if (s === sheets.length) {
        if (sheets.length >= maxSheets) break;
        sheets.push(new Sheet(GW, GH, lo, hi));
      }
      const sheet = sheets[s];
      let best = null, pick = null;
      sh.rots.forEach((r, ri) => {
        if (!r.fits) return;
        const f = sheet.find(r.mask, best);
        if (f) { best = f.score; pick = { ri, x: f.x, y: f.y }; }
      });
      if (pick) {
        const r = sh.rots[pick.ri];
        sheet.place(r.dmask, pick.x, pick.y, r.mask.w);
        sheet.placements.push({ si, c, ...pick });
        done = true;
      } else if (sheet.placements.length === 0) {
        // fits in principle but the empty sheet refused it: should not happen
        sheets.pop();
        break;
      }
    }
    if (!done) unplaced.push({ si, c });
  }
  return { sheets, unplaced };
}

function hashGrid(g) {
  let h = 2166136261;
  for (let i = 0; i < g.length; i++) h = Math.imul(h ^ g[i], 16777619);
  return h >>> 0;
}

/** A grid that keeps a sheet near 1,250 cells on its long side (and never finer than 1/2000 of it). */
export function autoRes(W, H) {
  const L = Math.max(W, H);
  const raw = L / 1250;
  // round to 1, 2 or 5 x 10^n so cell edges land on round numbers
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return raw;
}

// ---- placed geometry, checks and reports -------------------------------------

/** The placed part's edges in sheet coordinates. */
export function placedEdges(part, pl, tol) {
  const m = rotation(pl.angle, pl.tx, pl.ty);
  return {
    outer: transformEdges(part.outer, m, tol),
    holes: part.holes.map((h) => transformEdges(h, m, tol)),
    marks: part.marks.map((h) => transformEdges(h, m, tol)),
  };
}

function segDist(a, b, c, d) {
  // distance between segments ab and cd
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
function ptSeg(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
  let t = L === 0 ? 0 : ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}

function inMaterial(x, y, rings) {
  if (!pointInRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (pointInRing(x, y, rings[i])) return false;
  return true;
}

/**
 * Independent check of a nest: every outline at least `margin` inside the
 * sheet and every pair of parts at least `gap` apart, measured from the
 * flattened edges (the curves themselves lie within tol of these, which the
 * raster's growth already paid for, so the bound checked is gap + 2 tol).
 * parts: Map id -> part.
 */
export function verify(result, parts) {
  const { tol, gap, margin, sheetW, sheetH } = result;
  const eps = 1e-6 * Math.max(sheetW, sheetH);
  const need = gap + 2 * tol - eps;
  const problems = [];
  let minGap = Infinity, minEdge = Infinity;
  result.sheets.forEach((s, si) => {
    const placed = s.placements.map((pl) => {
      const e = placedEdges(parts.get(pl.id), pl, tol);
      const rings = [flattenLoop(e.outer, tol), ...e.holes.map((h) => flattenLoop(h, tol))];
      const bb = bboxOf([rings[0]]);
      return { pl, rings, bb };
    });
    for (const p of placed) {
      const edge = Math.min(p.bb.minX, p.bb.minY, sheetW - p.bb.maxX, sheetH - p.bb.maxY);
      minEdge = Math.min(minEdge, edge);
      if (edge < margin + tol - eps) problems.push(`Sheet ${si + 1}: ${p.pl.name} #${p.pl.copy + 1} is ${edge.toFixed(4)} from the sheet edge (margin ${margin}).`);
    }
    for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
      const A = placed[a], B = placed[b];
      if (A.bb.maxX + need < B.bb.minX || B.bb.maxX + need < A.bb.minX || A.bb.maxY + need < B.bb.minY || B.bb.maxY + need < A.bb.minY) continue;
      let d = Infinity;
      for (const ra of A.rings) for (const rb of B.rings) {
        for (let i = 0; i < ra.length && d >= need; i++) {
          const p1 = ra[i], p2 = ra[(i + 1) % ra.length];
          const sx0 = Math.min(p1[0], p2[0]) - need, sx1 = Math.max(p1[0], p2[0]) + need, sy0 = Math.min(p1[1], p2[1]) - need, sy1 = Math.max(p1[1], p2[1]) + need;
          for (let j = 0; j < rb.length; j++) {
            const q1 = rb[j], q2 = rb[(j + 1) % rb.length];
            if (Math.max(q1[0], q2[0]) < sx0 || Math.min(q1[0], q2[0]) > sx1 || Math.max(q1[1], q2[1]) < sy0 || Math.min(q1[1], q2[1]) > sy1) continue;
            d = Math.min(d, segDist(p1, p2, q1, q2));
          }
        }
      }
      // one part wholly inside the other's material crosses no edge
      if (d >= need && (inMaterial(B.rings[0][0][0], B.rings[0][0][1], A.rings) || inMaterial(A.rings[0][0][0], A.rings[0][0][1], B.rings))) d = 0;
      if (d < Infinity) minGap = Math.min(minGap, d);
      if (d < need) problems.push(`Sheet ${si + 1}: ${A.pl.name} #${A.pl.copy + 1} and ${B.pl.name} #${B.pl.copy + 1} are ${d.toFixed(4)} apart (gap ${gap}).`);
    }
  });
  return { ok: problems.length === 0, problems, minGap, minEdge };
}

/** Per-sheet and job totals: parts, utilisation, cut length, pierces. */
export function report(result, parts) {
  const sheetArea = result.sheetW * result.sheetH;
  const sheets = result.sheets.map((s, i) => {
    let area = 0, cut = 0, mark = 0, pierces = 0;
    const counts = {};
    for (const pl of s.placements) {
      const p = parts.get(pl.id);
      area += p.area;
      cut += p.cutLength;
      mark += p.markLength;
      pierces += p.pierces + p.marks.length;
      counts[pl.name] = (counts[pl.name] || 0) + 1;
    }
    const usedArea = s.usedLength * result.sheetH;
    return {
      sheet: i + 1,
      parts: s.placements.length,
      counts,
      partArea: area,
      utilisation: area / sheetArea,
      usedLength: s.usedLength,
      utilisationOfUsed: usedArea > 0 ? area / usedArea : 0,
      remnant: { length: result.sheetW - s.usedLength, width: result.sheetH },
      cutLength: cut,
      markLength: mark,
      pierces,
    };
  });
  const tot = (k) => sheets.reduce((s, x) => s + x[k], 0);
  // no nester can beat the area bound: the parts' own area over a sheet's usable area
  const usable = Math.max(0, result.sheetW - 2 * result.margin) * Math.max(0, result.sheetH - 2 * result.margin);
  return {
    sheetLowerBound: usable > 0 ? Math.ceil(tot("partArea") / usable - 1e-9) : null,
    sheets,
    totalSheets: sheets.length,
    totalParts: tot("parts"),
    partArea: tot("partArea"),
    utilisation: sheets.length ? tot("partArea") / (sheets.length * sheetArea) : 0,
    cutLength: tot("cutLength"),
    markLength: tot("markLength"),
    pierces: tot("pierces"),
  };
}
