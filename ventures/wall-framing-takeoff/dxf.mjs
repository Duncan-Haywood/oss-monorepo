// @ts-check
// Floor plan in, wall plan out: reads an ASCII DXF whose wall centre lines sit
// on one layer and returns the plan object the takeoff takes (wall lengths,
// which walls meet at a corner, where partitions tee into a wall, and the
// openings marked on door and window layers). No typing of a plan by hand.
//
// What it assumes, because a DXF carries no meaning beyond lines:
//  - each wall is a centre line (LINE, LWPOLYLINE or POLYLINE) on a layer whose
//    name matches `wallLayer` (default /wall/i); collinear pieces that touch
//    or leave a gap no wider than `mergeGap` become one wall;
//  - an opening is a line (or polyline run) lying along a wall on a layer
//    matching `doorLayer` (/door/i) or `windowLayer` (/window|glaz/i); its
//    length is the rough opening width and its near end the offset;
//  - the exterior is the longest closed loop of walls that meet end to end.
// Heights, header sizes and jack counts are not in the file: defaults are
// applied and listed in `notes`. INSERT blocks (symbols) are counted, not read.

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ layer: string, a: Pt, b: Pt }} Seg */

/**
 * Parse an ASCII DXF into straight segments (inches are applied by the caller)
 * and the $INSUNITS header value.
 * @param {string} text
 * @returns {{ segs: Seg[], insunits: number, inserts: number, arcs: number, binary: boolean }}
 */
export function parseDxf(text) {
  if (text.startsWith("AutoCAD Binary DXF")) return { segs: [], insunits: 0, inserts: 0, arcs: 0, binary: true };
  const lines = text.split(/\r?\n/);
  /** @type {[number, string][]} */
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  let insunits = 0;
  for (let i = 0; i < pairs.length - 1; i++) if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS") insunits = parseInt(pairs[i + 1][1], 10) || 0;
  /** @type {Seg[]} */
  const segs = [];
  let inserts = 0, arcs = 0, inEntities = false;
  let i = 0;
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 2 && v === "ENTITIES") inEntities = true;
    if (c === 0 && v === "ENDSEC") inEntities = false;
    if (!(inEntities && c === 0)) { i++; continue; }
    // gather this entity's group codes up to the next code-0 pair
    let j = i + 1;
    while (j < pairs.length && pairs[j][0] !== 0) j++;
    const body = pairs.slice(i + 1, j);
    const get = (code) => body.find((p) => p[0] === code)?.[1];
    const layer = get(8) ?? "0";
    if (v === "LINE") {
      const n = (code) => parseFloat(get(code) ?? "NaN");
      const s = { layer, a: { x: n(10), y: n(20) }, b: { x: n(11), y: n(21) } };
      if ([s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite)) segs.push(s);
    } else if (v === "LWPOLYLINE") {
      const pts = [];
      for (let k = 0; k < body.length; k++) if (body[k][0] === 10) pts.push({ x: parseFloat(body[k][1]), y: parseFloat(body.slice(k + 1).find((p) => p[0] === 20)?.[1] ?? "NaN") });
      polySegs(segs, layer, pts, (parseInt(get(70) ?? "0", 10) & 1) === 1);
    } else if (v === "POLYLINE") {
      const closed = (parseInt(get(70) ?? "0", 10) & 1) === 1;
      const pts = [];
      let k = j;
      while (k < pairs.length && !(pairs[k][0] === 0 && pairs[k][1] === "SEQEND")) {
        if (pairs[k][0] === 0 && pairs[k][1] === "VERTEX") {
          let e = k + 1, x = NaN, y = NaN;
          while (e < pairs.length && pairs[e][0] !== 0) { if (pairs[e][0] === 10) x = parseFloat(pairs[e][1]); if (pairs[e][0] === 20) y = parseFloat(pairs[e][1]); e++; }
          pts.push({ x, y });
        }
        k++;
      }
      polySegs(segs, layer, pts, closed);
      j = k;
    } else if (v === "INSERT") inserts++;
    else if (v === "ARC" || v === "CIRCLE") arcs++;
    i = j;
  }
  return { segs, insunits, inserts, arcs, binary: false };
}

