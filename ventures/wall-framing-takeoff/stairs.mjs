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
export const RAIL_LIMITS = { guardHeight: 36, handrailMin: 34, handrailMax: 38, maxGap: 4, maxPostSpacing: 72, bottomGap: 4, maxBottomOpening: 6 };

/** @typedef {{ sides?: number, handrail?: boolean, handrailHeight?: number, bracketSpacing?: number, balusterWidth?: number, railBoard?: string, postWidth?: number, limits?: Partial<typeof RAIL_LIMITS> }} Rail */
/** @typedef {{ id?: string, rail?: Rail, totalRise: number, tread?: number, stringer?: string, width?: number, stringerSpacing?: number, treadThickness?: number, treadBoard?: string, treadGap?: number, nosing?: number, floorThickness?: number, openingLength?: number, openRisers?: boolean, riserBoard?: string, treadSpanMax?: number, limits?: Partial<typeof STAIR_LIMITS>, stringerCheck?: { liveLoad: number, deadLoad: number, Fb: number, Fv: number, E: number, deflLimit?: number, thickness?: number, connectorCapacity?: number, bearingFcPerp?: number, bearingLength?: number, notchedSupport?: boolean | number }, treadCheck?: { point: number, Fb: number, E: number, deflLimit?: number }, postCheck?: { point: number, Fb: number } }} Stair */

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
  if (s.stringerSpacing != null && !(s.stringerSpacing > 0 && s.stringerSpacing <= 48)) errors.push(`Stringer spacing ${s.stringerSpacing} in must be over 0 and at most 48 in.`);
  if (s.nosing != null && !(s.nosing >= 0)) errors.push(`Nosing ${s.nosing} in cannot be negative.`);
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
    // Hardware (2026-10-30): one hanger or ledger-bolt connection at the top of every stringer, and one anchor at its foot (a typed count of what the framer buys, not an engineered connection).
    hardware: { topConnectors: stringers, footAnchors: stringers },
    // Stock (2026-10-30): the shortest listed board that holds one stringer, for the framer's buy list (null with no plan).
    stringerStock: plan ? { size: s.stringer, length: Math.min(...plan.stock.filter((x) => x.size === s.stringer && x.length >= stringerLength - 1e-9).map((x) => x.length)), count: stringers } : null,
    stringerCheck: input.stringerCheck ? checkStringer({ stringer: { spacing: treadSpan, throat, count: stringers }, run }, input.stringerCheck) : null,
    treadCheck: input.treadCheck ? checkTread({ span: treadSpan, thickness: s.treadThickness, width: bw }, input.treadCheck) : null,
    postCheck: input.postCheck && rail ? checkGuardPost({ width: rail.posts.width, depth: rail.posts.width, height: rail.guardHeight }, input.postCheck) : null,
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
  if (L.bottomGap > L.maxBottomOpening) notes.push(`A ${L.bottomGap} in space under the bottom rail passes a ${L.maxBottomOpening} in sphere; the usual stair guard limit is ${L.maxBottomOpening} in (code edition not checked).`);
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
    handrail: r.handrail === false ? null : handrailWithBrackets({ count: 1, height: hh, length: g.pitch + 12 + g.tread }, r.bracketSpacing ?? 48),
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

