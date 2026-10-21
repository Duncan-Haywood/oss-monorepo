// @ts-check
// Walls, doors, windows and the kitchen run for a skeleton from layout.mjs.
//
// Walls come from the rooms themselves: every room edge is cut into 6 in
// units; a unit with one room on it is an outside wall, with two rooms a
// partition (or nothing, when the rooms are open to each other), and runs of
// units on one line merge into walls. Openings sit on walls at an offset.

import { edges, overlap, bbox, EPS, q } from "./geom.mjs";
import { T_EXT, T_INT, SLEEP, HABITABLE } from "./layout.mjs";

const U = 0.5; // unit length, ft

function unitKey(dir, c, i) {
  return `${dir}|${Math.round(c * 2)}|${i}`;
}

/** Walls of a skeleton: [{id, dir, c, a, b, type, rooms}] with type ext | int | fire | open. */
export function buildWalls(sk) {
  const units = new Map();
  for (const r of sk.rooms) {
    for (const e of edges(r.poly)) {
      for (let i = Math.round(e.a / U); i < Math.round(e.b / U); i++) {
        const k = unitKey(e.dir, e.c, i);
        if (!units.has(k)) units.set(k, { dir: e.dir, c: e.c, i, rooms: [] });
        units.get(k).rooms.push(r.id);
      }
    }
  }
  const openPairs = new Set(sk.links.filter((l) => l[2] === "open").map((l) => [l[0], l[1]].sort().join("~")));
  const kindOf = new Map(sk.rooms.map((r) => [r.id, r.kind]));
  const lines = new Map();
  for (const u of units.values()) {
    let type;
    if (u.rooms.length === 1) {
      const onEdge = u.dir === "h" ? Math.abs(u.c) < EPS || Math.abs(u.c - sk.D) < EPS : Math.abs(u.c) < EPS || Math.abs(u.c - sk.W) < EPS;
      if (!onEdge) throw new Error(`gap in plan at ${u.dir} ${u.c} unit ${u.i}`);
      type = "ext";
    } else if (u.rooms.length === 2) {
      const pair = u.rooms.slice().sort().join("~");
      if (openPairs.has(pair)) type = "open";
      else if (u.rooms.some((id) => kindOf.get(id) === "garage")) type = "fire";
      else type = "int";
    } else throw new Error(`overlapping rooms at ${u.dir} ${u.c}`);
    const lk = `${u.dir}|${Math.round(u.c * 2)}`;
    if (!lines.has(lk)) lines.set(lk, []);
    lines.get(lk).push({ ...u, type });
  }
  const walls = [];
  let n = 0;
  for (const list of lines.values()) {
    list.sort((a, b) => a.i - b.i);
    let cur = null;
    for (const u of list) {
      if (cur && cur.type === u.type && u.i === cur.iEnd) {
        cur.iEnd++;
        for (const id of u.rooms) cur.rooms.add(id);
      } else {
        if (cur) walls.push(cur);
        cur = { dir: u.dir, c: u.c, iStart: u.i, iEnd: u.i + 1, type: u.type, rooms: new Set(u.rooms) };
      }
    }
    if (cur) walls.push(cur);
  }
  return walls.map((w) => ({
    id: `w${++n}`, dir: w.dir, c: w.c, a: w.iStart * U, b: w.iEnd * U, type: w.type, rooms: [...w.rooms],
    thickness: w.type === "ext" ? T_EXT : w.type === "open" ? 0 : T_INT,
  }));
}

function sharedSegments(a, b) {
  const out = [];
  for (const e of edges(a.poly)) for (const f of edges(b.poly)) {
    const o = overlap(e, f);
    if (o) out.push(o);
  }
  return out.sort((s, t) => t.b - t.a - (s.b - s.a));
}

/** The wall a segment lies on. */
function wallAt(walls, dir, c, pos) {
  return walls.find((w) => w.dir === dir && Math.abs(w.c - c) < EPS && pos >= w.a - EPS && pos <= w.b + EPS && w.type !== "open");
}

export function headHeight(ceiling) {
  return ceiling - 4 / 3; // 6'-8" under an 8 ft ceiling, 7'-8" under 9 ft
}

