// @ts-check
// Floor framing: joist layout, rim boards, blocking and the subfloor sheets.
//
// A floor is a rectangle `width` (along the rim, x) by `depth` (along the
// joists, y). Joists run the depth between two rim boards; the first and last
// joist sit at the floor's edges and the others are centred on multiples of
// the spacing, so a 4 ft sheet edge lands on a joist centre at 16 or 24 o.c.
// An optional `beam` (distance from the front edge to the beam's centre) cuts
// each joist into two pieces that butt over it, so a 28 ft floor can be built
// from 16 ft boards. Subfloor sheets run across the joists, courses stagger
// by starting alternate courses on a different joist, and every end joint
// lands on a joist centre. Lumber goes out as cut rows that `takeoff(plan,
// floorCuts(...))` pools with the walls; sheets are their own order.
import { THICK, EPS, DEPTH, optimizeStock, formatLength, formatInches } from "./engine.mjs";

export const SHEET = { width: 48, length: 96 };

/** @typedef {{ id?: string, width: number, depth: number, joist?: string, spacing?: number, rim?: boolean, beam?: number, blockingRows?: number, doubleUnder?: number[], stair?: { x: number, y: number, width: number, length: number }, sheet?: { length?: number, width?: number, price?: number, kerf?: number } }} Floor */

export function sampleFloor() {
  return { id: "Main floor", width: 480, depth: 336, joist: "2x10", spacing: 16, rim: true, beam: 168, blockingRows: 0 };
}

/** @param {Floor} f @param {{stock: {size: string, length: number}[]}} plan */
export function validateFloor(f, plan) {
  const errors = [];
  if (!(f.width >= 24 && f.width <= 1200)) errors.push("Floor width must be between 2 ft and 100 ft.");
  if (!(f.depth >= 24 && f.depth <= 1200)) errors.push("Floor depth (the joist direction) must be between 2 ft and 100 ft.");
  if (!(f.joist in DEPTH)) errors.push(`Unknown joist size ${f.joist}.`);
  if (!(f.spacing > 0 && f.spacing <= 48)) errors.push("Joist spacing must be between 0 and 48 inches.");
  for (const x of f.doubleUnder || []) if (!(x > 0 && x < f.width)) errors.push(`A wall at ${x} in for doubled joists must sit inside the floor's ${f.width} in width.`);
  if (f.stair) {
    const s = f.stair;
    if (!(s.width >= 12 && s.length >= 12)) errors.push("A stairwell opening must be at least 1 ft each way.");
    else if (!(s.x >= 0 && s.x + s.width <= f.width && s.y >= 12 && s.y + s.length <= f.depth - 12)) errors.push("The stairwell opening must sit inside the floor, at least 1 ft from the front and back edges.");
    else if (f.beam != null && s.y < f.beam + EPS && s.y + s.length > f.beam - EPS) errors.push("The stairwell opening cannot cross the beam line; keep it within one joist span.");
  }
  if (f.beam != null && !(f.beam > 12 && f.beam < f.depth - 12)) errors.push("The beam must sit between 1 ft and 1 ft short of the far edge.");
  const longest = Math.max(0, ...plan.stock.filter((s) => s.size === f.joist).map((s) => s.length));
  if (!longest) errors.push(`No ${f.joist} boards listed in the stock.`);
  return errors;
}

/**
 * Joist centres from the floor's left edge: the left edge joist, a joist at
 * every multiple of the spacing, and the right edge joist. A centre closer
 * than a joist width plus a hand to an edge joist is dropped.
 */
export function joistCentres(width, spacing) {
  const out = [THICK / 2];
  for (let c = spacing; c < width - THICK / 2 - THICK - 3; c += spacing) out.push(Math.round(c * 16) / 16);
  out.push(width - THICK / 2);
  return out;
}

/** Split `total` into pieces no longer than `max`, each end landing on one of `centres` (a splice sits over a joist). */
function splitOnCentres(total, max, centres) {
  if (total <= max + EPS) return [total];
  const out = [];
  let at = 0;
  while (total - at > max + EPS) {
    const reach = at + max - THICK / 2;
    const next = centres.filter((c) => c > at + 12 && c <= reach).pop();
    if (next == null) { out.push(max); at += max; continue; }
    out.push(next - at);
    at = next;
  }
  out.push(total - at);
  return out;
}