function polySegs(out, layer, pts, closed) {
  const ok = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  for (let k = 0; k + 1 < ok.length; k++) out.push({ layer, a: ok[k], b: ok[k + 1] });
  if (closed && ok.length > 2) out.push({ layer, a: ok[ok.length - 1], b: ok[0] });
}

const UNIT_IN = { 1: 1, 2: 12, 4: 1 / 25.4, 5: 1 / 2.54, 6: 100 / 2.54 };
const UNIT_NAME = { 1: "inches", 2: "feet", 4: "millimetres", 5: "centimetres", 6: "metres" };
const r16 = (v) => Math.round(v * 16) / 16;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Merge collinear pieces into whole walls. A wall: endpoints a->b in inches.
 * @param {Seg[]} segs
 * @param {number} angTol radians
 * @param {number} offTol inches off the line
 * @param {number} gap inches
 */
function mergeCollinear(segs, angTol, offTol, gap) {
  const items = segs
    .filter((s) => dist(s.a, s.b) > 1e-6)
    .map((s) => {
      let { a, b } = s;
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang < 0 || ang >= Math.PI) { ang = ((ang % Math.PI) + Math.PI) % Math.PI; [a, b] = [b, a]; }
      return { a, b, ang, used: false };
    });
  const walls = [];
  for (const it of items) {
    if (it.used) continue;
    it.used = true;
    const dx = Math.cos(it.ang), dy = Math.sin(it.ang);
    const nx = -dy, ny = dx;
    const off0 = it.a.x * nx + it.a.y * ny;
    const group = [it];
    for (const o of items) {
      if (o.used) continue;
      const da = Math.min(Math.abs(o.ang - it.ang), Math.PI - Math.abs(o.ang - it.ang));
      if (da > angTol) continue;
      if (Math.abs(o.a.x * nx + o.a.y * ny - off0) > offTol || Math.abs(o.b.x * nx + o.b.y * ny - off0) > offTol) continue;
      o.used = true;
      group.push(o);
    }
    const spans = group.map((g) => [g.a.x * dx + g.a.y * dy, g.b.x * dx + g.b.y * dy].sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]);
    let cur = spans[0].slice();
    const runs = [];
    for (const s of spans.slice(1)) {
      if (s[0] - cur[1] <= gap) cur[1] = Math.max(cur[1], s[1]);
      else { runs.push(cur); cur = s.slice(); }
    }
    runs.push(cur);
    const mean = group.reduce((t, g) => t + (g.a.x * nx + g.a.y * ny + g.b.x * nx + g.b.y * ny) / 2, 0) / group.length;
    for (const [t0, t1] of runs) walls.push({ a: { x: t0 * dx + mean * nx, y: t0 * dy + mean * ny }, b: { x: t1 * dx + mean * nx, y: t1 * dy + mean * ny } });
  }
  return walls;
}

/**
 * Architects draw a wall as two parallel lines (its faces), not one centre line.
 * Pair parallel runs `minT`..`maxT` inches apart that overlap along most of the
 * shorter one, and return the centre line of each pair: start and end are the
 * averages of the two lines' ends, which puts a mitred corner's inner and outer
 * faces back on the corner's centre. Runs on one face are first merged across
 * gaps up to `maxT` (a partition butting the face, or a door gap) so a face
 * broken by a tee still pairs with the unbroken one.
 * @param {Seg[]} segs
 * @param {{ minT: number, maxT: number, angTol: number }} o
 * @returns {{ segs: Seg[], pairs: number, single: number, thickness: number }}
 */