/** Wall brackets for a handrail: one near each end plus enough between that none is farther apart than `spacing` (a typed 48 in, not a code figure). */
function handrailWithBrackets(h, spacing) {
  return { ...h, bracketSpacing: spacing, brackets: Math.max(2, Math.ceil(h.length / spacing - 1e-9) + 1) };
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

/**
 * Stringer strength check (2026-10-31), on typed figures only: no allowable stresses are shipped, so the
 * person types the species/grade values from the lumber's own table. The worst (interior) stringer carries the
 * live plus dead load over the tread width it serves (one stringer spacing) on the horizontal projection, as a
 * simply supported beam spanning the total run with no mid support. The section is the throat under the notches
 * (the conservative cut-section, 1-1/2 in thick), for bending, shear at the support and deflection (span/240
 * unless `deflLimit`). A hand check for a framer or plan reviewer; the engineer of record's call governs.
 * @param {{stringer:{spacing:number, throat:number, count?:number}, run:number}} l
 * @param {{liveLoad:number, deadLoad:number, Fb:number, Fv:number, E:number, deflLimit?:number, thickness?:number, connectorCapacity?:number, bearingFcPerp?:number, bearingLength?:number, notchedSupport?:boolean|number}} c
 */
export function checkStringer(l, c) {
  const errors = [];
  for (const [k, lo, hi] of [["liveLoad", 1, 200], ["deadLoad", 0, 200], ["Fb", 10, 5000], ["Fv", 1, 500], ["E", 200000, 3000000]]) {
    if (c?.[k] == null || !(c[k] >= lo && c[k] <= hi)) errors.push(`stringerCheck.${k} must be typed, from ${lo} to ${hi} (${k === "liveLoad" || k === "deadLoad" ? "psf" : "psi"}); no default is shipped.`);
  }
  if (c?.deflLimit != null && !(c.deflLimit >= 120 && c.deflLimit <= 960)) errors.push("stringerCheck.deflLimit is the L/ ratio, from 120 to 960.");
  if (c?.connectorCapacity != null && !(c.connectorCapacity >= 50 && c.connectorCapacity <= 20000)) errors.push("stringerCheck.connectorCapacity is lb per connector or fastener group, from 50 to 20000.");
  if (c?.bearingFcPerp != null && !(c.bearingFcPerp >= 100 && c.bearingFcPerp <= 2000)) errors.push("stringerCheck.bearingFcPerp is the allowable compression perpendicular to grain in psi, from 100 to 2000.");
  if (c?.bearingLength != null && !(c.bearingLength >= 1 && c.bearingLength <= 24)) errors.push("stringerCheck.bearingLength is the bearing length in inches, from 1 to 24 (3.5 unless typed).");
  const boardDepth = /** @type {any} */ (l.stringer).depth;
  if (c?.notchedSupport != null && c.notchedSupport !== false && !(c.notchedSupport === true ? boardDepth > 0 : c.notchedSupport > 0 && c.notchedSupport < boardDepth)) errors.push("stringerCheck.notchedSupport is true (the throat is what is left at the support) or the depth in inches left at the support, under the board's depth.");
  if (errors.length) return { ok: false, errors };
  const b = c.thickness ?? 1.5, d = l.stringer.throat, L = l.run;
  if (!(d > 0)) return { ok: false, errors: ["The throat under the notches is zero or negative; there is no section to check."] };
  const w = ((c.liveLoad + c.deadLoad) * l.stringer.spacing) / 12 / 12; // lb per horizontal inch
  const M = (w * L * L) / 8, V = (w * L) / 2;
  const S = (b * d * d) / 6, I = (b * d ** 3) / 12;
  const fb = M / S, fv = (1.5 * V) / (b * d);
  const delta = (5 * w * L ** 4) / (384 * c.E * I), limit = L / (c.deflLimit ?? 240);
  const warnings = [];
  // Bearing (2026-11-01): the end reaction over the stringer's thickness x bearing length, against a typed compression-perpendicular allowable (none shipped).
  const bearingLength = c.bearingLength ?? 3.5, fcPerp = V / (b * bearingLength);
  if (c.bearingFcPerp != null && fcPerp > c.bearingFcPerp) warnings.push(`Bearing stress ${fcPerp.toFixed(0)} psi over ${bearingLength} in exceeds the typed ${c.bearingFcPerp} psi: lengthen the bearing, add a ledger or bear on a wider member.`);
  if (fb > c.Fb) warnings.push(`Bending stress ${fb.toFixed(0)} psi in the throat exceeds the typed ${c.Fb} psi: use a deeper board, add a mid-flight support or a closer stringer spacing.`);
  // Notch at the support (2026-11-01): a tension-face notch where the stringer bears cuts shear capacity to (2/3) Fv b dn (dn/d) (NDS 3.4.3.2 form), dn the depth left, d the board depth; typed Fv, none shipped.
  const dn = c.notchedSupport === true ? d : typeof c.notchedSupport === "number" ? c.notchedSupport : null;
  const notchCapacity = dn != null ? (2 / 3) * c.Fv * b * dn * (dn / boardDepth) : null;
  if (notchCapacity != null && V > notchCapacity) warnings.push(`End shear ${V.toFixed(0)} lb exceeds ${notchCapacity.toFixed(0)} lb allowed with a notch leaving ${dn} in of a ${boardDepth} in board at the support: keep the full depth at the bearing, or hang it from a ledger or hanger.`);
  if (fv > c.Fv) warnings.push(`Shear stress ${fv.toFixed(0)} psi exceeds the typed ${c.Fv} psi at the support.`);
  if (delta > limit) warnings.push(`Deflection ${delta.toFixed(2)} in exceeds span/${c.deflLimit ?? 240} (${limit.toFixed(2)} in).`);
  // Top reaction of the whole flight (every stringer), the figure to type into the floor's `headerCheck.stairReaction`; the live share is for that header's deflection.
  const n = l.stringer.count ?? null;
  const totalReaction = n ? n * V : null, totalReactionLive = n ? (n * V * c.liveLoad) / (c.liveLoad + c.deadLoad) : null;
  // Top connection (2026-11-01): with a typed per-connector allowable (from the hanger or bolt maker's table; none shipped), how many carry one stringer's end reaction.
  const connectorsNeeded = c.connectorCapacity ? Math.ceil(V / c.connectorCapacity - 1e-9) : null;
  return { ok: warnings.length === 0, fb, fv, delta, limit, Fb: c.Fb, Fv: c.Fv, M, V, reaction: V, connectorsNeeded, connectorCapacity: c.connectorCapacity ?? null, notchCapacity, fcPerp: c.bearingFcPerp != null ? fcPerp : null, bearingLength: c.bearingFcPerp != null ? bearingLength : null, totalReaction, totalReactionLive, throat: d, warnings, errors: [] };
}

/**
 * Tread board point-load check (2026-11-01), on typed figures only. The model residential code asks a stair tread
 * to carry a concentrated load (300 lb on a small area at midspan) within a deflection limit; the load, the
 * allowable bending stress and E are typed (no values shipped). One board is assumed to take the whole load
 * (conservative: no sharing with the neighbouring board), simply supported between two stringers:
 * M = P L / 4, fb = M / S, delta = P L^3 / (48 E I), limit L/`deflLimit` (240 unless typed). A hand check for a
 * framer; the engineer of record's call governs.
 * @param {{span:number, thickness:number, width:number}} t  span between stringers, board thickness and width (actual inches)
 * @param {{point:number, Fb:number, E:number, deflLimit?:number}} c
 */
export function checkTread(t, c) {
  const errors = [];
  for (const [k, lo, hi] of [["point", 50, 2000], ["Fb", 10, 5000], ["E", 200000, 3000000]]) {
    if (c?.[k] == null || !(c[k] >= lo && c[k] <= hi)) errors.push(`treadCheck.${k} must be typed, from ${lo} to ${hi} (${k === "point" ? "lb" : "psi"}); no default is shipped.`);
  }
  if (c?.deflLimit != null && !(c.deflLimit >= 120 && c.deflLimit <= 960)) errors.push("treadCheck.deflLimit is the L/ ratio, from 120 to 960.");
  if (errors.length) return { ok: false, errors, warnings: [] };
  const { span: L, thickness: b0, width: w0 } = t;
  const M = (c.point * L) / 4, S = (w0 * b0 * b0) / 6, I = (w0 * b0 ** 3) / 12;
  const fb = M / S, delta = (c.point * L ** 3) / (48 * c.E * I), limit = L / (c.deflLimit ?? 240);
  const warnings = [];
  if (fb > c.Fb) warnings.push(`Tread bending stress ${fb.toFixed(0)} psi under ${c.point} lb exceeds the typed ${c.Fb} psi: use thicker treads or a closer stringer spacing.`);
  if (delta > limit) warnings.push(`Tread deflection ${delta.toFixed(3)} in under ${c.point} lb exceeds span/${c.deflLimit ?? 240} (${limit.toFixed(3)} in).`);
  return { ok: warnings.length === 0, fb, delta, limit, M, Fb: c.Fb, point: c.point, warnings, errors: [] };
}

/**
 * Guard post bending check (2026-11-01), on typed figures only. The model residential code asks a guard to resist a
 * concentrated load (200 lb) applied at the top in any direction; the post is taken as a cantilever fixed at its
 * attachment, so M = P h, about the weaker axis (S = d b^2 / 6, b the smaller face), fb = M / S against the typed
 * allowable bending stress. This is the post's own bending only: the bolted or notched attachment to the stringer
 * or rim usually governs and is not checked here. A hand check for a framer; the engineer of record's call governs.
 * @param {{width:number, depth:number, height:number}} p  post faces and height from the attachment to the load (actual inches)
 * @param {{point:number, Fb:number}} c
 */
export function checkGuardPost(p, c) {
  const errors = [];
  for (const [k, lo, hi] of [["point", 50, 2000], ["Fb", 10, 5000]]) {
    if (c?.[k] == null || !(c[k] >= lo && c[k] <= hi)) errors.push(`postCheck.${k} must be typed, from ${lo} to ${hi} (${k === "point" ? "lb" : "psi"}); no default is shipped.`);
  }
  if (errors.length) return { ok: false, errors, warnings: [] };
  const b = Math.min(p.width, p.depth), d = Math.max(p.width, p.depth);
  const M = c.point * p.height, S = (d * b * b) / 6, fb = M / S;
  const warnings = [];
  if (fb > c.Fb) warnings.push(`Guard post bending stress ${fb.toFixed(0)} psi under ${c.point} lb at ${p.height} in exceeds the typed ${c.Fb} psi: use a larger post or a shorter guard.`);
  return { ok: warnings.length === 0, fb, M, Fb: c.Fb, point: c.point, height: p.height, warnings, errors: [] };
}

export function stairText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.totalRise)} rise, ${l.risers} risers of ${formatInches(l.riser)}, ${l.treads} treads of ${formatInches(l.tread)} (${l.angle.toFixed(1)} deg, 2R+T ${l.comfort.toFixed(2)} in)`];
  out.push(`  Total run ${formatLength(l.run)}; the first riser is cut ${formatInches(l.firstRiserCut)} so the finished first step is ${formatInches(l.riser)} once the tread is on`);
  out.push(`  ${l.stringer.count} ${l.stringer.size} stringers ${formatLength(l.stringer.length)} long, ${formatInches(l.stringer.spacing)} apart, ${formatInches(l.stringer.throat)} left under the notches`);
  if (l.stringerStock) out.push(`  Buy ${l.stringerStock.count} ${l.stringerStock.size} boards ${formatLength(l.stringerStock.length)} long for the stringers (${formatLength(l.stringerStock.length - l.stringer.length)} spare on each)`);
  out.push(`  Hardware: ${l.hardware.topConnectors} top connectors (one per stringer, hanger or bolted ledger) and ${l.hardware.footAnchors} foot anchors; sizes and fasteners are the engineer's or manufacturer's call`);
  out.push(`  ${l.treadBoards.count} ${l.treadBoards.size} tread boards ${formatLength(l.treadBoards.length)} (${l.treadBoards.perStep} per step covering ${formatInches(l.treadBoards.coverage)} for ${formatInches(l.treadBoards.need)} of tread and nosing)${l.openRisers ? ", open risers" : `, ${l.riserBoards} risers${l.riserStock ? ` of ${l.riserStock.count} ${l.riserStock.size} boards` : ""}`}`);
  out.push(`  Stairwell opening at least ${formatLength(l.minOpening)} long for ${formatInches(l.limits.headroom)} of headroom${l.opening ? `; yours ${formatLength(l.opening.length)} leaves ${formatInches(l.opening.headroom)}${l.opening.ok ? "" : " (too short)"}` : ""}`);
  if (l.rail) {
    const q = l.rail;
    out.push(`  Guard (${q.sides} side${q.sides === 1 ? "" : "s"}, ${formatInches(q.guardHeight)} high): ${q.posts.count} posts, ${q.balusters.count} balusters ${formatInches(q.balusters.length)} at the long point with ${formatInches(q.balusters.gap)} clear (limit ${formatInches(q.maxGap)}), ${q.guardRails.count} ${q.guardRails.size} rails ${formatLength(q.guardRails.length)}${q.handrail ? `; handrail ${formatLength(q.handrail.length)} at ${formatInches(q.handrail.height)} on ${q.handrail.brackets} brackets (at most ${formatInches(q.handrail.bracketSpacing)} apart)` : ""}`);
  }
  if (l.stringerCheck) {
    const k = l.stringerCheck;
    if (!k.errors.length) out.push(`  Stringer check (${formatInches(k.throat)} throat): bending ${k.fb.toFixed(0)} of ${k.Fb} psi, shear ${k.fv.toFixed(0)} of ${k.Fv} psi, deflection ${k.delta.toFixed(2)} of ${k.limit.toFixed(2)} in, end reaction ${k.reaction.toFixed(0)} lb each${k.totalReaction ? `, ${k.totalReaction.toFixed(0)} lb (${k.totalReactionLive.toFixed(0)} live) on the header the flight hangs from` : ""}${k.ok ? "" : " (FAILS)"}`);
    if (k.connectorsNeeded) out.push(`  Top connection: ${k.reaction.toFixed(0)} lb per stringer at ${k.connectorCapacity} lb each needs ${k.connectorsNeeded} connector${k.connectorsNeeded === 1 ? "" : "s"} per stringer (you buy ${k.connectorsNeeded * l.stringer.count}); the connector's own table governs`);
    for (const w of [...k.errors, ...k.warnings]) out.push(`  Note: ${w}`);
  }
  if (l.treadCheck) {
    const k = l.treadCheck;
    if (!k.errors.length) out.push(`  Tread check (${formatInches(l.stringer.spacing)} span, ${k.point} lb at midspan): bending ${k.fb.toFixed(0)} of ${k.Fb} psi, deflection ${k.delta.toFixed(3)} of ${k.limit.toFixed(3)} in${k.ok ? "" : " (FAILS)"}`);
    for (const w of [...k.errors, ...k.warnings]) out.push(`  Note: ${w}`);
  }
  if (l.postCheck) {
    const k = l.postCheck;
    if (!k.errors.length) out.push(`  Guard post check (${k.point} lb at ${formatInches(k.height)}): bending ${k.fb.toFixed(0)} of ${k.Fb} psi in the post itself; its bolted attachment is not checked${k.ok ? "" : " (FAILS)"}`);
    for (const w of [...k.errors, ...k.warnings]) out.push(`  Note: ${w}`);
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
 * @param {Stair & { landing?: true | { openEdges?: string[], depth?: number, landingRise?: number, joist?: string, spacing?: number, deckBoard?: string, postSpacing?: number, postSize?: string, soilBearing?: number, liveLoad?: number, deadLoad?: number, postCapacity?: number, postFc?: number, postEmin?: number, joistCheck?: { deadPsf: number, livePsf: number, Fb: number, Fv: number, E: number, deflLimit?: number } } }} input
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
    postSlenderness: checkPostSlenderness(rise1 - DEPTH[joistSize] - 1.5, lc.postSize),
    footings: lc.soilBearing != null ? sizeLandingFootings(width, depth, lc.postSpacing ?? 96, { soilBearing: lc.soilBearing, liveLoad: lc.liveLoad, deadLoad: lc.deadLoad, postCapacity: lc.postCapacity, extraLoad: flightPostLoad(lower, upper, width, lc.postSpacing ?? 96) }) : null,
    joistCheck: lc.joistCheck ? checkLandingJoists({ size: joistSize, spacing: (width - THICK) / (joists - 1), span: depth }, lc.joistCheck) : null,
    guard: lc.openEdges?.length ? layoutLandingGuard(lc.openEdges.map((e) => (e === "end" ? width : depth)), input.rail || {}, Math.min(4, lc.openEdges.filter((e) => e === "end").length * lc.openEdges.filter((e) => e !== "end").length)) : null,
    notes: ["Landing posts are counted, not sized, and footings are not sized: the platform carries a stair load plus the flights' ends, so check post size, footings and the typed `postSpacing` (96 in unless set) against your code and the actual spans."],
  };
  if (lc.postFc != null || lc.postEmin != null) {
    landing.postColumn = landing.footings?.ok
      ? checkLandingPostColumn(landing.posts.height, lc.postSize || "4x4", landing.footings.load, { fc: lc.postFc, emin: lc.postEmin })
      : { ok: false, errors: ["postFc and postEmin need landing.soilBearing too, for the post load."] };
  }
  return { ok: true, id, totalRise: input.totalRise, flights: [lower, upper], landing };
}

