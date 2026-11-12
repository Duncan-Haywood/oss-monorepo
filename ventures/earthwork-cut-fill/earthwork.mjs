// Earthwork cut and fill from survey points.
//
// Builds a triangulated surface (TIN, Delaunay) from the existing-ground
// shots, compares it with a design surface (a flat or sloped pad, or a second
// set of points for proposed grade), and integrates the depth difference over
// every triangle exactly: inside one triangle both surfaces are planes, so the
// depth is linear, and the cut and fill parts are split along the line where
// it crosses zero. The result is the volume between the two TINs, with no grid
// or average-end-area approximation on top of the triangulation itself.
//
// Pure functions, no dependencies. Coordinates are x = easting, y = northing.
// Not engineering advice: the volume is only as good as the shots, and a TIN
// with no breaklines cuts across ditches and ridges between shots.

// ---------------------------------------------------------------- parsing

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const isNum = s => NUM.test(String(s).trim());

const HEADER_ALIASES = {
  p: ['p', 'pt', 'point', 'pnt', 'id', 'pointnumber', 'pointno', 'number', 'no', 'name'],
  n: ['n', 'northing', 'north', 'y', 'ycoord', 'ycoordinate'],
  e: ['e', 'easting', 'east', 'x', 'xcoord', 'xcoordinate'],
  z: ['z', 'elev', 'elevation', 'el', 'height', 'h', 'zcoord', 'rl', 'level'],
  d: ['d', 'desc', 'description', 'code', 'descriptor', 'note', 'raw description', 'rawdescription'],
};

export const FORMATS = ['auto', 'PNEZD', 'PENZD', 'NEZ', 'ENZ'];

function splitLine(line) {
  const t = line.trim();
  if (!t) return [];
  if (t.includes(',')) return t.split(',').map(s => s.trim());
  if (t.includes('\t')) return t.split('\t').map(s => s.trim());
  if (t.includes(';')) return t.split(';').map(s => s.trim());
  return t.split(/\s+/);
}

function headerMap(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const k = c.toLowerCase().replace(/[^a-z ]/g, '').trim();
    const flat = k.replace(/ /g, '');
    for (const [role, names] of Object.entries(HEADER_ALIASES)) {
      if (map[role] === undefined && (names.includes(k) || names.includes(flat))) { map[role] = i; break; }
    }
  });
  return map.n !== undefined && map.e !== undefined && map.z !== undefined ? map : null;
}

function layoutFor(format, width) {
  switch (format) {
    case 'PNEZD': return { p: 0, n: 1, e: 2, z: 3, d: 4 };
    case 'PENZD': return { p: 0, e: 1, n: 2, z: 3, d: 4 };
    case 'NEZ': return { n: 0, e: 1, z: 2 };
    case 'ENZ': return { e: 0, n: 1, z: 2 };
    default: return width >= 4 ? { p: 0, n: 1, e: 2, z: 3, d: 4 } : { e: 0, n: 1, z: 2 };
  }
}

/**
 * Parse survey points. Accepts a header row (Point, Northing, Easting,
 * Elevation, Description, or X/Y/Z), or a headerless PNEZD / PENZD / NEZ / ENZ
 * file (comma, tab, semicolon or space separated). With format 'auto' and no
 * header, four or more columns read as PNEZD (the usual total-station and
 * Civil 3D export) and three as ENZ (x, y, z).
 * @returns {{points: {id:string,x:number,y:number,z:number,desc:string}[], format:string, errors:string[], warnings:string[]}}
 */
