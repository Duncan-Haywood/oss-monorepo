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
/** @typedef {{ layer: string, a: Pt, b: Pt, poly?: number }} Seg */

/**
 * Parse an ASCII DXF into straight segments (inches are applied by the caller)
 * and the $INSUNITS header value.
 * @param {string} text
 * @returns {{ segs: Seg[], polys: { id: number, layer: string, pts: Pt[] }[], insunits: number, inserts: number, arcs: number, binary: boolean, blocks: Record<string, any>, insertList: any[], arcList: any[] }}
 */
export function parseDxf(text) {
  if (text.startsWith("AutoCAD Binary DXF")) return { segs: [], polys: [], insunits: 0, inserts: 0, arcs: 0, binary: true, blocks: {}, insertList: [], arcList: [] };
  const lines = text.split(/\r?\n/);
  /** @type {[number, string][]} */
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  let insunits = 0;
  for (let i = 0; i < pairs.length - 1; i++) if (pairs[i][0] === 9 && pairs[i][1] === "$INSUNITS") insunits = parseInt(pairs[i + 1][1], 10) || 0;
  /** @type {Seg[]} */
  const segs = [];
  /** closed four-point polylines, kept whole so a wall drawn as a rectangle can be read as one */
  const polys = [];
  let inserts = 0, arcs = 0, inEntities = false, inBlocks = false;
  /** block name -> bounding box of its LINE, LWPOLYLINE, ARC and CIRCLE entities, relative to the block's base point */
  const blocks = {};
  const rawBlocks = {};
  /** @type {{ name: string, layer: string, x: number, y: number, sx: number, sy: number, rot: number }[]} */
  const insertList = [];
  /** @type {{ layer: string, x: number, y: number, r: number }[]} */
  const arcList = [];
  let curBlock = null;
  let i = 0;
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 2 && v === "ENTITIES") inEntities = true;
    if (c === 2 && v === "BLOCKS") inBlocks = true;
    if (c === 0 && v === "ENDSEC") { inEntities = false; inBlocks = false; }
    if (inBlocks && c === 0) {
      let j = i + 1;
      while (j < pairs.length && pairs[j][0] !== 0) j++;
      const body = pairs.slice(i + 1, j);
      const get = (code) => body.find((p) => p[0] === code)?.[1];
      if (v === "BLOCK") curBlock = { name: get(2) ?? "", bx: parseFloat(get(10) ?? "0") || 0, by: parseFloat(get(20) ?? "0") || 0, box: null, kids: [] };
      else if (v === "ENDBLK") { if (curBlock && (curBlock.box || curBlock.kids.length)) { blocks[curBlock.name] = curBlock.box; rawBlocks[curBlock.name] = curBlock; } curBlock = null; }
      else if (curBlock && v === "INSERT") {
        const f = (code, d) => { const q = parseFloat(get(code) ?? ""); return Number.isFinite(q) ? q : d; };
        curBlock.kids.push({ name: get(2) ?? "", x: f(10, NaN) - curBlock.bx, y: f(20, NaN) - curBlock.by, sx: f(41, 1), sy: f(42, f(41, 1)), rot: f(50, 0) });
      }
      else if (curBlock) {
        const pts = [];
        const n = (code) => parseFloat(get(code) ?? "NaN");
        if (v === "LINE") pts.push({ x: n(10), y: n(20) }, { x: n(11), y: n(21) });
        else if (v === "LWPOLYLINE") { for (let k = 0; k < body.length; k++) if (body[k][0] === 10) pts.push({ x: parseFloat(body[k][1]), y: parseFloat(body.slice(k + 1).find((p) => p[0] === 20)?.[1] ?? "NaN") }); }
        else if (v === "CIRCLE") { const r = n(40); pts.push({ x: n(10) - r, y: n(20) - r }, { x: n(10) + r, y: n(20) + r }); }
        else if (v === "ARC") {
          const cx = n(10), cy = n(20), r = n(40), a0 = n(50), a1 = n(51);
          const rad = (d) => d * Math.PI / 180;
          pts.push({ x: cx + r * Math.cos(rad(a0)), y: cy + r * Math.sin(rad(a0)) }, { x: cx + r * Math.cos(rad(a1)), y: cy + r * Math.sin(rad(a1)) });
          // quadrant extremes inside the sweep (counter-clockwise from a0 to a1)
          for (const q of [0, 90, 180, 270]) if (((q - a0) % 360 + 360) % 360 <= ((a1 - a0) % 360 + 360) % 360) pts.push({ x: cx + r * Math.cos(rad(q)), y: cy + r * Math.sin(rad(q)) });
        }
        for (const p of pts) {
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          const x = p.x - curBlock.bx, y = p.y - curBlock.by;
          const b = curBlock.box ??= { minx: x, miny: y, maxx: x, maxy: y };
          b.minx = Math.min(b.minx, x); b.maxx = Math.max(b.maxx, x); b.miny = Math.min(b.miny, y); b.maxy = Math.max(b.maxy, y);
        }
      }
      i = j;
      continue;
    }
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
      polySegs(segs, polys, layer, pts, (parseInt(get(70) ?? "0", 10) & 1) === 1);
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
      polySegs(segs, polys, layer, pts, closed);
      j = k;
    } else if (v === "INSERT") {
      inserts++;
      const n = (code, d) => { const f = parseFloat(get(code) ?? ""); return Number.isFinite(f) ? f : d; };
      insertList.push({ name: get(2) ?? "", layer, x: n(10, NaN), y: n(20, NaN), sx: n(41, 1), sy: n(42, n(41, 1)), rot: n(50, 0) });
    }
    else if (v === "ARC" || v === "CIRCLE") {
      arcs++;
      if (v === "ARC") {
        const n = (code) => parseFloat(get(code) ?? "NaN");
        const q = { layer, x: n(10), y: n(20), r: n(40) };
        if ([q.x, q.y, q.r].every(Number.isFinite)) arcList.push(q);
      }
    }
    i = j;
  }
  resolveNested(blocks, rawBlocks);
  return { segs, polys, insunits, inserts, arcs, binary: false, blocks, insertList, arcList };
}

