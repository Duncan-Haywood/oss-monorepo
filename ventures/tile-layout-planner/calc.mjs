// Tile layout planner: geometry, offcut reuse and layout search.
// Everything is in millimetres internally; the page converts from metric or imperial.
// No imports, no network: the page and the tests load this file directly.

export const SYSTEMS = {
  metric: { id: "metric", roomMm: 1000, tileMm: 10, groutMm: 1, roomU: "m", tileU: "cm", groutU: "mm", areaU: "m²", areaMm2: 1e6 },
  imperial: { id: "imperial", roomMm: 304.8, tileMm: 25.4, groutMm: 25.4, roomU: "ft", tileU: "in", groutU: "in", areaU: "ft²", areaMm2: 304.8 * 304.8 },
};

export const PATTERNS = [
  { id: "grid", label: "Straight grid" },
  { id: "brick", label: "Running bond (brick offset)" },
  { id: "diagonal", label: "Diagonal (45°)" },
];

export const MAX_CELLS = 60000;
const S45 = Math.SQRT1_2;
const AREA_TOL = 0.5; // mm²: smaller is float noise, not a tile piece
const EDGE_TOL = 1e-4;

const mod = (a, n) => ((a % n) + n) % n;

// ---------- polygons ----------
function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function polyPerimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

// Sutherland-Hodgman against one half-plane: keep p[axis] <= val, or >= val.
function clipHalf(poly, axis, val, keepLE) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const da = keepLE ? val - a[axis] : a[axis] - val;
    const db = keepLE ? val - b[axis] : b[axis] - val;
    if (da >= 0) out.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function clipRect(poly, r) {
  let p = clipHalf(poly, 0, r.x0, false);
  if (p.length < 3) return [];
  p = clipHalf(p, 0, r.x1, true);
  if (p.length < 3) return [];
  p = clipHalf(p, 1, r.y0, false);
  if (p.length < 3) return [];
  p = clipHalf(p, 1, r.y1, true);
  return p.length < 3 ? [] : p;
}

// poly minus a rectangle, as disjoint pieces.
function subtractRect(poly, r) {
  const out = [];
  const left = clipHalf(poly, 0, r.x0, true);
  if (left.length >= 3) out.push(left);
  const rest = clipHalf(poly, 0, r.x0, false);
  if (rest.length >= 3) {
    const right = clipHalf(rest, 0, r.x1, false);
    if (right.length >= 3) out.push(right);
    const mid = clipHalf(rest, 0, r.x1, true);
    if (mid.length >= 3) {
      const below = clipHalf(mid, 1, r.y0, true);
      if (below.length >= 3) out.push(below);
      const above = clipHalf(mid, 1, r.y1, false);
      if (above.length >= 3) out.push(above);
    }
  }
  return out.filter((p) => polyArea(p) > AREA_TOL * 0.01);
}

