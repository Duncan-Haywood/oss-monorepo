// @ts-check
// Floor-plan generation: a single-storey house on a rectangle, laid out as
// zones along the street front.
//
//   [garage] [great room] [bedroom wing]          linear plan
//   [primary suite] [great room] [bedroom wing]   split plan
//   [great room] [stack]                          studios and one-bedroom cottages
//
// The great room holds living, dining and kitchen (open plan). The wing is a
// hall with a row of rooms on each side (double-loaded), optionally ending in
// a full-depth primary suite. A stack is rooms piled front to back, each
// opening onto the great room. Every room is a rectangle or an L on a 6 in
// grid. The search (search.mjs) enumerates the parameters below and keeps the
// best-scoring skeletons.

import { rect, cutCorner, clean, q, bbox, area as polyArea } from "./geom.mjs";

export const T_EXT = 6.5 / 12; // 2x6 stud, sheathing, gypsum
export const T_INT = 4.5 / 12; // 2x4 stud, gypsum both sides

// Widths along the row (u) in ft: min, preferred, cap. Rows run between the hall and an outside wall.
export const CELL = {
  primary: { min: 12, pref: 13.5, cap: 16, depth: 11 },
  bed: { min: 10, pref: 11.5, cap: 15, depth: 10 },
  bath: { min: 5.5, pref: 5.5, cap: 8.5, depth: 8 },
  abath: { min: 8, pref: 8.5, cap: 10, depth: 9 }, // room for a 5 ft turning circle
  half: { min: 4, pref: 4.5, cap: 6, depth: 5 },
  // laundry with the water heater and air handler beside the machines
  laundry: { min: 6, pref: 6.5, cap: 8.5, depth: 7 },
  // added only when a row's rooms cannot stretch to the row's length
  linen: { min: 2, pref: 3, cap: 6, depth: 2 },
};
export const WET = new Set(["bath", "abath", "ensuite", "half", "laundry", "kitchen", "mud"]);
export const HABITABLE = new Set(["living", "dining", "kitchen", "bed", "primary"]);
export const SLEEP = new Set(["bed", "primary"]);

export const NAMES = {
  living: "Living", dining: "Dining", kitchen: "Kitchen", bed: "Bedroom", primary: "Primary bedroom",
  bath: "Bath", ensuite: "Primary bath", half: "Powder", laundry: "Laundry / mech.", hall: "Hall",
  closet: "Clo.", linen: "Linen", wic: "Walk-in closet", garage: "Garage", mud: "Mudroom / laundry",
};

/** The rooms a brief asks for, split into what goes where. */
export function program(brief) {
  const full = Math.floor(brief.baths);
  const half = brief.baths % 1 ? 1 : 0;
  const beds = brief.beds;
  const laundryInMud = brief.garage > 0 && beds >= 2; // small houses enter from the garage straight into the kitchen
  if (beds <= 1) {
    const stack = [];
    if (beds === 1) stack.push("bed");
    stack.push("bath");
    if (half && beds === 1) stack.push("half");
    if (!laundryInMud) stack.push("laundry");
    if (beds === 0) stack.push("closet");
    return { kind: "small", stack, ensuite: false, cells: [], beds, full, half, accessible: brief.accessible };
  }
  const ensuite = full >= 2;
  const cells = [];
  const nRowBeds = ensuite ? beds - 1 : beds;
  for (let i = 0; i < nRowBeds; i++) cells.push(!ensuite && i === 0 ? "primary" : "bed");
  for (let i = 0; i < full - (ensuite ? 1 : 0); i++) cells.push(brief.accessible && i === 0 ? "abath" : "bath");
  if (half) cells.push("half");
  // with a garage the machines go in the mudroom and the water heater and air handler in the garage
  if (!laundryInMud) cells.push("laundry");
  return { kind: "wing", cells, ensuite, beds, full, half };
}

/**
 * Ways to split the wing's cells between the front and back rows, best first.
 * A cheap pre-score: balanced minimum widths, wet rooms across the hall from
 * each other, bedrooms split between rows.
 */