/**
 * Posts under a free-standing landing: one at each corner, plus evenly spaced extras along each side
 * longer than `spacing` (a typed figure, not a code table). `height` is the landing surface less the joist
 * depth and an assumed 1-1/2 in of decking, so it is the post's length above the footing, not the footing depth.
 */
export function layoutLandingPosts(width, depth, height, spacing = 96) {
  if (!(width > 0 && depth > 0 && spacing > 0)) throw new RangeError("Landing width, depth and post spacing must be positive numbers.");
  const bays = (len) => Math.max(1, Math.ceil(len / spacing - 1e-9));
  const along = bays(width), across = bays(depth);
  const count = 2 * (along + across);
  return { count, height: Math.max(0, height), alongBays: along, acrossBays: across, spacing };
}

const POST_FACE = { "4x4": 3.5, "6x6": 5.5 };
export const POST_SLENDERNESS_LIMIT = 50; // unbraced length over least face for a solid sawn column (NDS 3.7.1.4)

/**
 * Slenderness of a landing post: unbraced height over its least face against the limit of 50 (a 4x4 reaches 175 in,
 * a 6x6 275 in). `postSize` is 4x4 (default) or 6x6. Taken as pinned at both ends and unbraced; bracing, notches and
 * stringer bolts are not modelled, and no buckling stress is computed.
 */
