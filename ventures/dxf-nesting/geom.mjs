// Geometry for the nester: edges (lines and circular arcs), affine transforms,
// flattening with a stated chord tolerance, chaining loose edges into closed
// outlines, and grouping outlines into parts (an outer boundary plus its holes).
//
// An edge is either
//   { t: "L", x1, y1, x2, y2 }                 a straight segment, or
//   { t: "A", cx, cy, r, a0, sw }              a circular arc from angle a0 (radians)
//                                              sweeping sw (signed; > 0 is counter-clockwise).
// A full circle is an arc with |sw| = 2*pi.

const TAU = Math.PI * 2;

export function start(e) {
  return e.t === "L" ? [e.x1, e.y1] : [e.cx + e.r * Math.cos(e.a0), e.cy + e.r * Math.sin(e.a0)];
}
export function end(e) {
  return e.t === "L" ? [e.x2, e.y2] : [e.cx + e.r * Math.cos(e.a0 + e.sw), e.cy + e.r * Math.sin(e.a0 + e.sw)];
}
export function reverse(e) {
  return e.t === "L" ? { t: "L", x1: e.x2, y1: e.y2, x2: e.x1, y2: e.y1 } : { ...e, a0: e.a0 + e.sw, sw: -e.sw };
}
export function edgeLength(e) {
  return e.t === "L" ? Math.hypot(e.x2 - e.x1, e.y2 - e.y1) : e.r * Math.abs(e.sw);
}

/** Number of chords that keep an arc of radius r within `tol` of its chords (the sagitta). */
export function arcSteps(r, sw, tol) {
  const a = Math.abs(sw);
  if (a === 0) return 1;
  const half = tol >= r ? Math.PI / 4 : Math.acos(1 - tol / r);
  return Math.max(1, Math.ceil(a / (2 * half)), Math.abs(a - TAU) < 1e-12 ? 8 : 1);
}

/** Points along an edge, start included, end excluded. */
export function flattenEdge(e, tol) {
  if (e.t === "L") return [[e.x1, e.y1]];
  const n = arcSteps(e.r, e.sw, tol), out = [];
  for (let i = 0; i < n; i++) {
    const a = e.a0 + (e.sw * i) / n;
    out.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]);
  }
  return out;
}

/** A closed loop of edges as a polygon ring (no repeated closing point). */
export function flattenLoop(edges, tol) {
  const ring = [];
  for (const e of edges) for (const p of flattenEdge(e, tol)) ring.push(p);
  return ring;
}

/** An open chain as a polyline (both ends included). */
export function flattenChain(edges, tol) {
  const pts = flattenLoop(edges, tol);
  if (edges.length) pts.push(end(edges[edges.length - 1]));
  return pts;
}

export function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2;
}

/**
 * Exact signed area of a closed loop of lines and arcs: the shoelace sum over
 * the chords plus each arc's circular segment (r^2/2 * (sw - sin sw)).
 */
export function loopArea(edges) {
  let s = 0;
  for (const e of edges) {
    const [x1, y1] = start(e), [x2, y2] = end(e);
    s += (x1 * y2 - x2 * y1) / 2;
    if (e.t === "A") s += (e.r * e.r * (e.sw - Math.sin(e.sw))) / 2;
  }
  return s;
}

export function pointInRing(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function bboxOf(rings) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return { minX: a, minY: b, maxX: c, maxY: d };
}

// ---- affine transforms --------------------------------------------------------
// m = [a, b, c, d, tx, ty] maps (x, y) to (a x + c y + tx, b x + d y + ty).

