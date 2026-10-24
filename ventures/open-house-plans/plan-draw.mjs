// @ts-check
// The floor plan as drawing primitives: poché walls, doors with swings,
// windows, fixtures, furniture, room labels and dimension strings.

import { bbox, area as polyArea, inside, centroid, ftIn, EPS } from "./geom.mjs";
import { netBox, SLEEP } from "./layout.mjs";

const WALL = "#2a2a2a";
const FIX = "#6b6b6b";
const FURN = "#9a9a9a";

function wallBand(plan, w) {
  // [lo, hi] across the wall line
  if (w.type === "ext") {
    const max = w.dir === "h" ? plan.D : plan.W;
    return Math.abs(w.c) < EPS ? [0, w.thickness] : Math.abs(w.c - max) < EPS ? [max - w.thickness, max] : [w.c - w.thickness / 2, w.c + w.thickness / 2];
  }
  return [w.c - w.thickness / 2, w.c + w.thickness / 2];
}

const R = (x0, y0, x1, y1, o = {}) => ({ t: "poly", pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, ...o });
const along = (w, s, t) => (w.dir === "h" ? [s, t] : [t, s]); // (along, across) -> (x, y)

export function wallPrimitives(plan) {
  const out = [];
  const byWall = new Map();
  for (const o of plan.openings) {
    if (!byWall.has(o.wall)) byWall.set(o.wall, []);
    byWall.get(o.wall).push(o);
  }
  for (const w of plan.walls) {
    if (w.type === "open") continue;
    const [lo, hi] = wallBand(plan, w);
    // extend partitions half a wall into their neighbours so corners close
    let a = w.a, b = w.b;
    let pieces = [[a, b]];
    for (const o of byWall.get(w.id) || []) {
      const s = o.pos - o.width / 2, e = o.pos + o.width / 2;
      pieces = pieces.flatMap(([p, q]) => [[p, Math.min(q, s)], [Math.max(p, e), q]]).filter(([p, q]) => q - p > 1e-6);
    }
    for (const [p, q] of pieces) {
      const [x0, y0] = along(w, p, lo), [x1, y1] = along(w, q, hi);
      out.push(R(x0, y0, x1, y1, { fill: w.type === "fire" ? "#555" : WALL, stroke: null, layer: "A-WALL" }));
    }
  }
  return out;
}

function roomSide(plan, roomId, w) {
  const r = plan.rooms.find((x) => x.id === roomId);
  const [cx, cy] = centroid(r.poly);
  return (w.dir === "h" ? cy : cx) > w.c ? 1 : -1;
}

