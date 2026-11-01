// @ts-check
// Stud-by-stud wall framing for a generated house: every stud, king, jack,
// header ply, rough sill, cripple and plate at its real length, laid out
// wall by wall, then a cut list and the board order that covers it.
//
// The layout and the order are the Wall Framing Takeoff engine's
// (vendored as wft-engine.mjs from ../wall-framing-takeoff by vendor-framing.mjs: studs on layout from the wall start,
// openings framed with kings, jacks, a header and cripples kept on layout,
// plates spliced over studs, Gilmore-Gomory cutting stock with an LP lower
// bound). This module only turns a plan's walls and openings into that
// engine's input, the way a framer would read the floor plan:
//
// - The front and back walls run the full width; the side walls fit between
//   them. Every outside corner gets the scheme's corner backing.
// - A partition runs between the faces of the walls at its ends and puts a
//   tee (backing studs, or ladder blocking with advanced framing) in the wall
//   it meets. A partition end that meets nothing (an open plan) is a free end.
// - Rough openings: doors 2 in wider and 2-1/2 in taller than the door, a
//   window 1/2 in over the unit each way, a garage door at its size. Two
//   openings closer than 12 in (mulled egress casements) are framed as one.
// - Headers come from takeoff.mjs's sizing (structure.mjs); where it called
//   for an engineered beam (LVL), the opening is drawn with a 2x12-deep
//   header for its geometry, and the beam is listed for the supplier to size
//   instead of being ordered as lumber. Openings takeoff.mjs gives no header
//   (non-bearing walls) get two plies of 2x4 flat over the opening's width,
//   a nominal header carrying nothing.
// - Studs are precut lengths for the ceiling (92-5/8 in for 8 ft, 104-5/8 in
//   for 9 ft, 116-5/8 in for 10 ft); other pieces come from 8 to 20 ft boards.
//
// The order is in boards, not dollars: the engine needs a price per board to
// choose lengths, and it is given relative prices (houseStock: a foot of
// board costs the same up to 16 ft, 15% more at 18 and 20 ft), so the order
// minimises lumber bought. No real lumber prices are used here.

import { layoutWall, cutList, optimizeStock, defaultStock, validatePlan, formatInches, formatLength, PRECUT, THICK, DEPTH } from "./wft-engine.mjs";
import { wallElevationSvg } from "./wft-drawings.mjs";
import { T_EXT, T_INT } from "./layout.mjs";
import { SCHEMES } from "./takeoff.mjs";
import { sizeHeader } from "./structure.mjs";

const EPS = 1e-6;
const MULL_GAP_IN = 12;

/** Boards to buy: 8 to 16 ft (the engine's list) plus 18 and 20 ft, which a plate over a 16 ft garage door needs. Prices are relative, not dollars: a foot of 8 to 16 ft board costs 1 and a foot of 18 or 20 ft 1.15 (an assumption: long lengths cost more per foot and are harder to handle), so the order uses them only where they save boards. */
export function houseStock(studLength) {
  const out = defaultStock(studLength);
  for (const size of ["2x4", "2x4 PT", "2x6", "2x6 PT", "2x8", "2x10", "2x12"]) for (const ft of [18, 20]) out.push({ size, length: ft * 12, price: Math.round(ft * 1.15 * 100) / 100 });
  return out;
}

/** Precut stud length for a ceiling height in feet. */
export function studLengthFor(ceiling) {
  if (ceiling >= 10) return PRECUT["10ft"];
  if (ceiling >= 9) return PRECUT["9ft"];
  return PRECUT["8ft"];
}

function sideOf(plan, w) {
  if (w.type !== "ext") return null;
  if (w.dir === "h") return Math.abs(w.c) < EPS ? "front" : "back";
  return Math.abs(w.c) < EPS ? "left" : "right";
}

const SIDE_NAME = { front: "Front", back: "Back", left: "Left", right: "Right" };

/** Rough opening of one plan opening, inches: { width, height, headerHeight, kind }. */
function roughOpening(o) {
  if (o.kind === "window") {
    return { kind: "window", width: o.width * 12 + 0.5, height: o.height * 12 + 0.5, headerHeight: (o.sill + o.height) * 12 + 0.5 };
  }
  if (o.kind === "garage") return { kind: "door", width: o.width * 12, height: o.height * 12, headerHeight: o.height * 12 };
  return { kind: "door", width: o.width * 12 + 2, height: o.height * 12 + 2.5, headerHeight: o.height * 12 + 2.5 };
}

