// @ts-check
// Deck framing: ledger, joists, rim, dropped beam, posts, footings, decking boards and the hardware count.
//
// A deck is a rectangle `width` (along the house, x) by `depth` (out from the house, y). Joists run the depth
// between a ledger on the house (or an inner rim, when `freestanding`) and an outer rim; the beam sits under the
// joists `overhang` in from the outer edge. Posts stand under the beam at even spacing no wider than
// `maxPostSpacing`. Decking boards run along x across the joists; each row's end joints land on a joist centre
// and rows start at different joists so joints do not line up. The lumber is its own order (pressure-treated
// sizes the wall stock does not list), bought from `deck.stock` or a default list.
import { THICK, EPS, optimizeStock, formatLength, formatInches } from "./engine.mjs";
import { joistCentres } from "./floor.mjs";
import { layoutLandingGuard } from "./stairs.mjs";

const NOMINAL = { "2x6": 5.5, "2x8": 7.25, "2x10": 9.25, "2x12": 11.25 };
const POST = { "4x4": 3.5, "6x6": 5.5 };
const CU_IN_PER_YD = 46656;

/** @typedef {{ id?: string, width: number, depth: number, height: number, joist?: string, spacing?: number, beam?: string, beamPlies?: number, freestanding?: boolean, overhang?: number, postSize?: string, postInset?: number, maxPostSpacing?: number, border?: number | boolean, deckBoard?: { width?: number, thickness?: number, gap?: number, size?: string }, footing?: { diameter?: number, depth?: number, bagYield?: number }, screwsPerBox?: number, railPostSpacing?: number, guard?: false | { sides?: ("outer"|"left"|"right"|"inner")[], threshold?: number, railBoard?: string, balusterWidth?: number, postWidth?: number, limits?: object }, spanTable?: { joist: string, spacing: number, maxSpan: number }[], stock?: { size: string, length: number, price: number }[] }} Deck */

export function sampleDeck() {
  return { id: "Rear deck", width: 192, depth: 144, height: 36, joist: "2x8", spacing: 16, beam: "2x10", beamPlies: 2, overhang: 12, postSize: "6x6" };
}

/** Pressure-treated lumber and 5/4 decking at the usual lengths; price is a dollar a foot unless the plan says otherwise. */
export function defaultDeckStock() {
  const out = [];
  for (const size of ["2x6", "2x8", "2x10", "2x12"]) for (const f of [8, 10, 12, 14, 16, 20]) out.push({ size: `${size} PT`, length: f * 12, price: f });
  for (const size of ["4x4", "6x6"]) for (const f of [8, 10, 12]) out.push({ size: `${size} PT`, length: f * 12, price: f * (size === "6x6" ? 2 : 1) });
  for (const f of [8, 10, 12, 16]) out.push({ size: "2x4 PT", length: f * 12, price: f * 0.6 });
  for (const f of [8, 12, 16, 20]) out.push({ size: "5/4x6 deck", length: f * 12, price: f });
  return out;
}

/** @param {Deck} d */
export function validateDeck(d) {
  const errors = [];
  if (!(d.width >= 48 && d.width <= 600)) errors.push("Deck width (along the house) must be between 4 ft and 50 ft.");
  if (!(d.depth >= 48 && d.depth <= 360)) errors.push("Deck depth (out from the house) must be between 4 ft and 30 ft.");
  if (!(d.height >= 6 && d.height <= 120)) errors.push("Deck height above grade must be between 6 in and 10 ft.");
  if (!((d.joist ?? "2x8") in NOMINAL)) errors.push(`Unknown joist size ${d.joist}.`);
  if (!((d.beam ?? "2x10") in NOMINAL)) errors.push(`Unknown beam size ${d.beam}.`);
  if (!((d.postSize ?? "6x6") in POST)) errors.push(`Unknown post size ${d.postSize}; use 4x4 or 6x6.`);
  if (!([12, 16, 24].includes(d.spacing ?? 16))) errors.push("Joist spacing must be 12, 16 or 24 inches.");
  const plies = d.beamPlies ?? 2;
  if (![1, 2, 3].includes(plies)) errors.push("Beam plies must be 1, 2 or 3.");
  if (d.border != null && d.border !== true && d.border !== false && ![1, 2, 3].includes(d.border)) errors.push("Border courses must be 1, 2 or 3 (or true for one).");
  const o = d.overhang ?? 12;
  if (!(o >= 0 && o < d.depth / 2)) errors.push("The joist overhang past the beam must be between 0 and half the depth.");
  if (!(Number.isFinite(d.height) && Number.isFinite(d.width) && Number.isFinite(d.depth))) errors.push("Width, depth and height must be numbers (inches).");
  return errors;
}