export function parsePoints(text, { format = 'auto' } = {}) {
  const errors = []; const warnings = [];
  const lines = String(text ?? '').split(/\r?\n/);
  const rows = [];
  let map = null; let used = format;
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || /^\s*(#|\/\/)/.test(raw)) continue;
    const cells = splitLine(raw);
    if (!map && rows.length === 0 && skipped === 0 && headerMap(cells) && cells.filter(isNum).length < 3) {
      map = headerMap(cells); used = 'header'; continue;
    }
    const lay = map || layoutFor(format, cells.filter(isNum).length >= 4 || (cells.length >= 4 && isNum(cells[3])) ? 4 : 3);
    if (!map && format === 'auto') used = lay.p !== undefined ? 'PNEZD' : 'ENZ';
    const x = cells[lay.e], y = cells[lay.n], z = cells[lay.z];
    if (![x, y, z].every(v => v !== undefined && isNum(v))) {
      if (rows.length === 0 && skipped === 0) { skipped++; continue; } // an unrecognised header
      warnings.push(`Line ${i + 1} skipped: no number in the easting, northing or elevation column.`);
      continue;
    }
    rows.push({
      id: lay.p !== undefined && cells[lay.p] !== undefined ? cells[lay.p] : String(rows.length + 1),
      x: Number(x), y: Number(y), z: Number(z),
      desc: lay.d !== undefined && cells.length > lay.d ? cells.slice(lay.d).join(' ') : '',
      line: i + 1,
    });
  }
  if (rows.length < 3) errors.push(`Need at least 3 points with easting, northing and elevation; found ${rows.length}.`);
  return { points: rows, format: used, errors, warnings };
}

/** Parse a boundary: one "easting, northing" vertex per line (or the E, N columns of a point file). */
export function parseBoundary(text) {
  const verts = []; const warnings = [];
  for (const [i, raw] of String(text ?? '').split(/\r?\n/).entries()) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const nums = splitLine(raw).filter(isNum).map(Number);
    if (nums.length < 2) { if (verts.length) warnings.push(`Boundary line ${i + 1} skipped.`); continue; }
    // Two numbers: E, N. Four or more: a PNEZ row, so E is the third and N the second.
    verts.push(nums.length >= 4 ? [nums[2], nums[1]] : [nums[0], nums[1]]);
  }
  if (verts.length > 1) {
    const [a, b] = [verts[0], verts[verts.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) verts.pop();
  }
  return { vertices: verts, warnings, error: verts.length && verts.length < 3 ? 'A boundary needs at least 3 vertices.' : null };
}

// ---------------------------------------------------------- triangulation

function circum(ax, ay, bx, by, cx, cy) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (d === 0) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
}

const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/**
 * Delaunay triangulation (Bowyer-Watson, points swept in x order so finished
 * triangles leave the active list). Coordinates are shifted to the data's own
 * origin first: state-plane and UTM values (500000, 4000000) would otherwise
 * lose most of their precision in the circumcircle test.
 * Duplicate positions keep the first point and are reported.
 * @returns {{pts: {x,y,z,id}[], tris: number[][], duplicates: string[]}}
 */