export function openingPrimitives(plan) {
  const out = [];
  const wallsById = new Map(plan.walls.map((w) => [w.id, w]));
  for (const o of plan.openings) {
    const w = wallsById.get(o.wall);
    const [lo, hi] = wallBand(plan, w);
    const s = o.pos - o.width / 2, e = o.pos + o.width / 2;
    const L = (a1, c1, a2, c2, st = {}) => ({ t: "line", a: along(w, a1, c1), b: along(w, a2, c2), stroke: "#222", sw: 0.04, ...st });
    if (o.kind === "window") {
      const mid = (lo + hi) / 2;
      out.push(L(s, lo, s, hi, { layer: "A-GLAZ" }), L(e, lo, e, hi, { layer: "A-GLAZ" }));
      out.push(L(s, lo, e, lo, { layer: "A-GLAZ", sw: 0.03 }), L(s, hi, e, hi, { layer: "A-GLAZ", sw: 0.03 }));
      out.push(L(s, mid, e, mid, { layer: "A-GLAZ", sw: 0.05, stroke: "#3b6ea5" }));
      continue;
    }
    if (o.kind === "slider") {
      const t = (hi - lo) / 3;
      out.push(R(...along(w, s, lo + t * 0.5), ...along(w, (s + e) / 2 + 0.2, lo + t * 1.4), { fill: "#ffffff", stroke: "#222", sw: 0.03, layer: "A-DOOR" }));
      out.push(R(...along(w, (s + e) / 2 - 0.2, lo + t * 1.6), ...along(w, e, lo + t * 2.5), { fill: "#ffffff", stroke: "#222", sw: 0.03, layer: "A-DOOR" }));
      out.push(L(s, lo, s, hi, { layer: "A-DOOR" }), L(e, lo, e, hi, { layer: "A-DOOR" }));
      continue;
    }
    if (o.kind === "garage") {
      out.push(L(s, hi + 0.1, e, hi + 0.1, { dash: [0.6, 0.3], layer: "A-DOOR" }));
      continue;
    }
    if (o.kind === "cased") {
      out.push(L(s, lo, s, hi, { sw: 0.03, layer: "A-DOOR" }), L(e, lo, e, hi, { sw: 0.03, layer: "A-DOOR" }));
      continue;
    }
    const intoRoom = o.into || o.rooms[o.rooms.length - 1];
    const side = roomSide(plan, intoRoom, w);
    const face = side > 0 ? hi : lo;
    if (o.kind === "bifold" || o.kind === "closet") {
      const n = o.width > 4 ? 4 : 2;
      const leaf = o.width / n;
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(along(w, s + i * leaf, face + side * (i % 2 ? 0.45 : 0.05)));
      out.push({ t: "poly", pts, closed: false, stroke: "#222", sw: 0.03, layer: "A-DOOR" });
      continue;
    }
    // swing door: hinge at the end nearer the wall's own end, leaf open at 90 degrees
    const hingeAtS = Math.abs(s - w.a) <= Math.abs(w.b - e);
    const hinge = hingeAtS ? s : e;
    const free = hingeAtS ? e : s;
    const [hx, hy] = along(w, hinge, face);
    const [lx, ly] = along(w, hinge, face + side * o.width);
    out.push({ t: "line", a: [hx, hy], b: [lx, ly], stroke: "#222", sw: 0.05, layer: "A-DOOR" });
    const [fx, fy] = along(w, free, face);
    const a0 = (Math.atan2(fy - hy, fx - hx) * 180) / Math.PI;
    const a1 = (Math.atan2(ly - hy, lx - hx) * 180) / Math.PI;
    let start = a0, end = a1;
    let sweep = end - start;
    while (sweep > 180) sweep -= 360;
    while (sweep < -180) sweep += 360;
    if (sweep < 0) { start = a1; end = a0; }
    out.push({ t: "arc", c: [hx, hy], r: o.width, a0: start, a1: end, stroke: "#777", sw: 0.025, layer: "A-DOOR" });
    out.push(L(s, lo, s, hi, { sw: 0.03, layer: "A-DOOR" }), L(e, lo, e, hi, { sw: 0.03, layer: "A-DOOR" }));
  }
  return out;
}

// --- fixtures and furniture ---------------------------------------------------

function sideOfDoor(plan, room) {
  const b = bbox(room.poly);
  const doors = plan.openings.filter((o) => o.rooms.includes(room.id) && o.kind !== "window");
  return doors.map((o) => {
    if (o.dir === "h") return { side: Math.abs(o.c - b.y0) < EPS ? "s" : "n", pos: o.pos, width: o.width };
    return { side: Math.abs(o.c - b.x0) < EPS ? "w" : "e", pos: o.pos, width: o.width };
  });
}

