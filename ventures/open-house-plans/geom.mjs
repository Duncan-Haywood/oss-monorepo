// @ts-check
// Small orthogonal-geometry helpers. Plans are in feet on a 0.5 ft grid
// (6 in): x runs along the street front, y from the front wall to the back.

export const EPS = 1e-6;
export const q = (v) => Math.round(v * 2) / 2; // snap to the 6 in grid
export const r2 = (v) => Math.round(v * 100) / 100;

export function rect(x0, y0, x1, y1) {
  return [[Math.min(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.min(y0, y1)], [Math.max(x0, x1), Math.max(y0, y1)], [Math.min(x0, x1), Math.max(y0, y1)]];
}

export function bbox(poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const c = x1 * y2 - x2 * y1;
    a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  if (Math.abs(a) < EPS) { const b = bbox(poly); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Counter-clockwise (in y-up maths terms) and without repeated or collinear points. */
export function clean(poly) {
  const pts = [];
  for (const p of poly) {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > EPS || Math.abs(last[1] - p[1]) > EPS) pts.push([p[0], p[1]]);
  }
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS) pts.pop(); }
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      if ((Math.abs(a[0] - b[0]) < EPS && Math.abs(b[0] - c[0]) < EPS) || (Math.abs(a[1] - b[1]) < EPS && Math.abs(b[1] - c[1]) < EPS)) {
        pts.splice(i, 1); changed = true; break;
      }
    }
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
  return s < 0 ? pts.reverse() : pts;
}

/**
 * A rectangle with one corner rectangle removed (an L-shaped room around a
 * closet). cut must share exactly one corner with r. Both are {x0,y0,x1,y1}.
 */
export function cutCorner(r, c) {
  const left = Math.abs(c.x0 - r.x0) < EPS, bottom = Math.abs(c.y0 - r.y0) < EPS;
  let pts;
  if (left && bottom) pts = [[c.x1, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [r.x0, c.y1], [c.x1, c.y1]];
  else if (!left && bottom) pts = [[r.x0, r.y0], [c.x0, r.y0], [c.x0, c.y1], [r.x1, c.y1], [r.x1, r.y1], [r.x0, r.y1]];
  else if (!left && !bottom) pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, c.y0], [c.x0, c.y0], [c.x0, r.y1], [r.x0, r.y1]];
  else pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [c.x1, r.y1], [c.x1, c.y0], [r.x0, c.y0]];
  return clean(pts);
}

/** Axis-aligned edges of a polygon as {x0,y0,x1,y1,dir:'h'|'v'}. */
export function edges(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    if (Math.abs(ay - by) < EPS) out.push({ dir: "h", c: ay, a: Math.min(ax, bx), b: Math.max(ax, bx) });
    else if (Math.abs(ax - bx) < EPS) out.push({ dir: "v", c: ax, a: Math.min(ay, by), b: Math.max(ay, by) });
    else throw new Error("non-orthogonal edge");
  }
  return out;
}

/** Overlap of two collinear edges, or null. */
export function overlap(e, f) {
  if (e.dir !== f.dir || Math.abs(e.c - f.c) > EPS) return null;
  const a = Math.max(e.a, f.a), b = Math.min(e.b, f.b);
  return b - a > EPS ? { dir: e.dir, c: e.c, a, b } : null;
}

/** Point-in-polygon (ray casting); points on the boundary count as inside. */
export function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function ftIn(ft) {
  const neg = ft < 0;
  let inches = Math.round(Math.abs(ft) * 12);
  const f = Math.floor(inches / 12);
  inches -= f * 12;
  return `${neg ? "-" : ""}${f}'-${inches}"`;
}
