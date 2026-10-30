// @ts-check
// Site-built king-post trusses: the member and joint checks.
//
// A king-post truss here is two top chords (the rafter size) meeting at the
// peak, a bottom chord (the tie size) across the walls, and a king post from
// the bottom chord's middle up to the peak, joined by 7/16" OSB gussets glued
// and nailed on both faces. It is checked as a pin-jointed truss, the way a
// framer's span table treats a rafter pair and its tie:
//
// - the outward thrust at each heel, H = wL^2 / 8h for the roof load w (lb/ft
//   on plan) over the span L with the peak h above the bottom chord, plus the
//   share of the ceiling load the king post carries up to the peak, (P/2)(L/2)/h;
// - the top chord in bending (a simple span, heel to peak) combined with the
//   compression H / cos along it (NDS 3.9.2, column stability in the truss's
//   plane over the chord's length; the sheathing braces it the other way);
// - the bottom chord in tension H combined with bending under the ceiling load
//   between the heel and the king post (NDS 3.9.1);
// - the gusset nails at each joint, by the NDS yield limit equations (NDS
//   12.3.1) for a 1-1/2" x 0.148" connector nail (the Simpson N10 on the
//   shopping list) through a 7/16" OSB side member into the SPF chord. It is
//   short enough that its tip stops inside the chord, clear of the far gusset.
//
// Design values, all published:
// - SPF No. 2: Fb 875, Ft 450, Fc 1150 psi, Emin 510,000 psi (NDS Supplement,
//   2018, Table 4A); size factors for Fb and Ft by depth, and Fc's for 2x4 and
//   2x6 (Table 4A adjustment factors); repetitive member Cr 1.15 at 24" or less.
// - Dowel bearing strength: SPF (G 0.42) Fe = 16,600 G^1.84 for nails under
//   1/4" (NDS 12.3.3); OSB of all grades G 0.50, Fe 4,650 psi (NDS Table 12.3.3B).
// - Nail bending yield strength 90,000 psi for diameters over 0.142" to 0.177"
//   (NDS Appendix I, Table I1); Rd = KD = 2.2 for D <= 0.17" (NDS Table 12.3.1B).
// - Load duration CD 1.15 with snow (NDS Table 2.3.2); attic live loads 10 psf
//   without storage and 20 psf with limited storage (IRC Table R301.5).
//
// The gusset panel's own tension and shear are not checked, nor are uplift and
// the heel's tie-down; this is a screening check, not an engineered truss design.

import { DEPTH, SPF2, T } from './structure.mjs';

const FT = 450; // SPF No. 2 tension parallel to grain, psi (NDS Supplement Table 4A)
const CF_B = { '2x4': 1.5, '2x6': 1.3, '2x8': 1.2, '2x10': 1.1, '2x12': 1.0 }; // Fb and Ft
const CF_C = { '2x4': 1.15, '2x6': 1.1, '2x8': 1.05, '2x10': 1.0, '2x12': 1.0 };
const CR = 1.15;

/** The gusset nail: a 1-1/2" x 0.148" connector nail, driven through the 7/16" gusset into the 1-1/2" chord. */
export const GUSSET_NAIL = { name: '1-1/2" connector nail', D: 0.148, length: 1.5, gusset: 7 / 16, Fyb: 90000 };

/** Attic live load on the bottom chords, psf (IRC Table R301.5), and dead load (chord, wiring, a plywood deck when stored on). */
export const ATTIC = { none: { live: 10, dead: 5 }, storage: { live: 20, dead: 8 } };

/**
 * Reference lateral design value Z (lb) of one nail in single shear by the
 * NDS yield limit equations (NDS 12.3.1), side and main members of different
 * dowel bearing strengths. D diameter, ls side thickness, lm main penetration
 * (inches), Fes and Fem bearing strengths, Fyb bending yield (psi).
 */
export function nailZPanel(D, ls, lm, Fes, Fem, Fyb = 100000) {
  const Re = Fem / Fes;
  const Rt = lm / ls;
  const Rd = 2.2;
  const k1 = (Math.sqrt(Re + 2 * Re ** 2 * (1 + Rt + Rt ** 2) + Rt ** 2 * Re ** 3) - Re * (1 + Rt)) / (1 + Re);
  const k2 = -1 + Math.sqrt(2 * (1 + Re) + (2 * Fyb * (1 + 2 * Re) * D ** 2) / (3 * Fem * lm ** 2));
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * Fyb * (2 + Re) * D ** 2) / (3 * Fem * ls ** 2));
  return Math.min(
    (D * lm * Fem) / Rd,
    (D * ls * Fes) / Rd,
    (k1 * D * ls * Fes) / Rd,
    (k2 * D * lm * Fem) / ((1 + 2 * Re) * Rd),
    (k3 * D * ls * Fem) / ((2 + Re) * Rd),
    ((D ** 2) / Rd) * Math.sqrt((2 * Fem * Fyb) / (3 * (1 + Re))),
  );
}

