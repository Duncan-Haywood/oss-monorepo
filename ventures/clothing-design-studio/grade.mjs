/**
 * One grade rule for the knit-top block: neck width and across-shoulder per
 * size, read by the pattern (`pattern.mjs` bodyBlock), the spec sheet the
 * tech pack prints (`spec.mjs`) and the neckband piece. Until 2026-11-23 the
 * pattern and the spec typed these figures separately: the 2026-11-22
 * quality audit found a sample sewn from the studio's own pattern failing the
 * studio's own spec on shoulder in 5 of 6 sizes and on neck in 5 of 6.
 *
 * How the figures are made:
 *  - Size M keeps the block's drafting ratios: half neck 0.09 x body chest
 *    (18 cm neck opening on a 100 cm chest), shoulder point 0.225 x body
 *    chest + 0.1 x the fit's ease from the fold.
 *  - Other sizes move from M by a grade per cm of body chest. The old block
 *    scaled everything with the chest (neck +1.44 cm and across-shoulder
 *    +3.6 cm per 8 cm chest step, about twice a menswear chart's steps, as
 *    the audit noted). The defaults below are neck +0.64 cm (about 1/4 inch)
 *    and across-shoulder +1.76 cm per 8 cm step: typical knit-top grade
 *    steps written from general knowledge, NOT any factory's or standard's
 *    grade rule. A factory's grade rule replaces them (`grade` option).
 *  - Thicker garments open the neck a little (crewneck +1 cm, hoodie +3 cm,
 *    the figures the spec sheet used before), so a sweatshirt band and a
 *    hood go over the head.
 */
import { BODY_CHEST_CM } from "./fit.mjs";

/** Grade per cm of body chest (cm), the whole width, not the half. */
export const GRADE_PER_CM_CHEST = Object.freeze({ neck: 0.08, shoulder: 0.22 });

/** Extra neck opening width by garment at every size (cm). */
export const NECK_EXTRA_CM = Object.freeze({ tee: 0, longsleeve: 0, crewneck: 1, hoodie: 3 });

/** Neckband: finished width (cm, folded) and length as a share of the neck seam it is stretched onto. */
export const NECKBAND = Object.freeze({ widthCm: { tee: 2, longsleeve: 2, crewneck: 2.5 }, ratio: 0.85 });

/**
 * Validate a grade override; returns the merged rule or throws.
 * @param {{neck?:number, shoulder?:number}} [over] cm of neck width / across shoulder per cm of body chest
 */
export function gradeRule(over = {}) {
  const r = { ...GRADE_PER_CM_CHEST };
  for (const [k, v] of Object.entries(over || {})) {
    if (!(k in r)) throw new Error(`Unknown grade "${k}" (neck or shoulder).`);
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 0.6)) throw new Error(`Grade for ${k} must be 0 to 0.6 cm per cm of chest.`);
    r[k] = v;
  }
  return r;
}

/** Body chest of the size the grade starts from (the chart's M, else its middle size). */
export function anchorChest(sizeChart = BODY_CHEST_CM) {
  if (sizeChart.M > 0) return sizeChart.M;
  const v = Object.values(sizeChart).filter(x => x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 100;
}

/**
 * Neck and shoulder for one size.
 * @param {{bodyChest:number, chest:number}} g one size from fit.mjs garmentMeasurements
 * @returns {{halfNeckCm:number, neckWidthCm:number, shoulderPointCm:number, acrossShoulderCm:number}}
 *   shoulderPointCm is from the fold before any cap for a narrow armhole (pattern.mjs caps it at the half chest - 4)
 */
export function neckAndShoulder(g, { garment = "tee", sizeChart = BODY_CHEST_CM, grade } = {}) {
  const r = gradeRule(grade);
  const m = anchorChest(sizeChart), d = g.bodyChest - m, ease = g.chest - g.bodyChest;
  const halfNeckCm = 0.09 * m + (NECK_EXTRA_CM[garment] ?? 0) / 2 + (r.neck / 2) * d;
  const shoulderPointCm = 0.225 * m + 0.1 * ease + (r.shoulder / 2) * d;
  return { halfNeckCm, neckWidthCm: 2 * halfNeckCm, shoulderPointCm, acrossShoulderCm: 2 * shoulderPointCm };
}