export function triangulate(points, { maxEdge = null } = {}) {
  const seen = new Map(); const pts = []; const duplicates = [];
  for (const p of points) {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) { duplicates.push(p.id); continue; }
    seen.set(key, pts.length); pts.push({ x: p.x, y: p.y, z: p.z, id: p.id });
  }
  const n = pts.length;
  if (n < 3) return { pts, tris: [], duplicates };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const ox = minX, oy = minY;
  const X = new Float64Array(n + 3), Y = new Float64Array(n + 3);
  for (let i = 0; i < n; i++) { X[i] = pts[i].x - ox; Y[i] = pts[i].y - oy; }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const mx = (maxX - minX) / 2, my = (maxY - minY) / 2;
  const big = span * 1000;
  X[n] = mx - big; Y[n] = my - big;
  X[n + 1] = mx + big; Y[n + 1] = my - big;
  X[n + 2] = mx; Y[n + 2] = my + big;

  const order = [...Array(n).keys()].sort((a, b) => X[a] - X[b] || Y[a] - Y[b]);
  const mk = (a, b, c) => {
    if (orient(X[a], Y[a], X[b], Y[b], X[c], Y[c]) < 0) [b, c] = [c, b];
    const cc = circum(X[a], Y[a], X[b], Y[b], X[c], Y[c]);
    return { v: [a, b, c], cc };
  };
  let active = [mk(n, n + 1, n + 2)];
  const done = [];
  for (const i of order) {
    const px = X[i], py = Y[i];
    const edges = new Map();
    const keep = [];
    for (const t of active) {
      const cc = t.cc;
      if (!cc) continue; // degenerate (collinear) triangle: drop, its edges are rebuilt
      const dx = px - cc.x;
      if (dx > 0 && dx * dx > cc.r2) { done.push(t); continue; }
      const dy = py - cc.y;
      if (dx * dx + dy * dy <= cc.r2 * (1 + 1e-12)) {
        for (let k = 0; k < 3; k++) {
          const a = t.v[k], b = t.v[(k + 1) % 3];
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          if (edges.has(key)) edges.delete(key); else edges.set(key, [a, b]);
        }
      } else keep.push(t);
    }
    for (const [a, b] of edges.values()) {
      if (orient(X[a], Y[a], X[b], Y[b], px, py) === 0) continue; // collinear sliver
      keep.push(mk(a, b, i));
    }
    active = keep;
  }
  const all = done.concat(active);
  const inner = [];
  for (const t of all) {
    const [a, b, c] = t.v;
    if (a >= n || b >= n || c >= n) continue;
    if (orient(X[a], Y[a], X[b], Y[b], X[c], Y[c]) <= 0) continue;
    inner.push([a, b, c]);
  }
  closeHull(inner, X, Y);
  const tris = [];
  const m2 = maxEdge ? maxEdge * maxEdge : Infinity;
  for (const [a, b, c] of inner) {
    if (m2 !== Infinity) {
      const e = (u, w) => (X[u] - X[w]) ** 2 + (Y[u] - Y[w]) ** 2;
      if (e(a, b) > m2 || e(b, c) > m2 || e(c, a) > m2) continue;
    }
    tris.push([a, b, c]);
  }
  return { pts, tris, duplicates };
}

// A finite super-triangle can steal a thin triangle on the convex hull: a
// point just inside a hull edge ends up joined to a super vertex instead, and
// the sliver is lost with it. Walk the outer boundary (counter-clockwise) and
// fill every reflex corner with the missing triangle until the boundary is
// convex, which is exactly the convex hull. Each fill is a sliver between
// shots already on the boundary, so no point can lie inside it in practice.
function closeHull(tris, X, Y) {
  if (!tris.length) return;
  for (let guard = 0; guard < 4; guard++) {
    const count = new Map(); const dir = new Map();
    for (const [a, b, c] of tris) for (const [u, w] of [[a, b], [b, c], [c, a]]) {
      const k = u < w ? `${u},${w}` : `${w},${u}`;
      count.set(k, (count.get(k) || 0) + 1); dir.set(k, [u, w]);
    }
    const next = new Map();
    for (const [k, c] of count) if (c === 1) { const [u, w] = dir.get(k); next.set(u, w); }
    if (!next.size) return;
    let start = null;
    for (const u of next.keys()) if (start === null || X[u] < X[start] || (X[u] === X[start] && Y[u] < Y[start])) start = u;
    const ring = [start];
    for (let v = next.get(start); v !== undefined && v !== start && ring.length <= next.size; v = next.get(v)) ring.push(v);
    if (ring.length !== next.size) return; // more than one loop: leave it alone
    // Graham-style pass over the ring, starting from a hull vertex.
    const stack = [];
    let added = 0;
    for (const v of ring.concat([start])) {
      while (stack.length >= 2 && orient(X[stack[stack.length - 2]], Y[stack[stack.length - 2]], X[stack[stack.length - 1]], Y[stack[stack.length - 1]], X[v], Y[v]) < 0) {
        const b = stack.pop(); const a = stack[stack.length - 1];
        tris.push([a, v, b]); added++;
      }
      stack.push(v);
    }
    if (!added) return;
  }
}

