// Order-picking routes in a single-block warehouse: parallel aisles joined by a
// front cross aisle (where the dock or pack station is) and, optionally, a back
// cross aisle.
//
// `optimalRoute` is exact. It is the dynamic programme of Ratliff and
// Rosenthal (Operations Research 31(3), 1983): walk the aisles left to right
// and keep, for the two frontier corners (front and back of the current
// aisle), only their degree parity and whether they are in the same piece of
// the partial tour. Every optimal tour uses one of a handful of patterns inside
// each aisle (pass through once, pass through twice, or go in from the front
// and/or the back and turn round, leaving one gap unwalked) and 0, 1 or 2
// copies of each cross-aisle segment, so the search is linear in the number of
// aisles. The tests check it against Held-Karp on every small random case.
//
// `sShapeRoute`, `largestGapRoute` and `returnRoute` are the textbook rules of
// thumb that most pickers follow; they are here to say what the exact route
// saves over them.

const ODD = 1;
const EVEN = 2; // even and positive; 0 means "no edges yet"

const parity = (d, k) => {
  if (k === 0) return d;
  const odd = ((d === ODD ? 1 : 0) + k) % 2 === 1;
  return odd ? ODD : EVEN;
};

/**
 * Build the column list the DP walks. Picks are {x, y}; aisles are x positions.
 * The depot is a point on the front cross aisle at depotX; it becomes its own
 * zero-width column that can only be reached from the front.
 */
function columnsFor(points, layout) {
  const { aisleXs, aisleLength: L, depotX } = layout;
  const byX = new Map();
  for (const p of points) {
    if (!byX.has(p.x)) byX.set(p.x, new Set());
    byX.get(p.x).add(p.y);
  }
  const lo = Math.min(depotX, ...points.map((p) => p.x));
  const hi = Math.max(depotX, ...points.map((p) => p.x));
  const cols = [];
  for (const x of aisleXs) {
    if (x < lo - 1e-9 || x > hi + 1e-9) continue; // never worth crossing outside the span
    const ys = [...(byX.get(x) || [])].sort((a, b) => a - b);
    cols.push({ x, L, picks: ys, depot: false });
  }
  cols.push({ x: depotX, L: 0, picks: [0], depot: true });
  cols.sort((a, b) => a.x - b.x || (a.depot ? -1 : 1));
  return cols;
}

/** The in-aisle patterns of an optimal tour. */
function verticalOptions(col, backAisle) {
  const { picks: P, L } = col;
  const m = P.length;
  const opts = [];
  if (col.depot) {
    opts.push({ kind: "lower", k: m, cost: 0, addA: 2, addB: 0, join: false });
    return opts;
  }
  if (backAisle) {
    opts.push({ kind: "through", cost: L, addA: 1, addB: 1, join: true });
    opts.push({ kind: "through2", cost: 2 * L, addA: 2, addB: 2, join: true });
  }
  for (let k = 0; k <= m; k++) {
    const lower = k >= 1 ? 2 * P[k - 1] : 0;
    const hasUpper = k < m;
    if (hasUpper && !backAisle) continue;
    const upper = hasUpper ? 2 * (L - P[k]) : 0;
    opts.push({
      kind: m === 0 ? "none" : "gap",
      k,
      cost: lower + upper,
      addA: k >= 1 ? 2 : 0,
      addB: hasUpper ? 2 : 0,
      join: false,
    });
  }
  return opts;
}

const key = (s) => `${s.da}${s.db}${s.la}${s.lb}${s.closed ? 1 : 0}`;

function normalise(s) {
  // Relabel so the first label seen is 1: states that differ only in label
  // names are the same state.
  const map = new Map();
  const lab = (l) => {
    if (!l) return 0;
    if (!map.has(l)) map.set(l, map.size + 1);
    return map.get(l);
  };
  return { ...s, la: lab(s.la), lb: lab(s.lb) };
}

function applyVertical(s, opt) {
  let { da, db, la, lb } = s;
  if (s.closed) return opt.cost === 0 && opt.addA === 0 && opt.addB === 0 ? { ...s } : null;
  let fresh = 3;
  if (opt.addA > 0 && la === 0) la = fresh++;
  if (opt.addB > 0 && lb === 0) lb = fresh++;
  da = parity(da, opt.addA);
  db = parity(db, opt.addB);
  if (opt.join) lb = la; // the aisle walk joins its two corners' pieces
  return { da, db, la, lb, closed: false };
}

function applyHorizontal(s, f, g) {
  // f, g: copies of the front and back segment to the next column (0, 1 or 2).
  const fa = parity(s.da, f);
  const fb = parity(s.db, g);
  if (fa === ODD || fb === ODD) return null; // a corner left with odd degree
  if (s.closed) return f === 0 && g === 0 ? { da: 0, db: 0, la: 0, lb: 0, closed: true } : null;
  let la = s.la;
  let lb = s.lb;
  let fresh = 5;
  if (f > 0 && la === 0) la = fresh++;
  if (g > 0 && lb === 0) lb = fresh++;
  const carried = new Set();
  if (f > 0) carried.add(la);
  if (g > 0) carried.add(lb);
  const present = new Set([s.la, s.lb].filter(Boolean));
  const abandoned = [...present].filter((l) => !carried.has(l));
  if (abandoned.length) {
    // A piece that stops here must be the whole tour.
    if (carried.size > 0 || present.size > 1) return null;
    return { da: 0, db: 0, la: 0, lb: 0, closed: true };
  }
  return { da: parity(0, f), db: parity(0, g), la: f > 0 ? la : 0, lb: g > 0 ? lb : 0, closed: false };
}

