/**
 * Measurement spec sheet for the tech pack, and a check of a factory sample
 * against it. A factory sews to a table of "points of measure" (POM) with a
 * tolerance on each; without one, "the sample is too tight" is an argument,
 * not a pass or a fail.
 *
 * Points are finished-garment measurements, laid flat, in cm:
 *   chest      1/2 chest, 2.5 cm below the armhole (flat width across)
 *   hem        1/2 hem width
 *   length     body length, high point of shoulder (HPS) to hem
 *   sleeve     shoulder point to cuff (from tryon.mjs; the factory's M figure replaces the typical one)
 *   shoulder   across shoulder seam to seam (typical share of the chest)
 *   neck       neck opening width, seam to seam (typical)
 * Sizes, chest and length come from fit.mjs (typical unisex chart, replaceable
 * by `sizeChart`). Tolerances are typical trade figures for knit tops
 * (about +/-1 cm on width and length, +/-0.5 cm on neck, +/-1 on sleeve),
 * written from general knowledge and NOT any buyer's or standard's table:
 * agree them with the factory, `tolerances` overrides. Not legal or QC advice.
 */
import { garmentMeasurements, BODY_CHEST_CM } from "./fit.mjs";
import { SLEEVE_CM_M } from "./tryon.mjs";
import { SIZES } from "./design.mjs";

export const POINTS = Object.freeze([
  { id: "chest", label: "1/2 chest, 2.5 cm below armhole" },
  { id: "hem", label: "1/2 hem" },
  { id: "length", label: "Body length, HPS to hem" },
  { id: "sleeve", label: "Sleeve, shoulder point to cuff" },
  { id: "shoulder", label: "Across shoulder" },
  { id: "neck", label: "Neck opening, seam to seam" },
]);

/** Typical +/- tolerance in cm per point (not a standard). */
export const TOLERANCE_CM = Object.freeze({ chest: 1, hem: 1, length: 1, sleeve: 1, shoulder: 0.8, neck: 0.5 });

const r1 = v => Math.round(v * 10) / 10;
const SHOULDER_SHARE = 0.41; // across shoulder as a share of the finished chest circumference, typical for a set-in sleeve
const NECK_CM = { tee: 18, longsleeve: 18, crewneck: 19, hoodie: 21 };

/**
 * The spec table: one row per size, one value per point.
 * @param {{garment?:string, fit?:string, sizeChart?:object, sleeveCm?:number, tolerances?:object}} o
 */
export function specSheet({ garment = "tee", fit = "regular", sizeChart = BODY_CHEST_CM, sleeveCm, tolerances = {} } = {}) {
  const gm = garmentMeasurements(garment, fit, sizeChart);
  const tol = { ...TOLERANCE_CM };
  for (const [k, v] of Object.entries(tolerances)) {
    if (!(k in TOLERANCE_CM)) throw new Error(`Unknown point "${k}".`);
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 5) throw new Error(`Tolerance for ${k} must be a number from 0 to 5 cm.`);
    tol[k] = v;
  }
  if (sleeveCm != null && !(typeof sleeveCm === "number" && sleeveCm >= 5 && sleeveCm <= 100)) throw new Error("Sleeve length must be 5 to 100 cm.");
  const mi = SIZES.indexOf("M");
  const base = sleeveCm ?? SLEEVE_CM_M[garment] ?? 21;
  const sizes = {};
  SIZES.forEach((s, i) => {
    const m = gm[s];
    if (!m) return;
    sizes[s] = {
      chest: m.flatWidth,
      hem: m.flatWidth,
      length: m.length,
      sleeve: r1(base + (i - mi)),
      shoulder: r1(m.chest * SHOULDER_SHARE), // finished chest circumference x share
      neck: NECK_CM[garment] ?? 18,
    };
  });
  const notes = [
    "Tolerances and the shoulder and neck figures are typical, not a standard: agree the table with the factory in writing before sampling.",
    "A straight cut is assumed (hem as wide as the chest); say so if the style tapers.",
  ];
  if (sleeveCm == null) notes.push("Sleeve length is a typical figure; put the factory's size M figure in to replace it.");
  return { garment, fit, points: POINTS.map(p => ({ ...p, tolCm: tol[p.id] })), sizes, notes };
}

/**
 * Check a sample's measured points against the spec for its size.
 * `measured` maps point id to cm; missing points are reported, not failed.
 * Returns each point's difference, its verdict (pass / over / under) and
 * a plain instruction.
 */
export function sampleCheck(spec, size, measured) {
  const target = spec.sizes[size];
  if (!target) throw new Error(`No spec for size ${size}.`);
  const rows = [];
  const missing = [];
  for (const p of spec.points) {
    const v = measured?.[p.id];
    if (v == null || v === "") { missing.push(p.id); continue; }
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 300) throw new Error(`${p.id} must be a number of cm.`);
    const diff = r1(v - target[p.id]);
    const verdict = Math.abs(diff) <= p.tolCm + 1e-9 ? "pass" : diff > 0 ? "over" : "under";
    rows.push({ id: p.id, label: p.label, spec: target[p.id], measured: v, diff, tolCm: p.tolCm, verdict,
      action: verdict === "pass" ? "" : `${p.label}: ${Math.abs(diff)} cm ${verdict === "over" ? "too big" : "too small"} (tolerance +/-${p.tolCm}); ask the factory to correct the pattern.` });
  }
  const fails = rows.filter(r => r.verdict !== "pass");
  const lines = rows.filter(r => r.verdict !== "pass").map(r => r.action);
  return {
    size,
    rows,
    missing,
    approved: fails.length === 0 && missing.length === 0,
    summary: fails.length ? `${fails.length} of ${rows.length} points are out of tolerance.` : missing.length ? `All ${rows.length} measured points pass; ${missing.length} not measured.` : `All ${rows.length} points pass.`,
    comments: lines,
  };
}

/** A plain-text comment for the factory from a failed check, ready to send. */
export function sampleComments(check, style = "the sample") {
  if (!check.rows.length) return "No points measured.";
  const head = `Sample comments on ${style}, size ${check.size}: ${check.summary}`;
  return [head, ...check.comments.map((c, i) => `${i + 1}. ${c}`), check.missing.length ? `Not measured: ${check.missing.join(", ")}.` : ""].filter(Boolean).join("\n");
}
