// Haul plan: where each cubic yard of cut should go, and how far it travels.
//
// The site is cut into square cells. In each cell the cut and the fill are
// computed exactly (the same TIN integration as the totals), and cut that
// can fill its own cell stays there. What is left is a transportation
// problem: cells with spare cut supply bank volume, cells short of fill
// demand it, and moving one unit from one cell centre to another costs the
// straight-line distance. Its optimum is the least total haul (volume times
// distance) any plan on this grid can reach. In mathematics this exact
// quantity is called the earth mover's distance.
//
// The solver is the transportation simplex (a spanning-tree basis, dual
// potentials, block pricing). Amounts are scaled to integers so pivots are
// exact. When it stops, every arc's reduced cost is checked: if none is
// negative, LP duality proves the plan optimal, and the result says so.
//
// Not engineering advice: straight-line distance is not a haul road, and a
// grid cell is not a dozer pass.

import { computeVolumes, clipConvex, candidates, centroid, polygonArea } from './earthwork.mjs';

// ------------------------------------------------------------ the solver

/**
 * Minimum-cost transportation.
 * @param supply  non-negative integers, one per source
 * @param demand  non-negative integers, one per sink; same total as supply
 * @param cost    (i, j) => cost of one unit from source i to sink j (finite, >= 0)
 * @returns { flows: [[i, j, amount], ...] (amount > 0), cost, dual, optimal,
 *            minReduced, pivots }
 */
