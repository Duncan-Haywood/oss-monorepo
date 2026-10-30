// @ts-check
// An independent check that a starting design is a good one: brute force over a
// coarse grid of designs under the footprint limit, plus random restarts with
// coordinate descent, and a report of how far each starting design sits from
// the cost / storage front. It shares nothing with the design search
// (designsearch.mjs) except the model, the estimate and the checks, so a fault
// in the search's own objective or pruning shows up here as a gap.
//
// Storage is measured, not guessed: the inside floor area times the clear
// height to the underside of the top plates, plus half the volume of the roof
// triangle above the plates (sloped space holds about half what a box does,
// whether it is open under a ridge beam or boarded over rafter ties).
//
// "Looks" is not scored here. A starting design is only compared with designs
// that look like it: the same siding, roof covering and roof type, a pitch
// within one step and an overhang at least as deep, and walls no lower. So a
// gap means a design that looks the same holds as much and costs less.

import { buildShed, normalize } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { roofSpaceCuFt } from './storage.mjs';

/** Inside measurements and storage of a built shed (feet, square feet, cubic feet). */
export function storageOf(shed) {
  const d = shed.design;
  const k = shed.dims;
  const inL = (d.length - 2 * k.stud) / 12;
  const inW = (d.width - 2 * k.stud) / 12;
  const floorSqFt = inL * inW;
  const clearFt = (k.plateTop - k.floorTop - 3) / 12;
  const riseFt = Math.max(0, (d.width / 2 - k.stud) * (d.pitch / 12)) / 12;
  const atticCuFt = d.style === 'gambrel' ? roofSpaceCuFt(shed) : 0.5 * inW * riseFt * inL;
  return { floorSqFt, clearFt, atticCuFt, cuFt: floorSqFt * clearFt + 0.5 * atticCuFt };
}

/**
 * Doors and windows moved to fit a new footprint: each opening keeps its wall,
 * size and sill, and openings on one wall are spread evenly along it.
 * @param {any[]} openings
 * @param {number} length
 * @param {number} width
 */
export function refitOpenings(openings, length, width) {
  const byWall = new Map();
  for (const o of openings) byWall.set(o.wall, [...(byWall.get(o.wall) || []), o]);
  const out = [];
  for (const [wall, ops] of byWall) {
    const L = wall === 'front' || wall === 'back' ? length : width;
    const slot = L / ops.length;
    ops.forEach((o, i) => out.push({ ...o, offset: Math.max(12, Math.round(slot * i + (slot - o.width) / 2)) }));
  }
  return out;
}

/**
 * Build, price and check one design.
 * @param {any} design
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function evaluate(design, prices) {
  const shed = buildShed(normalize(design));
  const est = estimate(shed, prices);
  const checks = structuralChecks(shed);
  const st = storageOf(shed);
  const d = shed.design;
  return {
    design,
    built: d,
    cost: est.total,
    ...st,
    // Every check passes and nothing is warned about but the height limit
    // (a design over its own peak limit is still a design to compare with).
    ok: checks.ok && shed.warnings.every((w) => w.startsWith('The peak is')),
    peak: shed.dims.peak,
    worst: checks.rows.reduce((m, r) => Math.max(m, r.ratio), 0),
    footprint: (d.length * d.width) / 144,
  };
}

/** The settings a coarse grid sweeps. Each is a list of values to try. */
export const GRID = {
  size: [[96, 72], [120, 72], [96, 96], [120, 96], [144, 96], [120, 120], [132, 108], [144, 84], [168, 72]],
  wallHeight: [80, 86.5, 92.625],
  pitch: [4, 5, 6, 8],
  rafterSpacing: [16, 24],
  studSpacing: [16, 24],
  rafterSize: ['2x4', '2x6'],
  joistSize: ['2x4', '2x6'],
  foundation: ['blocks', 'deck blocks'],
};

/** Finer steps for the random restarts' local search: 6" sizes and 2" walls. */
export const FINE = {
  ...GRID,
  size: [[96, 72], [108, 84], [120, 72], [96, 96], [108, 96], [120, 96], [132, 96], [144, 96], [120, 120], [132, 108], [144, 90], [150, 90], [144, 84], [156, 84], [168, 72]],
  wallHeight: [80, 82, 84, 86.5, 88, 90, 92.625],
  pitch: [3, 4, 5, 6, 7, 8],
  beamSize: ['2x8', '2x10', '2x12'],
};

/** Everything a grid point changes, written onto a base design. */
function apply(base, pt) {
  const [length, width] = pt.size;
  return {
    ...base,
    ...pt,
    size: undefined,
    length,
    width,
    autoWall: false,
    autoPitch: false,
    autoOverhang: false,
    overhang: base.overhang,
    maxPeak: 0,
    openings: refitOpenings(base.openings, length, width),
  };
}

/** Does candidate c look like the starting design s (see the header)? */
export function looksLike(c, s) {
  const a = c.built;
  const b = s.built;
  return a.sidingType === b.sidingType && a.roofCover === b.roofCover && a.roofType === b.roofType
    && Math.abs(a.pitch - b.pitch) <= 1 && a.overhang >= b.overhang - 0.01 && a.wallHeight >= b.wallHeight - 0.01;
}