function bboxOf(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// ---------- the specification ----------
// spec (mm): { roomW, roomH, wallGap, tileW, tileH, grout, pattern, brickShift,
//              obstacles:[{x,y,w,h}], minCut, overagePct, tilesPerBox, boxPrice, reuse, swap }
export const DEFAULTS = { wallGap: 0, brickShift: 0.5, minCut: 50, overagePct: 10, reuse: true, swap: false, pattern: "grid" };

export function regionOf(spec) {
  const g = spec.wallGap || 0;
  return { x0: g, y0: g, x1: spec.roomW - g, y1: spec.roomH - g };
}

function clippedObstacles(spec) {
  const r = regionOf(spec);
  const out = [];
  for (const o of spec.obstacles || []) {
    const c = { x0: Math.max(o.x, r.x0), y0: Math.max(o.y, r.y0), x1: Math.min(o.x + o.w, r.x1), y1: Math.min(o.y + o.h, r.y1) };
    if (c.x1 - c.x0 > EDGE_TOL && c.y1 - c.y0 > EDGE_TOL) out.push(c);
  }
  return out;
}

export function tileableArea(spec) {
  const r = regionOf(spec);
  let a = (r.x1 - r.x0) * (r.y1 - r.y0);
  for (const c of clippedObstacles(spec)) a -= (c.x1 - c.x0) * (c.y1 - c.y0);
  return a;
}

export function estimateCells(spec) {
  const r = regionOf(spec);
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const px = spec.tileW + spec.grout, py = spec.tileH + spec.grout;
  const span = spec.pattern === "diagonal" ? (w + h) * S45 : null;
  if (span !== null) return Math.ceil(span / px + 2) * Math.ceil(span / py + 2);
  return Math.ceil(w / px + 2) * Math.ceil(h / py + 2);
}

export function validateSpec(spec) {
  const errors = [];
  const pos = (v) => Number.isFinite(v) && v > 0;
  if (!pos(spec.roomW) || !pos(spec.roomH)) errors.push("Enter the room length and width.");
  if (!pos(spec.tileW) || !pos(spec.tileH)) errors.push("Enter the tile length and width.");
  if (!(Number.isFinite(spec.grout) && spec.grout >= 0)) errors.push("Grout joint must be zero or more.");
  if (!(Number.isFinite(spec.wallGap) && spec.wallGap >= 0)) errors.push("Wall gap must be zero or more.");
  if (errors.length) return errors;
  if (spec.grout >= Math.min(spec.tileW, spec.tileH)) errors.push("The grout joint is as wide as the tile; check the units.");
  const r = regionOf(spec);
  if (r.x1 - r.x0 <= 0 || r.y1 - r.y0 <= 0) errors.push("The wall gap leaves no floor to tile.");
  if (!PATTERNS.some((p) => p.id === spec.pattern)) errors.push("Pick a pattern.");
  if (spec.pattern === "brick" && !(spec.brickShift > 0 && spec.brickShift < 1)) errors.push("Brick offset must be between 0 and 1 of a tile.");
  const obs = spec.obstacles || [];
  obs.forEach((o, i) => {
    if (![o.x, o.y, o.w, o.h].every(Number.isFinite) || !(o.w > 0) || !(o.h > 0)) errors.push(`Obstacle ${i + 1}: enter its position and size.`);
    else if (o.x < -EDGE_TOL || o.y < -EDGE_TOL || o.x + o.w > spec.roomW + EDGE_TOL || o.y + o.h > spec.roomH + EDGE_TOL) errors.push(`Obstacle ${i + 1} reaches outside the room.`);
  });
  if (!errors.length) {
    for (let i = 0; i < obs.length; i++) {
      for (let j = i + 1; j < obs.length; j++) {
        const a = obs[i], b = obs[j];
        if (a.x < b.x + b.w - EDGE_TOL && b.x < a.x + a.w - EDGE_TOL && a.y < b.y + b.h - EDGE_TOL && b.y < a.y + a.h - EDGE_TOL) errors.push(`Obstacles ${i + 1} and ${j + 1} overlap; merge them into one.`);
      }
    }
  }
  if (!errors.length && tileableArea(spec) <= 0) errors.push("The obstacles cover the whole floor.");
  if (!errors.length && estimateCells(spec) > MAX_CELLS) errors.push("That is more than 60,000 tiles; the tile is too small for the room, or the units are off.");
  return errors;
}

// ---------- offcut reuse ----------
// Greedy guillotine reuse: each cut piece (a x b) comes from the smallest leftover
// that holds it, otherwise from a new tile. Returns the number of new tiles needed.
export function reuseTiles(items, tw, th, allowRotate, minUseful = 20) {
  const sorted = items.map(([a, b]) => ({ a, b })).sort((p, q) => q.a * q.b - p.a * p.b);
  let pool = [];
  let fresh = 0;
  const E = 1e-6;
  for (const it of sorted) {
    let best = -1, bestArea = Infinity, rot = false;
    for (let k = 0; k < pool.length; k++) {
      const o = pool[k], ar = o.w * o.h;
      if (ar >= bestArea) continue;
      if (o.w >= it.a - E && o.h >= it.b - E) { best = k; bestArea = ar; rot = false; }
      else if (allowRotate && o.w >= it.b - E && o.h >= it.a - E) { best = k; bestArea = ar; rot = true; }
    }
    let W, H, a = it.a, b = it.b;
    if (best < 0) {
      fresh++;
      W = tw; H = th;
    } else {
      W = pool[best].w; H = pool[best].h;
      pool.splice(best, 1);
      if (rot) { const t = a; a = b; b = t; }
    }
    const A1 = [[W - a, H], [a, H - b]];
    const B1 = [[W - a, b], [W, H - b]];
    const score = (s) => Math.max(s[0][0] * s[0][1], s[1][0] * s[1][1]);
    const pick = score(A1) >= score(B1) ? A1 : B1;
    for (const [w, h] of pick) if (w >= minUseful && h >= minUseful) pool.push({ w, h });
    if (pool.length > 2000) { pool.sort((p, q) => q.w * q.h - p.w * p.h); pool.length = 2000; }
  }
  return fresh;
}

// ---------- one layout ----------
// lay: { angle: 0 | 45, swap, ox, oy }. Angle 0 puts a tile corner at (ox, oy) in room
// coordinates; angle 45 turns the lattice about the middle of the floor and (ox, oy)
// are lattice coordinates measured from that middle.
export function evaluateLayout(spec, lay, keep = false) {
  const reg = regionOf(spec);
  const obs = clippedObstacles(spec);
  const tw = lay.swap ? spec.tileH : spec.tileW;
  const th = lay.swap ? spec.tileW : spec.tileH;
  const g = spec.grout;
  const px = tw + g, py = th + g;
  const brick = spec.pattern === "brick";
  const f = brick ? spec.brickShift : 0;
  const diag = lay.angle === 45;
  const cx = (reg.x0 + reg.x1) / 2, cy = (reg.y0 + reg.y1) / 2;
  const tileArea = tw * th;
  const minCut = spec.minCut || 0;

  let umin, umax, vmin, vmax;
  if (diag) {
    umin = vmin = Infinity; umax = vmax = -Infinity;
    for (const [x, y] of [[reg.x0, reg.y0], [reg.x1, reg.y0], [reg.x1, reg.y1], [reg.x0, reg.y1]]) {
      const u = ((x - cx) + (y - cy)) * S45, v = ((y - cy) - (x - cx)) * S45;
      if (u < umin) umin = u; if (u > umax) umax = u;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
  } else {
    umin = reg.x0; umax = reg.x1; vmin = reg.y0; vmax = reg.y1;
  }

  const jmin = Math.floor((vmin - th - lay.oy) / py) - 1;
  const jmax = Math.ceil((vmax - lay.oy) / py) + 1;
  let full = 0;
  const cuts = [];
  const cells = keep ? [] : null;
  let visible = 0;

  for (let j = jmin; j <= jmax; j++) {
    const sj = brick ? mod(j * f, 1) * px : 0;
    const v0 = lay.oy + j * py;
    const imin = Math.floor((umin - tw - lay.ox - sj) / px) - 1;
    const imax = Math.ceil((umax - lay.ox - sj) / px) + 1;
    for (let i = imin; i <= imax; i++) {
      const u0 = lay.ox + sj + i * px;
      let bx0, by0, bx1, by1, poly = null;
      if (diag) {
        const c = [[u0, v0], [u0 + tw, v0], [u0 + tw, v0 + th], [u0, v0 + th]];
        poly = c.map(([u, v]) => [cx + (u - v) * S45, cy + (u + v) * S45]);
        ({ x0: bx0, y0: by0, x1: bx1, y1: by1 } = bboxOf(poly));
      } else {
        bx0 = u0; by0 = v0; bx1 = u0 + tw; by1 = v0 + th;
      }
      // Quick path: a tile wholly inside the floor and clear of every obstacle is full.
      if (bx1 <= reg.x0 + EDGE_TOL || bx0 >= reg.x1 - EDGE_TOL || by1 <= reg.y0 + EDGE_TOL || by0 >= reg.y1 - EDGE_TOL) continue;
      let clear = bx0 >= reg.x0 - EDGE_TOL && bx1 <= reg.x1 + EDGE_TOL && by0 >= reg.y0 - EDGE_TOL && by1 <= reg.y1 + EDGE_TOL;
      if (clear) {
        for (const o of obs) {
          if (bx0 < o.x1 - EDGE_TOL && o.x0 < bx1 - EDGE_TOL && by0 < o.y1 - EDGE_TOL && o.y0 < by1 - EDGE_TOL) { clear = false; break; }
        }
      }
      if (clear) {
        full++;
        visible += tileArea;
        if (cells) cells.push({ kind: "full", tile: poly || [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]], pieces: [] });
        continue;
      }
      if (!poly) poly = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]];
      const clipped = clipRect(poly, reg);
      let pieces = clipped.length ? [clipped] : [];
      for (const o of obs) {
        const next = [];
        for (const p of pieces) {
          if (bboxOf(p).x1 <= o.x0 || bboxOf(p).x0 >= o.x1 || bboxOf(p).y1 <= o.y0 || bboxOf(p).y0 >= o.y1) next.push(p);
          else next.push(...subtractRect(p, o));
        }
        pieces = next;
      }
      pieces = pieces.filter((p) => polyArea(p) > AREA_TOL);
      if (!pieces.length) continue;
      const vis = pieces.reduce((s, p) => s + polyArea(p), 0);
      visible += vis;
      if (vis >= tileArea - AREA_TOL && pieces.length === 1) {
        full++;
        if (cells) cells.push({ kind: "full", tile: poly, pieces: [] });
        continue;
      }
      let thick = Infinity;
      let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
      for (const p of pieces) {
        const b = bboxOf(p);
        const t = diag ? (2 * polyArea(p)) / polyPerimeter(p) : Math.min(b.x1 - b.x0, b.y1 - b.y0);
        if (t < thick) thick = t;
        if (b.x0 < ux0) ux0 = b.x0; if (b.x1 > ux1) ux1 = b.x1;
        if (b.y0 < uy0) uy0 = b.y0; if (b.y1 > uy1) uy1 = b.y1;
      }
      const cut = { w: ux1 - ux0, h: uy1 - uy0, thick, vis };
      cuts.push(cut);
      if (cells) cells.push({ kind: thick < minCut - 1e-6 ? "sliver" : "cut", tile: poly, pieces, thick });
    }
  }

  const slivers = cuts.filter((c) => c.thick < minCut - 1e-6).length;
  const smallest = cuts.length ? Math.min(...cuts.map((c) => c.thick)) : null;
  const noReuse = full + cuts.length;
  const canReuse = !diag && spec.reuse !== false;
  const withReuse = canReuse ? full + reuseTiles(cuts.map((c) => [c.w, c.h]), tw, th, spec.rotateOffcuts !== false) : noReuse;
  const basis = withReuse;
  const orderTiles = Math.ceil(basis * (1 + (spec.overagePct || 0) / 100) - 1e-9);
  const boxes = spec.tilesPerBox > 0 ? Math.ceil(orderTiles / spec.tilesPerBox - 1e-9) : null;
  const cost = boxes !== null && spec.boxPrice > 0 ? boxes * spec.boxPrice : null;
  const bought = withReuse * tileArea;
  const out = {
    lay: { ...lay }, tw, th, full, cutCount: cuts.length, slivers, smallest,
    tilesNoReuse: noReuse, tilesWithReuse: withReuse, orderTiles, boxes, cost,
    reuseModelled: canReuse, visible, wastePct: bought > 0 ? Math.max(0, (1 - visible / bought) * 100) : 0, cuts,
  };
  if (cells) out.cells = cells;
  return out;
}

