// @ts-check
// Stair framing: riser count, tread run, stringer notch geometry, the stairwell
// opening the headroom needs, and the lumber for stringers and treads.
//
// Rules are the model residential code's usual limits, held as typed limits
// (`limits`) because the edition in force is the user's to confirm: riser at
// most 7-3/4 in, tread at least 10 in, no more than 3/8 in between the tallest
// and shortest riser, 6 ft 8 in of headroom, 36 in clear width, 147 in of rise
// between landings, and 3-1/2 in of board left under each notch. The risers are
// cut equal: total rise divided by the fewest risers that fit under the limit.
//
// Geometry (inches): the pitch line joins the tread noses, so its slope is
// riser / tread. The notch's inside corner sits R*T/hypot(R,T) from that line
// (the perpendicular), so the board left under the notch ("throat") is the
// board's depth minus that. The first step is cut one tread thickness short so
// the finished first step matches the rest once the tread is on.
import { THICK, DEPTH, formatLength, formatInches } from "./engine.mjs";

export const STAIR_LIMITS = { maxRiser: 7.75, minTread: 10, riserVariance: 0.375, headroom: 80, minWidth: 36, maxRise: 147, minThroat: 3.5, openRiserGap: 4 };

/** Longest span a stair tread board may run between stringers, by board thickness (typed, model-code-style figures: under 1-1/4 in 12 in, under 1-1/2 in 16 in, 1-1/2 in and thicker 24 in; the local book rules). */
export function maxTreadSpan(thickness) { return thickness < 1.25 ? 12 : thickness < 1.5 ? 16 : 24; }

/** Guard and handrail limits (model residential code's usual ones, typed so the local book can change them): 36 in guard, handrail 34 to 38 in above the nose line, balusters with no clear gap a 4 in sphere passes, posts no more than 72 in apart, 4 in under the bottom rail. */
export const RAIL_LIMITS = { guardHeight: 36, handrailMin: 34, handrailMax: 38, maxGap: 4, maxPostSpacing: 72, bottomGap: 4 };

/** @typedef {{ sides?: number, handrail?: boolean, handrailHeight?: number, balusterWidth?: number, railBoard?: string, postWidth?: number, limits?: Partial<typeof RAIL_LIMITS> }} Rail */
/** @typedef {{ id?: string, rail?: Rail, totalRise: number, tread?: number, stringer?: string, width?: number, stringerSpacing?: number, treadThickness?: number, treadBoard?: string, treadGap?: number, nosing?: number, floorThickness?: number, openingLength?: number, openRisers?: boolean, riserBoard?: string, treadSpanMax?: number, limits?: Partial<typeof STAIR_LIMITS> }} Stair */

export function sampleStair() {
  return { id: "Main stair", totalRise: 108, tread: 10, stringer: "2x12", width: 36, treadThickness: 1.5, treadBoard: "2x12", floorThickness: 11.25 + 0.75 + 0.5, nosing: 0.75 };
}

/** @param {Stair} s */
export function validateStair(s) {
  const L = { ...STAIR_LIMITS, ...(s.limits || {}) };
  const errors = [];
  if (!(s.totalRise >= 12)) errors.push("Total rise (finished floor to finished floor) must be at least 1 ft.");
  else if (s.totalRise > L.maxRise) errors.push(`A flight can rise at most ${formatLength(L.maxRise)} between landings; ${formatLength(s.totalRise)} needs a landing, so lay out each flight on its own.`);
  if (s.tread != null && !(s.tread >= L.minTread)) errors.push(`Tread ${s.tread} in is under the ${L.minTread} in minimum.`);
  if (s.stringer && !(s.stringer in DEPTH)) errors.push(`Unknown stringer size ${s.stringer}.`);
  if (s.treadBoard && !(s.treadBoard in DEPTH)) errors.push(`Unknown tread board size ${s.treadBoard}.`);
  if (s.riserBoard && !(s.riserBoard in DEPTH)) errors.push(`Unknown riser board size ${s.riserBoard}.`);
  if (s.width != null && !(s.width >= L.minWidth)) errors.push(`Stair width ${s.width} in is under the ${L.minWidth} in minimum.`);
  if (s.width != null && s.width > 120) errors.push("Stair width over 10 ft is outside what this layout checks.");
  return errors;
}

