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