/** Convex hull (monotone chain), counter-clockwise, of {x,y} points. */
export function convexHull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p.map(q => [q.x, q.y]);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = []; const upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1)).map(q => [q.x, q.y]);
}

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i]; const [x2, y2] = poly[(i + 1) % poly.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

/** Area centroid of a simple polygon. */
export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  const [ox, oy] = poly[0];
  for (let i = 0; i < poly.length; i++) {
    const x1 = poly[i][0] - ox, y1 = poly[i][1] - oy, x2 = poly[(i + 1) % poly.length][0] - ox, y2 = poly[(i + 1) % poly.length][1] - oy;
    const c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  return a === 0 ? [ox, oy] : [ox + cx / (3 * a), oy + cy / (3 * a)];
}

// ----------------------------------------------------------- the surfaces

/** A TIN surface: triangulation plus a spatial grid of triangles for lookups. */
export function makeSurface(points, opts = {}) {
  const t = triangulate(points, opts);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of t.pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const cells = Math.max(1, Math.ceil(Math.sqrt(t.tris.length / 2)));
  const cw = (maxX - minX) / cells || 1, ch = (maxY - minY) / cells || 1;
  const grid = Array.from({ length: cells * cells }, () => []);
  t.tris.forEach((tr, k) => {
    const xs = tr.map(i => t.pts[i].x), ys = tr.map(i => t.pts[i].y);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - minX) / cw)), i1 = Math.min(cells - 1, Math.floor((Math.max(...xs) - minX) / cw));
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - minY) / ch)), j1 = Math.min(cells - 1, Math.floor((Math.max(...ys) - minY) / ch));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[j * cells + i].push(k);
  });
  return { ...t, bbox: { minX, minY, maxX, maxY }, index: { cells, cw, ch, grid } };
}

function candidates(surface, x0, y0, x1, y1) {
  const { bbox, index: { cells, cw, ch, grid } } = surface;
  if (x1 < bbox.minX || x0 > bbox.maxX || y1 < bbox.minY || y0 > bbox.maxY) return [];
  const i0 = Math.max(0, Math.floor((x0 - bbox.minX) / cw)), i1 = Math.min(cells - 1, Math.floor((x1 - bbox.minX) / cw));
  const j0 = Math.max(0, Math.floor((y0 - bbox.minY) / ch)), j1 = Math.min(cells - 1, Math.floor((y1 - bbox.minY) / ch));
  const out = new Set();
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const k of grid[j * cells + i]) out.add(k);
  return [...out];
}

/** Plane through a triangle's three vertices: z = a + b*x + c*y (in coordinates relative to its first vertex). */
function planeOf(p0, p1, p2) {
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
  const det = ux * vy - uy * vx;
  const b = (uz * vy - uy * vz) / det;
  const c = (ux * vz - uz * vx) / det;
  return { x0: p0.x, y0: p0.y, z0: p0.z, b, c, at(x, y) { return this.z0 + this.b * (x - this.x0) + this.c * (y - this.y0); } };
}

/** Elevation of a surface at (x, y), or null outside it. */
export function elevationAt(surface, x, y) {
  for (const k of candidates(surface, x, y, x, y)) {
    const [a, b, c] = surface.tris[k].map(i => surface.pts[i]);
    const e = 1e-9 * (Math.abs(a.x) + Math.abs(a.y) + 1);
    if (orient(a.x, a.y, b.x, b.y, x, y) >= -e && orient(b.x, b.y, c.x, c.y, x, y) >= -e && orient(c.x, c.y, a.x, a.y, x, y) >= -e) return planeOf(a, b, c).at(x, y);
  }
  return null;
}

/**
 * A design plane: elevation `elevation` at (x0, y0), rising slopeX percent
 * toward the east and slopeY percent toward the north.
 */
export function designPlane({ elevation, x0 = 0, y0 = 0, slopeX = 0, slopeY = 0 }) {
  return { type: 'plane', elevation, x0, y0, slopeX, slopeY, at: (x, y) => elevation + (slopeX / 100) * (x - x0) + (slopeY / 100) * (y - y0) };
}

// ------------------------------------------------------------- clipping