export function checkPostSlenderness(height, postSize = "4x4") {
  const face = POST_FACE[postSize];
  if (!face) return { ok: false, postSize, warnings: [`Unknown landing post size ${postSize}; use 4x4 or 6x6.`] };
  const slenderness = height / face, maxHeight = POST_SLENDERNESS_LIMIT * face;
  const warnings = slenderness > POST_SLENDERNESS_LIMIT ? [`A ${postSize} post ${formatInches(height)} long is ${slenderness.toFixed(1)} times its face, over the limit of ${POST_SLENDERNESS_LIMIT}; use a 6x6 or brace it (a ${postSize} reaches ${formatInches(maxHeight)}).`] : [];
  return { ok: warnings.length === 0, postSize, face, height, slenderness, limit: POST_SLENDERNESS_LIMIT, maxHeight, warnings };
}

/**
 * Axial capacity of a landing post by the NDS column stability factor (ASD, pin-pin, Ke = 1, c = 0.8 for sawn lumber),
 * from typed design values: `fc` (psi, compression parallel to grain) and `emin` (psi), both already adjusted by you
 * for wet service and treatment; none is shipped. Compared with `load` (lb, the heaviest post's share from
 * `sizeLandingFootings`). Bracing, notches, stringer bolts, uplift and lateral load are not checked.
 */