/**
 * Shortest closed walk from the depot through every point.
 * points: [{x, y}] with 0 <= y <= aisleLength and x one of layout.aisleXs.
 * layout: {aisleXs: number[], aisleLength, depotX, backAisle}
 * Returns {length, path: [{x,y}], order: indices into points in visit order}.
 */
export function optimalRoute(points, layout) {
  const backAisle = layout.backAisle !== false;
  if (!points.length) return { length: 0, path: [{ x: layout.depotX, y: 0 }], order: [] };
  const cols = columnsFor(points, layout);
  let layer = new Map([[key({ da: 0, db: 0, la: 0, lb: 0, closed: false }), { s: { da: 0, db: 0, la: 0, lb: 0, closed: false }, cost: 0, back: null }]]);
  const trail = [];
  for (let j = 0; j < cols.length; j++) {
    const col = cols[j];
    const opts = verticalOptions(col, backAisle);
    const last = j === cols.length - 1;
    const dx = last ? 0 : cols[j + 1].x - col.x;
    const next = new Map();
    for (const [, entry] of layer) {
      for (const opt of opts) {
        if (entry.s.closed && col.picks.length) continue;
        const v = applyVertical(entry.s, opt);
        if (!v) continue;
        const hs = last ? [[0, 0]] : backAisle ? [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] : [[0, 0], [1, 0], [2, 0]];
        for (const [f, g] of hs) {
          const h = applyHorizontal(v, f, g);
          if (!h) continue;
          const ns = normalise(h);
          const cost = entry.cost + opt.cost + (f + g) * dx;
          const k = key(ns);
          const prev = next.get(k);
          if (!prev || cost < prev.cost - 1e-9) next.set(k, { s: ns, cost, back: { entry, opt, f, g } });
        }
      }
    }
    trail.push(next);
    layer = next;
  }
  let best = null;
  for (const [, e] of layer) if (e.s.closed && (!best || e.cost < best.cost)) best = e;
  if (!best) throw new Error("no closed tour found");
  // Recover the chosen pattern in each column.
  const chosen = [];
  for (let e = best, j = cols.length - 1; e && e.back; e = e.back.entry, j--) chosen[j] = e.back;
  const path = eulerWalk(cols, chosen, layout.aisleLength);
  const order = visitOrder(points, path);
  return { length: best.cost, path, order };
}

/** Turn the chosen multigraph into one walk from the depot (Hierholzer). */
function eulerWalk(cols, chosen, L) {
  const nodes = new Map();
  const id = (x, y) => {
    const k = `${x}|${y}`;
    if (!nodes.has(k)) nodes.set(k, { x, y, adj: [] });
    return k;
  };
  const edges = [];
  const add = (a, b, times) => {
    for (let t = 0; t < times; t++) {
      const e = { a, b, used: false };
      edges.push(e);
      nodes.get(a).adj.push(e);
      nodes.get(b).adj.push(e);
    }
  };
  const chain = (x, ys, times) => {
    for (let i = 0; i + 1 < ys.length; i++) add(id(x, ys[i]), id(x, ys[i + 1]), times);
    if (ys.length === 1) id(x, ys[0]);
  };
  cols.forEach((col, j) => {
    const { opt, f, g } = chosen[j];
    const x = col.x;
    const Lc = col.depot ? 0 : L;
    if (opt.kind === "through" || opt.kind === "through2") {
      chain(x, [0, ...col.picks.filter((y) => y > 0 && y < Lc), Lc], opt.kind === "through" ? 1 : 2);
    } else if (opt.kind === "gap") {
      const lower = col.picks.slice(0, opt.k);
      const upper = col.picks.slice(opt.k);
      if (lower.length) chain(x, [0, ...lower.filter((y) => y > 0)], 2);
      if (upper.length) chain(x, [...upper.filter((y) => y < Lc), Lc].reverse(), 2);
    } else if (opt.kind === "lower") {
      id(x, 0);
    }
    if (j + 1 < cols.length) {
      const nx = cols[j + 1].x;
      if (f) add(id(x, 0), id(nx, 0), f);
      if (g) add(id(x, L), id(nx, L), g);
    }
  });
  const start = id(cols.find((c) => c.depot).x, 0);
  // Iterative Hierholzer.
  const stack = [start];
  const out = [];
  while (stack.length) {
    const v = stack[stack.length - 1];
    const e = nodes.get(v).adj.find((ed) => !ed.used);
    if (e) {
      e.used = true;
      stack.push(e.a === v ? e.b : e.a);
    } else {
      out.push(stack.pop());
    }
  }
  if (edges.some((e) => !e.used)) throw new Error("route is not connected");
  const pts = out.reverse().map((k) => ({ x: nodes.get(k).x, y: nodes.get(k).y }));
  // Drop zero-length repeats.
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

/** First time the walk reaches each point, as indices into points. */
function visitOrder(points, path) {
  const seen = new Set();
  const order = [];
  const at = new Map();
  points.forEach((p, i) => {
    const k = `${p.x}|${p.y}`;
    if (!at.has(k)) at.set(k, []);
    at.get(k).push(i);
  });
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[i + 1] || a;
    // Points on the segment a-b (segments are vertical inside an aisle or
    // along a cross aisle), in walking order.
    const hits = [];
    for (const [k, idxs] of at) {
      if (seen.has(k)) continue;
      const p = points[idxs[0]];
      const onV = a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
      const onH = a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9;
      if (onV || onH) hits.push([Math.abs(p.x - a.x) + Math.abs(p.y - a.y), k, idxs]);
    }
    hits.sort((u, v) => u[0] - v[0]);
    for (const [, k, idxs] of hits) {
      seen.add(k);
      order.push(...idxs);
    }
  }
  return order;
}