export function transport(supply, demand, cost, { maxPivots = null } = {}) {
  const m = supply.length, n = demand.length, N = m + n, MN = m * n;
  const sumS = supply.reduce((a, b) => a + b, 0), sumD = demand.reduce((a, b) => a + b, 0);
  if (sumS !== sumD) throw new Error(`transport: supply ${sumS} and demand ${sumD} differ`);
  for (const v of [...supply, ...demand]) if (!Number.isSafeInteger(v) || v < 0) throw new Error('transport: amounts must be non-negative safe integers');
  if (m === 0 || n === 0 || sumS === 0) return { flows: [], cost: 0, dual: 0, optimal: true, minReduced: 0, pivots: 0 };

  const C = new Float64Array(MN);
  let cmax = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const c = cost(i, j); C[i * n + j] = c; if (c > cmax) cmax = c; }
  const eps = 1e-10 * Math.max(cmax, 1);

  // Start: the least-cost (matrix minimum) rule, then zero-flow arcs to
  // finish a spanning tree of m + n - 1 arcs.
  const order = Uint32Array.from({ length: MN }, (_, k) => k).sort((a, b) => C[a] - C[b]);
  const uf = Int32Array.from({ length: N }, (_, k) => k);
  const find = x => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const arcI = [], arcJ = [], flow = [];
  const sup = supply.slice(), dem = demand.slice();
  for (const k of order) {
    const i = (k / n) | 0, j = k - i * n;
    const a = Math.min(sup[i], dem[j]);
    if (a <= 0) continue;
    const ri = find(i), rj = find(m + j);
    if (ri === rj) throw new Error('transport: start allocation formed a cycle');
    uf[ri] = rj; arcI.push(i); arcJ.push(j); flow.push(a); sup[i] -= a; dem[j] -= a;
  }
  for (let t = 0; t < MN && arcI.length < N - 1; t++) {
    const k = order[t]; const i = (k / n) | 0, j = k - i * n;
    const ri = find(i), rj = find(m + j);
    if (ri !== rj) { uf[ri] = rj; arcI.push(i); arcJ.push(j); flow.push(0); }
  }
  const adj = Array.from({ length: N }, () => []);
  for (let a = 0; a < arcI.length; a++) { adj[arcI[a]].push(a); adj[m + arcJ[a]].push(a); }

  const pot = new Float64Array(N);
  const seen = new Uint8Array(N);
  const parentArc = new Int32Array(N);
  const stack = new Int32Array(N);
  function potentials() {
    seen.fill(0); pot[0] = 0; seen[0] = 1; let sp = 0; stack[sp++] = 0;
    while (sp) {
      const v = stack[--sp];
      for (const a of adj[v]) {
        const i = arcI[a], s = m + arcJ[a];
        const w = v === i ? s : i;
        if (seen[w]) continue;
        seen[w] = 1;
        const c = C[i * n + arcJ[a]];
        if (w === s) pot[s] = c - pot[i]; else pot[i] = c - pot[s];
        stack[sp++] = w;
      }
    }
  }

  const block = Math.max(32, Math.ceil(Math.sqrt(MN)));
  const limit = maxPivots ?? 200 * N + 20000;
  let ptr = 0, pivots = 0;
  potentials();
  for (;;) {
    // Block pricing: scan arcs in blocks, enter the most negative of the
    // first block that has one.
    let best = -eps, bestK = -1, cnt = 0;
    for (let scanned = 0; scanned < MN; scanned++) {
      const k = ptr; ptr = ptr + 1 === MN ? 0 : ptr + 1;
      const i = (k / n) | 0, j = k - i * n;
      const rc = C[k] - pot[i] - pot[m + j];
      if (rc < best) { best = rc; bestK = k; }
      if (++cnt >= block) { if (bestK >= 0) break; cnt = 0; }
    }
    if (bestK < 0 || pivots >= limit) break;
    pivots++;
    const ei = (bestK / n) | 0, ej = bestK - ei * n;
    // Tree path from sink node m+ej to source ei.
    seen.fill(0); seen[m + ej] = 1; parentArc[m + ej] = -1;
    let sp = 0; stack[sp++] = m + ej;
    while (sp && !seen[ei]) {
      const v = stack[--sp];
      for (const a of adj[v]) {
        const w = v === arcI[a] ? m + arcJ[a] : arcI[a];
        if (seen[w]) continue;
        seen[w] = 1; parentArc[w] = a; stack[sp++] = w;
      }
    }
    const path = []; // arcs from the source end back toward the sink
    for (let v = ei; v !== m + ej;) { const a = parentArc[v]; path.push(a); v = v === arcI[a] ? m + arcJ[a] : arcI[a]; }
    path.reverse(); // now path[0] touches the sink: it loses flow; signs alternate
    let theta = Infinity, leave = -1;
    for (let t = 0; t < path.length; t += 2) if (flow[path[t]] < theta) { theta = flow[path[t]]; leave = path[t]; }
    for (let t = 0; t < path.length; t++) flow[path[t]] += t % 2 ? theta : -theta;
    const li = arcI[leave], lj = arcJ[leave];
    adj[li].splice(adj[li].indexOf(leave), 1); adj[m + lj].splice(adj[m + lj].indexOf(leave), 1);
    arcI[leave] = ei; arcJ[leave] = ej; flow[leave] = theta;
    adj[ei].push(leave); adj[m + ej].push(leave);
    potentials();
  }

  // Certificate: a full pass over every arc.
  let minReduced = Infinity;
  for (let k = 0; k < MN; k++) { const i = (k / n) | 0, j = k - i * n; const rc = C[k] - pot[i] - pot[m + j]; if (rc < minReduced) minReduced = rc; }
  let total = 0, dual = 0;
  const flows = [];
  for (let a = 0; a < arcI.length; a++) if (flow[a] > 0) { flows.push([arcI[a], arcJ[a], flow[a]]); total += flow[a] * C[arcI[a] * n + arcJ[a]]; }
  for (let i = 0; i < m; i++) dual += supply[i] * pot[i];
  for (let j = 0; j < n; j++) dual += demand[j] * pot[m + j];
  return { flows, cost: total, dual, optimal: minReduced >= -1e-7 * Math.max(cmax, 1), minReduced, pivots };
}

// ------------------------------------------------------------- the grid

const NICE = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5];
function niceAtLeast(x) {
  const p = 10 ** Math.floor(Math.log10(x));
  for (const s of [...NICE, 10]) if (s * p >= x * (1 - 1e-12)) return s * p;
  return 10 * p;
}

