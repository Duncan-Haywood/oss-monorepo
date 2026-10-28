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

export const STAIR_LIMITS = { maxRiser: 7.75, minTread: 10, riserVariance: 0.375, headroom: 80, minWidth: 36, maxRise: 147, minThroat: 3.5 };

/** @typedef {{ id?: string, totalRise: number, tread?: number, stringer?: string, width?: number, stringerSpacing?: number, treadThickness?: number, treadBoard?: string, treadGap?: number, nosing?: number, floorThickness?: number, openingLength?: number, openRisers?: boolean, limits?: Partial<typeof STAIR_LIMITS> }} Stair */

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
  if (s.width != null && !(s.width >= L.minWidth)) errors.push(`Stair width ${s.width} in is under the ${L.minWidth} in minimum.`);
  if (s.width != null && s.width > 120) errors.push("Stair width over 10 ft is outside what this layout checks.");
  return errors;
}

/**
 * @param {Stair} input
 * @param {{stock: {size: string, length: number}[]}} [plan]
 */
export function layoutStair(input, plan) {
  const s = { id: "Stair", tread: 10, stringer: "2x12", width: 36, treadThickness: 1.5, treadBoard: "2x12", treadGap: 0.25, nosing: 1, stringerSpacing: 16, floorThickness: 12.25, ...input };
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
  if (s.nosing > 1.25 || s.nosing < 0.75) if (tread < 11) notes.push(`Nosing ${s.nosing} in is outside the 3/4 to 1-1/4 in the code allows on solid-riser treads under 11 in.`);

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
  const marks = Array.from({ length: risers }, (_, i) => ({ step: i + 1, rise: i === 0 ? firstRiserCut : riser, run: i === 0 ? 0 : tread }));
  const sumRise = firstRiserCut + (risers - 1) * riser;
  return {
    ok: true, id: s.id, totalRise: s.totalRise, risers, treads, riser, tread, run, angle, pitch, firstRiserCut, comfort,
    stringer: { size: s.stringer, count: stringers, length: stringerLength, throat, spacing: span / (stringers - 1), depth },
    treadBoards, openRisers: !!s.openRisers, riserBoards: s.openRisers ? 0 : risers, width: s.width,
    minOpening: Math.ceil(minOpening * 16) / 16, opening, marks, sumRise, notes, limits: L, nosing: s.nosing,
  };
}

/** Cut rows in the engine's shape, so `takeoff(plan, stairCuts(layout))` buys stair lumber with the walls'. */
export function stairCuts(l) {
  if (!l.ok) return [];
  const rows = [{ size: l.stringer.size, length: Math.round(l.stringer.length * 16) / 16, kind: "stair stringer", qty: l.stringer.count, walls: [l.id] }];
  if (l.treadBoards.size in DEPTH) rows.push({ size: l.treadBoards.size, length: l.treadBoards.length, kind: "stair tread", qty: l.treadBoards.count, walls: [l.id] });
  return rows;
}

export function stairText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.totalRise)} rise, ${l.risers} risers of ${formatInches(l.riser)}, ${l.treads} treads of ${formatInches(l.tread)} (${l.angle.toFixed(1)} deg, 2R+T ${l.comfort.toFixed(2)} in)`];
  out.push(`  Total run ${formatLength(l.run)}; the first riser is cut ${formatInches(l.firstRiserCut)} so the finished first step is ${formatInches(l.riser)} once the tread is on`);
  out.push(`  ${l.stringer.count} ${l.stringer.size} stringers ${formatLength(l.stringer.length)} long, ${formatInches(l.stringer.spacing)} apart, ${formatInches(l.stringer.throat)} left under the notches`);
  out.push(`  ${l.treadBoards.count} ${l.treadBoards.size} tread boards ${formatLength(l.treadBoards.length)} (${l.treadBoards.perStep} per step covering ${formatInches(l.treadBoards.coverage)} for ${formatInches(l.treadBoards.need)} of tread and nosing)${l.openRisers ? ", open risers" : `, ${l.riserBoards} risers`}`);
  out.push(`  Stairwell opening at least ${formatLength(l.minOpening)} long for ${formatInches(l.limits.headroom)} of headroom${l.opening ? `; yours ${formatLength(l.opening.length)} leaves ${formatInches(l.opening.headroom)}${l.opening.ok ? "" : " (too short)"}` : ""}`);
  for (const n of l.notes) out.push(`  Note: ${n}`);
  return out;
}

/**
 * A stair that rises more than one flight may (147 in by default) is split at a landing into two flights.
 * `landing` is `true` or `{ depth, landingRise, joist, spacing, deckBoard }`. The landing is as deep as the
 * stair is wide (36 in at least), the usual code rule for a straight run or a turn; the rise is split in half
 * unless `landingRise` (finished floor to the landing surface) is typed. The stairwell opening applies to the
 * upper flight only. A turn does not change a count, so quarter-turns and straight runs buy the same lumber.
 * @param {Stair & { landing?: true | { depth?: number, landingRise?: number, joist?: string, spacing?: number, deckBoard?: string } }} input
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
    notes: ["Landing posts and footings are not sized: the platform carries a stair load plus the flights' ends, so check posts and footings against your code and the actual spans."],
  };
  return { ok: true, id, totalRise: input.totalRise, flights: [lower, upper], landing };
}

export function landingCuts(r) {
  if (!r.ok) return [];
  const g = r.landing;
  return [
    { size: g.joists.size, length: Math.round(g.joists.length * 16) / 16, kind: "landing joist", qty: g.joists.count, walls: [r.id] },
    { size: g.rims.size, length: Math.round(g.rims.length * 16) / 16, kind: "landing rim", qty: g.rims.count, walls: [r.id] },
    { size: g.deck.size, length: g.deck.length, kind: "landing deck board", qty: g.deck.count, walls: [r.id] },
  ];
}

export function landingText(r) {
  if (!r.ok) return r.errors.map((e) => `  - ${e}`);
  const g = r.landing;
  return [
    `${r.id}: ${formatLength(r.totalRise)} rise in two flights around a ${formatLength(g.width)} x ${formatLength(g.depth)} landing at ${formatLength(g.rise)}`,
    ...r.flights.flatMap(stairText),
    `  Landing: ${g.joists.count} ${g.joists.size} joists ${formatLength(g.joists.length)} (${formatInches(g.joists.spacing)} apart), 2 rims ${formatLength(g.rims.length)}, ${g.deck.count} ${g.deck.size} deck boards ${formatLength(g.deck.length)}; run on plan ${formatLength(g.footprint)} for a straight stair`,
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