// A local frame for a rectangular room: u along a wall, v away from it.
function frame(nb, side) {
  // returns a map (u, v) -> (x, y) with the wall at v = 0 and u from the wall's left end seen from inside
  if (side === "s") return { len: nb.w, depth: nb.d, P: (u, v) => [nb.x0 + u, nb.y0 + v] };
  if (side === "n") return { len: nb.w, depth: nb.d, P: (u, v) => [nb.x1 - u, nb.y1 - v] };
  if (side === "w") return { len: nb.d, depth: nb.w, P: (u, v) => [nb.x0 + v, nb.y1 - u] };
  return { len: nb.d, depth: nb.w, P: (u, v) => [nb.x1 - v, nb.y0 + u] };
}
const OPP = { n: "s", s: "n", e: "w", w: "e" };
function box(fr, u0, v0, u1, v1, o = {}) {
  return { t: "poly", pts: [fr.P(u0, v0), fr.P(u1, v0), fr.P(u1, v1), fr.P(u0, v1)], closed: true, fill: "#ffffff", stroke: FIX, sw: 0.035, layer: "A-FIXT", ...o };
}
function toilet(fr, uc) {
  /** @type {any[]} */
  const out = [box(fr, uc - 0.85, 0, uc + 0.85, 0.65)];
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (i / 16);
    pts.push(fr.P(uc + 0.65 * Math.cos(a), 0.65 + 1.4 * Math.sin(a) * 0.95));
  }
  out.push({ t: "poly", pts, closed: true, fill: "#ffffff", stroke: FIX, sw: 0.035, layer: "A-FIXT" });
  return out;
}
function vanity(fr, u0, u1, sinks = 1) {
  /** @type {any[]} */
  const out = [box(fr, u0, 0, u1, 1.75)];
  for (let i = 0; i < sinks; i++) {
    const uc = u0 + ((i + 0.5) * (u1 - u0)) / sinks;
    const [x, y] = fr.P(uc, 0.9);
    out.push({ t: "circle", c: [x, y], r: 0.55, fill: "#ffffff", stroke: FIX, sw: 0.03, layer: "A-FIXT" });
  }
  return out;
}
function tub(fr, u0, u1) {
  return [box(fr, u0, 0, u1, 2.5), box(fr, u0 + 0.25, 0.25, u1 - 0.25, 2.25, { sw: 0.025 })];
}
function shower(fr, u0, u1, d = 3) {
  return [box(fr, u0, 0, u1, d), { t: "line", a: fr.P(u0, 0), b: fr.P(u1, d), stroke: FIX, sw: 0.02, layer: "A-FIXT" }, { t: "line", a: fr.P(u1, 0), b: fr.P(u0, d), stroke: FIX, sw: 0.02, layer: "A-FIXT" }];
}

function bathFixtures(plan, r) {
  const nb = netBox(plan, r);
  const doors = sideOfDoor(plan, r);
  const dSide = doors[0]?.side || "s";
  const far = frame(nb, OPP[dSide]);
  const out = [];
  if (r.kind === "half") {
    out.push(...toilet(far, far.len / 2));
    const side = frame(nb, dSide === "n" || dSide === "s" ? "w" : "s");
    if (side.depth >= 3.5) out.push(...vanity(side, Math.max(0.2, side.len - 3.6), side.len - 1.6 > 1.5 ? side.len - 1.6 : side.len - 0.2));
    return out;
  }
  // tub or shower across the far wall
  if (far.len >= 5) out.push(...tub(far, 0, 5));
  else out.push(...shower(far, 0, far.len, Math.min(3, far.depth - 3)));
  const used = far.len >= 5 ? 2.5 : 3;
  // along a long side, from the tub toward the door: toilet then vanity
  const sideName = dSide === "n" || dSide === "s" ? (far.len >= 5 ? "e" : "w") : far.len >= 5 ? "n" : "s";
  const fr = frame(nb, sideName);
  // u runs along the long wall; find which end the tub is at
  const tubAtStart = (() => { const [x, y] = fr.P(0.1, 0.1); const [fx, fy] = far.P(far.len / 2, 0); return Math.hypot(x - fx, y - fy) < Math.hypot(...fr.P(fr.len - 0.1, 0.1).map((v, i) => v - [fx, fy][i])); })();
  const start = used, end = fr.len - (doors[0]?.width || 2.5) - 0.3;
  const place = (u0, u1) => (tubAtStart ? [u0, u1] : [fr.len - u1, fr.len - u0]);
  if (end - start >= 2.5) {
    const [a] = place(start, start + 2.5);
    out.push(...toilet(fr, a + 1.25));
    if (end - start >= 5.5) {
      const vl = Math.min(r.kind === "ensuite" ? 6 : 4, end - start - 2.75);
      const [v0, v1] = place(start + 2.75, start + 2.75 + vl);
      out.push(...vanity(fr, v0, v1, r.kind === "ensuite" && vl >= 5 ? 2 : 1));
    } else if (nb.w >= 6.5 && nb.d >= 6.5) {
      const other = frame(nb, OPP[sideName]);
      const [v0, v1] = tubAtStart ? [fr.len - start - 3.5, fr.len - start] : [start, start + 3.5];
      out.push(...vanity(other, Math.max(0, Math.min(v0, v1)), Math.max(v0, v1)));
    }
  }
  return out;
}