export function checkLandingPostColumn(height, postSize, load, { fc, emin } = /** @type {{fc?: number, emin?: number}} */ ({})) {
  const face = POST_FACE[postSize];
  if (!face) return { ok: false, errors: [`Unknown landing post size ${postSize}; use 4x4 or 6x6.`] };
  if (!(fc >= 100 && fc <= 3000)) return { ok: false, errors: ["postFc is the post's compression parallel to grain in psi (100 to 3000)."] };
  if (!(emin >= 50000 && emin <= 1500000)) return { ok: false, errors: ["postEmin is the post's minimum modulus of elasticity in psi (50000 to 1500000)."] };
  const area = face * face, slenderness = height / face, c = 0.8;
  const ratio = (0.822 * emin) / slenderness ** 2 / fc, a = (1 + ratio) / (2 * c);
  const cp = a - Math.sqrt(a * a - ratio / c);
  const capacity = fc * cp * area;
  return { ok: true, postSize, slenderness, cp, capacity, load, utilisation: load / capacity, passes: load <= capacity && slenderness <= POST_SLENDERNESS_LIMIT };
}

/**
 * Footing size under the heaviest landing post, from typed figures only (`soilBearing` psf has no default: it is the
 * site's, from the soil report or the local book; `liveLoad` 40 and `deadLoad` 10 psf are the usual figures, typed over
 * if yours differ). The platform load is shared by the posts around its edge: a mid-edge post takes half a bay, a corner
 * post a quarter bay, so the heaviest is the edge post when any side has two bays or more. The flights' ends and
 * the guard are not added. `postCapacity` (lb, typed from your post table; no default) is compared with the heaviest
 * post's load and `postOk` says whether it holds. Returns the load, the area it needs, and a round and a square footing rounded up to the inch.
 */