export const IDENTITY = [1, 0, 0, 1, 0, 0];
export function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function compose(m, n) {
  // m after n
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export function rotation(deg, tx = 0, ty = 0) {
  const t = (deg * Math.PI) / 180;
  let c = Math.cos(t), s = Math.sin(t);
  // exact quarter turns, so a part turned 90 degrees keeps exact coordinates
  if (Math.abs(c) < 1e-15) c = 0;
  if (Math.abs(s) < 1e-15) s = 0;
  return [c, s, -s, c, tx, ty];
}

/**
 * Transform an edge. Arcs stay arcs under rotation, uniform scale and
 * reflection; any other map (unequal INSERT scales) turns them into chords at
 * `tol`, returned as several line edges.
 */
export function transformEdge(e, m, tol = 0.01) {
  if (e.t === "L") {
    const [x1, y1] = apply(m, e.x1, e.y1), [x2, y2] = apply(m, e.x2, e.y2);
    return [{ t: "L", x1, y1, x2, y2 }];
  }
  const [a, b, c, d] = m;
  const det = a * d - b * c, s1 = Math.hypot(a, b), s2 = Math.hypot(c, d);
  const similar = Math.abs(s1 - s2) <= 1e-9 * Math.max(s1, s2) && Math.abs(a * c + b * d) <= 1e-9 * s1 * s2;
  if (!similar) {
    const pts = flattenEdge(e, tol / Math.max(s1, s2, 1e-12));
    pts.push(end(e));
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = apply(m, ...pts[i]), [x2, y2] = apply(m, ...pts[i + 1]);
      out.push({ t: "L", x1, y1, x2, y2 });
    }
    return out;
  }
  const [cx, cy] = apply(m, e.cx, e.cy);
  const phi = Math.atan2(b, a); // where the x axis goes
  if (det > 0) return [{ t: "A", cx, cy, r: e.r * s1, a0: e.a0 + phi, sw: e.sw }];
  // reflection: the image of angle th is phi - th
  return [{ t: "A", cx, cy, r: e.r * s1, a0: phi - e.a0, sw: -e.sw }];
}

export function transformEdges(edges, m, tol) {
  const out = [];
  for (const e of edges) for (const f of transformEdge(e, m, tol)) out.push(f);
  return out;
}

// ---- chaining and parts -------------------------------------------------------

/**
 * Join loose edges end to end into closed loops and open chains. Ends closer
 * than `joinTol` are the same point. Where three or more edges meet, the walk
 * takes the first unused one, so a drawing with branching lines may chain
 * differently from how it was drawn; the open chains are reported.
 */
export function chain(edges, joinTol) {
  const key = (p) => Math.round(p[0] / joinTol) + "," + Math.round(p[1] / joinTol);
  const near = (p) => {
    const kx = Math.round(p[0] / joinTol), ky = Math.round(p[1] / joinTol), out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(kx + dx + "," + (ky + dy));
    return out;
  };
  const used = new Uint8Array(edges.length);
  const ends = new Map(); // key -> [{i, which}]
  const add = (p, i, which) => {
    const k = key(p);
    if (!ends.has(k)) ends.set(k, []);
    ends.get(k).push({ i, which });
  };
  const loops = [], chains = [];
  edges.forEach((e, i) => {
    if (e.t === "A" && Math.abs(Math.abs(e.sw) - TAU) < 1e-9) {
      used[i] = 1;
      loops.push([e]);
      return;
    }
    if (edgeLength(e) <= joinTol) {
      used[i] = 1; // a zero-length edge carries nothing
      return;
    }
    add(start(e), i, 0);
    add(end(e), i, 1);
  });
  const same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= joinTol;
  const take = (p) => {
    for (const k of near(p)) for (const { i, which } of ends.get(k) || []) {
      if (used[i]) continue;
      const e = edges[i];
      const q = which === 0 ? start(e) : end(e);
      if (!same(p, q)) continue;
      used[i] = 1;
      return which === 0 ? e : reverse(e);
    }
    return null;
  };
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const run = [edges[i]];
    const first = start(edges[i]);
    let closed = false;
    for (;;) {
      const tip = end(run[run.length - 1]);
      if (run.length > 1 && same(tip, first)) { closed = true; break; }
      const nx = take(tip);
      if (!nx) break;
      run.push(nx);
    }
    if (!closed) {
      // walk back from the start too
      for (;;) {
        const nx = take(start(run[0]));
        if (!nx) break;
        run.unshift(reverse(nx));
        if (same(start(run[0]), end(run[run.length - 1]))) { closed = true; break; }
      }
    }
    if (closed || (run.length === 1 && run[0].t === "A" && same(start(run[0]), end(run[0])))) {
      snapClose(run);
      loops.push(run);
    } else chains.push(run);
  }
  return { loops, chains };
}

// make the last edge end exactly where the first starts
function snapClose(run) {
  const last = run[run.length - 1];
  if (last.t !== "L") return;
  const [x, y] = start(run[0]);
  last.x2 = x;
  last.y2 = y;
}

