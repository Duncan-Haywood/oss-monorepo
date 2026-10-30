// @ts-check
// The saltbox roof: a gable with its ridge off centre, a short steep slope at
// the front and a long shallow one at the back. Both eave walls are the same
// height (the shed's wall height); the ridge sits where the two slopes' top
// lines meet, so it follows from the two pitches:
//
//   front run x tF = back run x tB, near enough (the rafter depths and seats
//   shift it a little; roofSides solves it exactly).
//
// A 5/12 back with a 10/12 front puts the ridge a third of the way back.
//
// How it is framed: rafters of two cuts, each pair meeting at a ridge board
// (with ties at the plates) or hung from a ridge beam on gable posts, as on a
// gable. Trusses are not offered: a site-built saltbox truss would need its
// own webs and gussets, and none is modelled.
//
// Structure. A rafter pair with a tie is a three-hinged frame, pinned at the
// two seats with a hinge at the ridge. Under a load w per foot on plan over
// the front run a and the back run b, taking moments about the ridge for each
// half gives equal vertical reactions at the walls, w(a + b)/2 each, whatever
// the ridge's position, and a tie force H = w a b / (2 h), with h the ridge's
// rise over the seats. For a gable (a = b = L/2) that is the familiar
// w L^2 / (8 h). Under a ridge beam each rafter is a simple span, so the beam
// takes w a / 2 from the front rafters and w b / 2 from the back: unequal
// reactions from each side, and the beam's line load is their sum. The dead
// load per foot on plan differs by side too (15 psf along the slope, divided
// by each slope's cosine), so the checks carry both sides' numbers.
//
// Coordinates are the model's: y across the width from the front eave wall's
// outside face, z up from the gravel.

import { actual } from './lumber.mjs';

/** Front-slope pitches the tool offers, inches of rise per foot. */
export const FRONT_PITCH_MIN = 3;
export const FRONT_PITCH_MAX = 18;

/**
 * The two roof slopes and where the ridge is. On a gable both sides are the
 * same and the ridge is at mid-width; on a saltbox the front takes
 * `frontPitch`, the back `pitch`.
 * @param {{ width: number, pitch: number, frontPitch?: number, style?: string, studSize?: string, rafterSize?: string, rafterSeat?: string, roofType?: string }} d
 */
export function roofSides(d) {
  const W = d.width;
  const salt = d.style === 'saltbox';
  const tB = d.pitch / 12;
  const tF = salt ? (d.frontPitch ?? d.pitch * 2) / 12 : tB;
  const cB = 1 / Math.hypot(1, tB);
  const cF = 1 / Math.hypot(1, tF);
  // Where the rafter's underside meets the wall: the plate's inside edge with
  // a birdsmouth, its outside edge on a connector.
  const seatAt = d.rafterSeat === 'connector' || d.roofType === 'truss' ? 0 : actual(d.studSize || '2x4').depth;
  const rd = actual(d.rafterSize || '2x6').depth;
  // The rafters' top lines meet over the ridge's centre:
  // (y - seatAt) tF + rd / cF = (W - y - seatAt) tB + rd / cB.
  const ridgeY = Math.abs(tF - tB) < 1e-12 ? W / 2 : ((W - seatAt) * tB + seatAt * tF + rd * (1 / cB - 1 / cF)) / (tF + tB);
  const side = (pitch, t, c, half) => ({ pitch, t, cos: c, half });
  return {
    saltbox: salt,
    ridgeY,
    seatAt,
    front: side(salt ? (d.frontPitch ?? d.pitch * 2) : d.pitch, tF, cF, ridgeY),
    back: side(d.pitch, tB, cB, W - ridgeY),
  };
}

/**
 * A rafter pair's statics under a uniform load on plan, lb per foot of plan
 * per foot along the shed (that is, psf times the spacing in feet):
 * the vertical reaction at each wall and the tie's force, with the runs a, b
 * and the rise h in inches. See the header for the derivation.
 * @param {number} wFront load on the front run, plf on plan @param {number} wBack on the back run
 * @param {number} a front run, inches @param {number} b back run @param {number} h rise, inches
 */
export function threeHinged(wFront, wBack, a, b, h) {
  const A = a / 12;
  const B = b / 12;
  const Hft = h / 12;
  // Unknowns: front wall reaction Va, back Vb, thrust H (lb).
  // Front half about the ridge: Va A - wF A^2 / 2 - H Hft = 0.
  // Back half about the ridge:  Vb B - wB B^2 / 2 - H Hft = 0.
  // Vertical equilibrium:       Va + Vb = wF A + wB B.
  // So Va A - wF A^2/2 = Vb B - wB B^2/2 with Vb = wF A + wB B - Va, which gives:
  const Va = ((wFront * A * A) / 2 - (wBack * B * B) / 2 + (wFront * A + wBack * B) * B) / (A + B);
  const Vb = wFront * A + wBack * B - Va;
  const H = (Va * A - (wFront * A * A) / 2) / Hft;
  // The ridge's vertical shear: what the front half passes to the back (negative: the back passes it forward).
  const ridge = Va - wFront * A;
  return { Va, Vb, H, ridge };
}