// Sutherland-Hodgman clip of `poly` (vertices [x, y, ...]) by a convex,
// counter-clockwise `clip`. The subject may be any simple polygon: the
// output can then carry zero-width bridges, which add nothing to an area
// integral, so it is exact for what this module uses it for.
function clipConvex(poly, clip) {
  let out = poly;
  for (let i = 0; i < clip.length && out.length; i++) {
    const [ax, ay] = clip[i]; const [bx, by] = clip[(i + 1) % clip.length];
    const side = p => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
    const inp = out; out = [];
    for (let k = 0; k < inp.length; k++) {
      const P = inp[k], Q = inp[(k + 1) % inp.length];
      const sp = side(P), sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
  }
  return out;
}

// Integral over a polygon of a function linear on it, given by its values at
// the vertices: fan triangles, signed area times the mean of the three values.
// Exact for any simple polygon, convex or not.
function integrate(poly, vals) {
  let area = 0, vol = 0;
  for (let k = 1; k + 1 < poly.length; k++) {
    const a = (poly[k][0] - poly[0][0]) * (poly[k + 1][1] - poly[0][1]) - (poly[k + 1][0] - poly[0][0]) * (poly[k][1] - poly[0][1]);
    area += a / 2;
    vol += (a / 2) * (vals[0] + vals[k] + vals[k + 1]) / 3;
  }
  return { area, vol };
}

// Split a polygon with linear depth d (vertex values) at d = 0 and integrate
// each side. Returns fill (d > 0) and cut (d < 0) volumes and areas.
function splitIntegrate(poly, d) {
  const pos = [], posD = [], neg = [], negD = [];
  for (let k = 0; k < poly.length; k++) {
    const P = poly[k], Q = poly[(k + 1) % poly.length], dp = d[k], dq = d[(k + 1) % poly.length];
    if (dp >= 0) { pos.push(P); posD.push(dp); }
    if (dp <= 0) { neg.push(P); negD.push(dp); }
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const t = dp / (dp - dq);
      const X = [P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])];
      pos.push(X); posD.push(0); neg.push(X); negD.push(0);
    }
  }
  const f = integrate(pos, posD), c = integrate(neg, negD);
  return { fill: f.vol, fillArea: f.area, cut: -c.vol, cutArea: c.area };
}

// ------------------------------------------------------------- volumes

/**
 * Cut and fill between the existing surface and a design.
 * @param existing  makeSurface(...) of the existing-ground shots
 * @param design    designPlane(...) or makeSurface(...) of proposed grade
 * @param opts.boundary  optional polygon [[x, y], ...] limiting the area (any simple polygon)
 * @param opts.strip     topsoil strip depth: the existing surface is lowered by this much first
 * @returns volumes in cubic coordinate units (ft³ or m³), areas in square units,
 *          and per-triangle depth for maps.
 */
export function computeVolumes(existing, design, { boundary = null, strip = 0 } = {}) {
  let bnd = null;
  if (boundary && boundary.length >= 3) bnd = polygonArea(boundary) < 0 ? boundary.slice().reverse() : boundary.slice();
  let cut = 0, fill = 0, cutArea = 0, fillArea = 0, area = 0;
  let maxCut = 0, maxFill = 0;
  const cells = [];
  const isTin = design.type !== 'plane';
  for (const tri of existing.tris) {
    const [A, B, C] = tri.map(i => existing.pts[i]);
    const T = [[A.x, A.y], [B.x, B.y], [C.x, C.y]];
    const ex = planeOf(A, B, C);
    let pieces;
    if (bnd) { const P = clipConvex(bnd, T); pieces = P.length >= 3 ? [P] : []; } else pieces = [T];
    if (!pieces.length) continue;
    const region = pieces[0];
    if (isTin) {
      const xs = T.map(p => p[0]), ys = T.map(p => p[1]);
      const out = [];
      for (const k of candidates(design, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys))) {
        const [a, b, c] = design.tris[k].map(i => design.pts[i]);
        const Q = clipConvex(pieces[0], [[a.x, a.y], [b.x, b.y], [c.x, c.y]]);
        if (Q.length >= 3) out.push({ poly: Q, plane: planeOf(a, b, c) });
      }
      pieces = out;
    } else pieces = [{ poly: pieces[0], plane: design }];
    let tc = 0, tf = 0, ta = 0;
    for (const { poly, plane } of pieces) {
      const d = poly.map(([x, y]) => plane.at(x, y) - (ex.at(x, y) - strip));
      const r = splitIntegrate(poly, d);
      tc += r.cut; tf += r.fill; ta += r.cutArea + r.fillArea;
      cutArea += r.cutArea; fillArea += r.fillArea;
      for (const v of d) { if (-v > maxCut) maxCut = -v; if (v > maxFill) maxFill = v; }
    }
    if (ta <= 0) continue;
    cut += tc; fill += tf; area += ta;
    cells.push({ tri: T, poly: region, depth: (tf - tc) / ta, cut: tc, fill: tf, area: ta });
  }
  return { cut, fill, net: fill - cut, area, cutArea, fillArea, maxCut, maxFill, stripVolume: strip > 0 ? area * strip : 0, cells };
}