export function sizeLandingFootings(width, depth, spacing, { soilBearing, liveLoad = 40, deadLoad = 10, postCapacity, extraLoad = 0 } = /** @type {{soilBearing?: number, liveLoad?: number, deadLoad?: number, postCapacity?: number, extraLoad?: number}} */ ({})) {
  if (!(soilBearing > 0)) return { ok: false, errors: ["soilBearing must be a positive figure in psf."] };
  if (!(width > 0 && depth > 0 && spacing > 0)) return { ok: false, errors: ["Landing width, depth and post spacing must be positive numbers."] };
  const bays = (len) => Math.max(1, Math.ceil(len / spacing - 1e-9));
  const along = bays(width), across = bays(depth);
  const bay = (width / along) * (depth / across) / 144; // sq ft
  const share = along > 1 || across > 1 ? 0.5 : 0.25;
  const load = bay * share * (liveLoad + deadLoad) + (extraLoad > 0 ? extraLoad : 0);
  const area = (load / soilBearing) * 144; // sq in
  const round = Math.max(1, Math.ceil(2 * Math.sqrt(area / Math.PI) - 1e-9));
  const square = Math.max(1, Math.ceil(Math.sqrt(area) - 1e-9));
  return { ok: true, soilBearing, liveLoad, deadLoad, tributary: bay * share, extraLoad: extraLoad > 0 ? extraLoad : 0, load, postCapacity: postCapacity ?? null, postOk: postCapacity > 0 ? load <= postCapacity : null, area, round, square, count: 2 * (along + across) };
}

/**
 * Extra load on the heaviest landing post from the flights that bear on the landing's edge (2026-11-01): the larger of
 * the two flights' total stringer reactions (typed `stringerCheck`, live + dead; each flight bears on its own edge), spread
 * along that edge's width as a line load. A mid-edge post takes a full bay of it (R / bays along), and with one bay
 * a corner post takes half. Returns 0 when neither flight carries a stringer check. The landing's own platform load
 * is separate (`sizeLandingFootings`); the guard and the wind are not added.
 */
export function flightPostLoad(lower, upper, width, spacing = 96) {
  const r = Math.max(lower?.stringerCheck?.totalReaction ?? 0, upper?.stringerCheck?.totalReaction ?? 0);
  if (!(r > 0)) return 0;
  const along = Math.max(1, Math.ceil(width / spacing - 1e-9));
  return along > 1 ? r / along : r / 2;
}

/**
 * Strength check of the landing joists (2026-11-01), on typed figures only (none shipped): each joist a simple span of the
 * landing's depth between the two rims, carrying `deadPsf + livePsf` over its tributary spacing. Bending, shear (1.5V/A)
 * and live-load deflection (L/360 unless `deflLimit`). The rims, posts and flight reactions are not in it.
 * @param {{size: string, spacing: number, span: number}} j
 * @param {{deadPsf: number, livePsf: number, Fb: number, Fv: number, E: number, deflLimit?: number}} c
 */
export function checkLandingJoists(j, c) {
  const errors = [];
  const inr = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!inr(c?.deadPsf, 0, 100)) errors.push("joistCheck.deadPsf is the dead load in psf, 0 to 100.");
  if (!inr(c?.livePsf, 0, 200)) errors.push("joistCheck.livePsf is the live load in psf, 0 to 200.");
  if (!inr(c?.Fb, 200, 4000)) errors.push("joistCheck.Fb is the joist's allowable bending stress in psi (200 to 4000), adjusted by you.");
  if (!inr(c?.Fv, 50, 500)) errors.push("joistCheck.Fv is the joist's allowable shear stress in psi (50 to 500).");
  if (!inr(c?.E, 200000, 3000000)) errors.push("joistCheck.E is the joist's modulus of elasticity in psi (200000 to 3000000).");
  if (c?.deflLimit != null && !inr(c.deflLimit, 120, 720)) errors.push("joistCheck.deflLimit is the span ratio (L/360 by default), 120 to 720.");
  if (!(j.size in DEPTH)) errors.push(`Unknown landing joist size ${j.size}.`);
  if (errors.length) return { ok: false, errors };
  const b = THICK, d = DEPTH[j.size], L = j.span, lim = c.deflLimit ?? 360;
  const w = ((c.deadPsf + c.livePsf) * j.spacing) / 144, wl = (c.livePsf * j.spacing) / 144; // lb per inch
  const M = (w * L * L) / 8, V = (w * L) / 2;
  const fb = (6 * M) / (b * d * d), fv = (1.5 * V) / (b * d);
  const delta = (5 * wl * L ** 4) / (384 * c.E * ((b * d ** 3) / 12)), limit = L / lim;
  const warnings = [];
  if (fb > c.Fb) warnings.push(`Landing joist bending ${fb.toFixed(0)} psi exceeds the typed ${c.Fb} psi: use a deeper joist or a closer spacing.`);
  if (fv > c.Fv) warnings.push(`Landing joist shear ${fv.toFixed(0)} psi exceeds the typed ${c.Fv} psi.`);
  if (delta > limit) warnings.push(`Landing joist live deflection ${delta.toFixed(2)} in exceeds L/${lim} (${limit.toFixed(2)} in).`);
  return { ok: warnings.length === 0, size: j.size, span: L, spacing: j.spacing, M, V, fb, fv, delta, limit, warnings, errors: [] };
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
    ...(g.postSlenderness?.face ? [`  Landing post slenderness (${g.postSlenderness.postSize}): ${g.postSlenderness.height.toFixed(1)} in = ${g.postSlenderness.slenderness.toFixed(1)} x its face (limit ${g.postSlenderness.limit}; a ${g.postSlenderness.postSize} reaches ${formatInches(g.postSlenderness.maxHeight)})`] : []),
    ...(g.postSlenderness?.warnings ?? []).map((w) => `  Warning: ${w}`),
    ...(g.footings?.ok ? [`  Landing footings: heaviest post ${Math.round(g.footings.load)} lb (${g.footings.tributary.toFixed(1)} sq ft at ${g.footings.liveLoad + g.footings.deadLoad} psf) on ${g.footings.soilBearing} psf soil needs ${g.footings.area.toFixed(0)} sq in: ${g.footings.round} in round or ${g.footings.square} in square, ${g.footings.count} footings`] : []),
    ...(g.footings?.ok && g.footings.postOk != null ? [`  Landing post check: heaviest post ${Math.round(g.footings.load)} lb against your ${g.footings.postCapacity} lb capacity: ${g.footings.postOk ? "holds" : "OVER, use a larger post or a closer spacing"}`] : []),
    ...(g.footings?.ok && g.footings.extraLoad > 0 ? [`  Landing post load includes ${Math.round(g.footings.extraLoad)} lb from the flights' stringer reactions`] : []),
    ...(g.joistCheck?.ok !== undefined && g.joistCheck?.fb != null ? [`  Landing joist check (${g.joistCheck.size}, ${formatInches(g.joistCheck.span)} span at ${formatInches(g.joistCheck.spacing)}): bending ${g.joistCheck.fb.toFixed(0)} psi, shear ${g.joistCheck.fv.toFixed(0)} psi, live deflection ${g.joistCheck.delta.toFixed(2)} in of ${g.joistCheck.limit.toFixed(2)} in - ${g.joistCheck.ok ? "passes" : "FAILS"}`] : []),
    ...(g.joistCheck?.warnings ?? []).map((w) => `  Warning: ${w}`),
    ...(g.joistCheck && g.joistCheck.errors?.length ? g.joistCheck.errors.map((e) => `  Warning: ${e}`) : []),
    ...(g.postColumn?.ok ? [`  Landing post column (${g.postColumn.postSize}, typed fc and Emin): ${Math.round(g.postColumn.load)} lb of ${Math.round(g.postColumn.capacity)} lb (${(g.postColumn.utilisation * 100).toFixed(0)}%), Cp ${g.postColumn.cp.toFixed(2)} - ${g.postColumn.passes ? "passes" : "FAILS, use a larger post or a closer spacing"}`] : []),
    ...(g.postColumn && !g.postColumn.ok ? g.postColumn.errors.map((e) => `  Warning: ${e}`) : []),
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
export const WINDER_LIMITS = { winderWalkline: 12, winderWalkDepth: 10, winderMinDepth: 6, winderUniformity: 0.375 };