/** Place doors, windows and the kitchen; returns the finished plan. */
export function finishPlan(sk, brief, style) {
  const walls = buildWalls(sk);
  const byId = new Map(sk.rooms.map((r) => [r.id, r]));
  const ceiling = brief.ceiling || style.ceiling;
  const head = headHeight(ceiling);
  const acc = brief.accessible;
  const openings = [];
  let n = 0;
  const add = (o) => {
    const w = wallAt(walls, o.dir, o.c, o.pos);
    if (!w) throw new Error(`no wall for ${o.kind} at ${o.dir} ${o.c} ${o.pos}`);
    const op = { id: `o${++n}`, wall: w.id, ...o };
    openings.push(op);
    return op;
  };

  // --- interior doors from the links ---
  for (const [aId, bId, kind] of sk.links) {
    if (kind === "open") continue;
    const A = byId.get(aId), B = byId.get(bId);
    const segs = sharedSegments(A, B);
    if (!segs.length) throw new Error(`rooms ${aId} and ${bId} do not touch`);
    const s = segs[0];
    const len = s.b - s.a;
    let width;
    if (kind === "closet") width = Math.min(len - 0.5, 6);
    else if (kind === "bifold") width = Math.min(len - 0.5, B.kind === "laundry" ? 5 : 2.5);
    else if (kind === "cased") width = Math.min(len - 1, 3.5);
    else if (B.kind === "bath" || B.kind === "half" || B.kind === "ensuite" || B.kind === "wic") width = acc ? 3 : 2.5;
    else if (A.kind === "garage") width = 3;
    else width = acc ? 3 : 2.67;
    width = Math.min(width, len - 0.33);
    if (width < 1.5) throw new Error(`no room for a door between ${A.kind} and ${B.kind}`);
    // position: next to a closet for bedrooms, otherwise toward the start of the segment
    let pos;
    const margin = 0.33 + width / 2;
    if (kind === "closet" || kind === "cased" || len < width + 1.5) pos = (s.a + s.b) / 2;
    else if (SLEEP.has(B.kind) && A.kind === "hall") {
      const bb = bbox(B.poly);
      // the closet sits at the high end of the cell (layout.mjs); hang the door just before it
      pos = s.b - margin;
      if (s.b > bb.x1 - EPS) pos = s.a + margin;
    } else if (A.kind === "hall") pos = s.a + margin;
    else if (B.kind === "ensuite" || B.kind === "wic") pos = (s.a + s.b) / 2;
    else pos = s.dir === "h" ? (s.a + s.b) / 2 : Math.min(s.b - margin, Math.max(s.a + margin, (s.a + s.b) / 2));
    const into = kind === "closet" ? A.id : B.id; // closet doors are drawn as bifolds from the room side
    add({ kind: kind === "door" ? "door" : kind, dir: s.dir, c: s.c, pos, width, height: 6.67, sill: 0, rooms: [aId, bId], into });
  }

  // --- outside doors ---
  const g = sk.great;
  const living = g.living, lb = bbox(living.poly);
  const frontPos = q((lb.x0 + lb.x1) / 2);
  add({ kind: "entry", dir: "h", c: 0, pos: frontPos, width: 3, height: 6.67, sill: 0, rooms: [living.id], into: living.id, exterior: true });
  if (g.dining) {
    const db = bbox(g.dining.poly);
    add({ kind: "slider", dir: "h", c: sk.D, pos: (db.x0 + db.x1) / 2, width: Math.min(6, db.w - 2), height: 6.67, sill: 0, rooms: [g.dining.id], exterior: true });
  } else if (sk.mud) {
    // the mudroom takes the back door, so the kitchen keeps its whole back wall
    const mb = bbox(sk.mud.poly);
    add({ kind: "door", dir: "h", c: sk.D, pos: (mb.x0 + mb.x1) / 2, width: 3, height: 6.67, sill: 0, rooms: [sk.mud.id], into: sk.mud.id, exterior: true, back: true });
  } else if (lb.x0 < EPS || lb.x1 > sk.W - EPS) {
    // a side door from the living area when the great room is at an end of the house
    const side = lb.x0 < EPS ? 0 : sk.W;
    add({ kind: "door", dir: "v", c: side, pos: lb.y1 - 2.5, width: 3, height: 6.67, sill: 0, rooms: [living.id], into: living.id, exterior: true, back: true });
  } else {
    const kb = bbox(g.kitchen.poly);
    if (kb.w >= 13.5) add({ kind: "door", dir: "h", c: sk.D, pos: kb.x0 + 2.25, width: 3, height: 6.67, sill: 0, rooms: [g.kitchen.id], into: g.kitchen.id, exterior: true, back: true });
  }
  if (sk.garage) {
    const gb = bbox(sk.garage.poly);
    const cars = brief.garage;
    add({ kind: "garage", dir: "h", c: 0, pos: (gb.x0 + gb.x1) / 2, width: cars === 2 ? 16 : 9, height: 7, sill: 0, rooms: [sk.garage.id], exterior: true });
    add({ kind: "door", dir: "v", c: 0, pos: sk.D - 3, width: 3, height: 6.67, sill: 0, rooms: [sk.garage.id], into: sk.garage.id, exterior: true });
  }

  // --- windows ---
  const exteriorEdges = (r) => edges(r.poly).filter((e) => (e.dir === "h" ? Math.abs(e.c) < EPS || Math.abs(e.c - sk.D) < EPS : Math.abs(e.c) < EPS || Math.abs(e.c - sk.W) < EPS));
  const freeIntervals = (e) => {
    // keep clear of corners and partitions (trim) and of doors already on this line
    const atCorner = (v) => (e.dir === "h" ? Math.abs(v) < EPS || Math.abs(v - sk.W) < EPS : Math.abs(v) < EPS || Math.abs(v - sk.D) < EPS);
    let iv = [[e.a + (atCorner(e.a) ? 1.5 : 0.75), e.b - (atCorner(e.b) ? 1.5 : 0.75)]];
    for (const o of openings) {
      if (o.dir !== e.dir || Math.abs(o.c - e.c) > EPS) continue;
      const lo = o.pos - o.width / 2 - 1, hi = o.pos + o.width / 2 + 1;
      iv = iv.flatMap(([a, b]) => [[a, Math.min(b, lo)], [Math.max(a, hi), b]]).filter(([a, b]) => b - a > 0.5);
    }
    return iv.filter(([a, b]) => b - a >= 1.5);
  };
  const placeGroups = (e, count, unitW, mull, spec) => {
    const gw = unitW * mull + 0.25 * (mull - 1);
    const iv = freeIntervals(e).filter(([a, b]) => b - a >= gw);
    if (!iv.length || count < 1) return 0;
    // share the groups among the free intervals by length, then space evenly in each
    const total = iv.reduce((s, [a, b]) => s + (b - a), 0);
    let left = count, placed = 0;
    iv.forEach(([a, b], k) => {
      let m = k === iv.length - 1 ? left : Math.round((count * (b - a)) / total);
      m = Math.min(m, Math.floor((b - a + 0.5) / (gw + 0.5)));
      left -= m;
      for (let i = 0; i < m; i++) {
        const centre = a + ((i + 0.5) * (b - a)) / m;
        for (let j = 0; j < mull; j++) {
          const pos = centre - gw / 2 + unitW / 2 + j * (unitW + 0.25);
          add({ kind: "window", dir: e.dir, c: e.c, pos, width: unitW, ...spec });
          placed++;
        }
      }
    });
    return placed;
  };
  const sw = style.window;
  const win = (w, h, extra = {}) => ({ height: Math.min(h, head - 1.5), sill: head - Math.min(h, head - 1.5), ...extra });
  const front = (e) => e.dir === "h" && Math.abs(e.c) < EPS;
  const back = (e) => e.dir === "h" && Math.abs(e.c - sk.D) < EPS;
  for (const r of sk.rooms) {
    const ex = exteriorEdges(r);
    if (!ex.length) continue;
    const k = r.kind;
    if (k === "living") {
      for (const e of ex) {
        const len = e.b - e.a;
        if (front(e)) {
          // the style's big living-room windows, or smaller ones where those do not fit
          for (const [w, hh] of [[style.living.w, style.living.h], [sw.w, sw.h], [2.5, sw.h]]) {
            const n = Math.max(2, Math.min(style.living.count, Math.floor(len / (w + 2))));
            if (placeGroups(e, n, w, 1, win(w, hh, { rooms: [r.id], egress: false }))) break;
          }
        }
        else placeGroups(e, len >= 14 ? 2 : 1, sw.w, 1, win(sw.w, sw.h, { rooms: [r.id] }));
      }
    } else if (SLEEP.has(k)) {
      let placed = 0;
      // the long outside wall first (front or back), then the end wall
      const sorted = ex.slice().sort((a, b) => (a.dir === "h" ? 0 : 1) - (b.dir === "h" ? 0 : 1) || b.b - b.a - (a.b - a.a));
      sorted.forEach((e, i) => {
        const len = e.b - e.a;
        const mull = sw.pair && len >= 11 && i === 0 ? 2 : 1;
        const count = k === "primary" && i === 0 && len >= 14 && mull === 1 ? 2 : 1;
        placed += placeGroups(e, count, sw.w, mull, win(sw.w, sw.h, { rooms: [r.id], egress: true, operation: "casement" }));
      });
      r.windowsPlaced = placed;
    } else if (k === "kitchen") {
      for (const e of ex) if (back(e)) placeGroups(e, 1, 4, 1, { height: 3.5, sill: head - 3.5, rooms: [r.id], over: "sink" });
    } else if (k === "dining") {
      for (const e of ex) if (!back(e)) placeGroups(e, e.b - e.a >= 12 ? 2 : 1, sw.w, 1, win(sw.w, sw.h, { rooms: [r.id] }));
    } else if (k === "bath" || k === "ensuite" || k === "half") {
      const e = ex.sort((a, b) => b.b - b.a - (a.b - a.a))[0];
      const w = k === "half" ? 2 : k === "ensuite" ? 3 : 2.5;
      placeGroups(e, 1, w, 1, { height: 3, sill: Math.max(4.5, head - 3) - 0, rooms: [r.id], obscure: true });
    } else if (k === "hall") {
      for (const e of ex) placeGroups(e, 1, 2.5, 1, win(2.5, sw.h, { rooms: [r.id] }));
    } else if (k === "mud") {
      for (const e of ex) if (back(e)) placeGroups(e, 1, 2.5, 1, { height: 3, sill: head - 3, rooms: [r.id] });
    } else if (k === "garage") {
      for (const e of ex) if (!front(e)) placeGroups(e, 1, 3, 1, { height: 3, sill: head - 3, rooms: [r.id] });
    }
  }
  // fix up window sills that a short head would push too low
  for (const o of openings) if (o.kind === "window") { o.sill = Math.max(o.sill, 1.5); o.head = o.sill + o.height; }

  const plan = { ...sk, walls, openings, ceiling, head };
  plan.openSides = openSides(plan);
  plan.kitchenLayout = kitchenLayout(plan);
  return plan;
}