// ----------------------------------------------------------- earthwork sums

export const UNITS = {
  ft: { length: 'ft', area: 'sq ft', volume: 'cu yd', perVolume: 27, label: 'feet, volumes in cubic yards' },
  m: { length: 'm', area: 'm²', volume: 'm³', perVolume: 1, label: 'metres, volumes in cubic metres' },
};

/**
 * Turn bank cut and compacted fill into what moves on trucks.
 * shrink: percent a bank volume loses when placed and compacted as fill (bank to compacted).
 * swell: percent a bank volume gains when dug and loaded (bank to loose).
 * Volumes in and out are in the display unit (cu yd or m³).
 */
export function balanceSheet({ cut, fill, shrink = 0, swell = 0, truck = null }) {
  const keep = 1 - shrink / 100;
  const cutAsFill = cut * keep;
  const surplus = cutAsFill - fill; // compacted
  const out = { cut, fill, cutAsFill, shrink, swell };
  // Within half a unit (or 0.01% of the cut) is balanced: a bisected
  // balance elevation leaves a residual far below what a takeoff can resolve.
  if (Math.abs(surplus) <= Math.max(0.5, 1e-4 * Math.max(cut, fill))) {
    return { ...out, kind: 'balanced', bank: 0, compacted: 0, loose: 0, trucks: truck > 0 ? 0 : null };
  }
  if (surplus > 0) {
    out.kind = 'export';
    out.bank = keep > 0 ? cut - fill / keep : cut; // bank volume left over
  } else {
    out.kind = 'import';
    out.bank = keep > 0 ? -surplus / keep : Infinity; // bank borrow needed, same soil assumed
  }
  out.compacted = Math.abs(surplus);
  out.loose = out.bank * (1 + swell / 100);
  out.trucks = truck > 0 && Number.isFinite(out.loose) ? Math.ceil(out.loose / truck - 1e-9) : null;
  return out;
}

/**
 * The pad elevation (at the plane's own reference point, slopes held) that
 * balances the site: cut × (1 − shrink) = fill. Bisection: compacted surplus
 * falls monotonically as the pad rises.
 */