/**
 * @param {Stair} input
 * @param {{stock: {size: string, length: number}[]}} [plan]
 */
export function layoutStair(input, plan) {
  const s = { id: "Stair", tread: 10, stringer: "2x12", width: 36, riserBoard: null, treadThickness: 1.5, treadBoard: "2x12", treadGap: 0.25, nosing: 1, stringerSpacing: 16, floorThickness: 12.25, ...input };
  const L = { ...STAIR_LIMITS, ...(input.limits || {}) };
  const errors = validateStair({ ...s, limits: input.limits });
  if (errors.length) return { ok: false, id: s.id, errors };

  // Fewest equal risers under the limit; a tread chosen by the person stays, else the 2R+T comfort rule (25 in) bounded below by the code minimum.
  const risers = Math.ceil(s.totalRise / L.maxRiser - 1e-9);
  const riser = s.totalRise / risers;
  const tread = input.tread ?? Math.max(L.minTread, Math.round((25 - 2 * riser) * 16) / 16);
  const treads = risers - 1; // the top "tread" is the upper floor
  const run = tread * treads;
  const pitch = Math.hypot(s.totalRise - riser, run); // pitch line, first nose to top nose
  const firstRiserCut = riser - s.treadThickness;
  const depth = DEPTH[s.stringer];
  const throat = depth - (riser * tread) / Math.hypot(riser, tread);
  const angle = (Math.atan2(riser, tread) * 180) / Math.PI;
  const notes = [];
  if (throat < L.minThroat) notes.push(`Only ${formatInches(throat)} left under the notches; the rule of thumb and most codes want ${L.minThroat} in: use a deeper board, a shorter tread or add a centre support.`);
  const comfort = 2 * riser + tread;
  if (comfort < 24 || comfort > 25.5) notes.push(`2 x riser + tread is ${comfort.toFixed(2)} in; steps between 24 and 25.5 in feel natural.`);
  // Open risers (2026-10-30): the clear gap between one tread's top and the next tread's underside is the riser less the tread thickness; the usual code lets no 4 in sphere pass (a vertical-gap bound; the slope makes a real sphere test slightly easier to pass). Nosing rules are for solid risers, so they are skipped here.
  if (s.openRisers) {
    const gap = riser - s.treadThickness;
    if (gap > L.openRiserGap + 1e-9) notes.push(`Open risers leave a ${formatInches(gap)} gap between treads; the usual limit is ${L.openRiserGap} in: add risers (solid or slats) or a thicker tread. Some codes relax this for a stair rising 30 in or less.`);
  } else if (s.nosing > 1.25 || s.nosing < 0.75) if (tread < 11) notes.push(`Nosing ${s.nosing} in is outside the 3/4 to 1-1/4 in the code allows on solid-riser treads under 11 in.`);

  // Headroom: the nose line passes x*R/T below the top floor surface at x from the top riser; the floor above hangs `floorThickness` below it.
  const minOpening = ((L.headroom + s.floorThickness) * tread) / riser;
  let opening = null;
  if (s.openingLength != null) {
    const headroom = (s.openingLength * riser) / tread - s.floorThickness;
    opening = { length: s.openingLength, headroom, ok: headroom >= L.headroom - 1e-9 };
    if (!opening.ok) notes.push(`The ${formatLength(s.openingLength)} opening leaves ${formatInches(Math.max(0, headroom))} of headroom at its edge; ${formatInches(L.headroom)} needs ${formatLength(Math.ceil(minOpening * 16) / 16)}.`);
  }

  // Stringers: outer two at the stair edges, others no more than the spacing apart (16 in for 5/4 decking or 2x treads at 16 is the usual limit; type yours).
  const span = s.width - THICK;
  const stringers = Math.max(3, Math.ceil(span / s.stringerSpacing - 1e-9) + 1);
  const treadSpan = span / (stringers - 1), treadSpanMax = input.treadSpanMax ?? maxTreadSpan(s.treadThickness);
  if (treadSpan > treadSpanMax + 1e-9) notes.push(`${formatInches(s.treadThickness)} treads span ${formatInches(treadSpan)} between stringers; ${formatInches(treadSpanMax)} is the usual most: use a smaller stringer spacing or thicker treads.`);
  // Board length: the pitch line plus what the plumb cut at the top and the level cut at the bottom take along the board's edge
  // (a conservative bound: the full board depth projected on the slope at each end).
  const slope = Math.hypot(riser, tread);
  const stringerLength = pitch + (depth * (riser + tread)) / slope;
  const longest = plan ? Math.max(0, ...plan.stock.filter((x) => x.size === s.stringer).map((x) => x.length)) : Infinity;
  if (stringerLength > longest) errors.push(`Each ${s.stringer} stringer needs ${formatLength(stringerLength)} and the longest listed is ${formatLength(longest)}; add a longer board or a mid-flight support.`);
  if (errors.length) return { ok: false, id: s.id, errors };

  // Tread boards across the width: enough boards to cover tread + nosing with a gap between them.
  const bw = DEPTH[s.treadBoard];
  const cover = tread + s.nosing;
  const perStep = Math.ceil((cover + s.treadGap) / (bw + s.treadGap) - 1e-9);
  const treadBoards = { size: s.treadBoard, perStep, length: s.width, count: perStep * treads, coverage: perStep * bw + (perStep - 1) * s.treadGap, need: cover };
  // Layout points for the framing square: the stair-gauge marks along the board's top edge.
  // Solid risers: boards across the stair width, enough per riser to cover its height (only bought when `riserBoard` is typed: the order's boards are 2x sizes, so a 1x riser is the person's to add).
  const riserBoards = s.openRisers || !s.riserBoard ? null : { size: s.riserBoard, perRiser: Math.ceil(riser / DEPTH[s.riserBoard] - 1e-9), length: s.width, count: risers * Math.ceil(riser / DEPTH[s.riserBoard] - 1e-9) };
  const rail = input.rail ? layoutRail({ riser, tread, run, pitch, risers }, input.rail, notes) : null;
  const marks = Array.from({ length: risers }, (_, i) => ({ step: i + 1, rise: i === 0 ? firstRiserCut : riser, run: i === 0 ? 0 : tread }));
  const sumRise = firstRiserCut + (risers - 1) * riser;
  return {
    ok: true, id: s.id, totalRise: s.totalRise, risers, treads, riser, tread, run, angle, pitch, firstRiserCut, comfort,
    stringer: { size: s.stringer, count: stringers, length: stringerLength, throat, spacing: treadSpan, depth, treadSpanMax },
    treadBoards, openRisers: !!s.openRisers, riserBoards: s.openRisers ? 0 : risers, riserStock: riserBoards, width: s.width,
    minOpening: Math.ceil(minOpening * 16) / 16, opening, rail, marks, sumRise, notes, limits: L, nosing: s.nosing,
  };
}