export function rowSplits(cells, keep = 4) {
  const n = cells.length;
  const out = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const front = [], back = [];
    for (let i = 0; i < n; i++) (mask >> i) & 1 ? back.push(cells[i]) : front.push(cells[i]);
    if (n >= 2 && (!front.length || !back.length)) continue;
    const key = [front.slice().sort().join(","), back.slice().sort().join(",")].join("|");
    if (out.some((o) => o.key === key)) continue;
    const minF = front.reduce((s, c) => s + CELL[c].min, 0), minB = back.reduce((s, c) => s + CELL[c].min, 0);
    const prefF = front.reduce((s, c) => s + CELL[c].pref, 0), prefB = back.reduce((s, c) => s + CELL[c].pref, 0);
    const wetF = front.filter((c) => WET.has(c)).length, wetB = back.filter((c) => WET.has(c)).length;
    const bedsF = front.filter((c) => SLEEP.has(c)).length, bedsB = back.filter((c) => SLEEP.has(c)).length;
    const score = Math.abs(prefF - prefB) + 0.5 * Math.abs(minF - minB) + (wetF && wetB ? -2 : 0) + 2 * Math.abs(bedsF - bedsB);
    out.push({ key, front, back, score });
  }
  out.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
  return out.slice(0, keep);
}

/** Order a row: wet cells together at the hall's start (near the great room) or end. */
function orderRow(row, wetAt) {
  const wet = row.filter((c) => !SLEEP.has(c));
  const dry = row.filter((c) => SLEEP.has(c));
  // mech next to the wet rooms keeps ducts and the water heater short
  const rank = ["half", "abath", "bath", "laundry"];
  wet.sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
  return wetAt === "start" ? [...wet, ...dry] : [...dry, ...wet.reverse()];
}