/**
 * Fold the boxes of blocks inserted inside other blocks (nested symbols, a
 * door made of a leaf block and a frame block) into the parent's box, turned,
 * scaled (a negative scale mirrors) and moved by the INSERT inside the parent.
 * Cycles and unknown names are ignored.
 */
function resolveNested(blocks, raw) {
  const done = new Map(), busy = new Set();
  const boxOf = (name) => {
    if (done.has(name)) return done.get(name);
    const b = raw[name];
    if (!b || busy.has(name)) return null;
    busy.add(name);
    let box = b.box ? { ...b.box } : null;
    for (const k of b.kids) {
      const kb = boxOf(k.name);
      if (!kb || !Number.isFinite(k.x) || !Number.isFinite(k.y)) continue;
      const rad = k.rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
      for (const [x, y] of [[kb.minx, kb.miny], [kb.maxx, kb.miny], [kb.maxx, kb.maxy], [kb.minx, kb.maxy]]) {
        const u = x * k.sx, w = y * k.sy, px = k.x + u * co - w * si, py = k.y + u * si + w * co;
        box ??= { minx: px, miny: py, maxx: px, maxy: py };
        box.minx = Math.min(box.minx, px); box.maxx = Math.max(box.maxx, px); box.miny = Math.min(box.miny, py); box.maxy = Math.max(box.maxy, py);
      }
    }
    busy.delete(name);
    done.set(name, box);
    return box;
  };
  for (const name of Object.keys(raw)) { const b = boxOf(name); if (b) blocks[name] = b; else delete blocks[name]; }
}