/**
 * Guards and handrail for one flight. Balusters are vertical, so they are spaced by their clear horizontal gap
 * (the sphere test), and because the top and bottom rails run parallel to the pitch line every baluster is the
 * same length, with a slanted cut at each end. Posts stand at the bottom and top and wherever a guard would run
 * past `maxPostSpacing` along the slope. The handrail runs the pitch plus 12 in past the top riser and one tread
 * past the bottom one. Landings, turns and the guard along an open landing are not laid out.
 * @param {{riser: number, tread: number, run: number, pitch: number, risers: number}} g
 * @param {Rail} r
 * @param {string[]} notes
 */
export function layoutRail(g, r, notes) {
  const L = { ...RAIL_LIMITS, ...(r.limits || {}) };
  const sides = r.sides ?? 1, bw = r.balusterWidth ?? 1.5, post = r.postWidth ?? 3.5, board = r.railBoard ?? "2x4";
  const hh = r.handrailHeight ?? 36;
  if (hh < L.handrailMin || hh > L.handrailMax) notes.push(`Handrail height ${hh} in is outside ${L.handrailMin} to ${L.handrailMax} in above the nose line.`);
  const angle = Math.atan2(g.riser, g.tread);
  const segments = Math.max(1, Math.ceil(g.pitch / L.maxPostSpacing - 1e-9));
  const posts = segments + 1;
  const clear = g.run / segments - post; // horizontal clear between posts
  const perSegment = Math.max(0, Math.ceil((clear - L.maxGap) / (bw + L.maxGap) - 1e-9));
  const gap = (clear - perSegment * bw) / (perSegment + 1);
  const thick = 1.5;
  const balusterLength = L.guardHeight - 2 * thick - L.bottomGap + bw * Math.tan(angle); // long point
  const railLength = g.pitch + (post / 2) * 2;
  return {
    sides, segments, posts: { count: posts * sides, perSide: posts, width: post },
    balusters: { count: perSegment * segments * sides, perSegment, length: balusterLength, width: bw, gap },
    guardRails: { size: board, count: 2 * sides, length: railLength },
    handrail: r.handrail === false ? null : { count: 1, height: hh, length: g.pitch + 12 + g.tread },
    guardHeight: L.guardHeight, maxGap: L.maxGap,
  };
}