export function balanceElevation(existing, plane, { boundary = null, strip = 0, shrink = 0, tol = 1e-4 } = {}) {
  const keep = 1 - shrink / 100;
  const g = e => { const v = computeVolumes(existing, designPlane({ ...plane, elevation: e }), { boundary, strip }); return v.cut * keep - v.fill; };
  let zmin = Infinity, zmax = -Infinity;
  for (const p of existing.pts) { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); }
  const b = existing.bbox;
  const reach = (Math.abs(plane.slopeX || 0) / 100) * Math.max(Math.abs(b.minX - plane.x0), Math.abs(b.maxX - plane.x0))
    + (Math.abs(plane.slopeY || 0) / 100) * Math.max(Math.abs(b.minY - plane.y0), Math.abs(b.maxY - plane.y0));
  let lo = zmin - strip - reach - 1, hi = zmax + reach + 1;
  if (!(g(lo) >= 0 && g(hi) <= 0)) return null;
  for (let k = 0; k < 200 && hi - lo > tol; k++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Grid method (prismoidal columns at cell centres): a cross-check, not the main answer. */
export function gridVolumes(existing, design, spacing) {
  const b = existing.bbox; let cut = 0, fill = 0;
  for (let x = b.minX + spacing / 2; x < b.maxX; x += spacing) {
    for (let y = b.minY + spacing / 2; y < b.maxY; y += spacing) {
      const ze = elevationAt(existing, x, y); if (ze === null) continue;
      const zd = design.type === 'plane' ? design.at(x, y) : elevationAt(design, x, y); if (zd === null) continue;
      const d = (zd - ze) * spacing * spacing;
      if (d > 0) fill += d; else cut -= d;
    }
  }
  return { cut, fill };
}

// --------------------------------------------------------------- one call

/**
 * Everything the page and CLI need from raw inputs.
 * input: { existingText, format, designText?, pad?: {elevation, x0?, y0?, slopeX, slopeY},
 *          boundaryText?, units: 'ft'|'m', strip, shrink, swell, truck, maxEdge, balance }
 */
export function run(input) {
  const u = Object.hasOwn(UNITS, input.units) ? UNITS[input.units] : UNITS.ft;
  const warnings = [];
  const ex = parsePoints(input.existingText, { format: input.format || 'auto' });
  if (ex.errors.length) return { error: `Existing ground: ${ex.errors.join(' ')}` };
  warnings.push(...ex.warnings.slice(0, 5));
  if (ex.warnings.length > 5) warnings.push(`${ex.warnings.length - 5} more existing-ground lines skipped.`);
  const existing = makeSurface(ex.points, { maxEdge: input.maxEdge || null });
  if (!existing.tris.length) return { error: 'The existing-ground points are all on one line; no surface can be built.' };
  if (existing.duplicates.length) warnings.push(`${existing.duplicates.length} existing point(s) repeat an earlier position and were left out (${existing.duplicates.slice(0, 5).join(', ')}${existing.duplicates.length > 5 ? ', ...' : ''}).`);

  let boundary = null;
  if (input.boundaryText && input.boundaryText.trim()) {
    const b = parseBoundary(input.boundaryText);
    if (b.error) return { error: b.error };
    boundary = b.vertices; warnings.push(...b.warnings);
  }

  let design; let designInfo;
  if (input.designText && input.designText.trim()) {
    const pr = parsePoints(input.designText, { format: input.format || 'auto' });
    if (pr.errors.length) return { error: `Proposed grade: ${pr.errors.join(' ')}` };
    design = makeSurface(pr.points, { maxEdge: input.maxEdge || null });
    if (!design.tris.length) return { error: 'The proposed-grade points are all on one line; no surface can be built.' };
    designInfo = { type: 'tin', points: design.pts.length, triangles: design.tris.length };
  } else {
    const p = input.pad || {};
    if (!Number.isFinite(p.elevation) && !input.balance) return { error: 'Give a pad elevation, a proposed-grade point file, or ask for the balance elevation.' };
    const hull = convexHull(existing.pts);
    const ref = boundary || hull;
    const [cx, cy] = centroid(ref);
    const x0 = Number.isFinite(p.x0) ? p.x0 : cx, y0 = Number.isFinite(p.y0) ? p.y0 : cy;
    const plane = { elevation: Number.isFinite(p.elevation) ? p.elevation : 0, x0, y0, slopeX: p.slopeX || 0, slopeY: p.slopeY || 0 };
    let bal = null;
    if (input.balance) {
      bal = balanceElevation(existing, plane, { boundary, strip: input.strip || 0, shrink: input.shrink || 0 });
      if (bal === null) return { error: 'No pad elevation balances this site within the surveyed range.' };
      plane.elevation = bal;
    }
    design = designPlane(plane);
    designInfo = { type: 'plane', ...plane, balanced: bal !== null };
  }

  const v = computeVolumes(existing, design, { boundary, strip: input.strip || 0 });
  if (v.area <= 0) return { error: 'The boundary does not overlap the surveyed area (or the two surfaces do not overlap).' };
  const hullArea = polygonArea(convexHull(existing.pts));
  if (boundary) {
    const ba = Math.abs(polygonArea(boundary));
    if (v.area < ba * 0.995) warnings.push(`Only ${(100 * v.area / ba).toFixed(1)}% of the boundary is covered by survey${design.type === 'plane' ? '' : ' and proposed grade'}; volumes count only the covered part.`);
  }
  if (input.maxEdge && existing.tris.length) {
    // nothing to add: the dropped triangles simply are not in `area`
  }
  const k = u.perVolume;
  const sheet = balanceSheet({ cut: v.cut / k, fill: v.fill / k, shrink: input.shrink || 0, swell: input.swell || 0, truck: input.truck || null });
  return {
    units: u,
    existing: { points: existing.pts.length, triangles: existing.tris.length, format: ex.format, hullArea, zmin: Math.min(...existing.pts.map(p => p.z)), zmax: Math.max(...existing.pts.map(p => p.z)) },
    design: designInfo,
    boundary,
    volumes: { cut: v.cut / k, fill: v.fill / k, net: v.net / k, strip: v.stripVolume / k, area: v.area, cutArea: v.cutArea, fillArea: v.fillArea, maxCut: v.maxCut, maxFill: v.maxFill },
    sheet,
    cells: v.cells,
    surface: existing,
    warnings,
  };
}

/** Summary CSV for a run() result. */
export function toCsv(r) {
  const u = r.units; const v = r.volumes; const s = r.sheet;
  const f = x => (Number.isFinite(x) ? Number(x.toFixed(3)) : '');
  const rows = [
    ['item', 'value', 'unit'],
    ['existing points', r.existing.points, ''],
    ['triangles', r.existing.triangles, ''],
    ['design', r.design.type === 'plane' ? `pad ${f(r.design.elevation)} ${u.length} at (${f(r.design.x0)}, ${f(r.design.y0)}), slope E ${r.design.slopeX}% N ${r.design.slopeY}%` : `proposed TIN, ${r.design.points} points`, ''],
    ['area', f(v.area), u.area],
    ['cut (bank)', f(v.cut), u.volume],
    ['fill (compacted)', f(v.fill), u.volume],
    ['topsoil strip', f(v.strip), u.volume],
    ['shrink', s.shrink, '%'],
    ['swell', s.swell, '%'],
    [s.kind === 'import' ? 'import (bank)' : 'export (bank)', f(s.bank), u.volume],
    [s.kind === 'import' ? 'import (loose)' : 'export (loose)', f(s.loose), u.volume],
    ['truckloads', s.trucks ?? '', ''],
    ['max cut depth', f(v.maxCut), u.length],
    ['max fill depth', f(v.maxFill), u.length],
  ];
  return rows.map(r => r.map(c => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
}

// ----------------------------------------------------------------- example

/**
 * A made-up hillside lot, 200 ft by 150 ft, shot on a rough 15-ft grid with a
 * little jitter, in PNEZD order with made-up state-plane-sized coordinates.
 * No real survey produced it.
 */
export function exampleCsv() {
  const lines = ['Point,Northing,Easting,Elevation,Description'];
  let id = 1;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const E0 = 612400, N0 = 2087150;
  for (let i = 0; i <= 13; i++) {
    for (let j = 0; j <= 10; j++) {
      const x = Math.min(200, i * 15.4 + (i && i < 13 ? (rnd() - 0.5) * 3 : 0));
      const y = Math.min(150, j * 15 + (j && j < 10 ? (rnd() - 0.5) * 3 : 0));
      const z = 100 + 0.06 * x + 0.035 * y + 2.2 * Math.exp(-(((x - 140) / 45) ** 2 + ((y - 95) / 35) ** 2)) - 1.1 * Math.exp(-(((x - 55) / 30) ** 2 + ((y - 40) / 25) ** 2));
      lines.push(`${id++},${(N0 + y).toFixed(2)},${(E0 + x).toFixed(2)},${z.toFixed(2)},${i === 0 || i === 13 || j === 0 || j === 10 ? 'EG-EDGE' : 'EG'}`);
    }
  }
  return lines.join('\n') + '\n';
}

export const EXAMPLE_BOUNDARY = '612420, 2087170\n612580, 2087170\n612580, 2087280\n612500, 2087280\n612500, 2087230\n612420, 2087230\n';