/** @param {{ count?: number, turn?: number, innerRadius?: number, width?: number, treadThickness?: number, treadSpanMax?: number, straightTread?: number, limits?: Partial<typeof WINDER_LIMITS> }} w */
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
  // Walkline uniformity (2026-10-31): the winder's depth at the walkline against the flight's straight tread, within `winderUniformity`
  // (3/8 in in the model code; the edition is the user's). Only checked when `straightTread` is typed. Hand-computed test only.
  const st = w.straightTread;
  const uniformDiff = typeof st === "number" && st > 0 ? walk - st : null;
  if (uniformDiff != null && Math.abs(uniformDiff) > L.winderUniformity + 1e-9) problems.push(`walkline depth ${walk.toFixed(2)} in differs from the ${st} in straight tread by ${Math.abs(uniformDiff).toFixed(2)} in, over ${L.winderUniformity} in`);
  return { ok: problems.length === 0, uniformDiff, straightTread: st ?? null, count, turn, anglePerTread: turn / count, innerRadius: r, narrow, walk, outer, minInnerRadius, problems, limits: L };
}

export function winderText(c) {
  if (!c.ok && !c.problems) return c.errors.map((e) => `  - ${e}`);
  const out = [`  Winders: ${c.count} treads of ${c.anglePerTread.toFixed(1)} degrees round a ${formatInches(c.innerRadius)} inner radius: ${c.narrow.toFixed(2)} in at the narrow end, ${c.walk.toFixed(2)} in at ${c.limits.winderWalkline} in out, ${c.outer.toFixed(2)} in at the wide end`];
  out.push(c.ok ? "  Winders pass the 6 in and 10 in rules as typed." : `  Winders fail: ${c.problems.join("; ")}. The smallest inner radius that passes is ${c.minInnerRadius.toFixed(1)} in.`);
  if (c.treads) {
    out.push(`  Straight-edge depths: ${c.chordNarrow.toFixed(2)} in narrow, ${c.chordWalk.toFixed(2)} in at ${c.limits.winderWalkline} in out, ${c.chordWide.toFixed(2)} in wide${c.chordPasses ? "" : " (a straight edge fails where the arc passes: add radius)"}`);
    if (c.framing) out.push(`  Framing under the winders: ${c.framing.supports} radial supports of ${formatInches(c.framing.supportLength)} (${formatInches(c.framing.totalLength)} all told; ${c.framing.shared} shared by two treads), each tread spanning up to ${formatInches(c.framing.treadSpan)} between two of them at the wall end.${c.framing.spanOk == null ? " Check that span against your own tread table." : c.framing.spanOk ? ` Within the ${formatInches(c.framing.treadSpanMax)} most.` : ` Over the ${formatInches(c.framing.treadSpanMax)} most: add a support under each tread, use thicker treads or a smaller inner radius.`}`);
    for (const t of c.treads) out.push(`  Winder tread ${t.index}: ${t.area.toFixed(1)} sq in, cut from a ${formatInches(t.blank.x)} x ${formatInches(t.blank.y)} blank`);
  }
  return out;
}