/**
 * Guard along open landing edges (level, so every baluster is guardHeight - 2 rails - bottom gap long).
 * `edges` are the open edge lengths in inches; each gets posts at both ends and wherever it would run past
 * `maxPostSpacing`, balusters with no clear gap over `maxGap`, and a top and bottom rail. `sharedCorners` is how many
 * corners two listed edges meet at (one post serves both); layoutStairWithLanding passes ends x sides.
 * @param {number[]} edges
 * @param {Rail} [r]
 * @param {number} [sharedCorners]
 */
export function layoutLandingGuard(edges, r = {}, sharedCorners = 0) {
  const L = { ...RAIL_LIMITS, ...(r.limits || {}) };
  const bw = r.balusterWidth ?? 1.5, post = r.postWidth ?? 3.5, board = r.railBoard ?? "2x4", thick = 1.5;
  let posts = 0, balusters = 0, gapMax = 0;
  const rails = [];
  for (const len of edges) {
    const segments = Math.max(1, Math.ceil(len / L.maxPostSpacing - 1e-9));
    const clear = len / segments - post;
    const per = Math.max(0, Math.ceil((clear - L.maxGap) / (bw + L.maxGap) - 1e-9));
    posts += segments + 1; balusters += per * segments;
    gapMax = Math.max(gapMax, (clear - per * bw) / (per + 1));
    rails.push(len, len);
  }
  posts -= sharedCorners;
  return { edges, sharedCorners, posts: { count: posts, width: post }, balusters: { count: balusters, length: L.guardHeight - 2 * thick - L.bottomGap, width: bw, maxGap: gapMax }, guardRails: { size: board, count: rails.length, lengths: rails }, guardHeight: L.guardHeight };
}