/**
 * Group closed loops into parts. A loop at even depth (not inside anything,
 * or inside a hole) is a part's outer boundary; a loop at odd depth is a hole
 * of the loop that directly contains it. Open chains (engraving, score lines)
 * ride with the part whose outline contains their first point. Each part is
 * re-based so its outline's lower-left bbox corner is the origin.
 */
export function partsFromLoops(loops, chains, tol, joinTol) {
  const info = loops.map((edges) => {
    const ring = flattenLoop(edges, tol);
    return { edges, ring, area: Math.abs(loopArea(edges)), parent: -1, depth: 0, bbox: bboxOf([ring]) };
  });
  const order = info.map((_, i) => i).sort((a, b) => info[a].area - info[b].area);
  const probe = (r) => {
    // the midpoint of the first edge, nudged off the outline would be ideal;
    // a vertex is on the loop, so use the centroid-ward midpoint of edge 0's chord
    const [x0, y0] = r[0], [x1, y1] = r[1 % r.length];
    return [(x0 + x1) / 2, (y0 + y1) / 2];
  };
  for (const i of order) {
    const [px, py] = probe(info[i].ring);
    let best = -1;
    for (const j of order) {
      if (j === i || info[j].area <= info[i].area) continue;
      const B = info[j].bbox, A = info[i].bbox;
      if (A.minX < B.minX - joinTol || A.maxX > B.maxX + joinTol || A.minY < B.minY - joinTol || A.maxY > B.maxY + joinTol) continue;
      if (pointInRing(px, py, info[j].ring)) { best = j; break; } // smallest containing loop first (order is by area)
    }
    info[i].parent = best;
  }
  const depth = (i) => (info[i].parent < 0 ? 0 : 1 + depth(info[i].parent));
  info.forEach((x, i) => (x.depth = depth(i)));
  const parts = [];
  const byOuter = new Map();
  info.forEach((x, i) => {
    if (x.depth % 2 === 0) {
      byOuter.set(i, parts.length);
      parts.push({ outer: x.edges, holes: [], marks: [] });
    }
  });
  info.forEach((x) => {
    if (x.depth % 2 === 1) parts[byOuter.get(x.parent)].holes.push(x.edges);
  });
  let strayChains = 0;
  for (const c of chains) {
    const [px, py] = start(c[0]);
    let home = -1, homeArea = Infinity;
    info.forEach((x, i) => {
      if (x.depth % 2 === 0 && x.area < homeArea && pointInRing(px, py, x.ring)) { home = i; homeArea = x.area; }
    });
    if (home < 0) strayChains++;
    else parts[byOuter.get(home)].marks.push(c);
  }
  return { parts: parts.map((p) => finishPart(p, tol)), strayChains };
}

/** Area, cut length, pierce count and bbox of a part; shifted so its bbox starts at the origin. */
export function finishPart(p, tol) {
  const ring = flattenLoop(p.outer, tol);
  const bb = bboxOf([ring]);
  const m = [1, 0, 0, 1, -bb.minX, -bb.minY];
  const outer = transformEdges(p.outer, m, tol);
  const holes = p.holes.map((h) => transformEdges(h, m, tol));
  const marks = p.marks.map((h) => transformEdges(h, m, tol));
  const len = (es) => es.reduce((s, e) => s + edgeLength(e), 0);
  const area = Math.abs(loopArea(outer)) - holes.reduce((s, h) => s + Math.abs(loopArea(h)), 0);
  return {
    outer,
    holes,
    marks,
    area,
    cutLength: len(outer) + holes.reduce((s, h) => s + len(h), 0),
    markLength: marks.reduce((s, h) => s + len(h), 0),
    pierces: 1 + holes.length,
    width: bb.maxX - bb.minX,
    height: bb.maxY - bb.minY,
  };
}

/** The flattened rings of a part (outer first), for rasterising and checking. */
export function partRings(part, tol) {
  return [flattenLoop(part.outer, tol), ...part.holes.map((h) => flattenLoop(h, tol))];
}

// ---- shapes for examples and tests -------------------------------------------

export function rectEdges(x, y, w, h) {
  const p = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return p.map((a, i) => {
    const b = p[(i + 1) % 4];
    return { t: "L", x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  });
}
export function circleEdge(cx, cy, r, ccw = true) {
  return { t: "A", cx, cy, r, a0: 0, sw: ccw ? TAU : -TAU };
}
export function polyEdges(pts) {
  return pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return { t: "L", x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
  });
}
