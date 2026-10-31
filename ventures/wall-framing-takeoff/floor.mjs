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

const DOUBLE = 2 * THICK;
export const SHEET = { width: 48, length: 96 };

/** @typedef {{ id?: string, width: number, depth: number, joist?: string, spacing?: number, rim?: boolean, beam?: number, cantilever?: number, headerCheck?: { liveLoad: number, deadLoad: number, Fb: number, Fv: number, E: number, deflLimit?: number }, blockingRows?: number, doubleUnder?: number[], openings?: { x: number, y: number, width: number, depth: number }[], penetrations?: { type: "hole"|"notch", at: number, size: number, length?: number, fromEdge?: number, end?: boolean }[], limits?: { hole?: number, holeEdge?: number, notch?: number, endNotch?: number, notchLength?: number }, sheet?: { length?: number, width?: number, price?: number, kerf?: number } }} Floor */

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
  for (const [i, o] of (f.openings || []).entries()) {
    const n = `Opening ${i + 1}`;
    if (!(o.width >= 12 && o.depth >= 12)) errors.push(`${n} must be at least 1 ft each way.`);
    else if (!(o.x > 0 && o.x + o.width < f.width && o.y >= 12 + DOUBLE && o.y + o.depth <= f.depth - 12 - DOUBLE)) errors.push(`${n} must sit inside the floor, at least 1 ft and a header from each edge.`);
    else if (f.beam != null && f.beam > o.y - 6 && f.beam < o.y + o.depth + 6) errors.push(`${n} runs over the beam at ${f.beam} in; move one of them.`);
  }
  // Two openings must not share a trimmer, a header zone or the joist bays between: each one's footprint is its
  // bounding joists (with the doubled trimmer outside them) by its depth plus a header at each end.
  if (!errors.length && (f.openings || []).length > 1) {
    const cs = joistCentres(f.width, f.spacing);
    const box = (/** @type {{x:number,y:number,width:number,depth:number}} */ o) => ({
      x0: (cs.filter((c) => c <= o.x + EPS).pop() ?? 0) - DOUBLE, x1: (cs.find((c) => c >= o.x + o.width - EPS) ?? f.width) + DOUBLE,
      y0: o.y - DOUBLE, y1: o.y + o.depth + DOUBLE,
    });
    const boxes = (f.openings || []).map(box);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS) errors.push(`Opening ${i + 1} and opening ${j + 1} are too close: they would share a trimmer joist or a header. Leave a joist bay or a header's width between them.`);
    }
  }
  if (f.headerCheck) {
    const h = f.headerCheck;
    for (const [k, lo, hi] of [["liveLoad", 1, 200], ["deadLoad", 0, 200], ["Fb", 10, 5000], ["Fv", 1, 500], ["E", 200000, 3000000]]) if (!(h[k] >= lo && h[k] <= hi) || (k === "deadLoad" && h[k] == null)) errors.push(`headerCheck.${k} must be typed, from ${lo} to ${hi} (${k === "liveLoad" || k === "deadLoad" ? "psf" : "psi"}); no default is shipped.`);
    if (h.deflLimit != null && !(h.deflLimit >= 120 && h.deflLimit <= 960)) errors.push("headerCheck.deflLimit is the L/ ratio, from 120 to 960.");
    if (!(f.openings || []).length) errors.push("headerCheck needs at least one opening (a stairwell).");
  }
  if (f.cantilever != null && !(f.cantilever > 0 && f.cantilever <= 96)) errors.push("The cantilever must be between 0 and 8 ft.");
  if (f.beam != null && !(f.beam > 12 && f.beam < f.depth - 12)) errors.push("The beam must sit between 1 ft and 1 ft short of the far edge.");
  const longest = Math.max(0, ...plan.stock.filter((s) => s.size === f.joist).map((s) => s.length));
  if (!longest) errors.push(`No ${f.joist} boards listed in the stock.`);
  return errors;
}