// Winder tread layout (2026-10-30): the wedge each tread is cut from. Tread k
// lies between the radial lines at k*theta and (k+1)*theta, from the inner
// radius to inner radius + width, with straight edges (corners at radius x
// angle). Reported per tread: the four corners (inches, pivot at 0,0), the
// shoelace area, the smallest rectangle of board it is cut from, and the
// straight-edge ("chord") depth 2 x radius x sin(theta/2) at the narrow end,
// 12 in out and the wide end. A chord is shorter than the arc `checkWinders`
// measures, so `chordPasses` is the stricter answer for a straight edge.
/** @param {{ count?: number, turn?: number, innerRadius?: number, width?: number, treadThickness?: number, treadSpanMax?: number, straightTread?: number, limits?: Partial<typeof WINDER_LIMITS> }} w */
export function layoutWinders(w) {
  const c = checkWinders(w);
  if (!c.problems) return c;
  const { count, anglePerTread, innerRadius: r, limits: L } = c, width = w.width ?? 36, R = r + width;
  const theta = anglePerTread * Math.PI / 180;
  const chord = (rad) => 2 * rad * Math.sin(theta / 2);
  const pt = (rad, a) => [rad * Math.cos(a), rad * Math.sin(a)];
  const treads = Array.from({ length: count }, (_, k) => {
    const a0 = k * theta, a1 = (k + 1) * theta;
    const corners = [pt(r, a0), pt(R, a0), pt(R, a1), pt(r, a1)];
    let area = 0;
    for (let i = 0; i < 4; i++) { const [x1, y1] = corners[i], [x2, y2] = corners[(i + 1) % 4]; area += x1 * y2 - x2 * y1; }
    const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
    return { index: k + 1, corners, area: Math.abs(area) / 2, blank: { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) } };
  });
  const chordNarrow = chord(r), chordWalk = chord(r + L.winderWalkline), chordWide = chord(R);
  const chordPasses = chordNarrow >= L.winderMinDepth - 1e-9 && chordWalk >= L.winderWalkDepth - 1e-9;
  // Framing under the treads (2026-10-30): a radial support (a 2x ledger or
  // riser plate) under every tread edge, count + 1 in all, each as long as the
  // run from the pivot to the wall; a tread board spans that run between its
  // two edge supports. The two supports fan out from the pivot, so the gap the
  // board crosses is widest at the wall end: the straight-edge depth at the
  // outer radius (`chordWide`), not the stair width (corrected 2026-10-31; the
  // first version reported the width). When a tread thickness is typed the gap
  // is checked against `maxTreadSpan`; otherwise it is reported for your table.
  const tt = w.treadThickness, spanMax = typeof w.treadSpanMax === "number" ? w.treadSpanMax : typeof tt === "number" ? maxTreadSpan(tt) : null;
  const framing = { supports: count + 1, supportLength: width, totalLength: (count + 1) * width, treadSpan: chordWide, shared: count - 1, treadSpanMax: spanMax, spanOk: spanMax == null ? null : chordWide <= spanMax + 1e-9 };
  return { ...c, treads, chordNarrow, chordWalk, chordWide, chordPasses, framing };
}

/**
 * Resolve `floor.headerCheck.stairFrom: N` (the CLI, the page): lay out plan.stairs[N] with its typed stringerCheck and copy
 * the flight's total top reaction (and live share) into headerCheck.stairReaction. Returns an error string or null.
 * Typed figures only; the same arithmetic as `checkStringer`, no automatic link to a different load case.
 */
export function linkStairReaction(plan, parseLength) {
  const hc = plan.floor && plan.floor.headerCheck;
  if (!hc || hc.stairFrom == null || hc.stairReaction != null) return null;
  const list = Array.isArray(plan.stairs) ? plan.stairs : plan.stairs ? [plan.stairs] : [];
  const st = list[hc.stairFrom];
  if (!st || !st.stringerCheck) return `headerCheck.stairFrom ${hc.stairFrom} needs plan.stairs[${hc.stairFrom}] with a stringerCheck.`;
  const tmp = { ...st };
  for (const k of ["totalRise", "tread", "width", "openingLength", "floorThickness"]) if (typeof tmp[k] === "string") tmp[k] = parseLength(tmp[k]);
  const sl = layoutStair({ id: "Stair link", ...tmp }, plan);
  const sk = sl.stringerCheck;
  if (!sl.ok || !sk || sk.errors.length || !sk.totalReaction) return `headerCheck.stairFrom ${hc.stairFrom}: the stair's stringerCheck gave no reaction (${[...(sl.errors || []), ...(sk?.errors || [])].join("; ") || "check the stair"}).`;
  hc.stairReaction = sk.totalReaction; hc.stairReactionLive = sk.totalReactionLive;
  return null;
}