/**
 * Lay out one floor.
 * @param {Floor} f
 * @param {{ stock: { size: string, length: number, price: number }[], kerf?: number }} plan
 */
export function layoutFloor(f, plan) {
  const errors = validateFloor(f, plan);
  if (errors.length) return { ok: false, errors };
  const id = f.id || "Floor";
  const rim = f.rim !== false;
  const rimT = rim ? THICK : 0;
  const longest = Math.max(...plan.stock.filter((s) => s.size === f.joist).map((s) => s.length));
  const centres = joistCentres(f.width, f.spacing);
  const notes = [];
  const joists = [];
  const spans = f.beam != null ? [[rimT, f.beam], [f.beam, f.depth - rimT]] : [[rimT, f.depth - rimT]];
  for (const [i, c] of centres.entries()) {
    for (const [y0, y1] of spans) joists.push({ x: c - THICK / 2, y: y0, length: y1 - y0, size: f.joist, edge: i === 0 || i === centres.length - 1 });
  }
  // A wall running along the joists (`doubleUnder`: its x from the left edge) sits on a doubled joist:
  // a companion joist is nailed beside the one nearest the wall, on the wall's side, or inward at an edge.
  const doubled = [];
  for (const x of f.doubleUnder || []) {
    const i = centres.reduce((b, c, k) => (Math.abs(c - x) < Math.abs(centres[b] - x) ? k : b), 0);
    const side = i === centres.length - 1 ? -1 : i === 0 ? 1 : x >= centres[i] ? 1 : -1;
    const cx = centres[i] + side * THICK;
    for (const [y0, y1] of spans) joists.push({ x: cx - THICK / 2, y: y0, length: y1 - y0, size: f.joist, edge: false, doubled: true });
    doubled.push({ wall: x, joist: i, x: cx });
  }
  // A stairwell (`stair`: x, y from the front, clear width, clear length): the opening snaps outward to the joist lines
  // either side (trimmers, doubled), joists across it become tails to a doubled header at each end.
  let stairwell = null;
  if (f.stair) {
    const s = f.stair;
    const iL = centres.reduce((b, c, k) => (c <= s.x + EPS ? k : b), 0);
    const iR = centres.findIndex((c) => c >= s.x + s.width - EPS);
    const span = spans.find(([y0, y1]) => s.y >= y0 - EPS && s.y + s.length <= y1 + EPS);
    if (iR < 0 || !span) return { ok: false, errors: ["The stairwell opening does not fit between joist spans."] };
    const cL = centres[iL], cR = centres[iR];
    const hy0 = s.y - 2 * THICK, hy1 = s.y + s.length;
    if (hy0 <= span[0] + EPS || hy1 + 2 * THICK >= span[1] - EPS) return { ok: false, errors: ["The stairwell's headers would leave no room for tail joists; move the opening away from the edge or beam."] };
    // drop the joists the opening cuts, re-add them as tails
    const cut = (j) => j.y === span[0] && j.length === span[1] - span[0] && !j.doubled && j.x + THICK / 2 > cL + EPS && j.x + THICK / 2 < cR - EPS;
    const tails = [];
    for (let k = joists.length - 1; k >= 0; k--) if (cut(joists[k])) {
      const j = joists.splice(k, 1)[0];
      tails.push({ ...j, length: hy0 - span[0], tail: true }, { ...j, y: hy1 + 2 * THICK, length: span[1] - hy1 - 2 * THICK, tail: true });
    }
    joists.push(...tails);
    // trimmers: a companion on the opening side of each, the full span
    const trimmers = [];
    for (const [cx, dir] of [[cL, 1], [cR, -1]]) {
      joists.push({ x: cx + dir * THICK - THICK / 2, y: span[0], length: span[1] - span[0], size: f.joist, edge: false, doubled: true, trimmer: true });
      trimmers.push(cx);
    }
    const hl = cR - cL - THICK;
    const headers = [];
    for (const y of [hy0, hy1]) for (let p = 0; p < 2; p++) headers.push({ x: cL + THICK / 2, y: y + p * THICK, length: hl, size: f.joist });
    stairwell = { x: cL + THICK, y: s.y, width: cR - cL - THICK, length: s.length, requested: { ...s }, trimmers, headers, tails: tails.length };
  }
  for (const j of joists) if (j.length > longest + EPS) {
    return { ok: false, errors: [`A ${formatLength(j.length)} joist run is longer than the longest ${f.joist} listed (${formatLength(longest)}). Add a beam (floor.beam) or list longer boards.`] };
  }
  // Rim boards along the front and back edges; a splice sits over a joist.
  const rims = [];
  if (rim) for (const side of ["front", "back"]) for (const len of splitOnCentres(f.width, longest, centres)) rims.push({ side, length: len, size: f.joist });
  // Blocking: n rows across the joist span, a piece in every bay between joists.
  const bays = centres.slice(1).map((c, i) => c - centres[i] - THICK);
  const blocks = [];
  const rows = Math.max(0, Math.floor(f.blockingRows || 0));
  for (let r = 0; r < rows; r++) for (const b of bays) blocks.push({ row: r, length: Math.round(b * 16) / 16, size: f.joist });
  // Subfloor: courses of 4 ft across the joists; joints on joist centres.
  const sheet = { ...SHEET, price: 1, kerf: plan.kerf ?? 0.125, ...(f.sheet || {}) };
  const courses = [];
  const nFull = Math.floor((f.depth + EPS) / sheet.width);
  const rest = f.depth - nFull * sheet.width;
  for (let k = 0; k < nFull + (rest > EPS ? 1 : 0); k++) courses.push({ y: k * sheet.width, width: k < nFull ? sheet.width : rest });
  const sheetPieces = [];
  courses.forEach((c, k) => {
    // alternate courses start on the joist centre nearest half a sheet in, so joints stagger
    const lead = k % 2 ? centres.filter((x) => x <= sheet.length / 2 + EPS).pop() : 0;
    c.pieces = [];
    let at = 0;
    const cuts = [];
    if (lead) cuts.push(lead);
    at = lead || 0;
    while (f.width - at > sheet.length + EPS) {
      const next = centres.filter((x) => x > at + 12 && x <= at + sheet.length + EPS).pop();
      cuts.push(next ?? at + sheet.length);
      at = cuts[cuts.length - 1];
    }
    let prev = 0;
    for (const x of [...cuts, f.width]) { c.pieces.push({ x: prev, length: x - prev }); prev = x; }
    if (stairwell && c.y >= stairwell.y - EPS && c.y + c.width <= stairwell.y + stairwell.length + EPS) {
      // a course lying wholly in the opening's length: pieces inside it are dropped, ones across its edge are cut short
      const out = [];
      for (const p of c.pieces) {
        const a = p.x, b = p.x + p.length, o0 = stairwell.x, o1 = stairwell.x + stairwell.width;
        if (b <= o0 + EPS || a >= o1 - EPS) out.push(p);
        else { if (a < o0 - EPS) out.push({ x: a, length: o0 - a }); if (b > o1 + EPS) out.push({ x: o1, length: b - o1 }); }
      }
      c.pieces = out;
    }
    for (const p of c.pieces) sheetPieces.push({ length: p.length, width: c.width, course: k });
  });
  const stripWidths = [...new Set(courses.map((c) => c.width))];
  let sheets = 0, rip = 0;
  /** @type {{width:number,count:number,pieces:number}[]} */
  const sheetRows = [];
  for (const w of stripWidths) {
    const ps = sheetPieces.filter((p) => Math.abs(p.width - w) < EPS);
    const perSheet = Math.max(1, Math.floor((sheet.width + sheet.kerf) / (w + sheet.kerf)));
    const res = optimizeStock(ps.map((p) => ({ length: p.length, qty: 1 })), [{ length: sheet.length, price: 1 }], sheet.kerf);
    const need = Math.ceil(res.bars.length / perSheet);
    sheets += need;
    if (w < sheet.width - EPS) rip += need;
    sheetRows.push({ width: w, count: need, pieces: ps.length });
  }
  const area = (f.width * f.depth - (stairwell ? stairwell.width * stairwell.length : 0)) / 144;
  const sheetArea = (sheet.width * sheet.length) / 144;
  if (rest > EPS) notes.push(`The last subfloor course is ${formatInches(rest)} wide, ripped from ${rip} sheet${rip === 1 ? "" : "s"}; its long edge runs across the joists, so block or use tongue-and-groove sheets.`);
  if (f.beam != null) notes.push(`Joists butt over the beam at ${formatLength(f.beam)}; whether they butt, lap or hang from it is the framer's and engineer's call.`);
  if (doubled.length) notes.push(`${doubled.length} doubled joist line${doubled.length === 1 ? "" : "s"} under walls that run along the joists; a wall across the joists, or over a bay, needs blocking or a beam, which this does not size.`);
  if (stairwell) {
    const r = stairwell.requested;
    notes.push(`Stairwell opening: ${formatInches(stairwell.width)} x ${formatInches(stairwell.length)} clear (asked ${formatInches(r.width)} x ${formatInches(r.length)}; the width snaps out to the joist lines), doubled trimmers either side, two doubled headers, ${stairwell.tails} tail joists. Headers sit outside the opening's length, so the clear length is as asked. Subfloor courses that only partly cross the opening still count whole sheets: cut the opening out on site. Header size, hangers and the stair's own framing are not sized here.`);
  }
  notes.push("Joist size and spacing are your inputs and are not checked against a span table or code; bearing, hangers and fasteners are not in the takeoff.");
  return {
    ok: true, id, width: f.width, depth: f.depth, joistSize: f.joist, spacing: f.spacing, centres, joists, doubled, stairwell, rims, blocks, courses,
    sheets: { count: sheets, rows: sheetRows, area, waste: sheets ? 1 - area / (sheets * sheetArea) : 0 },
    notes,
  };
}