/** Cut rows in the engine's shape, so `takeoff(plan, stairCuts(layout))` buys stair lumber with the walls'. */
export function stairCuts(l) {
  if (!l.ok) return [];
  const rows = [{ size: l.stringer.size, length: Math.round(l.stringer.length * 16) / 16, kind: "stair stringer", qty: l.stringer.count, walls: [l.id] }];
  if (l.treadBoards.size in DEPTH) rows.push({ size: l.treadBoards.size, length: l.treadBoards.length, kind: "stair tread", qty: l.treadBoards.count, walls: [l.id] });
  if (l.riserStock) rows.push({ size: l.riserStock.size, length: l.riserStock.length, kind: "stair riser", qty: l.riserStock.count, walls: [l.id] });
  if (l.rail && l.rail.guardRails.size in DEPTH) rows.push({ size: l.rail.guardRails.size, length: Math.round(l.rail.guardRails.length * 16) / 16, kind: "stair guard rail", qty: l.rail.guardRails.count, walls: [l.id] });
  if (l.rail && l.rail.handrail && l.rail.guardRails.size in DEPTH) rows.push({ size: l.rail.guardRails.size, length: Math.round(l.rail.handrail.length * 16) / 16, kind: "stair handrail", qty: l.rail.handrail.count, walls: [l.id] });
  return rows;
}