/** Split a row of `total` into boards no longer than `max`, every joint on a joist centre; `first` is the target for the first board. */
function rowPieces(total, max, centres, first) {
  if (total <= max + EPS) return [total];
  const cuts = [];
  let at = 0;
  let reach = Math.min(first, max);
  while (total - at > max + EPS || cuts.length === 0) {
    const c = centres.filter((x) => x > at + 12 && x <= at + reach + EPS).pop();
    if (c == null) { cuts.push(at + reach); at += reach; } else { cuts.push(c); at = c; }
    reach = max;
    if (total - at <= max + EPS) break;
  }
  // a last board under a foot long is not worth buying: pull the previous joint back one joist
  if (total - cuts[cuts.length - 1] < 12 && cuts.length) {
    const prev = cuts.length > 1 ? cuts[cuts.length - 2] : 0;
    const back = centres.filter((x) => x > prev + 12 && x < cuts[cuts.length - 1] - EPS).pop();
    if (back != null) cuts[cuts.length - 1] = back;
  }
  const out = [];
  let p = 0;
  for (const c of [...cuts, total]) { out.push(c - p); p = c; }
  return out;
}

/**
 * Lay out one deck.
 * @param {Deck} d
 */
export function layoutDeck(d) {
  const errors = validateDeck(d);
  if (errors.length) return { ok: false, errors };
  const id = d.id || "Deck";
  const joist = d.joist ?? "2x8", beam = d.beam ?? "2x10", plies = d.beamPlies ?? 2, spacing = d.spacing ?? 16;
  const postSize = d.postSize ?? "6x6", overhang = d.overhang ?? 12;
  const freestanding = !!d.freestanding;
  const stock = d.stock ?? defaultDeckStock();
  const longest = (/** @type {string} */ size) => Math.max(0, ...stock.filter((s) => s.size === size).map((s) => s.length));
  const need = [`${joist} PT`, `${beam} PT`, `${postSize} PT`, "5/4x6 deck"].find((s) => !longest(s));
  if (need) return { ok: false, errors: [`No ${need} boards listed in the stock.`] };
  const board = { width: 5.5, thickness: 1, gap: 0.1875, ...(d.deckBoard || {}) };
  const notes = [];
  const warnings = [];

  const centres = joistCentres(d.width, spacing);
  const joistLen = d.depth - 2 * THICK; // between the ledger (or inner rim) and the outer rim
  const joists = centres.map((c, i) => ({ x: c, length: joistLen, edge: i === 0 || i === centres.length - 1 }));
  if (joistLen > longest(`${joist} PT`) + EPS) return { ok: false, errors: [`A ${formatLength(joistLen)} joist is longer than the longest ${joist} PT listed (${formatLength(longest(`${joist} PT`))}). List longer boards.`] };
  const rims = [{ side: "outer", length: d.width }, { side: freestanding ? "inner" : "ledger", length: d.width }];

  // Beam: a line of posts, the beam's plies spliced only over a post.
  const postInset = d.postInset ?? 12;
  const maxPost = d.maxPostSpacing ?? 96;
  const span = d.width - 2 * postInset;
  const nPosts = Math.max(2, Math.ceil(span / maxPost - 1e-9) + 1);
  const posts = Array.from({ length: nPosts }, (_, i) => Math.round((postInset + (span * i) / (nPosts - 1)) * 16) / 16);
  const beamMax = longest(`${beam} PT`);
  const beamPieces = [];
  let at = 0;
  const beamLen = d.width;
  while (beamLen - at > beamMax + EPS) {
    const c = posts.filter((x) => x > at + 12 && x <= at + beamMax + EPS).pop();
    if (c == null) return { ok: false, errors: [`The ${beam} beam cannot splice over a post within ${formatLength(beamMax)}; add a post or list longer boards.`] };
    beamPieces.push(c - at); at = c;
  }
  beamPieces.push(beamLen - at);
  const beamBoards = [];
  for (let p = 0; p < plies; p++) for (const l of beamPieces) beamBoards.push({ ply: p + 1, length: l, size: beam });
  if (beamPieces.length > 1) notes.push(`The ${beam} beam is spliced over a post (${beamPieces.map(formatLength).join(" + ")}); stagger the plies' splices so no two fall on the same post.`);

  // Post length from the surface down: decking + joist + beam depth; the footing top is at grade.
  const drop = board.thickness + NOMINAL[joist] + NOMINAL[beam];
  const postLen = Math.round((d.height - drop) * 16) / 16;
  if (postLen < 4) return { ok: false, errors: [`At ${formatInches(d.height)} above grade the joists, beam and decking leave a ${formatInches(postLen)} post; raise the deck or build it on a different base.`] };
  if (postLen > longest(`${postSize} PT`) + EPS) return { ok: false, errors: [`A ${formatLength(postLen)} post is longer than the longest ${postSize} PT listed.`] };
  if (postLen > 96) warnings.push(`Posts over 8 ft (${formatLength(postLen)}) usually need bracing and an engineer's footing; this takeoff does not size either.`);

  // Footings: a round pier per post; volume from the typed diameter and depth.
  const ft = { diameter: 12, depth: 42, bagYield: 0.6, ...(d.footing || {}) };
  const footVolIn3 = Math.PI * (ft.diameter / 2) ** 2 * ft.depth * posts.length;
  const concrete = { count: posts.length, diameter: ft.diameter, depth: ft.depth, yards: footVolIn3 / CU_IN_PER_YD, bags: Math.ceil((footVolIn3 / 1728) * 1.1 / ft.bagYield - 1e-9), bagYield: ft.bagYield };

  // Decking: rows across the joists; every row's joints sit on joist centres and the starting joint steps along.
  // `border: n` frames the field with n picture-frame courses mitred at the corners (outer edge, house edge and both ends).
  const nb = d.border === true ? 1 : (d.border || 0);
  const pitch = board.width + board.gap;
  const frame = nb * pitch;
  const fieldW = d.width - 2 * frame, fieldD = d.depth - 2 * frame;
  const boardMax = longest("5/4x6 deck");
  const rows = Math.ceil((fieldD + board.gap) / pitch - 1e-9);
  const stagger = [1, 0.67, 0.34, 0.84, 0.5];
  const deckBoards = [];
  const fieldCentres = centres.map((c) => c - frame).filter((c) => c > EPS && c < fieldW - EPS);
  for (let r = 0; r < rows; r++) for (const l of rowPieces(fieldW, boardMax, fieldCentres, Math.max(24, boardMax * stagger[r % stagger.length]))) deckBoards.push({ row: r, length: l });
  const lastRow = fieldD - (rows - 1) * pitch;
  if (lastRow < board.width - EPS) notes.push(`The last decking row is ${formatInches(lastRow)} wide, ripped from a ${formatInches(board.width)} board; rip the first and last rows to match instead.`);
  const joints = deckBoards.length - rows;
  const borderBoards = [];
  let frameJoists = 0, borderScrewsExtra = 0;
  if (nb) {
    if (fieldW < 24 || fieldD < 24) return { ok: false, errors: [`${nb} border course${nb > 1 ? "s" : ""} leave a field under 2 ft; use fewer courses.`] };
    for (let k = 0; k < nb; k++) {
      const lenX = d.width - 2 * k * pitch, lenY = d.depth - 2 * k * pitch; // long point of the mitre
      const cx = centres.map((c) => c - k * pitch).filter((c) => c > EPS && c < lenX - EPS);
      for (const side of ["outer", "house"]) for (const l of rowPieces(lenX, boardMax, cx, boardMax)) borderBoards.push({ course: k + 1, side, length: l });
      const nY = Math.ceil(lenY / boardMax - 1e-9), pieceY = lenY / nY;
      for (const side of ["left", "right"]) for (let i = 0; i < nY; i++) borderBoards.push({ course: k + 1, side, length: pieceY });
      borderScrewsExtra += 2 * Math.ceil(lenY / 16) * 2; // two sides, two screws per 16 in
    }
    frameJoists = 2;
    notes.push(`Picture frame: ${nb} course${nb > 1 ? "s" : ""} of ${formatInches(board.width)} boards, mitred at the four corners (lengths are to the long point); the field is ${formatLength(fieldW)} x ${formatLength(fieldD)}. ${frameJoists} extra frame joists (one at each end of the field, beside the layout joists) carry the field's board ends and the end borders; a border piece that is not over a joist needs blocking under the joint. Border pieces along the ends run with the joists and are split into equal lengths.`);
  }
  const crossings = rows * (fieldCentres.length + (nb ? 2 : 0) + (nb ? 0 : 0)) + borderBoards.filter((b) => b.side === "outer" || b.side === "house").length * centres.length;
  const screws = crossings * 2 + borderScrewsExtra;
  const screwsPerBox = d.screwsPerBox ?? 350;

  // Hardware: counts a deck of this shape usually carries; sizes and ratings are the plan's and the code's call.
  const hardware = [
    { item: "joist hanger", qty: freestanding ? centres.length * 2 : centres.length, note: freestanding ? "both ends on rims" : "ledger end; the beam end rides on the beam" },
    { item: "post base", qty: posts.length },
    { item: "post-to-beam cap or notch bolts", qty: posts.length },
    { item: "joist-to-beam tie", qty: centres.length * 2, note: "one each side where joists cross the beam" },
    ...(freestanding ? [] : [{ item: "ledger fastener (1/2 in lag or structural screw)", qty: Math.ceil(d.width / 16) * 2, note: "two per 16 in, staggered" }, { item: "ledger flashing (ft)", qty: Math.ceil(d.width / 12) }]),
    { item: "lateral load connector", qty: 2, note: "commonly two on an attached deck (check your code's rating)" },
  ];
  const railPosts = Math.ceil((d.width + 2 * d.depth) / (d.railPostSpacing ?? 72)) + 1;

  // Guard: code asks for one where the surface is over `threshold` (30 in) above grade. Open edges are the outer
  // edge and both sides, plus the inner edge when freestanding; corners shared by two edges get one post.
  const gOpt = d.guard === false ? null : (d.guard || {});
  const threshold = gOpt?.threshold ?? 30;
  let guard = null;
  if (gOpt && (d.height > threshold || d.guard)) {
    const sides = gOpt.sides ?? (freestanding ? ["outer", "left", "right", "inner"] : ["outer", "left", "right"]);
    const len = { outer: d.width, inner: d.width, left: d.depth, right: d.depth };
    const shared = sides.reduce((n, a, i) => n + sides.slice(i + 1).filter((b) => (a === "outer" || a === "inner") !== (b === "outer" || b === "inner")).length, 0);
    guard = layoutLandingGuard(sides.map((x) => len[x]), { railBoard: "2x4", ...gOpt }, shared);
    guard.sides = sides;
    const railMax = longest("2x4 PT");
    if (railMax && guard.guardRails.lengths.some((x) => x > railMax + EPS)) notes.push(`A guard rail longer than ${formatLength(railMax)} is bought in equal pieces; splice each over a post.`);
  } else if (d.height > threshold) warnings.push(`The surface is ${formatInches(d.height)} above grade, over the ${threshold} in where codes usually require a guard; none is laid out.`);

  // Warnings against the user's own span table, if given.
  const joistSpan = d.depth - overhang - THICK;
  if (d.spanTable) {
    const row = d.spanTable.find((r) => r.joist === joist && r.spacing === spacing);
    if (!row) warnings.push(`Your span table has no row for ${joist} at ${spacing} o.c.; the joist span (${formatLength(joistSpan)}) is unchecked.`);
    else if (joistSpan > row.maxSpan + EPS) warnings.push(`Joist span ${formatLength(joistSpan)} exceeds your table's ${formatLength(row.maxSpan)} for ${joist} at ${spacing} o.c.; use a deeper joist or tighter spacing.`);
    if (overhang > joistSpan / 4 + EPS) warnings.push(`The ${formatInches(overhang)} cantilever is over a quarter of the ${formatLength(joistSpan)} joist span.`);
  } else notes.push("No span table given: joist, beam and post sizes are your inputs and are not checked. Add `spanTable` rows from your code's table to get a warning.");
  notes.push("Footing depth, diameter and bearing are typed figures (frost depth is local); the takeoff does not size footings. Guard-rail post count is by spacing only.");

  // Blocking: optional rows across the joists (`blocking: { every: 96 }` in inches); each block fills the gap between
  // two joists, so a row is one piece per bay and the rows split the joist length into equal parts.
  let blocking = null;
  if (d.blocking && d.blocking.every > 0) {
    const rowsN = Math.max(0, Math.ceil(joistLen / d.blocking.every - 1e-9) - 1);
    const bays = centres.slice(1).map((c, i) => c - centres[i] - THICK);
    if (rowsN) {
      blocking = { rows: rowsN, pieces: rowsN * bays.length, bays };
      notes.push(`Blocking: ${rowsN} row${rowsN > 1 ? "s" : ""} at ${formatLength(joistLen / (rowsN + 1))} spacing (${blocking.pieces} pieces), staggered so each can be face-nailed; whether your code asks for it is your call.`);
    }
  }
  const lumber = [
    ...(blocking ? Array.from({ length: blocking.rows }, () => blocking.bays.map((length) => ({ size: `${joist} PT`, length, kind: "blocking" }))).flat() : []),
    ...joists.map((j) => ({ size: `${joist} PT`, length: j.length, kind: "joist" })),
    ...rims.flatMap((r) => rowPieces(r.length, longest(`${joist} PT`), centres, longest(`${joist} PT`)).map((length) => ({ size: `${joist} PT`, length, kind: r.side === "outer" ? "outer rim" : r.side === "inner" ? "inner rim" : "ledger" }))),
    ...beamBoards.map((b) => ({ size: `${beam} PT`, length: b.length, kind: "beam ply" })),
    ...posts.map(() => ({ size: `${postSize} PT`, length: postLen, kind: "post" })),
    ...frameJoists ? Array.from({ length: frameJoists }, () => ({ size: `${joist} PT`, length: joistLen, kind: "frame joist" })) : [],
    ...deckBoards.map((b) => ({ size: "5/4x6 deck", length: b.length, kind: "decking" })),
    ...borderBoards.map((b) => ({ size: "5/4x6 deck", length: b.length, kind: "border" })),
    ...(guard && longest("2x4 PT") ? guard.guardRails.lengths.flatMap((x) => { const n = Math.ceil(x / longest("2x4 PT") - 1e-9); return Array.from({ length: n }, () => ({ size: "2x4 PT", length: x / n, kind: "guard rail" })); }) : []),
  ];
  // the outer rim and ledger are as long as the deck; a splice sits over a joist
  const orders = [];
  for (const size of [...new Set(lumber.map((l) => l.size))]) {
    const pieces = lumber.filter((l) => l.size === size).map((l) => ({ length: l.length, qty: 1, ref: l.kind }));
    let res;
    try { res = optimizeStock(pieces, stock.filter((s) => s.size === size), 0.125); } catch (e) { return { ok: false, errors: [`${size}: ${/** @type {Error} */ (e).message}. Splice it over a joist or list longer boards.`] }; }
    const lines = new Map();
    for (const b of res.bars) { const row = lines.get(b.length) || { size, length: b.length, price: b.price, qty: 0 }; row.qty++; lines.set(b.length, row); }
    orders.push({ size, cost: res.cost, lines: [...lines.values()].sort((a, b) => b.length - a.length), boards: res.bars.length, needed: pieces.reduce((s, p) => s + p.length, 0), bought: res.bars.reduce((s, b) => s + b.length, 0) });
  }
  const area = (d.width * d.depth) / 144;
  return {
    ok: true, id, width: d.width, depth: d.depth, height: d.height, joistSize: joist, beamSize: beam, beamPlies: plies, postSize, spacing, freestanding, overhang,
    centres, joists, rims, posts, postLength: postLen, beamPieces, beamBoards, concrete, rows, deckBoards, borderBoards, borderCourses: nb, fieldWidth: fieldW, fieldDepth: fieldD, joints, screws, screwBoxes: Math.ceil(screws / screwsPerBox), hardware, railPosts, guard, blocking,
    lumber, orders, area, cost: orders.reduce((s, o) => s + o.cost, 0), joistSpan, warnings, notes,
  };
}