function bedFurniture(plan, r) {
  const nb = netBox(plan, r);
  const b = bbox(r.poly);
  // the largest rectangle inside the L, shrunk by the walls
  const closet = plan.rooms.find((c) => c.kind === "closet" && c.owner === r.id);
  let x0 = nb.x0, x1 = nb.x1, y0 = nb.y0, y1 = nb.y1;
  if (closet) {
    const cb = bbox(closet.poly);
    const cutY = cb.y0 > b.y0 + EPS ? { y0, y1: cb.y0 - 0.2 } : { y0: cb.y1 + 0.2, y1 };
    const cutX = cb.x0 > b.x0 + EPS ? { x0, x1: cb.x0 - 0.2 } : { x0: cb.x1 + 0.2, x1 };
    const aY = (x1 - x0) * (cutY.y1 - cutY.y0), aX = (cutX.x1 - cutX.x0) * (y1 - y0);
    if (aY >= aX) ({ y0, y1 } = cutY); else ({ x0, x1 } = cutX);
  }
  const main = { x0, x1, y0, y1, w: x1 - x0, d: y1 - y0 };
  const big = r.kind === "primary";
  const [bw, bl] = big ? (main.w >= 13 && main.d >= 13 ? [6.33, 6.67] : [5, 6.67]) : main.w >= 11 && main.d >= 11 ? [4.5, 6.25] : [3.25, 6.25];
  // head against a wall with no windows or doors: try the sides in turn
  const blocked = (side) => plan.openings.some((o) => o.rooms.includes(r.id) && ((side === "w" || side === "e") ? o.dir === "v" && Math.abs(o.c - (side === "w" ? b.x0 : b.x1)) < EPS : o.dir === "h" && Math.abs(o.c - (side === "s" ? b.y0 : b.y1)) < EPS));
  const order = ["w", "e", "n", "s"].sort((p, q) => (blocked(p) ? 1 : 0) - (blocked(q) ? 1 : 0));
  for (const side of order) {
    const fr = frame(main, side);
    if (fr.len < bw + 1 || fr.depth < bl + 2.5) continue;
    const uc = fr.len / 2;
    /** @type {any[]} */
    const out = [box(fr, uc - bw / 2, 0, uc + bw / 2, bl, { stroke: FURN, layer: "A-FURN" })];
    out.push(box(fr, uc - bw / 2 + 0.25, 0.2, uc - 0.15, 1.2, { stroke: FURN, sw: 0.025, layer: "A-FURN" }));
    out.push(box(fr, uc + 0.15, 0.2, uc + bw / 2 - 0.25, 1.2, { stroke: FURN, sw: 0.025, layer: "A-FURN" }));
    out.push({ t: "line", a: fr.P(uc - bw / 2, 2.2), b: fr.P(uc + bw / 2, 2.2), stroke: FURN, sw: 0.025, layer: "A-FURN" });
    for (const s of [-1, 1]) {
      const u = uc + s * (bw / 2 + 0.9);
      if (u - 0.75 > 0.1 && u + 0.75 < fr.len - 0.1) out.push(box(fr, u - 0.75, 0, u + 0.75, 1.5, { stroke: FURN, layer: "A-FURN" }));
    }
    return out;
  }
  return [];
}

function livingFurniture(plan, r, hasDining) {
  const nb = netBox(plan, r);
  const out = [];
  const o = { stroke: FURN, layer: "A-FURN", fill: "#ffffff", sw: 0.035 };
  // seating faces the front windows, backed toward the kitchen; a merged room
  // keeps its table by the kitchen and the seating toward the front
  const fr = frame(nb, "n");
  const cx = fr.len / 2;
  const withTable = !hasDining && fr.depth >= 15;
  const back = withTable ? 7.75 : hasDining ? 1.5 : Math.max(1.5, fr.depth - 10);
  out.push(box(fr, cx - 3.5, back, cx + 3.5, back + 3, o), box(fr, cx - 3.5, back, cx + 3.5, back + 0.8, { ...o, sw: 0.025 }));
  if (back + 6.3 <= fr.depth - 0.5) out.push(box(fr, cx - 2, back + 4.3, cx + 2, back + 6.3, o));
  for (const s of [-1, 1]) {
    const u = cx + s * 5.2;
    if (u - 1.4 > 0 && u + 1.4 < fr.len && back + 6.7 <= fr.depth - 0.3) out.push(box(fr, u - 1.4, back + 3.9, u + 1.4, back + 6.7, o));
  }
  if (withTable) out.push(...diningSet(fr, cx, 0.25, plan, fr.len >= 13 ? 6 : 4));
  return out;
}