// ---------- layouts to try ----------
export function layoutFor(spec, kind, opts = {}) {
  const swap = Boolean(opts.swap);
  const tw = swap ? spec.tileH : spec.tileW;
  const th = swap ? spec.tileW : spec.tileH;
  const g = spec.grout;
  const px = tw + g, py = th + g;
  const reg = regionOf(spec);
  const diag = spec.pattern === "diagonal";
  if (diag) {
    const o = {
      "tile-center": [-tw / 2, -th / 2],
      "joint-center": [g / 2, g / 2],
      corner: [0, 0],
    }[kind] || [-tw / 2, -th / 2];
    return { angle: 45, swap, ox: mod(o[0], px), oy: mod(o[1], py) };
  }
  const cx = (reg.x0 + reg.x1) / 2, cy = (reg.y0 + reg.y1) / 2;
  if (kind === "tile-center") return { angle: 0, swap, ox: mod(cx - tw / 2, px), oy: mod(cy - th / 2, py) };
  if (kind === "joint-center") return { angle: 0, swap, ox: mod(cx + g / 2, px), oy: mod(cy + g / 2, py) };
  const c = opts.corner || "nw";
  const ox = c.includes("w") ? reg.x0 : reg.x1 - tw;
  const oy = c.includes("n") ? reg.y0 : reg.y1 - th;
  return { angle: 0, swap, ox: mod(ox, px), oy: mod(oy, py) };
}