/**
 * Bending, shear and deflection of the doubled header at each end of a stairwell, from typed figures only:
 * `liveLoad` and `deadLoad` in psf, and the lumber's allowable bending `Fb`, shear `Fv` and modulus `E` in psi
 * (copy them from your span tables or the engineer's schedule, already adjusted for duration, repetition and
 * wet service; none is shipped). Model: a simple span between the trimmers (the clear width), carrying a
 * uniform strip of half the tail joists' span at live + dead, two plies of `size`. Deflection is live load
 * only against L / `deflLimit` (360 unless typed). A stair's own stringer reactions, a wall above and the
 * trimmers' own load are not in it. `tailSpans[k]` is [front, back] tail length for opening k.
 */
export function checkFloorHeaders(size, openings, tailSpans, loads) {
  const d = DEPTH[size], b = 2 * THICK;
  const { liveLoad, deadLoad, Fb, Fv, E } = loads;
  const lim = loads.deflLimit ?? 360;
  const S = (b * d * d) / 6, A = b * d, I = (b * d ** 3) / 12;
  const rows = [];
  for (const [k, o] of openings.entries()) for (const [side, tail] of [["front", tailSpans[k]?.[0]], ["back", tailSpans[k]?.[1]]]) {
    if (!(tail > 0)) continue;
    const L = o.clearWidth;
    const wTot = ((liveLoad + deadLoad) * (tail / 2 / 12)) / 12; // lb per inch: psf x strip width in ft / 12
    const wLive = ((liveLoad) * (tail / 2 / 12)) / 12;
    const M = (wTot * L * L) / 8, V = (wTot * L) / 2;
    const fb = M / S, fv = (1.5 * V) / A, defl = (5 * wLive * L ** 4) / (384 * E * I);
    const breaks = [];
    if (fb > Fb) breaks.push(`bending ${fb.toFixed(0)} psi over ${Fb}`);
    if (fv > Fv) breaks.push(`shear ${fv.toFixed(0)} psi over ${Fv}`);
    if (defl > L / lim) breaks.push(`live deflection ${defl.toFixed(2)} in over L/${lim} (${(L / lim).toFixed(2)} in)`);
    rows.push({ opening: k, side, span: L, tail, size: `2-${size}`, load: wTot * 12, fb, fv, defl, ok: !breaks.length, breaks });
  }
  return rows;
}

/**
 * Holes and notches in a joist of `size` over a clear `span`, against limits you can override (defaults are
 * the commonly printed residential figures: a hole no wider than 1/3 of the depth and 2 in from the edges, a
 * notch no deeper than 1/6 of the depth and 1/3 of it long, kept out of the middle third of the span, an end
 * notch no deeper than 1/4; the code in force for your site decides). `at` is the distance from the nearer
 * support to the centre of a hole or the nearer end of a notch. Returns one row per item with what it breaks.
 */