export function stairText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.totalRise)} rise, ${l.risers} risers of ${formatInches(l.riser)}, ${l.treads} treads of ${formatInches(l.tread)} (${l.angle.toFixed(1)} deg, 2R+T ${l.comfort.toFixed(2)} in)`];
  out.push(`  Total run ${formatLength(l.run)}; the first riser is cut ${formatInches(l.firstRiserCut)} so the finished first step is ${formatInches(l.riser)} once the tread is on`);
  out.push(`  ${l.stringer.count} ${l.stringer.size} stringers ${formatLength(l.stringer.length)} long, ${formatInches(l.stringer.spacing)} apart, ${formatInches(l.stringer.throat)} left under the notches`);
  out.push(`  ${l.treadBoards.count} ${l.treadBoards.size} tread boards ${formatLength(l.treadBoards.length)} (${l.treadBoards.perStep} per step covering ${formatInches(l.treadBoards.coverage)} for ${formatInches(l.treadBoards.need)} of tread and nosing)${l.openRisers ? ", open risers" : `, ${l.riserBoards} risers${l.riserStock ? ` of ${l.riserStock.count} ${l.riserStock.size} boards` : ""}`}`);
  out.push(`  Stairwell opening at least ${formatLength(l.minOpening)} long for ${formatInches(l.limits.headroom)} of headroom${l.opening ? `; yours ${formatLength(l.opening.length)} leaves ${formatInches(l.opening.headroom)}${l.opening.ok ? "" : " (too short)"}` : ""}`);
  if (l.rail) {
    const q = l.rail;
    out.push(`  Guard (${q.sides} side${q.sides === 1 ? "" : "s"}, ${formatInches(q.guardHeight)} high): ${q.posts.count} posts, ${q.balusters.count} balusters ${formatInches(q.balusters.length)} at the long point with ${formatInches(q.balusters.gap)} clear (limit ${formatInches(q.maxGap)}), ${q.guardRails.count} ${q.guardRails.size} rails ${formatLength(q.guardRails.length)}${q.handrail ? `; handrail ${formatLength(q.handrail.length)} at ${formatInches(q.handrail.height)}` : ""}`);
  }
  for (const n of l.notes) out.push(`  Note: ${n}`);
  return out;
}

/**
 * A stair that rises more than one flight may (147 in by default) is split at a landing into two flights.
 * `landing` is `true` or `{ depth, landingRise, joist, spacing, deckBoard, openEdges }` (`openEdges`: "side" edges run the landing depth, "end" the width; each gets a guard). The landing is as deep as the
 * stair is wide (36 in at least), the usual code rule for a straight run or a turn; the rise is split in half
 * unless `landingRise` (finished floor to the landing surface) is typed. The stairwell opening applies to the
 * upper flight only. A turn does not change a count, so quarter-turns and straight runs buy the same lumber.
 * @param {Stair & { landing?: true | { openEdges?: string[], depth?: number, landingRise?: number, joist?: string, spacing?: number, deckBoard?: string } }} input
 * @param {{stock: {size: string, length: number}[]}} [plan]
 */
export function layoutStairWithLanding(input, plan) {
  const L = { ...STAIR_LIMITS, ...(input.limits || {}) };
  const lc = typeof input.landing === "object" && input.landing ? input.landing : {};
  const id = input.id || "Stair";
  if (!input.landing && !(input.totalRise > L.maxRise)) return { ok: false, id, errors: ["No landing asked for and the rise fits one flight: use layoutStair."] };
  if (!(input.totalRise >= 2 * 12)) return { ok: false, id, errors: ["A stair with a landing needs at least 2 ft of total rise."] };
  const rise1 = lc.landingRise ?? Math.round((input.totalRise / 2) * 16) / 16;
  const rise2 = input.totalRise - rise1;
  if (!(rise1 >= 12 && rise2 >= 12)) return { ok: false, id, errors: [`The landing at ${formatLength(rise1)} leaves a flight under 1 ft of rise; put it nearer the middle.`] };
  const width = input.width ?? 36;
  const depth = lc.depth ?? Math.max(36, width);
  if (depth < Math.max(36, width) - 1e-9) return { ok: false, id, errors: [`A landing ${formatLength(depth)} deep is under the stair's width (${formatLength(Math.max(36, width))}), which the model code requires.`] };
  const { landing: _l, openingLength, ...rest } = input;
  const lower = layoutStair({ ...rest, id: `${id}, lower flight`, totalRise: rise1 }, plan);
  const upper = layoutStair({ ...rest, id: `${id}, upper flight`, totalRise: rise2, ...(openingLength != null ? { openingLength } : {}) }, plan);
  const errors = [...(lower.ok ? [] : lower.errors), ...(upper.ok ? [] : upper.errors)];
  const joistSize = lc.joist || "2x8", deckSize = lc.deckBoard || input.treadBoard || "2x12", spacing = lc.spacing || 16;
  for (const [k, v] of [["joist", joistSize], ["deck board", deckSize]]) if (!(v in DEPTH)) errors.push(`Unknown landing ${k} size ${v}.`);
  if (errors.length) return { ok: false, id, errors };
  const joists = Math.ceil((width - THICK) / spacing - 1e-9) + 1;
  const deckBoards = Math.ceil((depth + 0.25) / (DEPTH[deckSize] + 0.25) - 1e-9);
  const landing = {
    width, depth, rise: rise1, joists: { size: joistSize, count: joists, length: depth, spacing: (width - THICK) / (joists - 1) },
    rims: { size: joistSize, count: 2, length: width - 2 * THICK },
    deck: { size: deckSize, count: deckBoards, length: width, area: (width * depth) / 144 },
    footprint: lower.run + depth + upper.run,
    posts: layoutLandingPosts(width, depth, rise1 - DEPTH[joistSize] - 1.5, lc.postSpacing ?? 96),
    footings: lc.soilBearing != null ? sizeLandingFootings(width, depth, lc.postSpacing ?? 96, { soilBearing: lc.soilBearing, liveLoad: lc.liveLoad, deadLoad: lc.deadLoad }) : null,
    guard: lc.openEdges?.length ? layoutLandingGuard(lc.openEdges.map((e) => (e === "end" ? width : depth)), input.rail || {}, Math.min(4, lc.openEdges.filter((e) => e === "end").length * lc.openEdges.filter((e) => e !== "end").length)) : null,
    notes: ["Landing posts are counted, not sized, and footings are not sized: the platform carries a stair load plus the flights' ends, so check post size, footings and the typed `postSpacing` (96 in unless set) against your code and the actual spans."],
  };
  return { ok: true, id, totalRise: input.totalRise, flights: [lower, upper], landing };
}

/**
 * Posts under a free-standing landing: one at each corner, plus evenly spaced extras along each side
 * longer than `spacing` (a typed figure, not a code table). `height` is the landing surface less the joist
 * depth and an assumed 1-1/2 in of decking, so it is the post's length above the footing, not the footing depth.
 */
export function layoutLandingPosts(width, depth, height, spacing = 96) {
  const bays = (len) => Math.max(1, Math.ceil(len / spacing - 1e-9));
  const along = bays(width), across = bays(depth);
  const count = 2 * (along + across);
  return { count, height: Math.max(0, height), alongBays: along, acrossBays: across, spacing };
}