function axisCandidates(spec, axis, lay, n) {
  const reg = regionOf(spec);
  const tw = lay.swap ? spec.tileH : spec.tileW;
  const th = lay.swap ? spec.tileW : spec.tileH;
  const t = axis === 0 ? tw : th;
  const p = t + spec.grout;
  const vals = [];
  if (lay.angle === 45) {
    vals.push(-t / 2, spec.grout / 2, 0);
  } else {
    const lo = axis === 0 ? reg.x0 : reg.y0, hi = axis === 0 ? reg.x1 : reg.y1;
    const mid = (lo + hi) / 2;
    vals.push(lo, hi - t, mid - t / 2, mid + spec.grout / 2);
    for (const o of clippedObstacles(spec)) {
      const a = axis === 0 ? o.x0 : o.y0, b = axis === 0 ? o.x1 : o.y1;
      vals.push(a, a - t, b, b - t);
    }
  }
  for (let k = 0; k < n; k++) vals.push((k * p) / n);
  const seen = [];
  for (const v of vals) {
    const m = mod(v, p);
    if (!seen.some((s) => Math.min(Math.abs(s - m), p - Math.abs(s - m)) < 0.5)) seen.push(m);
  }
  return seen;
}

// Fewest slivers first, then the fewest tiles to buy, then the largest smallest cut.
export function betterLayout(a, b) {
  if (a.slivers !== b.slivers) return a.slivers < b.slivers;
  if (a.tilesWithReuse !== b.tilesWithReuse) return a.tilesWithReuse < b.tilesWithReuse;
  const sa = a.smallest === null ? Infinity : a.smallest, sb = b.smallest === null ? Infinity : b.smallest;
  if (Math.abs(sa - sb) > 0.5) return sa > sb;
  return a.cutCount < b.cutCount;
}