/** Cartesian product of the grid's lists, as grid points. */
export function* gridPoints(grid = GRID) {
  const keys = Object.keys(grid);
  const idx = keys.map(() => 0);
  for (;;) {
    yield Object.fromEntries(keys.map((k, i) => [k, grid[k][idx[i]]]));
    let i = 0;
    while (i < keys.length && ++idx[i] === grid[keys[i]].length) idx[i++] = 0;
    if (i === keys.length) return;
  }
}

/** A seeded generator, so a failing audit can be rerun exactly. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Random restarts: start at random grid points, then move one setting at a
 * time while that lowers cost without losing storage or failing a check.
 */
export function* restarts(base, n, seed = 1, grid = GRID, prices = undefined, keep = (_c) => true, maxFootprint = 100) {
  const r = rng(seed);
  const keys = Object.keys(grid);
  for (let t = 0; t < n; t++) {
    let pt = Object.fromEntries(keys.map((k) => [k, grid[k][Math.floor(r() * grid[k].length)]]));
    const fits = (p) => (p.size[0] * p.size[1]) / 144 <= maxFootprint;
    if (!fits(pt)) continue;
    let cur = evaluate(apply(base, pt), prices);
    yield cur;
    for (let improved = true; improved;) {
      improved = false;
      for (const k of keys) {
        for (const v of grid[k]) {
          if (v === pt[k]) continue;
          const np = { ...pt, [k]: v };
          if (!fits(np)) continue;
          const c = evaluate(apply(base, np), prices);
          yield c;
          if (c.ok && keep(c) && c.cuFt >= cur.cuFt - 1e-6 && c.cost < cur.cost - 0.005) { pt = np; cur = c; improved = true; }
        }
      }
    }
  }
}

/** Points no other point beats on both cost (lower) and storage (higher). */
export function paretoFront(points) {
  const ok = points.filter((p) => p.ok).sort((a, b) => a.cost - b.cost || b.cuFt - a.cuFt);
  const out = [];
  let best = -Infinity;
  for (const p of ok) if (p.cuFt > best + 1e-6) { out.push(p); best = p.cuFt; }
  return out;
}

/**
 * How far a starting design is from the front of the designs that look like it.
 * gap is the share of its cost a look-alike holding at least as much saves.
 * @param {ReturnType<typeof evaluate>} start
 * @param {ReturnType<typeof evaluate>[]} pool
 */
export function gapOf(start, pool) {
  const rivals = pool.filter((c) => c.ok && looksLike(c, start) && c.cuFt >= start.cuFt - 1e-6 && c.footprint <= (start.built.maxFootprint || Infinity));
  const best = rivals.reduce((m, c) => (!m || c.cost < m.cost ? c : m), null);
  return { start, best, gap: best ? Math.max(0, (start.cost - best.cost) / start.cost) : 0 };
}

/**
 * Audit starting designs: evaluate the grid over each one's own settings, run
 * random restarts, and give each design's gap.
 * @param {any[]} starts designs to audit
 * @param {{ grid?: any, fine?: any, restarts?: number, seed?: number, prices?: any, maxFootprint?: number }} [opts]
 */
export function audit(starts, opts = {}) {
  const grid = opts.grid || GRID;
  const maxFp = opts.maxFootprint ?? 100;
  return starts.map((design) => {
    const start = evaluate(design, opts.prices);
    // Rivals keep the start's built overhang and may keep its wall height, so
    // a start with walls or eaves off the grid still has look-alikes to meet.
    const own = { ...design, overhang: start.built.overhang };
    const withOwn = (g) => ({ ...g, wallHeight: [...new Set([...g.wallHeight, start.built.wallHeight])] });
    const pool = [];
    for (const pt of gridPoints(withOwn(grid))) {
      if ((pt.size[0] * pt.size[1]) / 144 > maxFp) continue;
      pool.push(evaluate(apply(own, pt), opts.prices));
    }
    for (const c of restarts(own, opts.restarts ?? 0, opts.seed ?? 1, withOwn(opts.fine || FINE), opts.prices, (c) => looksLike(c, start), maxFp)) pool.push(c);
    return { ...gapOf(start, pool), front: paretoFront(pool.filter((c) => looksLike(c, start))), evaluated: pool.length };
  });
}

/**
 * The quick audit: change one setting at a time to each value the fine grid
 * offers and give the gap to the cheapest look-alike that holds as much. A
 * design with no gap here is locally optimal; audit() looks further.
 * @param {any} design
 * @param {{ fine?: any, prices?: any, maxFootprint?: number }} [opts]
 */
export function neighbourGap(design, opts = {}) {
  const start = evaluate(design, opts.prices);
  const b = start.built;
  const fine = opts.fine || FINE;
  const maxFp = opts.maxFootprint ?? (b.maxFootprint || Infinity);
  const own = { ...design, autoWall: false, autoPitch: false, autoOverhang: false, maxPeak: 0, wallHeight: b.wallHeight, pitch: b.pitch, overhang: b.overhang };
  const pool = [];
  for (const [k, vals] of Object.entries(fine)) {
    for (const v of vals) {
      if (k === 'size') {
        if ((v[0] === b.length && v[1] === b.width) || (v[0] * v[1]) / 144 > maxFp) continue;
        pool.push(evaluate({ ...own, length: v[0], width: v[1], openings: refitOpenings(design.openings, v[0], v[1]) }, opts.prices));
      } else if (b[k] !== v) {
        pool.push(evaluate({ ...own, [k]: v }, opts.prices));
      }
    }
  }
  return { ...gapOf(start, pool), evaluated: pool.length };
}