function openingLabel(o, rooms) {
  const room = rooms.get(o.into || (o.rooms || [])[0]);
  const where = room ? room.name : "";
  const what = { window: "window", entry: "entry door", garage: "garage door", closet: "closet", bifold: "bifold", cased: "cased opening", door: "door" }[o.kind] || o.kind;
  return `${o.id} ${where ? `${where} ` : ""}${what}`.trim();
}

/**
 * The framing input for a plan: { input (a Wall Framing Takeoff plan), map (wall id -> plan wall id), lvl (opening labels with an engineered header), notes }.
 * @param {any} plan finished plan from layout/openings
 * @param {any} brief normalized brief
 * @param {any} tk takeoff.mjs result (for header sizes)
 * @param {any} [style] the style (its eave sets the roof load on a resized header)
 */
export function framingInput(plan, brief, tk, style = null) {
  const sch = SCHEMES[brief.frame];
  const advanced = brief.frame === "advanced";
  const studLength = studLengthFor(plan.ceiling);
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const solid = plan.walls.filter((w) => w.type !== "open");
  const headers = new Map((tk.struct.headers || []).map((h) => [h.opening, h]));
  const notes = [];
  const lvl = [];

  // where a wall starts and ends along its own axis (plan feet), after the framer's trims
  const span = new Map();
  for (const w of solid) {
    const side = sideOf(plan, w);
    if (side === "front" || side === "back") { span.set(w.id, [w.a, w.b]); continue; }
    if (side === "left" || side === "right") { span.set(w.id, [w.a + T_EXT, w.b - T_EXT]); continue; }
    // a partition: trim each end to the face of the wall it meets, if any
    const trimAt = (end) => {
      const meet = solid.find((x) => x !== w && x.dir !== w.dir && Math.abs(x.c - end) < EPS && w.c > x.a - EPS && w.c < x.b + EPS);
      if (!meet) return { t: 0, meet: null };
      return { t: meet.type === "ext" ? T_EXT : T_INT / 2, meet };
    };
    const s = trimAt(w.a), e = trimAt(w.b);
    // an exterior wall at the plan edge is wholly inside the edge, so the partition stops at its inner face
    const a = Math.abs(w.a) < EPS ? T_EXT : w.a + s.t;
    const maxEdge = w.dir === "h" ? plan.W : plan.D;
    const b = Math.abs(w.b - maxEdge) < EPS ? maxEdge - T_EXT : w.b - e.t;
    span.set(w.id, [a, b]);
  }

  const name = (w) => {
    const side = sideOf(plan, w);
    if (side) return `${SIDE_NAME[side]} (${w.id})`;
    const rs = w.rooms.map((id) => rooms.get(id)?.name).filter(Boolean);
    return `${rs.join(" / ")} (${w.id})`;
  };

  const ring = ["front", "right", "back", "left"];
  const ordered = [
    ...ring.map((s) => solid.find((w) => sideOf(plan, w) === s)).filter(Boolean),
    ...solid.filter((w) => w.type !== "ext"),
  ];
  const walls = [];
  /** @type {Record<string, string>} */
  const map = {};
  for (const w of ordered) {
    const [a, b] = span.get(w.id);
    const length = Math.round((b - a) * 12 * 16) / 16;
    if (length < 12) { notes.push(`${name(w)} is under a foot long once trimmed to the walls it meets; frame it by hand.`); continue; }
    const isExt = w.type === "ext";
    const stud = isExt ? sch.stud : "2x4";
    // tees: partitions whose end meets this wall
    const tees = [];
    for (const x of solid) {
      if (x === w || x.dir === w.dir || x.type === "ext") continue;
      const touches = Math.abs(x.a - w.c) < EPS || Math.abs(x.b - w.c) < EPS;
      if (!touches || x.c < w.a - EPS || x.c > w.b + EPS) continue;
      const at = Math.round((x.c - a) * 12 * 16) / 16;
      if (at >= THICK + EPS && at <= length - THICK - EPS) tees.push(at);
    }
    // openings, with near neighbours merged into one rough opening
    const raw = plan.openings.filter((o) => o.wall === w.id).map((o) => {
      const ro = roughOpening(o);
      const offset = (o.pos - a) * 12 - ro.width / 2;
      return { o, ...ro, offset };
    }).sort((p, q) => p.offset - q.offset);
    const groups = [];
    for (const r of raw) {
      const last = groups[groups.length - 1];
      if (last && last.kind === r.kind && r.offset - (last.offset + last.width) < MULL_GAP_IN && Math.abs(last.headerHeight - r.headerHeight) < EPS && Math.abs(last.height - r.height) < EPS) {
        last.width = r.offset + r.width - last.offset;
        last.members.push(r.o);
      } else groups.push({ ...r, members: [r.o] });
    }
    const openings = groups.map((g) => {
      const label = g.members.length > 1 ? `${g.members.map((o) => o.id).join("+")} mulled ${g.members[0].kind === "window" ? "windows" : "doors"}` : openingLabel(g.o, rooms);
      if (g.members.length > 1) notes.push(`${name(w)}: ${g.members.map((o) => o.id).join(" and ")} are under ${MULL_GAP_IN} in apart, framed as one ${formatInches(g.width)} rough opening (a mulled unit).`);
      // the deepest header any member asked for
      const hs = g.members.map((o) => headers.get(o.id)).filter(Boolean);
      let header = "2x4", headerPlies = 2, jacks = 1;
      if (hs.some((h) => h.size === "LVL" || h.engineered)) {
        header = "2x12"; headerPlies = stud === "2x6" ? 3 : 2; jacks = 2;
        lvl.push({ wall: w.id, label, span: g.width });
      } else if (hs.length) {
        const best = hs.sort((p, q) => (parseInt(q.size.slice(2)) || 0) - (parseInt(p.size.slice(2)) || 0))[0];
        header = best.size; headerPlies = best.plies; jacks = Math.max(1, best.jacks || 1);
        if (g.members.length > 1 && hs.some((h) => h.bearing)) {
          // a mulled pair is one wider span: size its header again, on the load takeoff.mjs used
          const side = sideOf(plan, w);
          const plf = (15 + brief.snow) * (plan.D / 2 + (style?.eave ?? 1)) + (side === "front" && plan.porch ? (65 * plan.porch.d) / 2 : 0);
          const re = sizeHeader(g.width + 3, plf, stud);
          if (re) { header = re.size; headerPlies = re.plies; jacks = re.jacks; notes.push(`${name(w)}: the ${label} header is sized for the combined span: ${re.plies}-ply ${re.size}, ${re.jacks} jack${re.jacks > 1 ? "s" : ""} a side (ratio ${re.ratio.toFixed(2)}, structure.mjs).`); }
          else { header = "2x12"; headerPlies = stud === "2x6" ? 3 : 2; jacks = 2; lvl.push({ wall: w.id, label, span: g.width }); }
        }
      }
      // the jacks and a king (or the end stud acting as one) need room at each wall end; closets often run wall to wall
      const clear = THICK * (jacks + 1);
      if (g.width > length - 2 * clear) {
        const was = g.width;
        g.width = length - 2 * clear;
        notes.push(`${name(w)}: ${label} narrowed from ${formatInches(was)} to ${formatInches(g.width)} so its jacks clear the end studs.`);
      }
      const lo = clear, hi = length - clear - g.width;
      if (g.offset < lo - EPS || g.offset > hi + EPS) {
        const was = g.offset;
        g.offset = Math.min(Math.max(g.offset, lo), hi);
        if (Math.abs(was - g.offset) > 1) notes.push(`${name(w)}: ${label} moved ${formatInches(Math.abs(was - g.offset))} away from the wall end so its jacks clear the end stud.`);
      }
      // a header fits between the rough opening's top and the top plate; where the plan's head height leaves too little room, the head comes down
      const depth = DEPTH[header];
      const room = THICK + studLength - depth;
      if (g.headerHeight > room + EPS) {
        notes.push(`${name(w)}: ${label} head lowered ${formatInches(g.headerHeight - room)} so its ${headerPlies}-ply ${header} header fits under the top plate.`);
        g.height -= g.headerHeight - room;
        g.headerHeight = room;
      }
      return {
        kind: g.kind, label, offset: Math.round(g.offset * 16) / 16, width: Math.round(g.width * 16) / 16, height: Math.round(g.height * 16) / 16,
        headerHeight: Math.round(g.headerHeight * 16) / 16, header, headerPlies, jacks,
      };
    });
    // a partition landing on an opening's kings or jacks is nailed to them: no backing of its own
    const kept = [];
    for (const t of [...new Set(tees)].sort((p, q) => p - q)) {
      const hit = openings.find((o) => t > o.offset - THICK * (o.jacks + 1) - THICK - EPS && t < o.offset + o.width + THICK * (o.jacks + 1) + THICK + EPS);
      if (hit) notes.push(`${name(w)}: the partition at ${formatLength(t)} lands on the framing of ${hit.label}; nail it to the king studs there (no tee backing).`);
      else kept.push(t);
    }
    const out = { id: name(w), length, stud, treatedPlate: brief.foundation === "slab", tees: kept, openings };
    if (isExt) out.corner = true;
    if (!isExt) out.sheathed = false;
    walls.push(out);
    map[out.id] = w.id;
  }
  const input = {
    studSpacing: sch.spacing,
    studLength,
    kerf: 0.125,
    topPlateLap: 24,
    cornerExtraStuds: advanced ? 1 : 2,
    teeExtraStuds: 2,
    defaultHeaderHeight: 82.5,
    advanced: advanced ? { twoStudCorners: true, ladderTees: true, singleTopPlate: true } : undefined,
    stock: houseStock(studLength),
    walls,
  };
  // the engine refuses a whole plan for one bad wall: set aside any wall it rejects, with its reason
  const errors = validatePlan(input);
  if (errors.length) {
    const bad = new Set();
    for (const e of errors) {
      const hit = walls.find((x) => e.startsWith(`Wall ${x.id}`));
      if (hit) { bad.add(hit.id); notes.push(`${e} This wall is left out of the framing; frame it by hand.`); }
    }
    input.walls = walls.filter((x) => !bad.has(x.id));
  }
  return { input, map, lvl, notes };
}