/**
 * Footing size under the heaviest landing post, from typed figures only (`soilBearing` psf has no default: it is the
 * site's, from the soil report or the local book; `liveLoad` 40 and `deadLoad` 10 psf are the usual figures, typed over
 * if yours differ). The platform load is shared by the posts around its edge: a mid-edge post takes half a bay, a corner
 * post a quarter bay, so the heaviest is the edge post when any side has two bays or more. The flights' ends and
 * the guard are not added. Returns the load, the area it needs, and a round and a square footing rounded up to the inch.
 */
export function sizeLandingFootings(width, depth, spacing, { soilBearing, liveLoad = 40, deadLoad = 10 } = {}) {
  if (!(soilBearing > 0)) return { ok: false, errors: ["soilBearing must be a positive figure in psf."] };
  const bays = (len) => Math.max(1, Math.ceil(len / spacing - 1e-9));
  const along = bays(width), across = bays(depth);
  const bay = (width / along) * (depth / across) / 144; // sq ft
  const share = along > 1 || across > 1 ? 0.5 : 0.25;
  const load = bay * share * (liveLoad + deadLoad);
  const area = (load / soilBearing) * 144; // sq in
  const round = Math.max(1, Math.ceil(2 * Math.sqrt(area / Math.PI) - 1e-9));
  const square = Math.max(1, Math.ceil(Math.sqrt(area) - 1e-9));
  return { ok: true, soilBearing, liveLoad, deadLoad, tributary: bay * share, load, area, round, square, count: 2 * (along + across) };
}

export function landingCuts(r) {
  if (!r.ok) return [];
  const g = r.landing;
  return [
    { size: g.joists.size, length: Math.round(g.joists.length * 16) / 16, kind: "landing joist", qty: g.joists.count, walls: [r.id] },
    { size: g.rims.size, length: Math.round(g.rims.length * 16) / 16, kind: "landing rim", qty: g.rims.count, walls: [r.id] },
    { size: g.deck.size, length: g.deck.length, kind: "landing deck board", qty: g.deck.count, walls: [r.id] },
    ...(g.guard && g.guard.guardRails.size in DEPTH ? g.guard.edges.flatMap((len) => [{ size: g.guard.guardRails.size, length: Math.round(len * 16) / 16, kind: "landing guard rail", qty: 2, walls: [r.id] }]) : []),
  ];
}

export function landingText(r) {
  if (!r.ok) return r.errors.map((e) => `  - ${e}`);
  const g = r.landing;
  return [
    `${r.id}: ${formatLength(r.totalRise)} rise in two flights around a ${formatLength(g.width)} x ${formatLength(g.depth)} landing at ${formatLength(g.rise)}`,
    ...r.flights.flatMap(stairText),
    `  Landing: ${g.joists.count} ${g.joists.size} joists ${formatLength(g.joists.length)} (${formatInches(g.joists.spacing)} apart), 2 rims ${formatLength(g.rims.length)}, ${g.deck.count} ${g.deck.size} deck boards ${formatLength(g.deck.length)}; run on plan ${formatLength(g.footprint)} for a straight stair`,
    `  Landing posts: ${g.posts.count} (${g.posts.alongBays} x ${g.posts.acrossBays} bays around the edge, at most ${formatInches(g.posts.spacing)} apart), each ${formatInches(g.posts.height)} above its footing`,
    ...(g.footings?.ok ? [`  Landing footings: heaviest post ${Math.round(g.footings.load)} lb (${g.footings.tributary.toFixed(1)} sq ft at ${g.footings.liveLoad + g.footings.deadLoad} psf) on ${g.footings.soilBearing} psf soil needs ${g.footings.area.toFixed(0)} sq in: ${g.footings.round} in round or ${g.footings.square} in square, ${g.footings.count} footings`] : []),
    ...(g.guard ? [`  Landing guard (${g.guard.edges.length} open edge${g.guard.edges.length === 1 ? "" : "s"}, ${formatInches(g.guard.guardHeight)} high): ${g.guard.posts.count} posts, ${g.guard.balusters.count} balusters ${formatInches(g.guard.balusters.length)} with at most ${formatInches(g.guard.balusters.maxGap)} clear (limit ${formatInches(RAIL_LIMITS.maxGap)}), ${g.guard.guardRails.count} ${g.guard.guardRails.size} rails`] : []),
    ...g.notes.map((n) => `  Note: ${n}`),
  ];
}