export function searchBest(spec, opts = {}) {
  const cellsEst = estimateCells(spec);
  const n = opts.samples || (cellsEst < 2000 ? 16 : cellsEst < 10000 ? 10 : 6);
  const diag = spec.pattern === "diagonal";
  const swaps = spec.tileW === spec.tileH ? [false] : opts.swaps || [false, true];
  let best = null;
  let tried = 0;
  for (const swap of swaps) {
    const base = { angle: diag ? 45 : 0, swap };
    const xs = axisCandidates(spec, 0, base, n);
    const ys = axisCandidates(spec, 1, base, n);
    for (const ox of xs) {
      for (const oy of ys) {
        const r = evaluateLayout(spec, { ...base, ox, oy });
        tried++;
        if (!best || betterLayout(r, best)) best = r;
      }
    }
  }
  best.tried = tried;
  return best;
}

export const CORNERS = { nw: "top-left", ne: "top-right", sw: "bottom-left", se: "bottom-right" };

export const MODES = [
  { id: "best", label: "Best found (fewest thin cuts, then fewest tiles)" },
  { id: "tile-center", label: "Centre a tile on the middle of the room" },
  { id: "joint-center", label: "Centre a grout joint on the middle of the room" },
  { id: "corner-nw", label: "Start from the top-left corner" },
  { id: "corner-ne", label: "Start from the top-right corner" },
  { id: "corner-sw", label: "Start from the bottom-left corner" },
  { id: "corner-se", label: "Start from the bottom-right corner" },
];