/**
 * Lay out every wall of a plan and order the lumber.
 * @returns {{ ok: boolean, input: any, map: Record<string, string>, walls: any[], cuts: any[], orders: any[], lvl: any[], summary: any, notes: string[] }}
 */
export function frameHouse(plan, brief, tk, style = null) {
  const { input, map, lvl, notes } = framingInput(plan, brief, tk, style);
  /** @type {any[]} */
  const walls = input.walls.map((w) => layoutWall(input, w));
  // engineered headers are drawn but bought from the supplier, not cut from boards
  const lvlKeys = new Set(lvl.map((l) => l.label));
  const forOrder = walls.map((w) => ({ ...w, members: w.members.filter((m) => !(m.kind === "header" && [...lvlKeys].some((k) => m.label.endsWith(k)))) }));
  const cuts = cutList(forOrder);
  const orders = [];
  for (const size of [...new Set(cuts.map((c) => c.size))]) {
    const stock = input.stock.filter((s) => s.size === size);
    const pieces = cuts.filter((c) => c.size === size).map((c) => ({ length: c.length, qty: c.qty, ref: c.kind }));
    const res = optimizeStock(pieces, stock, input.kerf);
    const lines = new Map();
    for (const bar of res.bars) {
      const key = `${bar.length}|${bar.label || ""}`;
      const row = lines.get(key) || { size, length: bar.length, label: bar.label || "", qty: 0 };
      row.qty++;
      lines.set(key, row);
    }
    const bought = res.bars.reduce((s, bar) => s + bar.length, 0);
    const needed = pieces.reduce((s, p) => s + p.length * p.qty, 0);
    orders.push({ size, bars: res.bars, lines: [...lines.values()].sort((p, q) => q.length - p.length), bought, needed, cost: res.cost, bound: res.bound });
  }
  const bought = orders.reduce((s, o) => s + o.bought, 0);
  const needed = orders.reduce((s, o) => s + o.needed, 0);
  const cost = orders.reduce((s, o) => s + o.cost, 0);
  const bound = orders.reduce((s, o) => s + o.bound, 0);
  const bfOf = (size, inches) => { const [t, d] = size.replace(" PT", "").split("x").map(Number); return (t * d * inches) / 144; };
  const boardFeet = orders.reduce((s, o) => s + o.bars.reduce((t, bar) => t + bfOf(o.size, bar.length), 0), 0);
  // the engine writes a single-top-plate note per wall; one line for the house says the same
  const single = walls.filter((w) => w.singleTopPlate);
  const ties = single.reduce((s, w) => s + (w.plateTies || 0), 0);
  const wallNotes = walls.flatMap((w) => w.notes.filter((n) => !n.startsWith("single top plate")).map((n) => `${w.id}: ${n}`));
  if (single.length) wallNotes.unshift(`Single top plate (advanced framing): trusses must land within 1 in of the stud centres, and ${ties} steel plate ties (not in the order) go at plate joints, corners and tees; each wall's drawing marks its joints. Whether a single top plate is allowed here is the code and engineer's call.`);
  const allNotes = [...notes, ...wallNotes];
  return {
    ok: true, input, map, walls, cuts, orders, lvl,
    summary: {
      walls: walls.length,
      plateTies: ties,
      wallFeet: Math.round(input.walls.reduce((s, w) => s + w.length, 0) / 12),
      pieces: cuts.reduce((s, c) => s + c.qty, 0),
      boards: orders.reduce((s, o) => s + o.bars.length, 0),
      boardFeet: Math.round(boardFeet),
      waste: bought > 0 ? Math.round(((bought - needed) / bought) * 1000) / 10 : 0,
      gapToBound: bound > 0 ? Math.round(((cost - bound) / bound) * 10000) / 100 : 0,
      engineeredHeaders: lvl.length,
      studLength: formatInches(input.studLength),
      wallsLeftOut: plan.walls.filter((w) => w.type !== "open").length - walls.length,
    },
    notes: allNotes,
  };
}