/** Widths for a row of cells that must total L exactly, or null. */
export function fitRow(row, L) {
  const w = row.map((c) => CELL[c].pref);
  let total = w.reduce((a, b) => a + b, 0);
  // shrink toward minimums, beds last
  if (total > L + 1e-9) {
    const order = row.map((c, i) => i).sort((a, b) => (SLEEP.has(row[a]) ? 1 : 0) - (SLEEP.has(row[b]) ? 1 : 0));
    for (const i of order) {
      const cut = Math.min(w[i] - CELL[row[i]].min, total - L);
      w[i] -= cut; total -= cut;
      if (total <= L + 1e-9) break;
    }
    if (total > L + 1e-9) return null;
  }
  // grow: bedrooms first (primary twice as fast), then the rest to their caps
  let extra = L - total;
  for (const group of [row.map((c, i) => i).filter((i) => SLEEP.has(row[i])), row.map((c, i) => i).filter((i) => !SLEEP.has(row[i]))]) {
    for (let guard = 0; extra > 1e-9 && guard < 200; guard++) {
      const open = group.filter((i) => w[i] < CELL[row[i]].cap - 1e-9);
      if (!open.length) break;
      const wt = open.map((i) => (row[i] === "primary" ? 2 : 1));
      const sw = wt.reduce((a, b) => a + b, 0);
      let used = 0;
      open.forEach((i, k) => {
        const add = Math.min(CELL[row[i]].cap - w[i], (extra * wt[k]) / sw);
        w[i] += add; used += add;
      });
      extra -= used;
      if (used < 1e-9) break;
    }
  }
  if (extra > 1e-6) return null;
  // snap to the grid, putting rounding into the widest bedroom (or widest cell)
  const s = w.map(q);
  const diff = L - s.reduce((a, b) => a + b, 0);
  let k = 0;
  for (let i = 1; i < s.length; i++) if ((SLEEP.has(row[i]) ? 100 : 0) + s[i] > (SLEEP.has(row[k]) ? 100 : 0) + s[k]) k = i;
  s[k] += diff;
  if (s.some((v, i) => v < CELL[row[i]].min - 1e-9)) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Skeleton: zones and rooms from parameters.

let uid = 0;
function room(kind, poly, extra = {}) {
  return { id: `${kind}-${++uid}`, kind, name: NAMES[kind], poly: clean(poly), ...extra };
}

/**
 * Build the rooms of one candidate. p holds:
 *  D, arrangement ('linear' | 'split' | 'small'), Wg (garage width), Wq (great
 *  room width), suite { w, bedBack } or null, Lw (wing length), df (front row
 *  depth), hall (width), split (row split), wetAt, pub { layout:'P1'|'P2', kd,
 *  kw, kitchenSide:'wing'|'far' }, stack { w, order }.
 * Returns { W, D, rooms, zones, links } or null when a constraint fails.
 */
export function buildSkeleton(p, prog, why = null) {
  uid = 0;
  const fail = (reason) => { if (why) why[reason] = (why[reason] || 0) + 1; return null; };
  const D = p.D;
  const rooms = [];
  const links = []; // [roomA, roomB, kind]: 'door' | 'open' | 'cased'
  const zones = [];
  let x = 0;
  let garage = null;
  if (p.Wg > 0) {
    garage = room("garage", rect(0, 0, p.Wg, D));
    rooms.push(garage);
    zones.push({ kind: "garage", x0: 0, x1: p.Wg });
    x = p.Wg;
  }
  let suiteZone = null;
  if (p.arrangement === "split") {
    suiteZone = { kind: "suite", x0: x, x1: x + p.suite.w };
    zones.push(suiteZone);
    x += p.suite.w;
  }
  const pubZone = { kind: "public", x0: x, x1: x + p.Wq };
  zones.push(pubZone);
  x += p.Wq;
  const wingZone = { kind: p.arrangement === "small" ? "stack" : "wing", x0: x, x1: x + p.Lw };
  zones.push(wingZone);
  x += p.Lw;
  const W = x;

  // --- great room (local u runs from the wing side toward x0) ---
  const pu = (u) => pubZone.x1 - u; // u -> x
  const pub = p.pub;
  const kd = pub.kd;
  const yk = D - kd; // living occupies y in [0, yk]
  if (yk < 10.5) return fail("yk < 10.5");
  const pubRooms = {};
  let mud = null;
  let backU0 = 0, backU1 = p.Wq; // back strip available for kitchen and dining
  if (garage && prog.kind === "small") {
    // no mudroom: the garage door opens into the kitchen (or the living room)
  } else if (garage) {
    const mw = 7;
    mud = room("mud", rect(pu(p.Wq - mw), yk, pu(p.Wq), D));
    rooms.push(mud);
    backU1 = p.Wq - mw;
    links.push([garage.id, mud.id, "door"]);
  }
  if (pub.layout === "P1") {
    const span = backU1 - backU0;
    const kw = pub.kw;
    if (kw < 10 || span - kw < 9.5) return fail("kw < 10 || span - kw < 9.5");
    let k0, k1, d0, d1;
    if (pub.kitchenSide === "wing") { k0 = backU0; k1 = backU0 + kw; d0 = k1; d1 = backU1; }
    else { k1 = backU1; k0 = backU1 - kw; d0 = backU0; d1 = k0; }
    pubRooms.living = room("living", rect(pu(0), 0, pu(p.Wq), yk));
    pubRooms.kitchen = room("kitchen", rect(pu(k0), yk, pu(k1), D));
    pubRooms.dining = room("dining", rect(pu(d0), yk, pu(d1), D));
    rooms.push(pubRooms.living, pubRooms.kitchen, pubRooms.dining);
    links.push([pubRooms.living.id, pubRooms.kitchen.id, "open"], [pubRooms.living.id, pubRooms.dining.id, "open"], [pubRooms.kitchen.id, pubRooms.dining.id, "open"]);
    if (mud) links.push([mud.id, pub.kitchenSide === "far" ? pubRooms.kitchen.id : pubRooms.dining.id, "cased"]);
  } else {
    // P2: kitchen across the back, living and dining together at the front
    if (backU1 - backU0 < 9 || backU1 - backU0 > 22) return fail("backU1 - backU0 < 9 || backU1 - backU0 > 22");
    pubRooms.living = room("living", rect(pu(0), 0, pu(p.Wq), yk), { name: "Living / dining" });
    pubRooms.kitchen = room("kitchen", rect(pu(backU0), yk, pu(backU1), D));
    rooms.push(pubRooms.living, pubRooms.kitchen);
    links.push([pubRooms.living.id, pubRooms.kitchen.id, "open"]);
    if (mud) links.push([mud.id, pubRooms.kitchen.id, "cased"]);
  }
  const great = pubRooms;
  if (garage && !mud) links.push([garage.id, great.kitchen.id, "door"]);

  // --- primary suite (split plan or end of wing) ---
  // local u from the side it is entered from; toX maps u to x.
  const buildSuite = (toX, w, bedBack, entryRoom, entryY) => {
    const bedDepth = Math.min(16, Math.max(12, D - 8.5));
    const bd = D - bedDepth; // depth of the bath + closet strip
    if (bd < 8 || w < 12) return fail("bd < 8 || w < 12");
    const wic = Math.min(7, Math.max(5, q(w * 0.4)));
    const bathW = w - wic;
    if (bathW < 6.5) return fail("bathW < 6.5");
    const [by0, by1] = bedBack ? [bd, D] : [0, bedDepth];
    const [sy0, sy1] = bedBack ? [0, bd] : [bedDepth, D];
    if (entryY[0] < by0 - 1e-9 || entryY[1] > by1 + 1e-9) return fail("entryY[0] < by0 - 1e-9 || entryY[1] > by1 + 1e-9");
    const bed = room("primary", rect(toX(0), by0, toX(w), by1));
    const wicR = room("wic", rect(toX(0), sy0, toX(wic), sy1));
    const ens = room("ensuite", rect(toX(wic), sy0, toX(w), sy1));
    rooms.push(bed, wicR, ens);
    links.push([bed.id, wicR.id, "door"], [bed.id, ens.id, "door"], [entryRoom.id, bed.id, "door"]);
    return { bed, wic: wicR, ens, entryY };
  };

  let suite = null;
  if (p.arrangement === "split") {
    // entered from the great room's living area
    const y0 = 3, y1 = Math.min(yk, D) - 1;
    const toX = (u) => suiteZone.x1 - u;
    const bedDepth = Math.min(16, Math.max(12, D - 8.5));
    const [by0, by1] = p.suite.bedBack ? [D - bedDepth, D] : [0, bedDepth];
    const e0 = Math.max(y0, by0 + 0.5), e1 = Math.min(y1, by1 - 0.5);
    if (e1 - e0 < 3) return fail("e1 - e0 < 3");
    suite = buildSuite(toX, p.suite.w, p.suite.bedBack, great.living, [e0, e1]);
    if (!suite) return fail("!suite");
  }

  // --- wing or stack ---
  const wu = (u) => wingZone.x0 + u;
  const wing = { hall: null, front: [], back: [] };
  if (p.arrangement === "small") {
    // stack: cells front to back, each opening onto the great room
    const order = p.stack.order;
    const fixed = { bath: prog.accessible ? 8.5 : 7.5, half: 5, laundry: 6 };
    const flexKind = order.includes("bed") ? "bed" : "closet";
    const depths = order.map((c) => (c === flexKind ? null : fixed[c]));
    const fixedSum = depths.reduce((s, v) => s + (v || 0), 0);
    const flex = D - fixedSum;
    if (flexKind === "bed" && flex < 11) return fail("flexKind === 'bed' && flex < 11");
    if (flexKind === "closet" && (flex < 3 || flex > 8)) return fail("flexKind === 'closet' && (flex < 3 || flex > 8)");
    depths[order.indexOf(flexKind)] = flex;
    let y = 0;
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      const d = depths[i];
      let r;
      if (c === "bed") {
        // closet against the next cell, at the outer wall
        const cw = Math.min(6, p.Lw - 4);
        const toBack = i + 1 < order.length; // closet on the side away from the outside wall if possible
        const cy0 = toBack ? y + d - 2 : y, cy1 = toBack ? y + d : y + 2;
        const cl = { x0: wu(p.Lw - cw), y0: cy0, x1: wu(p.Lw), y1: cy1 };
        r = room("bed", cutCorner({ x0: wu(0), y0: y, x1: wu(p.Lw), y1: y + d }, cl), { name: "Bedroom" });
        const closet = room("closet", rect(cl.x0, cl.y0, cl.x1, cl.y1), { owner: r.id });
        rooms.push(r, closet);
        links.push([r.id, closet.id, "closet"]);
      } else {
        r = room(c, rect(wu(0), y, wu(p.Lw), y + d), c === "closet" ? { name: "Storage" } : {});
        rooms.push(r);
      }
      // door to whichever great-room space shares this wall
      const host = y + d / 2 < yk ? great.living : (great.kitchen || great.living);
      links.push([host.id, r.id, c === "laundry" || c === "closet" ? "bifold" : "door"]);
      wing.front.push(r);
      y += d;
    }
  } else {
    const hw = p.hall;
    const df = p.df;
    const db = D - df - hw;
    const endW = p.arrangement === "linear" && p.suite ? p.suite.w : 0;
    const L = p.Lw - endW;
    if (L < 3) return fail("L < 3");
    const hallY = [df, df + hw];
    // the hall must open onto the living area, not the kitchen
    if (df + hw > yk - 0.5) return fail("hall meets kitchen");
    for (const [row, dep] of [[p.split.front, df], [p.split.back, db]]) {
      for (const c of row) if (dep < CELL[c].depth) return fail(`row too shallow for ${c}`);
      if (dep > 16.5) return fail("dep > 16.5");
    }
    const hall = room("hall", rect(wu(0), df, wu(L), df + hw));
    rooms.push(hall);
    wing.hall = hall;
    links.push([great.living.id, hall.id, "open"]);
    for (const [rowName, row0, y0, y1] of [["front", p.split.front, 0, df], ["back", p.split.back, df + hw, D]]) {
      if (!row0.length) continue;
      let row = orderRow(row0, p.wetAt);
      let widths = fitRow(row, L);
      if (!widths) {
        // a linen closet takes up length the rooms cannot
        row = p.wetAt === "start" ? ["linen", ...row] : [...row, "linen"];
        widths = fitRow(row, L);
      }
      if (!widths) return fail("row does not fit");
      let u = 0;
      row.forEach((c, i) => {
        const w = widths[i];
        const cell = { x0: wu(u), y0, x1: wu(u + w), y1 };
        let r;
        if (SLEEP.has(c)) {
          // reach-in closet along the hall wall, at the cell's far end; the door takes the near end
          const cw = Math.min(c === "primary" ? 8 : 7, w - 3.5);
          const atHall = rowName === "front" ? [y1 - 2, y1] : [y0, y0 + 2];
          const farEnd = [cell.x1 - cw, cell.x1];
          const cl = { x0: farEnd[0], y0: atHall[0], x1: farEnd[1], y1: atHall[1] };
          r = room(c, cutCorner(cell, cl));
          const closet = room("closet", rect(cl.x0, cl.y0, cl.x1, cl.y1), { owner: r.id });
          rooms.push(r, closet);
          links.push([r.id, closet.id, "closet"]);
        } else {
          r = c === "abath" ? room("bath", rect(cell.x0, cell.y0, cell.x1, cell.y1), { accessible: true }) : room(c, rect(cell.x0, cell.y0, cell.x1, cell.y1));
          rooms.push(r);
        }
        links.push([hall.id, r.id, c === "laundry" || c === "linen" ? "bifold" : "door"]);
        wing[rowName].push(r);
        u += w;
      });
    }
    if (endW) {
      const toX = (u) => wu(L + u);
      suite = buildSuite(toX, endW, p.suite.bedBack, hall, hallY);
      if (!suite) return fail("!suite");
    }
  }

  // number the bedrooms
  let n = 2;
  for (const r of rooms) if (r.kind === "bed") r.name = prog.beds === 1 ? "Bedroom" : `Bedroom ${n++}`;
  if (prog.beds >= 2 && !rooms.some((r) => r.kind === "primary")) {
    const beds = rooms.filter((r) => r.kind === "bed").sort((a, b) => polyArea(b.poly) - polyArea(a.poly));
    if (beds[0]) { beds[0].kind = "primary"; beds[0].name = NAMES.primary; }
  }
  // closets carry their owner's name
  for (const r of rooms) if (r.kind === "closet") r.name = NAMES.closet;
  let nb = 0;
  const baths = rooms.filter((r) => r.kind === "bath");
  for (const r of baths) r.name = baths.length > 1 ? `Bath ${++nb}` : "Bath";

  return { W, D, rooms, links, zones, great, suite, wing, garage, mud, p };
}

/** Floor area (gross, to the outside of the walls) of the conditioned part and of the garage. */
export function grossAreas(sk) {
  const garageW = sk.p.Wg || 0;
  return { conditioned: (sk.W - garageW) * sk.D, garage: garageW * sk.D };
}

/** Clear (net) size of a rectangular room, deducting walls: exterior full thickness, partitions half. */
export function netBox(sk, r) {
  const b = bbox(r.poly);
  const ext = (v, edge) => Math.abs(v - edge) < 1e-6;
  const open = sk.openSides ? sk.openSides.get(r.id) : null;
  const side = (key, isExt) => (open && open.has(key) ? 0 : isExt ? T_EXT : T_INT / 2);
  const x0 = b.x0 + side("w", ext(b.x0, 0));
  const x1 = b.x1 - side("e", ext(b.x1, sk.W));
  const y0 = b.y0 + side("s", ext(b.y0, 0));
  const y1 = b.y1 - side("n", ext(b.y1, sk.D));
  return { w: x1 - x0, d: y1 - y0, x0, x1, y0, y1 };
}