function diningSet(fr, uc, v0, plan, seats = 6) {
  const o = { stroke: FURN, layer: "A-FURN", fill: "#ffffff", sw: 0.035 };
  const len = seats >= 8 ? 7.5 : seats >= 6 ? 6 : 4;
  /** @type {any[]} */
  const out = [box(fr, uc - len / 2, v0 + 1.75, uc + len / 2, v0 + 5.25, o)];
  const per = Math.max(1, Math.round(seats / 2) - (len < 5 ? 0 : 0));
  for (let i = 0; i < per; i++) {
    const u = uc - len / 2 + ((i + 0.5) * len) / per;
    out.push(box(fr, u - 0.75, v0 + 0.25, u + 0.75, v0 + 1.5, o), box(fr, u - 0.75, v0 + 5.5, u + 0.75, v0 + 6.75, o));
  }
  return out;
}

function fixturesFor(plan, r, brief) {
  const k = r.kind;
  const nb = netBox(plan, r);
  if (k === "bath" || k === "ensuite" || k === "half") return bathFixtures(plan, r);
  if (SLEEP.has(k)) return bedFurniture(plan, r);
  if (k === "kitchen") {
    return plan.kitchenLayout.items.map((it) => ({
      t: "poly", pts: [[it.x0, it.y0], [it.x1, it.y0], [it.x1, it.y1], [it.x0, it.y1]], closed: true,
      fill: it.kind === "counter" || it.kind === "island" ? "#f1efe9" : "#ffffff", stroke: FIX, sw: it.kind === "counter" ? 0.035 : 0.03, layer: "A-FIXT",
      dash: it.below ? [0.2, 0.15] : undefined,
    })).concat(plan.kitchenLayout.items.filter((i) => i.kind === "range").flatMap((it) => {
      const cx = (it.x0 + it.x1) / 2, cy = (it.y0 + it.y1) / 2, dx = (it.x1 - it.x0) / 4, dy = (it.y1 - it.y0) / 4;
      return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b2]) => ({ t: "circle", c: [cx + a * dx, cy + b2 * dy], r: Math.min(dx, dy) * 0.7, stroke: FIX, sw: 0.025, fill: "none", layer: "A-FIXT" }));
    }));
  }
  if (k === "living") return livingFurniture(plan, r, Boolean(plan.great.dining));
  if (k === "dining") {
    const fr = frame(nb, nb.w >= nb.d ? "n" : "e");
    const seats = brief.beds >= 4 ? 8 : 6;
    return diningSet(fr, fr.len / 2, Math.max(0.5, (fr.depth - 7) / 2), plan, seats);
  }
  if (k === "laundry" || k === "mud") {
    const doors = sideOfDoor(plan, r);
    const sides = ["n", "s", "e", "w"].filter((s) => !doors.some((d) => d.side === s));
    const fr = frame(nb, sides.includes("n") ? "n" : sides[0]);
    if (fr.len < 5.2) return [];
    /** @type {any[]} */
    const out = [box(fr, 0.1, 0, 2.6, 2.5), box(fr, 2.7, 0, 5.2, 2.5)];
    const [x, y] = fr.P(1.35, 1.25);
    out.push({ t: "circle", c: [x, y], r: 0.8, fill: "none", stroke: FIX, sw: 0.03, layer: "A-FIXT" });
    if (k === "mud" && fr.len >= 7.5) out.push(box(fr, 5.5, 0, fr.len - 0.2, 1.5, { fill: "#f1efe9" }));
    if (k === "laundry") {
      // water heater and air handler beside the machines, or across from them
      const opp = frame(nb, OPP[sides.includes("n") ? "n" : sides[0]]);
      const alongside = fr.len >= 9.2;
      const f2 = alongside ? fr : opp;
      const u0 = alongside ? 5.5 : 0.2;
      if (alongside || fr.depth >= 7) {
        const [hx, hy] = f2.P(u0 + 1, 1);
        out.push({ t: "circle", c: [hx, hy], r: 0.9, fill: "#ffffff", stroke: FIX, sw: 0.035, layer: "A-FIXT" });
        if (f2.len >= u0 + 4.5) out.push(box(f2, u0 + 2.2, 0, u0 + 4.4, 2.2));
      }
    }
    return out;
  }
  if (k === "closet" || k === "wic") {
    const b = bbox(r.poly);
    const long = b.w >= b.h;
    const out = [];
    if (k === "closet") {
      const mid = long ? [[b.x0 + 0.4, (b.y0 + b.y1) / 2], [b.x1 - 0.4, (b.y0 + b.y1) / 2]] : [[(b.x0 + b.x1) / 2, b.y0 + 0.4], [(b.x0 + b.x1) / 2, b.y1 - 0.4]];
      out.push({ t: "line", a: mid[0], b: mid[1], stroke: FURN, sw: 0.03, dash: [0.3, 0.15], layer: "A-FURN" });
    } else {
      const doors = sideOfDoor(plan, r);
      for (const s of ["n", "s", "e", "w"]) {
        if (doors.some((d) => d.side === s)) continue;
        const fr = frame(nb, s);
        out.push(box(fr, 0, 0, fr.len, 1.8, { fill: "none", stroke: FURN, dash: [0.3, 0.15], layer: "A-FURN" }));
      }
    }
    return out;
  }
  if (k === "garage") {
    const out = [];
    // water heater and air handler against the wall shared with the house, at the back
    const sh = frame(nb, plan.p.Wg ? "e" : "w");
    const [hx, hy] = sh.P(sh.len - 1.2, 1);
    out.push({ t: "circle", c: [hx, hy], r: 0.9, fill: "#ffffff", stroke: FIX, sw: 0.035, layer: "A-FIXT" });
    out.push(box(sh, sh.len - 4.6, 0, sh.len - 2.4, 2.2));
    const cars = brief.garage;
    const fr = frame(nb, "s");
    for (let i = 0; i < cars; i++) {
      const uc = ((i + 0.5) * fr.len) / cars;
      out.push(box(fr, uc - 3, 2, uc + 3, 17, { stroke: FURN, dash: [0.4, 0.2], fill: "none", layer: "A-FURN" }));
    }
    return out;
  }
  return [];
}