export function checkPenetrations(size, span, items = [], limits = {}) {
  const d = DEPTH[size];
  const L = { hole: 1 / 3, holeEdge: 2, notch: 1 / 6, endNotch: 1 / 4, notchLength: 1 / 3, ...limits };
  return items.map((p, i) => {
    const why = [];
    if (p.type === "hole") {
      if (p.size > L.hole * d + EPS) why.push(`hole ${formatInches(p.size)} is over ${formatInches(L.hole * d)} (${(100 * L.hole).toFixed(0)}% of the ${formatInches(d)} depth)`);
      const edge = p.fromEdge ?? (d - p.size) / 2;
      if (edge < L.holeEdge - EPS || d - edge - p.size < L.holeEdge - EPS) why.push(`hole edge is under ${formatInches(L.holeEdge)} from the top or bottom`);
      if (p.at < d - EPS) why.push(`hole centre is closer to the support than one joist depth (${formatInches(d)}); a rule of thumb, check your code`);
    } else if (p.type === "notch") {
      const end = p.end === true;
      const max = (end ? L.endNotch : L.notch) * d;
      if (p.size > max + EPS) why.push(`${end ? "end " : ""}notch ${formatInches(p.size)} deep is over ${formatInches(max)}`);
      if (!end) {
        if (p.length != null && p.length > L.notchLength * d + EPS) why.push(`notch ${formatInches(p.length)} long is over ${formatInches(L.notchLength * d)}`);
        if (p.at > span / 3 - EPS && p.at + (p.length ?? 0) < 2 * span / 3 + EPS) why.push("notch sits in the middle third of the span");
        else if (p.at + (p.length ?? 0) > span / 3 + EPS && p.at < 2 * span / 3 - EPS) why.push("notch reaches into the middle third of the span");
      } else if (p.length != null && p.length > d + EPS) why.push(`end notch is longer than the joist is deep`);
    } else why.push(`unknown type ${p.type}`);
    return { n: i + 1, ...p, ok: why.length === 0, why };
  });
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
  // `cantilever`: the joists, rim and subfloor run this far past the back support (the far end of `depth`).
  const cant = f.cantilever || 0;
  const total = f.depth + cant;
  const longest = Math.max(...plan.stock.filter((s) => s.size === f.joist).map((s) => s.length));
  const centres = joistCentres(f.width, f.spacing);
  const notes = [];
  const joists = [];
  const spans = f.beam != null ? [[rimT, f.beam], [f.beam, total - rimT]] : [[rimT, total - rimT]];
  // An opening (a stairwell: x and y from the left and front edges, width across the joists, depth along them)
  // is bounded by the joist at or beside each side (the trimmers, doubled on the outer side) and a doubled header
  // at each end; joists between the trimmers become tail joists that stop at the headers.
  const openings = (f.openings || []).map((o) => {
    const cl = centres.filter((c) => c <= o.x + EPS).pop();
    const cr = centres.find((c) => c >= o.x + o.width - EPS);
    return { ...o, left: cl, right: cr, clearWidth: cr - cl - THICK, cut: [o.y - DOUBLE, o.y + o.depth + DOUBLE] };
  });
  const headers = [];
  for (const o of openings) for (const y of [o.y - DOUBLE, o.y + o.depth]) for (let k = 0; k < 2; k++) headers.push({ x: o.left + THICK / 2, y, length: o.right - o.left - THICK, size: f.joist, opening: openings.indexOf(o) });
  const cutAt = (c) => openings.filter((o) => c > o.left + EPS && c < o.right - EPS);
  /** y-intervals of a span with the openings' header zones removed */
  const runs = (y0, y1, os) => {
    let out = [[y0, y1]];
    for (const o of os) out = out.flatMap(([a, b]) => [[a, Math.min(b, o.cut[0])], [Math.max(a, o.cut[1]), b]]).filter(([a, b]) => b - a > EPS);
    return out;
  };
  for (const [i, c] of centres.entries()) {
    const os = cutAt(c);
    for (const [y0, y1] of spans) for (const [a, b] of runs(y0, y1, os)) joists.push({ x: c - THICK / 2, y: a, length: b - a, size: f.joist, edge: i === 0 || i === centres.length - 1, tail: os.length > 0 });
  }
  const trimmers = [];
  for (const [k, o] of openings.entries()) for (const [c, i] of [[o.left, centres.indexOf(o.left)], [o.right, centres.indexOf(o.right)]]) {
    const side = i === 0 ? 1 : i === centres.length - 1 ? -1 : c === o.left ? -1 : 1;
    const cx = c + side * THICK;
    for (const [y0, y1] of spans) for (const [a, b] of runs(y0, y1, [])) joists.push({ x: cx - THICK / 2, y: a, length: b - a, size: f.joist, edge: false, doubled: true, trimmer: true });
    trimmers.push({ opening: k, joist: i, x: cx });
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
  for (const h of headers) joists.push({ ...h, header: true, edge: false });
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
  /** @type {{y: number, width: number, pieces?: any[]}[]} */
  const courses = [];
  const nFull = Math.floor((total + EPS) / sheet.width);
  const rest = total - nFull * sheet.width;
  for (let k = 0; k < nFull + (rest > EPS ? 1 : 0); k++) courses.push({ y: k * sheet.width, width: k < nFull ? sheet.width : rest });
  const sheetPieces = [];
  const holes = openings.map((o) => ({ x0: o.left + THICK / 2, x1: o.right - THICK / 2, y0: o.y, y1: o.y + o.depth }));
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
    // The stairwell is open between the trimmers and the headers: a piece wholly inside it is dropped, one that the
    // opening crosses over the course's full width is shortened (ending on a trimmer), and one it only bites into
    // keeps its full rectangle with a notch to cut out.
    for (const h of holes) {
      if (h.y1 <= c.y + EPS || h.y0 >= c.y + c.width - EPS) continue;
      const through = h.y0 <= c.y + EPS && h.y1 >= c.y + c.width - EPS;
      c.pieces = c.pieces.flatMap((p) => {
        if (h.x1 <= p.x + EPS || h.x0 >= p.x + p.length - EPS) return [p];
        if (!through) return [{ ...p, notches: [...(p.notches || []), { x: Math.max(h.x0, p.x), y: Math.max(h.y0, c.y), width: Math.min(h.x1, p.x + p.length) - Math.max(h.x0, p.x), depth: Math.min(h.y1, c.y + c.width) - Math.max(h.y0, c.y) }] }];
        return [[p.x, Math.min(h.x0, p.x + p.length)], [Math.max(h.x1, p.x), p.x + p.length]].filter(([a, b]) => b - a > 3).map(([a, b]) => ({ ...p, x: a, length: b - a })); // a sliver under 3 in is the offcut, not a piece
      });
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
  const area = (f.width * total - holes.reduce((a, h) => a + (h.x1 - h.x0) * (h.y1 - h.y0), 0)) / 144;
  const notched = courses.reduce((n, c) => n + (c.pieces || []).filter((p) => p.notches).length, 0);
  const sheetArea = (sheet.width * sheet.length) / 144;
  if (rest > EPS) notes.push(`The last subfloor course is ${formatInches(rest)} wide, ripped from ${rip} sheet${rip === 1 ? "" : "s"}; its long edge runs across the joists, so block or use tongue-and-groove sheets.`);
  if (f.beam != null) notes.push(`Joists butt over the beam at ${formatLength(f.beam)}; whether they butt, lap or hang from it is the framer's and engineer's call.`);
  if (openings.length) notes.push(`${openings.length} opening${openings.length === 1 ? "" : "s"}: doubled headers at both ends and doubled trimmer joists; the subfloor is cut around the clear opening${notched ? ` (${notched} sheet${notched === 1 ? "" : "s"} notched, the rest shortened or left out)` : ""}. Header size, hangers and the trimmers' load are the engineer's call.`);
  if (doubled.length) notes.push(`${doubled.length} doubled joist line${doubled.length === 1 ? "" : "s"} under walls that run along the joists; a wall across the joists, or over a bay, needs blocking or a beam, which this does not size.`);
  // Joist hangers: each tail joist hangs from a header at the end that meets an opening's header zone (one hanger),
  // and each doubled header hangs from its trimmers at both ends (a double hanger per end, so four per opening).
  // Counted from the placed members; the model, its load rating and nailing are the engineer's call.
  const tailEnds = joists.filter((j) => j.tail).reduce((n, j) => n + openings.filter((o) => cutAt(j.x + THICK / 2).includes(o)).reduce((m, o) => m + (Math.abs(j.y + j.length - o.cut[0]) < EPS) + (Math.abs(j.y - o.cut[1]) < EPS), 0), 0);
  const headerEnds = openings.length * 4;
  const hangers = { tail: tailEnds, singles: tailEnds, doubles: headerEnds, count: tailEnds + headerEnds, size: f.joist };
  let headerChecks = null;
  if (f.headerCheck && openings.length) {
    const tails = openings.map((o) => [0, 1].map((side) => Math.max(0, ...joists.filter((j) => j.tail && (side === 0 ? Math.abs(j.y + j.length - o.cut[0]) < EPS : Math.abs(j.y - o.cut[1]) < EPS) && j.x + THICK / 2 > o.left - EPS && j.x + THICK / 2 < o.right + EPS).map((j) => j.length))));
    headerChecks = checkFloorHeaders(f.joist, openings, tails, f.headerCheck);
    for (const r of headerChecks) notes.push(`Opening ${r.opening + 1} ${r.side} header, ${r.size} over ${formatInches(r.span)} clear carrying ${formatLength(r.tail)} tail joists: ${r.ok ? "passes" : "FAILS"} on your figures (bending ${r.fb.toFixed(0)} psi, shear ${r.fv.toFixed(0)} psi, live deflection ${r.defl.toFixed(2)} in)${r.ok ? "" : `: ${r.breaks.join("; ")}`}. Closed-form simple span, uniform half-span strip; stair reactions and walls above are not in it.`);
  }
  if (hangers.count) notes.push(`${hangers.count} joist hanger${hangers.count === 1 ? "" : "s"} counted (${tailEnds} single at tail-joist ends, ${headerEnds} double at header ends), sized for ${f.joist}; model and load rating are the engineer's call.`);
  if (cant) notes.push(`Joists cantilever ${formatLength(cant)} past the back support, ${(cant / f.depth).toFixed(2)} of the ${formatLength(f.depth)} supported span${cant > f.depth / 3 + EPS ? "; that is more than a third of it, and a common rule of thumb asks for the backspan to be at least 3 times the overhang, so have the engineer check it" : ""}. Cantilever size, backspan nailing and any tie-down are the engineer's call.`);
  const pen = f.penetrations?.length ? checkPenetrations(f.joist, f.beam != null ? Math.max(f.beam, f.depth - f.beam) : f.depth, f.penetrations, f.limits) : [];
  for (const h of pen) if (!h.ok) notes.push(`Joist ${h.type} ${h.n}: ${h.why.join("; ")}. Move it, sleeve it or ask the engineer.`);
  notes.push("Joist size and spacing are your inputs and are not checked against a span table or code; bearing, other hangers and fasteners are not in the takeoff.");
  return {
    ok: true, penetrations: pen, hangers, headerChecks, openings, trimmers, id, width: f.width, depth: total, supportedDepth: f.depth, cantilever: cant, joistSize: f.joist, spacing: f.spacing, centres, joists, doubled, rims, blocks, courses,
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
  for (const j of l.joists) add(j.size, j.length, j.header ? "floor header" : j.trimmer ? "trimmer joist" : j.doubled ? "doubled floor joist" : j.tail ? "tail joist" : "floor joist");
  for (const r of l.rims) add(r.size, r.length, "rim board");
  for (const b of l.blocks) add(b.size, b.length, "floor blocking");
  return [...map.values()];
}

export function floorText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.depth)}, ${l.joistSize} joists at ${l.spacing} o.c.`];
  out.push(`  ${l.centres.length} joist lines (${l.joists.length} pieces), ${l.rims.length} rim board${l.rims.length === 1 ? "" : "s"}, ${l.blocks.length} blocks${l.doubled.length ? `, ${l.doubled.length} doubled under walls` : ""}${l.hangers.count ? `, ${l.hangers.count} hangers` : ""}${l.openings.length ? `, ${l.openings.length} opening${l.openings.length === 1 ? "" : "s"} (${l.openings.map((o) => formatInches(o.clearWidth) + " clear").join(", ")})` : ""}`);
  out.push(`  Joist centres: ${l.centres.map((c) => formatInches(c)).join(", ")}`);
  out.push(`  Subfloor: ${l.sheets.count} sheets of ${SHEET.width} x ${SHEET.length} in for ${l.sheets.area.toFixed(0)} sq ft (${(100 * l.sheets.waste).toFixed(1)}% offcut)`);
  for (const c of l.courses) out.push(`    course at ${formatLength(c.y)} (${formatInches(c.width)} wide): ${c.pieces.map((p) => formatInches(p.length) + (p.notches ? ` (notch ${p.notches.map((n) => `${formatInches(n.width)} x ${formatInches(n.depth)}`).join(", ")})` : "")).join(" + ")}`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
