// Strip compaction by overlap minimisation on the nesting grid.
//
// The greedy nester (nest.mjs) places each part once, at the leftmost spot
// it fits, and never moves it again. This pass takes the finished last sheet
// and tries to make its used length shorter, the way current strip-packing
// solvers do (e.g. sparrow, Gardeyn and Wauters 2025; Egeblad et al. 2007;
// Umetani et al. 2009), but on the same conservative grid the greedy uses:
//
//  1. Pull the end of the strip in to a target length Lt (a few percent
//     shorter). Parts that now stick out are moved inside, overlapping.
//  2. Separate: every part that overlaps another is moved to the spot (any
//     allowed turn, any position inside Lt) where its weighted overlap is
//     least. Parts that keep overlapping get heavier, so the others learn to
//     move out of their way (a guided local search on part weights).
//  3. If the overlap reaches zero the shorter layout is kept and the strip is
//     pulled in again; if not, the step is halved and it tries again from the
//     last layout that had no overlap.
//
// Overlap is counted in grid cells: a part's own cells against the other
// parts' cells grown by k (the gap allowance), exactly the test the greedy
// uses for "fits". Zero overlap therefore carries the same gap guarantee, and
// `verify` re-checks the result from the true edges either way.
//
// The overlap of a part at every position comes from row prefix sums of a
// weighted occupancy grid: a part's cost at (x, y) is a sum over its row
// spans of P[row][x + b] - P[row][x + a], so one candidate costs one lookup
// pair per span, not one per cell.
//
// It is seeded and counts its work in moves, not milliseconds, so the same
// job gives the same nest; the time limit only stops it early on a slow
// machine.

// Weights: every part starts at BASE; a part still overlapping after a round
// gains GROW of its weight. Tried on the dev set (eval/esicup-compact-*.md):
// decaying the weights of free parts did no better.
const GROW = 0.25, BASE = 4;

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// 1 + Chebyshev distance from each busy cell to the nearest free cell (or the
// raster's border): a cell deep inside a part costs more to overlap
// than one at its rim, so parts slide out of each other rather than settle
// for a thin overlap. Zero exactly on free cells, so zero cost still means
// no overlap.
function depthOf(grid, w, h) {
  const d = new Float64Array(w * h);
  const big = 1e9;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!grid[k]) continue;
    let v = big;
    v = Math.min(v, i === 0 || j === 0 ? 1 : d[k - w - 1] + 1, j === 0 ? 1 : d[k - w] + 1, i === w - 1 || j === 0 ? 1 : d[k - w + 1] + 1, i === 0 ? 1 : d[k - 1] + 1);
    d[k] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i;
    if (!grid[k]) continue;
    d[k] = Math.min(d[k], i === w - 1 || j === h - 1 ? 1 : d[k + w + 1] + 1, j === h - 1 ? 1 : d[k + w] + 1, i === 0 || j === h - 1 ? 1 : d[k + w - 1] + 1, i === w - 1 ? 1 : d[k + 1] + 1);
  }
  return d;
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

/**
 * Shorten one sheet's used length.
 * placements: [{ si, c, ri, x, y }] in cells (the greedy's output for one sheet).
 * shapes: nest.mjs's per-item rasters ({ rots: [{ mask, dmask, fits }] }).
 * env: { GW, GH, lo, hi }.
 * opts: { moves (budget of part moves), samples, seed, deadline (ms epoch) }.
 * Returns { placements, extent, attempts, successes, moves } (the input
 * placements if nothing shorter was found).
 */