export function pairDoubleLines(segs, o) {
  const runs = mergeCollinear(segs, o.angTol, 0.25, o.maxT + 1).map((w) => {
    const L = dist(w.a, w.b), dx = (w.b.x - w.a.x) / L, dy = (w.b.y - w.a.y) / L;
    return { ...w, L, dx, dy, off: w.a.x * -dy + w.a.y * dx };
  });
  /** @type {{ i: number, j: number, ov: number, d: number }[]} */
  const cand = [];
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i], B = runs[j];
    const cross = Math.abs(A.dx * B.dy - A.dy * B.dx);
    if (cross > Math.sin(o.angTol)) continue;
    const d = Math.abs(B.off - A.off);
    if (d < o.minT || d > o.maxT) continue;
    const pa = [0, A.L], t = (p) => (p.x - A.a.x) * A.dx + (p.y - A.a.y) * A.dy;
    const pb = [t(B.a), t(B.b)].sort((p, q) => p - q);
    const ov = Math.min(pa[1], pb[1]) - Math.max(pa[0], pb[0]);
    if (ov < 0.5 * Math.min(A.L, B.L)) continue;
    cand.push({ i, j, ov, d });
  }
  cand.sort((p, q) => q.ov - p.ov);
  const used = new Set();
  /** @type {Seg[]} */
  const out = [];
  let pairs = 0, thick = 0;
  for (const c of cand) {
    if (used.has(c.i) || used.has(c.j)) continue;
    used.add(c.i); used.add(c.j);
    const A = runs[c.i], B = runs[c.j];
    const sameDir = A.dx * B.dx + A.dy * B.dy > 0;
    const b0 = sameDir ? B.a : B.b, b1 = sameDir ? B.b : B.a;
    out.push({ layer: "centre", a: { x: (A.a.x + b0.x) / 2, y: (A.a.y + b0.y) / 2 }, b: { x: (A.b.x + b1.x) / 2, y: (A.b.y + b1.y) / 2 } });
    pairs++; thick += c.d;
  }
  runs.forEach((r, k) => { if (!used.has(k)) out.push({ layer: "centre", a: r.a, b: r.b }); });
  return { segs: out, pairs, single: runs.length - 2 * pairs, thickness: pairs ? thick / pairs : 0 };
}

/**
 * @param {string} text ASCII DXF
 * @param {{ units?: "in"|"ft"|"mm"|"cm"|"m", wallLayer?: RegExp, doorLayer?: RegExp, windowLayer?: RegExp,
 *   snap?: number, mergeGap?: number, doubleLine?: boolean | "auto", doorHeight?: number, windowHeight?: number, header?: string,
 *   exteriorStud?: "2x4"|"2x6", interiorStud?: "2x4"|"2x6" }} [opt]
 * @returns {{ ok: boolean, errors: string[], notes: string[], plan?: any, stats?: any }}
 */
