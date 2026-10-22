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

/** @typedef {{ id?: string, width: number, depth: number, joist?: string, spacing?: number, rim?: boolean, beam?: number, blockingRows?: number, sheet?: { length?: number, width?: number, price?: number, kerf?: number } }} Floor */

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
  const area = (f.width * f.depth) / 144;
  const sheetArea = (sheet.width * sheet.length) / 144;
  if (rest > EPS) notes.push(`The last subfloor course is ${formatInches(rest)} wide, ripped from ${rip} sheet${rip === 1 ? "" : "s"}; its long edge runs across the joists, so block or use tongue-and-groove sheets.`);
  if (f.beam != null) notes.push(`Joists butt over the beam at ${formatLength(f.beam)}; whether they butt, lap or hang from it is the framer's and engineer's call.`);
  notes.push("Joist size and spacing are your inputs and are not checked against a span table or code; bearing, hangers and fasteners are not in the takeoff.");
  return {
    ok: true, id, width: f.width, depth: f.depth, joistSize: f.joist, spacing: f.spacing, centres, joists, rims, blocks, courses,
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
  for (const j of l.joists) add(j.size, j.length, "floor joist");
  for (const r of l.rims) add(r.size, r.length, "rim board");
  for (const b of l.blocks) add(b.size, b.length, "floor blocking");
  return [...map.values()];
}

export function floorText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.depth)}, ${l.joistSize} joists at ${l.spacing} o.c.`];
  out.push(`  ${l.centres.length} joist lines (${l.joists.length} pieces), ${l.rims.length} rim board${l.rims.length === 1 ? "" : "s"}, ${l.blocks.length} blocks`);
  out.push(`  Joist centres: ${l.centres.map((c) => formatInches(c)).join(", ")}`);
  out.push(`  Subfloor: ${l.sheets.count} sheets of ${SHEET.width} x ${SHEET.length} in for ${l.sheets.area.toFixed(0)} sq ft (${(100 * l.sheets.waste).toFixed(1)}% offcut)`);
  for (const c of l.courses) out.push(`    course at ${formatLength(c.y)} (${formatInches(c.width)} wide): ${c.pieces.map((p) => formatInches(p.length)).join(" + ")}`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