/** Cut rows in the engine's shape, so `takeoff(plan, floorCuts(layout))` buys floor lumber with the walls'. */
export function floorCuts(l) {
  if (!l.ok) return [];
  const map = new Map();
  const add = (size, length, kind) => {
    const len = Math.round(length * 16) / 16;
    const key = `${size}|${len}|${kind}`;
    const row = map.get(key) || { size, length: len, kind, qty: 0, walls: [l.id] };
    row.qty++;
    map.set(key, row);
  };
  for (const j of l.joists) add(j.size, j.length, j.doubled ? "doubled floor joist" : "floor joist");
  if (l.stairwell) for (const h of l.stairwell.headers) add(h.size, h.length, "stairwell header");
  for (const r of l.rims) add(r.size, r.length, "rim board");
  for (const b of l.blocks) add(b.size, b.length, "floor blocking");
  return [...map.values()];
}

export function floorText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.depth)}, ${l.joistSize} joists at ${l.spacing} o.c.`];
  out.push(`  ${l.centres.length} joist lines (${l.joists.length} pieces), ${l.rims.length} rim board${l.rims.length === 1 ? "" : "s"}, ${l.blocks.length} blocks${l.doubled.length ? `, ${l.doubled.length} doubled under walls` : ""}`);
  if (l.stairwell) out.push(`  Stairwell: ${formatInches(l.stairwell.width)} x ${formatInches(l.stairwell.length)} at x ${formatInches(l.stairwell.x)}, y ${formatInches(l.stairwell.y)}; ${l.stairwell.headers.length} header pieces, ${l.stairwell.tails} tail joists`);
  out.push(`  Joist centres: ${l.centres.map((c) => formatInches(c)).join(", ")}`);
  out.push(`  Subfloor: ${l.sheets.count} sheets of ${SHEET.width} x ${SHEET.length} in for ${l.sheets.area.toFixed(0)} sq ft (${(100 * l.sheets.waste).toFixed(1)}% offcut)`);
  for (const c of l.courses) out.push(`    course at ${formatLength(c.y)} (${formatInches(c.width)} wide): ${c.pieces.map((p) => formatInches(p.length)).join(" + ")}`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
