/**
 * What a whole size run costs: fabric by size, the fabric to buy, and the
 * landed cost of each size and of the run.
 *
 * costing.mjs prices one garment with one fabric amount (the supplier's
 * metres per garment). A real run is mixed sizes, and an XXL uses more cloth
 * than an XS. Assumption, stated on the page: fabric use scales with the
 * garment's body panel area, chest circumference x body length from
 * fit.mjs, relative to size M, which is the size the supplier's metres per
 * garment is taken to describe. Sleeves and hood scale the same way, which is
 * rough. The designer can add the factory's own per-size surcharge, and
 * should replace all of it with the factory's marker (cutting plan) numbers.
 * Arithmetic on typed prices, not a quote.
 */
import { unitCost } from "./costing.mjs";
import { garmentMeasurements, BODY_CHEST_CM } from "./fit.mjs";

const round2 = v => Math.round(v * 100) / 100;
const round3 = v => Math.round(v * 1000) / 1000;

/** Relative fabric use per size (1 at the reference size), from panel area. */
export function fabricFactors(garment = "tee", fit = "regular", sizeChart = BODY_CHEST_CM, ref = "M") {
  const g = garmentMeasurements(garment, fit, sizeChart);
  const sizes = Object.keys(g);
  const base = g[ref] ?? g[sizes[Math.floor(sizes.length / 2)]];
  const area = x => x.chest * x.length;
  return Object.fromEntries(sizes.map(s => [s, round3(area(g[s]) / area(base))]));
}

/**
 * @param {object} design  a design (garment, fabric, placements, price)
 * @param {object} sheet   the supplier sheet
 * @param {Record<string, number>} sizes  pieces per size, e.g. from sizeRun().sizes
 * @param {{fit?:string, sizeChart?:object, surcharge?:Record<string, number>}} [opts]
 *   surcharge: extra cost per piece the factory charges for a size (same currency)
 */
export function runCost(design, sheet, sizes, { fit = "regular", sizeChart = BODY_CHEST_CM, surcharge = {} } = {}) {
  const counts = Object.fromEntries(Object.entries(sizes || {}).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return { ok: false, error: "Give at least one piece." };
  let base;
  try { base = unitCost({ ...design, quantity: total }, sheet); }
  catch (e) { return { ok: false, error: e.message }; }
  const factors = fabricFactors(design.garment, fit, sizeChart);
  const missing = Object.keys(counts).filter(s => counts[s] > 0 && !(s in factors));
  if (missing.length) return { ok: false, error: `The size chart has no ${missing.join(", ")}.` };
  const fabricRef = base.lines[0].value;
  const metresRef = sheet.metresPerGarment[design.garment] * (1 + (sheet.wastagePct || 0) / 100);
  const dutyMult = 1 + (sheet.dutyPct || 0) / 100;
  const rows = Object.keys(counts).filter(s => s in factors).map(s => {
    const f = factors[s];
    const extra = Number(surcharge[s]) || 0;
    const fabric = fabricRef * f;
    const landed = base.landed + (fabric - fabricRef) * dutyMult + extra * dutyMult;
    return { size: s, pieces: counts[s], factor: f, metres: round3(metresRef * f), fabric: round2(fabric), surcharge: round2(extra), landed: round2(landed), total: round2(landed * counts[s]) };
  });
  const runTotal = rows.reduce((a, r) => a + r.landed * r.pieces, 0);
  const metres = rows.reduce((a, r) => a + r.metres * r.pieces, 0);
  const flat = base.landed * total;
  const notes = [];
  if (sheet.moq && total < sheet.moq) notes.push(`This run of ${total} is below the supplier's minimum order of ${sheet.moq}.`);
  const small = rows.filter(r => r.pieces > 0 && r.pieces < 10).map(r => r.size);
  if (small.length) notes.push(`${small.join(", ")} under 10 pieces: many factories add a charge or refuse tiny size splits; ask.`);
  notes.push("Fabric by size assumes cloth use follows chest x length against size M. Ask the factory for its marker consumption per size and type it in as the sheet's metres.");
  return {
    ok: true,
    currency: sheet.currency,
    pieces: total,
    rows,
    fabricMetresToBuy: round2(metres),
    runTotal: round2(runTotal),
    blendedLanded: round2(runTotal / total),
    flatLanded: base.landed,
    differenceVsFlat: round2(runTotal - flat),
    notes,
  };
}