/**
 * Door and window block symbols (INSERTs) as openings on the walls. A block's
 * bounding box (its lines, polylines, arcs) is scaled, turned and moved to the
 * insertion point; the wall it sits on is the one the box touches within
 * `reach` inches, and the opening's width is the box's extent along that wall
 * (a door's swing arc makes the box square, and its width is still the leaf).
 * The kind comes from the layer or the block name matching the door or window
 * pattern; any other block (a toilet, a stair) is skipped.
 * @param {ReturnType<typeof parseDxf>["insertList"]} inserts
 * @param {ReturnType<typeof parseDxf>["blocks"]} blocks
 * @param {number} scale drawing units to inches
 * @param {{ a: Pt, b: Pt }[]} walls inches
 * @returns {{ ops: { a: Pt, b: Pt, kind: string, name: string }[], skipped: number, noWall: number }}
 */
export function insertOpenings(inserts, blocks, scale, walls, doorLayer, windowLayer, reach = 8) {
  const ops = [];
  let skipped = 0, noWall = 0;
  for (const ins of inserts) {
    const box = blocks[ins.name];
    const isDoor = doorLayer.test(ins.layer) || doorLayer.test(ins.name);
    const isWin = windowLayer.test(ins.layer) || windowLayer.test(ins.name);
    if (!box || !(isDoor || isWin) || !Number.isFinite(ins.x) || !Number.isFinite(ins.y)) { skipped++; continue; }
    const rad = ins.rot * Math.PI / 180, co = Math.cos(rad), si = Math.sin(rad);
    const corners = [[box.minx, box.miny], [box.maxx, box.miny], [box.maxx, box.maxy], [box.minx, box.maxy]].map(([x, y]) => {
      const u = x * ins.sx, v = y * ins.sy;
      return { x: (ins.x + u * co - v * si) * scale, y: (ins.y + u * si + v * co) * scale };
    });
    let best = null;
    for (const W of walls) {
      const L = dist(W.a, W.b);
      if (L < 1) continue;
      const ux = (W.b.x - W.a.x) / L, uy = (W.b.y - W.a.y) / L;
      const perp = corners.map((q) => (q.x - W.a.x) * -uy + (q.y - W.a.y) * ux);
      const along = corners.map((q) => (q.x - W.a.x) * ux + (q.y - W.a.y) * uy);
      const near = perp.every((d) => d > 0) ? Math.min(...perp) : perp.every((d) => d < 0) ? -Math.max(...perp) : 0;
      const lo = Math.max(0, Math.min(...along)), hi = Math.min(L, Math.max(...along));
      if (near > reach || hi - lo < 6) continue;
      // prefer the wall the box touches most closely, then the longer overlap
      if (!best || near < best.near - 0.01 || (Math.abs(near - best.near) <= 0.01 && hi - lo > best.hi - best.lo)) best = { W, ux, uy, near, lo, hi };
    }
    if (!best) { noWall++; continue; }
    const { W, ux, uy, lo, hi } = best;
    ops.push({ a: { x: W.a.x + ux * lo, y: W.a.y + uy * lo }, b: { x: W.a.x + ux * hi, y: W.a.y + uy * hi }, kind: isDoor && !(isWin && !doorLayer.test(ins.layer) && !doorLayer.test(ins.name)) ? "door" : "window", name: ins.name });
  }
  return { ops, skipped, noWall };
}

function polySegs(out, polys, layer, pts, closed) {
  const ok = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  let poly;
  if (closed && ok.length === 4) { poly = polys.length; polys.push({ id: poly, layer, pts: ok }); }
  for (let k = 0; k + 1 < ok.length; k++) out.push({ layer, a: ok[k], b: ok[k + 1], poly });
  if (closed && ok.length > 2) out.push({ layer, a: ok[ok.length - 1], b: ok[0], poly });
}