export function pathLength(path) {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  return s;
}

function aisleGroups(points) {
  const m = new Map();
  for (const p of points) {
    if (!m.has(p.x)) m.set(p.x, []);
    m.get(p.x).push(p.y);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([x, ys]) => ({ x, ys: [...new Set(ys)].sort((a, b) => a - b) }));
}

function finish(path, points) {
  return { length: pathLength(path), path, order: visitOrder(points, path) };
}

/** Into every aisle with a pick from the front, as far as its deepest pick, and back. */
export function returnRoute(points, layout) {
  const path = [{ x: layout.depotX, y: 0 }];
  for (const g of aisleGroups(points)) {
    const top = g.ys[g.ys.length - 1];
    path.push({ x: g.x, y: 0 }, { x: g.x, y: top }, { x: g.x, y: 0 });
  }
  path.push({ x: layout.depotX, y: 0 });
  return finish(path, points);
}

/**
 * S-shape (traversal): walk the whole length of every aisle with a pick,
 * alternating direction; with an odd count, the last aisle is entered from the
 * front and left the same way.
 */
export function sShapeRoute(points, layout) {
  if (layout.backAisle === false) return null;
  const L = layout.aisleLength;
  const groups = aisleGroups(points);
  const path = [{ x: layout.depotX, y: 0 }];
  let atFront = true;
  groups.forEach((g, i) => {
    const lastOdd = i === groups.length - 1 && groups.length % 2 === 1;
    path.push({ x: g.x, y: atFront ? 0 : L });
    if (lastOdd) {
      const top = g.ys[g.ys.length - 1];
      path.push({ x: g.x, y: top }, { x: g.x, y: 0 });
    } else {
      atFront = !atFront;
      path.push({ x: g.x, y: atFront ? 0 : L });
    }
  });
  if (!atFront) path.push({ x: path[path.length - 1].x, y: 0 }); // cannot happen; kept for safety
  path.push({ x: layout.depotX, y: 0 });
  return finish(path, points);
}

/**
 * Largest gap: walk the first and last aisle with picks end to end; serve
 * every aisle between from the back on the way out and from the front on the
 * way home, never walking its largest empty stretch.
 */
export function largestGapRoute(points, layout) {
  if (layout.backAisle === false) return null;
  const L = layout.aisleLength;
  const groups = aisleGroups(points);
  if (groups.length < 2) return returnRoute(points, layout);
  const split = (ys) => {
    const pts = [0, ...ys, L];
    let best = -1;
    let at = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      if (pts[i + 1] - pts[i] > best) {
        best = pts[i + 1] - pts[i];
        at = i; // gap between pts[i] and pts[i+1]
      }
    }
    return { lowTop: pts[at], highBottom: pts[at + 1] };
  };
  const first = groups[0];
  const last = groups[groups.length - 1];
  const mid = groups.slice(1, -1).map((g) => ({ ...g, ...split(g.ys) }));
  const path = [{ x: layout.depotX, y: 0 }, { x: first.x, y: 0 }, { x: first.x, y: L }];
  for (const g of mid) {
    path.push({ x: g.x, y: L });
    if (g.highBottom < L) path.push({ x: g.x, y: g.highBottom }, { x: g.x, y: L });
  }
  path.push({ x: last.x, y: L }, { x: last.x, y: 0 });
  for (const g of [...mid].reverse()) {
    path.push({ x: g.x, y: 0 });
    if (g.lowTop > 0) path.push({ x: g.x, y: g.lowTop }, { x: g.x, y: 0 });
  }
  path.push({ x: layout.depotX, y: 0 });
  return finish(path, points);
}

/** Shortest walking distance between two points of the warehouse. */
export function distance(p, q, layout) {
  if (p.x === q.x) return Math.abs(p.y - q.y);
  const L = layout.aisleLength;
  const front = p.y + q.y;
  if (layout.backAisle === false) return Math.abs(p.x - q.x) + front;
  return Math.abs(p.x - q.x) + Math.min(front, 2 * L - p.y - q.y);
}