// Winders (2026-10-28): a turn made of wedge treads that fan around a pivot
// instead of a landing. Each of `count` treads turns 90/count degrees (typed
// `turn` for other angles). The model code asks for 10 in of tread 12 in in
// from the side where the treads are narrower, and 6 in at the narrowest point
// (limits `winderWalkline`, `winderWalkDepth`, `winderMinDepth`, held in
// WINDER_LIMITS because the edition is the user's to confirm). With a zero-size
// pivot the narrow end is a point, so the check also solves the smallest inner
// radius (a pivot post or box) that passes. Depth is measured along the arc at
// a radius: radius x angle in radians, which a straight edge across the tread
// slightly undercuts, so a pass here is a pass by a hair of margin.
export const WINDER_LIMITS = { winderWalkline: 12, winderWalkDepth: 10, winderMinDepth: 6 };

/** @param {{ count?: number, turn?: number, innerRadius?: number, width?: number, limits?: Partial<typeof WINDER_LIMITS> }} w */
export function checkWinders(w) {
  const L = { ...WINDER_LIMITS, ...(w.limits || {}) };
  const count = w.count ?? 3, turn = w.turn ?? 90, width = w.width ?? 36, r = w.innerRadius ?? 0;
  const errors = [];
  if (!Number.isInteger(count) || count < 2) errors.push("Winders need a whole number of two or more treads.");
  if (!(turn > 0 && turn <= 180)) errors.push("The turn is between 0 and 180 degrees.");
  if (!(r >= 0)) errors.push("The inner radius is zero or more.");
  if (!(width > L.winderWalkline)) errors.push(`The stair is wider than ${L.winderWalkline} in.`);
  if (errors.length) return { ok: false, errors };
  const theta = (turn / count) * Math.PI / 180;
  const narrow = r * theta, walk = (r + L.winderWalkline) * theta, outer = (r + width) * theta;
  const needNarrow = L.winderMinDepth / theta, needWalk = L.winderWalkDepth / theta - L.winderWalkline;
  const minInnerRadius = Math.max(needNarrow, needWalk);
  const problems = [];
  if (narrow < L.winderMinDepth - 1e-9) problems.push(`narrowest depth ${narrow.toFixed(2)} in is under ${L.winderMinDepth} in`);
  if (walk < L.winderWalkDepth - 1e-9) problems.push(`depth ${L.winderWalkline} in from the narrow side is ${walk.toFixed(2)} in, under ${L.winderWalkDepth} in`);
  return { ok: problems.length === 0, count, turn, anglePerTread: turn / count, innerRadius: r, narrow, walk, outer, minInnerRadius, problems, limits: L };
}

export function winderText(c) {
  if (!c.ok && !c.problems) return c.errors.map((e) => `  - ${e}`);
  const out = [`  Winders: ${c.count} treads of ${c.anglePerTread.toFixed(1)} degrees round a ${formatInches(c.innerRadius)} inner radius: ${c.narrow.toFixed(2)} in at the narrow end, ${c.walk.toFixed(2)} in at ${c.limits.winderWalkline} in out, ${c.outer.toFixed(2)} in at the wide end`];
  out.push(c.ok ? "  Winders pass the 6 in and 10 in rules as typed." : `  Winders fail: ${c.problems.join("; ")}. The smallest inner radius that passes is ${c.minInnerRadius.toFixed(1)} in.`);
  return out;
}
