// @ts-check
// Attic ventilation: the net free vent area the code asks for, and the ridge
// vent and soffit vents that supply it, from the roof the plan already has.
//
// The rule is IRC R806.2 (and the IBC's matching text): net free ventilating
// area of at least 1/150 of the attic floor area, or 1/300 where a Class I or II
// vapor retarder is on the warm side of the ceiling or where at least 40% and
// no more than 50% of the area is in the upper part of the attic (a ridge vent),
// the rest low in the eaves. The ratio is set by `ratio` (150 or 300); which
// one applies to a house is the builder's and the inspector's call, not this
// file's. Net free area (NFA) per foot of ridge vent and per soffit vent unit
// is read off the product's label, so both are typed; the defaults below are
// placeholders in the usual range, not any maker's figure.
//
// Attic floor area = roof width x length (the building footprint) unless
// `atticSqFt` is typed. Ridge vent runs the ridge less `ridgeEndGap` at each
// end (default 12 in; hip roofs vent along the short ridge only). Soffit units
// are `soffitUnitWidth` wide (default 16 in) and must fit along the eave.
// Not counted: gable-end and box vents, power vents, baffles (one per rafter or truss bay along the eaves is listed as a count only), screens' loss (the label NFA already has it),
// and any cathedral or unvented (spray foam) assembly, which this does not model.

/** @typedef {{ ratio?: 150 | 300, atticSqFt?: number, ridgeVent?: boolean, upperShare?: number, ridgeNfaPerFt?: number, ridgeEndGap?: number, soffitUnitNfa?: number, soffitUnitWidth?: number, soffitFill?: number, ridgePiece?: number, ridgePrice?: number, soffitPrice?: number }} Ventilation */

/** @param {Ventilation} v */
export function validateVentilation(v) {
  const e = [];
  if (v == null || typeof v !== "object" || Array.isArray(v)) return ["Ventilation settings are an object."];
  if (v.ratio != null && v.ratio !== 150 && v.ratio !== 300) e.push("Ventilation ratio must be 150 or 300 (1 sq ft of net free area per that many sq ft of attic).");
  if (v.atticSqFt != null && !(v.atticSqFt > 0 && v.atticSqFt <= 20000)) e.push("Attic floor area must be between 0 and 20,000 sq ft.");
  if (v.upperShare != null && !(v.upperShare >= 0 && v.upperShare <= 1)) e.push("Upper share of the vent area must be between 0 and 1.");
  if (v.ridgeNfaPerFt != null && !(v.ridgeNfaPerFt > 0 && v.ridgeNfaPerFt <= 60)) e.push("Ridge vent net free area must be between 0 and 60 sq in per foot.");
  if (v.soffitUnitNfa != null && !(v.soffitUnitNfa > 0 && v.soffitUnitNfa <= 200)) e.push("Soffit vent net free area must be between 0 and 200 sq in per unit.");
  if (v.soffitUnitWidth != null && !(v.soffitUnitWidth >= 4 && v.soffitUnitWidth <= 96)) e.push("Soffit vent unit width must be between 4 and 96 inches.");
  if (v.ridgeEndGap != null && !(v.ridgeEndGap >= 0 && v.ridgeEndGap <= 120)) e.push("Ridge vent end gap must be between 0 and 120 inches.");
  if (v.soffitFill != null && !(v.soffitFill > 0 && v.soffitFill <= 1)) e.push("Soffit fill (share of the eave length that can take vents) must be above 0 and at most 1.");
  if (v.ridgePiece != null && !(v.ridgePiece >= 12 && v.ridgePiece <= 240)) e.push("Ridge vent piece length must be between 1 and 20 ft.");
  return e;
}

/**
 * @param {Ventilation} v
 * @param {any} roof the layoutRoof result
 */