export function planMode(spec, mode, keep = false) {
  const swap = Boolean(spec.swap);
  let r;
  if (mode === "best") {
    r = searchBest(spec);
    if (keep) r = { ...evaluateLayout(spec, r.lay, true), tried: r.tried };
    return r;
  }
  if (mode.startsWith("corner-")) {
    if (spec.pattern === "diagonal") return planMode(spec, "tile-center", keep);
    r = layoutFor(spec, "corner", { swap, corner: mode.slice(7) });
  } else {
    r = layoutFor(spec, mode, { swap });
  }
  return evaluateLayout(spec, r, keep);
}

// Every way worth comparing, for the table under the plan.
export function compareLayouts(spec) {
  const rows = [];
  const diag = spec.pattern === "diagonal";
  const add = (name, r) => rows.push({ name, ...r });
  if (!diag) {
    let bestCorner = null, bestId = null;
    for (const c of Object.keys(CORNERS)) {
      const r = evaluateLayout(spec, layoutFor(spec, "corner", { swap: spec.swap, corner: c }));
      if (!bestCorner || betterLayout(r, bestCorner)) { bestCorner = r; bestId = c; }
    }
    add(`Start from a corner (best: ${CORNERS[bestId]})`, bestCorner);
  }
  add("Centre a tile on the room", evaluateLayout(spec, layoutFor(spec, "tile-center", { swap: spec.swap })));
  add("Centre a grout joint on the room", evaluateLayout(spec, layoutFor(spec, "joint-center", { swap: spec.swap })));
  add("Best found, either tile direction", searchBest(spec));
  return rows;
}

// ---------- results ----------
// Cut pieces grouped by size, biggest group first.
export function cutList(result, diag = false) {
  const m = new Map();
  for (const c of result.cuts) {
    const step = diag ? 5 : 1;
    const a = Math.round(c.w / step) * step, b = Math.round(c.h / step) * step;
    const key = `${a}x${b}`;
    const e = m.get(key) || { w: a, h: b, count: 0, thick: c.thick };
    e.count++;
    e.thick = Math.min(e.thick, c.thick);
    m.set(key, e);
  }
  return [...m.values()].sort((p, q) => q.count - p.count || q.w * q.h - p.w * p.h);
}