const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The lumber order, one line per board size and length. */
export function orderCsv(f) {
  const rows = [["Size", "Length", "Length (in)", "Quantity", "Note"]];
  for (const o of f.orders) for (const l of o.lines) rows.push([o.size, formatLength(l.length), String(l.length), String(l.qty), l.label]);
  for (const l of f.lvl) rows.push(["LVL (engineered)", formatInches(l.span + 3 + 6), "", "1", `header over ${l.label} on ${l.wall}: span ${formatInches(l.span)}, size and length by the supplier`]);
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/** The cut list, and which board each piece comes out of. */
export function cutListCsv(f) {
  const rows = [["Section", "Size", "Length", "Length (in)", "Quantity", "Piece / walls"]];
  for (const c of f.cuts) rows.push(["cut", c.size, formatInches(c.length), String(c.length), String(c.qty), `${c.kind} (${c.walls.join("; ")})`]);
  for (const o of f.orders) o.bars.forEach((bar, i) => rows.push(["board", o.size, formatLength(bar.length), String(bar.length), "1", `#${i + 1}: ${bar.cuts.map((c) => `${formatInches(c.length)} ${c.ref}`).join(" + ")}; offcut ${formatInches(bar.offcut)}`]));
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Every wall's framing elevation on one tall sheet, longest walls first. */
export function framingSheetSvg(f, title) {
  const W = 1600, pad = 40, gap = 30;
  const scale = (W - 2 * pad) / Math.max(...f.walls.map((w) => w.length + 28));
  const parts = [];
  let y = 90;
  const byId = new Map(f.input.walls.map((w) => [w.id, w]));
  for (const w of f.walls) {
    const inner = wallElevationSvg(w, byId.get(w.id), f.input);
    const vb = inner.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
    const h = vb[3] * scale;
    parts.push(`<svg x="${pad}" y="${y.toFixed(1)}" width="${(vb[2] * scale).toFixed(1)}" height="${h.toFixed(1)}"${inner.slice(4)}`);
    y += h + gap;
  }
  const H = Math.ceil(y + 60);
  const s = f.summary;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${esc(title)}: wall framing</title>`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    `<text x="${pad}" y="40" font-size="24" font-weight="bold" fill="#222">${esc(title)}: wall framing, every member</text>`,
    `<text x="${pad}" y="66" font-size="14" fill="#444">${esc(`${s.walls} walls, ${s.wallFeet} ft; ${s.pieces} pieces from ${s.boards} boards (${s.boardFeet.toLocaleString("en-US")} bf, ${s.waste}% offcut); studs ${s.studLength} precut. All walls drawn to one scale.`)}</text>`,
    ...parts,
    `<text x="${pad}" y="${H - 24}" font-size="12" fill="#7a4700">NOT FOR CONSTRUCTION. Layout by software from the plan; not reviewed by a licensed engineer. Headers marked LVL are placeholders for an engineered beam.</text>`,
    "</svg>\n",
  ].join("\n");
}