function labelPoint(r, plan) {
  const b = bbox(r.poly);
  const nb = netBox(plan, r);
  let p = [(nb.x0 + nb.x1) / 2, (nb.y0 + nb.y1) / 2];
  if (!inside(r.poly, ...p)) p = centroid(r.poly);
  return p;
}

function dimString(a, b, at, dir, label, tick = 0.35) {
  // a line from a to b (along x if dir h, else along y) at offset `at`, with slashes and a label
  const out = [];
  const L = (p, q) => ({ t: "line", a: p, b: q, stroke: "#444", sw: 0.025, layer: "A-ANNO-DIMS" });
  if (dir === "h") {
    out.push(L([a, at], [b, at]));
    for (const x of [a, b]) out.push(L([x - tick, at - tick], [x + tick, at + tick]), L([x, at - 0.6], [x, at + 0.6]));
    out.push({ t: "text", p: [(a + b) / 2, at + 0.25], s: label, size: 0.75, fill: "#333", layer: "A-ANNO-DIMS" });
  } else {
    out.push(L([at, a], [at, b]));
    for (const y of [a, b]) out.push(L([at - tick, y - tick], [at + tick, y + tick]), L([at - 0.6, y], [at + 0.6, y]));
    out.push({ t: "text", p: [at - 0.3, (a + b) / 2], s: label, size: 0.75, fill: "#333", rot: 90, layer: "A-ANNO-DIMS" });
  }
  return out;
}