/**
 * Some generators (Open House Plans among them) draw each wall piece between
 * openings as a closed rectangle. Read each rectangle 2.5 to 14 in thick and at
 * as a centre line along its long axis. Where
 * two rectangles overlap at a corner (each one's end-cap midpoint lies inside the
 * other), both centre lines stop on the other's centre line, so a corner is
 * centre to centre rather than overhanging by half a wall.
 * @param {{ id: number, layer: string, pts: Pt[] }[]} polys inches
 * @returns {{ rects: Seg[], ids: Set<number>, thickness: number }}
 */
export function rectWalls(polys) {
  const items = [];
  const sized = [];
  for (const p of polys) {
    const [a, b, c, d] = p.pts;
    const e1 = { x: b.x - a.x, y: b.y - a.y }, e2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(e1.x, e1.y), l2 = Math.hypot(e2.x, e2.y);
    if (!l1 || !l2 || Math.abs(e1.x * e2.x + e1.y * e2.y) / (l1 * l2) > 0.01) continue;
    if (Math.hypot(d.x - (a.x + c.x - b.x), d.y - (a.y + c.y - b.y)) > 0.05) continue;
    sized.push({ p, l1, l2 });
  }
  // A short piece (a stub beside a door, a mullion between windows) has no
  // clear long axis: it runs along whichever side leaves a thickness the long
  // pieces use.
  const thick = sized.filter(({ l1, l2 }) => Math.max(l1, l2) >= 2.5 * Math.min(l1, l2) && Math.min(l1, l2) >= 2.5 && Math.min(l1, l2) <= 14).map(({ l1, l2 }) => Math.min(l1, l2));
  const isThick = (x) => thick.some((q) => Math.abs(q - x) < 0.05);
  const mid = (m, n) => ({ x: (m.x + n.x) / 2, y: (m.y + n.y) / 2 });
  const build = (p, alongFirst, l1, l2) => {
    const [a, b, c, d] = p.pts;
    const t = alongFirst ? l2 : l1, L = alongFirst ? l1 : l2;
    if (t < 2.5 || t > 14 || L < 1) return null;
    const [u, v, w, z] = alongFirst ? [a, b, c, d] : [b, c, d, a]; // u->v and z->w run along the long axis
    return { id: p.id, layer: p.layer, t, a: mid(u, z), b: mid(v, w), corners: p.pts };
  };
  const pending = [];
  for (const { p, l1, l2 } of sized) {
    // l1 runs along the first edge, so l2 is the thickness when the piece runs along it
    const m1 = isThick(l2), m2 = isThick(l1);
    if (m1 !== m2) { const it = build(p, m1, l1, l2); if (it) items.push(it); }
    else if (Math.max(l1, l2) >= 1.5 * Math.min(l1, l2)) { const it = build(p, l1 >= l2, l1, l2); if (it) items.push(it); }
    else pending.push([build(p, true, l1, l2), build(p, false, l1, l2)]);
  }
  // A post that fits both ways (4.5 by 6.5 between two windows) takes the axis of
  // the piece it continues: one on the same line within 20 ft (a door or window gap).
  const continues = (c) => items.some((o) => {
    const ox = o.b.x - o.a.x, oy = o.b.y - o.a.y, oL = Math.hypot(ox, oy);
    if (Math.abs((c.b.x - c.a.x) * oy - (c.b.y - c.a.y) * ox) > 0.01 * oL * Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)) return false;
    if (Math.abs(((c.a.x - o.a.x) * -oy + (c.a.y - o.a.y) * ox) / oL) > 0.75) return false;
    return [c.a, c.b].some((q) => [o.a, o.b].some((r) => Math.hypot(q.x - r.x, q.y - r.y) <= 240));
  });
  for (const [x, y] of pending) {
    const cx = x && continues(x), cy = y && continues(y);
    if (cx !== cy) items.push(cx ? x : y);
  }
  const inside = (pt, it, margin) => {
    const dx = it.b.x - it.a.x, dy = it.b.y - it.a.y, L = Math.hypot(dx, dy);
    const along = ((pt.x - it.a.x) * dx + (pt.y - it.a.y) * dy) / L;
    const across = Math.abs(((pt.x - it.a.x) * -dy + (pt.y - it.a.y) * dx) / L);
    return along > margin && along < L - margin && across < it.t / 2 - margin;
  };
  const cross = (p, q, r, s) => {
    const d1 = { x: q.x - p.x, y: q.y - p.y }, d2 = { x: s.x - r.x, y: s.y - r.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((r.x - p.x) * d2.y - (r.y - p.y) * d2.x) / den;
    return { x: p.x + t * d1.x, y: p.y + t * d1.y };
  };
  const out = items.map((it) => ({ ...it, na: it.a, nb: it.b }));
  for (const it of out) for (const o of out) {
    if (it === o) continue;
    for (const end of ["a", "b"]) for (const oend of ["a", "b"]) {
      if (inside(it[end], o, 0.1) && inside(o[oend], it, 0.1)) {
        const P = cross(it.a, it.b, o.a, o.b);
        if (P) it[end === "a" ? "na" : "nb"] = P;
      }
    }
  }
  return {
    rects: out.map((it) => ({ layer: it.layer, a: it.na, b: it.nb })),
    ids: new Set(out.map((it) => it.id)),
    thickness: out.length ? out.reduce((t, it) => t + it.t, 0) / out.length : 0,
  };
}