/**
 * Per-cell cut and fill (cubic coordinate units) on a square grid.
 * Cells with no surveyed area inside the boundary are left out.
 */
export function cellVolumes(existing, design, { boundary = null, strip = 0, cell = null, maxCells = 900 } = {}) {
  let bnd = null;
  if (boundary && boundary.length >= 3) bnd = polygonArea(boundary) < 0 ? boundary.slice().reverse() : boundary.slice();
  const b = existing.bbox;
  let x0 = b.minX, y0 = b.minY, x1 = b.maxX, y1 = b.maxY;
  if (bnd) {
    x0 = Math.max(x0, Math.min(...bnd.map(p => p[0]))); x1 = Math.min(x1, Math.max(...bnd.map(p => p[0])));
    y0 = Math.max(y0, Math.min(...bnd.map(p => p[1]))); y1 = Math.min(y1, Math.max(...bnd.map(p => p[1])));
  }
  const W = x1 - x0, H = y1 - y0;
  if (!(W > 0 && H > 0)) return { cell: null, nx: 0, ny: 0, cells: [] };
  let size = Number.isFinite(cell) && cell > 0 ? cell : niceAtLeast(Math.sqrt((W * H) / 400));
  while (Math.ceil(W / size) * Math.ceil(H / size) > maxCells) size = niceAtLeast(size * 1.01);
  const nx = Math.ceil(W / size), ny = Math.ceil(H / size);
  const cells = [];
  for (let a = 0; a < nx; a++) {
    for (let c = 0; c < ny; c++) {
      const cx0 = x0 + a * size, cy0 = y0 + c * size, cx1 = Math.min(x1, cx0 + size), cy1 = Math.min(y1, cy0 + size);
      const sq = [[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]];
      const region = bnd ? clipConvex(bnd, sq) : sq;
      if (region.length < 3 || polygonArea(region) <= 1e-9 * size * size) continue;
      const sub = { pts: existing.pts, tris: candidates(existing, cx0, cy0, cx1, cy1).map(k => existing.tris[k]) };
      if (!sub.tris.length) continue;
      const v = computeVolumes(sub, design, { boundary: region, strip });
      if (v.area <= 0) continue;
      const [x, y] = centroid(region);
      cells.push({ x, y, col: a, row: c, poly: region, cut: v.cut, fill: v.fill, area: v.area });
    }
  }
  return { cell: size, enlarged: Number.isFinite(cell) && cell > 0 && size !== cell, nx, ny, x0, y0, cells };
}

/**
 * The least-haul plan on the grid.
 * Volumes come back in bank measure in the display unit (cu yd or m³);
 * `perVolume` converts cubic coordinate units to it (27 for feet to cu yd).
 * Fill demand is converted to bank measure with the shrink factor, so a
 * compacted cubic yard of fill asks for 1 / (1 - shrink) bank cubic yards.
 * Spare cut leaves the site (export) and missing fill arrives (import)
 * from wherever is cheapest; those trips are not counted in the haul.
 */