/** For each room, which sides (n/e/s/w of its bounding box) are open to a neighbour. */
export function openSides(plan) {
  const out = new Map();
  for (const r of plan.rooms) {
    const b = bbox(r.poly);
    const set = new Set();
    for (const w of plan.walls) {
      if (w.type !== "open" || !w.rooms.includes(r.id)) continue;
      if (w.dir === "v") set.add(Math.abs(w.c - b.x0) < EPS ? "w" : "e");
      else set.add(Math.abs(w.c - b.y0) < EPS ? "s" : "n");
    }
    out.set(r.id, set);
  }
  return out;
}

/** Counters, appliances and an island for the kitchen, as rectangles in plan feet. */
export function kitchenLayout(plan) {
  const k = plan.rooms.find((r) => r.kind === "kitchen");
  const b = bbox(k.poly);
  const D = plan.D;
  const items = [];
  const doorsOnBack = plan.openings.filter((o) => o.dir === "h" && Math.abs(o.c - D) < EPS && o.pos > b.x0 && o.pos < b.x1 && o.kind !== "window");
  let x0 = b.x0, x1 = b.x1;
  for (const d of doorsOnBack) {
    if (d.pos - b.x0 < b.x1 - d.pos) x0 = Math.max(x0, d.pos + d.width / 2 + 0.25);
    else x1 = Math.min(x1, d.pos - d.width / 2 - 0.25);
  }
  const sides = plan.openSides.get(k.id);
  const wallE = !sides.has("e"), wallW = !sides.has("w");
  // doors or openings in the side walls rule a leg out
  const sideBlocked = (x) => plan.openings.some((o) => o.dir === "v" && Math.abs(o.c - x) < EPS && o.pos > b.y0 && o.pos < b.y1);
  let leg = null;
  if (wallW && !sideBlocked(b.x0) && x0 === b.x0) leg = "w";
  else if (wallE && !sideBlocked(b.x1) && x1 === b.x1) leg = "e";
  const run = { kind: "counter", x0, y0: D - 2, x1, y1: D };
  items.push(run);
  const legLen = Math.min(b.h - 2 - 3.5, 9);
  if (leg && legLen >= 4) {
    const lx0 = leg === "w" ? b.x0 : b.x1 - 2;
    items.push({ kind: "counter", x0: lx0, y0: D - 2 - legLen, x1: lx0 + 2, y1: D - 2 });
  } else leg = null;
  const runLen = x1 - x0;
  // pack the run from the fridge end: fridge, counter, sink (under the window
  // if it can be), dishwasher, counter, range (unless the leg takes it)
  const fridgeAtW = leg !== "w";
  const at = (off, w) => (fridgeAtW ? [x0 + off, x0 + off + w] : [x1 - off - w, x1 - off]);
  const L = runLen;
  const [f0, f1] = at(0, 3);
  items.push({ kind: "fridge", x0: f0, y0: D - 2.5, x1: f1, y1: D });
  let rangeOff = null;
  if (!leg) rangeOff = Math.max(3 + 1 + 2.5 + 1, L - 2.5 - Math.min(1.5, Math.max(0.5, (L - 11) / 2)));
  const sinkWin = plan.openings.find((o) => o.kind === "window" && o.over === "sink" && o.pos > b.x0 && o.pos < b.x1);
  const want = sinkWin ? (fridgeAtW ? sinkWin.pos - x0 : x1 - sinkWin.pos) - 1.25 : (L - 2.5) / 2;
  const sinkMax = (rangeOff ?? L) - 2.5 - (rangeOff === null ? 0.5 : 1);
  const sinkOff = Math.min(L - 2.5, Math.max(3 + 1, Math.min(want, sinkMax)));
  const [s0, s1] = at(sinkOff, 2.5);
  items.push({ kind: "sink", x0: s0, y0: D - 1.9, x1: s1, y1: D - 0.3 });
  // dishwasher beside the sink, on whichever side has room
  const after = (rangeOff ?? L) - (sinkOff + 2.5);
  const dwOff = after >= 2 + (rangeOff === null ? 0 : 0.25) ? sinkOff + 2.5 : sinkOff - 3 >= 2 ? sinkOff - 2 : null;
  if (dwOff !== null) { const [d0, d1] = at(dwOff, 2); items.push({ kind: "dishwasher", x0: d0, y0: D - 2, x1: d1, y1: D, below: true }); }
  if (leg) {
    const lx0 = leg === "w" ? b.x0 : b.x1 - 2;
    const ry = D - 2 - legLen / 2;
    items.push({ kind: "range", x0: lx0, y0: ry - 1.25, x1: lx0 + 2, y1: ry + 1.25 });
  } else if (rangeOff + 2.5 <= L + 1e-9 && rangeOff >= sinkOff + 2.5 + (dwOff !== null && dwOff > sinkOff ? 2 : 0) - 1e-9) {
    const [r0, r1] = at(rangeOff, 2.5);
    items.push({ kind: "range", x0: r0, y0: D - 2, x1: r1, y1: D });
  } else rangeOff = "island";
  // island where 3.5 ft aisles fit
  const ix0 = b.x0 + (leg === "w" ? 2 + 3.5 : 1), ix1 = b.x1 - (leg === "e" ? 2 + 3.5 : 1);
  const iy1 = D - 2 - 3.5, iy0 = Math.max(b.y0 + 0.5, iy1 - 3);
  let island = null;
  if (iy1 - iy0 >= 2.5 && ix1 - ix0 >= 4.5) {
    const len = Math.min(8, ix1 - ix0);
    const cx = (ix0 + ix1) / 2;
    island = { kind: "island", x0: cx - len / 2, y0: iy0, x1: cx + len / 2, y1: iy1 };
    items.push(island);
  }
  if (rangeOff === "island" && island) {
    // a cooktop in the island when the run is too short for a range
    const cx = (island.x0 + island.x1) / 2, cy = (island.y0 + island.y1) / 2;
    items.push({ kind: "range", x0: cx - 1.25, y0: cy - 1, x1: cx + 1.25, y1: cy + 1 });
  }
  const counterLf = runLen + (leg ? legLen : 0) + (island ? island.x1 - island.x0 : 0);
  return { items, leg, counterLf, runLen };
}