export function planFromDxf(text, opt = {}) {
  const wallLayer = opt.wallLayer ?? /wall/i, doorLayer = opt.doorLayer ?? /door/i, windowLayer = opt.windowLayer ?? /window|glaz/i;
  const snap = opt.snap ?? 3, mergeGap = opt.mergeGap ?? 1;
  const notes = [];
  const parsed = parseDxf(text);
  if (parsed.binary) return { ok: false, errors: ["This is a binary DXF; save it as ASCII DXF (R12 to 2018) and try again."], notes };
  let scale;
  const named = { in: 1, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 100 / 2.54 };
  if (opt.units) scale = named[opt.units];
  else if (UNIT_IN[parsed.insunits]) { scale = UNIT_IN[parsed.insunits]; notes.push(`Drawing units read from the file: ${UNIT_NAME[parsed.insunits]}.`); }
  else { scale = 1; notes.push("The file does not say its units ($INSUNITS is 0 or absent); read as inches. Pass units to override and check one wall length."); }
  if (!scale) return { ok: false, errors: [`Unknown units "${opt.units}" (in, ft, mm, cm, m).`], notes };
  const sc = (s) => ({ layer: s.layer, a: { x: s.a.x * scale, y: s.a.y * scale }, b: { x: s.b.x * scale, y: s.b.y * scale } });
  const all = parsed.segs.map(sc);
  const wallSegs = all.filter((s) => wallLayer.test(s.layer));
  if (!wallSegs.length) {
    const layers = [...new Set(all.map((s) => s.layer))];
    return { ok: false, errors: [`No lines on a layer matching ${wallLayer}. Layers with lines: ${layers.join(", ") || "none"}.`], notes };
  }
  if (parsed.inserts) notes.push(`${parsed.inserts} block INSERT${parsed.inserts === 1 ? "" : "s"} (door or window symbols) skipped: mark openings as lines on a door or window layer.`);
  if (parsed.arcs) notes.push(`${parsed.arcs} arc or circle entit${parsed.arcs === 1 ? "y" : "ies"} skipped (door swings and curved walls are not read).`);

  let centreSegs = wallSegs, snapW = snap;
  const dl = opt.doubleLine ?? "auto";
  if (dl !== false) {
    const r = pairDoubleLines(wallSegs, { minT: 2.5, maxT: 14, angTol: 0.5 * Math.PI / 180 });
    const total = r.pairs + r.single;
    if (dl === true ? r.pairs > 0 : r.pairs >= 3 && r.pairs >= 0.6 * total) {
      centreSegs = r.segs;
      snapW = Math.max(snap, r.thickness / 2 + 0.75);
      notes.push(`Double-line walls: ${r.pairs} wall${r.pairs === 1 ? "" : "s"} drawn as two face lines (mean thickness ${Math.round(r.thickness * 10) / 10} in) read as centre lines${r.single ? `; ${r.single} single line${r.single === 1 ? "" : "s"} kept as drawn` : ""}. Partition lengths run face to face of the walls they meet. Turn off with doubleLine: false (CLI --single-line).`);
    } else if (dl === true) notes.push("doubleLine was asked for but no parallel pair of wall lines 2.5 to 14 in apart was found; lines read as centre lines.");
  }
  const walls = mergeCollinear(centreSegs, 0.5 * Math.PI / 180, snapW, mergeGap).filter((w) => dist(w.a, w.b) >= 12);
  if (!walls.length) return { ok: false, errors: ["No wall is longer than 12 inches after merging."], notes };

  // Joints. For each pair of non-parallel walls, where do their lines cross and what does each wall do there?
  /** @type {{ i: number, ei: 0|1, j: number, ej: 0|1 }[]} */
  const corners = [];
  /** @type {{ stem: number, end: 0|1, through: number, at: number }[]} */
  const tees = [];
  const crossings = [];
  const param = (w, p) => ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / dist(w.a, w.b);
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const A = walls[i], B = walls[j];
    const d1 = { x: A.b.x - A.a.x, y: A.b.y - A.a.y }, d2 = { x: B.b.x - B.a.x, y: B.b.y - B.a.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9 * dist(A.a, A.b) * dist(B.a, B.b)) continue;
    const t = ((B.a.x - A.a.x) * d2.y - (B.a.y - A.a.y) * d2.x) / den;
    const P = { x: A.a.x + t * d1.x, y: A.a.y + t * d1.y };
    const la = dist(A.a, A.b), lb = dist(B.a, B.b), pa = param(A, P), pb = param(B, P);
    const endA = pa <= snapW ? 0 : pa >= la - snapW ? 1 : -1, endB = pb <= snapW ? 0 : pb >= lb - snapW ? 1 : -1;
    const insideA = pa > snapW && pa < la - snapW, insideB = pb > snapW && pb < lb - snapW;
    if (endA >= 0 && endB >= 0 && pa >= -snapW && pa <= la + snapW && pb >= -snapW && pb <= lb + snapW) corners.push({ i, ei: /** @type {0|1} */ (endA), j, ej: /** @type {0|1} */ (endB) });
    else if (endA >= 0 && insideB && pa >= -snapW && pa <= la + snapW) tees.push({ stem: i, end: /** @type {0|1} */ (endA), through: j, at: pb });
    else if (endB >= 0 && insideA && pb >= -snapW && pb <= lb + snapW) tees.push({ stem: j, end: /** @type {0|1} */ (endB), through: i, at: pa });
    else if (insideA && insideB) crossings.push([i, j]);
  }
  if (crossings.length) notes.push(`${crossings.length} pair${crossings.length === 1 ? "" : "s"} of walls cross mid-wall (an X junction); the engine has no cross joint, so split one of them at the crossing in the drawing.`);

  // Exterior: the longest loop of walls joined end to end by corners.
  /** @type {Map<string, {w:number, e:0|1}>} */
  const link = new Map();
  const ambiguous = new Set();
  for (const c of corners) {
    for (const [k, other] of [[`${c.i}:${c.ei}`, { w: c.j, e: c.ej }], [`${c.j}:${c.ej}`, { w: c.i, e: c.ei }]]) {
      if (link.has(k)) ambiguous.add(k); else link.set(k, other);
    }
  }
  if (ambiguous.size) notes.push(`${ambiguous.size} wall end${ambiguous.size === 1 ? "" : "s"} touch more than one wall; those joints were not used for the exterior loop.`);
  let best = null;
  const seen = new Set();
  for (let s = 0; s < walls.length; s++) {
    if (seen.has(s)) continue;
    const loop = [];
    let w = s, enter = /** @type {0|1} */ (0), closed = false;
    // walk: enter at `enter`, leave by the other end
    for (let n = 0; n <= walls.length; n++) {
      const leave = /** @type {0|1} */ (enter === 0 ? 1 : 0);
      loop.push({ w, flip: enter === 1 });
      const nx = ambiguous.has(`${w}:${leave}`) ? undefined : link.get(`${w}:${leave}`);
      if (!nx || ambiguous.has(`${nx.w}:${nx.e}`)) break;
      if (nx.w === loop[0].w) { closed = nx.e === 0 && loop.length >= 3; break; }
      if (loop.some((l) => l.w === nx.w)) break;
      w = nx.w; enter = nx.e;
    }
    for (const l of loop) seen.add(l.w);
    if (closed) {
      const per = loop.reduce((t, l) => t + dist(walls[l.w].a, walls[l.w].b), 0);
      if (!best || per > best.per) best = { loop, per };
    }
  }
  const order = [];
  if (best) {
    for (const l of best.loop) order.push({ w: l.w, flip: l.flip, ext: true });
    const inLoop = new Set(best.loop.map((l) => l.w));
    walls.forEach((_, k) => { if (!inLoop.has(k)) order.push({ w: k, flip: false, ext: false }); });
  } else {
    notes.push("No closed exterior loop found (walls do not meet end to end all the way round); no wall is marked as a corner. Check for gaps larger than the snap distance or an open outline.");
    walls.forEach((_, k) => order.push({ w: k, flip: false, ext: false }));
  }
  const dirs = order.map((o) => {
    const W = walls[o.w];
    return o.flip ? { a: W.b, b: W.a } : { a: W.a, b: W.b };
  });
  const idx = new Map(order.map((o, n) => [o.w, n]));
  const names = order.map((o, n) => (o.ext ? `Ext ${n + 1}` : `Int ${n - (best ? best.loop.length : 0) + 1}`));
  // A raw end index (0 = a, 1 = b) becomes start/end in the walking direction.
  const walkEnd = (w, e) => (order[idx.get(w)].flip ? 1 - e : e);
  const skew = [];
  if (best) for (const l of best.loop) {
    const n = best.loop[(best.loop.indexOf(l) + 1) % best.loop.length];
    const u = walls[l.w], v = walls[n.w];
    const cos = Math.abs(((u.b.x - u.a.x) * (v.b.x - v.a.x) + (u.b.y - u.a.y) * (v.b.y - v.a.y)) / (dist(u.a, u.b) * dist(v.a, v.b)));
    if (cos > 0.05) skew.push(names[idx.get(l.w)]);
  }
  if (skew.length) notes.push(`Corner not square after ${skew.join(", ")}: the engine's lap rules assume 90 degrees.`);

  const out = order.map((o, n) => {
    const W = dirs[n];
    const length = r16(dist(W.a, W.b));
    /** @type {any} */
    const wall = { id: names[n], length, stud: o.ext ? (opt.exteriorStud ?? "2x4") : (opt.interiorStud ?? "2x4") };
    if (o.ext) { wall.corner = true; wall.treatedPlate = true; } else wall.sheathed = false;
    return wall;
  });

  // Tees: stems carry `tee`, through walls list the centre. A stem end that touches nothing is a free end.
  /** @type {Set<string>} */
  const touched = new Set();
  for (const c of corners) { touched.add(`${c.i}:${c.ei}`); touched.add(`${c.j}:${c.ej}`); }
  for (const t of tees) {
    touched.add(`${t.stem}:${t.end}`);
    const tn = idx.get(t.through), sn = idx.get(t.stem);
    const through = order[tn];
    const at = r16(through.flip ? dist(walls[t.through].a, walls[t.through].b) - t.at : t.at);
    (out[tn].tees ||= []).push(at);
    if (!out[sn].tee) out[sn].tee = { wall: names[tn], at, end: walkEnd(t.stem, t.end) === 0 ? "start" : "end" };
  }
  for (const w of out) if (w.tees) w.tees.sort((p, q) => p - q);
  order.forEach((o, n) => {
    if (o.ext) return;
    const free = [0, 1].filter((e) => !touched.has(`${o.w}:${e}`)).length;
    if (free) out[n].freeEnds = free;
  });

  // Openings: lines on door/window layers lying along a wall.
  let placed = 0;
  const unplaced = [];
  const bar = [...all.filter((s) => doorLayer.test(s.layer) || windowLayer.test(s.layer))];
  const op = mergeCollinear(bar.map((s) => ({ ...s })), 0.5 * Math.PI / 180, snap, 0.5);
  for (const s of bar) s.layer; // layers kept per original segment below
  const kindOf = (mid) => {
    let best = null;
    for (const s of bar) {
      const d = pointSeg(mid, s);
      if (!best || d < best.d) best = { d, layer: s.layer };
    }
    return best && windowLayer.test(best.layer) && !doorLayer.test(best.layer) ? "window" : "door";
  };
  const counts = { door: 0, window: 0 };
  for (const o of op) {
    const mid = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
    let host = -1, hd = snap * 2;
    for (let k = 0; k < walls.length; k++) {
      const W = walls[k];
      const p = param(W, mid), L = dist(W.a, W.b);
      if (p < 0 || p > L) continue;
      const h = Math.abs((mid.x - W.a.x) * (W.b.y - W.a.y) - (mid.y - W.a.y) * (W.b.x - W.a.x)) / L;
      if (h < hd) { hd = h; host = k; }
    }
    const width = r16(dist(o.a, o.b));
    if (host < 0) { unplaced.push(`${width} in ${kindOf(mid)}`); continue; }
    const n = idx.get(host), W = walls[host], L = dist(W.a, W.b);
    const p0 = param(W, o.a), p1 = param(W, o.b);
    const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
    const off = r16(order[n].flip ? L - hi : lo);
    const kind = kindOf(mid);
    counts[kind]++;
    const height = kind === "door" ? (opt.doorHeight ?? 82.5) : (opt.windowHeight ?? 48);
    (out[n].openings ||= []).push({ kind, label: `${kind === "door" ? "Door" : "Window"} ${counts[kind]}`, offset: Math.max(0, off), width, height, header: opt.header ?? "2x10" });
    placed++;
  }
  for (const w of out) if (w.openings) w.openings.sort((p, q) => p.offset - q.offset);
  if (unplaced.length) notes.push(`${unplaced.length} opening line${unplaced.length === 1 ? "" : "s"} not along any wall (${unplaced.slice(0, 3).join(", ")}${unplaced.length > 3 ? ", ..." : ""}) were dropped.`);
  if (placed) notes.push(`Opening heights are defaults, not read from the file: doors ${opt.doorHeight ?? 82.5} in, windows ${opt.windowHeight ?? 48} in tall. Every header is ${opt.header ?? "2x10"} as a placeholder; set them for your span table.`);
  else notes.push("No opening lines found on a layer matching " + `${doorLayer} or ${windowLayer}` + ": the plan has solid walls.");
  notes.push("Lengths are the drawn centre-line lengths. If your drawing is to the outside of the framing, take the wall depth off at corners before ordering.");

  const plan = { walls: out };
  const ext = out.filter((w) => w.corner).length;
  return { ok: true, errors: [], notes, plan, stats: { walls: out.length, exterior: ext, interior: out.length - ext, tees: tees.length, openings: placed, crossings: crossings.length } };
}

function pointSeg(p, s) {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}