// An independent check: the pieces drawn must lie inside the floor, stay out of every
// obstacle, and add up to the floor area left to tile (exactly, when there is no grout).
export function verifyLayout(spec, result) {
  const problems = [];
  if (!result.cells) return ["verifyLayout needs a result built with keep = true"];
  const reg = regionOf(spec);
  const obs = clippedObstacles(spec);
  let sum = 0;
  const tol = 1e-3;
  for (const c of result.cells) {
    const polys = c.kind === "full" ? [clipRect(c.tile, reg)] : c.pieces;
    for (const p of polys) {
      if (!p.length) continue;
      sum += polyArea(p);
      for (const [x, y] of p) {
        if (x < reg.x0 - tol || x > reg.x1 + tol || y < reg.y0 - tol || y > reg.y1 + tol) problems.push("a piece leaves the floor");
      }
      const b = bboxOf(p);
      for (const o of obs) {
        const ox = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0), oy = Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0);
        if (ox > 1e-3 && oy > 1e-3) {
          // bounding boxes touch; confirm with an exact clip
          const inside = clipRect(p, o);
          if (inside.length && polyArea(inside) > 0.5) problems.push("a piece overlaps an obstacle");
        }
      }
    }
  }
  const want = tileableArea(spec);
  if (spec.grout === 0) {
    // With no joints the pieces tile the floor exactly.
    if (Math.abs(sum - want) > Math.max(1, want * 1e-9)) problems.push(`pieces cover ${sum.toFixed(1)} mm² but ${want.toFixed(1)} mm² is to be tiled`);
  } else {
    // Joints take a share of the floor. The share is exact for whole tiles in the middle
    // and uncertain by at most one pitch along every edge.
    const tw = result.tw, th = result.th, g = spec.grout;
    const share = (tw * th) / ((tw + g) * (th + g));
    let perim = 2 * ((reg.x1 - reg.x0) + (reg.y1 - reg.y0));
    for (const o of obs) perim += 2 * ((o.x1 - o.x0) + (o.y1 - o.y0));
    const band = perim * Math.max(tw + g, th + g);
    if (sum > want + 1 || Math.abs(sum - want * share) > band) problems.push("the tiled area is outside what the joints allow");
  }
  if (Math.abs(sum - result.visible) > Math.max(1, want * 1e-9)) problems.push("the reported tiled area disagrees with the pieces");
  return [...new Set(problems)];
}

export function sampleSpec() {
  // A bathroom 2.74 m x 2.13 m (9 ft x 7 ft) with a tub along the top wall.
  return {
    roomW: 2740, roomH: 2130, wallGap: 0, tileW: 300, tileH: 600, grout: 3, pattern: "brick", brickShift: 0.5,
    obstacles: [{ x: 1000, y: 0, w: 1740, h: 800 }], minCut: 50, overagePct: 10, tilesPerBox: 6, boxPrice: null, reuse: true, swap: false,
  };
}

// ---------- formatting ----------
export function fmtNum(x, d = 0) {
  if (!Number.isFinite(x)) return "–";
  return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const fmtMoney = (x) => (Number.isFinite(x) ? "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export function lenText(sys, mm, kind = "tile") {
  if (mm === null || mm === undefined) return "–";
  if (kind === "room") return `${+(mm / sys.roomMm).toFixed(2)} ${sys.roomU}`;
  if (kind === "grout") return `${+(mm / sys.groutMm).toFixed(sys.id === "metric" ? 1 : 3)} ${sys.groutU}`;
  return `${+(mm / sys.tileMm).toFixed(sys.id === "metric" ? 1 : 2)} ${sys.tileU}`;
}

export function reportCsv(sys, spec, result) {
  const rows = [["cut size (bounding box)", "pieces", "thinnest part"].join(",")];
  for (const c of cutList(result, spec.pattern === "diagonal")) {
    rows.push([`${lenText(sys, c.w)} x ${lenText(sys, c.h)}`, c.count, lenText(sys, c.thick)].map((v) => `"${v}"`).join(","));
  }
  rows.push("");
  rows.push(["full tiles", result.full].join(","));
  rows.push(["cut tiles", result.cutCount].join(","));
  rows.push(["tiles to buy (offcut reuse as modelled)", result.tilesWithReuse].join(","));
  rows.push(["tiles to buy (no reuse)", result.tilesNoReuse].join(","));
  rows.push(["tiles to order with overage", result.orderTiles].join(","));
  return rows.join("\n");
}