export function deckText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.depth)}, ${formatInches(l.height)} above grade, ${l.freestanding ? "freestanding" : "ledger on the house"}`];
  out.push(`  ${l.joists.length} ${l.joistSize} joists at ${l.spacing} o.c. (${formatLength(l.joists[0].length)} each, ${formatLength(l.joistSpan)} to the beam, ${formatInches(l.overhang)} cantilever)`);
  out.push(`  Beam: ${l.beamPlies} x ${l.beamSize}, ${l.beamBoards.length} boards; ${l.posts.length} ${l.postSize} posts at ${l.posts.map((p) => formatLength(p)).join(", ")}, each ${formatLength(l.postLength)}`);
  out.push(`  Footings: ${l.concrete.count} x ${l.concrete.diameter} in by ${l.concrete.depth} in = ${l.concrete.yards.toFixed(2)} cu yd (${l.concrete.bags} bags at ${l.concrete.bagYield} cu ft, 10% waste)`);
  out.push(`  Decking: ${l.rows} rows, ${l.deckBoards.length} boards (${l.joints} butt joints, each on a joist), ${l.screws} screws (${l.screwBoxes} box${l.screwBoxes === 1 ? "" : "es"})`);
  if (l.borderCourses) out.push(`  Picture frame: ${l.borderCourses} course${l.borderCourses > 1 ? "s" : ""}, ${l.borderBoards.length} border boards, field ${formatLength(l.fieldWidth)} x ${formatLength(l.fieldDepth)}`);
  out.push("  Lumber order:");
  for (const o of l.orders) for (const ln of o.lines) out.push(`    ${ln.qty} x ${o.size} ${formatLength(ln.length)}`);
  out.push("  Hardware:");
  for (const h of l.hardware) out.push(`    ${h.qty} x ${h.item}${h.note ? ` (${h.note})` : ""}`);
  if (l.guard) out.push(`  Guard (${l.guard.sides.join(", ")}): ${l.guard.posts.count} posts, ${l.guard.balusters.count} balusters of ${formatInches(l.guard.balusters.length)} (clear gap at most ${formatInches(l.guard.balusters.maxGap)}), ${l.guard.guardRails.count} rails of ${l.guard.guardRails.size} PT in the order; posts and balusters are not bought`);
  else out.push(`    ${l.railPosts} guard-rail posts at the open edges (by spacing only)`);
  for (const w of l.warnings) out.push(`  ! ${w}`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