export function planPrimitives(plan, brief, style) {
  const out = [];
  // floor tint per room type
  const tint = { garage: "#eeeeee", porch: "#f4efe6", hall: "#fbfaf7", closet: "#f7f6f2", wic: "#f7f6f2", mech: "#f2f2f2" };
  for (const r of plan.rooms) out.push({ t: "poly", pts: r.poly, closed: true, fill: tint[r.kind] || "#fffdf8", stroke: null, layer: "A-AREA" });
  // porch
  if (plan.porch) {
    const p = plan.porch;
    out.push({ t: "poly", pts: [[p.x0, 0], [p.x1, 0], [p.x1, -p.d], [p.x0, -p.d]], closed: true, fill: "#f4efe6", stroke: "#666", sw: 0.04, layer: "A-PORCH" });
    const n = Math.max(2, Math.round(p.w / 8) + 1);
    for (let i = 0; i < n; i++) {
      const x = p.x0 + 0.5 + (i * (p.w - 1)) / (n - 1);
      out.push({ t: "poly", pts: [[x - 0.3, -p.d + 0.2], [x + 0.3, -p.d + 0.2], [x + 0.3, -p.d + 0.8], [x - 0.3, -p.d + 0.8]], closed: true, fill: "#888", stroke: null, layer: "A-PORCH" });
    }
    out.push({ t: "text", p: [(p.x0 + p.x1) / 2, -p.d / 2 - 0.3], s: "Covered porch", size: 0.8, fill: "#555", italic: true, layer: "A-ANNO-TEXT" });
  }
  for (const r of plan.rooms) out.push(...fixturesFor(plan, r, brief));
  out.push(...wallPrimitives(plan));
  out.push(...openingPrimitives(plan));
  // labels
  for (const r of plan.rooms) {
    const [x, y] = labelPoint(r, plan);
    const nb = netBox(plan, r);
    if (r.kind === "closet") { out.push({ t: "text", p: [x, y - 0.25], s: "CL", size: 0.6, fill: "#555", layer: "A-ANNO-TEXT" }); continue; }
    const small = nb.w < 6 || nb.d < 6;
    let label = r.name.toUpperCase();
    let size = small ? 0.65 : 0.95;
    const fits = (s, z) => s.length * z * 0.68 <= nb.w - 0.4;
    if (!fits(label, size)) label = label.replace("WALK-IN CLOSET", "W.I.C.").replace("PRIMARY ", "PRIM. ").replace(" / MECH.", "");
    while (!fits(label, size) && size > 0.45) size -= 0.05;
    out.push({ t: "text", p: [x, y + 0.2], s: label, size, weight: "bold", fill: "#222", spacing: 0.03, layer: "A-ANNO-TEXT" });
    if (!small || r.kind === "bath" || r.kind === "ensuite") out.push({ t: "text", p: [x, y - size * 1.05], s: `${ftIn(nb.w).replace(/-0"$/, "'").replace(/'-0"/, "'")} x ${ftIn(nb.d).replace(/'-0"/, "'")}`, size: size * 0.8, fill: "#444", layer: "A-ANNO-TEXT" });
  }
  // dimensions: overall and by zone along the back, overall depth on the left
  const top = plan.D + 3;
  out.push(...dimString(0, plan.W, top + 2, "h", ftIn(plan.W)));
  const xs = [...new Set(plan.zones.flatMap((z) => [z.x0, z.x1]))].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) out.push(...dimString(xs[i], xs[i + 1], top, "h", ftIn(xs[i + 1] - xs[i])));
  out.push(...dimString(0, plan.D, -2.5 - (plan.porch ? 0 : 0) - 2, "v", ftIn(plan.D)));
  if (plan.wing?.hall) {
    const hb = bbox(plan.wing.hall.poly);
    const ys = [0, hb.y0, hb.y1, plan.D];
    for (let i = 0; i < 3; i++) out.push(...dimString(ys[i], ys[i + 1], plan.W + 2.5, "v", ftIn(ys[i + 1] - ys[i])));
  }
  // street side
  const fy = plan.porch ? -plan.porch.d - 2.2 : -2.2;
  out.push({ t: "text", p: [plan.W / 2, fy], s: "FRONT  (street side)", size: 0.75, fill: "#666", spacing: 0.15, layer: "A-ANNO-TEXT" });
  return out;
}

export { dimString };