export function compactSheet(placements, shapes, env, opts = {}) {
  const { GW, GH, lo, hi } = env;
  const moveBudget = opts.moves ?? 4000;
  const samples = opts.samples ?? 100;
  const local = opts.local ?? 60;
  const deadline = opts.deadline ?? Infinity;
  const rnd = lcg(opts.seed ?? 4242);
  const n = placements.length;
  const extentOf = (pl) => pl.reduce((m, p) => Math.max(m, p.x + shapes[p.si].rots[p.ri].mask.w), 0);
  const startExtent = extentOf(placements);
  const out = { placements, extent: startExtent, attempts: 0, successes: 0, moves: 0 };
  if (n < 2) return out;

  // dilated spans, cached per rotation
  for (const sh of shapes) for (const r of sh.rots) {
    if (!r.dspans) r.dspans = spansOf(r.dmask.grid, r.dmask.w, r.dmask.h);
    if (!r.depth) {
      r.depth = depthOf(r.dmask.grid, r.dmask.w, r.dmask.h);
      // a part's cost against its own grown raster, to subtract
      let own = 0;
      const { w, h, grid } = r.mask, d = r.dmask;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (grid[j * w + i]) own += r.depth[(j + d.off) * d.w + i + d.off];
      r.ownDepth = own;
    }
  }

  // nothing is ever placed past the starting extent, so prefix sums stop there
  const XW = Math.min(GW, startExtent);
  const W1 = GW + 1;
  const C = new Float64Array(GW * GH); // weighted dilated occupancy (integers)
  const P = new Float64Array(W1 * GH); // row prefix sums of C
  const dirty = new Int32Array(GH).fill(-1); // first changed column per row, or -1
  const weight = new Float64Array(n);

  const stamp = (p, w) => {
    const r = shapes[p.si].rots[p.ri], d = r.dmask;
    const x0 = p.x - d.off, y0 = p.y - d.off;
    for (let j = 0; j < d.h; j++) {
      const row = y0 + j;
      if (row < 0 || row >= GH) continue;
      for (const [a, b] of r.dspans[j]) {
        const ia = Math.max(0, x0 + a), ib = Math.min(GW, x0 + b);
        const dr = j * d.w - x0;
        for (let i = ia; i < ib; i++) C[row * GW + i] += w * r.depth[dr + i];
        if (ia < XW && (dirty[row] < 0 || ia < dirty[row])) dirty[row] = ia;
      }
    }
  };
  const refresh = () => {
    for (let row = 0; row < GH; row++) {
      const from = dirty[row];
      if (from < 0) continue;
      dirty[row] = -1;
      const base = row * W1, cb = row * GW;
      let s = P[base + from];
      for (let i = from; i < XW; i++) { s += C[cb + i]; P[base + i + 1] = s; }
    }
  };
  // weighted overlap of a raster at (x, y); Infinity once it passes `cap`
  const cost = (mask, x, y, cap = Infinity) => {
    let s = 0;
    const sp = mask.spans;
    for (let dy = 0; dy < mask.h; dy++) {
      const base = (y + dy) * W1 + x;
      for (const [a, b] of sp[dy]) s += P[base + b] - P[base + a];
      if (s > cap) return Infinity;
    }
    return s;
  };

  const load = (pl) => {
    C.fill(0);
    P.fill(0);
    dirty.fill(0);
    pl.forEach((p, i) => stamp(p, weight[i]));
    refresh();
  };
  const ownCost = (pl, i) => {
    const p = pl[i], r = shapes[p.si].rots[p.ri];
    return cost(r.mask, p.x, p.y) - weight[i] * r.ownDepth;
  };

  // Move part i to its least-overlap spot inside [lo.i, Lt) (P must be fresh).
  const relocate = (pl, i, Lt) => {
    const p = pl[i], sh = shapes[p.si];
    stamp(p, -weight[i]);
    refresh();
    let best = { e: Infinity };
    const rotIdx = [];
    sh.rots.forEach((r, ri) => {
      if (r.fits && r.mask.w <= Lt - lo.i && r.mask.h <= hi.j - lo.j + 1) rotIdx.push(ri);
    });
    const tryAt = (ri, x, y) => {
      const e = cost(sh.rots[ri].mask, x, y, best.e);
      if (e < best.e || (e === best.e && x < best.x)) best = { e, ri, x, y };
    };
    const curFits = rotIdx.includes(p.ri) && p.x + sh.rots[p.ri].mask.w <= Lt;
    if (curFits) tryAt(p.ri, p.x, p.y);
    for (const ri of rotIdx) {
      const m = sh.rots[ri].mask;
      const xr = Lt - m.w - lo.i, yr = hi.j - m.h + 1 - lo.j;
      for (let s = 0; s < samples && best.e > 0; s++) tryAt(ri, lo.i + Math.floor(rnd() * (xr + 1)), lo.j + Math.floor(rnd() * (yr + 1)));
    }
    // and as many near where the part is now (most fixes are small moves)
    if (curFits && best.e > 0) {
      const m0 = sh.rots[p.ri].mask, rad = Math.max(2, Math.ceil(Math.max(m0.w, m0.h) / 2));
      for (const ri of rotIdx) {
        const m = sh.rots[ri].mask;
        const cx = p.x + (m0.w - m.w) / 2, cy = p.y + (m0.h - m.h) / 2;
        for (let s = 0; s < local && best.e > 0; s++) {
          const x = Math.round(cx + (rnd() * 2 - 1) * rad), y = Math.round(cy + (rnd() * 2 - 1) * rad);
          if (x >= lo.i && y >= lo.j && x + m.w <= Lt && y + m.h <= hi.j + 1) tryAt(ri, x, y);
        }
      }
    }
    // descend from the best sample: halving steps in x and y
    if (best.e > 0 && best.ri !== undefined) {
      const m = sh.rots[best.ri].mask;
      const xmax = Lt - m.w, ymax = hi.j - m.h + 1;
      let step = Math.max(1, Math.floor(Math.max(m.w, m.h) / 4));
      while (step >= 1 && best.e > 0) {
        let moved = false;
        for (const [dx, dy] of [[-step, 0], [step, 0], [0, -step], [0, step], [-step, -step], [-step, step], [step, -step], [step, step]]) {
          const x = best.x + dx, y = best.y + dy;
          if (x < lo.i || y < lo.j || x > xmax || y > ymax) continue;
          const e = cost(m, x, y, best.e);
          if (e < best.e) { best = { e, ri: best.ri, x, y }; moved = true; }
        }
        if (!moved) step = step >> 1;
      }
    }
    p.ri = best.ri;
    p.x = best.x;
    p.y = best.y;
    stamp(p, weight[i]);
    refresh();
    out.moves++;
    return best.e;
  };

  // Try to make `pl` (some parts beyond Lt already pulled in) overlap-free.
  const separate = (pl, Lt, maxRounds) => {
    for (let round = 0; round < maxRounds; round++) {
      if (out.moves >= moveBudget || Date.now() > deadline) return false;
      const coll = [];
      for (let i = 0; i < n; i++) if (ownCost(pl, i) > 0) coll.push(i);
      if (coll.length === 0) return true;
      // shuffle, then move each colliding part to its best spot
      for (let a = coll.length - 1; a > 0; a--) {
        const b = Math.floor(rnd() * (a + 1));
        [coll[a], coll[b]] = [coll[b], coll[a]];
      }
      for (const i of coll) if (ownCost(pl, i) > 0) relocate(pl, i, Lt);
      // parts still in collision get heavier
      for (let i = 0; i < n; i++) {
        const w = weight[i];
        const nw = ownCost(pl, i) > 0 ? Math.min(1e6, w + Math.max(1, Math.floor(w * GROW))) : w;
        if (nw !== w) { stamp(pl[i], nw - w); weight[i] = nw; }
      }
      refresh();
    }
    for (let i = 0; i < n; i++) if (ownCost(pl, i) > 0) return false;
    return true;
  };

  let best = placements.map((p) => ({ ...p }));
  let bestExt = startExtent;
  const minLen = Math.max(...placements.map((p) => Math.min(...shapes[p.si].rots.filter((r) => r.fits).map((r) => r.mask.w))));
  let shrink = opts.shrink ?? 0.005;
  const minShrink = 1 / Math.max(1, bestExt);
  while (out.moves < moveBudget && Date.now() <= deadline) {
    const Lt = bestExt - Math.max(1, Math.round(shrink * bestExt));
    if (Lt - lo.i < minLen) break;
    out.attempts++;
    const pl = best.map((p) => ({ ...p }));
    weight.fill(BASE);
    load(pl);
    for (let i = 0; i < n; i++) {
      const p = pl[i];
      if (p.x + shapes[p.si].rots[p.ri].mask.w > Lt) relocate(pl, i, Lt);
    }
    const ok = separate(pl, Lt, opts.rounds ?? 60);
    if (ok) {
      best = pl;
      bestExt = extentOf(pl);
      out.successes++;
    } else {

      if (shrink > minShrink) shrink = Math.max(minShrink, shrink / 2);
    }
  }
  if (bestExt < startExtent) {
    out.placements = best;
    out.extent = bestExt;
  }
  return out;
}