export function layoutVentilation(v, roof) {
  const errors = validateVentilation(v);
  if (errors.length) return { ok: false, errors };
  if (!roof || !roof.ok) return { ok: false, errors: ["Ventilation needs a roof in the plan (`roof`, or --roof)."] };
  const ratio = v.ratio ?? 150;
  const hip = roof.shape === "hip";
  const atticSqFt = v.atticSqFt ?? (roof.width * roof.length) / 144;
  const requiredSqIn = (atticSqFt / ratio) * 144;
  const rn = roof.roofing || {};
  const gap = v.ridgeEndGap ?? 12;
  const ridgeRunIn = hip ? Math.max(0, roof.length - roof.width) : (rn.ridgeFeet ?? roof.length / 12) * 12;
  const ridgeVentFeet = Math.max(0, ridgeRunIn - 2 * gap) / 12;
  const useRidge = v.ridgeVent !== false && ridgeVentFeet > 0;
  /** @type {string[]} */ const notes = [];
  // Upper share: half by default with a ridge vent (the code's top end for the balanced 1/300 option).
  let upperShare = useRidge ? (v.upperShare ?? 0.5) : 0;
  if (ratio === 300 && useRidge && (upperShare < 0.4 - 1e-9 || upperShare > 0.5 + 1e-9)) notes.push(`The 1/300 balanced option puts 40% to 50% of the area high and the rest low; your upper share is ${(100 * upperShare).toFixed(0)}%.`);
  const ridgeNfa = v.ridgeNfaPerFt ?? 18;
  const upperWantedSqIn = requiredSqIn * upperShare;
  let ridgeFeetNeeded = useRidge ? upperWantedSqIn / ridgeNfa : 0;
  // A short ridge cannot supply the share asked of it: take what fits and move the rest to the eaves.
  if (useRidge && ridgeFeetNeeded > ridgeVentFeet + 1e-9) {
    notes.push(`The ridge is ${ridgeVentFeet.toFixed(1)} ft of vent at ${ridgeNfa} sq in/ft = ${(ridgeVentFeet * ridgeNfa).toFixed(0)} sq in, short of the ${upperWantedSqIn.toFixed(0)} sq in asked of it; the rest moves to the soffit.`);
    ridgeFeetNeeded = ridgeVentFeet;
  }
  const ridgeSqIn = ridgeFeetNeeded * ridgeNfa;
  const ridgePiece = v.ridgePiece ?? 48;
  const ridgePieces = useRidge ? Math.ceil((ridgeFeetNeeded * 12) / ridgePiece - 1e-9) : 0;
  const lowerSqIn = requiredSqIn - ridgeSqIn;
  const unitNfa = v.soffitUnitNfa ?? 56;
  const unitWidth = v.soffitUnitWidth ?? 16;
  const soffitUnits = lowerSqIn > 1e-9 ? Math.ceil(lowerSqIn / unitNfa - 1e-9) : 0;
  const eaveFeet = rn.eaveFeet ?? (2 * roof.length) / 12;
  const maxUnits = Math.floor((eaveFeet * 12 * (v.soffitFill ?? 0.5)) / unitWidth + 1e-9);
  const fits = soffitUnits <= maxUnits;
  if (!fits) notes.push(`${soffitUnits} soffit vents of ${unitWidth} in need ${(soffitUnits * unitWidth / 12).toFixed(0)} ft of eave but only ${(maxUnits * unitWidth / 12).toFixed(0)} ft (${(100 * (v.soffitFill ?? 0.5)).toFixed(0)}% of ${eaveFeet.toFixed(0)} ft) can take vents: use a higher-NFA unit, a continuous soffit strip, or add gable vents.`);
  if (!useRidge) notes.push("No ridge vent: all the area is low, which moves air only where wind drives it; the code's balanced option (1/300) needs high vents too.");
  // One baffle per rafter bay at the eaves keeps insulation off the vents.
  const baffles = roof.spacing ? Math.ceil((eaveFeet * 12) / roof.spacing - 1e-9) : 0;
  const money = (/** @type {number | undefined} */ p, /** @type {number} */ n) => (p != null ? p * n : 0);
  const priced = v.ridgePrice != null || v.soffitPrice != null;
  notes.push("Ratio, upper share, label NFA and unit sizes are your inputs; the 1/150 or 1/300 choice is for you and the inspector. Gable and box vents, power vents and cathedral or spray-foam assemblies are not counted.");
  return {
    ok: true, shape: hip ? "hip" : "gable", ratio, atticSqFt, requiredSqIn, upperShare,
    ridgeVentFeet, ridgeFeetUsed: ridgeFeetNeeded, ridgeNfaPerFt: ridgeNfa, ridgeSqIn, ridgePieces, ridgePiece,
    lowerSqIn, soffitUnits, soffitUnitNfa: unitNfa, soffitUnitWidth: unitWidth, maxSoffitUnits: maxUnits, soffitFits: fits,
    providedSqIn: ridgeSqIn + soffitUnits * unitNfa, baffles,
    cost: priced ? money(v.ridgePrice, ridgePieces) + money(v.soffitPrice, soffitUnits) : null,
    ridgePrice: v.ridgePrice ?? null, soffitPrice: v.soffitPrice ?? null, notes,
  };
}

/** @param {any} s */
export function ventilationText(s) {
  const l = [];
  const m = (/** @type {number} */ q, /** @type {number | null} */ p) => (p != null ? `, ${(q * p).toFixed(2)} at ${p} each` : "");
  l.push(`  Required: ${s.atticSqFt.toFixed(0)} sq ft of attic / ${s.ratio} = ${s.requiredSqIn.toFixed(0)} sq in net free area (${(s.requiredSqIn / 144).toFixed(2)} sq ft), ${(100 * s.upperShare).toFixed(0)}% high.`);
  l.push(`  Ridge vent: ${s.ridgeFeetUsed.toFixed(1)} ft of the ${s.ridgeVentFeet.toFixed(1)} ft available at ${s.ridgeNfaPerFt} sq in/ft = ${s.ridgeSqIn.toFixed(0)} sq in -> ${s.ridgePieces} piece(s) of ${s.ridgePiece / 12} ft${m(s.ridgePieces, s.ridgePrice)}`);
  l.push(`  Soffit vents: ${s.lowerSqIn.toFixed(0)} sq in low / ${s.soffitUnitNfa} sq in per ${s.soffitUnitWidth} in unit -> ${s.soffitUnits} unit(s) (room for ${s.maxSoffitUnits})${m(s.soffitUnits, s.soffitPrice)}`);
  l.push(`  Provided: ${s.providedSqIn.toFixed(0)} sq in against ${s.requiredSqIn.toFixed(0)} required.`);
  for (const n of s.notes) l.push("  " + n);
  return l;
}