/** One gusset nail's allowable load (lb) with snow (CD 1.15): 6d common, OSB side member, SPF main member. */
export function gussetNailZ(CD = 1.15) {
  const n = GUSSET_NAIL;
  const lm = Math.min(n.length - n.gusset, T); // 1-1/16" into the chord: more than 6D, the NDS minimum
  return nailZPanel(n.D, n.gusset, lm, 4650, 16600 * 0.42 ** 1.84, n.Fyb) * CD;
}

/**
 * The truss's forces under the design's loads, per truss: roof load w (lb/ft
 * on plan), ceiling load wc (lb/ft), the king post's pull P, the thrust H
 * (lb, the bottom chord's tension), the top chord's compression C, and the
 * geometry used (span L, panel L/2 and rise h, inches).
 * Without a king post (o.king false) the ceiling load goes straight to the
 * heels and adds no thrust.
 * @param {import('./model.mjs').Design} d
 * @param {{ snow?: boolean, king?: boolean }} [o]
 */
export function trussForces(d, o = {}) {
  const king = o.king ?? needsKingPost(d);
  const t = d.pitch / 12;
  const cos = 1 / Math.sqrt(1 + t * t);
  const s = d.rafterSpacing / 12;
  const snow = o.snow === false ? 0 : d.snowLoad;
  const w = (15 / cos + snow) * s; // lb/ft on plan
  const attic = d.atticStorage ? ATTIC.storage : ATTIC.none;
  const wc = (attic.live + attic.dead) * s;
  const L = d.width; // inches, wall face to wall face
  const h = (L / 2) * t; // peak above the bottom chord's top, at the heel line
  const P = king ? (wc * L) / 12 / 2 : 0; // the king post holds up the middle half of the ceiling (simple spans)
  const H = ((w / 12) * L * L) / (8 * h) + ((P / 2) * (L / 2)) / h;
  return { w, wc, P, H, C: H / cos, L, h, cos, attic, king };
}

/**
 * The net upward load on one truss under ASCE 7's ASD combination 0.6D + 0.6W,
 * lb/ft on plan: 0.6W on its strip of roof less 0.6 of its roof dead load
 * (15 psf on the slope) and ceiling dead load. Positive means the wind wins:
 * the heels are pulled together and the bottom chord goes into compression.
 * @param {import('./model.mjs').Design} d
 */
export function trussNetUplift(d) {
  const f = trussForces(d, { snow: false });
  const s = d.rafterSpacing / 12;
  return 0.6 * d.windLoad * s - 0.6 * ((15 / f.cos) * s + f.attic.dead * s);
}

/**
 * Whether the bottom chords need a brace at mid-span: when the wind reverses
 * them (trussNetUplift) and no king post already halves their length. NDS
 * 3.7.1.4 caps a compression member's le/d at 50, and a 2x4 chord braced only
 * at the heels is past that from a 75" span.
 * @param {import('./model.mjs').Design} d
 */
export function needsChordBrace(d) {
  return trussNetUplift(d) > 0 && !needsKingPost(d) && d.width / T > 50;
}

/**
 * The bottom chord's worst ratio, tension plus bending (NDS 3.9.1), with snow
 * (CD 1.15) and under the attic load alone (CD 1.0), spanning heel to king
 * post, or heel to heel without one.
 * @param {import('./model.mjs').Design} d @param {boolean} king
 */
function bottomChordRatio(d, king) {
  const bot = d.tieSize;
  const dd = DEPTH[bot];
  const A = T * dd;
  const S = (T * dd * dd) / 6;
  let worst = 0;
  for (const [snow, CD] of /** @type {[boolean, number][]} */ ([[true, 1.15], [false, 1.0]])) {
    const f = trussForces(d, { snow, king });
    const span = king ? f.L / 2 : f.L;
    const fb = ((f.wc / 12) * span * span) / 8 / S;
    const ft = f.H / A;
    worst = Math.max(worst, ft / (FT * CD * CF_B[bot]) + fb / (SPF2.Fb * CD * CF_B[bot] * (d.rafterSpacing <= 24 ? CR : 1)));
  }
  return worst;
}