export function haulPlan(existing, design, { boundary = null, strip = 0, shrink = 0, cell = null, maxCells = 900, perVolume = 1 } = {}) {
  const keep = 1 - (shrink || 0) / 100;
  if (!(keep > 0)) return { error: 'Shrink must be under 100% to plan the haul.' };
  const g = cellVolumes(existing, design, { boundary, strip, cell, maxCells });
  if (!g.cells.length) return { error: 'No grid cell overlaps the surveyed area.' };
  const k = perVolume;
  const src = [], snk = [];
  let local = 0, cut = 0, fillBank = 0;
  for (const c of g.cells) {
    const need = c.fill / keep; // bank volume the cell's fill needs
    cut += c.cut; fillBank += need;
    local += Math.min(c.cut, need);
    c.net = c.cut - need; // bank, cubic coordinate units
    if (c.net > 0) src.push(c); else if (c.net < 0) snk.push(c);
  }
  const A = src.reduce((s, c) => s + c.net, 0), B = snk.reduce((s, c) => s - c.net, 0);
  const big = Math.max(A, B);
  const scale = big > 0 ? 2 ** 40 / big : 1;
  const supply = src.map(c => Math.round(c.net * scale)), demand = snk.map(c => Math.round(-c.net * scale));
  const qa = supply.reduce((s, v) => s + v, 0), qb = demand.reduce((s, v) => s + v, 0);
  const dummySink = qa > qb, dummySource = qb > qa;
  if (dummySink) demand.push(qa - qb); else if (dummySource) supply.push(qb - qa);
  const dist = (i, j) => (i >= src.length || j >= snk.length ? 0 : Math.hypot(src[i].x - snk[j].x, src[i].y - snk[j].y));
  const t0 = Date.now();
  const sol = transport(supply, demand, dist);
  const ms = Date.now() - t0;

  const moves = [], exports = [], imports = [];
  let moved = 0, moment = 0, sx = 0, sy = 0, dx = 0, dy = 0;
  for (const [i, j, q] of sol.flows) {
    const vol = q / scale / k;
    if (i >= src.length) { imports.push({ to: [snk[j].x, snk[j].y], volume: vol }); continue; }
    if (j >= snk.length) { exports.push({ from: [src[i].x, src[i].y], volume: vol }); continue; }
    const d = dist(i, j);
    moves.push({ from: [src[i].x, src[i].y], to: [snk[j].x, snk[j].y], volume: vol, distance: d });
    moved += vol; moment += vol * d;
    sx += vol * src[i].x; sy += vol * src[i].y; dx += vol * snk[j].x; dy += vol * snk[j].y;
  }
  moves.sort((a, b) => b.volume - a.volume);
  const centroidHaul = moved > 0 ? Math.hypot(sx / moved - dx / moved, sy / moved - dy / moved) : 0;
  return {
    cell: g.cell, enlarged: g.enlarged, nx: g.nx, ny: g.ny, cellCount: g.cells.length,
    sources: src.length, sinks: snk.length,
    cut: cut / k, fillBank: fillBank / k,
    local: local / k, // stays in its own cell (hauled less than a cell diagonal)
    moved, // crosses cells
    moment, // sum of volume x distance, display volume x length unit
    averageHaul: moved > 0 ? moment / moved : 0,
    centroidHaul, // distance between the centroids of what is shipped and where it lands: a lower bound on averageHaul
    exported: exports.reduce((s, e) => s + e.volume, 0), imported: imports.reduce((s, e) => s + e.volume, 0),
    moves, exports, imports,
    optimal: sol.optimal, minReduced: sol.minReduced, pivots: sol.pivots, ms,
    gap: Math.abs(sol.cost - sol.dual) / Math.max(1, Math.abs(sol.cost)),
    cells: g.cells.map(c => ({ x: c.x, y: c.y, poly: c.poly, net: c.net / k })),
  };
}

/** Every move as CSV rows: from and to cell centres, bank volume, distance. */
export function haulCsv(h, units) {
  const f = (x, d = 3) => Number(x.toFixed(d));
  const rows = [['kind', 'from_easting', 'from_northing', 'to_easting', 'to_northing', `bank_volume_${units.volume.replace(/\s+/g, '_')}`, `distance_${units.length}`]];
  for (const m of h.moves) rows.push(['haul', f(m.from[0]), f(m.from[1]), f(m.to[0]), f(m.to[1]), f(m.volume), f(m.distance, 2)]);
  for (const e of h.exports) rows.push(['export', f(e.from[0]), f(e.from[1]), '', '', f(e.volume), '']);
  for (const e of h.imports) rows.push(['import', '', '', f(e.to[0]), f(e.to[1]), f(e.volume), '']);
  // Formula-injection guard: every cell here is a number or a fixed word, but
  // a text cell that starts like a formula is defused anyway.
  const cell = v => (typeof v === 'number' ? String(v) : /^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v));
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}