/**
 * Walls drawn as separate pieces with a gap between them have an opening there:
 * a door when a door-layer line touches the gap, a window for a window-layer one.
 * Collinear centre lines on the same axis are walked in order; a gap wider than
 * `minGap` and no wider than `maxGap` with such a line inside becomes a bridging
 * centre line plus the opening. Door and window lines it explains are returned
 * so the line-based opening pass does not count them twice.
 * @param {Seg[]} centres
 * @param {Seg[]} bar door and window layer lines
 * @param {RegExp} doorLayer
 * @param {{ minGap: number, maxGap: number, thickness: number }} o
 */
export function bridgeGaps(centres, bar, doorLayer, o) {
  const groups = [];
  for (const s of centres) {
    const L = dist(s.a, s.b);
    if (L < 1e-6) continue;
    let dx = (s.b.x - s.a.x) / L, dy = (s.b.y - s.a.y) / L;
    if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
    const off = s.a.x * -dy + s.a.y * dx;
    let g = groups.find((q) => Math.abs(q.dx * dy - q.dy * dx) < 0.01 && Math.abs(q.off - off) < 0.75);
    if (!g) groups.push(g = { dx, dy, off, spans: [] });
    const t0 = s.a.x * dx + s.a.y * dy, t1 = s.b.x * dx + s.b.y * dy;
    g.spans.push([Math.min(t0, t1), Math.max(t0, t1)]);
  }
  /** @type {Seg[]} */
  const bridges = [];
  /** @type {{ a: Pt, b: Pt, kind: string }[]} */
  const openings = [];
  const used = new Set();
  const half = o.thickness / 2 + 1;
  for (const g of groups) {
    g.spans.sort((p, q) => p[0] - q[0]);
    let end = g.spans[0][1];
    for (const sp of g.spans.slice(1)) {
      const gap = sp[0] - end;
      if (gap > 1 && gap >= o.minGap && gap <= o.maxGap) {
        const hits = bar.filter((s) => {
          const onAxis = [s.a, s.b, { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }].some((pt) => {
            const along = pt.x * g.dx + pt.y * g.dy, across = pt.x * -g.dy + pt.y * g.dx - g.off;
            return along >= end - 1 && along <= sp[0] + 1 && Math.abs(across) <= half;
          });
          if (onAxis) return true;
          // a garage door is one line inside the wall line, running most of the gap
          const t0 = s.a.x * g.dx + s.a.y * g.dy, t1 = s.b.x * g.dx + s.b.y * g.dy;
          const a0 = s.a.x * -g.dy + s.a.y * g.dx - g.off, a1 = s.b.x * -g.dy + s.b.y * g.dx - g.off;
          return Math.abs(a0 - a1) < 0.1 && Math.abs(a0) <= o.thickness + 2 &&
            Math.min(Math.max(t0, t1), sp[0]) - Math.max(Math.min(t0, t1), end) >= 0.8 * gap;
        });
        if (hits.length) {
          const at = (t) => ({ x: t * g.dx + g.off * -g.dy, y: t * g.dy + g.off * g.dx });
          bridges.push({ layer: "bridge", a: at(end), b: at(sp[0]) });
          openings.push({ a: at(end), b: at(sp[0]), kind: hits.some((s) => doorLayer.test(s.layer)) ? "door" : "window" });
          for (const s of hits) used.add(s);
        }
      }
      end = Math.max(end, sp[1]);
    }
  }
  return { bridges, openings, used };
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
 * @param {{ units?: "in"|"ft"|"mm"|"cm"|"m", openingSize?: (mid: Pt) => any, wallLayer?: RegExp, doorLayer?: RegExp, windowLayer?: RegExp,
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
  const sc = (s) => ({ layer: s.layer, poly: s.poly, a: { x: s.a.x * scale, y: s.a.y * scale }, b: { x: s.b.x * scale, y: s.b.y * scale } });
  const all = parsed.segs.map(sc);
  /** @type {any[]} */
  let wallSegs = all.filter((s) => wallLayer.test(s.layer));
  const polysIn = parsed.polys.filter((p) => wallLayer.test(p.layer)).map((p) => ({ ...p, pts: p.pts.map((q) => ({ x: q.x * scale, y: q.y * scale })) }));
  const rw = rectWalls(polysIn);
  /** @type {{ a: Pt, b: Pt, kind: string }[]} */
  let bridgeOps = [];
  let usedBar = new Set();
  const barLines = all.filter((s) => doorLayer.test(s.layer) || windowLayer.test(s.layer));
  let rectMode = false;
  if (rw.rects.length >= 3 && rw.rects.length >= 0.6 * new Set(wallSegs.map((s) => s.poly ?? `l${s.a.x},${s.a.y}`)).size) {
    rectMode = true;
    wallSegs = [...wallSegs.filter((s) => s.poly === undefined || !rw.ids.has(s.poly)), ...rw.rects];
    const br = bridgeGaps(rw.rects, barLines, doorLayer, { minGap: 12, maxGap: 240, thickness: rw.thickness });
    wallSegs.push(...br.bridges);
    bridgeOps = br.openings;
    usedBar = br.used;
    notes.push(`Rectangle walls: ${rw.rects.length} wall piece${rw.rects.length === 1 ? "" : "s"} drawn as closed rectangles (mean thickness ${Math.round(rw.thickness * 10) / 10} in) read as centre lines, ${bridgeOps.length} gap${bridgeOps.length === 1 ? "" : "s"} between pieces bridged and read as openings (${bridgeOps.filter((b) => b.kind === "door").length} door, ${bridgeOps.filter((b) => b.kind === "window").length} window), widths from the gap. Corners are centre to centre.`);
  }
  if (!wallSegs.length) {
    const layers = [...new Set(all.map((s) => s.layer))];
    return { ok: false, errors: [`No lines on a layer matching ${wallLayer}. Layers with lines: ${layers.join(", ") || "none"}.`], notes };
  }
  if (parsed.arcs) notes.push(`${parsed.arcs} arc or circle entit${parsed.arcs === 1 ? "y" : "ies"} skipped (door swings and curved walls are not read).`);

  let centreSegs = wallSegs, snapW = snap;
  const dl = opt.doubleLine ?? "auto";
  if (rectMode) snapW = Math.max(snap, rw.thickness / 2 + 0.75);
  else if (dl !== false) {
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
    for (const [k, other] of /** @type {[string, {w:number, e:0|1}][]} */ ([[`${c.i}:${c.ei}`, { w: c.j, e: c.ej }], [`${c.j}:${c.ej}`, { w: c.i, e: c.ei }]])) {
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
  const bar = barLines.filter((s) => !usedBar.has(s));
  /** @type {{ a: Pt, b: Pt, kind?: string }[]} */
  const op = [...mergeCollinear(bar.map((s) => ({ ...s })), 0.5 * Math.PI / 180, snap, 0.5), ...bridgeOps];
  const joined = joinJambs(op, parsed.arcList.filter((a) => doorLayer.test(a.layer)).map((a) => ({ x: a.x * scale, y: a.y * scale, r: a.r * scale })), walls);
  if (joined) {
    op.splice(0, op.length, ...joined.ops);
    notes.push(`${joined.n} door symbol${joined.n === 1 ? "" : "s"} drawn as two jamb pieces joined into one opening by the swing arc (width = jamb outer edge to jamb outer edge; trim to your rough opening).`);
  }
  if (parsed.inserts) {
    const ins = insertOpenings(parsed.insertList, parsed.blocks, scale, walls, doorLayer, windowLayer);
    // a symbol over an opening a line already marks is the same opening
    const fresh = ins.ops.filter((q) => !op.some((o) => Math.hypot((o.a.x + o.b.x - q.a.x - q.b.x) / 2, (o.a.y + o.b.y - q.a.y - q.b.y) / 2) < 0.5 * Math.max(dist(o.a, o.b), dist(q.a, q.b))));
    op.push(...fresh);
    const bits = [];
    if (fresh.length) bits.push(`${fresh.length} read as opening${fresh.length === 1 ? "" : "s"} (width = the symbol's extent along the wall)`);
    if (ins.ops.length > fresh.length) bits.push(`${ins.ops.length - fresh.length} already marked by a line`);
    if (ins.noWall) bits.push(`${ins.noWall} door or window symbol${ins.noWall === 1 ? "" : "s"} not on any wall`);
    if (ins.skipped) bits.push(`${ins.skipped} other block${ins.skipped === 1 ? "" : "s"} (not named or layered door or window, or no definition) skipped`);
    notes.push(`${parsed.inserts} block INSERT${parsed.inserts === 1 ? "" : "s"}: ${bits.join("; ")}. Check each width against the schedule: a block's box can include trim or a swing.`);
  }
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
  let defaulted = 0;
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
    if (host < 0) { unplaced.push(`${width} in ${o.kind ?? kindOf(mid)}`); continue; }
    const n = idx.get(host), W = walls[host], L = dist(W.a, W.b);
    const p0 = param(W, o.a), p1 = param(W, o.b);
    const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
    const off = r16(order[n].flip ? L - hi : lo);
    const kind = o.kind ?? kindOf(mid);
    counts[kind]++;
    const own = opt.openingSize?.(mid);
    if (!own) defaulted++;
    const height = own?.height ?? (kind === "door" ? (opt.doorHeight ?? 82.5) : (opt.windowHeight ?? 48));
    (out[n].openings ||= []).push({ kind, label: `${kind === "door" ? "Door" : "Window"} ${counts[kind]}`, offset: Math.max(0, off), width, height, ...(own ? { headerHeight: own.headerHeight } : {}), header: opt.header ?? "2x10" });
    placed++;
  }
  for (const w of out) if (w.openings) w.openings.sort((p, q) => p.offset - q.offset);
  if (unplaced.length) notes.push(`${unplaced.length} opening line${unplaced.length === 1 ? "" : "s"} not along any wall (${unplaced.slice(0, 3).join(", ")}${unplaced.length > 3 ? ", ..." : ""}) were dropped.`);
  if (defaulted) notes.push(`Opening heights are defaults, not read from the file: doors ${opt.doorHeight ?? 82.5} in, windows ${opt.windowHeight ?? 48} in tall. Every header is ${opt.header ?? "2x10"} as a placeholder; set them for your span table.`);
  else if (placed) notes.push(`Every header is ${opt.header ?? "2x10"} as a placeholder; set them for your span table.`);
  else notes.push("No opening lines found on a layer matching " + `${doorLayer} or ${windowLayer}` + ": the plan has solid walls.");
  notes.push("Lengths are the drawn centre-line lengths. If your drawing is to the outside of the framing, take the wall depth off at corners before ordering.");

  const plan = { walls: out };
  const ext = out.filter((w) => w.corner).length;
  return { ok: true, errors: [], notes, plan, stats: { walls: out.length, exterior: ext, interior: out.length - ext, tees: tees.length, openings: placed, crossings: crossings.length } };
}

/**
 * Real door symbols (a CAD library's d1 to d4) draw only the jambs along the
 * wall, as short pieces at each end, plus a swing arc per leaf. Read alone
 * each jamb is a 4 in "door". Two neighbouring opening pieces on one wall are
 * one opening when a door-layer arc has a radius near the gap between them
 * (one leaf) or near half of it (a pair of leaves) and its centre lies within
 * the span.
 * @param {{ a: Pt, b: Pt, kind?: string }[]} ops
 * @param {{ x: number, y: number, r: number }[]} arcs inches
 * @param {{ a: Pt, b: Pt }[]} walls inches
 */
function joinJambs(ops, arcs, walls) {
  if (!arcs.length || ops.length < 2) return null;
  const tol = 0.15, snapTo = 6;
  const used = new Set();
  const out = [];
  let n = 0;
  for (const W of walls) {
    const L = dist(W.a, W.b);
    if (!(L > 0)) continue;
    const ux = (W.b.x - W.a.x) / L, uy = (W.b.y - W.a.y) / L;
    const along = (q) => (q.x - W.a.x) * ux + (q.y - W.a.y) * uy;
    const off = (q) => Math.abs((q.x - W.a.x) * uy - (q.y - W.a.y) * ux);
    const here = ops.map((o, k) => ({ o, k, lo: Math.min(along(o.a), along(o.b)), hi: Math.max(along(o.a), along(o.b)) }))
      .filter((e) => !used.has(e.k) && off(e.o.a) < snapTo && off(e.o.b) < snapTo && e.hi > -snapTo && e.lo < L + snapTo)
      .sort((p, q) => p.lo - q.lo);
    // pieces closer than 12 in are one jamb
    /** @type {{ lo: number, hi: number, ks: number[], used?: boolean }[]} */
    const jambs = [];
    for (const e of here) {
      const last = jambs[jambs.length - 1];
      if (last && e.lo - last.hi < 12) { last.hi = Math.max(last.hi, e.hi); last.ks.push(e.k); } else jambs.push({ lo: e.lo, hi: e.hi, ks: [e.k] });
    }
    for (let m = 0; m + 1 < jambs.length; m++) {
      const p = jambs[m], q = jambs[m + 1];
      if (p.used || q.used || p.hi - p.lo > 12 || q.hi - q.lo > 12) continue; // a jamb is a few inches; a wider piece is an opening already
      const gap = q.lo - p.hi;
      if (gap > 240) continue;
      const ok = arcs.some((a) => {
        const t = along(a);
        return off(a) < 2 * snapTo + 12 && t >= p.lo - snapTo && t <= q.hi + snapTo && [gap, gap / 2].some((w) => Math.abs(a.r - w) <= tol * w + 3);
      });
      if (!ok) continue;
      p.used = q.used = true;
      for (const k of [...p.ks, ...q.ks]) used.add(k);
      n++;
      const at = (t) => ({ x: W.a.x + ux * t, y: W.a.y + uy * t });
      out.push({ a: at(p.lo), b: at(q.hi), kind: "door" });
    }
  }
  if (!n) return null;
  return { n, ops: [...ops.filter((_, k) => !used.has(k)), ...out] };
}

function pointSeg(p, s) {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}