/**
 * Whether the trusses need a king post: only when the bottom chord would be
 * over capacity spanning wall to wall on its own. Leaving it out saves a member
 * and two gussets a truss, and leaves the middle of the attic clear.
 * @param {import('./model.mjs').Design} d
 */
export function needsKingPost(d) {
  return bottomChordRatio(d, false) > 1;
}

/**
 * Checks for the trusses of a design: rows in the shape checks.mjs uses, and
 * the gusset nail count per member at each joint (both faces together).
 * @param {import('./model.mjs').Design} d
 */
export function trussChecks(d) {
  const top = d.rafterSize;
  const bot = d.tieSize;
  /** @type {{ member: string, size: string, detail: string, ratio: number, governs: string, ok: boolean }[]} */
  const rows = [];
  const add = (member, size, detail, ratio, governs) => rows.push({ member, size, detail, ratio, governs, ok: ratio <= 1 });
  const king = needsKingPost(d);
  let worstTop = 0;
  const worstBot = bottomChordRatio(d, king);
  let H = 0;
  let C = 0;
  // With snow (CD 1.15), and the attic load alone with only the roof's dead load (CD 1.0: storage is a 10-year live load).
  for (const [snow, CD] of /** @type {[boolean, number][]} */ ([[true, 1.15], [false, 1.0]])) {
    const f = trussForces(d, { snow, king });
    H = Math.max(H, f.H);
    C = Math.max(C, f.C);
    // Top chord: bending over the heel-to-peak run, plus compression along it.
    {
      const dd = DEPTH[top];
      const A = T * dd;
      const S = (T * dd * dd) / 6;
      const run = f.L / 2;
      const M = ((f.w / 12) * run * run) / 8; // the same on plan or along the slope
      const fb = M / S;
      const Fb = SPF2.Fb * CD * CF_B[top] * (d.rafterSpacing <= 24 ? CR : 1);
      const fc = f.C / A;
      const FcStar = SPF2.Fc * CD * (CF_C[top] || 1);
      const le = run / f.cos;
      const FcE = (0.822 * SPF2.Emin) / (le / dd) ** 2;
      const a = FcE / FcStar;
      const b = (1 + a) / 1.6;
      const Cp = b - Math.sqrt(b * b - a / 0.8);
      // At or past the buckling load the interaction has no meaning: report it as over capacity by that much.
      const r = fc >= FcE ? 1 + fc / FcE : (fc / (FcStar * Cp)) ** 2 + fb / (Fb * (1 - fc / FcE));
      worstTop = Math.max(worstTop, r);
    }
  }
  const f = trussForces(d, { king });
  const z = gussetNailZ();
  // Nails per member at each joint, both faces together; at least four (two a face).
  const nails = (force) => Math.max(4, 2 * Math.ceil(force / z / 2 - 1e-9));
  const heelBottom = nails(H);
  const heelTop = nails(C);
  const peak = nails(C);
  const foot = king ? nails(f.P) : 0;
  add('Truss top chords', `${top} at ${d.rafterSpacing}"`, `bending over the ${(f.L / 24).toFixed(1)} ft run plus ${Math.round(C)} lb compression along the chord (NDS 3.9.2)`, worstTop, 'bending and compression');
  add('Truss bottom chords', `${bot}`, `${Math.round(H)} lb tension plus bending under a ${f.attic.live} psf attic load${d.atticStorage ? ' (limited storage)' : ' (no storage)'} ${king ? ' between heel and king post' : ', wall to wall with no king post'} (NDS 3.9.1)`, worstBot, 'tension and bending');
  const gusset = (where, force, n) => add(`Truss gusset nails, ${where}`, `${n} ${GUSSET_NAIL.name}s`, `${Math.round(force)} lb through the joint; ${Math.round(z)} lb a nail (NDS yield limit, OSB to SPF); ${n / 2} a face`, force / (n * z), 'nail shear');
  gusset('heel (into the bottom chord)', H, heelBottom);
  gusset('heel and peak (into each top chord)', C, heelTop);
  if (king) gusset('king post foot', f.P, foot);
  return { rows, forces: f, perNail: z, king, nails: { heelBottom, heelTop, peak, foot } };
}
